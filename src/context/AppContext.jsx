import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react'
import * as S from '../lib/storage.js'
import { signOutUser, onAuthChange, isFirebaseReady } from '../lib/firebaseAuth.js'
import * as F from '../lib/firestoreStore.js'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const [user, setUser]         = useState(null)
  const [mode, setMode]         = useState('model')
  const [renderer, setRenderer] = useState('threejs')
  const [shaderLang, setShaderLang] = useState('glsl')
  const [aiBrain, setAiBrainState] = useState(() => localStorage.getItem('plixie_brain') || 'claude')
  const [plan, setPlanState] = useState(() => localStorage.getItem('plixie_plan') || 'free')
  const setAiBrain = (b) => { localStorage.setItem('plixie_brain', b); setAiBrainState(b) }
  const setPlan    = (p) => { localStorage.setItem('plixie_plan', p);   setPlanState(p) }
  const [sessions, setSessions] = useState(() => S.getSessions())
  const [activeId, setActiveId] = useState({ model: null, image: null, code: null })
  const [communityPosts, setCommunityPosts] = useState(() => S.getCommunityPosts())
  const [savedScenes, setSavedScenes] = useState(() => S.getScenes())

  const cloudUid = useMemo(
    () => (isFirebaseReady() && user?.uid && !user.uid.startsWith('local_')) ? user.uid : null,
    [user],
  )

  // Listen to Firebase auth state changes
  useEffect(() => {
    const unsubscribe = onAuthChange((firebaseUser) => {
      setUser(firebaseUser)
      if (!firebaseUser) {
        setSessions(S.getSessions())
        setSavedScenes(S.getScenes())
      }
    })
    return unsubscribe
  }, [])

  // Subscribe to Firestore for the signed-in cloud user.
  useEffect(() => {
    if (!cloudUid) {
      setSessions(S.getSessions())
      setSavedScenes(S.getScenes())
      return
    }
    F.migrateLocalToCloud(cloudUid, {
      sessions: S.getSessions(),
      scenes: S.getScenes(),
      community: S.getCommunityPosts(),
    }, user)
    const unsubA = F.watchUserCollection(cloudUid, 'sessions', setSessions)
    const unsubB = F.watchUserCollection(cloudUid, 'scenes', setSavedScenes)
    return () => { unsubA(); unsubB() }
  }, [cloudUid, user])

  // Community feed — Firestore when available, localStorage otherwise.
  useEffect(() => {
    if (!isFirebaseReady()) {
      setCommunityPosts(S.getCommunityPosts())
      return
    }
    return F.watchCommunity(setCommunityPosts)
  }, [])

  async function handleSignOut() {
    try {
      await signOutUser()
      S.clearUser()
      setUser(null)
      setSessions([])
      setActiveId({ model: null, image: null, code: null })
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  const createSession = useCallback((m) => {
    const sess = {
      id: S.newId(), mode: m, title: 'New conversation',
      messages: [], modelData: null, imageData: null,
      createdAt: Date.now(), updatedAt: Date.now(),
    }
    if (cloudUid) {
      F.saveUserDoc(cloudUid, 'sessions', sess)
      setSessions(prev => [sess, ...prev.filter(s => s.id !== sess.id)])
    } else {
      S.saveSession(sess)
      setSessions(S.getSessions())
    }
    setActiveId(p => ({ ...p, [m]: sess.id }))
    return sess
  }, [cloudUid])

  const updateSession = useCallback((id, patch) => {
    if (cloudUid) {
      const existing = sessions.find(s => s.id === id) || {}
      const sess = { ...existing, ...patch, id, updatedAt: Date.now() }
      F.saveUserDoc(cloudUid, 'sessions', sess)
      setSessions(prev => prev.map(s => s.id === id ? sess : s))
    } else {
      const all = S.getSessions()
      const sess = { ...(all.find(s => s.id === id) || {}), ...patch, updatedAt: Date.now() }
      S.saveSession(sess)
      setSessions(S.getSessions())
    }
  }, [cloudUid, sessions])

  const removeSession = useCallback((id) => {
    if (cloudUid) {
      F.deleteUserDoc(cloudUid, 'sessions', id)
      setSessions(prev => prev.filter(s => s.id !== id))
    } else {
      S.deleteSession(id)
      setSessions(S.getSessions())
    }
    setActiveId(p => {
      const n = { ...p }
      for (const k of Object.keys(n)) if (n[k] === id) n[k] = null
      return n
    })
  }, [cloudUid])

  const loadSession = useCallback((sess) => {
    setMode(sess.mode)
    setActiveId(p => ({ ...p, [sess.mode]: sess.id }))
  }, [])

  const publishToCommunity = useCallback((post) => {
    const full = {
      id: post.id || S.newId(),
      title: post.title || 'Untitled',
      tags: post.tags || [],
      thumb: post.thumb || ['#1a0a4a', '#7cf'],
      modelData: post.modelData,
      author: post.author || user?.name || 'You',
      createdAt: post.createdAt || Date.now(),
    }
    if (isFirebaseReady()) {
      F.publishCommunity(full, user)
    } else {
      S.saveCommunityPost(full)
      setCommunityPosts(S.getCommunityPosts())
    }
    return full
  }, [user])

  const unpublishCommunity = useCallback((id) => {
    if (isFirebaseReady()) {
      F.unpublishCommunity(id)
    } else {
      S.deleteCommunityPost(id)
      setCommunityPosts(S.getCommunityPosts())
    }
  }, [])

  const persistScene = useCallback((scene) => {
    const full = {
      id: scene.id || S.newId(),
      title: scene.title || 'Untitled scene',
      items: scene.items || [],
      background: scene.background || '#04040e',
      prompt: scene.prompt || '',
      createdAt: scene.createdAt || Date.now(),
      updatedAt: Date.now(),
    }
    if (cloudUid) {
      F.saveUserDoc(cloudUid, 'scenes', full)
      setSavedScenes(prev => {
        const idx = prev.findIndex(s => s.id === full.id)
        if (idx >= 0) { const next = [...prev]; next[idx] = full; return next }
        return [full, ...prev]
      })
    } else {
      S.saveScene(full)
      setSavedScenes(S.getScenes())
    }
    return full
  }, [cloudUid])

  const removeScene = useCallback((id) => {
    if (cloudUid) {
      F.deleteUserDoc(cloudUid, 'scenes', id)
      setSavedScenes(prev => prev.filter(s => s.id !== id))
    } else {
      S.deleteScene(id)
      setSavedScenes(S.getScenes())
    }
  }, [cloudUid])

  const activeSession = {
    model: sessions.find(s => s.id === activeId.model) || null,
    image: sessions.find(s => s.id === activeId.image) || null,
    code:  sessions.find(s => s.id === activeId.code)  || null,
  }

  return (
    <Ctx.Provider value={{
      user, setUser, signOut: handleSignOut,
      mode, setMode,
      renderer, setRenderer,
      shaderLang, setShaderLang,
      aiBrain, setAiBrain,
      plan, setPlan,
      sessions, activeSession, activeId,
      createSession, updateSession, removeSession, loadSession,
      communityPosts, publishToCommunity, unpublishCommunity,
      savedScenes, persistScene, removeScene,
    }}>
      {children}
    </Ctx.Provider>
  )
}
