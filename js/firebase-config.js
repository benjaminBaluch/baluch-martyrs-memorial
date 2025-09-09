// Firebase Configuration and Initialization
// Replace the config values with your actual Firebase project config

// Firebase v9+ modular SDK
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
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
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBW2JKt68kGKE-CMvKQUUj33ToZ8M-kGII",
    authDomain: "baluch-martyrs-memorial.firebaseapp.com",
    projectId: "baluch-martyrs-memorial",
    storageBucket: "baluch-martyrs-memorial.firebasestorage.app",
    messagingSenderId: "420195314966",
    appId: "1:420195314966:web:0e3546e6e0e0c09cf3f437"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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

    // Get all approved martyrs (simplified - no complex queries)
    async getApprovedMartyrs() {
        try {
            console.log('🔍 Fetching approved martyrs from Firebase...');
            
            // Try simple query first without orderBy to avoid index issues
            const martyrsCollection = collection(db, 'martyrs');
            const querySnapshot = await getDocs(martyrsCollection);
            const martyrs = [];
            
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                if (data.status === 'approved') {
                    martyrs.push({
                        id: doc.id,
                        ...data
                    });
                }
            });
            
            console.log(`✅ Found ${martyrs.length} approved martyrs in Firebase`);
            return { success: true, data: martyrs };
        } catch (error) {
            console.error('❌ Error getting approved martyrs: ', error);
            console.error('Error details:', {
                code: error.code,
                message: error.message,
                stack: error.stack
            });
            return { success: false, error: error.message, details: error };
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
            
            // Try to read from a simple collection
            const testCollection = collection(db, 'test');
            const querySnapshot = await getDocs(testCollection);
            
            console.log('✅ Firebase read test successful');
            
            // Try to write a simple document
            const testDoc = {
                test: true,
                timestamp: new Date().toISOString(),
                message: 'Firebase connection test'
            };
            
            const docRef = await addDoc(testCollection, testDoc);
            console.log('✅ Firebase write test successful, doc ID:', docRef.id);
            
            // Clean up test document
            await deleteDoc(doc(db, 'test', docRef.id));
            console.log('✅ Firebase delete test successful');
            
            return { success: true, message: 'All Firebase operations working' };
        } catch (error) {
            console.error('❌ Firebase connection test failed:', error);
            return { success: false, error: error.message, details: error };
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
