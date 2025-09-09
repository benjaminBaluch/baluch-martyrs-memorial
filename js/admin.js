// Admin panel JavaScript for moderating submissions

document.addEventListener('DOMContentLoaded', function() {
    loadPendingSubmissions();
    updateStats();
});

// Load and display pending submissions
function loadPendingSubmissions() {
    const pendingList = document.getElementById('pendingList');
    const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');

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
            <button onclick="approveMartyr('${martyr.id}')" class="btn btn-approve">
                ✓ Approve & Publish
            </button>
            <button onclick="rejectMartyr('${martyr.id}')" class="btn btn-reject">
                ✗ Reject & Delete
            </button>
        </div>
    `;

    return item;
}

// Approve a martyr submission
function approveMartyr(martyrId) {
    if (!confirm('Are you sure you want to approve this submission? It will be published on the website.')) {
        return;
    }

    try {
        // Get pending submissions
        const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
        const martyrIndex = pendingData.findIndex(m => m.id === martyrId);

        if (martyrIndex === -1) {
            alert('Submission not found!');
            return;
        }

        // Get the martyr to approve
        const martyrToApprove = pendingData[martyrIndex];
        martyrToApprove.status = 'approved';
        martyrToApprove.approvedAt = new Date().toISOString();

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
        loadPendingSubmissions();
        updateStats();

        alert('Submission approved and published successfully!');

    } catch (error) {
        console.error('Error approving martyr:', error);
        alert('Error approving submission. Please try again.');
    }
}

// Reject a martyr submission
function rejectMartyr(martyrId) {
    if (!confirm('Are you sure you want to reject this submission? This action cannot be undone.')) {
        return;
    }

    try {
        // Get pending submissions
        const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
        const martyrIndex = pendingData.findIndex(m => m.id === martyrId);

        if (martyrIndex === -1) {
            alert('Submission not found!');
            return;
        }

        // Remove from pending (permanently delete)
        pendingData.splice(martyrIndex, 1);
        localStorage.setItem('pendingMartyrs', JSON.stringify(pendingData));

        // Remove the item from UI
        const pendingItem = document.querySelector(`[data-martyr-id="${martyrId}"]`);
        if (pendingItem) {
            pendingItem.remove();
        }

        // Refresh data
        loadPendingSubmissions();
        updateStats();

        alert('Submission rejected and deleted.');

    } catch (error) {
        console.error('Error rejecting martyr:', error);
        alert('Error rejecting submission. Please try again.');
    }
}

// Update statistics
function updateStats() {
    const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
    const approvedData = JSON.parse(localStorage.getItem('martyrsData') || '[]');

    document.getElementById('pendingCount').textContent = pendingData.length;
    document.getElementById('approvedCount').textContent = approvedData.length;
}

// Refresh all data
function refreshData() {
    loadPendingSubmissions();
    updateStats();
}

// Clear all pending submissions (admin function)
function clearAllPending() {
    if (!confirm('Are you sure you want to delete ALL pending submissions? This action cannot be undone!')) {
        return;
    }

    if (!confirm('This will permanently delete all pending submissions. Are you absolutely sure?')) {
        return;
    }

    localStorage.setItem('pendingMartyrs', '[]');
    loadPendingSubmissions();
    updateStats();
    alert('All pending submissions have been cleared.');
}

// Format date helper
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}
