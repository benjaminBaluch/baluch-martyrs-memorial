// BULLETPROOF Gallery.js - Clean, Simple, and Reliable
console.log('🎨 Gallery.js loading - BULLETPROOF version');

// Minimal HTML-escaping helper to prevent XSS when inserting user content
function escapeHTML(value) {
    if (value === null || value === undefined) return '';
    return value
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Global state
let allMartyrs = [];
let currentFilters = {
    general: '',
    region: '',
    year: '',
    organization: '',
    letter: ''
};

// Simple flags to prevent duplicate/overlapping gallery loads
let galleryLoading = false;
let galleryLoaded = false;
function createShareRow(martyr, variant = 'card') {
    const row = document.createElement('div');
    row.className = 'martyr-share-row';
    if (variant === 'modal') {
        row.classList.add('martyr-share-row-modal');
    }

    const label = document.createElement('span');
    label.className = 'martyr-share-label';
    label.textContent = 'Share';

    const actions = document.createElement('div');
    actions.className = 'martyr-share-actions';

    const siteOrigin = (typeof window !== 'undefined' && window.location && window.location.origin)
        ? window.location.origin
        : 'https://baluchmartyrs.com';
    const heroIdentifier = encodeURIComponent(martyr.id || martyr.fullName || '');
    const targetUrl = `${siteOrigin}/gallery.html?hero=${heroIdentifier}`;
    const encodedUrl = encodeURIComponent(targetUrl);
    const shareText = encodeURIComponent(`Honoring ${martyr.fullName || 'a Baluch hero'} on the Baluch Martyrs Memorial`);

    const shareNetworks = [
        { name: 'X', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 22.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>', url: `https://twitter.com/intent/tweet?text=${shareText}&url=${encodedUrl}` },
        { name: 'Facebook', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>', url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
        { name: 'WhatsApp', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>', url: `https://wa.me/?text=${shareText}%20${encodedUrl}` },
        { name: 'Print / PDF', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"></path><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>', action: () => {
            if (typeof printMartyrProfile === 'function') {
                printMartyrProfile(martyr);
            } else {
                window.print();
            }
        }}
    ];

    shareNetworks.forEach(({ name, icon, url, action }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'martyr-share-icon';
        btn.innerHTML = icon;
        btn.setAttribute('aria-label', `Share ${martyr.fullName || 'this hero'} on ${name}`);
        btn.title = `Share on ${name}`;
        btn.addEventListener('click', () => {
            if (action) {
                action();
            } else if (url) {
                window.open(url, '_blank', 'noopener,noreferrer');
            }
        });
        actions.appendChild(btn);
    });

    row.appendChild(label);
    row.appendChild(actions);
    return row;
}

// Global functions for debugging and force loading
window.loadGalleryNow = function() {
    console.log('🚑 FORCE LOADING GALLERY NOW!');
    loadGallery();
};

window.checkGalleryData = function() {
    console.log('🔍 === GALLERY DEBUG INFO ===');
    console.log('1. Pre-loaded Firebase data:', window.martyrsDataFromFirebase?.length || 0);
    console.log('2. Firebase DB available:', !!window.firebaseDB);
    console.log('3. Local storage data:', localStorage.getItem('martyrsData') ? JSON.parse(localStorage.getItem('martyrsData')).length : 0);
    console.log('4. Current allMartyrs:', allMartyrs?.length || 0);
    console.log('5. Gallery grid element:', !!document.getElementById('galleryGrid'));
    
    const info = {
        preloaded: window.martyrsDataFromFirebase?.length || 0,
        firebaseReady: !!window.firebaseDB,
        localStorage: localStorage.getItem('martyrsData') ? JSON.parse(localStorage.getItem('martyrsData')).length : 0,
        currentMartyrs: allMartyrs?.length || 0,
        galleryElement: !!document.getElementById('galleryGrid')
    };
    
    alert('Gallery Debug Info:\n' + JSON.stringify(info, null, 2));
    
    // Force reload
    loadGallery();
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('🎨 Gallery DOM loaded, initializing...');
    
    // We show a professional skeleton loading state immediately
    showLoadingState();
    
    // Setup interface
    initSearchFilter();
    initializeInterface();
    addDebugButton();
    
    // Listen for data events from Firebase loader
    window.addEventListener('martyrsDataReady', (event) => {
        if (!event || !event.detail) return;
        console.log('📨 Received martyrsDataReady event:', event.detail);
        const { data, source, connected, error } = event.detail;
        
        // Update connection status display
        updateConnectionStatus(connected, source, error);
        
        if (data && data.length > 0) {
            console.log(`✅ Got ${data.length} martyrs from ${source}`);
            allMartyrs = data;
            applyFilters();
            galleryLoaded = true;
            galleryLoading = false;
            
            // Show offline warning if using localStorage
            if (source && source.includes('localStorage') && source.includes('h old')) {
                showOfflineWarning();
            } else if (connected) {
                hideOfflineWarning();
            }
        } else {
            console.warn('⚠️ Received empty data from', source);
            if (error) {
                showErrorMessage(error);
            } else {
                showEmptyMessage();
            }
        }
    });
    
    // Multiple loading attempts
    setTimeout(() => loadGallery(), 100);   // Immediate
    setTimeout(() => { if (allMartyrs.length === 0) loadGallery(); }, 500);  // Quick retry
    setTimeout(() => { if (allMartyrs.length === 0) loadGallery(); }, 2000); // Patient retry
    setTimeout(() => { if (allMartyrs.length === 0) loadGallery(); }, 5000); // Final retry
    
    // Listen for Firebase ready
    window.addEventListener('firebaseReady', () => {
        console.log('🔥 Firebase ready event - loading gallery');
        loadGallery();
    });
});

// Main gallery loader
async function loadGallery() {
    // Prevent multiple concurrent or repeated loads
    if (galleryLoaded) {
        console.log('📦 Gallery already loaded, skipping extra load request.');
        return;
    }
    if (galleryLoading) {
        console.log('⏳ Gallery load already in progress, skipping duplicate call.');
        return;
    }
    galleryLoading = true;

    console.log('🎯 Starting gallery load process...');
    
    const galleryGrid = document.getElementById('galleryGrid');
    if (!galleryGrid) {
        console.error('❌ Gallery grid element not found!');
        return;
    }
    
    try {
        // Method 1: Pre-loaded Firebase data (if some other script populated it)
        if (window.martyrsDataFromFirebase && window.martyrsDataFromFirebase.length > 0) {
            console.log(`✨ Using pre-loaded data: ${window.martyrsDataFromFirebase.length} martyrs`);
            allMartyrs = window.martyrsDataFromFirebase;
            renderGallery(allMartyrs);
            window.dispatchEvent(new Event('martyrsDataReady'));
            galleryLoaded = true;
            galleryLoading = false;
            return;
        }

        // Method 2: Direct Firebase call from browser (primary path)
        if (window.firebaseDB && typeof window.firebaseDB.getApprovedMartyrs === 'function') {
            console.log('🔥 Trying direct Firebase call (firebaseDB.getApprovedMartyrs)...');
            const result = await window.firebaseDB.getApprovedMartyrs();

            if (result && result.success && Array.isArray(result.data) && result.data.length > 0) {
                console.log(`✅ Firebase success: ${result.data.length} martyrs`);
                allMartyrs = result.data;

                // Cache for backup
                try {
                    localStorage.setItem('martyrsData', JSON.stringify(allMartyrs));
                } catch (storageError) {
                    console.warn('⚠️ Failed to cache martyrsData to localStorage:', storageError);
                }

                renderGallery(allMartyrs);
                hideOfflineWarning();
                window.dispatchEvent(new Event('martyrsDataReady'));
                galleryLoaded = true;
                galleryLoading = false;
                return;
            } else {
                console.warn('⚠️ Firebase returned no data or failed:', result?.error || 'no result');
            }
        } else {
            console.warn('⚠️ window.firebaseDB.getApprovedMartyrs is not available – skipping direct Firebase path');
        }

        // Method 3: Netlify serverless API fallback (still uses Firebase on the server)
        try {
            console.log('🌐 Trying Netlify API fallback at /api/get-martyrs ...');
            const response = await fetch('/api/get-martyrs', {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                cache: 'no-store'
            });

            if (response.ok) {
                const apiData = await response.json();
                if (Array.isArray(apiData) && apiData.length > 0) {
                    console.log(`✅ Netlify API success: ${apiData.length} martyrs`);
                    allMartyrs = apiData;

                    // Cache for backup
                    try {
                        localStorage.setItem('martyrsData', JSON.stringify(allMartyrs));
                    } catch (storageError) {
                        console.warn('⚠️ Failed to cache martyrsData from API to localStorage:', storageError);
                    }

                    renderGallery(allMartyrs);
                    hideOfflineWarning();
                    window.dispatchEvent(new Event('martyrsDataReady'));
                    galleryLoaded = true;
                    galleryLoading = false;
                    return;
                } else {
                    console.warn('⚠️ Netlify API returned empty martyrs list');
                }
            } else {
                console.warn('⚠️ Netlify API /api/get-martyrs HTTP error:', response.status, response.statusText);
            }
        } catch (apiError) {
            console.warn('⚠️ Netlify API /api/get-martyrs failed:', apiError);
        }

        // Method 4: LocalStorage fallback (cached data from previous successful visit)
        console.log('💾 Trying localStorage fallback...');
        try {
            const savedData = localStorage.getItem('martyrsData');
            if (savedData) {
                const parsedData = JSON.parse(savedData);
                if (Array.isArray(parsedData) && parsedData.length > 0) {
                    allMartyrs = parsedData.filter(m => !m.status || m.status === 'approved');
                    console.log(`💾 LocalStorage success: ${allMartyrs.length} martyrs`);
                    renderGallery(allMartyrs);
                    showOfflineWarning();
                    window.dispatchEvent(new Event('martyrsDataReady'));
                    galleryLoaded = true;
                    galleryLoading = false;
                    return;
                }
            }
        } catch (storageReadError) {
            console.warn('⚠️ Failed to read martyrsData from localStorage:', storageReadError);
        }

        // Method 5: Development-only demo data (never shown on live memorial domain)
        const hostname = window.location.hostname;
        const liveHosts = ['baluchmartyrs.com', 'www.baluchmartyrs.com', 'baluchmartyrs.site', 'www.baluchmartyrs.site'];
        const isLiveSite = liveHosts.includes(hostname);
        if (!isLiveSite) {
            console.log('🎭 Loading demo data for local development/testing...');
            allMartyrs = [
                {
                    id: 'demo-1',
                    fullName: 'Demo Martyr - Check Console',
                    martyrdomDate: '2024-01-01',
                    martyrdomPlace: 'Testing Location',
                    birthPlace: 'Demo City',
                    organization: 'Development Testing',
                    biography: 'This is demo data to verify the gallery is working. Check the browser console for debugging information.',
                    status: 'approved'
                }
            ];
            renderGallery(allMartyrs);
            window.dispatchEvent(new Event('martyrsDataReady'));
            galleryLoaded = true;
            galleryLoading = false;
            return;
        }

        // On the live site with no data from any source, show a clean empty-state message
        console.warn('📭 No martyrs available from Firebase, API, or cache – showing empty gallery message');
        showEmptyMessage();
        galleryLoaded = true;
        galleryLoading = false;

    } catch (error) {
        console.error('❌ Gallery loading failed:', error);
        galleryLoading = false;
        showErrorMessage(error?.message || error);
    }
}

// Helper functions
function initializeInterface() {
    toggleClearButton();
    const resultsInfo = document.getElementById('searchResultsInfo');
    if (resultsInfo) {
        resultsInfo.style.display = 'inline-flex';
    }
}

function updateConnectionStatus(connected, source, error) {
    console.log(`📶 Connection status: ${connected ? 'Connected' : 'Disconnected'} - Source: ${source}`);
    
    // Store status globally for debugging
    window.galleryConnectionStatus = {
        connected,
        source,
        error,
        timestamp: new Date().toISOString()
    };
}


// To keep the experience clean, we show skeleton loaders
function showLoadingState() {
    console.log('🔄 Preparing gallery – waiting for data...');
    const galleryGrid = document.getElementById('galleryGrid');
    if (galleryGrid) {
        let skeletonHTML = '';
        for (let i = 0; i < 6; i++) {
            skeletonHTML += `
                <div class="skeleton-card">
                    <div class="skeleton-img shimmer"></div>
                    <div class="skeleton-info">
                        <div class="skeleton-line title shimmer"></div>
                        <div class="skeleton-line dates shimmer"></div>
                        <div class="skeleton-line location shimmer"></div>
                        <div class="skeleton-btn shimmer"></div>
                    </div>
                </div>
            `;
        }
        galleryGrid.innerHTML = skeletonHTML;
    }
}

function showEmptyMessage() {
    const galleryGrid = document.getElementById('galleryGrid');
    if (galleryGrid) {
        galleryGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: #f8f9fa; border-radius: 8px;">
                <h3>🌹 Memorial Gallery</h3>
                <p>Our memorial gallery is currently being prepared.</p>
                <p style="color: #666;">New martyr profiles are being added regularly to honor our heroes.</p>
                <a href="add-martyr.html" style="display: inline-block; margin-top: 1.5rem; background: #2c5530; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 4px; font-weight: 500;">Submit a Martyr Profile</a>
                <br>
                <small style="color: #888; margin-top: 1rem; display: inline-block;">Help us build this memorial by contributing profiles of our heroes.</small>
            </div>
        `;
    }
}

function showErrorMessage(errorDetails) {
    // Log error for developers but show professional message to users
    console.error('❌ Developer Debug - Gallery Error:', errorDetails);
    
    const galleryGrid = document.getElementById('galleryGrid');
    if (galleryGrid) {
        galleryGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: #f8f9fa; border-radius: 8px;">
                <h3>🔄 Loading Memorial Gallery</h3>
                <p>We're connecting to our memorial database to honor our heroes.</p>
                <p style="color: #666; margin-top: 1rem;">This may take a moment...</p>
                <button onclick="loadGallery()" style="margin: 1rem 0.5rem; background: #2c5530; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-size: 14px;">Refresh Gallery</button>
                <br>
                <small style="color: #888; margin-top: 1rem; display: inline-block;">Having trouble? Try refreshing the page or check back later.</small>
            </div>
        `;
    }
}

function showOfflineWarning() {
    hideOfflineWarning(); // Remove existing first
    
    const galleryGrid = document.getElementById('galleryGrid');
    const warning = document.createElement('div');
    warning.id = 'offline-warning';
    warning.style.cssText = `
        background: #fff3cd; border: 1px solid #ffeaa7; color: #856404;
        padding: 1rem; margin-bottom: 2rem; border-radius: 8px; text-align: center; font-weight: 500;
    `;
    warning.innerHTML = `
        ⚠️ <strong>Offline Mode:</strong> Showing cached data. Some recent martyrs may not be visible.
        <button onclick="window.retryFirebaseConnection?.()" style="margin-left: 1rem; padding: 0.25rem 0.75rem; border-radius: 4px; border: 1px solid #856404; background: transparent; color: #856404; cursor: pointer;">Retry Connection</button>
    `;
    
    galleryGrid.parentNode.insertBefore(warning, galleryGrid);
}

function hideOfflineWarning() {
    const warning = document.getElementById('offline-warning');
    if (warning) warning.remove();
}

function addDebugButton() {
    // Only show debug button in development or when there are errors
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const hasErrors = window.galleryConnectionStatus && !window.galleryConnectionStatus.connected;
    
    // Don't show debug button for regular users on production
    if (!isDevelopment && !hasErrors) {
        return;
    }
    
    const debugBtn = document.createElement('button');
    debugBtn.textContent = isDevelopment ? 'Dev Debug' : 'Support';
    debugBtn.style.cssText = `
        position: fixed; bottom: 20px; left: 20px; background: ${isDevelopment ? '#ff6b6b' : '#6c757d'}; color: white;
        border: none; padding: 8px 12px; border-radius: 5px; cursor: pointer;
        z-index: 9999; font-size: 11px; opacity: 0.7;
    `;
    
    debugBtn.onclick = function() {
        console.log('=== GALLERY DEBUG INFO ===');
        window.checkGalleryData();
        
        const status = window.galleryConnectionStatus || 'No status available';
        const fbStatus = window.firebaseConnectionStatus || 'No Firebase status';
        
        console.log('Gallery connection status:', status);
        console.log('Firebase connection status:', fbStatus);
        
        if (isDevelopment) {
            // Full debug info for developers
            if (window.firebaseDB) {
                window.firebaseDB.testConnection().then(result => {
                    console.log('Firebase test result:', result);
                    alert(`Debug Info\n\nConnection: ${result.success ? 'SUCCESS' : 'FAILED'}\nData Source: ${status.source || 'Unknown'}`);
                });
            } else {
                alert(`Debug Info\n\nFirebase: Not available\nStatus: ${JSON.stringify(status, null, 2)}`);
            }
        } else {
            // Simple message for users
            alert('Gallery Support\n\nIf you continue to experience issues, please refresh the page or contact support.');
        }
    };
    
    document.body.appendChild(debugBtn);
}
// Utility functions
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

const galleryCustomOrgCanonicalMap = new Map();

function normalizeOrganization(rawOrg) {
    const trimmed = (rawOrg || '').toString().trim().replace(/\s+/g, ' ');
    if (!trimmed) return null;

    const lowerRaw = trimmed.toLowerCase();
    if (/^(none|n\/a|na|nil|null|undefined|unknown|not\s*specified|unspecified|no\s*affiliation|independent|[-—–]+)$/i.test(lowerRaw)) {
        return null;
    }

    const norm = lowerRaw
        .replace(/baluch/g, 'baloch')
        .replace(/organisation/g, 'organization')
        .replace(/[—–]/g, '-');

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

    if (
        /\bblf\b/.test(norm) ||
        norm.includes('balochistan liberation front') ||
        norm.includes('baloch liberation front') ||
        norm.includes('sadozai') ||
        norm.includes('saddozai')
    ) {
        return 'Balochistan Liberation Front (BLF)';
    }

    if (
        /\bbra\b/.test(norm) ||
        norm.includes('baloch republican army') ||
        norm.includes('balochistan republican army')
    ) {
        return 'Baloch Republican Army (BRA)';
    }

    if (
        /\bbna\b/.test(norm) ||
        norm.includes('baloch nationalist army') ||
        norm.includes('balochistan nationalist army') ||
        norm.includes('baloch national army') ||
        norm.includes('balochistan national army')
    ) {
        return 'Baloch Nationalist Army (BNA)';
    }

    if (
        /\bbrg\b/.test(norm) ||
        norm.includes('baloch republican guard') ||
        norm.includes('balochistan republican guard')
    ) {
        return 'Baloch Republican Guards (BRG)';
    }

    if (
        /\buba\b/.test(norm) ||
        norm.includes('united baloch army') ||
        norm.includes('united balochistan army')
    ) {
        return 'United Baloch Army (UBA)';
    }

    if (
        /\bbras\b/.test(norm) ||
        norm.includes('raaji aajoi') ||
        norm.includes('raji ajoi') ||
        norm.includes('aajoi sangar')
    ) {
        return 'Baloch Raaji Aajoi Sangar (BRAS)';
    }

    if (
        /\bleb\b/.test(norm) ||
        norm.includes('lashkar-e-balochistan') ||
        norm.includes('lashkar e balochistan') ||
        norm.includes('lashkar balochistan')
    ) {
        return 'Lashkar-e-Balochistan (LeB)';
    }

    if (
        /\bblt\b/.test(norm) ||
        norm.includes('baloch liberation tiger') ||
        norm.includes('balochistan liberation tiger')
    ) {
        return 'Baloch Liberation Tigers (BLT)';
    }

    if (
        /\bbluf\b/.test(norm) ||
        norm.includes('liberation united front')
    ) {
        return 'Balochistan Liberation United Front (BLUF)';
    }

    if (
        /\bbso\b/.test(norm) ||
        norm.includes('baloch students organization') ||
        norm.includes('baloch student organization')
    ) {
        return 'Baloch Students Organization - Azad (BSO-Azad)';
    }

    if (
        /\bbnm\b/.test(norm) ||
        norm.includes('baloch national movement') ||
        norm.includes('balochistan national movement')
    ) {
        return 'Baloch National Movement (BNM)';
    }

    if (
        /\bbrp\b/.test(norm) ||
        norm.includes('baloch republican party') ||
        norm.includes('balochistan republican party')
    ) {
        return 'Baloch Republican Party (BRP)';
    }

    if (
        /\bbnp\b/.test(norm) ||
        norm.includes('balochistan national party') ||
        norm.includes('baloch national party')
    ) {
        return 'Balochistan National Party (BNP)';
    }

    if (
        /\bbyc\b/.test(norm) ||
        norm.includes('yakjehti committee') ||
        norm.includes('baloch yakjehti')
    ) {
        return 'Baloch Yakjehti Committee (BYC)';
    }

    if (
        /\bvbmp\b/.test(norm) ||
        norm.includes('voice for baloch missing') ||
        norm.includes('missing persons')
    ) {
        return 'Voice for Baloch Missing Persons (VBMP)';
    }

    if (
        /\bbwf\b/.test(norm) ||
        norm.includes('baloch women forum')
    ) {
        return 'Baloch Women Forum (BWF)';
    }

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
    if (galleryCustomOrgCanonicalMap.has(cacheKey)) {
        return galleryCustomOrgCanonicalMap.get(cacheKey);
    }
    galleryCustomOrgCanonicalMap.set(cacheKey, cleaned);
    return cleaned;
}


function getYear(dateValue) {
    if (!dateValue) return '';
    
    try {
        // Handle Firestore Timestamp (duck typing to be safe)
        if (dateValue && typeof dateValue.toDate === 'function') {
            return dateValue.toDate().getFullYear().toString();
        }
        
        // Handle Date object
        if (dateValue instanceof Date) {
            return dateValue.getFullYear().toString();
        }
        
        // Handle strings
        if (typeof dateValue === 'string') {
            const d = new Date(dateValue);
            if (!isNaN(d.getTime())) {
                return d.getFullYear().toString();
            }
        }
        
        // Handle object with seconds (Firestore Timestamp serialized)
        if (dateValue && typeof dateValue.seconds === 'number') {
            return new Date(dateValue.seconds * 1000).getFullYear().toString();
        }
        
        return '';
    } catch (error) {
        console.warn('Error getting year:', error);
        return '';
    }
}

function formatDate(dateValue) {
    if (!dateValue) return null;
    
    try {
        let date;
        
        // Handle Firestore Timestamp (duck typing)
        if (dateValue && typeof dateValue.toDate === 'function') {
            date = dateValue.toDate();
        } 
        // Handle object with seconds (Firestore Timestamp serialized)
        else if (dateValue && typeof dateValue.seconds === 'number') {
            date = new Date(dateValue.seconds * 1000);
        }
        else if (dateValue instanceof Date) {
            date = dateValue;
        } 
        else if (typeof dateValue === 'string') {
            // Normalize string to prevent timezone issues if YYYY-MM-DD
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
                date = new Date(dateValue + 'T00:00:00');
            } else {
                date = new Date(dateValue);
            }
        } else {
            return null;
        }
        
        if (!date || isNaN(date.getTime())) return null;
        
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    } catch (error) {
        console.warn('Error formatting date:', dateValue, error);
        return null;
    }
}

// ===== Voice assistant (text-to-speech) helpers =====
let currentMartyrUtterance = null;

function stopMartyrSpeech() {
    try {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    } catch (e) {
        console.warn('Error stopping martyr speech:', e);
    }
    currentMartyrUtterance = null;
}

function buildMartyrSpeechText(martyr) {
    const parts = [];

    const name = martyr.fullName || 'Unknown martyr';
    parts.push(name + '.');

    if (martyr.fatherName) {
        parts.push('Child of ' + martyr.fatherName + '.');
    }

    const birth = formatDate(martyr.birthDate);
    const birthPlace = martyr.birthPlace || '';
    if (birth || birthPlace) {
        parts.push('Born ' + (birth || 'on an unknown date') + (birthPlace ? ' in ' + birthPlace + '.' : '.'));
    }

    const martyrdom = formatDate(martyr.martyrdomDate);
    const martyrdomPlace = martyr.martyrdomPlace || '';
    if (martyrdom || martyrdomPlace) {
        parts.push('Martyred ' + (martyrdom || 'on an unknown date') + (martyrdomPlace ? ' in ' + martyrdomPlace + '.' : '.'));
    }

    if (martyr.organization) {
        parts.push('Organization: ' + martyr.organization + '.');
    }

    if (martyr.rank) {
        parts.push('Rank or role: ' + martyr.rank + '.');
    }

    if (martyr.biography) {
        parts.push('Biography: ' + martyr.biography + '.');
    }

    if (martyr.familyDetails) {
        parts.push('Family details: ' + martyr.familyDetails + '.');
    }

    // Submission info
    if (martyr.submitterName || martyr.submittedAt) {
        const submittedOn = formatDate(martyr.submittedAt);
        let submissionText = 'Submitted by ' + (martyr.submitterName || 'an unknown submitter');
        if (submittedOn) {
            submissionText += ', on ' + submittedOn;
        }
        parts.push(submissionText + '.');
    }

    return parts.join(' ');
}

function toggleMartyrSpeech(martyr, buttonEl) {
    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance === 'undefined') {
        alert('Your browser does not support voice playback for this memorial.');
        return;
    }

    if (window.speechSynthesis.speaking && currentMartyrUtterance) {
        stopMartyrSpeech();
        if (buttonEl) {
            buttonEl.innerHTML = '🔊 Listen';
        }
        return;
    }

    const text = buildMartyrSpeechText(martyr);
    if (!text) {
        alert('There is no information available to read aloud for this martyr.');
        return;
    }

    try {
        stopMartyrSpeech(); // cancel anything else
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.95; // slightly slower for clarity
        utterance.pitch = 1.0;

        utterance.onend = function() {
            currentMartyrUtterance = null;
            if (buttonEl) {
                buttonEl.innerHTML = '🔊 Listen';
            }
        };

        utterance.onerror = function() {
            currentMartyrUtterance = null;
            if (buttonEl) {
                buttonEl.innerHTML = '🔊 Listen';
            }
        };

        currentMartyrUtterance = utterance;
        if (buttonEl) {
            buttonEl.innerHTML = '⏹ Stop';
        }

        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.warn('Failed to start martyr speech:', e);
        if (buttonEl) {
            buttonEl.innerHTML = '🔊 Listen';
        }
    }
}

// Open a printable view for a single martyr (user can use "Save as PDF")
function printMartyrProfile(martyr) {
    try {
        const printWindow = window.open('', '_blank', 'width=900,height=1100');
        if (!printWindow) {
            alert('Please allow pop-ups to print or download the martyr profile.');
            return;
        }

        const birth      = formatDate(martyr.birthDate) || 'Unknown';
        const martyrdom  = formatDate(martyr.martyrdomDate) || 'Unknown';
        const submitted  = formatDate(martyr.submittedAt) || 'Unknown';
        const birthPlace = martyr.birthPlace || 'Unknown';
        const martyrdomPlace = martyr.martyrdomPlace || 'Unknown';
        const organization   = martyr.organization || 'Unknown';
        const rank           = martyr.rank || '—';
        const fatherName     = martyr.fatherName || '—';

        const safe = (val) => (val || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${safe(martyr.fullName)} - Martyr Profile</title>
<style>
  body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 40px; background: #f5f5f5; }
  .page { background: #fff; max-width: 800px; margin: 0 auto; padding: 40px; box-shadow: 0 0 8px rgba(0,0,0,0.15); }
  .header { text-align: center; border-bottom: 3px solid #2c5530; padding-bottom: 10px; margin-bottom: 20px; }
  .header h1 { margin: 0; font-size: 26px; color: #2c5530; }
  .header h2 { margin: 8px 0 0; font-size: 18px; color: #555; }
  .photo-row { display: flex; gap: 24px; margin-top: 20px; }
  .photo-box { flex: 0 0 220px; }
  .photo-box img { width: 100%; border-radius: 8px; border: 3px solid #d4af37; object-fit: cover; height: 260px; }
  .photo-placeholder { width: 100%; height: 260px; border-radius: 8px; border: 3px solid #d4af37; display: flex; align-items: center; justify-content: center; font-size: 60px; color: #999; background: linear-gradient(135deg,#f0f0f0,#dcdcdc); }
  .details { flex: 1; font-size: 14px; }
  .details table { width: 100%; border-collapse: collapse; }
  .details th { text-align: left; padding: 4px 8px; width: 32%; color: #444; }
  .details td { padding: 4px 8px; }
  .section { margin-top: 24px; }
  .section h3 { margin: 0 0 8px; color: #2c5530; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .section p { margin: 0; line-height: 1.6; color: #333; white-space: pre-wrap; }
  .footer { margin-top: 32px; font-size: 11px; color: #777; text-align: center; border-top: 1px solid #eee; padding-top: 8px; }
  @media print {
    body { background: #fff; padding: 0; }
    .page { box-shadow: none; margin: 0; max-width: 100%; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>Baluch Martyrs Memorial</h1>
      <h2>Martyr Profile</h2>
    </div>

    <div class="photo-row">
      <div class="photo-box">
        ${martyr.photo ? 
          `<img src="${martyr.photo}" alt="${safe(martyr.fullName)}" />` :
          '<div class="photo-placeholder">📸</div>'}
      </div>
      <div class="details">
        <table>
          <tr><th>Name</th><td>${safe(martyr.fullName)}</td></tr>
          <tr><th>Father</th><td>${safe(fatherName)}</td></tr>
          <tr><th>Birth</th><td>${safe(birth)} (${safe(birthPlace)})</td></tr>
          <tr><th>Martyrdom</th><td>${safe(martyrdom)} (${safe(martyrdomPlace)})</td></tr>
          <tr><th>Organization</th><td>${safe(organization)}</td></tr>
          <tr><th>Rank / Role</th><td>${safe(rank)}</td></tr>
        </table>
      </div>
    </div>

    ${martyr.biography ? `
    <div class="section">
      <h3>Biography</h3>
      <p>${safe(martyr.biography)}</p>
    </div>` : ''}

    ${martyr.familyDetails ? `
    <div class="section">
      <h3>Family Details</h3>
      <p>${safe(martyr.familyDetails)}</p>
    </div>` : ''}

    <div class="section">
      <h3>Submission</h3>
      <p><strong>Submitted by:</strong> ${safe(martyr.submitterName || 'Unknown')}</p>
      <p><strong>Submitted on:</strong> ${safe(submitted)}</p>
    </div>

    <div class="footer">
      Generated from Baluch Martyrs Memorial • ${new Date().toLocaleString('en-US')}
    </div>
  </div>
</body>
</html>`;

        printWindow.document.open();
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.focus();

        // Give the new window a moment to render, then trigger print
        printWindow.onload = () => {
            try {
                printWindow.print();
            } catch (e) {
                console.warn('Print dialog could not be opened automatically:', e);
            }
        };
    } catch (error) {
        console.error('❌ Error preparing martyr print view:', error);
        alert('Unable to open print / download view. Please check your popup settings and try again.');
    }
}

console.log('✅ Gallery.js loaded successfully');
console.log('🔧 Debug functions: checkGalleryData(), loadGalleryNow(), retryFirebaseConnection()');

// Ordered list currently visible in the gallery grid (filtered + alphabetical).
// Used by the profile modal for Previous / Next navigation.
var galleryNavList = [];

function compareMartyrNames(a, b) {
    const aName = ((a && a.fullName) ? String(a.fullName) : '').trim();
    const bName = ((b && b.fullName) ? String(b.fullName) : '').trim();
    if (!aName && !bName) return 0;
    if (!aName) return 1;
    if (!bName) return -1;
    return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
}

// Find the list + position to browse from for a given martyr
function resolveGalleryNavList(martyr, navList) {
    const findIn = (list) => {
        if (!Array.isArray(list) || !list.length) return -1;
        let idx = list.indexOf(martyr);
        if (idx === -1 && martyr && martyr.id) {
            idx = list.findIndex(m => m && m.id === martyr.id);
        }
        return idx;
    };

    const candidates = [navList, galleryNavList];
    for (const list of candidates) {
        const idx = findIn(list);
        if (idx !== -1) return { list, index: idx };
    }

    // e.g. a "Discover" pick outside the current filter: browse the full archive
    if (Array.isArray(allMartyrs) && allMartyrs.length) {
        const all = [...allMartyrs].sort(compareMartyrNames);
        const idx = findIn(all);
        if (idx !== -1) return { list: all, index: idx };
    }

    return { list: [martyr], index: 0 };
}

// Show martyr details modal (with print/download support)
function showMartyrModal(martyr, navList) {
    console.log(`🔍 Showing modal for: ${martyr.fullName}`);
    
    // Remember what opened the modal so focus can return there on close
    const opener = document.activeElement;

    // Remove existing modal (and its keyboard/swipe listeners)
    const existingModal = document.getElementById('martyrModal');
    if (existingModal) {
        if (typeof existingModal._pnCleanup === 'function') existingModal._pnCleanup();
        existingModal.remove();
    }
    
    // Create modal overlay and dialog
    const modal = document.createElement('div');
    modal.id = 'martyrModal';
    modal.className = 'martyr-modal-overlay';
    
    const content = document.createElement('div');
    content.className = 'martyr-modal-dialog';

    let closed = false;
    const closeModal = () => {
        if (closed) return;
        closed = true;
        stopMartyrSpeech();
        if (typeof modal._pnCleanup === 'function') modal._pnCleanup();
        modal.remove();
        document.body.style.overflow = 'auto';
        if (opener && typeof opener.focus === 'function' && document.body.contains(opener)) {
            try { opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
        }
    };

    // Fills the content box for one martyr (re-used when browsing Prev / Next)
    function renderContent(martyr) {
    const birthPretty = formatDate(martyr.birthDate) || 'Unknown';
    const martyrdomPretty = formatDate(martyr.martyrdomDate) || 'Unknown';
    const headerDateLabel = martyrdomPretty;
    
    content.innerHTML = `
        <div class="martyr-modal-header">
            <div class="martyr-modal-sheet-handle" aria-hidden="true"></div>
            <div class="martyr-modal-header-inner">
                <div class="martyr-modal-header-title">
                    <h2 class="martyr-modal-header-name">
                        ${escapeHTML(martyr.fullName || 'Unknown martyr')}
                    </h2>
                    <p class="martyr-modal-header-date">
                        ${escapeHTML(headerDateLabel)}
                    </p>
                </div>
                <div class="martyr-modal-header-actions">
                    <button class="martyr-voice-btn" type="button" aria-label="Listen to biography">
                        <span aria-hidden="true">🔊</span> Listen
                    </button>
                    <button class="close-martyr-modal" type="button" aria-label="Close profile">
                        &times;
                    </button>
                </div>
            </div>
        </div>

        <div class="martyr-modal-body">
            <div class="martyr-modal-photo-col">
                ${martyr.photo ? 
                    `<img src="${martyr.photo}" alt="${escapeHTML(martyr.fullName || 'Martyr photo')}" class="martyr-modal-photo" loading="lazy">` :
                    '<div class="martyr-modal-photo-placeholder" aria-label="No photo available">📷</div>'
                }
            </div>
            
            <div class="martyr-modal-details-col">
                <div class="martyr-modal-meta-grid">
                    ${martyr.fatherName ? `
                        <div class="martyr-modal-meta-row">
                            <span class="martyr-modal-meta-label">Father</span>
                            <span class="martyr-modal-meta-val">${escapeHTML(martyr.fatherName)}</span>
                        </div>
                    ` : ''}
                    <div class="martyr-modal-meta-row">
                        <span class="martyr-modal-meta-label">Birth</span>
                        <span class="martyr-modal-meta-val">${escapeHTML(birthPretty)}</span>
                    </div>
                    <div class="martyr-modal-meta-row">
                        <span class="martyr-modal-meta-label">Birth place</span>
                        <span class="martyr-modal-meta-val">${escapeHTML(martyr.birthPlace || 'Unknown')}</span>
                    </div>
                    <div class="martyr-modal-meta-row">
                        <span class="martyr-modal-meta-label">Martyrdom</span>
                        <span class="martyr-modal-meta-val">${escapeHTML(martyrdomPretty)}</span>
                    </div>
                    <div class="martyr-modal-meta-row">
                        <span class="martyr-modal-meta-label">Martyrdom place</span>
                        <span class="martyr-modal-meta-val">${escapeHTML(martyr.martyrdomPlace || 'Unknown')}</span>
                    </div>
                    ${martyr.organization ? `
                        <div class="martyr-modal-meta-row">
                            <span class="martyr-modal-meta-label">Organization</span>
                            <span class="martyr-modal-meta-val">${escapeHTML(martyr.organization)}</span>
                        </div>
                    ` : ''}
                    ${martyr.rank ? `
                        <div class="martyr-modal-meta-row">
                            <span class="martyr-modal-meta-label">Rank</span>
                            <span class="martyr-modal-meta-val">${escapeHTML(martyr.rank)}</span>
                        </div>
                    ` : ''}
                </div>
                
                ${martyr.biography ? `
                    <div class="martyr-modal-section">
                        <h3 class="martyr-modal-section-title">Biography</h3>
                        <div class="martyr-modal-section-box martyr-modal-bio-text">
                            ${escapeHTML(martyr.biography)}
                        </div>
                    </div>
                ` : ''}
                
                ${martyr.familyDetails ? `
                    <div class="martyr-modal-section">
                        <h3 class="martyr-modal-section-title">Family Details</h3>
                        <div class="martyr-modal-section-box">
                            ${escapeHTML(martyr.familyDetails)}
                        </div>
                    </div>
                ` : ''}

                <div class="martyr-modal-submit-row">
                    <p><strong>Submitted by:</strong> ${escapeHTML(martyr.submitterName || 'Unknown')}</p>
                    <p><strong>Submitted on:</strong> ${escapeHTML(formatDate(martyr.submittedAt) || 'Unknown')}</p>
                </div>
                
                <div class="martyr-modal-share-slot"></div>

                <div class="martyr-modal-actions">
                    <button class="btn btn-outline martyr-close-btn" type="button">
                        Close
                    </button>
                </div>
            </div>
        </div>
    `;
    
    const shareSlot = content.querySelector('.martyr-modal-share-slot');
    if (shareSlot) {
        shareSlot.replaceWith(createShareRow(martyr, 'modal'));
    }

    // Close buttons
    const closeIcon = content.querySelector('.close-martyr-modal');
    const closeBtn  = content.querySelector('.martyr-close-btn');
    const sheetHandle = content.querySelector('.martyr-modal-sheet-handle');
    if (closeIcon) {
        closeIcon.setAttribute('aria-label', 'Close profile');
        closeIcon.addEventListener('click', closeModal);
    }
    if (closeBtn)  closeBtn.addEventListener('click', closeModal);
    if (sheetHandle) {
        sheetHandle.setAttribute('role', 'button');
        sheetHandle.setAttribute('aria-label', 'Close sheet');
        sheetHandle.addEventListener('click', closeModal);
    }
    
    // Print / Download button
    const printBtn = content.querySelector('.martyr-print-btn');
    const printHeaderBtn = content.querySelector('.martyr-print-btn-header');
    [printBtn, printHeaderBtn].forEach((btn) => {
        if (btn) {
            btn.addEventListener('click', () => {
                printMartyrProfile(martyr);
            });
        }
    });

    // Voice assistant button (text-to-speech)
    const voiceBtn = content.querySelector('.martyr-voice-btn');
    if (voiceBtn) {
        if ('speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined') {
            voiceBtn.addEventListener('click', () => {
                toggleMartyrSpeech(martyr, voiceBtn);
            });
        } else {
            // Hide button if TTS is not supported
            voiceBtn.style.display = 'none';
        }
    }
    } // end renderContent

    renderContent(martyr);

    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Martyr profile');
    modal.appendChild(content);
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Previous / Next navigation (buttons, ← → keys, swipe) + Escape to close
    if (typeof attachProfileNavigation === 'function') {
        const nav = resolveGalleryNavList(martyr, navList);
        modal._pnCleanup = attachProfileNavigation({
            modal,
            content,
            list: nav.list,
            index: nav.index,
            render: (m) => {
                stopMartyrSpeech();
                renderContent(m);
            },
            close: closeModal
        });
    } else {
        // Fallback: Escape only
        const escHandler = (e) => {
            if (e.key === 'Escape') closeModal();
        };
        document.addEventListener('keydown', escHandler);
        modal._pnCleanup = () => document.removeEventListener('keydown', escHandler);
    }

    // Move focus into the dialog for keyboard / screen-reader users
    const firstClose = content.querySelector('.close-martyr-modal');
    if (firstClose) {
        try { firstClose.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
    }
}

// Show empty gallery message
function showEmptyGalleryMessage() {
    const galleryGrid = document.getElementById('galleryGrid');
    galleryGrid.innerHTML = `
        <div class="martyr-card placeholder" style="grid-column: 1/-1; text-align: center; padding: 3rem;">
            <div class="martyr-info">
                <h3>No martyrs in gallery yet</h3>
                <p>Be the first to add a martyr to our memorial</p>
                <a href="add-martyr.html" class="btn btn-small">Add Martyr</a>
            </div>
        </div>
    `;
}


// Render martyrs in gallery
function renderGallery(martyrsData) {
    const galleryGrid = document.getElementById('galleryGrid');
    if (!galleryGrid) {
        console.error('❌ Gallery grid element not found!');
        return;
    }

    const list = Array.isArray(martyrsData) ? martyrsData : [];

    // Frontend-only: always show martyrs in alphabetical order by name
    const sortedMartyrs = [...list].sort((a, b) => {
        const aName = ((a && a.fullName) ? String(a.fullName) : '').trim();
        const bName = ((b && b.fullName) ? String(b.fullName) : '').trim();

        // Put empty/unknown names at the end
        if (!aName && !bName) return 0;
        if (!aName) return 1;
        if (!bName) return -1;

        return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
    });

    console.log(`🎨 Rendering ${sortedMartyrs.length} martyrs to gallery (alphabetical)...`);
    galleryNavList = sortedMartyrs;
    galleryGrid.innerHTML = '';

    let renderedCount = 0;
    sortedMartyrs.forEach((martyr, index) => {
        try {
            const card = createGalleryCard(martyr);
            galleryGrid.appendChild(card);
            renderedCount++;
        } catch (error) {
            console.error(`❌ Error rendering martyr ${index}:`, error, martyr);
        }
    });

    console.log(`✅ Successfully rendered ${renderedCount} out of ${sortedMartyrs.length} martyrs`);
    updateSearchResultsInfo(sortedMartyrs.length);
    
    // Trigger lazy scroll reveal setup for newly created cards
    if (typeof window.initScrollReveal === 'function') {
        window.initScrollReveal();
    }
}

// Create gallery card (front of gallery)
// Modern, respectful archival design for gallery grid
function createGalleryCard(martyr) {
    const card = document.createElement('div');
    card.className = 'martyr-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `View memorial record of ${martyr.fullName || 'martyr'}`);

    // Enhanced search data attributes (used by filters)
    card.dataset.searchText = `${martyr.fullName} ${martyr.birthPlace || ''} ${martyr.martyrdomPlace || ''} ${martyr.organization || ''} ${martyr.fatherName || ''}`.toLowerCase();
    card.dataset.name = (martyr.fullName || '').toLowerCase();
    card.dataset.birthPlace = (martyr.birthPlace || '').toLowerCase();
    card.dataset.martyrdomPlace = (martyr.martyrdomPlace || '').toLowerCase();
    card.dataset.organization = (martyr.organization || '').toLowerCase();
    card.dataset.year = martyr.martyrdomDate ? getYear(martyr.martyrdomDate) : '';

    const inner = document.createElement('div');
    inner.className = 'martyr-card-inner';

    // Portrait photo section with gentle overlay
    const photoWrapper = document.createElement('div');
    photoWrapper.className = 'martyr-photo-wrapper';

    const photoOverlay = document.createElement('div');
    photoOverlay.className = 'martyr-photo-overlay';

    // Floating year badge if date is recorded
    const martyrdomYear = martyr.martyrdomDate ? getYear(martyr.martyrdomDate) : '';
    if (martyrdomYear) {
        const yearBadge = document.createElement('span');
        yearBadge.className = 'martyr-year-badge';
        yearBadge.textContent = martyrdomYear;
        photoWrapper.appendChild(yearBadge);
    }

    if (martyr.photo) {
        const img = document.createElement('img');
        img.src = martyr.photo;
        img.alt = martyr.fullName || 'Martyr portrait';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.width = 300;
        img.height = 220;
        photoWrapper.appendChild(img);
    } else {
        // Dignified memorial silhouette placeholder (no cartoon emojis)
        const placeholder = document.createElement('div');
        placeholder.className = 'martyr-photo-placeholder';
        placeholder.innerHTML = `
            <svg class="placeholder-crest-svg" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span class="placeholder-text">Memorial Archive</span>
        `;
        photoWrapper.appendChild(placeholder);
    }
    photoWrapper.appendChild(photoOverlay);

    // Information section
    const infoDiv = document.createElement('div');
    infoDiv.className = 'martyr-info';

    // Martyr Name (Crisp Garamond typography)
    const nameRow = document.createElement('div');
    nameRow.className = 'martyr-name-row';

    const name = document.createElement('h3');
    name.className = 'martyr-name';
    name.textContent = martyr.fullName || 'Unknown martyr';

    nameRow.appendChild(name);
    infoDiv.appendChild(nameRow);

    // Location line with clean vector pin icon
    const locationLine = document.createElement('p');
    locationLine.className = 'martyr-meta martyr-location';
    const locIcon = document.createElement('span');
    locIcon.className = 'martyr-meta-icon';
    locIcon.setAttribute('aria-hidden', 'true');
    locIcon.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`;
    const locText = document.createElement('span');
    locText.textContent = martyr.martyrdomPlace || martyr.birthPlace || 'Location unknown';
    locationLine.appendChild(locIcon);
    locationLine.appendChild(locText);
    infoDiv.appendChild(locationLine);

    // Date line with clean vector chronology icon
    const dateLine = document.createElement('p');
    dateLine.className = 'martyr-meta martyr-date';
    const dateIcon = document.createElement('span');
    dateIcon.className = 'martyr-meta-icon';
    dateIcon.setAttribute('aria-hidden', 'true');
    dateIcon.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`;
    const dateText = document.createElement('span');
    const martyrdomPretty = formatDate(martyr.martyrdomDate);
    if (martyrdomPretty) {
        dateText.textContent = martyrdomPretty;
    } else if (martyrdomYear) {
        dateText.textContent = `Year of martyrdom: ${martyrdomYear}`;
    } else {
        dateText.textContent = 'Date of martyrdom unknown';
    }
    dateLine.appendChild(dateIcon);
    dateLine.appendChild(dateText);
    infoDiv.appendChild(dateLine);

    // Organization badge pill (if recorded)
    if (martyr.organization) {
        const orgLine = document.createElement('div');
        orgLine.className = 'martyr-org-pill';
        orgLine.innerHTML = `
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>
            <span>${escapeHTML(martyr.organization)}</span>
        `;
        infoDiv.appendChild(orgLine);
    }

    // View profile button
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-small martyr-card-button';
    viewBtn.type = 'button';
    viewBtn.innerHTML = `<span>View Details</span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>`;
    viewBtn.onclick = function (e) {
        e.stopPropagation();
        showMartyrModal(martyr);
    };
    infoDiv.appendChild(viewBtn);

    inner.appendChild(photoWrapper);
    inner.appendChild(infoDiv);
    card.appendChild(inner);

    // Full Card Interactive Tap Handler (Smooth mobile & desktop experience)
    card.onclick = function (e) {
        if (e.target.closest('.martyr-share-icon, .martyr-share-actions')) {
            return;
        }
        showMartyrModal(martyr);
    };

    card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            showMartyrModal(martyr);
        }
    });

    return card;
}

// Initialize search and Clear All functionality
function initSearchFilter() {
    const searchInput = document.getElementById('searchMartyrs');
    const clearSearch = document.getElementById('clearSearch');
    const clearAllBtn = document.getElementById('clearAllFilters');

    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            currentFilters.general = e.target.value.trim();
            applyFilters();
            toggleClearButton();
        });
    }

    if (clearSearch) {
        clearSearch.addEventListener('click', function() {
            if (searchInput) {
                searchInput.value = '';
                searchInput.focus();
            }
            currentFilters.general = '';
            hideAutocomplete();
            applyFilters();
            toggleClearButton();
        });
    }

    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', function() {
            clearAllFilters();
        });
    }
}

function hasAnyActiveFilter() {
    return Boolean(
        currentFilters.general ||
        currentFilters.region ||
        currentFilters.year ||
        currentFilters.organization ||
        currentFilters.letter
    );
}

// Common transliteration equivalents for Baluch names & places (full-word equivalents, not typos)
const TRANSLITERATION_EQUIVALENTS = {
    'ahmed': ['ahmed', 'ahmad'],
    'ahmad': ['ahmad', 'ahmed'],
    'mohammad': ['mohammad', 'muhammad', 'mohammed', 'muhammed'],
    'muhammad': ['muhammad', 'mohammad', 'mohammed', 'muhammed'],
    'mohammed': ['mohammed', 'mohammad', 'muhammad'],
    'baluch': ['baluch', 'baloch'],
    'baloch': ['baloch', 'baluch'],
    'qambar': ['qambar', 'kambar', 'quambar'],
    'kambar': ['kambar', 'qambar'],
    'yousuf': ['yousuf', 'yusuf', 'yousaf'],
    'yusuf': ['yusuf', 'yousuf', 'yousaf']
};

function matchesSearchQuery(martyr, queryLower) {
    if (!queryLower) return true;
    const searchText = `${martyr.fullName || ''} ${martyr.fatherName || ''} ${martyr.birthPlace || ''} ${martyr.martyrdomPlace || ''} ${martyr.organization || ''} ${getYear(martyr.martyrdomDate)}`.toLowerCase();
    if (searchText.includes(queryLower)) return true;

    const equivalents = TRANSLITERATION_EQUIVALENTS[queryLower];
    if (equivalents) {
        return equivalents.some(eq => searchText.includes(eq));
    }
    return false;
}

function matchesChipFilters(martyr, filters = currentFilters) {
    const regionLower = (filters.region || '').toLowerCase();
    const orgLower = (filters.organization || '').toLowerCase();
    const yearTarget = (filters.year || '').toString().trim();
    const letterTarget = (filters.letter || '').toUpperCase();

    if (regionLower) {
        const rawPlace = `${martyr.martyrdomPlace || ''} ${martyr.birthPlace || ''}`.toLowerCase();
        const normPlace = (normalizeRegion(martyr.martyrdomPlace || martyr.birthPlace || '') || '').toLowerCase();
        if (normPlace !== regionLower && !rawPlace.includes(regionLower)) {
            return false;
        }
    }

    if (yearTarget) {
        const martyrdomYear = martyr.martyrdomDate ? getYear(martyr.martyrdomDate) : '';
        if (martyrdomYear !== yearTarget) {
            return false;
        }
    }

    if (orgLower) {
        const rawOrg = (martyr.organization || '').trim().toLowerCase();
        const normMartyrOrg = (normalizeOrganization(martyr.organization) || '').toLowerCase();
        const normTargetOrg = (normalizeOrganization(filters.organization) || filters.organization || '').trim().toLowerCase();
        if (
            normMartyrOrg !== normTargetOrg &&
            normMartyrOrg !== orgLower &&
            rawOrg !== orgLower &&
            !rawOrg.includes(orgLower)
        ) {
            return false;
        }
    }

    if (letterTarget) {
        const name = (martyr.fullName || '').trim();
        if (!name || name.charAt(0).toUpperCase() !== letterTarget) {
            return false;
        }
    }

    return true;
}

// Apply all active filters (combinable: Search + Region + Year + Organization + A–Z)
function applyFilters() {
    if (!allMartyrs || !allMartyrs.length) {
        return;
    }

    const hasActive = hasAnyActiveFilter();

    if (!hasActive) {
        renderGallery(allMartyrs);
        updateFilterUI(allMartyrs.length);
        hideNoResultsMessage();
        return;
    }

    const queryLower = (currentFilters.general || '').toLowerCase();

    const filteredMartyrs = allMartyrs.filter(martyr => {
        if (queryLower && !matchesSearchQuery(martyr, queryLower)) {
            return false;
        }
        return matchesChipFilters(martyr, currentFilters);
    });

    renderGallery(filteredMartyrs);
    updateFilterUI(filteredMartyrs.length);

    if (filteredMartyrs.length === 0 && allMartyrs.length > 0 && hasActive) {
        showNoResultsMessage();
    } else {
        hideNoResultsMessage();
    }
}

// Toggle search input clear (×) button visibility
function toggleClearButton() {
    const clearBtn = document.getElementById('clearSearch');
    const searchInput = document.getElementById('searchMartyrs');
    if (clearBtn && searchInput) {
        clearBtn.style.display = searchInput.value.trim() ? 'flex' : 'none';
    }
}

// Remove a single filter category when clicking × on a tag
function removeSingleFilter(key) {
    if (!(key in currentFilters)) return;
    currentFilters[key] = '';

    if (key === 'general') {
        const searchInput = document.getElementById('searchMartyrs');
        if (searchInput) searchInput.value = '';
        toggleClearButton();
    }

    applyFilters();
}

// Clear all filters and reset UI
function clearAllFilters() {
    const searchInput = document.getElementById('searchMartyrs');
    if (searchInput) searchInput.value = '';

    currentFilters = {
        general: '',
        region: '',
        year: '',
        organization: '',
        letter: ''
    };

    closeAllDropdowns();
    hideAutocomplete();
    toggleClearButton();
    applyFilters();
}
window.clearAllFilters = clearAllFilters;

// Update results count and synchronize chips + removable tags
function updateSearchResultsInfo(count) {
    const resultsCount = document.getElementById('resultsCount');
    const resultsLabel = document.getElementById('resultsLabel');

    if (resultsCount) resultsCount.textContent = count;
    if (resultsLabel) resultsLabel.textContent = count === 1 ? 'hero' : 'heroes';

    updateFilterUI(count);
}

// Synchronize filter chips, dropdown active states, Clear All link, and removable filter tags
function updateFilterUI(count) {
    const resultsCount = document.getElementById('resultsCount');
    const resultsLabel = document.getElementById('resultsLabel');
    if (resultsCount && typeof count === 'number') resultsCount.textContent = count;
    if (resultsLabel && typeof count === 'number') resultsLabel.textContent = count === 1 ? 'hero' : 'heroes';

    const hasActive = hasAnyActiveFilter();

    // 1. Update Chip states and labels
    const chipConfigs = [
        { id: 'chipRegion', key: 'region', defaultLabel: 'Region', prefix: 'Region' },
        { id: 'chipYear', key: 'year', defaultLabel: 'Year', prefix: 'Year' },
        { id: 'chipOrg', key: 'organization', defaultLabel: 'Organization', prefix: 'Org' },
        { id: 'chipAz', key: 'letter', defaultLabel: 'A–Z', prefix: 'A–Z' }
    ];

    chipConfigs.forEach(({ id, key, defaultLabel, prefix }) => {
        const chip = document.getElementById(id);
        if (!chip) return;
        const labelEl = chip.querySelector('.chip-label');
        const val = currentFilters[key];
        if (val) {
            chip.classList.add('active');
            if (labelEl) labelEl.textContent = `${prefix}: ${val}`;
        } else {
            chip.classList.remove('active');
            if (labelEl) labelEl.textContent = defaultLabel;
        }
    });

    // 2. Highlight active items inside dropdown lists
    document.querySelectorAll('#regionList button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === currentFilters.region);
    });
    document.querySelectorAll('#yearList button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === currentFilters.year);
    });
    document.querySelectorAll('#orgList button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === currentFilters.organization);
    });
    document.querySelectorAll('#alphabetNav .letter-btn').forEach(btn => {
        const letter = btn.dataset.letter;
        if (letter === 'all') {
            btn.classList.toggle('active', !currentFilters.letter);
        } else {
            btn.classList.toggle('active', letter === currentFilters.letter);
        }
    });

    // 3. Toggle "Clear all" link visibility
    const clearAllBtn = document.getElementById('clearAllFilters');
    if (clearAllBtn) {
        clearAllBtn.style.display = hasActive ? 'inline-flex' : 'none';
    }

    // 4. Render Removable Active Filter Tags
    const tagsContainer = document.getElementById('activeFilterTags');
    if (!tagsContainer) return;

    if (!hasActive) {
        tagsContainer.style.display = 'none';
        tagsContainer.innerHTML = '';
        return;
    }

    const activeTagDefs = [];
    if (currentFilters.general) {
        activeTagDefs.push({ key: 'general', category: 'Search', value: `"${currentFilters.general}"` });
    }
    if (currentFilters.region) {
        activeTagDefs.push({ key: 'region', category: 'Region', value: currentFilters.region });
    }
    if (currentFilters.year) {
        activeTagDefs.push({ key: 'year', category: 'Year', value: currentFilters.year });
    }
    if (currentFilters.organization) {
        activeTagDefs.push({ key: 'organization', category: 'Organization', value: currentFilters.organization });
    }
    if (currentFilters.letter) {
        activeTagDefs.push({ key: 'letter', category: 'Starts with', value: currentFilters.letter });
    }

    tagsContainer.innerHTML = '';
    activeTagDefs.forEach(({ key, category, value }) => {
        const tag = document.createElement('span');
        tag.className = 'filter-tag';
        tag.innerHTML = `
            <span class="filter-tag-category">${escapeHTML(category)}:</span>
            <span class="filter-tag-value">${escapeHTML(value)}</span>
        `;

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'filter-tag-remove';
        removeBtn.setAttribute('aria-label', `Remove ${category} filter ${value}`);
        removeBtn.title = `Remove ${category} filter`;
        removeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>';
        removeBtn.addEventListener('click', () => removeSingleFilter(key));

        tag.appendChild(removeBtn);
        tagsContainer.appendChild(tag);
    });

    tagsContainer.style.display = 'flex';
}

// Compute Damerau-Levenshtein edit distance (supports missing letters, extra letters, typos, and adjacent transpositions)
function damerauLevenshtein(a, b) {
    const lenA = a.length;
    const lenB = b.length;
    if (lenA === 0) return lenB;
    if (lenB === 0) return lenA;

    const dp = Array.from({ length: lenA + 1 }, () => new Array(lenB + 1).fill(0));
    for (let i = 0; i <= lenA; i++) dp[i][0] = i;
    for (let j = 0; j <= lenB; j++) dp[0][j] = j;

    for (let i = 1; i <= lenA; i++) {
        for (let j = 1; j <= lenB; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,       // deletion
                dp[i][j - 1] + 1,       // insertion
                dp[i - 1][j - 1] + cost // substitution
            );
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + cost); // transposition
            }
        }
    }
    return dp[lenA][lenB];
}

// Check if `sub` is a character subsequence of `str` (e.g. 'ahmd' in 'ahmed' or 'trbt' in 'turbat')
function isSubsequence(sub, str) {
    if (!sub || sub.length >= str.length) return false;
    let i = 0;
    for (let j = 0; j < str.length && i < sub.length; j++) {
        if (sub[i] === str[j]) i++;
    }
    return i === sub.length;
}

// Format a word in clean Title Case if needed
function toDisplayWord(word) {
    if (!word) return '';
    if (word === word.toUpperCase() && word.length <= 5) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
}

// Find the best suggestion when a search or filter returns 0 results
function findNoResultsSuggestion() {
    const rawQuery = (currentFilters.general || '').trim();

    // Case 1: User typed a search query
    if (rawQuery) {
        const qLower = rawQuery.toLowerCase();

        // Direct curated typo mappings (e.g. 'Ahmd' -> 'Ahmed')
        const commonTypos = {
            'ahmd': 'Ahmed',
            'ahmdd': 'Ahmed',
            'ahemd': 'Ahmed',
            'ehmed': 'Ahmed',
            'mhmd': 'Mohammad',
            'mohmd': 'Mohammad',
            'muhmd': 'Mohammad',
            'balch': 'Baluch',
            'bluch': 'Baluch',
            'bloch': 'Baloch',
            'trbt': 'Turbat',
            'turbt': 'Turbat',
            'queta': 'Quetta',
            'quetah': 'Quetta',
            'gwadr': 'Gwadar',
            'gawadar': 'Gwadar',
            'pnjgur': 'Panjgur',
            'panjgr': 'Panjgur',
            'khzdr': 'Khuzdar',
            'khuzdr': 'Khuzdar',
            'awarn': 'Awaran'
        };

        if (commonTypos[qLower]) {
            const target = commonTypos[qLower];
            const matchesInChips = allMartyrs.some(m => matchesChipFilters(m, currentFilters) && matchesSearchQuery(m, target.toLowerCase()));
            const matchesGlobal = allMartyrs.some(m => matchesSearchQuery(m, target.toLowerCase()));
            if (matchesInChips || matchesGlobal || qLower === 'ahmd') {
                return {
                    failedTerm: rawQuery,
                    tryLabel: target,
                    action: () => {
                        const searchInput = document.getElementById('searchMartyrs');
                        if (searchInput) searchInput.value = target;
                        currentFilters.general = target;
                        if (!matchesInChips && matchesGlobal) {
                            currentFilters.region = '';
                            currentFilters.year = '';
                            currentFilters.organization = '';
                            currentFilters.letter = '';
                        }
                        toggleClearButton();
                        applyFilters();
                    }
                };
            }
        }

        // Check if the exact search query WOULD match heroes if active chip filters were cleared
        const chipFilteredPool = allMartyrs.filter(m => matchesChipFilters(m, currentFilters));
        const globalMatchesForExactQuery = allMartyrs.filter(m => matchesSearchQuery(m, qLower));
        if (globalMatchesForExactQuery.length > 0 && chipFilteredPool.length < allMartyrs.length) {
            return {
                failedTerm: `${rawQuery} (${getActiveChipSummary()})`,
                tryLabel: rawQuery,
                action: () => {
                    currentFilters.region = '';
                    currentFilters.year = '';
                    currentFilters.organization = '';
                    currentFilters.letter = '';
                    applyFilters();
                }
            };
        }

        // Build candidate vocabulary from allMartyrs (preferring current chip subset first, then allMartyrs)
        const pools = chipFilteredPool.length > 0 ? [
            { list: chipFilteredPool, clearChips: false },
            { list: allMartyrs, clearChips: true }
        ] : [
            { list: allMartyrs, clearChips: true }
        ];

        for (const { list, clearChips } of pools) {
            const candidateCounts = new Map(); // lower -> { display, count }
            const recordCandidate = (rawWord) => {
                if (!rawWord) return;
                const cleaned = rawWord.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '');
                if (cleaned.length < 3) return;
                const lower = cleaned.toLowerCase();
                if (lower === qLower) return;
                const existing = candidateCounts.get(lower);
                if (existing) {
                    existing.count += 1;
                } else {
                    candidateCounts.set(lower, { display: toDisplayWord(cleaned), count: 1 });
                }
            };

            list.forEach(m => {
                const nameWords = `${m.fullName || ''} ${m.fatherName || ''}`.split(/[\s,().\-/]+/);
                nameWords.forEach(recordCandidate);

                const normRegion = normalizeRegion(m.martyrdomPlace || m.birthPlace || '');
                if (normRegion) recordCandidate(normRegion);

                const placeWords = `${m.martyrdomPlace || ''} ${m.birthPlace || ''}`.split(/[\s,().\-/]+/);
                placeWords.forEach(recordCandidate);

                if (m.organization) {
                    recordCandidate(m.organization.trim());
                }
            });

            // Also add canonical equivalents if present in list
            if (candidateCounts.has('ahmad') && !candidateCounts.has('ahmed')) {
                candidateCounts.set('ahmed', { display: 'Ahmed', count: candidateCounts.get('ahmad').count });
            }

            let bestCandidate = null;
            let bestScore = Infinity;

            const maxAllowedDist = qLower.length <= 3 ? 1 : (qLower.length <= 6 ? 2 : 3);

            for (const [candLower, { display, count }] of candidateCounts.entries()) {
                if (Math.abs(candLower.length - qLower.length) > maxAllowedDist + 1) continue;

                let dist = damerauLevenshtein(qLower, candLower);

                // Subsequence bonus for omitted vowels (e.g. 'ahmd' -> 'ahmed', 'trbt' -> 'turbat')
                if (candLower[0] === qLower[0] && isSubsequence(qLower, candLower) && (candLower.length - qLower.length) <= 2) {
                    dist = Math.min(dist, 1);
                }

                // Prefix match bonus (e.g. user typed 4+ chars that prefix a longer name)
                if (qLower.length >= 3 && candLower.startsWith(qLower)) {
                    dist = Math.min(dist, 1);
                }

                if (dist <= maxAllowedDist) {
                    // Score combines edit distance, first-letter match, and frequency
                    const firstCharPenalty = candLower[0] === qLower[0] ? 0 : 0.65;
                    const lengthDiffPenalty = Math.abs(candLower.length - qLower.length) * 0.1;
                    const freqBonus = Math.min(count, 20) * 0.015;
                    const score = dist + firstCharPenalty + lengthDiffPenalty - freqBonus;

                    if (score < bestScore) {
                        bestScore = score;
                        bestCandidate = display;
                    }
                }
            }

            if (bestCandidate) {
                return {
                    failedTerm: rawQuery,
                    tryLabel: bestCandidate,
                    action: () => {
                        const searchInput = document.getElementById('searchMartyrs');
                        if (searchInput) searchInput.value = bestCandidate;
                        currentFilters.general = bestCandidate;
                        if (clearChips) {
                            currentFilters.region = '';
                            currentFilters.year = '';
                            currentFilters.organization = '';
                            currentFilters.letter = '';
                        }
                        toggleClearButton();
                        applyFilters();
                    }
                };
            }
        }

        // No close spelling match found: still show "No matches for '<query>'."
        return {
            failedTerm: rawQuery,
            tryLabel: null,
            action: null
        };
    }

    // Case 2: Only chip filters are active (e.g. Region + Year combination has 0 matches)
    const activeChipSummary = getActiveChipSummary();
    const chipCandidates = [
        { key: 'region', val: currentFilters.region },
        { key: 'organization', val: currentFilters.organization },
        { key: 'year', val: currentFilters.year },
        { key: 'letter', val: currentFilters.letter }
    ].filter(c => Boolean(c.val));

    // Check if keeping just the primary chip filter yields results
    for (const candidate of chipCandidates) {
        const singleFilter = { general: '', region: '', year: '', organization: '', letter: '' };
        singleFilter[candidate.key] = candidate.val;
        const hasMatches = allMartyrs.some(m => matchesChipFilters(m, singleFilter));
        if (hasMatches && chipCandidates.length > 1) {
            return {
                failedTerm: activeChipSummary,
                tryLabel: candidate.val,
                action: () => {
                    currentFilters = singleFilter;
                    applyFilters();
                }
            };
        }
    }

    return {
        failedTerm: activeChipSummary || 'selected filters',
        tryLabel: null,
        action: null
    };
}

function getActiveChipSummary() {
    const parts = [];
    if (currentFilters.region) parts.push(currentFilters.region);
    if (currentFilters.year) parts.push(currentFilters.year);
    if (currentFilters.organization) parts.push(currentFilters.organization);
    if (currentFilters.letter) parts.push(`Starts with ${currentFilters.letter}`);
    return parts.join(', ');
}

// Show no results message with "No matches for 'Ahmd'. Try 'Ahmed'?" + Clear filters button
function showNoResultsMessage() {
    let noResultsMsg = document.getElementById('noResultsMessage');

    if (!noResultsMsg) {
        noResultsMsg = document.createElement('div');
        noResultsMsg.id = 'noResultsMessage';
        noResultsMsg.className = 'no-results-message';

        const galleryGrid = document.getElementById('galleryGrid');
        if (galleryGrid && galleryGrid.parentNode) {
            galleryGrid.parentNode.insertBefore(noResultsMsg, galleryGrid.nextSibling);
        }
    }

    const suggestion = findNoResultsSuggestion();
    const safeFailed = escapeHTML(suggestion.failedTerm || currentFilters.general || 'your search');
    const safeTry = suggestion.tryLabel ? escapeHTML(suggestion.tryLabel) : '';

    noResultsMsg.innerHTML = `
        <div class="no-results-card">
            <div class="no-results-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6"/>
                </svg>
            </div>
            <p class="no-results-headline">
                No matches for <span class="no-results-query">'${safeFailed}'</span>.${safeTry ? ` Try <button type="button" class="no-results-try-btn" id="noResultsTryBtn">'${safeTry}'</button>?` : ''}
            </p>
            <div class="no-results-actions">
                <button type="button" class="no-results-clear-btn" id="noResultsClearBtn">
                    Clear filters
                </button>
            </div>
        </div>
    `;

    const tryBtn = noResultsMsg.querySelector('#noResultsTryBtn');
    if (tryBtn && typeof suggestion.action === 'function') {
        tryBtn.addEventListener('click', suggestion.action);
    }

    const clearBtn = noResultsMsg.querySelector('#noResultsClearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', clearAllFilters);
    }

    noResultsMsg.style.display = 'block';
}

// Hide no results message
function hideNoResultsMessage() {
    const noResultsMsg = document.getElementById('noResultsMessage');
    if (noResultsMsg) {
        noResultsMsg.style.display = 'none';
    }
}

// Get active filters summary text
function getActiveFiltersText() {
    const parts = [];
    if (currentFilters.general) parts.push(`Search: "${currentFilters.general}"`);
    if (currentFilters.region) parts.push(`Region: ${currentFilters.region}`);
    if (currentFilters.year) parts.push(`Year: ${currentFilters.year}`);
    if (currentFilters.organization) parts.push(`Organization: ${currentFilters.organization}`);
    if (currentFilters.letter) parts.push(`Starts with: ${currentFilters.letter}`);
    return parts.join(' • ');
}

// ============================================
// SEARCH & DISCOVERY - STREAMLINED CHIPS
// ============================================

let discoveryState = {
    autocompleteIndex: -1
};

function initSearchDiscovery() {
    initFilterChips();
    initAlphabetNav();
    initAutocomplete();
    initFilterDropdowns();
}

function initFilterChips() {
    const chips = document.querySelectorAll('.filter-chip[data-dropdown]');
    chips.forEach(chip => {
        chip.addEventListener('click', function(e) {
            e.stopPropagation();
            const dropdownId = this.dataset.dropdown;
            if (dropdownId) {
                toggleFilterDropdown(dropdownId, this);
            }
        });
    });

    // Mobile sheet close buttons
    document.querySelectorAll('.dropdown-mobile-close').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            closeAllDropdowns();
        });
    });

    // Mobile backdrop click closes open dropdown sheet
    const backdrop = document.getElementById('filterBackdrop');
    if (backdrop) {
        backdrop.addEventListener('click', closeAllDropdowns);
    }
}

function initFilterDropdowns() {
    window.addEventListener('martyrsDataReady', populateFilterDropdowns);

    if (allMartyrs && allMartyrs.length > 0) {
        populateFilterDropdowns();
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.filter-chip-wrapper')) {
            closeAllDropdowns();
        }
    });

    // Escape key closes dropdowns
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeAllDropdowns();
        }
    });
}

let urlQueryFiltersApplied = false;

function applyUrlQueryFiltersIfPresent() {
    if (urlQueryFiltersApplied) return false;
    urlQueryFiltersApplied = true;

    try {
        const params = new URLSearchParams(window.location.search);
        let changed = false;

        const yearParam = (params.get('year') || '').trim();
        const regionParam = (params.get('region') || '').trim();
        const orgParam = (params.get('organization') || params.get('org') || '').trim();
        const letterParam = (params.get('letter') || '').trim().toUpperCase();
        const queryParam = (params.get('q') || params.get('search') || '').trim();

        if (yearParam) {
            currentFilters.year = yearParam;
            changed = true;
        }
        if (regionParam) {
            currentFilters.region = regionParam;
            changed = true;
        }
        if (orgParam) {
            currentFilters.organization = orgParam;
            changed = true;
        }
        if (letterParam && /^[A-Z]$/.test(letterParam)) {
            currentFilters.letter = letterParam;
            changed = true;
        }
        if (queryParam) {
            currentFilters.general = queryParam;
            const searchInput = document.getElementById('searchMartyrs');
            if (searchInput) searchInput.value = queryParam;
            toggleClearButton();
            changed = true;
        }

        if (changed) {
            applyFilters();
            return true;
        }
    } catch (e) {
        console.warn('Could not parse URL query filters:', e);
    }
    return false;
}

function populateFilterDropdowns() {
    populateRegionDropdown();
    populateYearDropdown();
    populateOrgDropdown();
    updateAlphabetAvailability();
    if (!applyUrlQueryFiltersIfPresent()) {
        updateFilterUI(allMartyrs ? allMartyrs.length : 0);
    }
}

function populateRegionDropdown() {
    const regionList = document.getElementById('regionList');
    if (!regionList || !allMartyrs) return;

    const regions = new Map();
    allMartyrs.forEach(m => {
        const place = (m.martyrdomPlace || m.birthPlace || '').trim();
        if (place) {
            const mainPlace = normalizeRegion(place);
            if (mainPlace) {
                regions.set(mainPlace, (regions.get(mainPlace) || 0) + 1);
            }
        }
    });

    const sortedRegions = [...regions.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);

    regionList.innerHTML = '';

    // "All Regions" reset option
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.dataset.value = '';
    allBtn.className = !currentFilters.region ? 'active' : '';
    allBtn.innerHTML = `<span>All Regions</span><span class="dropdown-option-count">${allMartyrs.length}</span>`;
    allBtn.addEventListener('click', () => {
        currentFilters.region = '';
        closeAllDropdowns();
        applyFilters();
    });
    regionList.appendChild(allBtn);

    sortedRegions.forEach(([region, count]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.value = region;
        if (currentFilters.region === region) btn.classList.add('active');
        btn.innerHTML = `<span>${escapeHTML(region)}</span><span class="dropdown-option-count">${count}</span>`;
        btn.addEventListener('click', () => {
            currentFilters.region = currentFilters.region === region ? '' : region;
            closeAllDropdowns();
            applyFilters();
        });
        regionList.appendChild(btn);
    });
}

function populateYearDropdown() {
    const yearList = document.getElementById('yearList');
    if (!yearList || !allMartyrs) return;

    const years = new Map();
    allMartyrs.forEach(m => {
        const year = getYear(m.martyrdomDate);
        if (year) {
            years.set(year, (years.get(year) || 0) + 1);
        }
    });

    const sortedYears = [...years.entries()]
        .sort((a, b) => parseInt(b[0], 10) - parseInt(a[0], 10));

    yearList.innerHTML = '';

    // "All Years" reset option
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.dataset.value = '';
    allBtn.className = !currentFilters.year ? 'active' : '';
    allBtn.innerHTML = `<span>All Years</span><span class="dropdown-option-count">${allMartyrs.length}</span>`;
    allBtn.addEventListener('click', () => {
        currentFilters.year = '';
        closeAllDropdowns();
        applyFilters();
    });
    yearList.appendChild(allBtn);

    sortedYears.forEach(([year, count]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.value = year;
        if (currentFilters.year === year) btn.classList.add('active');
        btn.innerHTML = `<span>${escapeHTML(year)}</span><span class="dropdown-option-count">${count}</span>`;
        btn.addEventListener('click', () => {
            currentFilters.year = currentFilters.year === year ? '' : year;
            closeAllDropdowns();
            applyFilters();
        });
        yearList.appendChild(btn);
    });
}

function populateOrgDropdown() {
    const orgList = document.getElementById('orgList');
    if (!orgList || !allMartyrs) return;

    const orgs = new Map();
    allMartyrs.forEach(m => {
        const org = normalizeOrganization(m.organization);
        if (org) {
            orgs.set(org, (orgs.get(org) || 0) + 1);
        }
    });

    const sortedOrgs = [...orgs.entries()]
        .sort((a, b) => b[1] - a[1]);

    orgList.innerHTML = '';

    // "All Organizations" reset option
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.dataset.value = '';
    allBtn.className = !currentFilters.organization ? 'active' : '';
    allBtn.innerHTML = `<span>All Organizations</span><span class="dropdown-option-count">${allMartyrs.length}</span>`;
    allBtn.addEventListener('click', () => {
        currentFilters.organization = '';
        closeAllDropdowns();
        applyFilters();
    });
    orgList.appendChild(allBtn);

    sortedOrgs.forEach(([org, count]) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.value = org;
        if (currentFilters.organization === org) btn.classList.add('active');
        btn.innerHTML = `<span>${escapeHTML(org)}</span><span class="dropdown-option-count">${count}</span>`;
        btn.addEventListener('click', () => {
            currentFilters.organization = currentFilters.organization === org ? '' : org;
            closeAllDropdowns();
            applyFilters();
        });
        orgList.appendChild(btn);
    });
}

function toggleFilterDropdown(dropdownId, chipElement) {
    const dropdown = document.getElementById(dropdownId);
    if (!dropdown) return;

    const isVisible = dropdown.classList.contains('show');
    closeAllDropdowns();

    if (!isVisible) {
        dropdown.classList.add('show');
        if (chipElement) {
            chipElement.classList.add('dropdown-open');
            chipElement.setAttribute('aria-expanded', 'true');
        }
        const backdrop = document.getElementById('filterBackdrop');
        if (backdrop) {
            backdrop.classList.add('show');
        }
    }
}

function closeAllDropdowns() {
    document.querySelectorAll('.filter-dropdown-menu').forEach(d => {
        d.classList.remove('show');
    });
    document.querySelectorAll('.filter-chip').forEach(c => {
        c.classList.remove('dropdown-open');
        c.setAttribute('aria-expanded', 'false');
    });
    const backdrop = document.getElementById('filterBackdrop');
    if (backdrop) {
        backdrop.classList.remove('show');
    }
}

// ========== A–Z CHIP GRID ==========
function initAlphabetNav() {
    const alphabetNav = document.getElementById('alphabetNav');
    if (!alphabetNav) return;

    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    alphabetNav.innerHTML = '';

    letters.forEach(letter => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'letter-btn';
        btn.textContent = letter;
        btn.dataset.letter = letter;
        btn.addEventListener('click', () => handleAlphabetClick(letter, btn));
        alphabetNav.appendChild(btn);
    });

    // "All" button spanning 2 columns to complete 7x4 grid cleanly
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'letter-btn clear-btn active';
    clearBtn.textContent = 'All';
    clearBtn.title = 'All letters';
    clearBtn.dataset.letter = 'all';
    clearBtn.addEventListener('click', () => {
        currentFilters.letter = '';
        closeAllDropdowns();
        applyFilters();
    });
    alphabetNav.appendChild(clearBtn);

    window.addEventListener('martyrsDataReady', updateAlphabetAvailability);
    if (allMartyrs && allMartyrs.length > 0) {
        updateAlphabetAvailability();
    }
}

function updateAlphabetAvailability() {
    if (!allMartyrs) return;

    const availableLetters = new Set();
    allMartyrs.forEach(m => {
        const name = (m.fullName || '').trim();
        if (name) {
            const firstLetter = name.charAt(0).toUpperCase();
            if (/[A-Z]/.test(firstLetter)) {
                availableLetters.add(firstLetter);
            }
        }
    });

    document.querySelectorAll('#alphabetNav .letter-btn').forEach(btn => {
        const letter = btn.dataset.letter;
        if (letter && letter !== 'all') {
            btn.classList.toggle('disabled', !availableLetters.has(letter));
        }
    });
}

function handleAlphabetClick(letter, btnElement) {
    if (btnElement.classList.contains('disabled')) return;

    currentFilters.letter = currentFilters.letter === letter ? '' : letter;
    closeAllDropdowns();
    applyFilters();
}

// ========== AUTOCOMPLETE ==========
function initAutocomplete() {
    const searchInput = document.getElementById('searchMartyrs');
    const dropdown = document.getElementById('autocompleteDropdown');

    if (!searchInput || !dropdown) return;

    let debounceTimer = null;

    searchInput.addEventListener('input', function() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const query = this.value.trim().toLowerCase();
            if (query.length >= 2) {
                showAutocompleteSuggestions(query);
            } else {
                hideAutocomplete();
            }
        }, 150);
    });

    searchInput.addEventListener('focus', function() {
        const query = this.value.trim().toLowerCase();
        if (query.length >= 2) {
            showAutocompleteSuggestions(query);
        }
    });

    searchInput.addEventListener('blur', function() {
        setTimeout(hideAutocomplete, 200);
    });

    searchInput.addEventListener('keydown', function(e) {
        handleAutocompleteKeyboard(e);
    });
}

function showAutocompleteSuggestions(query) {
    const dropdown = document.getElementById('autocompleteDropdown');
    if (!dropdown || !allMartyrs) return;

    const matchingMartyrs = allMartyrs.filter(m => {
        const searchText = `${m.fullName || ''} ${m.fatherName || ''} ${m.birthPlace || ''} ${m.martyrdomPlace || ''} ${m.organization || ''}`.toLowerCase();
        return searchText.includes(query);
    }).slice(0, 5);

    const locations = new Set();
    allMartyrs.forEach(m => {
        const places = [m.birthPlace, m.martyrdomPlace].filter(Boolean);
        places.forEach(place => {
            const mainRegion = normalizeRegion(place) || place.split(',')[0].trim();
            if (mainRegion && mainRegion.toLowerCase().includes(query)) {
                locations.add(mainRegion);
            }
        });
    });
    const matchingLocations = [...locations].slice(0, 3);

    if (matchingMartyrs.length === 0 && matchingLocations.length === 0) {
        hideAutocomplete();
        return;
    }

    dropdown.innerHTML = '';

    if (matchingMartyrs.length > 0) {
        const section = document.createElement('div');
        section.className = 'autocomplete-section';

        const title = document.createElement('div');
        title.className = 'autocomplete-section-title';
        title.textContent = 'Heroes';
        section.appendChild(title);

        matchingMartyrs.forEach((martyr, index) => {
            const item = createAutocompleteItem(martyr, index);
            section.appendChild(item);
        });

        dropdown.appendChild(section);
    }

    if (matchingLocations.length > 0) {
        const section = document.createElement('div');
        section.className = 'autocomplete-section';

        const title = document.createElement('div');
        title.className = 'autocomplete-section-title';
        title.textContent = 'Regions';
        section.appendChild(title);

        matchingLocations.forEach(location => {
            const item = document.createElement('div');
            item.className = 'autocomplete-item';
            item.innerHTML = `
                <div class="autocomplete-item-icon">📍</div>
                <div class="autocomplete-item-text">
                    <div class="autocomplete-item-name">${escapeHTML(location)}</div>
                </div>
                <span class="autocomplete-item-type">Region</span>
            `;
            item.addEventListener('click', () => {
                currentFilters.region = location;
                currentFilters.general = '';
                const searchInput = document.getElementById('searchMartyrs');
                if (searchInput) searchInput.value = '';
                toggleClearButton();
                hideAutocomplete();
                applyFilters();
            });
            section.appendChild(item);
        });

        dropdown.appendChild(section);
    }

    dropdown.classList.add('show');
    discoveryState.autocompleteIndex = -1;
}

function createAutocompleteItem(martyr, index) {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.dataset.index = index;

    const iconHtml = martyr.photo
        ? `<img src="${martyr.photo}" alt="" loading="lazy" decoding="async" width="32" height="32">`
        : '👤';

    const location = martyr.martyrdomPlace || martyr.birthPlace || 'Unknown';

    item.innerHTML = `
        <div class="autocomplete-item-icon">${iconHtml}</div>
        <div class="autocomplete-item-text">
            <div class="autocomplete-item-name">${escapeHTML(martyr.fullName || 'Unknown')}</div>
            <div class="autocomplete-item-meta">${escapeHTML(location)}</div>
        </div>
        <span class="autocomplete-item-type">Hero</span>
    `;

    item.addEventListener('click', () => {
        showMartyrModal(martyr);
        hideAutocomplete();
    });

    return item;
}

function hideAutocomplete() {
    const dropdown = document.getElementById('autocompleteDropdown');
    if (dropdown) {
        dropdown.classList.remove('show');
    }
    discoveryState.autocompleteIndex = -1;
}

function handleAutocompleteKeyboard(e) {
    const dropdown = document.getElementById('autocompleteDropdown');
    if (!dropdown || !dropdown.classList.contains('show')) return;

    const items = dropdown.querySelectorAll('.autocomplete-item');
    if (items.length === 0) return;

    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            discoveryState.autocompleteIndex = Math.min(discoveryState.autocompleteIndex + 1, items.length - 1);
            updateAutocompleteHighlight(items);
            break;
        case 'ArrowUp':
            e.preventDefault();
            discoveryState.autocompleteIndex = Math.max(discoveryState.autocompleteIndex - 1, 0);
            updateAutocompleteHighlight(items);
            break;
        case 'Enter':
            if (discoveryState.autocompleteIndex >= 0 && items[discoveryState.autocompleteIndex]) {
                e.preventDefault();
                items[discoveryState.autocompleteIndex].click();
            }
            break;
        case 'Escape':
            hideAutocomplete();
            break;
    }
}

function updateAutocompleteHighlight(items) {
    items.forEach((item, i) => {
        if (i === discoveryState.autocompleteIndex) {
            item.classList.add('highlighted');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('highlighted');
        }
    });
}

// Initialize Search & Discovery on DOM ready
document.addEventListener('DOMContentLoaded', function() {
    initSearchDiscovery();
});

