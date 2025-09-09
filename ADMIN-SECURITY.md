# Admin Security Setup

## Overview
The admin panel has been secured with client-side authentication to prevent unauthorized access. While this provides basic protection for a static site, it's recommended to implement server-side authentication for production use.

## Admin Access

### Default Admin Credentials
- **Username**: `admin`
- **Password**: `baluch2024!`

### Additional Admin User
- **Username**: `moderator`
- **Password**: `memorial@admin`

### Accessing Admin Panel
1. Navigate to: `https://baluchmartyrs.site/admin-login.html`
2. Enter your credentials
3. You'll be redirected to the admin panel upon successful login

### Direct Admin Panel Access
If you try to access `admin.html` directly, you'll be automatically redirected to the login page.

## Security Features

### Session Management
- **Session Duration**: 4 hours
- **Session Extension**: Automatic extension on activity
- **Session Warning**: Warning at 15 minutes remaining
- **Dual Storage**: Both localStorage and sessionStorage for tamper detection

### Authentication Checks
- All admin functions require authentication validation
- Sessions expire automatically after 4 hours
- Invalid or expired sessions redirect to login
- Admin actions are logged with usernames

### Basic Client-Side Protection
- Disabled developer tools shortcuts (F12, Ctrl+Shift+I)
- Disabled right-click on sensitive areas
- Frame-busting to prevent embedding
- Session warnings for security

### Firebase Security
- Enhanced Firestore rules for collection access
- Separation of public and admin-only collections
- Basic validation on admin operations

## Admin Functions

### Authentication Required Functions
- Approve martyr submissions
- Reject martyr submissions
- Delete approved martyrs
- Clear all pending submissions
- Clear all approved martyrs
- Export data
- Import data
- Load approved martyrs
- Refresh data

## Changing Admin Credentials

### Method 1: Edit Login Page
1. Open `admin-login.html`
2. Locate the `ADMIN_CREDENTIALS` object (around line 147)
3. Modify usernames/passwords as needed
4. Save and commit changes

### Method 2: Add New Admin Users
Add new entries to the credentials object:
```javascript
const ADMIN_CREDENTIALS = {
    'admin': 'baluch2024!',
    'moderator': 'memorial@admin',
    'newadmin': 'your_new_password'
};
```

## Security Recommendations for Production

### Immediate Improvements
1. **Change default passwords** to strong, unique passwords
2. **Use environment variables** for credentials (not hardcoded)
3. **Enable HTTPS** for all admin pages (already done via GitHub Pages)
4. **Regular credential rotation** (monthly recommended)

### Advanced Security (Future)
1. **Server-side authentication** with proper user management
2. **Two-factor authentication (2FA)** for admin access
3. **IP whitelisting** for admin access
4. **Audit logging** of all admin actions
5. **Firebase Authentication** with proper roles and permissions
6. **Rate limiting** for login attempts
7. **Session invalidation** on suspicious activity

## Firebase Security Rules

The Firestore security rules have been updated to:
- Allow public read access to approved martyrs only
- Restrict admin operations to authenticated requests
- Allow public submissions to pending collection
- Block access to unauthorized collections

## Troubleshooting

### Login Issues
1. **Clear browser cache** and localStorage
2. **Check credentials** are typed correctly (case-sensitive)
3. **Verify session storage** is enabled in browser
4. **Check browser console** for authentication errors

### Session Issues
1. **Extend session** when prompted
2. **Logout and login again** if session seems corrupted
3. **Check browser time** is synchronized
4. **Clear all localStorage** if authentication breaks

### Admin Panel Access
1. **Ensure Firebase is connected** (check console)
2. **Refresh the page** if buttons don't work
3. **Check network connectivity** for Firebase operations
4. **Verify admin authentication** is valid

## Security Considerations

### Current Limitations
- **Client-side only**: Authentication can be bypassed by determined users
- **No true encryption**: Credentials are visible in source code
- **No audit trail**: Limited logging of admin actions
- **Session storage**: Can be manipulated in browser

### Protection Level
- **Basic deterrent**: Prevents casual unauthorized access
- **Good for demo/development**: Suitable for current usage level
- **Not enterprise-ready**: Requires upgrade for high-security needs

## Deployment Notes

When deploying to production:
1. Change all default credentials
2. Consider implementing server-side authentication
3. Monitor admin access patterns
4. Regular security reviews
5. Keep credentials secure and private

## Contact

For security concerns or credential issues, contact the site administrator.

---
*Last updated: [Current Date]*
*Security level: Basic client-side protection*
