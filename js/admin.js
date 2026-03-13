// Admin panel JavaScript for moderating submissions

// Import authentication module
import { adminAuth } from './auth.js';
import { escapeHTML, sanitizeInput, checkRateLimit, logSecurityEvent } from './security.js';

// Use auth.js module for authentication validation
function validateAdminAuth(actionName = 'admin action') {
    return adminAuth.validateAdminAction(actionName);
}

// ============================================
// DUPLICATE DETECTION SYSTEM
// ============================================

// Calculate similarity between two strings (Levenshtein distance based)
function calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const s1 = str1.toString().toLowerCase().trim();
    const s2 = str2.toString().toLowerCase().trim();
    
    if (s1 === s2) return 1.0;
    if (s1.length === 0 || s2.length === 0) return 0;
    
    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) {
        return 0.85;
    }
    
    // Calculate Levenshtein distance
    const matrix = [];
    for (let i = 0; i <= s1.length; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= s2.length; j++) {
        matrix[0][j] = j;
    }
    for (let i = 1; i <= s1.length; i++) {
        for (let j = 1; j <= s2.length; j++) {
            const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    
    const maxLen = Math.max(s1.length, s2.length);
    return 1 - (matrix[s1.length][s2.length] / maxLen);
}

// Normalize name for comparison (remove titles, common prefixes)
function normalizeName(name) {
    if (!name) return '';
    return name.toString().toLowerCase()
        .replace(/^(shaheed|martyr|shahid|dr\.?|mr\.?|ms\.?|mrs\.?)\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Calculate overall similarity score between two martyrs
function calculateMartyrSimilarity(martyr1, martyr2) {
    const scores = {
        name: 0,
        fatherName: 0,
        birthPlace: 0,
        martyrdomPlace: 0,
        martyrdomDate: 0,
        birthDate: 0
    };
    
    // Name similarity (most important - weight: 50%)
    const name1 = normalizeName(martyr1.fullName);
    const name2 = normalizeName(martyr2.fullName);
    scores.name = calculateStringSimilarity(name1, name2);
    
    // Father name similarity (weight: 15%)
    if (martyr1.fatherName && martyr2.fatherName) {
        scores.fatherName = calculateStringSimilarity(
            normalizeName(martyr1.fatherName),
            normalizeName(martyr2.fatherName)
        );
    }
    
    // Birth place similarity (weight: 10%)
    if (martyr1.birthPlace && martyr2.birthPlace) {
        scores.birthPlace = calculateStringSimilarity(
            martyr1.birthPlace.toLowerCase(),
            martyr2.birthPlace.toLowerCase()
        );
    }
    
    // Martyrdom place similarity (weight: 10%)
    if (martyr1.martyrdomPlace && martyr2.martyrdomPlace) {
        scores.martyrdomPlace = calculateStringSimilarity(
            martyr1.martyrdomPlace.toLowerCase(),
            martyr2.martyrdomPlace.toLowerCase()
        );
    }
    
    // Date comparisons (weight: 7.5% each)
    const getDateString = (dateVal) => {
        if (!dateVal) return '';
        if (dateVal.toDate && typeof dateVal.toDate === 'function') {
            return dateVal.toDate().toISOString().split('T')[0];
        }
        if (typeof dateVal === 'string') return dateVal.split('T')[0];
        if (dateVal instanceof Date) return dateVal.toISOString().split('T')[0];
        return '';
    };
    
    const date1_martyrdom = getDateString(martyr1.martyrdomDate);
    const date2_martyrdom = getDateString(martyr2.martyrdomDate);
    if (date1_martyrdom && date2_martyrdom) {
        scores.martyrdomDate = date1_martyrdom === date2_martyrdom ? 1.0 : 0;
    }
    
    const date1_birth = getDateString(martyr1.birthDate);
    const date2_birth = getDateString(martyr2.birthDate);
    if (date1_birth && date2_birth) {
        scores.birthDate = date1_birth === date2_birth ? 1.0 : 0;
    }
    
    // Calculate weighted total
    const totalScore = 
        (scores.name * 0.50) +
        (scores.fatherName * 0.15) +
        (scores.birthPlace * 0.10) +
        (scores.martyrdomPlace * 0.10) +
        (scores.martyrdomDate * 0.075) +
        (scores.birthDate * 0.075);
    
    return {
        total: totalScore,
        breakdown: scores
    };
}

// Find potential duplicates for a martyr being approved
async function findPotentialDuplicates(martyrToCheck, threshold = 0.65) {
    console.log('🔍 Checking for potential duplicates for:', martyrToCheck.fullName);
    
    const duplicates = [];
    
    try {
        // Get all approved martyrs from Firebase
        if (!window.firebaseDB) {
            console.warn('⚠️ Firebase not available for duplicate check');
            return duplicates;
        }
        
        const result = await window.firebaseDB.getApprovedMartyrs();
        if (!result.success || !result.data) {
            console.warn('⚠️ Could not fetch approved martyrs for duplicate check');
            return duplicates;
        }
        
        const approvedMartyrs = result.data;
        console.log(`📊 Checking against ${approvedMartyrs.length} approved martyrs`);
        
        for (const approved of approvedMartyrs) {
            const similarity = calculateMartyrSimilarity(martyrToCheck, approved);
            
            if (similarity.total >= threshold) {
                duplicates.push({
                    martyr: approved,
                    similarity: similarity.total,
                    breakdown: similarity.breakdown
                });
                console.log(`⚠️ Potential duplicate found: ${approved.fullName} (${(similarity.total * 100).toFixed(1)}% match)`);
            }
        }
        
        // Sort by similarity (highest first)
        duplicates.sort((a, b) => b.similarity - a.similarity);
        
    } catch (error) {
        console.error('❌ Error checking for duplicates:', error);
    }
    
    return duplicates;
}

// Show duplicate warning modal - Side-by-side comparison view
function showDuplicateWarningModal(martyrToApprove, duplicates, onConfirm, onCancel) {
    // Remove existing modal if present
    const existing = document.getElementById('duplicateWarningModal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'duplicateWarningModal';
    modal.className = 'duplicate-modal-overlay';
    
    // Helper to create profile card HTML
    const createProfileCard = (martyr, isNew = false) => {
        return `
            <div class="dup-profile-photo">
                ${martyr.photo ? 
                    `<img src="${martyr.photo}" alt="${escapeHTML(martyr.fullName)}">` :
                    '<div class="dup-no-photo"><span>📷</span><small>No Photo</small></div>'
                }
            </div>
            <div class="dup-profile-details">
                <h4 class="dup-profile-name">${escapeHTML(martyr.fullName)}</h4>
                <div class="dup-profile-fields">
                    <div class="dup-field">
                        <span class="dup-field-icon">👨</span>
                        <span class="dup-field-label">Father</span>
                        <span class="dup-field-value">${martyr.fatherName ? escapeHTML(martyr.fatherName) : '<em>Not provided</em>'}</span>
                    </div>
                    <div class="dup-field">
                        <span class="dup-field-icon">📍</span>
                        <span class="dup-field-label">Birth Place</span>
                        <span class="dup-field-value">${martyr.birthPlace ? escapeHTML(martyr.birthPlace) : '<em>Not provided</em>'}</span>
                    </div>
                    <div class="dup-field">
                        <span class="dup-field-icon">🌹</span>
                        <span class="dup-field-label">Martyrdom Place</span>
                        <span class="dup-field-value">${martyr.martyrdomPlace ? escapeHTML(martyr.martyrdomPlace) : '<em>Not provided</em>'}</span>
                    </div>
                    <div class="dup-field">
                        <span class="dup-field-icon">📅</span>
                        <span class="dup-field-label">Martyrdom Date</span>
                        <span class="dup-field-value">${martyr.martyrdomDate ? formatDate(martyr.martyrdomDate) : '<em>Not provided</em>'}</span>
                    </div>
                    <div class="dup-field">
                        <span class="dup-field-icon">🏢</span>
                        <span class="dup-field-label">Organization</span>
                        <span class="dup-field-value">${martyr.organization ? escapeHTML(martyr.organization) : '<em>Not provided</em>'}</span>
                    </div>
                </div>
            </div>
        `;
    };
    
    // Build comparison rows for each duplicate
    const comparisonRowsHtml = duplicates.map((dup, index) => {
        const similarity = (dup.similarity * 100).toFixed(0);
        const matchClass = similarity >= 90 ? 'match-critical' : similarity >= 80 ? 'match-high' : similarity >= 70 ? 'match-medium' : 'match-low';
        const matchLabel = similarity >= 90 ? 'Very High Match' : similarity >= 80 ? 'High Match' : similarity >= 70 ? 'Medium Match' : 'Possible Match';
        
        return `
            <div class="dup-comparison-row">
                <div class="dup-match-indicator ${matchClass}">
                    <div class="dup-match-percent">${similarity}%</div>
                    <div class="dup-match-label">${matchLabel}</div>
                    <div class="dup-match-details">
                        ${dup.breakdown.name > 0.7 ? '<span class="dup-match-tag match-name">✓ Name</span>' : ''}
                        ${dup.breakdown.fatherName > 0.7 ? '<span class="dup-match-tag match-father">✓ Father</span>' : ''}
                        ${dup.breakdown.birthPlace > 0.7 ? '<span class="dup-match-tag match-place">✓ Birth Place</span>' : ''}
                        ${dup.breakdown.martyrdomPlace > 0.7 ? '<span class="dup-match-tag match-place">✓ Martyrdom Place</span>' : ''}
                        ${dup.breakdown.martyrdomDate > 0.8 ? '<span class="dup-match-tag match-date">✓ Date</span>' : ''}
                    </div>
                </div>
                
                <div class="dup-side-by-side">
                    <div class="dup-profile-card dup-new-submission">
                        <div class="dup-card-header">
                            <span class="dup-card-badge new">📝 New Submission</span>
                        </div>
                        <div class="dup-card-body">
                            ${createProfileCard(martyrToApprove, true)}
                        </div>
                    </div>
                    
                    <div class="dup-vs-divider">
                        <span>VS</span>
                    </div>
                    
                    <div class="dup-profile-card dup-existing">
                        <div class="dup-card-header">
                            <span class="dup-card-badge existing">✅ Published</span>
                        </div>
                        <div class="dup-card-body">
                            ${createProfileCard(dup.martyr, false)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    modal.innerHTML = `
        <div class="duplicate-modal-content">
            <div class="duplicate-modal-header">
                <div class="dup-header-icon">⚠️</div>
                <div class="dup-header-text">
                    <h2>Potential Duplicate Detected</h2>
                    <p>This submission closely matches ${duplicates.length} existing profile${duplicates.length > 1 ? 's' : ''} in your database</p>
                </div>
                <button type="button" class="duplicate-modal-close" aria-label="Close">&times;</button>
            </div>
            
            <div class="duplicate-modal-body">
                <div class="dup-alert-banner">
                    <div class="dup-alert-icon">🔍</div>
                    <div class="dup-alert-text">
                        <strong>Review carefully before approving.</strong>
                        Compare the profiles below to determine if this is a duplicate entry.
                    </div>
                </div>
                
                <div class="dup-comparisons-container">
                    ${comparisonRowsHtml}
                </div>
            </div>
            
            <div class="duplicate-modal-footer">
                <button type="button" class="btn dup-btn-cancel">
                    <span class="btn-icon">✖</span>
                    <span class="btn-text">Cancel Approval</span>
                </button>
                <button type="button" class="btn dup-btn-approve">
                    <span class="btn-icon">✓</span>
                    <span class="btn-text">Not a Duplicate - Approve</span>
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Event handlers
    const closeModal = () => {
        modal.remove();
        document.body.style.overflow = 'auto';
    };
    
    modal.querySelector('.duplicate-modal-close').addEventListener('click', () => {
        closeModal();
        if (onCancel) onCancel();
    });
    
    modal.querySelector('.dup-btn-cancel').addEventListener('click', () => {
        closeModal();
        if (onCancel) onCancel();
    });
    
    modal.querySelector('.dup-btn-approve').addEventListener('click', () => {
        closeModal();
        if (onConfirm) onConfirm();
    });
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
            if (onCancel) onCancel();
        }
    });
    
    // Escape key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            if (onCancel) onCancel();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Make duplicate functions globally available
window.findPotentialDuplicates = findPotentialDuplicates;
window.showDuplicateWarningModal = showDuplicateWarningModal;

// ============================================
// END DUPLICATE DETECTION SYSTEM
// ============================================

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
            console.log('❌ Admin panel initialization blocked - authentication failed');
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

    // Initialize pending search/filter controls
    initPendingSearch();
}

// Simple helper to safely get lowercased strings
function toSearchString(value) {
    return (value || '').toString().toLowerCase();
}

// Initialize search/filter for pending submissions list
function initPendingSearch() {
    const searchInput = document.getElementById('pendingSearch');
    const clearBtn = document.getElementById('pendingSearchClear');
    if (!searchInput) return;

    const applyFilter = () => {
        const query = searchInput.value.toLowerCase().trim();
        filterPendingSubmissions(query);
    };

    searchInput.addEventListener('input', () => {
        // Debounce lightly via requestAnimationFrame to keep UI smooth
        window.requestAnimationFrame(applyFilter);
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            applyFilter();
        });
    }
}

// Filter visible pending submissions in the DOM by martyr or submitter
function filterPendingSubmissions(query) {
    const list = document.getElementById('pendingList');
    if (!list) return;

    const items = list.querySelectorAll('.pending-item');
    if (!items.length) return;

    const trimmed = (query || '').toLowerCase().trim();
    let visibleCount = 0;

    items.forEach(item => {
        // Skip header/info rows that don't carry dataset
        if (!item.dataset || !item.dataset.martyrId) return;
        const name = item.dataset.martyrName || '';
        const submitter = item.dataset.submitterName || '';
        const email = item.dataset.submitterEmail || '';

        const haystack = `${name} ${submitter} ${email}`;
        const isMatch = !trimmed || haystack.includes(trimmed);
        item.style.display = isMatch ? '' : 'none';
        if (isMatch) visibleCount++;
    });

    // Simple status message under the search bar
    let status = document.getElementById('pendingSearchStatus');
    if (!status) {
        status = document.createElement('div');
        status.id = 'pendingSearchStatus';
        status.style.cssText = 'margin: 0.25rem 0 0.75rem 0; font-size: 0.85rem; color: #666;';
        const searchBar = document.getElementById('pendingSearchBar');
        if (searchBar && searchBar.parentNode) {
            searchBar.parentNode.insertBefore(status, searchBar.nextSibling);
        }
    }

    const total = items.length;
    if (trimmed && !visibleCount) {
        status.textContent = 'No pending submissions match your search.';
    } else if (trimmed) {
        status.textContent = `Showing ${visibleCount} of ${total} pending submissions for "${query}".`;
    } else {
        status.textContent = '';
    }
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

// Create a pending item element (with XSS protection)
function createPendingItem(martyr) {
    const item = document.createElement('div');
    item.className = 'pending-item';
    item.dataset.martyrId = escapeHTML(martyr.id);
    item.dataset.martyrName = toSearchString(martyr.fullName);
    item.dataset.submitterName = toSearchString(martyr.submitterName);
    item.dataset.submitterEmail = toSearchString(martyr.submitterEmail);

    const submittedDate = new Date(martyr.submittedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    // Sanitize all user-provided data before rendering
    const safeId = escapeHTML(martyr.id);
    const safeName = escapeHTML(martyr.fullName);
    const safeFatherName = escapeHTML(martyr.fatherName || 'Not provided');
    const safeBirthPlace = escapeHTML(martyr.birthPlace || 'Unknown');
    const safeMartydomPlace = escapeHTML(martyr.martyrdomPlace || 'Unknown');
    const safeOrg = escapeHTML(martyr.organization || 'Not specified');
    const safeRank = escapeHTML(martyr.rank || 'Not specified');
    const safeBio = escapeHTML(martyr.biography || '');
    const safeFamily = escapeHTML(martyr.familyDetails || '');
    const safeSubmitter = escapeHTML(martyr.submitterName);
    const safeEmail = escapeHTML(martyr.submitterEmail);
    const safeRelation = escapeHTML(martyr.submitterRelation || '');
    
    // Validate photo URL (only allow data: URLs for base64 images)
    let safePhoto = '';
    if (martyr.photo && martyr.photo.startsWith('data:image/')) {
        safePhoto = martyr.photo;
    }

    item.innerHTML = `
        <div class="pending-header">
            <strong>Submission ID:</strong> ${safeId}
            <span style="float: right; color: #666;">Submitted: ${escapeHTML(submittedDate)}</span>
        </div>
        <div class="pending-content">
            <div class="pending-image">
                ${safePhoto ? 
                    `<img src="${safePhoto}" alt="${safeName}">` :
                    '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">No Photo</div>'
                }
            </div>
            <div class="pending-details">
                <h3>${safeName}</h3>
                <div class="detail-row">
                    <span class="detail-label">Father's Name:</span> ${safeFatherName}
                </div>
                <div class="detail-row">
                    <span class="detail-label">Birth:</span> ${escapeHTML(formatDate(martyr.birthDate))} in ${safeBirthPlace}
                </div>
                <div class="detail-row">
                    <span class="detail-label">Martyrdom:</span> ${escapeHTML(formatDate(martyr.martyrdomDate))} in ${safeMartydomPlace}
                </div>
                <div class="detail-row">
                    <span class="detail-label">Organization:</span> ${safeOrg}
                </div>
                <div class="detail-row">
                    <span class="detail-label">Rank:</span> ${safeRank}
                </div>
                ${safeBio ? `
                    <div class="detail-row">
                        <span class="detail-label">Biography:</span>
                        <div class="biography-text">${safeBio}</div>
                    </div>
                ` : ''}
                ${safeFamily ? `
                    <div class="detail-row">
                        <span class="detail-label">Family Details:</span>
                        <div class="family-text">${safeFamily}</div>
                    </div>
                ` : ''}
                <div class="detail-row">
                    <span class="detail-label">Submitted by:</span> ${safeSubmitter} (${safeEmail})
                </div>
                ${safeRelation ? `
                    <div class="detail-row">
                        <span class="detail-label">Relationship:</span> ${safeRelation}
                    </div>
                ` : ''}
            </div>
        </div>
        <div class="pending-actions">
            <button data-action="approve" data-martyr-id="${safeId}" class="btn btn-approve">
                ✓ Approve & Publish
            </button>
            <button data-action="reject" data-martyr-id="${safeId}" class="btn btn-reject">
                ✗ Reject & Delete
            </button>
            <button data-action="preview" data-martyr-id="${safeId}" class="btn btn-secondary" style="margin-left: auto;">
                👁 Preview as Visitor
            </button>
        </div>
    `;

    // Add event listeners to buttons
    const approveBtn = item.querySelector('.btn-approve');
    const rejectBtn = item.querySelector('.btn-reject');
    const previewBtn = item.querySelector('[data-action="preview"]');
    
    if (approveBtn) {
        approveBtn.addEventListener('click', () => approveMartyr(martyr.id));
    }
    
    if (rejectBtn) {
        rejectBtn.addEventListener('click', () => rejectMartyr(martyr.id));
    }

    if (previewBtn) {
        previewBtn.addEventListener('click', () => openPendingPreview(martyr));
    }

    return item;
}

// Open a small public-style preview for a pending submission
function openPendingPreview(martyr) {
    // Remove existing preview if present
    const existing = document.getElementById('pendingPreviewOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pendingPreviewOverlay';
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        padding: 1rem;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
        background: #fff;
        max-width: 400px;
        width: 100%;
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        overflow: hidden;
        font-family: system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'padding: 0.75rem 1rem; background: #2c5530; color: #fff; display: flex; justify-content: space-between; align-items: center;';

    const title = document.createElement('div');
    title.textContent = 'Public Preview';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close preview');
    closeBtn.style.cssText = 'background:none;border:none;color:#fff;font-size:1.4rem;cursor:pointer;';

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.style.cssText = 'padding: 1rem;';

    // Build a card similar to gallery/homepage cards using safe textContent
    const card = document.createElement('div');
    card.style.cssText = 'border:1px solid #ddd;border-radius:8px;overflow:hidden;box-shadow:0 2px 4px rgba(0,0,0,0.1);';

    const imgWrapper = document.createElement('div');
    imgWrapper.style.cssText = 'height:220px;background:linear-gradient(135deg,#ddd,#aaa);display:flex;align-items:center;justify-content:center;';

    if (martyr.photo) {
        const img = document.createElement('img');
        img.src = martyr.photo;
        img.alt = martyr.fullName || 'Martyr photo';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        imgWrapper.appendChild(img);
    } else {
        const icon = document.createElement('div');
        icon.textContent = '📸';
        icon.style.cssText = 'font-size:3rem;color:#777;';
        imgWrapper.appendChild(icon);
    }

    const info = document.createElement('div');
    info.style.cssText = 'padding:1rem;';

    const nameEl = document.createElement('h3');
    nameEl.textContent = martyr.fullName || 'Unknown martyr';
    nameEl.style.cssText = 'margin:0 0 0.5rem 0;color:#2c5530;';

    const datesEl = document.createElement('p');
    datesEl.style.cssText = 'margin:0 0 0.5rem 0;font-weight:500;';
    datesEl.textContent = `${formatDate(martyr.birthDate)} - ${formatDate(martyr.martyrdomDate)}`;

    const placeEl = document.createElement('p');
    placeEl.styleCssText = 'margin:0 0 0.5rem 0;color:#666;';
    placeEl.textContent = martyr.martyrdomPlace || 'Place of martyrdom unknown';

    info.appendChild(nameEl);
    info.appendChild(datesEl);
    info.appendChild(placeEl);

    if (martyr.organization) {
        const orgEl = document.createElement('p');
        orgEl.style.cssText = 'margin:0 0 0.5rem 0;font-size:0.9rem;color:#888;';
        orgEl.textContent = martyr.organization;
        info.appendChild(orgEl);
    }

    if (martyr.biography) {
        const bioEl = document.createElement('p');
        bioEl.style.cssText = 'margin:0.5rem 0 0 0;font-size:0.9rem;color:#555;';
        const text = martyr.biography.toString();
        bioEl.textContent = text.length > 180 ? text.substring(0, 180) + '…' : text;
        info.appendChild(bioEl);
    }

    card.appendChild(imgWrapper);
    card.appendChild(info);

    body.appendChild(card);

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);

    const close = () => overlay.remove();
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    document.body.appendChild(overlay);
}

// Helper function to reset approve button state
function resetApproveButton(martyrId) {
    const approveBtn = document.querySelector(`[data-martyr-id="${martyrId}"] .btn-approve`);
    if (approveBtn) {
        approveBtn.disabled = false;
        approveBtn.innerHTML = '✓ Approve & Publish';
    }
}

// Execute the actual approval process
async function executeApproval(martyrId, martyrToApprove, foundInLocalStorage, martyrIndex, pendingData) {
    console.log('🚀 Executing approval for:', martyrToApprove.fullName);
    
    const approveBtn = document.querySelector(`[data-martyr-id="${martyrId}"] .btn-approve`);
    if (approveBtn) {
        approveBtn.innerHTML = '⏳ Approving...';
    }
    
    try {
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
        console.error('Error during approval execution:', error);
        alert('Error approving submission. Please try again.');
        resetApproveButton(martyrId);
    }
}

// Approve a martyr submission
async function approveMartyr(martyrId) {
    // Validate admin authentication
    if (!validateAdminAuth('approve martyr')) {
        return;
    }
    
    console.log('🚀 Starting approval process for ID:', martyrId);
    
    // Check if Firebase is available
    if (!window.firebaseDB) {
        console.error('❌ Firebase not available!');
        alert('Firebase database not available. Please check your internet connection and refresh the page.');
        return;
    }
    
    // Show loading state immediately
    const approveBtn = document.querySelector(`[data-martyr-id="${martyrId}"] .btn-approve`);
    if (approveBtn) {
        approveBtn.disabled = true;
        approveBtn.innerHTML = '🔍 Checking...';
    }

    try {
        // Get martyr data first
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
                const firebaseResult = await window.firebaseDB.getPendingMartyrs();
                if (firebaseResult.success) {
                    const firebaseMartyr = firebaseResult.data.find(m => m.id === martyrId);
                    if (firebaseMartyr) {
                        martyrToApprove = firebaseMartyr;
                        console.log('✅ Found martyr in Firebase:', martyrToApprove);
                    }
                }
            } catch (error) {
                console.error('❌ Error fetching from Firebase:', error);
            }
        }
        
        // If not found, show error
        if (!martyrToApprove) {
            console.error('❌ Martyr not found anywhere:', martyrId);
            alert('Submission not found in database. Please refresh and try again.');
            resetApproveButton(martyrId);
            await refreshData();
            return;
        }
        
        // ============================================
        // DUPLICATE DETECTION CHECK
        // ============================================
        console.log('🔍 Checking for potential duplicates...');
        if (approveBtn) {
            approveBtn.innerHTML = '🔍 Checking duplicates...';
        }
        
        const duplicates = await findPotentialDuplicates(martyrToApprove);
        
        if (duplicates.length > 0) {
            console.log(`⚠️ Found ${duplicates.length} potential duplicate(s)`);
            
            // Show duplicate warning modal and wait for user decision
            showDuplicateWarningModal(
                martyrToApprove,
                duplicates,
                // onConfirm - user wants to approve anyway
                async () => {
                    console.log('✅ User confirmed approval despite duplicates');
                    await executeApproval(martyrId, martyrToApprove, foundInLocalStorage, martyrIndex, pendingData);
                },
                // onCancel - user decided not to approve
                () => {
                    console.log('❌ User cancelled approval due to duplicates');
                    resetApproveButton(martyrId);
                }
            );
            return; // Exit here - the modal callbacks will handle the rest
        }
        
        // ============================================
        // NO DUPLICATES - PROCEED WITH NORMAL APPROVAL
        // ============================================
        console.log('✅ No duplicates found, proceeding with approval...');
        
        // Ask for confirmation
        if (!confirm('Are you sure you want to approve this submission? It will be published on the website.')) {
            console.log('❌ Approval cancelled by user');
            resetApproveButton(martyrId);
            return;
        }
        
        await executeApproval(martyrId, martyrToApprove, foundInLocalStorage, martyrIndex, pendingData);

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

// Format date helper function - handles multiple formats
function formatDate(dateInput) {
    if (!dateInput) return 'Unknown';
    
    // Handle Firestore Timestamp objects
    if (dateInput && typeof dateInput === 'object') {
        // Firestore Timestamp with toDate method
        if (typeof dateInput.toDate === 'function') {
            const date = dateInput.toDate();
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            }
        }
        // Firestore Timestamp with seconds field
        if (dateInput.seconds) {
            const date = new Date(dateInput.seconds * 1000);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            }
        }
    }
    
    const dateString = String(dateInput).trim();
    if (!dateString) return 'Unknown';
    
    // Try parsing as ISO date first (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)
    if (/^\d{4}-\d{2}-\d{2}/.test(dateString)) {
        const date = new Date(dateString);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }
    }
    
    // Try parsing as DD/MM/YYYY
    const ddmmyyyy = dateString.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (ddmmyyyy) {
        const day = parseInt(ddmmyyyy[1], 10);
        const month = parseInt(ddmmyyyy[2], 10) - 1;
        const year = parseInt(ddmmyyyy[3], 10);
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) {
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        }
    }
    
    // Try parsing as MM/DD/YYYY
    const mmddyyyy = dateString.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (mmddyyyy) {
        const month = parseInt(mmddyyyy[1], 10) - 1;
        const day = parseInt(mmddyyyy[2], 10);
        const year = parseInt(mmddyyyy[3], 10);
        // Only accept if month <= 12 and day <= 31
        if (month < 12 && day <= 31) {
            const date = new Date(year, month, day);
            if (!isNaN(date.getTime())) {
                return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            }
        }
    }
    
    // Try just year (e.g., "2020")
    if (/^\d{4}$/.test(dateString)) {
        return dateString;
    }
    
    // Try standard Date parsing as last resort
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
    
    // If all parsing fails, return the original string if it has meaningful content
    if (dateString.length > 0 && dateString !== 'undefined' && dateString !== 'null') {
        return dateString;
    }
    
    return 'Unknown';
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
    const updatedDate = martyr.updatedAt ? new Date(martyr.updatedAt.toDate ? martyr.updatedAt.toDate() : martyr.updatedAt).toLocaleDateString() : null;
    
    item.innerHTML = `
        <div class="pending-header" style="background: #d4edda; border-color: #c3e6cb;">
            <strong>✅ PUBLISHED Martyr ID:</strong> ${escapeHTML(martyr.id)}
            <span style="float: right; color: #155724;">Approved: ${approvedDate}${updatedDate ? ` | Updated: ${updatedDate}` : ''}</span>
        </div>
        <div class="pending-content">
            <div class="pending-image">
                ${martyr.photo ? 
                    `<img src="${martyr.photo}" alt="${escapeHTML(martyr.fullName)}">` :
                    '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">No Photo</div>'
                }
            </div>
            <div class="pending-details">
                <h3>${escapeHTML(martyr.fullName)}</h3>
                <div class="detail-row">
                    <span class="detail-label">Birth:</span> ${formatDate(martyr.birthDate)} in ${escapeHTML(martyr.birthPlace || 'Unknown')}
                </div>
                <div class="detail-row">
                    <span class="detail-label">Martyrdom:</span> ${formatDate(martyr.martyrdomDate)} in ${escapeHTML(martyr.martyrdomPlace || 'Unknown')}
                </div>
                <div class="detail-row">
                    <span class="detail-label">Organization:</span> ${escapeHTML(martyr.organization || 'Not specified')}
                </div>
                ${martyr.rank ? `
                    <div class="detail-row">
                        <span class="detail-label">Rank:</span> ${escapeHTML(martyr.rank)}
                    </div>
                ` : ''}
                ${martyr.submitterName ? `
                    <div class="detail-row">
                        <span class="detail-label">Submitted by:</span> ${escapeHTML(martyr.submitterName)}
                    </div>
                ` : ''}
            </div>
        </div>
        <div class="pending-actions" style="background: #e3f2fd; justify-content: flex-start; gap: 0.75rem;">
            <button data-action="edit" data-martyr-id="${escapeHTML(martyr.id)}" class="btn btn-primary" style="background: #1976d2; border-color: #1976d2;">
                ✏️ Edit Profile
            </button>
            <button data-action="delete" data-martyr-id="${escapeHTML(martyr.id)}" class="btn btn-outline" style="color: #dc3545; border-color: #dc3545;">
                🗑️ Delete
            </button>
        </div>
    `;
    
    // Add event listener to edit button
    const editBtn = item.querySelector('[data-action="edit"]');
    if (editBtn) {
        editBtn.addEventListener('click', () => openEditMartyrModal(martyr));
    }
    
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

// ============================================
// EDIT MARTYR FUNCTIONALITY
// ============================================

// Store the current martyr being edited
let currentEditingMartyr = null;

// Open edit modal with martyr data
function openEditMartyrModal(martyr) {
    // Validate admin authentication
    if (!validateAdminAuth('edit martyr')) {
        return;
    }
    
    console.log('✏️ Opening edit modal for:', martyr.fullName);
    currentEditingMartyr = martyr;
    
    // Remove existing modal if present
    const existingModal = document.getElementById('editMartyrModal');
    if (existingModal) existingModal.remove();
    
    // Helper function to convert Firestore Timestamp or date string to YYYY-MM-DD
    const toDateInputValue = (dateValue) => {
        if (!dateValue) return '';
        try {
            let date;
            if (dateValue.toDate && typeof dateValue.toDate === 'function') {
                date = dateValue.toDate();
            } else if (dateValue instanceof Date) {
                date = dateValue;
            } else if (typeof dateValue === 'string') {
                date = new Date(dateValue);
            } else {
                return '';
            }
            if (isNaN(date.getTime())) return '';
            return date.toISOString().split('T')[0];
        } catch (e) {
            console.warn('Date conversion error:', e);
            return '';
        }
    };
    
    // Create modal
    const modal = document.createElement('div');
    modal.id = 'editMartyrModal';
    modal.className = 'edit-modal-overlay';
    modal.innerHTML = `
        <div class="edit-modal-content">
            <div class="edit-modal-header">
                <h2>✏️ Edit Martyr Profile</h2>
                <button type="button" class="edit-modal-close" aria-label="Close">&times;</button>
            </div>
            <form id="editMartyrForm" class="edit-modal-body">
                <div class="edit-form-grid">
                    <div class="edit-form-group full-width">
                        <label for="editFullName">Full Name *</label>
                        <input type="text" id="editFullName" name="fullName" value="${escapeHTML(martyr.fullName || '')}" required>
                    </div>
                    
                    <div class="edit-form-group">
                        <label for="editBirthDate">Birth Date</label>
                        <input type="date" id="editBirthDate" name="birthDate" value="${toDateInputValue(martyr.birthDate)}">
                    </div>
                    
                    <div class="edit-form-group">
                        <label for="editBirthPlace">Birth Place</label>
                        <input type="text" id="editBirthPlace" name="birthPlace" value="${escapeHTML(martyr.birthPlace || '')}">
                    </div>
                    
                    <div class="edit-form-group">
                        <label for="editMartyrdomDate">Martyrdom Date</label>
                        <input type="date" id="editMartyrdomDate" name="martyrdomDate" value="${toDateInputValue(martyr.martyrdomDate)}">
                    </div>
                    
                    <div class="edit-form-group">
                        <label for="editMartyrdomPlace">Martyrdom Place</label>
                        <input type="text" id="editMartyrdomPlace" name="martyrdomPlace" value="${escapeHTML(martyr.martyrdomPlace || '')}">
                    </div>
                    
                    <div class="edit-form-group">
                        <label for="editOrganization">Organization</label>
                        <input type="text" id="editOrganization" name="organization" value="${escapeHTML(martyr.organization || '')}">
                    </div>
                    
                    <div class="edit-form-group">
                        <label for="editRank">Rank / Role</label>
                        <input type="text" id="editRank" name="rank" value="${escapeHTML(martyr.rank || '')}">
                    </div>
                    
                    <div class="edit-form-group">
                        <label for="editFatherName">Father's Name</label>
                        <input type="text" id="editFatherName" name="fatherName" value="${escapeHTML(martyr.fatherName || '')}">
                    </div>
                    
                    <div class="edit-form-group full-width">
                        <label for="editBiography">Biography</label>
                        <textarea id="editBiography" name="biography" rows="4">${escapeHTML(martyr.biography || '')}</textarea>
                    </div>
                    
                    <div class="edit-form-group full-width">
                        <label for="editFamilyDetails">Family Details</label>
                        <textarea id="editFamilyDetails" name="familyDetails" rows="3">${escapeHTML(martyr.familyDetails || '')}</textarea>
                    </div>
                    
                    <div class="edit-form-group full-width">
                        <label>Current Photo</label>
                        <div class="edit-photo-preview">
                            ${martyr.photo ? 
                                `<img src="${martyr.photo}" alt="Current photo" style="max-width: 150px; max-height: 150px; border-radius: 8px;">` :
                                '<span style="color: #666;">No photo uploaded</span>'
                            }
                        </div>
                        <small style="color: #666; margin-top: 0.5rem; display: block;">To change the photo, you'll need to re-submit the martyr profile or contact support.</small>
                    </div>
                </div>
                
                <div class="edit-modal-footer">
                    <button type="button" class="btn btn-outline edit-cancel-btn">Cancel</button>
                    <button type="submit" class="btn btn-primary edit-save-btn">
                        💾 Save Changes
                    </button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Close handlers
    const closeModal = () => {
        modal.remove();
        document.body.style.overflow = 'auto';
        currentEditingMartyr = null;
    };
    
    modal.querySelector('.edit-modal-close').addEventListener('click', closeModal);
    modal.querySelector('.edit-cancel-btn').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    
    // Escape key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
    
    // Form submit handler
    modal.querySelector('#editMartyrForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveEditedMartyr();
    });
    
    // Focus first input
    setTimeout(() => {
        modal.querySelector('#editFullName').focus();
    }, 100);
}

// Save edited martyr data
async function saveEditedMartyr() {
    if (!currentEditingMartyr) {
        console.error('No martyr being edited');
        return;
    }
    
    // Validate admin authentication
    if (!validateAdminAuth('save edited martyr')) {
        return;
    }
    
    const form = document.getElementById('editMartyrForm');
    const saveBtn = form.querySelector('.edit-save-btn');
    
    // Disable save button and show loading
    saveBtn.disabled = true;
    saveBtn.innerHTML = '⏳ Saving...';
    
    try {
        // Collect form data
        const formData = new FormData(form);
        const updatedData = {};
        
        // Process form fields
        for (const [key, value] of formData.entries()) {
            // Sanitize input
            updatedData[key] = sanitizeInput(value.trim());
        }
        
        // Validate required fields
        if (!updatedData.fullName) {
            alert('Full name is required.');
            saveBtn.disabled = false;
            saveBtn.innerHTML = '💾 Save Changes';
            return;
        }
        
        console.log('💾 Saving updated martyr data:', updatedData);
        
        // Call Firebase update function
        const result = await window.firebaseDB.updateApprovedMartyr(currentEditingMartyr.id, updatedData);
        
        if (result.success) {
            console.log('✅ Martyr updated successfully');
            
            // Close modal
            const modal = document.getElementById('editMartyrModal');
            if (modal) {
                modal.remove();
                document.body.style.overflow = 'auto';
            }
            
            // Refresh the approved martyrs list
            await loadApprovedMartyrs();
            
            alert(`"${updatedData.fullName}" has been updated successfully!`);
        } else {
            console.error('❌ Update failed:', result.error);
            alert(`Failed to update martyr: ${result.error}`);
            saveBtn.disabled = false;
            saveBtn.innerHTML = '💾 Save Changes';
        }
        
    } catch (error) {
        console.error('❌ Error saving martyr:', error);
        alert('An error occurred while saving. Please try again.');
        saveBtn.disabled = false;
        saveBtn.innerHTML = '💾 Save Changes';
    }
}

// Make edit functions globally available
window.openEditMartyrModal = openEditMartyrModal;
window.saveEditedMartyr = saveEditedMartyr;

// ============================================
// END EDIT MARTYR FUNCTIONALITY
// ============================================

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

