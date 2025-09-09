# Firebase Region Fix for Gulf Countries

## Problem
Current Firebase project is hosted in US region causing connectivity issues for Gulf country users.

## Permanent Solution: Migrate to Asia Region

### Step 1: Create New Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Add project"
3. Name: `baluch-martyrs-memorial-asia` 
4. **Important**: Choose region `asia-south1` (Mumbai, India)

### Step 2: Set up Firestore in Asia Region
1. Go to Firestore Database
2. Create database
3. Choose `asia-south1` region
4. Start in production mode with these rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read access to approved martyrs
    match /martyrs/{document} {
      allow read: if resource.data.status == 'approved';
    }
    
    // Allow anyone to submit pending martyrs
    match /pendingMartyrs/{document} {
      allow create: if true;
      allow read, write: if false; // Only admin access through Firebase Admin SDK
    }
  }
}
```

### Step 3: Get New Configuration
1. Go to Project Settings → General
2. Scroll to "Your apps" section
3. Click "Add app" → Web
4. Register app: `baluch-martyrs-web`
5. Copy the new config object

### Step 4: Update Firebase Config
Replace the config in `js/firebase-config.js`:

```javascript
// New Asia region Firebase configuration
const firebaseConfig = {
    apiKey: "NEW_API_KEY_FROM_ASIA_PROJECT",
    authDomain: "baluch-martyrs-memorial-asia.firebaseapp.com",
    projectId: "baluch-martyrs-memorial-asia", 
    storageBucket: "baluch-martyrs-memorial-asia.firebasestorage.app",
    messagingSenderId: "NEW_SENDER_ID",
    appId: "NEW_APP_ID"
};
```

### Step 5: Authorize Domains
1. Go to Authentication → Settings
2. Add authorized domains:
   - `baluchmartyrs.site`
   - `www.baluchmartyrs.site`
   - `benjaminbaluch.github.io`

### Step 6: Migrate Existing Data
Use Firebase Admin SDK or manual export/import to move existing data from US to Asia project.

## Why This Works
- `asia-south1` (Mumbai) is geographically closer to Gulf countries
- Better network routing through Asian internet infrastructure
- Lower latency and higher reliability for Gulf region users
- Permanent solution, not a workaround
