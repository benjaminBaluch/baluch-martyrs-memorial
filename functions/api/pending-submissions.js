// Cloudflare Worker / Pages Function: /api/pending-submissions
// Durable Cloudflare D1 (+ optional private R2 photo overflow) backup & fallback queue
// for public /add-martyr submissions when Firebase Spark quota or network is unavailable.
//
// - POST: Public submission capture (strict schema validation & size limits).
// - GET / PATCH / DELETE: Admin moderation only (fail-closed HMAC-SHA256 JWT).

import { authorizeAdmin, JSON_HEADERS, jsonResponse as json } from './_admin-auth.js';
import { ensureEdgeSchema, getActiveMediaShard, resolveR2BucketForShard } from './_edge-store.js';

const MAX_INLINE_D1_PHOTO_CHARS = 750000;
const MAX_UPLOAD_PHOTO_CHARS = 1400000;
const R2_PENDING_PREFIX = 'r2-pending:';

function cleanStr(val, maxLen = 200, multiline = false) {
    if (val === null || val === undefined) return '';
    let s = String(val);
    s = multiline
        ? s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
        : s.replace(/[\x00-\x1F\x7F]/g, ' ');
    return s
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim()
        .slice(0, maxLen);
}

function isValidEmail(email) {
    return typeof email === 'string' &&
        email.length <= 254 &&
        /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/.test(email);
}

function validateAndSanitizePhoto(photoVal) {
    if (photoVal === null || photoVal === undefined || String(photoVal).trim() === '') {
        return '';
    }
    const photo = String(photoVal).trim();
    const isDataUri = /^data:image\/(jpeg|jpg|png|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(photo);
    const isSafePath = /^\/media\/[A-Za-z0-9_-]{1,16}\/[A-Za-z0-9._-]{1,160}$/i.test(photo) ||
        /^\/assets\/photos\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(photo);
    const isHttps = /^https:\/\//i.test(photo) && photo.length <= 512;

    if (!isDataUri && !isSafePath && !isHttps) {
        throw new Error('Invalid portrait format.');
    }
    if (photo.length > MAX_UPLOAD_PHOTO_CHARS) {
        throw new Error('Compressed photo exceeds maximum submission limit.');
    }
    return photo;
}

function buildSanitizedPendingPayload(raw, options = {}) {
    const requireSubmitter = Boolean(options.requireSubmitter);
    const fullName = cleanStr(raw.fullName, 200);
    if (!fullName || fullName.length < 2) {
        throw new Error('Martyr full name is required.');
    }

    const submitterName = cleanStr(raw.submitterName, 200);
    const submitterEmail = cleanStr(raw.submitterEmail, 254);
    if (requireSubmitter) {
        if (!submitterName) {
            throw new Error('Submitter name is required.');
        }
        if (!isValidEmail(submitterEmail)) {
            throw new Error('Valid submitter email is required.');
        }
    }

    const out = {
        fullName,
        fatherName: cleanStr(raw.fatherName, 200),
        birthDate: cleanStr(raw.birthDate, 64),
        martyrdomDate: cleanStr(raw.martyrdomDate, 64),
        birthPlace: cleanStr(raw.birthPlace, 250),
        martyrdomPlace: cleanStr(raw.martyrdomPlace, 250),
        biography: cleanStr(raw.biography, 15000, true),
        familyDetails: cleanStr(raw.familyDetails, 3000, true),
        organization: cleanStr(raw.organization, 200),
        affiliation: cleanStr(raw.affiliation, 200),
        rank: cleanStr(raw.rank, 200),
        submitterName,
        submitterEmail,
        submitterRelation: cleanStr(raw.submitterRelation, 200),
        submitterPhone: cleanStr(raw.submitterPhone, 60),
        status: 'pending'
    };

    if ('photoRemoved' in raw) out.photoRemoved = Boolean(raw.photoRemoved);
    if ('hasPhoto' in raw) out.hasPhoto = Boolean(raw.hasPhoto);
    if (raw.photoPath) out.photoPath = cleanStr(raw.photoPath, 512);
    if (raw.photoHash) out.photoHash = cleanStr(raw.photoHash, 128);
    if (raw.photoShard) out.photoShard = cleanStr(raw.photoShard, 32);

    const safePhoto = validateAndSanitizePhoto(raw.photo);
    if (safePhoto) {
        out.photo = safePhoto;
    } else if ('photo' in raw) {
        out.photo = '';
    }

    return out;
}

async function offloadLargePendingPhotoToR2(env, rowId, payload) {
    if (typeof payload.photo !== 'string' || payload.photo.length <= MAX_INLINE_D1_PHOTO_CHARS) {
        return payload;
    }
    const shard = getActiveMediaShard(env);
    const bucket = shard ? resolveR2BucketForShard(env, shard) : null;
    if (!bucket) {
        throw new Error('Photo exceeds D1 row size ceiling without R2 pending overflow.');
    }
    const objectKey = `pending/${rowId}.txt`;
    await bucket.put(objectKey, payload.photo, {
        httpMetadata: { contentType: 'text/plain; charset=utf-8' }
    });
    return {
        ...payload,
        photo: `${R2_PENDING_PREFIX}${shard}:${objectKey}`
    };
}

async function rehydratePendingPhotoFromR2(env, payload) {
    if (!payload || typeof payload.photo !== 'string' || !payload.photo.startsWith(R2_PENDING_PREFIX)) {
        return payload;
    }
    const rest = payload.photo.slice(R2_PENDING_PREFIX.length);
    const sep = rest.indexOf(':');
    if (sep <= 0) return { ...payload, photo: '' };
    const shard = rest.slice(0, sep);
    const key = rest.slice(sep + 1);
    const bucket = resolveR2BucketForShard(env, shard);
    if (!bucket) return { ...payload, photo: '' };
    const obj = await bucket.get(key).catch(() => null);
    if (!obj) return { ...payload, photo: '' };
    const dataUri = await obj.text();
    return { ...payload, photo: dataUri };
}

async function deletePendingPhotoFromR2(env, payload) {
    if (!payload || typeof payload.photo !== 'string' || !payload.photo.startsWith(R2_PENDING_PREFIX)) {
        return;
    }
    const rest = payload.photo.slice(R2_PENDING_PREFIX.length);
    const sep = rest.indexOf(':');
    if (sep <= 0) return;
    const bucket = resolveR2BucketForShard(env, rest.slice(0, sep));
    if (bucket) {
        await bucket.delete(rest.slice(sep + 1)).catch(() => {});
    }
}

export async function onRequest({ request, env }) {
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: JSON_HEADERS });
    }

    const db = env?.ARCHIVE_DB || null;
    if (request.method === 'POST') {
        let body;
        try {
            body = await request.json();
        } catch {
            return json({ success: false, error: 'Invalid JSON payload' }, 400);
        }

        if (!db) {
            return json({ success: false, d1Bound: false, error: 'Edge database is not bound.' }, 503);
        }

        let sanitized;
        try {
            sanitized = buildSanitizedPendingPayload(body || {}, { requireSubmitter: true });
        } catch (err) {
            return json({ success: false, error: err.message }, 400);
        }

        await ensureEdgeSchema(db);
        const nowMs = Date.now();
        const firestoreId = cleanStr(body?.firestoreId, 128);
        const clientId = cleanStr(body?.clientId || body?.id, 128);
        const source = firestoreId ? 'firestore-mirror' : 'd1-fallback';
        const rowId = firestoreId || clientId || `d1p_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

        const storedPayload = await offloadLargePendingPhotoToR2(env, rowId, {
            ...sanitized,
            id: rowId,
            ...(firestoreId ? { firestoreId } : {}),
            submittedAt: body?.submittedAt && typeof body.submittedAt === 'string'
                ? cleanStr(body.submittedAt, 64)
                : new Date(nowMs).toISOString(),
            source
        });

        await db.prepare(
            `INSERT INTO pending_martyrs (id, firestore_id, payload_json, status, source, submitted_at_ms, updated_at_ms)
             VALUES (?, ?, ?, 'pending', ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               firestore_id = excluded.firestore_id,
               payload_json = excluded.payload_json,
               status = excluded.status,
               source = excluded.source,
               updated_at_ms = excluded.updated_at_ms`
        ).bind(rowId, firestoreId, JSON.stringify(storedPayload), source, nowMs, nowMs).run();

        return json({
            success: true,
            d1Bound: true,
            id: rowId,
            firestoreId,
            source
        });
    }

    // Admin-only routes (GET / PATCH / DELETE) — protects submitter PII strictly
    const auth = await authorizeAdmin(request, env);
    if (!auth.ok) {
        return json({ success: false, error: auth.error }, auth.status);
    }

    if (!db) {
        if (request.method === 'GET') {
            return json({ success: true, d1Bound: false, data: [] });
        }
        return json({ success: true, d1Bound: false, skipped: true });
    }

    await ensureEdgeSchema(db);
    const url = new URL(request.url);

    if (request.method === 'GET') {
        const res = await db.prepare(
            "SELECT id, firestore_id, payload_json, source, submitted_at_ms, updated_at_ms FROM pending_martyrs WHERE status = 'pending' ORDER BY submitted_at_ms DESC"
        ).all();

        const data = [];
        for (const row of res?.results || []) {
            try {
                let parsed = JSON.parse(row.payload_json || '{}');
                parsed = await rehydratePendingPhotoFromR2(env, parsed);
                data.push({
                    ...parsed,
                    id: row.firestore_id || row.id,
                    d1PendingId: row.id,
                    firestoreId: row.firestore_id || '',
                    source: row.source || 'd1-fallback',
                    submittedAt: parsed.submittedAt || new Date(Number(row.submitted_at_ms || Date.now())).toISOString()
                });
            } catch (_) {}
        }
        return json({ success: true, d1Bound: true, data });
    }

    if (request.method === 'PATCH') {
        let body;
        try {
            body = await request.json();
        } catch {
            return json({ success: false, error: 'Invalid JSON payload' }, 400);
        }

        const targetId = cleanStr(body?.id || url.searchParams.get('id'), 128);
        if (!targetId) {
            return json({ success: false, error: 'Missing pending submission ID' }, 400);
        }

        const existing = await db.prepare(
            'SELECT id, firestore_id, payload_json, submitted_at_ms, source FROM pending_martyrs WHERE id = ? OR firestore_id = ? LIMIT 1'
        ).bind(targetId, targetId).first();

        const base = existing ? JSON.parse(existing.payload_json || '{}') : {};
        const patchObj = body?.updates && typeof body.updates === 'object' ? body.updates : body;
        const hasNewPhotoInPatch = Object.prototype.hasOwnProperty.call(patchObj || {}, 'photo');
        const preservedR2PendingPhoto =
            !hasNewPhotoInPatch &&
            typeof base.photo === 'string' &&
            base.photo.startsWith(R2_PENDING_PREFIX)
                ? base.photo
                : '';

        let sanitized;
        try {
            const merged = { ...base, ...patchObj };
            if (preservedR2PendingPhoto) {
                merged.photo = '';
            }
            sanitized = buildSanitizedPendingPayload(merged, { requireSubmitter: false });
        } catch (err) {
            return json({ success: false, error: err.message }, 400);
        }

        const nowMs = Date.now();
        const rowId = existing?.id || targetId;
        let storedPayload;
        if (preservedR2PendingPhoto) {
            storedPayload = {
                ...sanitized,
                photo: preservedR2PendingPhoto,
                id: rowId,
                ...(existing?.firestore_id ? { firestoreId: existing.firestore_id } : {}),
                updatedAt: new Date(nowMs).toISOString()
            };
        } else {
            storedPayload = await offloadLargePendingPhotoToR2(env, rowId, {
                ...sanitized,
                id: rowId,
                ...(existing?.firestore_id ? { firestoreId: existing.firestore_id } : {}),
                updatedAt: new Date(nowMs).toISOString()
            });
            if (typeof base.photo === 'string' && base.photo.startsWith(R2_PENDING_PREFIX) && storedPayload.photo !== base.photo) {
                await deletePendingPhotoFromR2(env, base);
            }
        }

        await db.prepare(
            `INSERT INTO pending_martyrs (id, firestore_id, payload_json, status, source, submitted_at_ms, updated_at_ms)
             VALUES (?, ?, ?, 'pending', ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               payload_json = excluded.payload_json,
               updated_at_ms = excluded.updated_at_ms`
        ).bind(
            rowId,
            existing?.firestore_id || '',
            JSON.stringify(storedPayload),
            existing?.source || 'admin-edit',
            Number(existing?.submitted_at_ms || nowMs),
            nowMs
        ).run();

        return json({ success: true, id: rowId });
    }

    if (request.method === 'DELETE') {
        const clearAll = url.searchParams.get('all') === '1';
        if (clearAll) {
            const existingRows = await db.prepare('SELECT payload_json FROM pending_martyrs').all();
            for (const row of existingRows?.results || []) {
                try {
                    await deletePendingPhotoFromR2(env, JSON.parse(row.payload_json || '{}'));
                } catch (_) {}
            }
            const delRes = await db.prepare('DELETE FROM pending_martyrs').run();
            return json({ success: true, cleared: Number(delRes?.meta?.changes || 0) });
        }

        const targetId = cleanStr(url.searchParams.get('id'), 128);
        const firestoreId = cleanStr(url.searchParams.get('firestoreId'), 128);
        if (!targetId && !firestoreId) {
            return json({ success: false, error: 'Missing id parameter' }, 400);
        }

        const key = targetId || firestoreId;
        const matches = await db.prepare(
            'SELECT id, payload_json FROM pending_martyrs WHERE id = ? OR firestore_id = ?'
        ).bind(key, firestoreId || key).all();

        for (const row of matches?.results || []) {
            try {
                await deletePendingPhotoFromR2(env, JSON.parse(row.payload_json || '{}'));
            } catch (_) {}
        }

        await db.prepare('DELETE FROM pending_martyrs WHERE id = ? OR firestore_id = ?')
            .bind(key, firestoreId || key)
            .run();

        return json({ success: true, deleted: matches?.results?.length || 0 });
    }

    return json({ success: false, error: 'Method not allowed' }, 405);
}
