// Add Martyr Form JavaScript

// Import security utilities
import { sanitizeInput, validateEmail, checkRateLimit, validateFile, validateBase64Image, logSecurityEvent, sanitizeFormData } from './security.js';

// Global variables for Firebase (will be loaded conditionally)
let firebaseDB = null;
let storageHelper = null;
let firebaseAvailable = false;
let formInitialized = false;
let existingMartyrs = []; // Cache of approved martyrs for duplicate detection

// Attempt to load Firebase modules (with fallback for Gulf regions)
async function loadFirebaseModules() {
    try {
        console.log('🌍 Attempting to load Firebase modules...');
        const firebaseModule = await import('./firebase-config.js');
        firebaseDB = firebaseModule.firebaseDB;
        storageHelper = firebaseModule.storageHelper;
        firebaseAvailable = true;
        console.log('✅ Firebase modules loaded successfully');
        
        // Pre-fetch existing martyrs for duplicate detection
        await loadExistingMartyrsForDuplicateCheck();
    } catch (error) {
        console.warn('🌍 Firebase modules failed to load (common in Gulf region):', error.message);
        console.log('💾 Firebase not available - submissions will fail gracefully');
        firebaseAvailable = false;
    }
}

// Load existing martyrs for duplicate detection (runs in background)
async function loadExistingMartyrsForDuplicateCheck() {
    try {
        if (!firebaseDB) return;
        const result = await firebaseDB.getApprovedMartyrs();
        if (result.success && result.data) {
            existingMartyrs = result.data;
            console.log(`📊 Loaded ${existingMartyrs.length} existing martyrs for duplicate detection`);
        }
    } catch (error) {
        console.warn('⚠️ Could not load existing martyrs for duplicate check:', error.message);
    }
}

// ============================================
// DUPLICATE DETECTION SYSTEM
// ============================================

// Calculate similarity between two strings using Levenshtein distance
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

// Normalize name for comparison
function normalizeName(name) {
    if (!name) return '';
    return name.toString().toLowerCase()
        .replace(/^(shaheed|martyr|shahid|dr\.?|mr\.?|ms\.?|mrs\.?)\s*/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Calculate similarity score between two martyrs
function calculateMartyrSimilarity(martyr1, martyr2) {
    const scores = {
        name: 0,
        fatherName: 0,
        birthPlace: 0,
        martyrdomPlace: 0,
        martyrdomDate: 0
    };
    
    // Name similarity (weight: 50%)
    scores.name = calculateStringSimilarity(
        normalizeName(martyr1.fullName),
        normalizeName(martyr2.fullName)
    );
    
    // Father name similarity (weight: 20%)
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
    
    // Martyrdom date comparison (weight: 10%)
    const getDateString = (dateVal) => {
        if (!dateVal) return '';
        if (dateVal.toDate && typeof dateVal.toDate === 'function') {
            return dateVal.toDate().toISOString().split('T')[0];
        }
        if (typeof dateVal === 'string') return dateVal.split('T')[0];
        if (dateVal instanceof Date) return dateVal.toISOString().split('T')[0];
        return '';
    };
    
    const date1 = getDateString(martyr1.martyrdomDate);
    const date2 = getDateString(martyr2.martyrdomDate);
    if (date1 && date2) {
        scores.martyrdomDate = date1 === date2 ? 1.0 : 0;
    }
    
    // Calculate weighted total
    const totalScore = 
        (scores.name * 0.50) +
        (scores.fatherName * 0.20) +
        (scores.birthPlace * 0.10) +
        (scores.martyrdomPlace * 0.10) +
        (scores.martyrdomDate * 0.10);
    
    return { total: totalScore, breakdown: scores };
}

// Find potential duplicates
function findPotentialDuplicates(martyrData, threshold = 0.60) {
    const duplicates = [];
    
    for (const existing of existingMartyrs) {
        const similarity = calculateMartyrSimilarity(martyrData, existing);
        
        if (similarity.total >= threshold) {
            duplicates.push({
                martyr: existing,
                similarity: similarity.total,
                breakdown: similarity.breakdown
            });
        }
    }
    
    // Sort by similarity (highest first)
    duplicates.sort((a, b) => b.similarity - a.similarity);
    return duplicates;
}

// Escape HTML for safe display
function escapeHTMLSafe(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Format date for display
function formatDateDisplay(dateVal) {
    if (!dateVal) return 'Unknown';
    try {
        let date;
        if (dateVal.toDate && typeof dateVal.toDate === 'function') {
            date = dateVal.toDate();
        } else if (typeof dateVal === 'string') {
            date = new Date(dateVal);
        } else if (dateVal instanceof Date) {
            date = dateVal;
        } else {
            return 'Unknown';
        }
        if (isNaN(date.getTime())) return 'Unknown';
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
        return 'Unknown';
    }
}

// Show duplicate warning modal
function showDuplicateModal(newMartyr, duplicates, onProceed, onCancel) {
    // Remove existing modal
    const existing = document.getElementById('duplicateCheckModal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'duplicateCheckModal';
    
    // Create comparison cards for duplicates
    const duplicateCards = duplicates.slice(0, 3).map((dup, index) => {
        const similarity = (dup.similarity * 100).toFixed(0);
        const matchLevel = similarity >= 85 ? 'critical' : similarity >= 70 ? 'high' : 'medium';
        const matchLabel = similarity >= 85 ? 'Very High Match' : similarity >= 70 ? 'High Match' : 'Possible Match';
        
        return `
            <div class="dup-match-card">
                <div class="dup-match-header ${matchLevel}">
                    <span class="dup-match-percent">${similarity}%</span>
                    <span class="dup-match-label">${matchLabel}</span>
                </div>
                <div class="dup-match-content">
                    <div class="dup-match-photo">
                        ${dup.martyr.photo ? 
                            `<img src="${dup.martyr.photo}" alt="${escapeHTMLSafe(dup.martyr.fullName)}">` :
                            '<div class="dup-no-photo">📷</div>'
                        }
                    </div>
                    <div class="dup-match-info">
                        <h4>${escapeHTMLSafe(dup.martyr.fullName)}</h4>
                        ${dup.martyr.fatherName ? `<p><strong>Father:</strong> ${escapeHTMLSafe(dup.martyr.fatherName)}</p>` : ''}
                        <p><strong>Martyrdom:</strong> ${formatDateDisplay(dup.martyr.martyrdomDate)}</p>
                        ${dup.martyr.martyrdomPlace ? `<p><strong>Place:</strong> ${escapeHTMLSafe(dup.martyr.martyrdomPlace)}</p>` : ''}
                        ${dup.martyr.organization ? `<p><strong>Affiliation:</strong> ${escapeHTMLSafe(dup.martyr.organization)}</p>` : ''}
                    </div>
                </div>
                <div class="dup-match-tags">
                    ${dup.breakdown.name > 0.7 ? '<span class="tag tag-name">Name Match</span>' : ''}
                    ${dup.breakdown.fatherName > 0.7 ? '<span class="tag tag-father">Father Match</span>' : ''}
                    ${dup.breakdown.martyrdomPlace > 0.7 ? '<span class="tag tag-place">Place Match</span>' : ''}
                    ${dup.breakdown.martyrdomDate > 0.8 ? '<span class="tag tag-date">Date Match</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
    
    modal.innerHTML = `
        <div class="dup-modal-overlay">
            <div class="dup-modal-container">
                <div class="dup-modal-header">
                    <div class="dup-modal-icon">⚠️</div>
                    <div class="dup-modal-title">
                        <h2>Possible Duplicate Detected</h2>
                        <p>This submission may already exist in our memorial</p>
                    </div>
                    <button type="button" class="dup-modal-close" aria-label="Close">&times;</button>
                </div>
                
                <div class="dup-modal-body">
                    <div class="dup-alert">
                        <strong>Please review carefully.</strong> We found ${duplicates.length} existing profile${duplicates.length > 1 ? 's' : ''} 
                        that closely match${duplicates.length === 1 ? 'es' : ''} your submission.
                    </div>
                    
                    <div class="dup-comparison">
                        <div class="dup-new-submission">
                            <div class="dup-section-label">Your Submission</div>
                            <div class="dup-new-card">
                                <h4>${escapeHTMLSafe(newMartyr.fullName)}</h4>
                                ${newMartyr.fatherName ? `<p><strong>Father:</strong> ${escapeHTMLSafe(newMartyr.fatherName)}</p>` : ''}
                                <p><strong>Martyrdom:</strong> ${formatDateDisplay(newMartyr.martyrdomDate)}</p>
                                ${newMartyr.martyrdomPlace ? `<p><strong>Place:</strong> ${escapeHTMLSafe(newMartyr.martyrdomPlace)}</p>` : ''}
                                ${newMartyr.organization ? `<p><strong>Affiliation:</strong> ${escapeHTMLSafe(newMartyr.organization)}</p>` : ''}
                            </div>
                        </div>
                        
                        <div class="dup-existing-profiles">
                            <div class="dup-section-label">Existing Profile${duplicates.length > 1 ? 's' : ''} in Memorial</div>
                            <div class="dup-matches-list">
                                ${duplicateCards}
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="dup-modal-footer">
                    <p class="dup-footer-note">If this is a duplicate, please do not submit. If this is a different person with a similar name, you may proceed.</p>
                    <div class="dup-modal-actions">
                        <button type="button" class="btn dup-btn-cancel">
                            <span>✕</span> Cancel Submission
                        </button>
                        <button type="button" class="btn dup-btn-proceed">
                            <span>✓</span> Not a Duplicate - Submit Anyway
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add styles
    const style = document.createElement('style');
    style.id = 'duplicateModalStyles';
    style.textContent = `
        #duplicateCheckModal .dup-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.85);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            animation: dupFadeIn 0.3s ease;
        }
        @keyframes dupFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        #duplicateCheckModal .dup-modal-container {
            background: #fff;
            border-radius: 16px;
            max-width: 800px;
            width: 100%;
            max-height: 90vh;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5);
            animation: dupSlideIn 0.3s ease;
        }
        @keyframes dupSlideIn {
            from { transform: translateY(-20px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
        }
        #duplicateCheckModal .dup-modal-header {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1.25rem 1.5rem;
            background: linear-gradient(135deg, #dc3545, #c82333);
            color: #fff;
        }
        #duplicateCheckModal .dup-modal-icon {
            font-size: 2.5rem;
        }
        #duplicateCheckModal .dup-modal-title h2 {
            margin: 0;
            font-size: 1.35rem;
            font-weight: 600;
        }
        #duplicateCheckModal .dup-modal-title p {
            margin: 0.25rem 0 0;
            opacity: 0.9;
            font-size: 0.95rem;
        }
        #duplicateCheckModal .dup-modal-close {
            margin-left: auto;
            background: rgba(255,255,255,0.2);
            border: none;
            color: #fff;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            font-size: 1.5rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: background 0.2s;
        }
        #duplicateCheckModal .dup-modal-close:hover {
            background: rgba(255,255,255,0.3);
        }
        #duplicateCheckModal .dup-modal-body {
            padding: 1.5rem;
            overflow-y: auto;
            flex: 1;
        }
        #duplicateCheckModal .dup-alert {
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 8px;
            padding: 1rem;
            margin-bottom: 1.5rem;
            color: #856404;
            font-size: 0.95rem;
        }
        #duplicateCheckModal .dup-comparison {
            display: grid;
            grid-template-columns: 1fr 1.5fr;
            gap: 1.5rem;
        }
        @media (max-width: 700px) {
            #duplicateCheckModal .dup-comparison {
                grid-template-columns: 1fr;
            }
        }
        #duplicateCheckModal .dup-section-label {
            font-size: 0.8rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #6c757d;
            margin-bottom: 0.75rem;
        }
        #duplicateCheckModal .dup-new-card {
            background: #f8f9fa;
            border: 2px solid #2c5530;
            border-radius: 12px;
            padding: 1.25rem;
        }
        #duplicateCheckModal .dup-new-card h4 {
            margin: 0 0 0.75rem;
            color: #2c5530;
            font-size: 1.1rem;
        }
        #duplicateCheckModal .dup-new-card p {
            margin: 0.35rem 0;
            font-size: 0.9rem;
            color: #495057;
        }
        #duplicateCheckModal .dup-matches-list {
            display: flex;
            flex-direction: column;
            gap: 1rem;
        }
        #duplicateCheckModal .dup-match-card {
            border: 1px solid #dee2e6;
            border-radius: 12px;
            overflow: hidden;
            background: #fff;
        }
        #duplicateCheckModal .dup-match-header {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            padding: 0.6rem 1rem;
            color: #fff;
            font-weight: 600;
        }
        #duplicateCheckModal .dup-match-header.critical {
            background: linear-gradient(135deg, #dc3545, #c82333);
        }
        #duplicateCheckModal .dup-match-header.high {
            background: linear-gradient(135deg, #fd7e14, #e8590c);
        }
        #duplicateCheckModal .dup-match-header.medium {
            background: linear-gradient(135deg, #ffc107, #e0a800);
            color: #212529;
        }
        #duplicateCheckModal .dup-match-percent {
            font-size: 1.25rem;
        }
        #duplicateCheckModal .dup-match-label {
            font-size: 0.85rem;
        }
        #duplicateCheckModal .dup-match-content {
            display: flex;
            gap: 1rem;
            padding: 1rem;
        }
        #duplicateCheckModal .dup-match-photo {
            flex: 0 0 80px;
        }
        #duplicateCheckModal .dup-match-photo img {
            width: 80px;
            height: 80px;
            object-fit: cover;
            border-radius: 8px;
        }
        #duplicateCheckModal .dup-no-photo {
            width: 80px;
            height: 80px;
            background: #e9ecef;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2rem;
            color: #adb5bd;
        }
        #duplicateCheckModal .dup-match-info h4 {
            margin: 0 0 0.5rem;
            font-size: 1rem;
            color: #212529;
        }
        #duplicateCheckModal .dup-match-info p {
            margin: 0.25rem 0;
            font-size: 0.85rem;
            color: #6c757d;
        }
        #duplicateCheckModal .dup-match-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            padding: 0 1rem 1rem;
        }
        #duplicateCheckModal .tag {
            font-size: 0.7rem;
            padding: 0.25rem 0.6rem;
            border-radius: 20px;
            font-weight: 500;
        }
        #duplicateCheckModal .tag-name {
            background: #dc354520;
            color: #dc3545;
        }
        #duplicateCheckModal .tag-father {
            background: #6f42c120;
            color: #6f42c1;
        }
        #duplicateCheckModal .tag-place {
            background: #0d6efd20;
            color: #0d6efd;
        }
        #duplicateCheckModal .tag-date {
            background: #20c99720;
            color: #198754;
        }
        #duplicateCheckModal .dup-modal-footer {
            padding: 1.25rem 1.5rem;
            background: #f8f9fa;
            border-top: 1px solid #dee2e6;
        }
        #duplicateCheckModal .dup-footer-note {
            margin: 0 0 1rem;
            font-size: 0.85rem;
            color: #6c757d;
            text-align: center;
        }
        #duplicateCheckModal .dup-modal-actions {
            display: flex;
            gap: 1rem;
            justify-content: center;
        }
        @media (max-width: 500px) {
            #duplicateCheckModal .dup-modal-actions {
                flex-direction: column;
            }
        }
        #duplicateCheckModal .dup-btn-cancel {
            background: #6c757d;
            color: #fff;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            transition: background 0.2s;
        }
        #duplicateCheckModal .dup-btn-cancel:hover {
            background: #5a6268;
        }
        #duplicateCheckModal .dup-btn-proceed {
            background: #2c5530;
            color: #fff;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            transition: background 0.2s;
        }
        #duplicateCheckModal .dup-btn-proceed:hover {
            background: #1e3d22;
        }
    `;
    
    // Remove existing styles if any
    const existingStyle = document.getElementById('duplicateModalStyles');
    if (existingStyle) existingStyle.remove();
    
    document.head.appendChild(style);
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Event handlers
    const closeModal = () => {
        modal.remove();
        document.body.style.overflow = '';
    };
    
    modal.querySelector('.dup-modal-close').addEventListener('click', () => {
        closeModal();
        if (onCancel) onCancel();
    });
    
    modal.querySelector('.dup-btn-cancel').addEventListener('click', () => {
        closeModal();
        if (onCancel) onCancel();
    });
    
    modal.querySelector('.dup-btn-proceed').addEventListener('click', () => {
        closeModal();
        if (onProceed) onProceed();
    });
    
    // Close on overlay click
    modal.querySelector('.dup-modal-overlay').addEventListener('click', (e) => {
        if (e.target.classList.contains('dup-modal-overlay')) {
            closeModal();
            if (onCancel) onCancel();
        }
    });
    
    // Close on Escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            if (onCancel) onCancel();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Initialize everything once DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    if (formInitialized) return; // Prevent double initialization
    formInitialized = true;
    
    console.log('🎯 Initializing add-martyr form...');
    
    // Try to load Firebase modules first
    await loadFirebaseModules();
    
    // Initialize form handlers
    initializeFormHandlers();
    
    // Initialize validation
    initializeValidation();
    
    console.log('✅ Form initialization complete');
});

function initializeFormHandlers() {
    const form = document.getElementById('addMartyrForm');
    
    if (form) {
        // Handle form submission
        form.addEventListener('submit', handleFormSubmit);
        
        // Initialize file upload handlers
        initFileUploads();

        // Initialize helper text for date fields
        initDateHelpers();
        
        // Initialize organization dropdown handler
        initOrganizationDropdown();
    }
}

// Initialize organization dropdown to show/hide "Other" input field
function initOrganizationDropdown() {
    const orgSelect = document.getElementById('organization');
    const otherOrgGroup = document.getElementById('otherOrgGroup');
    const otherOrgInput = document.getElementById('organizationOther');
    
    if (orgSelect && otherOrgGroup) {
        orgSelect.addEventListener('change', function() {
            if (this.value === 'Other') {
                otherOrgGroup.style.display = 'block';
                if (otherOrgInput) {
                    otherOrgInput.focus();
                }
            } else {
                otherOrgGroup.style.display = 'none';
                if (otherOrgInput) {
                    otherOrgInput.value = ''; // Clear the field when not "Other"
                }
            }
        });
    }
}

// Get the final organization value (handles dropdown + "Other" input)
function getOrganizationValue() {
    const orgSelect = document.getElementById('organization');
    const otherOrgInput = document.getElementById('organizationOther');
    
    if (!orgSelect) return '';
    
    const selectedValue = orgSelect.value;
    
    if (selectedValue === 'Other' && otherOrgInput && otherOrgInput.value.trim()) {
        return otherOrgInput.value.trim();
    }
    
    return selectedValue;
}

// Initialize helper text for date fields so users can verify their selections
function initDateHelpers() {
    const birthInput = document.getElementById('birthDate');
    const martyrInput = document.getElementById('martyrdomDate');
    const birthHelper = document.getElementById('birthDateHelper');
    const martyrHelper = document.getElementById('martyrdomDateHelper');

    const attachHelper = (input, helper, label) => {
        if (!input || !helper) return;
        const update = () => {
            const value = (input.value || '').trim();
            if (!value) {
                helper.textContent = '';
                return;
            }
            const pretty = formatDateForHelper(value);
            helper.textContent = pretty
                ? `${label}: ${pretty}`
                : 'Please pick a valid date.';
        };
        input.addEventListener('change', update);
        input.addEventListener('blur', update);
    };

    attachHelper(birthInput, birthHelper, 'You selected');
    attachHelper(martyrInput, martyrHelper, 'You selected');
}

// Initialize file upload handlers
function initFileUploads() {
    // Main photo upload
    const martyrPhoto = document.getElementById('martyrPhoto');
    const photoPreview = document.getElementById('photoPreview');
    
    if (martyrPhoto) {
        martyrPhoto.addEventListener('change', function(e) {
            handlePhotoUpload(e, photoPreview, false);
        });
        
        // Update file upload display text
        const fileDisplay = martyrPhoto.parentElement.querySelector('.file-upload-text');
        martyrPhoto.addEventListener('change', function() {
            if (this.files.length > 0) {
                fileDisplay.textContent = this.files[0].name;
            } else {
                fileDisplay.textContent = 'Choose a photo...';
            }
        });
    }
    
    // Additional photos upload
    const additionalPhotos = document.getElementById('additionalPhotos');
    const additionalPreview = document.getElementById('additionalPhotosPreview');
    
    if (additionalPhotos) {
        additionalPhotos.addEventListener('change', function(e) {
            handlePhotoUpload(e, additionalPreview, true);
        });
        
        // Update file upload display text
        const fileDisplay = additionalPhotos.parentElement.querySelector('.file-upload-text');
        additionalPhotos.addEventListener('change', function() {
            if (this.files.length > 0) {
                fileDisplay.textContent = `${this.files.length} photo(s) selected`;
            } else {
                fileDisplay.textContent = 'Choose photos...';
            }
        });
    }
    
    // Style file upload buttons
    const fileUploadButtons = document.querySelectorAll('.file-upload-display button');
    fileUploadButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const input = this.closest('.file-upload-wrapper').querySelector('input[type="file"]');
            input.click();
        });
    });
}

// Compress image to reduce upload size and improve Gulf region connectivity
function compressImage(file, maxWidth = 800, maxHeight = 600, quality = 0.8) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = function() {
            // Calculate new dimensions
            let { width, height } = img;
            
            if (width > height) {
                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = (width * maxHeight) / height;
                    height = maxHeight;
                }
            }
            
            canvas.width = width;
            canvas.height = height;
            
            // Draw and compress
            ctx.drawImage(img, 0, 0, width, height);
            
            // Convert to blob with compression
            canvas.toBlob(resolve, 'image/jpeg', quality);
        };
        
        img.src = URL.createObjectURL(file);
    });
}

// Handle photo upload and preview with compression
function handlePhotoUpload(event, previewContainer, multiple) {
    const files = event.target.files;
    
    if (files.length === 0) {
        previewContainer.innerHTML = '';
        return;
    }
    
    previewContainer.innerHTML = '';
    
    if (multiple) {
        // Handle multiple photos
        Array.from(files).forEach(async file => {
            if (file.type.startsWith('image/')) {
                console.log(`📷 Original file size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
                
                // Compress image
                const compressedFile = await compressImage(file);
                console.log(`🗜️ Compressed file size: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`);
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.alt = 'Preview';
                    previewContainer.appendChild(img);
                };
                reader.readAsDataURL(compressedFile);
            }
        });
    } else {
        // Handle single photo with compression
        const file = files[0];
        
        if (file && file.type.startsWith('image/')) {
            console.log(`📷 Original file size: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
            
            // Show compression progress
            previewContainer.innerHTML = '<p style="text-align: center; color: #666;">🗜️ Compressing image for better upload...</p>';
            
            // Compress image for better Gulf region upload
            compressImage(file).then(compressedFile => {
                const originalSize = (file.size / 1024 / 1024).toFixed(2);
                const compressedSize = (compressedFile.size / 1024 / 1024).toFixed(2);
                const reduction = (((file.size - compressedFile.size) / file.size) * 100).toFixed(0);
                
                console.log(`🗜️ Compressed: ${originalSize}MB → ${compressedSize}MB (${reduction}% smaller)`);
                
                // Store compressed file for form submission
                event.target.compressedFile = compressedFile;
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    // Clear compression message and show image
                    previewContainer.innerHTML = '';
                    
                    const img = document.createElement('img');
                    img.src = e.target.result;
                    img.alt = 'Martyr Photo Preview';
                    previewContainer.appendChild(img);
                    
                    // Add compression info
                    const compressionInfo = document.createElement('p');
                    compressionInfo.style.cssText = 'font-size: 12px; color: #28a745; margin: 5px 0; text-align: center;';
                    compressionInfo.innerHTML = `✅ Compressed: ${originalSize}MB → ${compressedSize}MB (${reduction}% smaller)`;
                    previewContainer.appendChild(compressionInfo);
                };
                reader.readAsDataURL(compressedFile);
            });
        }
    }
}

// Handle form submission with security validation
function handleFormSubmit(event) {
    event.preventDefault();
    console.log('📋 Form submission started');
    
    // Rate limiting check (max 3 submissions per 5 minutes)
    const rateCheck = checkRateLimit('martyr_submission', 3, 300000);
    if (!rateCheck.allowed) {
        logSecurityEvent('rate_limit_exceeded', { action: 'martyr_submission' });
        alert(`⚠️ Too many submissions. Please wait ${rateCheck.waitSeconds} seconds before trying again.`);
        return;
    }
    
    try {
        const form = event.target;
        const formData = new FormData(form);
        
        // Validate required fields first
        const requiredFields = ['fullName', 'martyrdomDate', 'submitterName', 'submitterEmail'];
        for (const field of requiredFields) {
            const value = formData.get(field);
            if (!value || value.toString().trim() === '') {
                alert(`❌ Please fill in the required field: ${field}`);
                // Focus on the missing field
                const fieldElement = form.querySelector(`[name="${field}"]`);
                if (fieldElement) fieldElement.focus();
                return; // Stop submission
            }
        }
        
        // Validate email format
        const emailValidation = validateEmail(formData.get('submitterEmail'));
        if (!emailValidation.valid) {
            alert(`❌ ${emailValidation.error}`);
            const emailField = form.querySelector('[name="submitterEmail"]');
            if (emailField) emailField.focus();
            return;
        }
        
        console.log('✅ Form validation passed');
        
        // Normalize date strings to protect against subtle browser / timezone issues
        const rawBirth = (formData.get('birthDate') || '').toString().trim();
        const rawMartyrdom = (formData.get('martyrdomDate') || '').toString().trim();

        const normalizedBirth = rawBirth ? normalizeDateString(rawBirth) : '';
        const normalizedMartyrdom = normalizeDateString(rawMartyrdom);

        if (rawBirth && !normalizedBirth) {
            alert('Date of Birth looks invalid. Please select it again.');
            const birthField = form.querySelector('#birthDate');
            if (birthField) birthField.focus();
            return;
        }
        if (!normalizedMartyrdom) {
            alert('Date of Martyrdom looks invalid. Please select it again.');
            const martyrField = form.querySelector('#martyrdomDate');
            if (martyrField) martyrField.focus();
            return;
        }

        // Optional logical check: birth after martyrdom
        if (normalizedBirth && normalizedMartyrdom && normalizedBirth > normalizedMartyrdom) {
            const proceed = confirm('Warning: Date of birth is after date of martyrdom.\n\nIf this is not correct, press Cancel and fix the dates.');
            if (!proceed) {
                const birthField = form.querySelector('#birthDate');
                if (birthField) birthField.focus();
                return;
            }
        }

        // Let the user confirm key dates before saving to the memorial database
        const prettyBirth = normalizedBirth ? formatDateForHelper(normalizedBirth) : 'Not provided';
        const prettyMartyrdom = formatDateForHelper(normalizedMartyrdom) || 'Unknown';
        const confirmMessage = [
            'Please confirm the key dates before submitting:',
            '',
            `Name: ${formData.get('fullName').toString().trim()}`,
            `Date of Birth: ${prettyBirth}`,
            `Date of Martyrdom: ${prettyMartyrdom}`,
            '',
            'If any date is incorrect, press Cancel and fix it. Continue?'
        ].join('\n');

        if (!confirm(confirmMessage)) {
            return;
        }
        
        // Show loading immediately
        showLoadingState();
        
        // Create martyr object with sanitized inputs
        const martyrData = {
            fullName: sanitizeInput(formData.get('fullName'), { maxLength: 200 }),
            birthDate: normalizedBirth,
            martyrdomDate: normalizedMartyrdom,
            birthPlace: sanitizeInput(formData.get('birthPlace') || '', { maxLength: 200 }),
            martyrdomPlace: sanitizeInput(formData.get('martyrdomPlace') || '', { maxLength: 200 }),
            biography: sanitizeInput(formData.get('biography') || '', { maxLength: 5000, allowNewlines: true }),
            organization: sanitizeInput(getOrganizationValue() || '', { maxLength: 200 }),
            rank: sanitizeInput(formData.get('rank') || '', { maxLength: 100 }),
            fatherName: sanitizeInput(formData.get('fatherName') || '', { maxLength: 200 }),
            submitterName: sanitizeInput(formData.get('submitterName'), { maxLength: 200 }),
            submitterEmail: emailValidation.sanitized,
            submitterRelation: sanitizeInput(formData.get('submitterRelation') || '', { maxLength: 200 }),
            submittedAt: new Date().toISOString()
        };
        
        // Log submission attempt for security monitoring
        logSecurityEvent('form_submission', { name: martyrData.fullName, hasPhoto: !!formData.get('martyrPhoto') });
        
        console.log('📋 Martyr data prepared:', { name: martyrData.fullName, fields: Object.keys(martyrData).length });
        
        // Handle photo data
        const photoInput = document.getElementById('martyrPhoto');
        const compressedFile = photoInput && photoInput.compressedFile;
        const photoFile = compressedFile || (photoInput && photoInput.files[0]);
        
        if (photoFile && photoFile.size > 0) {
            console.log('📷 Processing photo for submission...');
            const reader = new FileReader();
            
            reader.onload = function(e) {
                martyrData.photo = e.target.result;
                console.log('🗜️ Photo data ready, saving martyr data...');
                saveMartyrData(martyrData);
            };
            
            reader.onerror = function() {
                console.error('❌ Photo processing failed');
                hideLoadingState();
                alert('❌ Error processing photo. Please try a different image.');
            };
            
            reader.readAsDataURL(photoFile);
        } else {
            console.log('📷 No photo provided, proceeding with submission...');
            // No photo, proceed with submission
            saveMartyrData(martyrData);
        }
        
    } catch (error) {
        console.error('❌ Form submission error:', error);
        hideLoadingState();
        alert('❌ Form submission error. Please try again.');
    }
}

// Save martyr data permanently to Firebase database only
async function saveMartyrData(martyrData, skipDuplicateCheck = false) {
    console.log('💾 Starting to save martyr data permanently to Firebase...', { name: martyrData.fullName });
    
    try {
        // Check for duplicates before saving (unless explicitly skipped)
        if (!skipDuplicateCheck && existingMartyrs.length > 0) {
            console.log('🔍 Checking for potential duplicates...');
            const duplicates = findPotentialDuplicates(martyrData);
            
            if (duplicates.length > 0) {
                console.log(`⚠️ Found ${duplicates.length} potential duplicate(s)`);
                hideLoadingState();
                
                // Show duplicate warning modal and wait for user decision
                showDuplicateModal(
                    martyrData,
                    duplicates,
                    // On proceed (user confirms it's not a duplicate)
                    () => {
                        console.log('✅ User confirmed submission is not a duplicate');
                        showLoadingState();
                        saveMartyrData(martyrData, true); // Skip duplicate check on retry
                    },
                    // On cancel
                    () => {
                        console.log('❌ User cancelled submission due to duplicate warning');
                    }
                );
                return; // Stop here and wait for user decision
            }
        }
        
        // Ensure loading state is shown
        showLoadingState();
        
        // Add unique ID and status for tracking
        martyrData.id = 'martyr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        martyrData.status = 'pending';
        martyrData.submittedAt = new Date().toISOString();
        
        // Ensure Firebase is available - this is mandatory for permanent storage
        if (!firebaseAvailable || !firebaseDB) {
            console.error('❌ Firebase database is not available - cannot proceed with permanent storage');
            hideLoadingState();
            
            const firebaseRequiredMsg = `
❌ Database Connection Required

This memorial requires a permanent database connection to store submissions.

Please:
1. Refresh the page and wait for the database to load
2. Check your internet connection
3. Try again in a few moments
4. Contact support if this continues

We cannot store your submission locally as it needs to be permanently preserved for this important memorial.
            `.trim();
            
            alert(firebaseRequiredMsg);
            return;
        }
        
        // Attempt Firebase save with automatic retry mechanism
        let saveSuccess = false;
        let lastError = null;
        const maxRetries = 3;
        const baseDelay = 2000; // 2 seconds
        
        console.log('🔥 Firebase is available, attempting permanent save with retry mechanism...');
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            console.log(`🎯 Save attempt ${attempt}/${maxRetries} for martyr: ${martyrData.fullName}`);
            
            try {
                // Update loading message for retry attempts
                if (attempt > 1) {
                    const loadingDiv = document.getElementById('loadingOverlay');
                    if (loadingDiv) {
                        const loadingText = loadingDiv.querySelector('.loading-text');
                        if (loadingText) {
                            loadingText.textContent = `Saving to permanent database... (Attempt ${attempt}/${maxRetries})`;
                        }
                    }
                }
                
                // Extended timeout for regional connectivity (Gulf, Pakistan, etc.)
                const timeoutDuration = 20000 + (attempt - 1) * 10000; // 20s, 30s, 40s
                
                const firebasePromise = firebaseDB.addPendingMartyr(martyrData);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`Firebase timeout after ${timeoutDuration/1000}s - attempt ${attempt}`)), timeoutDuration)
                );
                
                const result = await Promise.race([firebasePromise, timeoutPromise]);
                
                if (result && result.success) {
                    console.log(`✅ Martyr saved to Firebase permanently on attempt ${attempt}:`, result.id);
                    saveSuccess = true;
                    break; // Success! Exit retry loop
                } else {
                    lastError = result ? result.error : `Unknown Firebase error on attempt ${attempt}`;
                    console.warn(`🔥 Firebase save failed on attempt ${attempt}:`, lastError);
                    throw new Error(lastError);
                }
            } catch (error) {
                lastError = error.message;
                console.warn(`🌍 Firebase connectivity issue on attempt ${attempt}:`, lastError);
                
                // Wait before retry (exponential backoff)
                if (attempt < maxRetries) {
                    const delay = baseDelay * Math.pow(2, attempt - 1); // 2s, 4s, 8s
                    console.log(`⏳ Waiting ${delay/1000}s before retry...`);
                    
                    // Show countdown in loading message
                    for (let countdown = Math.ceil(delay/1000); countdown > 0; countdown--) {
                        const loadingDiv = document.getElementById('loadingOverlay');
                        if (loadingDiv) {
                            const loadingText = loadingDiv.querySelector('.loading-text');
                            if (loadingText) {
                                loadingText.textContent = `Retrying in ${countdown} seconds... (Attempt ${attempt+1}/${maxRetries})`;
                            }
                        }
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                } else {
                    // Final attempt failed
                    console.error(`❌ All ${maxRetries} save attempts failed for permanent storage`);
                }
            }
        }
        
        // Always hide loading state
        hideLoadingState();
        
        if (saveSuccess) {
            // Success - redirect to confirmation
            console.log('✅ Submission permanently saved to Firebase, redirecting to confirmation...');
            
            // Store success info for confirmation page (temporary storage only for UX)
            localStorage.setItem('lastSubmittedMartyr', martyrData.fullName);
            localStorage.setItem('lastSubmissionInfo', JSON.stringify({
                savedToFirebase: true,
                savedPermanently: true,
                submittedAt: martyrData.submittedAt,
                martyrId: martyrData.id,
                attempts: maxRetries
            }));
            
            // Small delay to ensure localStorage is written for UX
            setTimeout(() => {
                console.log('🔄 Redirecting to confirmation page...');
                window.location.href = 'confirmation.html?name=' + encodeURIComponent(martyrData.fullName);
            }, 100);
            
        } else {
            // All attempts failed - cannot proceed without permanent storage
            console.error('❌ Permanent storage failed after all retry attempts');
            
            const permanentStorageError = `
❌ Permanent Storage Failed

We could not save your submission to the permanent memorial database after ${maxRetries} attempts.

Last error: ${lastError || 'Connection timeout'}

This memorial requires permanent storage to honor the martyrs properly. Please:

1. Check your internet connection
2. Refresh the page completely
3. Try again - your form data is preserved
4. If you're in a region with connectivity issues, please wait and retry
5. Contact support if this continues

We apologize for the inconvenience. The memorial must ensure all submissions are permanently preserved.
            `.trim();
            
            alert(permanentStorageError);
            
            // Don't redirect on failure - let user retry
            return;
        }
        
    } catch (error) {
        console.error('❌ Critical error in permanent storage system:', error);
        
        // Always ensure loading state is hidden
        hideLoadingState();
        
        const criticalErrorMsg = `
❌ Critical Database Error

A critical error occurred in the permanent storage system.

Error: ${error.message}

This memorial requires reliable permanent storage. Please:

1. Refresh the page completely
2. Clear your browser cache
3. Try with a smaller image if applicable
4. Contact support immediately with this error message

We cannot proceed without ensuring permanent storage for this important memorial.
        `.trim();
        
        alert(criticalErrorMsg);
    }
}

// Show loading state during submission
function showLoadingState() {
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = '⏳ Saving...';
        submitBtn.style.opacity = '0.7';
        console.log('🔄 Loading state shown');
    }
}

// Hide loading state after submission
function hideLoadingState() {
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Memorial';
        submitBtn.style.opacity = '1';
        console.log('✅ Loading state hidden');
    }
}

// Show success message
function showSuccessMessage() {
    const form = document.getElementById('addMartyrForm');
    const successMessage = document.getElementById('successMessage');
    
    if (form && successMessage) {
        form.style.display = 'none';
        successMessage.style.display = 'block';
        
        // Scroll to success message
        successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Hide success message and show form again after 5 seconds
        setTimeout(() => {
            successMessage.style.display = 'none';
            form.style.display = 'block';
        }, 5000);
    }
}

// Clear photo previews
function clearPreviews() {
    const photoPreview = document.getElementById('photoPreview');
    const additionalPreview = document.getElementById('additionalPhotosPreview');
    
    if (photoPreview) photoPreview.innerHTML = '';
    if (additionalPreview) additionalPreview.innerHTML = '';
    
    // Reset file upload text
    const fileTexts = document.querySelectorAll('.file-upload-text');
    fileTexts.forEach((text, index) => {
        text.textContent = index === 0 ? 'Choose a photo...' : 'Choose photos...';
    });
}

// Reset form function (called from HTML)
function resetForm() {
    const form = document.getElementById('addMartyrForm');
    if (form) {
        form.reset();
        clearPreviews();
    }
}

// Form validation initialization (separate function to avoid duplicate listeners)
function initializeValidation() {
    const form = document.getElementById('addMartyrForm');
    
    if (form) {
        console.log('🔍 Initializing form validation...');
        
        // Add real-time validation
        const requiredFields = form.querySelectorAll('[required]');
        
        requiredFields.forEach(field => {
            // Remove existing listeners to prevent duplicates
            field.removeEventListener('blur', validateField);
            field.addEventListener('blur', function() {
                validateField(this);
            });
        });
        
        console.log('✅ Form validation initialized for', requiredFields.length, 'required fields');
    }
}

// Validate individual field
function validateField(field) {
    if (field.value.trim() === '') {
        field.classList.add('error');
        showFieldError(field, 'This field is required');
    } else {
        field.classList.remove('error');
        clearFieldError(field);
        
        // Additional validation for email
        if (field.type === 'email' && !isValidEmail(field.value)) {
            field.classList.add('error');
            showFieldError(field, 'Please enter a valid email address');
        }
    }
}

// Show field error message
function showFieldError(field, message) {
    let errorElement = field.parentElement.querySelector('.field-error');
    
    if (!errorElement) {
        errorElement = document.createElement('span');
        errorElement.className = 'field-error';
        errorElement.style.color = 'red';
        errorElement.style.fontSize = '0.875rem';
        errorElement.style.marginTop = '0.25rem';
        errorElement.style.display = 'block';
        field.parentElement.appendChild(errorElement);
    }
    
    errorElement.textContent = message;
}

// Clear field error message
function clearFieldError(field) {
    const errorElement = field.parentElement.querySelector('.field-error');
    if (errorElement) {
        errorElement.remove();
    }
}

// Email validation helper
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Normalize a date string from the <input type="date"> field into YYYY-MM-DD.
// Returns '' for empty input or null if the value cannot be parsed.
function normalizeDateString(value) {
    if (!value) return '';
    const str = value.toString().trim();
    if (!str) return '';

    const parts = str.split('-');
    if (parts.length !== 3) return null;

    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);

    if (!year || !month || !day) return null;

    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return null;

    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

// Format a YYYY-MM-DD string into a friendly "Month Day, Year" text for helpers/confirmations
function formatDateForHelper(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return '';
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    if (!year || !month || !day) return '';
    const date = new Date(year, month - 1, day);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}
