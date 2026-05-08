import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'

function timeAgo(ts) {
  if (!ts) return ''
  const s = (Date.now() - ts) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function thumbGrad(modelData) {
  if (!modelData) return 'linear-gradient(135deg,#0a0a1a,#1a1a3a)'
  const part = modelData.parts ? modelData.parts[0] : modelData
  const c = part.uniforms?.uColor1?.value || part.uniforms?.uColor2?.value
  if (c && Array.isArray(c)) {
    const rgb = `rgb(${Math.round(c[0]*255)},${Math.round(c[1]*255)},${Math.round(c[2]*255)})`
    return `linear-gradient(135deg,#0a0a18,${rgb})`
  }
  return 'linear-gradient(135deg,#0e0a20,#1a0a3a)'
}

export default function ModelGallery({ onSelect }) {
  const { sessions } = useApp()
  const [open, setOpen] = useState(true)

  const modelSessions = sessions.filter(s =>
    s.modelData && (s.mode === 'model' || s.mode === 'image')
  )

  return (
    <div className={`mgallery${open ? '' : ' mgallery-collapsed'}`}>
      <button className="mgallery-toggle" onClick={() => setOpen(o => !o)} title={open ? 'Hide gallery' : 'Show models'}>
        {open ? '›' : '‹'}
      </button>

      {open && (
        <>
          <div className="mgallery-header">
            <span className="mgallery-title">Models</span>
            <span className="mgallery-count">{modelSessions.length}</span>
          </div>
          <div className="mgallery-list">
            {modelSessions.length === 0 && (
              <p className="mgallery-empty">Generate a model to see it here</p>
            )}
            {modelSessions.map(sess => {
              const md = sess.modelData
              return (
                <button
                  key={sess.id}
                  className="mgallery-item"
                  onClick={() => onSelect?.(md)}
                  title={sess.title}
                >
                  <div
                    className="mgallery-thumb"
                    style={{ background: thumbGrad(md) }}
                  >
                    <span className="mgallery-thumb-label">
                      {md?.parts ? `${md.parts.length}P` : '3D'}
                    </span>
                  </div>
                  <div className="mgallery-info">
                    <span className="mgallery-name">{sess.title}</span>
                    <span className="mgallery-time">{timeAgo(sess.updatedAt)}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
