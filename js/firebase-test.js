// Firebase Connection Test and Debug Utility
export async function testFirebaseConnection() {
    console.log('🔥 Testing Firebase connection...');
    
    try {
        // Test if Firebase is available
        if (!window.firebaseDB) {
            throw new Error('Firebase not available on window object');
        }
        
        console.log('✅ Firebase object found');
        console.log('Firebase methods available:', Object.keys(window.firebaseDB));
        
        // Test Firebase connection by trying to get approved martyrs
        const result = await window.firebaseDB.getApprovedMartyrs();
        
        if (result.success) {
            console.log(`🎯 Firebase connection successful! Found ${result.data.length} approved martyrs`);
            return { success: true, martyrs: result.data };
        } else {
            console.error('❌ Firebase query failed:', result.error);
            return { success: false, error: result.error };
        }
        
    } catch (error) {
        console.error('❌ Firebase test failed:', error);
        return { success: false, error: error.message };
    }
}

// Migrate localStorage martyrs to Firebase for global visibility
export async function migrateLocalStorageToFirebase() {
    if (!window.firebaseDB) {
        console.error('Firebase not available for migration');
        return { success: false, error: 'Firebase not available' };
    }
    
    console.log('🚚 Starting localStorage to Firebase migration...');
    
    try {
        // Get martyrs from localStorage
        const localMartyrs = localStorage.getItem('martyrsData');
        if (!localMartyrs) {
            console.log('💭 No local martyrs found to migrate');
            return { success: true, migrated: 0 };
        }
        
        const martyrsData = JSON.parse(localMartyrs);
        const approvedMartyrs = martyrsData.filter(m => !m.status || m.status === 'approved');
        
        console.log(`📁 Found ${approvedMartyrs.length} approved martyrs in localStorage`);
        
        let migratedCount = 0;
        for (const martyr of approvedMartyrs) {
            try {
                // Add each martyr to Firebase directly as approved
                const martyrForFirebase = {
                    ...martyr,
                    status: 'approved',
                    migratedAt: new Date().toISOString()
                };
                
                // Use addPendingMartyr and then approve it
                const result = await window.firebaseDB.addPendingMartyr(martyrForFirebase);
                if (result.success) {
                    // Approve it immediately
                    await window.firebaseDB.approveMartyr(result.id, martyrForFirebase);
                    migratedCount++;
                    console.log(`✅ Migrated: ${martyr.fullName}`);
                } else {
                    console.error(`❌ Failed to migrate ${martyr.fullName}:`, result.error);
                }
            } catch (error) {
                console.error(`❌ Error migrating ${martyr.fullName}:`, error);
            }
        }
        
        console.log(`🎉 Migration completed: ${migratedCount}/${approvedMartyrs.length} martyrs migrated`);
        return { success: true, migrated: migratedCount, total: approvedMartyrs.length };
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
        return { success: false, error: error.message };
    }
}

// Add test data for debugging (only run once)
export async function addTestMartyr() {
    if (!window.firebaseDB) {
        console.error('Firebase not available for test data');
        return;
    }
    
    const testMartyr = {
        fullName: 'Test Martyr',
        fatherName: 'Test Father',
        birthDate: '1990-01-01',
        martyrdomDate: '2020-01-01',
        birthPlace: 'Test City',
        martyrdomPlace: 'Test Location',
        organization: 'Test Organization',
        biography: 'This is a test martyr for debugging purposes',
        submitterName: 'Test Submitter',
        submitterEmail: 'test@example.com'
    };
    
    try {
        // Add as approved directly for testing
        const result = await window.firebaseDB.addPendingMartyr(testMartyr);
        if (result.success) {
            console.log('✅ Test martyr added successfully:', result.id);
        }
    } catch (error) {
        console.error('❌ Failed to add test martyr:', error);
    }
}

// Debug Firebase rules and permissions
export async function debugFirebaseRules() {
    console.log('🔍 Debugging Firebase rules...');
    
    try {
        // Try to read pending martyrs (admin function)
        console.log('Testing getPendingMartyrs...');
        const pendingResult = await window.firebaseDB.getPendingMartyrs();
        console.log('Pending martyrs result:', pendingResult);
        
        // Try to read approved martyrs (public function)  
        console.log('Testing getApprovedMartyrs...');
        const approvedResult = await window.firebaseDB.getApprovedMartyrs();
        console.log('Approved martyrs result:', approvedResult);
        
    } catch (error) {
        console.error('❌ Firebase rules debug failed:', error);
    }
}
