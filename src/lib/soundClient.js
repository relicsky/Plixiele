import { SOUND_PROMPT } from './soundPrompt.js'
import { auth } from './firebase.js'

async function getIdToken() {
  const user = auth?.currentUser
  if (!user) throw new Error('Sign in to generate sounds')
  return user.getIdToken()
}

export async function generateSound(userPrompt, { onStatus, brain = 'claude', variant = 'pro' } = {}) {
  onStatus?.('loading')
  const token = await getIdToken()

  if (brain === 'gemini') return callGemini(userPrompt, token, onStatus, variant)
  return callClaude(userPrompt, token, onStatus, variant)
}

async function callClaude(userPrompt, token, onStatus, variant) {
  const model = variant === 'premium' ? 'claude-opus-4-7' : 'claude-sonnet-4-6'
  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      _intent: 'sound',
      model,
      max_tokens: 4000,
      system: [{ type: 'text', text: SOUND_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: `Make a sound: ${userPrompt}` }],
    }),
  })
  if (!res.ok) throw new Error(`Sound gen ${res.status}: ${(await res.text()).slice(0, 320)}`)
  return parseStreamed(res, onStatus, parseAnthropicChunk)
}

async function callGemini(userPrompt, token, onStatus, variant) {
  const body = {
    _intent: 'sound',
    _variant: variant,
    systemInstruction: { parts: [{ text: SOUND_PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: `Make a sound: ${userPrompt}` }] }],
    generationConfig: { temperature: 0.8, maxOutputTokens: 4000, thinkingConfig: { thinkingBudget: 0 } },
  }
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Sound gen ${res.status}: ${(await res.text()).slice(0, 320)}`)
  return parseStreamed(res, onStatus, parseGeminiChunk)
}

async function parseStreamed(res, onStatus, chunkParser) {
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
        const piece = chunkParser(JSON.parse(payload))
        if (piece) {
          if (firstChunk) { onStatus?.('writing'); firstChunk = false }
          text += piece
        }
      } catch { /* skip */ }
    }
  }
  return parseJSON(text)
}

function parseAnthropicChunk(obj) {
  if (obj.type === 'content_block_delta' && obj.delta?.type === 'text_delta') return obj.delta.text
  return ''
}

function parseGeminiChunk(obj) {
  return obj?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || ''
}

// JSON extraction (matches the other clients)
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
  console.error('Sound response could not be parsed:\n', text)
  throw new Error('Could not parse sound from response. Try again.')
}

// ── Web Audio playback + WAV export ──

export function playSound(soundData) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)()
  const out = ctx.destination
  try {
    const fn = new Function('ctx', 'out', soundData.code)
    fn(ctx, out)
  } catch (e) {
    console.error('Sound code threw:', e)
    throw e
  }
  // Stop the context shortly after the requested duration.
  const stopAt = (soundData.duration || 6) + 1
  setTimeout(() => { try { ctx.close() } catch {} }, stopAt * 1000)
  return ctx
}

export async function renderToWavBlob(soundData) {
  const dur = Math.max(0.5, Math.min(30, Number(soundData.duration) || 6))
  const sampleRate = 44100
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sampleRate), sampleRate)
  const out = ctx.destination
  try {
    const fn = new Function('ctx', 'out', soundData.code)
    fn(ctx, out)
  } catch (e) {
    console.error('Sound code threw during render:', e)
    throw e
  }
  const buf = await ctx.startRendering()
  return audioBufferToWav(buf)
}

function audioBufferToWav(audioBuffer) {
  const numCh = audioBuffer.numberOfChannels
  const sampleRate = audioBuffer.sampleRate
  const bitDepth = 16
  const length = audioBuffer.length * numCh * (bitDepth / 8)
  const arr = new ArrayBuffer(44 + length)
  const view = new DataView(arr)

  function writeStr(off, s) {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }

  writeStr(0, 'RIFF')
  view.setUint32(4, 36 + length, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numCh, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numCh * (bitDepth / 8), true)
  view.setUint16(32, numCh * (bitDepth / 8), true)
  view.setUint16(34, bitDepth, true)
  writeStr(36, 'data')
  view.setUint32(40, length, true)

  const channels = []
  for (let c = 0; c < numCh; c++) channels.push(audioBuffer.getChannelData(c))

  let off = 44
  for (let i = 0; i < audioBuffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      let s = Math.max(-1, Math.min(1, channels[c][i]))
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      off += 2
    }
  }
  return new Blob([arr], { type: 'audio/wav' })
}
