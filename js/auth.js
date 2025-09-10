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

            const session = JSON.parse(sessionData);
            const sessionStorage = JSON.parse(sessionStorageData);

            // Verify both storages match (basic tamper detection)
            if (session.username !== sessionStorage.username || 
                session.loginTime !== sessionStorage.loginTime) {
                this.clearSession();
                return null;
            }

            // Check if session is expired
            if (session.expires <= Date.now()) {
                this.clearSession();
                return null;
            }

            // Session is valid, extend expiration
            this.extendSession(session);
            return session;
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
        const sessionData = {
            username: username,
            loginTime: Date.now(),
            expires: Date.now() + SESSION_DURATION
        };
        
        localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
        this.sessionData = sessionData;
        
        console.log(`🔐 Admin session created: ${username}`);
        return sessionData;
    }

    // Get remaining session time in minutes
    getSessionTimeRemaining() {
        const session = this.getValidSession();
        if (!session) return 0;
        
        const remaining = session.expires - Date.now();
        return Math.max(0, Math.floor(remaining / (1000 * 60)));
    }

    // Add session warning for expiring sessions
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

    // Initialize page protection (call this on admin pages)
    initializePageProtection() {
        // TEMPORARY: Bypass authentication for testing
        console.log('🔧 TEMPORARY: Authentication bypassed for testing purposes');
        
        // Create a temporary admin session if none exists
        if (!this.isAuthenticated()) {
            console.log('🔧 Creating temporary admin session for testing...');
            this.createSession('temp-admin');
        }
        
        // Don't require strict authentication for now
        // if (!this.requireAuth()) {
        //     return false;
        // }

        // Don't start aggressive session warning system for now
        // this.startSessionWarning();

        // Add beforeunload warning
        window.addEventListener('beforeunload', (e) => {
            // Only warn if there are unsaved changes (could be enhanced)
            if (document.body.classList.contains('has-unsaved-changes')) {
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
            }
        });

        // Don't add strict security headers for now
        // this.addSecurityHeaders();

        console.log('✅ Admin panel access granted (temporary bypass)');
        return true;
    }

    // Add basic client-side security measures
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

    // Validate admin action (can be used before sensitive operations)
    validateAdminAction(actionName = 'admin action') {
        // TEMPORARY: Always allow admin actions for testing
        console.log(`🔧 TEMPORARY: Admin action always authorized: ${actionName}`);
        
        // Create session if it doesn't exist
        if (!this.isAuthenticated()) {
            console.log('🔧 Creating temporary session for admin action');
            this.createSession('temp-admin');
        }
        
        // Don't logout on authentication issues for now
        // if (!this.isAuthenticated()) {
        //     console.error(`🚫 Attempted ${actionName} without authentication`);
        //     this.logout();
        //     return false;
        // }

        // Don't check session expiration for now
        // const remaining = this.getSessionTimeRemaining();
        // 
        // // Only logout if session has completely expired (0 minutes)
        // // For low time remaining, just extend the session automatically
        // if (remaining === 0) {
        //     console.error(`🚫 Session expired during ${actionName}`);
        //     this.logout();
        //     return false;
        // } else if (remaining <= 15 && this.sessionData) {
        //     // Auto-extend session if running low during admin actions
        //     console.log(`⏰ Auto-extending session during ${actionName} (${remaining}m remaining)`);
        //     this.extendSession(this.sessionData);
        // }

        console.log(`✅ Admin action authorized (temporary bypass): ${actionName}`);
        return true;
    }
}

// Create and export a singleton instance
export const adminAuth = new AdminAuth();

// Make it globally available for onclick handlers
window.adminAuth = adminAuth;
