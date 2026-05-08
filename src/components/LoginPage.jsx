import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'

export default function LoginPage() {
  const { signIn } = useApp()
  const [tab, setTab] = useState('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')

  function submit(e) {
    e.preventDefault()
    setErr('')
    if (tab === 'up' && name.trim().length < 2) return setErr('Name must be at least 2 characters')
    if (!email.includes('@')) return setErr('Enter a valid email')
    signIn(tab === 'up' ? name.trim() : (email.split('@')[0]), email.trim().toLowerCase())
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-icon">✦</span>
          <span className="login-logo-text">Plixie</span>
        </div>
        <p className="login-tagline">AI-powered 3D model generation</p>

        <div className="login-tabs">
          <button className={tab === 'in' ? 'active' : ''} onClick={() => setTab('in')}>Sign in</button>
          <button className={tab === 'up' ? 'active' : ''} onClick={() => setTab('up')}>Create account</button>
        </div>

        <form onSubmit={submit} className="login-form">
          {tab === 'up' && (
            <div className="field">
              <label>Name</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                placeholder="Your name" autoFocus
              />
            </div>
          )}
          <div className="field">
            <label>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoFocus={tab === 'in'}
            />
          </div>
          {err && <p className="login-err">{err}</p>}
          <button type="submit" className="login-btn">
            {tab === 'in' ? 'Sign in' : 'Create account'} →
          </button>
        </form>

        <p className="login-note">Local session — no data leaves your browser</p>
      </div>
    </div>
  )
}
