# Firebase Setup Guide for Plixie

## 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"** or **"Add project"**
3. Enter project name: `plixie` (or your choice)
4. Disable **Google Analytics** (optional, for simpler setup)
5. Click **"Create project"** and wait for initialization

## 2. Enable Authentication

1. In Firebase Console, go to **Build** → **Authentication**
2. Click **"Get started"**
3. Click on **Email/Password** provider
4. Enable **Email/Password** and **Password-less sign-in** (optional)
5. Click **"Save"**

## 3. Create Firestore Database

1. Go to **Build** → **Firestore Database**
2. Click **"Create database"**
3. Select region (closest to your location)
4. Choose **"Start in test mode"** (for development)
5. Click **"Create"**

> **Note:** For production, update Firestore rules to secure your database:
> ```javascript
> rules_version = '2';
> service cloud.firestore {
>   match /databases/{database}/documents {
>     match /users/{userId} {
>       allow read, write: if request.auth.uid == userId;
>     }
>   }
> }
> ```

## 4. Get Firebase Configuration

1. In Firebase Console, click ⚙️ **Project Settings** (top left)
2. Scroll to **Your apps** section
3. Click **Web** icon (</>) if not already added
4. Register app with name `plixie-web`
5. Copy the Firebase config object

## 5. Set Environment Variables

1. Create or edit `.env` file in the project root:

```bash
VITE_ANTHROPIC_API_KEY=your_api_key_here

# Firebase Configuration
VITE_FIREBASE_API_KEY=<your_apiKey>
VITE_FIREBASE_AUTH_DOMAIN=<your_authDomain>
VITE_FIREBASE_PROJECT_ID=<your_projectId>
VITE_FIREBASE_STORAGE_BUCKET=<your_storageBucket>
VITE_FIREBASE_MESSAGING_SENDER_ID=<your_messagingSenderId>
VITE_FIREBASE_APP_ID=<your_appId>
```

Replace values from your Firebase config (from step 4).

## 6. Install Firebase SDK

```bash
npm install firebase
```

## 7. Start Development Server

```bash
npm run dev
```

The app will now use Firebase for authentication and data storage!

## Features Enabled

✅ **User Authentication**
- Email/Password sign-up and sign-in
- Secure password storage with Firebase Auth
- Persistent login sessions

✅ **Cloud Database**
- User profiles stored in Firestore
- All user data synced to Firebase
- Real-time database capabilities

## Troubleshooting

### "Firebase config is missing" warning
- Ensure all environment variables are set correctly
- Check `.env` file exists and has all required keys
- Restart dev server after updating `.env`

### "Authentication failed" error
- Verify Firebase project has Authentication enabled
- Check email/password are valid
- Review Firestore rules if database queries fail

### Sign-out not working
- Ensure Firestore rules allow writing user documents
- Check browser console for errors
- Try clearing browser storage and refreshing

## Next Steps

1. **Enable Firestore for Sessions**: Migrate session storage to Firestore for cross-device sync
2. **Enable Cloud Storage**: Store generated 3D models in Firebase Storage
3. **Add Email Verification**: Require users to verify email before using app
4. **Set up Backups**: Configure Cloud Firestore backups
5. **Monitor Usage**: Set up Firebase Analytics and monitoring
