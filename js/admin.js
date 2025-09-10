// Admin panel JavaScript for moderating submissions

// Import authentication module
import { adminAuth } from './auth.js';

// Strong authentication validation function
function validateAdminAuth(actionName = 'admin action') {
    try {
        const SESSION_KEY = 'baluch_admin_session';
        
        // Check for session in both storages
        const localSession = localStorage.getItem(SESSION_KEY);
        const storageSession = sessionStorage.getItem(SESSION_KEY);
        
        if (!localSession || !storageSession) {
            console.error(`❌ No valid session for ${actionName} - redirecting to login`);
            window.location.href = 'admin-login.html';
            return false;
        }
        
        const localData = JSON.parse(localSession);
        const storageData = JSON.parse(storageSession);
        
        // Verify sessions match (tamper detection)
        if (localData.username !== storageData.username || 
            localData.loginTime !== storageData.loginTime) {
            console.error(`❌ Session tamper detected during ${actionName} - clearing sessions`);
            localStorage.removeItem(SESSION_KEY);
            sessionStorage.removeItem(SESSION_KEY);
            window.location.href = 'admin-login.html';
            return false;
        }
        
        // Check if session is expired
        if (localData.expires <= Date.now()) {
            console.error(`❌ Session expired during ${actionName} - redirecting to login`);
            localStorage.removeItem(SESSION_KEY);
            sessionStorage.removeItem(SESSION_KEY);
            window.location.href = 'admin-login.html';
            return false;
        }
        
        // Also validate using the auth module if available
        if (window.adminAuth && typeof window.adminAuth.isAuthenticated === 'function') {
            if (!window.adminAuth.isAuthenticated()) {
                console.error(`❌ Auth module validation failed for ${actionName}`);
                window.location.href = 'admin-login.html';
                return false;
            }
        }
        
        console.log(`✅ Authentication validated for ${actionName} by ${localData.username}`);
        return true;
    } catch (error) {
        console.error(`❌ Authentication validation error for ${actionName}:`, error);
        window.location.href = 'admin-login.html';
        return false;
    }
}

// Use global Firebase instance instead of direct import

document.addEventListener('DOMContentLoaded', function() {
    console.log('Admin panel loading...');
    
    // Check if Firebase is already available
    if (window.firebaseDB) {
        console.log('✅ Firebase immediately available');
        initializeAdminPanel();
        return;
    }
    
    console.log('⏳ Waiting for Firebase to load...');
    
    // Wait for Firebase to be ready with multiple fallback strategies
    let firebaseCheckAttempts = 0;
    const maxAttempts = 20; // 10 seconds total
    
    function checkFirebaseAvailability() {
        firebaseCheckAttempts++;
        console.log(`🔍 Firebase check attempt ${firebaseCheckAttempts}/${maxAttempts}`);
        
        if (window.firebaseDB) {
            console.log('✅ Firebase now available!');
            initializeAdminPanel();
            return;
        }
        
        if (firebaseCheckAttempts >= maxAttempts) {
            console.error('❌ Firebase not available after multiple attempts');
            console.log('🔍 Final diagnostic check:');
            console.log('- window.firebaseDB:', !!window.firebaseDB);
            console.log('- document.readyState:', document.readyState);
            console.log('- Scripts loaded:', document.querySelectorAll('script[src*="firebase"]').length);
            
            // Try to show admin panel with localStorage fallback
            console.log('⚠️ Initializing admin panel with localStorage fallback');
            initializeAdminPanel();
        } else {
            // Try again after 500ms
            setTimeout(checkFirebaseAvailability, 500);
        }
    }
    
    // Listen for firebaseReady event
    window.addEventListener('firebaseReady', function() {
        console.log('✅ Firebase ready event received');
        if (!window.firebaseDB) {
            console.warn('⚠️ Firebase ready event fired but firebaseDB not available');
        } else {
            initializeAdminPanel();
        }
    });
    
    // Start checking for Firebase availability
    checkFirebaseAvailability();
});

// Attempt to reconnect Firebase
async function attemptFirebaseReconnection() {
    console.log('🔄 Attempting Firebase reconnection...');
    try {
        // Try to reimport Firebase module
        const firebaseModule = await import('./firebase-config.js');
        window.firebaseDB = firebaseModule.firebaseDB;
        
        // Test the connection
        if (window.firebaseDB && typeof window.firebaseDB.testConnection === 'function') {
            const testResult = await window.firebaseDB.testConnection();
            if (testResult.success) {
                console.log('✅ Firebase reconnection successful!');
                return true;
            }
        }
        console.error('❌ Firebase reconnection failed - connection test failed');
        return false;
    } catch (error) {
        console.error('❌ Firebase reconnection failed:', error);
        return false;
    }
}

// Make Firebase reconnection globally available
window.attemptFirebaseReconnection = attemptFirebaseReconnection;

// Initialize admin panel once Firebase is ready
function initializeAdminPanel() {
    try {
        console.log('🔥 Firebase available, initializing admin panel...');
        
        // Validate admin authentication before proceeding
        if (!validateAdminAuth('initialize admin panel')) {
            return; // Stop execution if not authenticated
        }
        
        // Debug Firebase availability
        console.log('Firebase DB available:', !!window.firebaseDB);
        if (window.firebaseDB) {
            console.log('Firebase DB methods:', Object.keys(window.firebaseDB));
        }
        
        loadPendingSubmissions();
        updateStats();
        initializeAdminControls();
        console.log('✅ Admin panel initialized successfully');
        
        // Initialize approved martyrs management buttons
        initializeApprovedManagement();
        console.log('✅ Approved martyrs management initialized');
    } catch (error) {
        console.error('Error initializing admin panel:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            firebaseAvailable: !!window.firebaseDB
        });
        
        // Don't show alert immediately, let user see what's happening
        setTimeout(() => {
            alert('Error loading admin panel. Check browser console (F12) for details. Try refreshing the page.');
        }, 2000);
    }
}

// Initialize admin control buttons
function initializeAdminControls() {
    console.log('🎮 Initializing admin control buttons...');
    
    // Refresh Data button
    const refreshBtn = document.querySelector('button[onclick="refreshData()"]');
    if (refreshBtn) {
        refreshBtn.removeAttribute('onclick');
        refreshBtn.addEventListener('click', refreshData);
        console.log('✅ Refresh Data button event listener added');
    } else {
        console.warn('⚠️ Refresh Data button not found');
    }
    
    // Export Data button
    const exportBtn = document.querySelector('button[onclick="exportData()"]');
    if (exportBtn) {
        exportBtn.removeAttribute('onclick');
        exportBtn.addEventListener('click', exportData);
        console.log('✅ Export Data button event listener added');
    } else {
        console.warn('⚠️ Export Data button not found');
    }
    
    // Import Data button
    const importBtn = document.querySelector('button[onclick="importData()"]');
    if (importBtn) {
        importBtn.removeAttribute('onclick');
        importBtn.addEventListener('click', importData);
        console.log('✅ Import Data button event listener added');
    } else {
        console.warn('⚠️ Import Data button not found');
    }
    
    // Clear All Pending button
    const clearBtn = document.querySelector('button[onclick="clearAllPending()"]');
    if (clearBtn) {
        clearBtn.removeAttribute('onclick');
        clearBtn.addEventListener('click', clearAllPending);
        console.log('✅ Clear All Pending button event listener added');
    } else {
        console.warn('⚠️ Clear All Pending button not found');
    }
    
    console.log('✅ Admin control buttons initialization completed');
    
    // Make functions globally accessible for HTML onclick handlers as backup
    window.refreshData = refreshData;
    window.exportData = exportData;
    window.importData = importData;
    window.clearAllPending = clearAllPending;
    window.loadPendingSubmissions = loadPendingSubmissions;
    console.log('🌎 Admin functions made globally accessible');
}

// Initialize approved martyrs management buttons
function initializeApprovedManagement() {
    console.log('🔧 Initializing approved martyrs management buttons...');
    
    // Load Approved Martyrs button
    const loadApprovedBtn = document.getElementById('loadApprovedBtn');
    console.log('Load approved button found:', !!loadApprovedBtn);
    if (loadApprovedBtn) {
        // Remove any existing listeners
        loadApprovedBtn.replaceWith(loadApprovedBtn.cloneNode(true));
        const newLoadBtn = document.getElementById('loadApprovedBtn');
        newLoadBtn.addEventListener('click', function() {
            console.log('💼 Load approved martyrs button clicked');
            loadApprovedMartyrs();
        });
        console.log('✅ Load approved button event listener added');
    } else {
        console.error('❌ Load approved button not found!');
    }
    
    // Clear All Approved button
    const clearAllApprovedBtn = document.getElementById('clearAllApprovedBtn');
    console.log('Clear all approved button found:', !!clearAllApprovedBtn);
    if (clearAllApprovedBtn) {
        // Remove any existing listeners
        clearAllApprovedBtn.replaceWith(clearAllApprovedBtn.cloneNode(true));
        const newClearBtn = document.getElementById('clearAllApprovedBtn');
        newClearBtn.addEventListener('click', function() {
            console.log('🧹 Clear all approved martyrs button clicked');
            clearAllApproved();
        });
        console.log('✅ Clear all approved button event listener added');
    } else {
        console.error('❌ Clear all approved button not found!');
    }
}

// Load and display pending submissions
async function loadPendingSubmissions() {
    const pendingList = document.getElementById('pendingList');
    let pendingData = [];
    let usingLocalStorage = false;
    let loadingSource = 'unknown';
    
    console.log('📄 Starting loadPendingSubmissions...');
    
    // Show loading state
    pendingList.innerHTML = '<div style="text-align: center; padding: 2rem; color: #666;">Loading pending submissions...</div>';
    
    try {
        // Try to load from Firebase first using global instance
        if (window.firebaseDB && typeof window.firebaseDB.getPendingMartyrs === 'function') {
            console.log('🔥 Firebase available - attempting to load pending submissions...');
            
            // Test Firebase connection first
            if (typeof window.firebaseDB.testConnection === 'function') {
                console.log('🧪 Testing Firebase connection before loading...');
                const connectionTest = await window.firebaseDB.testConnection();
                console.log('🧪 Firebase connection test result:', connectionTest);
                if (!connectionTest.success) {
                    console.warn('⚠️ Firebase connection test failed, but continuing anyway...');
                }
            }
            
            const result = await window.firebaseDB.getPendingMartyrs();
            console.log('📁 Firebase getPendingMartyrs result:', {
                success: result.success,
                dataLength: result.data ? result.data.length : 'null',
                error: result.error || 'none',
                dataPreview: result.data ? result.data.slice(0, 2).map(m => ({ id: m.id, name: m.fullName })) : 'no data'
            });
            
            if (result.success) {
                pendingData = result.data || [];
                loadingSource = 'Firebase';
                console.log(`✅ Successfully loaded ${pendingData.length} pending submissions from Firebase`);
                
                // Log detailed info about each submission
                if (pendingData.length > 0) {
                    console.log('🗂 Pending submissions details:');
                    pendingData.forEach((martyr, index) => {
                        console.log(`  ${index + 1}. ID: ${martyr.id}, Name: ${martyr.fullName}, Submitted: ${martyr.submittedAt}`);
                    });
                }
            } else {
                console.warn('⚠️ Firebase getPendingMartyrs failed:', result.error);
                throw new Error(result.error || 'Firebase query failed');
            }
        } else {
            console.warn('⚠️ Firebase not available or getPendingMartyrs method missing');
            console.log('Firebase debug info:', {
                firebaseDB: !!window.firebaseDB,
                firebaseDBType: typeof window.firebaseDB,
                getPendingMartyrsMethod: window.firebaseDB ? typeof window.firebaseDB.getPendingMartyrs : 'N/A',
                availableMethods: window.firebaseDB ? Object.keys(window.firebaseDB) : 'N/A'
            });
            throw new Error('Firebase not available');
        }
        
    } catch (error) {
        console.error('❌ Error loading pending submissions from Firebase:', error);
        console.log('🔍 Error details:', {
            message: error.message,
            stack: error.stack?.substring(0, 300),
            firebaseAvailable: !!window.firebaseDB,
            timestamp: new Date().toISOString()
        });
        
        // This memorial requires Firebase for permanent storage - no localStorage fallback
        console.error('🛑 Memorial admin requires Firebase database connection for permanent storage');
        
        // Show detailed error to admin
        pendingData = [];
        loadingSource = 'failed';
        usingLocalStorage = false;
        
        // Display Firebase connection required message
        const errorDiv = document.createElement('div');
        errorDiv.innerHTML = `
            <div class="firebase-required-error" style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 8px; padding: 2rem; margin: 1rem 0; color: #721c24;">
                <h3>🔥 Firebase Database Required</h3>
                <p><strong>Error:</strong> ${error.message}</p>
                <p>This memorial's admin panel requires a permanent Firebase database connection to manage submissions properly.</p>
                <div style="margin-top: 1rem;">
                    <p><strong>Please:</strong></p>
                    <ul style="text-align: left; margin: 1rem 0;">
                        <li>Refresh the page and wait for Firebase to load</li>
                        <li>Check your internet connection</li>
                        <li>Verify Firebase configuration</li>
                        <li>Contact support if this persists</li>
                    </ul>
                </div>
                <div style="margin-top: 1rem; padding: 1rem; background: #f1f3f4; border-radius: 4px; font-size: 0.9rem;">
                    <strong>Debug Info:</strong><br>
                    • Firebase available: ${!!window.firebaseDB}<br>
                    • Error: ${error.message}<br>
                    • Timestamp: ${new Date().toLocaleString()}<br>
                </div>
                <button onclick="location.reload()" class="btn btn-primary" style="margin-top: 1rem; background: #dc3545; border-color: #dc3545;">
                    🔄 Reload Page
                </button>
                <button onclick="attemptFirebaseReconnection()" class="btn btn-secondary" style="margin-left: 0.5rem; margin-top: 1rem;">
                    🔧 Retry Firebase Connection
                </button>
            </div>
        `;
        pendingList.innerHTML = '';
        pendingList.appendChild(errorDiv);
        return;
    }

    // Show results with detailed debug info
    console.log(`📈 Final results: ${pendingData.length} pending submissions from ${loadingSource}`);
    
    if (pendingData.length === 0) {
        const debugInfo = `
            <div class="no-pending" style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 2rem; margin: 1rem 0;">
                <h3>📎 No pending submissions found</h3>
                <p><strong>Data source attempted:</strong> ${loadingSource}</p>
                <p>This could mean:</p>
                <ul style="text-align: left; margin: 1rem 0;">
                    <li>All submissions have been reviewed</li>
                    <li>Firebase database connection issue</li>
                    <li>Submissions are being stored but not retrieved properly</li>
                </ul>
                <div style="margin-top: 1rem; padding: 1rem; background: #e9ecef; border-radius: 4px; font-size: 0.9rem;">
                    <strong>Debug Info:</strong><br>
                    • Firebase available: ${!!window.firebaseDB}<br>
                    • Loading source: ${loadingSource}<br>
                    • Using localStorage: ${usingLocalStorage}<br>
                    • Timestamp: ${new Date().toLocaleString()}<br>
                </div>
                <button onclick="loadPendingSubmissions()" class="btn btn-primary" style="margin-top: 1rem;">
                    🔄 Refresh
                </button>
            </div>
        `;
        pendingList.innerHTML = debugInfo;
        return;
    }
    
    // Clear loading state
    pendingList.innerHTML = '';
    
    // Create header with source info
    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = 'background: #d1ecf1; padding: 0.75rem 1rem; margin-bottom: 1rem; border-radius: 4px; font-size: 0.9rem;';
    headerDiv.innerHTML = `📁 Showing ${pendingData.length} pending submission(s) from <strong>${loadingSource}</strong> ${usingLocalStorage ? '(localStorage)' : ''}`;
    pendingList.appendChild(headerDiv);
    
    // Add each pending item
    pendingData.forEach((martyr, index) => {
        console.log(`🎨 Creating UI for martyr ${index + 1}/${pendingData.length}: ${martyr.fullName}`);
        const pendingItem = createPendingItem(martyr);
        pendingList.appendChild(pendingItem);
    });
    
    console.log(`✅ Successfully rendered ${pendingData.length} pending submissions in UI`);
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
    // Validate admin authentication
    if (!validateAdminAuth('approve martyr')) {
        return;
    }
    
    console.log('🚀 Starting approval process for ID:', martyrId);
    
    if (!confirm('Are you sure you want to approve this submission? It will be published on the website.')) {
        console.log('❌ Approval cancelled by user');
        return;
    }
    
    console.log('✅ User confirmed approval, proceeding...');
    
    // Check if Firebase is available
    if (!window.firebaseDB) {
        console.error('❌ Firebase not available!');
        alert('Firebase database not available. Please check your internet connection and refresh the page.');
        return;
    }
    
    console.log('✅ Firebase available, continuing with approval...');

    try {
        // Show loading state
        const approveBtn = document.querySelector(`[data-martyr-id="${martyrId}"] .btn-approve`);
        if (approveBtn) {
            approveBtn.disabled = true;
            approveBtn.innerHTML = '⏳ Approving...';
        }

        // Get martyr data - try from currently loaded data first
        let martyrToApprove = null;
        let foundInLocalStorage = false;
        
        // First check localStorage
        const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
        const martyrIndex = pendingData.findIndex(m => m.id === martyrId);
        
        if (martyrIndex !== -1) {
            martyrToApprove = pendingData[martyrIndex];
            foundInLocalStorage = true;
            console.log('✅ Found martyr in localStorage:', martyrToApprove);
        } else {
            // If not in localStorage, try to get from Firebase directly
            console.log('🔍 Martyr not in localStorage, fetching from Firebase...');
            
            try {
                console.log('🔄 Fetching pending martyrs from Firebase...');
                const firebaseResult = await window.firebaseDB.getPendingMartyrs();
                console.log('📊 Firebase getPendingMartyrs result:', firebaseResult);
                
                if (firebaseResult.success) {
                    console.log(`📁 Found ${firebaseResult.data.length} pending martyrs in Firebase`);
                    const firebaseMartyr = firebaseResult.data.find(m => m.id === martyrId);
                    if (firebaseMartyr) {
                        martyrToApprove = firebaseMartyr;
                        console.log('✅ Found martyr in Firebase:', martyrToApprove);
                    } else {
                        console.log('❌ Martyr ID not found in Firebase pending list');
                        console.log('📁 Available IDs in Firebase:', firebaseResult.data.map(m => m.id));
                    }
                } else {
                    console.error('❌ Firebase getPendingMartyrs failed:', firebaseResult.error);
                }
            } catch (error) {
                console.error('❌ Error fetching from Firebase:', error);
                console.error('❌ Error details:', error.stack);
            }
        }
        
        // If still not found, show error
        if (!martyrToApprove) {
            console.error('❌ Martyr not found anywhere:', martyrId);
            alert('Submission not found in database. Please refresh and try again.');
            await refreshData();
            return;
        }

        // Update the martyr status
        martyrToApprove.status = 'approved';
        martyrToApprove.approvedAt = new Date().toISOString();
        
        console.log('Approving martyr:', martyrToApprove);

        // Try to approve in Firebase first
        let firebaseSuccess = false;
        try {
            const result = await window.firebaseDB.approveMartyr(martyrId, martyrToApprove);
            if (result.success) {
                console.log('✅ Martyr approved in Firebase:', result.id);
                firebaseSuccess = true;
            }
        } catch (firebaseError) {
            console.warn('⚠️ Firebase approval failed, using localStorage only:', firebaseError);
        }

        // Update localStorage only if the martyr was found there
        if (foundInLocalStorage && martyrIndex !== -1) {
            // Remove from pending localStorage
            pendingData.splice(martyrIndex, 1);
            localStorage.setItem('pendingMartyrs', JSON.stringify(pendingData));
            console.log('💾 Removed from localStorage pending');
        } else {
            console.log('🔄 Martyr was Firebase-only, no localStorage removal needed');
        }

        // Always add to approved martyrs in localStorage (for compatibility)
        const approvedData = JSON.parse(localStorage.getItem('martyrsData') || '[]');
        approvedData.push(martyrToApprove);
        localStorage.setItem('martyrsData', JSON.stringify(approvedData));
        console.log('Added to localStorage approved:', approvedData.length);

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
    // Validate admin authentication
    if (!validateAdminAuth('reject martyr')) {
        return;
    }
    
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

        // Check if martyr exists in localStorage first
        const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
        const martyrIndex = pendingData.findIndex(m => m.id === martyrId);
        const foundInLocalStorage = martyrIndex !== -1;
        
        if (foundInLocalStorage) {
            console.log('✅ Found martyr in localStorage for rejection');
        } else {
            console.log('🔄 Martyr is Firebase-only, will reject from Firebase');
        }

        // Try to reject in Firebase first
        let firebaseSuccess = false;
        try {
            const result = await window.firebaseDB.rejectMartyr(martyrId);
            if (result.success) {
                console.log('✅ Martyr rejected in Firebase:', martyrId);
                firebaseSuccess = true;
            }
        } catch (firebaseError) {
            console.warn('⚠️ Firebase rejection failed:', firebaseError);
        }

        // Update localStorage only if the martyr was found there
        if (foundInLocalStorage) {
            pendingData.splice(martyrIndex, 1);
            localStorage.setItem('pendingMartyrs', JSON.stringify(pendingData));
            console.log('💾 Removed from localStorage pending');
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
            if (window.firebaseDB) {
                const pendingResult = await window.firebaseDB.getPendingMartyrs();
                const approvedResult = await window.firebaseDB.getApprovedMartyrs();
                
                if (pendingResult.success) pendingCount = pendingResult.data.length;
                if (approvedResult.success) approvedCount = approvedResult.data.length;
                
                console.log(`📊 Firebase stats - Pending: ${pendingCount}, Approved: ${approvedCount}`);
            } else {
                throw new Error('Firebase not available');
            }
        } catch (firebaseError) {
            console.warn('⚠️ Firebase stats failed, using localStorage:', firebaseError);
            // Fallback to localStorage
            const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
            const approvedData = JSON.parse(localStorage.getItem('martyrsData') || '[]');
            pendingCount = pendingData.length;
            approvedCount = approvedData.length;
            console.log(`💾 localStorage stats - Pending: ${pendingCount}, Approved: ${approvedCount}`);
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
    console.log('🔄 Refreshing admin panel data...');
    
    // Validate admin authentication
    if (!validateAdminAuth('refresh data')) {
        return;
    }
    
    try {
        // Show loading state in refresh button
        const refreshBtn = document.querySelector('button[onclick="refreshData()"]') || 
                          Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Refresh'));
        
        if (refreshBtn) {
            const originalText = refreshBtn.textContent;
            refreshBtn.disabled = true;
            refreshBtn.textContent = '🔄 Refreshing...';
            
            // Restore button after refresh
            setTimeout(() => {
                refreshBtn.disabled = false;
                refreshBtn.textContent = originalText;
            }, 2000);
        }
        
        console.log('📄 Loading pending submissions...');
        await loadPendingSubmissions();
        
        console.log('📈 Updating statistics...');
        await updateStats();
        
        console.log('✅ Data refresh completed successfully');
        
    } catch (error) {
        console.error('❌ Error during data refresh:', error);
        alert('Error refreshing data. Check console for details.');
    }
}

// Clear all pending submissions (admin function)
async function clearAllPending() {
    // Validate admin authentication
    if (!validateAdminAuth('clear all pending submissions')) {
        return;
    }
    
    if (!confirm('Are you sure you want to delete ALL pending submissions? This action cannot be undone!')) {
        return;
    }

    if (!confirm('This will permanently delete all pending submissions from both Firebase and local storage. Are you absolutely sure?')) {
        return;
    }

    try {
        console.log('🧼 Clearing all pending submissions...');
        
        // Clear from Firebase first
        if (window.firebaseDB && typeof window.firebaseDB.clearAllPendingMartyrs === 'function') {
            console.log('🔥 Clearing Firebase pending submissions...');
            const clearResult = await window.firebaseDB.clearAllPendingMartyrs();
            
            if (clearResult.success) {
                console.log(`✅ Cleared ${clearResult.deletedCount} pending submissions from Firebase`);
            } else {
                console.warn('⚠️ Firebase clear failed:', clearResult.error);
            }
        } else {
            console.warn('⚠️ Firebase clearAllPendingMartyrs function not available');
        }
        
        // Clear from localStorage
        console.log('💾 Clearing localStorage pending submissions...');
        localStorage.setItem('pendingMartyrs', '[]');
        
        // Refresh data and UI
        await loadPendingSubmissions();
        await updateStats();
        
        console.log('✅ All pending submissions cleared successfully');
        alert('All pending submissions have been cleared from Firebase and local storage.');
        
    } catch (error) {
        console.error('❌ Error clearing pending submissions:', error);
        alert('Error clearing some submissions. Please check the console and try again.');
    }
}

// Export all data to JSON file
function exportData() {
    // Validate admin authentication
    if (!validateAdminAuth('export data')) {
        return;
    }
    
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
    // Validate admin authentication
    if (!validateAdminAuth('import data')) {
        return;
    }
    
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

// Load and display approved martyrs
async function loadApprovedMartyrs() {
    console.log('💼 Starting loadApprovedMartyrs function...');
    
    // Validate admin authentication
    if (!validateAdminAuth('load approved martyrs')) {
        return;
    }
    
    const approvedList = document.getElementById('approvedList');
    const loadBtn = document.getElementById('loadApprovedBtn');
    
    // Check Firebase availability before proceeding
    if (!window.firebaseDB) {
        console.error('❌ Firebase not available for loadApprovedMartyrs');
        
        // Try to reconnect Firebase
        loadBtn.disabled = true;
        loadBtn.textContent = 'Reconnecting Firebase...';
        approvedList.innerHTML = '<p style="text-align: center; color: #orange; padding: 2rem;">Firebase not available. Attempting to reconnect...</p>';
        
        const reconnected = await attemptFirebaseReconnection();
        if (!reconnected) {
            approvedList.innerHTML = `<div style="text-align: center; color: #dc3545; padding: 2rem; background: #f8d7da; border-radius: 8px; margin: 1rem;">
                <h3>❌ Firebase Connection Failed</h3>
                <p>Unable to connect to Firebase database.</p>
                <p style="font-size: 0.9rem; color: #666; margin-top: 1rem;">This could be due to network issues or Firebase configuration problems.</p>
                <button onclick="loadApprovedMartyrs()" class="btn btn-primary" style="margin-top: 1rem;">Try Again</button>
            </div>`;
            loadBtn.disabled = false;
            loadBtn.textContent = 'Load Approved Martyrs';
            return;
        }
        
        console.log('✅ Firebase reconnection successful, continuing with load...');
    }
    
    console.log('Elements found:', {
        approvedList: !!approvedList,
        loadBtn: !!loadBtn
    });
    
    if (!approvedList || !loadBtn) {
        console.error('❌ Required DOM elements not found!');
        alert('Error: Required elements not found. Please refresh the page.');
        return;
    }
    
    // Show loading state
    loadBtn.disabled = true;
    loadBtn.textContent = 'Loading...';
    approvedList.innerHTML = '<p style="text-align: center; padding: 2rem;">Loading approved martyrs...</p>';
    
    try {
        console.log('🔥 Firebase DB available:', !!window.firebaseDB);
        console.log('🔥 Firebase DB methods available:', window.firebaseDB ? Object.keys(window.firebaseDB).includes('getApprovedMartyrs') : false);
        
        if (!window.firebaseDB) {
            throw new Error('Firebase DB not available');
        }
        
        if (typeof window.firebaseDB.getApprovedMartyrs !== 'function') {
            throw new Error('Firebase getApprovedMartyrs method not available');
        }
        
        console.log('📋 Calling getApprovedMartyrs...');
        const result = await window.firebaseDB.getApprovedMartyrs();
        console.log('📊 Firebase result:', result);
        
        if (result.success) {
            const martyrs = result.data || [];
            console.log(`✅ Found ${martyrs.length} approved martyrs`);
            
            if (martyrs.length > 0) {
                approvedList.innerHTML = '';
                
                martyrs.forEach((martyr, index) => {
                    console.log(`Creating item ${index + 1}/${martyrs.length}:`, martyr.fullName);
                    const martyrItem = createApprovedMartyrItem(martyr);
                    approvedList.appendChild(martyrItem);
                });
                
                console.log('✅ All approved martyrs rendered successfully');
            } else {
                approvedList.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">No approved martyrs found in Firebase</p>';
                console.log('💭 No approved martyrs found');
            }
        } else {
            throw new Error(result.error || 'Unknown Firebase error');
        }
    } catch (error) {
        console.error('❌ Error loading approved martyrs:', error);
        console.error('🔍 Error details:', {
            message: error.message,
            stack: error.stack,
            firebaseAvailable: !!window.firebaseDB,
            timestamp: new Date().toISOString()
        });
        
        // Show user-friendly error without causing logout
        const errorMsg = `Failed to load approved martyrs: ${error.message}\n\nThis might be due to:\n- Firebase connection issues\n- Network connectivity problems\n- Database access restrictions\n\nTry refreshing the page or check your internet connection.`;
        
        approvedList.innerHTML = `<div style="text-align: center; color: #dc3545; padding: 2rem; background: #f8d7da; border-radius: 8px; margin: 1rem;">
            <h3>❌ Error Loading Data</h3>
            <p><strong>Error:</strong> ${error.message}</p>
            <p style="font-size: 0.9rem; color: #666; margin-top: 1rem;">Check browser console for detailed error information.</p>
            <button onclick="loadApprovedMartyrs()" class="btn btn-primary" style="margin-top: 1rem;">Try Again</button>
        </div>`;
    }
    
    // Reset button
    loadBtn.disabled = false;
    loadBtn.textContent = 'Refresh Approved Martyrs';
    console.log('🔄 loadApprovedMartyrs function completed');
}

// Create approved martyr item
function createApprovedMartyrItem(martyr) {
    const item = document.createElement('div');
    item.className = 'pending-item'; // Reuse pending item styling
    item.dataset.martyrId = martyr.id;
    
    const approvedDate = martyr.approvedAt ? new Date(martyr.approvedAt.toDate ? martyr.approvedAt.toDate() : martyr.approvedAt).toLocaleDateString() : 'Unknown';
    
    item.innerHTML = `
        <div class="pending-header" style="background: #d4edda; border-color: #c3e6cb;">
            <strong>✅ PUBLISHED Martyr ID:</strong> ${martyr.id}
            <span style="float: right; color: #155724;">Approved: ${approvedDate}</span>
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
                    <span class="detail-label">Birth:</span> ${formatDate(martyr.birthDate)} in ${martyr.birthPlace || 'Unknown'}
                </div>
                <div class="detail-row">
                    <span class="detail-label">Martyrdom:</span> ${formatDate(martyr.martyrdomDate)} in ${martyr.martyrdomPlace || 'Unknown'}
                </div>
                <div class="detail-row">
                    <span class="detail-label">Organization:</span> ${martyr.organization || 'Not specified'}
                </div>
                ${martyr.submitterName ? `
                    <div class="detail-row">
                        <span class="detail-label">Submitted by:</span> ${martyr.submitterName}
                    </div>
                ` : ''}
            </div>
        </div>
        <div class="pending-actions" style="background: #f8d7da;">
            <button data-action="delete" data-martyr-id="${martyr.id}" class="btn btn-outline" style="color: #dc3545; border-color: #dc3545;">
                🗑️ Delete from Firebase
            </button>
            <span style="color: #666; font-size: 0.9rem; align-self: center;">⚠️ This will permanently remove the martyr from the website</span>
        </div>
    `;
    
    // Add event listener to delete button
    const deleteBtn = item.querySelector('[data-action="delete"]');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => deleteApprovedMartyr(martyr.id, martyr.fullName));
    }
    
    return item;
}

// Delete an approved martyr
async function deleteApprovedMartyr(martyrId, martyrName) {
    // Validate admin authentication
    if (!validateAdminAuth('delete approved martyr')) {
        return;
    }
    
    if (!confirm(`Are you sure you want to DELETE "${martyrName}" from the website?\n\nThis will permanently remove the martyr from Firebase and the website. This action cannot be undone!`)) {
        return;
    }
    
    if (!confirm('This is your FINAL warning. The martyr will be completely deleted. Continue?')) {
        return;
    }
    
    try {
        console.log(`Deleting approved martyr: ${martyrId}`);
        
        // Show loading state
        const deleteBtn = document.querySelector(`[data-martyr-id="${martyrId}"] [data-action="delete"]`);
        if (deleteBtn) {
            deleteBtn.disabled = true;
            deleteBtn.innerHTML = '⏳ Deleting...';
        }
        
        const result = await window.firebaseDB.deleteApprovedMartyr(martyrId);
        
        if (result.success) {
            // Remove from UI
            const martyrItem = document.querySelector(`[data-martyr-id="${martyrId}"]`);
            if (martyrItem) {
                martyrItem.remove();
            }
            
            // Update stats
            await updateStats();
            
            alert(`"${martyrName}" has been successfully deleted from Firebase.`);
            console.log(`Successfully deleted martyr: ${martyrName}`);
        } else {
            alert(`Failed to delete martyr: ${result.error}`);
            console.error('Delete failed:', result.error);
        }
    } catch (error) {
        console.error('Error deleting approved martyr:', error);
        alert('Error deleting martyr. Please try again.');
    }
}

// Clear all approved martyrs (DANGER!)
async function clearAllApproved() {
    // Validate admin authentication
    if (!validateAdminAuth('clear all approved martyrs')) {
        return;
    }
    
    console.log('🧹 clearAllApproved function called');
    
    if (!confirm('⚠️ DANGER: This will DELETE ALL approved martyrs from Firebase!\n\nThis will remove ALL martyrs from the website permanently. Are you absolutely sure?')) {
        console.log('❌ User cancelled deletion at first confirmation');
        return;
    }
    
    console.log('✅ User confirmed first deletion prompt');
    
    if (!confirm('This is your FINAL warning. ALL martyrs will be deleted from the website. This cannot be undone!\n\nType "DELETE ALL" to confirm (case sensitive).')) {
        return;
    }
    
    const confirmation = prompt('Type "DELETE ALL" to confirm deletion of all martyrs:');
    if (confirmation !== 'DELETE ALL') {
        alert('Cancelled. Confirmation text did not match.');
        return;
    }
    
    try {
        console.log('Clearing all approved martyrs...');
        const result = await window.firebaseDB.clearAllApprovedMartyrs();
        
        if (result.success) {
            alert(`Successfully deleted ${result.deletedCount} approved martyrs from Firebase.`);
            
            // Reload the approved list
            const approvedList = document.getElementById('approvedList');
            approvedList.innerHTML = '<p style="text-align: center; color: #666; padding: 2rem;">All approved martyrs have been deleted</p>';
            
            // Update stats
            await updateStats();
        } else {
            alert('Failed to clear approved martyrs: ' + result.error);
        }
    } catch (error) {
        console.error('Error clearing approved martyrs:', error);
        alert('Error clearing approved martyrs. Check console for details.');
    }
}

