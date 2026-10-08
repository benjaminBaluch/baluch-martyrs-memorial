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

// Normalize name for comparison (strip common honorifics/titles)
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

// Calculate similarity score between two martyrs
function calculateMartyrSimilarity(martyr1, martyr2) {
    const scores = {
        name: 0,
        fatherName: 0,
        birthPlace: 0,
        martyrdomPlace: 0,
        martyrdomDate: 0
    };
    
    // Name similarity
    scores.name = calculateBestNameSimilarity(martyr1.fullName, martyr2.fullName);
    
    // Father name similarity
    const hasFather = Boolean(martyr1.fatherName && martyr1.fatherName.trim() && martyr2.fatherName && martyr2.fatherName.trim());
    if (hasFather) {
        scores.fatherName = calculateBestNameSimilarity(martyr1.fatherName, martyr2.fatherName);
    }
    
    // Birth place similarity
    const hasBirthPlace = Boolean(martyr1.birthPlace && martyr1.birthPlace.trim() && martyr2.birthPlace && martyr2.birthPlace.trim());
    if (hasBirthPlace) {
        scores.birthPlace = calculateStringSimilarity(
            martyr1.birthPlace.toLowerCase(),
            martyr2.birthPlace.toLowerCase()
        );
    }
    
    // Martyrdom place similarity
    const hasMartyrPlace = Boolean(martyr1.martyrdomPlace && martyr1.martyrdomPlace.trim() && martyr2.martyrdomPlace && martyr2.martyrdomPlace.trim());
    if (hasMartyrPlace) {
        scores.martyrdomPlace = calculateStringSimilarity(
            martyr1.martyrdomPlace.toLowerCase(),
            martyr2.martyrdomPlace.toLowerCase()
        );
    }
    
    // Martyrdom date comparison
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
    const hasMartyrDate = Boolean(date1 && date2);
    if (hasMartyrDate) {
        scores.martyrdomDate = date1 === date2 ? 1.0 : 0;
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
        weightedSum += scores.martyrdomDate * 0.12;
        totalWeight += 0.12;
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
    
    return { total: totalScore, breakdown: scores };
}

// Find potential duplicates
function findPotentialDuplicates(martyrData, threshold = 0.62) {
    const duplicates = [];
    if (!martyrData || !martyrData.fullName || martyrData.fullName.trim().length < 3) {
        return duplicates;
    }
    
    for (const existing of existingMartyrs) {
        const similarity = calculateMartyrSimilarity(martyrData, existing);
        
        // Trigger if overall similarity >= threshold OR if name similarity is very high (>= 0.84)
        if (similarity.total >= threshold || similarity.breakdown.name >= 0.84) {
            duplicates.push({
                martyr: existing,
                similarity: Math.max(similarity.total, similarity.breakdown.name * 0.85),
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
    if (!dateVal) return '';
    try {
        let date;
        if (dateVal.toDate && typeof dateVal.toDate === 'function') {
            date = dateVal.toDate();
        } else if (typeof dateVal === 'string') {
            date = new Date(dateVal);
        } else if (dateVal instanceof Date) {
            date = dateVal;
        } else {
            return '';
        }
        if (isNaN(date.getTime())) return '';
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch (e) {
        return '';
    }
}

// Ensure duplicate modal styles (Forest-Green Archival UI matching Admin) are injected once
function ensureDuplicateModalStyles() {
    if (document.getElementById('duplicateModalStyles')) return;
    const style = document.createElement('style');
    style.id = 'duplicateModalStyles';
    style.textContent = `
        .duplicate-modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(10, 22, 14, 0.78);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10000;
            padding: 1.5rem;
            overflow-y: auto;
        }
        .duplicate-modal-content {
            background: #ffffff;
            border: 1px solid #d1fae5;
            border-radius: 18px;
            box-shadow: 0 24px 64px -12px rgba(6, 24, 14, 0.45);
            max-width: 1040px;
            width: 100%;
            max-height: calc(100vh - 3rem);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            animation: dupModalSlide 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @keyframes dupModalSlide {
            from { opacity: 0; transform: translateY(-16px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .duplicate-modal-header {
            background:
                radial-gradient(circle at 15% 25%, rgba(34, 197, 94, 0.18) 0%, transparent 48%),
                linear-gradient(135deg, #16381c 0%, #0e2412 100%);
            color: #ffffff;
            padding: 1.25rem 1.5rem;
            display: flex;
            align-items: center;
            gap: 1rem;
            flex-shrink: 0;
            border-bottom: 1px solid rgba(134, 239, 172, 0.2);
        }
        .dup-header-icon {
            width: 44px;
            height: 44px;
            border-radius: 12px;
            background: rgba(34, 197, 94, 0.18);
            border: 1px solid rgba(134, 239, 172, 0.35);
            color: #86efac;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .dup-header-icon svg {
            width: 22px;
            height: 22px;
        }
        .dup-header-text {
            flex: 1;
            min-width: 0;
        }
        .dup-header-text h2 {
            margin: 0;
            font-family: 'Inter', sans-serif;
            font-size: 1.25rem;
            font-weight: 800;
            letter-spacing: -0.02em;
            color: #ffffff !important;
            line-height: 1.25;
        }
        .dup-header-text p {
            margin: 0.2rem 0 0;
            font-size: 0.85rem;
            color: rgba(220, 252, 231, 0.88) !important;
            line-height: 1.4;
        }
        .duplicate-modal-close {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.18);
            color: #ffffff;
            width: 36px;
            height: 36px;
            border-radius: 10px;
            font-size: 1.35rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.18s ease;
            flex-shrink: 0;
            line-height: 1;
        }
        .duplicate-modal-close:hover {
            background: rgba(255, 255, 255, 0.2);
            border-color: rgba(255, 255, 255, 0.32);
            transform: translateY(-1px);
        }
        .duplicate-modal-body {
            padding: 1.35rem 1.5rem;
            overflow-y: auto;
            flex: 1;
            background: #f4f7f4;
        }
        .dup-alert-banner {
            display: flex;
            align-items: center;
            gap: 0.85rem;
            padding: 0.85rem 1.15rem;
            background: #f0fdf4;
            border: 1px solid #bbf7d0;
            border-left: 4px solid #16a34a;
            border-radius: 12px;
            margin-bottom: 1.25rem;
        }
        .dup-alert-icon {
            width: 32px;
            height: 32px;
            border-radius: 8px;
            background: #dcfce7;
            color: #15803d;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .dup-alert-icon svg {
            width: 18px;
            height: 18px;
        }
        .dup-alert-text {
            font-size: 0.88rem;
            color: #1e293b;
            line-height: 1.45;
        }
        .dup-alert-text strong {
            color: #14532d;
            font-weight: 700;
        }
        .dup-comparisons-container {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
        }
        .dup-comparison-row {
            border: 1px solid #cbd5e1;
            border-radius: 16px;
            overflow: hidden;
            background: #ffffff;
            box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
        }
        .dup-match-indicator {
            padding: 0.8rem 1.25rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 1rem;
            flex-wrap: wrap;
            background: linear-gradient(135deg, #1b4323 0%, #14331a 100%);
            color: #ffffff;
            border-bottom: 1px solid rgba(134, 239, 172, 0.2);
        }
        .dup-match-left {
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        .dup-match-percent {
            font-size: 1.25rem;
            font-weight: 800;
            letter-spacing: -0.02em;
            background: rgba(34, 197, 94, 0.22);
            border: 1px solid rgba(134, 239, 172, 0.4);
            color: #dcfce7;
            padding: 0.2rem 0.65rem;
            border-radius: 8px;
            line-height: 1.2;
        }
        .dup-match-label {
            font-size: 0.9rem;
            font-weight: 700;
            color: #ffffff;
        }
        .dup-match-sub {
            font-size: 0.75rem;
            color: rgba(220, 252, 231, 0.78);
            font-weight: 500;
        }
        .dup-match-details {
            display: flex;
            gap: 0.45rem;
            flex-wrap: wrap;
            margin-left: auto;
        }
        .dup-match-tag {
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
            padding: 0.28rem 0.65rem;
            background: rgba(255, 255, 255, 0.12);
            border: 1px solid rgba(134, 239, 172, 0.32);
            color: #dcfce7;
            border-radius: 999px;
            font-size: 0.74rem;
            font-weight: 600;
        }
        .dup-match-tag svg {
            width: 12px;
            height: 12px;
            color: #4ade80;
            flex-shrink: 0;
        }
        .dup-side-by-side {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
            gap: 0;
            padding: 1.25rem;
            background: #ffffff;
            align-items: stretch;
        }
        .dup-vs-divider {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 0.85rem;
            position: relative;
        }
        .dup-vs-divider::before {
            content: '';
            position: absolute;
            top: 12%;
            bottom: 12%;
            left: 50%;
            width: 1px;
            background: #e2e8f0;
            transform: translateX(-50%);
            z-index: 0;
        }
        .dup-vs-divider span {
            position: relative;
            z-index: 1;
            background: #f0fdf4;
            color: #15803d;
            border: 1.5px solid #86efac;
            font-weight: 800;
            font-size: 0.74rem;
            width: 36px;
            height: 36px;
            border-radius: 50%;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            letter-spacing: 0.04em;
            box-shadow: 0 2px 8px rgba(21, 128, 61, 0.12);
        }
        .dup-profile-card {
            border: 1.5px solid #e2e8f0;
            border-radius: 14px;
            overflow: hidden;
            background: #ffffff;
            display: flex;
            flex-direction: column;
        }
        .dup-profile-card.dup-new-submission {
            border-color: #cbd5e1;
        }
        .dup-profile-card.dup-existing {
            border-color: #86efac;
            background: #fcfffd;
        }
        .dup-card-header {
            padding: 0.65rem 1rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 1px solid #e2e8f0;
            gap: 0.5rem;
        }
        .dup-new-submission .dup-card-header {
            background: #f8fafc;
            border-bottom-color: #e2e8f0;
        }
        .dup-existing .dup-card-header {
            background: #f0fdf4;
            border-bottom-color: #bbf7d0;
        }
        .dup-card-badge {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            font-size: 0.75rem;
            font-weight: 700;
            padding: 0.26rem 0.65rem;
            border-radius: 999px;
        }
        .dup-card-badge svg {
            width: 13px;
            height: 13px;
            flex-shrink: 0;
        }
        .dup-card-badge.new {
            background: #e2e8f0;
            color: #1e293b;
        }
        .dup-card-badge.existing {
            background: #15803d;
            color: #ffffff;
        }
        .dup-card-status-hint {
            font-size: 0.72rem;
            font-weight: 600;
            color: #64748b;
            text-decoration: none;
        }
        .dup-existing .dup-card-status-hint {
            color: #15803d;
        }
        .dup-card-body {
            padding: 1.1rem;
            display: flex;
            gap: 1rem;
            align-items: flex-start;
            flex: 1;
        }
        .dup-profile-photo {
            width: 92px;
            height: 118px;
            flex-shrink: 0;
            border-radius: 10px;
            overflow: hidden;
            border: 1.5px solid #cbd5e1;
            background: #f1f5f9;
            box-shadow: 0 2px 8px rgba(15, 23, 42, 0.08);
        }
        .dup-existing .dup-profile-photo {
            border-color: #86efac;
        }
        .dup-profile-photo img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }
        .dup-no-photo {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: #f8fafc;
            color: #94a3b8;
            gap: 0.25rem;
        }
        .dup-no-photo svg {
            width: 24px;
            height: 24px;
            stroke-width: 1.75;
        }
        .dup-no-photo small {
            font-size: 0.68rem;
            font-weight: 600;
        }
        .dup-profile-details {
            flex: 1;
            min-width: 0;
        }
        .dup-profile-name {
            margin: 0 0 0.65rem 0;
            font-family: 'Inter', sans-serif;
            font-size: 1.05rem;
            font-weight: 800;
            color: #0f172a;
            line-height: 1.28;
            letter-spacing: -0.015em;
            word-break: break-word;
        }
        .dup-profile-fields {
            display: flex;
            flex-direction: column;
            border-top: 1px solid #f1f5f9;
        }
        .dup-field {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 0.75rem;
            padding: 0.38rem 0;
            border-bottom: 1px dashed #e2e8f0;
            font-size: 0.8rem;
        }
        .dup-field:last-child {
            border-bottom: none;
            padding-bottom: 0;
        }
        .dup-field-label {
            color: #64748b;
            font-weight: 600;
            font-size: 0.73rem;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            flex-shrink: 0;
        }
        .dup-field-value {
            color: #0f172a;
            font-weight: 600;
            text-align: right;
            word-break: break-word;
        }
        .dup-field.is-matching-field .dup-field-value {
            color: #15803d;
        }
        .dup-field-value em {
            color: #94a3b8;
            font-weight: 400;
            font-style: normal;
        }
        .duplicate-modal-footer {
            padding: 1rem 1.5rem;
            background: #ffffff;
            border-top: 1px solid #e2e8f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 1rem;
            flex-shrink: 0;
        }
        .dup-footer-hint {
            font-size: 0.8rem;
            color: #64748b;
            font-weight: 500;
        }
        .dup-footer-actions {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            margin-left: auto;
        }
        .dup-btn-cancel,
        .dup-btn-proceed {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.72rem 1.25rem;
            font-size: 0.88rem;
            font-weight: 700;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.18s ease;
            font-family: inherit;
        }
        .dup-btn-cancel svg,
        .dup-btn-proceed svg {
            width: 16px;
            height: 16px;
            flex-shrink: 0;
        }
        .dup-btn-cancel {
            background: #f8fafc;
            color: #334155;
            border: 1px solid #cbd5e1;
        }
        .dup-btn-cancel:hover {
            background: #f1f5f9;
            color: #0f172a;
            border-color: #94a3b8;
        }
        .dup-btn-proceed {
            background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
            color: #ffffff;
            border: 1px solid #15803d;
            box-shadow: 0 3px 10px rgba(21, 128, 61, 0.22);
        }
        .dup-btn-proceed:hover {
            background: linear-gradient(135deg, #15803d 0%, #166534 100%);
            transform: translateY(-1px);
            box-shadow: 0 6px 16px rgba(21, 128, 61, 0.3);
        }

        /* Live Inline Duplicate Banner inside Add Martyr Form */
        .live-dup-banner {
            margin-top: 0.75rem;
            border: 1.5px solid #86efac;
            border-left: 4px solid #16a34a;
            background: #f0fdf4;
            border-radius: 12px;
            padding: 0.85rem 1rem;
            animation: dupModalSlide 0.2s ease-out;
            font-family: 'Inter', sans-serif;
        }
        .live-dup-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            flex-wrap: wrap;
            margin-bottom: 0.65rem;
        }
        .live-dup-title {
            display: inline-flex;
            align-items: center;
            gap: 0.45rem;
            font-size: 0.82rem;
            font-weight: 700;
            color: #14532d;
        }
        .live-dup-title svg {
            width: 16px;
            height: 16px;
            color: #16a34a;
            flex-shrink: 0;
        }
        .live-dup-compare-btn {
            background: #15803d;
            color: #ffffff;
            border: none;
            border-radius: 8px;
            padding: 0.38rem 0.75rem;
            font-size: 0.76rem;
            font-weight: 700;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 0.35rem;
            transition: all 0.15s ease;
        }
        .live-dup-compare-btn:hover {
            background: #166534;
            transform: translateY(-1px);
        }
        .live-dup-item {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            background: #ffffff;
            border: 1px solid #bbf7d0;
            border-radius: 10px;
            padding: 0.6rem 0.75rem;
        }
        .live-dup-thumb {
            width: 44px;
            height: 54px;
            border-radius: 7px;
            overflow: hidden;
            background: #f1f5f9;
            border: 1px solid #86efac;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #94a3b8;
        }
        .live-dup-thumb img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }
        .live-dup-info {
            flex: 1;
            min-width: 0;
        }
        .live-dup-name {
            font-size: 0.9rem;
            font-weight: 800;
            color: #0f172a;
            margin: 0 0 0.15rem;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .live-dup-meta {
            font-size: 0.76rem;
            color: #475569;
            margin: 0;
        }
        .live-dup-badge {
            background: #dcfce7;
            color: #166534;
            border: 1px solid #86efac;
            font-size: 0.72rem;
            font-weight: 800;
            padding: 0.22rem 0.55rem;
            border-radius: 999px;
            flex-shrink: 0;
        }

        @media (max-width: 900px) {
            .dup-side-by-side {
                grid-template-columns: minmax(0, 1fr);
                gap: 0.75rem;
            }
            .dup-vs-divider {
                padding: 0.25rem 0;
            }
            .dup-vs-divider::before {
                top: 50%;
                bottom: auto;
                left: 10%;
                right: 10%;
                width: 80%;
                height: 1px;
                transform: none;
            }
        }
        @media (max-width: 600px) {
            .duplicate-modal-overlay {
                padding: 0.65rem;
            }
            .duplicate-modal-content {
                border-radius: 14px;
                max-height: calc(100vh - 1.3rem);
            }
            .duplicate-modal-header {
                padding: 1rem 1.1rem;
            }
            .dup-header-text h2 {
                font-size: 1.05rem;
            }
            .dup-header-text p {
                font-size: 0.78rem;
            }
            .duplicate-modal-body {
                padding: 1rem;
            }
            .dup-card-body {
                flex-direction: column;
                align-items: center;
                text-align: center;
            }
            .dup-profile-details {
                width: 100%;
            }
            .dup-field {
                text-align: left;
            }
            .duplicate-modal-footer {
                flex-direction: column;
                align-items: stretch;
                padding: 1rem;
            }
            .dup-footer-hint {
                text-align: center;
            }
            .dup-footer-actions {
                flex-direction: column;
                width: 100%;
                margin-left: 0;
            }
            .dup-btn-cancel,
            .dup-btn-proceed {
                width: 100%;
                justify-content: center;
            }
        }
        [data-theme="dark"] .duplicate-modal-content {
            background: #111c2d;
            border-color: rgba(134, 239, 172, 0.22);
        }
        [data-theme="dark"] .duplicate-modal-body {
            background: #0b131e;
        }
        [data-theme="dark"] .dup-alert-banner,
        [data-theme="dark"] .live-dup-banner {
            background: rgba(22, 163, 74, 0.1);
            border-color: rgba(134, 239, 172, 0.25);
            border-left-color: #22c55e;
        }
        [data-theme="dark"] .live-dup-title,
        [data-theme="dark"] .dup-alert-text strong {
            color: #86efac;
        }
        [data-theme="dark"] .dup-alert-text {
            color: #e2e8f0;
        }
        [data-theme="dark"] .live-dup-item {
            background: #111c2d;
            border-color: rgba(134, 239, 172, 0.25);
        }
        [data-theme="dark"] .live-dup-name {
            color: #f8fafc;
        }
        [data-theme="dark"] .live-dup-meta {
            color: #94a3b8;
        }
        [data-theme="dark"] .dup-comparison-row,
        [data-theme="dark"] .dup-side-by-side {
            background: #111c2d;
            border-color: #26354d;
        }
        [data-theme="dark"] .dup-profile-card {
            background: #0f172a;
            border-color: #26354d;
        }
        [data-theme="dark"] .dup-profile-card.dup-existing {
            border-color: rgba(74, 222, 128, 0.45);
            background: rgba(20, 51, 26, 0.22);
        }
        [data-theme="dark"] .dup-new-submission .dup-card-header {
            background: #162235;
            border-bottom-color: #26354d;
        }
        [data-theme="dark"] .dup-existing .dup-card-header {
            background: rgba(22, 163, 74, 0.16);
            border-bottom-color: rgba(134, 239, 172, 0.25);
        }
        [data-theme="dark"] .dup-profile-name {
            color: #f8fafc;
        }
        [data-theme="dark"] .dup-field {
            border-bottom-color: #1e293b;
        }
        [data-theme="dark"] .dup-field-label {
            color: #94a3b8;
        }
        [data-theme="dark"] .dup-field-value {
            color: #e2e8f0;
        }
        [data-theme="dark"] .dup-field.is-matching-field .dup-field-value {
            color: #4ade80;
        }
        [data-theme="dark"] .duplicate-modal-footer {
            background: #111c2d;
            border-top-color: #26354d;
        }
        [data-theme="dark"] .dup-btn-cancel {
            background: #1e293b;
            border-color: #334155;
            color: #e2e8f0;
        }
    `;
    document.head.appendChild(style);
}

// Show duplicate warning modal — Side-by-side Forest-Green Archival Comparison
function showDuplicateModal(newMartyr, duplicates, onProceed, onCancel) {
    ensureDuplicateModalStyles();

    const existing = document.getElementById('duplicateCheckModal');
    if (existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'duplicateCheckModal';
    modal.className = 'duplicate-modal-overlay';

    const checkIconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';

    // Fallback to preview image if newMartyr.photo wasn't encoded yet (e.g. triggered from live check)
    const previewImgEl = document.getElementById('previewPhotoImg');
    const newMartyrWithPhoto = {
        ...newMartyr,
        photo: newMartyr.photo || (previewImgEl && previewImgEl.src && previewImgEl.src.startsWith('data:') ? previewImgEl.src : '')
    };

    const createProfileCard = (martyr, breakdown = {}) => {
        const orgDisplay = martyr.organization || martyr.affiliation || '';
        const prettyDate = formatDateDisplay(martyr.martyrdomDate);
        return `
            <div class="dup-profile-photo">
                ${martyr.photo ? 
                    `<img src="${martyr.photo}" alt="${escapeHTMLSafe(martyr.fullName)}">` :
                    `<div class="dup-no-photo">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                        <small>No Photo</small>
                    </div>`
                }
            </div>
            <div class="dup-profile-details">
                <h4 class="dup-profile-name">${escapeHTMLSafe(martyr.fullName || 'Unnamed')}</h4>
                <div class="dup-profile-fields">
                    <div class="dup-field${breakdown.fatherName > 0.7 ? ' is-matching-field' : ''}">
                        <span class="dup-field-label">Father</span>
                        <span class="dup-field-value">${martyr.fatherName ? escapeHTMLSafe(martyr.fatherName) : '<em>Not provided</em>'}</span>
                    </div>
                    <div class="dup-field${breakdown.birthPlace > 0.7 ? ' is-matching-field' : ''}">
                        <span class="dup-field-label">Birth Place</span>
                        <span class="dup-field-value">${martyr.birthPlace ? escapeHTMLSafe(martyr.birthPlace) : '<em>Not provided</em>'}</span>
                    </div>
                    <div class="dup-field${breakdown.martyrdomPlace > 0.7 ? ' is-matching-field' : ''}">
                        <span class="dup-field-label">Martyrdom Place</span>
                        <span class="dup-field-value">${martyr.martyrdomPlace ? escapeHTMLSafe(martyr.martyrdomPlace) : '<em>Not provided</em>'}</span>
                    </div>
                    <div class="dup-field${breakdown.martyrdomDate > 0.8 ? ' is-matching-field' : ''}">
                        <span class="dup-field-label">Martyrdom Date</span>
                        <span class="dup-field-value">${prettyDate ? escapeHTMLSafe(prettyDate) : '<em>Not provided</em>'}</span>
                    </div>
                    <div class="dup-field">
                        <span class="dup-field-label">Organization</span>
                        <span class="dup-field-value">${orgDisplay ? escapeHTMLSafe(orgDisplay) : '<em>Not provided</em>'}</span>
                    </div>
                </div>
            </div>
        `;
    };
    
    const comparisonRowsHtml = duplicates.slice(0, 3).map((dup) => {
        const similarity = (dup.similarity * 100).toFixed(0);
        const matchLabel = similarity >= 90 ? 'Very High Similarity' : similarity >= 80 ? 'High Similarity' : similarity >= 70 ? 'Moderate Similarity' : 'Possible Match';
        const bd = dup.breakdown || {};
        const galleryUrl = `/gallery?q=${encodeURIComponent(dup.martyr.fullName || '')}`;
        
        return `
            <div class="dup-comparison-row">
                <div class="dup-match-indicator">
                    <div class="dup-match-left">
                        <div class="dup-match-percent">${similarity}% Match</div>
                        <div>
                            <div class="dup-match-label">${matchLabel}</div>
                            <div class="dup-match-sub">Matching fields highlighted below</div>
                        </div>
                    </div>
                    <div class="dup-match-details">
                        ${bd.name > 0.7 ? `<span class="dup-match-tag">${checkIconSvg} Name</span>` : ''}
                        ${bd.fatherName > 0.7 ? `<span class="dup-match-tag">${checkIconSvg} Father</span>` : ''}
                        ${bd.birthPlace > 0.7 ? `<span class="dup-match-tag">${checkIconSvg} Birth Place</span>` : ''}
                        ${bd.martyrdomPlace > 0.7 ? `<span class="dup-match-tag">${checkIconSvg} Martyrdom Place</span>` : ''}
                        ${bd.martyrdomDate > 0.8 ? `<span class="dup-match-tag">${checkIconSvg} Date</span>` : ''}
                    </div>
                </div>
                
                <div class="dup-side-by-side">
                    <div class="dup-profile-card dup-new-submission">
                        <div class="dup-card-header">
                            <span class="dup-card-badge new">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                Your Submission
                            </span>
                            <span class="dup-card-status-hint">Current Form</span>
                        </div>
                        <div class="dup-card-body">
                            ${createProfileCard(newMartyrWithPhoto, bd)}
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
                            <a href="${galleryUrl}" target="_blank" rel="noopener" class="dup-card-status-hint">View in Gallery ↗</a>
                        </div>
                        <div class="dup-card-body">
                            ${createProfileCard(dup.martyr, bd)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    modal.innerHTML = `
        <div class="duplicate-modal-content" role="dialog" aria-modal="true" aria-labelledby="dupCheckModalTitle">
            <div class="duplicate-modal-header">
                <div class="dup-header-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                </div>
                <div class="dup-header-text">
                    <h2 id="dupCheckModalTitle">Potential Duplicate Detected</h2>
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
                        <strong>Please review carefully before submitting.</strong>
                        Compare your submission against the published archive record below. If this hero is already documented, please cancel to avoid duplicate records.
                    </div>
                </div>
                
                <div class="dup-comparisons-container">
                    ${comparisonRowsHtml}
                </div>
            </div>
            
            <div class="duplicate-modal-footer">
                <span class="dup-footer-hint">If this is a different person with a similar name, you may still submit</span>
                <div class="dup-footer-actions">
                    <button type="button" class="btn dup-btn-cancel">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                        <span>Cancel Submission</span>
                    </button>
                    <button type="button" class="btn dup-btn-proceed" style="${onProceed ? '' : 'display:none;'}">
                        ${checkIconSvg}
                        <span>Not a Duplicate — Submit Anyway</span>
                    </button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    const closeModal = () => {
        modal.remove();
        document.body.style.overflow = '';
    };
    
    modal.querySelector('.duplicate-modal-close').addEventListener('click', () => {
        closeModal();
        if (onCancel) onCancel();
    });
    
    modal.querySelector('.dup-btn-cancel').addEventListener('click', () => {
        closeModal();
        if (onCancel) onCancel();
    });
    
    const proceedBtn = modal.querySelector('.dup-btn-proceed');
    if (proceedBtn) {
        proceedBtn.addEventListener('click', () => {
            closeModal();
            if (onProceed) onProceed();
        });
    }
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
            if (onCancel) onCancel();
        }
    });
    
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            if (onCancel) onCancel();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Live inline duplicate detector as user types in Section 01
function initLiveDuplicateDetection() {
    ensureDuplicateModalStyles();
    const fullNameInput = document.getElementById('fullName');
    if (!fullNameInput) return;

    const fatherInput = document.getElementById('fatherName');
    const martyrDateInput = document.getElementById('martyrdomDate');
    const martyrPlaceInput = document.getElementById('martyrdomPlace');
    const birthPlaceInput = document.getElementById('birthPlace');

    // Create container right below the fullName form-group
    let bannerContainer = document.getElementById('liveDuplicateNoticeContainer');
    if (!bannerContainer) {
        bannerContainer = document.createElement('div');
        bannerContainer.id = 'liveDuplicateNoticeContainer';
        const formGroup = fullNameInput.closest('.form-group');
        if (formGroup) {
            formGroup.appendChild(bannerContainer);
        }
    }

    let debounceTimer = null;
    const runLiveCheck = async () => {
        const nameVal = (fullNameInput.value || '').trim();
        if (nameVal.length < 4) {
            bannerContainer.innerHTML = '';
            return;
        }

        if (existingMartyrs.length === 0 && firebaseDB) {
            await loadExistingMartyrsForDuplicateCheck();
        }
        if (existingMartyrs.length === 0) return;

        const draftMartyr = {
            fullName: nameVal,
            fatherName: (fatherInput?.value || '').trim(),
            martyrdomDate: (martyrDateInput?.value || '').trim(),
            martyrdomPlace: (martyrPlaceInput?.value || '').trim(),
            birthPlace: (birthPlaceInput?.value || '').trim(),
            organization: getOrganizationValue()
        };

        const matches = findPotentialDuplicates(draftMartyr, 0.65);
        if (matches.length === 0) {
            bannerContainer.innerHTML = '';
            return;
        }

        const top = matches[0];
        const pct = Math.round(top.similarity * 100);
        const m = top.martyr;
        const metaParts = [];
        if (m.fatherName) metaParts.push(`Father: ${escapeHTMLSafe(m.fatherName)}`);
        if (m.martyrdomPlace) metaParts.push(escapeHTMLSafe(m.martyrdomPlace));
        const dStr = formatDateDisplay(m.martyrdomDate);
        if (dStr) metaParts.push(escapeHTMLSafe(dStr));

        bannerContainer.innerHTML = `
            <div class="live-dup-banner" role="status" aria-live="polite">
                <div class="live-dup-header">
                    <span class="live-dup-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                        Potential Duplicate Detected (${matches.length} existing ${matches.length === 1 ? 'profile' : 'profiles'} in archive)
                    </span>
                    <button type="button" class="live-dup-compare-btn" id="liveDupCompareBtn">
                        Compare Profiles
                    </button>
                </div>
                <div class="live-dup-item">
                    <div class="live-dup-thumb">
                        ${m.photo
                            ? `<img src="${m.photo}" alt="${escapeHTMLSafe(m.fullName)}">`
                            : `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`
                        }
                    </div>
                    <div class="live-dup-info">
                        <p class="live-dup-name">${escapeHTMLSafe(m.fullName)}</p>
                        <p class="live-dup-meta">${metaParts.join(' • ') || 'Published in Memorial Archive'}</p>
                    </div>
                    <span class="live-dup-badge">${pct}% Match</span>
                </div>
            </div>
        `;

        const compareBtn = document.getElementById('liveDupCompareBtn');
        if (compareBtn) {
            compareBtn.addEventListener('click', () => {
                showDuplicateModal(draftMartyr, matches, null, null);
            });
        }
    };

    const scheduleCheck = () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(runLiveCheck, 350);
    };

    [fullNameInput, fatherInput, martyrDateInput, martyrPlaceInput, birthPlaceInput].forEach(el => {
        if (el) {
            el.addEventListener('input', scheduleCheck);
            el.addEventListener('blur', scheduleCheck);
        }
    });
}

// Initialize everything once DOM is loaded
document.addEventListener('DOMContentLoaded', async function() {
    if (formInitialized) return; // Prevent double initialization
    formInitialized = true;
    
    console.log('🎯 Initializing add-martyr form...');
    
    // Initialize form handlers immediately so UI is responsive
    initializeFormHandlers();
    initializeValidation();
    initLiveDuplicateDetection();
    
    // Load Firebase modules and existing martyrs for duplicate detection
    await loadFirebaseModules();
    
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

// Compress image to fit within Firestore's 1MB field limit
// Base64 encoding adds ~33% overhead, so blob must be under ~700KB
function compressImage(file, maxWidth = 600, maxHeight = 450, quality = 0.7) {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        img.onload = async function() {
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
            ctx.drawImage(img, 0, 0, width, height);
            
            // Progressive compression: keep reducing quality until under 700KB
            // 700KB blob → ~930KB base64 → safely under Firestore's 1,048,487 byte limit
            const MAX_BLOB_SIZE = 700 * 1024; // 700KB
            let currentQuality = quality;
            
            const tryCompress = (q) => new Promise(res => {
                canvas.toBlob(res, 'image/jpeg', q);
            });
            
            let blob = await tryCompress(currentQuality);
            
            while (blob && blob.size > MAX_BLOB_SIZE && currentQuality > 0.2) {
                currentQuality -= 0.1;
                console.log(`🗜️ Photo still ${(blob.size/1024).toFixed(0)}KB, reducing quality to ${(currentQuality*100).toFixed(0)}%...`);
                blob = await tryCompress(currentQuality);
            }
            
            // If still too large at 20% quality, reduce dimensions further
            if (blob && blob.size > MAX_BLOB_SIZE) {
                const scale = 0.6;
                canvas.width = width * scale;
                canvas.height = height * scale;
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                blob = await tryCompress(0.5);
                console.log(`🗜️ Reduced dimensions to ${canvas.width.toFixed(0)}×${canvas.height.toFixed(0)} at 50% quality`);
            }
            
            console.log(`✅ Final photo: ${(blob.size/1024).toFixed(0)}KB at ${(currentQuality*100).toFixed(0)}% quality`);
            resolve(blob);
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
async function handleFormSubmit(event) {
    event.preventDefault();
    console.log('📋 Form submission started');
    
    // Rate limiting check (max 3 submissions per 5 minutes)
    const rateCheck = checkRateLimit('martyr_submission', 3, 300000);
    if (!rateCheck.allowed) {
        hideLoadingState();
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
                hideLoadingState();
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
            hideLoadingState();
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
            hideLoadingState();
            alert('Date of Birth looks invalid. Please select it again.');
            const birthField = form.querySelector('#birthDate');
            if (birthField) birthField.focus();
            return;
        }
        if (!normalizedMartyrdom) {
            hideLoadingState();
            alert('Date of Martyrdom looks invalid. Please select it again.');
            const martyrField = form.querySelector('#martyrdomDate');
            if (martyrField) martyrField.focus();
            return;
        }

        // Optional logical check: birth after martyrdom
        if (normalizedBirth && normalizedMartyrdom && normalizedBirth > normalizedMartyrdom) {
            const proceed = confirm('Warning: Date of birth is after date of martyrdom.\n\nIf this is not correct, press Cancel and fix the dates.');
            if (!proceed) {
                hideLoadingState();
                const birthField = form.querySelector('#birthDate');
                if (birthField) birthField.focus();
                return;
            }
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
        
        // Handle photo data — always compress at submit time
        // (compressedFile from initFileUploads may not exist if photoPreview element is missing)
        const photoInput = document.getElementById('martyrPhoto');
        const rawFile = photoInput && photoInput.files && photoInput.files[0];
        
        if (rawFile && rawFile.size > 0) {
            console.log(`📷 Compressing photo before submission... (raw: ${(rawFile.size/1024/1024).toFixed(2)}MB)`);
            
            try {
                // Always compress — guarantees under 700KB blob (< 1MB base64)
                const compressedBlob = await compressImage(rawFile);
                console.log(`🗜️ Compressed to ${(compressedBlob.size/1024).toFixed(0)}KB`);
                
                const reader = new FileReader();
                reader.onload = function(e) {
                    martyrData.photo = e.target.result;
                    console.log(`📷 Base64 photo ready: ${(martyrData.photo.length/1024).toFixed(0)}KB`);
                    saveMartyrData(martyrData);
                };
                reader.onerror = function() {
                    console.error('❌ Photo encoding failed');
                    hideLoadingState();
                    alert('❌ Error processing photo. Please try a different image.');
                };
                reader.readAsDataURL(compressedBlob);
            } catch (compressError) {
                console.error('❌ Photo compression failed:', compressError);
                hideLoadingState();
                alert('❌ Error compressing photo. Please try a smaller image.');
            }
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
        // Ensure existingMartyrs is loaded before checking duplicates
        if (!skipDuplicateCheck && existingMartyrs.length === 0 && firebaseDB) {
            await loadExistingMartyrsForDuplicateCheck();
        }

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
                        hideLoadingState();
                    }
                );
                return; // Stop here and wait for user decision
            }
        }

        // If not skipped, confirm key dates before final save
        if (!skipDuplicateCheck) {
            const prettyBirth = martyrData.birthDate ? formatDateForHelper(martyrData.birthDate) : 'Not provided';
            const prettyMartyrdom = formatDateForHelper(martyrData.martyrdomDate) || 'Unknown';
            const confirmMessage = [
                'Please confirm the key dates before submitting:',
                '',
                `Name: ${martyrData.fullName}`,
                `Date of Birth: ${prettyBirth}`,
                `Date of Martyrdom: ${prettyMartyrdom}`,
                '',
                'If any date is incorrect, press Cancel and fix it. Continue?'
            ].join('\n');

            if (!confirm(confirmMessage)) {
                hideLoadingState();
                return;
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
        submitBtn.classList.add('loading');
        console.log('🔄 Loading state shown');
    }
}

// Hide loading state after submission
function hideLoadingState() {
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove('loading');
        console.log('✅ Loading state hidden');
    }
}

// Show success message
function showSuccessMessage() {
    const form = document.getElementById('addMartyrForm');
    const successMessage = document.getElementById('successMessage');
    
    if (form && successMessage) {
        // Personalize with the submitted martyr's name
        const name = (document.getElementById('fullName')?.value || '').trim();
        const nameEl = document.getElementById('successNameDisplay');
        if (nameEl) nameEl.textContent = name || 'This hero';

        // Hide step progress indicator
        const stepProgress = document.getElementById('stepProgress');
        if (stepProgress) stepProgress.style.display = 'none';

        form.style.display = 'none';
        successMessage.style.display = 'block';
        
        // Scroll to success message
        successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
