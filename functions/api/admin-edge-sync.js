// Cloudflare Worker / Pages Function: GET/POST /api/admin-edge-sync
// Authenticated write-through sync & status endpoint for Cloudflare D1 + R2.
// Protected strictly by HMAC-SHA256 Admin JWT (fail-closed).

import { authorizeAdmin, JSON_HEADERS, jsonResponse as json } from './_admin-auth.js';
import {
    backfillMissingR2PhotosToD1,
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
        let d1MissingR2Count = 0;
        let archiveVersion = '';
        let lastSyncMs = 0;

        if (db) {
            await ensureEdgeSchema(db);
            const [counts, metaVer, metaSync] = await Promise.all([
                db.prepare(
                    "SELECT SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved_cnt, SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) AS deleted_cnt, SUM(CASE WHEN status = 'approved' AND photo_path LIKE '/media/%' THEN 1 ELSE 0 END) AS media_cnt, SUM(CASE WHEN status = 'approved' AND photo_removed = 0 AND has_photo = 1 AND (photo_path IS NULL OR photo_path = '') THEN 1 ELSE 0 END) AS missing_r2_cnt FROM martyrs"
                ).first(),
                getArchiveMeta(db, 'archive_version'),
                getArchiveMeta(db, 'last_firestore_sync_ms')
            ]);
            d1ApprovedCount = Number(counts?.approved_cnt || 0);
            d1DeletedCount = Number(counts?.deleted_cnt || 0);
            d1MediaPathCount = Number(counts?.media_cnt || 0);
            d1MissingR2Count = Number(counts?.missing_r2_cnt || 0);
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
            d1MissingR2Count,
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

    if (action === 'backfill_r2') {
        const res = await backfillMissingR2PhotosToD1(url.origin, env, {
            batchLimit: Math.max(1, Math.min(100, Number(payload?.limit || 60))),
            cooldownMs: 0
        });
        return json({
            success: true,
            action: 'backfill_r2',
            ...res
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
