import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { generate3DModel as claudeGenerate } from '../lib/claudeClient.js'
import { generate3DModel as geminiGenerate } from '../lib/geminiClient.js'
import ThreeViewer from './ThreeViewer.jsx'
import CodeOutput from './CodeOutput.jsx'
import RendererSelect from './RendererSelect.jsx'
import ModelGallery from './ModelGallery.jsx'
import AiBrainToggle from './AiBrainToggle.jsx'
import { IconSend } from './Icons.jsx'

const STATUS = { loading: 'Connecting…', writing: 'Generating…' }
const EXAMPLES = [
  'glowing crystal geode with rainbow caustics',
  'wooden dining table with four carved legs',
  'robot body with arms, legs and glowing chest',
  'medieval castle tower with battlements',
  'sci-fi spaceship with engine glow and wings',
  'lava planet with molten crack surface',
  'lamp with base, pole, and shade',
]

export default function ModelGenerator() {
  const { activeSession, createSession, updateSession, renderer, shaderLang, aiBrain, aiVariant, plan } = useApp()
  const sess = activeSession.model
  const [messages, setMessages] = useState(sess?.messages || [])
  const [modelData, setModelData] = useState(sess?.modelData || null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState(null)
  const endRef = useRef(null)
  const sessRef = useRef(sess)

  useEffect(() => {
    const s = activeSession.model
    setMessages(s?.messages || [])
    setModelData(s?.modelData || null)
    sessRef.current = s
  }, [activeSession.model?.id])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  async function send(text) {
    if (!text.trim() || busy) return
    setInput('')
    setBusy(true)

    let s = sessRef.current
    const userMsg = { role: 'user', content: text, ts: Date.now() }
    const next = [...messages, userMsg]
    setMessages(next)

    if (!s) { s = createSession('model'); sessRef.current = s }

    try {
      const effective = shaderLang === 'hlsl' && renderer !== 'blender' ? 'hlsl' : renderer
      const generate = aiBrain === 'gemini' ? geminiGenerate : claudeGenerate
      const variant = aiVariant || (aiBrain === 'gemini'
        ? 'flash'
        : (plan === 'premium' ? 'premium' : 'pro'))
      const data = await generate(text, effective, { onStatus: setStatus, variant })
      const partsInfo = data.parts ? ` (${data.parts.length} parts)` : ''
      const aMsg = {
        role: 'assistant',
        content: `✦ ${data.description}${partsInfo}`,
        modelData: data, ts: Date.now(),
      }
      const final = [...next, aMsg]
      setMessages(final)
      setModelData(data)
      updateSession(s.id, { messages: final, modelData: data, title: text.slice(0, 46) })
    } catch (e) {
      const errMsg = { role: 'assistant', content: `Error: ${e.message}`, isError: true, ts: Date.now() }
      const final = [...next, errMsg]
      setMessages(final)
      updateSession(s?.id, { messages: final })
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  const is3D = renderer === 'threejs' && shaderLang === 'glsl'

  return (
    <div className="mode-3d">
      <div className="chat-col">
        <div className="chat-col-header">
          <RendererSelect />
        </div>

        <div className="chat-msgs">
          {messages.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">✦</div>
              <h3>Text to 3D</h3>
              <div className="examples">
                {EXAMPLES.map(ex => (
                  <button key={ex} className="example-pill" onClick={() => send(ex)}>{ex}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`bubble bubble-${m.role}${m.isError ? ' bubble-err' : ''}`}>
              {m.role === 'assistant' && <div className="bubble-avatar">P</div>}
              <div className="bubble-body">{m.content}</div>
            </div>
          ))}
          {busy && (
            <div className="bubble bubble-assistant">
              <div className="bubble-avatar">P</div>
              <div className="bubble-body bubble-loading">
                <span className="dot"/><span className="dot"/><span className="dot"/>
                <span className="status-txt">{STATUS[status] || 'Generating…'}</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <AiBrainToggle />
        <form className="chat-bar" onSubmit={e => { e.preventDefault(); send(input) }}>
          <input
            value={input} onChange={e => setInput(e.target.value)}
            placeholder="Describe a 3D model…" disabled={busy}
          />
          <button type="submit" disabled={busy || !input.trim()} className="send-btn">
            <IconSend />
          </button>
        </form>
      </div>

      {is3D
        ? <ThreeViewer modelData={modelData} isGenerating={busy} />
        : <CodeOutput modelData={modelData} />
      }
      <ModelGallery onSelect={data => { setModelData({ ...data, timestamp: Date.now() }) }} />
    </div>
  )
}
