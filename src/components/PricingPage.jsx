import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { db } from '../lib/firebase.js'
import { collection, doc, addDoc, onSnapshot, query, where } from 'firebase/firestore'

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

export default function PricingPage({ onClose }) {
  const { user, plan, credits } = useApp()
  const [prices, setPrices] = useState({})
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

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

  return (
    <div className="pricing-page">
      <div className="pricing-head">
        <button className="pricing-close" onClick={onClose}>← Back</button>
        <div>
          <h1>Plans</h1>
          <p>You have <strong>{credits}</strong> credits left this month on the <strong>{plan}</strong> plan.</p>
        </div>
      </div>

      {error && <p className="pricing-error">{error}</p>}

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
