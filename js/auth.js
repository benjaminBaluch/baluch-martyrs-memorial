// Admin Authentication Module
// Provides secure session management and authentication checks

const SESSION_KEY = 'baluch_admin_session';
const SESSION_DURATION = 4 * 60 * 60 * 1000; // 4 hours

export class AdminAuth {
    constructor() {
        this.sessionData = null;
        this.initializeAuth();
    }

    initializeAuth() {
        // Check for valid session on initialization
        this.sessionData = this.getValidSession();
    }

    // Get valid session data or null
    getValidSession() {
        try {
            const sessionData = localStorage.getItem(SESSION_KEY);
            const sessionStorageData = sessionStorage.getItem(SESSION_KEY);
            
            if (!sessionData || !sessionStorageData) {
                return null;
            }

            const localSession = JSON.parse(sessionData);
            const sessionStorageSession = JSON.parse(sessionStorageData);

            // Verify both storages match (basic tamper detection)
            if (localSession.username !== sessionStorageSession.username || 
                localSession.loginTime !== sessionStorageSession.loginTime) {
                this.clearSession();
                return null;
            }

            // Check if session is expired
            if (localSession.expires <= Date.now()) {
                this.clearSession();
                return null;
            }

            // Session is valid, extend expiration
            this.extendSession(localSession);
            return localSession;
        } catch (error) {
            console.error('Error validating session:', error);
            this.clearSession();
            return null;
        }
    }

    // Extend session expiration
    extendSession(session) {
        try {
            const extendedSession = {
                ...session,
                expires: Date.now() + SESSION_DURATION,
                lastExtended: Date.now()
            };
            
            localStorage.setItem(SESSION_KEY, JSON.stringify(extendedSession));
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(extendedSession));
            this.sessionData = extendedSession;
            
            console.log(`🔄 Session extended for ${extendedSession.username} until ${new Date(extendedSession.expires).toLocaleTimeString()}`);
        } catch (error) {
            console.error('Error extending session:', error);
        }
    }

    // Check if user is authenticated
    isAuthenticated() {
        return this.getValidSession() !== null;
    }

    // Get current admin user info
    getCurrentAdmin() {
        const session = this.getValidSession();
        return session ? {
            username: session.username,
            loginTime: new Date(session.loginTime),
            expires: new Date(session.expires)
        } : null;
    }

    // Clear all session data
    clearSession() {
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        this.sessionData = null;
    }

    // Logout and redirect
    logout(redirectUrl = 'admin-login.html') {
        console.log('🔐 Admin logout:', this.getCurrentAdmin()?.username);
        this.clearSession();
        window.location.href = redirectUrl;
    }

    // Redirect to login if not authenticated
    requireAuth(redirectUrl = 'admin-login.html') {
        if (!this.isAuthenticated()) {
            console.warn('🚫 Unauthorized access attempt to admin area');
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    }

    // Create login session (called from login page)
    createSession(username) {
        try {
            const sessionData = {
                username: username,
                loginTime: Date.now(),
                expires: Date.now() + SESSION_DURATION
            };
            
            console.log(`🔐 Creating session for: ${username}`);
            console.log('Session data:', {
                username: sessionData.username,
                loginTime: new Date(sessionData.loginTime).toLocaleString(),
                expires: new Date(sessionData.expires).toLocaleString(),
                duration: Math.round(SESSION_DURATION / (1000 * 60)) + ' minutes'
            });
            
            // Store in localStorage
            localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
            console.log('✅ Session stored in localStorage');
            
            // Store in sessionStorage
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
            console.log('✅ Session stored in sessionStorage');
            
            this.sessionData = sessionData;
            
            // Verify storage worked
            const verifyLocal = localStorage.getItem(SESSION_KEY);
            const verifySession = sessionStorage.getItem(SESSION_KEY);
            
            if (!verifyLocal || !verifySession) {
                console.error('❌ Session verification failed after storage');
                console.error('localStorage has session:', !!verifyLocal);
                console.error('sessionStorage has session:', !!verifySession);
                this.clearSession();
                return null;
            }
            
            console.log(`✅ Admin session created successfully: ${username}`);
            return sessionData;
            
        } catch (error) {
            console.error('❌ Failed to create session:', error);
            console.error('Error details:', {
                message: error.message,
                stack: error.stack,
                username: username,
                storageQuota: this.checkStorageQuota()
            });
            
            // Clean up any partial session data
            this.clearSession();
            return null;
        }
    }
    
    // Check storage quota and availability
    checkStorageQuota() {
        try {
            const testKey = 'storage_test_' + Date.now();
            const testData = 'test';
            
            // Test localStorage
            localStorage.setItem(testKey, testData);
            const localResult = localStorage.getItem(testKey);
            localStorage.removeItem(testKey);
            
            // Test sessionStorage
            sessionStorage.setItem(testKey, testData);
            const sessionResult = sessionStorage.getItem(testKey);
            sessionStorage.removeItem(testKey);
            
            return {
                localStorage: localResult === testData,
                sessionStorage: sessionResult === testData,
                available: localResult === testData && sessionResult === testData
            };
        } catch (error) {
            return {
                localStorage: false,
                sessionStorage: false,
                available: false,
                error: error.message
            };
        }
    }

    // Get remaining session time in minutes
    getSessionTimeRemaining() {
        const session = this.getValidSession();
        if (!session) return 0;
        
        const remaining = session.expires - Date.now();
        return Math.max(0, Math.floor(remaining / (1000 * 60)));
    }

    // Add session warning for expiring sessions (original aggressive version)
    startSessionWarning() {
        const checkInterval = 5 * 60 * 1000; // Check every 5 minutes
        
        setInterval(() => {
            const remaining = this.getSessionTimeRemaining();
            
            if (remaining === 0) {
                alert('Your admin session has expired. You will be redirected to login.');
                this.logout();
            } else if (remaining <= 15) {
                const extend = confirm(`Your session will expire in ${remaining} minutes. Would you like to extend it?`);
                if (extend) {
                    this.extendSession(this.sessionData);
                    console.log('🔐 Admin session extended');
                }
            }
        }, checkInterval);
    }
    
    // Add lenient session warning for better user experience
    startLenientSessionWarning() {
        const checkInterval = 30 * 60 * 1000; // Check every 30 minutes instead of 5
        
        setInterval(() => {
            const remaining = this.getSessionTimeRemaining();
            
            // Only warn when session actually expires, not before
            if (remaining === 0) {
                alert('Your admin session has expired. You will be redirected to login.');
                this.logout();
            } else if (remaining <= 30) { // Give 30 minute warning instead of 15
                console.log(`🔔 Admin session warning: ${remaining} minutes remaining`);
                // Auto-extend session instead of asking user
                if (this.sessionData) {
                    this.extendSession(this.sessionData);
                    console.log('🔄 Admin session auto-extended');
                }
            }
        }, checkInterval);
    }

    // Initialize page protection (call this on admin pages)
    initializePageProtection() {
        console.log('🔐 Initializing admin page protection with proper authentication...');
        
        // Require authentication - redirect to login if not authenticated
        if (!this.requireAuth()) {
            console.log('❌ Authentication required - redirecting to login');
            return false;
        }

        console.log('✅ Admin authentication verified');

        // Start a more lenient session warning system (every 30 minutes instead of 5)
        this.startLenientSessionWarning();

        // Add beforeunload warning
        window.addEventListener('beforeunload', (e) => {
            // Only warn if there are unsaved changes (could be enhanced)
            if (document.body.classList.contains('has-unsaved-changes')) {
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });

        // Add basic security measures (less strict)
        this.addBasicSecurity();

        console.log('✅ Admin panel access granted with proper authentication');
        return true;
    }

    // Add basic client-side security measures (strict version)
    addSecurityHeaders() {
        // Disable right-click context menu on admin pages
        document.addEventListener('contextmenu', (e) => {
            if (e.target.closest('.admin-sensitive')) {
                e.preventDefault();
            }
        });

        // Disable F12, Ctrl+Shift+I, Ctrl+U (basic protection)
        document.addEventListener('keydown', (e) => {
            if (
                e.key === 'F12' ||
                (e.ctrlKey && e.shiftKey && e.key === 'I') ||
                (e.ctrlKey && e.key === 'u')
            ) {
                e.preventDefault();
                console.warn('Developer tools access attempted on admin page');
            }
        });

        // Basic frame busting
        if (window.top !== window.self) {
            console.error('Admin page loaded in frame - potential security risk');
            window.top.location = window.location;
        }
    }
    
    // Add basic security without aggressive restrictions
    addBasicSecurity() {
        // Only basic frame busting for security
        if (window.top !== window.self) {
            console.error('Admin page loaded in frame - potential security risk');
            window.top.location = window.location;
        }
        
        console.log('🔒 Basic security measures applied');
    }

    // Validate admin action (can be used before sensitive operations)
    validateAdminAction(actionName = 'admin action') {
        // Check if user is authenticated
        if (!this.isAuthenticated()) {
            console.error(`🚫 Attempted ${actionName} without authentication - redirecting to login`);
            this.logout();
            return false;
        }

        const remaining = this.getSessionTimeRemaining();
        
        // Only logout if session has completely expired (0 minutes)
        if (remaining === 0) {
            console.error(`🚫 Session expired during ${actionName} - redirecting to login`);
            this.logout();
            return false;
        }
        
        // Auto-extend session if running low (instead of asking user)
        if (remaining <= 30 && this.sessionData) {
            console.log(`⏰ Auto-extending session during ${actionName} (${remaining}m remaining)`);
            this.extendSession(this.sessionData);
        }

        console.log(`✅ Admin action authorized: ${actionName} by ${this.getCurrentAdmin().username}`);
        return true;
    }
}

// Create and export a singleton instance
export const adminAuth = new AdminAuth();

// Make it globally available for onclick handlers
window.adminAuth = adminAuth;
