// Admin panel JavaScript for moderating submissions

// Import authentication module
import { adminAuth } from './auth.js';
import { escapeHTML, sanitizeInput, checkRateLimit, logSecurityEvent } from './security.js';

// Use auth.js module for authentication validation
function validateAdminAuth(actionName = 'admin action') {
    return adminAuth.validateAdminAction(actionName);
}

// Track loaded pending records so edits/approvals stay synchronized
let cachedPendingMartyrs = [];

function getSafeAdminPhotoSrc(martyr, allowStaticAsset = true) {
    if (!martyr || martyr.photoRemoved === true) return '';
    const candidates = [martyr.photoPath, martyr.photo];
    for (const candidate of candidates) {
        if (typeof candidate !== 'string') continue;
        const trimmed = candidate.trim();
        if (
            trimmed.startsWith('data:image/') ||
            trimmed.startsWith('https://') ||
            trimmed.startsWith('/media/') ||
            trimmed.startsWith('/assets/photos/')
        ) {
            return trimmed;
        }
    }
    if (allowStaticAsset && martyr.id) {
        return `/assets/photos/${encodeURIComponent(martyr.id)}.jpg`;
    }
    return '';
}

function syncPendingMartyrInLocalStorage(martyrId, updatedFields) {
    try {
        const raw = localStorage.getItem('pendingMartyrs');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return;
        const idx = parsed.findIndex((m) => m && m.id === martyrId);
        if (idx !== -1) {
            parsed[idx] = { ...parsed[idx], ...updatedFields };
            localStorage.setItem('pendingMartyrs', JSON.stringify(parsed));
        }
    } catch (_) {
        // Ignore storage errors (e.g., quota when storing compressed data URIs)
    }
}

function compressImageForAdmin(file, maxWidth = 600, maxHeight = 450, quality = 0.72) {
    return new Promise((resolve, reject) => {
        if (!file || !file.type || !file.type.startsWith('image/')) {
            reject(new Error('Please select a valid image file (JPEG, PNG, or WebP).'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read the selected image file.'));
        reader.onload = (event) => {
            const img = new Image();
            img.onerror = () => reject(new Error('Could not decode the selected image.'));
            img.onload = () => {
                let width = img.naturalWidth || img.width || maxWidth;
                let height = img.naturalHeight || img.height || maxHeight;
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.max(1, Math.round(width * ratio));
                    height = Math.max(1, Math.round(height * ratio));
                }

                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Browser canvas image compression is unavailable.'));
                    return;
                }
                canvas.width = width;
                canvas.height = height;
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                let currentQuality = quality;
                let dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
                const maxDataUriBytes = 740 * 1024;
                while (dataUrl.length > maxDataUriBytes && currentQuality > 0.25) {
                    currentQuality -= 0.1;
                    dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
                }

                let scalePass = 0;
                while (dataUrl.length > maxDataUriBytes && scalePass < 4) {
                    scalePass++;
                    canvas.width = Math.max(64, Math.round(canvas.width * 0.72));
                    canvas.height = Math.max(64, Math.round(canvas.height * 0.72));
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    dataUrl = canvas.toDataURL('image/jpeg', 0.5);
                }

                resolve(dataUrl);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
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
        .replace(/^(shaheed|martyr|shahid|mama|ustad|commander|captain|dr\.?|mr\.?|ms\.?|mrs\.?)\s+/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Extract primary name and alias parts (e.g. "Ali Nawaz Mengal, alias Faraz" -> ["ali nawaz mengal", "faraz"])
function extractNameParts(rawName) {
    const norm = normalizeName(rawName);
    if (!norm) return [];
    const parts = norm
        .split(/(?:,\s*alias\s+|\s+alias\s+|\s+a\.?k\.?a\.?\s+|\(|\)|\/)/i)
        .map(p => p.replace(/^alias\s+/i, '').trim())
        .filter(p => p.length >= 2);
    return parts.length > 0 ? [norm, ...parts] : [norm];
}

// Compute best name similarity across full name and alias segments
function calculateBestNameSimilarity(nameA, nameB) {
    const normA = normalizeName(nameA);
    const normB = normalizeName(nameB);
    if (!normA || !normB) return 0;
    if (normA === normB) return 1.0;

    let best = calculateStringSimilarity(normA, normB);
    const partsA = extractNameParts(nameA);
    const partsB = extractNameParts(nameB);

    for (const a of partsA) {
        for (const b of partsB) {
            if (a === b && a.length >= 4) {
                best = Math.max(best, 0.94);
            } else if (a.length >= 4 && b.length >= 4) {
                best = Math.max(best, calculateStringSimilarity(a, b));
            }
        }
    }
    return best;
}

// Calculate overall similarity score between two martyrs (dynamic weighting so missing optional fields don't hide a duplicate)
function calculateMartyrSimilarity(martyr1, martyr2) {
    const scores = {
        name: 0,
        fatherName: 0,
        birthPlace: 0,
        martyrdomPlace: 0,
        martyrdomDate: 0,
        birthDate: 0
    };
    
    // Name similarity
    scores.name = calculateBestNameSimilarity(martyr1.fullName, martyr2.fullName);
    
    // Father name similarity
    const hasFather = Boolean(martyr1.fatherName && martyr1.fatherName.toString().trim() && martyr2.fatherName && martyr2.fatherName.toString().trim());
    if (hasFather) {
        scores.fatherName = calculateBestNameSimilarity(martyr1.fatherName, martyr2.fatherName);
    }
    
    // Birth place similarity
    const hasBirthPlace = Boolean(martyr1.birthPlace && martyr1.birthPlace.toString().trim() && martyr2.birthPlace && martyr2.birthPlace.toString().trim());
    if (hasBirthPlace) {
        scores.birthPlace = calculateStringSimilarity(
            martyr1.birthPlace.toString().toLowerCase(),
            martyr2.birthPlace.toString().toLowerCase()
        );
    }
    
    // Martyrdom place similarity
    const hasMartyrPlace = Boolean(martyr1.martyrdomPlace && martyr1.martyrdomPlace.toString().trim() && martyr2.martyrdomPlace && martyr2.martyrdomPlace.toString().trim());
    if (hasMartyrPlace) {
        scores.martyrdomPlace = calculateStringSimilarity(
            martyr1.martyrdomPlace.toString().toLowerCase(),
            martyr2.martyrdomPlace.toString().toLowerCase()
        );
    }
    
    // Date comparisons
    const getDateString = (dateVal) => {
        if (!dateVal) return '';
        if (dateVal.toDate && typeof dateVal.toDate === 'function') {
            return dateVal.toDate().toISOString().split('T')[0];
        }
        if (typeof dateVal === 'object' && typeof dateVal.seconds === 'number') {
            return new Date(dateVal.seconds * 1000).toISOString().split('T')[0];
        }
        if (typeof dateVal === 'string') return dateVal.split('T')[0];
        if (dateVal instanceof Date) return dateVal.toISOString().split('T')[0];
        return '';
    };
    
    const date1_martyrdom = getDateString(martyr1.martyrdomDate);
    const date2_martyrdom = getDateString(martyr2.martyrdomDate);
    const hasMartyrDate = Boolean(date1_martyrdom && date2_martyrdom);
    if (hasMartyrDate) {
        scores.martyrdomDate = date1_martyrdom === date2_martyrdom ? 1.0 : 0;
    }
    
    const date1_birth = getDateString(martyr1.birthDate);
    const date2_birth = getDateString(martyr2.birthDate);
    const hasBirthDate = Boolean(date1_birth && date2_birth);
    if (hasBirthDate) {
        scores.birthDate = date1_birth === date2_birth ? 1.0 : 0;
    }
    
    // Dynamic weighted score so missing optional fields don't penalize a real duplicate
    let weightedSum = scores.name * 0.55;
    let totalWeight = 0.55;

    if (hasFather) {
        weightedSum += scores.fatherName * 0.20;
        totalWeight += 0.20;
    }
    if (hasBirthPlace) {
        weightedSum += scores.birthPlace * 0.08;
        totalWeight += 0.08;
    }
    if (hasMartyrPlace) {
        weightedSum += scores.martyrdomPlace * 0.10;
        totalWeight += 0.10;
    }
    if (hasMartyrDate) {
        weightedSum += scores.martyrdomDate * 0.10;
        totalWeight += 0.10;
    }
    if (hasBirthDate) {
        weightedSum += scores.birthDate * 0.05;
        totalWeight += 0.05;
    }

    let totalScore = totalWeight > 0 ? (weightedSum / totalWeight) : 0;

    // If the name itself is a very strong match (>= 0.85), ensure it surfaces as a potential duplicate
    if (scores.name >= 0.85) {
        let bonus = 0;
        if (scores.fatherName > 0.7) bonus += 0.06;
        if (scores.martyrdomPlace > 0.7) bonus += 0.04;
        if (scores.martyrdomDate > 0.8) bonus += 0.05;
        totalScore = Math.min(1.0, Math.max(totalScore, (scores.name * 0.86) + bonus));
    }
    
    return {
        total: totalScore,
        breakdown: scores
    };
}

// Find potential duplicates for a martyr being approved
async function findPotentialDuplicates(martyrToCheck, threshold = 0.62, customApprovedList = null) {
    console.log('🔍 Checking for potential duplicates for:', martyrToCheck.fullName);
    
    const duplicates = [];
    
    try {
        let approvedMartyrs = Array.isArray(customApprovedList) ? customApprovedList : null;

        if (!approvedMartyrs) {
            if (!window.firebaseDB) {
                console.warn('⚠️ Firebase not available for duplicate check');
                return duplicates;
            }
            
            const result = await window.firebaseDB.getApprovedMartyrs();
            if (!result.success || !result.data) {
                console.warn('⚠️ Could not fetch approved martyrs for duplicate check');
                return duplicates;
            }
            
            approvedMartyrs = result.data;
        }

        console.log(`📊 Checking against ${approvedMartyrs.length} approved martyrs`);
        
        for (const approved of approvedMartyrs) {
            if (!approved) continue;
            const similarity = calculateMartyrSimilarity(martyrToCheck, approved);
            
            if (similarity.total >= threshold || similarity.breakdown.name >= 0.84) {
                duplicates.push({
                    martyr: approved,
                    similarity: Math.max(similarity.total, similarity.breakdown.name * 0.85),
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

// Show duplicate warning modal - Side-by-side comparison view with Reject option
function showDuplicateWarningModal(martyrToApprove, duplicates, onConfirm, onCancel, onReject = null, batchMeta = null) {
    // Remove existing modal if present
    const existing = document.getElementById('duplicateWarningModal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'duplicateWarningModal';
    modal.className = 'duplicate-modal-overlay';

    const checkIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    const trashIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
    
    // Helper to create structured profile card HTML
    const createProfileCard = (martyr, breakdown = {}) => {
        const orgDisplay = martyr.organization || martyr.affiliation || '';
        const cardPhoto = getSafeAdminPhotoSrc(martyr, true);
        return `
            <div class="dup-profile-photo">
                ${cardPhoto ? 
                    `<img src="${escapeHTML(cardPhoto)}" alt="${escapeHTML(martyr.fullName)}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'dup-no-photo\\'><small>No Photo</small></div>';">` :
                    `<div class="dup-no-photo">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        <small>No Photo</small>
                    </div>`
                }
            </div>
            <div class="dup-profile-details">
                <h4 class="dup-profile-name">${escapeHTML(martyr.fullName)}</h4>
                <div class="dup-profile-fields">
                    <div class="dup-field${breakdown.fatherName > 0.7 ? ' is-matching-field' : ''}">
                        <span class="dup-field-label">Father</span>
                        <span class="dup-field-value">${martyr.fatherName ? escapeHTML(martyr.fatherName) : '<em>Not provided</em>'}</span>
                    </div>
                    <div class="dup-field${breakdown.birthPlace > 0.7 ? ' is-matching-field' : ''}">
                        <span class="dup-field-label">Birth Place</span>
                        <span class="dup-field-value">${martyr.birthPlace ? escapeHTML(martyr.birthPlace) : '<em>Not provided</em>'}</span>
                    </div>
                    <div class="dup-field${breakdown.martyrdomPlace > 0.7 ? ' is-matching-field' : ''}">
                        <span class="dup-field-label">Martyrdom Place</span>
                        <span class="dup-field-value">${martyr.martyrdomPlace ? escapeHTML(martyr.martyrdomPlace) : '<em>Not provided</em>'}</span>
                    </div>
                    <div class="dup-field${breakdown.martyrdomDate > 0.8 ? ' is-matching-field' : ''}">
                        <span class="dup-field-label">Martyrdom Date</span>
                        <span class="dup-field-value">${martyr.martyrdomDate ? formatDate(martyr.martyrdomDate) : '<em>Not provided</em>'}</span>
                    </div>
                    <div class="dup-field">
                        <span class="dup-field-label">Organization</span>
                        <span class="dup-field-value">${orgDisplay ? escapeHTML(orgDisplay) : '<em>Not provided</em>'}</span>
                    </div>
                </div>
            </div>
        `;
    };
    
    // Build comparison rows for each duplicate
    const comparisonRowsHtml = duplicates.slice(0, 3).map((dup) => {
        const similarity = (dup.similarity * 100).toFixed(0);
        const matchClass = similarity >= 90 ? 'match-critical' : similarity >= 80 ? 'match-high' : similarity >= 70 ? 'match-medium' : 'match-low';
        const matchLabel = similarity >= 90 ? 'Very High Similarity' : similarity >= 80 ? 'High Similarity' : similarity >= 70 ? 'Moderate Similarity' : 'Possible Match';
        const bd = dup.breakdown || {};
        
        return `
            <div class="dup-comparison-row">
                <div class="dup-match-indicator ${matchClass}">
                    <div class="dup-match-left">
                        <div class="dup-match-percent">${similarity}% Match</div>
                        <div>
                            <div class="dup-match-label">${matchLabel}</div>
                            <div class="dup-match-sub">Matching fields highlighted below</div>
                        </div>
                    </div>
                    <div class="dup-match-details">
                        ${bd.name > 0.7 ? `<span class="dup-match-tag match-name">${checkIconSvg} Name</span>` : ''}
                        ${bd.fatherName > 0.7 ? `<span class="dup-match-tag match-father">${checkIconSvg} Father</span>` : ''}
                        ${bd.birthPlace > 0.7 ? `<span class="dup-match-tag match-place">${checkIconSvg} Birth Place</span>` : ''}
                        ${bd.martyrdomPlace > 0.7 ? `<span class="dup-match-tag match-place">${checkIconSvg} Martyrdom Place</span>` : ''}
                        ${bd.martyrdomDate > 0.8 ? `<span class="dup-match-tag match-date">${checkIconSvg} Date</span>` : ''}
                    </div>
                </div>
                
                <div class="dup-side-by-side">
                    <div class="dup-profile-card dup-new-submission">
                        <div class="dup-card-header">
                            <span class="dup-card-badge new">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                Pending Submission
                            </span>
                            <span class="dup-card-status-hint">Awaiting Review</span>
                        </div>
                        <div class="dup-card-body">
                            ${createProfileCard(martyrToApprove, bd)}
                        </div>
                    </div>
                    
                    <div class="dup-vs-divider">
                        <span>VS</span>
                    </div>
                    
                    <div class="dup-profile-card dup-existing">
                        <div class="dup-card-header">
                            <span class="dup-card-badge existing">
                                ${checkIconSvg}
                                Published in Archive
                            </span>
                            <span class="dup-card-status-hint">Live Record</span>
                        </div>
                        <div class="dup-card-body">
                            ${createProfileCard(dup.martyr, bd)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    const batchHeaderBadge = batchMeta
        ? `<div class="dup-batch-pill">Batch Duplicate Review • ${batchMeta.current} of ${batchMeta.total}</div>`
        : '';
    const cancelBtnText = batchMeta ? 'Skip (Keep in Pending)' : 'Keep in Pending';

    modal.innerHTML = `
        <div class="duplicate-modal-content" role="dialog" aria-modal="true" aria-labelledby="dupModalTitle">
            <div class="duplicate-modal-header">
                <div class="dup-header-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                </div>
                <div class="dup-header-text">
                    ${batchHeaderBadge}
                    <h2 id="dupModalTitle">Potential Duplicate Detected</h2>
                    <p>This submission closely matches ${duplicates.length} existing profile${duplicates.length > 1 ? 's' : ''} in the memorial archive</p>
                </div>
                <button type="button" class="duplicate-modal-close" aria-label="Close">&times;</button>
            </div>
            
            <div class="duplicate-modal-body">
                <div class="dup-alert-banner">
                    <div class="dup-alert-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    </div>
                    <div class="dup-alert-text">
                        <strong>Match found in database.</strong>
                        Compare the pending submission against the published archive record below. You can <strong>Reject &amp; Delete</strong> the duplicate immediately, keep it in Pending, or approve it if it is a different person.
                    </div>
                </div>
                
                <div class="dup-comparisons-container">
                    ${comparisonRowsHtml}
                </div>
            </div>
            
            <div class="duplicate-modal-footer">
                <span class="dup-footer-hint">Choose how to handle this pending submission</span>
                <div class="dup-footer-actions">
                    <button type="button" class="btn dup-btn-cancel">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span class="btn-text">${cancelBtnText}</span>
                    </button>
                    ${onReject ? `
                    <button type="button" class="btn dup-btn-reject">
                        ${trashIconSvg}
                        <span class="btn-text">Reject Duplicate</span>
                    </button>
                    ` : ''}
                    <button type="button" class="btn dup-btn-approve">
                        ${checkIconSvg}
                        <span class="btn-text">Not a Duplicate — Approve</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    // Event handlers
    const closeModal = () => {
        modal.remove();
        document.body.style.overflow = 'auto';
        document.removeEventListener('keydown', escHandler);
    };
    
    modal.querySelector('.duplicate-modal-close').addEventListener('click', () => {
        closeModal();
        if (onCancel) onCancel();
    });
    
    modal.querySelector('.dup-btn-cancel').addEventListener('click', () => {
        closeModal();
        if (onCancel) onCancel();
    });

    const rejectModalBtn = modal.querySelector('.dup-btn-reject');
    if (rejectModalBtn && onReject) {
        rejectModalBtn.addEventListener('click', () => {
            closeModal();
            onReject();
        });
    }
    
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
    function escHandler(e) {
        if (e.key === 'Escape') {
            closeModal();
            if (onCancel) onCancel();
        }
    }
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
        const firebaseModule = await import('./firebase-config.js?v=20261116a');
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

    // Approve All Pending button
    const approveAllBtn = document.getElementById('approveAllPendingBtn');
    if (approveAllBtn) {
        approveAllBtn.addEventListener('click', approveAllPending);
        console.log('✅ Approve All Pending button event listener added');
    }

    // Edge D1 + R2 Status & 1-Click Sync button
    const syncEdgeBtn = document.getElementById('syncEdgeArchiveBtn');
    if (syncEdgeBtn) {
        syncEdgeBtn.addEventListener('click', handleSyncEdgeArchive);
    }
    refreshEdgeArchiveBanner();
    
    console.log('✅ Admin control buttons initialization completed');
    
    // Make functions globally accessible for HTML onclick handlers as backup
    window.refreshData = refreshData;
    window.exportData = exportData;
    window.importData = importData;
    window.clearAllPending = clearAllPending;
    window.approveAllPending = approveAllPending;
    window.handleSyncEdgeArchive = handleSyncEdgeArchive;
    window.loadPendingSubmissions = loadPendingSubmissions;
    window.loadApprovedMartyrs = loadApprovedMartyrs;
    window.showAdminToast = showAdminToast;
    console.log('🌎 Admin functions made globally accessible');

    // Initialize pending & approved search/filter controls
    initPendingSearch();
    initApprovedSearch();
}

async function refreshEdgeArchiveBanner() {
    const banner = document.getElementById('edgeInfraBanner');
    const textEl = document.getElementById('edgeInfraBannerText');
    const pillEl = document.getElementById('edgeInfraPill');
    if (!banner || !textEl || !window.firebaseDB?.getEdgeArchiveStatus) return;

    const status = await window.firebaseDB.getEdgeArchiveStatus();
    if (!status || !status.success) {
        banner.style.display = 'none';
        return;
    }

    banner.style.display = 'flex';
    const d1Label = status.d1Bound
        ? `D1 Edge DB: Active (${status.d1ApprovedCount || 0} profiles)`
        : 'D1 Edge DB: Pending binding';
    const r2Label = status.r2Bound
        ? `R2 Photo Shelf: Active (${status.activeMediaShard || 's1'}, ${status.d1MediaPathCount || 0} portraits)`
        : 'R2 Photo Shelf: Pending binding';

    if (pillEl) {
        pillEl.textContent = (status.d1Bound && status.r2Bound)
            ? '9.5/10 Edge Active'
            : (status.d1Bound || status.r2Bound ? 'Partial Edge' : 'Setup Ready');
        pillEl.style.background = (status.d1Bound && status.r2Bound)
            ? 'rgba(16, 185, 129, 0.14)'
            : 'rgba(245, 158, 11, 0.14)';
        pillEl.style.color = (status.d1Bound && status.r2Bound) ? '#047857' : '#92400e';
    }
    textEl.textContent = `${d1Label} • ${r2Label}`;
}

async function handleSyncEdgeArchive() {
    const syncBtn = document.getElementById('syncEdgeArchiveBtn');
    const textEl = document.getElementById('edgeInfraBannerText');
    const banner = document.getElementById('edgeInfraBanner');
    if (!window.firebaseDB?.syncAllToEdgeArchive) {
        showAdminToast('Edge sync function unavailable.', 'error');
        return;
    }
    if (!validateAdminAuth('sync archive to edge')) return;

    const originalHtml = syncBtn ? syncBtn.innerHTML : '';
    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.textContent = 'Syncing Edge...';
    }
    if (banner) banner.style.display = 'flex';
    if (textEl) textEl.textContent = 'Checking Cloudflare D1 + R2 readiness and reading Firestore...';

    try {
        const res = await window.firebaseDB.syncAllToEdgeArchive((progress) => {
            if (textEl && progress?.message) {
                textEl.textContent = progress.message;
            }
        });
        if (!res.success) {
            showAdminToast(res.error || 'Edge sync failed.', 'error');
            if (textEl) textEl.textContent = `Edge sync error: ${res.error || 'unknown error'}`;
            return;
        }
        await refreshEdgeArchiveBanner();
        await loadApprovedMartyrs();
        const summary = `Synced ${res.totalRecords} records${res.d1Bound ? ` (D1: ${res.d1Written})` : ''}${res.r2Bound ? ` • Uploaded ${res.r2Uploaded} portraits to R2` : ''}`;
        showAdminToast(summary, 'success');
    } catch (err) {
        showAdminToast(err?.message || 'Edge sync failed.', 'error');
    } finally {
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = originalHtml;
        }
    }
}

// Helper to show/hide and update the "Approve All Pending" button state
function updateApproveAllButtonState(count) {
    const btn = document.getElementById('approveAllPendingBtn');
    const textEl = document.getElementById('approveAllPendingText');
    if (!btn) return;
    const safeCount = Math.max(0, Number(count) || 0);
    if (safeCount > 0) {
        btn.style.display = 'inline-flex';
        if (textEl && !btn.disabled) {
            textEl.textContent = `Approve All Pending (${safeCount})`;
        }
    } else {
        btn.style.display = 'none';
    }
}

// Non-blocking toast notification helper
function showAdminToast(message, type = 'success') {
    let container = document.getElementById('adminToastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'adminToastContainer';
        container.className = 'admin-toast-container';
        document.body.appendChild(container);
    }
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };
    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || '✅'}</span><span>${escapeHTML(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 260);
    }, 4000);
}

// Simple helper to safely get lowercased strings
function toSearchString(value) {
    return (value || '').toString().toLowerCase();
}

// Initialize search/filter for pending submissions list
function initPendingSearch() {
    const searchInput = document.getElementById('pendingSearch');
    const clearBtn = document.getElementById('pendingSearchClear');
    if (!searchInput || searchInput.dataset.bound === '1') return;
    searchInput.dataset.bound = '1';

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
            searchInput.focus();
        });
    }
}

// Filter visible pending submissions in the DOM by martyr or submitter
function filterPendingSubmissions(query) {
    const list = document.getElementById('pendingList');
    const clearBtn = document.getElementById('pendingSearchClear');
    const kbdEl = document.getElementById('pendingSearchKbd');
    const countEl = document.getElementById('pendingSearchCount');
    const trimmed = (query || '').toLowerCase().trim();

    if (clearBtn) clearBtn.classList.toggle('visible', Boolean(trimmed));
    if (kbdEl) kbdEl.style.display = trimmed ? 'none' : '';

    if (!list) return;

    const items = list.querySelectorAll('.pending-item');
    if (!items.length) {
        if (countEl) countEl.style.display = 'none';
        return;
    }

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

    const total = items.length;
    if (countEl) {
        if (trimmed) {
            countEl.style.display = 'inline-flex';
            countEl.textContent = `${visibleCount} / ${total}`;
        } else {
            countEl.style.display = 'none';
        }
    }

    // Simple status message under the search bar
    let status = document.getElementById('pendingSearchStatus');
    if (!status) {
        status = document.createElement('div');
        status.id = 'pendingSearchStatus';
        status.style.cssText = 'margin: -0.5rem 0 0.85rem 0.15rem; font-size: 0.82rem; color: var(--admin-text-muted);';
        const searchBar = document.getElementById('pendingSearchBar');
        if (searchBar && searchBar.parentNode) {
            searchBar.parentNode.insertBefore(status, searchBar.nextSibling);
        }
    }

    if (trimmed && !visibleCount) {
        status.textContent = `No pending submissions match "${query}".`;
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
    
}

// Load and display pending submissions
async function loadPendingSubmissions() {
    const pendingList = document.getElementById('pendingList');
    let pendingData = [];
    let usingLocalStorage = false;
    let loadingSource = 'unknown';
    
    console.log('📄 Starting loadPendingSubmissions...');
    
    // Show loading state
    pendingList.innerHTML = '<div style="text-align: center; padding: 2rem; color: #64748b;">Loading pending submissions...</div>';
    
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
                cachedPendingMartyrs = pendingData.slice();
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
            <div class="firebase-required-error" style="background: #f8d7da; border: 1px solid #f5c6cb; border-radius: 12px; padding: 2rem; margin: 1rem 0; color: #721c24;">
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
                <div style="margin-top: 1rem; padding: 1rem; background: #f1f3f4; border-radius: 6px; font-size: 0.9rem;">
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
    updateApproveAllButtonState(pendingData.length);
    
    if (pendingData.length === 0) {
        const debugInfo = `
            <div class="no-pending">
                <div style="font-size: 2.75rem; margin-bottom: 0.5rem;">🎉</div>
                <h3>All Caught Up — No Pending Submissions</h3>
                <p>Every submitted martyr profile has been reviewed. Connected to <strong>${escapeHTML(loadingSource)}</strong>.</p>
                <div style="display: flex; justify-content: center; gap: 0.75rem; flex-wrap: wrap;">
                    <button onclick="loadPendingSubmissions()" class="btn btn-primary">
                        🔄 Check Again
                    </button>
                    <button onclick="window.switchAdminTab && window.switchAdminTab('approved')" class="btn btn-secondary">
                        ✅ View Approved Martyrs
                    </button>
                </div>
                <details class="debug-details">
                    <summary>🔧 Technical Connection Info</summary>
                    <div style="margin-top: 0.5rem; line-height: 1.6;">
                        • Firebase available: ${!!window.firebaseDB}<br>
                        • Data source: ${escapeHTML(loadingSource)}<br>
                        • Using localStorage fallback: ${usingLocalStorage}<br>
                        • Checked at: ${new Date().toLocaleString()}
                    </div>
                </details>
            </div>
        `;
        pendingList.innerHTML = debugInfo;
        return;
    }
    
    // Clear loading state
    pendingList.innerHTML = '';
    
    // Create header with source info
    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = 'background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 0.75rem 1rem; margin-bottom: 1rem; border-radius: 10px; font-size: 0.9rem;';
    headerDiv.innerHTML = `📁 Showing <strong>${pendingData.length}</strong> pending submission(s) from <strong>${escapeHTML(loadingSource)}</strong> ${usingLocalStorage ? '(localStorage)' : ''}`;
    pendingList.appendChild(headerDiv);
    
    // Add each pending item
    pendingData.forEach((martyr, index) => {
        console.log(`🎨 Creating UI for martyr ${index + 1}/${pendingData.length}: ${martyr.fullName}`);
        const pendingItem = createPendingItem(martyr);
        pendingList.appendChild(pendingItem);
    });
    
    console.log(`✅ Successfully rendered ${pendingData.length} pending submissions in UI`);
}

// Helper to structure Birth & Martyrdom date + location cleanly (avoids "Unknown • Unknown")
function formatEventDetailHTML(dateVal, placeVal) {
    const dateStr = formatDate(dateVal);
    const rawPlace = (placeVal || '').toString().trim();
    const hasDate = Boolean(dateStr && dateStr !== 'Unknown');
    const hasPlace = Boolean(rawPlace && rawPlace.toLowerCase() !== 'unknown');

    if (hasDate && hasPlace) {
        return `<span class="detail-primary">${escapeHTML(dateStr)}</span><span class="detail-secondary">${escapeHTML(rawPlace)}</span>`;
    }
    if (hasDate) {
        return `<span class="detail-primary">${escapeHTML(dateStr)}</span><span class="detail-secondary detail-muted">Location not recorded</span>`;
    }
    if (hasPlace) {
        return `<span class="detail-primary">${escapeHTML(rawPlace)}</span><span class="detail-secondary detail-muted">Date not recorded</span>`;
    }
    return `<span class="detail-primary detail-muted">Not recorded</span>`;
}

// Helper to structure Organization + Rank cleanly
function formatOrgDetailHTML(orgVal, rankVal) {
    const rawOrg = (orgVal || '').toString().trim();
    const rawRank = (rankVal || '').toString().trim();
    const hasOrg = Boolean(rawOrg && rawOrg.toLowerCase() !== 'not specified' && rawOrg.toLowerCase() !== 'unknown');
    const hasRank = Boolean(rawRank && rawRank.toLowerCase() !== 'not specified' && rawRank.toLowerCase() !== 'unknown');

    if (hasOrg && hasRank) {
        return `<span class="detail-primary">${escapeHTML(rawOrg)}</span><span class="detail-secondary">Role / Rank: ${escapeHTML(rawRank)}</span>`;
    }
    if (hasOrg) {
        return `<span class="detail-primary">${escapeHTML(rawOrg)}</span>`;
    }
    if (hasRank) {
        return `<span class="detail-primary">${escapeHTML(rawRank)}</span>`;
    }
    return `<span class="detail-primary detail-muted">Not specified</span>`;
}

// Helper to structure Submitter + Email/Relationship cleanly
function formatSubmitterDetailHTML(nameVal, emailVal, relationVal, phoneVal = '') {
    const rawName = (nameVal || '').toString().trim();
    const rawEmail = (emailVal || '').toString().trim();
    const rawRel = (relationVal || '').toString().trim();
    const rawPhone = (phoneVal || '').toString().trim();
    const hasName = Boolean(rawName && rawName.toLowerCase() !== 'unknown');

    const primaryHTML = hasName
        ? `<span class="detail-primary">${escapeHTML(rawName)}</span>`
        : `<span class="detail-primary detail-muted">Not recorded</span>`;

    const subParts = [];
    if (rawRel) subParts.push(escapeHTML(rawRel));
    if (rawEmail) subParts.push(escapeHTML(rawEmail));
    if (rawPhone) subParts.push(escapeHTML(rawPhone));

    return subParts.length > 0
        ? `${primaryHTML}<span class="detail-secondary">${subParts.join(' • ')}</span>`
        : primaryHTML;
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
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    // Sanitize all user-provided data before rendering
    const safeId = escapeHTML(martyr.id);
    const safeName = escapeHTML(martyr.fullName);
    const rawFather = (martyr.fatherName || '').toString().trim();
    const hasFather = Boolean(rawFather && rawFather.toLowerCase() !== 'unknown' && rawFather.toLowerCase() !== 'not provided');
    const safeBio = escapeHTML(martyr.biography || '');
    const safeFamily = escapeHTML(martyr.familyDetails || '');
    const rawOrgBadge = (martyr.organization || '').toString().trim();
    
    // Validate photo URL (supports base64, https URLs, or /assets/photos/ paths)
    const safePhoto = getSafeAdminPhotoSrc(martyr, false);

    item.innerHTML = `
        <div class="pending-header">
            <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
                <span class="status-pill pending">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <span>Pending Review</span>
                </span>
                <span class="id-code">ID: ${safeId}</span>
            </div>
            <span class="pending-timestamp">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>Submitted: ${escapeHTML(submittedDate)}</span>
            </span>
        </div>
        <div class="pending-content">
            <div class="pending-image">
                ${safePhoto ? 
                    `<img src="${escapeHTML(safePhoto)}" alt="${safeName}" onerror="this.onerror=null;this.parentElement.innerHTML='<div class=\\'pending-no-photo\\'><span>No Photo</span></div>';">` :
                    `<div class="pending-no-photo">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <span>No Photo</span>
                    </div>`
                }
            </div>
            <div class="pending-details">
                <div class="pending-title-row">
                    <h3>${safeName}</h3>
                    ${rawOrgBadge ? `
                        <span class="pending-org-badge">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            <span>${escapeHTML(rawOrgBadge)}</span>
                        </span>
                    ` : ''}
                </div>
                <div class="pending-meta-grid">
                    <div class="detail-row">
                        <span class="detail-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            <span>Father's Name</span>
                        </span>
                        ${hasFather
                            ? `<span class="detail-primary">${escapeHTML(rawFather)}</span>`
                            : `<span class="detail-primary detail-muted">Not recorded</span>`
                        }
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            <span>Birth</span>
                        </span>
                        ${formatEventDetailHTML(martyr.birthDate, martyr.birthPlace)}
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            <span>Martyrdom</span>
                        </span>
                        ${formatEventDetailHTML(martyr.martyrdomDate, martyr.martyrdomPlace)}
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            <span>Organization &amp; Rank</span>
                        </span>
                        ${formatOrgDetailHTML(martyr.organization, martyr.rank)}
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
                            <span>Submitted By</span>
                        </span>
                        ${formatSubmitterDetailHTML(martyr.submitterName, martyr.submitterEmail, martyr.submitterRelation, martyr.submitterPhone)}
                    </div>
                </div>
                ${safeBio ? `
                    <div class="detail-row detail-narrative">
                        <span class="detail-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                            <span>Biography</span>
                        </span>
                        <div class="biography-text">${safeBio}</div>
                    </div>
                ` : ''}
                ${safeFamily ? `
                    <div class="detail-row detail-narrative">
                        <span class="detail-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            <span>Family Details</span>
                        </span>
                        <div class="family-text">${safeFamily}</div>
                    </div>
                ` : ''}
            </div>
        </div>
        <div class="pending-actions">
            <button data-action="approve" data-martyr-id="${safeId}" class="btn-approve">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                <span>Approve &amp; Publish</span>
            </button>
            <button data-action="edit" data-martyr-id="${safeId}" class="btn-edit-pending">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span>Edit Profile</span>
            </button>
            <button data-action="reject" data-martyr-id="${safeId}" class="btn-reject">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                <span>Reject &amp; Delete</span>
            </button>
            <button data-action="preview" data-martyr-id="${safeId}" class="btn-preview-visitor">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <span>Preview as Visitor</span>
            </button>
        </div>
    `;

    // Add event listeners to buttons
    const approveBtn = item.querySelector('.btn-approve');
    const editBtn = item.querySelector('[data-action="edit"]');
    const rejectBtn = item.querySelector('.btn-reject');
    const previewBtn = item.querySelector('[data-action="preview"]');
    
    if (approveBtn) {
        approveBtn.addEventListener('click', () => approveMartyr(martyr.id));
    }

    if (editBtn) {
        editBtn.addEventListener('click', () => openEditMartyrModal(martyr, { mode: 'pending' }));
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
    overlay.className = 'admin-preview-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Public Preview');

    const modal = document.createElement('div');
    modal.className = 'admin-preview-modal';

    const header = document.createElement('div');
    header.className = 'admin-preview-header';

    const title = document.createElement('div');
    title.className = 'admin-preview-title';
    title.textContent = 'Public Preview';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'admin-preview-close';
    closeBtn.textContent = '×';
    closeBtn.setAttribute('aria-label', 'Close preview');

    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'admin-preview-body';

    // Build a card similar to gallery/homepage cards using safe textContent
    const card = document.createElement('div');
    card.className = 'admin-preview-card';

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'admin-preview-photo';

    const photoSrc = getSafeAdminPhotoSrc(martyr, false);
    if (photoSrc) {
        const img = document.createElement('img');
        img.src = photoSrc;
        img.alt = martyr.fullName || 'Martyr photo';
        img.onerror = () => {
            img.remove();
            imgWrapper.innerHTML = '<div class="admin-preview-placeholder" aria-hidden="true">📸</div>';
        };
        imgWrapper.appendChild(img);
    } else {
        const icon = document.createElement('div');
        icon.className = 'admin-preview-placeholder';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '📸';
        imgWrapper.appendChild(icon);
    }

    const info = document.createElement('div');
    info.className = 'admin-preview-info';

    const nameEl = document.createElement('h3');
    nameEl.className = 'admin-preview-name';
    nameEl.textContent = martyr.fullName || 'Unknown martyr';

    const datesEl = document.createElement('p');
    datesEl.className = 'admin-preview-dates';
    datesEl.textContent = `${formatDate(martyr.birthDate)} - ${formatDate(martyr.martyrdomDate)}`;

    const placeEl = document.createElement('p');
    placeEl.className = 'admin-preview-place';
    placeEl.textContent = martyr.martyrdomPlace || 'Place of martyrdom unknown';

    info.appendChild(nameEl);
    info.appendChild(datesEl);
    info.appendChild(placeEl);

    if (martyr.organization) {
        const orgEl = document.createElement('p');
        orgEl.className = 'admin-preview-org';
        orgEl.textContent = martyr.organization;
        info.appendChild(orgEl);
    }

    if (martyr.biography) {
        const bioEl = document.createElement('p');
        bioEl.className = 'admin-preview-bio';
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

    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        }
    };

    const close = () => {
        document.removeEventListener('keydown', onKeyDown);
        overlay.remove();
    };
    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKeyDown);

    document.body.appendChild(overlay);
    closeBtn.focus();
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

        // Always add to approved martyrs in localStorage (for compatibility, wrapped in try/catch for 5MB quota)
        try {
            const approvedData = JSON.parse(localStorage.getItem('martyrsData') || '[]');
            approvedData.push(martyrToApprove);
            localStorage.setItem('martyrsData', JSON.stringify(approvedData));
            console.log('Added to localStorage approved:', approvedData.length);
        } catch (lsError) {
            console.warn('localStorage quota exceeded while caching approved martyr (IndexedDB cache is used instead):', lsError);
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
            ? 'Submission approved and published successfully to Firebase and local storage!' 
            : 'Submission approved and published to local storage (Firebase sync failed, but martyr is still approved)!';
        
        showAdminToast(successMessage, 'success');
        
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
        // Get martyr data first (prefer authoritative Firebase record so recent admin edits apply)
        let martyrToApprove = null;
        let foundInLocalStorage = false;
        
        const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
        const martyrIndex = pendingData.findIndex(m => m.id === martyrId);
        if (martyrIndex !== -1) {
            foundInLocalStorage = true;
            martyrToApprove = pendingData[martyrIndex];
        }

        if (window.firebaseDB && typeof window.firebaseDB.getMartyrById === 'function') {
            try {
                const docRes = await window.firebaseDB.getMartyrById('pendingMartyrs', martyrId);
                if (docRes.success && docRes.data) {
                    martyrToApprove = docRes.data;
                    console.log('✅ Loaded authoritative pending martyr from Firebase:', martyrToApprove.fullName);
                }
            } catch (error) {
                console.warn('⚠️ Single doc fetch failed during approve, checking pending query:', error.message);
            }
        }

        if (!martyrToApprove) {
            console.log('🔍 Fetching pending submission from Firebase collection...');
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
                },
                // onReject - user wants to reject and delete the duplicate right from the modal
                async () => {
                    console.log('🗑️ User chose to reject duplicate directly from comparison modal');
                    await executeSilentRejection(martyrId);
                    await loadPendingSubmissions();
                    await updateStats();
                    showAdminToast(`Duplicate submission "${martyrToApprove.fullName}" rejected and removed.`, 'info');
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
        
        showAdminToast(successMessage, 'info');

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
        updateApproveAllButtonState(pendingCount);
    } catch (error) {
        console.error('Error updating stats:', error);
    }
}

// Helper to reject a pending martyr without a redundant browser confirm() prompt
// (used when admin already clicked "Reject Duplicate" inside the Duplicate Warning Modal)
async function executeSilentRejection(martyrId) {
    try {
        const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
        const martyrIndex = pendingData.findIndex(m => m.id === martyrId);
        const foundInLocalStorage = martyrIndex !== -1;

        if (window.firebaseDB && typeof window.firebaseDB.rejectMartyr === 'function') {
            try {
                await window.firebaseDB.rejectMartyr(martyrId);
            } catch (err) {
                console.warn('⚠️ Firebase rejection warning:', err);
            }
        }

        if (foundInLocalStorage) {
            pendingData.splice(martyrIndex, 1);
            localStorage.setItem('pendingMartyrs', JSON.stringify(pendingData));
        }

        const pendingItem = document.querySelector(`[data-martyr-id="${martyrId}"]`);
        if (pendingItem) {
            pendingItem.remove();
        }
        return true;
    } catch (error) {
        console.error('Error in executeSilentRejection:', error);
        return false;
    }
}

// Helper to approve a single martyr silently during batch processing
async function executeBatchItemApproval(martyr) {
    const martyrId = martyr.id;
    let firebaseSuccess = false;

    if (window.firebaseDB && typeof window.firebaseDB.approveMartyr === 'function') {
        try {
            const result = await window.firebaseDB.approveMartyr(martyrId, martyr);
            if (result && result.success) {
                firebaseSuccess = true;
            }
        } catch (err) {
            console.warn('⚠️ Firebase batch approval warning for', martyr.fullName, err);
        }
    }

    // Update localStorage if present
    try {
        const pendingData = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
        const idx = pendingData.findIndex(m => m.id === martyrId);
        if (idx !== -1) {
            pendingData.splice(idx, 1);
            localStorage.setItem('pendingMartyrs', JSON.stringify(pendingData));
        }
    } catch (e) {
        // Ignore storage quota issues
    }

    const pendingItem = document.querySelector(`[data-martyr-id="${martyrId}"]`);
    if (pendingItem) {
        pendingItem.remove();
    }

    return firebaseSuccess;
}

// Approve All Pending Submissions with Automatic Duplicate Detection & Interactive Duplicate Review
async function approveAllPending() {
    if (!validateAdminAuth('approve all pending martyrs')) {
        return;
    }

    if (!window.firebaseDB) {
        alert('Firebase database not available. Please check your internet connection and refresh the page.');
        return;
    }

    const approveAllBtn = document.getElementById('approveAllPendingBtn');
    const approveAllText = document.getElementById('approveAllPendingText');

    try {
        if (approveAllBtn) approveAllBtn.disabled = true;
        if (approveAllText) approveAllText.textContent = 'Loading pending queue...';

        // 1. Load all pending submissions
        let pendingList = [];
        try {
            const pendingResult = await window.firebaseDB.getPendingMartyrs();
            if (pendingResult && pendingResult.success && Array.isArray(pendingResult.data)) {
                pendingList = pendingResult.data;
            }
        } catch (err) {
            console.warn('⚠️ Failed to fetch pending from Firebase, checking localStorage:', err);
        }

        if (pendingList.length === 0) {
            pendingList = JSON.parse(localStorage.getItem('pendingMartyrs') || '[]');
        }

        if (pendingList.length === 0) {
            showAdminToast('No pending submissions to approve.', 'info');
            updateApproveAllButtonState(0);
            if (approveAllBtn) approveAllBtn.disabled = false;
            return;
        }

        // Ask admin to confirm starting the smart batch approval
        const confirmMsg = `Approve All Pending (${pendingList.length} submission${pendingList.length === 1 ? '' : 's'})?\n\n` +
            `• Unique profiles with no database match will be approved & published automatically.\n` +
            `• Any profile that matches an existing martyr in the database will pause and open a comparison modal so you can Reject the duplicate, Skip it, or Approve it.`;

        if (!confirm(confirmMsg)) {
            if (approveAllBtn) approveAllBtn.disabled = false;
            updateApproveAllButtonState(pendingList.length);
            return;
        }

        // 2. Load all existing approved martyrs once for fast, accurate duplicate checking
        if (approveAllText) approveAllText.textContent = 'Scanning for duplicates...';
        let runningApprovedList = [];
        try {
            const approvedResult = await window.firebaseDB.getApprovedMartyrs();
            if (approvedResult && approvedResult.success && Array.isArray(approvedResult.data)) {
                runningApprovedList = [...approvedResult.data];
            }
        } catch (err) {
            console.warn('⚠️ Failed to fetch approved list from Firebase, using fallback:', err);
        }
        if (runningApprovedList.length === 0) {
            runningApprovedList = JSON.parse(localStorage.getItem('martyrsData') || '[]');
        }

        let approvedCount = 0;
        let rejectedCount = 0;
        let skippedCount = 0;
        const flaggedDuplicates = [];

        // 3. First pass: Automatically approve all clean (non-duplicate) submissions,
        //    and queue any submission that matches either an existing approved profile
        //    OR an earlier submission approved in this same batch.
        for (let i = 0; i < pendingList.length; i++) {
            const martyr = pendingList[i];
            if (approveAllText) {
                approveAllText.textContent = `Processing ${i + 1} / ${pendingList.length}...`;
            }

            const matches = await findPotentialDuplicates(martyr, 0.62, runningApprovedList);
            if (matches.length > 0) {
                flaggedDuplicates.push({ martyr, matches });
            } else {
                await executeBatchItemApproval(martyr);
                runningApprovedList.push({ ...martyr, status: 'approved' });
                approvedCount++;
            }
        }

        // 4. Second pass: If any duplicates were detected, present each one in the
        //    Side-by-Side Duplicate Comparison Modal with Reject / Skip / Approve options.
        if (flaggedDuplicates.length > 0) {
            for (let j = 0; j < flaggedDuplicates.length; j++) {
                const { martyr } = flaggedDuplicates[j];
                if (approveAllText) {
                    approveAllText.textContent = `Reviewing duplicate ${j + 1} / ${flaggedDuplicates.length}...`;
                }

                // Re-run against latest runningApprovedList so newly approved items are included
                const freshMatches = await findPotentialDuplicates(martyr, 0.62, runningApprovedList);
                const matchesToShow = freshMatches.length > 0 ? freshMatches : flaggedDuplicates[j].matches;

                const decision = await new Promise((resolve) => {
                    showDuplicateWarningModal(
                        martyr,
                        matchesToShow,
                        () => resolve('approve'),
                        () => resolve('skip'),
                        () => resolve('reject'),
                        { current: j + 1, total: flaggedDuplicates.length }
                    );
                });

                if (decision === 'reject') {
                    await executeSilentRejection(martyr.id);
                    rejectedCount++;
                } else if (decision === 'approve') {
                    await executeBatchItemApproval(martyr);
                    runningApprovedList.push({ ...martyr, status: 'approved' });
                    approvedCount++;
                } else {
                    skippedCount++;
                }
            }
        }

        // 5. Refresh UI and show summary toast
        await loadPendingSubmissions();
        await updateStats();

        const summaryParts = [];
        if (approvedCount > 0) summaryParts.push(`${approvedCount} approved`);
        if (rejectedCount > 0) summaryParts.push(`${rejectedCount} duplicate${rejectedCount === 1 ? '' : 's'} rejected`);
        if (skippedCount > 0) summaryParts.push(`${skippedCount} skipped`);

        showAdminToast(
            `Batch complete: ${summaryParts.join(' • ') || 'No changes made'}.`,
            approvedCount > 0 ? 'success' : 'info',
            6000
        );
    } catch (error) {
        console.error('❌ Error during Approve All Pending:', error);
        alert('An error occurred during batch approval. Please refresh and check the remaining pending items.');
    } finally {
        if (approveAllBtn) approveAllBtn.disabled = false;
        await updateStats();
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
        // Show loading state in refresh button while preserving SVG icon
        const refreshBtn = document.querySelector('button[onclick="refreshData()"]') || 
                          Array.from(document.querySelectorAll('button')).find(btn => btn.textContent.includes('Refresh Data'));
        
        let originalHTML = '';
        if (refreshBtn) {
            originalHTML = refreshBtn.innerHTML;
            refreshBtn.disabled = true;
            refreshBtn.innerHTML = '<span>Refreshing...</span>';
        }
        
        if (window.firebaseDB && typeof window.firebaseDB.clearCache === 'function') {
            await window.firebaseDB.clearCache();
        }

        console.log('📄 Loading pending submissions...');
        await loadPendingSubmissions();
        
        const approvedContainer = document.getElementById('approvedContainer');
        if (approvedContainer && approvedContainer.style.display !== 'none') {
            await loadApprovedMartyrs();
        }

        console.log('📈 Updating statistics...');
        await updateStats();
        
        if (refreshBtn && originalHTML) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = originalHTML;
        }

        showAdminToast('Memorial data refreshed', 'info');
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
        showAdminToast('All pending submissions have been cleared.', 'info');
        
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
    
    showAdminToast('Backup data exported successfully!', 'success');
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
                        
                        showAdminToast(`Imported ${importedData.totalPending} pending & ${importedData.totalApproved} approved profiles!`, 'success');
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

// State for Approved Martyrs instant search & progressive batch rendering
let cachedApprovedMartyrs = [];
let approvedSearchQuery = '';
let approvedVisibleLimit = 25;
const APPROVED_BATCH_SIZE = 25;

function initApprovedSearch() {
    const searchInput = document.getElementById('approvedSearch');
    const clearBtn = document.getElementById('approvedSearchClear');
    if (!searchInput || searchInput.dataset.bound === '1') return;
    searchInput.dataset.bound = '1';

    const applyFilter = () => {
        const raw = searchInput.value || '';
        approvedSearchQuery = raw.toLowerCase().trim();
        approvedVisibleLimit = APPROVED_BATCH_SIZE;

        const kbdEl = document.getElementById('approvedSearchKbd');
        if (clearBtn) clearBtn.classList.toggle('visible', Boolean(approvedSearchQuery));
        if (kbdEl) kbdEl.style.display = approvedSearchQuery ? 'none' : '';

        if (cachedApprovedMartyrs.length > 0) {
            renderApprovedMartyrsList();
        }
    };

    searchInput.addEventListener('input', () => {
        window.requestAnimationFrame(applyFilter);
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            applyFilter();
            searchInput.focus();
        });
    }
}

function renderApprovedMartyrsList() {
    const approvedList = document.getElementById('approvedList');
    const countEl = document.getElementById('approvedSearchCount');
    if (!approvedList) return;

    const query = approvedSearchQuery;
    const filtered = !query
        ? cachedApprovedMartyrs
        : cachedApprovedMartyrs.filter(m => {
            const haystack = `${toSearchString(m.fullName)} ${toSearchString(m.fatherName)} ${toSearchString(m.birthPlace)} ${toSearchString(m.martyrdomPlace)} ${toSearchString(m.organization)} ${toSearchString(m.affiliation)} ${toSearchString(m.rank)} ${toSearchString(m.submitterName)} ${toSearchString(m.submitterEmail)} ${toSearchString(m.id)}`;
            return haystack.includes(query);
        });

    if (countEl) {
        if (cachedApprovedMartyrs.length > 0) {
            countEl.style.display = 'inline-flex';
            countEl.textContent = query
                ? `${filtered.length} / ${cachedApprovedMartyrs.length}`
                : `${cachedApprovedMartyrs.length} profiles`;
        } else {
            countEl.style.display = 'none';
        }
    }

    approvedList.innerHTML = '';

    // Status summary bar
    const summaryBar = document.createElement('div');
    summaryBar.style.cssText = 'display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; padding: 0.65rem 1rem; background: var(--admin-surface-subtle); border: 1px solid var(--admin-border); border-radius: 10px; font-size: 0.85rem; color: var(--admin-text-muted);';
    if (query) {
        summaryBar.innerHTML = `<span>Found <strong>${filtered.length}</strong> matching martyr(s) out of ${cachedApprovedMartyrs.length} for "<strong>${escapeHTML(query)}</strong>"</span>`;
    } else {
        summaryBar.innerHTML = `<span>Showing <strong>${Math.min(approvedVisibleLimit, filtered.length)}</strong> of <strong>${filtered.length}</strong> published martyrs</span>`;
    }
    approvedList.appendChild(summaryBar);

    if (filtered.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'no-pending';
        emptyDiv.innerHTML = `
            <h3>No matching published martyrs</h3>
            <p>No profiles matched "${escapeHTML(query)}". Try searching by another name, region, or organization.</p>
        `;
        approvedList.appendChild(emptyDiv);
        return;
    }

    const fragment = document.createDocumentFragment();
    const slice = filtered.slice(0, approvedVisibleLimit);
    slice.forEach(martyr => {
        fragment.appendChild(createApprovedMartyrItem(martyr));
    });
    approvedList.appendChild(fragment);

    if (filtered.length > approvedVisibleLimit) {
        const remaining = filtered.length - approvedVisibleLimit;
        const loadMoreWrap = document.createElement('div');
        loadMoreWrap.style.cssText = 'text-align: center; padding: 1.25rem 0 2rem;';
        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.type = 'button';
        loadMoreBtn.className = 'admin-btn admin-btn-secondary';
        loadMoreBtn.style.cssText = 'padding: 0 1.5rem; height: 42px; font-size: 0.9rem;';
        loadMoreBtn.textContent = `Show More (${Math.min(APPROVED_BATCH_SIZE, remaining)} more of ${remaining} remaining)`;
        loadMoreBtn.addEventListener('click', () => {
            approvedVisibleLimit += APPROVED_BATCH_SIZE;
            renderApprovedMartyrsList();
        });
        loadMoreWrap.appendChild(loadMoreBtn);
        approvedList.appendChild(loadMoreWrap);
    }
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
    const originalBtnHTML = loadBtn ? loadBtn.innerHTML : 'Reload Approved Martyrs';
    
    // Check Firebase availability before proceeding
    if (!window.firebaseDB) {
        console.error('❌ Firebase not available for loadApprovedMartyrs');
        
        if (loadBtn) {
            loadBtn.disabled = true;
            loadBtn.innerHTML = '<span>Reconnecting Firebase...</span>';
        }
        if (approvedList) {
            approvedList.innerHTML = '<p style="text-align: center; color: #d97706; padding: 2rem;">Firebase not available. Attempting to reconnect...</p>';
        }
        
        const reconnected = await attemptFirebaseReconnection();
        if (!reconnected) {
            if (approvedList) {
                approvedList.innerHTML = `<div style="text-align: center; color: #dc3545; padding: 2rem; background: #f8d7da; border-radius: 12px; margin: 1rem;">
                    <h3>Firebase Connection Failed</h3>
                    <p>Unable to connect to Firebase database.</p>
                    <p style="font-size: 0.9rem; color: #666; margin-top: 1rem;">This could be due to network issues or Firebase configuration problems.</p>
                    <button onclick="loadApprovedMartyrs()" class="admin-btn admin-btn-primary" style="margin-top: 1rem;">Try Again</button>
                </div>`;
            }
            if (loadBtn) {
                loadBtn.disabled = false;
                loadBtn.innerHTML = originalBtnHTML;
            }
            return;
        }
        
        console.log('✅ Firebase reconnection successful, continuing with load...');
    }
    
    if (!approvedList || !loadBtn) {
        console.error('❌ Required DOM elements not found!');
        return;
    }
    
    // Show loading state
    loadBtn.disabled = true;
    loadBtn.innerHTML = '<span>Loading...</span>';
    approvedList.innerHTML = '<p style="text-align: center; padding: 2rem; color: var(--admin-text-muted);">Loading approved martyrs from Firebase...</p>';
    
    try {
        if (!window.firebaseDB || typeof window.firebaseDB.getApprovedMartyrs !== 'function') {
            throw new Error('Firebase getApprovedMartyrs method not available');
        }
        
        const result = typeof window.firebaseDB.getApprovedMartyrsForAdmin === 'function'
            ? await window.firebaseDB.getApprovedMartyrsForAdmin()
            : await window.firebaseDB.getApprovedMartyrs();
        
        if (result.success) {
            const martyrs = result.data || [];
            console.log(`✅ Found ${martyrs.length} approved martyrs`);
            cachedApprovedMartyrs = martyrs;
            approvedVisibleLimit = APPROVED_BATCH_SIZE;
            
            if (martyrs.length > 0) {
                renderApprovedMartyrsList();
                console.log('✅ Approved martyrs rendered with progressive batching');
            } else {
                approvedList.innerHTML = '<p style="text-align: center; color: var(--admin-text-muted); padding: 2rem;">No approved martyrs found in Firebase</p>';
            }
        } else {
            throw new Error(result.error || 'Unknown Firebase error');
        }
    } catch (error) {
        console.error('❌ Error loading approved martyrs:', error);
        approvedList.innerHTML = `<div style="text-align: center; color: #dc3545; padding: 2rem; background: #f8d7da; border-radius: 12px; margin: 1rem;">
            <h3>Error Loading Data</h3>
            <p><strong>Error:</strong> ${escapeHTML(error.message)}</p>
            <button onclick="loadApprovedMartyrs()" class="admin-btn admin-btn-primary" style="margin-top: 1rem;">Try Again</button>
        </div>`;
    }
    
    // Reset button
    loadBtn.disabled = false;
    loadBtn.innerHTML = originalBtnHTML;
    console.log('🔄 loadApprovedMartyrs function completed');
}

// Create approved martyr item
function createApprovedMartyrItem(martyr) {
    const item = document.createElement('div');
    item.className = 'pending-item'; // Reuse pending item styling
    item.dataset.martyrId = martyr.id;
    
    const approvedDate = martyr.approvedAt ? new Date(martyr.approvedAt.toDate ? martyr.approvedAt.toDate() : martyr.approvedAt).toLocaleDateString() : 'Unknown';
    const updatedDate = martyr.updatedAt ? new Date(martyr.updatedAt.toDate ? martyr.updatedAt.toDate() : martyr.updatedAt).toLocaleDateString() : null;
    const rawFather = (martyr.fatherName || '').toString().trim();
    const hasFather = Boolean(rawFather && rawFather.toLowerCase() !== 'unknown' && rawFather.toLowerCase() !== 'not provided');
    const rawOrgBadge = (martyr.organization || '').toString().trim();
    const safeBio = escapeHTML(martyr.biography || '');
    
    item.innerHTML = `
        <div class="pending-header approved-header">
            <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
                <span class="status-pill published">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    <span>Published</span>
                </span>
                <span class="id-code">ID: ${escapeHTML(martyr.id)}</span>
            </div>
            <span class="pending-timestamp">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>Approved: ${escapeHTML(approvedDate)}${updatedDate ? ` • Updated: ${escapeHTML(updatedDate)}` : ''}</span>
            </span>
        </div>
        <div class="pending-content">
            <div class="pending-image">
                ${(() => {
                    const approvedPhoto = getSafeAdminPhotoSrc(martyr, true);
                    return approvedPhoto ? 
                        `<img src="${escapeHTML(approvedPhoto)}" alt="${escapeHTML(martyr.fullName)}" loading="lazy">` :
                        `<div class="pending-no-photo">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            <span>No Photo</span>
                        </div>`;
                })()}
            </div>
            <div class="pending-details">
                <div class="pending-title-row">
                    <h3>${escapeHTML(martyr.fullName)}</h3>
                    ${rawOrgBadge ? `
                        <span class="pending-org-badge">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            <span>${escapeHTML(rawOrgBadge)}</span>
                        </span>
                    ` : ''}
                </div>
                <div class="pending-meta-grid">
                    ${hasFather ? `
                        <div class="detail-row">
                            <span class="detail-label">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                <span>Father's Name</span>
                            </span>
                            <span class="detail-primary">${escapeHTML(rawFather)}</span>
                        </div>
                    ` : ''}
                    <div class="detail-row">
                        <span class="detail-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                            <span>Birth</span>
                        </span>
                        ${formatEventDetailHTML(martyr.birthDate, martyr.birthPlace)}
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                            <span>Martyrdom</span>
                        </span>
                        ${formatEventDetailHTML(martyr.martyrdomDate, martyr.martyrdomPlace)}
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                            <span>Organization${martyr.rank ? ' &amp; Rank' : ''}</span>
                        </span>
                        ${formatOrgDetailHTML(martyr.organization, martyr.rank)}
                    </div>
                    <div class="detail-row">
                        <span class="detail-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>
                            <span>Submitted By</span>
                        </span>
                        ${formatSubmitterDetailHTML(martyr.submitterName, martyr.submitterEmail, martyr.submitterRelation, martyr.submitterPhone)}
                    </div>
                </div>
                ${safeBio ? `
                    <div class="detail-row detail-narrative">
                        <span class="detail-label">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                            <span>Biography</span>
                        </span>
                        <div class="biography-text">${safeBio}</div>
                    </div>
                ` : ''}
            </div>
        </div>
        <div class="pending-actions approved-actions" style="justify-content: flex-start; gap: 0.75rem;">
            <button data-action="edit" data-martyr-id="${escapeHTML(martyr.id)}" class="btn-edit-profile">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                <span>Edit Profile</span>
            </button>
            <button data-action="delete" data-martyr-id="${escapeHTML(martyr.id)}" class="btn-delete-profile">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                <span>Delete</span>
            </button>
        </div>
    `;

    // Resolve updated Firestore photo when REST/Edge metadata omitted inline Base64
    const approvedImg = item.querySelector('.pending-image img');
    if (approvedImg) {
        const showNoPhotoFallback = () => {
            if (approvedImg.parentElement) {
                approvedImg.parentElement.innerHTML = '<div class="pending-no-photo"><span>No Photo</span></div>';
            }
        };
        approvedImg.addEventListener('error', () => {
            if (
                !martyr.photoRemoved &&
                martyr.id &&
                approvedImg.src.includes('/assets/photos/') &&
                typeof window.resolveMartyrPhoto === 'function'
            ) {
                window.resolveMartyrPhoto(martyr.id, approvedImg, showNoPhotoFallback);
            } else {
                showNoPhotoFallback();
            }
        }, { once: true });

        if (
            !martyr.photoRemoved &&
            !martyr.photo &&
            !martyr.photoPath &&
            martyr.photoUpdatedAt &&
            typeof window.resolveMartyrPhoto === 'function'
        ) {
            window.resolveMartyrPhoto(martyr.id, approvedImg, showNoPhotoFallback);
        }
    }
    
    // Add event listener to edit button
    const editBtn = item.querySelector('[data-action="edit"]');
    if (editBtn) {
        editBtn.addEventListener('click', () => openEditMartyrModal(martyr, { mode: 'approved' }));
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
            // Remove from cached array & UI
            cachedApprovedMartyrs = cachedApprovedMartyrs.filter(m => m.id !== martyrId);
            const martyrItem = document.querySelector(`[data-martyr-id="${martyrId}"]`);
            if (martyrItem) {
                martyrItem.remove();
            }
            
            // Update stats
            await updateStats();
            
            showAdminToast(`"${martyrName}" has been deleted from Firebase.`, 'info');
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
let currentEditingMode = 'approved'; // 'pending' | 'approved'
let editPhotoState = { mode: 'keep', value: '', initialSrc: '' };

function toDateInputValue(dateValue) {
    if (!dateValue) return '';
    try {
        let date;
        if (dateValue.toDate && typeof dateValue.toDate === 'function') {
            date = dateValue.toDate();
        } else if (typeof dateValue === 'object' && typeof dateValue.seconds === 'number') {
            date = new Date(dateValue.seconds * 1000);
        } else if (dateValue instanceof Date) {
            date = dateValue;
        } else if (typeof dateValue === 'string') {
            const trimmed = dateValue.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
            date = new Date(trimmed);
        } else {
            return '';
        }
        if (isNaN(date.getTime())) return '';
        return date.toISOString().split('T')[0];
    } catch (e) {
        console.warn('Date conversion error:', e);
        return '';
    }
}

function isValidOptionalEmail(value) {
    const trimmed = (value || '').trim();
    if (!trimmed) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

function isValidOptionalPhotoUrl(value) {
    const trimmed = (value || '').trim();
    if (!trimmed) return false;
    return (
        /^https:\/\/\S+$/i.test(trimmed) ||
        /^\/media\/[A-Za-z0-9_-]{1,16}\/[A-Za-z0-9._-]{1,160}$/i.test(trimmed) ||
        /^\/assets\/photos\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(trimmed)
    );
}

function getEditModalModeLabel(mode) {
    return mode === 'pending' ? 'Edit Pending Submission' : 'Edit Published Profile';
}

// Open edit modal with martyr data (supports both pending and approved profiles)
function openEditMartyrModal(martyr, options = {}) {
    // Validate admin authentication
    if (!validateAdminAuth('edit martyr')) {
        return;
    }

    const mode = options.mode === 'pending' ? 'pending' : 'approved';
    console.log(`✏️ Opening ${mode} edit modal for:`, martyr.fullName);
    currentEditingMartyr = { ...martyr };
    currentEditingMode = mode;

    const existingModal = document.getElementById('editMartyrModal');
    if (existingModal) existingModal.remove();

    const initialPhotoSrc = getSafeAdminPhotoSrc(martyr, mode !== 'pending');
    editPhotoState = {
        mode: 'keep',
        value: initialPhotoSrc,
        initialSrc: initialPhotoSrc,
        initialRemoved: Boolean(martyr.photoRemoved)
    };

    const collectionLabel = mode === 'pending' ? 'pendingMartyrs' : 'martyrs';
    const initialPhotoUrlInput =
        initialPhotoSrc && !initialPhotoSrc.startsWith('data:image/')
            ? initialPhotoSrc
            : '';

    const modal = document.createElement('dialog');
    modal.id = 'editMartyrModal';
    modal.className = 'edit-modal-dialog';
    modal.setAttribute('closedby', 'any');
    modal.setAttribute('aria-labelledby', 'editModalTitle');
    modal.innerHTML = `
        <div class="edit-modal-header">
            <div class="edit-modal-title-wrap">
                <h2 id="editModalTitle">✏️ ${escapeHTML(getEditModalModeLabel(mode))}</h2>
                <span class="edit-modal-subtitle">Collection: ${escapeHTML(collectionLabel)} • ID: ${escapeHTML(martyr.id || '')}</span>
            </div>
            <button type="button" class="edit-modal-close" aria-label="Close modal">&times;</button>
        </div>
        <form id="editMartyrForm" class="edit-modal-form" novalidate>
            <div class="edit-modal-body">
                <div id="editSyncBanner" class="edit-sync-banner" role="status" aria-live="polite">
                    <span>Syncing full record from Firestore (submitter details &amp; photo)…</span>
                </div>

                <fieldset class="edit-fieldset">
                    <legend>Martyr Profile</legend>
                    <div class="edit-form-grid">
                        <div class="edit-form-group full-width">
                            <label for="editFullName">Full Name *</label>
                            <input type="text" id="editFullName" name="fullName" value="${escapeHTML(martyr.fullName || '')}" required maxlength="200" aria-describedby="editFullNameError">
                            <span id="editFullNameError" class="edit-field-error" role="alert"></span>
                        </div>

                        <div class="edit-form-group">
                            <label for="editFatherName">Father's Name</label>
                            <input type="text" id="editFatherName" name="fatherName" value="${escapeHTML(martyr.fatherName || '')}" maxlength="200">
                        </div>

                        <div class="edit-form-group">
                            <label for="editRank">Rank / Role</label>
                            <input type="text" id="editRank" name="rank" value="${escapeHTML(martyr.rank || '')}" maxlength="200">
                        </div>

                        <div class="edit-form-group">
                            <label for="editBirthDate">Birth Date</label>
                            <input type="date" id="editBirthDate" name="birthDate" value="${toDateInputValue(martyr.birthDate)}">
                        </div>

                        <div class="edit-form-group">
                            <label for="editBirthPlace">Birth Place</label>
                            <input type="text" id="editBirthPlace" name="birthPlace" value="${escapeHTML(martyr.birthPlace || '')}" maxlength="250">
                        </div>

                        <div class="edit-form-group">
                            <label for="editMartyrdomDate">Martyrdom Date</label>
                            <input type="date" id="editMartyrdomDate" name="martyrdomDate" value="${toDateInputValue(martyr.martyrdomDate)}">
                        </div>

                        <div class="edit-form-group">
                            <label for="editMartyrdomPlace">Martyrdom Place</label>
                            <input type="text" id="editMartyrdomPlace" name="martyrdomPlace" value="${escapeHTML(martyr.martyrdomPlace || '')}" maxlength="250">
                        </div>

                        <div class="edit-form-group">
                            <label for="editOrganization">Organization</label>
                            <input type="text" id="editOrganization" name="organization" value="${escapeHTML(martyr.organization || '')}" maxlength="200">
                        </div>

                        <div class="edit-form-group">
                            <label for="editAffiliation">Affiliation</label>
                            <input type="text" id="editAffiliation" name="affiliation" value="${escapeHTML(martyr.affiliation || '')}" maxlength="200">
                        </div>

                        <div class="edit-form-group full-width">
                            <label for="editBiography">Biography</label>
                            <textarea id="editBiography" name="biography" rows="4" maxlength="15000">${escapeHTML(martyr.biography || '')}</textarea>
                        </div>

                        <div class="edit-form-group full-width">
                            <label for="editFamilyDetails">Family Details</label>
                            <textarea id="editFamilyDetails" name="familyDetails" rows="3" maxlength="3000">${escapeHTML(martyr.familyDetails || '')}</textarea>
                        </div>
                    </div>
                </fieldset>

                <fieldset class="edit-fieldset">
                    <legend>Submitted By (Submitter Details)</legend>
                    <p class="edit-section-hint">Edit or add the details of the person who submitted this martyr's profile.</p>
                    <div class="edit-form-grid">
                        <div class="edit-form-group">
                            <label for="editSubmitterName">Submitter Name</label>
                            <input type="text" id="editSubmitterName" name="submitterName" value="${escapeHTML(martyr.submitterName || '')}" maxlength="200" placeholder="Name of submitter">
                        </div>

                        <div class="edit-form-group">
                            <label for="editSubmitterEmail">Submitter Email</label>
                            <input type="email" id="editSubmitterEmail" name="submitterEmail" value="${escapeHTML(martyr.submitterEmail || '')}" maxlength="254" placeholder="name@example.com" aria-describedby="editSubmitterEmailError">
                            <span id="editSubmitterEmailError" class="edit-field-error" role="alert"></span>
                        </div>

                        <div class="edit-form-group">
                            <label for="editSubmitterRelation">Relationship to Martyr</label>
                            <input type="text" id="editSubmitterRelation" name="submitterRelation" value="${escapeHTML(martyr.submitterRelation || '')}" maxlength="200" placeholder="e.g., Family Member, Friend, Community Member">
                        </div>

                        <div class="edit-form-group">
                            <label for="editSubmitterPhone">Submitter Phone (Optional)</label>
                            <input type="tel" id="editSubmitterPhone" name="submitterPhone" value="${escapeHTML(martyr.submitterPhone || '')}" maxlength="60" placeholder="+...">
                        </div>
                    </div>
                </fieldset>

                <fieldset class="edit-fieldset">
                    <legend>Portrait Photo</legend>
                    <div class="edit-photo-editor">
                        <div class="edit-photo-preview" id="editPhotoPreviewBox"></div>
                        <div class="edit-photo-controls">
                            <span id="editPhotoStatus" class="edit-photo-status"></span>
                            <div class="edit-photo-actions-row">
                                <input type="file" id="editPhotoInput" accept="image/*" style="display: none;">
                                <label for="editPhotoInput" class="edit-photo-upload-label">Upload New Photo</label>
                                <button type="button" id="editPhotoRemoveBtn" class="edit-photo-btn danger">Remove Photo</button>
                                <button type="button" id="editPhotoRevertBtn" class="edit-photo-btn" disabled>Revert</button>
                            </div>
                            <div class="edit-form-group">
                                <label for="editPhotoUrlInput">Or set image URL (https://… or /assets/photos/…)</label>
                                <div class="edit-photo-url-row">
                                    <input type="url" id="editPhotoUrlInput" value="${escapeHTML(initialPhotoUrlInput)}" placeholder="https://example.com/photo.jpg" aria-describedby="editPhotoError">
                                    <button type="button" id="editPhotoApplyUrlBtn" class="edit-photo-btn">Apply URL</button>
                                </div>
                                <span id="editPhotoError" class="edit-field-error" role="alert"></span>
                            </div>
                        </div>
                    </div>
                </fieldset>
            </div>

            <div class="edit-modal-footer">
                <button type="button" class="btn btn-outline edit-cancel-btn">Cancel</button>
                <button type="submit" class="btn btn-primary edit-save-btn">
                    💾 Save Changes
                </button>
            </div>
        </form>
    `;

    document.body.appendChild(modal);

    const form = modal.querySelector('#editMartyrForm');
    const syncBanner = modal.querySelector('#editSyncBanner');
    const previewBox = modal.querySelector('#editPhotoPreviewBox');
    const photoStatusEl = modal.querySelector('#editPhotoStatus');
    const photoInput = modal.querySelector('#editPhotoInput');
    const photoRemoveBtn = modal.querySelector('#editPhotoRemoveBtn');
    const photoRevertBtn = modal.querySelector('#editPhotoRevertBtn');
    const photoUrlInput = modal.querySelector('#editPhotoUrlInput');
    const photoApplyUrlBtn = modal.querySelector('#editPhotoApplyUrlBtn');
    const fullNameInput = modal.querySelector('#editFullName');
    const submitterEmailInput = modal.querySelector('#editSubmitterEmail');

    const dirtyFields = new Set();
    let photoDirty = false;
    let isClosed = false;

    const setFieldError = (inputEl, errorElId, message) => {
        const errorEl = modal.querySelector(`#${errorElId}`);
        if (inputEl) {
            inputEl.setAttribute('aria-invalid', 'true');
        }
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.add('visible');
        }
    };

    const clearFieldError = (inputEl, errorElId) => {
        const errorEl = modal.querySelector(`#${errorElId}`);
        if (inputEl) {
            inputEl.removeAttribute('aria-invalid');
        }
        if (errorEl) {
            errorEl.textContent = '';
            errorEl.classList.remove('visible');
        }
    };

    const renderPhotoPreview = (src, statusText, isRemoved = false) => {
        if (photoStatusEl) {
            photoStatusEl.textContent = statusText;
            photoStatusEl.classList.toggle('is-removed', Boolean(isRemoved));
        }
        if (photoRevertBtn) {
            photoRevertBtn.disabled = editPhotoState.mode === 'keep';
        }
        if (!previewBox) return;
        previewBox.innerHTML = '';

        if (!src || isRemoved) {
            const placeholder = document.createElement('div');
            placeholder.className = 'edit-photo-placeholder';
            placeholder.textContent = isRemoved ? 'Photo will be removed' : 'No photo uploaded';
            previewBox.appendChild(placeholder);
            return;
        }

        const img = document.createElement('img');
        img.src = src;
        img.alt = 'Portrait preview';
        img.onerror = () => {
            if (!previewBox.isConnected) return;
            previewBox.innerHTML = '';
            const fallback = document.createElement('div');
            fallback.className = 'edit-photo-placeholder';
            fallback.textContent = 'No preview available';
            previewBox.appendChild(fallback);
        };
        previewBox.appendChild(img);
    };

    renderPhotoPreview(
        initialPhotoSrc,
        editPhotoState.initialRemoved
            ? 'No photo (previously removed)'
            : (initialPhotoSrc ? 'Current photo' : 'No photo set'),
        editPhotoState.initialRemoved
    );

    // Track dirty fields so background Firestore hydration never overwrites user edits
    form.querySelectorAll('input[name], textarea[name]').forEach((el) => {
        el.addEventListener('input', () => {
            dirtyFields.add(el.name);
            if (el.id === 'editFullName') clearFieldError(el, 'editFullNameError');
            if (el.id === 'editSubmitterEmail') clearFieldError(el, 'editSubmitterEmailError');
        });
    });

    fullNameInput.addEventListener('blur', () => {
        if (!fullNameInput.value.trim()) {
            setFieldError(fullNameInput, 'editFullNameError', 'Full name is required.');
        } else {
            clearFieldError(fullNameInput, 'editFullNameError');
        }
    });

    submitterEmailInput.addEventListener('blur', () => {
        if (!isValidOptionalEmail(submitterEmailInput.value)) {
            setFieldError(submitterEmailInput, 'editSubmitterEmailError', 'Please enter a valid email address or leave blank.');
        } else {
            clearFieldError(submitterEmailInput, 'editSubmitterEmailError');
        }
    });

    photoUrlInput.addEventListener('input', () => {
        clearFieldError(photoUrlInput, 'editPhotoError');
    });

    photoUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            photoApplyUrlBtn.click();
        }
    });

    photoApplyUrlBtn.addEventListener('click', () => {
        const rawUrl = photoUrlInput.value.trim();
        if (!isValidOptionalPhotoUrl(rawUrl)) {
            setFieldError(photoUrlInput, 'editPhotoError', 'Enter a valid https:// URL, /media/<shard>/<file>, or /assets/photos/<file> path.');
            return;
        }
        clearFieldError(photoUrlInput, 'editPhotoError');
        photoDirty = true;
        editPhotoState = { ...editPhotoState, mode: 'replace', value: rawUrl };
        renderPhotoPreview(rawUrl, 'New image URL ready to save', false);
    });

    photoInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        clearFieldError(photoUrlInput, 'editPhotoError');
        photoStatusEl.textContent = 'Compressing image…';
        try {
            const compressedDataUri = await compressImageForAdmin(file);
            photoDirty = true;
            editPhotoState = { ...editPhotoState, mode: 'replace', value: compressedDataUri };
            photoUrlInput.value = '';
            renderPhotoPreview(compressedDataUri, 'New photo selected (compressed JPEG)', false);
        } catch (err) {
            setFieldError(photoUrlInput, 'editPhotoError', err.message || 'Could not process image file.');
            renderPhotoPreview(
                editPhotoState.mode === 'remove' ? '' : editPhotoState.value,
                'Photo unchanged',
                editPhotoState.mode === 'remove'
            );
        } finally {
            photoInput.value = '';
        }
    });

    photoRemoveBtn.addEventListener('click', () => {
        clearFieldError(photoUrlInput, 'editPhotoError');
        photoDirty = true;
        photoUrlInput.value = '';
        editPhotoState = { ...editPhotoState, mode: 'remove', value: '' };
        renderPhotoPreview('', 'Photo will be removed on save', true);
    });

    photoRevertBtn.addEventListener('click', () => {
        clearFieldError(photoUrlInput, 'editPhotoError');
        photoDirty = false;
        editPhotoState = {
            ...editPhotoState,
            mode: 'keep',
            value: editPhotoState.initialSrc
        };
        photoUrlInput.value =
            editPhotoState.initialSrc && !editPhotoState.initialSrc.startsWith('data:image/')
                ? editPhotoState.initialSrc
                : '';
        renderPhotoPreview(
            editPhotoState.initialSrc,
            editPhotoState.initialRemoved ? 'No photo (previously removed)' : 'Reverted to current photo',
            editPhotoState.initialRemoved
        );
    });

    const cleanupModal = () => {
        if (isClosed) return;
        isClosed = true;
        if (modal.open && typeof modal.close === 'function') {
            try { modal.close(); } catch (_) {}
        }
        modal.remove();
        currentEditingMartyr = null;
    };

    modal.querySelector('.edit-modal-close').addEventListener('click', cleanupModal);
    modal.querySelector('.edit-cancel-btn').addEventListener('click', cleanupModal);
    modal.addEventListener('close', cleanupModal);
    modal.addEventListener('cancel', () => {
        // Allow native Esc dismiss and clean up
    });

    // Light-dismiss fallback for browsers without native dialog `closedby="any"` (e.g., Safari)
    modal.addEventListener('click', (e) => {
        if (e.target !== modal) return;
        if (e.clientX === 0 && e.clientY === 0) return;
        const rect = modal.getBoundingClientRect();
        const clickedOutside =
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom;
        if (clickedOutside) {
            cleanupModal();
        }
    });

    const validateEditForm = () => {
        let valid = true;
        if (!fullNameInput.value.trim()) {
            setFieldError(fullNameInput, 'editFullNameError', 'Full name is required.');
            valid = false;
        }
        if (!isValidOptionalEmail(submitterEmailInput.value)) {
            setFieldError(submitterEmailInput, 'editSubmitterEmailError', 'Please enter a valid email address or leave blank.');
            valid = false;
        }
        const pendingUrl = photoUrlInput.value.trim();
        if (pendingUrl && editPhotoState.value !== pendingUrl && !isValidOptionalPhotoUrl(pendingUrl)) {
            setFieldError(photoUrlInput, 'editPhotoError', 'Enter a valid https:// URL, /media/<shard>/<file>, or /assets/photos/<file> path.');
            valid = false;
        }
        return valid;
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!validateEditForm()) {
            const firstInvalid = form.querySelector('[aria-invalid="true"]');
            if (firstInvalid) firstInvalid.focus();
            return;
        }
        await saveEditedMartyr();
    });

    if (typeof modal.showModal === 'function') {
        modal.showModal();
    } else {
        modal.setAttribute('open', '');
    }

    setTimeout(() => {
        if (!isClosed && fullNameInput) fullNameInput.focus();
    }, 60);

    // Authoritative background hydration from Firestore so untouched fields reflect true full doc
    if (martyr.id && window.firebaseDB && typeof window.firebaseDB.getMartyrById === 'function') {
        window.firebaseDB.getMartyrById(collectionLabel, martyr.id).then(async (res) => {
            if (isClosed || !modal.isConnected) return;
            if (!res.success || !res.data) {
                syncBanner.classList.add('is-warn');
                syncBanner.textContent = res.error
                    ? `Notice: ${res.error} Showing cached details.`
                    : 'Showing cached details.';
                return;
            }

            const fresh = res.data;
            currentEditingMartyr = { ...currentEditingMartyr, ...fresh };

            const textFieldMap = {
                fullName: '#editFullName',
                fatherName: '#editFatherName',
                birthPlace: '#editBirthPlace',
                martyrdomPlace: '#editMartyrdomPlace',
                organization: '#editOrganization',
                affiliation: '#editAffiliation',
                rank: '#editRank',
                biography: '#editBiography',
                familyDetails: '#editFamilyDetails',
                submitterName: '#editSubmitterName',
                submitterEmail: '#editSubmitterEmail',
                submitterRelation: '#editSubmitterRelation',
                submitterPhone: '#editSubmitterPhone'
            };

            for (const [fieldName, selector] of Object.entries(textFieldMap)) {
                if (!dirtyFields.has(fieldName)) {
                    const inputEl = modal.querySelector(selector);
                    if (inputEl && fresh[fieldName] !== undefined) {
                        inputEl.value = fresh[fieldName] || '';
                    }
                }
            }

            if (!dirtyFields.has('birthDate')) {
                const el = modal.querySelector('#editBirthDate');
                if (el) el.value = toDateInputValue(fresh.birthDate);
            }
            if (!dirtyFields.has('martyrdomDate')) {
                const el = modal.querySelector('#editMartyrdomDate');
                if (el) el.value = toDateInputValue(fresh.martyrdomDate);
            }

            if (!photoDirty) {
                const hydratedPhoto = getSafeAdminPhotoSrc(fresh, mode !== 'pending');
                editPhotoState = {
                    mode: 'keep',
                    value: hydratedPhoto,
                    initialSrc: hydratedPhoto,
                    initialRemoved: Boolean(fresh.photoRemoved)
                };
                if (photoUrlInput) {
                    photoUrlInput.value =
                        hydratedPhoto && !hydratedPhoto.startsWith('data:image/')
                            ? hydratedPhoto
                            : '';
                }
                renderPhotoPreview(
                    hydratedPhoto,
                    fresh.photoRemoved
                        ? 'No photo (removed)'
                        : (hydratedPhoto ? 'Synced from Firestore' : 'No photo set'),
                    Boolean(fresh.photoRemoved)
                );
            }

            syncBanner.textContent = 'Synced full profile, submitter details & photo from Firestore.';
        }).catch((err) => {
            if (isClosed || !modal.isConnected) return;
            syncBanner.classList.add('is-warn');
            syncBanner.textContent = `Could not sync full record (${err.message}); showing cached details.`;
        });
    } else if (syncBanner) {
        syncBanner.textContent = 'Editing loaded record.';
    }
}

// Save edited martyr data (pending or approved)
async function saveEditedMartyr() {
    if (!currentEditingMartyr) {
        console.error('No martyr being edited');
        return;
    }

    if (!validateAdminAuth('save edited martyr')) {
        return;
    }

    const modal = document.getElementById('editMartyrModal');
    const form = document.getElementById('editMartyrForm');
    if (!form) return;
    const saveBtn = form.querySelector('.edit-save-btn');
    const urlInput = form.querySelector('#editPhotoUrlInput');

    saveBtn.disabled = true;
    saveBtn.textContent = '⏳ Saving...';

    try {
        const formData = new FormData(form);
        const updatedData = {};

        for (const [key, value] of formData.entries()) {
            const maxLength = key === 'biography' ? 15000 : 3000;
            updatedData[key] = sanitizeInput(String(value).trim(), {
                maxLength,
                allowNewlines: key === 'biography' || key === 'familyDetails'
            });
        }

        if (!updatedData.fullName) {
            alert('Full name is required.');
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Save Changes';
            return;
        }

        // Handle photo changes cleanly (also pick up a valid typed URL if user didn't click Apply URL)
        const pendingUrl = urlInput ? urlInput.value.trim() : '';
        if (editPhotoState.mode === 'replace') {
            updatedData.photo = editPhotoState.value;
            updatedData.photoRemoved = false;
        } else if (editPhotoState.mode === 'remove') {
            updatedData.photo = '';
            updatedData.photoRemoved = true;
        } else if (pendingUrl && pendingUrl !== editPhotoState.initialSrc && isValidOptionalPhotoUrl(pendingUrl)) {
            updatedData.photo = pendingUrl;
            updatedData.photoRemoved = false;
        }

        const targetId = currentEditingMartyr.id;
        const targetMode = currentEditingMode;
        console.log(`💾 Saving updated ${targetMode} martyr data:`, targetId);

        let result;
        if (targetMode === 'pending') {
            if (!window.firebaseDB || typeof window.firebaseDB.updatePendingMartyr !== 'function') {
                throw new Error('Firebase updatePendingMartyr method not available');
            }
            result = await window.firebaseDB.updatePendingMartyr(targetId, updatedData);
        } else {
            if (!window.firebaseDB || typeof window.firebaseDB.updateApprovedMartyr !== 'function') {
                throw new Error('Firebase updateApprovedMartyr method not available');
            }
            result = await window.firebaseDB.updateApprovedMartyr(targetId, updatedData);
        }

        if (result.success) {
            console.log(`✅ ${targetMode} martyr updated successfully`);

            if (modal) {
                if (typeof modal.close === 'function' && modal.open) {
                    try { modal.close(); } catch (_) {}
                }
                modal.remove();
            }
            currentEditingMartyr = null;

            if (targetMode === 'pending') {
                syncPendingMartyrInLocalStorage(targetId, updatedData);
                await loadPendingSubmissions();
            } else {
                await loadApprovedMartyrs();
            }

            showAdminToast(`"${updatedData.fullName}" has been updated successfully!`, 'success');
        } else {
            console.error('❌ Update failed:', result.error);
            alert(`Failed to update martyr: ${result.error}`);
            saveBtn.disabled = false;
            saveBtn.textContent = '💾 Save Changes';
        }
    } catch (error) {
        console.error('❌ Error saving martyr:', error);
        alert(`An error occurred while saving: ${error.message || 'Please try again.'}`);
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Save Changes';
    }
}

// Make admin & edit functions globally available immediately on module evaluation
window.refreshData = refreshData;
window.exportData = exportData;
window.importData = importData;
window.clearAllPending = clearAllPending;
window.loadPendingSubmissions = loadPendingSubmissions;
window.loadApprovedMartyrs = loadApprovedMartyrs;
window.showAdminToast = showAdminToast;
window.openEditMartyrModal = openEditMartyrModal;
window.saveEditedMartyr = saveEditedMartyr;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initPendingSearch();
        initApprovedSearch();
    });
} else {
    initPendingSearch();
    initApprovedSearch();
}

// ============================================
// END EDIT MARTYR FUNCTIONALITY
// ============================================
