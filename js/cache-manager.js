// Cache and Cookie Management System
// Handles localStorage, sessionStorage, and cookies with expiration and versioning

class CacheManager {
    constructor() {
        this.version = '1.0.0';
        this.cachePrefix = 'bmm_'; // Baluch Martyrs Memorial prefix
        this.defaultExpirationHours = 24;
        
        // Initialize and clean expired data on load
        this.init();
    }
    
    init() {
        console.log('🗃️ Initializing Cache Manager v' + this.version);
        this.cleanExpiredData();
        this.checkCacheVersion();
    }
    
    // Set data with expiration
    setCache(key, data, expirationHours = this.defaultExpirationHours) {
        try {
            const now = new Date().getTime();
            const expiration = now + (expirationHours * 60 * 60 * 1000);
            
            const cacheItem = {
                data: data,
                expiration: expiration,
                version: this.version,
                timestamp: now
            };
            
            localStorage.setItem(this.cachePrefix + key, JSON.stringify(cacheItem));
            console.log(`💾 Cached "${key}" for ${expirationHours} hours`);
            return true;
        } catch (error) {
            console.error('❌ Error setting cache:', error);
            return false;
        }
    }
    
    // Get data from cache with expiration check
    getCache(key) {
        try {
            const item = localStorage.getItem(this.cachePrefix + key);
            if (!item) return null;
            
            const cacheItem = JSON.parse(item);
            const now = new Date().getTime();
            
            // Check if expired
            if (now > cacheItem.expiration) {
                console.log(`🗑️ Cache expired for "${key}", removing...`);
                this.removeCache(key);
                return null;
            }
            
            // Check version compatibility
            if (cacheItem.version !== this.version) {
                console.log(`🔄 Cache version mismatch for "${key}", removing...`);
                this.removeCache(key);
                return null;
            }
            
            console.log(`📦 Retrieved cached "${key}"`);
            return cacheItem.data;
        } catch (error) {
            console.error('❌ Error getting cache:', error);
            return null;
        }
    }
    
    // Remove specific cache item
    removeCache(key) {
        try {
            localStorage.removeItem(this.cachePrefix + key);
            console.log(`🗑️ Removed cache for "${key}"`);
        } catch (error) {
            console.error('❌ Error removing cache:', error);
        }
    }
    
    // Clean all expired cache items
    cleanExpiredData() {
        try {
            const now = new Date().getTime();
            const keysToRemove = [];
            
            // Check all localStorage keys with our prefix
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.cachePrefix)) {
                    try {
                        const item = JSON.parse(localStorage.getItem(key));
                        if (item.expiration && now > item.expiration) {
                            keysToRemove.push(key);
                        }
                    } catch (e) {
                        // Invalid JSON, mark for removal
                        keysToRemove.push(key);
                    }
                }
            }
            
            // Remove expired items
            keysToRemove.forEach(key => {
                localStorage.removeItem(key);
                console.log(`🧹 Cleaned expired cache: ${key}`);
            });
            
            if (keysToRemove.length > 0) {
                console.log(`✅ Cleaned ${keysToRemove.length} expired cache items`);
            }
        } catch (error) {
            console.error('❌ Error cleaning expired data:', error);
        }
    }
    
    // Check and update cache version
    checkCacheVersion() {
        const versionKey = this.cachePrefix + 'version';
        const storedVersion = localStorage.getItem(versionKey);
        
        if (storedVersion !== this.version) {
            console.log(`🔄 Cache version updated from ${storedVersion || 'none'} to ${this.version}`);
            this.clearAllCache();
            localStorage.setItem(versionKey, this.version);
        }
    }
    
    // Clear all cached data (version upgrade)
    clearAllCache() {
        try {
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(this.cachePrefix)) {
                    keysToRemove.push(key);
                }
            }
            
            keysToRemove.forEach(key => localStorage.removeItem(key));
            console.log(`🧹 Cleared ${keysToRemove.length} cache items for version update`);
        } catch (error) {
            console.error('❌ Error clearing cache:', error);
        }
    }
    
    // Get cache statistics
    getCacheStats() {
        let totalItems = 0;
        let totalSize = 0;
        let expiredItems = 0;
        const now = new Date().getTime();
        
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.cachePrefix)) {
                totalItems++;
                const value = localStorage.getItem(key);
                totalSize += value.length;
                
                try {
                    const item = JSON.parse(value);
                    if (item.expiration && now > item.expiration) {
                        expiredItems++;
                    }
                } catch (e) {
                    expiredItems++;
                }
            }
        }
        
        return {
            totalItems,
            totalSizeKB: Math.round(totalSize / 1024),
            expiredItems,
            version: this.version
        };
    }
    
    // Session-based cache (clears when browser closes)
    setSessionCache(key, data) {
        try {
            const cacheItem = {
                data: data,
                version: this.version,
                timestamp: new Date().getTime()
            };
            sessionStorage.setItem(this.cachePrefix + key, JSON.stringify(cacheItem));
            return true;
        } catch (error) {
            console.error('❌ Error setting session cache:', error);
            return false;
        }
    }
    
    // Get session cache
    getSessionCache(key) {
        try {
            const item = sessionStorage.getItem(this.cachePrefix + key);
            if (!item) return null;
            
            const cacheItem = JSON.parse(item);
            if (cacheItem.version !== this.version) {
                this.removeSessionCache(key);
                return null;
            }
            
            return cacheItem.data;
        } catch (error) {
            console.error('❌ Error getting session cache:', error);
            return null;
        }
    }
    
    // Remove session cache
    removeSessionCache(key) {
        try {
            sessionStorage.removeItem(this.cachePrefix + key);
        } catch (error) {
            console.error('❌ Error removing session cache:', error);
        }
    }
}

// Cookie utilities
class CookieManager {
    constructor() {
        this.cookiePrefix = 'bmm_';
    }
    
    // Set cookie with expiration
    setCookie(name, value, days = 30) {
        try {
            const expires = new Date();
            expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
            
            document.cookie = `${this.cookiePrefix}${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
            console.log(`🍪 Set cookie "${name}" for ${days} days`);
            return true;
        } catch (error) {
            console.error('❌ Error setting cookie:', error);
            return false;
        }
    }
    
    // Get cookie value
    getCookie(name) {
        try {
            const nameEQ = `${this.cookiePrefix}${name}=`;
            const cookies = document.cookie.split(';');
            
            for (let cookie of cookies) {
                let c = cookie.trim();
                if (c.indexOf(nameEQ) === 0) {
                    return decodeURIComponent(c.substring(nameEQ.length));
                }
            }
            return null;
        } catch (error) {
            console.error('❌ Error getting cookie:', error);
            return null;
        }
    }
    
    // Remove cookie
    removeCookie(name) {
        try {
            document.cookie = `${this.cookiePrefix}${name}=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/`;
            console.log(`🗑️ Removed cookie "${name}"`);
        } catch (error) {
            console.error('❌ Error removing cookie:', error);
        }
    }
    
    // Get all cookies with our prefix
    getAllCookies() {
        const cookies = {};
        try {
            const allCookies = document.cookie.split(';');
            
            for (let cookie of allCookies) {
                const c = cookie.trim();
                if (c.startsWith(this.cookiePrefix)) {
                    const [name, value] = c.split('=');
                    const cleanName = name.replace(this.cookiePrefix, '');
                    cookies[cleanName] = decodeURIComponent(value || '');
                }
            }
        } catch (error) {
            console.error('❌ Error getting all cookies:', error);
        }
        return cookies;
    }
    
    // Clear all cookies with our prefix
    clearAllCookies() {
        try {
            const cookies = this.getAllCookies();
            Object.keys(cookies).forEach(name => {
                this.removeCookie(name);
            });
            console.log(`🧹 Cleared ${Object.keys(cookies).length} cookies`);
        } catch (error) {
            console.error('❌ Error clearing cookies:', error);
        }
    }
}

// Initialize global instances
window.cacheManager = new CacheManager();
window.cookieManager = new CookieManager();

// Export for module use
export { CacheManager, CookieManager };

// Auto-cleanup on page unload
window.addEventListener('beforeunload', () => {
    window.cacheManager.cleanExpiredData();
});

// Periodic cleanup every 30 minutes
setInterval(() => {
    window.cacheManager.cleanExpiredData();
}, 30 * 60 * 1000);

console.log('✅ Cache and Cookie Management System initialized');