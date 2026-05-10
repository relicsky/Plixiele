import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { db } from '../lib/firebase.js'
import { collection, doc, addDoc, onSnapshot, query, where } from 'firebase/firestore'
import { getFunctions, httpsCallable } from 'firebase/functions'

const TIERS = [
  {
    key: 'free',
    title: 'Free',
    price: '$0',
    blurb: 'Get a feel for Plixiele.',
    credits: 60,
    features: [
      '6 generations / month',
      'Gemini Flash',
      'Community gallery (read-only posts)',
      'GLB + PNG download',
    ],
    cta: 'Current plan',
  },
  {
    key: 'basic',
    title: 'Basic',
    price: '$10',
    blurb: 'Unlocks Labs and 10× the credits.',
    credits: 600,
    features: [
      '60 generations / month (or 300 chats)',
      'Gemini Flash',
      'Labs: Scene Builder + Shader Lab',
      'Publish to Community',
    ],
    cta: 'Upgrade',
  },
  {
    key: 'pro',
    title: 'Pro',
    price: '$20',
    blurb: 'Claude horsepower for serious work.',
    credits: 1500,
    features: [
      '150 generations / month',
      'Claude Sonnet',
      'Everything in Basic',
      'AI brain toggle (switch Gemini ↔ Claude)',
    ],
    cta: 'Upgrade',
    highlight: true,
  },
  {
    key: 'premium',
    title: 'Premium',
    price: '$100',
    blurb: 'Studio-grade — for prolific creators.',
    credits: 5000,
    features: [
      '300 generations + 1000 chats',
      'Claude Opus (top tier)',
      'Priority queue',
      'Early access to new features',
    ],
    cta: 'Upgrade',
  },
]

// Read ?upgrade=success | ?upgrade=cancel set by the Stripe checkout redirect.
function readUpgradeParam() {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('upgrade')
  return v === 'success' || v === 'cancel' ? v : null
}

export default function PricingPage({ onClose }) {
  const { user, plan, credits } = useApp()
  const [prices, setPrices] = useState({})
  const [busy, setBusy] = useState(null)
  const [portalBusy, setPortalBusy] = useState(false)
  const [error, setError] = useState('')
  const [upgradeFlash, setUpgradeFlash] = useState(() => readUpgradeParam())

  // Clear ?upgrade=… from the URL after we've shown the banner once, so a
  // refresh doesn't keep flashing it.
  useEffect(() => {
    if (!upgradeFlash) return
    const url = new URL(window.location.href)
    url.searchParams.delete('upgrade')
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)
  }, [upgradeFlash])

  // Load active prices from the firestore-stripe-payments extension.
  useEffect(() => {
    if (!db) return
    const q = query(collection(db, 'products'), where('active', '==', true))
    return onSnapshot(q, async (snap) => {
      const out = {}
      for (const productDoc of snap.docs) {
        const product = productDoc.data()
        const priceSnap = await new Promise((resolve) => {
          const u = onSnapshot(
            query(collection(productDoc.ref, 'prices'), where('active', '==', true)),
            (s) => { u(); resolve(s) },
          )
        })
        priceSnap.docs.forEach((p) => {
          const tierKey = (product.metadata?.plan || product.name || '').toLowerCase()
          out[tierKey] = { id: p.id, productId: productDoc.id, ...p.data() }
        })
      }
      setPrices(out)
    })
  }, [])

  async function startCheckout(tierKey) {
    if (!user || !db) return
    const price = prices[tierKey]
    if (!price) {
      setError(`No Stripe price configured for "${tierKey}". Set up products in Stripe + Firebase extension.`)
      return
    }
    setBusy(tierKey)
    setError('')
    try {
      const sessionsRef = collection(db, `customers/${user.uid}/checkout_sessions`)
      const docRef = await addDoc(sessionsRef, {
        price: price.id,
        success_url: window.location.origin + '/?upgrade=success',
        cancel_url:  window.location.origin + '/?upgrade=cancel',
        allow_promotion_codes: true,
      })
      const unsub = onSnapshot(docRef, (snap) => {
        const { error: err, url } = snap.data() || {}
        if (err) { setError(err.message || 'Stripe error'); setBusy(null); unsub() }
        if (url) { window.location.assign(url); unsub() }
      })
    } catch (e) {
      setError(e.message)
      setBusy(null)
    }
  }

  // Opens the Stripe-hosted customer portal so users can change card, cancel,
  // or download invoices. The firestore-stripe-payments extension installs a
  // callable function under the name below (default install).
  async function openPortal() {
    if (!user) return
    setPortalBusy(true)
    setError('')
    try {
      const fns = getFunctions(undefined, 'us-central1')
      const createPortalLink = httpsCallable(fns, 'ext-firestore-stripe-payments-createPortalLink')
      const { data } = await createPortalLink({ returnUrl: window.location.origin })
      if (data?.url) window.location.assign(data.url)
      else throw new Error('No portal URL returned')
    } catch (e) {
      setError(e.message || 'Could not open customer portal')
      setPortalBusy(false)
    }
  }

  return (
    <div className="pricing-page">
      <div className="pricing-head">
        <button className="pricing-close" onClick={onClose}>← Back</button>
        <div>
          <h1>Plans</h1>
          <p>You have <strong>{credits}</strong> credits left this month on the <strong>{plan}</strong> plan.</p>
        </div>
      </div>

      {upgradeFlash === 'success' && (
        <p className="pricing-flash pricing-flash-ok">
          Payment received — your plan should update within a few seconds.
        </p>
      )}
      {upgradeFlash === 'cancel' && (
        <p className="pricing-flash">Checkout canceled. No charge was made.</p>
      )}
      {error && <p className="pricing-error">{error}</p>}

      {plan !== 'free' && (
        <p className="pricing-manage">
          <button className="pricing-manage-btn" onClick={openPortal} disabled={portalBusy}>
            {portalBusy ? 'Opening…' : 'Manage subscription'}
          </button>
          <span className="pricing-manage-hint">Update card, change plan, or cancel.</span>
        </p>
      )}

      <div className="pricing-grid">
        {TIERS.map((t) => {
          const isCurrent = t.key === plan
          return (
            <div key={t.key} className={`pricing-card${t.highlight ? ' highlight' : ''}${isCurrent ? ' current' : ''}`}>
              {t.highlight && <span className="pricing-badge">Most popular</span>}
              <h3>{t.title}</h3>
              <div className="pricing-price"><span className="pricing-amount">{t.price}</span><span className="pricing-per">/month</span></div>
              <p className="pricing-blurb">{t.blurb}</p>
              <p className="pricing-credits">{t.credits} credits/month</p>
              <ul className="pricing-features">
                {t.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              {t.key === 'free' ? (
                <button className="pricing-cta" disabled>{isCurrent ? 'Current plan' : 'Free'}</button>
              ) : isCurrent ? (
                <button className="pricing-cta" disabled>Current plan</button>
              ) : (
                <button className="pricing-cta" onClick={() => startCheckout(t.key)} disabled={busy === t.key}>
                  {busy === t.key ? 'Loading…' : t.cta}
                </button>
              )}
            </div>
          )
        })}
      </div>

      <p className="pricing-fineprint">
        Subscriptions auto-renew monthly. Cancel anytime from the customer portal. Credits reset on the 1st of each month.
        See the <a href="#" onClick={(e) => { e.preventDefault(); onClose?.('terms') }}>Terms of Service</a> for details.
      </p>
    </div>
  )
}
