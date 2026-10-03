# 🔥 Firebase Setup Checklist

## ✅ What You Get
- **100% FREE** database (no credit card needed)
- **Permanent storage** - data never disappears
- **Cross-device admin** - manage from any computer
- **Automatic backups** by Google
- **Real-time updates** - admin panel updates instantly

## 📋 Quick Setup (5 minutes)

### 1. Create Firebase Project
- Go to [console.firebase.google.com](https://console.firebase.google.com)
- Click "Create a project" → Name it `baluch-martyrs-memorial`
- Skip Google Analytics → Click "Create project"

### 2. Enable Database
- Click "Firestore Database" in left menu
- Click "Create database" → Choose "Start in test mode"
- Select your location → Click "Done"

### 3. Get Service Account Key
- Click gear icon → "Project settings" → "Service accounts" tab
- Click "Generate new private key" → Download JSON file
- **Keep this file safe!** (You'll need it for Netlify)

### 4. Deploy to Netlify
- Drag your entire project folder to Netlify
- Go to Site settings → Environment variables
- Add: `FIREBASE_SERVICE_ACCOUNT` = [paste entire JSON content]

### 5. Test It
- Submit a profile via your website
- Check admin panel at `baluchmartyrs.com/admin`
- Approve/reject submissions

## 🔒 Security Rules
In Firebase console → Firestore → Rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /martyrs/{martyrId} {
      allow read: if resource.data.status == 'approved';
      allow create: if request.auth == null;
    }
  }
}
```

## 🎯 What Happens Next
1. **Submissions** → Saved to Firebase (pending status)
2. **Admin reviews** → Via `/admin.html` 
3. **Approval** → Moves to approved, appears on site
4. **Data persists** → Never disappears, accessible from anywhere

## 💰 Free Tier Limits (More than enough!)
- **1 GB storage** (thousands of profiles with photos)
- **50,000 reads/day** (hundreds of daily visitors)
- **20,000 writes/day** (many daily submissions)
- **No time limit** - free forever

Ready to set up Firebase? Follow the steps above! 🚀
