import { SYSTEM_PROMPT } from './systemPrompt.js'
import { BABYLON_PROMPT } from './babylonPrompt.js'
import { BLENDER_PROMPT } from './blenderPrompt.js'
import { HLSL_PROMPT } from './hlslPrompt.js'

const MODELS = {
  flash: 'gemini-2.5-flash',
  pro:   'gemini-2.5-pro',
}
function endpointFor(variant) {
  const id = MODELS[variant] || MODELS.flash
  return `https://generativelanguage.googleapis.com/v1beta/models/${id}:streamGenerateContent`
}

function key() {
  const k = import.meta.env.VITE_GEMINI_API_KEY
  if (!k) throw new Error('VITE_GEMINI_API_KEY not set in .env')
  return k
}

function promptFor(renderer) {
  if (renderer === 'babylon') return BABYLON_PROMPT
  if (renderer === 'blender') return BLENDER_PROMPT
  if (renderer === 'hlsl')    return HLSL_PROMPT
  return SYSTEM_PROMPT
}

async function callGemini(systemText, userParts, onStatus, variant = 'flash') {
  onStatus?.('loading')
  const url = `${endpointFor(variant)}?alt=sse&key=${key()}`
  const body = {
    systemInstruction: { parts: [{ text: systemText }] },
    contents: [{ role: 'user', parts: userParts }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 60000,
      // Gemini 2.5 uses "thinking" by default which consumes the output budget.
      // For structured JSON generation we want all tokens going to actual output.
      thinkingConfig: { thinkingBudget: 0 },
    },
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 240)}`)

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
        const chunk = obj?.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('') || ''
        if (chunk) {
          if (firstChunk) { onStatus?.('writing'); firstChunk = false }
          text += chunk
        }
      } catch { /* skip non-JSON keepalives */ }
    }
  }
  return text
}

export async function generate3DModel(userPrompt, renderer = 'threejs', { onStatus, variant = 'flash' } = {}) {
  const text = await callGemini(promptFor(renderer), [{ text: `Create a 3D model: ${userPrompt}` }], onStatus, variant)
  const data = parseJSON(text)
  data.timestamp = Date.now()
  data.renderer = renderer
  data.brain = `gemini-${variant}`
  return data
}

export async function generate3DFromImage(base64, mimeType, userPrompt, renderer = 'threejs', { onStatus, variant = 'flash' } = {}) {
  const parts = [
    { inlineData: { mimeType, data: base64 } },
    { text: userPrompt || 'Create a 3D model inspired by this image.' },
  ]
  const text = await callGemini(promptFor(renderer), parts, onStatus, variant)
  const data = parseJSON(text)
  data.timestamp = Date.now()
  data.renderer = renderer
  data.brain = `gemini-${variant}`
  return data
}

// JSON extraction (mirrors claudeClient)
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
  console.error('Gemini response could not be parsed:\n', text)
  if (/```(?:json)?\s*\{/.test(text || '') && !/```\s*$/.test((text || '').trimEnd())) {
    throw new Error('Response was cut off before completing the model. Try a simpler prompt.')
  }
  const preview = (text || '').trim().slice(0, 240).replace(/\s+/g, ' ')
  throw new Error(`Could not parse model data from response. Got: "${preview || '(empty)'}"`)
}
