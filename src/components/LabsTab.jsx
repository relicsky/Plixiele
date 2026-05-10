import { useState, useRef, useEffect, useMemo, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { useApp } from '../context/AppContext.jsx'
import { COMMUNITY_MODELS } from '../lib/communityModels.js'
import { buildGeometry } from '../lib/buildGeometry.js'
import SceneBuilder from './SceneBuilder.jsx'
import LabsHome from './LabsHome.jsx'
import SoundLab from './SoundLab.jsx'
import WeaponLab from './WeaponLab.jsx'

// ── shader re-use helper ──
const DEFAULT_V = `varying vec2 vUv;varying vec3 vNormal;varying vec3 vPosition;varying vec3 vWorldPosition;
void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);vPosition=position;vWorldPosition=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`
const DEFAULT_F = `uniform float uTime;varying vec3 vNormal;void main(){float f=pow(1.-abs(dot(vNormal,normalize(vec3(0,0,1)))),2.5);gl_FragColor=vec4(mix(vec3(.04,.1,.4),vec3(.4,.7,1.),f),.92);}`

function buildUniforms(u) {
  const base = { uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(1, 1) } }
  if (!u) return base
  for (const [k, d] of Object.entries(u)) {
    const v = d.value
    if (Array.isArray(v)) {
      base[k] = { value: v.length === 3 ? new THREE.Vector3(...v) : v.length === 2 ? new THREE.Vector2(...v) : v }
    } else { base[k] = { value: v } }
  }
  return base
}

// Live mesh that supports uniform updates without full recompile
function LabsMesh({ model, shaderKey }) {
  const matRef = useRef()
  const groupRef = useRef()
  const { size } = useThree()
  const part = model.parts ? model.parts[0] : model
  const geo = useMemo(() => buildGeometry(part.geometry),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shaderKey])

  const initUniforms = useMemo(() => buildUniforms(part.uniforms), [shaderKey])

  // Live-update uniforms without shader recompile
  useEffect(() => {
    if (!matRef.current || !part.uniforms) return
    for (const [k, d] of Object.entries(part.uniforms)) {
      const u = matRef.current.uniforms[k]
      if (!u) continue
      const v = d.value
      if (Array.isArray(v) && u.value?.isVector3) u.value.set(v[0], v[1], v[2])
      else if (Array.isArray(v) && u.value?.isVector2) u.value.set(v[0], v[1])
      else u.value = v
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part.uniforms])

  useFrame((s, dt) => {
    if (matRef.current?.uniforms) {
      matRef.current.uniforms.uTime.value = s.clock.elapsedTime
      matRef.current.uniforms.uResolution?.value.set(size.width, size.height)
    }
    if (groupRef.current && model.animation) {
      const { rotationX: x = 0, rotationY: y = 0.3, rotationZ: z = 0 } = model.animation
      groupRef.current.rotation.x += x * dt
      groupRef.current.rotation.y += y * dt
      groupRef.current.rotation.z += z * dt
    }
  })

  return (
    <group ref={groupRef}>
      <mesh geometry={geo}>
        <shaderMaterial ref={matRef} key={shaderKey}
          vertexShader={part.vertexShader || DEFAULT_V}
          fragmentShader={part.fragmentShader || DEFAULT_F}
          uniforms={initUniforms}
          side={THREE.DoubleSide} transparent />
      </mesh>
    </group>
  )
}

function LabsCanvas({ model, shaderKey }) {
  return (
    <Canvas camera={{ position: [0, 0.5, 3.5], fov: 48 }} gl={{ antialias: true, preserveDrawingBuffer: true }}>
      <color attach="background" args={['#04040e']} />
      <ambientLight intensity={0.4} />
      <pointLight position={[5, 5, 5]} intensity={2} />
      <pointLight position={[-4, -3, -4]} intensity={0.6} color="#5060ff" />
      <Stars radius={80} depth={40} count={2000} factor={3} />
      <Suspense fallback={null}><LabsMesh model={model} shaderKey={shaderKey} /></Suspense>
      <OrbitControls enableDamping dampingFactor={0.06} />
    </Canvas>
  )
}

// ── Uniform control ──
function UniformControl({ name, def, onChange }) {
  const v = def.value
  const isColor = Array.isArray(v) && v.length === 3 && v.every(x => x >= 0 && x <= 1)
  const isFloat = typeof v === 'number'

  if (isColor) {
    const hex = '#' + v.map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('')
    return (
      <div className="uni-row">
        <span className="uni-name">{name}</span>
        <input type="color" value={hex} className="uni-color"
          onChange={e => {
            const r = parseInt(e.target.value.slice(1, 3), 16) / 255
            const g = parseInt(e.target.value.slice(3, 5), 16) / 255
            const b = parseInt(e.target.value.slice(5, 7), 16) / 255
            onChange(name, { value: [r, g, b] })
          }} />
        <span className="uni-val">{v.map(x => x.toFixed(2)).join(', ')}</span>
      </div>
    )
  }

  if (isFloat) {
    return (
      <div className="uni-row">
        <span className="uni-name">{name}</span>
        <input type="range" min="0" max="10" step="0.1" value={v} className="uni-slider"
          onChange={e => onChange(name, { value: parseFloat(e.target.value) })} />
        <span className="uni-val">{v.toFixed(2)}</span>
      </div>
    )
  }

  return null
}

// ── Main Labs component ──
const FEATURE_TITLES = { scene: 'Scene Builder', shader: 'Shader Lab', sound: 'Sound Lab', weapon: 'Weapon Generator' }

export default function LabsTab() {
  const [active, setActive] = useState(null)

  if (!active) {
    return (
      <div className="labs-shell">
        <LabsHome onPick={setActive} />
      </div>
    )
  }

  return (
    <div className="labs-shell">
      <div className="labs-topbar">
        <button className="labs-back" onClick={() => setActive(null)}>← Back to Labs</button>
        <span className="labs-crumb">{FEATURE_TITLES[active]}</span>
      </div>
      {active === 'scene' && <SceneBuilder />}
      {active === 'shader' && <ShaderLab />}
      {active === 'sound' && <SoundLab />}
      {active === 'weapon' && <WeaponLab />}
    </div>
  )
}

function ShaderLab() {
  const { sessions } = useApp()
  const [model, setModel] = useState(null)
  const [editedModel, setEditedModel] = useState(null)
  const [shaderKey, setShaderKey] = useState(0)
  const [vertSrc, setVertSrc] = useState('')
  const [fragSrc, setFragSrc] = useState('')
  const [shaderTab, setShaderTab] = useState('frag')
  const [showShader, setShowShader] = useState(false)

  const displayModel = editedModel || model

  function loadModel(m) {
    const data = { ...m.modelData, timestamp: Date.now() }
    setModel(data)
    setEditedModel(null)
    const part = data.parts ? data.parts[0] : data
    setVertSrc(part.vertexShader || DEFAULT_V)
    setFragSrc(part.fragmentShader || DEFAULT_F)
    setShaderKey(k => k + 1)
  }

  function applyShaders() {
    if (!model) return
    const base = editedModel || model
    if (base.parts) {
      const parts = base.parts.map((p, i) => i === 0 ? { ...p, vertexShader: vertSrc, fragmentShader: fragSrc } : p)
      setEditedModel({ ...base, parts, timestamp: Date.now() })
    } else {
      setEditedModel({ ...base, vertexShader: vertSrc, fragmentShader: fragSrc, timestamp: Date.now() })
    }
    setShaderKey(k => k + 1)
  }

  function updateUniform(name, def) {
    const base = editedModel || model
    if (!base) return
    // Update uniformS without changing shaderKey (no recompile)
    if (base.parts) {
      const parts = base.parts.map((p, i) =>
        i === 0 ? { ...p, uniforms: { ...(p.uniforms || {}), [name]: def } } : p
      )
      setEditedModel({ ...base, parts })
    } else {
      setEditedModel({ ...base, uniforms: { ...(base.uniforms || {}), [name]: def } })
    }
  }

  function resetEdits() {
    setEditedModel(null)
    const part = model?.parts ? model.parts[0] : model
    setVertSrc(part?.vertexShader || DEFAULT_V)
    setFragSrc(part?.fragmentShader || DEFAULT_F)
    setShaderKey(k => k + 1)
  }

  const part = displayModel?.parts ? displayModel.parts[0] : displayModel
  const uniformEntries = part?.uniforms ? Object.entries(part.uniforms) : []
  const hasEdits = !!editedModel

  const recentSessions = sessions.filter(s => s.modelData && (s.mode === 'model' || s.mode === 'image')).slice(0, 5)

  return (
    <div className="labs">
      <div className="labs-sidebar">
        <div className="labs-section">
          <div className="labs-section-title">Load Model</div>
          <div className="labs-model-list">
            {recentSessions.map(s => (
              <button key={s.id} className={`labs-model-item${model?.id === s.id ? ' active' : ''}`}
                onClick={() => loadModel({ modelData: s.modelData, id: s.id })}>
                <span>🕐</span> {s.title}
              </button>
            ))}
            <div className="labs-divider">Featured</div>
            {COMMUNITY_MODELS.map(m => (
              <button key={m.id} className={`labs-model-item${model?.communityId === m.id ? ' active' : ''}`}
                onClick={() => loadModel({ ...m, modelData: { ...m.modelData, communityId: m.id } })}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: `linear-gradient(135deg,${m.thumb[0]},${m.thumb[1]})`, display: 'inline-block', marginRight: 4 }} />
                {m.title}
              </button>
            ))}
          </div>
        </div>

        {displayModel && (
          <>
            <div className="labs-section">
              <div className="labs-section-title">Uniforms {hasEdits && <span className="labs-edited">●</span>}</div>
              {uniformEntries.length === 0 && <p className="labs-hint">No editable uniforms</p>}
              {uniformEntries.map(([k, d]) => (
                <UniformControl key={k} name={k} def={d} onChange={updateUniform} />
              ))}
            </div>

            <div className="labs-section">
              <div className="labs-section-title-row">
                <button className="labs-section-title labs-toggle" onClick={() => setShowShader(s => !s)}>
                  {showShader ? '▾' : '▸'} Shader Source
                </button>
                {hasEdits && <button className="labs-reset" onClick={resetEdits}>Reset</button>}
              </div>
              {showShader && (
                <div className="labs-editor">
                  <div className="labs-tabs">
                    <button className={shaderTab === 'vert' ? 'active' : ''} onClick={() => setShaderTab('vert')}>Vertex</button>
                    <button className={shaderTab === 'frag' ? 'active' : ''} onClick={() => setShaderTab('frag')}>Fragment</button>
                  </div>
                  <textarea
                    className="labs-code"
                    value={shaderTab === 'vert' ? vertSrc : fragSrc}
                    onChange={e => shaderTab === 'vert' ? setVertSrc(e.target.value) : setFragSrc(e.target.value)}
                    spellCheck={false}
                    rows={12}
                  />
                  <button className="labs-apply" onClick={applyShaders}>▶ Apply Shaders</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <div className="labs-canvas">
        {displayModel
          ? <LabsCanvas model={displayModel} shaderKey={shaderKey} />
          : (
            <div className="labs-empty">
              <div className="labs-empty-icon">⚗</div>
              <h3>Shader Labs</h3>
              <p>Select a model from the left to start tweaking uniforms and shaders in real-time.</p>
            </div>
          )
        }
      </div>
    </div>
  )
}
