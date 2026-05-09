import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { createAccount, signInUser, isFirebaseReady } from '../lib/firebaseAuth.js'

export default function LoginPage() {
  const { setUser } = useApp()
  const [tab, setTab] = useState('in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setErr('')
    
    if (tab === 'up' && name.trim().length < 2) {
      setErr('Name must be at least 2 characters')
      return
    }
    if (!email.includes('@')) {
      setErr('Enter a valid email')
      return
    }
    if (password.length < 6) {
      setErr('Password must be at least 6 characters')
      return
    }
    
    setIsLoading(true)
    try {
      let user
      if (tab === 'up') {
        // Sign up
        user = await createAccount(email.trim().toLowerCase(), password, name.trim())
      } else {
        // Sign in
        user = await signInUser(email.trim().toLowerCase(), password)
      }
      setUser(user)
    } catch (error) {
      setErr(error.message || 'Authentication failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-logo-icon" aria-hidden="true">✦</span>
          <span className="login-logo-text">Plixie</span>
        </div>
        <p className="login-tagline">AI-powered 3D model generation</p>

        <div className="login-tabs" role="tablist" aria-label="Authentication mode">
          <button 
            role="tab" 
            aria-selected={tab === 'in'} 
            aria-controls="sign-in-panel"
            className={tab === 'in' ? 'active' : ''} 
            onClick={() => { setTab('in'); setErr(''); }}
          >
            Sign in
          </button>
          <button 
            role="tab" 
            aria-selected={tab === 'up'} 
            aria-controls="sign-up-panel"
            className={tab === 'up' ? 'active' : ''} 
            onClick={() => { setTab('up'); setErr(''); }}
          >
            Create account
          </button>
        </div>

        <form onSubmit={submit} className="login-form" aria-labelledby="form-title">
          <h1 id="form-title" className="sr-only">
            {tab === 'in' ? 'Sign in to Plixie' : 'Create a Plixie account'}
          </h1>
          
          {tab === 'up' && (
            <div className="field">
              <label htmlFor="name-input">Full Name</label>
              <input
                id="name-input"
                type="text"
                value={name} 
                onChange={e => setName(e.target.value)}
                placeholder="Your name" 
                autoFocus
                required
                minLength="2"
                aria-describedby={err ? 'form-error' : undefined}
                disabled={isLoading}
              />
            </div>
          )}
          
          <div className="field">
            <label htmlFor="email-input">Email</label>
            <input
              id="email-input"
              type="email" 
              value={email} 
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" 
              autoFocus={tab === 'in'}
              required
              aria-required="true"
              aria-describedby={err ? 'form-error' : undefined}
              disabled={isLoading}
            />
          </div>

          <div className="field">
            <label htmlFor="password-input">Password</label>
            <input
              id="password-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength="6"
              aria-required="true"
              aria-describedby={err ? 'form-error' : undefined}
              disabled={isLoading}
            />
            {tab === 'up' && <p className="field-hint">Minimum 6 characters</p>}
          </div>
          
          {err && (
            <p id="form-error" className="login-err" role="alert">
              <span aria-label="Error">⚠️</span> {err}
            </p>
          )}
          
          <button 
            type="submit" 
            className="login-btn"
            disabled={isLoading || !email || !password}
            aria-busy={isLoading}
          >
            {isLoading ? 'Loading...' : (tab === 'in' ? 'Sign in' : 'Create account')} 
            {!isLoading && '→'}
          </button>
        </form>

        <p className="login-note">
          {isFirebaseReady()
            ? 'Your data is securely stored with Firebase'
            : 'Dev Mode: Using local storage (connect Firebase to enable cloud sync)'
          }
        </p>
      </div>
    </div>
  )
}
