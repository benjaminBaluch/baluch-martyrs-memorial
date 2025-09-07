// Main JavaScript for Baluch Martyrs Memorial

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize components
    initMobileMenu();
    initSmoothScroll();
    loadRecentMartyrs();
});

// Mobile Menu Toggle
function initMobileMenu() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    
    if (hamburger && navMenu) {
        hamburger.addEventListener('click', function() {
            navMenu.classList.toggle('active');
            hamburger.classList.toggle('active');
        });
        
        // Close menu when clicking on a link
        const navLinks = document.querySelectorAll('.nav-menu a');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                navMenu.classList.remove('active');
                hamburger.classList.remove('active');
            });
        });
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

// Load Recent Martyrs (Mock function - would connect to backend in production)
function loadRecentMartyrs() {
    const recentMartyrsContainer = document.getElementById('recentMartyrs');
    
    if (recentMartyrsContainer) {
        // Check localStorage for saved martyrs
        const savedMartyrs = localStorage.getItem('martyrsData');
        
        if (savedMartyrs) {
            const martyrsData = JSON.parse(savedMartyrs);
            
            // Clear placeholder if martyrs exist
            if (martyrsData.length > 0) {
                recentMartyrsContainer.innerHTML = '';
                
                // Display up to 6 recent martyrs
                const recentMartyrs = martyrsData.slice(-6).reverse();
                
                recentMartyrs.forEach(martyr => {
                    const martyrCard = createMartyrCard(martyr);
                    recentMartyrsContainer.appendChild(martyrCard);
                });
            }
        }
    }
}

// Create Martyr Card Element
function createMartyrCard(martyr) {
    const card = document.createElement('div');
    card.className = 'martyr-card';
    
    // Create image element
    const imageDiv = document.createElement('div');
    imageDiv.className = 'martyr-image';
    
    if (martyr.photo) {
        const img = document.createElement('img');
        img.src = martyr.photo;
        img.alt = martyr.fullName;
        imageDiv.appendChild(img);
    } else {
        imageDiv.style.background = 'linear-gradient(135deg, #ddd, #aaa)';
    }
    
    // Create info section
    const infoDiv = document.createElement('div');
    infoDiv.className = 'martyr-info';
    
    const name = document.createElement('h3');
    name.textContent = martyr.fullName;
    
    const dates = document.createElement('p');
    dates.textContent = `${formatDate(martyr.birthDate)} - ${formatDate(martyr.martyrdomDate)}`;
    
    const place = document.createElement('p');
    place.textContent = martyr.martyrdomPlace || 'Unknown location';
    
    const viewBtn = document.createElement('a');
    viewBtn.href = '#';
    viewBtn.className = 'btn-small';
    viewBtn.textContent = 'View Details';
    viewBtn.onclick = function(e) {
        e.preventDefault();
        showMartyrDetails(martyr);
    };
    
    infoDiv.appendChild(name);
    infoDiv.appendChild(dates);
    infoDiv.appendChild(place);
    infoDiv.appendChild(viewBtn);
    
    card.appendChild(imageDiv);
    card.appendChild(infoDiv);
    
    return card;
}

// Format Date Helper
function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    
    const date = new Date(dateString);
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Show Martyr Details (Modal or redirect)
function showMartyrDetails(martyr) {
    // For now, just alert the details
    // In production, this would open a modal or redirect to a detail page
    alert(`
        Name: ${martyr.fullName}
        Birth: ${formatDate(martyr.birthDate)}
        Martyrdom: ${formatDate(martyr.martyrdomDate)}
        Place: ${martyr.martyrdomPlace}
        ${martyr.biography ? '\nBiography: ' + martyr.biography : ''}
    `);
}

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
