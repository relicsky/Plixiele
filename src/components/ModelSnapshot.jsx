import { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { buildGeometry } from '../lib/buildGeometry.js'

// Render a 3D model into a hidden Canvas, capture one frame as PNG, then
// replace the Canvas with an <img>. Lets community/featured grids show real
// model snapshots without holding a WebGL context per card forever.
//
// Falls back to a gradient if modelData is missing, capture fails, or the
// browser refuses (e.g., out of WebGL contexts).

const VERT_DEF = `varying vec2 vUv;varying vec3 vNormal;varying vec3 vPosition;varying vec3 vWorldPosition;
void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);vPosition=position;vWorldPosition=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`
const FRAG_DEF = `uniform float uTime;varying vec3 vNormal;varying vec3 vWorldPosition;
void main(){float f=pow(1.-abs(dot(vNormal,normalize(vec3(0,0,1)))),2.5);vec3 c=mix(vec3(.06,.14,.5),vec3(.4,.7,1.),f);gl_FragColor=vec4(c,.95);}`

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

function SnapshotPart({ part }) {
  const geo = useMemo(() => buildGeometry(part.geometry), [part])
  const uni = useMemo(() => buildUniforms(part.uniforms), [part])
  return (
    <mesh
      geometry={geo}
      position={part.position || [0, 0, 0]}
      rotation={part.rotation || [0, 0, 0]}
      scale={part.scale || [1, 1, 1]}
    >
      <shaderMaterial
        uniforms={uni}
        vertexShader={part.vertexShader || VERT_DEF}
        fragmentShader={part.fragmentShader || FRAG_DEF}
        side={THREE.DoubleSide}
        transparent
      />
    </mesh>
  )
}

function SnapshotMesh({ modelData }) {
  if (modelData.parts) {
    return <group>{modelData.parts.map((p, i) => <SnapshotPart key={p.name || i} part={p} />)}</group>
  }
  return <SnapshotPart part={modelData} />
}

// Captures one frame after the scene is laid out and shaders compile.
function Capturer({ onCaptured }) {
  const { gl, scene, camera } = useThree()
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    let cancelled = false
    let frames = 0
    function tick() {
      if (cancelled || fired.current) return
      try { gl.render(scene, camera) } catch { /* shader compile retry next frame */ }
      frames++
      // Two-frame settle: first frame triggers compile, second captures the
      // actually-rendered pixels.
      if (frames < 3) {
        requestAnimationFrame(tick)
      } else {
        fired.current = true
        try {
          const url = gl.domElement.toDataURL('image/png')
          onCaptured(url)
        } catch (e) {
          onCaptured(null)
        }
      }
    }
    requestAnimationFrame(tick)
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

export default function ModelSnapshot({ modelData, fallbackColors = ['#1a0a4a', '#7cf'], className = '' }) {
  const [pngUrl, setPngUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  const gradient = `linear-gradient(135deg, ${fallbackColors[0]}, ${fallbackColors[1]})`

  if (!modelData) {
    return <div className={`model-snapshot-fallback ${className}`} style={{ background: gradient }} />
  }
  if (pngUrl) {
    return <img src={pngUrl} alt="" className={`model-snapshot-img ${className}`} loading="lazy" />
  }
  if (failed) {
    return <div className={`model-snapshot-fallback ${className}`} style={{ background: gradient }} />
  }

  return (
    <div className={`model-snapshot ${className}`}>
      <Canvas
        camera={{ position: [0, 0.5, 3.5], fov: 48 }}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: false }}
        style={{ width: '100%', height: '100%', display: 'block' }}
        dpr={[1, 1.5]}
      >
        <color attach="background" args={['#0a0a18']} />
        <ambientLight intensity={0.55} />
        <pointLight position={[4, 4, 4]} intensity={2.2} />
        <pointLight position={[-3, -2, -3]} intensity={0.6} color="#5060ff" />
        <Suspense fallback={null}>
          <SnapshotMesh modelData={modelData} />
        </Suspense>
        <Capturer onCaptured={(url) => { if (url) setPngUrl(url); else setFailed(true) }} />
      </Canvas>
    </div>
  )
}
