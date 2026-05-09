import { auth, db, isFirebaseConfigured } from './firebase.js'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore'

/**
 * Check if Firebase is properly configured
 */
export function isFirebaseReady() {
  return isFirebaseConfigured && auth && db
}

/**
 * Fallback: Create user in local storage (when Firebase is not configured)
 */
function createLocalUser(email, displayName) {
  const user = {
    uid: `local_${Date.now()}`,
    email: email,
    name: displayName,
  }
  localStorage.setItem('_plixie_local_user', JSON.stringify(user))
  return user
}

/**
 * Fallback: Sign in from local storage (when Firebase is not configured)
 */
function signInLocalUser(email) {
  const user = {
    uid: `local_${Date.now()}`,
    email: email,
    name: email.split('@')[0],
  }
  localStorage.setItem('_plixie_local_user', JSON.stringify(user))
  return user
}

/**
 * Create a new user account with email and password
 */
export async function createAccount(email, password, displayName) {
  try {
    if (!isFirebaseReady()) {
      // Fallback to local storage if Firebase is not configured
      return createLocalUser(email, displayName)
    }

    // Create user in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const user = userCredential.user

    // Store additional user data in Firestore
    await setDoc(doc(db, 'users', user.uid), {
      name: displayName,
      email: email,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })

    // Send email verification — non-blocking; failures don't abort signup.
    sendEmailVerification(user).catch((e) => {
      console.warn('Failed to send verification email:', e.message)
    })

    return {
      uid: user.uid,
      email: user.email,
      name: displayName,
      emailVerified: user.emailVerified,
    }
  } catch (error) {
    throw new Error(formatFirebaseError(error))
  }
}

/**
 * Sign in with email and password
 */
export async function signInUser(email, password) {
  try {
    if (!isFirebaseReady()) {
      // Fallback to local storage if Firebase is not configured
      return signInLocalUser(email)
    }

    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    const user = userCredential.user

    // Get user data from Firestore
    const userDoc = await getDoc(doc(db, 'users', user.uid))
    const userData = userDoc.data() || {}

    return {
      uid: user.uid,
      email: user.email,
      name: userData.name || email.split('@')[0],
      emailVerified: user.emailVerified,
    }
  } catch (error) {
    throw new Error(formatFirebaseError(error))
  }
}

/**
 * Send a password-reset email
 */
export async function requestPasswordReset(email) {
  if (!isFirebaseReady()) {
    throw new Error('Password reset requires Firebase. Configure it in .env.')
  }
  try {
    await sendPasswordResetEmail(auth, email)
  } catch (error) {
    throw new Error(formatFirebaseError(error))
  }
}

/**
 * Re-send the email verification link to the currently signed-in user
 */
export async function resendEmailVerification() {
  if (!isFirebaseReady() || !auth.currentUser) {
    throw new Error('You must be signed in to resend verification.')
  }
  try {
    await sendEmailVerification(auth.currentUser)
  } catch (error) {
    throw new Error(formatFirebaseError(error))
  }
}

/**
 * Sign out the current user
 */
export async function signOutUser() {
  try {
    if (isFirebaseReady()) {
      await signOut(auth)
    }
    localStorage.removeItem('_plixie_local_user')
  } catch (error) {
    throw new Error(formatFirebaseError(error))
  }
}

/**
 * Listen to auth state changes
 */
export function onAuthChange(callback) {
  // Check for local user first
  const localUser = localStorage.getItem('_plixie_local_user')
  if (localUser) {
    try {
      callback(JSON.parse(localUser))
    } catch (e) {
      console.warn('Failed to parse local user:', e)
    }
  }

  if (!isFirebaseReady()) {
    // If Firebase is not configured, just listen to local storage changes
    return () => {}
  }

  // Listen to Firebase auth state
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const userDoc = await getDoc(doc(db, 'users', user.uid))
      const userData = userDoc.data() || {}
      callback({
        uid: user.uid,
        email: user.email,
        name: userData.name || user.email.split('@')[0],
        emailVerified: user.emailVerified,
      })
    } else {
      callback(null)
    }
  })
}

/**
 * Format Firebase errors to user-friendly messages
 */
function formatFirebaseError(error) {
  if (!error) return 'An error occurred'
  
  const errorMap = {
    'auth/email-already-in-use': 'This email is already registered',
    'auth/weak-password': 'Password must be at least 6 characters',
    'auth/invalid-email': 'Invalid email address',
    'auth/user-not-found': 'No account found with this email',
    'auth/wrong-password': 'Incorrect password',
    'auth/too-many-requests': 'Too many failed login attempts. Try again later',
  }
  return errorMap[error.code] || error.message || 'An error occurred'
}
