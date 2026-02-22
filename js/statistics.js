/**
 * Statistics Dashboard - Baluch Martyrs Memorial
 * Clean, human-centered data visualization
 */

(function() {
    'use strict';

    // Chart instances
    let timelineChart = null;
    let monthlyChart = null;

    // Month names
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // Initialize
    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        console.log('📊 Statistics: Initializing...');
        
        // Wait a bit for Firebase to be ready
        await waitForFirebase();
        
        // Load data
        loadData();
    }

    // Wait for Firebase to initialize
    function waitForFirebase() {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 50; // 5 seconds max
            
            const check = () => {
                attempts++;
                if (window.firebaseDB || attempts >= maxAttempts) {
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    }

    // Load all martyrs data
    async function loadData() {
        const loadingEl = document.getElementById('statsLoading');
        const emptyEl = document.getElementById('statsEmpty');
        const contentEl = document.getElementById('dashboardContent');
        const statusEl = document.getElementById('dataStatus');

        let martyrs = [];
        let source = 'unknown';

        try {
            // Method 1: Firebase direct (most reliable)
            if (window.firebaseDB && typeof window.firebaseDB.getApprovedMartyrs === 'function') {
                console.log('📊 Fetching from Firebase...');
                updateStatus(statusEl, 'Connecting to database...', true);
                
                const result = await window.firebaseDB.getApprovedMartyrs();
                
                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    martyrs = result.data;
                    source = 'database';
                    console.log(`✅ Firebase: ${martyrs.length} martyrs`);
                }
            }

            // Method 2: API fallback
            if (martyrs.length === 0) {
                console.log('📊 Trying API...');
                updateStatus(statusEl, 'Trying API...', true);
                
                try {
                    const response = await fetch('/api/get-martyrs', {
                        method: 'GET',
                        headers: { 'Accept': 'application/json' },
                        cache: 'no-store'
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        if (Array.isArray(data) && data.length > 0) {
                            martyrs = data;
                            source = 'database';
                            console.log(`✅ API: ${martyrs.length} martyrs`);
                        }
                    }
                } catch (e) {
                    console.warn('API failed:', e);
                }
            }

            // Method 3: localStorage fallback
            if (martyrs.length === 0) {
                console.log('📊 Trying localStorage...');
                updateStatus(statusEl, 'Using cached data...', true);
                
                try {
                    const saved = localStorage.getItem('martyrsData');
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        if (Array.isArray(parsed)) {
                            martyrs = parsed.filter(m => !m.status || m.status === 'approved');
                            source = 'cache';
                            console.log(`✅ Cache: ${martyrs.length} martyrs`);
                        }
                    }
                } catch (e) {
                    console.warn('localStorage failed:', e);
                }
            }

            // Hide loading
            if (loadingEl) loadingEl.style.display = 'none';

            // No data?
            if (martyrs.length === 0) {
                updateStatus(statusEl, 'No data available', false);
                if (emptyEl) emptyEl.style.display = 'block';
                return;
            }

            // Show dashboard
            if (contentEl) contentEl.style.display = 'block';
            updateStatus(statusEl, `${martyrs.length} records from ${source}`, false);

            // Process and render
            const stats = processData(martyrs);
            renderKeyNumbers(stats);
            renderTimeline(stats);
            renderRegions(stats);
            renderMonthly(stats);
            renderInsights(stats);

            console.log('✅ Statistics rendered');

        } catch (error) {
            console.error('❌ Statistics error:', error);
            if (loadingEl) loadingEl.style.display = 'none';
            updateStatus(statusEl, 'Error loading data', false);
            if (emptyEl) {
                emptyEl.style.display = 'block';
                const title = emptyEl.querySelector('.empty-title');
                const text = emptyEl.querySelector('.empty-text');
                if (title) title.textContent = 'Error Loading Data';
                if (text) text.textContent = 'Please refresh the page to try again.';
            }
        }
    }

    // Update status badge
    function updateStatus(el, text, loading) {
        if (!el) return;
        const dot = el.querySelector('.status-dot');
        const span = el.querySelector('span:last-child');
        if (dot) {
            dot.classList.toggle('loading', loading);
        }
        if (span) {
            span.textContent = text;
        }
    }

    // Process martyrs data into stats
    function processData(martyrs) {
        const stats = {
            total: martyrs.length,
            withBio: 0,
            withPhoto: 0,
            byYear: {},
            byMonth: new Array(12).fill(0),
            byRegion: {},
            years: []
        };

        martyrs.forEach(m => {
            // Biographies
            if (m.biography && m.biography.trim().length > 30) {
                stats.withBio++;
            }

            // Photos
            if (m.photo && m.photo.length > 50) {
                stats.withPhoto++;
            }

            // Year
            const year = extractYear(m.martyrdomDate);
            if (year && year >= 1900 && year <= 2100) {
                stats.byYear[year] = (stats.byYear[year] || 0) + 1;
                if (!stats.years.includes(year)) {
                    stats.years.push(year);
                }
            }

            // Month
            const month = extractMonth(m.martyrdomDate);
            if (month !== null && month >= 0 && month <= 11) {
                stats.byMonth[month]++;
            }

            // Region
            const region = normalizeRegion(m.martyrdomPlace || m.birthPlace);
            if (region) {
                stats.byRegion[region] = (stats.byRegion[region] || 0) + 1;
            }
        });

        // Sort years
        stats.years.sort((a, b) => a - b);

        // Calculate derived stats
        if (stats.years.length > 0) {
            stats.minYear = stats.years[0];
            stats.maxYear = stats.years[stats.years.length - 1];
        }

        stats.regionCount = Object.keys(stats.byRegion).length;
        stats.storyPercent = stats.total > 0 ? Math.round((stats.withBio / stats.total) * 100) : 0;

        return stats;
    }

    // Extract year from date
    function extractYear(dateStr) {
        if (!dateStr) return null;
        const s = String(dateStr).trim();
        
        // Firestore Timestamp object
        if (dateStr && typeof dateStr === 'object' && dateStr.seconds) {
            return new Date(dateStr.seconds * 1000).getFullYear();
        }
        
        // ISO format: 2024-01-15
        let match = s.match(/^(\d{4})-/);
        if (match) return parseInt(match[1]);
        
        // Year at end: 15/01/2024
        match = s.match(/(\d{4})$/);
        if (match) return parseInt(match[1]);
        
        // Just year
        if (/^\d{4}$/.test(s)) return parseInt(s);
        
        return null;
    }

    // Extract month (0-11) from date
    function extractMonth(dateStr) {
        if (!dateStr) return null;
        const s = String(dateStr).trim();
        
        // Firestore Timestamp
        if (dateStr && typeof dateStr === 'object' && dateStr.seconds) {
            return new Date(dateStr.seconds * 1000).getMonth();
        }
        
        // ISO: 2024-03-15
        let match = s.match(/^\d{4}-(\d{2})/);
        if (match) return parseInt(match[1]) - 1;
        
        // DD/MM/YYYY
        match = s.match(/^\d{2}\/(\d{2})\/\d{4}/);
        if (match) return parseInt(match[1]) - 1;
        
        return null;
    }

    // Normalize region names
    function normalizeRegion(place) {
        if (!place) return null;
        let r = place.trim();
        if (r.length < 2) return null;

        const lower = r.toLowerCase();
        
        // Known regions mapping
        const map = {
            'turbat': 'Turbat', 'quetta': 'Quetta', 'gwadar': 'Gwadar',
            'panjgur': 'Panjgur', 'khuzdar': 'Khuzdar', 'awaran': 'Awaran',
            'kech': 'Kech', 'mastung': 'Mastung', 'kalat': 'Kalat',
            'lasbela': 'Lasbela', 'dera bugti': 'Dera Bugti', 'kohlu': 'Kohlu',
            'sibi': 'Sibi', 'zhob': 'Zhob', 'loralai': 'Loralai',
            'pishin': 'Pishin', 'chagai': 'Chagai', 'nushki': 'Nushki',
            'washuk': 'Washuk', 'baluchistan': 'Baluchistan', 'balochistan': 'Baluchistan',
            'karachi': 'Karachi', 'hub': 'Hub', 'pasni': 'Pasni',
            'jiwani': 'Jiwani', 'ormara': 'Ormara', 'bela': 'Bela',
            'zahedan': 'Zahedan', 'chabahar': 'Chabahar', 'iranshahr': 'Iranshahr',
            'saravan': 'Saravan', 'sistan': 'Sistan-Baluchestan'
        };

        for (const [key, val] of Object.entries(map)) {
            if (lower.includes(key)) return val;
        }

        // Capitalize words
        return r.split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
            .join(' ');
    }

    // Render key numbers
    function renderKeyNumbers(stats) {
        const total = document.getElementById('totalMartyrs');
        const regions = document.getElementById('totalRegions');
        const yearSpan = document.getElementById('yearSpan');
        const stories = document.getElementById('withStories');

        if (total) total.textContent = stats.total.toLocaleString();
        if (regions) regions.textContent = stats.regionCount;
        if (yearSpan) {
            yearSpan.textContent = stats.years.length > 0 
                ? `${stats.minYear}–${stats.maxYear}`
                : '—';
        }
        if (stories) stories.textContent = `${stats.storyPercent}%`;
    }

    // Render timeline chart
    function renderTimeline(stats) {
        const canvas = document.getElementById('timelineChart');
        if (!canvas || stats.years.length === 0) return;

        if (timelineChart) timelineChart.destroy();

        // Build labels and data - fill gaps
        const labels = [];
        const data = [];
        
        for (let y = stats.minYear; y <= stats.maxYear; y++) {
            labels.push(y.toString());
            data.push(stats.byYear[y] || 0);
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        const textColor = isDark ? '#94a3b8' : '#64748b';

        timelineChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: isDark ? 'rgba(134, 239, 172, 0.7)' : 'rgba(44, 85, 48, 0.7)',
                    borderColor: isDark ? '#86efac' : '#2c5530',
                    borderWidth: 1,
                    borderRadius: 3,
                    barPercentage: 0.7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#fff',
                        titleColor: isDark ? '#f1f5f9' : '#1e293b',
                        bodyColor: isDark ? '#cbd5e1' : '#475569',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            title: ctx => ctx[0].label,
                            label: ctx => `${ctx.raw} documented`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { 
                            color: textColor,
                            maxRotation: 45,
                            font: { size: 11 }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            stepSize: 1,
                            font: { size: 11 },
                            callback: v => Number.isInteger(v) ? v : ''
                        }
                    }
                }
            }
        });
    }

    // Render regions list
    function renderRegions(stats) {
        const list = document.getElementById('regionsList');
        if (!list) return;

        // Sort by count, take top 8
        const sorted = Object.entries(stats.byRegion)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

        if (sorted.length === 0) {
            list.innerHTML = '<li class="bar-item"><span style="color: #64748b;">No region data</span></li>';
            return;
        }

        const maxCount = sorted[0][1];

        list.innerHTML = sorted.map(([region, count], i) => {
            const pct = Math.round((count / maxCount) * 100);
            return `
                <li class="bar-item">
                    <span class="bar-rank">${i + 1}</span>
                    <div class="bar-info">
                        <div class="bar-label">${escapeHTML(region)}</div>
                        <div class="bar-track">
                            <div class="bar-fill" style="width: ${pct}%"></div>
                        </div>
                    </div>
                    <span class="bar-value">${count}</span>
                </li>
            `;
        }).join('');
    }

    // Render monthly chart
    function renderMonthly(stats) {
        const canvas = document.getElementById('monthlyChart');
        if (!canvas) return;

        if (monthlyChart) monthlyChart.destroy();

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)';
        const textColor = isDark ? '#94a3b8' : '#64748b';

        // Create gradient
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 200);
        gradient.addColorStop(0, isDark ? 'rgba(134, 239, 172, 0.3)' : 'rgba(44, 85, 48, 0.3)');
        gradient.addColorStop(1, isDark ? 'rgba(134, 239, 172, 0.02)' : 'rgba(44, 85, 48, 0.02)');

        monthlyChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: MONTHS,
                datasets: [{
                    data: stats.byMonth,
                    fill: true,
                    backgroundColor: gradient,
                    borderColor: isDark ? '#86efac' : '#2c5530',
                    borderWidth: 2,
                    tension: 0.4,
                    pointBackgroundColor: isDark ? '#86efac' : '#2c5530',
                    pointBorderColor: isDark ? '#1e293b' : '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#fff',
                        titleColor: isDark ? '#f1f5f9' : '#1e293b',
                        bodyColor: isDark ? '#cbd5e1' : '#475569',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderWidth: 1,
                        padding: 10,
                        displayColors: false,
                        callbacks: {
                            title: ctx => FULL_MONTHS[ctx[0].dataIndex],
                            label: ctx => `${ctx.raw} documented`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { size: 10 } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            stepSize: 1,
                            font: { size: 10 },
                            callback: v => Number.isInteger(v) ? v : ''
                        }
                    }
                }
            }
        });
    }

    // Render insights
    function renderInsights(stats) {
        const container = document.getElementById('insightsRow');
        if (!container) return;

        const insights = [];

        // Peak year
        if (stats.years.length > 0) {
            const peakYear = Object.entries(stats.byYear)
                .sort((a, b) => b[1] - a[1])[0];
            insights.push({
                label: 'Highest Year',
                value: `${peakYear[0]} (${peakYear[1]} martyrs)`
            });
        }

        // Top region
        const topRegions = Object.entries(stats.byRegion).sort((a, b) => b[1] - a[1]);
        if (topRegions.length > 0) {
            const pct = Math.round((topRegions[0][1] / stats.total) * 100);
            insights.push({
                label: 'Most Affected',
                value: `${topRegions[0][0]} (${pct}%)`
            });
        }

        // Peak month
        const maxMonthIdx = stats.byMonth.indexOf(Math.max(...stats.byMonth));
        if (stats.byMonth[maxMonthIdx] > 0) {
            insights.push({
                label: 'Peak Month',
                value: FULL_MONTHS[maxMonthIdx]
            });
        }

        // Documentation
        insights.push({
            label: 'With Biographies',
            value: `${stats.withBio} of ${stats.total} (${stats.storyPercent}%)`
        });

        container.innerHTML = insights.map(i => `
            <div class="insight-item">
                <div class="insight-label">${i.label}</div>
                <div class="insight-value">${i.value}</div>
            </div>
        `).join('');
    }

    // Escape HTML
    function escapeHTML(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Re-render on theme change
    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
            if (m.attributeName === 'data-theme') {
                setTimeout(loadData, 50);
            }
        });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

})();
