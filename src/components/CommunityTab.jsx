import { useState, useRef, useMemo, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { COMMUNITY_MODELS } from '../lib/communityModels.js'
import { useApp } from '../context/AppContext.jsx'

// ── mini viewer (single WebGL context per card, mounted on hover) ──
const V_DEF = `varying vec3 vNormal;varying vec3 vWorldPosition;void main(){vNormal=normalize(normalMatrix*normal);vWorldPosition=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`
const F_DEF = `uniform float uTime;varying vec3 vNormal;void main(){float f=pow(1.-abs(dot(vNormal,normalize(vec3(0,0,1)))),2.);gl_FragColor=vec4(mix(vec3(.1,.1,.4),vec3(.4,.7,1.),f),.9);}`

function MiniMesh({ modelData }) {
  const matRef = useRef()
  const groupRef = useRef()
  const hasParts = !!modelData.parts

  const firstPart = hasParts ? modelData.parts[0] : modelData
  const geo = useMemo(() => {
    try {
      const G = THREE[firstPart.geometry?.type || 'SphereGeometry']
      return new G(...(firstPart.geometry?.params || [1, 32, 32]))
    } catch { return new THREE.SphereGeometry(1, 32, 32) }
  }, [modelData.id || modelData.timestamp])

  const uni = useMemo(() => ({ uTime: { value: 0 } }), [])

  useFrame((s, dt) => {
    if (matRef.current) matRef.current.uniforms.uTime.value = s.clock.elapsedTime
    if (groupRef.current) groupRef.current.rotation.y += 0.5 * dt
  })

  return (
    <group ref={groupRef}>
      <mesh geometry={geo} scale={0.9}>
        <shaderMaterial ref={matRef} uniforms={uni}
          vertexShader={firstPart.vertexShader || V_DEF}
          fragmentShader={firstPart.fragmentShader || F_DEF}
          side={THREE.DoubleSide} transparent />
      </mesh>
    </group>
  )
}

function MiniViewer({ modelData }) {
  return (
    <Canvas camera={{ position: [0, 0, 3], fov: 45 }} gl={{ antialias: true, alpha: true }}
      style={{ width: '100%', height: '100%', display: 'block' }}>
      <color attach="background" args={['#05050e']} />
      <ambientLight intensity={0.5} />
      <pointLight position={[4, 4, 4]} intensity={2} />
      <Suspense fallback={null}>
        <MiniMesh modelData={modelData} />
      </Suspense>
      <OrbitControls enableZoom={false} enablePan={false} autoRotate={false} />
    </Canvas>
  )
}

function ModelCard({ model, isUserPost, onDelete }) {
  const [hovered, setHovered] = useState(false)
  const { setMode, setRenderer, setShaderLang, createSession, updateSession } = useApp()
  const hasHlsl = !!model.hlsl

  function loadGlsl() {
    const sess = createSession('model')
    const data = { ...model.modelData, timestamp: Date.now() }
    const aMsg = {
      role: 'assistant',
      content: `✦ ${data.description}${data.parts ? ` (${data.parts.length} parts)` : ''}`,
      modelData: data, ts: Date.now(),
    }
    updateSession(sess.id, { messages: [aMsg], modelData: data, title: model.title })
    setRenderer('threejs')
    setShaderLang('glsl')
    setMode('model')
  }

  function loadHlsl() {
    if (!model.hlsl) return
    const sess = createSession('model')
    const data = {
      ...model.modelData,
      hlslSource: model.hlsl,
      timestamp: Date.now(),
    }
    const aMsg = {
      role: 'assistant',
      content: `✦ ${data.description} — rendered with GLSL, HLSL shader available`,
      modelData: data, ts: Date.now(),
    }
    updateSession(sess.id, { messages: [aMsg], modelData: data, title: `${model.title} (HLSL)` })
    setRenderer('threejs')
    setShaderLang('glsl')
    setMode('model')
  }

  return (
    <div className="model-card" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      <div className="card-preview"
        style={{ background: hovered ? undefined : `linear-gradient(135deg, ${model.thumb[0]}, ${model.thumb[1]})` }}>
        {hovered && <MiniViewer modelData={model.modelData} />}
        {!hovered && (
          <div className="card-preview-icon">
            {model.modelData.parts ? `${model.modelData.parts.length}P` : '3D'}
          </div>
        )}
        {isUserPost && <span className="card-badge">Yours</span>}
      </div>
      <div className="card-body">
        <div className="card-title">{model.title}</div>
        <div className="card-desc">{model.modelData.description}</div>
        <div className="card-footer">
          <div className="card-tags">
            {model.tags.map(t => <span key={t} className="card-tag">{t}</span>)}
          </div>
          <div className="card-actions">
            {isUserPost && (
              <button className="card-del" title="Unpublish"
                onClick={() => onDelete?.(model.id)}>×</button>
            )}
            <button className="card-load card-load-glsl" onClick={loadGlsl}
              title="Load GLSL — runs in the 3D preview">↓ GLSL</button>
            {hasHlsl && (
              <button className="card-load card-load-hlsl" onClick={loadHlsl}
                title="Load HLSL — opens the shader code, ready for Unity / Unreal">↓ HLSL</button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CommunityTab() {
  const { user, communityPosts, unpublishCommunity } = useApp()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  const all = useMemo(() => {
    const myUid = user?.uid
    const userPosts = communityPosts.map(p => ({
      ...p,
      _community: true,
      _mine: !!p.authorUid ? p.authorUid === myUid : true,
    }))
    const featured = COMMUNITY_MODELS.map(m => ({ ...m, _community: false, _mine: false }))
    return [...userPosts, ...featured]
  }, [communityPosts, user])

  const myCount = all.filter(m => m._mine).length
  const communityCount = all.filter(m => m._community).length

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return all.filter(m => {
      if (filter === 'yours' && !m._mine) return false
      if (filter === 'community' && !m._community) return false
      if (filter === 'featured' && m._community) return false
      if (!q) return true
      return (
        m.title.toLowerCase().includes(q) ||
        (m.tags || []).some(t => t.toLowerCase().includes(q)) ||
        (m.modelData.description || '').toLowerCase().includes(q)
      )
    })
  }, [all, search, filter])

  return (
    <div className="community">
      <div className="community-header">
        <div>
          <h2 className="community-title">Community Gallery</h2>
          <p className="community-sub">Featured shader models — hover to preview, click Load to edit. Publish your own from the model viewer.</p>
        </div>
        <input
          className="community-search"
          placeholder="Search models…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="community-filterbar">
        <button className={`community-filter${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
          All <span>{all.length}</span>
        </button>
        <button className={`community-filter${filter === 'community' ? ' active' : ''}`} onClick={() => setFilter('community')}>
          Community <span>{communityCount}</span>
        </button>
        <button className={`community-filter${filter === 'yours' ? ' active' : ''}`} onClick={() => setFilter('yours')}>
          Yours <span>{myCount}</span>
        </button>
        <button className={`community-filter${filter === 'featured' ? ' active' : ''}`} onClick={() => setFilter('featured')}>
          Featured <span>{COMMUNITY_MODELS.length}</span>
        </button>
      </div>
      <div className="community-grid">
        {filtered.map(m => (
          <ModelCard key={m.id} model={m} isUserPost={m._mine}
            onDelete={unpublishCommunity} />
        ))}
        {filtered.length === 0 && (
          <p className="community-empty">
            {filter === 'yours'
              ? 'You haven\'t published any models yet. Generate one and click Publish.'
              : `No models match "${search}"`}
          </p>
        )}
      </div>
    </div>
  )
}
