// BULLETPROOF Gallery.js - Clean, Simple, and Reliable
console.log('🎨 Gallery.js loading - BULLETPROOF version');

// Global state
let allMartyrs = [];
let currentFilters = {
    general: '',
    name: '',
    location: '',
    organization: '',
    year: ''
};

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
    
    // Show professional loading state immediately
    showLoadingState();
    
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
            renderGallery();
            
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
    console.log('🎯 Starting gallery load process...');
    
    const galleryGrid = document.getElementById('galleryGrid');
    if (!galleryGrid) {
        console.error('❌ Gallery grid element not found!');
        return;
    }
    
    try {
        // Method 1: Pre-loaded Firebase data
        if (window.martyrsDataFromFirebase && window.martyrsDataFromFirebase.length > 0) {
            console.log(`✨ Using pre-loaded data: ${window.martyrsDataFromFirebase.length} martyrs`);
            allMartyrs = window.martyrsDataFromFirebase;
            renderGallery();
            return;
        }
        
        // Method 2: Direct Firebase call
        if (window.firebaseDB && typeof window.firebaseDB.getApprovedMartyrs === 'function') {
            console.log('🔥 Trying direct Firebase call...');
            const result = await window.firebaseDB.getApprovedMartyrs();
            
            if (result && result.success && result.data && result.data.length > 0) {
                console.log(`✅ Firebase success: ${result.data.length} martyrs`);
                allMartyrs = result.data;
                
                // Cache for backup
                localStorage.setItem('martyrsData', JSON.stringify(allMartyrs));
                
                renderGallery();
                hideOfflineWarning();
                return;
            } else {
                console.warn('⚠️ Firebase returned no data:', result?.error);
            }
        }
        
        // Method 3: LocalStorage fallback
        console.log('💾 Trying localStorage fallback...');
        const savedData = localStorage.getItem('martyrsData');
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            if (Array.isArray(parsedData) && parsedData.length > 0) {
                allMartyrs = parsedData.filter(m => !m.status || m.status === 'approved');
                console.log(`💾 LocalStorage success: ${allMartyrs.length} martyrs`);
                renderGallery();
                showOfflineWarning();
                return;
            }
        }
        
        // Method 4: Demo data for testing
        console.log('🎭 Loading demo data for testing...');
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
        renderGallery();
        
    } catch (error) {
        console.error('❌ Gallery loading failed:', error);
        showErrorMessage();
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
    
    // Apply current filters
    applyFilters();
    
    // Update UI
    updateSearchResultsInfo(allMartyrs.length);
    const resultsInfo = document.getElementById('searchResultsInfo');
    if (resultsInfo && allMartyrs.length > 0) {
        resultsInfo.style.display = 'flex';
    }
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
    
    if (resultsCount) resultsCount.textContent = count;
    if (resultsLabel) resultsLabel.textContent = count === 1 ? 'martyr found' : 'martyrs found';
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

function showLoadingState() {
    const galleryGrid = document.getElementById('galleryGrid');
    if (galleryGrid) {
        galleryGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: #f8f9fa; border-radius: 8px;">
                <div style="display: inline-block; width: 40px; height: 40px; border: 3px solid #2c5530; border-radius: 50%; border-top-color: transparent; animation: spin 1s ease-in-out infinite; margin-bottom: 1rem;"></div>
                <h3 style="color: #2c5530;">Loading Memorial Gallery</h3>
                <p>Connecting to our database to honor our heroes...</p>
                <style>
                    @keyframes spin {
                        to { transform: rotate(360deg); }
                    }
                </style>
            </div>
        `;
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
function getYear(dateValue) {
    if (!dateValue) return '';
    
    try {
        let date;
        
        // Handle Firestore Timestamp
        if (dateValue && typeof dateValue.toDate === 'function') {
            date = dateValue.toDate();
        } else if (dateValue instanceof Date) {
            date = dateValue;
        } else if (typeof dateValue === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
                date = new Date(dateValue + 'T00:00:00');
            } else {
                date = new Date(dateValue);
            }
        } else {
            date = new Date(dateValue);
        }
        
        return !date || isNaN(date.getTime()) ? '' : date.getFullYear().toString();
    } catch (error) {
        console.warn('Error getting year from:', dateValue, error);
        return '';
    }
}

function formatDate(dateValue) {
    if (!dateValue) return null;
    
    try {
        let date;
        
        // Handle Firestore Timestamp
        if (dateValue && typeof dateValue.toDate === 'function') {
            date = dateValue.toDate();
        } else if (dateValue instanceof Date) {
            date = dateValue;
        } else if (typeof dateValue === 'string') {
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
                date = new Date(dateValue + 'T00:00:00');
            } else {
                date = new Date(dateValue);
            }
        } else {
            date = new Date(dateValue);
        }
        
        if (!date || isNaN(date.getTime())) {
            return null;
        }
        
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

console.log('✅ Gallery.js loaded successfully');
console.log('🔧 Debug functions: checkGalleryData(), loadGalleryNow(), retryFirebaseConnection()');

// Show martyr details modal (add this missing function)
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
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.8); z-index: 2000; display: flex;
        align-items: center; justify-content: center; padding: 20px;
        overflow-y: auto;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: white; max-width: 800px; max-height: 90vh; overflow-y: auto;
        border-radius: 8px; position: relative; width: 100%;
    `;
    
    content.innerHTML = `
        <button onclick="this.closest('#martyrModal').remove(); document.body.style.overflow = 'auto';" 
                style="position: absolute; top: 15px; right: 20px; background: none; border: none; font-size: 24px; cursor: pointer; color: #666; z-index: 1;">&times;</button>
        
        <div style="padding: 2rem;">
            <div style="display: flex; gap: 2rem; flex-wrap: wrap; align-items: flex-start;">
                <div style="flex: 0 0 250px;">
                    ${martyr.photo ? 
                        `<img src="${martyr.photo}" alt="${martyr.fullName}" style="width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);">` :
                        '<div style="width: 100%; height: 300px; background: linear-gradient(135deg, #f0f0f0, #d0d0d0); border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 64px; color: #999;">📸</div>'
                    }
                </div>
                
                <div style="flex: 1; min-width: 300px;">
                    <h2 style="margin-top: 0; color: #2c5530; border-bottom: 2px solid #d4af37; padding-bottom: 0.5rem;">${martyr.fullName}</h2>
                    
                    <div style="display: grid; gap: 0.75rem; margin: 1.5rem 0;">
                        ${martyr.fatherName ? `<p><strong>Father:</strong> ${martyr.fatherName}</p>` : ''}
                        <p><strong>Birth:</strong> ${formatDate(martyr.birthDate) || 'Unknown'}</p>
                        <p><strong>Birth Place:</strong> ${martyr.birthPlace || 'Unknown'}</p>
                        <p><strong>Martyrdom:</strong> ${formatDate(martyr.martyrdomDate) || 'Unknown'}</p>
                        <p><strong>Martyrdom Place:</strong> ${martyr.martyrdomPlace || 'Unknown'}</p>
                        ${martyr.organization ? `<p><strong>Organization:</strong> ${martyr.organization}</p>` : ''}
                        ${martyr.rank ? `<p><strong>Rank:</strong> ${martyr.rank}</p>` : ''}
                    </div>
                    
                    ${martyr.biography ? `
                        <div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #eee;">
                            <h3 style="color: #2c5530;">Biography</h3>
                            <p style="line-height: 1.6; color: #444;">${martyr.biography}</p>
                        </div>
                    ` : ''}
                    
                    ${martyr.familyDetails ? `
                        <div style="margin-top: 1.5rem;">
                            <h3 style="color: #2c5530;">Family Details</h3>
                            <p style="line-height: 1.6; color: #444;">${martyr.familyDetails}</p>
                        </div>
                    ` : ''}
                    
                    <div style="margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #eee; color: #666; font-size: 0.9rem;">
                        <p><strong>Submitted by:</strong> ${martyr.submitterName || 'Unknown'}</p>
                        ${martyr.submitterRelation ? `<p><strong>Relationship:</strong> ${martyr.submitterRelation}</p>` : ''}
                        <p><strong>Submitted on:</strong> ${formatDate(martyr.submittedAt) || 'Unknown'}</p>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
            document.body.style.overflow = 'auto';
        }
    });
    
    // Close on Escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            modal.remove();
            document.body.style.overflow = 'auto';
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

// Create gallery card
function createGalleryCard(martyr) {
    const card = document.createElement('div');
    card.className = 'martyr-card';
    
    // Enhanced search data attributes
    card.dataset.searchText = `${martyr.fullName} ${martyr.birthPlace || ''} ${martyr.martyrdomPlace || ''} ${martyr.organization || ''} ${martyr.fatherName || ''}`.toLowerCase();
    card.dataset.name = martyr.fullName.toLowerCase();
    card.dataset.birthPlace = (martyr.birthPlace || '').toLowerCase();
    card.dataset.martyrdomPlace = (martyr.martyrdomPlace || '').toLowerCase();
    card.dataset.organization = (martyr.organization || '').toLowerCase();
    card.dataset.year = martyr.martyrdomDate ? formatDateYear(martyr.martyrdomDate).toString() : '';
    
    // Image section
    const imageDiv = document.createElement('div');
    imageDiv.className = 'martyr-image';
    
    if (martyr.photo) {
        const img = document.createElement('img');
        img.src = martyr.photo;
        img.alt = martyr.fullName;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        imageDiv.appendChild(img);
    } else {
        imageDiv.style.background = 'linear-gradient(135deg, #ddd, #aaa)';
    }
    
    // Info section
    const infoDiv = document.createElement('div');
    infoDiv.className = 'martyr-info';
    
    const name = document.createElement('h3');
    name.textContent = martyr.fullName;
    
    const dates = document.createElement('p');
    const birthYear = martyr.birthDate ? formatDateYear(martyr.birthDate) : '?';
    const martyrdomYear = formatDateYear(martyr.martyrdomDate);
    dates.textContent = `${birthYear} - ${martyrdomYear}`;
    
    const place = document.createElement('p');
    place.textContent = martyr.martyrdomPlace || 'Unknown location';
    
    if (martyr.organization) {
        const org = document.createElement('p');
        org.style.fontSize = '0.9rem';
        org.style.color = '#666';
        org.textContent = martyr.organization;
        infoDiv.appendChild(name);
        infoDiv.appendChild(dates);
        infoDiv.appendChild(place);
        infoDiv.appendChild(org);
    } else {
        infoDiv.appendChild(name);
        infoDiv.appendChild(dates);
        infoDiv.appendChild(place);
    }
    
    // View details button
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn-small';
    viewBtn.textContent = 'View Details';
    viewBtn.style.marginTop = '1rem';
    viewBtn.onclick = function() {
        showMartyrModal(martyr);
    };
    
    infoDiv.appendChild(viewBtn);
    
    card.appendChild(imageDiv);
    card.appendChild(infoDiv);
    
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
            const martyrdomYear = martyr.martyrdomDate ? formatDateYear(martyr.martyrdomDate).toString() : '';
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
        
        noResultsMsg.innerHTML = `
            <h3>No martyrs found</h3>
            ${hasActiveFilters ? `<p>No martyrs match your search criteria:</p><p style="font-style: italic; color: #007bff;">${activeFiltersText}</p>` : '<p>Try searching with different keywords</p>'}
            <button onclick="clearAllFilters()" class="btn-small" style="margin-top: 1rem;">Clear All Filters</button>
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
    
    if (currentFilters.general) activeFilters.push(`General: "${currentFilters.general}"`);
    if (currentFilters.name) activeFilters.push(`Name: "${currentFilters.name}"`);
    if (currentFilters.location) activeFilters.push(`Location: "${currentFilters.location}"`);
    if (currentFilters.organization) activeFilters.push(`Organization: "${currentFilters.organization}"`);
    if (currentFilters.year) activeFilters.push(`Year: ${currentFilters.year}`);
    
    return activeFilters.join(', ');
}

// Show martyr details in modal
function showMartyrModal(martyr) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('martyrModal');
    
    if (!modal) {
        modal = createModal();
        document.body.appendChild(modal);
    }
    
    // Populate modal with martyr details
    const modalContent = modal.querySelector('.modal-body');
    
    modalContent.innerHTML = `
        <div style="display: flex; gap: 2rem; flex-wrap: wrap;">
            <div style="flex: 0 0 300px;">
                ${martyr.photo ? 
                    `<img src="${martyr.photo}" alt="${martyr.fullName}" style="width: 100%; border-radius: 8px;">` :
                    '<div style="width: 100%; height: 400px; background: linear-gradient(135deg, #ddd, #aaa); border-radius: 8px;"></div>'
                }
            </div>
            <div style="flex: 1; min-width: 300px;">
                <h2>${martyr.fullName}</h2>
                ${martyr.fatherName ? `<p><strong>Father:</strong> ${martyr.fatherName}</p>` : ''}
                <p><strong>Birth:</strong> ${formatDate(martyr.birthDate) || 'Unknown'}</p>
                <p><strong>Birth Place:</strong> ${martyr.birthPlace || 'Unknown'}</p>
                <p><strong>Martyrdom:</strong> ${formatDate(martyr.martyrdomDate)}</p>
                <p><strong>Martyrdom Place:</strong> ${martyr.martyrdomPlace}</p>
                ${martyr.organization ? `<p><strong>Organization:</strong> ${martyr.organization}</p>` : ''}
                ${martyr.rank ? `<p><strong>Rank:</strong> ${martyr.rank}</p>` : ''}
                ${martyr.biography ? `
                    <div style="margin-top: 1.5rem;">
                        <h3>Biography</h3>
                        <p>${martyr.biography}</p>
                    </div>
                ` : ''}
                ${martyr.familyDetails ? `
                    <div style="margin-top: 1.5rem;">
                        <h3>Family Details</h3>
                        <p>${martyr.familyDetails}</p>
                    </div>
                ` : ''}
                <div style="margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #ddd; color: #666; font-size: 0.9rem;">
                    <p><strong>Submitted by:</strong> ${martyr.submitterName}</p>
                    ${martyr.submitterRelation ? `<p><strong>Relationship:</strong> ${martyr.submitterRelation}</p>` : ''}
                    <p><strong>Submitted on:</strong> ${formatDate(martyr.submittedAt)}</p>
                </div>
            </div>
        </div>
    `;
    
    // Show modal
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

// Create modal element
function createModal() {
    const modal = document.createElement('div');
    modal.id = 'martyrModal';
    modal.className = 'modal';
    modal.style.cssText = `
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        z-index: 2000;
        overflow-y: auto;
    `;
    
    modal.innerHTML = `
        <div class="modal-content" style="
            background: white;
            margin: 2rem auto;
            padding: 0;
            max-width: 900px;
            border-radius: 8px;
            position: relative;
        ">
            <div class="modal-header" style="
                padding: 1.5rem;
                border-bottom: 1px solid #ddd;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <h2 style="margin: 0;">Martyr Details</h2>
                <button onclick="closeModal()" style="
                    background: none;
                    border: none;
                    font-size: 2rem;
                    cursor: pointer;
                    color: #666;
                ">&times;</button>
            </div>
            <div class="modal-body" style="padding: 2rem;">
                <!-- Content will be inserted here -->
            </div>
        </div>
    `;
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    return modal;
}

// Close modal function
function closeModal() {
    const modal = document.getElementById('martyrModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

// Format date year helper - safely extract year from date string or Firestore Timestamp
function formatDateYear(dateValue) {
    if (!dateValue) return '?';
    
    try {
        let date;
        
        // Handle Firestore Timestamp objects
        if (dateValue && typeof dateValue === 'object' && typeof dateValue.toDate === 'function') {
            date = dateValue.toDate();
            console.log('Converted Firestore Timestamp to Date:', date);
        }
        // If it's already a Date object
        else if (dateValue instanceof Date) {
            date = dateValue;
        }
        // Handle date strings
        else if (typeof dateValue === 'string') {
            if (dateValue.trim() === '') return '?';
            
            // Handle YYYY-MM-DD format (HTML date input)
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) {
                date = new Date(dateValue + 'T00:00:00'); // Add time to avoid timezone issues
            } else {
                date = new Date(dateValue);
            }
        }
        // Try direct conversion for other types
        else {
            console.warn('Unknown date format, trying direct conversion:', dateValue);
            date = new Date(dateValue);
        }
        
        // Check if date is valid
        if (!date || isNaN(date.getTime())) {
            console.warn('Invalid date after processing:', dateValue);
            return '?';
        }
        
        return date.getFullYear();
    } catch (error) {
        console.error('Error parsing date:', dateValue, error);
        return '?';
    }
}

// Format date helper - for full date display (handles Firestore Timestamps)
function formatDate(dateValue) {
    if (!dateValue) return null;
    
    try {
        let date;
        
        // Handle Firestore Timestamp objects
        if (dateValue && typeof dateValue === 'object' && typeof dateValue.toDate === 'function') {
            date = dateValue.toDate();
            console.log('Converted Firestore Timestamp to Date for formatting:', date);
        }
        // If it's already a Date object
        else if (dateValue instanceof Date) {
            date = dateValue;
        }
        // Handle date strings
        else if (typeof dateValue === 'string') {
            if (dateValue.trim() === '') return null;
            
            // Handle YYYY-MM-DD format (HTML date input)
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) {
                date = new Date(dateValue + 'T00:00:00'); // Add time to avoid timezone issues
            } else {
                date = new Date(dateValue);
            }
        }
        // Try direct conversion for other types
        else {
            console.warn('Unknown date format in formatDate, trying direct conversion:', dateValue);
            date = new Date(dateValue);
        }
        
        // Check if date is valid
        if (!date || isNaN(date.getTime())) {
            console.warn('Invalid date format after processing:', dateValue);
            return 'Invalid Date';
        }
        
        const options = { year: 'numeric', month: 'long', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    } catch (error) {
        console.error('Error formatting date:', dateValue, error);
        return 'Invalid Date';
    }
}
