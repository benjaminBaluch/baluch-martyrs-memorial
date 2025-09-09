// Simple Mobile Menu JavaScript - Standalone for reliability
console.log('📱 Mobile menu script loaded');

function initSimpleMobileMenu() {
    console.log('🔧 Initializing simple mobile menu...');
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSimpleMobileMenu);
        return;
    }
    
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    console.log('🍔 Hamburger found:', !!hamburger);
    console.log('📋 Nav menu found:', !!navMenu);
    
    if (!hamburger || !navMenu) {
        console.error('❌ Mobile menu elements not found!');
        console.log('Available elements:', {
            hamburger: document.querySelector('.hamburger'),
            navMenu: document.querySelector('.nav-menu')
        });
        return;
    }
    
    // Remove any existing event listeners
    hamburger.replaceWith(hamburger.cloneNode(true));
    const newHamburger = document.querySelector('.hamburger');
    
    // Add click event
    newHamburger.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('🍔 Hamburger clicked!');
        
        const isActive = navMenu.classList.contains('active');
        console.log('Current menu state - Active:', isActive);
        
        if (isActive) {
            navMenu.classList.remove('active');
            newHamburger.classList.remove('active');
            console.log('✅ Menu closed');
        } else {
            navMenu.classList.add('active');
            newHamburger.classList.add('active');
            console.log('✅ Menu opened');
        }
        
        // Debug current classes
        console.log('Nav menu classes:', navMenu.className);
        console.log('Hamburger classes:', newHamburger.className);
    });
    
    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        if (!newHamburger.contains(e.target) && !navMenu.contains(e.target)) {
            navMenu.classList.remove('active');
            newHamburger.classList.remove('active');
            console.log('🔒 Menu closed (clicked outside)');
        }
    });
    
    // Close menu when clicking on nav links
    const navLinks = navMenu.querySelectorAll('a');
    console.log('🔗 Found nav links:', navLinks.length);
    
    navLinks.forEach((link, index) => {
        link.addEventListener('click', function() {
            console.log(`🔗 Nav link ${index + 1} clicked, closing menu`);
            navMenu.classList.remove('active');
            newHamburger.classList.remove('active');
        });
    });
    
    console.log('✅ Simple mobile menu initialized successfully');
}

// Initialize immediately if DOM is ready, otherwise wait
initSimpleMobileMenu();

// Also expose globally for debugging
window.initMobileMenu = initSimpleMobileMenu;
