import { onRequest } from 'firebase-functions/v2/https'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'
import { SYSTEM_PROMPT } from './systemPrompt.js'

initializeApp()
const db = getFirestore()

const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY')
const GEMINI_API_KEY    = defineSecret('GEMINI_API_KEY')

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
