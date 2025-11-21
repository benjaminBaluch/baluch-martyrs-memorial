/**
 * Professional Static Asset Cache Refresh System
 * 
 * Refreshes website's static assets (CSS, JS, images) by appending timestamp-based
 * query strings to bypass browser cache. Includes secure cookie management and
 * comprehensive error handling for production environments.
 * 
 * @author Baluch Martyrs Memorial Development Team
 * @version 1.0.0
 * @license MIT
 */

class StaticAssetRefresh {
    constructor(options = {}) {
        this.options = {
            enableLogging: options.enableLogging !== false, // Default true
            cookiePrefix: options.cookiePrefix || 'bmm_refresh_',
            refreshInterval: options.refreshInterval || 30 * 60 * 1000, // 30 minutes
            maxRetries: options.maxRetries || 3,
            retryDelay: options.retryDelay || 1000,
            ...options
        };

        this.timestamp = Date.now();
        this.refreshCount = 0;
        this.errors = [];
        this.refreshedAssets = new Set();

        // Initialize secure cookie management
        this.initCookieManagement();
        
        if (this.options.enableLogging) {
            console.log('🔄 Static Asset Refresh System initialized');
        }
    }

    /**
     * Initialize secure cookie management with HttpOnly-like behavior for client-side
     */
    initCookieManagement() {
        try {
            // Set refresh timestamp cookie with security flags
            this.setSecureCookie('last_refresh', this.timestamp.toString(), 30);
            this.setSecureCookie('refresh_session', this.generateSessionId(), 30);
            
            if (this.options.enableLogging) {
                console.log('🍪 Secure cookie management initialized');
            }
        } catch (error) {
            this.logError('Cookie initialization failed', error);
        }
    }

    /**
     * Set secure cookie with proper security flags
     * @param {string} name - Cookie name
     * @param {string} value - Cookie value
     * @param {number} minutes - Expiry time in minutes
     */
    setSecureCookie(name, value, minutes = 30) {
        try {
            const expires = new Date();
            expires.setTime(expires.getTime() + (minutes * 60 * 1000));
            
            // Construct secure cookie string
            let cookieString = `${this.options.cookiePrefix}${name}=${encodeURIComponent(value)}`;
            cookieString += `;expires=${expires.toUTCString()}`;
            cookieString += `;path=/`;
            cookieString += `;SameSite=Strict`;
            
            // Add Secure flag if HTTPS (check protocol)
            if (location.protocol === 'https:') {
                cookieString += `;Secure`;
            }
            
            document.cookie = cookieString;
            
            if (this.options.enableLogging) {
                console.log(`🔐 Secure cookie set: ${name}`);
            }
        } catch (error) {
            this.logError(`Failed to set secure cookie: ${name}`, error);
        }
    }

    /**
     * Generate unique session ID for tracking
     */
    generateSessionId() {
        return 'session_' + Math.random().toString(36).substr(2, 9) + '_' + this.timestamp;
    }

    /**
     * Main function to refresh all static assets
     * @param {Object} options - Refresh options
     * @returns {Promise<Object>} - Refresh results
     */
    async refreshAllAssets(options = {}) {
        const startTime = performance.now();
        
        try {
            if (this.options.enableLogging) {
                console.log('🚀 Starting static asset refresh...');
            }

            // Update refresh timestamp
            this.timestamp = Date.now();
            this.refreshCount++;
            
            // Update tracking cookies
            this.setSecureCookie('refresh_count', this.refreshCount.toString(), 30);
            this.setSecureCookie('last_refresh', this.timestamp.toString(), 30);

            // Refresh different asset types
            const results = {
                css: await this.refreshCSS(options),
                javascript: await this.refreshJavaScript(options),
                images: await this.refreshImages(options),
                timestamp: this.timestamp,
                duration: 0,
                errors: [...this.errors]
            };

            results.duration = Math.round(performance.now() - startTime);
            
            if (this.options.enableLogging) {
                console.log(`✅ Asset refresh completed in ${results.duration}ms`);
                console.log('📊 Refresh results:', results);
            }

            return results;

        } catch (error) {
            this.logError('Asset refresh failed', error);
            throw error;
        }
    }

    /**
     * Refresh CSS stylesheets
     * @param {Object} options - CSS refresh options
     * @returns {Promise<Object>} - CSS refresh results
     */
    async refreshCSS(options = {}) {
        const results = { refreshed: 0, failed: 0, assets: [] };
        
        try {
            // Get all CSS links
            const cssLinks = document.querySelectorAll('link[rel="stylesheet"]');
            
            for (let link of cssLinks) {
                try {
                    const originalHref = this.getOriginalUrl(link.href);
                    const newHref = this.addCacheBuster(originalHref);
                    
                    // Create new link element
                    const newLink = document.createElement('link');
                    newLink.rel = 'stylesheet';
                    newLink.type = 'text/css';
                    newLink.href = newHref;
                    
                    // Wait for load with timeout
                    await this.waitForAssetLoad(newLink, 'CSS');
                    
                    // Replace old link with new one
                    link.parentNode.insertBefore(newLink, link.nextSibling);
                    link.remove();
                    
                    results.refreshed++;
                    results.assets.push({
                        type: 'CSS',
                        original: originalHref,
                        refreshed: newHref,
                        status: 'success'
                    });
                    
                    this.refreshedAssets.add(originalHref);
                    
                } catch (error) {
                    results.failed++;
                    results.assets.push({
                        type: 'CSS',
                        original: link.href,
                        status: 'failed',
                        error: error.message
                    });
                    this.logError(`CSS refresh failed for ${link.href}`, error);
                }
            }
            
        } catch (error) {
            this.logError('CSS refresh process failed', error);
        }
        
        return results;
    }

    /**
     * Refresh JavaScript files
     * @param {Object} options - JavaScript refresh options
     * @returns {Promise<Object>} - JavaScript refresh results
     */
    async refreshJavaScript(options = {}) {
        const results = { refreshed: 0, failed: 0, assets: [] };
        
        try {
            // Get all script tags with src
            const scripts = document.querySelectorAll('script[src]');
            
            for (let script of scripts) {
                try {
                    // Skip if it's a CDN or external script
                    if (this.isExternalUrl(script.src)) {
                        continue;
                    }
                    
                    const originalSrc = this.getOriginalUrl(script.src);
                    const newSrc = this.addCacheBuster(originalSrc);
                    
                    // Create new script element
                    const newScript = document.createElement('script');
                    newScript.type = script.type || 'text/javascript';
                    newScript.async = script.async;
                    newScript.defer = script.defer;
                    newScript.src = newSrc;
                    
                    // Copy other attributes
                    for (let attr of script.attributes) {
                        if (attr.name !== 'src') {
                            newScript.setAttribute(attr.name, attr.value);
                        }
                    }
                    
                    // Wait for load with timeout
                    await this.waitForAssetLoad(newScript, 'JavaScript');
                    
                    // Replace old script
                    script.parentNode.insertBefore(newScript, script.nextSibling);
                    script.remove();
                    
                    results.refreshed++;
                    results.assets.push({
                        type: 'JavaScript',
                        original: originalSrc,
                        refreshed: newSrc,
                        status: 'success'
                    });
                    
                    this.refreshedAssets.add(originalSrc);
                    
                } catch (error) {
                    results.failed++;
                    results.assets.push({
                        type: 'JavaScript',
                        original: script.src,
                        status: 'failed',
                        error: error.message
                    });
                    this.logError(`JavaScript refresh failed for ${script.src}`, error);
                }
            }
            
        } catch (error) {
            this.logError('JavaScript refresh process failed', error);
        }
        
        return results;
    }

    /**
     * Refresh images
     * @param {Object} options - Image refresh options
     * @returns {Promise<Object>} - Image refresh results
     */
    async refreshImages(options = {}) {
        const results = { refreshed: 0, failed: 0, assets: [] };
        
        try {
            // Get all images
            const images = document.querySelectorAll('img[src]');
            
            for (let img of images) {
                try {
                    // Skip external images unless specifically requested
                    if (this.isExternalUrl(img.src) && !options.includeExternal) {
                        continue;
                    }
                    
                    const originalSrc = this.getOriginalUrl(img.src);
                    const newSrc = this.addCacheBuster(originalSrc);
                    
                    // Create new image to preload
                    const newImg = new Image();
                    newImg.src = newSrc;
                    
                    // Wait for image to load
                    await this.waitForAssetLoad(newImg, 'Image');
                    
                    // Update original image source
                    img.src = newSrc;
                    
                    results.refreshed++;
                    results.assets.push({
                        type: 'Image',
                        original: originalSrc,
                        refreshed: newSrc,
                        status: 'success'
                    });
                    
                    this.refreshedAssets.add(originalSrc);
                    
                } catch (error) {
                    results.failed++;
                    results.assets.push({
                        type: 'Image',
                        original: img.src,
                        status: 'failed',
                        error: error.message
                    });
                    this.logError(`Image refresh failed for ${img.src}`, error);
                }
            }
            
            // Also refresh CSS background images if requested
            if (options.includeBackgroundImages) {
                await this.refreshBackgroundImages(results);
            }
            
        } catch (error) {
            this.logError('Image refresh process failed', error);
        }
        
        return results;
    }

    /**
     * Refresh CSS background images
     * @param {Object} results - Results object to update
     */
    async refreshBackgroundImages(results) {
        try {
            const elements = document.querySelectorAll('*');
            
            for (let element of elements) {
                try {
                    const computedStyle = window.getComputedStyle(element);
                    const backgroundImage = computedStyle.backgroundImage;
                    
                    if (backgroundImage && backgroundImage !== 'none') {
                        const urlMatch = backgroundImage.match(/url\(['"]?(.*?)['"]?\)/);
                        if (urlMatch && urlMatch[1]) {
                            const originalUrl = this.getOriginalUrl(urlMatch[1]);
                            const newUrl = this.addCacheBuster(originalUrl);
                            
                            element.style.backgroundImage = `url("${newUrl}")`;
                            
                            results.refreshed++;
                            results.assets.push({
                                type: 'Background Image',
                                original: originalUrl,
                                refreshed: newUrl,
                                status: 'success'
                            });
                        }
                    }
                } catch (error) {
                    // Skip elements that can't be processed
                }
            }
        } catch (error) {
            this.logError('Background image refresh failed', error);
        }
    }

    /**
     * Add cache-busting query string to URL
     * @param {string} url - Original URL
     * @returns {string} - URL with cache buster
     */
    addCacheBuster(url) {
        try {
            const separator = url.includes('?') ? '&' : '?';
            return `${url}${separator}v=${this.timestamp}`;
        } catch (error) {
            this.logError('Cache buster addition failed', error);
            return url;
        }
    }

    /**
     * Remove existing cache buster from URL
     * @param {string} url - URL with potential cache buster
     * @returns {string} - Clean URL
     */
    getOriginalUrl(url) {
        try {
            // Remove existing cache busters (v=timestamp or _=timestamp patterns)
            return url.replace(/[?&](?:v|_|t|cachebuster)=\d+/g, '')
                     .replace(/[?]$/, ''); // Remove trailing ? if no other params
        } catch (error) {
            this.logError('URL cleanup failed', error);
            return url;
        }
    }

    /**
     * Check if URL is external
     * @param {string} url - URL to check
     * @returns {boolean} - True if external
     */
    isExternalUrl(url) {
        try {
            const urlObj = new URL(url, window.location.origin);
            return urlObj.origin !== window.location.origin;
        } catch (error) {
            // If URL parsing fails, assume it's relative/internal
            return false;
        }
    }

    /**
     * Wait for asset to load with timeout
     * @param {HTMLElement} element - Asset element
     * @param {string} type - Asset type for logging
     * @param {number} timeout - Timeout in milliseconds
     * @returns {Promise} - Load promise
     */
    waitForAssetLoad(element, type, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`${type} load timeout`));
            }, timeout);

            const onLoad = () => {
                clearTimeout(timer);
                element.removeEventListener('load', onLoad);
                element.removeEventListener('error', onError);
                resolve();
            };

            const onError = (error) => {
                clearTimeout(timer);
                element.removeEventListener('load', onLoad);
                element.removeEventListener('error', onError);
                reject(new Error(`${type} load failed: ${error.message || 'Unknown error'}`));
            };

            element.addEventListener('load', onLoad);
            element.addEventListener('error', onError);

            // For script tags, also handle DOMContentLoaded
            if (element.tagName === 'SCRIPT') {
                document.addEventListener('DOMContentLoaded', onLoad, { once: true });
            }
        });
    }

    /**
     * Log error with consistent formatting
     * @param {string} message - Error message
     * @param {Error} error - Error object
     */
    logError(message, error) {
        const errorEntry = {
            message,
            error: error.message || error,
            timestamp: new Date().toISOString(),
            stack: error.stack
        };
        
        this.errors.push(errorEntry);
        
        if (this.options.enableLogging) {
            console.error(`❌ ${message}:`, error);
        }
    }

    /**
     * Get refresh statistics
     * @returns {Object} - Statistics object
     */
    getStatistics() {
        return {
            refreshCount: this.refreshCount,
            refreshedAssets: Array.from(this.refreshedAssets),
            totalErrors: this.errors.length,
            lastRefresh: this.timestamp,
            errors: this.errors.slice(-5) // Last 5 errors
        };
    }

    /**
     * Clean up resources and cookies
     */
    cleanup() {
        try {
            // Clear refresh-related cookies
            document.cookie = `${this.options.cookiePrefix}refresh_session=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/`;
            document.cookie = `${this.options.cookiePrefix}refresh_count=;expires=Thu, 01 Jan 1970 00:00:01 GMT;path=/`;
            
            if (this.options.enableLogging) {
                console.log('🧹 Asset refresh system cleaned up');
            }
        } catch (error) {
            this.logError('Cleanup failed', error);
        }
    }
}

/**
 * Global utility function for easy access
 * @param {Object} options - Refresh options
 * @returns {Promise<Object>} - Refresh results
 */
window.refreshStaticAssets = async function(options = {}) {
    try {
        const refresher = new StaticAssetRefresh(options);
        return await refresher.refreshAllAssets(options);
    } catch (error) {
        console.error('❌ Static asset refresh failed:', error);
        throw error;
    }
};

/**
 * Initialize automatic refresh system
 * @param {Object} options - Auto-refresh options
 */
window.initAutoRefresh = function(options = {}) {
    const refresher = new StaticAssetRefresh(options);
    
    // Set up interval-based refresh
    if (options.autoRefresh !== false) {
        setInterval(async () => {
            try {
                await refresher.refreshAllAssets(options);
            } catch (error) {
                console.warn('⚠️ Auto-refresh failed:', error);
            }
        }, refresher.options.refreshInterval);
    }
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        refresher.cleanup();
    });
    
    return refresher;
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StaticAssetRefresh };
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('✅ Static Asset Refresh System ready');
    });
} else {
    console.log('✅ Static Asset Refresh System ready');
}