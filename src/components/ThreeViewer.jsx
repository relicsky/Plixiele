import { useRef, useMemo, useState, useEffect, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import { downloadModelGLB } from '../lib/exportGLB.js'
import PublishDialog from './PublishDialog.jsx'

const DEFAULT_VERT = `varying vec2 vUv;varying vec3 vNormal;varying vec3 vPosition;varying vec3 vWorldPosition;
void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);vPosition=position;vWorldPosition=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`

const DEFAULT_FRAG = `uniform float uTime;varying vec2 vUv;varying vec3 vNormal;varying vec3 vWorldPosition;
void main(){float f=pow(1.-abs(dot(vNormal,normalize(vec3(0,0,1)))),2.5);vec3 c=mix(vec3(.06,.14,.5),vec3(.4,.7,1.),f);gl_FragColor=vec4(c*(sin(uTime*1.2)*.12+.88),.92);}`

function buildUniforms(u) {
  const base = { uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(1, 1) } }
  if (!u) return base
  for (const [k, d] of Object.entries(u)) {
    const v = d.value
    if (Array.isArray(v)) {
      base[k] = {
        value: v.length === 2 ? new THREE.Vector2(v[0], v[1])
              : v.length === 3 ? new THREE.Vector3(v[0], v[1], v[2])
              : new THREE.Vector4(v[0], v[1], v[2], v[3] ?? 1)
      }
    } else { base[k] = { value: v } }
  }
  return base
}

function makeGeomSafe(geomDef) {
  try {
    const G = THREE[geomDef?.type]
    if (typeof G !== 'function') return new THREE.SphereGeometry(1, 48, 48)
    return new G(...(geomDef.params || []))
  } catch { return new THREE.SphereGeometry(1, 48, 48) }
}

function SingleModel({ modelData }) {
  const meshRef = useRef()
  const matRef = useRef()
  const { size } = useThree()
  const geo = useMemo(() => makeGeomSafe(modelData.geometry), [modelData.timestamp])
  const uni = useMemo(() => buildUniforms(modelData.uniforms), [modelData.timestamp])

  useFrame((s, dt) => {
    if (matRef.current?.uniforms) {
      matRef.current.uniforms.uTime.value = s.clock.elapsedTime
      matRef.current.uniforms.uResolution?.value.set(size.width, size.height)
    }
    if (meshRef.current && modelData.animation) {
      const { rotationX: x = 0, rotationY: y = 0.3, rotationZ: z = 0 } = modelData.animation
      meshRef.current.rotation.x += x * dt
      meshRef.current.rotation.y += y * dt
      meshRef.current.rotation.z += z * dt
    }
  })

  return (
    <mesh ref={meshRef} geometry={geo}>
      <shaderMaterial ref={matRef} key={modelData.timestamp}
        vertexShader={modelData.vertexShader || DEFAULT_VERT}
        fragmentShader={modelData.fragmentShader || DEFAULT_FRAG}
        uniforms={uni} side={THREE.DoubleSide} transparent />
    </mesh>
  )
}

function Part({ part, stamp }) {
  const matRef = useRef()
  const { size } = useThree()
  const geo = useMemo(() => makeGeomSafe(part.geometry), [stamp, part.name])
  const uni = useMemo(() => buildUniforms(part.uniforms), [stamp, part.name])

  useFrame((s) => {
    if (matRef.current?.uniforms) {
      matRef.current.uniforms.uTime.value = s.clock.elapsedTime
      matRef.current.uniforms.uResolution?.value.set(size.width, size.height)
    }
  })

  return (
    <mesh geometry={geo}
      position={part.position || [0, 0, 0]}
      rotation={part.rotation || [0, 0, 0]}
      scale={part.scale || [1, 1, 1]}>
      <shaderMaterial ref={matRef} key={`${stamp}_${part.name}`}
        vertexShader={part.vertexShader || DEFAULT_VERT}
        fragmentShader={part.fragmentShader || DEFAULT_FRAG}
        uniforms={uni} side={THREE.DoubleSide} transparent />
    </mesh>
  )
}

function MultiModel({ modelData }) {
  const groupRef = useRef()
  useFrame((_, dt) => {
    if (groupRef.current && modelData.animation) {
      const { rotationX: x = 0, rotationY: y = 0.3, rotationZ: z = 0 } = modelData.animation
      groupRef.current.rotation.x += x * dt
      groupRef.current.rotation.y += y * dt
      groupRef.current.rotation.z += z * dt
    }
  })
  return (
    <group ref={groupRef}>
      {modelData.parts.map((p, i) => (
        <Part key={`${modelData.timestamp}_${i}`} part={p} stamp={modelData.timestamp} />
      ))}
    </group>
  )
}

function Idle() {
  const ref = useRef()
  const mRef = useRef()
  const uni = useMemo(() => ({ uTime: { value: 0 } }), [])
  useFrame((s) => {
    if (mRef.current) mRef.current.uniforms.uTime.value = s.clock.elapsedTime
    if (ref.current) ref.current.rotation.y += 0.004
  })
  return (
    <mesh ref={ref}>
      <icosahedronGeometry args={[1, 2]} />
      <shaderMaterial ref={mRef} uniforms={uni} vertexShader={DEFAULT_VERT} fragmentShader={DEFAULT_FRAG} wireframe transparent />
    </mesh>
  )
}

// Exposes Three.js context to parent for screenshots
function ContextBridge({ onReady }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    onReady({ gl, scene, camera })
    return () => onReady(null)
  }, [gl, scene, camera])
  return null
}

export default function ThreeViewer({ modelData, isGenerating }) {
  const [wireframe, setWireframe] = useState(false)
  const [showDl, setShowDl] = useState(false)
  const [threeCtx, setThreeCtx] = useState(null)
  const [publishOpen, setPublishOpen] = useState(false)
  const [justPublished, setJustPublished] = useState(false)

  function downloadPNG() {
    setShowDl(false)
    if (!threeCtx) return
    threeCtx.gl.render(threeCtx.scene, threeCtx.camera)
    const a = document.createElement('a')
    a.download = 'plixie-render.png'
    a.href = threeCtx.gl.domElement.toDataURL('image/png')
    a.click()
  }

  async function downloadGLB() {
    setShowDl(false)
    if (!modelData) return
    try { await downloadModelGLB(modelData, 'plixie-model.glb') }
    catch (e) { console.error('GLB export failed', e) }
  }

  return (
    <div className="viewer" onClick={() => showDl && setShowDl(false)}>
      <div className="viewer-toolbar">
        <button className="viewer-btn" onClick={() => setWireframe(w => !w)}>
          {wireframe ? '■ Solid' : '⬡ Wire'}
        </button>

        {modelData && (
          <>
            <div className="dl-wrap" onClick={e => e.stopPropagation()}>
              <button className="viewer-btn viewer-btn-accent" onClick={() => setShowDl(d => !d)}>
                ↓ Download
              </button>
              {showDl && (
                <div className="dl-dropdown">
                  <div className="dl-row">
                    <span className="dl-icon">📷</span>
                    <div className="dl-info">
                      <span className="dl-name">PNG</span>
                      <span className="dl-desc">Screenshot of the current view</span>
                    </div>
                    <button className="dl-go" onClick={downloadPNG} title="Download PNG">↓</button>
                  </div>
                  <div className="dl-row">
                    <span className="dl-icon">📦</span>
                    <div className="dl-info">
                      <span className="dl-name">GLB</span>
                      <span className="dl-desc">3D model for Blender, Unity, etc.</span>
                    </div>
                    <button className="dl-go" onClick={downloadGLB} title="Download GLB">↓</button>
                  </div>
                </div>
              )}
            </div>
            <button className="viewer-btn" onClick={() => setPublishOpen(true)} disabled={justPublished}>
              {justPublished ? '✓ Published' : '⇧ Publish'}
            </button>
          </>
        )}

        {modelData?.description && (
          <span className="viewer-info">{modelData.description}</span>
        )}
        {modelData?.parts && (
          <span className="viewer-parts">{modelData.parts.length} parts</span>
        )}
      </div>

      {isGenerating && (
        <div className="viewer-overlay">
          <div className="viewer-spinner" />
          <span>Generating model…</span>
        </div>
      )}

      <Canvas camera={{ position: [0, 1.2, 4.5], fov: 48 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}>
        <color attach="background" args={['#050510']} />
        <ambientLight intensity={1.8} />
        <pointLight position={[6, 6, 6]} intensity={4} />
        <pointLight position={[-6, -4, -6]} intensity={2} color="#6080ff" />
        <pointLight position={[0, -5, 0]} intensity={1.2} color="#ff8040" />
        <Stars radius={100} depth={50} count={3500} factor={4} />
        <Suspense fallback={null}>
          {modelData
            ? (modelData.parts
                ? <MultiModel key={`mp_${modelData.timestamp}`} modelData={modelData} />
                : <SingleModel key={`sm_${modelData.timestamp}`} modelData={modelData} />)
            : <Idle />
          }
        </Suspense>
        <OrbitControls enableDamping dampingFactor={0.06} />
        <ContextBridge onReady={setThreeCtx} />
      </Canvas>
      {publishOpen && (
        <PublishDialog modelData={modelData}
          onClose={(ok) => {
            setPublishOpen(false)
            if (ok) {
              setJustPublished(true)
              setTimeout(() => setJustPublished(false), 2200)
            }
          }} />
      )}
    </div>
  )
}
