import { useMemo } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { IconCube, IconImage, IconCode, IconHelp } from './Icons.jsx'
import ModelSnapshot from './ModelSnapshot.jsx'

const IconUsers = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>
  </svg>
)
const IconLabs = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
  </svg>
)

// Quick-access targets. Accent is used sparingly (icon tint + hover border)
// rather than as a full tile background — calmer, less rainbow.
const QUICK_ACCESS = [
  { mode: 'model',     title: 'Text to 3D',   blurb: 'Describe a model in words.',                    Icon: IconCube,  accent: '#7cf' },
  { mode: 'image',     title: 'Image to 3D',  blurb: 'Generate from a reference image.',              Icon: IconImage, accent: '#22d3ee' },
  { mode: 'code',      title: 'Coding Buddy', blurb: 'Pair-program with Claude on any code.',         Icon: IconCode,  accent: '#a855f7' },
  { mode: 'community', title: 'Community',    blurb: 'Browse models from other creators.',            Icon: IconUsers, accent: '#f472b6' },
  { mode: 'labs',      title: 'Labs',         blurb: 'Scenes, shaders, sounds, weapon generator.',    Icon: IconLabs,  accent: '#ffaa50' },
]

function greeting() {
  const h = new Date().getHours()
  if (h < 5)  return 'Good evening'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// Mulberry32: tiny seeded PRNG. Same seed → same sequence forever.
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Daily picks: deterministic shuffle of all community posts, seeded by the
// UTC date so every visitor sees the same 4 today, and a fresh 4 tomorrow.
function pickDaily(posts, count) {
  if (!posts?.length) return []
  const d = new Date()
  const dateKey = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
  let seed = 0
  for (let i = 0; i < dateKey.length; i++) seed = ((seed * 31) + dateKey.charCodeAt(i)) >>> 0
  const rand = mulberry32(seed)
  const arr = [...posts]
  // Fisher-Yates with the seeded RNG
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.slice(0, count)
}

export default function HomePage({ onOpenHelp }) {
  const { setMode, user, plan, credits, communityPosts, sessions, savedModels } = useApp()
  const firstName = (user?.name || user?.email || '').split(/[\s@]/)[0]

  const generationCount = useMemo(
    () => (sessions || []).filter(s => s.modelData).length + (savedModels || []).length,
    [sessions, savedModels],
  )

  // 4 community posts, deterministically rotated daily.
  const dailyPicks = useMemo(() => pickDaily(communityPosts, 4), [communityPosts])

  // Featured = 4 most recent community posts (1 big + 3 small layout).
  const featured = useMemo(() => {
    return [...(communityPosts || [])]
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 4)
  }, [communityPosts])

  return (
    <div className="home-page">
      {/* Hero */}
      <header className="home-hero">
        <div className="home-hero-top">
          <div className="home-hero-text">
            <p className="home-hero-greeting">{greeting()}{firstName ? `, ${firstName}` : ''}.</p>
            <h1 className="home-hero-title">Build something.</h1>
          </div>
          {onOpenHelp && (
            <button className="home-help-btn" onClick={onOpenHelp} title="Help & guides">
              <IconHelp />
              <span>Help</span>
            </button>
          )}
        </div>
        <div className="home-stats">
          <div className="home-stat">
            <span className="home-stat-label">Plan</span>
            <span className="home-stat-value home-stat-value-cap">{plan}</span>
          </div>
          <div className="home-stat">
            <span className="home-stat-label">Credits</span>
            <span className="home-stat-value">{credits.toLocaleString()}</span>
          </div>
          <div className="home-stat">
            <span className="home-stat-label">Generations</span>
            <span className="home-stat-value">{generationCount.toLocaleString()}</span>
          </div>
        </div>
      </header>

      {/* Workspaces */}
      <section className="home-section">
        <div className="home-section-head">
          <h2 className="home-section-title">Workspaces</h2>
        </div>
        <div className="home-quick-grid">
          {QUICK_ACCESS.map(t => (
            <button
              key={t.mode}
              className="home-quick-tile"
              style={{ '--tile-accent': t.accent }}
              onClick={() => setMode(t.mode)}
            >
              <span className="home-quick-icon"><t.Icon /></span>
              <span className="home-quick-tile-title">{t.title}</span>
              <span className="home-quick-tile-blurb">{t.blurb}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Daily picks — 4 community posts, rotated each day. */}
      {dailyPicks.length > 0 && (
        <section className="home-section">
          <div className="home-section-head">
            <h2 className="home-section-title">Daily picks</h2>
            <span className="home-section-subtle">Fresh selection every day</span>
          </div>
          <div className="home-recent-grid">
            {dailyPicks.map(p => {
              const thumb = Array.isArray(p.thumb) ? p.thumb : ['#1a0a4a', '#7cf']
              return (
                <button key={p.id} className="home-recent-card" onClick={() => setMode('community')}>
                  <div className="home-recent-thumb">
                    <ModelSnapshot modelData={p.modelData} fallbackColors={thumb} />
                  </div>
                  <div className="home-recent-meta">
                    <span className="home-recent-title">{p.title || 'Untitled'}</span>
                    <span className="home-recent-time">{p.authorName || p.author || 'Anonymous'}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Featured — 1 big card on the left + 3 small cards stacked on the right */}
      {featured.length > 0 && (
        <section className="home-section">
          <div className="home-section-head">
            <h2 className="home-section-title">Featured from Community</h2>
            <button className="home-section-link" onClick={() => setMode('community')}>
              View all
            </button>
          </div>
          <div className="home-featured-split">
            {(() => {
              const [big, ...rest] = featured
              const bigThumb = Array.isArray(big.thumb) ? big.thumb : ['#1a0a4a', '#7cf']
              return (
                <>
                  <button className="home-featured-card-big" onClick={() => setMode('community')}>
                    <div className="home-featured-big-thumb">
                      <ModelSnapshot modelData={big.modelData} fallbackColors={bigThumb} />
                      <span className="home-featured-badge">
                        {big.modelData?.parts ? `${big.modelData.parts.length} parts` : '3D'}
                      </span>
                    </div>
                    <div className="home-featured-big-meta">
                      <span className="home-featured-big-title">{big.title || 'Untitled'}</span>
                      <span className="home-featured-author">{big.authorName || big.author || 'Anonymous'}</span>
                    </div>
                  </button>
                  <div className="home-featured-side">
                    {rest.map(p => {
                      const thumb = Array.isArray(p.thumb) ? p.thumb : ['#1a0a4a', '#7cf']
                      return (
                        <button key={p.id} className="home-featured-card" onClick={() => setMode('community')}>
                          <div className="home-featured-thumb">
                            <ModelSnapshot modelData={p.modelData} fallbackColors={thumb} />
                            <span className="home-featured-badge">
                              {p.modelData?.parts ? `${p.modelData.parts.length} parts` : '3D'}
                            </span>
                          </div>
                          <div className="home-featured-meta">
                            <span className="home-featured-title">{p.title || 'Untitled'}</span>
                            <span className="home-featured-author">{p.authorName || p.author || 'Anonymous'}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </>
              )
            })()}
          </div>
        </section>
      )}
    </div>
  )
}
