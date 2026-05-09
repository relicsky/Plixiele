import { useState, useRef } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { generateSound, playSound, renderToWavBlob } from '../lib/soundClient.js'

const EXAMPLES = [
  'a 6 second uplifting synthwave riff in F# minor',
  'sci-fi laser blaster firing twice',
  'a calm ambient pad with soft bell on top, 8 seconds',
  'an 8-bit jump sound effect',
  'gentle wind chimes in a major key',
  'an arcade coin pickup',
]

export default function SoundLab() {
  const { aiBrain, aiVariant, plan, savedSounds, persistSound, removeSound } = useApp()
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const [error, setError] = useState('')
  const [sound, setSound] = useState(null)
  const [savedFlash, setSavedFlash] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const ctxRef = useRef(null)

  function stopCurrent() {
    if (ctxRef.current) {
      try { ctxRef.current.close() } catch {}
      ctxRef.current = null
    }
  }

  async function generate() {
    if (!prompt.trim() || busy) return
    setError('')
    setBusy(true)
    setStatus('loading')
    try {
      const variant = aiVariant || (aiBrain === 'gemini'
        ? 'flash'
        : (plan === 'premium' ? 'premium' : 'pro'))
      const data = await generateSound(prompt, { brain: aiBrain, variant, onStatus: setStatus })
      setSound({ ...data, prompt, ts: Date.now() })
    } catch (e) {
      setError(e.message || 'Sound generation failed')
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  function play() {
    if (!sound) return
    stopCurrent()
    try {
      ctxRef.current = playSound(sound)
    } catch (e) {
      setError(`Playback failed: ${e.message}`)
    }
  }

  async function download() {
    if (!sound || downloading) return
    setDownloading(true)
    setError('')
    try {
      const blob = await renderToWavBlob(sound)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${(sound.description || 'plixie-sound').slice(0, 40)}.wav`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch (e) {
      setError(`Render failed: ${e.message}`)
    } finally {
      setDownloading(false)
    }
  }

  function save() {
    if (!sound) return
    const saved = persistSound({
      ...sound,
      title: sound.title || sound.description,
    })
    setSound(saved)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1600)
  }

  function loadSaved(s) {
    stopCurrent()
    setSound(s)
    setPrompt(s.prompt || '')
    setError('')
  }

  return (
    <div className="sound-lab">
      <div className="sound-lab-head">
        <div className="sound-lab-title">
          <span className="sound-lab-icon">♫</span>
          <h2>Sound Lab</h2>
          <span className="sound-lab-cost">50 credits / generation</span>
        </div>
        <p className="sound-lab-blurb">Describe a sound effect or short piece of music. The AI writes a Web Audio routine and plays it in your browser. Download as a WAV.</p>
      </div>

      <div className="sound-lab-prompt-row">
        <textarea
          className="sound-lab-prompt"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="A retro arcade jump sound, then a coin chime…"
          rows={3}
          disabled={busy}
        />
        <button className="sound-lab-generate" onClick={generate} disabled={busy || !prompt.trim()}>
          {busy ? (status === 'writing' ? 'Composing…' : 'Thinking…') : '♫ Generate'}
        </button>
      </div>

      <div className="sound-lab-examples">
        {EXAMPLES.map(ex => (
          <button key={ex} className="sound-lab-example" onClick={() => setPrompt(ex)} disabled={busy}>
            {ex}
          </button>
        ))}
      </div>

      {error && <p className="sound-lab-error">{error}</p>}

      {sound && (
        <div className="sound-lab-result">
          <div className="sound-lab-result-meta">
            <span className="sound-lab-result-icon">♪</span>
            <div>
              <strong>{sound.description}</strong>
              <span className="sound-lab-result-dur">{sound.duration}s</span>
            </div>
          </div>
          <div className="sound-lab-actions">
            <button className="sound-lab-play" onClick={play}>▶ Play</button>
            <button className="sound-lab-stop" onClick={stopCurrent}>■ Stop</button>
            <button className="sound-lab-save" onClick={save} disabled={savedFlash}>
              {savedFlash ? '✓ Saved' : '⌘ Save'}
            </button>
            <button className="sound-lab-download" onClick={download} disabled={downloading}>
              {downloading ? 'Rendering…' : '↓ WAV'}
            </button>
          </div>
        </div>
      )}

      {savedSounds.length > 0 && (
        <div className="sound-lab-saved">
          <div className="sound-lab-saved-head">
            Saved sounds <span className="sound-lab-saved-count">{savedSounds.length}</span>
          </div>
          <div className="sound-lab-saved-list">
            {savedSounds.map(s => (
              <div key={s.id} className="sound-lab-saved-row">
                <div className="sound-lab-saved-info" onClick={() => loadSaved(s)}>
                  <span className="sound-lab-saved-title">{s.title || s.description}</span>
                  <span className="sound-lab-saved-meta">{s.duration}s</span>
                </div>
                <button className="sound-lab-saved-play"
                  onClick={() => { stopCurrent(); ctxRef.current = playSound(s) }}
                  title="Play">▶</button>
                <button className="sound-lab-saved-del"
                  onClick={() => removeSound(s.id)}
                  title="Delete">×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
