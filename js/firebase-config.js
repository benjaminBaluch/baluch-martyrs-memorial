// Firebase Configuration and Initialization
// Replace the config values with your actual Firebase project config

// Firebase v9+ modular SDK - Updated to latest stable version
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { 
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    collection, 
    addDoc, 
    setDoc,
    getDoc,
    getDocs,
    getCountFromServer,
    doc, 
    updateDoc, 
    deleteDoc,
    writeBatch,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Your web app's Firebase configuration - Production Ready
const firebaseConfig = {
    apiKey: "AIzaSyBW2JKt68kGKE-CMvKQUUj33ToZ8M-kGII",
    authDomain: "baluch-martyrs-memorial.firebaseapp.com",
    projectId: "baluch-martyrs-memorial",
    storageBucket: "baluch-martyrs-memorial.firebasestorage.app",
    messagingSenderId: "420195314966",
    appId: "1:420195314966:web:0e3546e6e0e0c09cf3f437"
};

// Initialize Firebase with error handling
let app;
let db;

try {
    console.log('🔥 Initializing Firebase app...');
    app = initializeApp(firebaseConfig);
    console.log('✅ Firebase app initialized successfully');
    
    console.log('🗺 Initializing Firestore...');
    // Use standard lightweight getFirestore(app) instead of persistentLocalCache
    // because bmm_memorial_archive_db already caches the approved archive in IndexedDB,
    // avoiding duplicate IndexedDB storage & iOS WebKit memory pressure.
    db = getFirestore(app);
    console.log('✅ Firestore initialized successfully');
    
} catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    console.error('Error details:', {
        code: error.code,
        message: error.message,
        config: firebaseConfig
    });
    throw error;
}

// ============================================================================
// HIGH-CAPACITY INDEXEDDB ARCHIVE CACHE + LIGHTWEIGHT FIREBASE DELTA SYNC
// Stores all approved martyr metadata (~1.2 MB) in browser IndexedDB
// and synchronizes additions, edits, and deletions with Firebase in the background
// without ever downloading bulk Base64 photos into mobile RAM.
// ============================================================================

const IDB_DB_NAME = 'bmm_memorial_archive_db';
const IDB_STORE_NAME = 'martyrs_cache';
const IDB_CACHE_KEY = 'approved_martyrs_v4';
const LEGACY_IDB_CACHE_KEYS = ['approved_martyrs_v3', 'approved_martyrs_v2', 'approved_martyrs_v1'];
const FULL_REVALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLOCK_SKEW_BUFFER_MS = 2 * 60 * 1000; // 2-minute safety window for delta queries
const MAX_INLINE_DELTA_PHOTOS = 12; // Cap inline Base64 photos kept in IDB cache

const PUBLIC_METADATA_FIELDS = [
    'id', 'fullName', 'fatherName', 'birthDate', 'birthPlace', 'martyrdomDate',
    'martyrdomPlace', 'biography', 'organization', 'affiliation', 'rank', 'familyDetails',
    'photoPath', 'photoHash', 'photoShard', 'hasPhoto',
    'submittedAt', 'approvedAt', 'updatedAt', 'photoUpdatedAt', 'photoRemoved', 'deletedAt', 'status'
];

const ADMIN_METADATA_FIELDS = [
    ...PUBLIC_METADATA_FIELDS,
    'submitterName', 'submitterEmail', 'submitterRelation', 'submitterPhone'
];

let memoryCache = null; // { data, rawCollectionSize, maxApprovedMs, maxUpdatedMs, syncedAt, fullSyncAt }
let inFlightApprovedPromise = null;
let backgroundSyncPromise = null;
const photoMemoryCache = new Map(); // docId -> base64 string or ''
const photoFetchInFlight = new Map(); // docId -> Promise<string>

function parseFirestoreRestValue(value) {
    if (!value || typeof value !== 'object') return null;
    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('timestampValue' in value) {
        const ms = Date.parse(value.timestampValue);
        if (!isNaN(ms)) {
            const sec = Math.floor(ms / 1000);
            const ns = (ms % 1000) * 1e6;
            try {
                return new Timestamp(sec, ns);
            } catch (_) {
                return {
                    __bmmTimestamp: true,
                    seconds: sec,
                    nanoseconds: ns,
                    toDate: () => new Date(ms),
                    toMillis: () => ms
                };
            }
        }
        return value.timestampValue;
    }
    if ('nullValue' in value) return null;
    if ('arrayValue' in value) return (value.arrayValue.values || []).map(parseFirestoreRestValue);
    if ('mapValue' in value) return parseFirestoreRestFields(value.mapValue.fields || {});
    return null;
}

function parseFirestoreRestFields(fields) {
    const out = {};
    for (const [k, v] of Object.entries(fields)) {
        out[k] = parseFirestoreRestValue(v);
    }
    return out;
}

// On-demand single-martyr photo resolver for newly approved or admin-updated martyrs
export async function resolveMartyrPhoto(martyrId, imgElement = null, onNoPhotoFallback = null, options = {}) {
    const force = Boolean(options && options.force);
    if (!martyrId || typeof martyrId !== 'string') {
        if (typeof onNoPhotoFallback === 'function') onNoPhotoFallback();
        return '';
    }

    if (!force && photoMemoryCache.has(martyrId)) {
        const cachedPhoto = photoMemoryCache.get(martyrId);
        if (cachedPhoto && imgElement) {
            imgElement.src = cachedPhoto;
            return cachedPhoto;
        }
        if (!cachedPhoto && typeof onNoPhotoFallback === 'function') {
            onNoPhotoFallback();
        }
        return cachedPhoto || '';
    }

    let fetchPromise = !force ? photoFetchInFlight.get(martyrId) : null;
    if (!fetchPromise) {
        fetchPromise = (async () => {
            try {
                const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/martyrs/${encodeURIComponent(martyrId)}?mask.fieldPaths=photo&mask.fieldPaths=photoPath&mask.fieldPaths=photoRemoved&key=${firebaseConfig.apiKey}`;
                const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                if (!res.ok) {
                    photoMemoryCache.set(martyrId, '');
                    return '';
                }
                const docJson = await res.json();
                const isRemoved = Boolean(docJson?.fields?.photoRemoved?.booleanValue);
                const rawPath = (docJson?.fields?.photoPath?.stringValue || '').trim();
                const rawPhoto = (docJson?.fields?.photo?.stringValue || '').trim();
                const isSupported = (val) => Boolean(
                    val &&
                    (val.startsWith('data:image/') ||
                     /^https:\/\//i.test(val) ||
                     /^\/assets\/photos\//.test(val) ||
                     /^\/media\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/i.test(val))
                );
                const chosen = !isRemoved
                    ? (isSupported(rawPath) ? rawPath : (isSupported(rawPhoto) ? rawPhoto : ''))
                    : '';
                if (chosen) {
                    photoMemoryCache.set(martyrId, chosen);
                    // Also attach to in-memory martyr object if present
                    if (memoryCache && Array.isArray(memoryCache.data)) {
                        const found = memoryCache.data.find(m => m && m.id === martyrId);
                        if (found) {
                            found.photo = chosen;
                            if (isSupported(rawPath)) found.photoPath = rawPath;
                            found.photoRemoved = false;
                        }
                    }
                    return chosen;
                }
                photoMemoryCache.set(martyrId, '');
                if (memoryCache && Array.isArray(memoryCache.data)) {
                    const found = memoryCache.data.find(m => m && m.id === martyrId);
                    if (found) {
                        found.photo = '';
                        found.photoPath = '';
                        if (isRemoved) found.photoRemoved = true;
                    }
                }
                return '';
            } catch (_) {
                return '';
            } finally {
                photoFetchInFlight.delete(martyrId);
            }
        })();
        photoFetchInFlight.set(martyrId, fetchPromise);
    }

    const resolvedPhoto = await fetchPromise;
    if (resolvedPhoto && imgElement) {
        imgElement.onerror = null;
        imgElement.src = resolvedPhoto;
    } else if (typeof onNoPhotoFallback === 'function') {
        onNoPhotoFallback();
    }
    return resolvedPhoto;
}

if (typeof window !== 'undefined') {
    window.resolveMartyrPhoto = resolveMartyrPhoto;
}

function toMillisSafe(val) {
    if (!val) return 0;
    if (typeof val === 'number') return val < 1e11 ? val * 1000 : val;
    if (typeof val === 'string') {
        const parsed = Date.parse(val);
        return isNaN(parsed) ? 0 : parsed;
    }
    if (typeof val === 'object') {
        if (typeof val.toMillis === 'function') {
            try { return val.toMillis(); } catch (e) { /* ignore */ }
        }
        if (typeof val.toDate === 'function') {
            try { return val.toDate().getTime(); } catch (e) { /* ignore */ }
        }
        const sec = val.seconds !== undefined ? val.seconds : val._seconds;
        if (typeof sec === 'number' && !isNaN(sec)) {
            return sec * 1000 + Math.floor((val.nanoseconds || 0) / 1e6);
        }
    }
    return 0;
}

function serializeFieldForIDB(val) {
    if (!val || typeof val !== 'object') return val;
    if (typeof val.toDate === 'function' && typeof val.seconds === 'number') {
        return {
            __bmmTimestamp: true,
            seconds: val.seconds,
            nanoseconds: typeof val.nanoseconds === 'number' ? val.nanoseconds : 0
        };
    }
    if (typeof val.seconds === 'number' && typeof val.nanoseconds === 'number' && Object.keys(val).length <= 3) {
        return {
            __bmmTimestamp: true,
            seconds: val.seconds,
            nanoseconds: val.nanoseconds
        };
    }
    if (val instanceof Date && !isNaN(val.getTime())) {
        return {
            __bmmTimestamp: true,
            seconds: Math.floor(val.getTime() / 1000),
            nanoseconds: (val.getTime() % 1000) * 1e6
        };
    }
    if (Array.isArray(val)) {
        return val.map(serializeFieldForIDB);
    }
    const out = {};
    for (const [k, v] of Object.entries(val)) {
        if (typeof v !== 'function') {
            out[k] = serializeFieldForIDB(v);
        }
    }
    return out;
}

function rehydrateFieldFromIDB(val) {
    if (!val || typeof val !== 'object') return val;
    if (
        (val.__bmmTimestamp || ('seconds' in val && 'nanoseconds' in val && Object.keys(val).length <= 3)) &&
        typeof val.seconds === 'number'
    ) {
        const sec = val.seconds;
        const ns = typeof val.nanoseconds === 'number' ? val.nanoseconds : 0;
        try {
            return new Timestamp(sec, ns);
        } catch (e) {
            return {
                seconds: sec,
                nanoseconds: ns,
                toDate: () => new Date(sec * 1000 + Math.floor(ns / 1e6)),
                toMillis: () => sec * 1000 + Math.floor(ns / 1e6)
            };
        }
    }
    if (Array.isArray(val)) {
        return val.map(rehydrateFieldFromIDB);
    }
    const out = {};
    for (const [k, v] of Object.entries(val)) {
        out[k] = rehydrateFieldFromIDB(v);
    }
    return out;
}

function computeWatermarks(martyrs, fallbackMs = Date.now()) {
    let maxApprovedMs = 0;
    let maxUpdatedMs = 0;
    for (let i = 0; i < martyrs.length; i++) {
        const m = martyrs[i];
        const appMs = toMillisSafe(m.approvedAt) || toMillisSafe(m.submittedAt);
        const updMs = toMillisSafe(m.updatedAt) || appMs;
        if (appMs > maxApprovedMs) maxApprovedMs = appMs;
        if (updMs > maxUpdatedMs) maxUpdatedMs = updMs;
    }
    return {
        maxApprovedMs: maxApprovedMs || fallbackMs,
        maxUpdatedMs: maxUpdatedMs || fallbackMs
    };
}

function openArchiveIDB() {
    return new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB not supported'));
            return;
        }
        try {
            const request = indexedDB.open(IDB_DB_NAME, 1);
            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(IDB_STORE_NAME)) {
                    database.createObjectStore(IDB_STORE_NAME);
                }
            };
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error || new Error('IndexedDB open error'));
            request.onblocked = () => reject(new Error('IndexedDB blocked'));
        } catch (err) {
            reject(err);
        }
    });
}

async function readMartyrsFromIDB() {
    try {
        const database = await openArchiveIDB();
        return await new Promise((resolve, reject) => {
            const tx = database.transaction(IDB_STORE_NAME, 'readonly');
            const store = tx.objectStore(IDB_STORE_NAME);
            const req = store.get(IDB_CACHE_KEY);
            req.onsuccess = () => {
                database.close();
                const record = req.result;
                if (!record || !Array.isArray(record.data) || record.data.length === 0) {
                    resolve(null);
                    return;
                }
                const rehydrated = record.data.map(rehydrateFieldFromIDB);
                resolve({
                    data: rehydrated,
                    rawCollectionSize: typeof record.rawCollectionSize === 'number' ? record.rawCollectionSize : rehydrated.length,
                    maxApprovedMs: record.maxApprovedMs || record.syncedAt || Date.now(),
                    maxUpdatedMs: record.maxUpdatedMs || record.syncedAt || Date.now(),
                    syncedAt: record.syncedAt || Date.now(),
                    fullSyncAt: record.fullSyncAt || record.syncedAt || Date.now()
                });
            };
            req.onerror = () => {
                database.close();
                reject(req.error);
            };
        });
    } catch (err) {
        console.warn('⚠️ IndexedDB cache read skipped:', err.message);
        return null;
    }
}

async function readMartyrsFromEdgeArchive(fresh = false) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;
    try {
        const endpoint = fresh ? '/api/edge-archive?mode=full&fresh=1' : '/api/edge-archive?mode=full';
        const resp = await fetch(endpoint, {
            headers: { 'Accept': 'application/json' },
            cache: fresh ? 'no-store' : 'default',
            signal: controller ? controller.signal : undefined
        });
        if (!resp.ok) return null;
        const record = await resp.json();
        if (!record || !Array.isArray(record.data) || record.data.length === 0) {
            return null;
        }
        const rehydrated = record.data.map(rehydrateFieldFromIDB);
        const maxApprovedMs = record.maxApprovedMs || record.syncedAt || Date.now();
        const maxUpdatedMs = record.maxUpdatedMs || record.maxApprovedMs || record.syncedAt || Date.now();
        const syncedAtMs = record.syncedAt || maxUpdatedMs;
        return {
            data: rehydrated,
            rawCollectionSize: typeof record.rawCollectionSize === 'number' ? record.rawCollectionSize : rehydrated.length,
            maxApprovedMs,
            maxUpdatedMs,
            serverWatermarkMs: maxUpdatedMs,
            syncedAt: syncedAtMs,
            fullSyncAt: syncedAtMs,
            edgeMode: record.edgeMode || 'edge',
            fromEdge: true
        };
    } catch (err) {
        console.warn('⚠️ Edge archive bootstrap skipped:', err.message);
        return null;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

async function readMartyrsFromSeed() {
    try {
        const resp = await fetch('/assets/martyrs-seed.json', {
            headers: { 'Accept': 'application/json' },
            cache: 'default'
        });
        if (!resp.ok) return null;
        const record = await resp.json();
        if (!record || !Array.isArray(record.data) || record.data.length === 0) {
            return null;
        }
        const rehydrated = record.data.map(rehydrateFieldFromIDB);
        const maxApprovedMs = record.maxApprovedMs || record.syncedAt || Date.now();
        const maxUpdatedMs = record.maxUpdatedMs || record.maxApprovedMs || record.syncedAt || Date.now();
        const syncedAtMs = record.syncedAt || maxUpdatedMs;
        return {
            data: rehydrated,
            rawCollectionSize: typeof record.rawCollectionSize === 'number' ? record.rawCollectionSize : rehydrated.length,
            maxApprovedMs,
            maxUpdatedMs,
            syncedAt: syncedAtMs,
            fullSyncAt: record.fullSyncAt || syncedAtMs,
            fromSeed: true
        };
    } catch (err) {
        console.warn('⚠️ Seed archive read skipped:', err.message);
        return null;
    }
}

async function writeMartyrsToIDB(martyrs, rawCollectionSize, isFullSync = false, watermarkOverride = null) {
    try {
        if (!Array.isArray(martyrs) || martyrs.length === 0) return;
        const now = Date.now();
        const { maxApprovedMs, maxUpdatedMs } = computeWatermarks(martyrs, now);
        // Never use Math.max(maxApprovedMs, now) so client clock skew never hides server delta docs
        const effectiveMaxApprovedMs = watermarkOverride?.maxApprovedMs || maxApprovedMs || now;
        const effectiveMaxUpdatedMs = watermarkOverride?.maxUpdatedMs || maxUpdatedMs || now;
        const effectiveSyncedAt = watermarkOverride?.syncedAt || now;
        const fullSyncAt = watermarkOverride?.fullSyncAt || (isFullSync ? now : (memoryCache?.fullSyncAt || now));

        // Keep inline Base64 photos capped in IndexedDB so mobile Safari never hits RAM/quota limits
        let inlinePhotoCount = 0;
        const compactMartyrs = martyrs.map((m) => {
            if (!m || typeof m !== 'object') return m;
            if (m.id && m.photoRemoved === true && !m.photo) {
                photoMemoryCache.set(m.id, '');
            }
            if (typeof m.photo === 'string' && m.photo.startsWith('data:image/')) {
                if (m.id) photoMemoryCache.set(m.id, m.photo);
                if (inlinePhotoCount < MAX_INLINE_DELTA_PHOTOS) {
                    inlinePhotoCount++;
                    return m;
                }
                const { photo, ...rest } = m;
                return rest;
            }
            return m;
        });

        memoryCache = {
            data: martyrs,
            rawCollectionSize: typeof rawCollectionSize === 'number' ? rawCollectionSize : martyrs.length,
            maxApprovedMs: effectiveMaxApprovedMs,
            maxUpdatedMs: effectiveMaxUpdatedMs,
            syncedAt: effectiveSyncedAt,
            fullSyncAt
        };

        if (typeof window !== 'undefined') {
            window.allApprovedMartyrs = martyrs;
            window.martyrsDataFromFirebase = martyrs;
        }

        const serializedData = compactMartyrs.map(serializeFieldForIDB);
        const database = await openArchiveIDB();
        await new Promise((resolve, reject) => {
            const tx = database.transaction(IDB_STORE_NAME, 'readwrite');
            const store = tx.objectStore(IDB_STORE_NAME);
            for (const legacyKey of LEGACY_IDB_CACHE_KEYS) {
                try { store.delete(legacyKey); } catch (_) {}
            }
            store.put({
                data: serializedData,
                rawCollectionSize: memoryCache.rawCollectionSize,
                maxApprovedMs: memoryCache.maxApprovedMs,
                maxUpdatedMs: memoryCache.maxUpdatedMs,
                syncedAt: effectiveSyncedAt,
                fullSyncAt
            }, IDB_CACHE_KEY);
            tx.oncomplete = () => {
                database.close();
                resolve();
            };
            tx.onerror = () => {
                database.close();
                reject(tx.error);
            };
        });
    } catch (err) {
        console.warn('⚠️ IndexedDB cache write skipped:', err.message);
    }
}

async function clearMartyrsCache() {
    memoryCache = null;
    try {
        const database = await openArchiveIDB();
        await new Promise((resolve) => {
            const tx = database.transaction(IDB_STORE_NAME, 'readwrite');
            const store = tx.objectStore(IDB_STORE_NAME);
            store.delete(IDB_CACHE_KEY);
            for (const legacyKey of LEGACY_IDB_CACHE_KEYS) {
                try { store.delete(legacyKey); } catch (_) {}
            }
            tx.oncomplete = () => {
                database.close();
                resolve();
            };
            tx.onerror = () => {
                database.close();
                resolve();
            };
        });
    } catch (err) {
        // Ignore cleanup errors
    }
}

function broadcastMartyrsUpdate(martyrs, source = 'firebase-live-sync') {
    if (typeof window === 'undefined' || !Array.isArray(martyrs)) return;
    window.allApprovedMartyrs = martyrs;
    window.martyrsDataFromFirebase = martyrs;
    window.dispatchEvent(new CustomEvent('martyrsDataUpdated', {
        detail: {
            data: martyrs,
            source,
            connected: true,
            total_found: martyrs.length
        }
    }));
    window.dispatchEvent(new CustomEvent('martyrsDataLoaded', { detail: martyrs }));
}

// Lightweight authoritative collection fetch from Firestore REST API (excludes bulk Base64 photos, ~340 KB total)
async function fetchApprovedMartyrsFromFirestore(existingMartyrsList = null, options = {}) {
    const includeSubmitterFields = Boolean(options && options.includeSubmitterFields);
    const skipIDBWrite = Boolean(options && options.skipIDBWrite);
    const fieldMask = includeSubmitterFields ? ADMIN_METADATA_FIELDS : PUBLIC_METADATA_FIELDS;
    let allMartyrs = [];
    let rawCollectionSize = 0;

    // Build a lookup of any already-cached photos so newly approved profiles keep their portrait
    const existingPhotoById = new Map();
    const sourceList = existingMartyrsList || (memoryCache && memoryCache.data) || [];
    if (Array.isArray(sourceList)) {
        for (let i = 0; i < sourceList.length; i++) {
            const item = sourceList[i];
            if (item && item.id && typeof item.photo === 'string' && item.photo.startsWith('data:image/')) {
                existingPhotoById.set(item.id, item.photo);
                photoMemoryCache.set(item.id, item.photo);
            }
        }
    }

    try {
        console.log('🔍 Fetching lightweight martyrs metadata from Firestore REST API...');
        let pageToken = '';
        do {
            const params = new URLSearchParams({
                pageSize: '300',
                key: firebaseConfig.apiKey
            });
            for (const field of fieldMask) {
                params.append('mask.fieldPaths', field);
            }
            if (pageToken) {
                params.set('pageToken', pageToken);
            }

            const headers = { 'Accept': 'application/json' };
            if (includeSubmitterFields && firebaseAuthInstance?.currentUser) {
                try {
                    const idToken = await firebaseAuthInstance.currentUser.getIdToken();
                    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;
                } catch (_) {}
            }

            const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/martyrs?${params}`;
            const res = await fetch(url, { headers });
            if (!res.ok) {
                throw new Error(`Firestore REST HTTP ${res.status}`);
            }
            const page = await res.json();
            const docs = page.documents || [];
            rawCollectionSize += docs.length;

            for (let i = 0; i < docs.length; i++) {
                const docObj = docs[i];
                const parsed = parseFirestoreRestFields(docObj.fields || {});
                if (!parsed.status || parsed.status === 'approved') {
                    const docId = docObj.name.split('/').pop();
                    const cachedPhoto = parsed.photoRemoved ? '' : (parsed.photoPath || photoMemoryCache.get(docId) || existingPhotoById.get(docId));
                    const martyrEntry = {
                        ...parsed,
                        id: docId,
                        status: parsed.status || 'approved'
                    };
                    if (cachedPhoto) {
                        martyrEntry.photo = cachedPhoto;
                    }
                    allMartyrs.push(martyrEntry);
                }
            }
            pageToken = page.nextPageToken || '';
        } while (pageToken);

        console.log(`📋 Lightweight sync fetched ${rawCollectionSize} total docs, ${allMartyrs.length} approved`);
    } catch (error) {
        console.warn('⚠️ Error during lightweight martyrs sync:', error.message);
    }

    if (allMartyrs.length > 0) {
        allMartyrs.sort((a, b) => {
            const idA = String(a?.id || '');
            const idB = String(b?.id || '');
            return idA < idB ? -1 : (idA > idB ? 1 : 0);
        });
        if (!skipIDBWrite) {
            await writeMartyrsToIDB(allMartyrs, rawCollectionSize, true);
        }
    }

    return {
        success: allMartyrs.length > 0,
        data: allMartyrs,
        source: includeSubmitterFields ? 'firebase-admin-rest' : 'firebase-lightweight-rest',
        collections_checked: ['martyrs'],
        total_found: allMartyrs.length
    };
}

// Phase 2: Background Delta Sync (Edge D1/Cache Cursor first -> Firestore SDK fallback)
// Checks for newly approved, edited, or soft-deleted (tombstone) profiles since cache watermark.
async function syncWithEdgeArchiveDelta(cachedEntry) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 5000) : null;
    try {
        const now = Date.now();
        const sinceMs = Math.max(
            1700000000000,
            (cachedEntry.maxUpdatedMs || cachedEntry.maxApprovedMs || cachedEntry.syncedAt || now) - CLOCK_SKEW_BUFFER_MS
        );
        const resp = await fetch(`/api/edge-archive?since=${sinceMs}`, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
            signal: controller ? controller.signal : undefined
        });
        if (!resp.ok) return null;
        const delta = await resp.json();
        if (!delta || !delta.success || delta.mode !== 'delta') return null;

        const updates = Array.isArray(delta.updates) ? delta.updates.map(rehydrateFieldFromIDB) : [];
        const deletedSet = new Set(Array.isArray(delta.deletedIds) ? delta.deletedIds : []);

        const byId = new Map();
        for (const item of cachedEntry.data) {
            if (item && item.id) byId.set(item.id, item);
        }

        let changed = false;
        for (const delId of deletedSet) {
            if (byId.delete(delId)) {
                photoMemoryCache.set(delId, '');
                changed = true;
            }
        }

        for (const item of updates) {
            if (!item || !item.id) continue;
            if (item.photoRemoved) {
                photoMemoryCache.set(item.id, '');
            } else if (item.photoPath) {
                photoMemoryCache.set(item.id, item.photoPath);
            }
            const prev = byId.get(item.id);
            const nextUpdated = toMillisSafe(item.updatedAt) || toMillisSafe(item.approvedAt);
            const prevUpdated = prev ? (toMillisSafe(prev.updatedAt) || toMillisSafe(prev.approvedAt)) : -1;
            if (!prev || nextUpdated !== prevUpdated || item.photoPath !== prev.photoPath || item.fullName !== prev.fullName || item.biography !== prev.biography || Boolean(item.photoRemoved) !== Boolean(prev.photoRemoved)) {
                // Preserve in-memory base64 photo only if same photo version and not removed
                const preservedPhoto = !item.photoRemoved && !item.photoPath && !item.photo && prev?.photo && prev.photo.startsWith('data:image/')
                    ? prev.photo
                    : item.photo;
                byId.set(item.id, preservedPhoto ? { ...item, photo: preservedPhoto } : item);
                changed = true;
            }
        }

        const merged = [...byId.values()];
        const countMismatch = typeof delta.totalCount === 'number' && delta.totalCount > 0 && delta.totalCount !== merged.length;

        if (delta.hasMore || countMismatch) {
            console.log(`🔄 Edge archive reconcile (${merged.length} → ${delta.totalCount}); loading full edge snapshot...`);
            const fresh = await readMartyrsFromEdgeArchive(true);
            if (fresh && fresh.data.length > 0) {
                await writeMartyrsToIDB(fresh.data, fresh.rawCollectionSize, true, {
                    maxApprovedMs: fresh.maxApprovedMs,
                    maxUpdatedMs: fresh.maxUpdatedMs,
                    syncedAt: Date.now()
                });
                broadcastMartyrsUpdate(fresh.data, 'edge-full-reconcile');
                return { success: true, data: fresh.data };
            }
        }

        if (changed) {
            merged.sort((a, b) => {
                const idA = String(a?.id || '');
                const idB = String(b?.id || '');
                return idA < idB ? -1 : (idA > idB ? 1 : 0);
            });
            console.log(`✨ Edge delta sync (${delta.edgeMode || 'edge'}): ${updates.length} updates, ${deletedSet.size} tombstones (Total: ${merged.length})`);
            await writeMartyrsToIDB(merged, delta.totalCount || merged.length, false, {
                maxApprovedMs: delta.maxApprovedMs || cachedEntry.maxApprovedMs,
                maxUpdatedMs: delta.maxUpdatedMs || Date.now(),
                syncedAt: Date.now()
            });
            broadcastMartyrsUpdate(merged, 'edge-delta-sync');
        } else if (memoryCache) {
            memoryCache.syncedAt = Date.now();
            if (delta.maxUpdatedMs && delta.maxUpdatedMs > (memoryCache.maxUpdatedMs || 0)) {
                memoryCache.maxUpdatedMs = delta.maxUpdatedMs;
            }
        }

        return { success: true, data: merged };
    } catch (_) {
        return null;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

function syncWithFirebaseInBackground(cachedEntry) {
    if (backgroundSyncPromise) return backgroundSyncPromise;
    if (!cachedEntry || !Array.isArray(cachedEntry.data) || cachedEntry.data.length === 0) {
        return Promise.resolve(null);
    }

    backgroundSyncPromise = (async () => {
        try {
            // Prefer Cloudflare D1 / Edge Archive delta endpoint (0 public Firestore reads)
            const edgeResult = await syncWithEdgeArchiveDelta(cachedEntry);
            if (edgeResult && edgeResult.success) {
                return edgeResult;
            }

            const now = Date.now();
            const baseWatermarkMs = Math.max(1700000000000, (cachedEntry.syncedAt || now) - CLOCK_SKEW_BUFFER_MS);
            const sinceApprovedMs = Math.max(1700000000000, (cachedEntry.maxApprovedMs || baseWatermarkMs) - CLOCK_SKEW_BUFFER_MS);
            const sinceUpdatedMs = Math.max(1700000000000, (cachedEntry.maxUpdatedMs || baseWatermarkMs) - CLOCK_SKEW_BUFFER_MS);

            const martyrsCol = collection(db, 'martyrs');
            const expectedBaseSize = cachedEntry.rawCollectionSize || cachedEntry.data.length;

            // 1. Check server document count first (lightweight 1-integer read)
            const countResult = await getCountFromServer(martyrsCol).catch(() => null);
            const serverTotalDocs = countResult && countResult.data ? countResult.data().count : null;

            // If a deletion occurred (serverTotalDocs < expectedBaseSize) or a large batch (>12) was approved,
            // run the lightweight ~340 KB REST metadata sync directly instead of downloading bulk Base64 photos
            if (
                serverTotalDocs !== null &&
                (serverTotalDocs < expectedBaseSize || (serverTotalDocs - expectedBaseSize) > MAX_INLINE_DELTA_PHOTOS)
            ) {
                console.log(`🔄 Archive count shift (${expectedBaseSize} → ${serverTotalDocs}); running lightweight metadata sync...`);
                const fullRes = await fetchApprovedMartyrsFromFirestore(cachedEntry.data);
                if (fullRes.success && fullRes.data.length > 0) {
                    broadcastMartyrsUpdate(fullRes.data, 'firebase-count-sync');
                }
                return fullRes;
            }

            // 2. Normal incremental check (0 to 12 new/edited documents)
            const approvedDeltaQuery = query(martyrsCol, where('approvedAt', '>', Timestamp.fromMillis(sinceApprovedMs)));
            const updatedDeltaQuery = query(martyrsCol, where('updatedAt', '>', Timestamp.fromMillis(sinceUpdatedMs)));

            const [approvedSnap, updatedSnap] = await Promise.all([
                getDocs(approvedDeltaQuery).catch(() => null),
                getDocs(updatedDeltaQuery).catch(() => null)
            ]);

            const deltaMap = new Map();

            if (approvedSnap) {
                approvedSnap.forEach((docSnap) => {
                    deltaMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
                });
            }
            if (updatedSnap) {
                updatedSnap.forEach((docSnap) => {
                    deltaMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
                });
            }

            // Merge delta documents into cached list
            const existingIndexById = new Map();
            const merged = cachedEntry.data.slice();
            for (let i = 0; i < merged.length; i++) {
                if (merged[i] && merged[i].id) {
                    existingIndexById.set(merged[i].id, i);
                }
            }

            let addedCount = 0;
            let modifiedCount = 0;

            for (const [docId, docData] of deltaMap.entries()) {
                const isApproved = !docData.status || docData.status === 'approved';
                if (typeof docData.photo === 'string' && docData.photo.startsWith('data:image/')) {
                    photoMemoryCache.set(docId, docData.photo);
                }
                const normalizedDoc = { ...docData, id: docId, status: docData.status || 'approved' };

                if (existingIndexById.has(docId)) {
                    const idx = existingIndexById.get(docId);
                    if (isApproved) {
                        merged[idx] = normalizedDoc;
                        modifiedCount++;
                    } else {
                        merged.splice(idx, 1);
                        modifiedCount++;
                    }
                } else if (isApproved) {
                    merged.push(normalizedDoc);
                    addedCount++;
                }
            }

            const expectedCollectionSize = expectedBaseSize + addedCount;

            // If server document count still differs from expected (e.g. 1 added and 1 deleted simultaneously),
            // reconcile via the lightweight REST metadata fetch (~340 KB, zero Base64 bloat).
            if (serverTotalDocs !== null && serverTotalDocs !== expectedCollectionSize) {
                console.log(`🔄 Reconciling archive count (${expectedCollectionSize} → ${serverTotalDocs}) via lightweight sync...`);
                const fullRes = await fetchApprovedMartyrsFromFirestore(merged);
                if (fullRes.success && fullRes.data.length > 0) {
                    broadcastMartyrsUpdate(fullRes.data, 'firebase-count-sync');
                }
                return fullRes;
            }

            // If delta queries found new or edited profiles, keep deterministic Firestore doc.id order, update cache & UI
            if (addedCount > 0 || modifiedCount > 0) {
                if (addedCount > 0) {
                    merged.sort((a, b) => {
                        const idA = String(a?.id || '');
                        const idB = String(b?.id || '');
                        return idA < idB ? -1 : (idA > idB ? 1 : 0);
                    });
                }
                const newRawSize = serverTotalDocs !== null ? serverTotalDocs : expectedCollectionSize;
                console.log(`✨ Live Firebase delta sync applied: +${addedCount} added, ${modifiedCount} updated (Total: ${merged.length})`);
                await writeMartyrsToIDB(merged, newRawSize, false);
                broadcastMartyrsUpdate(merged, 'firebase-delta-sync');
            } else if (memoryCache) {
                memoryCache.syncedAt = Date.now();
            }

            return { success: true, data: merged };
        } catch (syncErr) {
            console.warn('⚠️ Background Firebase sync skipped:', syncErr.message);
            return null;
        } finally {
            backgroundSyncPromise = null;
        }
    })();

    return backgroundSyncPromise;
}

// ============================================================================
// ADMIN FIREBASE AUTH BRIDGE + WRITE AUTHORIZATION & PAYLOAD SANITIZATION
// Connects /admin-login cleanly with Firebase Authentication (admin@baluchmartyrs.com)
// so Firestore Server Security Rules can verify request.auth != null.
// ============================================================================

const ADMIN_FIREBASE_EMAIL = 'admin@baluchmartyrs.com';
let firebaseAuthInstance = null;
let firebaseAuthModule = null;
let firebaseAuthInitPromise = null;

export async function ensureFirebaseAuthReady() {
    if (typeof window === 'undefined') return null;
    if (firebaseAuthInitPromise) return firebaseAuthInitPromise;
    firebaseAuthInitPromise = (async () => {
        try {
            firebaseAuthModule = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js');
            firebaseAuthInstance = firebaseAuthModule.getAuth(app);
            if (typeof firebaseAuthInstance.authStateReady === 'function') {
                await firebaseAuthInstance.authStateReady();
            }
            if (firebaseAuthInstance.currentUser) {
                console.log(`🔐 Firebase Auth active session: ${firebaseAuthInstance.currentUser.email}`);
            }
            return firebaseAuthInstance;
        } catch (err) {
            console.warn('⚠️ Firebase Auth init warning (continuing safely):', err.message);
            return null;
        }
    })();
    return firebaseAuthInitPromise;
}

export async function signInAdminFirebase(password, customEmail = null) {
    try {
        const auth = await ensureFirebaseAuthReady();
        if (!auth || !firebaseAuthModule) {
            return { success: false, error: 'Firebase Auth module unavailable' };
        }
        const candidateEmails = [ADMIN_FIREBASE_EMAIL];
        if (customEmail && typeof customEmail === 'string' && customEmail.includes('@') && customEmail.includes('.') && !candidateEmails.includes(customEmail)) {
            candidateEmails.push(customEmail.trim());
        }
        for (const emailToTry of candidateEmails) {
            try {
                const cred = await firebaseAuthModule.signInWithEmailAndPassword(auth, emailToTry, password);
                console.log(`✅ Firebase Auth signed in as: ${cred.user?.email} (UID: ${cred.user?.uid})`);
                return {
                    success: true,
                    email: cred.user?.email,
                    uid: cred.user?.uid
                };
            } catch (innerErr) {
                console.warn(`⚠️ Firebase Auth sign-in check (${emailToTry}):`, innerErr.code || innerErr.message);
            }
        }
        return { success: false, error: 'Firebase Auth credentials did not match' };
    } catch (err) {
        console.warn('⚠️ Firebase Auth sign-in skipped safely:', err.message);
        return { success: false, error: err.message };
    }
}

export async function signOutAdminFirebase() {
    try {
        const auth = await ensureFirebaseAuthReady();
        if (auth && firebaseAuthModule && typeof firebaseAuthModule.signOut === 'function') {
            await firebaseAuthModule.signOut(auth);
            console.log('🔐 Signed out of Firebase Auth');
        }
    } catch (_) {}
}

// Pre-warm Firebase Auth state immediately when on /admin or /admin-login
if (typeof window !== 'undefined' && window.location.pathname.includes('admin')) {
    ensureFirebaseAuthReady();
}

let lastAdminWriteVerifiedAt = 0;
let lastAdminWriteVerifiedToken = null;

async function requireActiveAdminSession(actionName) {
    if (typeof window === 'undefined') return true;
    await ensureFirebaseAuthReady();
    let hasActiveSession = false;
    let token = null;

    try {
        token = sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken');
        if (window.adminAuth && typeof window.adminAuth.isAuthenticated === 'function') {
            if (window.adminAuth.isAuthenticated()) {
                hasActiveSession = true;
            }
        }
        const localRaw = localStorage.getItem('baluch_admin_session');
        const sessionRaw = sessionStorage.getItem('baluch_admin_session');
        if (localRaw && sessionRaw) {
            const localSess = JSON.parse(localRaw);
            const sessSess = JSON.parse(sessionRaw);
            if (
                localSess &&
                sessSess &&
                localSess.username === sessSess.username &&
                localSess.loginTime === sessSess.loginTime &&
                localSess.expires > Date.now()
            ) {
                hasActiveSession = true;
                if (!token && localSess.token) token = localSess.token;
            }
        }
    } catch (_) {}

    if (!hasActiveSession) {
        throw new Error(`Unauthorized: Valid admin authentication is required for ${actionName}.`);
    }

    // If a signed JWT token is present, cryptographically verify it with GET /api/admin-login
    if (token) {
        if (lastAdminWriteVerifiedToken === token && (Date.now() - lastAdminWriteVerifiedAt) < 15000) {
            return true;
        }
        try {
            const response = await fetch('/api/admin-login', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-Admin-Token': token,
                    'Accept': 'application/json'
                },
                cache: 'no-store'
            });
            if (response.status === 401 || response.status === 403) {
                throw new Error(`Unauthorized: Server rejected admin token for ${actionName}.`);
            }
            if (response.ok) {
                const res = await response.json();
                if (res && res.valid) {
                    lastAdminWriteVerifiedToken = token;
                    lastAdminWriteVerifiedAt = Date.now();
                }
            }
        } catch (err) {
            if (String(err.message).startsWith('Unauthorized:')) {
                throw err;
            }
        }
    }

    return true;
}

function sanitizeTextField(val, maxLength = 2000, allowNewlines = false) {
    if (val === null || val === undefined) return '';
    let str = String(val);
    if (allowNewlines) {
        str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    } else {
        str = str.replace(/[\x00-\x1F\x7F]/g, ' ');
    }
    str = str
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim();
    if (str.length > maxLength) {
        str = str.substring(0, maxLength);
    }
    return str;
}

function toFirestoreDateOrEmpty(value) {
    if (value === null || value === undefined || value === '') return '';
    if (typeof value === 'object') {
        if (typeof value.toDate === 'function' || typeof value.seconds === 'number') {
            return value;
        }
        if (value instanceof Date && !isNaN(value.getTime())) {
            return Timestamp.fromDate(value);
        }
        return '';
    }
    const str = String(value).trim();
    if (!str) return '';
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(str) ? new Date(`${str}T00:00:00Z`) : new Date(str);
    if (isNaN(parsed.getTime())) {
        throw new Error(`Invalid date format: "${str}". Please use YYYY-MM-DD.`);
    }
    return Timestamp.fromDate(parsed);
}

function sanitizeMartyrPayload(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const cleaned = { ...raw };
    const textLimits = {
        fullName: [200, false],
        fatherName: [200, false],
        birthPlace: [250, false],
        martyrdomPlace: [250, false],
        organization: [200, false],
        affiliation: [200, false],
        rank: [200, false],
        familyDetails: [3000, true],
        biography: [15000, true],
        submitterName: [200, false],
        submitterEmail: [254, false],
        submitterRelation: [200, false],
        submitterPhone: [60, false]
    };

    for (const [field, [maxLen, multiline]] of Object.entries(textLimits)) {
        if (typeof cleaned[field] === 'string') {
            cleaned[field] = sanitizeTextField(cleaned[field], maxLen, multiline);
        }
    }

    if ('photoRemoved' in cleaned) {
        cleaned.photoRemoved = Boolean(cleaned.photoRemoved);
    }
    if ('hasPhoto' in cleaned) {
        cleaned.hasPhoto = Boolean(cleaned.hasPhoto);
    }

    const isAllowedRelativeMedia = (p) => (
        /^\/media\/[A-Za-z0-9_-]{1,16}\/[A-Za-z0-9._-]{1,160}$/i.test(p) ||
        /^\/assets\/photos\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(p)
    );

    if ('photoPath' in cleaned) {
        const p = String(cleaned.photoPath || '').trim();
        if (!p) {
            cleaned.photoPath = '';
        } else if (p.length <= 512 && (isAllowedRelativeMedia(p) || /^https:\/\//i.test(p))) {
            cleaned.photoPath = p;
        } else {
            throw new Error('Invalid R2 media photoPath format.');
        }
    }
    if ('photoHash' in cleaned) {
        cleaned.photoHash = String(cleaned.photoHash || '').trim().slice(0, 128);
    }
    if ('photoShard' in cleaned) {
        cleaned.photoShard = String(cleaned.photoShard || '').trim().slice(0, 32);
    }

    if ('photo' in cleaned) {
        if (cleaned.photo === null || cleaned.photo === undefined || String(cleaned.photo).trim() === '') {
            cleaned.photo = '';
        } else {
            const photo = String(cleaned.photo).trim();
            const isSafeDataUri = /^data:image\/(jpeg|jpg|png|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(photo);
            const isSafeRelativePath = isAllowedRelativeMedia(photo);
            const isSafeHttpsUrl = /^https:\/\//i.test(photo);
            if (!isSafeDataUri && !isSafeRelativePath && !isSafeHttpsUrl) {
                throw new Error('Invalid photo format. Only JPEG, PNG, GIF, or WebP images or HTTPS URLs are allowed.');
            }
            if (isSafeDataUri && photo.length > 1040000) {
                throw new Error('Compressed photo exceeds Firestore 1 MB document limit. Please pick a smaller image or enable R2 photo shelf.');
            }
            cleaned.photo = photo;
        }
    }

    return cleaned;
}

function buildAdminMartyrUpdatePayload(updatedData, targetStatus = null) {
    const processedData = sanitizeMartyrPayload(updatedData);
    delete processedData.id;

    if ('birthDate' in processedData) {
        processedData.birthDate = toFirestoreDateOrEmpty(processedData.birthDate);
    }
    if ('martyrdomDate' in processedData) {
        processedData.martyrdomDate = toFirestoreDateOrEmpty(processedData.martyrdomDate);
    }

    const hasPhotoField = 'photo' in processedData || 'photoPath' in processedData;
    const isPhotoRemoved = Boolean(processedData.photoRemoved) || ('photo' in processedData && processedData.photo === '' && !processedData.photoPath);
    let photoChanged = false;

    if (isPhotoRemoved) {
        processedData.photo = '';
        processedData.photoPath = '';
        processedData.photoHash = '';
        processedData.photoShard = '';
        processedData.photoRemoved = true;
        processedData.hasPhoto = false;
        processedData.photoUpdatedAt = serverTimestamp();
        photoChanged = true;
    } else if (hasPhotoField && (processedData.photo || processedData.photoPath)) {
        processedData.photoRemoved = false;
        processedData.hasPhoto = true;
        processedData.photoUpdatedAt = serverTimestamp();
        photoChanged = true;
    }

    if (targetStatus) {
        processedData.status = targetStatus;
    }
    processedData.updatedAt = serverTimestamp();
    return { processedData, photoChanged, isPhotoRemoved };
}

function getAdminJwtToken() {
    try {
        const direct = sessionStorage.getItem('adminToken') || localStorage.getItem('adminToken');
        if (direct) return direct;
        const sessRaw = sessionStorage.getItem('baluch_admin_session') || localStorage.getItem('baluch_admin_session');
        if (sessRaw) {
            const parsed = JSON.parse(sessRaw);
            if (parsed?.token) return String(parsed.token);
        }
        return sessionStorage.getItem('bmm_admin_token') || '';
    } catch {
        return '';
    }
}

function isFirestoreQuotaOrUnavailableError(err) {
    if (!err) return false;
    const code = String(err.code || '').toLowerCase();
    const msg = String(err.message || err || '').toLowerCase();
    return (
        code.includes('resource-exhausted') ||
        code.includes('unavailable') ||
        code.includes('deadline-exceeded') ||
        code.includes('aborted') ||
        code.includes('internal') ||
        msg.includes('quota') ||
        msg.includes('resource_exhausted') ||
        msg.includes('resource exhausted') ||
        msg.includes('429') ||
        msg.includes('timed out') ||
        msg.includes('timeout') ||
        msg.includes('network') ||
        msg.includes('failed to fetch')
    );
}

function withTimeout(promise, ms = 10000, label = 'Operation') {
    let timer = null;
    const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error(`${label} timed out after ${ms}ms`);
            err.code = 'deadline-exceeded';
            reject(err);
        }, ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

function generateEdgeFallbackId() {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return `edge_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
        }
    } catch (_) {}
    return `edge_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function stripInternalMetaFields(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    delete obj.id;
    delete obj.d1PendingId;
    delete obj.firestoreId;
    delete obj.source;
    delete obj._fromD1;
    delete obj.submittedAt;
    return obj;
}

function toJsonDateString(val) {
    if (val === null || val === undefined || val === '') return '';
    if (typeof val === 'string') return val.trim();
    if (val instanceof Date && !isNaN(val.getTime())) return val.toISOString().slice(0, 10);
    if (typeof val === 'object') {
        if (typeof val.toDate === 'function') {
            try { return val.toDate().toISOString().slice(0, 10); } catch (_) {}
        }
        if (typeof val.seconds === 'number') {
            return new Date(val.seconds * 1000).toISOString().slice(0, 10);
        }
    }
    return '';
}

function serializePendingForD1(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const copy = { ...raw };
    stripInternalMetaFields(copy);
    if ('birthDate' in copy) copy.birthDate = toJsonDateString(copy.birthDate);
    if ('martyrdomDate' in copy) copy.martyrdomDate = toJsonDateString(copy.martyrdomDate);
    return copy;
}

async function pendingApiFetch(path, options = {}, includeAdminAuth = false) {
    try {
        const headers = { ...(options.headers || {}) };
        if (options.body && !headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
        if (includeAdminAuth) {
            const token = getAdminJwtToken();
            if (!token) {
                return { ok: false, status: 401, data: null, error: 'Missing admin session token' };
            }
            headers['Authorization'] = `Bearer ${token}`;
        }
        const resp = await fetch(path, { ...options, headers, cache: 'no-store' });
        const data = await resp.json().catch(() => null);
        return {
            ok: resp.ok && (data ? data.success !== false : true),
            status: resp.status,
            data,
            error: data?.error || (resp.ok ? '' : `HTTP ${resp.status}`)
        };
    } catch (err) {
        return { ok: false, status: 0, data: null, error: err?.message || 'Network request failed' };
    }
}

async function uploadAdminPhotoToR2(dataUri) {
    const token = getAdminJwtToken();
    if (!token || typeof dataUri !== 'string' || !dataUri.startsWith('data:image/')) {
        return { uploaded: false, r2Available: false };
    }
    try {
        const resp = await fetch('/api/media-upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ dataUri })
        });
        const data = await resp.json().catch(() => null);
        if (resp.ok && data?.success && data?.photoPath) {
            return {
                uploaded: true,
                r2Available: true,
                photoPath: data.photoPath,
                photoHash: data.photoHash || '',
                photoShard: data.photoShard || ''
            };
        }
        return { uploaded: false, r2Available: Boolean(data?.r2Available) };
    } catch {
        return { uploaded: false, r2Available: false };
    }
}

async function pushEdgeSync(action, payload = {}) {
    const token = getAdminJwtToken();
    if (!token) return { success: false, skipped: true };
    try {
        const resp = await fetch('/api/admin-edge-sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ action, ...payload })
        });
        const data = await resp.json().catch(() => null);
        return data || { success: resp.ok };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

function stripExtendedRuleFields(dataObj) {
    const copy = { ...dataObj };
    delete copy.photoPath;
    delete copy.photoHash;
    delete copy.photoShard;
    delete copy.deletedAt;
    return copy;
}

function isRulePermissionDeniedError(err) {
    const code = String(err?.code || '').toLowerCase();
    const msg = String(err?.message || '').toLowerCase();
    return code.includes('permission-denied') || msg.includes('missing or insufficient permissions');
}

// Database helper functions
export const firebaseDB = {
    // Add new pending martyr (writes to Firestore with durable Cloudflare D1 + R2 fallback/mirror)
    async addPendingMartyr(martyrData) {
        try {
            // Sanitize and validate all fields before saving
            const processedData = sanitizeMartyrPayload(martyrData);
            stripInternalMetaFields(processedData);
            if (!processedData.fullName || processedData.fullName.length < 2) {
                throw new Error('Martyr full name is required.');
            }

            const jsonBackupPayload = serializePendingForD1(processedData);

            if (processedData.birthDate && typeof processedData.birthDate === 'string') {
                processedData.birthDate = Timestamp.fromDate(new Date(processedData.birthDate));
            }
            if (processedData.martyrdomDate && typeof processedData.martyrdomDate === 'string') {
                processedData.martyrdomDate = Timestamp.fromDate(new Date(processedData.martyrdomDate));
            }

            let firestoreErr = null;
            try {
                const docRef = await withTimeout(
                    addDoc(collection(db, 'pendingMartyrs'), {
                        ...processedData,
                        status: 'pending',
                        submittedAt: serverTimestamp(),
                        id: Date.now().toString()
                    }),
                    10000,
                    'Firestore pending submission'
                );

                // Best-effort mirror to Cloudflare D1 so admin always has full queue visibility
                await pendingApiFetch('/api/pending-submissions', {
                    method: 'POST',
                    body: JSON.stringify({
                        ...jsonBackupPayload,
                        firestoreId: docRef.id,
                        submittedAt: new Date().toISOString()
                    })
                }).catch(() => {});

                console.log('Pending martyr added with ID: ', docRef.id);
                return { success: true, id: docRef.id, source: 'firestore' };
            } catch (err) {
                firestoreErr = err;
                console.warn('⚠️ Firestore addPendingMartyr unavailable, activating D1 fallback:', err?.code || err?.message);
            }

            const d1Res = await pendingApiFetch('/api/pending-submissions', {
                method: 'POST',
                body: JSON.stringify({
                    ...jsonBackupPayload,
                    submittedAt: new Date().toISOString()
                })
            });

            if (d1Res.ok && d1Res.data?.id) {
                console.log('Pending martyr captured via Cloudflare D1 fallback with ID:', d1Res.data.id);
                return { success: true, id: d1Res.data.id, source: 'd1-fallback' };
            }

            return {
                success: false,
                error: d1Res.error || firestoreErr?.message || 'Unable to submit martyr profile.'
            };
        } catch (error) {
            console.error('Error adding pending martyr: ', error);
            return { success: false, error: error.message };
        }
    },

    // Clear in-memory and IndexedDB archive cache
    async clearCache() {
        await clearMartyrsCache();
        return { success: true };
    },

    // On-demand single-martyr photo resolver for newly approved martyrs not yet in static /assets/photos/
    resolveMartyrPhoto,

    // Get all approved martyrs with Instant IndexedDB Cache + Live Firebase Background Sync
    async getApprovedMartyrs(options = {}) {
        const forceRefresh = Boolean(options && options.forceRefresh);

        // 1. Instant In-Memory Cache Hit (0ms within same page session)
        if (!forceRefresh && memoryCache && Array.isArray(memoryCache.data) && memoryCache.data.length > 0) {
            if (Date.now() - (memoryCache.syncedAt || 0) > 5000) {
                syncWithFirebaseInBackground(memoryCache);
            }
            return {
                success: true,
                data: memoryCache.data,
                source: 'memory-cache',
                collections_checked: ['martyrs', 'pendingMartyrs'],
                total_found: memoryCache.data.length
            };
        }

        // 2. Deduplicate concurrent requests on the same page load
        if (!forceRefresh && inFlightApprovedPromise) {
            return inFlightApprovedPromise;
        }

        const loaderPromise = (async () => {
            try {
                // Phase 1: Check High-Capacity IndexedDB Archive Cache (~25-40ms)
                if (!forceRefresh) {
                    let cachedEntry = await readMartyrsFromIDB();

                    // If IndexedDB is empty (first-time visitor), fetch Edge Archive (/api/edge-archive: D1 or Edge Cache) first, then CDN Seed
                    if (!cachedEntry || !Array.isArray(cachedEntry.data) || cachedEntry.data.length === 0) {
                        cachedEntry = await readMartyrsFromEdgeArchive(false);
                        if (!cachedEntry || !Array.isArray(cachedEntry.data) || cachedEntry.data.length === 0) {
                            cachedEntry = await readMartyrsFromSeed();
                        }
                        if (cachedEntry && Array.isArray(cachedEntry.data) && cachedEntry.data.length > 0) {
                            console.log(`⚡ Instant ${cachedEntry.fromEdge ? `Edge (${cachedEntry.edgeMode})` : 'Seed'} Archive hit: ${cachedEntry.data.length} martyrs loaded immediately`);
                            // Save to IndexedDB in background preserving actual server watermarks
                            writeMartyrsToIDB(cachedEntry.data, cachedEntry.rawCollectionSize, false, {
                                maxApprovedMs: cachedEntry.maxApprovedMs,
                                maxUpdatedMs: cachedEntry.maxUpdatedMs,
                                syncedAt: cachedEntry.syncedAt,
                                fullSyncAt: cachedEntry.fullSyncAt
                            });
                        }
                    }

                    if (cachedEntry && Array.isArray(cachedEntry.data) && cachedEntry.data.length > 0) {
                        memoryCache = cachedEntry;
                        if (typeof window !== 'undefined') {
                            window.allApprovedMartyrs = cachedEntry.data;
                            window.martyrsDataFromFirebase = cachedEntry.data;
                        }
                        console.log(`⚡ Instant Memorial Archive hit (${cachedEntry.fromEdge ? `Edge ${cachedEntry.edgeMode}` : cachedEntry.fromSeed ? 'CDN Seed' : 'IndexedDB Cache'}): ${cachedEntry.data.length} martyrs loaded immediately`);

                        // Phase 2: Asynchronously verify & sync any additions, edits, or deletions with Edge/Firebase
                        syncWithFirebaseInBackground(cachedEntry);

                        return {
                            success: true,
                            data: cachedEntry.data,
                            source: cachedEntry.fromEdge ? `edge-${cachedEntry.edgeMode || 'archive'}` : (cachedEntry.fromSeed ? 'seed-archive' : 'idb-cache'),
                            collections_checked: ['martyrs', 'pendingMartyrs'],
                            total_found: cachedEntry.data.length
                        };
                    }
                }

                // Force refresh: prefer fresh Edge D1 snapshot, then Firestore REST fallback
                if (forceRefresh) {
                    const freshEdge = await readMartyrsFromEdgeArchive(true);
                    if (freshEdge && Array.isArray(freshEdge.data) && freshEdge.data.length > 0) {
                        await writeMartyrsToIDB(freshEdge.data, freshEdge.rawCollectionSize, true, {
                            maxApprovedMs: freshEdge.maxApprovedMs,
                            maxUpdatedMs: freshEdge.maxUpdatedMs,
                            syncedAt: Date.now()
                        });
                        broadcastMartyrsUpdate(freshEdge.data, 'edge-force-refresh');
                        return {
                            success: true,
                            data: freshEdge.data,
                            source: `edge-${freshEdge.edgeMode || 'archive'}`,
                            collections_checked: ['martyrs'],
                            total_found: freshEdge.data.length
                        };
                    }
                }

                // Cold start or fallback when Edge API is unreachable: Fetch full collection from Firestore and populate IndexedDB
                console.log('🔍 Fetching martyrs from Firebase collections...');
                const result = await fetchApprovedMartyrsFromFirestore();
                console.log(`✅ Final result: ${result.data.length} martyrs total`);
                return result;

            } catch (error) {
                console.error('❌ Error getting martyrs from Firebase:', error);
                console.error('🔎 Detailed error info:', {
                    code: error.code,
                    message: error.message,
                    name: error.name,
                    stack: error.stack?.substring(0, 500)
                });

                return { 
                    success: false, 
                    error: error.message,
                    code: error.code,
                    details: error 
                };
            } finally {
                inFlightApprovedPromise = null;
            }
        })();

        if (!forceRefresh) {
            inFlightApprovedPromise = loaderPromise;
        }

        return loaderPromise;
    },

    // Fetch single full document (including submitter fields & photo) with D1/Edge fallback
    async getMartyrById(collectionName, docId) {
        try {
            if (collectionName !== 'martyrs' && collectionName !== 'pendingMartyrs') {
                throw new Error('Unsupported collection.');
            }
            if (!docId || typeof docId !== 'string') {
                throw new Error('Document ID is required.');
            }
            if (collectionName === 'pendingMartyrs') {
                await requireActiveAdminSession('getPendingMartyrById');
            } else {
                await ensureFirebaseAuthReady();
            }

            const isEdgeOnlyApproved = collectionName === 'martyrs' && docId.startsWith('edge_');
            const isD1OnlyPending = collectionName === 'pendingMartyrs' && docId.startsWith('d1p_');

            if (!isEdgeOnlyApproved && !isD1OnlyPending) {
                try {
                    const snap = await withTimeout(getDoc(doc(db, collectionName, docId)), 8000, 'Firestore single doc read');
                    if (snap.exists()) {
                        return { success: true, data: { id: snap.id, ...snap.data() } };
                    }
                } catch (fsErr) {
                    if (!isFirestoreQuotaOrUnavailableError(fsErr)) {
                        throw fsErr;
                    }
                }
            }

            if (collectionName === 'pendingMartyrs') {
                const d1Pending = await pendingApiFetch('/api/pending-submissions', { method: 'GET' }, true);
                if (d1Pending.ok && Array.isArray(d1Pending.data?.data)) {
                    const match = d1Pending.data.data.find(m => m && (m.id === docId || m.d1PendingId === docId || m.firestoreId === docId));
                    if (match) return { success: true, data: match, source: 'd1' };
                }
            } else {
                const cached = memoryCache || (await readMartyrsFromIDB()) || (await readMartyrsFromEdgeArchive(false));
                const match = Array.isArray(cached?.data) ? cached.data.find(m => m && m.id === docId) : null;
                if (match) return { success: true, data: match, source: 'edge' };
            }

            return { success: false, error: 'Profile document not found in Firestore or Edge D1.' };
        } catch (error) {
            console.error('❌ Error fetching martyr document:', error);
            return { success: false, error: error.message };
        }
    },

    // Admin approved martyrs list including submitter metadata (still excludes bulk Base64 photos)
    async getApprovedMartyrsForAdmin() {
        try {
            await requireActiveAdminSession('getApprovedMartyrsForAdmin');
            const adminRes = await fetchApprovedMartyrsFromFirestore(memoryCache?.data || null, {
                includeSubmitterFields: true,
                skipIDBWrite: true
            });
            if (adminRes && adminRes.success && Array.isArray(adminRes.data) && adminRes.data.length > 0) {
                return adminRes;
            }
            return await this.getApprovedMartyrs();
        } catch (error) {
            console.warn('⚠️ Admin metadata fetch fell back to standard list:', error.message);
            return await this.getApprovedMartyrs();
        }
    },

    // Update a pending martyr submission (Firestore + Cloudflare D1 sync/fallback)
    async updatePendingMartyr(martyrId, updatedData) {
        try {
            await requireActiveAdminSession('updatePendingMartyr');
            if (!martyrId || typeof martyrId !== 'string') {
                throw new Error('Valid pending submission ID is required.');
            }
            console.log(`✏️ Updating pending martyr: ${martyrId}`);
            const jsonUpdates = serializePendingForD1(sanitizeMartyrPayload(updatedData));
            const { processedData } = buildAdminMartyrUpdatePayload(updatedData, 'pending');
            stripInternalMetaFields(processedData);

            let fsUpdated = false;
            let fsErr = null;
            if (!martyrId.startsWith('d1p_')) {
                try {
                    await withTimeout(updateDoc(doc(db, 'pendingMartyrs', martyrId), processedData), 10000, 'Firestore pending update');
                    fsUpdated = true;
                } catch (err) {
                    fsErr = err;
                    if (!isFirestoreQuotaOrUnavailableError(err) && !String(err?.code || '').includes('not-found')) {
                        throw err;
                    }
                }
            }

            const d1Res = await pendingApiFetch('/api/pending-submissions', {
                method: 'PATCH',
                body: JSON.stringify({ id: martyrId, updates: jsonUpdates })
            }, true);

            if (!fsUpdated && !d1Res.ok) {
                throw new Error(d1Res.error || fsErr?.message || 'Failed to update pending submission.');
            }

            console.log(`✅ Pending martyr updated: ${martyrId}`);
            return { success: true, id: martyrId };
        } catch (error) {
            console.error('❌ Error updating pending martyr: ', error);
            return { success: false, error: error.message };
        }
    },

    // Get all pending martyrs (merges Firestore + Cloudflare D1 fallback queue seamlessly)
    async getPendingMartyrs() {
        try {
            await ensureFirebaseAuthReady();
            console.log('🔍 Fetching pending martyrs from Firebase + D1 Edge...');

            const [fsSettled, d1Settled] = await Promise.allSettled([
                withTimeout(getDocs(collection(db, 'pendingMartyrs')), 8000, 'Firestore pending fetch'),
                pendingApiFetch('/api/pending-submissions', { method: 'GET' }, true)
            ]);

            const fsOk = fsSettled.status === 'fulfilled';
            const d1Ok = d1Settled.status === 'fulfilled' && d1Settled.value?.ok && Array.isArray(d1Settled.value?.data?.data);

            const byId = new Map();
            if (fsOk) {
                fsSettled.value.forEach((docSnap) => {
                    byId.set(docSnap.id, {
                        ...docSnap.data(),
                        id: docSnap.id,
                        source: 'firestore'
                    });
                });
            }

            if (d1Ok) {
                for (const d1Item of d1Settled.value.data.data) {
                    if (!d1Item || typeof d1Item !== 'object') continue;
                    const canonicalId = d1Item.firestoreId || d1Item.id;
                    if (!canonicalId) continue;
                    if (byId.has(canonicalId)) {
                        const existing = byId.get(canonicalId);
                        if (!existing.photo && d1Item.photo) {
                            existing.photo = d1Item.photo;
                        }
                        existing.d1PendingId = d1Item.d1PendingId || d1Item.id;
                    } else {
                        byId.set(canonicalId, {
                            ...d1Item,
                            id: canonicalId
                        });
                    }
                }
            }

            if (!fsOk && !d1Ok) {
                const err = fsSettled.status === 'rejected'
                    ? fsSettled.reason
                    : new Error(d1Settled.value?.error || 'Unable to load pending submissions');
                throw err;
            }

            const pendingMartyrs = Array.from(byId.values());
            console.log(`✅ Found ${pendingMartyrs.length} pending martyrs (fsOk=${fsOk}, d1Ok=${d1Ok})`);
            return {
                success: true,
                data: pendingMartyrs,
                source: fsOk && d1Ok ? 'firestore+d1' : (fsOk ? 'firestore' : 'd1')
            };
        } catch (error) {
            console.error('❌ Error getting pending martyrs: ', error);
            return { success: false, error: error.message, details: error };
        }
    },

    // Approve pending martyr (atomic Firestore batch + R2 photo offload + D1 fallback & cleanup)
    async approveMartyr(martyrId, martyrData) {
        try {
            await requireActiveAdminSession('approveMartyr');
            const sanitizedMartyr = sanitizeMartyrPayload(martyrData);
            stripInternalMetaFields(sanitizedMartyr);

            if ('birthDate' in sanitizedMartyr) {
                sanitizedMartyr.birthDate = toFirestoreDateOrEmpty(sanitizedMartyr.birthDate);
            }
            if ('martyrdomDate' in sanitizedMartyr) {
                sanitizedMartyr.martyrdomDate = toFirestoreDateOrEmpty(sanitizedMartyr.martyrdomDate);
            }

            const inlinePhotoOriginal =
                typeof sanitizedMartyr.photo === 'string' && sanitizedMartyr.photo.startsWith('data:image/')
                    ? sanitizedMartyr.photo
                    : '';

            const approvedData = {
                ...sanitizedMartyr,
                status: 'approved',
                approvedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };

            if (approvedData.photoRemoved) {
                approvedData.photo = '';
                approvedData.photoPath = '';
                approvedData.photoHash = '';
                approvedData.photoShard = '';
                approvedData.hasPhoto = false;
                approvedData.photoUpdatedAt = serverTimestamp();
            } else if (inlinePhotoOriginal) {
                const r2Res = await uploadAdminPhotoToR2(inlinePhotoOriginal);
                if (r2Res.uploaded && r2Res.photoPath) {
                    approvedData.photoPath = r2Res.photoPath;
                    approvedData.photoHash = r2Res.photoHash;
                    approvedData.photoShard = r2Res.photoShard;
                    approvedData.photo = r2Res.photoPath;
                }
                approvedData.photoRemoved = false;
                approvedData.hasPhoto = true;
                approvedData.photoUpdatedAt = serverTimestamp();
            } else if (approvedData.photo || approvedData.photoPath) {
                approvedData.photoRemoved = false;
                approvedData.hasPhoto = true;
                approvedData.photoUpdatedAt = serverTimestamp();
            }

            const isD1OnlyPending = typeof martyrId === 'string' && martyrId.startsWith('d1p_');
            const newMartyrRef = doc(collection(db, 'martyrs'));
            const pendingRef = doc(db, 'pendingMartyrs', String(martyrId || ''));
            let finalApprovedId = newMartyrRef.id;
            let usedEdgeFallback = false;

            const writeToFirestore = async (payload) => {
                if (isD1OnlyPending) {
                    await withTimeout(setDoc(newMartyrRef, payload), 10000, 'Firestore approve setDoc');
                    return;
                }
                const batch = writeBatch(db);
                batch.set(newMartyrRef, payload);
                batch.delete(pendingRef);
                await withTimeout(batch.commit(), 10000, 'Firestore approve batch');
            };

            try {
                await writeToFirestore(approvedData);
            } catch (batchErr) {
                if (isRulePermissionDeniedError(batchErr) && ('photoPath' in approvedData || 'photoHash' in approvedData || 'photoShard' in approvedData)) {
                    const compatApproved = stripExtendedRuleFields(approvedData);
                    if (inlinePhotoOriginal) compatApproved.photo = inlinePhotoOriginal;
                    await writeToFirestore(compatApproved);
                } else if (isFirestoreQuotaOrUnavailableError(batchErr)) {
                    console.warn('⚠️ Firestore approve quota/network fallback -> publishing directly to Edge D1:', batchErr.code || batchErr.message);
                    finalApprovedId = generateEdgeFallbackId();
                    usedEdgeFallback = true;
                } else {
                    throw batchErr;
                }
            }

            const resolvedDisplayPhoto = approvedData.photoRemoved
                ? ''
                : (approvedData.photoPath || approvedData.photo || '');
            if (approvedData.photoRemoved) {
                photoMemoryCache.set(finalApprovedId, '');
            } else if (resolvedDisplayPhoto) {
                photoMemoryCache.set(finalApprovedId, resolvedDisplayPhoto);
            }

            const nowTs = Timestamp.now();
            const { submitterEmail, submitterPhone, submitterRelation, ...publicSanitized } = sanitizedMartyr;
            const newMartyrObj = {
                ...publicSanitized,
                ...(approvedData.photoPath ? { photoPath: approvedData.photoPath, photoHash: approvedData.photoHash, photoShard: approvedData.photoShard } : {}),
                photo: resolvedDisplayPhoto,
                photoRemoved: Boolean(approvedData.photoRemoved),
                hasPhoto: Boolean(approvedData.hasPhoto ?? !approvedData.photoRemoved),
                id: finalApprovedId,
                status: 'approved',
                approvedAt: nowTs,
                updatedAt: nowTs,
                ...(approvedData.photoUpdatedAt ? { photoUpdatedAt: nowTs } : {})
            };

            // Write-through to Cloudflare D1 + purge Edge Cache immediately
            const { photo: _omitInlineB64, ...edgeBase } = newMartyrObj;
            const edgeSyncRes = await pushEdgeSync('upsert', {
                martyr: {
                    ...edgeBase,
                    photoPath: approvedData.photoPath || '',
                    photoHash: approvedData.photoHash || '',
                    photoShard: approvedData.photoShard || ''
                }
            });

            if (usedEdgeFallback && !edgeSyncRes?.success) {
                throw new Error(edgeSyncRes?.error || 'Failed to publish profile to Cloudflare D1 while Firebase quota is exhausted.');
            }

            // Always remove approved item from D1 pending queue so it does not reappear in moderation
            if (martyrId) {
                const encodedId = encodeURIComponent(String(martyrId));
                await pendingApiFetch(`/api/pending-submissions?id=${encodedId}&firestoreId=${encodedId}`, {
                    method: 'DELETE'
                }, true).catch(() => {});
            }

            // Update local archive cache directly so the newly approved martyr appears immediately
            try {
                const existing = memoryCache || (await readMartyrsFromIDB()) || (await readMartyrsFromSeed());
                if (existing && Array.isArray(existing.data) && existing.data.length > 0) {
                    const merged = existing.data.filter(m => m && m.id !== finalApprovedId);
                    merged.push(newMartyrObj);
                    merged.sort((a, b) => {
                        const idA = String(a?.id || '');
                        const idB = String(b?.id || '');
                        return idA < idB ? -1 : (idA > idB ? 1 : 0);
                    });
                    const newRawSize = (existing.rawCollectionSize || existing.data.length) + 1;
                    await writeMartyrsToIDB(merged, newRawSize, false);
                    broadcastMartyrsUpdate(merged, 'admin-approve');
                } else {
                    await clearMartyrsCache();
                }
            } catch (_) {
                await clearMartyrsCache();
            }

            console.log('Martyr approved with ID: ', finalApprovedId);
            return {
                success: true,
                id: finalApprovedId,
                photoPath: approvedData.photoPath || '',
                source: usedEdgeFallback ? 'edge-d1' : 'firestore'
            };
        } catch (error) {
            console.error('Error approving martyr: ', error);
            return { success: false, error: error.message };
        }
    },

    // Reject pending martyr (delete from both Firestore & D1 pending queue)
    async rejectMartyr(martyrId) {
        try {
            await requireActiveAdminSession('rejectMartyr');
            let fsDeleted = false;
            let fsErr = null;
            if (martyrId && !String(martyrId).startsWith('d1p_')) {
                try {
                    await withTimeout(deleteDoc(doc(db, 'pendingMartyrs', String(martyrId))), 10000, 'Firestore reject delete');
                    fsDeleted = true;
                } catch (err) {
                    fsErr = err;
                    if (!isFirestoreQuotaOrUnavailableError(err) && !String(err?.code || '').includes('not-found')) {
                        throw err;
                    }
                }
            }

            const encodedId = encodeURIComponent(String(martyrId || ''));
            const d1Res = await pendingApiFetch(`/api/pending-submissions?id=${encodedId}&firestoreId=${encodedId}`, {
                method: 'DELETE'
            }, true);

            if (!fsDeleted && !d1Res.ok) {
                throw new Error(d1Res.error || fsErr?.message || 'Failed to reject pending submission.');
            }

            console.log('Martyr rejected and deleted: ', martyrId);
            return { success: true };
        } catch (error) {
            console.error('Error rejecting martyr: ', error);
            return { success: false, error: error.message };
        }
    },

    // Simple Firebase connectivity test
    async testConnection() {
        try {
            console.log('🧪 Testing basic Firebase connectivity...');
            
            if (!app || !db) {
                throw new Error('Firebase app or Firestore not initialized');
            }
            
            console.log('🔧 Firebase app config:', {
                projectId: app.options.projectId,
                authDomain: app.options.authDomain
            });
            
            // Try simple read first - just check if Firestore is accessible
            console.log('🔍 Testing Firestore read access...');
            const testCollection = collection(db, 'test');
            const querySnapshot = await getDocs(testCollection);
            
            console.log('✅ Firebase read test successful, docs found:', querySnapshot.size);
            return { success: true, message: 'Firebase read test successful' };
            
        } catch (error) {
            console.error('❌ Firebase connection test failed:', error);
            
            // Check if it's a CORS error
            const isCorsError = error.message.includes('CORS') || 
                               error.message.includes('cross-origin') ||
                               error.message.includes('access control') ||
                               error.code === 'unavailable';
            
            if (isCorsError) {
                console.error('🚨 CORS Error Detected: Firebase is being blocked by browser security policies');
                console.error('This usually happens when:');
                console.error('1. Domain not authorized in Firebase Console');
                console.error('2. Browser blocking cross-origin requests');
                console.error('3. Firebase project configuration issues');
            }
            
            console.error('🔍 Error details:', {
                code: error.code,
                message: error.message,
                name: error.name,
                isCorsError: isCorsError,
                stack: error.stack?.substring(0, 200)
            });
            
            return { 
                success: false, 
                error: isCorsError ? 'CORS/Domain authorization error' : error.message, 
                code: error.code,
                isCorsError: isCorsError,
                details: error 
            };
        }
    },
    
    // Update an approved martyr (admin function: optional R2 photo offload + write-through Edge sync)
    async updateApprovedMartyr(martyrId, updatedData) {
        try {
            await requireActiveAdminSession('updateApprovedMartyr');
            console.log(`✏️ Updating approved martyr: ${martyrId}`);

            const { processedData, photoChanged, isPhotoRemoved } = buildAdminMartyrUpdatePayload(updatedData);
            stripInternalMetaFields(processedData);
            const inlinePhotoOriginal =
                typeof processedData.photo === 'string' && processedData.photo.startsWith('data:image/')
                    ? processedData.photo
                    : '';

            if (!isPhotoRemoved && inlinePhotoOriginal) {
                const r2Res = await uploadAdminPhotoToR2(inlinePhotoOriginal);
                if (r2Res.uploaded && r2Res.photoPath) {
                    processedData.photoPath = r2Res.photoPath;
                    processedData.photoHash = r2Res.photoHash;
                    processedData.photoShard = r2Res.photoShard;
                    processedData.photo = r2Res.photoPath;
                }
            }

            // Update the Firestore document (with quota/Edge-ID fallback)
            const isEdgeOnlyId = String(martyrId || '').startsWith('edge_');
            let usedEdgeFallback = isEdgeOnlyId;
            if (!isEdgeOnlyId) {
                const martyrRef = doc(db, 'martyrs', martyrId);
                try {
                    await withTimeout(updateDoc(martyrRef, processedData), 10000, 'Firestore approved update');
                } catch (updateErr) {
                    if (isRulePermissionDeniedError(updateErr) && ('photoPath' in processedData || 'photoHash' in processedData || 'photoShard' in processedData)) {
                        const compatUpdate = stripExtendedRuleFields(processedData);
                        if (!isPhotoRemoved && inlinePhotoOriginal) compatUpdate.photo = inlinePhotoOriginal;
                        await withTimeout(updateDoc(martyrRef, compatUpdate), 10000, 'Firestore approved compat update');
                    } else if (isFirestoreQuotaOrUnavailableError(updateErr)) {
                        console.warn('⚠️ Firestore updateApprovedMartyr quota/network fallback -> updating Edge D1 directly:', updateErr.code || updateErr.message);
                        usedEdgeFallback = true;
                    } else {
                        throw updateErr;
                    }
                }
            }

            const resolvedDisplayPhoto = isPhotoRemoved
                ? ''
                : (processedData.photoPath || processedData.photo || '');
            if (photoChanged) {
                photoMemoryCache.set(martyrId, resolvedDisplayPhoto);
            }

            // Update local archive cache directly & write-through to Cloudflare D1
            let edgeUpdatedRecord = null;
            try {
                const existing = memoryCache || (await readMartyrsFromIDB()) || (await readMartyrsFromEdgeArchive(false)) || (await readMartyrsFromSeed());
                const nowTs = Timestamp.now();
                const { submitterEmail, submitterPhone, submitterRelation, ...cachePatch } = sanitizeMartyrPayload(updatedData);
                stripInternalMetaFields(cachePatch);
                if ('birthDate' in processedData) cachePatch.birthDate = processedData.birthDate;
                if ('martyrdomDate' in processedData) cachePatch.martyrdomDate = processedData.martyrdomDate;
                if (photoChanged) {
                    cachePatch.photoUpdatedAt = nowTs;
                    cachePatch.photoRemoved = isPhotoRemoved;
                    cachePatch.hasPhoto = !isPhotoRemoved;
                    if (isPhotoRemoved) {
                        cachePatch.photo = '';
                        cachePatch.photoPath = '';
                        cachePatch.photoHash = '';
                        cachePatch.photoShard = '';
                    } else if (processedData.photoPath) {
                        cachePatch.photo = processedData.photoPath;
                        cachePatch.photoPath = processedData.photoPath;
                        cachePatch.photoHash = processedData.photoHash || '';
                        cachePatch.photoShard = processedData.photoShard || '';
                    }
                }

                if (existing && Array.isArray(existing.data) && existing.data.length > 0) {
                    const merged = existing.data.map(m => {
                        if (m && m.id === martyrId) {
                            const updated = { ...m, ...cachePatch, id: martyrId, status: 'approved', updatedAt: nowTs };
                            edgeUpdatedRecord = updated;
                            return updated;
                        }
                        return m;
                    });
                    await writeMartyrsToIDB(merged, existing.rawCollectionSize || merged.length, false);
                    broadcastMartyrsUpdate(merged, 'admin-update');
                } else {
                    await clearMartyrsCache();
                }

                if (!edgeUpdatedRecord) {
                    edgeUpdatedRecord = { ...cachePatch, id: martyrId, status: 'approved', updatedAt: nowTs };
                }
            } catch (_) {
                await clearMartyrsCache();
            }

            let edgeSyncRes = null;
            if (edgeUpdatedRecord) {
                const { photo: _omitInlineB64, ...edgeBase } = edgeUpdatedRecord;
                edgeSyncRes = await pushEdgeSync('upsert', { martyr: edgeBase });
            } else {
                edgeSyncRes = await pushEdgeSync('reconcile_bulk', {});
            }

            if (usedEdgeFallback && !edgeSyncRes?.success) {
                throw new Error(edgeSyncRes?.error || 'Failed to persist edit to Cloudflare D1 while Firebase quota is exhausted.');
            }

            console.log(`✅ Approved martyr updated: ${martyrId}`);
            return { success: true, id: martyrId, photoPath: processedData.photoPath || '', source: usedEdgeFallback ? 'edge-d1' : 'firestore' };
        } catch (error) {
            console.error('❌ Error updating approved martyr: ', error);
            return { success: false, error: error.message };
        }
    },

    // Delete an approved martyr (row-level soft-delete tombstone with deleteDoc & D1 fallback)
    async deleteApprovedMartyr(martyrId) {
        try {
            await requireActiveAdminSession('deleteApprovedMartyr');
            if (!martyrId || typeof martyrId !== 'string') {
                throw new Error('Valid martyr ID is required for deletion.');
            }
            console.log(`🗑️ Soft-deleting (tombstone) approved martyr: ${martyrId}`);

            const isEdgeOnlyId = String(martyrId).startsWith('edge_');
            let usedEdgeFallback = isEdgeOnlyId;

            if (!isEdgeOnlyId) {
                const martyrRef = doc(db, 'martyrs', martyrId);
                const tombstonePatch = {
                    status: 'deleted',
                    deletedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    biography: '',
                    familyDetails: '',
                    photo: '',
                    photoPath: '',
                    photoHash: '',
                    photoShard: '',
                    photoRemoved: true,
                    hasPhoto: false,
                    submitterName: '',
                    submitterEmail: '',
                    submitterPhone: '',
                    submitterRelation: ''
                };

                try {
                    await withTimeout(updateDoc(martyrRef, tombstonePatch), 10000, 'Firestore tombstone update');
                } catch (tombErr) {
                    if (isRulePermissionDeniedError(tombErr)) {
                        await withTimeout(deleteDoc(martyrRef), 10000, 'Firestore hard delete');
                    } else if (isFirestoreQuotaOrUnavailableError(tombErr)) {
                        console.warn('⚠️ Firestore deleteApprovedMartyr quota/network fallback -> tombstoning Edge D1 directly:', tombErr.code || tombErr.message);
                        usedEdgeFallback = true;
                    } else {
                        throw tombErr;
                    }
                }
            }

            photoMemoryCache.set(martyrId, '');
            const edgeSyncRes = await pushEdgeSync('tombstone', { id: martyrId });
            if (usedEdgeFallback && !edgeSyncRes?.success) {
                throw new Error(edgeSyncRes?.error || 'Failed to tombstone profile in Cloudflare D1 while Firebase quota is exhausted.');
            }

            try {
                const existing = memoryCache || (await readMartyrsFromIDB()) || (await readMartyrsFromSeed());
                if (existing && Array.isArray(existing.data) && existing.data.length > 0) {
                    const merged = existing.data.filter(m => m && m.id !== martyrId);
                    const newRawSize = Math.max(merged.length, (existing.rawCollectionSize || existing.data.length) - 1);
                    await writeMartyrsToIDB(merged, newRawSize, false);
                    broadcastMartyrsUpdate(merged, 'admin-delete');
                } else {
                    await clearMartyrsCache();
                }
            } catch (_) {
                await clearMartyrsCache();
            }
            console.log(`✅ Approved martyr deleted: ${martyrId}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Error deleting approved martyr: ', error);
            return { success: false, error: error.message };
        }
    },
    
    // Clear all pending martyrs (Firestore + D1 pending queue)
    async clearAllPendingMartyrs() {
        try {
            await requireActiveAdminSession('clearAllPendingMartyrs');
            let fsCleared = 0;
            let fsOk = false;
            try {
                const pendingCollection = collection(db, 'pendingMartyrs');
                const querySnapshot = await withTimeout(getDocs(pendingCollection), 8000, 'Firestore clearPending list');
                const deletePromises = [];
                querySnapshot.forEach((docSnapshot) => {
                    deletePromises.push(deleteDoc(docSnapshot.ref));
                });
                await withTimeout(Promise.all(deletePromises), 12000, 'Firestore clearPending delete');
                fsCleared = deletePromises.length;
                fsOk = true;
            } catch (err) {
                if (!isFirestoreQuotaOrUnavailableError(err)) {
                    throw err;
                }
                console.warn('⚠️ Firestore clearAllPendingMartyrs quota fallback -> clearing D1 pending queue');
            }

            const d1Res = await pendingApiFetch('/api/pending-submissions?all=1', { method: 'DELETE' }, true);
            const d1Cleared = Number(d1Res?.data?.cleared || 0);
            if (!fsOk && !d1Res.ok) {
                throw new Error(d1Res.error || 'Failed to clear pending submissions.');
            }

            const totalCleared = Math.max(fsCleared, d1Cleared);
            console.log(`Cleared ${totalCleared} pending martyrs (fs=${fsCleared}, d1=${d1Cleared})`);
            return { success: true, deletedCount: totalCleared };
        } catch (error) {
            console.error('Error clearing all pending martyrs: ', error);
            return { success: false, error: error.message };
        }
    },
    
    // Clear all approved martyrs (PERMANENTLY LOCKED to prevent bulk archive destruction)
    async clearAllApprovedMartyrs() {
        console.error('🚫 Bulk deletion of the approved memorial archive is permanently disabled for security.');
        return {
            success: false,
            error: 'Bulk deletion of the approved memorial archive is permanently disabled for security.'
        };
    },
    
    // Initialize database with sample martyrs if empty (DISABLED to avoid auto-seeding)
    async initializeDatabaseIfEmpty() {
        try {
            console.log('🌱 Database auto-initialization is disabled to protect real martyr data.');
            const result = await this.getApprovedMartyrs();
            const existingCount = result && result.success && Array.isArray(result.data)
                ? result.data.length
                : 0;
            return { success: true, added: 0, existing: existingCount, disabled: true };
        } catch (error) {
            console.error('❌ Database initialization check failed:', error);
            return { success: false, error: error.message };
        }
    },

    // One-time cleanup helper: remove seeded "Memorial Committee / Historical Record" martyrs only
    async cleanupSeededHistoricalMartyrs() {
        try {
            await requireActiveAdminSession('cleanupSeededHistoricalMartyrs');
            console.log('🧹 Checking for seeded historical martyrs to clean up...');

            const martyrsCollection = collection(db, 'martyrs');
            // Narrow query by submitter name + relation; additional filtering by name is done in JS
            const q = query(
                martyrsCollection,
                where('submitterName', '==', 'Memorial Committee'),
                where('submitterRelation', '==', 'Historical Record')
            );

            const snapshot = await getDocs(q);
            const seededNames = new Set([
                'Shaheed Mir Balach Marri',
                'Shaheed Brahumdagh Bugti',
                'Shaheed Nawab Akbar Bugti',
                'Shaheed Balaach Marri'
            ]);

            const deletePromises = [];
            snapshot.forEach((docSnapshot) => {
                const data = docSnapshot.data();
                const fullName = data?.fullName || '';

                if (seededNames.has(fullName)) {
                    console.log(`🗑️ Deleting seeded historical martyr: ${fullName} (ID: ${docSnapshot.id})`);
                    deletePromises.push(deleteDoc(docSnapshot.ref));
                } else {
                    console.log(`ℹ️ Skipping non-seeded martyr: ${fullName} (ID: ${docSnapshot.id})`);
                }
            });

            if (deletePromises.length === 0) {
                console.log('✅ No seeded historical martyrs found that require cleanup');
                return { success: true, deletedCount: 0 };
            }

            await Promise.all(deletePromises);
            await clearMartyrsCache();
            console.log(`✅ Deleted ${deletePromises.length} seeded historical martyrs`);
            return { success: true, deletedCount: deletePromises.length };
        } catch (error) {
            console.error('❌ Error cleaning up seeded historical martyrs:', error);
            return { success: false, error: error.message };
        }
    },

    // Query live Cloudflare D1 + R2 shard readiness (used in Admin System panel)
    async getEdgeArchiveStatus() {
        const token = getAdminJwtToken();
        if (!token) {
            return { success: false, d1Bound: false, r2Bound: false, error: 'Missing admin session token' };
        }
        try {
            const resp = await fetch('/api/admin-edge-sync', {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                cache: 'no-store'
            });
            const data = await resp.json().catch(() => null);
            if (!resp.ok || !data) {
                return { success: false, d1Bound: false, r2Bound: false, error: data?.error || `HTTP ${resp.status}` };
            }
            return data;
        } catch (err) {
            return { success: false, d1Bound: false, r2Bound: false, error: err.message };
        }
    },

    // One-click full backfill & photo offload from Admin panel -> Cloudflare D1 + R2 Photo Shelf
    async syncAllToEdgeArchive(onProgress = null) {
        const notify = (info) => {
            if (typeof onProgress === 'function') {
                try { onProgress(info); } catch (_) {}
            }
        };
        try {
            await requireActiveAdminSession('syncAllToEdgeArchive');
            const statusBefore = await this.getEdgeArchiveStatus();
            if (!statusBefore.success) {
                return { success: false, error: statusBefore.error || 'Edge sync API unreachable.' };
            }

            notify({ stage: 'fetch', current: 0, total: 1, message: 'Fetching approved profiles from Firestore / Edge...' });
            let liveRes = null;
            try {
                liveRes = await fetchApprovedMartyrsFromFirestore(null, {
                    includeSubmitterFields: false,
                    skipIDBWrite: true
                });
            } catch (fsFetchErr) {
                console.warn('⚠️ Sync Edge Firestore read fell back to Edge/Cache:', fsFetchErr?.code || fsFetchErr?.message);
            }

            let records = Array.isArray(liveRes?.data) && liveRes.data.length > 0 ? liveRes.data : [];
            if (records.length === 0) {
                const fallbackRes = await this.getApprovedMartyrs({ forceRefresh: false });
                records = Array.isArray(fallbackRes?.data) ? fallbackRes.data : [];
            }

            if (records.length === 0) {
                return { success: false, error: 'No approved martyr profiles found to sync.' };
            }

            let r2Uploaded = 0;
            let r2Skipped = 0;
            let r2Failed = 0;

            if (statusBefore.r2Bound) {
                const candidates = records.filter((m) => (
                    m && m.id && !m.photoRemoved &&
                    (!m.photoPath || !String(m.photoPath).startsWith('/media/'))
                ));

                const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(String(reader.result || ''));
                    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
                    reader.readAsDataURL(blob);
                });

                const CONCURRENCY = 4;
                for (let idx = 0; idx < candidates.length; idx += CONCURRENCY) {
                    const slice = candidates.slice(idx, idx + CONCURRENCY);
                    await Promise.all(slice.map(async (m) => {
                        try {
                            let dataUri = '';
                            if (typeof m.photo === 'string' && m.photo.startsWith('data:image/')) {
                                dataUri = m.photo;
                            } else {
                                try {
                                    const assetResp = await fetch(`/assets/photos/${encodeURIComponent(m.id)}.jpg`, { cache: 'default' });
                                    if (assetResp.ok) {
                                        const ctype = (assetResp.headers.get('content-type') || '').toLowerCase();
                                        if (ctype.startsWith('image/')) {
                                            dataUri = await blobToDataUrl(await assetResp.blob());
                                        }
                                    }
                                } catch (_) {}
                                if (!dataUri) {
                                    const resolved = await resolveMartyrPhoto(m.id, null, null, { force: true });
                                    if (typeof resolved === 'string' && resolved.startsWith('data:image/')) {
                                        dataUri = resolved;
                                    }
                                }
                            }

                            if (!dataUri) {
                                r2Skipped++;
                                return;
                            }

                            const up = await uploadAdminPhotoToR2(dataUri);
                            if (up.uploaded && up.photoPath) {
                                m.photoPath = up.photoPath;
                                m.photoHash = up.photoHash;
                                m.photoShard = up.photoShard;
                                m.hasPhoto = true;
                                m.photo = up.photoPath;
                                photoMemoryCache.set(m.id, up.photoPath);
                                r2Uploaded++;
                                if (!String(m.id).startsWith('edge_')) {
                                    try {
                                        await updateDoc(doc(db, 'martyrs', m.id), {
                                            photoPath: up.photoPath,
                                            photoHash: up.photoHash,
                                            photoShard: up.photoShard,
                                            photo: up.photoPath,
                                            hasPhoto: true,
                                            updatedAt: serverTimestamp()
                                        });
                                    } catch (_) {
                                        // Keep going cleanly even if extended firestore.rules aren't pasted or quota is exhausted
                                    }
                                }
                            } else {
                                r2Failed++;
                            }
                        } catch (_) {
                            r2Failed++;
                        }
                    }));

                    const doneCount = Math.min(candidates.length, idx + CONCURRENCY);
                    notify({
                        stage: 'r2',
                        current: doneCount,
                        total: candidates.length,
                        message: `Uploading portraits to R2 Photo Shelf (${doneCount}/${candidates.length})...`
                    });
                }
            }

            let d1Written = 0;
            if (statusBefore.d1Bound) {
                const CHUNK = 150;
                for (let i = 0; i < records.length; i += CHUNK) {
                    const batch = records.slice(i, i + CHUNK).map((m) => {
                        const { photo, ...rest } = m;
                        return {
                            ...rest,
                            photoPath: m.photoPath || (typeof photo === 'string' && photo.startsWith('/media/') ? photo : ''),
                            photoHash: m.photoHash || '',
                            photoShard: m.photoShard || ''
                        };
                    });
                    const res = await pushEdgeSync('reconcile_bulk', { martyrs: batch });
                    if (res?.success) {
                        d1Written += Number(res.written || batch.length);
                    }
                    const done = Math.min(records.length, i + CHUNK);
                    notify({
                        stage: 'd1',
                        current: done,
                        total: records.length,
                        message: `Syncing records to Cloudflare D1 (${done}/${records.length})...`
                    });
                }
            } else {
                await pushEdgeSync('purge', {});
            }

            await pushEdgeSync('purge', {});
            await writeMartyrsToIDB(records, records.length, true);
            broadcastMartyrsUpdate(records, 'admin-edge-sync');
            const statusAfter = await this.getEdgeArchiveStatus();

            return {
                success: true,
                totalRecords: records.length,
                d1Bound: statusBefore.d1Bound,
                r2Bound: statusBefore.r2Bound,
                d1Written,
                r2Uploaded,
                r2Skipped,
                r2Failed,
                statusAfter
            };
        } catch (error) {
            console.error('❌ Edge archive sync failed:', error);
            return { success: false, error: error.message };
        }
    },

    signInAdmin: signInAdminFirebase,
    signOutAdmin: signOutAdminFirebase,
    async getFirebaseAuthAdmin() {
        const auth = await ensureFirebaseAuthReady();
        if (auth && auth.currentUser) {
            return {
                signedIn: true,
                email: auth.currentUser.email,
                uid: auth.currentUser.uid
            };
        }
        return { signedIn: false, email: null, uid: null };
    }
};

// Backward compatibility with localStorage (fallback)
export const storageHelper = {
    // Migrate existing localStorage data to Firebase
    async migrateFromLocalStorage() {
        try {
            // Migrate approved martyrs
            const existingMartyrs = localStorage.getItem('martyrsData');
            if (existingMartyrs) {
                const martyrsData = JSON.parse(existingMartyrs);
                const approvedMartyrs = martyrsData.filter(m => !m.status || m.status === 'approved');
                
                for (const martyr of approvedMartyrs) {
                    await addDoc(collection(db, 'martyrs'), {
                        ...martyr,
                        status: 'approved',
                        migratedAt: serverTimestamp()
                    });
                }
                
                console.log(`Migrated ${approvedMartyrs.length} approved martyrs`);
            }
            
            // Migrate pending martyrs
            const existingPending = localStorage.getItem('pendingMartyrs');
            if (existingPending) {
                const pendingData = JSON.parse(existingPending);
                
                for (const martyr of pendingData) {
                    await addDoc(collection(db, 'pendingMartyrs'), {
                        ...martyr,
                        status: 'pending',
                        migratedAt: serverTimestamp()
                    });
                }
                
                console.log(`Migrated ${pendingData.length} pending martyrs`);
            }
            
            return { success: true };
        } catch (error) {
            console.error('Migration error: ', error);
            return { success: false, error: error.message };
        }
    },

    // Fallback to localStorage if Firebase is not available
    getLocalMartyrs() {
        const savedMartyrs = localStorage.getItem('martyrsData');
        return savedMartyrs ? JSON.parse(savedMartyrs) : [];
    },

    getLocalPending() {
        const savedPending = localStorage.getItem('pendingMartyrs');
        return savedPending ? JSON.parse(savedPending) : [];
    }
};

export default app;

// Make firebaseDB available globally for easy access from other scripts
if (typeof window !== 'undefined') {
    window.firebaseDB = firebaseDB;
    window.firebaseApp = app;
    window.firebaseAvailable = true;
    
    // Log domain information for debugging
    console.log('✅ Firebase made available globally on window object');
    console.log('🌍 Current domain:', window.location.hostname);
    console.log('🔍 Available Firebase methods:', Object.keys(firebaseDB));
    
    // Verify domain is authorized
    const allowedDomains = [
        'baluchmartyrs.com',
        'www.baluchmartyrs.com',
        'baluchmartyrs.site',
        'www.baluchmartyrs.site', 
        'pages.dev',
        'localhost',
        '127.0.0.1',
        'benjaminbaluch.github.io'
    ];
    
    const currentDomain = window.location.hostname;
    const isDomainAllowed = allowedDomains.some(domain => 
        currentDomain === domain || currentDomain.endsWith(domain)
    );
    
    if (!isDomainAllowed) {
        console.warn(`⚠️ Domain ${currentDomain} may not be authorized for Firebase access`);
        console.log('🔒 Authorized domains:', allowedDomains);
    } else {
        console.log('✅ Domain authorized for Firebase access');
    }
}
