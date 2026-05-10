import { useState, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { auth, db, storage } from '../lib/firebase.js'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { requestPasswordReset, resendEmailVerification } from '../lib/firebaseAuth.js'

// Photo upload requires Firebase Storage + Blaze plan, neither of which is
// set up on the project yet. Flip this to true once Storage is provisioned
// and storage.rules has been deployed; the upload code below is already wired.
const AVATAR_UPLOAD_ENABLED = false

function initials(name = '') {
  return name.split(/\s+/).map(w => w[0]).filter(Boolean).join('').toUpperCase().slice(0, 2)
}

// Gradient seeded by uid so each user gets a stable initials background.
function avatarGradient(uid = 'x') {
  const palettes = [
    ['#7cf', '#a855f7'], ['#22d3ee', '#6366f1'], ['#f472b6', '#ef4444'],
    ['#7cffa8', '#22d3ee'], ['#ffaa50', '#f43f5e'], ['#a855f7', '#3b82f6'],
  ]
  let h = 0
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0
  const [a, b] = palettes[h % palettes.length]
  return `linear-gradient(135deg, ${a}, ${b})`
}

export default function AccountSettings({ onClose, onOpenPricing }) {
  const { user, signOut, plan, credits, avatarUrl, displayName, updateProfile } = useApp()
  const [name, setName] = useState(displayName || user?.name || '')
  const [savingName, setSavingName] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const fileInputRef = useRef(null)

  const cloudUid = user?.uid && !user.uid.startsWith('local_') ? user.uid : null

  // ── API keys ──
  const [apiKeys, setApiKeys] = useState([])
  const [creatingKey, setCreatingKey] = useState(false)
  const [newKey, setNewKey] = useState(null) // { key, keyId, name } shown ONCE
  const [keyName, setKeyName] = useState('')
  const [copyMsg, setCopyMsg] = useState('')

  useEffect(() => {
    if (!cloudUid || !db) return
    const q = query(collection(db, 'users', cloudUid, 'apiKeys'), orderBy('createdAt', 'desc'))
    return onSnapshot(q, (snap) => {
      setApiKeys(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }, (err) => console.warn('apiKeys watch failed:', err.message))
  }, [cloudUid])

  async function handleCreateKey() {
    if (creatingKey) return
    setCreatingKey(true); setError(''); setInfo('')
    try {
      const token = await auth?.currentUser?.getIdToken?.()
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ name: keyName.trim() || 'API key' }),
      })
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 240)}`)
      const data = await res.json()
      setNewKey(data)
      setKeyName('')
    } catch (err) {
      setError(err.message || 'Could not create key')
    } finally {
      setCreatingKey(false)
    }
  }

  async function handleRevokeKey(keyId) {
    if (!confirm('Revoke this key? Anything using it will stop working immediately.')) return
    setError(''); setInfo('')
    try {
      const token = await auth?.currentUser?.getIdToken?.()
      const res = await fetch('/api/keys/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ keyId }),
      })
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 240)}`)
    } catch (err) {
      setError(err.message || 'Could not revoke key')
    }
  }

  async function copyKey(key) {
    try {
      await navigator.clipboard.writeText(key)
      setCopyMsg('Copied'); setTimeout(() => setCopyMsg(''), 1500)
    } catch {
      setCopyMsg('Copy failed'); setTimeout(() => setCopyMsg(''), 1500)
    }
  }
  const initialsText = initials(displayName || user?.name || user?.email || '')

  async function handleAvatarPick(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file later
    if (!file || !cloudUid || !storage) return
    if (!file.type.startsWith('image/')) { setError('Pick an image file'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Image must be under 5MB'); return }

    setUploading(true); setError(''); setInfo('')
    try {
      const ref = storageRef(storage, `users/${cloudUid}/avatar`)
      await uploadBytes(ref, file, { contentType: file.type })
      const url = await getDownloadURL(ref)
      // Cache-bust the URL so the new image shows immediately rather than the
      // browser-cached previous avatar at the same path.
      await updateProfile({ avatarUrl: `${url}&t=${Date.now()}` })
      setInfo('Photo updated')
    } catch (err) {
      console.error('Avatar upload failed:', err)
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  async function handleSaveName() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === (displayName || user?.name)) return
    setSavingName(true); setError(''); setInfo('')
    try {
      await updateProfile({ name: trimmed })
      setInfo('Name updated')
    } catch (err) {
      setError(err.message || 'Could not save name')
    } finally {
      setSavingName(false)
    }
  }

  async function handleChangePassword() {
    if (!user?.email) return
    setError(''); setInfo('')
    try {
      await requestPasswordReset(user.email)
      setInfo(`Password reset email sent to ${user.email}`)
    } catch (err) {
      setError(err.message || 'Could not send reset email')
    }
  }

  async function handleResendVerification() {
    setError(''); setInfo('')
    try {
      await resendEmailVerification()
      setInfo('Verification email sent')
    } catch (err) {
      setError(err.message || 'Could not resend verification')
    }
  }

  return (
    <div className="account-page">
      <div className="account-head">
        <button className="account-close" onClick={onClose}>← Back</button>
        <h1>Account</h1>
      </div>

      {error && <p className="account-error">{error}</p>}
      {info && <p className="account-info">{info}</p>}

      {/* Profile */}
      <section className="account-section">
        <div className="account-section-title">Profile</div>

        <div className="account-avatar-row">
          <div
            className="account-avatar"
            style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : { background: avatarGradient(user?.uid) }}
          >
            {!avatarUrl && <span className="account-avatar-initials">{initialsText}</span>}
            {uploading && <div className="account-avatar-overlay">Uploading…</div>}
          </div>
          <div className="account-avatar-actions">
            {AVATAR_UPLOAD_ENABLED ? (
              <>
                <button
                  className="account-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading || !cloudUid}
                >
                  {avatarUrl ? 'Change photo' : 'Upload photo'}
                </button>
                <p className="account-hint">PNG / JPG, up to 5MB. Visible on your community posts.</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleAvatarPick}
                />
              </>
            ) : (
              <p className="account-hint">Custom photo upload coming soon. Your initials use a unique gradient for now.</p>
            )}
          </div>
        </div>

        <div className="account-field">
          <label className="account-label">Display name</label>
          <div className="account-field-row">
            <input
              className="account-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              disabled={savingName || !cloudUid}
            />
            <button
              className="account-btn account-btn-primary"
              onClick={handleSaveName}
              disabled={savingName || !cloudUid || name.trim() === (displayName || user?.name)}
            >
              {savingName ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <div className="account-field">
          <label className="account-label">Email</label>
          <div className="account-field-row">
            <input className="account-input" value={user?.email || ''} readOnly />
            {user?.emailVerified ? (
              <span className="account-badge account-badge-ok">Verified</span>
            ) : (
              <button className="account-btn" onClick={handleResendVerification}>Resend verification</button>
            )}
          </div>
        </div>
      </section>

      {/* Plan + credits */}
      <section className="account-section">
        <div className="account-section-title">Plan</div>
        <div className="account-plan-row">
          <div>
            <div className="account-plan-tier">{plan}</div>
            <div className="account-plan-credits">{credits} credits remaining this month</div>
          </div>
          <button className="account-btn account-btn-primary" onClick={() => { onClose?.(); onOpenPricing?.() }}>
            {plan === 'free' ? 'Upgrade' : 'Manage'}
          </button>
        </div>
      </section>

      {/* Security */}
      <section className="account-section">
        <div className="account-section-title">Security</div>
        <div className="account-row">
          <div>
            <div className="account-row-title">Password</div>
            <div className="account-hint">We'll email you a secure reset link.</div>
          </div>
          <button className="account-btn" onClick={handleChangePassword}>Change password</button>
        </div>
      </section>

      {/* API keys */}
      <section className="account-section">
        <div className="account-section-title">API Keys</div>
        <p className="account-hint">
          Used by external integrations like the Roblox Studio plugin. Each generation
          via API costs the same credits as one in-app generation.
        </p>

        {newKey && (
          <div className="account-newkey">
            <div className="account-newkey-head">
              <strong>Your new key</strong>
              <span className="account-hint">Copy it now — you won't see it again.</span>
            </div>
            <div className="account-newkey-row">
              <code className="account-newkey-value">{newKey.key}</code>
              <button className="account-btn" onClick={() => copyKey(newKey.key)}>
                {copyMsg || 'Copy'}
              </button>
            </div>
            <button className="account-btn account-btn-link" onClick={() => setNewKey(null)}>
              I've saved it — hide
            </button>
          </div>
        )}

        <div className="account-keys-create">
          <input
            className="account-input"
            type="text"
            placeholder="Name this key (e.g. 'Roblox plugin')"
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            maxLength={60}
            disabled={creatingKey || !cloudUid}
          />
          <button
            className="account-btn account-btn-primary"
            onClick={handleCreateKey}
            disabled={creatingKey || !cloudUid}
          >
            {creatingKey ? 'Generating…' : 'Generate key'}
          </button>
        </div>

        {apiKeys.length > 0 && (
          <ul className="account-keys-list">
            {apiKeys.map(k => (
              <li key={k.id} className="account-keys-item">
                <div className="account-keys-meta">
                  <span className="account-keys-name">{k.name || 'API key'}</span>
                  <code className="account-keys-fingerprint">
                    {k.keyPrefix || 'pk_'}…{k.keySuffix || ''}
                  </code>
                </div>
                <button className="account-btn account-btn-danger" onClick={() => handleRevokeKey(k.id)}>
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Sign out */}
      <section className="account-section">
        <button className="account-signout" onClick={signOut}>Sign out</button>
      </section>
    </div>
  )
}
