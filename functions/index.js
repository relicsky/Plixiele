import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { defineSecret } from 'firebase-functions/params'

initializeApp()

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')
const GEMINI_API_KEY    = defineSecret('GEMINI_API_KEY')

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'https://plixiele-sign-in.web.app',
  'https://plixiele-sign-in.firebaseapp.com',
]

function setCors(req, res) {
  const origin = req.headers.origin
  if (ALLOWED_ORIGINS.includes(origin)) res.set('Access-Control-Allow-Origin', origin)
  res.set('Vary', 'Origin')
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.set('Access-Control-Max-Age', '3600')
}

async function requireUser(req, res) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (!m) {
    res.status(401).json({ error: 'Missing Authorization header' })
    return null
  }
  try {
    return await getAuth().verifyIdToken(m[1])
  } catch (e) {
    res.status(401).json({ error: 'Invalid token: ' + e.message })
    return null
  }
}

async function pipeStream(upstream, res) {
  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  const reader = upstream.body.getReader()
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    res.write(Buffer.from(value))
  }
  res.end()
}

// ── Anthropic proxy ──
export const anthropicProxy = onRequest(
  { region: 'us-central1', secrets: [ANTHROPIC_API_KEY], cors: false, timeoutSeconds: 540, memory: '512MiB' },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') { res.status(204).end(); return }
    if (req.method !== 'POST')   { res.status(405).end(); return }

    const user = await requireUser(req, res)
    if (!user) return

    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY.value(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ ...req.body, stream: true }),
      })
      if (!upstream.ok) {
        const errText = await upstream.text()
        res.status(upstream.status).send(errText)
        return
      }
      await pipeStream(upstream, res)
    } catch (e) {
      console.error('anthropicProxy failed', e)
      res.status(500).json({ error: e.message })
    }
  },
)

// ── Gemini proxy ──
export const geminiProxy = onRequest(
  { region: 'us-central1', secrets: [GEMINI_API_KEY], cors: false, timeoutSeconds: 540, memory: '512MiB' },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') { res.status(204).end(); return }
    if (req.method !== 'POST')   { res.status(405).end(); return }

    const user = await requireUser(req, res)
    if (!user) return

    const variant = (req.body?._variant === 'pro') ? 'gemini-2.5-pro' : 'gemini-2.5-flash'
    const { _variant, ...payload } = req.body || {}

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${variant}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY.value()}`
      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!upstream.ok) {
        const errText = await upstream.text()
        res.status(upstream.status).send(errText)
        return
      }
      await pipeStream(upstream, res)
    } catch (e) {
      console.error('geminiProxy failed', e)
      res.status(500).json({ error: e.message })
    }
  },
)
