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
    name: '',
    father: '',
    location: '',
    organization: '',
    year: ''
};

// Simple flags to prevent duplicate/overlapping gallery loads
let galleryLoading = false;
let galleryLoaded = false;

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
    
    // We no longer show a large loading panel; gallery will render
    // martyrs as soon as data is available (from Firebase or cache).
    
    // Setup interface
    initSearchFilter();
    initAdvancedSearch();
    initializeInterface();
    addDebugButton();
    
        // Listen for data events from Firebase loader
    window.addEventListener('martyrsDataReady', (event) => {
        console.log('📨 Received martyrsDataReady event:', event.detail);
        const { data, source, connected, error } = event.detail;
        
        // Update connection status display
        updateConnectionStatus(connected, source, error);
        
        if (data && data.length > 0) {
            console.log(`✅ Got ${data.length} martyrs from ${source}`);
            allMartyrs = data;
            renderGallery(allMartyrs);
            galleryLoaded = true;
            galleryLoading = false;
            
            // Show offline warning if using localStorage
            if (source.includes('localStorage') && source.includes('h old')) {
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
        const isLiveSite = hostname === 'baluchmartyrs.site' || hostname === 'www.baluchmartyrs.site';
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

// Render gallery with current martyrs
function renderGallery() {
    const galleryGrid = document.getElementById('galleryGrid');
    if (!galleryGrid) {
        console.error('❌ Cannot render - gallery grid not found');
        return;
    }
    
    console.log(`🎨 Rendering ${allMartyrs.length} martyrs...`);
    
    // Clear existing content
    galleryGrid.innerHTML = '';
    
    if (allMartyrs.length === 0) {
        showEmptyMessage();
        return;
    }
    
    // Create cards
    let rendered = 0;
    allMartyrs.forEach((martyr, index) => {
        try {
            const card = createGalleryCard(martyr);
            galleryGrid.appendChild(card);
            rendered++;
        } catch (error) {
            console.error(`❌ Failed to create card ${index}:`, error);
        }
    });
    
    console.log(`✅ Rendered ${rendered}/${allMartyrs.length} martyr cards`);
    
    // Show results info container (initially hidden)
    const resultsInfo = document.getElementById('searchResultsInfo');
    if (resultsInfo) {
        resultsInfo.style.display = allMartyrs.length > 0 ? 'flex' : 'none';
    }

    // Apply current filters (this will update the result count text)
    applyFilters();
}
// Create individual martyr card
function createGalleryCard(martyr) {
    const card = document.createElement('div');
    card.className = 'martyr-card';
    
    // Search attributes
    card.setAttribute('data-search-text', 
        `${martyr.fullName} ${martyr.birthPlace || ''} ${martyr.martyrdomPlace || ''} ${martyr.organization || ''}`.toLowerCase()
    );
    card.setAttribute('data-name', martyr.fullName.toLowerCase());
    card.setAttribute('data-location', `${martyr.birthPlace || ''} ${martyr.martyrdomPlace || ''}`.toLowerCase());
    card.setAttribute('data-organization', (martyr.organization || '').toLowerCase());
    card.setAttribute('data-year', martyr.martyrdomDate ? getYear(martyr.martyrdomDate) : '');
    
    // Image section
    const imageDiv = document.createElement('div');
    imageDiv.className = 'martyr-image';
    
    if (martyr.photo) {
        const img = document.createElement('img');
        img.src = martyr.photo;
        img.alt = martyr.fullName;
        img.style.cssText = 'width: 100%; height: 200px; object-fit: cover; border-radius: 8px 8px 0 0;';
        imageDiv.appendChild(img);
    } else {
        imageDiv.style.cssText = 'height: 200px; background: linear-gradient(135deg, #f0f0f0, #d0d0d0); border-radius: 8px 8px 0 0; display: flex; align-items: center; justify-content: center; font-size: 48px; color: #999;';
        imageDiv.textContent = '📸';
    }
    
    // Info section
    const infoDiv = document.createElement('div');
    infoDiv.className = 'martyr-info';
    infoDiv.style.cssText = 'padding: 1rem;';
    
    const name = document.createElement('h3');
    name.textContent = martyr.fullName;
    name.style.cssText = 'margin: 0 0 0.5rem 0; color: #2c5530;';
    
    const dates = document.createElement('p');
    const birthYear = martyr.birthDate ? getYear(martyr.birthDate) : '?';
    const martyrdomYear = getYear(martyr.martyrdomDate) || '?';
    dates.textContent = `${birthYear} - ${martyrdomYear}`;
    dates.style.cssText = 'margin: 0 0 0.5rem 0; font-weight: 500;';
    
    const place = document.createElement('p');
    place.textContent = martyr.martyrdomPlace || 'Unknown location';
    place.style.cssText = 'margin: 0 0 0.5rem 0; color: #666;';
    
    const viewBtn = document.createElement('button');
    viewBtn.textContent = 'View Details';
    viewBtn.className = 'btn-small';
    viewBtn.style.cssText = 'margin-top: 1rem; background: #2c5530; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;';
    // Use the original gallery-specific martyr modal
    viewBtn.onclick = () => showMartyrModal(martyr);
    
    infoDiv.appendChild(name);
    infoDiv.appendChild(dates);
    infoDiv.appendChild(place);
    
    if (martyr.organization) {
        const org = document.createElement('p');
        org.textContent = martyr.organization;
        org.style.cssText = 'margin: 0 0 0.5rem 0; font-size: 0.9rem; color: #888;';
        infoDiv.appendChild(org);
    }
    
    infoDiv.appendChild(viewBtn);
    
    card.appendChild(imageDiv);
    card.appendChild(infoDiv);
    
    // Card styling
    card.style.cssText = 'border: 1px solid #ddd; border-radius: 8px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: transform 0.2s, box-shadow 0.2s; overflow: hidden;';
    
    // Hover effect
    card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-4px)';
        card.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    });
    card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    });
    
    return card;
}

// Apply filters to visible cards
function applyFilters() {
    const cards = document.querySelectorAll('.martyr-card');
    if (cards.length === 0) {
        console.warn('⚠️ No cards found to filter');
        return;
    }
    
    console.log(`🔍 Applying filters to ${cards.length} cards...`);
    
    let visibleCount = 0;
    const hasFilters = Object.values(currentFilters).some(f => f !== '');
    
    cards.forEach(card => {
        let visible = true;
        
        // General search
        if (currentFilters.general) {
            const searchText = card.getAttribute('data-search-text') || '';
            visible = visible && searchText.includes(currentFilters.general);
        }
        
        // Name filter
        if (currentFilters.name) {
            const name = card.getAttribute('data-name') || '';
            visible = visible && name.includes(currentFilters.name);
        }
        
        // Location filter
        if (currentFilters.location) {
            const location = card.getAttribute('data-location') || '';
            visible = visible && location.includes(currentFilters.location);
        }
        
        // Organization filter
        if (currentFilters.organization) {
            const org = card.getAttribute('data-organization') || '';
            visible = visible && org.includes(currentFilters.organization);
        }
        
        // Year filter
        if (currentFilters.year) {
            const year = card.getAttribute('data-year') || '';
            visible = visible && year === currentFilters.year;
        }
        
        card.style.display = visible ? 'block' : 'none';
        if (visible) visibleCount++;
    });
    
    updateSearchResultsInfo(visibleCount);
    console.log(`🔍 Filter result: ${visibleCount}/${cards.length} cards visible`);
    
    // Show no results message if needed
    if (visibleCount === 0 && hasFilters && cards.length > 0) {
        showNoResultsMessage();
    } else {
        hideNoResultsMessage();
    }
}

// Initialize search functionality
function initSearchFilter() {
    const searchInput = document.getElementById('searchMartyrs');
    const clearSearch = document.getElementById('clearSearch');
    
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            currentFilters.general = e.target.value.toLowerCase().trim();
            applyFilters();
            toggleClearButton();
        });
    }
    
    if (clearSearch) {
        clearSearch.addEventListener('click', function() {
            if (searchInput) searchInput.value = '';
            currentFilters.general = '';
            applyFilters();
            toggleClearButton();
        });
    }
}

// Initialize advanced search
function initAdvancedSearch() {
    const toggleBtn = document.getElementById('toggleAdvancedSearch');
    const panel = document.getElementById('advancedSearchPanel');
    
    if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', function() {
            const isVisible = panel.style.display !== 'none';
            panel.style.display = isVisible ? 'none' : 'block';
            toggleBtn.textContent = isVisible ? 'Advanced Search' : 'Hide Advanced';
        });
    }
    
    // Advanced search inputs
    const inputs = [
        { id: 'searchByName', filter: 'name' },
        { id: 'searchByFather', filter: 'father' },
        { id: 'searchByLocation', filter: 'location' },
        { id: 'searchByOrganization', filter: 'organization' },
        { id: 'searchByYear', filter: 'year' }
    ];
    
    inputs.forEach(({ id, filter }) => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', function() {
                currentFilters[filter] = this.value.toLowerCase().trim();
                applyFilters();
            });
        }
    });
    
    // Clear buttons
    const clearAdvanced = document.getElementById('clearAdvancedSearch');
    const clearAll = document.getElementById('clearAllFilters');
    
    if (clearAdvanced) {
        clearAdvanced.addEventListener('click', clearAdvancedFilters);
    }
    
    if (clearAll) {
        clearAll.addEventListener('click', clearAllFilters);
    }
}

// Helper functions
function initializeInterface() {
    toggleClearButton();
    const resultsInfo = document.getElementById('searchResultsInfo');
    if (resultsInfo) {
        resultsInfo.style.display = 'none';
    }
}

function toggleClearButton() {
    const clearBtn = document.getElementById('clearSearch');
    const searchInput = document.getElementById('searchMartyrs');
    if (clearBtn && searchInput) {
        clearBtn.style.display = searchInput.value.trim() ? 'flex' : 'none';
    }
}

function clearAdvancedFilters() {
    ['searchByName', 'searchByLocation', 'searchByOrganization', 'searchByYear'].forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
    
    currentFilters.name = '';
    currentFilters.father = '';
    currentFilters.location = '';
    currentFilters.organization = '';
    currentFilters.year = '';
    
    applyFilters();
}

function clearAllFilters() {
    const searchInput = document.getElementById('searchMartyrs');
    if (searchInput) searchInput.value = '';
    
    clearAdvancedFilters();
    
    currentFilters.general = '';
    applyFilters();
    toggleClearButton();
}

function updateSearchResultsInfo(count) {
    const resultsCount = document.getElementById('resultsCount');
    const resultsLabel = document.getElementById('resultsLabel');
    const resultsFilters = document.getElementById('resultsFilters');
    
    if (resultsCount) resultsCount.textContent = count;
    if (resultsLabel) resultsLabel.textContent = count === 1 ? 'martyr found' : 'martyrs found';

    // Show a short summary of active filters if any
    if (resultsFilters) {
        const filtersText = getActiveFiltersText();
        resultsFilters.textContent = filtersText ? ` | Filters: ${filtersText}` : '';
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

function showNoResultsMessage() {
    hideNoResultsMessage(); // Remove any existing message
    
    const galleryGrid = document.getElementById('galleryGrid');
    const noResultsMsg = document.createElement('div');
    noResultsMsg.id = 'noResultsMessage';
    noResultsMsg.style.cssText = `
        text-align: center; padding: 3rem; color: #666; background: #f8f9fa;
        border: 1px solid #dee2e6; border-radius: 8px; margin-top: 2rem;
    `;
    
    const activeFilters = [];
    if (currentFilters.general) activeFilters.push(`General: "${currentFilters.general}"`);
    if (currentFilters.name) activeFilters.push(`Name: "${currentFilters.name}"`);
    if (currentFilters.location) activeFilters.push(`Location: "${currentFilters.location}"`);
    if (currentFilters.organization) activeFilters.push(`Organization: "${currentFilters.organization}"`);
    if (currentFilters.year) activeFilters.push(`Year: ${currentFilters.year}`);
    
    noResultsMsg.innerHTML = `
        <h3>No martyrs found</h3>
        <p>No martyrs match your search criteria:</p>
        <p style="font-style: italic; color: #007bff;">${activeFilters.join(', ')}</p>
        <button onclick="clearAllFilters()" style="margin-top: 1rem; background: #2c5530; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer;">Clear All Filters</button>
    `;
    
    galleryGrid.parentNode.insertBefore(noResultsMsg, galleryGrid.nextSibling);
}

function hideNoResultsMessage() {
    const msg = document.getElementById('noResultsMessage');
    if (msg) msg.remove();
}

// Previously this function showed a large loading panel.
// To keep the experience clean, we now just log to console and
// let the gallery cards appear directly when data is ready.
function showLoadingState() {
    console.log('🔄 Preparing gallery – waiting for data...');
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

    // If already speaking, stop
    if (window.speechSynthesis.speaking && currentMartyrUtterance) {
        stopMartyrSpeech();
        if (buttonEl) {
            buttonEl.textContent = '🔊 Listen to this martyr\'s story';
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
                buttonEl.textContent = '🔊 Listen to this martyr\'s story';
            }
        };

        utterance.onerror = function() {
            currentMartyrUtterance = null;
            if (buttonEl) {
                buttonEl.textContent = '🔊 Listen to this martyr\'s story';
            }
        };

        currentMartyrUtterance = utterance;
        if (buttonEl) {
            buttonEl.textContent = '⏹ Stop audio';
        }

        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.warn('Failed to start martyr speech:', e);
        if (buttonEl) {
            buttonEl.textContent = '🔊 Listen to this martyr\'s story';
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

// Show martyr details modal (with print/download support)
function showMartyrModal(martyr) {
    console.log(`🔍 Showing modal for: ${martyr.fullName}`);
    
    // Remove existing modal
    const existingModal = document.getElementById('martyrModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal
    const modal = document.createElement('div');
    modal.id = 'martyrModal';
    modal.style.cssText = `
        position: fixed;
        top: 72px; /* stay below sticky header */
        left: 0;
        width: 100%;
        height: calc(100% - 72px);
        background: rgba(0, 0, 0, 0.8);
        z-index: 1500;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 16px;
        overflow-y: auto;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: #f9fafb;
        max-width: 960px;
        max-height: 90vh;
        overflow-y: auto;
        border-radius: 18px;
        position: relative;
        width: 100%;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(148, 163, 184, 0.35);
    `;

    const birthPretty = formatDate(martyr.birthDate) || 'Unknown';
    const martyrdomPretty = formatDate(martyr.martyrdomDate) || 'Unknown';
    const headerDateLabel = martyrdomPretty;
    
    content.innerHTML = `
        <div style="display: flex; flex-direction: column;">
            <div style="
                padding: 1.25rem 1.75rem;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: linear-gradient(135deg, #111827, #1f2937);
                color: #f9fafb;
            ">
                <div>
                    <h2 style="margin: 0; font-size: 1.4rem; letter-spacing: 0.08em; text-transform: uppercase; color: #f9fafb;">
                        ${escapeHTML(martyr.fullName || 'Unknown martyr')}
                    </h2>
                    <p style="margin: 0.35rem 0 0; font-size: 0.9rem; opacity: 0.85;">
                        ${escapeHTML(headerDateLabel)}
                    </p>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button class="martyr-print-btn-header"
                            style="background: #f9fafb; color: #111827; border: none; padding: 0.4rem 0.85rem; border-radius: 999px; font-size: 0.8rem; font-weight: 600; cursor: pointer;">
                        PDF
                    </button>
                    <button class="close-martyr-modal"
                            style="width: 36px; height: 36px; border-radius: 999px; border: 1px solid rgba(148,163,184,0.5); background: rgba(15,23,42,0.75); color: #f9fafb; font-size: 1.4rem; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        &times;
                    </button>
                </div>
            </div>

            <div style="padding: 1.75rem 1.75rem 1.5rem; display: flex; gap: 1.75rem; flex-wrap: wrap; align-items: flex-start;">
                <div style="flex: 0 0 260px; max-width: 260px;">
                    ${martyr.photo ? 
                        `<img src="${martyr.photo}" alt="${escapeHTML(martyr.fullName || 'Martyr photo')}" style="width: 100%; border-radius: 16px; object-fit: cover; box-shadow: 0 16px 35px rgba(15,23,42,0.45);">` :
                        '<div style="width: 100%; height: 320px; border-radius: 16px; background: radial-gradient(circle at top, #f3f4f6, #d1d5db); display: flex; align-items: center; justify-content: center; font-size: 3.5rem; color: #9ca3af; box-shadow: 0 16px 35px rgba(15,23,42,0.3);">📷</div>'
                    }
                </div>
                
                <div style="flex: 1; min-width: 280px;">
                    <div style="display: grid; gap: 0.6rem; font-size: 0.95rem;">
                        ${martyr.fatherName ? `
                            <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                                <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Father</span>
                                <span style="color: #111827;">${escapeHTML(martyr.fatherName)}</span>
                            </div>
                        ` : ''}
                        <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                            <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Birth</span>
                            <span style="color: #111827;">${escapeHTML(birthPretty)}</span>
                        </div>
                        <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                            <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Birth place</span>
                            <span style="color: #111827;">${escapeHTML(martyr.birthPlace || 'Unknown')}</span>
                        </div>
                        <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                            <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Martyrdom</span>
                            <span style="color: #111827;">${escapeHTML(martyrdomPretty)}</span>
                        </div>
                        <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                            <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Martyrdom place</span>
                            <span style="color: #111827;">${escapeHTML(martyr.martyrdomPlace || 'Unknown')}</span>
                        </div>
                        ${martyr.organization ? `
                            <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                                <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Organization</span>
                                <span style="color: #111827;">${escapeHTML(martyr.organization)}</span>
                            </div>
                        ` : ''}
                        ${martyr.rank ? `
                            <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                                <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Rank</span>
                                <span style="color: #111827;">${escapeHTML(martyr.rank)}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${martyr.biography ? `
                        <div style="margin-top: 1.75rem;">
                            <h3 style="margin: 0 0 0.75rem; font-size: 1.05rem; color: #111827;">Biography</h3>
                            <div style="background: #f9fafb; padding: 1.3rem 1.2rem; border-radius: 12px; border: 1px solid #e5e7eb; line-height: 1.7; color: #374151; font-size: 0.96rem; text-align: justify;">
                                ${escapeHTML(martyr.biography)}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${martyr.familyDetails ? `
                        <div style="margin-top: 1.5rem;">
                            <h3 style="margin: 0 0 0.75rem; font-size: 1.05rem; color: #111827;">Family Details</h3>
                            <div style="background: #f9fafb; padding: 1.2rem 1.15rem; border-radius: 12px; border: 1px solid #e5e7eb; line-height: 1.7; color: #374151; font-size: 0.95rem;">
                                ${escapeHTML(martyr.familyDetails)}
                            </div>
                        </div>
                    ` : ''}

                    <div style="margin-top: 1.5rem;">
                        <button class="martyr-voice-btn" type="button">
                            🔊 Listen to this martyr's story
                        </button>
                    </div>
                    
                    <div style="margin-top: 1.75rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 0.9rem; display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between;">
                        <p style="margin: 0;"><strong>Submitted by:</strong> ${escapeHTML(martyr.submitterName || 'Unknown')}</p>
                        <p style="margin: 0;"><strong>Submitted on:</strong> ${escapeHTML(formatDate(martyr.submittedAt) || 'Unknown')}</p>
                    </div>
                    
                    <div style="margin-top: 1.5rem; display: flex; flex-wrap: wrap; gap: 0.75rem;">
                        <button class="martyr-print-btn" style="background: #2c5530; color: #fff; border: none; padding: 0.6rem 1.4rem; border-radius: 999px; cursor: pointer; font-size: 0.95rem; font-weight: 600;">
                            Print / Download PDF
                        </button>
                        <button class="martyr-close-btn" style="background: #e5e7eb; color: #111827; border: none; padding: 0.6rem 1.3rem; border-radius: 999px; cursor: pointer; font-size: 0.95rem;">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    const closeModal = () => {
        stopMartyrSpeech();
        modal.remove();
        document.body.style.overflow = 'auto';
    };
    
    // Close buttons
    const closeIcon = modal.querySelector('.close-martyr-modal');
    const closeBtn  = modal.querySelector('.martyr-close-btn');
    if (closeIcon) closeIcon.addEventListener('click', closeModal);
    if (closeBtn)  closeBtn.addEventListener('click', closeModal);
    
    // Print / Download button
    const printBtn = modal.querySelector('.martyr-print-btn');
    const printHeaderBtn = modal.querySelector('.martyr-print-btn-header');
    [printBtn, printHeaderBtn].forEach((btn) => {
        if (btn) {
            btn.addEventListener('click', () => {
                printMartyrProfile(martyr);
            });
        }
    });

    // Voice assistant button (text-to-speech)
    const voiceBtn = modal.querySelector('.martyr-voice-btn');
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
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Close on Escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Show empty gallery message
function showEmptyGalleryMessage() {
    const galleryGrid = document.getElementById('galleryGrid');
    galleryGrid.innerHTML = `
        <div class="martyr-card placeholder" style="grid-column: 1/-1; text-align: center; padding: 3rem;">
            <div class="martyr-info">
                <h3>No martyrs in gallery yet</h3>
                <p>Be the first to add a martyr to our memorial</p>
                <a href="add-martyr.html" class="btn-small">Add Martyr</a>
            </div>
        </div>
    `;
}

// Show offline warning
function showOfflineWarning() {
    // Remove any existing warning first
    hideOfflineWarning();
    
    const galleryGrid = document.getElementById('galleryGrid');
    const warningDiv = document.createElement('div');
    warningDiv.className = 'offline-warning';
    warningDiv.id = 'offline-warning';
    warningDiv.style.cssText = `
        background: #fff3cd;
        border: 1px solid #ffeaa7;
        color: #856404;
        padding: 1rem;
        margin-bottom: 2rem;
        border-radius: 8px;
        text-align: center;
        font-weight: 500;
    `;
    warningDiv.innerHTML = `
        ⚠️ <strong>Offline Mode:</strong> Showing cached data. Some recent martyrs may not be visible.
        <button onclick="location.reload()" style="margin-left: 1rem; padding: 0.25rem 0.75rem; border-radius: 4px; border: 1px solid #856404; background: transparent; color: #856404; cursor: pointer;">Retry</button>
    `;
    
    galleryGrid.parentNode.insertBefore(warningDiv, galleryGrid);
}

// Hide offline warning
function hideOfflineWarning() {
    const existingWarning = document.getElementById('offline-warning');
    if (existingWarning) {
        existingWarning.remove();
    }
}

// Add debug button for Firebase testing (only in development)
function addDebugButton() {
    const debugBtn = document.createElement('button');
    debugBtn.textContent = 'Debug Firebase';
    debugBtn.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: #ff6b6b;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 5px;
        cursor: pointer;
        z-index: 9999;
        font-size: 12px;
    `;
    
    // Only show this heavy debug button in local development, never on production
    const hostname = window.location.hostname;
    const isDevelopment = hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isDevelopment) {
        return;
    }

    debugBtn.addEventListener('click', async function() {
        console.log('=== COMPREHENSIVE GALLERY DEBUG START ===');
        
        // Run manual data check
        window.checkGalleryData();
        
        // Show current state
        const galleryGrid = document.getElementById('galleryGrid');
        console.log('Gallery grid element:', galleryGrid);
        console.log('Gallery grid children:', galleryGrid?.children.length || 0);
        
        // Test Firebase directly
        if (window.firebaseDB) {
            try {
                console.log('🔥 Testing Firebase connection...');
                const result = await window.firebaseDB.getApprovedMartyrs();
                console.log(`✅ Firebase test: ${result.success ? 'SUCCESS' : 'FAILED'}`);
                if (result.success && result.data) {
                    console.log(`📊 Found ${result.data.length} approved martyrs`);
                    console.log('Sample martyr:', result.data[0]);
                    
                    // Try to render directly
                    if (result.data.length > 0) {
                        allMartyrs = result.data;
                        await renderAndDisplay(allMartyrs, 'debug manual load');
                    }
                } else {
                    console.error('❌ Error:', result.error);
                }
            } catch (error) {
                console.error('❌ Firebase test failed:', error);
            }
        } else {
            console.error('❌ Firebase not available globally');
        }
        
        // Check for localStorage data to migrate
        const localData = localStorage.getItem('martyrsData');
        if (localData) {
            const martyrs = JSON.parse(localData);
            console.log(`💾 Found ${martyrs.length} martyrs in localStorage`);
            
            if (confirm(`Found ${martyrs.length} martyrs in localStorage. Migrate to Firebase for global visibility?`)) {
                console.log('🚚 Starting migration...');
                if (window.migrateToFirebase) {
                    const result = await window.migrateToFirebase();
                    if (result.success) {
                        alert(`Migration completed! Migrated ${result.migrated} martyrs to Firebase. Refreshing gallery...`);
                        location.reload();
                    } else {
                        alert('Migration failed: ' + result.error);
                    }
                } else {
                    alert('Migration function not available. Please refresh the page.');
                }
            }
        } else {
            console.log('💭 No localStorage data found to migrate');
        }
        
        // Test mobile menu
        const hamburger = document.querySelector('.hamburger');
        const navMenu = document.querySelector('.nav-menu');
        console.log('Mobile menu elements:');
        console.log('Hamburger:', hamburger);
        console.log('Nav menu:', navMenu);
        
        console.log('=== FIREBASE DEBUG END ===');
        alert('Debug completed. Check console for details.');
    });
    
    document.body.appendChild(debugBtn);
}

// Render martyrs in gallery
function renderGallery(martyrsData) {
    const galleryGrid = document.getElementById('galleryGrid');
    if (!galleryGrid) {
        console.error('❌ Gallery grid element not found!');
        return;
    }
    
    console.log(`🎨 Rendering ${martyrsData.length} martyrs to gallery...`);
    galleryGrid.innerHTML = '';
    
    let renderedCount = 0;
    martyrsData.forEach((martyr, index) => {
        try {
            const card = createGalleryCard(martyr);
            galleryGrid.appendChild(card);
            renderedCount++;
        } catch (error) {
            console.error(`❌ Error rendering martyr ${index}:`, error, martyr);
        }
    });
    
    console.log(`✅ Successfully rendered ${renderedCount} out of ${martyrsData.length} martyrs`);
    updateSearchResultsInfo(martyrsData.length);
}

// Create gallery card (front of gallery)
// Modern, respectful design for gallery grid
function createGalleryCard(martyr) {
    const card = document.createElement('div');
    card.className = 'martyr-card';

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

    if (martyr.photo) {
        const img = document.createElement('img');
        img.src = martyr.photo;
        img.alt = martyr.fullName || 'Martyr portrait';
        photoWrapper.appendChild(img);
    } else {
        // Fallback gradient with icon when no photo is provided
        const placeholder = document.createElement('div');
        placeholder.className = 'martyr-photo-placeholder';
        placeholder.textContent = '📷';
        photoWrapper.appendChild(placeholder);
    }
    photoWrapper.appendChild(photoOverlay);

    // Information section
    const infoDiv = document.createElement('div');
    infoDiv.className = 'martyr-info';

    // Name with symbolic icon
    const nameRow = document.createElement('div');
    nameRow.className = 'martyr-name-row';

    const symbol = document.createElement('span');
    symbol.className = 'martyr-symbol';
    symbol.textContent = '✦';

    const name = document.createElement('h3');
    name.className = 'martyr-name';
    name.textContent = martyr.fullName || 'Unknown martyr';

    nameRow.appendChild(symbol);
    nameRow.appendChild(name);
    infoDiv.appendChild(nameRow);

    // Location line
    const locationLine = document.createElement('p');
    locationLine.className = 'martyr-meta martyr-location';
    const locIcon = document.createElement('span');
    locIcon.className = 'martyr-meta-icon';
    locIcon.textContent = '📍';
    const locText = document.createElement('span');
    locText.textContent = martyr.martyrdomPlace || martyr.birthPlace || 'Location unknown';
    locationLine.appendChild(locIcon);
    locationLine.appendChild(locText);
    infoDiv.appendChild(locationLine);

    // Date line (martyrdom)
    const dateLine = document.createElement('p');
    dateLine.className = 'martyr-meta martyr-date';
    const dateIcon = document.createElement('span');
    dateIcon.className = 'martyr-meta-icon';
    dateIcon.textContent = '🕊️';
    const dateText = document.createElement('span');
    const martyrdomPretty = formatDate(martyr.martyrdomDate);
    const martyrdomYear = getYear(martyr.martyrdomDate);
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

    // Organization line (optional)
    if (martyr.organization) {
        const orgLine = document.createElement('p');
        orgLine.className = 'martyr-meta martyr-organization';
        const orgIcon = document.createElement('span');
        orgIcon.className = 'martyr-meta-icon';
        orgIcon.textContent = '🏳️';
        const orgText = document.createElement('span');
        orgText.textContent = martyr.organization;
        orgLine.appendChild(orgIcon);
        orgLine.appendChild(orgText);
        infoDiv.appendChild(orgLine);
    }

    // View details button
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn-small martyr-card-button';
    viewBtn.type = 'button';
    viewBtn.textContent = 'View Details';
    // Open the original gallery-specific martyr modal
    viewBtn.onclick = function () {
        showMartyrModal(martyr);
    };
    infoDiv.appendChild(viewBtn);

    inner.appendChild(photoWrapper);
    inner.appendChild(infoDiv);
    card.appendChild(inner);

    return card;
}

// Initialize search/filter functionality
function initSearchFilter() {
    const searchInput = document.getElementById('searchMartyrs');
    const clearSearch = document.getElementById('clearSearch');
    
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            currentFilters.general = e.target.value.toLowerCase().trim();
            applyFilters();
            toggleClearButton();
        });
    }
    
    if (clearSearch) {
        clearSearch.addEventListener('click', function() {
            searchInput.value = '';
            currentFilters.general = '';
            applyFilters();
            toggleClearButton();
        });
    }
}

// Initialize advanced search functionality
function initAdvancedSearch() {
    const toggleBtn = document.getElementById('toggleAdvancedSearch');
    const panel = document.getElementById('advancedSearchPanel');
    const applyBtn = document.getElementById('applyAdvancedSearch');
    const clearBtn = document.getElementById('clearAdvancedSearch');
    const clearAllBtn = document.getElementById('clearAllFilters');
    
    // Toggle advanced search panel
    if (toggleBtn && panel) {
        toggleBtn.addEventListener('click', function() {
            const isVisible = panel.style.display !== 'none';
            panel.style.display = isVisible ? 'none' : 'block';
            toggleBtn.textContent = isVisible ? 'Advanced Search' : 'Hide Advanced';
        });
    }
    
    // Advanced search inputs
    const nameInput = document.getElementById('searchByName');
    const locationInput = document.getElementById('searchByLocation');
    const organizationInput = document.getElementById('searchByOrganization');
    const yearInput = document.getElementById('searchByYear');
    
    // Real-time filtering for advanced search
    [nameInput, locationInput, organizationInput, yearInput].forEach(input => {
        if (input) {
            input.addEventListener('input', function() {
                updateAdvancedFilters();
                applyFilters();
            });
        }
    });
    
    // Apply filters button
    if (applyBtn) {
        applyBtn.addEventListener('click', function() {
            updateAdvancedFilters();
            applyFilters();
        });
    }
    
    // Clear advanced search
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            clearAdvancedSearch();
        });
    }
    
    // Clear all filters
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', function() {
            clearAllFilters();
        });
    }
}

// Update advanced search filters from inputs
function updateAdvancedFilters() {
    currentFilters.name = (document.getElementById('searchByName')?.value || '').toLowerCase().trim();
    currentFilters.father = (document.getElementById('searchByFather')?.value || '').toLowerCase().trim();
    currentFilters.location = (document.getElementById('searchByLocation')?.value || '').toLowerCase().trim();
    currentFilters.organization = (document.getElementById('searchByOrganization')?.value || '').toLowerCase().trim();
    currentFilters.year = (document.getElementById('searchByYear')?.value || '').toString().trim();
}

// Apply all filters to the gallery
function applyFilters() {
    if (!allMartyrs || !allMartyrs.length) {
        console.warn('⚠️ applyFilters called but no martyrs loaded:', { allMartyrsLength: allMartyrs ? allMartyrs.length : 'undefined' });
        return;
    }
    
    // Check if any filters are active
    const hasActiveFilters = Object.values(currentFilters).some(filter => filter !== '');
    
    // If no filters are active, show all martyrs
    if (!hasActiveFilters) {
        console.log(`📊 Showing all ${allMartyrs.length} martyrs (no filters active)`);
        renderGallery(allMartyrs);
        
        // Always show the total count when no filters are active
        updateSearchResultsInfo(allMartyrs.length);
        const resultsInfo = document.getElementById('searchResultsInfo');
        if (resultsInfo && allMartyrs.length > 0) {
            resultsInfo.style.display = 'flex';
        } else if (resultsInfo) {
            resultsInfo.style.display = 'none';
        }
        
        hideNoResultsMessage();
        return;
    }
    
    // Apply filters
    const filteredMartyrs = allMartyrs.filter(martyr => {
        // General search (searches across all fields)
        if (currentFilters.general) {
            const searchText = `${martyr.fullName} ${martyr.birthPlace || ''} ${martyr.martyrdomPlace || ''} ${martyr.organization || ''} ${martyr.fatherName || ''}`.toLowerCase();
            if (!searchText.includes(currentFilters.general)) {
                return false;
            }
        }
        
        // Name filter
        if (currentFilters.name && !martyr.fullName.toLowerCase().includes(currentFilters.name)) {
            return false;
        }

        // Father name filter
        if (currentFilters.father) {
            const father = (martyr.fatherName || '').toLowerCase();
            if (!father.includes(currentFilters.father)) {
                return false;
            }
        }
        
        // Location filter (searches both birth and martyrdom places)
        if (currentFilters.location) {
            const birthPlace = (martyr.birthPlace || '').toLowerCase();
            const martyrdomPlace = (martyr.martyrdomPlace || '').toLowerCase();
            if (!birthPlace.includes(currentFilters.location) && !martyrdomPlace.includes(currentFilters.location)) {
                return false;
            }
        }
        
        // Organization filter
        if (currentFilters.organization) {
            const organization = (martyr.organization || '').toLowerCase();
            if (!organization.includes(currentFilters.organization)) {
                return false;
            }
        }
        
        // Year filter
        if (currentFilters.year) {
            const martyrdomYear = martyr.martyrdomDate ? getYear(martyr.martyrdomDate) : '';
            if (martyrdomYear !== currentFilters.year) {
                return false;
            }
        }
        
        return true;
    });
    
    renderGallery(filteredMartyrs);
    
    // Show/hide results info
    const resultsInfo = document.getElementById('searchResultsInfo');
    if (resultsInfo) {
        resultsInfo.style.display = hasActiveFilters ? 'flex' : 'none';
    }
    
    // Show no results message if needed
    if (filteredMartyrs.length === 0 && allMartyrs.length > 0 && hasActiveFilters) {
        showNoResultsMessage();
    } else {
        hideNoResultsMessage();
    }
}

// Toggle clear button visibility
function toggleClearButton() {
    const clearBtn = document.getElementById('clearSearch');
    const searchInput = document.getElementById('searchMartyrs');
    if (clearBtn && searchInput) {
        clearBtn.style.display = searchInput.value.trim() ? 'flex' : 'none';
    }
}

// Clear advanced search filters
function clearAdvancedSearch() {
    const nameInput = document.getElementById('searchByName');
    const locationInput = document.getElementById('searchByLocation');
    const organizationInput = document.getElementById('searchByOrganization');
    const yearInput = document.getElementById('searchByYear');
    
    if (nameInput) nameInput.value = '';
    if (locationInput) locationInput.value = '';
    if (organizationInput) organizationInput.value = '';
    if (yearInput) yearInput.value = '';
    
    currentFilters.name = '';
    currentFilters.location = '';
    currentFilters.organization = '';
    currentFilters.year = '';
    
    applyFilters();
}

// Clear all filters
function clearAllFilters() {
    // Clear general search
    const searchInput = document.getElementById('searchMartyrs');
    if (searchInput) searchInput.value = '';
    
    // Clear advanced search
    clearAdvancedSearch();
    
    // Reset all filters
    currentFilters = {
        general: '',
        name: '',
        father: '',
        location: '',
        organization: '',
        year: ''
    };
    
    applyFilters();
    toggleClearButton();
}

// Update search results info
function updateSearchResultsInfo(count) {
    const resultsCount = document.getElementById('resultsCount');
    const resultsLabel = document.getElementById('resultsLabel');
    
    if (resultsCount) resultsCount.textContent = count;
    if (resultsLabel) resultsLabel.textContent = count === 1 ? 'martyr found' : 'martyrs found';
}

// Show no results message
function showNoResultsMessage() {
    let noResultsMsg = document.getElementById('noResultsMessage');
    
    if (!noResultsMsg) {
        noResultsMsg = document.createElement('div');
        noResultsMsg.id = 'noResultsMessage';
        noResultsMsg.className = 'no-results-message';
        noResultsMsg.style.textAlign = 'center';
        noResultsMsg.style.padding = '3rem';
        noResultsMsg.style.color = '#666';
        noResultsMsg.style.background = '#f8f9fa';
        noResultsMsg.style.borderRadius = '8px';
        noResultsMsg.style.border = '1px solid #dee2e6';
        noResultsMsg.style.marginTop = '2rem';
        
        const hasActiveFilters = Object.values(currentFilters).some(filter => filter !== '');
        const activeFiltersText = getActiveFiltersText();
        const suggestionsHtml = `
            <div style="margin-top: 1rem; font-size: 0.9rem; color: #555; text-align: left; max-width: 480px; margin-left: auto; margin-right: auto;">
                <p>Suggestions:</p>
                <ul style="list-style: disc; margin: 0.5rem 0 0 1.5rem; padding: 0;">
                    <li>Try only the first name (for example, \"Abdul\" instead of the full name).</li>
                    <li>Try searching by city instead of a smaller village name.</li>
                </ul>
            </div>
        `;
        
        noResultsMsg.innerHTML = `
            <h3>No martyrs found</h3>
            ${hasActiveFilters ? `<p>No martyrs match your search criteria:</p><p style=\"font-style: italic; color: #007bff;\">${activeFiltersText}</p>` : '<p>Try searching with different keywords</p>'}
            ${suggestionsHtml}
            <button onclick=\"clearAllFilters()\" class=\"btn-small\" style=\"margin-top: 1.25rem;\">Clear All Filters</button>
        `;
        
        const galleryGrid = document.getElementById('galleryGrid');
        galleryGrid.parentNode.insertBefore(noResultsMsg, galleryGrid.nextSibling);
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

// Get active filters text for display
function getActiveFiltersText() {
    const activeFilters = [];
    
    if (currentFilters.general) activeFilters.push(`General: \"${currentFilters.general}\"`);
    if (currentFilters.name) activeFilters.push(`Name: \"${currentFilters.name}\"`);
    if (currentFilters.father) activeFilters.push(`Father: \"${currentFilters.father}\"`);
    if (currentFilters.location) activeFilters.push(`Location: \"${currentFilters.location}\"`);
    if (currentFilters.organization) activeFilters.push(`Organization: \"${currentFilters.organization}\"`);
    if (currentFilters.year) activeFilters.push(`Year: ${currentFilters.year}`);
    
    return activeFilters.join(', ');
}

// (old modal implementation removed – replaced by print‑enabled modal above)
