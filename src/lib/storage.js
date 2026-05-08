const KEYS = { USER: 'plixie_user', SESSIONS: 'plixie_sessions' }

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
