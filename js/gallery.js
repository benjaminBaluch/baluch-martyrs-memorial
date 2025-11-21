// Gallery Page JavaScript
// Production-ready without ES6 module imports

let allMartyrs = [];
let currentFilters = {
    general: '',
    name: '',
    location: '',
    organization: '',
    year: ''
};

// Expose force load function globally
window.loadGalleryNow = function() {
    console.log('🚑 FORCE LOADING GALLERY NOW!');
    loadGallery();
};

document.addEventListener('DOMContentLoaded', function() {
    console.log('🎨 Gallery DOM loaded, initializing components...');
    initSearchFilter();
    initAdvancedSearch();
    initializeInterface();
    addDebugButton();
    
    // Multiple attempts to load gallery with Firebase
    console.log('🎨 Gallery initialization starting...');
    
    // Try immediate load
    if (window.firebaseDB) {
        console.log('🔥 Firebase already available, loading gallery...');
        loadGallery();
    } else {
        console.log('⏳ Waiting for Firebase to be ready...');
        
        // Listen for Firebase ready event
        window.addEventListener('firebaseReady', () => {
            console.log('🔥 Firebase ready event received, loading gallery...');
            loadGallery();
        });
        
        // Progressive timeout attempts
        const attempts = [500, 1000, 2000, 3000, 5000];
        attempts.forEach((delay, index) => {
            setTimeout(() => {
                if (window.firebaseDB && allMartyrs.length === 0) {
                    console.log(`🔥 Firebase available after ${delay}ms, loading gallery...`);
                    loadGallery();
                } else if (index === attempts.length - 1) {
                    // Final attempt - try anyway with localStorage fallback
                    console.warn('⚠️ Firebase still not available after 5s, trying localStorage fallback');
                    if (allMartyrs.length === 0) {
                        loadGallery();
                    }
                }
            }, delay);
        });
    }
    
    // Emergency loader - try loading after page is fully ready
    setTimeout(() => {
        if (allMartyrs.length === 0) {
            console.log('🆘 EMERGENCY LOADER: Gallery still empty after 10 seconds, forcing load...');
            loadGallery();
        }
    }, 10000);
    
    // Final safety net - always try to load something
    window.addEventListener('load', () => {
        setTimeout(() => {
            if (allMartyrs.length === 0) {
                console.log('🆘 FINAL SAFETY NET: Attempting emergency gallery load...');
                loadEmergencyGallery();
            }
        }, 2000);
    });
});

// Emergency gallery loader
function loadEmergencyGallery() {
    console.log('🆘 Loading emergency gallery from localStorage...');
    
    try {
        const savedData = localStorage.getItem('martyrsData');
        if (savedData) {
            const data = JSON.parse(savedData);
            console.log(`🆘 Found ${data.length} martyrs in localStorage`);
            allMartyrs = data.filter(m => !m.status || m.status === 'approved');
            if (allMartyrs.length > 0) {
                renderGallery(allMartyrs);
                applyFilters();
                console.log(`🆘 Emergency load successful: ${allMartyrs.length} martyrs`);
                return;
            }
        }
        
        // If no localStorage data, show helpful message
        console.log('🆘 No data available, showing connection message');
        showConnectionIssueMessage();
        
    } catch (error) {
        console.error('🆘 Emergency loader failed:', error);
        showConnectionIssueMessage();
    }
}

// Show connection issue message
function showConnectionIssueMessage() {
    const galleryGrid = document.getElementById('galleryGrid');
    if (galleryGrid) {
        galleryGrid.innerHTML = `
            <div class="martyr-card placeholder" style="grid-column: 1/-1; text-align: center; padding: 3rem; background: #fff3cd; border: 1px solid #ffeaa7;">
                <div class="martyr-info">
                    <h3>🔄 Loading Martyrs...</h3>
                    <p>Please wait while we connect to the memorial database.</p>
                    <button onclick="location.reload()" class="btn-small" style="margin-top: 1rem;">♾️ Refresh Page</button>
                    <br><br>
                    <small style="color: #666;">If this persists, the database may be temporarily unavailable.</small>
                </div>
            </div>
        `;
    }
});

// Initialize interface elements
function initializeInterface() {
    // Hide clear button initially
    toggleClearButton();
    
    // Hide results info initially
    const resultsInfo = document.getElementById('searchResultsInfo');
    if (resultsInfo) {
        resultsInfo.style.display = 'none';
    }
}

// Load all martyrs in gallery
async function loadGallery() {
    const galleryGrid = document.getElementById('galleryGrid');
    
    if (galleryGrid) {
        try {
            console.log('🌍 Loading martyrs from Firebase (global database)...');
            
            console.log('🔥 Starting Firebase connection process...');
            
            // Check if Firebase is available
            if (!window.firebaseDB) {
                console.warn('⚠️ Firebase not available globally, will use localStorage');
                throw new Error('Firebase not available globally');
            }
            
            console.log('🔍 Testing Firebase connection...');
            console.log('🔧 Firebase methods available:', Object.keys(window.firebaseDB));
            
            // Direct Firebase call with timeout protection
            const result = await Promise.race([
                window.firebaseDB.getApprovedMartyrs(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Firebase timeout after 10s')), 10000))
            ]);
            
            console.log('📋 Raw Firebase result:', result);
            
            if (result && result.success) {
                console.log('✅ Firebase connection successful!');
                allMartyrs = result.data || [];
                console.log(`📊 Firebase returned ${allMartyrs.length} approved martyrs`);
                
                if (allMartyrs.length > 0) {
                    console.log('🗣️ Sample martyr data:', allMartyrs[0]);
                } else {
                    console.warn('⚠️ Firebase returned empty data array');
                }
                
                // Cache martyrs for faster loading
                localStorage.setItem('martyrsData', JSON.stringify(allMartyrs));
                console.log('💾 Cached martyrs to localStorage');
                
                // Hide any previous offline warnings
                hideOfflineWarning();
            } else {
                const error = result ? result.error : 'Unknown Firebase error';
                console.error('❌ Firebase query failed:', error);
                throw new Error('Firebase query failed: ' + error);
            }
            
            
            // Render the gallery
            if (allMartyrs.length > 0) {
                console.log(`🔢 Total martyrs loaded from Firebase: ${allMartyrs.length}`);
                renderGallery(allMartyrs);
                // Apply current filters (will show all if no filters active)
                applyFilters();
                console.log(`🖼️ Successfully rendered ${allMartyrs.length} martyrs in gallery`);
                
                // Update the search results to show correct total
                updateSearchResultsInfo(allMartyrs.length);
                const resultsInfo = document.getElementById('searchResultsInfo');
                if (resultsInfo) {
                    resultsInfo.style.display = 'flex';
                }
            } else {
                showEmptyGalleryMessage();
                console.log('📭 No approved martyrs found in Firebase');
            }
            
        } catch (error) {
            console.error('❌ Firebase failed, trying localStorage backup:', error);
            
            // Try enhanced cache manager first, then localStorage as backup
            let allMartyrsData = null;
            
            if (window.cacheManager) {
                allMartyrsData = window.cacheManager.getCache('martyrsData');
                if (allMartyrsData) {
                    console.log('🔄 Using cached martyrs from cache manager');
                }
            }
            
            // Fallback to old localStorage method if cache manager fails
            if (!allMartyrsData) {
                const savedMartyrs = localStorage.getItem('martyrsData');
                if (savedMartyrs) {
                    allMartyrsData = JSON.parse(savedMartyrs);
                    console.log('🔄 Using martyrs from localStorage backup');
                }
            }
            
            if (allMartyrsData) {
                // Filter for approved martyrs (cache manager already stores filtered data, localStorage might not)
                if (Array.isArray(allMartyrsData) && allMartyrsData.length > 0 && allMartyrsData[0].status) {
                    // Data has status field, filter it
                    allMartyrs = allMartyrsData.filter(m => !m.status || m.status === 'approved');
                } else {
                    // Data is already filtered or doesn't have status field
                    allMartyrs = allMartyrsData;
                }
                console.log(`🔢 Total martyrs from backup cache: ${allMartyrs.length}`);
                renderGallery(allMartyrs);
                // Apply current filters (will show all if no filters active)
                applyFilters();
                console.log(`⚠️  Using localStorage backup: ${allMartyrs.length} martyrs`);
                
                // Update the search results to show correct total
                updateSearchResultsInfo(allMartyrs.length);
                const resultsInfo = document.getElementById('searchResultsInfo');
                if (resultsInfo) {
                    resultsInfo.style.display = 'flex';
                }
                
                // Show warning that data might be outdated
                showOfflineWarning();
            } else {
                showEmptyGalleryMessage();
                console.log('❌ No data available anywhere');
            }
        }
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
        console.log('=== FIREBASE DEBUG START ===');
        
        // Test Firebase connection directly
        if (window.firebaseDB) {
            try {
                console.log('🔥 Testing Firebase connection...');
                const result = await window.firebaseDB.getApprovedMartyrs();
                console.log(`✅ Firebase test: ${result.success ? 'SUCCESS' : 'FAILED'}`);
                if (result.success) {
                    console.log(`📊 Found ${result.data ? result.data.length : 0} approved martyrs`);
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
