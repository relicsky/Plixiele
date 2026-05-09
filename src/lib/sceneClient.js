import { SCENE_PROMPT, TERRAIN_BLOCK_ON, TERRAIN_BLOCK_OFF } from './scenePrompt.js'
import { auth } from './firebase.js'

async function getIdToken() {
  const user = auth?.currentUser
  if (!user) throw new Error('Sign in to generate scenes')
  return user.getIdToken()
}

function libraryText(library) {
  return library.map(m => `- ${m.id} — ${m.description || m.title || '(no description)'}`).join('\n')
}

export async function generateScene(userPrompt, library, { onStatus, terrain = false } = {}) {
  onStatus?.('loading')
  const system = SCENE_PROMPT
    .replace('{{LIBRARY}}', libraryText(library))
    .replace('{{TERRAIN_BLOCK}}', terrain ? TERRAIN_BLOCK_ON : TERRAIN_BLOCK_OFF)

  const token = await getIdToken()
  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 8000,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Build a scene: ${userPrompt}` }],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Scene gen ${res.status}: ${err.slice(0, 320)}`)
  }

  let text = ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let firstChunk = true
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      try {
        const obj = JSON.parse(payload)
        if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta') {
          if (firstChunk) { onStatus?.('writing'); firstChunk = false }
          text += obj.delta.text
        }
      } catch { /* skip */ }
    }
  }
  return parseJSON(text)
}

function sanitizeJSON(s) {
  let out = '', inStr = false, esc = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (esc) { esc = false; out += c; continue }
    if (c === '\\' && inStr) { esc = true; out += c; continue }
    if (c === '"') { inStr = !inStr; out += c; continue }
    if (inStr) {
      if (c === '\n') { out += '\\n'; continue }
      if (c === '\r') { out += '\\r'; continue }
      if (c === '\t') { out += '\\t'; continue }
    }
    out += c
  }
  return out
}

function extractJSON(s) {
  let start = -1, depth = 0, inStr = false, esc = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (esc) { esc = false; continue }
    if (c === '\\' && inStr) { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') { if (start === -1) start = i; depth++ }
    else if (c === '}') { if (--depth === 0 && start !== -1) return s.slice(start, i + 1) }
  }
  return null
}

function tryParse(s) {
  try { return JSON.parse(s) } catch {
    try { return JSON.parse(sanitizeJSON(s)) } catch { return null }
  }
}

function parseJSON(text) {
  for (const [, content] of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    const r = tryParse(content.trim()); if (r) return r
  }
  const raw = extractJSON(text)
  if (raw) { const r = tryParse(raw); if (r) return r }
  throw new Error('Could not parse scene data from response. Try again.')
}
