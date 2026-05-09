import { createContext, useContext, useState, useCallback } from 'react'
import * as S from '../lib/storage.js'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export function AppProvider({ children }) {
  const [user, setUser]         = useState(() => S.getUser())
  const [mode, setMode]         = useState('model')
  const [renderer, setRenderer] = useState('threejs')
  const [shaderLang, setShaderLang] = useState('glsl')
  const [sessions, setSessions] = useState(() => S.getSessions())
  const [activeId, setActiveId] = useState({ model: null, image: null, code: null })
  const [communityPosts, setCommunityPosts] = useState(() => S.getCommunityPosts())
  const [savedScenes, setSavedScenes] = useState(() => S.getScenes())

  function signIn(name, email) {
    const u = { name, email, createdAt: Date.now() }
    S.saveUser(u)
    setUser(u)
    setSessions(S.getSessions())
  }

  function signOut() {
    S.clearUser()
    setUser(null)
    setSessions([])
    setActiveId({ model: null, image: null, code: null })
  }

  const createSession = useCallback((m) => {
    const sess = {
      id: S.newId(), mode: m, title: 'New conversation',
      messages: [], modelData: null, imageData: null,
      createdAt: Date.now(), updatedAt: Date.now(),
    }
    S.saveSession(sess)
    setSessions(S.getSessions())
    setActiveId(p => ({ ...p, [m]: sess.id }))
    return sess
  }, [])

  const updateSession = useCallback((id, patch) => {
    const all = S.getSessions()
    const sess = { ...(all.find(s => s.id === id) || {}), ...patch, updatedAt: Date.now() }
    S.saveSession(sess)
    setSessions(S.getSessions())
  }, [])

  const removeSession = useCallback((id) => {
    S.deleteSession(id)
    setSessions(S.getSessions())
    setActiveId(p => {
      const n = { ...p }
      for (const k of Object.keys(n)) if (n[k] === id) n[k] = null
      return n
    })
  }, [])

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
    S.saveCommunityPost(full)
    setCommunityPosts(S.getCommunityPosts())
    return full
  }, [user])

  const unpublishCommunity = useCallback((id) => {
    S.deleteCommunityPost(id)
    setCommunityPosts(S.getCommunityPosts())
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
    S.saveScene(full)
    setSavedScenes(S.getScenes())
    return full
  }, [])

  const removeScene = useCallback((id) => {
    S.deleteScene(id)
    setSavedScenes(S.getScenes())
  }, [])

  const activeSession = {
    model: sessions.find(s => s.id === activeId.model) || null,
    image: sessions.find(s => s.id === activeId.image) || null,
    code:  sessions.find(s => s.id === activeId.code)  || null,
  }

  return (
    <Ctx.Provider value={{
      user, signIn, signOut,
      mode, setMode,
      renderer, setRenderer,
      shaderLang, setShaderLang,
      sessions, activeSession, activeId,
      createSession, updateSession, removeSession, loadSession,
      communityPosts, publishToCommunity, unpublishCommunity,
      savedScenes, persistScene, removeScene,
    }}>
      {children}
    </Ctx.Provider>
  )
}
