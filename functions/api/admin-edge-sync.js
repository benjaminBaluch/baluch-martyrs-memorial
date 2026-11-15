// Cloudflare Worker / Pages Function: GET/POST /api/admin-edge-sync
// Authenticated write-through sync & status endpoint for Cloudflare D1 + R2.
// Protected strictly by HMAC-SHA256 Admin JWT (fail-closed).

import { verifyToken } from './admin-login.js';
import {
    bumpArchiveVersion,
    ensureEdgeSchema,
    getActiveMediaShard,
    getArchiveMeta,
    normalizeMartyrRecord,
    purgeEdgeCaches,
    reconcileD1WithFirestoreIfStale,
    resolveR2BucketForShard,
    upsertMartyrsBatchToD1
} from './_edge-store.js';

const JSON_HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
};

function json(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function extractAdminToken(request) {
    const auth = request.headers.get('Authorization') || request.headers.get('authorization') || '';
    if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
    return (request.headers.get('X-Admin-Token') || request.headers.get('x-admin-token') || '').trim();
}

async function authorizeAdmin(request, env) {
    const secret = env?.JWT_SECRET;
    const expectedUsername = env?.ADMIN_USERNAME || 'admin';
    if (!secret) {
        return { ok: false, status: 500, error: 'Server JWT_SECRET is not configured.' };
    }
    const token = extractAdminToken(request);
    if (!token) {
        return { ok: false, status: 401, error: 'Missing admin authentication token.' };
    }
    const decoded = await verifyToken(token, secret, expectedUsername);
    if (!decoded) {
        return { ok: false, status: 401, error: 'Invalid or expired admin token.' };
    }
    return { ok: true, admin: decoded };
}

export async function onRequest({ request, env }) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    const auth = await authorizeAdmin(request, env);
    if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
    }

    const url = new URL(request.url);
    const db = env?.ARCHIVE_DB || null;
    const availableShards = ['s1', 's2', 's3'].filter((s) => Boolean(resolveR2BucketForShard(env, s)));
    const activeMediaShard = getActiveMediaShard(env);

    // GET /api/admin-edge-sync -> Report live D1 & R2 readiness stats
    if (request.method === 'GET') {
        let d1ApprovedCount = 0;
        let d1DeletedCount = 0;
        let d1MediaPathCount = 0;
        let archiveVersion = '';
        let lastSyncMs = 0;

        if (db) {
            await ensureEdgeSchema(db);
            const [counts, metaVer, metaSync] = await Promise.all([
                db.prepare(
                    "SELECT SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_cnt, SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) AS deleted_cnt, SUM(CASE WHEN status = 'approved' AND photo_path LIKE '/media/%' THEN 1 ELSE 0 END) AS media_cnt FROM martyrs"
                ).first(),
                getArchiveMeta(db, 'archive_version'),
                getArchiveMeta(db, 'last_firestore_sync_ms')
            ]);
            d1ApprovedCount = Number(counts?.approved_cnt || 0);
            d1DeletedCount = Number(counts?.deleted_cnt || 0);
            d1MediaPathCount = Number(counts?.media_cnt || 0);
            archiveVersion = metaVer?.value || '';
            lastSyncMs = metaSync ? Number(metaSync.value) : 0;
        }

        return json({
            success: true,
            d1Bound: Boolean(db),
            r2Bound: availableShards.length > 0,
            activeMediaShard: activeMediaShard || null,
            availableShards,
            d1ApprovedCount,
            d1DeletedCount,
            d1MediaPathCount,
            archiveVersion,
            lastSyncMs
        });
    }

    if (request.method !== 'POST') {
        return json({ success: false, error: 'Method not allowed' }, 405);
    }

    let payload;
    try {
        payload = await request.json();
    } catch {
        return json({ success: false, error: 'Invalid JSON body' }, 400);
    }

    const action = String(payload?.action || '').trim().toLowerCase();
    const nowMs = Date.now();

    if (action === 'upsert') {
        const record = normalizeMartyrRecord(payload?.martyr, payload?.martyr?.id);
        if (!record) {
            return json({ success: false, error: 'Valid martyr payload with id is required' }, 400);
        }
        if (!record.updatedAtMs || record.updatedAtMs < nowMs - 60000) {
            record.updatedAtMs = nowMs;
        }
        if (db) {
            await ensureEdgeSchema(db);
            await upsertMartyrsBatchToD1(db, [record]);
            await bumpArchiveVersion(db, nowMs);
        }
        await purgeEdgeCaches(url.origin, [`/gallery?hero=${encodeURIComponent(record.id)}`]);
        return json({
            success: true,
            action: 'upsert',
            d1Synced: Boolean(db),
            id: record.id
        });
    }

    if (action === 'tombstone' || action === 'delete') {
        const targetId = String(payload?.id || '').trim();
        if (!targetId) {
            return json({ success: false, error: 'Martyr id is required' }, 400);
        }
        const tombstoneRecord = normalizeMartyrRecord(
            {
                id: targetId,
                fullName: '',
                status: 'deleted',
                photoRemoved: true,
                hasPhoto: false,
                deletedAt: new Date(nowMs).toISOString(),
                updatedAt: new Date(nowMs).toISOString()
            },
            targetId
        );
        tombstoneRecord.updatedAtMs = nowMs;

        if (db) {
            await ensureEdgeSchema(db);
            await upsertMartyrsBatchToD1(db, [tombstoneRecord]);
            await bumpArchiveVersion(db, nowMs);
        }
        await purgeEdgeCaches(url.origin, [`/gallery?hero=${encodeURIComponent(targetId)}`]);
        return json({
            success: true,
            action: 'tombstone',
            d1Synced: Boolean(db),
            id: targetId
        });
    }

    if (action === 'reconcile_bulk') {
        const items = Array.isArray(payload?.martyrs) ? payload.martyrs : [];
        let written = 0;
        if (db) {
            await ensureEdgeSchema(db);
            if (items.length > 0) {
                written = await upsertMartyrsBatchToD1(db, items);
            } else {
                const rec = await reconcileD1WithFirestoreIfStale(url.origin, env, 0);
                written = rec?.changed || 0;
            }
            await bumpArchiveVersion(db, nowMs);
        }
        await purgeEdgeCaches(url.origin);
        return json({
            success: true,
            action: 'reconcile_bulk',
            d1Synced: Boolean(db),
            written
        });
    }

    if (action === 'purge') {
        if (db) {
            await ensureEdgeSchema(db);
            await bumpArchiveVersion(db, nowMs);
        }
        await purgeEdgeCaches(url.origin);
        return json({ success: true, action: 'purge', purged: true });
    }

    return json({ success: false, error: `Unsupported action: ${action}` }, 400);
}
