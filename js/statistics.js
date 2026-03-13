/**
 * Statistics Dashboard - Baluch Martyrs Memorial
 * Clean, human-centered data visualization
 */

(function() {
    'use strict';

    // Chart instances
    let timelineChart = null;
    let monthlyChart = null;
    
    // Store martyrs data for PDF generation
    let allMartyrsData = [];

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

            // Store martyrs for PDF generation
            allMartyrsData = martyrs;
            
            // Process and render
            const stats = processData(martyrs);
            renderKeyNumbers(stats);
            render3DTimelineRibbon(stats);
            renderTimeline(stats);
            renderRegions(stats);
            renderMonthly(stats);
            renderInsights(stats);
            
            // Setup PDF download button
            setupPdfDownload();
            
            // Update download info
            const downloadInfo = document.getElementById('downloadInfo');
            if (downloadInfo) {
                downloadInfo.textContent = `PDF includes ${martyrs.length} profiles with photos and biographies`;
            }

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

    // ============================================
    // 3D TIMELINE RIBBON
    // ============================================
    
    function render3DTimelineRibbon(stats) {
        const ribbon = document.getElementById('timelineRibbon');
        if (!ribbon) {
            console.log('Timeline ribbon element not found');
            return;
        }
        
        console.log('Rendering 3D timeline with stats:', stats.years, stats.byYear);
        
        // Check if we have year data
        if (!stats.years || stats.years.length === 0) {
            ribbon.innerHTML = '<div class="timeline-empty">No timeline data available yet. Add martyrs with dates to see the timeline.</div>';
            return;
        }
        
        // Find max count for scaling
        const maxCount = Math.max(...Object.values(stats.byYear));
        
        // Find peak year
        const peakYear = Object.entries(stats.byYear)
            .sort((a, b) => b[1] - a[1])[0][0];
        
        // Build complete year range (fill gaps)
        const yearCards = [];
        for (let year = stats.minYear; year <= stats.maxYear; year++) {
            const count = stats.byYear[year] || 0;
            const barScale = maxCount > 0 ? (count / maxCount) : 0;
            const isHighlight = year.toString() === peakYear;
            
            yearCards.push(`
                <div class="timeline-year${isHighlight ? ' highlight' : ''}" data-year="${year}" data-count="${count}">
                    <div class="year-label">${year}</div>
                    <div class="year-count">${count}</div>
                    <div class="year-subtitle">${count === 1 ? 'martyr' : 'martyrs'}</div>
                    <div class="year-bar" style="transform: scaleX(${barScale})"></div>
                </div>
            `);
        }
        
        ribbon.innerHTML = yearCards.join('');
        
        // Initialize drag/scroll interaction
        initTimelineInteraction(ribbon);
        
        // Initialize navigation buttons
        initTimelineNavigation(ribbon);
        
        // Add entrance animation
        animateTimelineEntrance(ribbon);
    }
    
    // Initialize drag-to-scroll interaction
    function initTimelineInteraction(ribbon) {
        let isDown = false;
        let startX;
        let scrollLeft;
        let velocity = 0;
        let animationId = null;
        
        // Mouse events
        ribbon.addEventListener('mousedown', (e) => {
            isDown = true;
            ribbon.classList.add('dragging');
            startX = e.pageX - ribbon.offsetLeft;
            scrollLeft = ribbon.scrollLeft;
            velocity = 0;
            if (animationId) cancelAnimationFrame(animationId);
        });
        
        ribbon.addEventListener('mouseleave', () => {
            if (isDown) {
                isDown = false;
                ribbon.classList.remove('dragging');
                applyMomentum(ribbon, velocity);
            }
        });
        
        ribbon.addEventListener('mouseup', () => {
            isDown = false;
            ribbon.classList.remove('dragging');
            applyMomentum(ribbon, velocity);
        });
        
        ribbon.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - ribbon.offsetLeft;
            const walk = (x - startX) * 1.5; // Scroll speed multiplier
            const newScrollLeft = scrollLeft - walk;
            velocity = ribbon.scrollLeft - newScrollLeft;
            ribbon.scrollLeft = newScrollLeft;
        });
        
        // Touch events for mobile
        let touchStartX;
        let touchScrollLeft;
        let lastTouchX;
        let lastTouchTime;
        
        ribbon.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].pageX;
            touchScrollLeft = ribbon.scrollLeft;
            lastTouchX = touchStartX;
            lastTouchTime = Date.now();
            velocity = 0;
            if (animationId) cancelAnimationFrame(animationId);
        }, { passive: true });
        
        ribbon.addEventListener('touchmove', (e) => {
            if (!touchStartX) return;
            const touchX = e.touches[0].pageX;
            const walk = touchStartX - touchX;
            ribbon.scrollLeft = touchScrollLeft + walk;
            
            // Calculate velocity
            const now = Date.now();
            const dt = now - lastTouchTime;
            if (dt > 0) {
                velocity = (lastTouchX - touchX) / dt * 16; // Normalize to ~60fps
            }
            lastTouchX = touchX;
            lastTouchTime = now;
        }, { passive: true });
        
        ribbon.addEventListener('touchend', () => {
            applyMomentum(ribbon, velocity);
            touchStartX = null;
        }, { passive: true });
        
        // Apply momentum scrolling
        function applyMomentum(element, initialVelocity) {
            let vel = initialVelocity * 0.95;
            
            function step() {
                if (Math.abs(vel) < 0.5) return;
                
                element.scrollLeft += vel;
                vel *= 0.95; // Friction
                animationId = requestAnimationFrame(step);
            }
            
            animationId = requestAnimationFrame(step);
        }
        
        // Mouse wheel horizontal scroll
        ribbon.addEventListener('wheel', (e) => {
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // Natural horizontal scroll
            e.preventDefault();
            ribbon.scrollLeft += e.deltaY;
        }, { passive: false });
    }
    
    // Initialize navigation buttons
    function initTimelineNavigation(ribbon) {
        const prevBtn = document.getElementById('timelinePrev');
        const nextBtn = document.getElementById('timelineNext');
        
        if (!prevBtn || !nextBtn) return;
        
        const scrollAmount = 300; // Pixels to scroll per click
        
        prevBtn.addEventListener('click', () => {
            ribbon.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
        });
        
        nextBtn.addEventListener('click', () => {
            ribbon.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        });
        
        // Update button states
        function updateButtonStates() {
            prevBtn.disabled = ribbon.scrollLeft <= 0;
            nextBtn.disabled = ribbon.scrollLeft >= ribbon.scrollWidth - ribbon.clientWidth - 10;
        }
        
        ribbon.addEventListener('scroll', updateButtonStates);
        updateButtonStates();
        
        // Keyboard navigation
        ribbon.setAttribute('tabindex', '0');
        ribbon.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                ribbon.scrollBy({ left: -150, behavior: 'smooth' });
            } else if (e.key === 'ArrowRight') {
                ribbon.scrollBy({ left: 150, behavior: 'smooth' });
            }
        });
    }
    
    // Animate entrance of timeline cards
    function animateTimelineEntrance(ribbon) {
        const cards = ribbon.querySelectorAll('.timeline-year');
        
        // If no cards or reduced motion preference, skip animation
        if (cards.length === 0) return;
        
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        
        if (prefersReducedMotion) {
            // No animation for users who prefer reduced motion
            cards.forEach(card => {
                card.style.opacity = '1';
            });
            return;
        }
        
        // Limit animation to first 20 cards to avoid performance issues
        const maxAnimatedCards = Math.min(cards.length, 20);
        
        cards.forEach((card, index) => {
            if (index < maxAnimatedCards) {
                card.style.opacity = '0';
                card.style.transform = 'translateZ(-50px) rotateY(15deg)';
                
                setTimeout(() => {
                    card.style.transition = 'all 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
                    card.style.opacity = '1';
                    card.style.transform = 'translateZ(0) rotateY(0deg)';
                }, 50 + (index * 40)); // Staggered animation
            } else {
                // Cards beyond limit show immediately
                card.style.opacity = '1';
            }
        });
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

    // ============================================
    // PDF GENERATION - Professional Multi-Page Layout
    // ============================================
    
    function setupPdfDownload() {
        const btn = document.getElementById('downloadPdfBtn');
        if (!btn) return;
        
        btn.addEventListener('click', generatePdf);
    }
    
    async function generatePdf() {
        const btn = document.getElementById('downloadPdfBtn');
        const progress = document.getElementById('downloadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        
        if (!allMartyrsData || allMartyrsData.length === 0) {
            alert('No data available to download.');
            return;
        }
        
        // Check if jsPDF is loaded
        if (typeof window.jspdf === 'undefined') {
            alert('PDF library not loaded. Please refresh and try again.');
            return;
        }
        
        const { jsPDF } = window.jspdf;
        
        // Disable button, show progress
        btn.disabled = true;
        btn.innerHTML = '<div class="spinner"></div><span>Generating...</span>';
        if (progress) progress.style.display = 'block';
        
        try {
            // Sort martyrs alphabetically
            const sortedMartyrs = [...allMartyrsData].sort((a, b) => 
                (a.fullName || '').localeCompare(b.fullName || '')
            );
            
            // Create PDF (A4 size)
            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });
            
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 15;
            const contentWidth = pageWidth - (margin * 2);
            const footerHeight = 18;
            const headerHeight = 17;
            const maxContentY = pageHeight - footerHeight - 5; // Bottom boundary for content
            
            // Colors
            const primaryColor = [44, 85, 48];
            const accentColor = [212, 175, 55];
            const textColor = [51, 65, 85];
            const lightGray = [148, 163, 184];
            
            // Helper: Draw page header for continuation pages
            function drawContinuationHeader(martyrName, profileNum, totalProfiles) {
                doc.setFillColor(...primaryColor);
                doc.rect(0, 0, pageWidth, 12, 'F');
                doc.setFillColor(...accentColor);
                doc.rect(0, 12, pageWidth, 1.5, 'F');
                
                doc.setFontSize(8);
                doc.setTextColor(255, 255, 255);
                doc.setFont('helvetica', 'normal');
                doc.text('Baluch Martyrs Memorial', margin, 8);
                doc.text(`${martyrName} (continued)`, pageWidth / 2, 8, { align: 'center' });
                doc.text(`${profileNum} of ${totalProfiles}`, pageWidth - margin, 8, { align: 'right' });
            }
            
            // Helper: Draw page footer
            function drawPageFooter() {
                doc.setFillColor(...primaryColor);
                doc.rect(0, pageHeight - footerHeight, pageWidth, footerHeight, 'F');
                
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(7);
                doc.setFont('helvetica', 'italic');
                doc.text('Forever remembered. Forever honored.', pageWidth / 2, pageHeight - 8, { align: 'center' });
            }
            
            // ---- COVER PAGE ----
            updateProgress(progressFill, progressText, 5, 'Creating cover page...');
            
            // Green header bar
            doc.setFillColor(...primaryColor);
            doc.rect(0, 0, pageWidth, 80, 'F');
            
            // Gold accent line
            doc.setFillColor(...accentColor);
            doc.rect(0, 80, pageWidth, 3, 'F');
            
            // Title
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(28);
            doc.setFont('helvetica', 'bold');
            doc.text('Baluch Martyrs Memorial', pageWidth / 2, 40, { align: 'center' });
            
            doc.setFontSize(14);
            doc.setFont('helvetica', 'normal');
            doc.text('A Digital Archive of Heroes', pageWidth / 2, 52, { align: 'center' });
            
            // Memorial info box
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(margin, 100, contentWidth, 60, 3, 3, 'F');
            
            doc.setTextColor(...textColor);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text('Memorial Archive', pageWidth / 2, 115, { align: 'center' });
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(11);
            const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            doc.text(`Generated: ${date}`, pageWidth / 2, 128, { align: 'center' });
            doc.text(`Total Profiles: ${sortedMartyrs.length}`, pageWidth / 2, 140, { align: 'center' });
            
            // Dedication
            doc.setFontSize(10);
            doc.setTextColor(...lightGray);
            doc.text('Preserving the memory of those who sacrificed for freedom', pageWidth / 2, 180, { align: 'center' });
            
            // Footer
            doc.setFontSize(9);
            doc.text('baluchmartyrs.site', pageWidth / 2, pageHeight - 20, { align: 'center' });
            
            // ---- MARTYR PROFILES ----
            
            for (let i = 0; i < sortedMartyrs.length; i++) {
                const martyr = sortedMartyrs[i];
                const progressPercent = Math.round(10 + ((i / sortedMartyrs.length) * 85));
                updateProgress(progressFill, progressText, progressPercent, `Processing ${i + 1} of ${sortedMartyrs.length}...`);
                
                const martyrName = martyr.fullName || 'Unnamed Martyr';
                const profileNum = i + 1;
                
                // New page for each martyr
                doc.addPage();
                
                // Page header bar
                doc.setFillColor(...primaryColor);
                doc.rect(0, 0, pageWidth, 15, 'F');
                doc.setFontSize(9);
                doc.setTextColor(255, 255, 255);
                doc.text('Baluch Martyrs Memorial', margin, 10);
                doc.text(`${profileNum} of ${sortedMartyrs.length}`, pageWidth - margin, 10, { align: 'right' });
                
                // Gold accent line under header
                doc.setFillColor(...accentColor);
                doc.rect(0, 15, pageWidth, 2, 'F');
                
                let yPos = 28;
                
                // Profile layout with photo on left
                const photoSize = 45;
                const photoX = margin;
                const photoY = yPos;
                const textStartX = margin + photoSize + 12;
                const textWidth = contentWidth - photoSize - 12;
                
                // Photo (only if available)
                let hasPhoto = false;
                if (martyr.photo && martyr.photo.startsWith('data:image')) {
                    try {
                        doc.addImage(martyr.photo, 'JPEG', photoX, photoY, photoSize, photoSize * 1.25);
                        hasPhoto = true;
                    } catch (e) {
                        hasPhoto = false;
                    }
                }
                
                // If no photo, start text from left margin
                const actualTextX = hasPhoto ? textStartX : margin;
                const actualTextWidth = hasPhoto ? textWidth : contentWidth;
                
                // Name (large, prominent)
                doc.setTextColor(...primaryColor);
                doc.setFontSize(18);
                doc.setFont('helvetica', 'bold');
                
                // Handle long names
                const nameLines = doc.splitTextToSize(martyrName, actualTextWidth);
                nameLines.forEach((line, idx) => {
                    doc.text(line, actualTextX, yPos + 6 + (idx * 7));
                });
                
                // Decorative line under name
                const nameEndY = yPos + 6 + ((nameLines.length - 1) * 7) + 4;
                doc.setDrawColor(...accentColor);
                doc.setLineWidth(0.5);
                doc.line(actualTextX, nameEndY, actualTextX + 50, nameEndY);
                
                yPos = nameEndY + 6;
                
                // Build details section dynamically (only show what exists)
                const details = [];
                
                const birthDate = formatDateForPdf(martyr.birthDate);
                const martyrdomDate = formatDateForPdf(martyr.martyrdomDate);
                
                if (birthDate && martyrdomDate) {
                    details.push({ label: 'Lived', value: `${birthDate} — ${martyrdomDate}` });
                } else if (martyrdomDate) {
                    details.push({ label: 'Martyrdom', value: martyrdomDate });
                } else if (birthDate) {
                    details.push({ label: 'Born', value: birthDate });
                }
                
                if (martyr.fatherName) {
                    details.push({ label: 'Father', value: martyr.fatherName });
                }
                
                if (martyr.birthPlace) {
                    details.push({ label: 'Birthplace', value: martyr.birthPlace });
                }
                
                if (martyr.martyrdomPlace) {
                    details.push({ label: 'Place of Martyrdom', value: martyr.martyrdomPlace });
                }
                
                if (martyr.organization) {
                    details.push({ label: 'Organization', value: martyr.organization });
                }
                
                if (martyr.rank) {
                    details.push({ label: 'Rank', value: martyr.rank });
                }
                
                // Render details in a clean grid
                doc.setFontSize(9);
                const detailLineHeight = 5.5;
                
                details.forEach(detail => {
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...lightGray);
                    doc.text(detail.label + ':', actualTextX, yPos);
                    
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...textColor);
                    const valueX = actualTextX + 32;
                    const valueMaxWidth = actualTextWidth - 35;
                    const valueLines = doc.splitTextToSize(String(detail.value), valueMaxWidth);
                    valueLines.forEach((vLine, vIdx) => {
                        doc.text(vLine, valueX, yPos + (vIdx * detailLineHeight));
                    });
                    yPos += Math.max(valueLines.length * detailLineHeight, detailLineHeight);
                });
                
                // Biography section - starts after details or photo, whichever is lower
                const photoBottomY = hasPhoto ? photoY + photoSize * 1.25 + 8 : 0;
                let bioStartY = Math.max(yPos + 8, photoBottomY);
                
                if (martyr.biography && martyr.biography.trim().length > 0) {
                    const bioText = martyr.biography.trim();
                    
                    // Biography heading with background
                    doc.setFillColor(248, 250, 252);
                    doc.roundedRect(margin, bioStartY - 3, contentWidth, 9, 2, 2, 'F');
                    
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(10);
                    doc.setTextColor(...primaryColor);
                    doc.text('Biography', margin + 4, bioStartY + 3);
                    
                    bioStartY += 12;
                    
                    // Biography text with multi-page support
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(9.5);
                    doc.setTextColor(...textColor);
                    
                    const lineHeight = 4.8;
                    const bioLines = doc.splitTextToSize(bioText, contentWidth);
                    
                    let currentY = bioStartY;
                    let lineIndex = 0;
                    let isFirstBioPage = true;
                    
                    while (lineIndex < bioLines.length) {
                        // Check if we need a new page
                        if (currentY + lineHeight > maxContentY) {
                            // Draw footer on current page
                            drawPageFooter();
                            
                            // Add new page
                            doc.addPage();
                            
                            // Draw header for continuation
                            drawContinuationHeader(martyrName, profileNum, sortedMartyrs.length);
                            
                            // Reset Y position for new page
                            currentY = headerHeight + 8;
                            
                            // Add "Biography continued" label
                            doc.setFont('helvetica', 'italic');
                            doc.setFontSize(8);
                            doc.setTextColor(...lightGray);
                            doc.text('Biography (continued)', margin, currentY);
                            currentY += 6;
                            
                            // Reset to normal bio formatting
                            doc.setFont('helvetica', 'normal');
                            doc.setFontSize(9.5);
                            doc.setTextColor(...textColor);
                            
                            isFirstBioPage = false;
                        }
                        
                        // Draw the line
                        doc.text(bioLines[lineIndex], margin, currentY);
                        currentY += lineHeight;
                        lineIndex++;
                    }
                }
                
                // Draw footer on the last page of this profile
                drawPageFooter();
            }
            
            // ---- FINAL PAGE ----
            updateProgress(progressFill, progressText, 98, 'Finalizing...');
            
            doc.addPage();
            
            // Elegant closing page
            doc.setFillColor(248, 250, 252);
            doc.rect(0, 0, pageWidth, pageHeight, 'F');
            
            // Green accent at top
            doc.setFillColor(...primaryColor);
            doc.rect(0, 0, pageWidth, 40, 'F');
            doc.setFillColor(...accentColor);
            doc.rect(0, 40, pageWidth, 2, 'F');
            
            // Title in header
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('In Eternal Memory', pageWidth / 2, 25, { align: 'center' });
            
            // Center content
            doc.setTextColor(...textColor);
            doc.setFontSize(11);
            doc.setFont('helvetica', 'normal');
            
            const closingLines = [
                'This document preserves the memory of Baluch martyrs',
                'who sacrificed their lives for freedom and justice.',
                '',
                'Their courage and dedication inspire generations.',
                'Their names will never be forgotten.',
                '',
                `Total Profiles Documented: ${sortedMartyrs.length}`,
            ];
            
            let closingY = 80;
            closingLines.forEach(line => {
                if (line === '') {
                    closingY += 6;
                } else {
                    doc.text(line, pageWidth / 2, closingY, { align: 'center' });
                    closingY += 8;
                }
            });
            
            // Decorative element
            doc.setDrawColor(...accentColor);
            doc.setLineWidth(0.5);
            doc.line(pageWidth / 2 - 30, closingY + 10, pageWidth / 2 + 30, closingY + 10);
            
            // Website
            doc.setFontSize(10);
            doc.setTextColor(...primaryColor);
            doc.setFont('helvetica', 'bold');
            doc.text('baluchmartyrs.site', pageWidth / 2, closingY + 25, { align: 'center' });
            
            // Green footer bar
            doc.setFillColor(...primaryColor);
            doc.rect(0, pageHeight - 30, pageWidth, 30, 'F');
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`Generated on ${date}`, pageWidth / 2, pageHeight - 18, { align: 'center' });
            doc.text(`© ${new Date().getFullYear()} Baluch Martyrs Memorial. All rights reserved.`, pageWidth / 2, pageHeight - 12, { align: 'center' });
            
            // Save PDF
            updateProgress(progressFill, progressText, 100, 'Complete!');
            
            const filename = `Baluch_Martyrs_Memorial_${new Date().toISOString().split('T')[0]}.pdf`;
            doc.save(filename);
            
            // Reset UI
            setTimeout(() => {
                btn.disabled = false;
                btn.innerHTML = `
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                    <span>Download PDF</span>
                `;
                if (progress) progress.style.display = 'none';
                if (progressFill) progressFill.style.width = '0%';
            }, 1500);
            
        } catch (error) {
            console.error('PDF generation failed:', error);
            alert('Failed to generate PDF. Please try again.');
            
            btn.disabled = false;
            btn.innerHTML = `
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <span>Download PDF</span>
            `;
            if (progress) progress.style.display = 'none';
        }
    }
    
    function updateProgress(fillEl, textEl, percent, text) {
        if (fillEl) fillEl.style.width = `${percent}%`;
        if (textEl) textEl.textContent = text;
    }
    
    function formatDateForPdf(dateStr) {
        if (!dateStr) return null;
        
        // Firestore Timestamp
        if (dateStr && typeof dateStr === 'object' && dateStr.seconds) {
            const d = new Date(dateStr.seconds * 1000);
            return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        }
        
        const s = String(dateStr).trim();
        
        // Try to parse as date
        try {
            const d = new Date(s);
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
            }
        } catch (e) {}
        
        // Return as-is if it looks like a year
        if (/^\d{4}$/.test(s)) return s;
        
        return s;
    }

})();
