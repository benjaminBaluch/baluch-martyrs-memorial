// Main JavaScript for Baluch Martyrs Memorial

// Theme management
const THEME_STORAGE_KEY = 'bmm_theme_v1';

function applyTheme(theme) {
    const root = document.documentElement;
    const mode = theme === 'dark' ? 'dark' : 'light';

    root.setAttribute('data-theme', mode);
    try {
        root.style.colorScheme = mode;
    } catch (e) {
        // Non-critical; safe to ignore
    }

    // Update toggle button labels/icons
    const toggles = document.querySelectorAll('[data-theme-toggle]');
    toggles.forEach((btn) => {
        if (mode === 'dark') {
            btn.textContent = '☀️';
        } else {
            btn.textContent = '🌙';
        }
    });
}

function initTheme() {
    let initial = 'light';

    try {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === 'light' || stored === 'dark') {
            initial = stored;
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            initial = 'dark';
        }
    } catch (e) {
        // If localStorage is blocked, fall back to prefers-color-scheme only
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            initial = 'dark';
        }
    }

    applyTheme(initial);

    // Attach toggle handlers
    const toggles = document.querySelectorAll('[data-theme-toggle]');
    toggles.forEach((btn) => {
        btn.addEventListener('click', () => {
            const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
            const next = current === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            try {
                localStorage.setItem(THEME_STORAGE_KEY, next);
            } catch (e) {
                // Ignore storage errors
            }
        });
    });
}

// Auto-update footer year (no yearly manual edits)
function initCopyrightYear() {
    const year = String(new Date().getFullYear());
    document.querySelectorAll('.js-current-year').forEach((node) => {
        node.textContent = year;
    });
}

// Initialize Firebase if not already available
if (!window.firebaseDB) {
    import('./firebase-config.js').then(async (module) => {
        window.firebaseDB = module.firebaseDB;
        console.log('🔥 Firebase loaded globally from main.js');
        
        // Only load debugging utilities in local development, never on production
        const hostname = window.location.hostname;
        const isDevelopment = hostname === 'localhost' || hostname === '127.0.0.1';
        if (isDevelopment) {
            try {
                const debugModule = await import('./firebase-test.js');
                window.testFirebase = debugModule.testFirebaseConnection;
                window.debugFirebaseRules = debugModule.debugFirebaseRules;
                window.addTestMartyr = debugModule.addTestMartyr;
                window.migrateToFirebase = debugModule.migrateLocalStorageToFirebase;
                window.testFirebaseConnection = window.firebaseDB.testConnection;
                window.deleteApprovedMartyr = window.firebaseDB.deleteApprovedMartyr;
                window.clearAllApprovedMartyrs = window.firebaseDB.clearAllApprovedMartyrs;
                console.log('🔧 Firebase debug utilities loaded (development only)');
            } catch (error) {
                console.warn('Debug utilities not available:', error);
            }
        }
        
        // Trigger any pending operations that need Firebase
        window.dispatchEvent(new Event('firebaseReady'));
    }).catch((error) => {
        console.warn('⚠️ Firebase could not be loaded in main.js:', error);
    });
}

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize components
    initCopyrightYear();
    initTheme();
    initMobileMenu();
    initSmoothScroll();
    initBackToTop();
    loadRecentMartyrs();
    initAnniversarySlider();
});

// ============================================
// BACK TO TOP BUTTON
// ============================================
function initBackToTop() {
    // Create button element
    const button = document.createElement('button');
    button.className = 'back-to-top';
    button.setAttribute('aria-label', 'Back to top');
    button.setAttribute('title', 'Back to top');
    button.innerHTML = `
        <svg viewBox="0 0 24 24">
            <polyline points="18 15 12 9 6 15"></polyline>
        </svg>
    `;
    document.body.appendChild(button);
    
    // Track if we've shown the pulse animation
    let hasShownPulse = false;
    
    // Show/hide button based on scroll position
    function toggleButtonVisibility() {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const shouldShow = scrollTop > 300;
        
        if (shouldShow) {
            button.classList.add('visible');
            
            // Add pulse animation only on first appearance
            if (!hasShownPulse) {
                button.classList.add('pulse');
                hasShownPulse = true;
                setTimeout(() => button.classList.remove('pulse'), 1000);
            }
        } else {
            button.classList.remove('visible');
        }
    }
    
    // Scroll to top with smooth animation
    function scrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }
    
    // Event listeners
    button.addEventListener('click', scrollToTop);
    
    // Throttled scroll listener for performance
    let ticking = false;
    window.addEventListener('scroll', function() {
        if (!ticking) {
            window.requestAnimationFrame(function() {
                toggleButtonVisibility();
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
    
    // Initial check
    toggleButtonVisibility();
    
    console.log('⬆️ Back to top button initialized');
}

// Mobile Menu Toggle
function initMobileMenu() {
    console.log('📱 Initializing mobile menu...');
    
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    console.log('Hamburger element:', hamburger);
    console.log('Nav menu element:', navMenu);
    
    if (hamburger && navMenu) {
        // Add click event with debugging
        hamburger.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('🍔 Hamburger clicked!');
            
            const isActive = navMenu.classList.contains('active');
            console.log('Menu currently active:', isActive);
            
            navMenu.classList.toggle('active');
            hamburger.classList.toggle('active');
            
            console.log('Menu now active:', navMenu.classList.contains('active'));
            console.log('Hamburger now active:', hamburger.classList.contains('active'));
        });
        
        // Close menu when clicking outside
        document.addEventListener('click', function(e) {
            if (!hamburger.contains(e.target) && !navMenu.contains(e.target)) {
                navMenu.classList.remove('active');
                hamburger.classList.remove('active');
            }
        });
        
        // Close menu when clicking on a link
        const navLinks = document.querySelectorAll('.nav-menu a');
        console.log('Found nav links:', navLinks.length);
        
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                console.log('🔗 Nav link clicked, closing menu');
                navMenu.classList.remove('active');
                hamburger.classList.remove('active');
            });
        });
        
        console.log('✅ Mobile menu initialized successfully');
    } else {
        console.error('❌ Mobile menu elements not found!');
        console.error('Hamburger:', hamburger);
        console.error('Nav menu:', navMenu);
    }
}

// Smooth Scrolling for anchor links
function initSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            const targetId = this.getAttribute('href');
            if (targetId === '#') return;
            
            const targetSection = document.querySelector(targetId);
            if (targetSection) {
                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Load Recent Martyrs (approved only) - Global data from Firebase
async function loadRecentMartyrs() {
    const recentMartyrsContainer = document.getElementById('recentMartyrs');
    
    if (recentMartyrsContainer) {
        let martyrsData = [];
        
        try {
            console.log('🌍 Loading recent martyrs from Firebase (global database)...');
            
            // Try Firebase first - this shows global data to all users
            if (window.firebaseDB) {
                const result = await window.firebaseDB.getApprovedMartyrs();
                
                if (result.success) {
                    martyrsData = result.data || [];
                    console.log(`✅ Loaded ${martyrsData.length} martyrs from Firebase (global)`);
                    
                    // Cache with enhanced cache management
                    if (martyrsData.length > 0 && window.cacheManager) {
                        window.cacheManager.setCache('martyrsData', martyrsData, 6); // 6 hour cache
                        console.log('💾 Cached homepage martyrs with expiration');
                    } else if (martyrsData.length > 0) {
                        // Fallback to localStorage
                        localStorage.setItem('martyrsData', JSON.stringify(martyrsData));
                        console.log('💾 Cached homepage martyrs to localStorage (fallback)');
                    }
                } else {
                    throw new Error('Firebase failed: ' + result.error);
                }
            } else {
                throw new Error('Firebase not available');
            }
            
        } catch (error) {
            console.warn('⚠️  Firebase failed, using localStorage backup:', error.message);
            
            // Fallback to localStorage only if Firebase fails
            const savedMartyrs = localStorage.getItem('martyrsData');
            if (savedMartyrs) {
                const allMartyrs = JSON.parse(savedMartyrs);
                martyrsData = allMartyrs.filter(m => !m.status || m.status === 'approved');
                console.log(`Using localStorage backup: ${martyrsData.length} martyrs`);
            }
        }
        
        // Display martyrs if we have any
        if (martyrsData.length > 0) {
            recentMartyrsContainer.innerHTML = '';
            
            // Display up to 6 recent martyrs
            const recentMartyrs = martyrsData.slice(-6).reverse();
            
            recentMartyrs.forEach(martyr => {
                const martyrCard = createMartyrCard(martyr);
                recentMartyrsContainer.appendChild(martyrCard);
            });
            
            console.log(`🏠 Displayed ${recentMartyrs.length} recent martyrs on homepage`);
        } else {
            console.log('😔 No approved martyrs found');
        }
    }
}

// Create Martyr Card Element - Matching Gallery Professional Design
function createMartyrCard(martyr) {
    const card = document.createElement('div');
    card.className = 'martyr-card';
    
    // Card inner wrapper
    const cardInner = document.createElement('div');
    cardInner.className = 'martyr-card-inner';
    
    // Photo wrapper with overlay
    const photoWrapper = document.createElement('div');
    photoWrapper.className = 'martyr-photo-wrapper';
    
    // Photo overlay (placed before img for proper layering)
    const overlay = document.createElement('div');
    overlay.className = 'martyr-photo-overlay';
    
    if (martyr.photo) {
        const img = document.createElement('img');
        img.src = martyr.photo;
        img.alt = martyr.fullName || 'Martyr portrait';
        img.loading = 'lazy';
        photoWrapper.appendChild(img);
    } else {
        // Fallback placeholder when no photo is provided
        const placeholder = document.createElement('div');
        placeholder.className = 'martyr-photo-placeholder';
        placeholder.textContent = '📷';
        photoWrapper.appendChild(placeholder);
    }
    photoWrapper.appendChild(overlay);
    
    // Info section
    const infoDiv = document.createElement('div');
    infoDiv.className = 'martyr-info';
    
    // Name row with symbol
    const nameRow = document.createElement('div');
    nameRow.className = 'martyr-name-row';
    
    const symbol = document.createElement('span');
    symbol.className = 'martyr-symbol';
    symbol.textContent = '✦';
    
    const name = document.createElement('h3');
    name.className = 'martyr-name';
    name.textContent = martyr.fullName || 'Unknown martyr';
    
    nameRow.appendChild(symbol);
    nameRow.appendChild(name);
    infoDiv.appendChild(nameRow);
    
    // Location line (icon + text format matching gallery)
    const locationLine = document.createElement('p');
    locationLine.className = 'martyr-meta martyr-location';
    const locIcon = document.createElement('span');
    locIcon.className = 'martyr-meta-icon';
    locIcon.textContent = '📍';
    const locText = document.createElement('span');
    locText.textContent = martyr.martyrdomPlace || martyr.birthPlace || 'Location unknown';
    locationLine.appendChild(locIcon);
    locationLine.appendChild(locText);
    infoDiv.appendChild(locationLine);
    
    // Date line (martyrdom date with icon)
    const dateLine = document.createElement('p');
    dateLine.className = 'martyr-meta martyr-date';
    const dateIcon = document.createElement('span');
    dateIcon.className = 'martyr-meta-icon';
    dateIcon.textContent = '🕊️';
    const dateText = document.createElement('span');
    const martyrdomPretty = formatDate(martyr.martyrdomDate);
    const martyrdomYear = formatDateYear(martyr.martyrdomDate);
    if (martyrdomPretty && martyrdomPretty !== 'Unknown') {
        dateText.textContent = martyrdomPretty;
    } else if (martyrdomYear && martyrdomYear !== '?') {
        dateText.textContent = `Year of martyrdom: ${martyrdomYear}`;
    } else {
        dateText.textContent = 'Date of martyrdom unknown';
    }
    dateLine.appendChild(dateIcon);
    dateLine.appendChild(dateText);
    infoDiv.appendChild(dateLine);
    
    // Organization line (optional, matching gallery)
    if (martyr.organization) {
        const orgLine = document.createElement('p');
        orgLine.className = 'martyr-meta martyr-organization';
        const orgIcon = document.createElement('span');
        orgIcon.className = 'martyr-meta-icon';
        orgIcon.textContent = '🏳️';
        const orgText = document.createElement('span');
        orgText.textContent = martyr.organization;
        orgLine.appendChild(orgIcon);
        orgLine.appendChild(orgText);
        infoDiv.appendChild(orgLine);
    }
    
    // View details button (matching gallery button style)
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-small martyr-card-button';
    viewBtn.type = 'button';
    viewBtn.textContent = 'View Details';
    viewBtn.onclick = function(e) {
        e.preventDefault();
        showMartyrDetails(martyr);
    };
    
    infoDiv.appendChild(viewBtn);
    
    // Assemble card
    cardInner.appendChild(photoWrapper);
    cardInner.appendChild(infoDiv);
    card.appendChild(cardInner);
    
    return card;
}

// Format Date Helper - Handles Firestore Timestamps and strings
function formatDate(dateValue) {
    if (!dateValue) return 'Unknown';
    
    try {
        let date;
        
        // Handle Firestore Timestamp objects
        if (dateValue && typeof dateValue === 'object' && typeof dateValue.toDate === 'function') {
            date = dateValue.toDate();
        }
        // If it's already a Date object
        else if (dateValue instanceof Date) {
            date = dateValue;
        }
        // Handle date strings
        else if (typeof dateValue === 'string') {
            if (dateValue.trim() === '') return 'Unknown';
            
            // Handle YYYY-MM-DD format (HTML date input)
            if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue.trim())) {
                date = new Date(dateValue + 'T00:00:00'); // Add time to avoid timezone issues
            } else {
                date = new Date(dateValue);
            }
        }
        // Try direct conversion for other types
        else {
            date = new Date(dateValue);
        }
        
        // Check if date is valid
        if (!date || isNaN(date.getTime())) {
            console.warn('Invalid date format in formatDate:', dateValue);
            return 'Unknown';
        }
        
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('en-US', options);
    } catch (error) {
        console.error('Error formatting date:', dateValue, error);
        return 'Unknown';
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
            date = new Date(dateValue);
        }
        
        // Check if date is valid
        if (!date || isNaN(date.getTime())) {
            console.warn('Invalid date format in formatDateYear:', dateValue);
            return '?';
        }
        
        return date.getFullYear();
    } catch (error) {
        console.error('Error parsing date year:', dateValue, error);
        return '?';
    }
}

// HTML escape helper to prevent XSS
function escapeHTMLMain(value) {
    if (value === null || value === undefined) return '';
    return value
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Show Martyr Details in Professional Modal (matching gallery design)
function showMartyrDetails(martyr) {
    console.log(`🔍 Showing modal for: ${martyr.fullName}`);
    
    // Remove existing modal
    const existingModal = document.getElementById('martyrDetailsModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Create modal
    const modal = document.createElement('div');
    modal.id = 'martyrDetailsModal';
    modal.style.cssText = `
        position: fixed;
        top: 72px;
        left: 0;
        width: 100%;
        height: calc(100% - 72px);
        background: rgba(0, 0, 0, 0.8);
        z-index: 1500;
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 16px;
        overflow-y: auto;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: #f9fafb;
        max-width: 960px;
        max-height: 90vh;
        overflow-y: auto;
        border-radius: 18px;
        position: relative;
        width: 100%;
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.55);
        border: 1px solid rgba(148, 163, 184, 0.35);
    `;

    const birthPretty = formatDate(martyr.birthDate) || 'Unknown';
    const martyrdomPretty = formatDate(martyr.martyrdomDate) || 'Unknown';
    const headerDateLabel = martyrdomPretty;
    
    content.innerHTML = `
        <div style="display: flex; flex-direction: column;">
            <div style="
                padding: 1.25rem 1.75rem;
                border-bottom: 1px solid #e5e7eb;
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: linear-gradient(135deg, #111827, #1f2937);
                color: #f9fafb;
            ">
                <div>
                    <h2 style="margin: 0; font-size: 1.4rem; letter-spacing: 0.08em; text-transform: uppercase; color: #f9fafb;">
                        ${escapeHTMLMain(martyr.fullName || 'Unknown martyr')}
                    </h2>
                    <p style="margin: 0.35rem 0 0; font-size: 0.9rem; opacity: 0.85;">
                        ${escapeHTMLMain(headerDateLabel)}
                    </p>
                </div>
                <div style="display: flex; gap: 0.5rem; align-items: center;">
                    <button class="btn btn-small btn-outline martyr-print-btn-header" type="button" style="color: #f9fafb; border-color: rgba(148,163,184,0.5);">
                        PDF
                    </button>
                    <button class="close-martyr-modal"
                            style="width: 36px; height: 36px; border-radius: 999px; border: 1px solid rgba(148,163,184,0.5); background: rgba(15,23,42,0.75); color: #f9fafb; font-size: 1.4rem; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center;">
                        &times;
                    </button>
                </div>
            </div>

            <div style="padding: 1.75rem 1.75rem 1.5rem; display: flex; gap: 1.75rem; flex-wrap: wrap; align-items: flex-start;">
                <div style="flex: 0 0 260px; max-width: 260px;">
                    ${martyr.photo ? 
                        `<img src="${martyr.photo}" alt="${escapeHTMLMain(martyr.fullName || 'Martyr photo')}" style="width: 100%; border-radius: 16px; object-fit: cover; box-shadow: 0 16px 35px rgba(15,23,42,0.45);">` :
                        '<div style="width: 100%; height: 320px; border-radius: 16px; background: radial-gradient(circle at top, #f3f4f6, #d1d5db); display: flex; align-items: center; justify-content: center; font-size: 3.5rem; color: #9ca3af; box-shadow: 0 16px 35px rgba(15,23,42,0.3);">📷</div>'
                    }
                </div>
                
                <div style="flex: 1; min-width: 280px;">
                    <div style="display: grid; gap: 0.6rem; font-size: 0.95rem;">
                        ${martyr.fatherName ? `
                            <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                                <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Father</span>
                                <span style="color: #111827;">${escapeHTMLMain(martyr.fatherName)}</span>
                            </div>
                        ` : ''}
                        <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                            <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Birth</span>
                            <span style="color: #111827;">${escapeHTMLMain(birthPretty)}</span>
                        </div>
                        <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                            <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Birth place</span>
                            <span style="color: #111827;">${escapeHTMLMain(martyr.birthPlace || 'Unknown')}</span>
                        </div>
                        <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                            <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Martyrdom</span>
                            <span style="color: #111827;">${escapeHTMLMain(martyrdomPretty)}</span>
                        </div>
                        <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                            <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Martyrdom place</span>
                            <span style="color: #111827;">${escapeHTMLMain(martyr.martyrdomPlace || 'Unknown')}</span>
                        </div>
                        ${martyr.organization ? `
                            <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                                <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Organization</span>
                                <span style="color: #111827;">${escapeHTMLMain(martyr.organization)}</span>
                            </div>
                        ` : ''}
                        ${martyr.rank ? `
                            <div style="display: flex; gap: 0.6rem; align-items: flex-start;">
                                <span style="min-width: 120px; font-weight: 600; color: #4b5563;">Rank</span>
                                <span style="color: #111827;">${escapeHTMLMain(martyr.rank)}</span>
                            </div>
                        ` : ''}
                    </div>
                    
                    ${martyr.biography ? `
                        <div style="margin-top: 1.75rem;">
                            <h3 style="margin: 0 0 0.75rem; font-size: 1.05rem; color: #111827;">Biography</h3>
                            <div style="background: #f9fafb; padding: 1.3rem 1.2rem; border-radius: 12px; border: 1px solid #e5e7eb; line-height: 1.7; color: #374151; font-size: 0.96rem; text-align: justify;">
                                ${escapeHTMLMain(martyr.biography)}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${martyr.familyDetails ? `
                        <div style="margin-top: 1.5rem;">
                            <h3 style="margin: 0 0 0.75rem; font-size: 1.05rem; color: #111827;">Family Details</h3>
                            <div style="background: #f9fafb; padding: 1.2rem 1.15rem; border-radius: 12px; border: 1px solid #e5e7eb; line-height: 1.7; color: #374151; font-size: 0.95rem;">
                                ${escapeHTMLMain(martyr.familyDetails)}
                            </div>
                        </div>
                    ` : ''}

                    <div style="margin-top: 1.5rem;">
                        <button class="btn martyr-voice-btn" type="button">
                            🔊 Listen to this martyr's story
                        </button>
                    </div>
                    
                    <div style="margin-top: 1.75rem; padding-top: 1rem; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 0.9rem; display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: space-between;">
                        <p style="margin: 0;"><strong>Submitted by:</strong> ${escapeHTMLMain(martyr.submitterName || 'Unknown')}</p>
                        <p style="margin: 0;"><strong>Submitted on:</strong> ${escapeHTMLMain(formatDate(martyr.submittedAt) || 'Unknown')}</p>
                    </div>
                    
                    <div class="martyr-modal-share-slot"></div>

                    <div class="martyr-modal-actions" style="margin-top: 1.5rem; display: flex; flex-wrap: wrap; gap: 0.75rem;">
                        <button class="btn martyr-print-btn" type="button">
                            Print / Download PDF
                        </button>
                        <button class="btn btn-outline martyr-close-btn" type="button">
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add share row
    const shareSlot = content.querySelector('.martyr-modal-share-slot');
    if (shareSlot) {
        shareSlot.replaceWith(createShareRowMain(martyr));
    }

    modal.appendChild(content);
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
    
    const closeModal = () => {
        stopMartyrSpeechMain();
        modal.remove();
        document.body.style.overflow = 'auto';
    };
    
    // Close buttons
    const closeIcon = modal.querySelector('.close-martyr-modal');
    const closeBtn  = modal.querySelector('.martyr-close-btn');
    if (closeIcon) closeIcon.addEventListener('click', closeModal);
    if (closeBtn)  closeBtn.addEventListener('click', closeModal);
    
    // Print / Download button
    const printBtn = modal.querySelector('.martyr-print-btn');
    const printHeaderBtn = modal.querySelector('.martyr-print-btn-header');
    [printBtn, printHeaderBtn].forEach((btn) => {
        if (btn) {
            btn.addEventListener('click', () => {
                printMartyrProfileMain(martyr);
            });
        }
    });

    // Voice assistant button (text-to-speech)
    const voiceBtn = modal.querySelector('.martyr-voice-btn');
    if (voiceBtn) {
        if ('speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined') {
            voiceBtn.addEventListener('click', () => {
                toggleMartyrSpeechMain(martyr, voiceBtn);
            });
        } else {
            voiceBtn.style.display = 'none';
        }
    }
    
    // Close on background click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    // Close on Escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

// Create share row for modal
function createShareRowMain(martyr) {
    const row = document.createElement('div');
    row.className = 'martyr-share-row martyr-share-row-modal';
    row.style.cssText = 'margin-top: 1.75rem; padding-top: 1.5rem; border-top: 1px solid rgba(148, 163, 184, 0.35); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.85rem 1rem;';

    const label = document.createElement('span');
    label.style.cssText = 'font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; color: #4b5563; font-weight: 700;';
    label.textContent = 'Share';

    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap;';

    const siteOrigin = window.location?.origin || 'https://baluchmartyrs.site';
    const heroIdentifier = encodeURIComponent(martyr.id || martyr.fullName || '');
    const targetUrl = `${siteOrigin}/gallery.html?hero=${heroIdentifier}`;
    const encodedUrl = encodeURIComponent(targetUrl);
    const shareText = encodeURIComponent(`Honoring ${martyr.fullName || 'a Baluch hero'} on the Baluch Martyrs Memorial`);

    const shareNetworks = [
        { name: 'X', icon: '𝕏', url: `https://twitter.com/intent/tweet?text=${shareText}&url=${encodedUrl}` },
        { name: 'Facebook', icon: 'f', url: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
        { name: 'Instagram', icon: '✺', url: `https://www.instagram.com/?url=${encodedUrl}` },
        { name: 'TikTok', icon: '🎵', url: `https://www.tiktok.com/share?url=${encodedUrl}&text=${shareText}` }
    ];

    shareNetworks.forEach(({ name, icon, url }) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.cssText = 'width: 38px; height: 38px; border-radius: 12px; border: 1px solid rgba(15, 23, 42, 0.12); background: #f9fafb; color: var(--primary-color, #2c5530); display: inline-flex; align-items: center; justify-content: center; font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.2s ease; box-shadow: 0 4px 10px rgba(15, 23, 42, 0.08);';
        btn.innerHTML = icon;
        btn.setAttribute('aria-label', `Share ${martyr.fullName || 'this hero'} on ${name}`);
        btn.title = `Share on ${name}`;
        btn.addEventListener('click', () => {
            window.open(url, '_blank', 'noopener,noreferrer');
        });
        btn.addEventListener('mouseenter', () => {
            btn.style.borderColor = 'rgba(44, 85, 48, 0.4)';
            btn.style.transform = 'translateY(-1px)';
            btn.style.boxShadow = '0 10px 20px rgba(15, 23, 42, 0.15)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.borderColor = 'rgba(15, 23, 42, 0.12)';
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 4px 10px rgba(15, 23, 42, 0.08)';
        });
        actions.appendChild(btn);
    });

    row.appendChild(label);
    row.appendChild(actions);
    return row;
}

// Text-to-speech state for main.js
let currentMartyrUtteranceMain = null;

function stopMartyrSpeechMain() {
    try {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    } catch (e) {
        console.warn('Error stopping martyr speech:', e);
    }
    currentMartyrUtteranceMain = null;
}

function buildMartyrSpeechTextMain(martyr) {
    const parts = [];
    const name = martyr.fullName || 'Unknown martyr';
    parts.push(name + '.');

    if (martyr.fatherName) {
        parts.push('Child of ' + martyr.fatherName + '.');
    }

    const birth = formatDate(martyr.birthDate);
    const birthPlace = martyr.birthPlace || '';
    if (birth || birthPlace) {
        parts.push('Born ' + (birth || 'on an unknown date') + (birthPlace ? ' in ' + birthPlace + '.' : '.'));
    }

    const martyrdom = formatDate(martyr.martyrdomDate);
    const martyrdomPlace = martyr.martyrdomPlace || '';
    if (martyrdom || martyrdomPlace) {
        parts.push('Martyred ' + (martyrdom || 'on an unknown date') + (martyrdomPlace ? ' in ' + martyrdomPlace + '.' : '.'));
    }

    if (martyr.organization) {
        parts.push('Organization: ' + martyr.organization + '.');
    }

    if (martyr.rank) {
        parts.push('Rank or role: ' + martyr.rank + '.');
    }

    if (martyr.biography) {
        parts.push('Biography: ' + martyr.biography + '.');
    }

    if (martyr.familyDetails) {
        parts.push('Family details: ' + martyr.familyDetails + '.');
    }

    if (martyr.submitterName || martyr.submittedAt) {
        const submittedOn = formatDate(martyr.submittedAt);
        let submissionText = 'Submitted by ' + (martyr.submitterName || 'an unknown submitter');
        if (submittedOn) {
            submissionText += ', on ' + submittedOn;
        }
        parts.push(submissionText + '.');
    }

    return parts.join(' ');
}

function toggleMartyrSpeechMain(martyr, buttonEl) {
    if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance === 'undefined') {
        alert('Your browser does not support voice playback for this memorial.');
        return;
    }

    if (window.speechSynthesis.speaking && currentMartyrUtteranceMain) {
        stopMartyrSpeechMain();
        if (buttonEl) {
            buttonEl.textContent = '🔊 Listen to this martyr\'s story';
        }
        return;
    }

    const text = buildMartyrSpeechTextMain(martyr);
    if (!text) {
        alert('There is no information available to read aloud for this martyr.');
        return;
    }

    try {
        stopMartyrSpeechMain();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.95;
        utterance.pitch = 1.0;

        utterance.onend = function() {
            currentMartyrUtteranceMain = null;
            if (buttonEl) {
                buttonEl.textContent = '🔊 Listen to this martyr\'s story';
            }
        };

        utterance.onerror = function() {
            currentMartyrUtteranceMain = null;
            if (buttonEl) {
                buttonEl.textContent = '🔊 Listen to this martyr\'s story';
            }
        };

        currentMartyrUtteranceMain = utterance;
        if (buttonEl) {
            buttonEl.textContent = '⏹ Stop audio';
        }

        window.speechSynthesis.speak(utterance);
    } catch (e) {
        console.warn('Failed to start martyr speech:', e);
        if (buttonEl) {
            buttonEl.textContent = '🔊 Listen to this martyr\'s story';
        }
    }
}

// Print martyr profile (opens printable view for PDF download)
function printMartyrProfileMain(martyr) {
    try {
        const printWindow = window.open('', '_blank', 'width=900,height=1100');
        if (!printWindow) {
            alert('Please allow pop-ups to print or download the martyr profile.');
            return;
        }

        const birth      = formatDate(martyr.birthDate) || 'Unknown';
        const martyrdom  = formatDate(martyr.martyrdomDate) || 'Unknown';
        const submitted  = formatDate(martyr.submittedAt) || 'Unknown';
        const birthPlace = martyr.birthPlace || 'Unknown';
        const martyrdomPlace = martyr.martyrdomPlace || 'Unknown';
        const organization   = martyr.organization || 'Unknown';
        const rank           = martyr.rank || '—';
        const fatherName     = martyr.fatherName || '—';

        const safe = (val) => (val || '').toString().replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${safe(martyr.fullName)} - Martyr Profile</title>
<style>
  body { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 40px; background: #f5f5f5; }
  .page { background: #fff; max-width: 800px; margin: 0 auto; padding: 40px; box-shadow: 0 0 8px rgba(0,0,0,0.15); }
  .header { text-align: center; border-bottom: 3px solid #2c5530; padding-bottom: 10px; margin-bottom: 20px; }
  .header h1 { margin: 0; font-size: 26px; color: #2c5530; }
  .header h2 { margin: 8px 0 0; font-size: 18px; color: #555; }
  .photo-row { display: flex; gap: 24px; margin-top: 20px; }
  .photo-box { flex: 0 0 220px; }
  .photo-box img { width: 100%; border-radius: 8px; border: 3px solid #d4af37; object-fit: cover; height: 260px; }
  .photo-placeholder { width: 100%; height: 260px; border-radius: 8px; border: 3px solid #d4af37; display: flex; align-items: center; justify-content: center; font-size: 60px; color: #999; background: linear-gradient(135deg,#f0f0f0,#dcdcdc); }
  .details { flex: 1; font-size: 14px; }
  .details table { width: 100%; border-collapse: collapse; }
  .details th { text-align: left; padding: 4px 8px; width: 32%; color: #444; }
  .details td { padding: 4px 8px; }
  .section { margin-top: 24px; }
  .section h3 { margin: 0 0 8px; color: #2c5530; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .section p { margin: 0; line-height: 1.6; color: #333; white-space: pre-wrap; }
  .footer { margin-top: 32px; font-size: 11px; color: #777; text-align: center; border-top: 1px solid #eee; padding-top: 8px; }
  @media print {
    body { background: #fff; padding: 0; }
    .page { box-shadow: none; margin: 0; max-width: 100%; }
  }
</style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>Baluch Martyrs Memorial</h1>
      <h2>Martyr Profile</h2>
    </div>

    <div class="photo-row">
      <div class="photo-box">
        ${martyr.photo ? 
          `<img src="${martyr.photo}" alt="${safe(martyr.fullName)}" />` :
          '<div class="photo-placeholder">📸</div>'}
      </div>
      <div class="details">
        <table>
          <tr><th>Name</th><td>${safe(martyr.fullName)}</td></tr>
          <tr><th>Father</th><td>${safe(fatherName)}</td></tr>
          <tr><th>Birth</th><td>${safe(birth)} (${safe(birthPlace)})</td></tr>
          <tr><th>Martyrdom</th><td>${safe(martyrdom)} (${safe(martyrdomPlace)})</td></tr>
          <tr><th>Organization</th><td>${safe(organization)}</td></tr>
          <tr><th>Rank / Role</th><td>${safe(rank)}</td></tr>
        </table>
      </div>
    </div>

    ${martyr.biography ? `
    <div class="section">
      <h3>Biography</h3>
      <p>${safe(martyr.biography)}</p>
    </div>` : ''}

    ${martyr.familyDetails ? `
    <div class="section">
      <h3>Family Details</h3>
      <p>${safe(martyr.familyDetails)}</p>
    </div>` : ''}

    <div class="footer">
      Submitted by: ${safe(martyr.submitterName || 'Unknown')} | Submitted on: ${safe(submitted)}<br>
      Generated from Baluch Martyrs Memorial – baluchmartyrs.site
    </div>
  </div>
  <script>window.onload = function() { window.print(); };<\/script>
</body>
</html>`;

        printWindow.document.write(html);
        printWindow.document.close();
    } catch (e) {
        console.error('Error printing martyr profile:', e);
        alert('Failed to open print view. Please try again.');
    }
}

// Close Modal Function (legacy, kept for compatibility)
function closeMartyrModal() {
    const modal = document.getElementById('martyrDetailsModal');
    if (modal) {
        stopMartyrSpeechMain();
        modal.remove();
        document.body.style.overflow = 'auto';
    }
}

// Make close function globally available
window.closeMartyrModal = closeMartyrModal;

// Utility function to store data in localStorage
function saveToLocalStorage(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (e) {
        console.error('Error saving to localStorage:', e);
        return false;
    }
}

// Utility function to get data from localStorage
function getFromLocalStorage(key) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    } catch (e) {
        console.error('Error reading from localStorage:', e);
        return null;
    }
}

// Initialize Anniversary Slider
function initAnniversarySlider() {
    loadAnniversaryMartyrs();
}

let currentSlide = 0;
let anniversaryMartyrs = [];

// Load martyrs with upcoming anniversaries - Global data from Firebase
async function loadAnniversaryMartyrs() {
    const slider = document.getElementById('anniversary-slider');
    if (!slider) return;
    
    let approvedMartyrs = [];
    
    try {
        console.log('🎆 Loading anniversary data from Firebase (global database)...');
        
        // Try Firebase first for global data
        if (window.firebaseDB) {
            const result = await window.firebaseDB.getApprovedMartyrs();
            
            if (result.success) {
                approvedMartyrs = result.data || [];
                console.log(`✅ Loaded ${approvedMartyrs.length} martyrs for anniversaries from Firebase`);
            } else {
                throw new Error('Firebase failed: ' + result.error);
            }
        } else {
            throw new Error('Firebase not available');
        }
        
    } catch (error) {
        console.warn('⚠️  Firebase failed for anniversaries, using localStorage:', error.message);
        
        // Fallback to localStorage
        const savedMartyrs = localStorage.getItem('martyrsData');
        if (savedMartyrs) {
            const allMartyrs = JSON.parse(savedMartyrs);
            approvedMartyrs = allMartyrs.filter(m => !m.status || m.status === 'approved');
        }
    }
    
    if (approvedMartyrs.length === 0) {
        showEmptyAnniversarySlider();
        return;
    }
    
    // Find martyrs with anniversaries in the next 30 days
    anniversaryMartyrs = getUpcomingAnniversaries(approvedMartyrs);
    
    if (anniversaryMartyrs.length === 0) {
        // If no upcoming anniversaries, show recent martyrs instead
        anniversaryMartyrs = approvedMartyrs.slice(-6);
        console.log('🎆 No upcoming anniversaries, showing recent martyrs');
    } else {
        console.log(`🎆 Found ${anniversaryMartyrs.length} upcoming anniversaries`);
    }
    
    renderAnniversarySlider();
    setupSliderControls();
    
    // Auto-play slider
    setInterval(nextSlide, 5000); // Change slide every 5 seconds
}

// Get martyrs with upcoming anniversaries
function getUpcomingAnniversaries(martyrs) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentDay = today.getDate();
    const upcomingAnniversaries = [];
    
    martyrs.forEach(martyr => {
        if (!martyr.martyrdomDate) return;
        
        let martyrdomDate;
        try {
            // Handle Firestore Timestamp objects
            if (martyr.martyrdomDate && typeof martyr.martyrdomDate === 'object' && typeof martyr.martyrdomDate.toDate === 'function') {
                martyrdomDate = martyr.martyrdomDate.toDate();
            } else if (typeof martyr.martyrdomDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(martyr.martyrdomDate.trim())) {
                martyrdomDate = new Date(martyr.martyrdomDate + 'T00:00:00');
            } else {
                martyrdomDate = new Date(martyr.martyrdomDate);
            }
            
            if (!martyrdomDate || isNaN(martyrdomDate.getTime())) {
                console.warn('Invalid martyrdom date for', martyr.fullName, martyr.martyrdomDate);
                return;
            }
        } catch (error) {
            console.error('Error parsing martyrdom date for', martyr.fullName, error);
            return;
        }
        
        const martyrdomMonth = martyrdomDate.getMonth();
        const martyrdomDay = martyrdomDate.getDate();
        
        // Calculate days until anniversary
        let daysUntil = 0;
        const thisYear = today.getFullYear();
        const anniversaryThisYear = new Date(thisYear, martyrdomMonth, martyrdomDay);
        
        if (anniversaryThisYear >= today) {
            daysUntil = Math.ceil((anniversaryThisYear - today) / (1000 * 60 * 60 * 24));
        } else {
            const anniversaryNextYear = new Date(thisYear + 1, martyrdomMonth, martyrdomDay);
            daysUntil = Math.ceil((anniversaryNextYear - today) / (1000 * 60 * 60 * 24));
        }
        
        // Include if anniversary is within next 30 days or today
        if (daysUntil <= 30) {
            upcomingAnniversaries.push({
                ...martyr,
                daysUntil,
                anniversaryDate: martyrdomDate
            });
        }
    });
    
    // Sort by days until anniversary (closest first)
    return upcomingAnniversaries.sort((a, b) => a.daysUntil - b.daysUntil);
}

// Render the anniversary slider
function renderAnniversarySlider() {
    const slider = document.getElementById('anniversary-slider');
    const dots = document.getElementById('slider-dots');
    
    if (!slider || !dots) return;
    
    slider.innerHTML = '';
    dots.innerHTML = '';
    
    anniversaryMartyrs.forEach((martyr, index) => {
        // Create slide
        const slide = document.createElement('div');
        slide.className = 'slide';
        if (index === 0) slide.classList.add('active');
        
        const martyrCard = createAnniversaryCard(martyr);
        slide.appendChild(martyrCard);
        slider.appendChild(slide);
        
        // Create dot indicator
        const dot = document.createElement('button');
        dot.className = 'dot';
        if (index === 0) dot.classList.add('active');
        dot.onclick = () => goToSlide(index);
        dots.appendChild(dot);
    });
}

// Create anniversary card
function createAnniversaryCard(martyr) {
    const card = document.createElement('div');
    card.className = 'martyr-card anniversary-card';
    
    // Image section
    const imageDiv = document.createElement('div');
    imageDiv.className = 'martyr-image';
    
    if (martyr.photo) {
        const img = document.createElement('img');
        img.src = martyr.photo;
        img.alt = martyr.fullName;
        img.loading = 'lazy';
        imageDiv.appendChild(img);
    } else {
        imageDiv.style.background = 'linear-gradient(135deg, #2c5530, #4a7c59)';
        imageDiv.style.display = 'flex';
        imageDiv.style.alignItems = 'center';
        imageDiv.style.justifyContent = 'center';
        imageDiv.style.color = 'white';
        imageDiv.style.fontSize = '3rem';
        imageDiv.innerHTML = '🕊️';
    }
    
    // Info section
    const infoDiv = document.createElement('div');
    infoDiv.className = 'martyr-info';
    
    const name = document.createElement('h3');
    name.textContent = martyr.fullName;
    
    const dates = document.createElement('p');
    dates.className = 'martyr-dates';

    // Professional: show only martyrdom date (no birth date/year on anniversary slider)
    const martyrdomPretty = formatDate(martyr.martyrdomDate);
    if (martyrdomPretty && martyrdomPretty !== 'Unknown') {
        dates.textContent = `Martyred: ${martyrdomPretty}`;
    } else {
        const martyrdomYear = formatDateYear(martyr.martyrdomDate);
        dates.textContent = martyrdomYear && martyrdomYear !== '?' ? `Martyred: ${martyrdomYear}` : 'Martyred: Unknown';
    }
    
    const location = document.createElement('p');
    location.className = 'martyr-location';
    location.textContent = martyr.martyrdomPlace || 'Unknown location';
    
    const anniversary = document.createElement('p');
    anniversary.className = 'anniversary-date';
    const anniversaryText = getAnniversaryText(martyr);
    anniversary.innerHTML = anniversaryText;
    
    if (martyr.biography) {
        const bio = document.createElement('p');
        bio.className = 'martyr-bio';
        bio.textContent = martyr.biography.length > 100 
            ? martyr.biography.substring(0, 100) + '...' 
            : martyr.biography;
        infoDiv.appendChild(name);
        infoDiv.appendChild(dates);
        infoDiv.appendChild(location);
        infoDiv.appendChild(anniversary);
        infoDiv.appendChild(bio);
    } else {
        infoDiv.appendChild(name);
        infoDiv.appendChild(dates);
        infoDiv.appendChild(location);
        infoDiv.appendChild(anniversary);
    }
    
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-small';
    viewBtn.textContent = 'Read More';
    viewBtn.onclick = () => showMartyrDetails(martyr);
    infoDiv.appendChild(viewBtn);
    
    card.appendChild(imageDiv);
    card.appendChild(infoDiv);
    
    return card;
}

// Get anniversary text
function getAnniversaryText(martyr) {
    if (!martyr.daysUntil && martyr.daysUntil !== 0) {
        try {
            let martyrdomDate;
            
            // Handle Firestore Timestamp objects
            if (martyr.martyrdomDate && typeof martyr.martyrdomDate === 'object' && typeof martyr.martyrdomDate.toDate === 'function') {
                martyrdomDate = martyr.martyrdomDate.toDate();
            } else if (typeof martyr.martyrdomDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(martyr.martyrdomDate.trim())) {
                martyrdomDate = new Date(martyr.martyrdomDate + 'T00:00:00');
            } else {
                martyrdomDate = new Date(martyr.martyrdomDate);
            }
            
            if (martyrdomDate && !isNaN(martyrdomDate.getTime())) {
                return `<strong>Anniversary:</strong> ${martyrdomDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
            } else {
                return `<strong>Anniversary:</strong> Date not available`;
            }
        } catch (error) {
            console.error('Error formatting anniversary date:', error);
            return `<strong>Anniversary:</strong> Date not available`;
        }
    }
    
    if (martyr.daysUntil === 0) {
        return `<strong style="color: #d4af37;">🌟 Anniversary Today!</strong>`;
    } else if (martyr.daysUntil === 1) {
        return `<strong style="color: #2c5530;">Anniversary Tomorrow</strong>`;
    } else {
        return `<strong>Anniversary in ${martyr.daysUntil} days</strong>`;
    }
}

// Setup slider controls
function setupSliderControls() {
    const prevBtn = document.getElementById('slider-prev');
    const nextBtn = document.getElementById('slider-next');
    
    if (prevBtn) prevBtn.onclick = prevSlide;
    if (nextBtn) nextBtn.onclick = nextSlide;

    // Mobile-friendly: enable swipe gestures on touch devices
    setupSliderTouchControls();
}

// Enable simple left/right swipe to change slides (mobile UX)
function setupSliderTouchControls() {
    const slider = document.getElementById('anniversary-slider');
    if (!slider) return;

    // Prevent multiple listener registrations
    if (slider.dataset.touchInit === '1') return;
    slider.dataset.touchInit = '1';

    let startX = 0;
    let startY = 0;
    const threshold = 50; // px swipe distance

    slider.addEventListener('touchstart', (e) => {
        const touch = e.changedTouches && e.changedTouches[0];
        if (!touch) return;
        startX = touch.clientX;
        startY = touch.clientY;
    }, { passive: true });

    slider.addEventListener('touchend', (e) => {
        const touch = e.changedTouches && e.changedTouches[0];
        if (!touch) return;

        const dx = touch.clientX - startX;
        const dy = touch.clientY - startY;

        // Ignore mostly-vertical gestures (so the page can scroll naturally)
        if (Math.abs(dx) <= Math.abs(dy)) return;
        if (Math.abs(dx) < threshold) return;

        if (dx < 0) {
            nextSlide();
        } else {
            prevSlide();
        }
    }, { passive: true });
}

// Slider navigation functions
function goToSlide(index) {
    const slides = document.querySelectorAll('#anniversary-slider .slide');
    const dots = document.querySelectorAll('#slider-dots .dot');
    
    // Remove active class from current slide and dot
    slides[currentSlide]?.classList.remove('active');
    dots[currentSlide]?.classList.remove('active');
    
    // Set new active slide
    currentSlide = index;
    
    // Add active class to new slide and dot
    slides[currentSlide]?.classList.add('active');
    dots[currentSlide]?.classList.add('active');
}

function nextSlide() {
    const nextIndex = (currentSlide + 1) % anniversaryMartyrs.length;
    goToSlide(nextIndex);
}

function prevSlide() {
    const prevIndex = currentSlide === 0 ? anniversaryMartyrs.length - 1 : currentSlide - 1;
    goToSlide(prevIndex);
}

// Show empty anniversary slider
function showEmptyAnniversarySlider() {
    const slider = document.getElementById('anniversary-slider');
    const dots = document.getElementById('slider-dots');
    
    if (!slider) return;
    
    slider.innerHTML = `
        <div class="slide active">
            <div class="martyr-card anniversary-card">
                <div class="martyr-image" style="background: linear-gradient(135deg, #ddd, #aaa); display: flex; align-items: center; justify-content: center; font-size: 3rem;">🕊️</div>
                <div class="martyr-info">
                    <h3>No upcoming anniversaries</h3>
                    <p class="martyr-dates">Add martyrs to see their anniversaries</p>
                    <p class="anniversary-date">Check back later for memorial dates</p>
                    <a href="add-martyr.html" class="btn btn-small">Add Martyr</a>
                </div>
            </div>
        </div>
    `;
    
    if (dots) {
        dots.innerHTML = '<button class="dot active"></button>';
    }
}

// Add animation on scroll
window.addEventListener('scroll', function() {
    const elements = document.querySelectorAll('.feature-card, .martyr-card');
    
    elements.forEach(element => {
        const rect = element.getBoundingClientRect();
        const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
        
        if (isVisible) {
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
        }
    });
});
