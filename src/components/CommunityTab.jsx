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

function ModelCard({ model }) {
  const [hovered, setHovered] = useState(false)
  const { setMode, createSession, updateSession } = useApp()

  function loadModel() {
    const sess = createSession('model')
    const data = { ...model.modelData, timestamp: Date.now() }
    const aMsg = {
      role: 'assistant',
      content: `✦ ${data.description}${data.parts ? ` (${data.parts.length} parts)` : ''}`,
      modelData: data, ts: Date.now(),
    }
    updateSession(sess.id, { messages: [aMsg], modelData: data, title: model.title })
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
      </div>
      <div className="card-body">
        <div className="card-title">{model.title}</div>
        <div className="card-desc">{model.modelData.description}</div>
        <div className="card-footer">
          <div className="card-tags">
            {model.tags.map(t => <span key={t} className="card-tag">{t}</span>)}
          </div>
          <button className="card-load" onClick={loadModel}>Load →</button>
        </div>
      </div>
    </div>
  )
}

export default function CommunityTab() {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    if (!q) return COMMUNITY_MODELS
    return COMMUNITY_MODELS.filter(m =>
      m.title.toLowerCase().includes(q) ||
      m.tags.some(t => t.includes(q)) ||
      m.modelData.description.toLowerCase().includes(q)
    )
  }, [search])

  return (
    <div className="community">
      <div className="community-header">
        <div>
          <h2 className="community-title">Community Gallery</h2>
          <p className="community-sub">Featured shader models — hover to preview, click Load to edit</p>
        </div>
        <input
          className="community-search"
          placeholder="Search models…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="community-grid">
        {filtered.map(m => <ModelCard key={m.id} model={m} />)}
        {filtered.length === 0 && (
          <p className="community-empty">No models match "{search}"</p>
        )}
      </div>
    </div>
  )
}
