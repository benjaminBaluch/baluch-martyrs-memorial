// Main JavaScript for Baluch Martyrs Memorial

// Theme management
const THEME_STORAGE_KEY = 'bmm_theme_v1';
let activeSpeech;

function stopActiveSpeech() {
    if (activeSpeech && window.speechSynthesis) {
        window.speechSynthesis.cancel();
        activeSpeech = null;
    }
}

function escapeHTML(value) {
    if (value === null || value === undefined) return '';
    return value
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function createShareRowElement(martyr, variant = 'modal') {
    const row = document.createElement('div');
    row.className = 'martyr-share-row';
    if (variant === 'modal') {
        row.classList.add('martyr-share-row-modal');
    }

    const label = document.createElement('span');
    label.className = 'martyr-share-label';
    label.textContent = 'Share';

    const actions = document.createElement('div');
    actions.className = 'martyr-share-actions';

    const siteOrigin = (typeof window !== 'undefined' && window.location && window.location.origin)
        ? window.location.origin
        : 'https://baluchmartyrs.site';
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
        btn.className = 'martyr-share-icon';
        btn.innerHTML = icon;
        btn.setAttribute('aria-label', `Share ${martyr.fullName || 'this hero'} on ${name}`);
        btn.title = `Share on ${name}`;
        btn.addEventListener('click', () => {
            window.open(url, '_blank', 'noopener,noreferrer');
        });
        actions.appendChild(btn);
    });

    row.appendChild(label);
    row.appendChild(actions);
    return row;
}

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
    initTheme();
    initMobileMenu();
    initSmoothScroll();
    loadRecentMartyrs();
    initAnniversarySlider();
});

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
    
    if (martyr.photo) {
        const img = document.createElement('img');
        img.src = martyr.photo;
        img.alt = martyr.fullName;
        img.loading = 'lazy';
        photoWrapper.appendChild(img);
        
        // Add photo overlay
        const overlay = document.createElement('div');
        overlay.className = 'martyr-photo-overlay';
        photoWrapper.appendChild(overlay);
    } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'martyr-photo-placeholder';
        placeholder.textContent = '🕊️';
        photoWrapper.appendChild(placeholder);
    }
    
    // Info section
    const infoDiv = document.createElement('div');
    infoDiv.className = 'martyr-info';
    
    // Name row with symbol
    const nameRow = document.createElement('div');
    nameRow.className = 'martyr-name-row';
    
    const symbol = document.createElement('span');
    symbol.className = 'martyr-symbol';
    symbol.textContent = '🕊️';
    
    const name = document.createElement('h3');
    name.className = 'martyr-name';
    name.textContent = martyr.fullName;
    
    nameRow.appendChild(symbol);
    nameRow.appendChild(name);
    infoDiv.appendChild(nameRow);
    
    // Key details (martyrdom date & place)
    const detailList = document.createElement('div');
    detailList.className = 'martyr-detail-list';
    
    const martyrdomDate = formatDate(martyr.martyrdomDate);
    const martyrdomPlace = martyr.martyrdomPlace || 'Location not recorded';
    
    const dateRow = document.createElement('div');
    dateRow.className = 'martyr-detail-row';
    dateRow.innerHTML = `
        <span class=\"martyr-detail-label\">Martyred</span>
        <span class=\"martyr-detail-value\">${martyrdomDate && martyrdomDate !== 'Unknown' ? martyrdomDate : 'Date not recorded'}</span>
    `;
    
    const placeRow = document.createElement('div');
    placeRow.className = 'martyr-detail-row';
    placeRow.innerHTML = `
        <span class=\"martyr-detail-label\">Place</span>
        <span class=\"martyr-detail-value\">${martyrdomPlace}</span>
    `;
    
    detailList.appendChild(dateRow);
    detailList.appendChild(placeRow);
    infoDiv.appendChild(detailList);
    
    // View details button
    const viewBtn = document.createElement('button');
    viewBtn.className = 'martyr-card-button';
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

// Show Martyr Details in Professional Modal
function showMartyrDetails(martyr) {
    stopActiveSpeech();
    let modal = document.getElementById('martyrDetailsModal');
    if (!modal) {
        modal = createMartyrModal();
        document.body.appendChild(modal);
    }

    const modalContent = modal.querySelector('.modal-body');
    const birthPretty = escapeHTML(formatDate(martyr.birthDate) || 'Not recorded');
    const martyrdomPretty = escapeHTML(formatDate(martyr.martyrdomDate) || 'Not recorded');
    const birthPlace = escapeHTML(martyr.birthPlace || 'Not recorded');
    const martyrPlace = escapeHTML(martyr.martyrdomPlace || 'Not recorded');
    const organization = escapeHTML(martyr.organization || '');
    const rank = escapeHTML(martyr.rank || '');
    const fatherName = escapeHTML(martyr.fatherName || '');
    const bio = martyr.biography && martyr.biography.trim() ? escapeHTML(martyr.biography) : '';
    const family = martyr.familyDetails && martyr.familyDetails.trim() ? escapeHTML(martyr.familyDetails) : '';
    const submitter = escapeHTML(martyr.submitterName || 'Anonymous');
    const submitterRelation = martyr.submitterRelation ? ` (${escapeHTML(martyr.submitterRelation)})` : '';
    const submitterDate = martyr.submittedAt ? escapeHTML(formatDate(martyr.submittedAt)) : '';

    const detailRows = [
        { label: 'Birth', value: birthPretty },
        { label: 'Birth Place', value: birthPlace },
        { label: 'Martyrdom', value: martyrdomPretty },
        { label: 'Martyrdom Place', value: martyrPlace },
        organization ? { label: 'Organization', value: organization } : null,
        rank ? { label: 'Rank', value: rank } : null,
        fatherName ? { label: 'Father', value: fatherName } : null
    ].filter(Boolean).map(row => `
        <div class="martyr-modal-row">
            <span class="martyr-modal-label">${row.label}</span>
            <span class="martyr-modal-value">${row.value}</span>
        </div>
    `).join('');

    const voiceButtonId = `voice-btn-${Date.now()}`;

    modalContent.innerHTML = `
        <div class="modal-shell">
            <div class="modal-hero">
                <div class="modal-hero-text">
                    <p class="modal-hero-eyebrow">Baluch Martyrs Memorial</p>
                    <h2 class="modal-hero-name">${escapeHTML(martyr.fullName || 'Unknown Hero')}</h2>
                    <p class="modal-hero-date">${martyrdomPretty}</p>
                </div>
                <button class="modal-close-btn" data-close-modal aria-label="Close details">&times;</button>
            </div>
            <div class="modal-content-grid">
                <div class="modal-photo-frame">
                    ${martyr.photo
                        ? `<img src="${martyr.photo}" alt="${escapeHTML(martyr.fullName || 'Martyr photo')}">`
                        : `<div class="modal-photo-placeholder">📷</div>`
                    }
                </div>
                <div class="modal-detail-panel">
                    <div class="modal-detail-rows">
                        ${detailRows}
                    </div>
                    ${bio ? `
                        <div class="modal-section">
                            <h3>Biography</h3>
                            <div class="modal-section-body">${bio}</div>
                        </div>
                    ` : ''}
                    ${family ? `
                        <div class="modal-section">
                            <h3>Family Details</h3>
                            <div class="modal-section-body">${family}</div>
                        </div>
                    ` : ''}
                    <button class="modal-voice-btn" id="${voiceButtonId}" type="button">
                        🔊 Listen to ${escapeHTML(martyr.fullName || 'this hero')}
                    </button>
                    <div class="martyr-modal-share-slot"></div>
                    <div class="modal-submission">
                        <p><strong>Submitted by:</strong> ${submitter}${submitterRelation}</p>
                        ${submitterDate ? `<p><strong>Submitted on:</strong> ${submitterDate}</p>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;

    const shareSlot = modalContent.querySelector('.martyr-modal-share-slot');
    if (shareSlot) {
        shareSlot.replaceWith(createShareRowElement(martyr, 'modal'));
    }

    const voiceBtn = document.getElementById(voiceButtonId);
    if (voiceBtn && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance !== 'undefined') {
        voiceBtn.addEventListener('click', () => {
            stopActiveSpeech();
            activeSpeech = new SpeechSynthesisUtterance(
                `${martyr.fullName || ''}. Martyred on ${martyrdomPretty}. Location: ${martyrPlace}.`
            );
            window.speechSynthesis.speak(activeSpeech);
        });
    } else if (voiceBtn) {
        voiceBtn.style.display = 'none';
    }

    const closeButton = modalContent.querySelector('[data-close-modal]');
    if (closeButton) {
        closeButton.addEventListener('click', closeMartyrModal);
    }

    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => modal.classList.add('modal-show'), 10);
}

// Create Professional Modal Element
function createMartyrModal() {
    const modal = document.createElement('div');
    modal.id = 'martyrDetailsModal';
    modal.className = 'martyr-modal';
    modal.innerHTML = `
        <div class="modal-overlay" data-modal-overlay></div>
        <div class="modal-container">
            <div class="modal-body"></div>
        </div>
    `;

    modal.addEventListener('click', function(e) {
        if (e.target === modal || e.target.hasAttribute('data-modal-overlay')) {
            closeMartyrModal();
        }
    });

    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            closeMartyrModal();
        }
    });

    return modal;
}

// Close Modal Function
function closeMartyrModal() {
    const modal = document.getElementById('martyrDetailsModal');
    if (modal) {
        stopActiveSpeech();
        modal.classList.remove('modal-show');
        
        // Wait for animation to complete before hiding
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = 'auto';
        }, 300);
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
    viewBtn.className = 'btn-small';
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
                    <a href="add-martyr.html" class="btn-small">Add Martyr</a>
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
