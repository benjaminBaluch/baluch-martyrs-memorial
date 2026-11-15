/**
 * Statistics Dashboard - Baluch Martyrs Memorial
 * Senior UI/UX Archival Analytics & Interactive Cross-Filtering
 */

(function() {
    'use strict';

    // Chart instances
    let timelineChart = null;
    let monthlyChart = null;
    
    // Store martyrs data for PDF generation & instant cross-filtering
    let allMartyrsData = [];

    // Interactive dashboard state
    const activeStatsFilter = {
        year: null,      // number | null
        region: null,    // string | null
        org: null,       // string | null
        month: null      // number (0-11) | null
    };
    let currentTimelineRange = 'recent'; // 'recent' (2014–Now) | '2000s' | 'pre2000' | 'active'
    let showAllYears = false;
    let showAllRegions = false;
    let showAllOrgs = false;
    let uiControlsBound = false;

    // View mode state ('chart' | 'table') for mobile accessibility
    const activeViews = {
        timeline: 'chart',
        monthly: 'chart'
    };

    // Month names
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const FULL_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    // Known organization display labels (aligned with normalizeOrg canonical names)
    const ORG_LABELS = {
        'BLA': 'Baloch Liberation Army (BLA)',
        'BLF': 'Balochistan Liberation Front (BLF)',
        'BRA': 'Baloch Republican Army (BRA)',
        'BRG': 'Baloch Republican Guards (BRG)',
        'UBA': 'United Baloch Army (UBA)',
        'BNA': 'Baloch Nationalist Army (BNA)',
        'BRAS': 'Baloch Raaji Aajoi Sangar (BRAS)',
        'LeB': 'Lashkar-e-Balochistan (LeB)',
        'BSO-Azad': 'Baloch Students Organization - Azad (BSO-Azad)',
        'BNM': 'Baloch National Movement (BNM)',
        'BRP': 'Baloch Republican Party (BRP)',
        'BNP': 'Balochistan National Party (BNP)'
    };

    // Initialize
    document.addEventListener('DOMContentLoaded', init);

    async function init() {
        console.log('📊 Statistics: Initializing...');
        bindDashboardUIControls();

        // Listen for live background Firebase delta sync updates
        window.addEventListener('martyrsDataUpdated', (event) => {
            const updatedMartyrs = event?.detail?.data;
            if (Array.isArray(updatedMartyrs) && updatedMartyrs.length > 0) {
                console.log(`🔄 Statistics live-updating with ${updatedMartyrs.length} martyrs from Firebase sync`);
                applyLoadedMartyrs(updatedMartyrs);
            }
        });

        // When Firebase module finishes loading, trigger background sync if we already rendered from instant cache
        window.addEventListener('firebaseReady', () => {
            if (allMartyrsData.length === 0) {
                loadData();
            } else if (window.firebaseDB && typeof window.firebaseDB.getApprovedMartyrs === 'function') {
                window.firebaseDB.getApprovedMartyrs();
            }
        });

        // Load data immediately (checks instant IndexedDB cache first, then Firebase)
        loadData();
    }

    // Bind static UI buttons (Hero jump, Clear filter, Range tabs, Expand toggles)
    function bindDashboardUIControls() {
        if (uiControlsBound) return;
        uiControlsBound = true;

        // 1. Hero "Download PDF Archive" quick-scroll button
        const heroJumpBtn = document.getElementById('heroDownloadJumpBtn');
        if (heroJumpBtn) {
            heroJumpBtn.addEventListener('click', () => {
                const downloadSec = document.getElementById('downloadSection');
                if (downloadSec) {
                    downloadSec.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    downloadSec.classList.add('highlight-pulse');
                    setTimeout(() => downloadSec.classList.remove('highlight-pulse'), 1800);
                }
            });
        }

        // 2. Clear all interactive dashboard filters
        const clearBtn = document.getElementById('clearStatsFilterBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                clearAllStatsFilters();
            });
        }

        // 3. Timeline Era Range Tabs
        const rangeTabsContainer = document.getElementById('timelineRangeTabs');
        if (rangeTabsContainer) {
            rangeTabsContainer.addEventListener('click', (e) => {
                const tab = e.target.closest('.timeline-range-tab');
                if (!tab) return;
                const range = tab.getAttribute('data-range') || 'recent';
                currentTimelineRange = range;
                rangeTabsContainer.querySelectorAll('.timeline-range-tab').forEach(btn => {
                    btn.classList.toggle('active', btn === tab);
                });
                refreshDashboardUI();
            });
        }

        // 4. Year, Region & Organization expand/collapse toggles
        const toggleYearsBtn = document.getElementById('toggleAllYearsBtn');
        if (toggleYearsBtn) {
            toggleYearsBtn.addEventListener('click', () => {
                showAllYears = !showAllYears;
                refreshDashboardUI();
            });
        }

        const toggleRegionsBtn = document.getElementById('toggleAllRegionsBtn');
        if (toggleRegionsBtn) {
            toggleRegionsBtn.addEventListener('click', () => {
                showAllRegions = !showAllRegions;
                refreshDashboardUI();
            });
        }

        const toggleOrgsBtn = document.getElementById('toggleAllOrgsBtn');
        if (toggleOrgsBtn) {
            toggleOrgsBtn.addEventListener('click', () => {
                showAllOrgs = !showAllOrgs;
                refreshDashboardUI();
            });
        }

        // 5. Chart vs Table View Toggles (Mobile Accessibility)
        document.querySelectorAll('.chart-view-toggle').forEach(group => {
            const target = group.getAttribute('data-toggle-target');
            group.querySelectorAll('.view-toggle-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const view = btn.getAttribute('data-view') || 'chart';
                    setViewMode(target, view);
                });
            });
        });
    }

    // Switch between Chart and Table modes
    function setViewMode(target, mode) {
        if (!activeViews.hasOwnProperty(target)) return;
        activeViews[target] = mode;

        // Update toggle button active styling across all matching groups
        document.querySelectorAll(`.chart-view-toggle[data-toggle-target="${target}"] .view-toggle-btn`).forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-view') === mode);
        });

        // Toggle container visibility using both inline display and class
        if (target === 'timeline') {
            const chartWrap = document.getElementById('timelineChartWrapper');
            const tableWrap = document.getElementById('timelineTableWrapper');
            if (chartWrap) chartWrap.style.display = (mode === 'chart') ? 'block' : 'none';
            if (tableWrap) {
                tableWrap.style.display = (mode === 'table') ? 'block' : 'none';
                tableWrap.classList.toggle('is-visible', mode === 'table');
            }
            if (mode === 'chart' && timelineChart) {
                setTimeout(() => timelineChart && timelineChart.resize(), 20);
            }
        } else if (target === 'monthly') {
            const chartWrap = document.getElementById('monthlyChartWrapper');
            const tableWrap = document.getElementById('monthlyTableWrapper');
            if (chartWrap) chartWrap.style.display = (mode === 'chart') ? 'block' : 'none';
            if (tableWrap) {
                tableWrap.style.display = (mode === 'table') ? 'block' : 'none';
                tableWrap.classList.toggle('is-visible', mode === 'table');
            }
            if (mode === 'chart' && monthlyChart) {
                setTimeout(() => monthlyChart && monthlyChart.resize(), 20);
            }
        }
    }

    // Expose globally so inline HTML onclick handlers work unconditionally
    window.setStatsViewMode = setViewMode;

    // Bulletproof document-level delegated listener for view toggle buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.view-toggle-btn');
        if (!btn) return;
        const group = btn.closest('.chart-view-toggle');
        const target = group ? group.getAttribute('data-toggle-target') : null;
        const view = btn.getAttribute('data-view') || 'chart';
        if (target) {
            e.preventDefault();
            setViewMode(target, view);
        }
    });

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

    // Apply loaded martyrs to the dashboard UI and PDF generator
    function applyLoadedMartyrs(martyrs) {
        if (!Array.isArray(martyrs) || martyrs.length === 0) return;

        const loadingEl = document.getElementById('statsLoading');
        const emptyEl = document.getElementById('statsEmpty');
        const contentEl = document.getElementById('dashboardContent');
        const statusEl = document.getElementById('dataStatus');

        if (loadingEl) loadingEl.style.display = 'none';
        if (emptyEl) emptyEl.style.display = 'none';
        if (contentEl) contentEl.style.display = 'block';

        updateStatus(
            statusEl,
            `Verified Memorial Archive • ${martyrs.length.toLocaleString()} Documented Martyrs`,
            false
        );

        // Store martyrs for PDF generation and interactive filtering
        allMartyrsData = martyrs;

        // Render full interactive dashboard
        refreshDashboardUI();

        // Setup PDF download button & filters
        setupPdfDownload();

        console.log('✅ Statistics rendered');
    }

    // Load all martyrs data
    async function loadData() {
        const loadingEl = document.getElementById('statsLoading');
        const emptyEl = document.getElementById('statsEmpty');
        const statusEl = document.getElementById('dataStatus');

        let martyrs = [];

        try {
            // Method 0: Zero-Wait Instant IndexedDB Archive Cache (renders before Firebase CDN finishes loading)
            if (window.bmmInstantCache && typeof window.bmmInstantCache.read === 'function') {
                const cached = await window.bmmInstantCache.read();
                if (Array.isArray(cached) && cached.length > 0) {
                    martyrs = cached;
                    console.log(`⚡ Statistics loaded ${martyrs.length} martyrs from Instant Cache`);
                    applyLoadedMartyrs(martyrs);
                    // Trigger background Firebase sync if firebaseDB is already ready
                    if (window.firebaseDB && typeof window.firebaseDB.getApprovedMartyrs === 'function') {
                        window.firebaseDB.getApprovedMartyrs();
                    }
                    return;
                }
            }

            // If instant cache is empty (first-time visitor), wait briefly for Firebase module if not yet loaded
            if (!window.firebaseDB) {
                updateStatus(statusEl, 'Connecting to memorial archive...', true);
                await waitForFirebase();
            }

            // Method 1: Firebase direct (most reliable)
            if (window.firebaseDB && typeof window.firebaseDB.getApprovedMartyrs === 'function') {
                console.log('📊 Fetching from Firebase...');
                updateStatus(statusEl, 'Connecting to memorial archive...', true);
                
                const result = await window.firebaseDB.getApprovedMartyrs();
                
                if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                    martyrs = result.data;
                    console.log(`✅ Firebase: ${martyrs.length} martyrs`);
                }
            }

            // Method 2: API fallback
            if (martyrs.length === 0) {
                console.log('📊 Trying API...');
                updateStatus(statusEl, 'Loading archival records...', true);
                
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
                updateStatus(statusEl, 'Restoring memorial archive...', true);
                
                try {
                    const saved = localStorage.getItem('martyrsData');
                    if (saved) {
                        const parsed = JSON.parse(saved);
                        if (Array.isArray(parsed)) {
                            martyrs = parsed.filter(m => !m.status || m.status === 'approved');
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
                updateStatus(statusEl, 'Archive awaiting records', false);
                if (emptyEl) emptyEl.style.display = 'block';
                return;
            }

            applyLoadedMartyrs(martyrs);

        } catch (error) {
            console.error('❌ Statistics error:', error);
            if (loadingEl) loadingEl.style.display = 'none';
            updateStatus(statusEl, 'Unable to reach archive', false);
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

    // Check if any interactive filter is active
    function hasActiveStatsFilter() {
        return (
            activeStatsFilter.year !== null ||
            activeStatsFilter.region !== null ||
            activeStatsFilter.org !== null ||
            activeStatsFilter.month !== null
        );
    }

    // Clear all interactive filters
    function clearAllStatsFilters() {
        activeStatsFilter.year = null;
        activeStatsFilter.region = null;
        activeStatsFilter.org = null;
        activeStatsFilter.month = null;
        syncInteractiveFiltersToPdf('all', 'all', 'all');
        refreshDashboardUI();
    }

    // Toggle a single filter dimension
    function toggleStatsFilter(type, value) {
        if (type === 'year') {
            const yrNum = Number(value);
            activeStatsFilter.year = (activeStatsFilter.year === yrNum) ? null : yrNum;
        } else if (type === 'region') {
            activeStatsFilter.region = (activeStatsFilter.region === value) ? null : value;
        } else if (type === 'org') {
            activeStatsFilter.org = (activeStatsFilter.org === value) ? null : value;
        } else if (type === 'month') {
            const moNum = Number(value);
            activeStatsFilter.month = (activeStatsFilter.month === moNum) ? null : moNum;
        }

        // Also sync Year / Month / Org into the PDF Archive Studio dropdowns for convenience
        syncInteractiveFiltersToPdf(
            activeStatsFilter.year !== null ? String(activeStatsFilter.year) : 'all',
            activeStatsFilter.month !== null ? String(activeStatsFilter.month) : 'all',
            activeStatsFilter.org !== null ? String(activeStatsFilter.org) : 'all'
        );

        refreshDashboardUI();
    }

    // Sync active dashboard filter into the PDF export dropdowns if they exist
    function syncInteractiveFiltersToPdf(yearVal, monthVal, orgVal) {
        const yearSelect = document.getElementById('pdfFilterYear');
        const monthSelect = document.getElementById('pdfFilterMonth');
        const orgSelect = document.getElementById('pdfFilterOrg');

        if (yearSelect && [...yearSelect.options].some(o => o.value === yearVal)) {
            yearSelect.value = yearVal;
        }
        if (monthSelect && [...monthSelect.options].some(o => o.value === monthVal)) {
            monthSelect.value = monthVal;
        }
        if (orgSelect && [...orgSelect.options].some(o => o.value === orgVal)) {
            orgSelect.value = orgVal;
        }
        if (typeof updatePdfFilterSummary === 'function' && pdfFiltersInitialized) {
            updatePdfFilterSummary();
        }
    }

    // Filter martyrs according to activeStatsFilter (with optional exclusion of one dimension so charts can show context)
    function getFilteredMartyrs(excludeDimension) {
        if (!allMartyrsData || allMartyrsData.length === 0) return [];
        return allMartyrsData.filter(m => {
            if (excludeDimension !== 'year' && activeStatsFilter.year !== null) {
                const yr = extractYear(m.martyrdomDate);
                if (yr !== activeStatsFilter.year) return false;
            }
            if (excludeDimension !== 'region' && activeStatsFilter.region !== null) {
                const reg = normalizeRegion(m.martyrdomPlace || m.birthPlace);
                if (reg !== activeStatsFilter.region) return false;
            }
            if (excludeDimension !== 'org' && activeStatsFilter.org !== null) {
                const org = normalizeOrg(m.organization);
                if (org !== activeStatsFilter.org) return false;
            }
            if (excludeDimension !== 'month' && activeStatsFilter.month !== null) {
                const mo = extractMonth(m.martyrdomDate);
                if (mo !== activeStatsFilter.month) return false;
            }
            return true;
        });
    }

    // Re-render all dashboard components from in-memory data
    function refreshDashboardUI() {
        if (!allMartyrsData || allMartyrsData.length === 0) return;

        const filteredMartyrs = getFilteredMartyrs(null);
        const timelineContextMartyrs = getFilteredMartyrs('year');

        const currentStats = processData(filteredMartyrs);
        const timelineStats = processData(timelineContextMartyrs);

        renderActiveFilterBar(filteredMartyrs.length);
        renderKeyNumbers(currentStats, allMartyrsData.length);
        renderYearPillStrip(timelineStats);
        renderTimeline(timelineStats);
        renderTimelineTable(timelineStats);
        renderRegions(currentStats);
        renderOrganizations(currentStats);
        renderMonthly(currentStats);
        renderMonthlyTable(currentStats);
    }

    // Render the sticky Active Filter Bar with Gallery deep-link
    function renderActiveFilterBar(matchingCount) {
        const bar = document.getElementById('statsActiveFilterBar');
        const pillsContainer = document.getElementById('statsActiveFilterPills');
        const galleryLink = document.getElementById('statsGalleryDeepLink');
        const galleryLinkText = document.getElementById('statsGalleryDeepLinkText');

        if (!bar || !pillsContainer) return;

        if (!hasActiveStatsFilter()) {
            bar.classList.remove('is-visible');
            pillsContainer.innerHTML = '';
            return;
        }

        bar.classList.add('is-visible');
        const pills = [];

        if (activeStatsFilter.year !== null) {
            pills.push(`
                <span class="stats-filter-pill">
                    <span>Year: ${activeStatsFilter.year}</span>
                    <button type="button" data-clear-dim="year" aria-label="Remove year filter">&times;</button>
                </span>
            `);
        }
        if (activeStatsFilter.region !== null) {
            pills.push(`
                <span class="stats-filter-pill">
                    <span>Region: ${escapeHTML(activeStatsFilter.region)}</span>
                    <button type="button" data-clear-dim="region" aria-label="Remove region filter">&times;</button>
                </span>
            `);
        }
        if (activeStatsFilter.org !== null) {
            const orgDisplay = activeStatsFilter.org === '__none__' ? 'Independent / Unspecified' : activeStatsFilter.org;
            pills.push(`
                <span class="stats-filter-pill">
                    <span>Affiliation: ${escapeHTML(orgDisplay)}</span>
                    <button type="button" data-clear-dim="org" aria-label="Remove organization filter">&times;</button>
                </span>
            `);
        }
        if (activeStatsFilter.month !== null) {
            pills.push(`
                <span class="stats-filter-pill">
                    <span>Month: ${FULL_MONTHS[activeStatsFilter.month]}</span>
                    <button type="button" data-clear-dim="month" aria-label="Remove month filter">&times;</button>
                </span>
            `);
        }

        pillsContainer.innerHTML = pills.join('');

        // Bind individual pill remove buttons
        pillsContainer.querySelectorAll('button[data-clear-dim]').forEach(btn => {
            btn.addEventListener('click', () => {
                const dim = btn.getAttribute('data-clear-dim');
                if (dim && dim in activeStatsFilter) {
                    activeStatsFilter[dim] = null;
                    syncInteractiveFiltersToPdf(
                        activeStatsFilter.year !== null ? String(activeStatsFilter.year) : 'all',
                        activeStatsFilter.month !== null ? String(activeStatsFilter.month) : 'all',
                        activeStatsFilter.org !== null ? String(activeStatsFilter.org) : 'all'
                    );
                    refreshDashboardUI();
                }
            });
        });

        // Build Gallery deep-link URL
        if (galleryLink && galleryLinkText) {
            const params = new URLSearchParams();
            if (activeStatsFilter.year !== null) params.set('year', String(activeStatsFilter.year));
            if (activeStatsFilter.region !== null) params.set('region', activeStatsFilter.region);
            if (activeStatsFilter.org !== null && activeStatsFilter.org !== '__none__') {
                params.set('organization', activeStatsFilter.org);
            }
            if (activeStatsFilter.month !== null) {
                params.set('q', FULL_MONTHS[activeStatsFilter.month]);
            }
            const qs = params.toString();
            galleryLink.href = qs ? `/gallery?${qs}` : '/gallery';
            galleryLinkText.textContent = `View these ${matchingCount.toLocaleString()} ${matchingCount === 1 ? 'profile' : 'profiles'} in Gallery`;
        }
    }

    // Case-insensitive cache for any custom/unlisted organization names
    const customOrgCanonicalMap = new Map();

    // Normalize organization string (unifies acronyms, spelling variants, and sub-wings/brigades)
    function normalizeOrg(rawOrg) {
        const trimmed = (rawOrg || '').toString().trim().replace(/\s+/g, ' ');
        if (!trimmed) return '__none__';

        const lowerRaw = trimmed.toLowerCase();
        if (/^(none|n\/a|na|nil|null|undefined|unknown|not\s*specified|unspecified|no\s*affiliation|independent|[-—–]+)$/i.test(lowerRaw)) {
            return '__none__';
        }

        // Standardize Baluch/Baloch, Organisation/Organization, and dash characters for matching
        const norm = lowerRaw
            .replace(/baluch/g, 'baloch')
            .replace(/organisation/g, 'organization')
            .replace(/[—–]/g, '-');

        // 1. Baloch Liberation Army (BLA) + all sub-wings (Majeed Brigade, Fateh Squad, STOS, ZRAB, etc.)
        if (
            /\bbla\b/.test(norm) ||
            norm.includes('baloch liberation army') ||
            norm.includes('balochistan liberation army') ||
            norm.includes('majeed brigade') ||
            norm.includes('majid brigade') ||
            norm.includes('fateh squad') ||
            norm.includes('fatah squad') ||
            norm.includes('special tactical operations squad') ||
            /\bstos\b/.test(norm) ||
            /\bzrab\b/.test(norm)
        ) {
            return 'Baloch Liberation Army (BLA)';
        }

        // 2. Balochistan Liberation Front (BLF) + all sub-wings/units
        if (
            /\bblf\b/.test(norm) ||
            norm.includes('balochistan liberation front') ||
            norm.includes('baloch liberation front') ||
            norm.includes('sadozai') ||
            norm.includes('saddozai')
        ) {
            return 'Balochistan Liberation Front (BLF)';
        }

        // 3. Baloch Republican Army (BRA) + all sub-wings
        if (
            /\bbra\b/.test(norm) ||
            norm.includes('baloch republican army') ||
            norm.includes('balochistan republican army')
        ) {
            return 'Baloch Republican Army (BRA)';
        }

        // 4. Baloch Nationalist Army (BNA) + all sub-wings
        if (
            /\bbna\b/.test(norm) ||
            norm.includes('baloch nationalist army') ||
            norm.includes('balochistan nationalist army') ||
            norm.includes('baloch national army') ||
            norm.includes('balochistan national army')
        ) {
            return 'Baloch Nationalist Army (BNA)';
        }

        // 5. Baloch Republican Guards (BRG) + all sub-wings
        if (
            /\bbrg\b/.test(norm) ||
            norm.includes('baloch republican guard') ||
            norm.includes('balochistan republican guard')
        ) {
            return 'Baloch Republican Guards (BRG)';
        }

        // 6. United Baloch Army (UBA) + all sub-wings
        if (
            /\buba\b/.test(norm) ||
            norm.includes('united baloch army') ||
            norm.includes('united balochistan army')
        ) {
            return 'United Baloch Army (UBA)';
        }

        // 7. Baloch Raaji Aajoi Sangar (BRAS)
        if (
            /\bbras\b/.test(norm) ||
            norm.includes('raaji aajoi') ||
            norm.includes('raji ajoi') ||
            norm.includes('aajoi sangar')
        ) {
            return 'Baloch Raaji Aajoi Sangar (BRAS)';
        }

        // 8. Lashkar-e-Balochistan (LeB)
        if (
            /\bleb\b/.test(norm) ||
            norm.includes('lashkar-e-balochistan') ||
            norm.includes('lashkar e balochistan') ||
            norm.includes('lashkar balochistan')
        ) {
            return 'Lashkar-e-Balochistan (LeB)';
        }

        // 9. Baloch Liberation Tigers (BLT)
        if (
            /\bblt\b/.test(norm) ||
            norm.includes('baloch liberation tiger') ||
            norm.includes('balochistan liberation tiger')
        ) {
            return 'Baloch Liberation Tigers (BLT)';
        }

        // 10. Balochistan Liberation United Front (BLUF)
        if (
            /\bbluf\b/.test(norm) ||
            norm.includes('liberation united front')
        ) {
            return 'Balochistan Liberation United Front (BLUF)';
        }

        // 11. Baloch Students Organization - Azad (BSO-Azad) & BSO variants
        if (
            /\bbso\b/.test(norm) ||
            norm.includes('baloch students organization') ||
            norm.includes('baloch student organization')
        ) {
            return 'Baloch Students Organization - Azad (BSO-Azad)';
        }

        // 12. Baloch National Movement (BNM)
        if (
            /\bbnm\b/.test(norm) ||
            norm.includes('baloch national movement') ||
            norm.includes('balochistan national movement')
        ) {
            return 'Baloch National Movement (BNM)';
        }

        // 13. Baloch Republican Party (BRP)
        if (
            /\bbrp\b/.test(norm) ||
            norm.includes('baloch republican party') ||
            norm.includes('balochistan republican party')
        ) {
            return 'Baloch Republican Party (BRP)';
        }

        // 14. Balochistan National Party (BNP)
        if (
            /\bbnp\b/.test(norm) ||
            norm.includes('balochistan national party') ||
            norm.includes('baloch national party')
        ) {
            return 'Balochistan National Party (BNP)';
        }

        // 15. Baloch Yakjehti Committee (BYC)
        if (
            /\bbyc\b/.test(norm) ||
            norm.includes('yakjehti committee') ||
            norm.includes('baloch yakjehti')
        ) {
            return 'Baloch Yakjehti Committee (BYC)';
        }

        // 16. Voice for Baloch Missing Persons (VBMP)
        if (
            /\bvbmp\b/.test(norm) ||
            norm.includes('voice for baloch missing') ||
            norm.includes('missing persons')
        ) {
            return 'Voice for Baloch Missing Persons (VBMP)';
        }

        // 17. Baloch Women Forum (BWF)
        if (
            /\bbwf\b/.test(norm) ||
            norm.includes('baloch women forum')
        ) {
            return 'Baloch Women Forum (BWF)';
        }

        // 18. Civil Society & Role Affiliations
        if (/^(civilian|common citizen|local resident|villager|citizen)/i.test(norm) || norm.includes('no armed affiliation')) {
            return 'Civilian';
        }
        if (/^(student|academic|teacher|professor|scholar)/i.test(norm)) {
            return 'Student / Academic';
        }
        if (/^(journalist|media|reporter|press)/i.test(norm)) {
            return 'Journalist / Media';
        }
        if (norm.includes('human rights') || norm.includes('hr activist') || norm.includes('rights activist')) {
            return 'Human Rights Activist';
        }
        if (norm.includes('political activist') || norm.includes('political worker') || norm.includes('social activist')) {
            return 'Political Activist';
        }

        // 19. Generic cleanup for any other organization:
        // Strip sub-wing after " / ", convert "ACRONYM — Full Name" to "Full Name (ACRONYM)", and deduplicate case-insensitively
        let cleaned = trimmed.split(/\s+\/\s+/)[0].trim();
        const dashMatch = cleaned.match(/^([A-Z0-9-]{2,10})\s*[—–-]\s*(.+)$/);
        if (dashMatch) {
            cleaned = `${dashMatch[2].trim()} (${dashMatch[1].trim()})`;
        }
        cleaned = cleaned
            .replace(/\bBaluch\b/g, 'Baloch')
            .replace(/\bBaluchistan\b/g, 'Balochistan')
            .replace(/\bOrganisation\b/g, 'Organization');

        const cacheKey = cleaned.toLowerCase();
        if (customOrgCanonicalMap.has(cacheKey)) {
            return customOrgCanonicalMap.get(cacheKey);
        }
        customOrgCanonicalMap.set(cacheKey, cleaned);
        return cleaned;
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
            byOrg: {},
            years: []
        };

        martyrs.forEach(m => {
            // Biographies
            if (m.biography && m.biography.trim().length > 30) {
                stats.withBio++;
            }

            // Photos
            if ((m.photo && m.photo.length > 20) || m.hasPhoto || m.id) {
                stats.withPhoto++;
            }

            // Year
            const year = extractYear(m.martyrdomDate);
            if (year && year >= 1800 && year <= 2100) {
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

            // Organization
            const orgKey = normalizeOrg(m.organization);
            stats.byOrg[orgKey] = (stats.byOrg[orgKey] || 0) + 1;
        });

        // Sort years ascending
        stats.years.sort((a, b) => a - b);

        // Calculate derived stats
        if (stats.years.length > 0) {
            stats.minYear = stats.years[0];
            stats.maxYear = stats.years[stats.years.length - 1];
        }

        stats.regionCount = Object.keys(stats.byRegion).length;
        stats.orgCount = Object.keys(stats.byOrg).filter(k => k !== '__none__').length;
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
        if (match) return parseInt(match[1], 10);
        
        // Year at end: 15/01/2024
        match = s.match(/(\d{4})$/);
        if (match) return parseInt(match[1], 10);
        
        // Just year
        if (/^\d{4}$/.test(s)) return parseInt(s, 10);
        
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
        if (match) return parseInt(match[1], 10) - 1;
        
        // DD/MM/YYYY
        match = s.match(/^\d{2}\/(\d{2})\/\d{4}/);
        if (match) return parseInt(match[1], 10) - 1;
        
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

    // Render 4-Card Executive KPI Strip with integrated contextual insights
    function renderKeyNumbers(stats, grandTotal) {
        const total = document.getElementById('totalMartyrs');
        const regions = document.getElementById('totalRegions');
        const yearSpan = document.getElementById('yearSpan');
        const stories = document.getElementById('withStories');

        const insightTotal = document.getElementById('kpiInsightTotal');
        const insightRegions = document.getElementById('kpiInsightRegions');
        const insightYears = document.getElementById('kpiInsightYears');
        const insightStories = document.getElementById('kpiInsightStories');
        const storyBarFill = document.getElementById('kpiStoryBarFill');

        if (total) total.textContent = stats.total.toLocaleString();
        if (regions) regions.textContent = stats.regionCount.toLocaleString();
        if (yearSpan) {
            if (stats.years.length === 0) {
                yearSpan.textContent = '—';
            } else if (stats.minYear === stats.maxYear) {
                yearSpan.textContent = String(stats.minYear);
            } else {
                yearSpan.textContent = `${stats.minYear}–${stats.maxYear}`;
            }
        }
        if (stories) stories.textContent = `${stats.storyPercent}%`;
        if (storyBarFill) storyBarFill.style.width = `${stats.storyPercent}%`;

        // 1. Contextual Insight on Card 1 (Total Documented + Peak Year callout: Highest: YYYY — N martyrs)
        if (insightTotal) {
            if (stats.years.length > 0) {
                const peakYearEntry = Object.entries(stats.byYear).sort((a, b) => b[1] - a[1])[0];
                if (hasActiveStatsFilter() && grandTotal) {
                    const sharePct = Math.round((stats.total / grandTotal) * 100);
                    insightTotal.innerHTML = `
                        <button type="button" class="kpi-insight-btn" data-kpi-year="${peakYearEntry[0]}" title="Filter by ${peakYearEntry[0]}">
                            <span>Highest: ${peakYearEntry[0]} — ${peakYearEntry[1].toLocaleString()} (${sharePct}% share)</span>
                        </button>
                    `;
                } else {
                    insightTotal.innerHTML = `
                        <button type="button" class="kpi-insight-btn" data-kpi-year="${peakYearEntry[0]}" title="Filter by ${peakYearEntry[0]}">
                            <span>Highest: ${peakYearEntry[0]} — ${peakYearEntry[1].toLocaleString()} martyrs</span>
                        </button>
                    `;
                }
                const btn = insightTotal.querySelector('[data-kpi-year]');
                if (btn) {
                    btn.addEventListener('click', () => toggleStatsFilter('year', btn.getAttribute('data-kpi-year')));
                }
            } else {
                insightTotal.innerHTML = '<span>Verified memorial profiles</span>';
            }
        }

        // 2. Contextual Insight on Card 2 (Affected Regions + Most Affected Region badge: Top: Region — N)
        if (insightRegions) {
            const topRegions = Object.entries(stats.byRegion).sort((a, b) => b[1] - a[1]);
            if (topRegions.length > 0 && stats.total > 0) {
                const [topReg, topCnt] = topRegions[0];
                insightRegions.innerHTML = `
                    <button type="button" class="kpi-insight-btn" data-kpi-region="${escapeHTML(topReg)}" title="Filter by ${escapeHTML(topReg)}">
                        <span>Top: ${escapeHTML(topReg)} — ${topCnt.toLocaleString()}</span>
                    </button>
                `;
                const btn = insightRegions.querySelector('[data-kpi-region]');
                if (btn) {
                    btn.addEventListener('click', () => toggleStatsFilter('region', topReg));
                }
            } else {
                insightRegions.innerHTML = '<span>Documented locations</span>';
            }
        }

        // 3. Contextual Insight on Card 3 (Historical Span + Peak Month indicator: Peak month: Month)
        if (insightYears) {
            const maxMonthCount = Math.max(...stats.byMonth);
            const maxMonthIdx = stats.byMonth.indexOf(maxMonthCount);
            if (maxMonthCount > 0) {
                insightYears.innerHTML = `
                    <button type="button" class="kpi-insight-btn" data-kpi-month="${maxMonthIdx}" title="Filter by ${FULL_MONTHS[maxMonthIdx]}">
                        <span>Peak month: ${FULL_MONTHS[maxMonthIdx]} (${maxMonthCount.toLocaleString()})</span>
                    </button>
                `;
                const btn = insightYears.querySelector('[data-kpi-month]');
                if (btn) {
                    btn.addEventListener('click', () => toggleStatsFilter('month', maxMonthIdx));
                }
            } else {
                insightYears.innerHTML = `<span>${stats.years.length} documented years</span>`;
            }
        }

        // 4. Contextual Insight on Card 4 (Biographical Coverage + photo/story completeness)
        if (insightStories) {
            const photoPct = stats.total > 0 ? Math.round((stats.withPhoto / stats.total) * 100) : 0;
            insightStories.innerHTML = `
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${stats.withBio.toLocaleString()} stories • ${stats.withPhoto.toLocaleString()} photos (${photoPct}%)</span>
            `;
        }
    }

    // Render Human Context Archival Highlights (Removed per user request)
    function renderHumanContext() {}

    // Helper: get filtered year list according to currentTimelineRange
    function getTimelineYearsForRange(stats) {
        if (!stats.years || stats.years.length === 0) return [];

        if (currentTimelineRange === 'recent') {
            // 2014–Present (active years >= 2014, fallback to last 12 active years if none >= 2014)
            const recent = stats.years.filter(y => y >= 2014);
            return recent.length > 0 ? recent : stats.years.slice(-12);
        }

        if (currentTimelineRange === '2000s') {
            return stats.years.filter(y => y >= 2000 && y <= 2013);
        }

        if (currentTimelineRange === 'pre2000') {
            return stats.years.filter(y => y < 2000);
        }

        // 'active': all years with at least 1 documented martyr
        return [...stats.years];
    }

    // Render responsive 4-col mobile / 8-col desktop Year Card Grid below the Timeline chart
    function renderYearPillStrip(stats) {
        const grid = document.getElementById('yearExplorerGrid');
        const badge = document.getElementById('yearExplorerCountBadge');
        const toggleBtn = document.getElementById('toggleAllYearsBtn');
        if (!grid) return;

        if (!stats.years || stats.years.length === 0) {
            grid.innerHTML = '<span style="font-size: 0.8rem; color: #64748b; grid-column: 1 / -1;">No chronological data for this filter.</span>';
            if (toggleBtn) toggleBtn.style.display = 'none';
            return;
        }

        const entries = Object.entries(stats.byYear);
        const maxCount = Math.max(...entries.map(e => e[1]));
        const peakYear = entries.sort((a, b) => b[1] - a[1])[0]?.[0];

        // Show active years in descending order (newest first)
        const activeYearsDesc = [...stats.years].sort((a, b) => b - a);
        const visibleYears = showAllYears ? activeYearsDesc : activeYearsDesc.slice(0, 8);

        if (badge) {
            badge.textContent = `${activeYearsDesc.length} ${activeYearsDesc.length === 1 ? 'year' : 'years'} • Tap to filter`;
        }

        grid.innerHTML = visibleYears.map(year => {
            const count = stats.byYear[year] || 0;
            const barPct = maxCount > 0 ? Math.max(8, Math.round((count / maxCount) * 100)) : 0;
            const isPeak = String(year) === String(peakYear);
            const isSelected = activeStatsFilter.year === year;
            return `
                <button type="button"
                    class="year-card-btn${isPeak ? ' is-peak' : ''}${isSelected ? ' is-active' : ''}"
                    data-year="${year}"
                    title="Filter dashboard by ${year} (${count} documented)">
                    <span class="year-card-yr">${year}${isPeak ? ' ★' : ''}</span>
                    <span class="year-card-count">${count.toLocaleString()} ${count === 1 ? 'martyr' : 'martyrs'}</span>
                    <span class="year-card-bar" style="width: ${barPct}%"></span>
                </button>
            `;
        }).join('');

        grid.querySelectorAll('.year-card-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const yr = parseInt(btn.getAttribute('data-year'), 10);
                if (!isNaN(yr)) {
                    toggleStatsFilter('year', yr);
                }
            });
        });

        if (toggleBtn) {
            if (activeYearsDesc.length > 8) {
                toggleBtn.style.display = 'block';
                toggleBtn.textContent = showAllYears
                    ? 'Show recent 8 years ▴'
                    : `Show all ${activeYearsDesc.length} documented years ▾`;
            } else {
                toggleBtn.style.display = 'none';
            }
        }
    }

    // Render interactive timeline chart
    function renderTimeline(stats) {
        const canvas = document.getElementById('timelineChart');
        const chartWrapper = document.getElementById('timelineChartWrapper');
        const tableWrapper = document.getElementById('timelineTableWrapper');
        if (chartWrapper && tableWrapper) {
            chartWrapper.style.display = activeViews.timeline === 'chart' ? 'block' : 'none';
            tableWrapper.classList.toggle('is-visible', activeViews.timeline === 'table');
        }
        if (!canvas) return;

        if (timelineChart) {
            timelineChart.destroy();
            timelineChart = null;
        }

        const yearsList = getTimelineYearsForRange(stats);
        if (yearsList.length === 0) return;

        const labels = yearsList.map(y => String(y));
        const data = yearsList.map(y => stats.byYear[y] || 0);

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(15, 23, 42, 0.06)';
        const textColor = isDark ? '#94a3b8' : '#64748b';

        // Highlight selected year bar if a year filter is active
        const bgColors = yearsList.map(y => {
            if (activeStatsFilter.year !== null) {
                return y === activeStatsFilter.year
                    ? (isDark ? '#4ade80' : '#15803d')
                    : (isDark ? 'rgba(134, 239, 172, 0.25)' : 'rgba(21, 128, 61, 0.22)');
            }
            return isDark ? 'rgba(74, 222, 128, 0.78)' : 'rgba(21, 128, 61, 0.82)';
        });

        const borderColors = yearsList.map(y => {
            if (activeStatsFilter.year !== null && y === activeStatsFilter.year) {
                return isDark ? '#bbf7d0' : '#0d2110';
            }
            return isDark ? '#4ade80' : '#15803d';
        });

        timelineChart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: bgColors,
                    hoverBackgroundColor: isDark ? '#86efac' : '#16a34a',
                    borderColor: borderColors,
                    borderWidth: 1,
                    borderRadius: 5,
                    barPercentage: yearsList.length > 35 ? 0.85 : 0.72,
                    maxBarThickness: 38
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => {
                    if (elements && elements.length > 0) {
                        const idx = elements[0].index;
                        const clickedYear = yearsList[idx];
                        if (clickedYear) {
                            toggleStatsFilter('year', clickedYear);
                        }
                    }
                },
                onHover: (event, chartElement) => {
                    if (event?.native?.target) {
                        event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        titleColor: isDark ? '#f8fafc' : '#0f172a',
                        bodyColor: isDark ? '#86efac' : '#15803d',
                        borderColor: isDark ? '#22c55e' : '#bbf7d0',
                        borderWidth: 1,
                        padding: 11,
                        displayColors: false,
                        callbacks: {
                            title: ctx => `Year ${ctx[0].label}`,
                            label: ctx => `${ctx.raw.toLocaleString()} documented — click to filter`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { 
                            color: textColor,
                            maxRotation: 45,
                            font: { size: 11, weight: '600' }
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            font: { size: 11 },
                            callback: v => Number.isInteger(v) ? v : ''
                        }
                    }
                }
            }
        });
    }

    // Render accessible, mobile-friendly data table for Timeline of Martyrdoms
    function renderTimelineTable(stats) {
        const tbody = document.getElementById('timelineTableBody');
        if (!tbody) return;

        const yearsList = getTimelineYearsForRange(stats);
        if (yearsList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: #64748b; padding: 1.5rem;">
                        No timeline records found for current selection.
                    </td>
                </tr>
            `;
            return;
        }

        const maxCount = Math.max(...yearsList.map(y => stats.byYear[y] || 0));
        // Sort descending so newest records appear first for easy mobile scanning
        const sortedYears = [...yearsList].sort((a, b) => b - a);

        tbody.innerHTML = sortedYears.map(year => {
            const count = stats.byYear[year] || 0;
            const sharePct = stats.total > 0 ? Math.max(1, Math.round((count / stats.total) * 100)) : 0;
            const barWidth = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
            const isSelected = activeStatsFilter.year === year;

            return `
                <tr class="${isSelected ? 'is-selected' : ''}" data-row-year="${year}">
                    <td style="font-weight: 700; white-space: nowrap;">
                        ${year} ${count === maxCount && count > 0 ? '<span style="color:#eab308;" title="Peak Year">★</span>' : ''}
                    </td>
                    <td style="font-variant-numeric: tabular-nums; font-weight: 600;">
                        ${count.toLocaleString()} ${count === 1 ? 'martyr' : 'martyrs'}
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 0.55rem;">
                            <div class="bar-track" style="flex: 1; min-width: 60px; max-width: 140px; margin: 0;">
                                <div class="bar-fill" style="width: ${barWidth}%;"></div>
                            </div>
                            <span style="font-size: 0.76rem; color: #64748b; font-weight: 600; min-width: 32px;">${sharePct}%</span>
                        </div>
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                        <button type="button" class="table-filter-btn${isSelected ? ' is-active' : ''}" data-filter-year="${year}">
                            ${isSelected ? '✓ Filtered' : 'Filter Year'}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('[data-filter-year]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const yr = parseInt(btn.getAttribute('data-filter-year'), 10);
                if (!isNaN(yr)) toggleStatsFilter('year', yr);
            });
        });

        tbody.querySelectorAll('tr[data-row-year]').forEach(row => {
            row.addEventListener('click', () => {
                const yr = parseInt(row.getAttribute('data-row-year'), 10);
                if (!isNaN(yr)) toggleStatsFilter('year', yr);
            });
            row.style.cursor = 'pointer';
        });
    }

    // Render interactive Regions leaderboard
    function renderRegions(stats) {
        const list = document.getElementById('regionsList');
        const badge = document.getElementById('regionTotalBadge');
        const toggleBtn = document.getElementById('toggleAllRegionsBtn');
        if (!list) return;

        const allSorted = Object.entries(stats.byRegion).sort((a, b) => b[1] - a[1]);
        if (badge) {
            badge.textContent = `${allSorted.length} ${allSorted.length === 1 ? 'region' : 'regions'}`;
        }

        if (allSorted.length === 0) {
            list.innerHTML = '<li class="bar-item" style="cursor: default;"><span style="color: #64748b;">No region data for current filter</span></li>';
            if (toggleBtn) toggleBtn.style.display = 'none';
            return;
        }

        const visibleItems = showAllRegions ? allSorted : allSorted.slice(0, 8);
        const maxCount = allSorted[0][1];

        list.innerHTML = visibleItems.map(([region, count], i) => {
            const barPct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
            const sharePct = stats.total > 0 ? Math.max(1, Math.round((count / stats.total) * 100)) : 0;
            const isSelected = activeStatsFilter.region === region;
            return `
                <li class="bar-item${isSelected ? ' is-selected' : ''}" data-region="${escapeHTML(region)}" title="Click to filter by ${escapeHTML(region)}">
                    <span class="bar-rank">${i + 1}</span>
                    <div class="bar-info">
                        <div class="bar-label-row">
                            <div class="bar-label">${escapeHTML(region)}</div>
                            <span class="bar-value">${count.toLocaleString()}<span class="bar-pct">(${sharePct}%)</span></span>
                        </div>
                        <div class="bar-track">
                            <div class="bar-fill" style="width: ${barPct}%"></div>
                        </div>
                    </div>
                </li>
            `;
        }).join('');

        list.querySelectorAll('.bar-item[data-region]').forEach(item => {
            item.addEventListener('click', () => {
                const reg = item.getAttribute('data-region');
                if (reg) toggleStatsFilter('region', reg);
            });
        });

        if (toggleBtn) {
            if (allSorted.length > 8) {
                toggleBtn.style.display = 'block';
                toggleBtn.textContent = showAllRegions
                    ? 'Show top 8 regions ▴'
                    : `Show all ${allSorted.length} regions ▾`;
            } else {
                toggleBtn.style.display = 'none';
            }
        }
    }

    // Render interactive Organizations & Affiliations leaderboard
    function renderOrganizations(stats) {
        const list = document.getElementById('orgsList');
        const badge = document.getElementById('orgTotalBadge');
        const toggleBtn = document.getElementById('toggleAllOrgsBtn');
        if (!list) return;

        // Sort known organizations first by count, keep '__none__' at the bottom if present
        const entries = Object.entries(stats.byOrg).sort((a, b) => {
            if (a[0] === '__none__') return 1;
            if (b[0] === '__none__') return -1;
            return b[1] - a[1];
        });

        const namedCount = entries.filter(e => e[0] !== '__none__').length;
        if (badge) {
            badge.textContent = `${namedCount} ${namedCount === 1 ? 'affiliation' : 'affiliations'}`;
        }

        if (entries.length === 0) {
            list.innerHTML = '<li class="bar-item" style="cursor: default;"><span style="color: #64748b;">No affiliation data for current filter</span></li>';
            if (toggleBtn) toggleBtn.style.display = 'none';
            return;
        }

        const visibleItems = showAllOrgs ? entries : entries.slice(0, 8);
        const maxCount = Math.max(...entries.map(e => e[1]));

        list.innerHTML = visibleItems.map(([orgKey, count], i) => {
            const barPct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
            const sharePct = stats.total > 0 ? Math.max(1, Math.round((count / stats.total) * 100)) : 0;
            const isSelected = activeStatsFilter.org === orgKey;
            const displayLabel = orgKey === '__none__'
                ? 'Independent / Civilian / Unspecified'
                : (ORG_LABELS[orgKey] || orgKey);

            return `
                <li class="bar-item${isSelected ? ' is-selected' : ''}" data-org="${escapeHTML(orgKey)}" title="Click to filter by ${escapeHTML(displayLabel)}">
                    <span class="bar-rank">${i + 1}</span>
                    <div class="bar-info">
                        <div class="bar-label-row">
                            <div class="bar-label">${escapeHTML(displayLabel)}</div>
                            <span class="bar-value">${count.toLocaleString()}<span class="bar-pct">(${sharePct}%)</span></span>
                        </div>
                        <div class="bar-track">
                            <div class="bar-fill" style="width: ${barPct}%"></div>
                        </div>
                    </div>
                </li>
            `;
        }).join('');

        list.querySelectorAll('.bar-item[data-org]').forEach(item => {
            item.addEventListener('click', () => {
                const orgKey = item.getAttribute('data-org');
                if (orgKey) toggleStatsFilter('org', orgKey);
            });
        });

        if (toggleBtn) {
            if (entries.length > 8) {
                toggleBtn.style.display = 'block';
                toggleBtn.textContent = showAllOrgs
                    ? 'Show top 8 affiliations ▴'
                    : `Show all ${entries.length} affiliations ▾`;
            } else {
                toggleBtn.style.display = 'none';
            }
        }
    }

    // Render monthly chart
    function renderMonthly(stats) {
        const canvas = document.getElementById('monthlyChart');
        const peakBadge = document.getElementById('monthlyPeakBadge');
        const chartWrapper = document.getElementById('monthlyChartWrapper');
        const tableWrapper = document.getElementById('monthlyTableWrapper');
        if (chartWrapper && tableWrapper) {
            chartWrapper.style.display = activeViews.monthly === 'chart' ? 'block' : 'none';
            tableWrapper.classList.toggle('is-visible', activeViews.monthly === 'table');
        }
        if (!canvas) return;

        const maxVal = Math.max(...stats.byMonth);
        const peakIdx = stats.byMonth.indexOf(maxVal);
        if (peakBadge) {
            peakBadge.textContent = maxVal > 0
                ? `Peak Month: ${FULL_MONTHS[peakIdx]} (${maxVal})`
                : 'Peak Month: —';
        }

        if (monthlyChart) {
            monthlyChart.destroy();
            monthlyChart = null;
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const gridColor = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(15, 23, 42, 0.06)';
        const textColor = isDark ? '#94a3b8' : '#64748b';

        // Create memorial green gradient
        const ctx = canvas.getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 220);
        gradient.addColorStop(0, isDark ? 'rgba(74, 222, 128, 0.32)' : 'rgba(22, 163, 74, 0.28)');
        gradient.addColorStop(1, isDark ? 'rgba(74, 222, 128, 0.02)' : 'rgba(22, 163, 74, 0.02)');

        const pointBgColors = MONTHS.map((_, idx) => {
            if (activeStatsFilter.month === idx) {
                return isDark ? '#ffffff' : '#0d2110';
            }
            return isDark ? '#4ade80' : '#15803d';
        });

        const pointRadii = MONTHS.map((_, idx) => {
            if (activeStatsFilter.month === idx) return 6;
            if (idx === peakIdx && maxVal > 0) return 5;
            return 3.5;
        });

        monthlyChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels: MONTHS,
                datasets: [{
                    data: stats.byMonth,
                    fill: true,
                    backgroundColor: gradient,
                    borderColor: isDark ? '#4ade80' : '#15803d',
                    borderWidth: 2.5,
                    tension: 0.38,
                    pointBackgroundColor: pointBgColors,
                    pointBorderColor: isDark ? '#0f172a' : '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: pointRadii,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                onClick: (event, elements) => {
                    if (elements && elements.length > 0) {
                        const moIdx = elements[0].index;
                        toggleStatsFilter('month', moIdx);
                    }
                },
                onHover: (event, chartElement) => {
                    if (event?.native?.target) {
                        event.native.target.style.cursor = chartElement.length ? 'pointer' : 'default';
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: isDark ? '#0f172a' : '#ffffff',
                        titleColor: isDark ? '#f8fafc' : '#0f172a',
                        bodyColor: isDark ? '#86efac' : '#15803d',
                        borderColor: isDark ? '#22c55e' : '#bbf7d0',
                        borderWidth: 1,
                        padding: 11,
                        displayColors: false,
                        callbacks: {
                            title: ctx => FULL_MONTHS[ctx[0].dataIndex],
                            label: ctx => `${ctx.raw.toLocaleString()} documented — click to filter`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, font: { size: 11, weight: '600' } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            font: { size: 11 },
                            callback: v => Number.isInteger(v) ? v : ''
                        }
                    }
                }
            }
        });
    }

    // Render accessible, mobile-friendly data table for Monthly Distribution
    function renderMonthlyTable(stats) {
        const tbody = document.getElementById('monthlyTableBody');
        if (!tbody) return;

        const maxVal = Math.max(...stats.byMonth);
        const peakIdx = stats.byMonth.indexOf(maxVal);
        const monthlyTotal = stats.byMonth.reduce((a, b) => a + b, 0);

        tbody.innerHTML = FULL_MONTHS.map((monthName, idx) => {
            const count = stats.byMonth[idx] || 0;
            const sharePct = monthlyTotal > 0 ? Math.max(1, Math.round((count / monthlyTotal) * 100)) : 0;
            const barWidth = maxVal > 0 ? Math.round((count / maxVal) * 100) : 0;
            const isSelected = activeStatsFilter.month === idx;
            const isPeak = idx === peakIdx && maxVal > 0;

            return `
                <tr class="${isSelected ? 'is-selected' : ''}" data-row-month="${idx}">
                    <td style="font-weight: 700; white-space: nowrap;">
                        ${monthName} ${isPeak ? '<span style="color:#eab308;" title="Peak Month">★ Peak</span>' : ''}
                    </td>
                    <td style="font-variant-numeric: tabular-nums; font-weight: 600;">
                        ${count.toLocaleString()} ${count === 1 ? 'martyr' : 'martyrs'}
                    </td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 0.55rem;">
                            <div class="bar-track" style="flex: 1; min-width: 60px; max-width: 140px; margin: 0;">
                                <div class="bar-fill" style="width: ${barWidth}%;"></div>
                            </div>
                            <span style="font-size: 0.76rem; color: #64748b; font-weight: 600; min-width: 32px;">${sharePct}%</span>
                        </div>
                    </td>
                    <td style="text-align: right; white-space: nowrap;">
                        <button type="button" class="table-filter-btn${isSelected ? ' is-active' : ''}" data-filter-month="${idx}">
                            ${isSelected ? '✓ Filtered' : 'Filter Month'}
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        tbody.querySelectorAll('[data-filter-month]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const mo = parseInt(btn.getAttribute('data-filter-month'), 10);
                if (!isNaN(mo)) toggleStatsFilter('month', mo);
            });
        });

        tbody.querySelectorAll('tr[data-row-month]').forEach(row => {
            row.addEventListener('click', () => {
                const mo = parseInt(row.getAttribute('data-row-month'), 10);
                if (!isNaN(mo)) toggleStatsFilter('month', mo);
            });
            row.style.cursor = 'pointer';
        });
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

    // Re-render charts in-place on theme change (without re-fetching from Firebase)
    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
            if (m.attributeName === 'data-theme') {
                setTimeout(refreshDashboardUI, 40);
            }
        });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    // ============================================
    // PDF GENERATION - Professional Multi-Page Layout & Filters
    // ============================================

    const PDF_MONTH_NAMES = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    let pdfFiltersInitialized = false;

    function populatePdfFilters() {
        if (!allMartyrsData || allMartyrsData.length === 0) return;

        const yearSelect = document.getElementById('pdfFilterYear');
        const monthSelect = document.getElementById('pdfFilterMonth');
        const orgSelect = document.getElementById('pdfFilterOrg');

        if (!yearSelect || !monthSelect || !orgSelect) return;

        const prevYear = yearSelect.value || 'all';
        const prevMonth = monthSelect.value || 'all';
        const prevOrg = orgSelect.value || 'all';

        // 1. Collect years with counts
        const yearCounts = new Map();
        let unknownYearCount = 0;

        // 2. Collect organizations with counts
        const orgCounts = new Map();
        let noOrgCount = 0;

        allMartyrsData.forEach(m => {
            // Year
            const yr = extractYear(m.martyrdomDate);
            if (yr && yr >= 1800 && yr <= 2100) {
                yearCounts.set(yr, (yearCounts.get(yr) || 0) + 1);
            } else {
                unknownYearCount++;
            }

            // Organization (normalized so duplicates & sub-wings are unified)
            const normOrg = normalizeOrg(m.organization);
            if (normOrg && normOrg !== '__none__') {
                orgCounts.set(normOrg, (orgCounts.get(normOrg) || 0) + 1);
            } else {
                noOrgCount++;
            }
        });

        // Populate Years dropdown (descending order)
        const sortedYears = [...yearCounts.keys()].sort((a, b) => b - a);
        yearSelect.innerHTML = `<option value="all">All Years (${allMartyrsData.length})</option>`;
        sortedYears.forEach(yr => {
            const opt = document.createElement('option');
            opt.value = String(yr);
            opt.textContent = `${yr} (${yearCounts.get(yr)})`;
            yearSelect.appendChild(opt);
        });
        if (unknownYearCount > 0) {
            const opt = document.createElement('option');
            opt.value = 'unknown';
            opt.textContent = `Year Not Specified (${unknownYearCount})`;
            yearSelect.appendChild(opt);
        }

        // Populate Organizations dropdown (sorted by count descending, then alphabetically)
        const sortedOrgs = [...orgCounts.entries()].sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            return a[0].localeCompare(b[0]);
        });
        orgSelect.innerHTML = `<option value="all">All Organizations (${allMartyrsData.length})</option>`;
        sortedOrgs.forEach(([org, count]) => {
            const opt = document.createElement('option');
            opt.value = org;
            opt.textContent = `${org} (${count})`;
            orgSelect.appendChild(opt);
        });
        if (noOrgCount > 0) {
            const opt = document.createElement('option');
            opt.value = '__none__';
            opt.textContent = `Independent / Not Specified (${noOrgCount})`;
            orgSelect.appendChild(opt);
        }

        // Restore selections if still valid
        if ([...yearSelect.options].some(o => o.value === prevYear)) {
            yearSelect.value = prevYear;
        } else {
            yearSelect.value = 'all';
        }

        if ([...monthSelect.options].some(o => o.value === prevMonth)) {
            monthSelect.value = prevMonth;
        } else {
            monthSelect.value = 'all';
        }

        if ([...orgSelect.options].some(o => o.value === prevOrg)) {
            orgSelect.value = prevOrg;
        } else {
            orgSelect.value = 'all';
        }

        updatePdfFilterSummary();
    }

    function getFilteredMartyrsForPdf() {
        if (!allMartyrsData || allMartyrsData.length === 0) return [];

        const yearSelect = document.getElementById('pdfFilterYear');
        const monthSelect = document.getElementById('pdfFilterMonth');
        const orgSelect = document.getElementById('pdfFilterOrg');

        const selectedYear = yearSelect ? yearSelect.value : 'all';
        const selectedMonth = monthSelect ? monthSelect.value : 'all';
        const selectedOrg = orgSelect ? orgSelect.value : 'all';

        return allMartyrsData.filter(m => {
            // Year filter
            if (selectedYear !== 'all') {
                const yr = extractYear(m.martyrdomDate);
                if (selectedYear === 'unknown') {
                    if (yr !== null && yr >= 1800 && yr <= 2100) return false;
                } else {
                    if (yr !== parseInt(selectedYear, 10)) return false;
                }
            }

            // Month filter
            if (selectedMonth !== 'all') {
                const mo = extractMonth(m.martyrdomDate);
                if (mo === null || mo !== parseInt(selectedMonth, 10)) return false;
            }

            // Organization filter (normalized)
            if (selectedOrg !== 'all') {
                const normOrg = normalizeOrg(m.organization);
                if (selectedOrg === '__none__') {
                    if (normOrg !== '__none__') return false;
                } else {
                    if (normOrg.toLowerCase() !== selectedOrg.toLowerCase()) return false;
                }
            }

            return true;
        });
    }

    function getFilterScopeDescription() {
        const yearSelect = document.getElementById('pdfFilterYear');
        const monthSelect = document.getElementById('pdfFilterMonth');
        const orgSelect = document.getElementById('pdfFilterOrg');

        const selectedYear = yearSelect ? yearSelect.value : 'all';
        const selectedMonth = monthSelect ? monthSelect.value : 'all';
        const selectedOrg = orgSelect ? orgSelect.value : 'all';

        const parts = [];
        let orgTitle = '';
        let timeTitle = '';

        if (selectedOrg !== 'all') {
            if (selectedOrg === '__none__') {
                parts.push('Independent / Not Specified');
                orgTitle = 'Independent';
            } else {
                parts.push(selectedOrg);
                orgTitle = selectedOrg;
            }
        }

        const monthName = selectedMonth !== 'all' && PDF_MONTH_NAMES[parseInt(selectedMonth, 10)] ? PDF_MONTH_NAMES[parseInt(selectedMonth, 10)] : null;
        const yearText = selectedYear !== 'all' ? (selectedYear === 'unknown' ? 'Unspecified Year' : selectedYear) : null;

        if (monthName && yearText) {
            parts.push(`${monthName} ${yearText}`);
            timeTitle = `${monthName} ${yearText}`;
        } else if (monthName) {
            parts.push(`${monthName}`);
            timeTitle = `${monthName}`;
        } else if (yearText) {
            parts.push(`Year ${yearText}`);
            timeTitle = `${yearText}`;
        }

        const isFiltered = parts.length > 0;
        const scopeSummary = isFiltered ? parts.join(' • ') : 'Complete Archive';

        let coverTitle = 'Baluch Martyrs Memorial';
        let coverSubtitle = 'A Digital Archive of Martyrs';
        let sectionHeader = 'Memorial Archive';

        if (orgTitle && timeTitle) {
            coverSubtitle = `${orgTitle} — ${timeTitle}`;
            sectionHeader = `${orgTitle} Archive (${timeTitle})`;
        } else if (orgTitle) {
            coverSubtitle = `${orgTitle} Archive`;
            sectionHeader = `${orgTitle} Archive`;
        } else if (timeTitle) {
            coverSubtitle = `${timeTitle} Archive`;
            sectionHeader = `${timeTitle} Archive`;
        } else {
            coverSubtitle = 'A Digital Archive of Martyrs';
            sectionHeader = 'Complete Memorial Archive';
        }

        return {
            isFiltered,
            scopeSummary,
            coverTitle,
            coverSubtitle,
            sectionHeader,
            orgTitle,
            monthName,
            yearText
        };
    }

    function updatePdfFilterSummary() {
        const btn = document.getElementById('downloadPdfBtn');
        const statusEl = document.getElementById('downloadFilterStatus');
        const statusText = document.getElementById('filterStatusText');
        const infoEl = document.getElementById('downloadInfo');

        const filtered = getFilteredMartyrsForPdf();
        const total = allMartyrsData ? allMartyrsData.length : 0;
        const desc = getFilterScopeDescription();

        // Update active filter pill
        if (statusEl && statusText) {
            if (desc.isFiltered) {
                statusEl.style.display = 'inline-flex';
                statusText.innerHTML = `<strong>Filter Active:</strong> ${escapeHtmlText(desc.scopeSummary)} (${filtered.length} of ${total} Profiles)`;
            } else {
                statusEl.style.display = 'none';
            }
        }

        // Update button text & disabled state
        if (btn) {
            const labelText = desc.isFiltered 
                ? (filtered.length === 0 ? 'No Profiles Matching' : `Download PDF (${filtered.length} Profiles)`)
                : `Download Complete Archive (${total})`;

            btn.innerHTML = `
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <span id="downloadBtnText">${labelText}</span>
            `;

            btn.disabled = filtered.length === 0;
        }

        // Update information caption
        if (infoEl) {
            if (filtered.length === 0) {
                infoEl.textContent = 'No martyrs found matching the selected filter combination.';
            } else if (desc.isFiltered) {
                infoEl.textContent = `Booklet will include ${filtered.length} profile${filtered.length === 1 ? '' : 's'} matching "${desc.scopeSummary}"`;
            } else {
                infoEl.textContent = `Archival booklet includes statistical overview, index, and all ${total} profiles`;
            }
        }
    }

    function escapeHtmlText(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function resetPdfFilters() {
        const yearSelect = document.getElementById('pdfFilterYear');
        const monthSelect = document.getElementById('pdfFilterMonth');
        const orgSelect = document.getElementById('pdfFilterOrg');

        if (yearSelect) yearSelect.value = 'all';
        if (monthSelect) monthSelect.value = 'all';
        if (orgSelect) orgSelect.value = 'all';

        updatePdfFilterSummary();
    }

    function setupPdfDownload() {
        populatePdfFilters();

        if (pdfFiltersInitialized) return;
        pdfFiltersInitialized = true;

        const btn = document.getElementById('downloadPdfBtn');
        const yearSelect = document.getElementById('pdfFilterYear');
        const monthSelect = document.getElementById('pdfFilterMonth');
        const orgSelect = document.getElementById('pdfFilterOrg');
        const resetBtn = document.getElementById('pdfResetFilterBtn');

        if (btn) {
            btn.addEventListener('click', generatePdf);
        }

        if (yearSelect) {
            yearSelect.addEventListener('change', updatePdfFilterSummary);
        }
        if (monthSelect) {
            monthSelect.addEventListener('change', updatePdfFilterSummary);
        }
        if (orgSelect) {
            orgSelect.addEventListener('change', updatePdfFilterSummary);
        }
        if (resetBtn) {
            resetBtn.addEventListener('click', resetPdfFilters);
        }
    }

    // ============================================
    // BOOKLET PDF GENERATION ENGINE (A4 Archival)
    // ============================================

    function buildPdfPalette() {
        return {
            primary: [28, 69, 36],        // #1c4524 Deep archival forest green
            forest: [44, 85, 48],         // #2c5530 Memorial green
            forestLight: [238, 246, 240], // #eef6f0 Pale sage surface tint
            ink: [15, 23, 42],            // #0f172a Deep slate ink
            body: [45, 55, 72],           // #2d3748 Charcoal prose
            muted: [100, 116, 139],       // #64748b Secondary slate labels
            ruleLight: [226, 232, 240],   // #e2e8f0 Hairline divider
            ruleMid: [203, 213, 225],     // #cbd5e1 Frame stroke
            surface: [248, 250, 252],     // #f8fafc Light surface card
            brass: [184, 146, 58],        // #b8923a Subtle archival brass rule
            goldCream: [245, 226, 166],   // Soft cream subtitle on dark cover
            mintLight: [206, 234, 214],   // Light mint eyebrow on dark cover
            flagBlue: [0, 102, 204],
            flagRed: [210, 28, 45],
            flagGreen: [28, 130, 52]
        };
    }

    function sanitizePdfText(value) {
        if (value === null || value === undefined) return '';
        const superscripts = {
            '\u2070': '0', '\u00B9': '1', '\u00B2': '2', '\u00B3': '3',
            '\u2074': '4', '\u2075': '5', '\u2076': '6', '\u2077': '7',
            '\u2078': '8', '\u2079': '9'
        };
        return String(value)
            .replace(/\u00A0/g, ' ')
            .replace(/[\u200B-\u200F\uFEFF\u202A-\u202E]/g, '')
            .replace(/[\u2070\u00B9\u00B2\u00B3\u2074-\u2079]/g, ch => superscripts[ch] || '')
            .replace(/[\u2018\u2019]/g, "'")
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/\u2026/g, '...')
            // Keep WinAnsi-safe characters so jsPDF built-in Helvetica never renders garbled boxes
            .replace(/[^\x09\x0A\x20-\xFF\u2013\u2014\u2022]/g, '');
    }

    function cleanPdfField(value) {
        if (value === null || value === undefined) return null;
        const cleaned = sanitizePdfText(value).replace(/\s+/g, ' ').trim();
        if (!cleaned) return null;
        if (/^(unknown|n\/a|na|nil|null|undefined|not\s*specified|unspecified|none|[-—–]+)$/i.test(cleaned)) {
            return null;
        }
        return cleaned;
    }

    function fitPdfTextWithEllipsis(doc, text, maxWidth) {
        const str = sanitizePdfText(text || '');
        if (!str) return '';
        if (doc.getTextWidth(str) <= maxWidth) return str;
        const ellipsis = '...';
        let low = 0;
        let high = str.length;
        while (low < high) {
            const mid = Math.ceil((low + high) / 2);
            const candidate = str.slice(0, mid).trimEnd() + ellipsis;
            if (doc.getTextWidth(candidate) <= maxWidth) {
                low = mid;
            } else {
                high = mid - 1;
            }
        }
        return (low > 0 ? str.slice(0, low).trimEnd() : '') + ellipsis;
    }

    function drawPdfBaluchStar(doc, cx, cy, outerR, innerR) {
        const points = [];
        for (let i = 0; i < 10; i++) {
            const angle = -Math.PI / 2 + (i * Math.PI / 5);
            const r = (i % 2 === 0) ? outerR : innerR;
            points.push({
                x: cx + r * Math.cos(angle),
                y: cy + r * Math.sin(angle)
            });
        }
        doc.setFillColor(255, 255, 255);
        for (let i = 0; i < 10; i++) {
            const next = (i + 1) % 10;
            doc.triangle(cx, cy, points[i].x, points[i].y, points[next].x, points[next].y, 'F');
        }
    }

    function drawPdfBaluchFlagRibbon(doc, x, y, width, totalHeight, palette, withTrim = true) {
        const stripeH = totalHeight / 3;
        const trimH = withTrim ? 0.5 : 0;

        if (withTrim) {
            doc.setFillColor(...palette.brass);
            doc.rect(x, y - trimH, width, trimH, 'F');
        }

        doc.setFillColor(...palette.flagBlue);
        doc.rect(x, y, width, stripeH, 'F');

        const starCx = x + (width / 2);
        const starCy = y + (stripeH / 2);
        const outerR = Math.min(stripeH * 0.42, 2.2);
        drawPdfBaluchStar(doc, starCx, starCy, outerR, outerR * 0.382);

        doc.setFillColor(...palette.flagRed);
        doc.rect(x, y + stripeH, width, stripeH, 'F');

        doc.setFillColor(...palette.flagGreen);
        doc.rect(x, y + (stripeH * 2), width, stripeH, 'F');

        if (withTrim) {
            doc.setFillColor(...palette.brass);
            doc.rect(x, y + totalHeight, width, trimH, 'F');
        }
    }

    // Center-X, top-weighted (face-safe) 4:5 portrait crop on shared canvas keeps PDF crisp & lightweight
    async function loadMartyrPortraitDataUrl(martyr, sharedCanvas, timeoutMs = 1500) {
        if (!martyr || martyr.photoRemoved === true || (martyr.hasPhoto === false && !martyr.photo && !martyr.photoPath)) return null;
        let rawSrc = martyr.photoPath || martyr.photo || null;
        if (!rawSrc && martyr.photoUpdatedAt && martyr.id && typeof window.resolveMartyrPhoto === 'function') {
            rawSrc = await window.resolveMartyrPhoto(martyr.id).catch(() => null);
        }
        if (!rawSrc && martyr.id) {
            rawSrc = `/assets/photos/${encodeURIComponent(martyr.id)}.jpg`;
        }
        if (!rawSrc || typeof rawSrc !== 'string') return null;

        const trimmed = rawSrc.trim();
        if (!/^https?:\/\/|^\/|^\.\/|^data:image\//i.test(trimmed)) {
            return null;
        }

        return new Promise((resolve) => {
            let done = false;
            const img = new Image();
            if (/^https?:\/\//i.test(trimmed)) {
                img.crossOrigin = 'anonymous';
            }

            const cleanup = () => {
                img.onload = null;
                img.onerror = null;
                img.src = '';
            };

            const timer = setTimeout(() => {
                if (!done) {
                    done = true;
                    cleanup();
                    resolve(null);
                }
            }, timeoutMs);

            img.onload = () => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                try {
                    const natW = img.naturalWidth || img.width || 180;
                    const natH = img.naturalHeight || img.height || 225;
                    const targetW = 180;
                    const targetH = 225;
                    const targetRatio = targetW / targetH; // 0.8 (4:5 portrait)
                    const natRatio = natW / natH;

                    let sx = 0;
                    let sy = 0;
                    let sw = natW;
                    let sh = natH;

                    if (natRatio > targetRatio) {
                        sw = natH * targetRatio;
                        sx = Math.max(0, (natW - sw) / 2);
                    } else if (natRatio < targetRatio) {
                        sh = natW / targetRatio;
                        // Bias upward (~20% from top) so portraits frame the face cleanly
                        sy = Math.max(0, (natH - sh) * 0.2);
                    }

                    if (sharedCanvas.width !== targetW) sharedCanvas.width = targetW;
                    if (sharedCanvas.height !== targetH) sharedCanvas.height = targetH;
                    const ctx = sharedCanvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, targetW, targetH);
                    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
                    const dataUrl = sharedCanvas.toDataURL('image/jpeg', 0.76);
                    cleanup();
                    resolve(dataUrl);
                } catch (err) {
                    cleanup();
                    resolve(null);
                }
            };

            img.onerror = () => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                cleanup();
                resolve(null);
            };

            img.src = trimmed;
        });
    }

    function drawPdfPhotoPlaceholder(doc, px, py, pw, ph, palette) {
        doc.setFillColor(...palette.surface);
        doc.rect(px, py, pw, ph, 'F');

        doc.setDrawColor(...palette.ruleMid);
        doc.setLineWidth(0.3);
        doc.rect(px, py, pw, ph, 'S');

        // Minimalist Baluchistan flag ribbon accent at top of placeholder
        const bandH = 0.9;
        doc.setFillColor(...palette.flagBlue);
        doc.rect(px + 0.4, py + 0.4, pw - 0.8, bandH, 'F');
        doc.setFillColor(...palette.flagRed);
        doc.rect(px + 0.4, py + 0.4 + bandH, pw - 0.8, bandH, 'F');
        doc.setFillColor(...palette.flagGreen);
        doc.rect(px + 0.4, py + 0.4 + bandH * 2, pw - 0.8, bandH, 'F');

        // Geometric head-and-shoulders memorial emblem (subtle slate tone)
        const cx = px + pw / 2;
        const cy = py + ph * 0.44;
        doc.setFillColor(218, 225, 232);
        doc.circle(cx, cy - 2.6, 3.3, 'F');
        doc.ellipse(cx, cy + 4.4, 6.2, 3.6, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.5);
        doc.setTextColor(...palette.muted);
        doc.text('ARCHIVAL', cx, py + ph - 5.2, { align: 'center' });
        doc.text('RECORD', cx, py + ph - 2.4, { align: 'center' });
    }

    function drawPdfCoverPage(doc, layout, filterDesc, stats, martyrCount, formattedDate, palette) {
        const { pageWidth, pageHeight } = layout;

        // Deep forest green archival header
        doc.setFillColor(...palette.primary);
        doc.rect(0, 0, pageWidth, 52, 'F');
        doc.setFillColor(...palette.brass);
        doc.rect(0, 2.5, pageWidth, 0.6, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...palette.mintLight);
        doc.text('OFFICIAL DIGITAL ARCHIVE  •  MEMORIAL EDITION', pageWidth / 2, 15, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(24);
        doc.setTextColor(255, 255, 255);
        doc.text('BALUCH MARTYRS MEMORIAL', pageWidth / 2, 27.5, { align: 'center' });

        doc.setDrawColor(...palette.brass);
        doc.setLineWidth(0.5);
        doc.line(pageWidth / 2 - 28, 33, pageWidth / 2 + 28, 33);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(11);
        doc.setTextColor(...palette.goldCream);
        doc.text(sanitizePdfText(filterDesc.coverSubtitle).toUpperCase(), pageWidth / 2, 42, { align: 'center' });

        // Crisp 9mm Baluchistan flag ribbon
        drawPdfBaluchFlagRibbon(doc, 0, 52, pageWidth, 9, palette, true);

        // Editorial Edition Card
        const cardX = 16;
        const cardY = 74;
        const cardW = pageWidth - 32;
        const cardH = 92;

        doc.setFillColor(...palette.surface);
        doc.roundedRect(cardX, cardY, cardW, cardH, 2.5, 2.5, 'F');
        doc.setDrawColor(...palette.ruleLight);
        doc.setLineWidth(0.4);
        doc.roundedRect(cardX, cardY, cardW, cardH, 2.5, 2.5, 'S');

        // Left green spine accent inside card
        doc.setFillColor(...palette.primary);
        doc.rect(cardX, cardY + 10, 2.2, cardH - 20, 'F');

        // Top band inside card
        doc.setFillColor(241, 245, 249);
        doc.rect(cardX + 0.2, cardY + 0.2, cardW - 0.4, 10, 'F');
        doc.setDrawColor(...palette.ruleMid);
        doc.setLineWidth(0.3);
        doc.line(cardX, cardY + 10.2, cardX + cardW, cardY + 10.2);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...palette.primary);
        doc.text('ARCHIVAL EDITION SPECIFICATION', cardX + 7, cardY + 6.7);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...palette.muted);
        doc.text('baluchmartyrs.com', cardX + cardW - 7, cardY + 6.7, { align: 'right' });

        // Scope title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.setTextColor(...palette.ink);
        const safeSectionHeader = fitPdfTextWithEllipsis(doc, filterDesc.sectionHeader, cardW - 18);
        doc.text(safeSectionHeader, pageWidth / 2, cardY + 21.5, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...palette.forest);
        const scopeLine = filterDesc.isFiltered
            ? `Filtered Edition: ${sanitizePdfText(filterDesc.scopeSummary)}`
            : 'Unabridged Historical & Biographical Registry';
        doc.text(fitPdfTextWithEllipsis(doc, scopeLine, cardW - 20), pageWidth / 2, cardY + 28, { align: 'center' });

        doc.setDrawColor(...palette.ruleLight);
        doc.setLineWidth(0.35);
        doc.line(cardX + 10, cardY + 33.5, cardX + cardW - 10, cardY + 33.5);

        // 2x2 Summary Metrics Grid inside card
        const spanText = stats.years.length > 0
            ? (stats.minYear === stats.maxYear ? String(stats.minYear) : `${stats.minYear} - ${stats.maxYear}`)
            : 'Historical Archive';
        const bioRate = `${stats.withBio.toLocaleString()} (${stats.storyPercent}%)`;
        const colLeftX = cardX + cardW * 0.27;
        const colRightX = cardX + cardW * 0.73;

        const cells = [
            { x: colLeftX, y: cardY + 43, label: 'PROFILES INCLUDED', val: `${martyrCount.toLocaleString()} Martyrs`, color: palette.primary },
            { x: colRightX, y: cardY + 43, label: 'TIME SPAN COVERED', val: spanText, color: palette.ink },
            { x: colLeftX, y: cardY + 61.5, label: 'RECORDED BIOGRAPHIES', val: bioRate, color: palette.ink },
            { x: colRightX, y: cardY + 61.5, label: 'PUBLICATION DATE', val: formattedDate, color: palette.ink }
        ];

        cells.forEach(cell => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.8);
            doc.setTextColor(...palette.muted);
            doc.text(cell.label, cell.x, cell.y, { align: 'center' });

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.setTextColor(...cell.color);
            doc.text(cell.val, cell.x, cell.y + 7, { align: 'center' });
        });

        // Bottom summary strip inside card
        doc.setFillColor(...palette.forestLight);
        doc.rect(cardX + 0.2, cardY + cardH - 12, cardW - 0.4, 11.8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.8);
        doc.setTextColor(...palette.primary);
        const reachSummary = `${stats.orgCount} Documented Organizations   •   ${stats.regionCount} Affected Regions   •   Alphabetically Indexed`;
        doc.text(reachSummary, pageWidth / 2, cardY + cardH - 4.7, { align: 'center' });

        // Booklet Structure Pillars
        const pillarY = 178;
        const pillarH = 30;
        const pillarGap = 4;
        const pillarW = (cardW - pillarGap * 2) / 3;
        const pillars = [
            { num: 'PART I', title: 'Statistical Overview', desc: 'Timeline, organization & region breakdowns plus section index' },
            { num: 'PART II', title: 'Memorial Directory', desc: 'Portraits, verified dates, metadata & biographical narratives' },
            { num: 'PART III', title: 'Archival Colophon', desc: 'Solemn historical dedication & edition reference details' }
        ];

        pillars.forEach((p, idx) => {
            const px = cardX + idx * (pillarW + pillarGap);
            doc.setFillColor(255, 255, 255);
            doc.roundedRect(px, pillarY, pillarW, pillarH, 1.5, 1.5, 'F');
            doc.setDrawColor(...palette.ruleLight);
            doc.setLineWidth(0.35);
            doc.roundedRect(px, pillarY, pillarW, pillarH, 1.5, 1.5, 'S');

            doc.setFillColor(...palette.forest);
            doc.rect(px, pillarY, pillarW, 1.2, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.5);
            doc.setTextColor(...palette.brass);
            doc.text(p.num, px + 4, pillarY + 6.5);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.8);
            doc.setTextColor(...palette.ink);
            doc.text(p.title, px + 4, pillarY + 12);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.2);
            doc.setTextColor(...palette.muted);
            const lines = doc.splitTextToSize(p.desc, pillarW - 8);
            lines.slice(0, 3).forEach((ln, li) => {
                doc.text(ln, px + 4, pillarY + 17.5 + li * 3.6);
            });
        });

        // Solemn Dedication
        const dedY = 223;
        doc.setDrawColor(...palette.brass);
        doc.setLineWidth(0.45);
        doc.line(pageWidth / 2 - 24, dedY, pageWidth / 2 + 24, dedY);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(...palette.primary);
        doc.text('In Sacred Honor and Eternal Remembrance', pageWidth / 2, dedY + 8.5, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...palette.body);
        doc.text('Preserving the memory, courage, and sacrifice of those who laid down', pageWidth / 2, dedY + 16, { align: 'center' });
        doc.text('their lives in the steadfast pursuit of freedom, dignity, and justice.', pageWidth / 2, dedY + 21.5, { align: 'center' });

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8.2);
        doc.setTextColor(...palette.muted);
        doc.text('"Martyrs do not die; they live forever in the collective memory of the nation."', pageWidth / 2, dedY + 30, { align: 'center' });

        doc.setDrawColor(...palette.brass);
        doc.setLineWidth(0.45);
        doc.line(pageWidth / 2 - 24, dedY + 36, pageWidth / 2 + 24, dedY + 36);

        // Cover bottom bar
        doc.setFillColor(...palette.primary);
        doc.rect(0, pageHeight - 21, pageWidth, 21, 'F');
        doc.setFillColor(...palette.brass);
        doc.rect(0, pageHeight - 21, pageWidth, 0.6, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.setTextColor(255, 255, 255);
        doc.text('BALUCH MARTYRS MEMORIAL ARCHIVE', pageWidth / 2, pageHeight - 12.2, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.2);
        doc.setTextColor(...palette.mintLight);
        doc.text('baluchmartyrs.com  •  Verified Historical Registry', pageWidth / 2, pageHeight - 6.8, { align: 'center' });
    }

    function drawVectorBarPanel(doc, x, y, w, h, title, items, totalCount, barColor, palette) {
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x, y, w, h, 1.5, 1.5, 'F');
        doc.setDrawColor(...palette.ruleLight);
        doc.setLineWidth(0.35);
        doc.roundedRect(x, y, w, h, 1.5, 1.5, 'S');

        // Header bar inside panel
        doc.setFillColor(...palette.surface);
        doc.rect(x + 0.2, y + 0.2, w - 0.4, 7.6, 'F');
        doc.setDrawColor(...palette.ruleLight);
        doc.setLineWidth(0.25);
        doc.line(x, y + 7.8, x + w, y + 7.8);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...palette.primary);
        doc.text(title, x + 3.5, y + 5.2);

        const maxVal = items.reduce((m, it) => Math.max(m, it.count), 1);
        const labelW = 33;
        const countW = 16;
        const barMaxW = w - labelW - countW - 9;
        const rowStartY = y + 12.8;
        const rowStep = 6.2;

        items.forEach((item, idx) => {
            const ry = rowStartY + idx * rowStep;

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...palette.ink);
            const fittedLabel = fitPdfTextWithEllipsis(doc, item.label, labelW - 1.5);
            doc.text(fittedLabel, x + 3.5, ry);

            // Track
            const trackX = x + 3.5 + labelW;
            const trackY = ry - 2.6;
            const trackH = 3.0;
            doc.setFillColor(241, 245, 249);
            doc.roundedRect(trackX, trackY, barMaxW, trackH, 0.7, 0.7, 'F');

            // Proportional bar
            const fillW = Math.max(1.2, (item.count / maxVal) * barMaxW);
            doc.setFillColor(...barColor);
            doc.roundedRect(trackX, trackY, fillW, trackH, 0.7, 0.7, 'F');

            // Count & %
            const pct = totalCount > 0 ? Math.round((item.count / totalCount) * 100) : 0;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.8);
            doc.setTextColor(...palette.body);
            doc.text(`${item.count} (${pct}%)`, x + w - 3, ry, { align: 'right' });
        });
    }

    function drawPdfStatisticalOverview(doc, layout, stats, filterDesc, palette) {
        const { margin, contentWidth, contentTopY } = layout;
        let curY = contentTopY;

        // Section Heading
        doc.setFillColor(...palette.primary);
        doc.rect(margin, curY, 2.2, 7.5, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(...palette.ink);
        doc.text('PART I  •  STATISTICAL OVERVIEW & INDEX', margin + 5, curY + 5.3);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...palette.muted);
        const scopeLabel = fitPdfTextWithEllipsis(doc, filterDesc.scopeSummary, 72);
        doc.text(scopeLabel, margin + contentWidth, curY + 5.1, { align: 'right' });

        curY += 10.5;

        // 4-Card KPI Strip
        const kpiGap = 3;
        const kpiW = (contentWidth - kpiGap * 3) / 4;
        const kpiH = 18.5;
        const spanValue = stats.years.length > 0
            ? (stats.minYear === stats.maxYear ? String(stats.minYear) : `${stats.minYear}-${stats.maxYear}`)
            : 'N/A';

        const kpis = [
            { label: 'TOTAL PROFILES', value: stats.total.toLocaleString(), sub: 'Verified records', accent: palette.primary },
            { label: 'TIME SPAN', value: spanValue, sub: `${stats.years.length} active years`, accent: palette.forest },
            { label: 'BIOGRAPHIES', value: `${stats.storyPercent}%`, sub: `${stats.withBio.toLocaleString()} documented`, accent: palette.ink },
            { label: 'GEOGRAPHY & ORGS', value: `${stats.regionCount} / ${stats.orgCount}`, sub: 'Regions / Organizations', accent: palette.brass }
        ];

        kpis.forEach((k, idx) => {
            const kx = margin + idx * (kpiW + kpiGap);
            doc.setFillColor(...palette.surface);
            doc.roundedRect(kx, curY, kpiW, kpiH, 1.5, 1.5, 'F');
            doc.setDrawColor(...palette.ruleLight);
            doc.setLineWidth(0.3);
            doc.roundedRect(kx, curY, kpiW, kpiH, 1.5, 1.5, 'S');

            doc.setFillColor(...k.accent);
            doc.rect(kx, curY, kpiW, 1.1, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.2);
            doc.setTextColor(...palette.muted);
            doc.text(k.label, kx + 3.5, curY + 5.5);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12.5);
            doc.setTextColor(...palette.ink);
            doc.text(k.value, kx + 3.5, curY + 12.2);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.6);
            doc.setTextColor(...palette.muted);
            doc.text(k.sub, kx + 3.5, curY + 16.5);
        });

        curY += kpiH + 4.5;

        // Left Panel: Top Years (or Monthly Distribution if single year)
        let leftTitle = 'PEAK MARTYRDOM YEARS';
        let leftItems = [];
        const yearEntries = Object.entries(stats.byYear)
            .map(([yr, cnt]) => ({ label: yr, count: cnt, yearNum: parseInt(yr, 10) }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8)
            .sort((a, b) => a.yearNum - b.yearNum);

        if (yearEntries.length > 1) {
            leftItems = yearEntries;
        } else {
            leftTitle = 'MONTHLY DISTRIBUTION';
            leftItems = stats.byMonth
                .map((cnt, idx) => ({ label: FULL_MONTHS[idx], count: cnt }))
                .filter(it => it.count > 0)
                .slice(0, 8);
            if (leftItems.length === 0) {
                leftItems = [{ label: 'Date Unspecified', count: stats.total }];
            }
        }

        // Right Panel: Organizations Breakdown
        const orgEntries = Object.entries(stats.byOrg)
            .map(([org, cnt]) => ({
                label: org === '__none__' ? 'Independent / Unspecified' : org.replace(/\s*\([^)]+\)$/, ''),
                count: cnt
            }))
            .sort((a, b) => b.count - a.count);

        let rightItems = orgEntries.slice(0, 7);
        if (orgEntries.length > 7) {
            const othersCount = orgEntries.slice(7).reduce((s, o) => s + o.count, 0);
            if (othersCount > 0) {
                rightItems.push({ label: `Other (${orgEntries.length - 7} orgs)`, count: othersCount });
            }
        }
        if (rightItems.length === 0) {
            rightItems = [{ label: 'Unspecified', count: stats.total }];
        }

        const chartRows = Math.max(leftItems.length, rightItems.length, 1);
        const chartH = 11.5 + chartRows * 6.2;
        const halfW = (contentWidth - 4) / 2;

        drawVectorBarPanel(doc, margin, curY, halfW, chartH, leftTitle, leftItems, stats.total, palette.forest, palette);
        drawVectorBarPanel(doc, margin + halfW + 4, curY, halfW, chartH, 'AFFILIATION BREAKDOWN', rightItems, stats.total, palette.primary, palette);

        curY += chartH + 4.5;

        // Leading Regions Strip (compact 3-column grid, dynamic row count up to 9 regions)
        const topRegions = Object.entries(stats.byRegion)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 9);

        if (topRegions.length > 0) {
            const regRows = Math.ceil(topRegions.length / 3);
            const regBoxH = 10.5 + regRows * 5.6;

            doc.setFillColor(255, 255, 255);
            doc.roundedRect(margin, curY, contentWidth, regBoxH, 1.5, 1.5, 'F');
            doc.setDrawColor(...palette.ruleLight);
            doc.setLineWidth(0.35);
            doc.roundedRect(margin, curY, contentWidth, regBoxH, 1.5, 1.5, 'S');

            doc.setFillColor(...palette.surface);
            doc.rect(margin + 0.2, curY + 0.2, contentWidth - 0.4, 7.2, 'F');
            doc.setDrawColor(...palette.ruleLight);
            doc.setLineWidth(0.25);
            doc.line(margin, curY + 7.4, margin + contentWidth, curY + 7.4);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.2);
            doc.setTextColor(...palette.primary);
            doc.text('LEADING DOCUMENTED REGIONS', margin + 3.5, curY + 5.0);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.8);
            doc.setTextColor(...palette.muted);
            doc.text(`${stats.regionCount} total documented places/regions`, margin + contentWidth - 3.5, curY + 5.0, { align: 'right' });

            const regColW = (contentWidth - 8) / 3;
            topRegions.forEach((reg, idx) => {
                const col = idx % 3;
                const row = Math.floor(idx / 3);
                const rx = margin + 3.5 + col * regColW;
                const ry = curY + 12.0 + row * 5.6;
                const pct = stats.total > 0 ? Math.round((reg.count / stats.total) * 100) : 0;

                doc.setFillColor(...palette.forest);
                doc.circle(rx + 1.2, ry - 1.0, 0.85, 'F');

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.2);
                doc.setTextColor(...palette.ink);
                const label = fitPdfTextWithEllipsis(doc, reg.name, regColW - 22);
                doc.text(label, rx + 3.5, ry);

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7);
                doc.setTextColor(...palette.muted);
                doc.text(`${reg.count} (${pct}%)`, rx + regColW - 4, ry, { align: 'right' });
            });

            curY += regBoxH + 4.5;
        }

        return { tocStartY: curY };
    }

    function drawPdfTableOfContents(doc, layout, tocStartY, tocEntries, isGroupedSections, closingPageNum, palette) {
        const { margin, contentWidth, contentBottomY } = layout;
        const maxBottom = contentBottomY - 2;
        const availH = maxBottom - tocStartY;
        if (availH < 24) return;

        // Build full index items list
        const items = [...tocEntries];
        items.push({ label: 'Closing Tribute', count: null, page: closingPageNum, isHighlight: true });

        const cols = isGroupedSections ? 3 : 2;
        const rowsPerCol = Math.ceil(items.length / cols);
        const rowH = Math.min(6.2, Math.max(4.8, (availH - 13) / Math.max(rowsPerCol, 1)));
        const boxH = Math.min(availH, 11.5 + rowsPerCol * rowH);

        doc.setFillColor(...palette.surface);
        doc.roundedRect(margin, tocStartY, contentWidth, boxH, 1.5, 1.5, 'F');
        doc.setDrawColor(...palette.ruleLight);
        doc.setLineWidth(0.35);
        doc.roundedRect(margin, tocStartY, contentWidth, boxH, 1.5, 1.5, 'S');

        doc.setFillColor(...palette.primary);
        doc.rect(margin, tocStartY, contentWidth, 7.6, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.4);
        doc.setTextColor(255, 255, 255);
        doc.text(isGroupedSections ? 'DIRECTORY CONTENTS & SECTION INDEX' : 'DIRECTORY CONTENTS & PROFILE INDEX', margin + 4, tocStartY + 5.1);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        doc.setTextColor(...palette.mintLight);
        doc.text(`Statistical Overview: p. 2  •  ${items.length - 1} Directory Entries`, margin + contentWidth - 4, tocStartY + 5.1, { align: 'right' });

        const colGap = 5;
        const colW = (contentWidth - 8 - colGap * (cols - 1)) / cols;
        const listStartY = tocStartY + 12.2;

        items.forEach((item, idx) => {
            const col = Math.floor(idx / rowsPerCol);
            const row = idx % rowsPerCol;
            if (col >= cols) return;

            const ix = margin + 4 + col * (colW + colGap);
            const iy = listStartY + row * rowH;
            if (iy > tocStartY + boxH - 2) return;

            const pageStr = `p. ${item.page}`;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            const pageW = doc.getTextWidth(pageStr);

            const titleText = item.count !== null && item.count !== undefined
                ? `${item.label} (${item.count})`
                : item.label;

            doc.setFont('helvetica', item.isHighlight ? 'bold' : 'normal');
            doc.setFontSize(7.1);
            doc.setTextColor(...(item.isHighlight ? palette.primary : palette.ink));
            const maxLabelW = colW - pageW - 5;
            const fitted = fitPdfTextWithEllipsis(doc, titleText, maxLabelW);
            const fittedW = doc.getTextWidth(fitted);
            doc.text(fitted, ix, iy);

            // Subtle dot leader between label and page number
            const leaderStart = ix + fittedW + 1.5;
            const leaderEnd = ix + colW - pageW - 1.5;
            if (leaderEnd - leaderStart > 2.5) {
                doc.setDrawColor(...palette.ruleMid);
                doc.setLineWidth(0.2);
                for (let dx = leaderStart; dx < leaderEnd; dx += 1.4) {
                    doc.line(dx, iy - 0.4, dx + 0.35, iy - 0.4);
                }
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7);
            doc.setTextColor(...palette.forest);
            doc.text(pageStr, ix + colW, iy, { align: 'right' });
        });

        // Fill remaining lower band on Page 2 cleanly with Editorial Standards & Navigation Guide
        const guideTop = tocStartY + boxH + 4.5;
        const guideAvail = maxBottom - guideTop;
        if (guideAvail >= 24) {
            const guideH = Math.min(34, guideAvail);
            doc.setFillColor(...palette.forestLight);
            doc.roundedRect(margin, guideTop, contentWidth, guideH, 1.5, 1.5, 'F');
            doc.setDrawColor(...palette.ruleMid);
            doc.setLineWidth(0.3);
            doc.roundedRect(margin, guideTop, contentWidth, guideH, 1.5, 1.5, 'S');
            doc.setFillColor(...palette.forest);
            doc.rect(margin, guideTop, 2.0, guideH, 'F');

            const gHalfW = (contentWidth - 14) / 2;
            const gx1 = margin + 5.5;
            const gx2 = gx1 + gHalfW + 6;

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.0);
            doc.setTextColor(...palette.primary);
            doc.text('ARCHIVAL STANDARDS & ACCURACY', gx1, guideTop + 6.2);
            doc.text('BOOKLET NAVIGATION & CITATION', gx2, guideTop + 6.2);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.1);
            doc.setTextColor(...palette.body);
            const leftCopy = 'Entries are compiled from verified memorial submissions on baluchmartyrs.com. Unverified or missing birth details are omitted cleanly rather than displaying placeholder text.';
            const rightCopy = 'Profiles are organized alphabetically with sequential record numbers (#0001+), normalized portraits, unified organization tags, and running section headers for archival reference.';

            doc.splitTextToSize(leftCopy, gHalfW).slice(0, 4).forEach((ln, idx) => {
                doc.text(ln, gx1, guideTop + 11.2 + idx * 3.8);
            });
            doc.splitTextToSize(rightCopy, gHalfW).slice(0, 4).forEach((ln, idx) => {
                doc.text(ln, gx2, guideTop + 11.2 + idx * 3.8);
            });
        }
    }

    function prepareMartyrEntry(doc, layout, martyr, indexNum) {
        const { contentWidth } = layout;
        const name = cleanPdfField(martyr.fullName) || 'Unnamed Martyr';
        const birthDate = formatDateForPdf(martyr.birthDate);
        const martyrdomDate = formatDateForPdf(martyr.martyrdomDate);
        const martyrdomPlace = cleanPdfField(martyr.martyrdomPlace);
        const birthPlace = cleanPdfField(martyr.birthPlace);
        const fatherName = cleanPdfField(martyr.fatherName);
        const organization = cleanPdfField(martyr.organization);
        const rank = cleanPdfField(martyr.rank);
        const familyDetails = cleanPdfField(martyr.familyDetails);

        const rawDetails = [];
        if (birthDate && martyrdomDate) {
            rawDetails.push({ label: 'LIVED', value: `${birthDate} - ${martyrdomDate}` });
        } else if (martyrdomDate) {
            rawDetails.push({ label: 'MARTYRDOM DATE', value: martyrdomDate });
        } else if (birthDate) {
            rawDetails.push({ label: 'BORN', value: birthDate });
        }
        if (martyrdomPlace) rawDetails.push({ label: 'MARTYRDOM PLACE', value: martyrdomPlace });
        if (birthPlace) rawDetails.push({ label: 'BIRTHPLACE', value: birthPlace });
        if (fatherName) rawDetails.push({ label: "FATHER'S NAME", value: fatherName });
        if (organization) rawDetails.push({ label: 'ORGANIZATION', value: organization });
        if (rank) rawDetails.push({ label: 'RANK / ROLE', value: rank });
        if (familyDetails) rawDetails.push({ label: 'FAMILY', value: familyDetails });

        const photoW = 24;
        const photoH = 30;
        const metaX = layout.margin + 2.5 + photoW + 5;
        const metaW = contentWidth - 2.5 - photoW - 5 - 3;

        // Name measurement
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        const nameLines = doc.splitTextToSize(name, metaW - 18);
        const nameLineH = 4.6;
        const nameBlockH = nameLines.length * nameLineH + 2.6;

        // 2-column stacked metadata pairs
        const colGap = 5;
        const colW = (metaW - colGap) / 2;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.0);
        const valLineH = 3.5;

        const measuredDetails = rawDetails.map(det => ({
            label: det.label,
            valLines: doc.splitTextToSize(det.value, colW - 0.5)
        }));

        const detailRows = [];
        let metadataGridH = 0;
        for (let idx = 0; idx < measuredDetails.length; idx += 2) {
            const left = measuredDetails[idx];
            const right = measuredDetails[idx + 1] || null;
            const maxLines = Math.max(left.valLines.length, right ? right.valLines.length : 0);
            const rowH = 3.0 + maxLines * valLineH + 1.8;
            detailRows.push({ left, right, rowH });
            metadataGridH += rowH;
        }

        const metaContentH = 1.5 + nameBlockH + metadataGridH;
        const headerInnerH = Math.max(photoH, metaContentH);
        const headerBoxH = headerInnerH + 4; // 2mm top + 2mm bottom padding inside header frame

        // Biography paragraphs & line tokens
        const bioMaxW = contentWidth - 4.5;
        const rawBio = sanitizePdfText(martyr.biography || '').replace(/\r\n?/g, '\n');
        const paragraphs = rawBio
            .split(/\n+/)
            .map(p => p.replace(/\s+/g, ' ').trim())
            .filter(Boolean);

        const bioLineH = 3.85;
        const paraExtraGap = 1.6;
        const bioTokens = [];

        if (paragraphs.length > 0) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.4);
            paragraphs.forEach((p, pIdx) => {
                const lines = doc.splitTextToSize(p, bioMaxW);
                const isLastPara = pIdx === paragraphs.length - 1;
                lines.forEach((ln, lIdx) => {
                    const isLastLineInPara = lIdx === lines.length - 1;
                    const gap = (!isLastPara && isLastLineInPara) ? paraExtraGap : 0;
                    bioTokens.push({
                        text: ln,
                        lineAdvance: bioLineH + gap
                    });
                });
            });
        }

        const totalBioH = bioTokens.reduce((sum, t) => sum + t.lineAdvance, 0);
        const bioSectionHeaderH = bioTokens.length > 0 ? 7.5 : 0;
        const noBioFooterH = bioTokens.length === 0 ? 6.0 : 0;
        const totalEntryH = headerBoxH + bioSectionHeaderH + totalBioH + noBioFooterH + 1.5;

        return {
            indexNum,
            martyr,
            name,
            nameLines,
            nameLineH,
            nameBlockH,
            photoW,
            photoH,
            metaX,
            metaW,
            colW,
            colGap,
            valLineH,
            detailRows,
            headerBoxH,
            bioTokens,
            bioLineH,
            bioSectionHeaderH,
            totalBioH,
            noBioFooterH,
            totalEntryH
        };
    }

    function renderMartyrHeaderBox(doc, layout, entry, topY, photoDataUrl, palette) {
        const { margin, contentWidth } = layout;

        // Clean framed header band
        doc.setFillColor(...palette.surface);
        doc.roundedRect(margin, topY, contentWidth, entry.headerBoxH, 1.2, 1.2, 'F');
        doc.setDrawColor(...palette.ruleLight);
        doc.setLineWidth(0.3);
        doc.roundedRect(margin, topY, contentWidth, entry.headerBoxH, 1.2, 1.2, 'S');

        // Left Forest Green accent bar
        doc.setFillColor(...palette.primary);
        doc.rect(margin, topY, 1.8, entry.headerBoxH, 'F');

        // Portrait
        const photoX = margin + 3.2;
        const photoY = topY + 2;
        if (photoDataUrl) {
            try {
                const imgFormat = photoDataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
                doc.addImage(photoDataUrl, imgFormat, photoX, photoY, entry.photoW, entry.photoH, undefined, 'MEDIUM');
                doc.setDrawColor(...palette.ruleMid);
                doc.setLineWidth(0.35);
                doc.rect(photoX, photoY, entry.photoW, entry.photoH, 'S');
            } catch (err) {
                drawPdfPhotoPlaceholder(doc, photoX, photoY, entry.photoW, entry.photoH, palette);
            }
        } else {
            drawPdfPhotoPlaceholder(doc, photoX, photoY, entry.photoW, entry.photoH, palette);
        }

        // Index badge top-right
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...palette.muted);
        doc.text(`#${String(entry.indexNum).padStart(4, '0')}`, margin + contentWidth - 3, topY + 5.8, { align: 'right' });

        // Name + Accent rule
        let curMetaY = topY + 5.8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11.5);
        doc.setTextColor(...palette.ink);
        entry.nameLines.forEach((ln, idx) => {
            doc.text(ln, entry.metaX, curMetaY + idx * entry.nameLineH);
        });

        const ruleY = curMetaY + (entry.nameLines.length - 1) * entry.nameLineH + 2.0;
        doc.setFillColor(...palette.forest);
        doc.rect(entry.metaX, ruleY, 22, 0.55, 'F');
        doc.setFillColor(...palette.brass);
        doc.rect(entry.metaX + 23, ruleY, 6, 0.55, 'F');

        // Stacked 2-column metadata grid (label directly above value prevents column collision)
        let gridY = ruleY + 4.0;
        entry.detailRows.forEach(pair => {
            const cols = [
                { det: pair.left, x: entry.metaX },
                ...(pair.right ? [{ det: pair.right, x: entry.metaX + entry.colW + entry.colGap }] : [])
            ];
            cols.forEach(({ det, x }) => {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(6.0);
                doc.setTextColor(...palette.muted);
                doc.text(det.label, x, gridY);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8.0);
                doc.setTextColor(...palette.ink);
                det.valLines.forEach((vLine, vIdx) => {
                    doc.text(vLine, x, gridY + 3.2 + vIdx * entry.valLineH);
                });
            });
            gridY += pair.rowH;
        });

        return topY + entry.headerBoxH;
    }

    function drawSectionBanner(doc, layout, topY, sectionInfo, palette) {
        const { margin, contentWidth } = layout;
        const barH = 8.0;

        doc.setFillColor(...palette.forestLight);
        doc.roundedRect(margin, topY, contentWidth, barH, 1.0, 1.0, 'F');
        doc.setFillColor(...palette.primary);
        doc.rect(margin, topY, 2.5, barH, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.8);
        doc.setTextColor(...palette.primary);
        doc.text(`SECTION ${sectionInfo.letter}`, margin + 5.5, topY + 5.3);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.4);
        doc.setTextColor(...palette.forest);
        doc.text(`${sectionInfo.count.toLocaleString()} ${sectionInfo.count === 1 ? 'Profile' : 'Profiles'}`, margin + contentWidth - 4, topY + 5.2, { align: 'right' });

        return topY + barH + 2.5;
    }

    function drawEntryDivider(doc, layout, y, palette) {
        const { margin, contentWidth, pageWidth } = layout;
        doc.setDrawColor(...palette.ruleLight);
        doc.setLineWidth(0.3);
        doc.line(margin, y, margin + contentWidth, y);

        doc.setFillColor(...palette.brass);
        doc.rect(pageWidth / 2 - 3, y - 0.45, 6, 0.9, 'F');
    }

    function renderBioSlice(doc, layout, tokens, startIdx, count, bioStartY, hasMoreAfter, palette) {
        const { margin, contentWidth } = layout;
        const endIdx = startIdx + count;
        let y = bioStartY;
        const textX = margin + 4.0;

        // Compute bottom for subtle left guide rule
        let sliceTextHeight = 0;
        for (let k = startIdx; k < endIdx; k++) {
            sliceTextHeight += tokens[k].lineAdvance;
        }
        const guideTop = bioStartY - 2.6;
        const guideBottom = Math.max(guideTop + 2, bioStartY + sliceTextHeight - 1.5);
        doc.setDrawColor(...palette.ruleMid);
        doc.setLineWidth(0.45);
        doc.line(margin + 1.0, guideTop, margin + 1.0, guideBottom);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.4);
        doc.setTextColor(...palette.body);

        for (let k = startIdx; k < endIdx; k++) {
            doc.text(tokens[k].text, textX, y);
            y += tokens[k].lineAdvance;
        }

        if (hasMoreAfter) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(6.6);
            doc.setTextColor(...palette.muted);
            doc.text('Continued on next page >', margin + contentWidth, y + 0.5, { align: 'right' });
            return y + 3.0;
        }

        return y;
    }

    function countTokensFitting(tokens, startIdx, maxHeight) {
        let used = 0;
        let count = 0;
        for (let i = startIdx; i < tokens.length; i++) {
            const step = tokens[i].lineAdvance;
            if (used + step > maxHeight + 0.01) break;
            used += step;
            count++;
        }
        return count;
    }

    function renderSingleMartyrEntry(doc, layout, entry, state, photoDataUrl, sectionStartInfo, palette) {
        const { contentTopY, contentBottomY, margin, contentWidth } = layout;

        const addManagedPage = (sectionLabel) => {
            doc.addPage();
            state.currentPage = doc.internal.getNumberOfPages();
            state.curY = contentTopY;
            state.pageSections[state.currentPage] = sectionLabel;
        };

        const bannerH = sectionStartInfo ? 10.5 : 0;
        const dividerH = state.curY > contentTopY ? 7.0 : 0;
        const availH = contentBottomY - (state.curY + dividerH);
        const fullNeededH = bannerH + entry.totalEntryH;

        let renderY = state.curY;
        const currentSectionLabel = state.activeSectionLabel || 'Memorial Directory';

        // Decide whether to draw on current page or start fresh
        let startsOnFreshPage = false;

        if (fullNeededH <= availH) {
            // Whole entry fits comfortably on current page
            if (dividerH > 0) {
                drawEntryDivider(doc, layout, renderY + dividerH / 2, palette);
                renderY += dividerH;
            }
        } else if (entry.bioTokens.length === 0 || (entry.bioTokens.length <= 6 && fullNeededH <= layout.usableHeight)) {
            // Keep compact / indivisible entries intact unless already at top of page
            if (state.curY > contentTopY) {
                addManagedPage(currentSectionLabel);
                renderY = state.curY;
                startsOnFreshPage = true;
            }
        } else {
            // Entry has >= 7 bio lines: start on current page if >= 4 lines + header fit cleanly (prevents half-page voids)
            const minLinesOnFirst = Math.min(4, entry.bioTokens.length);
            let minFirstBioH = 0;
            for (let k = 0; k < minLinesOnFirst; k++) minFirstBioH += entry.bioTokens[k].lineAdvance;
            const minSplitStartH = bannerH + entry.headerBoxH + entry.bioSectionHeaderH + minFirstBioH + 4.5;

            if (availH >= minSplitStartH) {
                if (dividerH > 0) {
                    drawEntryDivider(doc, layout, renderY + dividerH / 2, palette);
                    renderY += dividerH;
                }
            } else if (state.curY > contentTopY) {
                addManagedPage(currentSectionLabel);
                renderY = state.curY;
                startsOnFreshPage = true;
            }
        }

        // Record start page for Table of Contents
        const entryStartPage = state.currentPage;
        if (sectionStartInfo) {
            sectionStartInfo.onPageAssigned(entryStartPage);
            state.activeSectionLabel = `Section ${sectionStartInfo.letter}`;
            state.pageSections[entryStartPage] = state.activeSectionLabel;
        } else if (startsOnFreshPage && !state.pageSections[entryStartPage]) {
            state.pageSections[entryStartPage] = currentSectionLabel;
        }
        state.profilePages.push({ indexNum: entry.indexNum, name: entry.name, year: extractYear(entry.martyr.martyrdomDate), page: entryStartPage });

        // Draw optional Section Banner (kept attached to this entry, never orphaned)
        if (sectionStartInfo) {
            renderY = drawSectionBanner(doc, layout, renderY, sectionStartInfo, palette);
        }

        // Render Entry Header (Portrait + Name + Metadata)
        const afterHeaderY = renderMartyrHeaderBox(doc, layout, entry, renderY, photoDataUrl, palette);

        // No-biography compact archival footer
        if (entry.bioTokens.length === 0) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(7.2);
            doc.setTextColor(...palette.muted);
            doc.text('Archival biographical narrative pending verification.', margin + 2.5, afterHeaderY + 4.2);
            state.curY = afterHeaderY + entry.noBioFooterH + 1.0;
            return;
        }

        // Biography micro-heading
        const bioHeadY = afterHeaderY + 4.8;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(...palette.primary);
        doc.text('BIOGRAPHY & MEMORIAL RECORD', margin + 1, bioHeadY);
        const headW = doc.getTextWidth('BIOGRAPHY & MEMORIAL RECORD');
        doc.setDrawColor(...palette.ruleLight);
        doc.setLineWidth(0.3);
        doc.line(margin + headW + 3.5, bioHeadY - 1.0, margin + contentWidth, bioHeadY - 1.0);

        const bioStartY = afterHeaderY + entry.bioSectionHeaderH + 1.5;
        let nextTokenIdx = 0;

        // Check if entire bio finishes right on this page
        const availBioFirstPageFull = contentBottomY - bioStartY;
        const canFinishOnStartPage = entry.totalBioH <= availBioFirstPageFull;

        if (canFinishOnStartPage) {
            const endY = renderBioSlice(doc, layout, entry.bioTokens, 0, entry.bioTokens.length, bioStartY, false, palette);
            state.curY = endY + 1.5;
            return;
        }

        // Multi-page flow: reserve 4.5mm at bottom for "Continued on next page >"
        let firstFit = countTokensFitting(entry.bioTokens, 0, availBioFirstPageFull - 4.5);
        firstFit = Math.max(1, firstFit);
        // Widow protection: ensure at least 3 lines remain for next page if possible
        let remaining = entry.bioTokens.length - firstFit;
        if (remaining > 0 && remaining < 3 && firstFit - (3 - remaining) >= 4) {
            firstFit -= (3 - remaining);
        }

        renderBioSlice(doc, layout, entry.bioTokens, 0, firstFit, bioStartY, true, palette);
        nextTokenIdx = firstFit;

        // Continuation pages
        while (nextTokenIdx < entry.bioTokens.length) {
            addManagedPage(state.activeSectionLabel || currentSectionLabel);

            // Slim inline continuation bar inside content area (never overwritten by running header)
            const contBarH = 6.2;
            doc.setFillColor(...palette.forestLight);
            doc.roundedRect(margin, contentTopY, contentWidth, contBarH, 0.8, 0.8, 'F');
            doc.setFillColor(...palette.forest);
            doc.rect(margin, contentTopY, 1.8, contBarH, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.2);
            doc.setTextColor(...palette.primary);
            const contLabel = fitPdfTextWithEllipsis(doc, `CONTINUED BIOGRAPHY  —  ${entry.name}`, contentWidth - 10);
            doc.text(contLabel, margin + 4.5, contentTopY + 4.3);

            const sliceStartY = contentTopY + contBarH + 4.2;
            const availSliceFull = contentBottomY - sliceStartY;

            // Check if all remaining tokens fit cleanly without reserving continuation footer
            let remHeight = 0;
            for (let k = nextTokenIdx; k < entry.bioTokens.length; k++) remHeight += entry.bioTokens[k].lineAdvance;

            if (remHeight <= availSliceFull + 0.01) {
                const countHere = entry.bioTokens.length - nextTokenIdx;
                const endY = renderBioSlice(doc, layout, entry.bioTokens, nextTokenIdx, countHere, sliceStartY, false, palette);
                state.curY = endY + 1.5;
                nextTokenIdx = entry.bioTokens.length;
            } else {
                let countHere = countTokensFitting(entry.bioTokens, nextTokenIdx, availSliceFull - 4.5);
                countHere = Math.max(1, countHere);
                const remAfter = entry.bioTokens.length - (nextTokenIdx + countHere);
                if (remAfter > 0 && remAfter < 3 && countHere - (3 - remAfter) >= 4) {
                    countHere -= (3 - remAfter);
                }
                renderBioSlice(doc, layout, entry.bioTokens, nextTokenIdx, countHere, sliceStartY, true, palette);
                nextTokenIdx += countHere;
            }
        }
    }

    function drawPdfClosingTribute(doc, layout, filterDesc, stats, totalCount, totalPagesWithClosing, formattedDate, palette) {
        const { pageWidth, pageHeight } = layout;

        doc.setFillColor(...palette.surface);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');

        // Top forest band
        doc.setFillColor(...palette.primary);
        doc.rect(0, 0, pageWidth, 42, 'F');
        doc.setFillColor(...palette.brass);
        doc.rect(0, 42, pageWidth, 0.8, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...palette.mintLight);
        doc.text('PART III  •  ARCHIVAL COLOPHON & DEDICATION', pageWidth / 2, 14.5, { align: 'center' });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(255, 255, 255);
        doc.text('IN ETERNAL MEMORY', pageWidth / 2, 26.5, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...palette.goldCream);
        doc.text('BALUCH MARTYRS MEMORIAL HISTORICAL ARCHIVE', pageWidth / 2, 34.5, { align: 'center' });

        // Flag ribbon centered
        drawPdfBaluchFlagRibbon(doc, (pageWidth - 84) / 2, 54, 84, 7.5, palette, true);

        // Dedication prose
        let cy = 78;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10.5);
        doc.setTextColor(...palette.body);
        const proseLines = [
            'This memorial booklet is dedicated to the sacred memory of the martyrs of Baluchistan',
            'who laid down their lives in steadfast devotion to freedom, sovereignty, and justice.',
            'Their names, portraits, and life stories are preserved here so history bears witness.'
        ];
        proseLines.forEach(line => {
            doc.text(line, pageWidth / 2, cy, { align: 'center' });
            cy += 6.5;
        });

        cy += 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...palette.primary);
        doc.text('"Martyrs do not die; they live forever in the collective memory of the nation."', pageWidth / 2, cy, { align: 'center' });

        // Centered Verification & Citation Box
        const boxW = 158;
        const boxX = (pageWidth - boxW) / 2;
        const boxY = 122;
        const boxH = 86;

        doc.setFillColor(255, 255, 255);
        doc.roundedRect(boxX, boxY, boxW, boxH, 2.5, 2.5, 'F');
        doc.setDrawColor(...palette.ruleMid);
        doc.setLineWidth(0.35);
        doc.roundedRect(boxX, boxY, boxW, boxH, 2.5, 2.5, 'S');
        doc.setFillColor(...palette.primary);
        doc.rect(boxX, boxY, boxW, 8, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(255, 255, 255);
        doc.text('EDITION VERIFICATION & ARCHIVAL CITATION', pageWidth / 2, boxY + 5.4, { align: 'center' });

        const spanDisplay = stats.years.length > 0
            ? (stats.minYear === stats.maxYear ? String(stats.minYear) : `${stats.minYear} - ${stats.maxYear}`)
            : 'Historical Archive';

        const metaRows = [
            ['Archive Scope', sanitizePdfText(filterDesc.scopeSummary)],
            ['Total Documented Martyrs', `${totalCount.toLocaleString()} Profiles (${stats.withBio.toLocaleString()} with Biographies)`],
            ['Chronological Span', `${spanDisplay} (${stats.years.length} recorded years)`],
            ['Geographic & Org Coverage', `${stats.regionCount} Documented Regions  •  ${stats.orgCount} Organizations`],
            ['Volume Length & Date', `${totalPagesWithClosing.toLocaleString()} Pages  •  Generated ${formattedDate}`]
        ];

        let ry = boxY + 17.5;
        metaRows.forEach(([k, v], idx) => {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...palette.muted);
            doc.text(k, boxX + 8, ry);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.2);
            doc.setTextColor(...palette.ink);
            doc.text(fitPdfTextWithEllipsis(doc, v, boxW - 58), boxX + boxW - 8, ry, { align: 'right' });

            if (idx < metaRows.length - 1) {
                doc.setDrawColor(...palette.ruleLight);
                doc.setLineWidth(0.25);
                doc.line(boxX + 8, ry + 3.2, boxX + boxW - 8, ry + 3.2);
            }
            ry += 9.8;
        });

        // Citation strip
        doc.setFillColor(...palette.forestLight);
        doc.rect(boxX + 0.5, boxY + boxH - 16, boxW - 1, 15.5, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.2);
        doc.setTextColor(...palette.primary);
        doc.text('SUGGESTED ARCHIVAL CITATION', pageWidth / 2, boxY + boxH - 10.2, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...palette.body);
        doc.text(`Baluch Martyrs Memorial Archive (baluchmartyrs.com), ${filterDesc.scopeSummary}, Edition ${formattedDate}.`, pageWidth / 2, boxY + boxH - 4.8, { align: 'center' });

        // Editorial Note below box
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(...palette.muted);
        doc.text('Records in this edition reflect verified community and historical submissions preserved online.', pageWidth / 2, 228, { align: 'center' });
        doc.text('To submit corrections, photographs, or additional biographies, please visit baluchmartyrs.com.', pageWidth / 2, 234, { align: 'center' });

        // Bottom closing band
        doc.setFillColor(...palette.primary);
        doc.rect(0, pageHeight - 24, pageWidth, 24, 'F');
        doc.setFillColor(...palette.brass);
        doc.rect(0, pageHeight - 24, pageWidth, 0.7, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(255, 255, 255);
        doc.text('baluchmartyrs.com', pageWidth / 2, pageHeight - 14, { align: 'center' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.3);
        doc.setTextColor(...palette.mintLight);
        doc.text(`© ${new Date().getFullYear()} Baluch Martyrs Memorial Archive  •  Forever Remembered, Forever Honored`, pageWidth / 2, pageHeight - 8, { align: 'center' });
    }

    function applyPdfRunningChrome(doc, layout, filterDesc, pageSections, palette) {
        const { pageWidth, pageHeight, margin } = layout;
        const totalPages = doc.internal.getNumberOfPages();

        for (let p = 2; p < totalPages; p++) {
            doc.setPage(p);

            // Crisp top trim + editorial header rule (clean print-ready appearance)
            doc.setFillColor(...palette.primary);
            doc.rect(0, 0, pageWidth, 1.3, 'F');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.2);
            doc.setTextColor(...palette.primary);
            doc.text('BALUCH MARTYRS MEMORIAL ARCHIVE', margin, 8.8);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.2);
            doc.setTextColor(...palette.muted);
            const midLabel = pageSections[p] || 'Memorial Directory';
            doc.text(fitPdfTextWithEllipsis(doc, midLabel, 74), pageWidth / 2, 8.8, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.2);
            doc.setTextColor(...palette.muted);
            doc.text('baluchmartyrs.com', pageWidth - margin, 8.8, { align: 'right' });

            doc.setDrawColor(...palette.ruleMid);
            doc.setLineWidth(0.3);
            doc.line(margin, 11.8, pageWidth - margin, 11.8);

            // Clean bottom editorial footer rule
            doc.setDrawColor(...palette.ruleMid);
            doc.setLineWidth(0.3);
            doc.line(margin, pageHeight - 11.5, pageWidth - margin, pageHeight - 11.5);

            doc.setFont('helvetica', 'italic');
            doc.setFontSize(7.2);
            doc.setTextColor(...palette.muted);
            const leftFooter = filterDesc.isFiltered
                ? fitPdfTextWithEllipsis(doc, `${filterDesc.scopeSummary}  •  Forever Remembered`, 120)
                : 'Forever Remembered  •  Forever Honored';
            doc.text(leftFooter, margin, pageHeight - 6.2);

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.4);
            doc.setTextColor(...palette.ink);
            doc.text(`Page ${p} of ${totalPages}`, pageWidth - margin, pageHeight - 6.2, { align: 'right' });
        }
    }

    async function generatePdf() {
        const btn = document.getElementById('downloadPdfBtn');
        const progress = document.getElementById('downloadProgress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const yearSelect = document.getElementById('pdfFilterYear');
        const monthSelect = document.getElementById('pdfFilterMonth');
        const orgSelect = document.getElementById('pdfFilterOrg');

        const filteredMartyrs = getFilteredMartyrsForPdf();

        if (!filteredMartyrs || filteredMartyrs.length === 0) {
            alert('No martyrs found matching your selected filters.');
            return;
        }

        if (typeof window.jspdf === 'undefined') {
            alert('PDF library not loaded. Please refresh and try again.');
            return;
        }

        const { jsPDF } = window.jspdf;

        // Lock controls during generation
        btn.disabled = true;
        if (yearSelect) yearSelect.disabled = true;
        if (monthSelect) monthSelect.disabled = true;
        if (orgSelect) orgSelect.disabled = true;

        btn.innerHTML = '<div class="spinner"></div><span>Generating Memorial Booklet...</span>';
        if (progress) progress.style.display = 'block';

        const filterDesc = getFilterScopeDescription();
        const palette = buildPdfPalette();
        let finishedCleanly = false;

        try {
            updateProgress(progressFill, progressText, 2, 'Organizing archival records & statistics...');

            // Sort cleanly into contiguous alphabetical groups (A-Z, then #)
            const getGroupLetter = (nameStr) => {
                const first = sanitizePdfText(nameStr || '').trim().charAt(0).toUpperCase();
                return /^[A-Z]$/.test(first) ? first : '#';
            };

            const sortedMartyrs = [...filteredMartyrs].sort((a, b) => {
                const gA = getGroupLetter(a.fullName);
                const gB = getGroupLetter(b.fullName);
                if (gA !== gB) {
                    if (gA === '#') return 1;
                    if (gB === '#') return -1;
                    return gA.localeCompare(gB);
                }
                return sanitizePdfText(a.fullName || '').localeCompare(sanitizePdfText(b.fullName || ''));
            });

            const bookletStats = processData(sortedMartyrs);
            const useGroupedSections = sortedMartyrs.length > 25;

            // Count items per letter section up front
            const sectionCounts = new Map();
            if (useGroupedSections) {
                sortedMartyrs.forEach(m => {
                    const letter = getGroupLetter(m.fullName);
                    sectionCounts.set(letter, (sectionCounts.get(letter) || 0) + 1);
                });
            }

            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            });

            const layout = {
                pageWidth: doc.internal.pageSize.getWidth(),
                pageHeight: doc.internal.pageSize.getHeight(),
                margin: 14,
                contentWidth: doc.internal.pageSize.getWidth() - 28,
                contentTopY: 17.5,
                contentBottomY: doc.internal.pageSize.getHeight() - 15.5,
                usableHeight: doc.internal.pageSize.getHeight() - 33.0
            };

            const formattedDate = new Date().toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            // Page 1: Cover Page
            updateProgress(progressFill, progressText, 5, 'Designing archival cover page...');
            drawPdfCoverPage(doc, layout, filterDesc, bookletStats, sortedMartyrs.length, formattedDate, palette);

            // Page 2: Statistical Overview & Reserved TOC Page (for collections >= 4 profiles)
            const hasDedicatedOverviewPage = sortedMartyrs.length >= 4;
            let overviewTocStartY = null;
            const pageSections = {};

            if (hasDedicatedOverviewPage) {
                doc.addPage();
                pageSections[2] = 'Statistical Overview & Index';
                updateProgress(progressFill, progressText, 7, 'Compiling statistical overview...');
                const ovResult = drawPdfStatisticalOverview(doc, layout, bookletStats, filterDesc, palette);
                overviewTocStartY = ovResult.tocStartY;

                // Start Memorial Directory cleanly on Page 3
                doc.addPage();
                pageSections[3] = 'Memorial Directory';
            } else {
                // Ultra-small filtered sets (1-3 profiles): start directory directly on Page 2 with compact header strip
                doc.addPage();
                pageSections[2] = filterDesc.sectionHeader;
            }

            const state = {
                currentPage: doc.internal.getNumberOfPages(),
                curY: layout.contentTopY,
                activeSectionLabel: useGroupedSections ? 'Section A' : 'Memorial Directory',
                pageSections,
                profilePages: []
            };

            if (!hasDedicatedOverviewPage) {
                // Compact edition summary bar for 1-3 profile exports so Page 2 feels complete
                doc.setFillColor(...palette.forestLight);
                doc.roundedRect(layout.margin, state.curY, layout.contentWidth, 10, 1.2, 1.2, 'F');
                doc.setFillColor(...palette.primary);
                doc.rect(layout.margin, state.curY, 2.2, 10, 'F');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.2);
                doc.setTextColor(...palette.primary);
                doc.text(`MEMORIAL DIRECTORY  •  ${sortedMartyrs.length} ${sortedMartyrs.length === 1 ? 'PROFILE' : 'PROFILES'}`, layout.margin + 5.5, state.curY + 6.2);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.4);
                doc.setTextColor(...palette.muted);
                doc.text(fitPdfTextWithEllipsis(doc, filterDesc.scopeSummary, 72), layout.margin + layout.contentWidth - 4, state.curY + 6.2, { align: 'right' });

                state.curY += 13.5;
            }

            const sharedCanvas = document.createElement('canvas');
            const tocSectionEntries = [];
            let currentLetter = null;
            const BATCH_SIZE = 8;

            for (let batchStart = 0; batchStart < sortedMartyrs.length; batchStart += BATCH_SIZE) {
                const batchEnd = Math.min(batchStart + BATCH_SIZE, sortedMartyrs.length);
                const batchSlice = sortedMartyrs.slice(batchStart, batchEnd);

                const pct = Math.round(9 + ((batchStart / sortedMartyrs.length) * 84));
                updateProgress(progressFill, progressText, pct, `Formatting profiles ${batchStart + 1}-${batchEnd} of ${sortedMartyrs.length}...`);

                // Load batch portraits concurrently onto normalized 4:5 canvases
                const photoBatch = await Promise.all(
                    batchSlice.map(m => loadMartyrPortraitDataUrl(m, sharedCanvas, 1500))
                );

                for (let bIdx = 0; bIdx < batchSlice.length; bIdx++) {
                    const i = batchStart + bIdx;
                    const martyr = batchSlice[bIdx];
                    const photoDataUrl = photoBatch[bIdx];
                    const entry = prepareMartyrEntry(doc, layout, martyr, i + 1);

                    let sectionStartInfo = null;
                    if (useGroupedSections) {
                        const letter = getGroupLetter(martyr.fullName);
                        if (letter !== currentLetter) {
                            currentLetter = letter;
                            const count = sectionCounts.get(letter) || 0;
                            sectionStartInfo = {
                                letter,
                                count,
                                onPageAssigned: (assignedPage) => {
                                    tocSectionEntries.push({
                                        label: `Section ${letter}`,
                                        count,
                                        page: assignedPage
                                    });
                                }
                            };
                        }
                    }

                    renderSingleMartyrEntry(doc, layout, entry, state, photoDataUrl, sectionStartInfo, palette);
                }

                // Yield cleanly so browser UI & progress bar never freeze on iOS/mobile
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            // Free canvas buffer reference
            sharedCanvas.width = 0;
            sharedCanvas.height = 0;

            // Final Closing Tribute & Archival Colophon Page
            updateProgress(progressFill, progressText, 95, 'Finalizing Table of Contents & tribute...');
            doc.addPage();
            const closingPageNum = doc.internal.getNumberOfPages();
            drawPdfClosingTribute(doc, layout, filterDesc, bookletStats, sortedMartyrs.length, closingPageNum, formattedDate, palette);

            // Pass 2: Populate Table of Contents with exact live page numbers
            if (hasDedicatedOverviewPage && overviewTocStartY !== null) {
                doc.setPage(2);
                const tocList = useGroupedSections
                    ? tocSectionEntries
                    : state.profilePages.map(p => ({
                        label: `${String(p.indexNum).padStart(2, '0')}. ${p.name}${p.year ? ` (${p.year})` : ''}`,
                        count: null,
                        page: p.page
                    }));
                drawPdfTableOfContents(doc, layout, overviewTocStartY, tocList, useGroupedSections, closingPageNum, palette);
            }

            // Pass 2: Crisp editorial running headers & footers across pages 2 .. totalPages - 1
            updateProgress(progressFill, progressText, 98, 'Applying page numbers & archival chrome...');
            applyPdfRunningChrome(doc, layout, filterDesc, state.pageSections, palette);

            // Construct filename
            const dateStamp = new Date().toISOString().split('T')[0];
            const nameParts = ['Baluch_Martyrs_Memorial'];
            if (filterDesc.orgTitle) nameParts.push(filterDesc.orgTitle.replace(/[^a-zA-Z0-9]/g, '_'));
            if (filterDesc.yearText) nameParts.push(filterDesc.yearText.replace(/[^a-zA-Z0-9]/g, '_'));
            if (filterDesc.monthName) nameParts.push(filterDesc.monthName);
            if (!filterDesc.isFiltered) nameParts.push('Archival_Booklet');
            nameParts.push(dateStamp);

            const filename = `${nameParts.filter(Boolean).join('_')}.pdf`;

            updateProgress(progressFill, progressText, 100, 'Complete!');
            doc.save(filename);
            finishedCleanly = true;
        } catch (error) {
            console.error('PDF generation failed:', error);
            alert('Failed to generate PDF booklet. Please try again.');
        } finally {
            setTimeout(() => {
                if (btn) btn.disabled = false;
                if (yearSelect) yearSelect.disabled = false;
                if (monthSelect) monthSelect.disabled = false;
                if (orgSelect) orgSelect.disabled = false;
                updatePdfFilterSummary();
                if (progress) progress.style.display = 'none';
                if (progressFill) progressFill.style.width = '0%';
            }, finishedCleanly ? 1200 : 0);
        }
    }

    function updateProgress(fillEl, textEl, percent, text) {
        if (fillEl) fillEl.style.width = `${percent}%`;
        if (textEl) textEl.textContent = text;
    }

    function formatDateForPdf(dateStr) {
        if (!dateStr) return null;

        // Firestore Timestamp (handles 0 and negative historical timestamps safely in UTC)
        if (typeof dateStr === 'object' && typeof dateStr.seconds === 'number') {
            const d = new Date(dateStr.seconds * 1000);
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC'
                });
            }
            return null;
        }

        const s = cleanPdfField(dateStr);
        if (!s) return null;

        // Exact year-only input
        if (/^\d{4}$/.test(s)) return s;

        // ISO YYYY-MM-DD parsed safely in UTC to avoid timezone off-by-one shifts
        const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
        if (isoMatch) {
            const d = new Date(Date.UTC(parseInt(isoMatch[1], 10), parseInt(isoMatch[2], 10) - 1, parseInt(isoMatch[3], 10)));
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC'
                });
            }
        }

        // DD/MM/YYYY format
        const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (dmyMatch) {
            const d = new Date(Date.UTC(parseInt(dmyMatch[3], 10), parseInt(dmyMatch[2], 10) - 1, parseInt(dmyMatch[1], 10)));
            if (!isNaN(d.getTime())) {
                return d.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC'
                });
            }
        }

        try {
            const parsed = new Date(s);
            if (!isNaN(parsed.getTime())) {
                return parsed.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC'
                });
            }
        } catch (e) {}

        return s;
    }

})();
