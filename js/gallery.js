// Gallery Page JavaScript

let allMartyrs = [];
let currentFilters = {
    general: '',
    name: '',
    location: '',
    organization: '',
    year: ''
};

document.addEventListener('DOMContentLoaded', function() {
    initSearchFilter();
    initAdvancedSearch();
    initializeInterface();
    
    // Load gallery after Firebase is ready
    if (window.firebaseDB) {
        console.log('🔥 Firebase already available, loading gallery...');
        loadGallery();
    } else {
        console.log('⏳ Waiting for Firebase to be ready...');
        // Wait for Firebase to be ready
        window.addEventListener('firebaseReady', () => {
            console.log('🔥 Firebase ready event received, loading gallery...');
            loadGallery();
        });
        
        // Also try loading after delays in case Firebase is still loading
        setTimeout(() => {
            if (window.firebaseDB) {
                console.log('🔥 Firebase available after 1s timeout, loading gallery...');
                loadGallery();
            }
        }, 1000);
        
        setTimeout(() => {
            if (window.firebaseDB) {
                console.log('🔥 Firebase available after 3s timeout, loading gallery...');
                loadGallery();
            } else {
                console.warn('⚠️ Firebase still not available after 3s, using localStorage fallback');
                loadGallery(); // Try anyway, will fall back to localStorage
            }
        }, 3000);
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
            
            // Use global Firebase instance
            if (!window.firebaseDB || typeof window.firebaseDB.getApprovedMartyrs !== 'function') {
                console.warn('⚠️ Firebase not available, will use localStorage fallback');
                throw new Error('Firebase not available');
            }
            
            console.log('🔥 Firebase instance found, calling getApprovedMartyrs...');
            const result = await window.firebaseDB.getApprovedMartyrs();
            console.log('📊 Firebase query result:', result);
            
            if (result.success) {
                allMartyrs = result.data || [];
                console.log(`✅ Loaded ${allMartyrs.length} martyrs from Firebase (global database)`);
                
                // Cache to localStorage for faster loading next time
                if (allMartyrs.length > 0) {
                    localStorage.setItem('martyrsData', JSON.stringify(allMartyrs));
                    console.log('💾 Cached martyrs to localStorage');
                }
                
                // Hide any previous offline warnings
                hideOfflineWarning();
            } else {
                console.error('❌ Firebase query failed:', result.error);
                throw new Error('Firebase query failed: ' + result.error);
            }
            
            // Render the gallery
            if (allMartyrs.length > 0) {
                renderGallery(allMartyrs);
                console.log(`🖼️ Rendered ${allMartyrs.length} martyrs in gallery`);
            } else {
                showEmptyGalleryMessage();
                console.log('📭 No approved martyrs found in Firebase');
            }
            
        } catch (error) {
            console.error('❌ Firebase failed, trying localStorage backup:', error);
            
            // Only use localStorage as emergency backup
            const savedMartyrs = localStorage.getItem('martyrsData');
            if (savedMartyrs) {
                const allMartyrsData = JSON.parse(savedMartyrs);
                allMartyrs = allMartyrsData.filter(m => !m.status || m.status === 'approved');
                renderGallery(allMartyrs);
                console.log(`⚠️  Using localStorage backup: ${allMartyrs.length} martyrs`);
                
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

// Render martyrs in gallery
function renderGallery(martyrsData) {
    const galleryGrid = document.getElementById('galleryGrid');
    galleryGrid.innerHTML = '';
    
    martyrsData.forEach(martyr => {
        const card = createGalleryCard(martyr);
        galleryGrid.appendChild(card);
    });
    
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
    card.dataset.year = martyr.martyrdomDate ? new Date(martyr.martyrdomDate).getFullYear().toString() : '';
    
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
    const birthYear = martyr.birthDate ? new Date(martyr.birthDate).getFullYear() : '?';
    const martyrdomYear = new Date(martyr.martyrdomDate).getFullYear();
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
    if (!allMartyrs.length) return;
    
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
            const martyrdomYear = martyr.martyrdomDate ? new Date(martyr.martyrdomDate).getFullYear().toString() : '';
            if (martyrdomYear !== currentFilters.year) {
                return false;
            }
        }
        
        return true;
    });
    
    renderGallery(filteredMartyrs);
    
    // Show/hide results info
    const hasActiveFilters = Object.values(currentFilters).some(filter => filter !== '');
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

// Format date helper
function formatDate(dateString) {
    if (!dateString) return null;
    
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}
