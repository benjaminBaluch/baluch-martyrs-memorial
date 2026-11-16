// Shared Edge Storage & Sync Library for Cloudflare Worker + Functions
// Supports Cloudflare D1 (ARCHIVE_DB) + R2 Shards (MEDIA_S1, MEDIA_S2, ...) with
// graceful Edge-Cache + Seed + Firestore Delta fallback before D1/R2 are bound.

export const FIRESTORE_PROJECT_ID = 'baluch-martyrs-memorial';
export const FIRESTORE_DEFAULT_API_KEY = 'AIzaSyBW2JKt68kGKE-CMvKQUUj33ToZ8M-kGII';

export const PUBLIC_FIRESTORE_FIELDS = [
    'id', 'fullName', 'fatherName', 'birthDate', 'birthPlace', 'martyrdomDate',
    'martyrdomPlace', 'biography', 'familyDetails', 'organization', 'affiliation', 'rank',
    'photoPath', 'photoHash', 'photoShard', 'photoRemoved', 'hasPhoto',
    'submittedAt', 'approvedAt', 'updatedAt', 'photoUpdatedAt', 'deletedAt', 'status'
];

const SCHEMA_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS martyrs (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL DEFAULT '',
        full_name TEXT NOT NULL DEFAULT '',
        father_name TEXT NOT NULL DEFAULT '',
        birth_date_json TEXT NOT NULL DEFAULT '""',
        birth_place TEXT NOT NULL DEFAULT '',
        martyrdom_date_json TEXT NOT NULL DEFAULT '""',
        martyrdom_place TEXT NOT NULL DEFAULT '',
        biography TEXT NOT NULL DEFAULT '',
        family_details TEXT NOT NULL DEFAULT '',
        organization TEXT NOT NULL DEFAULT '',
        affiliation TEXT NOT NULL DEFAULT '',
        rank TEXT NOT NULL DEFAULT '',
        photo_path TEXT NOT NULL DEFAULT '',
        photo_hash TEXT NOT NULL DEFAULT '',
        photo_shard TEXT NOT NULL DEFAULT '',
        photo_removed INTEGER NOT NULL DEFAULT 0,
        has_photo INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'approved',
        submitted_at_json TEXT NOT NULL DEFAULT '""',
        approved_at_json TEXT NOT NULL DEFAULT '""',
        updated_at_json TEXT NOT NULL DEFAULT '""',
        photo_updated_at_json TEXT NOT NULL DEFAULT '""',
        deleted_at_json TEXT NOT NULL DEFAULT '""',
        submitted_at_ms INTEGER NOT NULL DEFAULT 0,
        approved_at_ms INTEGER NOT NULL DEFAULT 0,
        updated_at_ms INTEGER NOT NULL DEFAULT 0,
        photo_updated_at_ms INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE INDEX IF NOT EXISTS idx_martyrs_status_approved ON martyrs (status, approved_at_ms DESC, id ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_martyrs_updated ON martyrs (updated_at_ms ASC, id ASC)`,
    `CREATE INDEX IF NOT EXISTS idx_martyrs_slug ON martyrs (slug)`,
    `CREATE INDEX IF NOT EXISTS idx_martyrs_name_lower ON martyrs (LOWER(full_name))`,
    `CREATE TABLE IF NOT EXISTS archive_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at_ms INTEGER NOT NULL)`
];

const UPSERT_SQL = `INSERT INTO martyrs (
    id, slug, full_name, father_name,
    birth_date_json, birth_place, martyrdom_date_json, martyrdom_place,
    biography, family_details, organization, affiliation, rank,
    photo_path, photo_hash, photo_shard, photo_removed, has_photo, status,
    submitted_at_json, approved_at_json, updated_at_json, photo_updated_at_json, deleted_at_json,
    submitted_at_ms, approved_at_ms, updated_at_ms, photo_updated_at_ms
) VALUES (
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?, ?,
    ?, ?, ?, ?
) ON CONFLICT(id) DO UPDATE SET
    slug = excluded.slug,
    full_name = excluded.full_name,
    father_name = excluded.father_name,
    birth_date_json = excluded.birth_date_json,
    birth_place = excluded.birth_place,
    martyrdom_date_json = excluded.martyrdom_date_json,
    martyrdom_place = excluded.martyrdom_place,
    biography = excluded.biography,
    family_details = excluded.family_details,
    organization = excluded.organization,
    affiliation = excluded.affiliation,
    rank = excluded.rank,
    photo_path = CASE WHEN excluded.photo_removed = 1 THEN '' WHEN excluded.photo_path != '' THEN excluded.photo_path ELSE martyrs.photo_path END,
    photo_hash = CASE WHEN excluded.photo_removed = 1 THEN '' WHEN excluded.photo_hash != '' THEN excluded.photo_hash ELSE martyrs.photo_hash END,
    photo_shard = CASE WHEN excluded.photo_removed = 1 THEN '' WHEN excluded.photo_shard != '' THEN excluded.photo_shard ELSE martyrs.photo_shard END,
    photo_removed = excluded.photo_removed,
    has_photo = excluded.has_photo,
    status = excluded.status,
    submitted_at_json = excluded.submitted_at_json,
    approved_at_json = excluded.approved_at_json,
    updated_at_json = excluded.updated_at_json,
    photo_updated_at_json = CASE WHEN excluded.photo_updated_at_json != '""' THEN excluded.photo_updated_at_json ELSE martyrs.photo_updated_at_json END,
    deleted_at_json = excluded.deleted_at_json,
    submitted_at_ms = excluded.submitted_at_ms,
    approved_at_ms = excluded.approved_at_ms,
    updated_at_ms = excluded.updated_at_ms,
    photo_updated_at_ms = CASE WHEN excluded.photo_updated_at_ms > 0 THEN excluded.photo_updated_at_ms ELSE martyrs.photo_updated_at_ms END`;

const initializedDbs = new WeakSet();
const seedInFlightByDb = new WeakMap();

export function toSlugKey(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function normalizeTimestampWrapper(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'object') {
        const sec = value.seconds !== undefined ? value.seconds : value._seconds;
        if (typeof sec === 'number' && !Number.isNaN(sec)) {
            return {
                __bmmTimestamp: true,
                seconds: Math.floor(sec),
                nanoseconds: typeof value.nanoseconds === 'number' ? value.nanoseconds : (typeof value._nanoseconds === 'number' ? value._nanoseconds : 0)
            };
        }
        if (typeof value.toDate === 'function') {
            try {
                const ms = value.toDate().getTime();
                if (!Number.isNaN(ms)) {
                    return { __bmmTimestamp: true, seconds: Math.floor(ms / 1000), nanoseconds: (ms % 1000) * 1e6 };
                }
            } catch { /* ignore */ }
        }
        return '';
    }
    return String(value);
}

export function toMillis(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value < 1e11 ? Math.floor(value * 1000) : Math.floor(value);
    if (typeof value === 'object') {
        const sec = value.seconds !== undefined ? value.seconds : value._seconds;
        if (typeof sec === 'number' && !Number.isNaN(sec)) {
            const ns = typeof value.nanoseconds === 'number' ? value.nanoseconds : (typeof value._nanoseconds === 'number' ? value._nanoseconds : 0);
            return Math.floor(sec * 1000 + ns / 1e6);
        }
        if (typeof value.toMillis === 'function') {
            try { return value.toMillis(); } catch { return 0; }
        }
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return 0;
        const parsed = Date.parse(trimmed);
        return Number.isNaN(parsed) ? 0 : parsed;
    }
    return 0;
}

function safeJsonParse(raw, fallback = '') {
    if (!raw || raw === '""') return '';
    try {
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

export function normalizeMartyrRecord(raw, fallbackId = '') {
    if (!raw || typeof raw !== 'object') return null;
    const id = String(raw.id || fallbackId || '').trim();
    if (!id) return null;

    const status = String(raw.status || 'approved').trim() || 'approved';
    const photoRemoved = Boolean(raw.photoRemoved);
    const rawPhotoPath = String(raw.photoPath || '').trim();
    const rawPhoto = typeof raw.photo === 'string' ? raw.photo.trim() : '';

    // Portable non-inline photo URL or path takes priority; never store base64 blobs in D1
    let resolvedPhotoPath = rawPhotoPath;
    if (!resolvedPhotoPath && rawPhoto && (rawPhoto.startsWith('/media/') || rawPhoto.startsWith('/assets/photos/') || /^https:\/\//i.test(rawPhoto))) {
        resolvedPhotoPath = rawPhoto;
    }

    const birthDate = normalizeTimestampWrapper(raw.birthDate);
    const martyrdomDate = normalizeTimestampWrapper(raw.martyrdomDate);
    const submittedAt = normalizeTimestampWrapper(raw.submittedAt);
    const approvedAt = normalizeTimestampWrapper(raw.approvedAt);
    const updatedAt = normalizeTimestampWrapper(raw.updatedAt);
    const photoUpdatedAt = normalizeTimestampWrapper(raw.photoUpdatedAt);
    const deletedAt = normalizeTimestampWrapper(raw.deletedAt);

    const submittedAtMs = toMillis(submittedAt);
    const approvedAtMs = toMillis(approvedAt) || submittedAtMs;
    const updatedAtMs = Math.max(toMillis(updatedAt), approvedAtMs, submittedAtMs, toMillis(deletedAt), 1);
    const photoUpdatedAtMs = toMillis(photoUpdatedAt);

    return {
        id,
        slug: toSlugKey(raw.fullName || id),
        fullName: String(raw.fullName || '').trim(),
        fatherName: String(raw.fatherName || '').trim(),
        birthDate,
        birthPlace: String(raw.birthPlace || '').trim(),
        martyrdomDate,
        martyrdomPlace: String(raw.martyrdomPlace || '').trim(),
        biography: status === 'deleted' ? '' : String(raw.biography || ''),
        familyDetails: status === 'deleted' ? '' : String(raw.familyDetails || ''),
        organization: String(raw.organization || '').trim(),
        affiliation: String(raw.affiliation || '').trim(),
        rank: String(raw.rank || '').trim(),
        photoPath: photoRemoved ? '' : resolvedPhotoPath,
        photoHash: photoRemoved ? '' : String(raw.photoHash || '').trim(),
        photoShard: photoRemoved ? '' : String(raw.photoShard || '').trim(),
        photoRemoved,
        hasPhoto: photoRemoved ? false : (raw.hasPhoto !== undefined ? Boolean(raw.hasPhoto) : true),
        status,
        submittedAt,
        approvedAt,
        updatedAt,
        photoUpdatedAt,
        deletedAt,
        submittedAtMs,
        approvedAtMs,
        updatedAtMs,
        photoUpdatedAtMs
    };
}

export function bindMartyrStatement(db, martyr) {
    return db.prepare(UPSERT_SQL).bind(
        martyr.id,
        martyr.slug,
        martyr.fullName,
        martyr.fatherName,
        JSON.stringify(martyr.birthDate ?? ''),
        martyr.birthPlace,
        JSON.stringify(martyr.martyrdomDate ?? ''),
        martyr.martyrdomPlace,
        martyr.biography,
        martyr.familyDetails,
        martyr.organization,
        martyr.affiliation,
        martyr.rank,
        martyr.photoPath,
        martyr.photoHash,
        martyr.photoShard,
        martyr.photoRemoved ? 1 : 0,
        martyr.hasPhoto ? 1 : 0,
        martyr.status,
        JSON.stringify(martyr.submittedAt ?? ''),
        JSON.stringify(martyr.approvedAt ?? ''),
        JSON.stringify(martyr.updatedAt ?? ''),
        JSON.stringify(martyr.photoUpdatedAt ?? ''),
        JSON.stringify(martyr.deletedAt ?? ''),
        martyr.submittedAtMs,
        martyr.approvedAtMs,
        martyr.updatedAtMs,
        martyr.photoUpdatedAtMs
    );
}

export function rowToMartyr(row, options = {}) {
    if (!row) return null;
    const lite = Boolean(options.lite);
    const out = {
        id: row.id,
        fullName: row.full_name || '',
        fatherName: row.father_name || '',
        birthDate: safeJsonParse(row.birth_date_json, ''),
        birthPlace: row.birth_place || '',
        martyrdomDate: safeJsonParse(row.martyrdom_date_json, ''),
        martyrdomPlace: row.martyrdom_place || '',
        organization: row.organization || '',
        affiliation: row.affiliation || '',
        rank: row.rank || '',
        photoRemoved: Boolean(row.photo_removed),
        hasPhoto: Boolean(row.has_photo) && !Boolean(row.photo_removed),
        status: row.status || 'approved',
        submittedAt: safeJsonParse(row.submitted_at_json, ''),
        approvedAt: safeJsonParse(row.approved_at_json, ''),
        updatedAt: safeJsonParse(row.updated_at_json, ''),
        photoUpdatedAt: safeJsonParse(row.photo_updated_at_json, '')
    };

    if (!lite) {
        out.biography = row.biography || '';
        out.familyDetails = row.family_details || '';
    }
    if (row.photo_path) {
        out.photoPath = row.photo_path;
    }
    if (row.photo_hash) {
        out.photoHash = row.photo_hash;
    }
    if (row.photo_shard) {
        out.photoShard = row.photo_shard;
    }
    if (row.deleted_at_json && row.deleted_at_json !== '""') {
        out.deletedAt = safeJsonParse(row.deleted_at_json, '');
    }
    return out;
}

export async function ensureEdgeSchema(db) {
    if (!db) return false;
    if (initializedDbs.has(db)) return true;
    await db.batch(SCHEMA_STATEMENTS.map((sql) => db.prepare(sql)));
    initializedDbs.add(db);
    return true;
}

export async function getArchiveMeta(db, key) {
    if (!db) return null;
    const row = await db.prepare('SELECT value, updated_at_ms FROM archive_meta WHERE key = ?').bind(key).first();
    return row || null;
}

export async function setArchiveMeta(db, key, value, nowMs = Date.now()) {
    if (!db) return;
    await db.prepare(
        'INSERT INTO archive_meta (key, value, updated_at_ms) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at_ms = excluded.updated_at_ms'
    ).bind(key, String(value), nowMs).run();
}

export async function bumpArchiveVersion(db, nowMs = Date.now()) {
    if (!db) return String(nowMs);
    const version = String(nowMs);
    await setArchiveMeta(db, 'archive_version', version, nowMs);
    return version;
}

export function decodeFirestoreValue(value) {
    if (!value || typeof value !== 'object') return '';
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return Number(value.doubleValue);
    if ('booleanValue' in value) return Boolean(value.booleanValue);
    if ('timestampValue' in value) {
        const ms = Date.parse(value.timestampValue);
        if (!Number.isNaN(ms)) {
            return {
                __bmmTimestamp: true,
                seconds: Math.floor(ms / 1000),
                nanoseconds: (ms % 1000) * 1e6
            };
        }
        return value.timestampValue;
    }
    if ('nullValue' in value) return '';
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
    if ('mapValue' in value) return decodeFirestoreFields(value.mapValue.fields || {});
    return '';
}

export function decodeFirestoreFields(fields) {
    const out = {};
    for (const [k, v] of Object.entries(fields || {})) {
        out[k] = decodeFirestoreValue(v);
    }
    return out;
}

function getFirestoreCredentials(env) {
    return {
        projectId: env?.FIREBASE_PROJECT_ID || FIRESTORE_PROJECT_ID,
        apiKey: env?.FIREBASE_API_KEY || env?.VITE_FIREBASE_API_KEY || FIRESTORE_DEFAULT_API_KEY
    };
}

export async function fetchFirestoreDocCount(env) {
    const { projectId, apiKey } = getFirestoreCredentials(env);
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runAggregationQuery?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            structuredAggregationQuery: {
                structuredQuery: { from: [{ collectionId: 'martyrs' }] },
                aggregations: [{ alias: 'total', count: {} }]
            }
        })
    });
    if (!res.ok) return null;
    const rows = await res.json();
    const first = Array.isArray(rows) ? rows[0] : rows;
    const countVal = first?.result?.aggregateFields?.total?.integerValue;
    return countVal !== undefined ? Number(countVal) : null;
}

export async function fetchFirestoreDeltaSince(env, sinceMs) {
    const { projectId, apiKey } = getFirestoreCredentials(env);
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents:runQuery?key=${encodeURIComponent(apiKey)}`;
    const isoSince = new Date(Math.max(1700000000000, sinceMs)).toISOString();
    const selectFields = PUBLIC_FIRESTORE_FIELDS.map((fieldPath) => ({ fieldPath }));

    const runFieldDelta = async (fieldPath) => {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                structuredQuery: {
                    from: [{ collectionId: 'martyrs' }],
                    where: {
                        fieldFilter: {
                            field: { fieldPath },
                            op: 'GREATER_THAN',
                            value: { timestampValue: isoSince }
                        }
                    },
                    select: { fields: selectFields },
                    limit: 300
                }
            })
        });
        if (!res.ok) return [];
        const items = await res.json();
        return Array.isArray(items) ? items : [];
    };

    const [updatedRows, approvedRows] = await Promise.all([
        runFieldDelta('updatedAt'),
        runFieldDelta('approvedAt')
    ]);

    const byId = new Map();
    for (const entry of [...updatedRows, ...approvedRows]) {
        const doc = entry?.document;
        if (!doc || !doc.name) continue;
        const docId = doc.name.split('/').pop();
        const raw = decodeFirestoreFields(doc.fields || {});
        if (!raw.updatedAt && doc.updateTime) {
            raw.updatedAt = doc.updateTime;
        }
        const normalized = normalizeMartyrRecord(raw, docId);
        if (normalized) {
            byId.set(docId, normalized);
        }
    }
    return [...byId.values()];
}

export async function fetchAllFirestorePublicMartyrs(env) {
    const { projectId, apiKey } = getFirestoreCredentials(env);
    const martyrs = [];
    let pageToken = '';

    do {
        const params = new URLSearchParams({ pageSize: '300', key: apiKey });
        for (const field of PUBLIC_FIRESTORE_FIELDS) params.append('mask.fieldPaths', field);
        if (pageToken) params.set('pageToken', pageToken);

        const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/documents/martyrs?${params}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) {
            throw new Error(`Firestore REST HTTP ${res.status}`);
        }
        const page = await res.json();
        for (const doc of page.documents || []) {
            const docId = doc.name.split('/').pop();
            const raw = decodeFirestoreFields(doc.fields || {});
            const normalized = normalizeMartyrRecord(raw, docId);
            if (normalized) {
                martyrs.push(normalized);
            }
        }
        pageToken = page.nextPageToken || '';
    } while (pageToken);

    return martyrs;
}

export async function loadBundledSeedPayload(origin, env) {
    try {
        const req = new Request(new URL('/assets/martyrs-seed.json', origin).toString());
        const res = await env.ASSETS.fetch(req);
        if (!res.ok) return null;
        const payload = await res.json();
        const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
        return {
            rawCollectionSize: typeof payload?.rawCollectionSize === 'number' ? payload.rawCollectionSize : list.length,
            maxApprovedMs: Number(payload?.maxApprovedMs || payload?.syncedAt || 0),
            maxUpdatedMs: Number(payload?.maxUpdatedMs || payload?.maxApprovedMs || payload?.syncedAt || 0),
            syncedAt: Number(payload?.syncedAt || 0),
            data: list
        };
    } catch {
        return null;
    }
}

export async function upsertMartyrsBatchToD1(db, martyrs) {
    if (!db || !Array.isArray(martyrs) || martyrs.length === 0) return 0;
    const CHUNK = 200;
    let written = 0;
    for (let i = 0; i < martyrs.length; i += CHUNK) {
        const slice = martyrs.slice(i, i + CHUNK);
        const stmts = [];
        for (const item of slice) {
            const norm = normalizeMartyrRecord(item, item?.id);
            if (norm) stmts.push(bindMartyrStatement(db, norm));
        }
        if (stmts.length > 0) {
            await db.batch(stmts);
            written += stmts.length;
        }
    }
    return written;
}

const TOMBSTONE_SQL = "UPDATE martyrs SET status = 'deleted', biography = '', family_details = '', photo_path = '', photo_hash = '', photo_shard = '', photo_removed = 1, has_photo = 0, updated_at_ms = ?, deleted_at_json = ? WHERE id = ? AND status != 'deleted'";
const RETIRED_SEED_IDS = ['JUqFchSZj7wX4oJP6PRh', 'N17u7tpTxoUME6tmuXmI'];

async function tombstoneMartyrIdsInD1(db, ids, nowMs = Date.now()) {
    if (!db || !Array.isArray(ids) || ids.length === 0) return 0;
    const deletedAtJson = JSON.stringify(new Date(nowMs).toISOString());
    const stmts = ids.map((id) => db.prepare(TOMBSTONE_SQL).bind(nowMs, deletedAtJson, String(id)));
    let modified = 0;
    for (let i = 0; i < stmts.length; i += 200) {
        const results = await db.batch(stmts.slice(i, i + 200));
        if (Array.isArray(results)) {
            for (const res of results) {
                modified += Number(res?.meta?.changes || 0);
            }
        }
    }
    return modified;
}

export async function ensureD1Seeded(origin, env) {
    const db = env?.ARCHIVE_DB;
    if (!db) return false;
    await ensureEdgeSchema(db);

    const [existingCountRow, seedDoneMeta, pruneDoneMeta] = await Promise.all([
        db.prepare('SELECT COUNT(*) AS cnt FROM martyrs').first(),
        getArchiveMeta(db, 'seed_completed_v2'),
        getArchiveMeta(db, 'seed_pruned_deleted_v1')
    ]);
    const existingCount = Number(existingCountRow?.cnt || 0);
    const seedAlreadyDone = existingCount > 0 && seedDoneMeta && String(seedDoneMeta.value || '').startsWith('done:');
    const pruneAlreadyDone = pruneDoneMeta && pruneDoneMeta.value === 'done';
    if (seedAlreadyDone && pruneAlreadyDone) {
        return true;
    }

    if (seedInFlightByDb.has(db)) {
        return seedInFlightByDb.get(db);
    }

    const seedTask = (async () => {
        try {
            let maxWatermark = 0;
            let expectedSeedCount = 0;

            if (!seedAlreadyDone) {
                const seed = await loadBundledSeedPayload(origin, env);

                if (seed && seed.data.length > 0) {
                    expectedSeedCount = seed.data.length;
                    maxWatermark = Math.max(seed.maxUpdatedMs || 0, seed.maxApprovedMs || 0, seed.syncedAt || 0);

                    if (existingCount > 0) {
                        // Recover cleanly from any partial seed without overwriting newer rows already in D1
                        const existingRows = await db.prepare('SELECT id FROM martyrs').all();
                        const existingIds = new Set((existingRows?.results || []).map((r) => r.id));
                        const missingSeed = seed.data.filter((item) => item && item.id && !existingIds.has(item.id));
                        if (missingSeed.length > 0) {
                            await upsertMartyrsBatchToD1(db, missingSeed);
                            await purgeEdgeCaches(origin);
                        }
                    } else {
                        await upsertMartyrsBatchToD1(db, seed.data);
                    }
                } else if (existingCount === 0) {
                    const liveAll = await fetchAllFirestorePublicMartyrs(env);
                    expectedSeedCount = liveAll.length;
                    await upsertMartyrsBatchToD1(db, liveAll);
                    for (const m of liveAll) {
                        if (m.updatedAtMs > maxWatermark) maxWatermark = m.updatedAtMs;
                    }
                }

                // Reconcile any newly added/edited Firestore docs newer than seed
                if (maxWatermark > 0) {
                    const delta = await fetchFirestoreDeltaSince(env, maxWatermark - 120000).catch(() => []);
                    if (delta.length > 0) {
                        await upsertMartyrsBatchToD1(db, delta);
                    }
                }
            }

            const nowMs = Date.now();
            if (!seedAlreadyDone) {
                const postCountRow = await db.prepare('SELECT COUNT(*) AS cnt FROM martyrs').first();
                const postCount = Number(postCountRow?.cnt || 0);
                if (expectedSeedCount > 0 && postCount >= expectedSeedCount) {
                    await setArchiveMeta(db, 'seed_completed_v2', `done:${expectedSeedCount}`, nowMs);
                }
                await setArchiveMeta(db, 'last_firestore_sync_ms', String(nowMs), nowMs);
            }

            if (!pruneAlreadyDone) {
                await tombstoneMartyrIdsInD1(db, RETIRED_SEED_IDS, nowMs);
                await setArchiveMeta(db, 'seed_pruned_deleted_v1', 'done', nowMs);
                await purgeEdgeCaches(origin);
            }

            await bumpArchiveVersion(db, nowMs);
            return true;
        } finally {
            seedInFlightByDb.delete(db);
        }
    })();

    seedInFlightByDb.set(db, seedTask);
    return seedTask;
}

export async function reconcileD1WithFirestoreIfStale(origin, env, maxStaleMs = 60000) {
    const db = env?.ARCHIVE_DB;
    if (!db) return { synced: false };

    await ensureD1Seeded(origin, env);
    const metaSync = await getArchiveMeta(db, 'last_firestore_sync_ms');
    const lastSyncMs = metaSync ? Number(metaSync.value) : 0;
    const nowMs = Date.now();

    if (maxStaleMs > 0 && nowMs - lastSyncMs < maxStaleMs) {
        return { synced: false, skipped: true };
    }

    // Lock sync timestamp optimistically first to prevent thundering herd
    await setArchiveMeta(db, 'last_firestore_sync_ms', String(nowMs), nowMs);

    try {
        const maxRow = await db.prepare(
            "SELECT MAX(updated_at_ms) AS max_upd, COUNT(*) AS d1_total, SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS d1_approved FROM martyrs"
        ).first();
        const maxUpdatedMs = Number(maxRow?.max_upd || 0);
        const d1Total = Number(maxRow?.d1_total || 0);
        const d1Approved = Number(maxRow?.d1_approved || 0);

        const [delta, fsTotal] = await Promise.all([
            maxUpdatedMs > 0 ? fetchFirestoreDeltaSince(env, maxUpdatedMs - 120000) : Promise.resolve([]),
            fetchFirestoreDocCount(env).catch(() => null)
        ]);

        let changed = 0;
        if (delta.length > 0) {
            changed += await upsertMartyrsBatchToD1(db, delta);
        }

        const postDeltaRow = changed > 0
            ? await db.prepare("SELECT COUNT(*) AS d1_total, SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS d1_approved FROM martyrs").first()
            : null;
        const curTotal = postDeltaRow ? Number(postDeltaRow.d1_total || 0) : d1Total;
        const curApproved = postDeltaRow ? Number(postDeltaRow.d1_approved || 0) : d1Approved;

        // Self-heal ANY row-count drift against Firestore (additions, missed deltas, OR deletions),
        // matching either curTotal (with tombstones) or curApproved (legacy hard-deletes) at steady state.
        if (curTotal === 0 || (fsTotal !== null && fsTotal !== curTotal && fsTotal !== curApproved)) {
            const [liveDocs, d1RowsRes] = await Promise.all([
                fetchAllFirestorePublicMartyrs(env),
                db.prepare('SELECT id, updated_at_ms, status, photo_path FROM martyrs').all()
            ]);

            if (Array.isArray(liveDocs) && liveDocs.length > 0) {
                const d1ById = new Map();
                for (const row of d1RowsRes?.results || []) {
                    d1ById.set(row.id, row);
                }

                const liveIds = new Set();
                const toUpsert = [];
                for (const doc of liveDocs) {
                    liveIds.add(doc.id);
                    const existing = d1ById.get(doc.id);
                    if (
                        !existing ||
                        existing.status !== doc.status ||
                        doc.updatedAtMs > Number(existing.updated_at_ms || 0) ||
                        (doc.photoPath && !existing.photo_path)
                    ) {
                        toUpsert.push(doc);
                    }
                }

                if (toUpsert.length > 0) {
                    changed += await upsertMartyrsBatchToD1(db, toUpsert);
                }

                const staleIds = [];
                for (const [id, row] of d1ById.entries()) {
                    if (row.status !== 'deleted' && !liveIds.has(id)) {
                        staleIds.push(id);
                    }
                }
                if (staleIds.length > 0) {
                    await tombstoneMartyrIdsInD1(db, staleIds, nowMs);
                    changed += staleIds.length;
                }
            }
        }

        if (changed > 0) {
            await bumpArchiveVersion(db, nowMs);
            await purgeEdgeCaches(origin);
        }
        return { synced: true, changed };
    } catch (err) {
        console.error('reconcileD1WithFirestoreIfStale error:', err?.message || err);
        return { synced: false, error: true };
    }
}

export async function purgeEdgeCaches(origin, extraPaths = []) {
    if (typeof caches === 'undefined' || !caches.default) return;
    const targets = new Set([
        '/api/edge-archive',
        '/api/edge-archive?mode=full',
        '/api/edge-archive?mode=lite',
        '/api/get-martyrs',
        '/gallery',
        '/gallery.html',
        ...extraPaths
    ]);
    await Promise.all(
        [...targets].map((path) => {
            try {
                const url = path.startsWith('http') ? path : new URL(path, origin).toString();
                return caches.default.delete(new Request(url));
            } catch {
                return Promise.resolve(false);
            }
        })
    );
}

export function resolveR2BucketForShard(env, shard) {
    const clean = String(shard || '').trim().toLowerCase();
    if (!clean || !env) return null;
    if (clean === 's1' || clean === '1') return env.MEDIA_S1 || null;
    if (clean === 's2' || clean === '2') return env.MEDIA_S2 || null;
    if (clean === 's3' || clean === '3') return env.MEDIA_S3 || null;
    const key = `MEDIA_${clean.toUpperCase()}`;
    return env[key] || null;
}

export function getActiveMediaShard(env) {
    const preferred = String(env?.ACTIVE_MEDIA_SHARD || 's1').trim().toLowerCase();
    if (resolveR2BucketForShard(env, preferred)) return preferred;
    for (const candidate of ['s1', 's2', 's3']) {
        if (resolveR2BucketForShard(env, candidate)) return candidate;
    }
    return '';
}
