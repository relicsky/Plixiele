import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { streamCodingReply } from '../lib/codingClient.js'
import AiBrainToggle from './AiBrainToggle.jsx'
import { IconSend } from './Icons.jsx'

const EXAMPLES = [
  'Explain how async/await works in JavaScript',
  'Write a Python function to flatten a nested list',
  'What\'s the difference between useEffect and useLayoutEffect?',
  'How do I implement a binary search tree in TypeScript?',
  'Debug this React useEffect infinite loop pattern',
]

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {})
}

function CodeBlock({ lang, code }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="code-block">
      <div className="code-header">
        <span className="code-lang">{lang || 'code'}</span>
        <button className="code-copy" onClick={() => { copyToClipboard(code); setCopied(true); setTimeout(() => setCopied(false), 2000) }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <pre className="code-pre"><code>{code.trimEnd()}</code></pre>
    </div>
  )
}

function MsgContent({ text }) {
  if (!text) return null
  const parts = []
  const re = /```(\w*)\n?([\s\S]*?)```/g
  let last = 0, m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: 'text', v: text.slice(last, m.index) })
    parts.push({ t: 'code', lang: m[1], v: m[2] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) })

  return (
    <>
      {parts.map((p, i) => p.t === 'code'
        ? <CodeBlock key={i} lang={p.lang} code={p.v} />
        : <InlineText key={i} text={p.v} />
      )}
    </>
  )
}

function InlineText({ text }) {
  const segs = text.split(/(`[^`\n]+`)/)
  return (
    <p className="msg-text">
      {segs.map((s, i) =>
        s.startsWith('`') && s.endsWith('`')
          ? <code key={i} className="inline-code">{s.slice(1, -1)}</code>
          : s
      )}
    </p>
  )
}

export default function CodingBuddy() {
  const { activeSession, createSession, updateSession, aiBrain, aiVariant, plan } = useApp()
  const sess = activeSession.code
  const [messages, setMessages] = useState(sess?.messages || [])
  const [streamText, setStreamText] = useState('')
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const endRef = useRef(null)
  const sessRef = useRef(sess)
  const taRef = useRef(null)

  useEffect(() => {
    const s = activeSession.code
    setMessages(s?.messages || [])
    sessRef.current = s
  }, [activeSession.code?.id])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, streamText])

  function autoResize() {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
  }

  async function send(text) {
    if (!text.trim() || busy) return
    setInput('')
    if (taRef.current) taRef.current.style.height = 'auto'
    setBusy(true)
    setStreamText('')

    const userMsg = { role: 'user', content: text, ts: Date.now() }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)

    let currentSess = sessRef.current
    if (!currentSess) {
      currentSess = createSession('code')
      sessRef.current = currentSess
    }

    const apiMessages = newMsgs.map(m => ({ role: m.role, content: m.content }))

    try {
      const variant = aiVariant || (aiBrain === 'gemini'
        ? 'flash'
        : (plan === 'premium' ? 'premium' : 'pro'))
      await streamCodingReply(apiMessages, {
        brain: aiBrain,
        variant,
        onChunk: (full) => setStreamText(full),
        onDone: (full) => {
          const aMsg = { role: 'assistant', content: full, ts: Date.now() }
          const finalMsgs = [...newMsgs, aMsg]
          setMessages(finalMsgs)
          setStreamText('')
          updateSession(currentSess.id, {
            messages: finalMsgs,
            title: text.slice(0, 48),
          })
        },
      })
    } catch (e) {
      const errMsg = { role: 'assistant', content: `Error: ${e.message}`, isError: true, ts: Date.now() }
      setMessages(m => [...m, errMsg])
      setStreamText('')
    } finally {
      setBusy(false)
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <div className="mode-code">
      <div className="code-msgs">
        {messages.length === 0 && !busy && (
          <div className="empty-state">
            <div className="empty-icon">&lt;/&gt;</div>
            <h3>Coding Buddy</h3>
            <p>Ask about any language, framework, algorithm, or debugging problem.</p>
            <div className="examples">
              {EXAMPLES.map(ex => (
                <button key={ex} className="example-pill" onClick={() => send(ex)}>{ex}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`code-msg code-msg-${m.role}${m.isError ? ' bubble-err' : ''}`}>
            {m.role === 'assistant' && <div className="bubble-avatar">P</div>}
            <div className={`code-msg-body${m.role === 'user' ? ' user-body' : ''}`}>
              <MsgContent text={m.content} />
            </div>
          </div>
        ))}
        {busy && streamText && (
          <div className="code-msg code-msg-assistant">
            <div className="bubble-avatar">P</div>
            <div className="code-msg-body streaming">
              <MsgContent text={streamText} />
            </div>
          </div>
        )}
        {busy && !streamText && (
          <div className="code-msg code-msg-assistant">
            <div className="bubble-avatar">P</div>
            <div className="code-msg-body">
              <div className="bubble-loading">
                <span className="dot"/><span className="dot"/><span className="dot"/>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <AiBrainToggle />
      <div className="code-input-wrap">
        <textarea
          ref={taRef}
          value={input}
          onChange={e => { setInput(e.target.value); autoResize() }}
          onKeyDown={handleKey}
          placeholder="Ask anything about code… (Enter to send, Shift+Enter for newline)"
          disabled={busy}
          rows={1}
          className="code-input"
        />
        <button onClick={() => send(input)} disabled={busy || !input.trim()} className="send-btn send-btn-code">
          <IconSend />
        </button>
      </div>
    </div>
  )
}
