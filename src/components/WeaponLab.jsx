import { useState, Component } from 'react'
import { useApp } from '../context/AppContext.jsx'
import ThreeViewer from './ThreeViewer.jsx'
import { generateWeapon } from '../lib/weaponClient.js'

const STYLES = ['Realistic', 'Stylized', 'Low-poly', 'Sci-fi']

// Catches render-time errors from broken generated code so a single bad
// output doesn't crash the whole tab. The user can hit Try Again.
class ModelErrorBoundary extends Component {
  constructor(p) { super(p); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(error, info) { console.error('WeaponLab render error:', error, info) }
  componentDidUpdate(prev) {
    if (prev.modelKey !== this.props.modelKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (this.state.error) {
      return (
        <div className="weapon-render-error">
          <p>Couldn't render this model — the generated code is malformed.</p>
          <p className="weapon-hint">Hit "Try Again" for a fresh generation.</p>
        </div>
      )
    }
    return this.props.children
  }
}

function stageLabel(stage) {
  if (stage === 'researching') return 'Researching reference details…'
  if (stage === 'modeling')    return 'Modeling…'
  return 'Starting…'
}

export default function WeaponLab() {
  const { savedModels, persistModel, removeModel } = useApp()
  const [name, setName] = useState('')
  const [style, setStyle] = useState('Stylized')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(null)
  const [model, setModel] = useState(null)
  const [description, setDescription] = useState(null)
  const [error, setError] = useState('')
  const [savedId, setSavedId] = useState(null)

  const weaponLibrary = savedModels.filter(m => m.type === 'weapon')

  async function handleGenerate() {
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    setError('')
    setModel(null)
    setDescription(null)
    setSavedId(null)
    setStage('researching')
    try {
      const result = await generateWeapon(trimmed, {
        style,
        onStage: (s) => { if (s === 'researching' || s === 'modeling') setStage(s) },
      })
      setModel({ ...result.model, timestamp: Date.now() })
      setDescription(result.description || null)
      setStage('done')
    } catch (e) {
      setError(e.message || String(e))
      setStage(null)
    } finally {
      setBusy(false)
    }
  }

  function handleSave() {
    if (!model || savedId) return
    const saved = persistModel({
      title: `${name.trim()} (${style})`,
      type: 'weapon',
      weaponName: name.trim(),
      style,
      description,
      modelData: model,
      brain: 'gemini-flash+claude-sonnet',
    })
    setSavedId(saved.id)
  }

  function handleLoad(item) {
    setModel({ ...item.modelData, timestamp: Date.now() })
    setDescription(item.description || null)
    setName(item.weaponName || item.title || '')
    setStyle(item.style || 'Stylized')
    setSavedId(item.id)
    setError('')
    setStage('done')
  }

  function handleDelete(id) {
    removeModel(id)
    if (savedId === id) setSavedId(null)
  }

  return (
    <div className="weapon-lab">
      <div className="weapon-sidebar">
        <div className="weapon-form">
          <label className="weapon-label">Weapon name</label>
          <input
            className="weapon-input"
            type="text"
            placeholder='e.g. "viking sword", "longbow", "sci-fi blaster"'
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate() }}
            disabled={busy}
            maxLength={120}
          />

          <label className="weapon-label">Style</label>
          <select
            className="weapon-select"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            disabled={busy}
          >
            {STYLES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <button
            className="weapon-generate"
            onClick={handleGenerate}
            disabled={busy || !name.trim()}
          >
            {busy ? stageLabel(stage) : 'Generate (15 credits)'}
          </button>

          {error && <p className="weapon-error">{error}</p>}
        </div>

        {weaponLibrary.length > 0 && (
          <div className="weapon-library">
            <div className="weapon-library-title">Saved Weapons · {weaponLibrary.length}</div>
            {weaponLibrary.map(w => (
              <div key={w.id} className={`weapon-library-row${savedId === w.id ? ' active' : ''}`}>
                <button className="weapon-library-item" onClick={() => handleLoad(w)} title={w.description || w.title}>
                  <span className="weapon-library-name">{w.title}</span>
                  {w.style && <span className="weapon-library-style">{w.style}</span>}
                </button>
                <button className="weapon-library-del" onClick={() => handleDelete(w.id)} title="Delete">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="weapon-main">
        {busy ? (
          <div className="weapon-loading">
            <div className="weapon-spinner" />
            <p className="weapon-loading-text">{stageLabel(stage)}</p>
            <p className="weapon-loading-sub">
              {stage === 'researching'
                ? 'Looking up real reference details with grounded search.'
                : 'Generating geometry, shaders, and materials.'}
            </p>
          </div>
        ) : model ? (
          <>
            <ModelErrorBoundary modelKey={model.timestamp}>
              <ThreeViewer modelData={model} isGenerating={false} />
            </ModelErrorBoundary>
            <div className="weapon-result-bar">
              <button className="weapon-action" onClick={handleSave} disabled={!!savedId}>
                {savedId ? '✓ Saved to Library' : '💾 Save to Library'}
              </button>
              <button className="weapon-action weapon-action-secondary" onClick={handleGenerate} disabled={busy || !name.trim()}>
                ↻ Try Again
              </button>
            </div>
            {description && (
              <details className="weapon-description">
                <summary>Reference description</summary>
                <p>{description}</p>
              </details>
            )}
          </>
        ) : (
          <div className="weapon-empty">
            <div className="weapon-empty-icon">⚔</div>
            <h3>Weapon Generator</h3>
            <p>Type a weapon name in the sidebar — anything from "viking sword" to "plasma rifle".</p>
            <p>We use Gemini's grounded search to pull real reference details, then have Claude generate the 3D model. Two AI calls, one credit charge (15).</p>
          </div>
        )}
      </div>
    </div>
  )
}
