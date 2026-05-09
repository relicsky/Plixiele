import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { resendEmailVerification } from '../lib/firebaseAuth.js'

const DISMISS_KEY = 'plixie_verify_dismissed'

export default function VerifyBanner() {
  const { user } = useApp()
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [hidden, setHidden] = useState(() => sessionStorage.getItem(DISMISS_KEY) === '1')

  // Show only when we have a real Firebase user with an unverified email.
  if (!user || user.emailVerified || !user.uid || user.uid.startsWith('local_')) return null
  if (hidden) return null

  async function resend() {
    setBusy(true)
    setError('')
    try {
      await resendEmailVerification()
      setSent(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, '1')
    setHidden(true)
  }

  return (
    <div className="verify-banner">
      <span className="verify-banner-icon">✉</span>
      <span className="verify-banner-text">
        Verify your email at <strong>{user.email}</strong> to keep your account secure.
      </span>
      {sent ? (
        <span className="verify-banner-sent">✓ Sent — check your inbox</span>
      ) : (
        <button className="verify-banner-action" onClick={resend} disabled={busy}>
          {busy ? 'Sending…' : 'Resend email'}
        </button>
      )}
      {error && <span className="verify-banner-error">{error}</span>}
      <button className="verify-banner-close" onClick={dismiss} title="Dismiss">×</button>
    </div>
  )
}
