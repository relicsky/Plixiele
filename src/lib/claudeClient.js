import Anthropic from '@anthropic-ai/sdk'
import { SYSTEM_PROMPT } from './systemPrompt.js'
import { BABYLON_PROMPT } from './babylonPrompt.js'
import { BLENDER_PROMPT } from './blenderPrompt.js'
import { HLSL_PROMPT } from './hlslPrompt.js'

let _client = null

function client() {
  if (_client) return _client
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!key) throw new Error('VITE_ANTHROPIC_API_KEY not set in .env')
  // Route through Vite dev proxy to avoid CORS
  const baseURL = `${window.location.origin}/anthropic-api`
  _client = new Anthropic({ apiKey: key, baseURL, dangerouslyAllowBrowser: true })
  return _client
}

// Pick system prompt by renderer
function promptFor(renderer) {
  if (renderer === 'babylon') return BABYLON_PROMPT
  if (renderer === 'blender') return BLENDER_PROMPT
  if (renderer === 'hlsl')    return HLSL_PROMPT
  return SYSTEM_PROMPT
}

export async function generate3DModel(userPrompt, renderer = 'threejs', { onStatus } = {}) {
  return _stream(
    [{ role: 'user', content: `Create a 3D model: ${userPrompt}` }],
    renderer,
    onStatus,
  )
}

export async function generate3DFromImage(base64, mimeType, userPrompt, renderer = 'threejs', { onStatus } = {}) {
  return _stream(
    [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
        { type: 'text', text: userPrompt || 'Create a 3D model inspired by this image.' },
      ],
    }],
    renderer,
    onStatus,
  )
}

async function _stream(messages, renderer, onStatus) {
  onStatus?.('loading')
  let text = ''
  try {
    const stream = client().messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 8000,
      system: [{ type: 'text', text: promptFor(renderer), cache_control: { type: 'ephemeral' } }],
      messages,
    })
    for await (const ev of stream) {
      if (ev.type === 'content_block_start' && ev.content_block.type === 'text') onStatus?.('writing')
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') text += ev.delta.text
    }
  } catch (e) {
    // Attach the raw message for better debugging
    throw new Error(e.message || String(e))
  }
  const data = parseJSON(text)
  data.timestamp = Date.now()
  data.renderer = renderer
  return data
}

// Escape literal newlines/tabs that appear inside JSON string values
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

// Extract the outermost {...} from a string, respecting strings and escape sequences
function extractJSON(s) {
  let start = -1, depth = 0, inStr = false, esc = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (esc) { esc = false; continue }
    if (c === '\\' && inStr) { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') { if (start === -1) start = i; depth++ }
    else if (c === '}') {
      if (--depth === 0 && start !== -1) return s.slice(start, i + 1)
    }
  }
  return null
}

function tryParse(s) {
  try { return JSON.parse(s) } catch {
    try { return JSON.parse(sanitizeJSON(s)) } catch { return null }
  }
}

function parseJSON(text) {
  // Try every code block in order
  for (const [, content] of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    const r = tryParse(content.trim()); if (r) return r
  }
  // Robust brace extraction
  const raw = extractJSON(text)
  if (raw) { const r = tryParse(raw); if (r) return r }
  throw new Error('Could not parse model data from response. Try again.')
}
