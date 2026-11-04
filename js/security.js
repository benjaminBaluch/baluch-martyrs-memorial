// Security Module for Baluch Martyrs Memorial
// Provides input sanitization, rate limiting, and security utilities

'use strict';

// ============================================
// HTML SANITIZATION (XSS Prevention)
// ============================================

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} str - Input string to sanitize
 * @returns {string} - Sanitized string safe for HTML insertion
 */
export function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/`/g, '&#96;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize user input for safe storage and display
 * Removes potentially dangerous content while preserving safe text
 * @param {string} input - User input to sanitize
 * @param {object} options - Sanitization options
 * @returns {string} - Sanitized input
 */
export function sanitizeInput(input, options = {}) {
    if (input === null || input === undefined) return '';
    
    const {
        maxLength = 10000,
        allowNewlines = true,
        trimWhitespace = true
    } = options;
    
    let sanitized = String(input);
    
    // Trim whitespace if requested
    if (trimWhitespace) {
        sanitized = sanitized.trim();
    }
    
    // Remove null bytes and control characters (except newlines/tabs if allowed)
    if (allowNewlines) {
        sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    } else {
        sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, ' ');
    }
    
    // Remove potential script injection patterns
    sanitized = sanitized
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .replace(/data:/gi, 'data-blocked:');
    
    // Truncate to max length
    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength);
    }
    
    return sanitized;
}

/**
 * Validate and sanitize email address
 * @param {string} email - Email to validate
 * @returns {object} - { valid: boolean, sanitized: string, error?: string }
 */
export function validateEmail(email) {
    if (!email) {
        return { valid: false, sanitized: '', error: 'Email is required' };
    }
    
    const sanitized = String(email).trim().toLowerCase();
    
    // Basic email regex - comprehensive but not overly strict
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!emailRegex.test(sanitized)) {
        return { valid: false, sanitized: '', error: 'Invalid email format' };
    }
    
    if (sanitized.length > 254) {
        return { valid: false, sanitized: '', error: 'Email too long' };
    }
    
    return { valid: true, sanitized: sanitized };
}

/**
 * Validate and sanitize URL
 * @param {string} url - URL to validate
 * @returns {object} - { valid: boolean, sanitized: string, error?: string }
 */
export function validateURL(url) {
    if (!url) {
        return { valid: true, sanitized: '' }; // URLs are often optional
    }
    
    const sanitized = String(url).trim();
    
    // Only allow http and https protocols
    if (!/^https?:\/\//i.test(sanitized)) {
        return { valid: false, sanitized: '', error: 'URL must start with http:// or https://' };
    }
    
    try {
        const urlObj = new URL(sanitized);
        // Ensure no javascript protocol smuggling
        if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
            return { valid: false, sanitized: '', error: 'Invalid URL protocol' };
        }
        return { valid: true, sanitized: urlObj.href };
    } catch (e) {
        return { valid: false, sanitized: '', error: 'Invalid URL format' };
    }
}

// ============================================
// RATE LIMITING
// ============================================

const rateLimitStore = new Map();

/**
 * Check if an action should be rate limited
 * @param {string} key - Unique identifier for the action (e.g., 'submit_form', 'login')
 * @param {number} maxAttempts - Maximum attempts allowed in the window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {object} - { allowed: boolean, remaining: number, resetTime: Date }
 */
export function checkRateLimit(key, maxAttempts = 5, windowMs = 60000) {
    const now = Date.now();
    const record = rateLimitStore.get(key);
    
    if (!record || now > record.resetTime) {
        // First attempt or window expired
        rateLimitStore.set(key, {
            attempts: 1,
            resetTime: now + windowMs
        });
        return {
            allowed: true,
            remaining: maxAttempts - 1,
            resetTime: new Date(now + windowMs)
        };
    }
    
    if (record.attempts >= maxAttempts) {
        return {
            allowed: false,
            remaining: 0,
            resetTime: new Date(record.resetTime),
            waitSeconds: Math.ceil((record.resetTime - now) / 1000)
        };
    }
    
    record.attempts++;
    return {
        allowed: true,
        remaining: maxAttempts - record.attempts,
        resetTime: new Date(record.resetTime)
    };
}

/**
 * Reset rate limit for a specific key
 * @param {string} key - The key to reset
 */
export function resetRateLimit(key) {
    rateLimitStore.delete(key);
}

// ============================================
// CSRF-LIKE TOKEN (Client-side nonce)
// ============================================

let currentNonce = null;

/**
 * Generate a unique nonce for form submissions
 * @returns {string} - Unique nonce
 */
export function generateNonce() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    currentNonce = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    return currentNonce;
}

/**
 * Verify a nonce matches the current expected nonce
 * @param {string} nonce - Nonce to verify
 * @returns {boolean} - Whether the nonce is valid
 */
export function verifyNonce(nonce) {
    if (!currentNonce || !nonce) return false;
    const isValid = currentNonce === nonce;
    if (isValid) {
        currentNonce = null; // Invalidate after use
    }
    return isValid;
}

// ============================================
// FILE VALIDATION
// ============================================

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Validate an uploaded file
 * @param {File} file - File to validate
 * @returns {object} - { valid: boolean, error?: string }
 */
export function validateFile(file) {
    if (!file) {
        return { valid: false, error: 'No file provided' };
    }
    
    // Check file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        return { 
            valid: false, 
            error: `Invalid file type. Allowed: ${ALLOWED_IMAGE_TYPES.map(t => t.split('/')[1]).join(', ')}` 
        };
    }
    
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
        return { 
            valid: false, 
            error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024}MB` 
        };
    }
    
    // Check file name for suspicious patterns
    const fileName = file.name.toLowerCase();
    if (/\.(php|js|html|htm|exe|bat|cmd|sh|ps1)$/i.test(fileName)) {
        return { valid: false, error: 'Suspicious file extension detected' };
    }
    
    return { valid: true };
}

/**
 * Validate base64 image data
 * @param {string} base64 - Base64 encoded image
 * @returns {object} - { valid: boolean, error?: string }
 */
export function validateBase64Image(base64) {
    if (!base64) {
        return { valid: true }; // Images are optional
    }
    
    // Check if it's a valid data URI
    if (!base64.startsWith('data:image/')) {
        return { valid: false, error: 'Invalid image data format' };
    }
    
    // Check for allowed image types
    const typeMatch = base64.match(/^data:(image\/[a-z+]+);base64,/i);
    if (!typeMatch) {
        return { valid: false, error: 'Invalid base64 image format' };
    }
    
    const mimeType = typeMatch[1].toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
        return { valid: false, error: 'Unsupported image type' };
    }
    
    // Check approximate decoded size (base64 is ~33% larger than binary)
    const base64Data = base64.split(',')[1];
    if (base64Data) {
        const approximateSize = (base64Data.length * 3) / 4;
        if (approximateSize > MAX_FILE_SIZE) {
            return { valid: false, error: 'Image data too large' };
        }
    }
    
    return { valid: true };
}

// ============================================
// CONTENT SECURITY
// ============================================

/**
 * Check if current page is loaded in an iframe (clickjacking protection)
 * @returns {boolean} - True if in iframe
 */
export function isInIframe() {
    try {
        return window.self !== window.top;
    } catch (e) {
        return true; // If we can't access window.top, we're probably in an iframe
    }
}

/**
 * Prevent clickjacking by breaking out of iframes
 */
export function preventClickjacking() {
    if (isInIframe()) {
        console.warn('⚠️ Page loaded in iframe - potential clickjacking attempt');
        // Only redirect sensitive pages
        const sensitivePaths = ['/admin', '/add-martyr', '/login'];
        const currentPath = window.location.pathname;
        if (sensitivePaths.some(p => currentPath.includes(p))) {
            window.top.location = window.location;
        }
    }
}

// ============================================
// FORM DATA SANITIZATION
// ============================================

/**
 * Sanitize an entire form data object
 * @param {object} data - Form data object
 * @param {object} fieldRules - Rules for each field
 * @returns {object} - { sanitized: object, errors: array }
 */
export function sanitizeFormData(data, fieldRules = {}) {
    const sanitized = {};
    const errors = [];
    
    const defaultRules = {
        maxLength: 1000,
        required: false,
        type: 'text'
    };
    
    for (const [key, value] of Object.entries(data)) {
        const rules = { ...defaultRules, ...fieldRules[key] };
        
        // Check required fields
        if (rules.required && (!value || String(value).trim() === '')) {
            errors.push({ field: key, error: `${key} is required` });
            continue;
        }
        
        // Skip empty optional fields
        if (!value && !rules.required) {
            sanitized[key] = '';
            continue;
        }
        
        // Type-specific sanitization
        switch (rules.type) {
            case 'email':
                const emailResult = validateEmail(value);
                if (rules.required && !emailResult.valid) {
                    errors.push({ field: key, error: emailResult.error });
                } else {
                    sanitized[key] = emailResult.sanitized;
                }
                break;
                
            case 'url':
                const urlResult = validateURL(value);
                if (!urlResult.valid && value) {
                    errors.push({ field: key, error: urlResult.error });
                } else {
                    sanitized[key] = urlResult.sanitized;
                }
                break;
                
            case 'date':
                // Validate date format
                const dateStr = String(value).trim();
                if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
                    errors.push({ field: key, error: 'Invalid date format (expected YYYY-MM-DD)' });
                } else {
                    sanitized[key] = dateStr;
                }
                break;
                
            default:
                // Text sanitization
                sanitized[key] = sanitizeInput(value, {
                    maxLength: rules.maxLength,
                    allowNewlines: rules.type === 'textarea'
                });
        }
    }
    
    return { sanitized, errors };
}

// ============================================
// SESSION SECURITY
// ============================================

/**
 * Generate a secure session ID
 * @returns {string} - Secure random session ID
 */
export function generateSessionId() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Securely clear sensitive data from memory
 * @param {object} obj - Object containing sensitive data
 */
export function secureClear(obj) {
    if (!obj) return;
    for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'string') {
            obj[key] = '';
        } else if (typeof obj[key] === 'object') {
            secureClear(obj[key]);
        }
        delete obj[key];
    }
}

// ============================================
// LOGGING (Security Events)
// ============================================

const securityLog = [];
const MAX_LOG_ENTRIES = 100;

/**
 * Log a security event
 * @param {string} event - Event type
 * @param {object} details - Event details
 */
export function logSecurityEvent(event, details = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        event,
        details,
        userAgent: navigator.userAgent.substring(0, 100),
        url: window.location.href
    };
    
    securityLog.push(entry);
    
    // Keep log size manageable
    if (securityLog.length > MAX_LOG_ENTRIES) {
        securityLog.shift();
    }
    
    // Log to console in development
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('🔒 Security Event:', event, details);
    }
}

/**
 * Get recent security events
 * @returns {array} - Recent security events
 */
export function getSecurityLog() {
    return [...securityLog];
}

// ============================================
// AUTO-INITIALIZATION
// ============================================

// Initialize security measures when module loads
if (typeof window !== 'undefined') {
    // Prevent clickjacking on sensitive pages
    preventClickjacking();
    
    // Log page load
    logSecurityEvent('page_load', { path: window.location.pathname });
    
    // Make security utilities globally available
    window.securityUtils = {
        escapeHTML,
        sanitizeInput,
        validateEmail,
        checkRateLimit,
        validateFile,
        sanitizeFormData,
        logSecurityEvent
    };
    
    console.log('🔒 Security module initialized');
}
