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
    getDocs,
    getCountFromServer,
    doc, 
    updateDoc, 
    deleteDoc,
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
const IDB_CACHE_KEY = 'approved_martyrs_v3';
const LEGACY_IDB_CACHE_KEYS = ['approved_martyrs_v2', 'approved_martyrs_v1'];
const FULL_REVALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLOCK_SKEW_BUFFER_MS = 2 * 60 * 1000; // 2-minute safety window for delta queries
const MAX_INLINE_DELTA_PHOTOS = 12; // Cap inline Base64 photos kept in IDB cache

const PUBLIC_METADATA_FIELDS = [
    'id', 'fullName', 'fatherName', 'birthDate', 'birthPlace', 'martyrdomDate',
    'martyrdomPlace', 'biography', 'organization', 'rank', 'familyDetails',
    'submittedAt', 'approvedAt', 'updatedAt', 'status'
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

// On-demand single-martyr photo resolver for newly approved martyrs not yet in static /assets/photos/
export async function resolveMartyrPhoto(martyrId, imgElement = null, onNoPhotoFallback = null) {
    if (!martyrId || typeof martyrId !== 'string') {
        if (typeof onNoPhotoFallback === 'function') onNoPhotoFallback();
        return '';
    }

    if (photoMemoryCache.has(martyrId)) {
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

    let fetchPromise = photoFetchInFlight.get(martyrId);
    if (!fetchPromise) {
        fetchPromise = (async () => {
            try {
                const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/martyrs/${encodeURIComponent(martyrId)}?mask.fieldPaths=photo&key=${firebaseConfig.apiKey}`;
                const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
                if (!res.ok) {
                    photoMemoryCache.set(martyrId, '');
                    return '';
                }
                const docJson = await res.json();
                const photoStr = docJson?.fields?.photo?.stringValue || '';
                if (photoStr && photoStr.startsWith('data:image/')) {
                    photoMemoryCache.set(martyrId, photoStr);
                    // Also attach to in-memory martyr object if present
                    if (memoryCache && Array.isArray(memoryCache.data)) {
                        const found = memoryCache.data.find(m => m && m.id === martyrId);
                        if (found) found.photo = photoStr;
                    }
                    return photoStr;
                }
                photoMemoryCache.set(martyrId, '');
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
async function fetchApprovedMartyrsFromFirestore(existingMartyrsList = null) {
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
            for (const field of PUBLIC_METADATA_FIELDS) {
                params.append('mask.fieldPaths', field);
            }
            if (pageToken) {
                params.set('pageToken', pageToken);
            }

            const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/martyrs?${params}`;
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
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
                    const cachedPhoto = photoMemoryCache.get(docId) || existingPhotoById.get(docId);
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
        await writeMartyrsToIDB(allMartyrs, rawCollectionSize, true);
    }

    return {
        success: allMartyrs.length > 0,
        data: allMartyrs,
        source: 'firebase-lightweight-rest',
        collections_checked: ['martyrs'],
        total_found: allMartyrs.length
    };
}

// Phase 2: Background Delta Sync + Server Count Verification
// Checks Firebase for any newly approved, edited, or deleted profiles since cache was saved.
function syncWithFirebaseInBackground(cachedEntry) {
    if (backgroundSyncPromise) return backgroundSyncPromise;
    if (!cachedEntry || !Array.isArray(cachedEntry.data) || cachedEntry.data.length === 0) {
        return Promise.resolve(null);
    }

    backgroundSyncPromise = (async () => {
        try {
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
        familyDetails: [2000, true],
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

    if (typeof cleaned.photo === 'string' && cleaned.photo.trim() !== '') {
        const photo = cleaned.photo.trim();
        const isSafeDataUri = /^data:image\/(jpeg|jpg|png|gif|webp);base64,[A-Za-z0-9+/=\s]+$/i.test(photo);
        const isSafeAssetPath = /^\/assets\/photos\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(photo);
        const isSafeHttpsUrl = /^https:\/\//i.test(photo);
        if (!isSafeDataUri && !isSafeAssetPath && !isSafeHttpsUrl) {
            throw new Error('Invalid photo format. Only JPEG, PNG, GIF, or WebP images are allowed.');
        }
        if (photo.length > 7 * 1024 * 1024) {
            throw new Error('Photo data exceeds maximum allowed size (5 MB).');
        }
        cleaned.photo = photo;
    }

    return cleaned;
}

// Database helper functions
export const firebaseDB = {
    // Add new pending martyr
    async addPendingMartyr(martyrData) {
        try {
            // Sanitize and validate all fields before saving to Firestore
            const processedData = sanitizeMartyrPayload(martyrData);
            if (!processedData.fullName || processedData.fullName.length < 2) {
                throw new Error('Martyr full name is required.');
            }
            
            if (processedData.birthDate && typeof processedData.birthDate === 'string') {
                processedData.birthDate = Timestamp.fromDate(new Date(processedData.birthDate));
            }
            if (processedData.martyrdomDate && typeof processedData.martyrdomDate === 'string') {
                processedData.martyrdomDate = Timestamp.fromDate(new Date(processedData.martyrdomDate));
            }
            
            const docRef = await addDoc(collection(db, 'pendingMartyrs'), {
                ...processedData,
                status: 'pending',
                submittedAt: serverTimestamp(),
                id: Date.now().toString() // Temporary ID for backward compatibility
            });
            
            console.log('Pending martyr added with ID: ', docRef.id);
            return { success: true, id: docRef.id };
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

                    // If IndexedDB is empty (first-time visitor), fetch the fast instant seed archive (~100ms)
                    if (!cachedEntry || !Array.isArray(cachedEntry.data) || cachedEntry.data.length === 0) {
                        cachedEntry = await readMartyrsFromSeed();
                        if (cachedEntry && Array.isArray(cachedEntry.data) && cachedEntry.data.length > 0) {
                            console.log(`⚡ Instant Seed Archive hit: ${cachedEntry.data.length} martyrs loaded immediately`);
                            // Save to IndexedDB in background preserving the seed's actual watermarks so delta sync catches all new profiles since seed generation
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
                        console.log(`⚡ Instant Memorial Archive hit (${cachedEntry.fromSeed ? 'CDN Seed' : 'IndexedDB Cache'}): ${cachedEntry.data.length} martyrs loaded immediately`);

                        // Phase 2: Asynchronously verify & sync any additions, edits, or deletions with Firebase
                        syncWithFirebaseInBackground(cachedEntry);

                        return {
                            success: true,
                            data: cachedEntry.data,
                            source: cachedEntry.fromSeed ? 'seed-archive' : 'idb-cache',
                            collections_checked: ['martyrs', 'pendingMartyrs'],
                            total_found: cachedEntry.data.length
                        };
                    }
                }

                // Cold start or explicit forceRefresh: Fetch full collection from Firestore and populate IndexedDB
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

    // Get all pending martyrs (admin only) - simplified
    async getPendingMartyrs() {
        try {
            await ensureFirebaseAuthReady();
            console.log('🔍 Fetching pending martyrs from Firebase...');
            
            // Simple query without orderBy to avoid index issues
            const pendingCollection = collection(db, 'pendingMartyrs');
            const querySnapshot = await getDocs(pendingCollection);
            const pendingMartyrs = [];
            
            querySnapshot.forEach((doc) => {
                pendingMartyrs.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            console.log(`✅ Found ${pendingMartyrs.length} pending martyrs in Firebase`);
            return { success: true, data: pendingMartyrs };
        } catch (error) {
            console.error('❌ Error getting pending martyrs: ', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message
            });
            return { success: false, error: error.message, details: error };
        }
    },

    // Approve pending martyr (move to approved collection)
    async approveMartyr(martyrId, martyrData) {
        try {
            await requireActiveAdminSession('approveMartyr');
            const sanitizedMartyr = sanitizeMartyrPayload(martyrData);

            // Add to approved martyrs collection
            const approvedData = {
                ...sanitizedMartyr,
                status: 'approved',
                approvedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            delete approvedData.id; // Remove old ID field
            
            const docRef = await addDoc(collection(db, 'martyrs'), approvedData);
            
            // Delete from pending collection
            await deleteDoc(doc(db, 'pendingMartyrs', martyrId));
            
            // Update local archive cache directly so the newly approved martyr appears immediately without clearing the seed cache
            try {
                const existing = memoryCache || (await readMartyrsFromIDB()) || (await readMartyrsFromSeed());
                if (existing && Array.isArray(existing.data) && existing.data.length > 0) {
                    const nowTs = Timestamp.now();
                    const newMartyrObj = {
                        ...sanitizedMartyr,
                        id: docRef.id,
                        status: 'approved',
                        approvedAt: nowTs,
                        updatedAt: nowTs
                    };
                    const merged = existing.data.filter(m => m && m.id !== docRef.id);
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
            
            console.log('Martyr approved with ID: ', docRef.id);
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Error approving martyr: ', error);
            return { success: false, error: error.message };
        }
    },

    // Reject pending martyr (delete from pending)
    async rejectMartyr(martyrId) {
        try {
            await requireActiveAdminSession('rejectMartyr');
            await deleteDoc(doc(db, 'pendingMartyrs', martyrId));
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
    
    // Update an approved martyr (admin function)
    async updateApprovedMartyr(martyrId, updatedData) {
        try {
            await requireActiveAdminSession('updateApprovedMartyr');
            console.log(`✏️ Updating approved martyr: ${martyrId}`);
            
            // Process and sanitize fields
            const processedData = sanitizeMartyrPayload(updatedData);
            
            // Remove id field if present (shouldn't be updated)
            delete processedData.id;
            
            // Convert date strings to Timestamp objects
            if (processedData.birthDate && typeof processedData.birthDate === 'string') {
                processedData.birthDate = Timestamp.fromDate(new Date(processedData.birthDate));
            }
            if (processedData.martyrdomDate && typeof processedData.martyrdomDate === 'string') {
                processedData.martyrdomDate = Timestamp.fromDate(new Date(processedData.martyrdomDate));
            }
            
            // Add updatedAt timestamp
            processedData.updatedAt = serverTimestamp();
            
            // Update the document
            const martyrRef = doc(db, 'martyrs', martyrId);
            await updateDoc(martyrRef, processedData);
            
            // Update local archive cache directly so updated profile fields appear immediately
            try {
                const existing = memoryCache || (await readMartyrsFromIDB()) || (await readMartyrsFromSeed());
                if (existing && Array.isArray(existing.data) && existing.data.length > 0) {
                    const nowTs = Timestamp.now();
                    const merged = existing.data.map(m => {
                        if (m && m.id === martyrId) {
                            return { ...m, ...sanitizeMartyrPayload(updatedData), id: martyrId, updatedAt: nowTs };
                        }
                        return m;
                    });
                    await writeMartyrsToIDB(merged, existing.rawCollectionSize || merged.length, false);
                    broadcastMartyrsUpdate(merged, 'admin-update');
                } else {
                    await clearMartyrsCache();
                }
            } catch (_) {
                await clearMartyrsCache();
            }
            
            console.log(`✅ Approved martyr updated: ${martyrId}`);
            return { success: true, id: martyrId };
        } catch (error) {
            console.error('❌ Error updating approved martyr: ', error);
            return { success: false, error: error.message };
        }
    },

    // Delete an approved martyr (admin function)
    async deleteApprovedMartyr(martyrId) {
        try {
            await requireActiveAdminSession('deleteApprovedMartyr');
            if (!martyrId || typeof martyrId !== 'string') {
                throw new Error('Valid martyr ID is required for deletion.');
            }
            console.log(`🗑️ Deleting approved martyr: ${martyrId}`);
            await deleteDoc(doc(db, 'martyrs', martyrId));
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
    
    // Clear all pending martyrs (admin function)
    async clearAllPendingMartyrs() {
        try {
            await requireActiveAdminSession('clearAllPendingMartyrs');
            const pendingCollection = collection(db, 'pendingMartyrs');
            const querySnapshot = await getDocs(pendingCollection);
            
            const deletePromises = [];
            querySnapshot.forEach((docSnapshot) => {
                deletePromises.push(deleteDoc(docSnapshot.ref));
            });
            
            await Promise.all(deletePromises);
            console.log(`Cleared ${deletePromises.length} pending martyrs from Firebase`);
            return { success: true, deletedCount: deletePromises.length };
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
