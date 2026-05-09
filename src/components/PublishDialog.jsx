import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'

const GRADIENTS = [
  ['#1a0a4a', '#00e5ff'],
  ['#0f172a', '#22d3ee'],
  ['#3a0a4a', '#ff7cf2'],
  ['#0a3a2a', '#7cffa8'],
  ['#4a2a0a', '#ffa87c'],
  ['#2a0a4a', '#a87cff'],
]

export default function PublishDialog({ modelData, suggestedTitle, onClose }) {
  const { publishToCommunity } = useApp()
  const [title, setTitle] = useState(suggestedTitle || modelData?.description?.slice(0, 40) || '')
  const [tags, setTags] = useState('')
  const [gradientIdx, setGradientIdx] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  if (!modelData) return null

  function publish() {
    if (!title.trim()) return
    setSubmitting(true)
    try {
      const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
      publishToCommunity({
        title: title.trim(),
        tags: tagList,
        thumb: GRADIENTS[gradientIdx],
        modelData,
      })
      onClose(true)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => onClose(false)}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <h3>Publish to Community</h3>
          <button className="modal-close" onClick={() => onClose(false)}>×</button>
        </div>
        <div className="modal-body">
          <label className="modal-label">Title</label>
          <input className="modal-input" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="A name for your model" autoFocus />

          <label className="modal-label">Tags (comma separated)</label>
          <input className="modal-input" value={tags} onChange={e => setTags(e.target.value)}
            placeholder="abstract, glowing, sphere" />

          <label className="modal-label">Card color</label>
          <div className="modal-swatches">
            {GRADIENTS.map((g, i) => (
              <button key={i} type="button"
                className={`modal-swatch${gradientIdx === i ? ' active' : ''}`}
                style={{ background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }}
                onClick={() => setGradientIdx(i)} />
            ))}
          </div>

          <p className="modal-note">Posts are saved locally in your browser. There is no shared backend yet.</p>
        </div>
        <div className="modal-foot">
          <button className="modal-btn" onClick={() => onClose(false)}>Cancel</button>
          <button className="modal-btn primary" onClick={publish} disabled={submitting || !title.trim()}>
            {submitting ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}
