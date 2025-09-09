// Main JavaScript for Baluch Martyrs Memorial

// DOM Content Loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize components
    initMobileMenu();
    initSmoothScroll();
    loadRecentMartyrs();
    initAnniversarySlider();
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

// Load Recent Martyrs (approved only)
function loadRecentMartyrs() {
    const recentMartyrsContainer = document.getElementById('recentMartyrs');
    
    if (recentMartyrsContainer) {
        // Only load approved martyrs
        const savedMartyrs = localStorage.getItem('martyrsData');
        
        if (savedMartyrs) {
            const allMartyrs = JSON.parse(savedMartyrs);
            const martyrsData = allMartyrs.filter(m => !m.status || m.status === 'approved');
            
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

// Initialize Anniversary Slider
function initAnniversarySlider() {
    loadAnniversaryMartyrs();
}

let currentSlide = 0;
let anniversaryMartyrs = [];

// Load martyrs with upcoming anniversaries
function loadAnniversaryMartyrs() {
    const slider = document.getElementById('anniversary-slider');
    if (!slider) return;
    
    // Get approved martyrs
    const savedMartyrs = localStorage.getItem('martyrsData');
    if (!savedMartyrs) {
        showEmptyAnniversarySlider();
        return;
    }
    
    const allMartyrs = JSON.parse(savedMartyrs);
    const approvedMartyrs = allMartyrs.filter(m => !m.status || m.status === 'approved');
    
    if (approvedMartyrs.length === 0) {
        showEmptyAnniversarySlider();
        return;
    }
    
    // Find martyrs with anniversaries in the next 30 days
    anniversaryMartyrs = getUpcomingAnniversaries(approvedMartyrs);
    
    if (anniversaryMartyrs.length === 0) {
        // If no upcoming anniversaries, show recent martyrs instead
        anniversaryMartyrs = approvedMartyrs.slice(-6);
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
        
        const martyrdomDate = new Date(martyr.martyrdomDate);
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
    const birthYear = martyr.birthDate ? new Date(martyr.birthDate).getFullYear() : '?';
    const martyrdomYear = new Date(martyr.martyrdomDate).getFullYear();
    dates.textContent = `${birthYear} - ${martyrdomYear}`;
    
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
        const martyrdomDate = new Date(martyr.martyrdomDate);
        return `<strong>Anniversary:</strong> ${martyrdomDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`;
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
