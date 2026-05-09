import { CODING_SYSTEM_PROMPT } from './codingBuddyPrompt.js'
import { auth } from './firebase.js'

async function getIdToken() {
  const user = auth?.currentUser
  if (!user) throw new Error('Sign in to chat')
  return user.getIdToken()
}

const CLAUDE_MODEL = {
  pro:     'claude-sonnet-4-6',
  premium: 'claude-opus-4-7',
}

async function streamClaude(messages, hooks, variant = 'pro') {
  const token = await getIdToken()
  const res = await fetch('/api/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      model: CLAUDE_MODEL[variant] || CLAUDE_MODEL.pro,
      max_tokens: 4096,
      system: [{ type: 'text', text: CODING_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    }),
  })
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 320)}`)

  let full = ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
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
          full += obj.delta.text
          hooks.onChunk?.(full)
        }
      } catch { /* skip */ }
    }
  }
  return full
}

async function streamGemini(messages, hooks, variant = 'flash') {
  const token = await getIdToken()
  // Convert Anthropic-style messages to Gemini contents.
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
  }))
  const body = {
    _variant: variant,
    systemInstruction: { parts: [{ text: CODING_SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8000,
      thinkingConfig: { thinkingBudget: 0 },
    },
  }
  const res = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 320)}`)

  let full = ''
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
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
          full += chunk
          hooks.onChunk?.(full)
        }
      } catch { /* skip */ }
    }
  }
  return full
}

export async function streamCodingReply(messages, { onChunk, onDone, onError, brain = 'claude', variant = 'pro' } = {}) {
  try {
    const full = brain === 'gemini'
      ? await streamGemini(messages, { onChunk }, variant === 'premium' ? 'pro' : variant)
      : await streamClaude(messages, { onChunk }, variant)
    onDone?.(full)
    return full
  } catch (e) {
    onError?.(e)
    throw e
  }
}
