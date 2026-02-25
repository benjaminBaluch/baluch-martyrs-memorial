/**
 * Baluch Martyrs Memorial - Visitor Analytics Module
 * 
 * Tracks anonymous visitor data including:
 * - Country/region based on IP geolocation
 * - Page views and visit timestamps
 * - Activity feed for admin dashboard
 * 
 * Privacy-focused: No PII collected, only aggregate data
 */

class VisitorAnalytics {
    constructor() {
        this.STORAGE_KEY = 'bmm_analytics';
        this.VISITOR_KEY = 'bmm_visitor_id';
        this.SESSION_KEY = 'bmm_session';
        this.data = this.loadData();
        this.visitorId = this.getOrCreateVisitorId();
    }

    // ============================================
    // Data Persistence
    // ============================================

    loadData() {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.warn('Analytics: Failed to load stored data', e);
        }

        return {
            totalVisitors: 0,
            totalPageviews: 0,
            countries: {},
            visitors: {},
            activities: [],
            dailyStats: {},
            lastUpdated: null
        };
    }

    saveData() {
        try {
            this.data.lastUpdated = new Date().toISOString();
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.warn('Analytics: Failed to save data', e);
        }
    }

    // ============================================
    // Visitor Identification (Anonymous)
    // ============================================

    getOrCreateVisitorId() {
        let visitorId = localStorage.getItem(this.VISITOR_KEY);
        if (!visitorId) {
            visitorId = 'v_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
            localStorage.setItem(this.VISITOR_KEY, visitorId);
        }
        return visitorId;
    }

    isNewSession() {
        const session = sessionStorage.getItem(this.SESSION_KEY);
        if (!session) {
            sessionStorage.setItem(this.SESSION_KEY, Date.now().toString());
            return true;
        }
        return false;
    }

    // ============================================
    // Geolocation (IP-based)
    // ============================================

    async getVisitorLocation() {
        // Try multiple free geolocation APIs with fallbacks
        const apis = [
            { url: 'https://ipapi.co/json/', parser: this.parseIpApiCo },
            { url: 'https://ip-api.com/json/?fields=status,country,countryCode,city,regionName', parser: this.parseIpApi },
            { url: 'https://ipwho.is/', parser: this.parseIpWhoIs }
        ];

        for (const api of apis) {
            try {
                const response = await fetch(api.url, { 
                    timeout: 5000,
                    headers: { 'Accept': 'application/json' }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    const location = api.parser(data);
                    if (location && location.country) {
                        return location;
                    }
                }
            } catch (e) {
                console.warn(`Analytics: ${api.url} failed`, e.message);
            }
        }

        // Fallback
        return { country: 'Unknown', countryCode: 'XX', city: '', region: '' };
    }

    parseIpApiCo(data) {
        return {
            country: data.country_name || 'Unknown',
            countryCode: data.country_code || 'XX',
            city: data.city || '',
            region: data.region || ''
        };
    }

    parseIpApi(data) {
        if (data.status === 'fail') return null;
        return {
            country: data.country || 'Unknown',
            countryCode: data.countryCode || 'XX',
            city: data.city || '',
            region: data.regionName || ''
        };
    }

    parseIpWhoIs(data) {
        if (!data.success) return null;
        return {
            country: data.country || 'Unknown',
            countryCode: data.country_code || 'XX',
            city: data.city || '',
            region: data.region || ''
        };
    }

    // ============================================
    // Country Flag Emoji
    // ============================================

    getCountryFlag(countryCode) {
        if (!countryCode || countryCode === 'XX' || countryCode.length !== 2) {
            return '🌍';
        }
        const codePoints = countryCode
            .toUpperCase()
            .split('')
            .map(char => 127397 + char.charCodeAt(0));
        return String.fromCodePoint(...codePoints);
    }

    // ============================================
    // Track Visit
    // ============================================

    async trackPageView(pageName = null) {
        const page = pageName || window.location.pathname.split('/').pop() || 'index.html';
        const timestamp = new Date().toISOString();
        const today = timestamp.split('T')[0];
        const isNewSession = this.isNewSession();

        // Track page view
        this.data.totalPageviews = (this.data.totalPageviews || 0) + 1;

        // Track daily stats
        if (!this.data.dailyStats[today]) {
            this.data.dailyStats[today] = { visitors: 0, pageviews: 0 };
        }
        this.data.dailyStats[today].pageviews++;

        // Only track visitor/country on new sessions
        if (isNewSession) {
            // Check if this is a new visitor
            if (!this.data.visitors[this.visitorId]) {
                this.data.totalVisitors = (this.data.totalVisitors || 0) + 1;
                this.data.visitors[this.visitorId] = {
                    firstVisit: timestamp,
                    visits: 0
                };
            }
            this.data.visitors[this.visitorId].visits++;
            this.data.visitors[this.visitorId].lastVisit = timestamp;
            this.data.dailyStats[today].visitors++;

            // Get location and track country
            const location = await this.getVisitorLocation();
            this.data.visitors[this.visitorId].country = location.country;
            this.data.visitors[this.visitorId].countryCode = location.countryCode;

            // Update country stats
            const countryKey = location.countryCode || 'XX';
            if (!this.data.countries[countryKey]) {
                this.data.countries[countryKey] = {
                    name: location.country,
                    code: countryKey,
                    visits: 0,
                    lastVisit: null
                };
            }
            this.data.countries[countryKey].visits++;
            this.data.countries[countryKey].lastVisit = timestamp;

            // Add to activity feed
            this.addActivity({
                type: 'visit',
                icon: '👤',
                text: `New visitor from <strong>${location.country}</strong>`,
                timestamp: timestamp
            });
        }

        // Add page view activity
        this.addActivity({
            type: 'pageview',
            icon: '📄',
            text: `Page viewed: <strong>${page}</strong>`,
            timestamp: timestamp
        });

        this.saveData();
        
        // Also save to Firebase if available
        this.saveToFirebase();
    }

    // ============================================
    // Activity Feed
    // ============================================

    addActivity(activity) {
        this.data.activities.unshift({
            ...activity,
            id: Date.now().toString(36)
        });

        // Keep only last 100 activities
        if (this.data.activities.length > 100) {
            this.data.activities = this.data.activities.slice(0, 100);
        }
    }

    // ============================================
    // Firebase Sync
    // ============================================

    async saveToFirebase() {
        if (!window.firebaseDB) return;

        try {
            // Save aggregate analytics to Firebase
            const analyticsRef = window.firebaseDB.db?.collection?.('analytics');
            if (analyticsRef) {
                await analyticsRef.doc('aggregate').set({
                    totalVisitors: this.data.totalVisitors,
                    totalPageviews: this.data.totalPageviews,
                    countries: this.data.countries,
                    dailyStats: this.data.dailyStats,
                    lastUpdated: new Date()
                }, { merge: true });
            }
        } catch (e) {
            console.warn('Analytics: Failed to save to Firebase', e);
        }
    }

    async loadFromFirebase() {
        if (!window.firebaseDB) return null;

        try {
            const analyticsRef = window.firebaseDB.db?.collection?.('analytics');
            if (analyticsRef) {
                const doc = await analyticsRef.doc('aggregate').get();
                if (doc.exists) {
                    return doc.data();
                }
            }
        } catch (e) {
            console.warn('Analytics: Failed to load from Firebase', e);
        }
        return null;
    }

    // ============================================
    // Dashboard Data Getters
    // ============================================

    getStats() {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        const todayStats = this.data.dailyStats[today] || { visitors: 0, pageviews: 0 };
        const yesterdayStats = this.data.dailyStats[yesterday] || { visitors: 0, pageviews: 0 };

        // Calculate trends
        const visitorsTrend = yesterdayStats.visitors > 0 
            ? Math.round(((todayStats.visitors - yesterdayStats.visitors) / yesterdayStats.visitors) * 100)
            : 0;
        const pageviewsTrend = yesterdayStats.pageviews > 0
            ? Math.round(((todayStats.pageviews - yesterdayStats.pageviews) / yesterdayStats.pageviews) * 100)
            : 0;

        return {
            totalVisitors: this.data.totalVisitors || 0,
            totalPageviews: this.data.totalPageviews || 0,
            uniqueCountries: Object.keys(this.data.countries).length,
            todayVisitors: todayStats.visitors,
            todayPageviews: todayStats.pageviews,
            visitorsTrend,
            pageviewsTrend
        };
    }

    getCountries() {
        return Object.values(this.data.countries)
            .sort((a, b) => b.visits - a.visits)
            .slice(0, 12);
    }

    getRecentActivities(limit = 20) {
        return this.data.activities.slice(0, limit);
    }

    // ============================================
    // Time Formatting
    // ============================================

    formatTimeAgo(timestamp) {
        const now = Date.now();
        const time = new Date(timestamp).getTime();
        const diff = now - time;

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    }

    // ============================================
    // Track Specific Events
    // ============================================

    trackSubmission(martyrName) {
        this.addActivity({
            type: 'submission',
            icon: '📝',
            text: `New submission: <strong>${martyrName}</strong>`,
            timestamp: new Date().toISOString()
        });
        this.saveData();
    }

    trackApproval(martyrName) {
        this.addActivity({
            type: 'approval',
            icon: '✅',
            text: `Martyr approved: <strong>${martyrName}</strong>`,
            timestamp: new Date().toISOString()
        });
        this.saveData();
    }

    trackGalleryView(martyrName) {
        this.addActivity({
            type: 'view',
            icon: '👁️',
            text: `Profile viewed: <strong>${martyrName}</strong>`,
            timestamp: new Date().toISOString()
        });
        this.saveData();
    }
}

// ============================================
// Admin Dashboard Renderer
// ============================================

class AnalyticsDashboard {
    constructor(analytics) {
        this.analytics = analytics;
    }

    async render() {
        const loadingEl = document.getElementById('analyticsLoading');
        const contentEl = document.getElementById('analyticsContent');

        if (!loadingEl || !contentEl) return;

        try {
            // Show content
            loadingEl.style.display = 'none';
            contentEl.style.display = 'block';

            // Render stats
            this.renderStats();

            // Render countries
            this.renderCountries();

            // Render activities
            this.renderActivities();

        } catch (error) {
            console.error('Analytics Dashboard Error:', error);
            loadingEl.innerHTML = `
                <p style="color: #ef4444;">Failed to load analytics</p>
                <button class="btn btn-secondary" onclick="refreshAnalytics()">Retry</button>
            `;
        }
    }

    renderStats() {
        const stats = this.analytics.getStats();

        // Update values
        this.updateElement('totalVisitors', this.formatNumber(stats.totalVisitors));
        this.updateElement('uniqueCountries', stats.uniqueCountries);
        this.updateElement('totalPageviews', this.formatNumber(stats.totalPageviews));
        this.updateElement('todayVisitors', stats.todayVisitors);

        // Update trends
        this.updateTrend('visitorsTrend', stats.visitorsTrend);
        this.updateTrend('pageviewsTrend', stats.pageviewsTrend);
    }

    renderCountries() {
        const container = document.getElementById('countriesGrid');
        if (!container) return;

        const countries = this.analytics.getCountries();
        const maxVisits = countries.length > 0 ? countries[0].visits : 1;

        if (countries.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #64748b;">
                    No visitor data yet. Analytics will appear as visitors browse the site.
                </div>
            `;
            return;
        }

        container.innerHTML = countries.map(country => {
            const flag = this.analytics.getCountryFlag(country.code);
            const percentage = Math.round((country.visits / maxVisits) * 100);

            return `
                <div class="country-item">
                    <div class="country-flag">${flag}</div>
                    <div class="country-info">
                        <div class="country-name">${this.escapeHtml(country.name)}</div>
                        <div class="country-visits">${country.visits} visit${country.visits !== 1 ? 's' : ''}</div>
                        <div class="country-bar">
                            <div class="country-bar-fill" style="width: ${percentage}%"></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderActivities() {
        const container = document.getElementById('activityList');
        if (!container) return;

        const activities = this.analytics.getRecentActivities(15);

        if (activities.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 1.5rem; color: #64748b;">
                    No recent activity
                </div>
            `;
            return;
        }

        container.innerHTML = activities.map(activity => {
            const iconClass = activity.type === 'visit' ? 'visit' : 
                             activity.type === 'submission' ? 'submission' : 'view';
            
            return `
                <div class="activity-item">
                    <div class="activity-icon ${iconClass}">${activity.icon}</div>
                    <div class="activity-text">${activity.text}</div>
                    <div class="activity-time">${this.analytics.formatTimeAgo(activity.timestamp)}</div>
                </div>
            `;
        }).join('');
    }

    updateElement(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    updateTrend(id, value) {
        const el = document.getElementById(id);
        if (!el) return;

        if (value > 0) {
            el.textContent = `+${value}%`;
            el.className = 'metric-trend up';
        } else if (value < 0) {
            el.textContent = `${value}%`;
            el.className = 'metric-trend down';
        } else {
            el.textContent = '0%';
            el.className = 'metric-trend';
        }
    }

    formatNumber(num) {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toString();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// ============================================
// Global Instance & Auto-tracking
// ============================================

// Create global instance
window.visitorAnalytics = new VisitorAnalytics();

// Auto-track page view on load (non-admin pages)
document.addEventListener('DOMContentLoaded', () => {
    const isAdminPage = window.location.pathname.includes('admin');
    if (!isAdminPage) {
        window.visitorAnalytics.trackPageView();
    }
});

// Global function for admin dashboard refresh
window.refreshAnalytics = function() {
    if (window.analyticsDashboard) {
        window.analyticsDashboard.render();
    }
};

// Initialize dashboard on admin page
document.addEventListener('DOMContentLoaded', () => {
    const isAdminPage = window.location.pathname.includes('admin');
    if (isAdminPage && document.getElementById('analyticsDashboard')) {
        window.analyticsDashboard = new AnalyticsDashboard(window.visitorAnalytics);
        
        // Small delay to ensure everything is loaded
        setTimeout(() => {
            window.analyticsDashboard.render();
        }, 500);

        // Auto-refresh every 30 seconds
        setInterval(() => {
            window.analyticsDashboard.render();
        }, 30000);
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VisitorAnalytics, AnalyticsDashboard };
}
