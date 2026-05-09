import { onRequest } from 'firebase-functions/v2/https'
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { defineSecret } from 'firebase-functions/params'

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
const COST = { gen: 10, chat: 2 }

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

async function ensureProfile(uid, email) {
  const ref = db.doc(`users/${uid}`)
  const snap = await ref.get()
  if (!snap.exists) {
    await ref.set({
      email: email || null,
      plan: 'free',
      credits: PLAN_CREDITS.free,
      creditsResetAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    return { plan: 'free', credits: PLAN_CREDITS.free }
  }
  const data = snap.data()
  return { plan: data.plan || 'free', credits: data.credits ?? 0 }
}

function intentFromBody(body) {
  // Heuristic: model gens use big max_tokens; chat uses small.
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

// ── Anthropic proxy ──
export const anthropicProxy = onRequest(
  { region: 'us-central1', secrets: [ANTHROPIC_API_KEY], cors: false, timeoutSeconds: 540, memory: '512MiB' },
  async (req, res) => {
    await gateAndProxy({
      req, res, providerName: 'anthropic',
      callUpstream: () => fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY.value(),
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({ ...req.body, stream: true }),
      }),
    })
  },
)

// ── Gemini proxy ──
export const geminiProxy = onRequest(
  { region: 'us-central1', secrets: [GEMINI_API_KEY], cors: false, timeoutSeconds: 540, memory: '512MiB' },
  async (req, res) => {
    const variant = (req.body?._variant === 'pro') ? 'gemini-2.5-pro' : 'gemini-2.5-flash'
    const { _variant, ...payload } = req.body || {}
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

// ── Stripe subscription → user.plan sync ──
// Map a Stripe price ID (set in Stripe dashboard) to one of our plan tiers.
// Configure these IDs as Firebase Functions config or hard-code after creating
// products in the Stripe dashboard via the firestore-stripe-payments extension.
const PRICE_TO_PLAN = {
  // Fill in once Stripe products exist:
  // 'price_xxxBasic':   'basic',
  // 'price_xxxPro':     'pro',
  // 'price_xxxPremium': 'premium',
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
