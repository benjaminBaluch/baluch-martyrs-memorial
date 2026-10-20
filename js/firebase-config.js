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
    try {
        db = initializeFirestore(app, {
            localCache: persistentLocalCache({
                tabManager: persistentMultipleTabManager()
            })
        });
        console.log('✅ Firestore initialized with persistent IndexedDB localCache');
    } catch (cacheInitError) {
        console.warn('⚠️ Falling back to standard getFirestore:', cacheInitError.message);
        db = getFirestore(app);
    }
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
// HIGH-CAPACITY INDEXEDDB ARCHIVE CACHE + LIVE FIREBASE DELTA SYNC
// Stores all 1,305+ martyr profiles (including Base64 portraits, ~82 MB)
// in browser IndexedDB (which supports 500+ MB, unlike 5 MB localStorage)
// and synchronizes additions, edits, and deletions with Firebase in the background.
// ============================================================================

const IDB_DB_NAME = 'bmm_memorial_archive_db';
const IDB_STORE_NAME = 'martyrs_cache';
const IDB_CACHE_KEY = 'approved_martyrs_v1';
const FULL_REVALIDATE_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLOCK_SKEW_BUFFER_MS = 2 * 60 * 1000; // 2-minute safety window for delta queries

let memoryCache = null; // { data, rawCollectionSize, maxApprovedMs, maxUpdatedMs, syncedAt, fullSyncAt }
let inFlightApprovedPromise = null;
let backgroundSyncPromise = null;

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

async function writeMartyrsToIDB(martyrs, rawCollectionSize, isFullSync = false) {
    try {
        if (!Array.isArray(martyrs) || martyrs.length === 0) return;
        const now = Date.now();
        const { maxApprovedMs, maxUpdatedMs } = computeWatermarks(martyrs, now);
        const fullSyncAt = isFullSync ? now : (memoryCache?.fullSyncAt || now);

        memoryCache = {
            data: martyrs,
            rawCollectionSize: typeof rawCollectionSize === 'number' ? rawCollectionSize : martyrs.length,
            maxApprovedMs: Math.max(maxApprovedMs, now),
            maxUpdatedMs: Math.max(maxUpdatedMs, now),
            syncedAt: now,
            fullSyncAt
        };

        if (typeof window !== 'undefined') {
            window.allApprovedMartyrs = martyrs;
            window.martyrsDataFromFirebase = martyrs;
        }

        const serializedData = martyrs.map(serializeFieldForIDB);
        const database = await openArchiveIDB();
        await new Promise((resolve, reject) => {
            const tx = database.transaction(IDB_STORE_NAME, 'readwrite');
            const store = tx.objectStore(IDB_STORE_NAME);
            store.put({
                data: serializedData,
                rawCollectionSize: memoryCache.rawCollectionSize,
                maxApprovedMs: memoryCache.maxApprovedMs,
                maxUpdatedMs: memoryCache.maxUpdatedMs,
                syncedAt: now,
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
            tx.objectStore(IDB_STORE_NAME).delete(IDB_CACHE_KEY);
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

// Authoritative full collection fetch from Firestore
async function fetchApprovedMartyrsFromFirestore() {
    let allMartyrs = [];
    let rawCollectionSize = 0;

    // Check main 'martyrs' collection first
    try {
        console.log('🔍 Checking main martyrs collection...');
        const martyrsCollection = collection(db, 'martyrs');
        const martyrsSnapshot = await getDocs(martyrsCollection);
        rawCollectionSize = martyrsSnapshot.size;

        martyrsSnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (!data.status || data.status === 'approved') {
                allMartyrs.push({
                    id: docSnap.id,
                    ...data,
                    status: data.status || 'approved'
                });
            }
        });

        console.log(`📋 Found ${martyrsSnapshot.size} total docs in martyrs collection, ${allMartyrs.length} approved`);
    } catch (error) {
        console.warn('⚠️ Error accessing martyrs collection:', error.message);
    }

    // If no martyrs found, check pendingMartyrs collection for any approved ones
    if (allMartyrs.length === 0) {
        try {
            console.log('🔍 Checking pendingMartyrs collection for approved items...');
            const pendingCollection = collection(db, 'pendingMartyrs');
            const pendingSnapshot = await getDocs(pendingCollection);

            pendingSnapshot.forEach((docSnap) => {
                const data = docSnap.data();
                if (data.status === 'approved') {
                    allMartyrs.push({
                        id: docSnap.id,
                        ...data
                    });
                }
            });

            console.log(`📋 Found ${pendingSnapshot.size} pending docs, ${allMartyrs.length} approved from pending`);
        } catch (error) {
            console.warn('⚠️ Error accessing pendingMartyrs collection:', error.message);
        }
    }

    // If still no martyrs, check if collections exist and are accessible
    if (allMartyrs.length === 0) {
        console.log('📊 No martyrs found. Checking Firebase connectivity and permissions...');
        try {
            const testCollection = collection(db, 'test');
            await getDocs(testCollection);
            console.log('✅ Firestore read access confirmed - collections may be empty');
        } catch (testError) {
            console.error('❌ Firestore read access failed:', testError);
            throw new Error(`Firebase access denied: ${testError.message}`);
        }
    }

    if (allMartyrs.length > 0) {
        await writeMartyrsToIDB(allMartyrs, rawCollectionSize, true);
    }

    return {
        success: true,
        data: allMartyrs,
        source: 'firebase',
        collections_checked: ['martyrs', 'pendingMartyrs'],
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
            // If full collection hasn't been revalidated in >24 hours, run full sync in background
            if (now - (cachedEntry.fullSyncAt || cachedEntry.syncedAt || 0) > FULL_REVALIDATE_INTERVAL_MS) {
                const fullRes = await fetchApprovedMartyrsFromFirestore();
                if (fullRes.success && fullRes.data.length > 0) {
                    broadcastMartyrsUpdate(fullRes.data, 'firebase-full-revalidate');
                }
                return fullRes;
            }

            const baseWatermarkMs = Math.max(1700000000000, (cachedEntry.syncedAt || now) - CLOCK_SKEW_BUFFER_MS);
            const sinceApprovedMs = Math.max(1700000000000, (cachedEntry.maxApprovedMs || baseWatermarkMs) - CLOCK_SKEW_BUFFER_MS);
            const sinceUpdatedMs = Math.max(1700000000000, (cachedEntry.maxUpdatedMs || baseWatermarkMs) - CLOCK_SKEW_BUFFER_MS);

            const martyrsCol = collection(db, 'martyrs');
            const approvedDeltaQuery = query(martyrsCol, where('approvedAt', '>', Timestamp.fromMillis(sinceApprovedMs)));
            const updatedDeltaQuery = query(martyrsCol, where('updatedAt', '>', Timestamp.fromMillis(sinceUpdatedMs)));

            const [countResult, approvedSnap, updatedSnap] = await Promise.all([
                getCountFromServer(martyrsCol).catch(() => null),
                getDocs(approvedDeltaQuery).catch(() => null),
                getDocs(updatedDeltaQuery).catch(() => null)
            ]);

            const serverTotalDocs = countResult && countResult.data ? countResult.data().count : null;
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

            const expectedCollectionSize = (cachedEntry.rawCollectionSize || cachedEntry.data.length) + addedCount;

            // If server document count differs from expected (e.g. a deletion occurred or console addition without Timestamp),
            // perform a full Firestore fetch so cache and UI stay 100% accurate.
            if (serverTotalDocs !== null && serverTotalDocs !== expectedCollectionSize) {
                console.log(`🔄 Archive count changed on server (${expectedCollectionSize} → ${serverTotalDocs}); running full sync...`);
                const fullRes = await fetchApprovedMartyrsFromFirestore();
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

// Database helper functions
export const firebaseDB = {
    // Add new pending martyr
    async addPendingMartyr(martyrData) {
        try {
            // Convert date strings to Timestamp objects for Firestore
            const processedData = { ...martyrData };
            
            if (processedData.birthDate) {
                processedData.birthDate = Timestamp.fromDate(new Date(processedData.birthDate));
            }
            if (processedData.martyrdomDate) {
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
                    const cachedEntry = await readMartyrsFromIDB();
                    if (cachedEntry && Array.isArray(cachedEntry.data) && cachedEntry.data.length > 0) {
                        memoryCache = cachedEntry;
                        if (typeof window !== 'undefined') {
                            window.allApprovedMartyrs = cachedEntry.data;
                            window.martyrsDataFromFirebase = cachedEntry.data;
                        }
                        console.log(`⚡ Instant IndexedDB Archive Cache hit: ${cachedEntry.data.length} martyrs loaded immediately`);

                        // Phase 2: Asynchronously verify & sync any additions, edits, or deletions with Firebase
                        syncWithFirebaseInBackground(cachedEntry);

                        return {
                            success: true,
                            data: cachedEntry.data,
                            source: 'idb-cache',
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
            // Add to approved martyrs collection
            const approvedData = {
                ...martyrData,
                status: 'approved',
                approvedAt: serverTimestamp()
            };
            delete approvedData.id; // Remove old ID field
            
            const docRef = await addDoc(collection(db, 'martyrs'), approvedData);
            
            // Delete from pending collection
            await deleteDoc(doc(db, 'pendingMartyrs', martyrId));
            
            // Invalidate local archive cache so the newly approved martyr is fetched immediately
            await clearMartyrsCache();
            
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
            console.log(`✏️ Updating approved martyr: ${martyrId}`);
            
            // Process date fields to convert to Timestamps
            const processedData = { ...updatedData };
            
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
            
            // Invalidate local archive cache so updated profile fields appear immediately
            await clearMartyrsCache();
            
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
            console.log(`🗑️ Deleting approved martyr: ${martyrId}`);
            await deleteDoc(doc(db, 'martyrs', martyrId));
            await clearMartyrsCache();
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
    
    // Clear all approved martyrs (admin function - use with caution!)
    async clearAllApprovedMartyrs() {
        try {
            console.log('🧹 Clearing all approved martyrs...');
            const martyrsCollection = collection(db, 'martyrs');
            const querySnapshot = await getDocs(martyrsCollection);
            
            const deletePromises = [];
            querySnapshot.forEach((docSnapshot) => {
                deletePromises.push(deleteDoc(docSnapshot.ref));
            });
            
            await Promise.all(deletePromises);
            await clearMartyrsCache();
            console.log(`✅ Cleared ${deletePromises.length} approved martyrs from Firebase`);
            return { success: true, deletedCount: deletePromises.length };
        } catch (error) {
            console.error('❌ Error clearing all approved martyrs: ', error);
            return { success: false, error: error.message };
        }
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
