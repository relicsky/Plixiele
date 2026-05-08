import Anthropic from '@anthropic-ai/sdk'
import { CODING_SYSTEM_PROMPT } from './codingBuddyPrompt.js'

let _client = null
function client() {
  if (_client) return _client
  const key = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!key) throw new Error('VITE_ANTHROPIC_API_KEY not set')
  return (_client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true }))
}

export async function streamCodingReply(messages, { onChunk, onDone, onError } = {}) {
  try {
    const stream = client().messages.stream({
      model: 'claude-opus-4-7',
      max_tokens: 4096,
      system: [{ type: 'text', text: CODING_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages,
    })
    let full = ''
    for await (const ev of stream) {
      if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        full += ev.delta.text
        onChunk?.(full)
      }
    }
    onDone?.(full)
    return full
  } catch (e) {
    onError?.(e)
    throw e
  }
}
