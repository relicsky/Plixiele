import { useApp } from '../context/AppContext.jsx'
import { IconCube, IconImage, IconCode, IconPlus, IconTrash, IconLogOut } from './Icons.jsx'

const MODES = [
  { key: 'model',     label: 'Text to 3D',    Icon: IconCube  },
  { key: 'image',     label: 'Image to 3D',   Icon: IconImage },
  { key: 'code',      label: 'Coding Buddy',  Icon: IconCode  },
  { key: 'community', label: 'Community',     Icon: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg> },
  { key: 'labs',      label: 'Labs',          Icon: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg> },
]

const NO_CHAT_MODES = new Set(['community', 'labs'])

function timeAgo(ts) {
  const s = (Date.now() - ts) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function Sidebar() {
  const { user, signOut, mode, setMode, sessions, activeId, createSession, removeSession, loadSession } = useApp()
  const modeSessions = sessions.filter(s => s.mode === mode)

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-logo">
          <span className="sidebar-logo-icon">✦</span>
          <span className="sidebar-logo-text">Plixie</span>
        </div>

        <nav className="sidebar-nav">
          {MODES.map(({ key, label, Icon }) => (
            <button key={key} className={`nav-item ${mode === key ? 'active' : ''}`} onClick={() => setMode(key)}>
              <span className="nav-icon"><Icon /></span>
              <span className="nav-label">{label}</span>
              {key === 'labs' && <span className="nav-badge">Beta</span>}
            </button>
          ))}
        </nav>

        {!NO_CHAT_MODES.has(mode) && (
          <>
            <div className="sidebar-section-header">
              <span>Chats</span>
              <button className="icon-btn" onClick={() => createSession(mode)} title="New chat">
                <IconPlus />
              </button>
            </div>
            <div className="session-list">
              {modeSessions.length === 0 && <p className="session-empty">No saved chats yet</p>}
              {modeSessions.map(sess => (
                <div key={sess.id}
                  className={`session-item ${activeId[mode] === sess.id ? 'active' : ''}`}
                  onClick={() => loadSession(sess)}>
                  <span className="session-title">{sess.title}</span>
                  <span className="session-time">{timeAgo(sess.updatedAt)}</span>
                  <button className="session-delete"
                    onClick={e => { e.stopPropagation(); removeSession(sess.id) }} title="Delete">
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <a
        href="/plixie-engine.html"
        download="plix-studio.html"
        className="engine-link"
      >
        <span className="engine-link-icon">⬡</span>
        <span>Plix Studio</span>
        <span className="engine-link-arrow">↗</span>
      </a>

      <div className="sidebar-user">
        <div className="user-avatar">{initials(user?.name)}</div>
        <div className="user-info">
          <span className="user-name">{user?.name}</span>
          <span className="user-email">{user?.email}</span>
        </div>
        <button className="icon-btn icon-btn-dim" onClick={signOut} title="Sign out">
          <IconLogOut />
        </button>
      </div>
    </aside>
  )
}
