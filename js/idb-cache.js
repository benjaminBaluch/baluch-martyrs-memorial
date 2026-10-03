// IndexedDB Cache for Baluch Martyrs Memorial
// Bypasses the 5MB browser localStorage limit to store all martyrs locally (30ms instant load).

(function(global) {
    'use strict';

    const IDB_NAME = 'bmm_martyrs_db';
    const IDB_STORE = 'martyrs_store';
    const IDB_KEY = 'all_approved_martyrs';
    const IDB_VERSION = 1;
    const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

    let _dbPromise = null;

    function _open() {
        if (_dbPromise) return _dbPromise;
        _dbPromise = new Promise((resolve) => {
            if (typeof window === 'undefined' || !('indexedDB' in window)) {
                resolve(null);
                return;
            }
            try {
                const request = indexedDB.open(IDB_NAME, IDB_VERSION);
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(IDB_STORE)) {
                        db.createObjectStore(IDB_STORE);
                    }
                };
                request.onsuccess = () => resolve(request.result);
                request.onerror = (e) => {
                    console.warn('⚠️ IndexedDB open error, falling back:', e);
                    resolve(null);
                };
            } catch (err) {
                console.warn('⚠️ IndexedDB init failed:', err);
                resolve(null);
            }
        });
        return _dbPromise;
    }

    const idbCache = {
        async get() {
            try {
                const db = await _open();
                if (!db) return null;
                return new Promise((resolve) => {
                    try {
                        const tx = db.transaction(IDB_STORE, 'readonly');
                        const store = tx.objectStore(IDB_STORE);
                        const req = store.get(IDB_KEY);
                        req.onsuccess = () => {
                            const entry = req.result;
                            if (entry && Array.isArray(entry.data) && entry.data.length > 0) {
                                const age = Date.now() - (entry.ts || 0);
                                const isStale = age > CACHE_TTL_MS;
                                resolve({ data: entry.data, isStale, age });
                            } else {
                                resolve(null);
                            }
                        };
                        req.onerror = () => resolve(null);
                    } catch (e) {
                        resolve(null);
                    }
                });
            } catch (e) {
                return null;
            }
        },

        async set(data) {
            if (!Array.isArray(data) || data.length === 0) return;
            try {
                const db = await _open();
                if (!db) return;
                return new Promise((resolve) => {
                    try {
                        const tx = db.transaction(IDB_STORE, 'readwrite');
                        const store = tx.objectStore(IDB_STORE);
                        const req = store.put({ data, ts: Date.now() }, IDB_KEY);
                        req.onsuccess = () => resolve(true);
                        req.onerror = () => resolve(false);
                    } catch (e) {
                        resolve(false);
                    }
                });
            } catch (e) {
                console.warn('⚠️ Failed to write to IndexedDB:', e);
            }
        },

        async clear() {
            try {
                const db = await _open();
                if (!db) return;
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).delete(IDB_KEY);
            } catch (e) {}
        }
    };

    global.idbCache = idbCache;

    // Support ES module import if needed
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { idbCache };
    }
})(typeof window !== 'undefined' ? window : globalThis);
