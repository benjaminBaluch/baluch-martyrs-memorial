// Admin panel JavaScript for moderating submissions

import { firebaseDB, storageHelper } from './firebase-config.js';

document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin panel loading...');
    
    try {
        loadPendingSubmissions();
        updateStats();
        initializeAdminControls();
        console.log('Admin panel initialized successfully');
    } catch (error) {
        console.error('Error initializing admin panel:', error);
        alert('Error loading admin panel. Please check the console for details.');
    }
});

// Initialize admin control buttons
function initializeAdminControls() {
    // Refresh Data button
    const refreshBtn = document.querySelector('button[onclick="refreshData()"]');
    if (refreshBtn) {
        refreshBtn.removeAttribute('onclick');
        refreshBtn.addEventListener('click', refreshData);
    }
    
    // Export Data button
    const exportBtn = document.querySelector('button[onclick="exportData()"]');
    if (exportBtn) {
        exportBtn.removeAttribute('onclick');
        exportBtn.addEventListener('click', exportData);
    }
    
    // Import Data button
    const importBtn = document.querySelector('button[onclick="importData()"]');
    if (importBtn) {
        importBtn.removeAttribute('onclick');
        importBtn.addEventListener('click', importData);
    }
    
    // Clear All Pending button
    const clearBtn = document.querySelector('button[onclick="clearAllPending()"]');
    if (clearBtn) {
        clearBtn.removeAttribute('onclick');
        clearBtn.addEventListener('click', clearAllPending);
    }
}

// Load and display pending submissions
async function loadPendingSubmissions() {
    const pendingList = document.getElementById('pendingList');
    let pendingData = [];
    
    try {
        // Try to load from Firebase first
        const result = await firebaseDB.getPendingMartyrs();
        
        if (result.success && result.data.length > 0) {
            pendingData = result.data;
            console.log(`Loaded ${pendingData.length} pending submissions from Firebase`);
        } else {
            // Fallback to localStorage
            console.log('Loading pending submissions from localStorage');
            pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
        }
        
    } catch (error) {
        console.error('Error loading pending submissions:', error);
        // Fallback to localStorage on error
        pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
    }

    if (pendingData.length === 0) {
        pendingList.innerHTML = `
            <div class="no-pending">
                <h3>No pending submissions</h3>
                <p>All submissions have been reviewed.</p>
            </div>
        `;
        return;
    }

    pendingList.innerHTML = '';

    pendingData.forEach(martyr => {
        const pendingItem = createPendingItem(martyr);
        pendingList.appendChild(pendingItem);
    });
}

// Create a pending item element
function createPendingItem(martyr) {
    const item = document.createElement('div');
    item.className = 'pending-item';
    item.dataset.martyrId = martyr.id;

    const submittedDate = new Date(martyr.submittedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    item.innerHTML = `
        <div class="pending-header">
            <strong>Submission ID:</strong> ${martyr.id}
            <span style="float: right; color: #666;">Submitted: ${submittedDate}</span>
        </div>
        <div class="pending-content">
            <div class="pending-image">
                ${martyr.photo ? 
                    `<img src="${martyr.photo}" alt="${martyr.fullName}">` :
                    '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">No Photo</div>'
                }
            </div>
            <div class="pending-details">
                <h3>${martyr.fullName}</h3>
                <div class="detail-row">
                    <span class="detail-label">Father's Name:</span> ${martyr.fatherName || 'Not provided'}
                </div>
                <div class="detail-row">
                    <span class="detail-label">Birth:</span> ${formatDate(martyr.birthDate)} in ${martyr.birthPlace || 'Unknown'}
                </div>
                <div class="detail-row">
                    <span class="detail-label">Martyrdom:</span> ${formatDate(martyr.martyrdomDate)} in ${martyr.martyrdomPlace || 'Unknown'}
                </div>
                <div class="detail-row">
                    <span class="detail-label">Organization:</span> ${martyr.organization || 'Not specified'}
                </div>
                <div class="detail-row">
                    <span class="detail-label">Rank:</span> ${martyr.rank || 'Not specified'}
                </div>
                ${martyr.biography ? `
                    <div class="detail-row">
                        <span class="detail-label">Biography:</span>
                        <div class="biography-text">${martyr.biography}</div>
                    </div>
                ` : ''}
                ${martyr.familyDetails ? `
                    <div class="detail-row">
                        <span class="detail-label">Family Details:</span>
                        <div class="family-text">${martyr.familyDetails}</div>
                    </div>
                ` : ''}
                <div class="detail-row">
                    <span class="detail-label">Submitted by:</span> ${martyr.submitterName} (${martyr.submitterEmail})
                </div>
                ${martyr.submitterRelation ? `
                    <div class="detail-row">
                        <span class="detail-label">Relationship:</span> ${martyr.submitterRelation}
                    </div>
                ` : ''}
            </div>
        </div>
        <div class="pending-actions">
            <button data-action="approve" data-martyr-id="${martyr.id}" class="btn btn-approve">
                ✓ Approve & Publish
            </button>
            <button data-action="reject" data-martyr-id="${martyr.id}" class="btn btn-reject">
                ✗ Reject & Delete
            </button>
        </div>
    `;

    // Add event listeners to buttons
    const approveBtn = item.querySelector('.btn-approve');
    const rejectBtn = item.querySelector('.btn-reject');
    
    if (approveBtn) {
        approveBtn.addEventListener('click', () => approveMartyr(martyr.id));
    }
    
    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => rejectMartyr(martyr.id));
    }

    return item;
}

// Approve a martyr submission
async function approveMartyr(martyrId) {
    console.log('approveMartyr called with ID:', martyrId);
    
    if (!confirm('Are you sure you want to approve this submission? It will be published on the website.')) {
        return;
    }

    try {
        // Show loading state
        const approveBtn = document.querySelector(`[data-martyr-id="${martyrId}"] .btn-approve`);
        if (approveBtn) {
            approveBtn.disabled = true;
            approveBtn.innerHTML = '⏳ Approving...';
        }

        // First, get the martyr data from localStorage (our working copy)
        const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
        const martyrIndex = pendingData.findIndex(m => m.id === martyrId);

        if (martyrIndex === -1) {
            alert('Submission not found!');
            return;
        }

        const martyrToApprove = pendingData[martyrIndex];
        martyrToApprove.status = 'approved';
        martyrToApprove.approvedAt = new Date().toISOString();

        // Try to approve in Firebase first
        let firebaseSuccess = false;
        try {
            const result = await firebaseDB.approveMartyr(martyrId, martyrToApprove);
            if (result.success) {
                console.log('Martyr approved in Firebase:', result.id);
                firebaseSuccess = true;
            }
        } catch (firebaseError) {
            console.warn('Firebase approval failed, using localStorage only:', firebaseError);
        }

        // Always update localStorage (as backup and for compatibility)
        // Remove from pending
        pendingData.splice(martyrIndex, 1);
        localStorage.setItem('pendingMartyrs', JSON.stringify(pendingData));

        // Add to approved martyrs
        const approvedData = JSON.parse(localStorage.getItem('martyrsData') || '[]');
        approvedData.push(martyrToApprove);
        localStorage.setItem('martyrsData', JSON.stringify(approvedData));

        // Remove the item from UI
        const pendingItem = document.querySelector(`[data-martyr-id="${martyrId}"]`);
        if (pendingItem) {
            pendingItem.remove();
        }

        // Refresh data
        await loadPendingSubmissions();
        updateStats();

        const successMessage = firebaseSuccess 
            ? 'Submission approved and published successfully to Firebase and local storage!' 
            : 'Submission approved and published to local storage (Firebase sync failed, but martyr is still approved)!';
        
        alert(successMessage);

    } catch (error) {
        console.error('Error approving martyr:', error);
        alert('Error approving submission. Please try again.');
        
        // Reset button state
        const approveBtn = document.querySelector(`[data-martyr-id="${martyrId}"] .btn-approve`);
        if (approveBtn) {
            approveBtn.disabled = false;
            approveBtn.innerHTML = '✓ Approve & Publish';
        }
    }
}

// Reject a martyr submission
async function rejectMartyr(martyrId) {
    console.log('rejectMartyr called with ID:', martyrId);
    
    if (!confirm('Are you sure you want to reject this submission? This action cannot be undone.')) {
        return;
    }

    try {
        // Show loading state
        const rejectBtn = document.querySelector(`[data-martyr-id="${martyrId}"] .btn-reject`);
        if (rejectBtn) {
            rejectBtn.disabled = true;
            rejectBtn.innerHTML = '⏳ Rejecting...';
        }

        // Try to reject in Firebase first
        let firebaseSuccess = false;
        try {
            const result = await firebaseDB.rejectMartyr(martyrId);
            if (result.success) {
                console.log('Martyr rejected in Firebase:', martyrId);
                firebaseSuccess = true;
            }
        } catch (firebaseError) {
            console.warn('Firebase rejection failed, using localStorage only:', firebaseError);
        }

        // Always update localStorage (as backup)
        const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
        const martyrIndex = pendingData.findIndex(m => m.id === martyrId);

        if (martyrIndex !== -1) {
            pendingData.splice(martyrIndex, 1);
            localStorage.setItem('pendingMartyrs', JSON.stringify(pendingData));
        }

        // Remove the item from UI
        const pendingItem = document.querySelector(`[data-martyr-id="${martyrId}"]`);
        if (pendingItem) {
            pendingItem.remove();
        }

        // Refresh data
        await loadPendingSubmissions();
        updateStats();

        const successMessage = firebaseSuccess 
            ? 'Submission rejected and deleted from Firebase and local storage.' 
            : 'Submission rejected and deleted from local storage (Firebase sync failed, but martyr is still rejected).';
        
        alert(successMessage);

    } catch (error) {
        console.error('Error rejecting martyr:', error);
        alert('Error rejecting submission. Please try again.');
        
        // Reset button state
        const rejectBtn = document.querySelector(`[data-martyr-id="${martyrId}"] .btn-reject`);
        if (rejectBtn) {
            rejectBtn.disabled = false;
            rejectBtn.innerHTML = '✗ Reject & Delete';
        }
    }
}

// Update statistics
async function updateStats() {
    try {
        // Try to get counts from Firebase first
        let pendingCount = 0;
        let approvedCount = 0;
        
        try {
            const pendingResult = await firebaseDB.getPendingMartyrs();
            const approvedResult = await firebaseDB.getApprovedMartyrs();
            
            if (pendingResult.success) pendingCount = pendingResult.data.length;
            if (approvedResult.success) approvedCount = approvedResult.data.length;
        } catch (firebaseError) {
            console.warn('Firebase stats failed, using localStorage:', firebaseError);
            // Fallback to localStorage
            const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
            const approvedData = JSON.parse(localStorage.getItem('martyrsData') || '[]');
            pendingCount = pendingData.length;
            approvedCount = approvedData.length;
        }
        
        document.getElementById('pendingCount').textContent = pendingCount;
        document.getElementById('approvedCount').textContent = approvedCount;
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Format date helper function
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Refresh all data
async function refreshData() {
    await loadPendingSubmissions();
    await updateStats();
}

// Clear all pending submissions (admin function)
async function clearAllPending() {
    if (!confirm('Are you sure you want to delete ALL pending submissions? This action cannot be undone!')) {
        return;
    }

    if (!confirm('This will permanently delete all pending submissions. Are you absolutely sure?')) {
        return;
    }

    localStorage.setItem('pendingMartyrs', '[]');
    await loadPendingSubmissions();
    await updateStats();
    alert('All pending submissions have been cleared.');
}

// Export all data to JSON file
function exportData() {
    const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
    const approvedData = JSON.parse(localStorage.getItem('martyrsData') || '[]');
    
    const exportData = {
        pendingMartyrs: pendingData,
        martyrsData: approvedData,
        exportDate: new Date().toISOString(),
        totalPending: pendingData.length,
        totalApproved: approvedData.length
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `martyrs-data-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    alert('Data exported successfully!');
}

// Import data from JSON file
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.onchange = function(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const importedData = JSON.parse(e.target.result);
                
                if (importedData.pendingMartyrs && importedData.martyrsData) {
                    if (confirm('This will replace all existing data. Are you sure?')) {
                        localStorage.setItem('pendingMartyrs', JSON.stringify(importedData.pendingMartyrs));
                        localStorage.setItem('martyrsData', JSON.stringify(importedData.martyrsData));
                        
                        loadPendingSubmissions();
                        updateStats();
                        
                        alert(`Data imported successfully!\nPending: ${importedData.totalPending}\nApproved: ${importedData.totalApproved}`);
                    }
                } else {
                    alert('Invalid file format!');
                }
            } catch (error) {
                alert('Error reading file: ' + error.message);
            }
        };
        reader.readAsText(file);
    };
    
    input.click();
}

