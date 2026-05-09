const KEYS = {
  USER: 'plixie_user',
  SESSIONS: 'plixie_sessions',
  COMMUNITY: 'plixie_community_posts',
  SCENES: 'plixie_saved_scenes',
  SOUNDS: 'plixie_saved_sounds',
}

function read(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback }
  catch { return fallback }
}

function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) }
  catch (e) { console.warn('Storage write failed:', e.message) }
}

export const getUser = () => read(KEYS.USER)
export const saveUser = (u) => write(KEYS.USER, u)
export const clearUser = () => localStorage.removeItem(KEYS.USER)

export const getSessions = () => read(KEYS.SESSIONS, [])

export function saveSession(sess) {
  const all = getSessions()
  const idx = all.findIndex(s => s.id === sess.id)
  if (idx >= 0) all[idx] = sess
  else all.unshift(sess)
  write(KEYS.SESSIONS, all)
}

export function deleteSession(id) {
  write(KEYS.SESSIONS, getSessions().filter(s => s.id !== id))
}

export function newId() {
  return `s_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// Community posts (local only — no backend)
export const getCommunityPosts = () => read(KEYS.COMMUNITY, [])

export function saveCommunityPost(post) {
  const all = getCommunityPosts()
  const idx = all.findIndex(p => p.id === post.id)
  if (idx >= 0) all[idx] = post
  else all.unshift(post)
  write(KEYS.COMMUNITY, all)
}

export function deleteCommunityPost(id) {
  write(KEYS.COMMUNITY, getCommunityPosts().filter(p => p.id !== id))
}

// Saved scenes (Labs Scene Builder)
export const getScenes = () => read(KEYS.SCENES, [])

export function saveScene(scene) {
  const all = getScenes()
  const idx = all.findIndex(s => s.id === scene.id)
  if (idx >= 0) all[idx] = scene
  else all.unshift(scene)
  write(KEYS.SCENES, all)
}

export function deleteScene(id) {
  write(KEYS.SCENES, getScenes().filter(s => s.id !== id))
}

// Saved sounds (Sound Lab)
export const getSounds = () => read(KEYS.SOUNDS, [])

export function saveSound(sound) {
  const all = getSounds()
  const idx = all.findIndex(s => s.id === sound.id)
  if (idx >= 0) all[idx] = sound
  else all.unshift(sound)
  write(KEYS.SOUNDS, all)
}

export function deleteSound(id) {
  write(KEYS.SOUNDS, getSounds().filter(s => s.id !== id))
}
