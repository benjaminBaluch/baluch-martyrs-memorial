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
    // PDF GENERATION
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
            
            // Colors
            const primaryColor = [44, 85, 48];
            const accentColor = [212, 175, 55];
            const textColor = [51, 65, 85];
            const lightGray = [148, 163, 184];
            
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
            
            // ---- MARTYR PROFILES (One per page, professional layout) ----
            let currentPage = 1;
            
            for (let i = 0; i < sortedMartyrs.length; i++) {
                const martyr = sortedMartyrs[i];
                const progressPercent = Math.round(10 + ((i / sortedMartyrs.length) * 85));
                updateProgress(progressFill, progressText, progressPercent, `Processing ${i + 1} of ${sortedMartyrs.length}...`);
                
                // New page for each martyr
                doc.addPage();
                currentPage++;
                
                // Page header bar
                doc.setFillColor(...primaryColor);
                doc.rect(0, 0, pageWidth, 15, 'F');
                doc.setFontSize(9);
                doc.setTextColor(255, 255, 255);
                doc.text('Baluch Martyrs Memorial', margin, 10);
                doc.text(`${i + 1} of ${sortedMartyrs.length}`, pageWidth - margin, 10, { align: 'right' });
                
                // Gold accent line under header
                doc.setFillColor(...accentColor);
                doc.rect(0, 15, pageWidth, 2, 'F');
                
                let yPos = 30;
                
                // Profile layout with photo on left
                const photoSize = 50;
                const photoX = margin;
                const photoY = yPos;
                const textStartX = margin + photoSize + 15;
                const textWidth = contentWidth - photoSize - 15;
                
                // Photo (only if available)
                let hasPhoto = false;
                if (martyr.photo && martyr.photo.startsWith('data:image')) {
                    try {
                        doc.addImage(martyr.photo, 'JPEG', photoX, photoY, photoSize, photoSize * 1.2);
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
                doc.setFontSize(20);
                doc.setFont('helvetica', 'bold');
                const name = martyr.fullName || 'Unnamed Martyr';
                doc.text(name, actualTextX, yPos + 8);
                
                // Decorative line under name
                doc.setDrawColor(...accentColor);
                doc.setLineWidth(0.5);
                doc.line(actualTextX, yPos + 12, actualTextX + 60, yPos + 12);
                
                yPos += 22;
                
                // Build details section dynamically (only show what exists)
                const details = [];
                
                const birthDate = formatDateForPdf(martyr.birthDate);
                const martyrdomDate = formatDateForPdf(martyr.martyrdomDate);
                
                if (birthDate && martyrdomDate) {
                    details.push({ label: 'Lived', value: `${birthDate} — ${martyrdomDate}` });
                } else if (martyrdomDate) {
                    details.push({ label: 'Martyrdom Date', value: martyrdomDate });
                } else if (birthDate) {
                    details.push({ label: 'Birth Date', value: birthDate });
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
                
                // Render details
                doc.setFontSize(10);
                details.forEach(detail => {
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(...lightGray);
                    doc.text(detail.label + ':', actualTextX, yPos);
                    
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(...textColor);
                    const valueX = actualTextX + 40;
                    const valueLines = doc.splitTextToSize(detail.value, actualTextWidth - 45);
                    doc.text(valueLines[0], valueX, yPos);
                    yPos += 7;
                });
                
                // Biography section (full, below the header info)
                const bioStartY = hasPhoto ? Math.max(yPos + 10, photoY + photoSize * 1.2 + 15) : yPos + 10;
                
                if (martyr.biography && martyr.biography.trim().length > 0) {
                    // Biography heading
                    doc.setFillColor(248, 250, 252);
                    doc.roundedRect(margin, bioStartY - 5, contentWidth, 10, 2, 2, 'F');
                    
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(11);
                    doc.setTextColor(...primaryColor);
                    doc.text('Biography', margin + 5, bioStartY + 2);
                    
                    // Biography text
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(10);
                    doc.setTextColor(...textColor);
                    
                    const bioText = martyr.biography.trim();
                    const bioLines = doc.splitTextToSize(bioText, contentWidth);
                    const maxBioLines = 25; // Allow more lines for full biography
                    const displayLines = bioLines.slice(0, maxBioLines);
                    
                    let bioY = bioStartY + 15;
                    displayLines.forEach(line => {
                        doc.text(line, margin, bioY);
                        bioY += 5;
                    });
                    
                    if (bioLines.length > maxBioLines) {
                        doc.setTextColor(...lightGray);
                        doc.setFontSize(9);
                        doc.text('[Biography continues...]', margin, bioY + 2);
                    }
                }
                
                // Footer with memorial message
                doc.setFillColor(...primaryColor);
                doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
                
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(8);
                doc.setFont('helvetica', 'italic');
                doc.text('Forever remembered. Forever honored.', pageWidth / 2, pageHeight - 10, { align: 'center' });
            }
            
            // ---- FINAL PAGE ----
            updateProgress(progressFill, progressText, 98, 'Finalizing...');
            
            doc.addPage();
            
            // Green footer bar
            doc.setFillColor(...primaryColor);
            doc.rect(0, pageHeight - 50, pageWidth, 50, 'F');
            
            // Thank you message
            doc.setTextColor(...textColor);
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('In Eternal Memory', pageWidth / 2, 60, { align: 'center' });
            
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(...lightGray);
            const closingText = [
                'This document preserves the memory of Baluch martyrs',
                'who sacrificed their lives for freedom and justice.',
                '',
                'Their courage and dedication will never be forgotten.'
            ];
            closingText.forEach((line, idx) => {
                doc.text(line, pageWidth / 2, 80 + (idx * 7), { align: 'center' });
            });
            
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(9);
            doc.text('baluchmartyrs.site', pageWidth / 2, pageHeight - 25, { align: 'center' });
            doc.text(`© ${new Date().getFullYear()} Baluch Martyrs Memorial`, pageWidth / 2, pageHeight - 18, { align: 'center' });
            
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
