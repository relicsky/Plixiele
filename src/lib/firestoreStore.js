import { db } from './firebase.js'
import { isFirebaseReady } from './firebaseAuth.js'
import {
  collection, doc, onSnapshot, setDoc, deleteDoc,
  query, orderBy, getDocs, limit,
} from 'firebase/firestore'

const cloudReady = () => isFirebaseReady() && !!db
const isFirebaseUid = (uid) => !!uid && !uid.startsWith('local_')

function genId(prefix = 'd') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

// ── Per-user collections (sessions, scenes) ──

export function watchUserCollection(uid, name, callback) {
  if (!cloudReady() || !isFirebaseUid(uid)) return () => {}
  const q = query(collection(db, 'users', uid, name), orderBy('updatedAt', 'desc'))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }, (err) => {
    console.warn(`Firestore watch ${name} failed:`, err.message)
  })
}

export async function saveUserDoc(uid, name, item) {
  if (!cloudReady() || !isFirebaseUid(uid)) return null
  const id = item.id || genId(name.slice(0, 1))
  const payload = { ...item, id, updatedAt: Date.now() }
  if (!payload.createdAt) payload.createdAt = Date.now()
  await setDoc(doc(db, 'users', uid, name, id), payload, { merge: true })
  return id
}

export async function deleteUserDoc(uid, name, id) {
  if (!cloudReady() || !isFirebaseUid(uid)) return
  await deleteDoc(doc(db, 'users', uid, name, id))
}

// ── Shared community feed ──

export function watchCommunity(callback, max = 200) {
  if (!cloudReady()) return () => {}
  const q = query(collection(db, 'community'), orderBy('createdAt', 'desc'), limit(max))
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() })))
  }, (err) => {
    console.warn('Firestore watch community failed:', err.message)
  })
}

export async function publishCommunity(post, user) {
  if (!cloudReady()) return null
  const id = post.id || genId('cp')
  await setDoc(doc(db, 'community', id), {
    ...post,
    id,
    authorUid: user?.uid || null,
    authorName: user?.name || user?.email || 'Anon',
    createdAt: post.createdAt || Date.now(),
  }, { merge: true })
  return id
}

export async function unpublishCommunity(id) {
  if (!cloudReady()) return
  await deleteDoc(doc(db, 'community', id))
}

// ── One-time migration of localStorage → Firestore ──

const MIG_FLAG = 'plixie_firestore_migrated'

export async function migrateLocalToCloud(uid, local, currentUser) {
  if (!cloudReady() || !isFirebaseUid(uid)) return
  const flag = `${MIG_FLAG}_${uid}`
  if (localStorage.getItem(flag)) return
  try {
    const tasks = []
    for (const sess of local.sessions || []) {
      tasks.push(saveUserDoc(uid, 'sessions', sess))
    }
    for (const scene of local.scenes || []) {
      tasks.push(saveUserDoc(uid, 'scenes', scene))
    }
    for (const sound of local.sounds || []) {
      tasks.push(saveUserDoc(uid, 'sounds', sound))
    }
    for (const model of local.models || []) {
      tasks.push(saveUserDoc(uid, 'models', model))
    }
    // Only push community posts if the cloud feed is empty for this user.
    // (Avoid spamming the global feed with duplicates on every device.)
    const existing = await getDocs(query(collection(db, 'community'), limit(1)))
    if (existing.empty) {
      for (const post of local.community || []) {
        tasks.push(publishCommunity(post, currentUser))
      }
    }
    await Promise.all(tasks)
    localStorage.setItem(flag, String(Date.now()))
  } catch (err) {
    console.warn('localStorage → Firestore migration failed:', err.message)
  }
}
