# Firebase Setup Guide (100% FREE)

## Step 1: Create Firebase Project

1. **Go to [console.firebase.google.com](https://console.firebase.google.com)**
2. **Click "Create a project"**
3. **Name it**: `baluch-martyrs-memorial`
4. **Skip Google Analytics** (not needed)
5. **Click "Create project"**

## Step 2: Enable Firestore Database

1. **In Firebase console**, click **"Firestore Database"** in left menu
2. **Click "Create database"**
3. **Choose "Start in test mode"** (we'll secure it later)
4. **Select location** closest to you
5. **Click "Done"**

## Step 3: Create Service Account

1. **Go to Project Settings** (gear icon) → **"Service accounts"** tab
2. **Click "Generate new private key"**
3. **Download the JSON file** (keep it safe!)
4. **Open the JSON file** and copy all contents

## Step 4: Configure Netlify Environment Variables

1. **Deploy your site** to Netlify (drag & drop entire folder)
2. **Go to Netlify dashboard** → your site → **"Site settings"**
3. **Go to "Environment variables"** section
4. **Add this variable:**

```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"your-project-id"...}
```

**Important**: Paste the ENTIRE JSON content as the value (it's one long line)

## Step 5: Set Firestore Security Rules

In Firebase console → Firestore → Rules, replace with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow read access to approved martyrs
    match /martyrs/{martyrId} {
      allow read: if resource.data.status == 'approved';
      allow create: if request.auth == null; // Allow anonymous submissions
    }
  }
}
```

Click **"Publish"**
