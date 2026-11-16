// Cloudflare Worker / Pages Function: GET /api/edge-archive
// Authoritative public read projection powered by Cloudflare D1 + Edge Cache,
// with automatic Seed + Firestore incremental delta fallback if D1 is not yet bound.
// Zero public Firestore reads on cache hits; supports full bootstrap, lite index,
// server-watermark incremental deltas (?since=<ms>), pagination (?page=), and ?id=.

import {
    ensureD1Seeded,
    fetchAllFirestorePublicMartyrs,
    fetchFirestoreDeltaSince,
    fetchFirestoreDocCount,
    loadBundledSeedPayload,
    normalizeMartyrRecord,
    reconcileD1WithFirestoreIfStale,
    rowToMartyr,
    getArchiveMeta
} from './_edge-store.js';

const CORS_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': '*'
};

function jsonResponse(body, status = 200, cacheControl = 'no-store', extraHeaders = {}) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            ...CORS_HEADERS,
            'Cache-Control': cacheControl,
            ...extraHeaders
        }
    });
}

async function queryD1SingleMartyr(db, idOrSlug) {
    const raw = String(idOrSlug || '').trim();
    if (!raw) return null;
    const slug = raw.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const row = await db.prepare(
        "SELECT * FROM martyrs WHERE status = 'approved' AND (id = ? OR LOWER(id) = LOWER(?) OR slug = ? OR LOWER(full_name) = LOWER(?)) LIMIT 1"
    ).bind(raw, raw, slug, raw).first();
    return row ? rowToMartyr(row, { lite: false }) : null;
}

async function handleD1Archive(request, url, env, ctx) {
    const db = env.ARCHIVE_DB;
    await ensureD1Seeded(url.origin, env);

    const idParam = url.searchParams.get('id');
    const sinceParam = url.searchParams.get('since');
    const mode = (url.searchParams.get('mode') || 'full').toLowerCase();
    const lite = mode === 'lite' || url.searchParams.get('lite') === '1';

    // Run non-blocking background staleness reconciliation at most once per 60s
    // (or synchronously with a 5s cooldown when caller explicitly requests ?fresh=1)
    if (!url.searchParams.has('noReconcile')) {
        const forceFresh = url.searchParams.has('fresh');
        const reconcilePromise = reconcileD1WithFirestoreIfStale(url.origin, env, forceFresh ? 5000 : 60000);
        if (forceFresh || !ctx || typeof ctx.waitUntil !== 'function') {
            await reconcilePromise;
        } else {
            ctx.waitUntil(reconcilePromise);
        }
    }

    // 1. Single profile detail lookup (for /gallery?hero= and on-demand bio hydration)
    if (idParam) {
        const martyr = await queryD1SingleMartyr(db, idParam);
        if (!martyr) {
            return jsonResponse({ success: false, error: 'Martyr not found' }, 404, 'public, max-age=30');
        }
        return jsonResponse(
            { success: true, edgeMode: 'd1', martyr },
            200,
            'public, max-age=120, stale-while-revalidate=600'
        );
    }

    // 2. Monotonic server-watermark incremental delta query (?since=<ms>)
    if (sinceParam !== null && sinceParam !== '') {
        const sinceMs = Math.max(0, Number(sinceParam) || 0);
        const [deltaRes, metaVersion, countRow] = await Promise.all([
            db.prepare(
                'SELECT * FROM martyrs WHERE updated_at_ms >= ? ORDER BY updated_at_ms ASC, id ASC LIMIT 500'
            ).bind(sinceMs).all(),
            getArchiveMeta(db, 'archive_version'),
            db.prepare("SELECT COUNT(*) AS active_count, MAX(updated_at_ms) AS max_upd, MAX(approved_at_ms) AS max_app FROM martyrs WHERE status = 'approved'").first()
        ]);

        const updates = [];
        const deletedIds = [];
        let maxDeltaMs = sinceMs;

        for (const row of deltaRes?.results || []) {
            if (Number(row.updated_at_ms) > maxDeltaMs) {
                maxDeltaMs = Number(row.updated_at_ms);
            }
            if (row.status === 'deleted') {
                deletedIds.push(row.id);
            } else if (!row.status || row.status === 'approved') {
                updates.push(rowToMartyr(row, { lite }));
            }
        }

        const serverWatermarkMs = Math.max(Number(countRow?.max_upd || 0), maxDeltaMs, sinceMs);
        return jsonResponse({
            success: true,
            mode: 'delta',
            edgeMode: 'd1',
            archiveVersion: metaVersion?.value || String(serverWatermarkMs),
            totalCount: Number(countRow?.active_count || 0),
            maxApprovedMs: Number(countRow?.max_app || 0),
            maxUpdatedMs: serverWatermarkMs,
            hasMore: (deltaRes?.results?.length || 0) >= 500,
            updates,
            deletedIds
        }, 200, 'no-store');
    }

    // 3. Server-paginated view (?page=1&limit=48)
    if (url.searchParams.has('page')) {
        const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
        const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 48));
        const offset = (page - 1) * limit;

        const [rowsRes, countRow] = await Promise.all([
            db.prepare(
                "SELECT * FROM martyrs WHERE status = 'approved' ORDER BY approved_at_ms DESC, id ASC LIMIT ? OFFSET ?"
            ).bind(limit, offset).all(),
            db.prepare("SELECT COUNT(*) AS active_count, MAX(updated_at_ms) AS max_upd, MAX(approved_at_ms) AS max_app FROM martyrs WHERE status = 'approved'").first()
        ]);

        const data = (rowsRes?.results || []).map((r) => rowToMartyr(r, { lite })).filter(Boolean);
        return jsonResponse({
            success: true,
            mode: 'page',
            edgeMode: 'd1',
            page,
            limit,
            totalCount: Number(countRow?.active_count || data.length),
            maxApprovedMs: Number(countRow?.max_app || 0),
            maxUpdatedMs: Number(countRow?.max_upd || 0),
            data
        }, 200, 'public, max-age=60, stale-while-revalidate=300');
    }

    // 4. Full bootstrap payload (Cloudflare Edge-Cached + D1-backed)
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const canonicalCacheUrl = new URL(lite ? '/api/edge-archive?mode=lite' : '/api/edge-archive?mode=full', url.origin).toString();
    const cacheKeyReq = new Request(canonicalCacheUrl, { method: 'GET' });

    if (cache && !url.searchParams.has('fresh')) {
        const hit = await cache.match(cacheKeyReq);
        if (hit) {
            return hit;
        }
    }

    const [allRowsRes, metaVersion, statsRow] = await Promise.all([
        db.prepare("SELECT * FROM martyrs WHERE status = 'approved' ORDER BY id ASC").all(),
        getArchiveMeta(db, 'archive_version'),
        db.prepare("SELECT COUNT(*) AS total_rows, MAX(updated_at_ms) AS max_upd, MAX(approved_at_ms) AS max_app FROM martyrs WHERE status = 'approved'").first()
    ]);

    const data = (allRowsRes?.results || []).map((r) => rowToMartyr(r, { lite })).filter(Boolean);
    const maxApprovedMs = Number(statsRow?.max_app || 0);
    const maxUpdatedMs = Number(statsRow?.max_upd || maxApprovedMs || Date.now());
    const rawCountRow = await db.prepare('SELECT COUNT(*) AS raw_cnt FROM martyrs').first();

    const response = jsonResponse({
        success: true,
        mode: lite ? 'lite' : 'full',
        edgeMode: 'd1',
        archiveVersion: metaVersion?.value || String(maxUpdatedMs),
        rawCollectionSize: Number(rawCountRow?.raw_cnt || data.length),
        totalCount: data.length,
        maxApprovedMs,
        maxUpdatedMs,
        syncedAt: Date.now(),
        data
    }, 200, 'public, max-age=30, s-maxage=45, stale-while-revalidate=120');

    if (cache) {
        const putPromise = cache.put(cacheKeyReq, response.clone());
        if (ctx && typeof ctx.waitUntil === 'function') {
            ctx.waitUntil(putPromise);
        } else {
            await putPromise;
        }
    }
    return response;
}

async function handleFallbackEdgeCache(request, url, env, ctx) {
    // Runs gracefully BEFORE D1 is bound: bundles /assets/martyrs-seed.json + edge-cached
    // incremental Firestore deltas so public traffic never triggers 1,467-doc browser scans.
    const cache = typeof caches !== 'undefined' ? caches.default : null;
    const mode = (url.searchParams.get('mode') || 'full').toLowerCase();
    const lite = mode === 'lite' || url.searchParams.get('lite') === '1';
    const sinceParam = url.searchParams.get('since');
    const idParam = url.searchParams.get('id');

    const canonicalCacheUrl = new URL('/api/edge-archive?mode=full', url.origin).toString();
    const cacheKeyReq = new Request(canonicalCacheUrl, { method: 'GET' });

    let mergedPayload = null;
    if (cache && !url.searchParams.has('fresh')) {
        const cached = await cache.match(cacheKeyReq);
        if (cached && cached.ok) {
            try {
                mergedPayload = await cached.json();
            } catch {
                mergedPayload = null;
            }
        }
    }

    if (!mergedPayload) {
        const seed = await loadBundledSeedPayload(url.origin, env);
        let list = [];
        let maxUpdatedMs = 0;
        let maxApprovedMs = 0;
        let rawCollectionSize = 0;

        if (seed && seed.data.length > 0) {
            const byId = new Map();
            for (const item of seed.data) {
                const norm = normalizeMartyrRecord(item, item?.id);
                if (norm) byId.set(norm.id, norm);
            }
            maxUpdatedMs = Math.max(seed.maxUpdatedMs || 0, seed.maxApprovedMs || 0, seed.syncedAt || 0);
            rawCollectionSize = seed.rawCollectionSize || byId.size;

            const [delta, fsTotal] = await Promise.all([
                maxUpdatedMs > 0 ? fetchFirestoreDeltaSince(env, maxUpdatedMs - 120000).catch(() => []) : Promise.resolve([]),
                fetchFirestoreDocCount(env).catch(() => null)
            ]);

            for (const item of delta) {
                if (item.status === 'deleted') {
                    byId.delete(item.id);
                } else {
                    byId.set(item.id, item);
                }
            }

            if (fsTotal !== null && fsTotal < rawCollectionSize) {
                const fullLive = await fetchAllFirestorePublicMartyrs(env).catch(() => null);
                if (Array.isArray(fullLive) && fullLive.length > 0) {
                    byId.clear();
                    for (const item of fullLive) {
                        if (item.status !== 'deleted') byId.set(item.id, item);
                    }
                    rawCollectionSize = fullLive.length;
                }
            } else if (fsTotal !== null && fsTotal > rawCollectionSize) {
                rawCollectionSize = fsTotal;
            }

            list = [...byId.values()].filter((m) => !m.status || m.status === 'approved');
        } else {
            const liveAll = await fetchAllFirestorePublicMartyrs(env);
            list = liveAll.filter((m) => !m.status || m.status === 'approved');
            rawCollectionSize = liveAll.length;
        }

        list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        for (const m of list) {
            if (m.approvedAtMs > maxApprovedMs) maxApprovedMs = m.approvedAtMs;
            if (m.updatedAtMs > maxUpdatedMs) maxUpdatedMs = m.updatedAtMs;
        }

        mergedPayload = {
            success: true,
            mode: 'full',
            edgeMode: 'edge-seed-delta',
            archiveVersion: String(maxUpdatedMs),
            rawCollectionSize,
            totalCount: list.length,
            maxApprovedMs,
            maxUpdatedMs,
            syncedAt: Date.now(),
            data: list.map((m) => ({
                id: m.id,
                fullName: m.fullName,
                fatherName: m.fatherName,
                birthDate: m.birthDate,
                birthPlace: m.birthPlace,
                martyrdomDate: m.martyrdomDate,
                martyrdomPlace: m.martyrdomPlace,
                biography: m.biography,
                familyDetails: m.familyDetails,
                organization: m.organization,
                affiliation: m.affiliation,
                rank: m.rank,
                ...(m.photoPath ? { photoPath: m.photoPath } : {}),
                ...(m.photoHash ? { photoHash: m.photoHash } : {}),
                ...(m.photoShard ? { photoShard: m.photoShard } : {}),
                photoRemoved: m.photoRemoved,
                hasPhoto: m.hasPhoto,
                status: 'approved',
                submittedAt: m.submittedAt,
                approvedAt: m.approvedAt,
                updatedAt: m.updatedAt,
                photoUpdatedAt: m.photoUpdatedAt
            }))
        };

        if (cache && mergedPayload.data.length > 0) {
            const cacheRes = jsonResponse(mergedPayload, 200, 'public, max-age=30, s-maxage=45, stale-while-revalidate=120');
            const putPromise = cache.put(cacheKeyReq, cacheRes);
            if (ctx && typeof ctx.waitUntil === 'function') {
                ctx.waitUntil(putPromise);
            } else {
                await putPromise;
            }
        }
    }

    if (idParam) {
        const clean = idParam.trim().toLowerCase();
        const found = mergedPayload.data.find((m) => m.id === idParam.trim() || m.id.toLowerCase() === clean);
        if (!found) return jsonResponse({ success: false, error: 'Martyr not found' }, 404, 'no-store');
        return jsonResponse({ success: true, edgeMode: mergedPayload.edgeMode, martyr: found }, 200, 'public, max-age=120');
    }

    if (sinceParam !== null && sinceParam !== '') {
        const sinceMs = Math.max(0, Number(sinceParam) || 0);
        const delta = await fetchFirestoreDeltaSince(env, Math.max(1700000000000, sinceMs - 120000)).catch(() => []);
        const updates = [];
        const deletedIds = [];
        for (const m of delta) {
            if (m.status === 'deleted') deletedIds.push(m.id);
            else updates.push(m);
        }
        return jsonResponse({
            success: true,
            mode: 'delta',
            edgeMode: mergedPayload.edgeMode,
            archiveVersion: mergedPayload.archiveVersion,
            totalCount: mergedPayload.totalCount,
            maxApprovedMs: mergedPayload.maxApprovedMs,
            maxUpdatedMs: mergedPayload.maxUpdatedMs,
            updates,
            deletedIds
        }, 200, 'no-store');
    }

    if (lite) {
        return jsonResponse({
            ...mergedPayload,
            mode: 'lite',
            data: mergedPayload.data.map(({ biography, familyDetails, ...rest }) => rest)
        }, 200, 'public, max-age=30, s-maxage=45, stale-while-revalidate=120');
    }

    return jsonResponse(mergedPayload, 200, 'public, max-age=30, s-maxage=45, stale-while-revalidate=120');
}

export async function onRequest({ request, env, ctx }) {
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                ...CORS_HEADERS,
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            }
        });
    }
    if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405);
    }

    const url = new URL(request.url);
    try {
        if (env && env.ARCHIVE_DB) {
            return await handleD1Archive(request, url, env, ctx);
        }
        return await handleFallbackEdgeCache(request, url, env, ctx);
    } catch (error) {
        console.error('edge-archive error:', error);
        return jsonResponse({ success: false, error: 'Edge archive error' }, 502);
    }
}
