import { useState, useRef, useEffect } from 'react'
import { generate3DModel } from '../lib/claudeClient.js'

const EXAMPLES = [
  'glowing crystal geode with rainbow caustics',
  'molten lava planet with fiery crust',
  'holographic torus knot with data streams',
  'bioluminescent deep-sea creature',
  'ancient celestial orb with star map surface',
]

const STATUS_TEXT = {
  loading: 'Initializing...',
  thinking: 'Claude is thinking...',
  writing: 'Writing shader code...',
}

export default function ChatPanel({ onModelGenerated, isGenerating, setIsGenerating }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "I'm Plixie, your AI 3D model agent. Describe any object or scene and I'll generate a beautiful shader-based 3D model for you.",
    },
  ])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState(null)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isGenerating])

  async function submit(prompt) {
    if (!prompt.trim() || isGenerating) return
    const text = prompt.trim()
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setIsGenerating(true)

    try {
      const modelData = await generate3DModel(text, { onStatus: setStatus })
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `✦ ${modelData.description}` },
      ])
      onModelGenerated(modelData)
    } catch (err) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: err.message, isError: true },
      ])
    } finally {
      setIsGenerating(false)
      setStatus(null)
    }
  }

  return (
    <div className="chat-panel">
      <div className="chat-header">
        <div className="chat-logo">✦</div>
        <div>
          <div className="chat-title">Plixie</div>
          <div className="chat-sub">3D Model Agent</div>
        </div>
      </div>

      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`msg msg-${msg.role}${msg.isError ? ' msg-err' : ''}`}>
            {msg.role === 'assistant' && <div className="msg-avatar">P</div>}
            <div className="msg-bubble">{msg.content}</div>
          </div>
        ))}

        {isGenerating && (
          <div className="msg msg-assistant">
            <div className="msg-avatar">P</div>
            <div className="msg-bubble msg-loading">
              <span className="dot" /><span className="dot" /><span className="dot" />
              <span className="status-text">{STATUS_TEXT[status] || 'Generating...'}</span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!isGenerating && messages.length === 1 && (
        <div className="examples">
          <div className="examples-label">Try an example</div>
          {EXAMPLES.map((ex) => (
            <button key={ex} className="example-btn" onClick={() => submit(ex)}>
              {ex}
            </button>
          ))}
        </div>
      )}

      <form className="chat-form" onSubmit={e => { e.preventDefault(); submit(input) }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Describe a 3D model..."
          disabled={isGenerating}
          autoFocus
        />
        <button type="submit" disabled={isGenerating || !input.trim()}>
          ↑
        </button>
      </form>
    </div>
  )
}
