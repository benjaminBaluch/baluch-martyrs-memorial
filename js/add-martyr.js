// Add Martyr Form JavaScript

// Global variables for Firebase (will be loaded conditionally)
let firebaseDB = null;
let storageHelper = null;
let firebaseAvailable = false;
let formInitialized = false;

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
        console.log('💾 Firebase not available - submissions will fail gracefully');
        firebaseAvailable = false;
    }
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
    console.log('📋 Form submission started');
    
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
        
        console.log('✅ Form validation passed');
        
        // Show loading immediately
        showLoadingState();
        
        // Create martyr object
        const martyrData = {
            fullName: formData.get('fullName').trim(),
            birthDate: formData.get('birthDate'),
            martyrdomDate: formData.get('martyrdomDate'),
            birthPlace: formData.get('birthPlace')?.trim() || '',
            martyrdomPlace: formData.get('martyrdomPlace')?.trim() || '',
            biography: formData.get('biography')?.trim() || '',
            organization: formData.get('organization')?.trim() || '',
            rank: formData.get('rank')?.trim() || '',
            fatherName: formData.get('fatherName')?.trim() || '',
            familyDetails: formData.get('familyDetails')?.trim() || '',
            submitterName: formData.get('submitterName').trim(),
            submitterEmail: formData.get('submitterEmail').trim(),
            submitterRelation: formData.get('submitterRelation')?.trim() || '',
            submittedAt: new Date().toISOString()
        };
        
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

// Save martyr data to pending queue for moderation
async function saveMartyrData(martyrData) {
    console.log('💾 Starting to save martyr data...', { name: martyrData.fullName });
    
    try {
        // Ensure loading state is shown
        showLoadingState();
        
        // Add unique ID and status for tracking
        martyrData.id = 'martyr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        martyrData.status = 'pending';
        martyrData.submittedAt = new Date().toISOString();
        
        let saveSuccess = false;
        let errorMessage = null;
        
        // Check if Firebase is available and try to save
        if (firebaseAvailable && firebaseDB) {
            console.log('🔥 Firebase is available, attempting to save...');
            
            try {
                // Add timeout for regional connectivity issues (Pakistan, Gulf, etc.)
                const firebasePromise = firebaseDB.addPendingMartyr(martyrData);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Firebase timeout - possible regional connectivity issue')), 15000)
                );
                
                const result = await Promise.race([firebasePromise, timeoutPromise]);
                
                if (result && result.success) {
                    console.log('✅ Martyr saved to Firebase successfully:', result.id);
                    saveSuccess = true;
                } else {
                    errorMessage = result ? result.error : 'Unknown Firebase error';
                    console.warn('🔥 Firebase save failed:', errorMessage);
                }
            } catch (error) {
                errorMessage = error.message;
                console.warn('🌍 Firebase connectivity issue:', error.message);
            }
        } else {
            console.error('❌ Firebase not available for submissions');
            errorMessage = 'Firebase database connection not available. Please refresh the page and try again.';
        }
        
        // Always hide loading state
        hideLoadingState();
        
        if (saveSuccess) {
            // Success - redirect to confirmation
            console.log('✅ Submission successful, redirecting to confirmation...');
            
            // Store for confirmation page
            localStorage.setItem('lastSubmittedMartyr', martyrData.fullName);
            localStorage.setItem('lastSubmissionInfo', JSON.stringify({
                savedToFirebase: true,
                savedToLocalStorage: false,
                submittedAt: martyrData.submittedAt,
                martyrId: martyrData.id
            }));
            
            // Small delay to ensure localStorage is written
            setTimeout(() => {
                console.log('🔄 Redirecting to confirmation page...');
                window.location.href = 'confirmation.html?name=' + encodeURIComponent(martyrData.fullName);
            }, 100);
            
        } else {
            // Failed - show detailed error
            console.error('❌ Submission failed completely');
            
            const detailedError = `
❌ Submission Failed

${errorMessage || 'Unknown error occurred'}

Please try the following:
1. Check your internet connection
2. Refresh the page and try again
3. If you're in Pakistan/Gulf region, wait a moment and retry
4. Contact support if the problem persists

Your form data has been preserved - you can retry without re-entering everything.
            `.trim();
            
            alert(detailedError);
            
            // Don't redirect on failure - let user retry
            return;
        }
        
    } catch (error) {
        console.error('❌ Critical error in saveMartyrData:', error);
        
        // Always ensure loading state is hidden
        hideLoadingState();
        
        const criticalErrorMsg = `
❌ Critical Error

Something went wrong while processing your submission.

Error: ${error.message}

Please:
1. Refresh the page
2. Try again with a smaller image
3. Contact support if this continues

Your data has been preserved.
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
