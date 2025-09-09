// Simplified Firebase Configuration for Testing
// This version uses simpler rules and basic operations

// Firebase v9+ modular SDK
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { 
    getFirestore, 
    collection, 
    addDoc, 
    getDocs,
    doc,
    deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Your Firebase configuration (same as before)
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

// Extremely simple database functions
export const simpleFirebaseDB = {
    // Test basic connection
    async testBasicConnection() {
        try {
            console.log('🧪 Testing basic Firebase connection...');
            
            // Just try to read any collection
            const testRef = collection(db, 'martyrs');
            const snapshot = await getDocs(testRef);
            
            console.log(`✅ Basic Firebase test successful. Found ${snapshot.size} documents.`);
            return { success: true, count: snapshot.size };
            
        } catch (error) {
            console.error('❌ Basic Firebase test failed:', error);
            return { 
                success: false, 
                error: error.message,
                code: error.code,
                details: error
            };
        }
    },

    // Get all martyrs (no filtering)
    async getAllMartyrs() {
        try {
            console.log('📖 Reading all martyrs from Firebase...');
            
            const martyrsRef = collection(db, 'martyrs');
            const snapshot = await getDocs(martyrsRef);
            const martyrs = [];
            
            snapshot.forEach((doc) => {
                martyrs.push({
                    id: doc.id,
                    ...doc.data()
                });
            });
            
            console.log(`✅ Retrieved ${martyrs.length} martyrs from Firebase`);
            return { success: true, data: martyrs };
            
        } catch (error) {
            console.error('❌ Failed to get martyrs:', error);
            return { success: false, error: error.message, details: error };
        }
    },

    // Add a simple martyr
    async addSimpleMartyr(martyrData) {
        try {
            console.log('➕ Adding martyr to Firebase...');
            
            const martyrsRef = collection(db, 'martyrs');
            const docRef = await addDoc(martyrsRef, {
                ...martyrData,
                addedAt: new Date().toISOString(),
                status: 'approved'
            });
            
            console.log(`✅ Martyr added with ID: ${docRef.id}`);
            return { success: true, id: docRef.id };
            
        } catch (error) {
            console.error('❌ Failed to add martyr:', error);
            return { success: false, error: error.message, details: error };
        }
    }
};

// Make it available globally for debugging
window.simpleFirebase = simpleFirebaseDB;
