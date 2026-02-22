/**
 * Statistics Dashboard - Baluch Martyrs Memorial
 * Professional data visualization and analytics
 */

(function() {
    'use strict';

    // Chart instances for cleanup/updates
    let charts = {
        timeline: null,
        regions: null,
        organizations: null,
        monthly: null
    };

    // Color palette matching site theme
    const COLORS = {
        primary: '#2c5530',
        primaryLight: '#3d7342',
        accent: '#d4af37',
        accentLight: '#f0c929',
        gradient: [
            '#2c5530', '#3d7342', '#4e8a54', '#5f9c66',
            '#d4af37', '#e0c35c', '#ecd780', '#f8eba5'
        ],
        chart: [
            'rgba(44, 85, 48, 0.8)',
            'rgba(212, 175, 55, 0.8)',
            'rgba(61, 115, 66, 0.8)',
            'rgba(240, 201, 41, 0.8)',
            'rgba(78, 138, 84, 0.8)',
            'rgba(224, 195, 92, 0.8)',
            'rgba(95, 156, 102, 0.8)',
            'rgba(236, 215, 128, 0.8)'
        ]
    };

    // Month names
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Initialize dashboard
    document.addEventListener('DOMContentLoaded', function() {
        console.log('📊 Statistics dashboard initializing...');
        loadData();
    });

    // Load martyrs data
    async function loadData() {
        const loadingEl = document.getElementById('statsLoading');
        const emptyEl = document.getElementById('statsEmpty');
        const contentEl = document.getElementById('dashboardContent');

        try {
            let martyrs = [];

            // Method 1: Try Firebase directly
            if (window.firebaseDB && typeof window.firebaseDB.getApprovedMartyrs === 'function') {
                console.log('📊 Fetching data from Firebase...');
                const result = await window.firebaseDB.getApprovedMartyrs();
                if (result && result.success && Array.isArray(result.data)) {
                    martyrs = result.data;
                    console.log(`✅ Got ${martyrs.length} martyrs from Firebase`);
                }
            }

            // Method 2: Try API
            if (martyrs.length === 0) {
                try {
                    console.log('📊 Trying API fallback...');
                    const response = await fetch('/api/get-martyrs');
                    if (response.ok) {
                        const data = await response.json();
                        if (Array.isArray(data)) {
                            martyrs = data;
                            console.log(`✅ Got ${martyrs.length} martyrs from API`);
                        }
                    }
                } catch (apiError) {
                    console.warn('API fallback failed:', apiError);
                }
            }

            // Method 3: localStorage fallback
            if (martyrs.length === 0) {
                console.log('📊 Trying localStorage fallback...');
                const saved = localStorage.getItem('martyrsData');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    martyrs = parsed.filter(m => !m.status || m.status === 'approved');
                    console.log(`✅ Got ${martyrs.length} martyrs from localStorage`);
                }
            }

            // Hide loading
            if (loadingEl) loadingEl.style.display = 'none';

            // Check if we have data
            if (martyrs.length === 0) {
                if (emptyEl) emptyEl.style.display = 'block';
                return;
            }

            // Show dashboard
            if (contentEl) contentEl.style.display = 'block';

            // Process and render
            const stats = processData(martyrs);
            renderSummary(stats);
            renderCharts(stats);
            renderInsights(stats);
            renderRegionsTable(stats);

            console.log('✅ Statistics dashboard rendered successfully');

        } catch (error) {
            console.error('❌ Failed to load statistics:', error);
            if (loadingEl) loadingEl.style.display = 'none';
            if (emptyEl) {
                emptyEl.style.display = 'block';
                emptyEl.querySelector('h3').textContent = 'Error Loading Data';
                emptyEl.querySelector('p').textContent = 'Please try refreshing the page.';
            }
        }
    }

    // Process raw data into statistics
    function processData(martyrs) {
        const stats = {
            total: martyrs.length,
            withBio: 0,
            byYear: {},
            byMonth: new Array(12).fill(0),
            byRegion: {},
            byOrganization: {},
            years: [],
            regionDetails: {}
        };

        martyrs.forEach(martyr => {
            // Count biographies
            if (martyr.biography && martyr.biography.trim().length > 20) {
                stats.withBio++;
            }

            // Extract year from martyrdom date
            const year = extractYear(martyr.martyrdomDate);
            if (year) {
                stats.byYear[year] = (stats.byYear[year] || 0) + 1;
                if (!stats.years.includes(year)) {
                    stats.years.push(year);
                }
            }

            // Extract month
            const month = extractMonth(martyr.martyrdomDate);
            if (month !== null) {
                stats.byMonth[month]++;
            }

            // Region (martyrdom place or birth place)
            const region = normalizeRegion(martyr.martyrdomPlace || martyr.birthPlace);
            if (region) {
                stats.byRegion[region] = (stats.byRegion[region] || 0) + 1;
                
                // Track year range per region
                if (!stats.regionDetails[region]) {
                    stats.regionDetails[region] = { count: 0, years: [] };
                }
                stats.regionDetails[region].count++;
                if (year) {
                    stats.regionDetails[region].years.push(year);
                }
            }

            // Organization
            const org = martyr.organization ? martyr.organization.trim() : 'Unknown';
            if (org && org !== 'Unknown' && org.length > 0) {
                stats.byOrganization[org] = (stats.byOrganization[org] || 0) + 1;
            }
        });

        // Sort years
        stats.years.sort((a, b) => a - b);

        // Calculate year span
        if (stats.years.length > 0) {
            stats.minYear = Math.min(...stats.years);
            stats.maxYear = Math.max(...stats.years);
            stats.yearSpan = stats.maxYear - stats.minYear + 1;
        } else {
            stats.yearSpan = 0;
        }

        // Count unique regions
        stats.regionCount = Object.keys(stats.byRegion).length;

        return stats;
    }

    // Extract year from date string
    function extractYear(dateStr) {
        if (!dateStr) return null;
        
        // Handle various formats
        const str = String(dateStr).trim();
        
        // YYYY-MM-DD or YYYY/MM/DD
        const isoMatch = str.match(/^(\d{4})/);
        if (isoMatch) return parseInt(isoMatch[1]);
        
        // DD/MM/YYYY or MM/DD/YYYY
        const dmyMatch = str.match(/(\d{4})$/);
        if (dmyMatch) return parseInt(dmyMatch[1]);
        
        // Just a year
        const yearOnly = str.match(/^\d{4}$/);
        if (yearOnly) return parseInt(str);
        
        return null;
    }

    // Extract month (0-11) from date string
    function extractMonth(dateStr) {
        if (!dateStr) return null;
        
        const str = String(dateStr).trim();
        
        // YYYY-MM-DD
        const isoMatch = str.match(/^\d{4}-(\d{2})/);
        if (isoMatch) return parseInt(isoMatch[1]) - 1;
        
        // DD/MM/YYYY
        const dmyMatch = str.match(/^\d{2}\/(\d{2})\/\d{4}/);
        if (dmyMatch) return parseInt(dmyMatch[1]) - 1;
        
        return null;
    }

    // Normalize region names
    function normalizeRegion(place) {
        if (!place) return null;
        
        let region = place.trim();
        
        // Common normalizations
        const normalizations = {
            'turbat': 'Turbat',
            'quetta': 'Quetta',
            'gwadar': 'Gwadar',
            'panjgur': 'Panjgur',
            'khuzdar': 'Khuzdar',
            'awaran': 'Awaran',
            'kech': 'Kech',
            'mastung': 'Mastung',
            'kalat': 'Kalat',
            'lasbela': 'Lasbela',
            'dera bugti': 'Dera Bugti',
            'kohlu': 'Kohlu',
            'sibi': 'Sibi',
            'zhob': 'Zhob',
            'loralai': 'Loralai',
            'barkhan': 'Barkhan',
            'musakhel': 'Musakhel',
            'sherani': 'Sherani',
            'ziarat': 'Ziarat',
            'harnai': 'Harnai',
            'pishin': 'Pishin',
            'killa abdullah': 'Killa Abdullah',
            'killa saifullah': 'Killa Saifullah',
            'chagai': 'Chagai',
            'nushki': 'Nushki',
            'washuk': 'Washuk',
            'baluchistan': 'Baluchistan',
            'balochistan': 'Baluchistan',
            'iran': 'Iranian Baluchistan',
            'sistan': 'Sistan-Baluchestan',
            'zahedan': 'Zahedan',
            'chabahar': 'Chabahar',
            'iranshahr': 'Iranshahr',
            'saravan': 'Saravan'
        };

        const lower = region.toLowerCase();
        for (const [key, value] of Object.entries(normalizations)) {
            if (lower.includes(key)) {
                return value;
            }
        }

        // Capitalize first letter of each word
        return region.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');
    }

    // Render summary cards
    function renderSummary(stats) {
        document.getElementById('totalMartyrs').textContent = stats.total.toLocaleString();
        document.getElementById('yearSpan').textContent = stats.yearSpan > 0 
            ? `${stats.minYear}-${stats.maxYear}` 
            : '--';
        document.getElementById('totalRegions').textContent = stats.regionCount;
        document.getElementById('withBiographies').textContent = stats.withBio.toLocaleString();
    }

    // Render all charts
    function renderCharts(stats) {
        renderTimelineChart(stats);
        renderRegionsChart(stats);
        renderOrganizationsChart(stats);
        renderMonthlyChart(stats);
    }

    // Timeline chart (by year)
    function renderTimelineChart(stats) {
        const ctx = document.getElementById('timelineChart');
        if (!ctx) return;

        // Destroy existing chart
        if (charts.timeline) {
            charts.timeline.destroy();
        }

        // Prepare data - fill gaps in years
        const years = [];
        const counts = [];
        
        if (stats.years.length > 0) {
            for (let y = stats.minYear; y <= stats.maxYear; y++) {
                years.push(y.toString());
                counts.push(stats.byYear[y] || 0);
            }
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        charts.timeline = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: years,
                datasets: [{
                    label: 'Martyrs',
                    data: counts,
                    backgroundColor: createGradient(ctx, COLORS.primary, COLORS.accent),
                    borderColor: COLORS.primary,
                    borderWidth: 1,
                    borderRadius: 4,
                    barPercentage: 0.8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#fff',
                        titleColor: isDark ? '#f1f5f9' : COLORS.primary,
                        bodyColor: isDark ? '#cbd5e1' : '#475569',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderWidth: 1,
                        padding: 12,
                        displayColors: false,
                        callbacks: {
                            title: (items) => `Year ${items[0].label}`,
                            label: (item) => `${item.raw} martyr${item.raw !== 1 ? 's' : ''}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: isDark ? '#94a3b8' : '#64748b',
                            maxRotation: 45,
                            minRotation: 0
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            color: isDark ? '#94a3b8' : '#64748b',
                            stepSize: 1,
                            callback: (value) => Number.isInteger(value) ? value : ''
                        }
                    }
                }
            }
        });
    }

    // Regions doughnut chart
    function renderRegionsChart(stats) {
        const ctx = document.getElementById('regionsChart');
        if (!ctx) return;

        if (charts.regions) {
            charts.regions.destroy();
        }

        // Get top 8 regions
        const sorted = Object.entries(stats.byRegion)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8);

        const labels = sorted.map(([region]) => region);
        const data = sorted.map(([, count]) => count);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        charts.regions = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: COLORS.chart,
                    borderColor: isDark ? '#1e293b' : '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: isDark ? '#cbd5e1' : '#475569',
                            padding: 12,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#fff',
                        titleColor: isDark ? '#f1f5f9' : COLORS.primary,
                        bodyColor: isDark ? '#cbd5e1' : '#475569',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderWidth: 1,
                        callbacks: {
                            label: (item) => {
                                const pct = ((item.raw / stats.total) * 100).toFixed(1);
                                return `${item.label}: ${item.raw} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // Organizations chart
    function renderOrganizationsChart(stats) {
        const ctx = document.getElementById('organizationsChart');
        if (!ctx) return;

        if (charts.organizations) {
            charts.organizations.destroy();
        }

        // Get top organizations
        const sorted = Object.entries(stats.byOrganization)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6);

        if (sorted.length === 0) {
            // Show "No organization data" message
            ctx.parentElement.innerHTML = '<p style="text-align: center; color: #64748b; padding: 3rem;">No organization data available</p>';
            return;
        }

        const labels = sorted.map(([org]) => truncateLabel(org, 20));
        const data = sorted.map(([, count]) => count);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        charts.organizations = new Chart(ctx, {
            type: 'polarArea',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: COLORS.chart.map(c => c.replace('0.8', '0.7')),
                    borderColor: isDark ? '#1e293b' : '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: isDark ? '#cbd5e1' : '#475569',
                            padding: 10,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#fff',
                        titleColor: isDark ? '#f1f5f9' : COLORS.primary,
                        bodyColor: isDark ? '#cbd5e1' : '#475569',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderWidth: 1
                    }
                },
                scales: {
                    r: {
                        ticks: {
                            display: false
                        },
                        grid: {
                            color: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                        }
                    }
                }
            }
        });
    }

    // Monthly distribution chart
    function renderMonthlyChart(stats) {
        const ctx = document.getElementById('monthlyChart');
        if (!ctx) return;

        if (charts.monthly) {
            charts.monthly.destroy();
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        charts.monthly = new Chart(ctx, {
            type: 'line',
            data: {
                labels: MONTHS,
                datasets: [{
                    label: 'Martyrdoms',
                    data: stats.byMonth,
                    fill: true,
                    backgroundColor: createGradient(ctx, 'rgba(44, 85, 48, 0.3)', 'rgba(44, 85, 48, 0.05)'),
                    borderColor: COLORS.primary,
                    borderWidth: 2,
                    tension: 0.4,
                    pointBackgroundColor: COLORS.primary,
                    pointBorderColor: isDark ? '#1e293b' : '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: isDark ? '#1e293b' : '#fff',
                        titleColor: isDark ? '#f1f5f9' : COLORS.primary,
                        bodyColor: isDark ? '#cbd5e1' : '#475569',
                        borderColor: isDark ? '#334155' : '#e2e8f0',
                        borderWidth: 1,
                        callbacks: {
                            title: (items) => MONTHS[items[0].dataIndex],
                            label: (item) => `${item.raw} martyrdom${item.raw !== 1 ? 's' : ''}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: isDark ? '#94a3b8' : '#64748b'
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(0, 0, 0, 0.05)'
                        },
                        ticks: {
                            color: isDark ? '#94a3b8' : '#64748b',
                            stepSize: 1,
                            callback: (value) => Number.isInteger(value) ? value : ''
                        }
                    }
                }
            }
        });
    }

    // Create gradient for charts
    function createGradient(ctx, color1, color2) {
        const canvas = ctx.getContext ? ctx : ctx.canvas;
        const context = canvas.getContext('2d');
        const gradient = context.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, color1);
        gradient.addColorStop(1, color2);
        return gradient;
    }

    // Truncate long labels
    function truncateLabel(label, maxLength) {
        if (label.length <= maxLength) return label;
        return label.substring(0, maxLength - 3) + '...';
    }

    // Render key insights
    function renderInsights(stats) {
        const container = document.getElementById('insightsGrid');
        if (!container) return;

        const insights = [];

        // Peak year
        if (stats.years.length > 0) {
            const peakYear = Object.entries(stats.byYear)
                .sort((a, b) => b[1] - a[1])[0];
            insights.push({
                icon: '📈',
                title: 'Peak Year',
                text: `<span class="insight-highlight">${peakYear[0]}</span> saw the highest number of martyrdoms with <span class="insight-highlight">${peakYear[1]}</span> recorded cases.`
            });
        }

        // Top region
        if (Object.keys(stats.byRegion).length > 0) {
            const topRegion = Object.entries(stats.byRegion)
                .sort((a, b) => b[1] - a[1])[0];
            const pct = ((topRegion[1] / stats.total) * 100).toFixed(1);
            insights.push({
                icon: '🗺️',
                title: 'Most Affected Region',
                text: `<span class="insight-highlight">${topRegion[0]}</span> accounts for <span class="insight-highlight">${pct}%</span> of all documented martyrs.`
            });
        }

        // Peak month
        const maxMonth = stats.byMonth.indexOf(Math.max(...stats.byMonth));
        if (stats.byMonth[maxMonth] > 0) {
            insights.push({
                icon: '📅',
                title: 'Peak Month',
                text: `<span class="insight-highlight">${MONTHS[maxMonth]}</span> has historically seen the most martyrdoms.`
            });
        }

        // Biography coverage
        if (stats.total > 0) {
            const bioPct = ((stats.withBio / stats.total) * 100).toFixed(1);
            insights.push({
                icon: '📚',
                title: 'Documentation',
                text: `<span class="insight-highlight">${bioPct}%</span> of martyrs have documented biographies, preserving their stories for future generations.`
            });
        }

        // Render insights
        container.innerHTML = insights.map(insight => `
            <div class="insight-card">
                <h4>${insight.icon} ${insight.title}</h4>
                <p>${insight.text}</p>
            </div>
        `).join('');
    }

    // Render regions table
    function renderRegionsTable(stats) {
        const tbody = document.getElementById('regionsTableBody');
        if (!tbody) return;

        const sorted = Object.entries(stats.byRegion)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

        tbody.innerHTML = sorted.map(([region, count]) => {
            const pct = ((count / stats.total) * 100).toFixed(1);
            const details = stats.regionDetails[region];
            let yearRange = '--';
            
            if (details && details.years.length > 0) {
                const minY = Math.min(...details.years);
                const maxY = Math.max(...details.years);
                yearRange = minY === maxY ? minY.toString() : `${minY} - ${maxY}`;
            }

            return `
                <tr>
                    <td><span class="region-badge">${escapeHTML(region)}</span></td>
                    <td>${count}</td>
                    <td>${pct}%</td>
                    <td>${yearRange}</td>
                </tr>
            `;
        }).join('');
    }

    // Escape HTML to prevent XSS
    function escapeHTML(str) {
        if (!str) return '';
        return str.toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Listen for theme changes to update charts
    const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName === 'data-theme') {
                // Re-render charts with new theme colors
                setTimeout(() => {
                    loadData();
                }, 100);
            }
        });
    });

    themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme']
    });

})();
