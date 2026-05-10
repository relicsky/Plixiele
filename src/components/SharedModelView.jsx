import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import ThreeViewer from './ThreeViewer.jsx'

// What a recipient sees when they open a share link AND are signed in.
// Shows the model with a banner attributing the original creator, plus
// CTAs to save it into their library or move on to Home.

export default function SharedModelView() {
  const { incomingShare, shareError, dismissShare, persistModel, setMode } = useApp()
  const [savedId, setSavedId] = useState(null)

  if (shareError) {
    return (
      <div className="share-view share-view-empty">
        <h2>Share unavailable</h2>
        <p>{shareError}</p>
        <button className="share-cta" onClick={() => { dismissShare(); setMode('home') }}>
          Go to Home
        </button>
      </div>
    )
  }

  if (!incomingShare) {
    return (
      <div className="share-view share-view-empty">
        <div className="share-spinner" />
        <p>Loading shared creation…</p>
      </div>
    )
  }

  function handleSave() {
    if (savedId) return
    const saved = persistModel({
      title: incomingShare.title || 'Shared creation',
      type: 'shared',
      modelData: { ...incomingShare.modelData, timestamp: Date.now() },
      brain: incomingShare.modelData?.brain || null,
      description: incomingShare.modelData?.description || null,
    })
    setSavedId(saved.id)
  }

  function handleHome() {
    dismissShare()
    setMode('home')
  }

  return (
    <div className="share-view">
      <header className="share-banner">
        <div className="share-banner-text">
          <strong>{incomingShare.ownerName || 'A Plixiele creator'}</strong>
          <span> shared this with you.</span>
        </div>
        <div className="share-banner-actions">
          <button className="share-btn" onClick={handleSave} disabled={!!savedId}>
            {savedId ? '✓ Saved to library' : '💾 Save to library'}
          </button>
          <button className="share-btn share-btn-primary" onClick={handleHome}>
            Go to Home →
          </button>
        </div>
      </header>
      <div className="share-viewer">
        <ThreeViewer
          modelData={{ ...incomingShare.modelData, timestamp: incomingShare.createdAt || Date.now() }}
          isGenerating={false}
        />
      </div>
    </div>
  )
}
