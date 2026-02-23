// Add Martyr Form JavaScript

// Import security utilities
import { sanitizeInput, validateEmail, checkRateLimit, validateFile, validateBase64Image, logSecurityEvent, sanitizeFormData } from './security.js';

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

        // Initialize helper text for date fields
        initDateHelpers();
    }
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
            organization: sanitizeInput(formData.get('organization') || '', { maxLength: 200 }),
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
async function saveMartyrData(martyrData) {
    console.log('💾 Starting to save martyr data permanently to Firebase...', { name: martyrData.fullName });
    
    try {
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
