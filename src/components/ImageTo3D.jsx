import { useState, useRef, useEffect } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { generate3DFromImage } from '../lib/claudeClient.js'
import ThreeViewer from './ThreeViewer.jsx'
import CodeOutput from './CodeOutput.jsx'
import RendererSelect from './RendererSelect.jsx'
import ModelGallery from './ModelGallery.jsx'
import { IconUpload, IconSend } from './Icons.jsx'

const STATUS = { loading: 'Analyzing image…', writing: 'Generating…' }

function resizeImage(file, maxPx = 768) {
  return new Promise(resolve => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width: w, height: h } = img
      if (Math.max(w, h) > maxPx) {
        if (w > h) { h = Math.round(h * maxPx / w); w = maxPx }
        else { w = Math.round(w * maxPx / h); h = maxPx }
      }
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      c.toBlob(blob => {
        const r = new FileReader()
        r.onloadend = () => resolve({
          base64: r.result.split(',')[1],
          mimeType: 'image/jpeg',
          preview: c.toDataURL('image/jpeg', 0.85),
        })
        r.readAsDataURL(blob)
      }, 'image/jpeg', 0.85)
    }
    img.src = url
  })
}

export default function ImageTo3D() {
  const { activeSession, createSession, updateSession, renderer } = useApp()
  const sess = activeSession.image
  const [imgData, setImgData]   = useState(sess?.imageData || null)
  const [messages, setMessages] = useState(sess?.messages || [])
  const [modelData, setModelData] = useState(sess?.modelData || null)
  const [input, setInput]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [status, setStatus] = useState(null)
  const [drag, setDrag]     = useState(false)
  const endRef  = useRef(null)
  const sessRef = useRef(sess)
  const fileRef = useRef(null)

  useEffect(() => {
    const s = activeSession.image
    setImgData(s?.imageData || null)
    setMessages(s?.messages || [])
    setModelData(s?.modelData || null)
    sessRef.current = s
  }, [activeSession.image?.id])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, busy])

  async function handleFile(file) {
    if (!file?.type.startsWith('image/')) return
    setImgData(await resizeImage(file))
  }

  async function send(text) {
    if (!imgData || busy) return
    setInput('')
    setBusy(true)

    let s = sessRef.current
    const prompt = text.trim() || 'Create a 3D model inspired by this image.'
    const userMsg = { role: 'user', content: prompt, ts: Date.now() }
    const next = [...messages, userMsg]
    setMessages(next)

    if (!s) { s = createSession('image'); sessRef.current = s }

    try {
      const data = await generate3DFromImage(imgData.base64, imgData.mimeType, prompt, renderer, { onStatus: setStatus })
      const partsInfo = data.parts ? ` (${data.parts.length} parts)` : ''
      const aMsg = {
        role: 'assistant',
        content: `✦ ${data.description}${partsInfo}`,
        modelData: data, ts: Date.now(),
      }
      const final = [...next, aMsg]
      setMessages(final)
      setModelData(data)
      updateSession(s.id, { messages: final, modelData: data, imageData: imgData, title: `Image: ${prompt.slice(0, 36)}` })
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `Error: ${e.message}`, isError: true, ts: Date.now() }])
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  const is3D = renderer === 'threejs'

  return (
    <div className="mode-3d">
      <div className="chat-col">
        <div className="chat-col-header">
          <RendererSelect />
        </div>

        <div
          className={`img-drop${drag ? ' dragging' : ''}${imgData ? ' has-img' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => !imgData && fileRef.current?.click()}
        >
          {imgData ? (
            <div className="img-preview-wrap">
              <img src={imgData.preview} alt="uploaded" className="img-preview" />
              <button className="img-clear" onClick={e => { e.stopPropagation(); setImgData(null) }}>✕</button>
            </div>
          ) : (
            <div className="img-placeholder">
              <IconUpload />
              <span>Drop image or click to upload</span>
              <span className="img-hint">PNG · JPG · WEBP</span>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => handleFile(e.target.files[0])} />

        <div className="chat-msgs chat-msgs-flex">
          {messages.length === 0 && imgData && (
            <p className="img-ready-hint">Image ready — describe how to translate it to 3D, or just send.</p>
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
                <span className="status-txt">{STATUS[status] || 'Processing…'}</span>
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form className="chat-bar" onSubmit={e => { e.preventDefault(); send(input) }}>
          <input
            value={input} onChange={e => setInput(e.target.value)}
            placeholder={imgData ? 'Describe how to make it 3D…' : 'Upload an image first'}
            disabled={busy || !imgData}
          />
          <button type="submit" disabled={busy || !imgData} className="send-btn">
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
