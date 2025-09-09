// Gallery Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    loadGallery();
    initSearchFilter();
});

// Load all martyrs in gallery
function loadGallery() {
    const galleryGrid = document.getElementById('galleryGrid');
    
    if (galleryGrid) {
        // Get approved martyrs from localStorage
        const savedMartyrs = localStorage.getItem('martyrsData');
        
        if (savedMartyrs) {
            const allMartyrs = JSON.parse(savedMartyrs);
            const martyrsData = allMartyrs.filter(m => !m.status || m.status === 'approved');
            
            // Clear placeholder if data exists
            if (martyrsData.length > 0) {
                galleryGrid.innerHTML = '';
                
                // Render all approved martyrs
                martyrsData.forEach(martyr => {
                    const card = createGalleryCard(martyr);
                    galleryGrid.appendChild(card);
                });
            }
        }
    }
}

// Create gallery card
function createGalleryCard(martyr) {
    const card = document.createElement('div');
    card.className = 'martyr-card';
    card.dataset.searchText = `${martyr.fullName} ${martyr.martyrdomPlace} ${martyr.organization || ''}`.toLowerCase();
    
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
    
    if (searchInput) {
        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase();
            filterGallery(searchTerm);
        });
    }
}

// Filter gallery based on search term
function filterGallery(searchTerm) {
    const cards = document.querySelectorAll('#galleryGrid .martyr-card');
    let visibleCount = 0;
    
    cards.forEach(card => {
        const searchText = card.dataset.searchText || '';
        
        if (searchText.includes(searchTerm)) {
            card.style.display = 'block';
            visibleCount++;
        } else {
            card.style.display = 'none';
        }
    });
    
    // Show message if no results
    if (visibleCount === 0 && cards.length > 0) {
        showNoResultsMessage();
    } else {
        hideNoResultsMessage();
    }
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
        noResultsMsg.innerHTML = `
            <h3>No martyrs found</h3>
            <p>Try searching with different keywords</p>
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
