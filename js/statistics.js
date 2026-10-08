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
        
        // Wait a bit for Firebase to be ready
        await waitForFirebase();
        
        // Load data
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
                updateStatus(statusEl, 'Connecting to memorial archive...', true);
                
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
                updateStatus(statusEl, 'Restoring memorial archive...', true);
                
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
                updateStatus(statusEl, 'Archive awaiting records', false);
                if (emptyEl) emptyEl.style.display = 'block';
                return;
            }

            // Show dashboard with dignified archival status badge
            if (contentEl) contentEl.style.display = 'block';
            updateStatus(
                statusEl,
                `Verified Memorial Archive • ${martyrs.length.toLocaleString()} Documented Heroes`,
                false
            );

            // Store martyrs for PDF generation and interactive filtering
            allMartyrsData = martyrs;
            
            // Render full interactive dashboard
            refreshDashboardUI();
            
            // Setup PDF download button & filters
            setupPdfDownload();
            
            // Update download info
            const downloadInfo = document.getElementById('downloadInfo');
            if (downloadInfo) {
                downloadInfo.textContent = `PDF includes ${martyrs.length.toLocaleString()} profiles with photos and biographies`;
            }

            console.log('✅ Statistics rendered');

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
        renderRegions(currentStats);
        renderOrganizations(currentStats);
        renderMonthly(currentStats);
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
            if (m.photo && m.photo.length > 50) {
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
                    <span class="year-card-count">${count.toLocaleString()} ${count === 1 ? 'hero' : 'heroes'}</span>
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
        let coverSubtitle = 'A Digital Archive of Heroes';
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
            coverSubtitle = 'A Digital Archive of Heroes';
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
                infoEl.textContent = `PDF will contain ${filtered.length} profile${filtered.length === 1 ? '' : 's'} matching "${desc.scopeSummary}"`;
            } else {
                infoEl.textContent = `PDF includes all ${total} profiles with photos, biographies, and dates`;
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

        // Check if jsPDF is loaded
        if (typeof window.jspdf === 'undefined') {
            alert('PDF library not loaded. Please refresh and try again.');
            return;
        }

        const { jsPDF } = window.jspdf;

        // Disable button & filter dropdowns, show progress bar
        btn.disabled = true;
        if (yearSelect) yearSelect.disabled = true;
        if (monthSelect) monthSelect.disabled = true;
        if (orgSelect) orgSelect.disabled = true;

        btn.innerHTML = '<div class="spinner"></div><span>Generating PDF...</span>';
        if (progress) progress.style.display = 'block';

        const filterDesc = getFilterScopeDescription();

        try {
            // Sort filtered martyrs alphabetically
            const sortedMartyrs = [...filteredMartyrs].sort((a, b) => 
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
            doc.setFontSize(26);
            doc.setFont('helvetica', 'bold');
            doc.text(filterDesc.coverTitle, pageWidth / 2, 38, { align: 'center' });

            doc.setFontSize(13);
            doc.setFont('helvetica', 'normal');
            doc.text(filterDesc.coverSubtitle, pageWidth / 2, 50, { align: 'center' });

            // Memorial info box
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(margin, 95, contentWidth, 68, 3, 3, 'F');

            doc.setTextColor(...textColor);
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(filterDesc.sectionHeader, pageWidth / 2, 110, { align: 'center' });

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10.5);
            const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            doc.text(`Generated: ${date}`, pageWidth / 2, 122, { align: 'center' });
            doc.text(`Total Profiles: ${sortedMartyrs.length}`, pageWidth / 2, 133, { align: 'center' });

            if (filterDesc.isFiltered) {
                doc.setFontSize(9.5);
                doc.setTextColor(...primaryColor);
                doc.setFont('helvetica', 'bold');
                doc.text(`Filter Scope: ${filterDesc.scopeSummary}`, pageWidth / 2, 145, { align: 'center' });
            }

            // Dedication
            doc.setFontSize(10);
            doc.setTextColor(...lightGray);
            doc.setFont('helvetica', 'normal');
            doc.text('Preserving the memory of those who sacrificed for freedom', pageWidth / 2, 185, { align: 'center' });

            // Footer
            doc.setFontSize(9);
            doc.text('baluchmartyrs.com', pageWidth / 2, pageHeight - 20, { align: 'center' });

            // ---- MARTYR PROFILES ----

            for (let i = 0; i < sortedMartyrs.length; i++) {
                const martyr = sortedMartyrs[i];
                const progressPercent = Math.round(10 + ((i / sortedMartyrs.length) * 85));
                updateProgress(progressFill, progressText, progressPercent, `Processing profile ${i + 1} of ${sortedMartyrs.length}...`);

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
            updateProgress(progressFill, progressText, 98, 'Finalizing document...');

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

            if (filterDesc.isFiltered) {
                closingLines.push(`Scope: ${filterDesc.scopeSummary}`);
            }

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
            doc.text('baluchmartyrs.com', pageWidth / 2, closingY + 25, { align: 'center' });

            // Green footer bar
            doc.setFillColor(...primaryColor);
            doc.rect(0, pageHeight - 30, pageWidth, 30, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.text(`Generated on ${date}`, pageWidth / 2, pageHeight - 18, { align: 'center' });
            doc.text(`© ${new Date().getFullYear()} Baluch Martyrs Memorial. All rights reserved.`, pageWidth / 2, pageHeight - 12, { align: 'center' });

            // Build informative filename based on active filters
            const dateStamp = new Date().toISOString().split('T')[0];
            const nameParts = ['Baluch_Martyrs'];

            if (filterDesc.orgTitle) {
                nameParts.push(filterDesc.orgTitle.replace(/[^a-zA-Z0-9]/g, '_'));
            }
            if (filterDesc.yearText) {
                nameParts.push(filterDesc.yearText.replace(/[^a-zA-Z0-9]/g, '_'));
            }
            if (filterDesc.monthName) {
                nameParts.push(filterDesc.monthName);
            }
            if (!filterDesc.isFiltered) {
                nameParts.push('Complete_Archive');
            }
            nameParts.push(dateStamp);

            const filename = `${nameParts.filter(Boolean).join('_')}.pdf`;

            // Save PDF
            updateProgress(progressFill, progressText, 100, 'Complete!');
            doc.save(filename);

            // Reset UI
            setTimeout(() => {
                if (yearSelect) yearSelect.disabled = false;
                if (monthSelect) monthSelect.disabled = false;
                if (orgSelect) orgSelect.disabled = false;
                updatePdfFilterSummary();
                if (progress) progress.style.display = 'none';
                if (progressFill) progressFill.style.width = '0%';
            }, 1200);

        } catch (error) {
            console.error('PDF generation failed:', error);
            alert('Failed to generate PDF. Please try again.');

            if (yearSelect) yearSelect.disabled = false;
            if (monthSelect) monthSelect.disabled = false;
            if (orgSelect) orgSelect.disabled = false;
            updatePdfFilterSummary();
            if (progress) progress.style.display = 'none';
            if (progressFill) progressFill.style.width = '0%';
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
