import { SYSTEM_PROMPT } from './systemPrompt.js'
import { BABYLON_PROMPT } from './babylonPrompt.js'
import { BLENDER_PROMPT } from './blenderPrompt.js'
import { HLSL_PROMPT } from './hlslPrompt.js'
import { auth } from './firebase.js'

function promptFor(renderer) {
  if (renderer === 'babylon') return BABYLON_PROMPT
  if (renderer === 'blender') return BLENDER_PROMPT
  if (renderer === 'hlsl')    return HLSL_PROMPT
  return SYSTEM_PROMPT
}

async function getIdToken() {
  const user = auth?.currentUser
  if (!user) throw new Error('Sign in to generate models')
  return user.getIdToken()
}

async function callAnthropic(systemText, messages, onStatus, { maxTokens = 24000 } = {}) {
  onStatus?.('loading')
  const token = await getIdToken()
  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: maxTokens,
      system: [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }],
      messages,
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 320)}`)
  }
  return readAnthropicStream(res, onStatus)
}

async function readAnthropicStream(res, onStatus) {
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
      } catch { /* skip non-JSON keepalives / event lines */ }
    }
  }
  return text
}

export async function generate3DModel(userPrompt, renderer = 'threejs', { onStatus } = {}) {
  const text = await callAnthropic(
    promptFor(renderer),
    [{ role: 'user', content: `Create a 3D model: ${userPrompt}` }],
    onStatus,
  )
  const data = parseJSON(text)
  data.timestamp = Date.now()
  data.renderer = renderer
  data.brain = 'claude'
  return data
}

export async function generate3DFromImage(base64, mimeType, userPrompt, renderer = 'threejs', { onStatus } = {}) {
  const text = await callAnthropic(
    promptFor(renderer),
    [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: userPrompt || 'Create a 3D model inspired by this image.' },
      ],
    }],
    onStatus,
  )
  const data = parseJSON(text)
  data.timestamp = Date.now()
  data.renderer = renderer
  data.brain = 'claude'
  return data
}

// ── JSON extraction (shared shape with geminiClient) ──
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
  console.error('Claude response could not be parsed:\n', text)
  if (/```(?:json)?\s*\{/.test(text || '') && !/```\s*$/.test((text || '').trimEnd())) {
    throw new Error('Response was cut off before completing the model. Try a simpler prompt or increase max_tokens.')
  }
  const preview = (text || '').trim().slice(0, 240).replace(/\s+/g, ' ')
  throw new Error(`Could not parse model data from response. Got: "${preview || '(empty)'}"`)
}
