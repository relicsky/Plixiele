import { initializeApp } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
}

// Check if Firebase config is properly set
const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']
const missing = requiredKeys.filter(key => !firebaseConfig[key])

const isFirebaseConfigured = missing.length === 0

let app = null
let auth = null
let db = null
let storage = null

if (isFirebaseConfigured) {
  try {
    // Initialize Firebase
    app = initializeApp(firebaseConfig)

    // Initialize Firebase Authentication
    auth = getAuth(app)

    // Set persistence to local storage
    setPersistence(auth, browserLocalPersistence).catch(err => {
      console.warn('Failed to set auth persistence:', err)
    })

    // Initialize Firestore Database
    db = getFirestore(app)

    // Initialize Cloud Storage
    storage = getStorage(app)

    console.info('✅ Firebase initialized successfully')
  } catch (error) {
    console.error('❌ Firebase initialization failed:', error.message)
    app = null
  }
} else {
  console.warn(`⚠️ Firebase not configured. Missing: ${missing.join(', ')}.`)
  console.info('💡 To enable Firebase, create a .env file with Firebase credentials. See FIREBASE_SETUP.md for instructions.')
}

export { auth, db, storage, isFirebaseConfigured }
export default app
