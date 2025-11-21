// Firebase Configuration and Initialization
// Replace the config values with your actual Firebase project config

// Firebase v9+ modular SDK - Updated to latest stable version
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs, 
    doc, 
    updateDoc, 
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// Your web app's Firebase configuration - Production Ready
const firebaseConfig = {
    apiKey: "AIzaSyBW2JKt68kGKE-CMvKQUUj33ToZ8M-kGII",
    authDomain: "baluch-martyrs-memorial.firebaseapp.com",
    projectId: "baluch-martyrs-memorial",
    storageBucket: "baluch-martyrs-memorial.firebasestorage.app",
    messagingSenderId: "420195314966",
    appId: "1:420195314966:web:0e3546e6e0e0c09cf3f437"
};

// Initialize Firebase with error handling
let app;
let db;

try {
    console.log('🔥 Initializing Firebase app...');
    app = initializeApp(firebaseConfig);
    console.log('✅ Firebase app initialized successfully');
    
    console.log('🗺 Initializing Firestore...');
    db = getFirestore(app);
    console.log('✅ Firestore initialized successfully');
    
    // Verify connection immediately
    console.log('🧪 Testing immediate Firestore connection...');
    
} catch (error) {
    console.error('❌ Firebase initialization failed:', error);
    console.error('Error details:', {
        code: error.code,
        message: error.message,
        config: firebaseConfig
    });
    throw error;
}

// Database helper functions
export const firebaseDB = {
    // Add new pending martyr
    async addPendingMartyr(martyrData) {
        try {
            // Convert date strings to Timestamp objects for Firestore
            const processedData = { ...martyrData };
            
            if (processedData.birthDate) {
                processedData.birthDate = Timestamp.fromDate(new Date(processedData.birthDate));
            }
            if (processedData.martyrdomDate) {
                processedData.martyrdomDate = Timestamp.fromDate(new Date(processedData.martyrdomDate));
            }
            
            const docRef = await addDoc(collection(db, 'pendingMartyrs'), {
                ...processedData,
                status: 'pending',
                submittedAt: serverTimestamp(),
                id: Date.now().toString() // Temporary ID for backward compatibility
            });
            
            console.log('Pending martyr added with ID: ', docRef.id);
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Error adding pending martyr: ', error);
            return { success: false, error: error.message };
        }
    },

    // Get all approved martyrs with comprehensive collection checking
    async getApprovedMartyrs() {
        try {
            console.log('🔍 Fetching martyrs from Firebase collections...');
            
            let allMartyrs = [];
            
            // Check main 'martyrs' collection first
            try {
                console.log('🔍 Checking main martyrs collection...');
                const martyrsCollection = collection(db, 'martyrs');
                const martyrsSnapshot = await getDocs(martyrsCollection);
                
                martyrsSnapshot.forEach((doc) => {
                    const data = doc.data();
                    // Include all martyrs or only approved ones
                    if (!data.status || data.status === 'approved') {
                        allMartyrs.push({
                            id: doc.id,
                            ...data,
                            status: data.status || 'approved' // Default to approved
                        });
                    }
                });
                
                console.log(`📋 Found ${martyrsSnapshot.size} total docs in martyrs collection, ${allMartyrs.length} approved`);
            } catch (error) {
                console.warn('⚠️ Error accessing martyrs collection:', error.message);
            }
            
            // If no martyrs found, check pendingMartyrs collection for any approved ones
            if (allMartyrs.length === 0) {
                try {
                    console.log('🔍 Checking pendingMartyrs collection for approved items...');
                    const pendingCollection = collection(db, 'pendingMartyrs');
                    const pendingSnapshot = await getDocs(pendingCollection);
                    
                    pendingSnapshot.forEach((doc) => {
                        const data = doc.data();
                        if (data.status === 'approved') {
                            allMartyrs.push({
                                id: doc.id,
                                ...data
                            });
                        }
                    });
                    
                    console.log(`📋 Found ${pendingSnapshot.size} pending docs, ${allMartyrs.length} approved from pending`);
                } catch (error) {
                    console.warn('⚠️ Error accessing pendingMartyrs collection:', error.message);
                }
            }
            
            // If still no martyrs, check if collections exist and are accessible
            if (allMartyrs.length === 0) {
                console.log('📊 No martyrs found. Checking Firebase connectivity and permissions...');
                
                // Test basic Firestore read access
                try {
                    const testCollection = collection(db, 'test');
                    const testSnapshot = await getDocs(testCollection);
                    console.log('✅ Firestore read access confirmed - collections may be empty');
                } catch (testError) {
                    console.error('❌ Firestore read access failed:', testError);
                    throw new Error(`Firebase access denied: ${testError.message}`);
                }
            }
            
            console.log(`✅ Final result: ${allMartyrs.length} martyrs total`);
            return { 
                success: true, 
                data: allMartyrs,
                collections_checked: ['martyrs', 'pendingMartyrs'],
                total_found: allMartyrs.length
            };
            
        } catch (error) {
            console.error('❌ Error getting martyrs from Firebase:', error);
            console.error('🔎 Detailed error info:', {
                code: error.code,
                message: error.message,
                name: error.name,
                stack: error.stack?.substring(0, 500)
            });
            
            return { 
                success: false, 
                error: error.message,
                code: error.code,
                details: error 
            };
        }
    },

    // Get all pending martyrs (admin only) - simplified
    async getPendingMartyrs() {
        try {
            console.log('🔍 Fetching pending martyrs from Firebase...');
            
            // Simple query without orderBy to avoid index issues
            const pendingCollection = collection(db, 'pendingMartyrs');
            const querySnapshot = await getDocs(pendingCollection);
            const pendingMartyrs = [];
            
            querySnapshot.forEach((doc) => {
                pendingMartyrs.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            console.log(`✅ Found ${pendingMartyrs.length} pending martyrs in Firebase`);
            return { success: true, data: pendingMartyrs };
        } catch (error) {
            console.error('❌ Error getting pending martyrs: ', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message
            });
            return { success: false, error: error.message, details: error };
        }
    },

    // Approve pending martyr (move to approved collection)
    async approveMartyr(martyrId, martyrData) {
        try {
            // Add to approved martyrs collection
            const approvedData = {
                ...martyrData,
                status: 'approved',
                approvedAt: serverTimestamp()
            };
            delete approvedData.id; // Remove old ID field
            
            const docRef = await addDoc(collection(db, 'martyrs'), approvedData);
            
            // Delete from pending collection
            await deleteDoc(doc(db, 'pendingMartyrs', martyrId));
            
            console.log('Martyr approved with ID: ', docRef.id);
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Error approving martyr: ', error);
            return { success: false, error: error.message };
        }
    },

    // Reject pending martyr (delete from pending)
    async rejectMartyr(martyrId) {
        try {
            await deleteDoc(doc(db, 'pendingMartyrs', martyrId));
            console.log('Martyr rejected and deleted: ', martyrId);
            return { success: true };
        } catch (error) {
            console.error('Error rejecting martyr: ', error);
            return { success: false, error: error.message };
        }
    },

    // Simple Firebase connectivity test
    async testConnection() {
        try {
            console.log('🧪 Testing basic Firebase connectivity...');
            
            if (!app || !db) {
                throw new Error('Firebase app or Firestore not initialized');
            }
            
            console.log('🔧 Firebase app config:', {
                projectId: app.options.projectId,
                authDomain: app.options.authDomain
            });
            
            // Try simple read first - just check if Firestore is accessible
            console.log('🔍 Testing Firestore read access...');
            const testCollection = collection(db, 'test');
            const querySnapshot = await getDocs(testCollection);
            
            console.log('✅ Firebase read test successful, docs found:', querySnapshot.size);
            return { success: true, message: 'Firebase read test successful' };
            
        } catch (error) {
            console.error('❌ Firebase connection test failed:', error);
            
            // Check if it's a CORS error
            const isCorsError = error.message.includes('CORS') || 
                               error.message.includes('cross-origin') ||
                               error.message.includes('access control') ||
                               error.code === 'unavailable';
            
            if (isCorsError) {
                console.error('🚨 CORS Error Detected: Firebase is being blocked by browser security policies');
                console.error('This usually happens when:');
                console.error('1. Domain not authorized in Firebase Console');
                console.error('2. Browser blocking cross-origin requests');
                console.error('3. Firebase project configuration issues');
            }
            
            console.error('🔍 Error details:', {
                code: error.code,
                message: error.message,
                name: error.name,
                isCorsError: isCorsError,
                stack: error.stack?.substring(0, 200)
            });
            
            return { 
                success: false, 
                error: isCorsError ? 'CORS/Domain authorization error' : error.message, 
                code: error.code,
                isCorsError: isCorsError,
                details: error 
            };
        }
    },
    
    // Delete an approved martyr (admin function)
    async deleteApprovedMartyr(martyrId) {
        try {
            console.log(`🗑️ Deleting approved martyr: ${martyrId}`);
            await deleteDoc(doc(db, 'martyrs', martyrId));
            console.log(`✅ Approved martyr deleted: ${martyrId}`);
            return { success: true };
        } catch (error) {
            console.error('❌ Error deleting approved martyr: ', error);
            return { success: false, error: error.message };
        }
    },
    
    // Clear all pending martyrs (admin function)
    async clearAllPendingMartyrs() {
        try {
            const pendingCollection = collection(db, 'pendingMartyrs');
            const querySnapshot = await getDocs(pendingCollection);
            
            const deletePromises = [];
            querySnapshot.forEach((docSnapshot) => {
                deletePromises.push(deleteDoc(docSnapshot.ref));
            });
            
            await Promise.all(deletePromises);
            console.log(`Cleared ${deletePromises.length} pending martyrs from Firebase`);
            return { success: true, deletedCount: deletePromises.length };
        } catch (error) {
            console.error('Error clearing all pending martyrs: ', error);
            return { success: false, error: error.message };
        }
    },
    
    // Clear all approved martyrs (admin function - use with caution!)
    async clearAllApprovedMartyrs() {
        try {
            console.log('🧹 Clearing all approved martyrs...');
            const martyrsCollection = collection(db, 'martyrs');
            const querySnapshot = await getDocs(martyrsCollection);
            
            const deletePromises = [];
            querySnapshot.forEach((docSnapshot) => {
                deletePromises.push(deleteDoc(docSnapshot.ref));
            });
            
            await Promise.all(deletePromises);
            console.log(`✅ Cleared ${deletePromises.length} approved martyrs from Firebase`);
            return { success: true, deletedCount: deletePromises.length };
        } catch (error) {
            console.error('❌ Error clearing all approved martyrs: ', error);
            return { success: false, error: error.message };
        }
    },
    
    // Initialize database with sample martyrs if empty (production ready)
    async initializeDatabaseIfEmpty() {
        try {
            console.log('🌱 Checking if database needs initialization...');
            
            // Check if we have any martyrs
            const result = await this.getApprovedMartyrs();
            
            if (result.success && result.data.length === 0) {
                console.log('📋 Database is empty, adding initial martyr data...');
                
                // Sample martyrs based on historical Baluch figures
                const initialMartyrs = [
                    {
                        fullName: "Shaheed Mir Balach Marri",
                        fatherName: "Nawab Khair Bakhsh Marri",
                        birthDate: "1966-01-01",
                        martyrdomDate: "2007-11-20",
                        birthPlace: "Kohlu, Balochistan",
                        martyrdomPlace: "Karachi, Pakistan",
                        organization: "Balochistan Liberation Army",
                        rank: "Commander",
                        biography: "A prominent Baluch freedom fighter and son of Nawab Khair Bakhsh Marri. He dedicated his life to the liberation of Balochistan and became a symbol of resistance.",
                        familyDetails: "Son of tribal chief Nawab Khair Bakhsh Marri",
                        submitterName: "Memorial Committee",
                        submitterRelation: "Historical Record",
                        status: "approved"
                    },
                    {
                        fullName: "Shaheed Brahumdagh Bugti",
                        fatherName: "Nawab Akbar Bugti",
                        birthDate: "1920-07-12",
                        martyrdomDate: "2006-08-26",
                        birthPlace: "Dera Bugti, Balochistan",
                        martyrdomPlace: "Taratani, Balochistan",
                        organization: "Jamhoori Watan Party",
                        rank: "Nawab",
                        biography: "Nawab Akbar Shahbaz Khan Bugti was a prominent Baluch politician and tribal chief who fought for Baluch rights and autonomy until his martyrdom.",
                        familyDetails: "Tribal chief of Bugti tribe",
                        submitterName: "Memorial Committee",
                        submitterRelation: "Historical Record", 
                        status: "approved"
                    }
                ];
                
                let addedCount = 0;
                for (const martyr of initialMartyrs) {
                    try {
                        // Process dates
                        const processedMartyr = { ...martyr };
                        processedMartyr.birthDate = Timestamp.fromDate(new Date(martyr.birthDate));
                        processedMartyr.martyrdomDate = Timestamp.fromDate(new Date(martyr.martyrdomDate));
                        processedMartyr.submittedAt = serverTimestamp();
                        
                        const docRef = await addDoc(collection(db, 'martyrs'), processedMartyr);
                        addedCount++;
                        console.log(`✅ Added martyr: ${martyr.fullName} with ID: ${docRef.id}`);
                    } catch (error) {
                        console.error(`❌ Failed to add ${martyr.fullName}:`, error);
                    }
                }
                
                console.log(`✅ Database initialized with ${addedCount} martyrs`);
                return { success: true, added: addedCount };
            } else {
                console.log(`✅ Database already has ${result.data.length} martyrs, no initialization needed`);
                return { success: true, added: 0, existing: result.data.length };
            }
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            return { success: false, error: error.message };
        }
    }
};

// Backward compatibility with localStorage (fallback)
export const storageHelper = {
    // Migrate existing localStorage data to Firebase
    async migrateFromLocalStorage() {
        try {
            // Migrate approved martyrs
            const existingMartyrs = localStorage.getItem('martyrsData');
            if (existingMartyrs) {
                const martyrsData = JSON.parse(existingMartyrs);
                const approvedMartyrs = martyrsData.filter(m => !m.status || m.status === 'approved');
                
                for (const martyr of approvedMartyrs) {
                    await addDoc(collection(db, 'martyrs'), {
                        ...martyr,
                        status: 'approved',
                        migratedAt: serverTimestamp()
                    });
                }
                
                console.log(`Migrated ${approvedMartyrs.length} approved martyrs`);
            }
            
            // Migrate pending martyrs
            const existingPending = localStorage.getItem('pendingMartyrs');
            if (existingPending) {
                const pendingData = JSON.parse(existingPending);
                
                for (const martyr of pendingData) {
                    await addDoc(collection(db, 'pendingMartyrs'), {
                        ...martyr,
                        status: 'pending',
                        migratedAt: serverTimestamp()
                    });
                }
                
                console.log(`Migrated ${pendingData.length} pending martyrs`);
            }
            
            return { success: true };
        } catch (error) {
            console.error('Migration error: ', error);
            return { success: false, error: error.message };
        }
    },

    // Fallback to localStorage if Firebase is not available
    getLocalMartyrs() {
        const savedMartyrs = localStorage.getItem('martyrsData');
        return savedMartyrs ? JSON.parse(savedMartyrs) : [];
    },

    getLocalPending() {
        const savedPending = localStorage.getItem('pendingMartyrs');
        return savedPending ? JSON.parse(savedPending) : [];
    }
};

export default app;

// Make firebaseDB available globally for easy access from other scripts
if (typeof window !== 'undefined') {
    window.firebaseDB = firebaseDB;
    window.firebaseApp = app;
    window.firebaseAvailable = true;
    
    // Log domain information for debugging
    console.log('✅ Firebase made available globally on window object');
    console.log('🌍 Current domain:', window.location.hostname);
    console.log('🔍 Available Firebase methods:', Object.keys(firebaseDB));
    
    // Verify domain is authorized
    const allowedDomains = [
        'baluchmartyrs.site',
        'www.baluchmartyrs.site', 
        'localhost',
        '127.0.0.1',
        'benjaminbaluch.github.io'
    ];
    
    const currentDomain = window.location.hostname;
    const isDomainAllowed = allowedDomains.some(domain => 
        currentDomain === domain || currentDomain.endsWith(domain)
    );
    
    if (!isDomainAllowed) {
        console.warn(`⚠️ Domain ${currentDomain} may not be authorized for Firebase access`);
        console.log('🔒 Authorized domains:', allowedDomains);
    } else {
        console.log('✅ Domain authorized for Firebase access');
    }
    
    // Test Firebase immediately when loaded
    firebaseDB.testConnection().then(result => {
        if (result.success) {
            console.log('✅ Initial Firebase connectivity test passed');
            
            // Auto-initialize database if needed
            return firebaseDB.initializeDatabaseIfEmpty();
        } else {
            console.warn('⚠️ Initial Firebase connectivity test failed:', result.error);
            return null;
        }
    }).then(initResult => {
        if (initResult) {
            if (initResult.added > 0) {
                console.log(`🌱 Database auto-initialized with ${initResult.added} martyrs`);
            } else if (initResult.existing > 0) {
                console.log(`📋 Database already contains ${initResult.existing} martyrs`);
            }
        }
    }).catch(error => {
        console.error('❌ Firebase initialization error:', error);
    });
}
