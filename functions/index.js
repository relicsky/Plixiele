import { onRequest } from 'firebase-functions/v2/https'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import crypto from 'node:crypto'
import { SYSTEM_PROMPT } from './systemPrompt.js'

initializeApp()
const db = getFirestore()

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')
const GEMINI_API_KEY    = defineSecret('GEMINI_API_KEY')
// Mailgun secrets — set with:
//   firebase functions:secrets:set MAILGUN_API_KEY
//   firebase functions:secrets:set MAILGUN_WEBHOOK_KEY
//   firebase functions:secrets:set MAILGUN_DOMAIN
const MAILGUN_API_KEY     = defineSecret('MAILGUN_API_KEY')
const MAILGUN_WEBHOOK_KEY = defineSecret('MAILGUN_WEBHOOK_KEY')
const MAILGUN_DOMAIN      = defineSecret('MAILGUN_DOMAIN')

// ── Plan / credit policy ──
//   Generation = 10 credits, Chat = 2 credits.
//   Free 60, Basic 600, Pro 1500, Premium 5000.
//   Refilled monthly via the resetMonthlyCredits scheduled function.
const PLAN_CREDITS = {
  free:    60,
  basic:   600,
  pro:     1500,
  premium: 5000,
}
const COST = { gen: 10, chat: 2, sound: 50, weapon: 15 }

// Dev / staff allowlist — these emails are auto-upgraded to Premium with
// full credits regardless of subscription status. Add yourself here.
const DEV_EMAILS = new Set([
  'thesaberkid@outlook.com',
  'thesaberkis@outlook.com',
  'mhwetmore@gmail.com',
])

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
  if (!m) { res.status(401).json({ error: 'Missing Authorization header' }); return null }
  try { return await getAuth().verifyIdToken(m[1]) }
  catch (e) { res.status(401).json({ error: 'Invalid token: ' + e.message }); return null }
}

function planForEmail(email) {
  return email && DEV_EMAILS.has(email.toLowerCase()) ? 'premium' : 'free'
}

async function ensureProfile(uid, email) {
  const ref = db.doc(`users/${uid}`)
  const snap = await ref.get()
  const seedPlan = planForEmail(email)
  const seedCredits = PLAN_CREDITS[seedPlan]

  if (!snap.exists) {
    await ref.set({
      email: email || null,
      plan: seedPlan,
      credits: seedCredits,
      creditsResetAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return { plan: seedPlan, credits: seedCredits }
  }

  const data = snap.data()
  // Existing doc that pre-dates the credits system: backfill missing fields
  // and apply the dev plan if the user is in the allowlist.
  const patch = {}
  if (typeof data.credits !== 'number') patch.credits = seedCredits
  if (!data.plan) patch.plan = seedPlan
  if (seedPlan === 'premium' && data.plan !== 'premium') {
    patch.plan = 'premium'
    patch.credits = PLAN_CREDITS.premium
  }
  if (Object.keys(patch).length > 0) {
    patch.updatedAt = FieldValue.serverTimestamp()
    await ref.set(patch, { merge: true })
    return { plan: patch.plan || data.plan, credits: patch.credits ?? data.credits }
  }
  return { plan: data.plan || seedPlan, credits: data.credits ?? seedCredits }
}

function intentFromBody(body) {
  // Explicit intent wins (e.g. sound generation costs 50 even though it's
  // a small model call). Fallback heuristic: big max_tokens = gen, small = chat.
  if (body?._intent && COST[body._intent]) return body._intent
  const max = body?.max_tokens || body?.generationConfig?.maxOutputTokens || 0
  return max >= 16000 ? 'gen' : 'chat'
}

async function consumeCredits(uid, amount) {
  return db.runTransaction(async (t) => {
    const ref = db.doc(`users/${uid}`)
    const snap = await t.get(ref)
    if (!snap.exists) throw new Error('Profile not found')
    const credits = snap.data().credits ?? 0
    if (credits < amount) throw new Error('INSUFFICIENT_CREDITS')
    t.update(ref, { credits: credits - amount, updatedAt: FieldValue.serverTimestamp() })
    return credits - amount
  })
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

async function gateAndProxy({ req, res, providerName, callUpstream }) {
  setCors(req, res)
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST')   { res.status(405).end(); return }

  const user = await requireUser(req, res)
  if (!user) return

  await ensureProfile(user.uid, user.email)
  const intent = intentFromBody(req.body)
  const cost = COST[intent]

  try {
    await consumeCredits(user.uid, cost)
  } catch (e) {
    if (e.message === 'INSUFFICIENT_CREDITS') {
      res.status(402).json({ error: 'Out of credits. Upgrade your plan.', cost, intent })
      return
    }
    res.status(500).json({ error: e.message }); return
  }

  try {
    const upstream = await callUpstream()
    if (!upstream.ok) {
      // Refund on upstream error so the user isn't charged for failed requests.
      await db.doc(`users/${user.uid}`).update({ credits: FieldValue.increment(cost) })
      const errText = await upstream.text()
      console.error(`${providerName} upstream error: ${upstream.status}`, errText.slice(0, 500))
      res.status(upstream.status).send(errText)
      return
    }
    await pipeStream(upstream, res)
  } catch (e) {
    await db.doc(`users/${user.uid}`).update({ credits: FieldValue.increment(cost) })
    console.error(`${providerName} proxy failed`, e)
    res.status(500).json({ error: e.message })
  }
}

// ── Bootstrap: client calls this on sign-in to seed missing fields ──
export const bootstrapProfile = onRequest(
  { region: 'us-central1', cors: false, timeoutSeconds: 30, memory: '256MiB' },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') { res.status(204).end(); return }
    if (req.method !== 'POST')   { res.status(405).end(); return }
    const user = await requireUser(req, res)
    if (!user) return
    try {
      const profile = await ensureProfile(user.uid, user.email)
      res.json(profile)
    } catch (e) {
      console.error('bootstrapProfile failed', e)
      res.status(500).json({ error: e.message })
    }
  },
)

// ── Anthropic proxy ──
export const anthropicProxy = onRequest(
  { region: 'us-central1', secrets: [ANTHROPIC_API_KEY], cors: false, timeoutSeconds: 540, memory: '512MiB' },
  async (req, res) => {
    await gateAndProxy({
      req, res, providerName: 'anthropic',
      callUpstream: () => {
        const { _intent, _variant, ...payload } = req.body || {}
        return fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY.value(),
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({ ...payload, stream: true }),
        })
      },
    })
  },
)

// ── Gemini proxy ──
export const geminiProxy = onRequest(
  { region: 'us-central1', secrets: [GEMINI_API_KEY], cors: false, timeoutSeconds: 540, memory: '512MiB' },
  async (req, res) => {
    const variant = (req.body?._variant === 'pro') ? 'gemini-2.5-pro' : 'gemini-2.5-flash'
    const { _variant, _intent, ...payload } = req.body || {}
    await gateAndProxy({
      req, res, providerName: 'gemini',
      callUpstream: () => fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${variant}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY.value()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      ),
    })
  },
)

// ── Weapon Generator (Labs feature) ──
//
// Two-step orchestration done server-side so neither API key is ever exposed
// and we can charge a single credit cost for the whole flow:
//
//   Step 1 — Gemini 2.5 Flash with google_search grounding looks up real
//            visual reference details for the weapon name.
//   Step 2 — Claude Sonnet generates the model JSON spec (same format every
//            other generator outputs) using that description as ground truth.
//
// The response is an SSE stream of stage events so the UI can show
// "Researching…" then "Modeling…" instead of one long opaque spinner.
//
// Fallback: if Gemini fails or returns nothing useful, we skip the description
// and have Claude generate from the weapon name alone. The user still gets a
// model — just without the research-grounded detail.

async function fetchGeminiGroundedDescription(weaponName, style) {
  // The safety clause asks Gemini to stylize real-world firearm requests
  // rather than refuse outright — keeps the feature usable for fantasy/sci-fi
  // weapons that share a name with a real product.
  const prompt =
    `Describe the visual appearance of a ${weaponName} in detail. Focus on shape, ` +
    `proportions, materials, colors, and distinctive visual features. Output in ` +
    `3-5 sentences. Style preference: ${style}. ` +
    `If the requested item is a real-world modern firearm by specific brand/model, ` +
    `generate a description of a similar but stylized fictional version instead.`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY.value()}`
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  let r
  try {
    r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 240)}`)
  const j = await r.json()
  const text = (j?.candidates?.[0]?.content?.parts || [])
    .map(p => p.text).filter(Boolean).join('').trim()
  if (!text || text.length < 20) throw new Error('Gemini returned empty/too-short description')
  return text
}

async function fetchClaudeWeaponModel(weaponName, style, description) {
  const userMessage = description
    ? `Reference description (from web search):\n"${description}"\n\n` +
      `Create a 3D model JSON of a ${weaponName} matching this description. ` +
      `Style preference: ${style}. Use the "parts" format with separate components ` +
      `(grip/handle, blade/barrel/limbs, decorative elements). Center the model at origin.`
    : `Create a 3D model JSON of a ${weaponName}. Style preference: ${style}. ` +
      `Use the "parts" format with separate components (grip/handle, blade/barrel/limbs, ` +
      `decorative elements). Center the model at origin.`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 90000)
  let r
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY.value(),
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 24000,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMessage }],
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 240)}`)
  const j = await r.json()
  const text = (j?.content || []).map(b => b.text || '').join('')
  return parseModelJSONServer(text)
}

// Server-side JSON extraction. Mirrors the client-side parser shape but kept
// local so functions/ stays self-contained.
function parseModelJSONServer(text) {
  const tryParse = (s) => { try { return JSON.parse(s) } catch { return null } }
  for (const m of (text || '').matchAll(/```(?:json)?\s*([\s\S]*?)```/g)) {
    const r = tryParse(m[1].trim()); if (r) return r
  }
  // Fallback: extract the first balanced {...}
  let start = -1, depth = 0, inStr = false, esc = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (esc) { esc = false; continue }
    if (c === '\\' && inStr) { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') { if (start === -1) start = i; depth++ }
    else if (c === '}') {
      if (--depth === 0 && start !== -1) {
        const r = tryParse(text.slice(start, i + 1)); if (r) return r
      }
    }
  }
  throw new Error('Could not parse model JSON from Claude response')
}

export const generateWeapon = onRequest(
  {
    region: 'us-central1',
    secrets: [ANTHROPIC_API_KEY, GEMINI_API_KEY],
    cors: false,
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') { res.status(204).end(); return }
    if (req.method !== 'POST')   { res.status(405).end(); return }

    const user = await requireUser(req, res)
    if (!user) return

    const { name = '', style = 'Stylized' } = req.body || {}
    const weaponName = String(name).trim().slice(0, 120)
    if (!weaponName) { res.status(400).json({ error: 'Missing weapon name' }); return }

    await ensureProfile(user.uid, user.email)
    const cost = COST.weapon

    try {
      await consumeCredits(user.uid, cost)
    } catch (e) {
      if (e.message === 'INSUFFICIENT_CREDITS') {
        res.status(402).json({ error: 'Out of credits. Upgrade your plan.', cost, intent: 'weapon' })
        return
      }
      res.status(500).json({ error: e.message }); return
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')

    const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)

    // Step 1 — grounded description (best-effort; fall through on failure)
    send({ stage: 'researching' })
    let description = ''
    try {
      description = await fetchGeminiGroundedDescription(weaponName, style)
    } catch (e) {
      console.warn(`generateWeapon: Gemini grounding failed for "${weaponName}", continuing with Claude-only:`, e.message)
      description = ''
    }

    // Step 2 — model generation
    send({ stage: 'modeling', description: description || null })
    let model
    try {
      model = await fetchClaudeWeaponModel(weaponName, style, description)
    } catch (e) {
      console.error(`generateWeapon: Claude failed for "${weaponName}":`, e.message)
      // Total failure — refund the credits.
      await db.doc(`users/${user.uid}`).update({ credits: FieldValue.increment(cost) })
      send({ stage: 'error', message: 'Generation failed — try again' })
      res.end(); return
    }

    send({ stage: 'done', model, description: description || null, weaponName, style })
    res.end()
  },
)

// ── Email support assistant (Mailgun inbound webhook → Claude → Mailgun reply) ──
//
// Flow: someone emails help@plixiele.com → Mailgun receives via the route we
// configure → Mailgun POSTs the parsed email to /api/email/inbound → this
// function verifies the signature, asks Claude for a reply, and sends it back
// out via Mailgun's send API.
//
// Setup is in MAILGUN_SETUP.md (DNS records, route, secrets).

const SUPPORT_SYSTEM_PROMPT = `You are the Plixiele support assistant, replying to a user's email.

About Plixiele: a web app at plixiele-sign-in.web.app where users generate 3D
models, scenes, shaders, and sounds with AI (Anthropic Claude + Google Gemini).
Subscriptions: Free / Basic ($10) / Pro ($20) / Premium ($100). Credits-based:
gen=10, chat=2, sound=50, weapon=15. Workspaces: Text to 3D, Image to 3D,
Coding Buddy, Community, Labs (Scene Builder, Shader Lab, Sound Lab, Weapon
Generator). There's also a Roblox Studio plugin you can install via Account →
API Keys + Help → Roblox.

Reply rules:
- Be friendly, concise, and direct. Plain prose. No emojis. No markdown headers.
- When the user describes a bug or error, ASK SPECIFICALLY for whatever they
  haven't provided: (a) the exact error message they saw, (b) what they were
  doing when it broke, (c) which workspace they were in, (d) browser + OS if
  relevant, (e) a screenshot. Don't ask for what they already gave you.
- For "how do I do X" questions, give the concrete steps.
- For account / billing / subscription / refund / credits-balance disputes,
  say a human will follow up within 24 hours. Do NOT make promises about
  refunds, plan changes, or credit grants yourself.
- For anything you don't know, say so plainly. Don't invent features.
- Sign off with "— Plixiele Support".`

// Strip the most common quoted-reply patterns so the model only sees the new
// message, not the entire prior thread.
function stripQuotedReply(text) {
  if (!text) return ''
  const lines = text.split(/\r?\n/)
  const out = []
  for (const line of lines) {
    if (/^On .* wrote:\s*$/.test(line)) break        // Gmail / Apple Mail
    if (/^>+ /.test(line)) continue                   // quoted lines
    if (/^-+ ?Original Message ?-+/i.test(line)) break
    if (/^From:.*\bPlixiele Support\b/.test(line)) break
    out.push(line)
  }
  return out.join('\n').trim()
}

function escapeMailgunHeader(s) {
  return String(s || '').replace(/[\r\n]/g, ' ').trim()
}

async function sendMailgunReply({ to, subject, body, inReplyTo, references }) {
  const domain = MAILGUN_DOMAIN.value()
  const url = `https://api.mailgun.net/v3/${domain}/messages`
  const form = new URLSearchParams()
  form.set('from', `Plixiele Support <help@${domain.replace(/^mg\./, '')}>`)
  form.set('to', to)
  form.set('subject', subject)
  form.set('text', body)
  if (inReplyTo)  form.set('h:In-Reply-To', escapeMailgunHeader(inReplyTo))
  if (references) form.set('h:References',  escapeMailgunHeader(references))
  // Marker so we can ignore our own bounced replies if they ever come back.
  form.set('h:X-Plixiele-Auto-Reply', '1')

  const auth = 'Basic ' + Buffer.from(`api:${MAILGUN_API_KEY.value()}`).toString('base64')
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': auth, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  if (!r.ok) {
    const errText = await r.text()
    throw new Error(`Mailgun send failed (${r.status}): ${errText.slice(0, 240)}`)
  }
}

// HMAC-SHA256 verification per Mailgun's webhook docs.
function verifyMailgunSignature(timestamp, token, signature) {
  if (!timestamp || !token || !signature) return false
  // Reject replays older than 5 minutes (Mailgun timestamps are unix seconds).
  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 300) return false
  const computed = crypto
    .createHmac('sha256', MAILGUN_WEBHOOK_KEY.value())
    .update(timestamp + token)
    .digest('hex')
  // timingSafeEqual throws if buffers are different lengths
  if (computed.length !== signature.length) return false
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(signature))
}

async function askClaudeForSupportReply(subject, fromName, body) {
  const userMessage =
    `From: ${fromName || 'a Plixiele user'}\n` +
    `Subject: ${subject || '(no subject)'}\n\n` +
    `Message:\n${body}`

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY.value(),
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: [{ type: 'text', text: SUPPORT_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMessage }],
    }),
  })
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 240)}`)
  const j = await r.json()
  return (j?.content || []).map(b => b.text || '').join('').trim()
}

export const mailgunInbound = onRequest(
  {
    region: 'us-central1',
    secrets: [ANTHROPIC_API_KEY, MAILGUN_API_KEY, MAILGUN_WEBHOOK_KEY, MAILGUN_DOMAIN],
    cors: false,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    if (req.method !== 'POST') { res.status(405).end(); return }

    // Mailgun inbound posts as multipart/form-data or url-encoded depending on
    // the route action. firebase-functions parses both into req.body for us.
    const body = req.body || {}
    const ts        = body.timestamp || body.signature?.timestamp
    const token     = body.token     || body.signature?.token
    const signature = body.signature?.signature || body['signature']

    // Mailgun "store(notify)" routes nest signature; legacy "forward" routes
    // post fields flat. Handle both.
    const flatSig = typeof signature === 'string' ? signature : null
    const okSig = verifyMailgunSignature(ts, token, flatSig)
    if (!okSig) {
      console.warn('mailgunInbound: signature verification failed')
      res.status(401).json({ error: 'Bad signature' })
      return
    }

    // Bot / auto-reply detection — never reply to our own bounces or to
    // "noreply@" senders (prevents loops).
    const sender = String(body.sender || body.from || '').toLowerCase()
    const headers = body['message-headers'] ? safeParseJSON(body['message-headers']) : []
    const headerMap = {}
    for (const [k, v] of (Array.isArray(headers) ? headers : [])) headerMap[String(k).toLowerCase()] = v

    if (
      headerMap['x-plixiele-auto-reply'] ||
      headerMap['auto-submitted'] ||
      headerMap['precedence'] === 'bulk' ||
      /^(noreply|no-reply|mailer-daemon|postmaster)@/i.test(sender)
    ) {
      console.info('mailgunInbound: ignoring auto-reply / bulk message from', sender)
      res.status(200).json({ ignored: true })
      return
    }

    const subject = String(body.subject || '(no subject)')
    const fromName = String(body.from || '').replace(/<[^>]*>/g, '').trim()
    const rawBody = body['body-plain'] || body['stripped-text'] || body['body-html'] || ''
    const cleanBody = stripQuotedReply(String(rawBody))

    if (!cleanBody) {
      console.info('mailgunInbound: empty body after stripping quotes')
      res.status(200).json({ ignored: true })
      return
    }

    let reply
    try {
      reply = await askClaudeForSupportReply(subject, fromName, cleanBody)
    } catch (e) {
      console.error('mailgunInbound: Claude failed:', e.message)
      // Acknowledge to Mailgun so it doesn't retry forever; log + alert
      // separately if you wire up monitoring.
      res.status(200).json({ ignored: true, reason: 'claude_failed' })
      return
    }

    const replySubject = subject.match(/^Re:/i) ? subject : `Re: ${subject}`
    try {
      await sendMailgunReply({
        to: sender,
        subject: replySubject,
        body: reply + '\n\n— Plixiele Support',
        inReplyTo: headerMap['message-id'],
        references: headerMap['message-id'],
      })
    } catch (e) {
      console.error('mailgunInbound: send failed:', e.message)
      res.status(500).json({ error: e.message })
      return
    }

    res.status(200).json({ ok: true })
  },
)

function safeParseJSON(s) {
  try { return JSON.parse(s) } catch { return null }
}

// ── /api/roblox — plugin-facing generation endpoint ──
//
// Accepts an API key (not a Firebase ID token, since the Lua plugin can't
// easily get one). Returns the Plixiele model JSON as a single response —
// no SSE streaming, because Roblox HttpService doesn't expose chunked reads.
//
// Cost: 10 credits (same as a regular gen). Refunds on upstream failure.

export const generateRoblox = onRequest(
  {
    region: 'us-central1',
    secrets: [ANTHROPIC_API_KEY, GEMINI_API_KEY],
    cors: false,
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async (req, res) => {
    // Roblox Studio plugins don't send an Origin header — accept all callers
    // here (the API key itself is the auth surface).
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    if (req.method === 'OPTIONS') { res.status(204).end(); return }
    if (req.method !== 'POST')   { res.status(405).end(); return }

    const keyDoc = await requireApiKey(req, res)
    if (!keyDoc) return
    const { uid } = keyDoc

    const prompt = String(req.body?.prompt || '').trim().slice(0, 2000)
    if (!prompt) { res.status(400).json({ error: 'Missing prompt' }); return }

    // Bootstrap the user's profile so credits exist (in case they signed up
    // through the web app a while ago and never hit the bootstrap endpoint).
    let userRecord
    try { userRecord = await getAuth().getUser(uid) }
    catch { res.status(401).json({ error: 'API key references a deleted user' }); return }

    await ensureProfile(uid, userRecord.email)
    const cost = COST.gen

    try {
      await consumeCredits(uid, cost)
    } catch (e) {
      if (e.message === 'INSUFFICIENT_CREDITS') {
        res.status(402).json({ error: 'Out of credits. Upgrade your plan in Plixiele.', cost })
        return
      }
      res.status(500).json({ error: e.message }); return
    }

    // Single Claude Sonnet call with the standard model JSON prompt.
    let model
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY.value(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 24000,
          system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: `Create a 3D model: ${prompt}` }],
        }),
      })
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 240)}`)
      const j = await r.json()
      const text = (j?.content || []).map(b => b.text || '').join('')
      model = parseModelJSONServer(text)
    } catch (e) {
      console.error('generateRoblox: Claude failed:', e.message)
      await db.doc(`users/${uid}`).update({ credits: FieldValue.increment(cost) })
      res.status(500).json({ error: 'Generation failed — try again' })
      return
    }

    // Touch lastUsed on the key for the user's records.
    db.doc(`users/${uid}/apiKeys/${keyDoc.keyId}`)
      .update({ lastUsed: FieldValue.serverTimestamp() })
      .catch(() => {})

    res.json({ model, prompt })
  },
)

// ── API keys (for external integrations: Roblox plugin, etc.) ──
//
// Two-doc model so we get both "list a user's keys" and "look up a key →
// uid" without a Firestore composite index:
//   users/{uid}/apiKeys/{keyId}  — owner-readable list metadata
//   apiKeys/{keyValue}           — backend-only key→uid lookup
//
// Only Cloud Functions (using the admin SDK) write either doc; firestore.rules
// denies all client writes. Clients call createApiKey/revokeApiKey functions.

function generateKeyValue() {
  // pk_ prefix + 32 url-safe chars. Plenty of entropy (~192 bits).
  return 'pk_' + crypto.randomBytes(24).toString('base64url')
}

export const createApiKey = onRequest(
  { region: 'us-central1', cors: false, timeoutSeconds: 30, memory: '256MiB' },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') { res.status(204).end(); return }
    if (req.method !== 'POST')   { res.status(405).end(); return }
    const user = await requireUser(req, res)
    if (!user) return

    const name = String(req.body?.name || 'API key').slice(0, 60)
    const keyValue = generateKeyValue()
    const keyId = crypto.randomBytes(8).toString('hex')

    const created = FieldValue.serverTimestamp()
    try {
      // Mirror writes: lookup doc + user-visible metadata doc.
      await db.doc(`apiKeys/${keyValue}`).set({
        uid: user.uid, keyId, name, createdAt: created,
      })
      await db.doc(`users/${user.uid}/apiKeys/${keyId}`).set({
        keyId, name, createdAt: created,
        keyPrefix: keyValue.slice(0, 6),
        keySuffix: keyValue.slice(-4),
        // Don't store the full key here — clients see it once in the response
        // and never again. Forces them to copy now or revoke + reissue later.
      })
      res.json({ key: keyValue, keyId, name })
    } catch (e) {
      console.error('createApiKey failed:', e)
      res.status(500).json({ error: e.message })
    }
  },
)

export const revokeApiKey = onRequest(
  { region: 'us-central1', cors: false, timeoutSeconds: 30, memory: '256MiB' },
  async (req, res) => {
    setCors(req, res)
    if (req.method === 'OPTIONS') { res.status(204).end(); return }
    if (req.method !== 'POST')   { res.status(405).end(); return }
    const user = await requireUser(req, res)
    if (!user) return

    const keyId = String(req.body?.keyId || '')
    if (!keyId) { res.status(400).json({ error: 'Missing keyId' }); return }

    try {
      // Find the lookup doc by scanning the user's keys for the matching keyId.
      // Cheaper than a query because there are only ever a handful per user.
      const snap = await db.doc(`users/${user.uid}/apiKeys/${keyId}`).get()
      if (!snap.exists) { res.status(404).json({ error: 'Key not found' }); return }

      // Walk the global apiKeys collection for the matching keyId. Small N
      // (one user's keys), but if this gets slow we'll add an index.
      const lookup = await db.collection('apiKeys').where('uid', '==', user.uid).where('keyId', '==', keyId).get()
      const batch = db.batch()
      lookup.forEach(d => batch.delete(d.ref))
      batch.delete(snap.ref)
      await batch.commit()

      res.json({ ok: true })
    } catch (e) {
      console.error('revokeApiKey failed:', e)
      res.status(500).json({ error: e.message })
    }
  },
)

// Used by /api/roblox (and any future plugin endpoint) to authenticate via
// a Bearer API key instead of a Firebase ID token.
async function requireApiKey(req, res) {
  const auth = req.headers.authorization || ''
  const m = auth.match(/^Bearer\s+(pk_[A-Za-z0-9_-]+)$/)
  if (!m) { res.status(401).json({ error: 'Missing or malformed API key' }); return null }
  try {
    const snap = await db.doc(`apiKeys/${m[1]}`).get()
    if (!snap.exists) { res.status(401).json({ error: 'Invalid API key' }); return null }
    return snap.data() // { uid, keyId, name, createdAt }
  } catch (e) {
    console.error('requireApiKey lookup failed:', e)
    res.status(500).json({ error: e.message })
    return null
  }
}

// ── Stripe subscription → user.plan sync ──
// Map a Stripe price ID to one of our plan tiers. Test-mode and live-mode
// price IDs are different objects — list both here so we don't have to
// re-edit when flipping the extension between modes.
//
// Find each ID in Stripe → Products → (your product) → Pricing section,
// or in Firestore at products/{productId}/prices/{priceId}.
//
// SHIP CHECK: if any value is the string 'TODO_…', paid checkout will silently
// downgrade the user to free. Fill these in before deploying functions.
const PRICE_TO_PLAN = {
  // Test mode (sk_test_…)
  'TODO_TEST_PRICE_BASIC':   'basic',
  'TODO_TEST_PRICE_PRO':     'pro',
  'TODO_TEST_PRICE_PREMIUM': 'premium',
  // Live mode (sk_live_…)
  'TODO_LIVE_PRICE_BASIC':   'basic',
  'TODO_LIVE_PRICE_PRO':     'pro',
  'TODO_LIVE_PRICE_PREMIUM': 'premium',
}

export const onSubscriptionWrite = onDocumentWritten(
  { document: 'customers/{uid}/subscriptions/{subId}', region: 'us-central1' },
  async (event) => {
    const after = event.data?.after?.data()
    const uid = event.params.uid
    if (!after) return
    const status = after.status
    const priceId = after.items?.[0]?.price?.id || after.price?.id
    const active = status === 'active' || status === 'trialing'
    if (active && priceId && !PRICE_TO_PLAN[priceId]) {
      console.error(`onSubscriptionWrite: active sub for uid=${uid} has unmapped priceId=${priceId}. Plan will fall back to 'free'. Add this priceId to PRICE_TO_PLAN in functions/index.js and redeploy.`)
    }
    const plan = active && priceId && PRICE_TO_PLAN[priceId] ? PRICE_TO_PLAN[priceId] : 'free'
    await db.doc(`users/${uid}`).set({
      plan,
      credits: PLAN_CREDITS[plan],
      creditsResetAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      stripe: { status: status || null, priceId: priceId || null },
    }, { merge: true })
  },
)

// ── Monthly credit reset ──
// Refills every user's credits to their plan's allowance once a month.
export const resetMonthlyCredits = onSchedule(
  { schedule: '0 0 1 * *', timeZone: 'UTC', region: 'us-central1' },
  async () => {
    const snap = await db.collection('users').get()
    const batch = db.batch()
    snap.forEach((doc) => {
      const plan = doc.data().plan || 'free'
      batch.update(doc.ref, {
        credits: PLAN_CREDITS[plan] ?? PLAN_CREDITS.free,
        creditsResetAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })
    })
    await batch.commit()
  },
)
