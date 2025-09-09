// Add Martyr Form JavaScript

// Global variables for Firebase (will be loaded conditionally)
let firebaseDB = null;
let storageHelper = null;
let firebaseAvailable = false;

// Attempt to load Firebase modules (with fallback for Gulf regions)
async function loadFirebaseModules() {
    try {
        console.log('🌍 Attempting to load Firebase modules...');
        const firebaseModule = await import('./firebase-config.js');
        firebaseDB = firebaseModule.firebaseDB;
        storageHelper = firebaseModule.storageHelper;
        firebaseAvailable = true;
        console.log('✅ Firebase modules loaded successfully');
    } catch (error) {
        console.warn('🌍 Firebase modules failed to load (common in Gulf region):', error.message);
        console.log('💾 Using localStorage-only mode for Gulf region compatibility');
        firebaseAvailable = false;
    }
}

document.addEventListener('DOMContentLoaded', async function() {
    // Try to load Firebase modules first
    await loadFirebaseModules();
    initializeFormHandlers();
});

function initializeFormHandlers() {
    const form = document.getElementById('addMartyrForm');
    
    if (form) {
        // Handle form submission
        form.addEventListener('submit', handleFormSubmit);
        
        // Initialize file upload handlers
        initFileUploads();
    }
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

// Handle form submission
function handleFormSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const formData = new FormData(form);
    
    // Create martyr object
    const martyrData = {
        fullName: formData.get('fullName'),
        birthDate: formData.get('birthDate'),
        martyrdomDate: formData.get('martyrdomDate'),
        birthPlace: formData.get('birthPlace'),
        martyrdomPlace: formData.get('martyrdomPlace'),
        biography: formData.get('biography'),
        organization: formData.get('organization'),
        rank: formData.get('rank'),
        fatherName: formData.get('fatherName'),
        familyDetails: formData.get('familyDetails'),
        submitterName: formData.get('submitterName'),
        submitterEmail: formData.get('submitterEmail'),
        submitterRelation: formData.get('submitterRelation'),
        submittedAt: new Date().toISOString()
    };
    
    // Handle photo data with compression (convert to base64 for localStorage)
    const photoInput = document.getElementById('martyrPhoto');
    const compressedFile = photoInput && photoInput.compressedFile;
    const photoFile = compressedFile || formData.get('martyrPhoto');
    
    if (photoFile && photoFile.size > 0) {
        console.log('📷 Processing photo for submission...');
        const reader = new FileReader();
        reader.onload = function(e) {
            martyrData.photo = e.target.result;
            console.log(`🗜️ Photo data size: ${(e.target.result.length / 1024 / 1024 * 0.75).toFixed(2)}MB (base64)`);
            saveMartyrData(martyrData);
        };
        reader.readAsDataURL(photoFile);
    } else {
        saveMartyrData(martyrData);
    }
}

// Save martyr data to pending queue for moderation
async function saveMartyrData(martyrData) {
    try {
        // Show loading indicator
        showLoadingState();
        
        // Add unique ID and status for tracking
        martyrData.id = 'martyr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        martyrData.status = 'pending';
        martyrData.submittedAt = new Date().toISOString();
        
        let saveSuccess = false;
        let firebaseError = null;
        
        // Try to save to Firebase only if available
        if (firebaseAvailable && firebaseDB) {
            try {
                console.log('🌍 Attempting Firebase save (may take longer from Gulf region)...');
                
                // Add timeout for regional connectivity issues
                const firebasePromise = firebaseDB.addPendingMartyr(martyrData);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Firebase timeout - possible regional connectivity issue')), 15000)
                );
                
                const result = await Promise.race([firebasePromise, timeoutPromise]);
                
                if (result.success) {
                    console.log('✅ Martyr saved to Firebase successfully:', result.id);
                    saveSuccess = true;
                } else {
                    firebaseError = result.error;
                    console.warn('🔥 Firebase save failed:', result.error);
                }
            } catch (error) {
                firebaseError = error.message;
                console.warn('🌍 Firebase connectivity issue (common in Gulf region):', error.message);
                
                // Check if it's a regional connectivity issue
                const isRegionalIssue = error.message.includes('timeout') || 
                                      error.message.includes('unavailable') ||
                                      error.message.includes('network') ||
                                      error.code === 'unavailable';
                
                if (isRegionalIssue) {
                    console.log('🌐 Detected regional connectivity issue - using localStorage as primary storage');
                }
            }
        } else {
            console.log('💾 Firebase not available - using localStorage-only mode (Gulf region compatibility)');
            firebaseError = 'Firebase modules not loaded (regional compatibility mode)';
        }
        
        // Always save to localStorage as backup/fallback
        try {
            let pendingData = localStorage.getItem('pendingMartyrs');
            pendingData = pendingData ? JSON.parse(pendingData) : [];
            pendingData.push(martyrData);
            localStorage.setItem('pendingMartyrs', JSON.stringify(pendingData));
            
            console.log('💾 Martyr saved to localStorage successfully');
            
            if (!saveSuccess) {
                console.log('💾 Using localStorage as primary storage method');
                saveSuccess = true; // localStorage save succeeded
            }
        } catch (localStorageError) {
            console.error('❌ localStorage save failed:', localStorageError);
            throw new Error('Unable to save submission data locally');
        }
        
        // Store last submission for confirmation page
        localStorage.setItem('lastSubmittedMartyr', martyrData.fullName);
        
        // Store submission method info for confirmation page
        const submissionInfo = {
            savedToFirebase: saveSuccess && !firebaseError,
            savedToLocalStorage: true,
            isRegionalFallback: !!firebaseError,
            firebaseError: firebaseError
        };
        localStorage.setItem('lastSubmissionInfo', JSON.stringify(submissionInfo));
        
        // Hide loading state
        hideLoadingState();
        
        // Redirect to confirmation page
        window.location.href = 'confirmation.html?name=' + encodeURIComponent(martyrData.fullName);
        
    } catch (error) {
        console.error('Error saving martyr data:', error);
        hideLoadingState();
        
        // Provide more helpful error message for Gulf region users
        let errorMessage = 'There was an error saving the martyr information. Please try again.';
        
        if (error.message.includes('Firebase') || error.message.includes('timeout') || !firebaseAvailable) {
            errorMessage = `
                Submission Error: This appears to be a regional connectivity issue.
                
                Your submission may have been saved locally. Please:
                1. Check your internet connection
                2. Try refreshing the page and submitting again
                3. If the problem persists, your submission will be processed from local storage
                
                Note: Users in Gulf countries may experience connectivity delays with our database.
            `.trim();
        }
        
        alert(errorMessage);
    }
}

// Show loading state during submission
function showLoadingState() {
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
    }
}

// Hide loading state after submission
function hideLoadingState() {
    const submitBtn = document.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit for Review';
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

// Form validation enhancements
document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('addMartyrForm');
    
    if (form) {
        // Add real-time validation
        const requiredFields = form.querySelectorAll('[required]');
        
        requiredFields.forEach(field => {
            field.addEventListener('blur', function() {
                validateField(this);
            });
        });
    }
});

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
