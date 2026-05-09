import Anthropic from '@anthropic-ai/sdk'
import { SCENE_PROMPT } from './scenePrompt.js'

let _client = null
function client() {
  if (_client) return _client
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!key) throw new Error('VITE_ANTHROPIC_API_KEY not set in .env')
  const baseURL = `${window.location.origin}/anthropic-api`
  _client = new Anthropic({ apiKey: key, baseURL, dangerouslyAllowBrowser: true })
  return _client
}

function libraryText(library) {
  return library.map(m => `- ${m.id} — ${m.description || m.title || '(no description)'}`).join('\n')
}

export async function generateScene(userPrompt, library, { onStatus } = {}) {
  onStatus?.('loading')
  const system = SCENE_PROMPT.replace('{{LIBRARY}}', libraryText(library))
  let text = ''
  const stream = client().messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Build a scene: ${userPrompt}` }],
  })
  for await (const ev of stream) {
    if (ev.type === 'content_block_start' && ev.content_block.type === 'text') onStatus?.('writing')
    if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') text += ev.delta.text
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
