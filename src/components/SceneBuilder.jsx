import { useState, useMemo, useRef, useEffect, Suspense } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Grid } from '@react-three/drei'
import * as THREE from 'three'
import { useApp } from '../context/AppContext.jsx'
import { COMMUNITY_MODELS } from '../lib/communityModels.js'
import { generateScene } from '../lib/sceneClient.js'
import { downloadSceneGLB } from '../lib/exportGLB.js'
import { buildGeometry } from '../lib/buildGeometry.js'

const TERRAIN_SIZE = 24
const TERRAIN_SEG = 60

function terrainHeight(x, z) {
  return Math.sin(x * 0.45) * 0.55
       + Math.cos(z * 0.38) * 0.6
       + Math.sin((x + z) * 0.22) * 0.35
       + Math.cos(x * 0.13 - z * 0.17) * 0.3
}

function buildTerrainGeometry() {
  const geo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEG, TERRAIN_SEG)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    pos.setY(i, terrainHeight(x, z))
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

const DEFAULT_V = `varying vec2 vUv;varying vec3 vNormal;varying vec3 vPosition;varying vec3 vWorldPosition;
void main(){vUv=uv;vNormal=normalize(normalMatrix*normal);vPosition=position;vWorldPosition=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`
const DEFAULT_F = `uniform float uTime;varying vec3 vNormal;void main(){float f=pow(1.-abs(dot(vNormal,normalize(vec3(0,0,1)))),2.5);gl_FragColor=vec4(mix(vec3(.04,.1,.4),vec3(.4,.7,1.),f),.92);}`

// Geometry construction is shared via src/lib/buildGeometry.js — see that file
// to add new types (Lathe, Extrude, etc.).
const makeGeom = buildGeometry

function buildUniforms(u) {
  const base = { uTime: { value: 0 }, uResolution: { value: new THREE.Vector2(1, 1) } }
  if (!u) return base
  for (const [k, d] of Object.entries(u)) {
    const v = d.value
    if (Array.isArray(v)) {
      base[k] = {
        value: v.length === 2 ? new THREE.Vector2(v[0], v[1])
              : v.length === 3 ? new THREE.Vector3(v[0], v[1], v[2])
              : new THREE.Vector4(v[0], v[1], v[2], v[3] ?? 1),
      }
    } else { base[k] = { value: v } }
  }
  return base
}

function PartMesh({ part }) {
  const matRef = useRef()
  const { size } = useThree()
  const geo = useMemo(() => makeGeom(part.geometry), [part])
  const uni = useMemo(() => buildUniforms(part.uniforms), [part])
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
      <shaderMaterial ref={matRef}
        vertexShader={part.vertexShader || DEFAULT_V}
        fragmentShader={part.fragmentShader || DEFAULT_F}
        uniforms={uni} side={THREE.DoubleSide} transparent />
    </mesh>
  )
}

function ModelGroup({ modelData }) {
  if (!modelData) return null
  if (Array.isArray(modelData.parts)) {
    return <>{modelData.parts.map((p, i) => <PartMesh key={i} part={p} />)}</>
  }
  return <PartMesh part={modelData} />
}

function SceneItem({ item, selected, onSelect }) {
  return (
    <group
      position={item.position}
      rotation={item.rotation}
      scale={item.scale}
      onClick={(e) => { e.stopPropagation(); onSelect(item.id) }}
    >
      <ModelGroup modelData={item.modelData} />
      {selected && (
        <mesh>
          <boxGeometry args={[2.2, 2.2, 2.2]} />
          <meshBasicMaterial color="#7cf" wireframe transparent opacity={0.35} />
        </mesh>
      )}
    </group>
  )
}

function Terrain() {
  const geo = useMemo(() => buildTerrainGeometry(), [])
  return (
    <mesh geometry={geo} receiveShadow>
      <meshStandardMaterial
        color="#1a3a2a" roughness={0.95} metalness={0}
        flatShading
      />
    </mesh>
  )
}

function ContextBridge({ onReady }) {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    onReady({ gl, scene, camera })
    return () => onReady(null)
  }, [gl, scene, camera])
  return null
}

function SceneCanvas({ items, background, selectedId, onSelect, terrain, onCtx }) {
  return (
    <Canvas camera={{ position: [8, 6, 10], fov: 48 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onPointerMissed={() => onSelect(null)}>
      <color attach="background" args={[background || '#04040e']} />
      <ambientLight intensity={1.4} />
      <pointLight position={[8, 10, 8]} intensity={3} />
      <pointLight position={[-6, -3, -6]} intensity={1.4} color="#5060ff" />
      {terrain
        ? <Terrain />
        : <Grid args={[30, 30]} cellColor="#222" sectionColor="#444" sectionThickness={1} fadeDistance={40} infiniteGrid />
      }
      <Suspense fallback={null}>
        {items.map(it => (
          <SceneItem key={it.id} item={it} selected={selectedId === it.id} onSelect={onSelect} />
        ))}
      </Suspense>
      <OrbitControls enableDamping dampingFactor={0.06} />
      <ContextBridge onReady={onCtx} />
    </Canvas>
  )
}

function NumRow({ label, values, onChange, step = 0.1 }) {
  return (
    <div className="scene-num-row">
      <span className="scene-num-label">{label}</span>
      {['x', 'y', 'z'].map((axis, i) => (
        <input key={axis} type="number" step={step} value={values[i].toFixed(2)}
          onChange={e => {
            const next = [...values]
            next[i] = parseFloat(e.target.value) || 0
            onChange(next)
          }} />
      ))}
    </div>
  )
}

let _idc = 0
const newId = () => `it_${Date.now().toString(36)}_${(_idc++).toString(36)}`

const AUTO_PROMPTS = [
  'an ancient mystical forest with floating crystals, ruins, and glowing artifacts',
  'a cosmic shrine on a windswept mesa with crystals, pillars, and orbiting motes',
  'a surreal alien garden of bioluminescent flora and twisted obelisks',
  'a celestial observatory with telescopes, glowing orbs, and runic monoliths',
  'a sunken cavern altar with crystals, broken statues, and deep pools of light',
  'a cyberpunk plaza with monoliths, holograms, and abstract neon sculptures',
  'a high-fantasy hilltop with crystal trees, runestones, and a centerpiece spire',
  'a dreamlike floating archipelago with arches, lanterns, and tall standing stones',
]
const pickPrompt = () => AUTO_PROMPTS[Math.floor(Math.random() * AUTO_PROMPTS.length)]

function spreadPosition(i) {
  const cols = 4
  const x = ((i % cols) - cols / 2 + 0.5) * 3
  const z = (Math.floor(i / cols) - 1) * 3
  return [x, 0.5, z]
}

export default function SceneBuilder() {
  const { sessions, communityPosts, savedScenes, persistScene, removeScene } = useApp()
  const [items, setItems] = useState([])
  const [background, setBackground] = useState('#04040e')
  const [prompt, setPrompt] = useState('')
  const [sceneTitle, setSceneTitle] = useState('Untitled scene')
  const [activeSceneId, setActiveSceneId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [downloading, setDownloading] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [librarySearch, setLibrarySearch] = useState('')
  const [showLibrary, setShowLibrary] = useState(true)
  const [showSaved, setShowSaved] = useState(true)
  const [terrain, setTerrain] = useState(false)
  const [threeCtx, setThreeCtx] = useState(null)

  const sessionLib = useMemo(
    () => sessions
      .filter(s => s.modelData && (s.mode === 'model' || s.mode === 'image'))
      .map(s => ({
        id: `sess:${s.id}`,
        title: s.title,
        description: s.modelData.description || s.title,
        modelData: s.modelData,
        kind: 'session',
      })),
    [sessions],
  )

  const userCommunityLib = useMemo(
    () => communityPosts.map(p => ({
      id: `user:${p.id}`,
      title: p.title,
      description: p.modelData.description || p.title,
      modelData: p.modelData,
      kind: 'user',
    })),
    [communityPosts],
  )

  const featuredLib = useMemo(
    () => COMMUNITY_MODELS.map(m => ({
      id: `comm:${m.id}`,
      title: m.title,
      description: m.modelData.description || m.title,
      modelData: m.modelData,
      kind: 'featured',
    })),
    [],
  )

  const fullLib = useMemo(
    () => [...sessionLib, ...userCommunityLib, ...featuredLib],
    [sessionLib, userCommunityLib, featuredLib],
  )
  const libById = useMemo(() => Object.fromEntries(fullLib.map(m => [m.id, m])), [fullLib])

  const filteredLib = useMemo(() => {
    const q = librarySearch.trim().toLowerCase()
    if (!q) return fullLib
    return fullLib.filter(m =>
      m.title.toLowerCase().includes(q) ||
      (m.description || '').toLowerCase().includes(q),
    )
  }, [fullLib, librarySearch])

  const grouped = useMemo(() => ({
    session: filteredLib.filter(m => m.kind === 'session'),
    user: filteredLib.filter(m => m.kind === 'user'),
    featured: filteredLib.filter(m => m.kind === 'featured'),
  }), [filteredLib])

  const selected = items.find(i => i.id === selectedId) || null

  function snapToTerrain(pos, scale = [1, 1, 1]) {
    if (!terrain) return pos
    const [x, , z] = pos
    const sy = Array.isArray(scale) ? scale[1] : scale
    return [x, terrainHeight(x, z) + 0.5 * sy, z]
  }

  function addFromLib(libId) {
    const lib = libById[libId]
    if (!lib) return
    const basePos = spreadPosition(items.length)
    const next = {
      id: newId(),
      ref: libId,
      label: lib.title,
      modelData: lib.modelData,
      position: snapToTerrain(basePos),
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    }
    setItems(prev => [...prev, next])
    setSelectedId(next.id)
  }

  function patchItem(id, patch) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it))
  }

  function removeItem(id) {
    setItems(prev => prev.filter(it => it.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  function duplicateItem(id) {
    const it = items.find(i => i.id === id)
    if (!it) return
    const copy = {
      ...it,
      id: newId(),
      position: [it.position[0] + 1.5, it.position[1], it.position[2]],
    }
    setItems(prev => [...prev, copy])
    setSelectedId(copy.id)
  }

  function clearAll() {
    if (items.length > 0 && !confirm('Clear all items from this scene?')) return
    setItems([])
    setSelectedId(null)
    setActiveSceneId(null)
    setSceneTitle('Untitled scene')
  }

  function saveCurrentScene() {
    if (items.length === 0) return
    const stripped = items.map(({ modelData, ...rest }) => rest)
    const saved = persistScene({
      id: activeSceneId || undefined,
      title: sceneTitle.trim() || 'Untitled scene',
      items: stripped,
      background,
      prompt,
    })
    setActiveSceneId(saved.id)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1600)
  }

  function loadScene(scene) {
    const rehydrated = (scene.items || []).map(it => {
      const lib = libById[it.ref]
      if (!lib) return null
      return { ...it, id: it.id || newId(), label: lib.title, modelData: lib.modelData }
    }).filter(Boolean)
    setItems(rehydrated)
    setBackground(scene.background || '#04040e')
    setPrompt(scene.prompt || '')
    setSceneTitle(scene.title || 'Untitled scene')
    setActiveSceneId(scene.id)
    setSelectedId(null)
    if (rehydrated.length < (scene.items || []).length) {
      setError('Some items referenced models that are no longer available and were skipped.')
    } else {
      setError('')
    }
  }

  function newScene() {
    setItems([])
    setSelectedId(null)
    setActiveSceneId(null)
    setSceneTitle('Untitled scene')
    setPrompt('')
    setError('')
  }

  async function runGenerateWith(thePrompt, withTerrain) {
    if (!thePrompt.trim()) return
    setBusy(true)
    setError('')
    try {
      const data = await generateScene(thePrompt, fullLib, { terrain: withTerrain })
      const next = (data.items || []).map((it, i) => {
        const lib = libById[it.ref]
        if (!lib) return null
        const scaleArr = Array.isArray(it.scale)
          ? it.scale
          : typeof it.scale === 'number'
            ? [it.scale, it.scale, it.scale]
            : [1, 1, 1]
        const rawPos = it.position || spreadPosition(i)
        return {
          id: newId(),
          ref: it.ref,
          label: lib.title,
          modelData: lib.modelData,
          position: withTerrain ? snapToTerrainXZ(rawPos, scaleArr) : rawPos,
          rotation: it.rotation || [0, 0, 0],
          scale: scaleArr,
        }
      }).filter(Boolean)
      if (data.background) setBackground(data.background)
      setItems(next)
      setSelectedId(null)
      if (next.length === 0) setError('AI returned no valid items. Try a more specific prompt.')
    } catch (e) {
      setError(e.message || 'Scene generation failed')
    } finally {
      setBusy(false)
    }
  }

  function snapToTerrainXZ(pos, scale) {
    const [x, , z] = pos
    const sy = Array.isArray(scale) ? scale[1] : scale
    return [x, terrainHeight(x, z) + 0.5 * sy, z]
  }

  async function runGenerate() {
    return runGenerateWith(prompt, terrain)
  }

  async function runAutoBuild() {
    const themed = pickPrompt()
    setPrompt(themed)
    if (!terrain) setTerrain(true)
    return runGenerateWith(themed, true)
  }

  async function runDownloadGLB() {
    if (items.length === 0) return
    setDownloading(true)
    try {
      await downloadSceneGLB(items, (sceneTitle || 'plixie-scene') + '.glb', sceneTitle || 'plixie-scene')
    } catch (e) {
      setError(e.message || 'GLB export failed')
    } finally {
      setDownloading(false)
    }
  }

  function runDownloadPNG() {
    if (!threeCtx || items.length === 0) return
    threeCtx.gl.render(threeCtx.scene, threeCtx.camera)
    const a = document.createElement('a')
    a.download = (sceneTitle || 'plixie-scene') + '.png'
    a.href = threeCtx.gl.domElement.toDataURL('image/png')
    a.click()
  }

  function toggleTerrain() {
    const next = !terrain
    setTerrain(next)
    if (next) {
      setItems(prev => prev.map(it => ({
        ...it,
        position: [it.position[0], terrainHeight(it.position[0], it.position[2]) + 0.5 * it.scale[1], it.position[2]],
      })))
    }
  }

  const isDirty = items.length > 0
  const sceneStatus = activeSceneId ? (savedFlash ? 'Saved ✓' : 'Editing saved scene') : (isDirty ? 'Unsaved' : 'Empty')

  return (
    <div className="scene-builder">
      <div className="scene-sidebar">
        <div className="scene-titlebar">
          <input
            className="scene-title-input"
            value={sceneTitle}
            onChange={e => setSceneTitle(e.target.value)}
            placeholder="Scene title"
          />
          <span className={`scene-status${savedFlash ? ' saved' : activeSceneId ? ' editing' : ''}`}>
            {sceneStatus}
          </span>
        </div>

        <div className="scene-actionbar">
          <button className="scene-icon-btn" onClick={newScene} title="New scene">＋ New</button>
          <button className="scene-icon-btn" onClick={saveCurrentScene}
            disabled={items.length === 0} title="Save scene">⌘ Save</button>
        </div>

        <div className="scene-downloadbar">
          <button className="scene-dl-btn"
            onClick={runDownloadPNG}
            disabled={items.length === 0}
            title="Download PNG screenshot">
            <span className="scene-dl-icon">📷</span>
            <span className="scene-dl-name">PNG</span>
            <span className="scene-dl-arrow">↓</span>
          </button>
          <button className="scene-dl-btn"
            onClick={runDownloadGLB}
            disabled={items.length === 0 || downloading}
            title="Download GLB 3D scene">
            <span className="scene-dl-icon">📦</span>
            <span className="scene-dl-name">{downloading ? '…' : 'GLB'}</span>
            <span className="scene-dl-arrow">↓</span>
          </button>
        </div>

        <div className="scene-toggle-row">
          <button className={`scene-toggle${terrain ? ' on' : ''}`} onClick={toggleTerrain}>
            <span className="scene-toggle-track">
              <span className="scene-toggle-thumb" />
            </span>
            <span className="scene-toggle-label">⛰ Terrain</span>
            <span className="scene-toggle-state">{terrain ? 'ON' : 'OFF'}</span>
          </button>
          {terrain && <p className="scene-toggle-note">Items will rest on the surface. AI placement adapts to the heightmap.</p>}
        </div>

        <div className="scene-section">
          <div className="scene-section-title">Generate</div>
          <button className="scene-btn build" onClick={runAutoBuild} disabled={busy}
            title="Pick a random theme, enable terrain, build a beautiful scene">
            {busy ? 'Building…' : '🏗 Build Scene'}
          </button>
          <p className="scene-hint">One click — random theme, terrain on, AI composes a scene from your library.</p>
          <textarea
            className="scene-prompt"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Or describe your own: a floating crystal garden…"
            rows={2}
          />
          <button className="scene-btn primary" onClick={runGenerate} disabled={busy}>
            {busy ? 'Generating…' : '✨ Generate from prompt'}
          </button>
          {error && <p className="scene-error">{error}</p>}
        </div>

        <div className="scene-section">
          <button className="scene-section-collapse" onClick={() => setShowSaved(s => !s)}>
            <span className="scene-chev">{showSaved ? '▾' : '▸'}</span>
            Saved scenes <span className="scene-count-pill">{savedScenes.length}</span>
          </button>
          {showSaved && (
            <div className="scene-saved-list">
              {savedScenes.length === 0 && <p className="scene-hint">Save a scene to keep it here.</p>}
              {savedScenes.map(s => (
                <div key={s.id}
                  className={`scene-saved-row${activeSceneId === s.id ? ' active' : ''}`}
                  onClick={() => loadScene(s)}>
                  <span className="scene-saved-title">{s.title}</span>
                  <span className="scene-saved-meta">{s.items.length} items</span>
                  <button className="scene-saved-del"
                    onClick={e => { e.stopPropagation(); removeScene(s.id); if (activeSceneId === s.id) newScene() }}
                    title="Delete">×</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="scene-section">
          <button className="scene-section-collapse" onClick={() => setShowLibrary(s => !s)}>
            <span className="scene-chev">{showLibrary ? '▾' : '▸'}</span>
            Library <span className="scene-count-pill">{fullLib.length}</span>
          </button>
          {showLibrary && (
            <>
              <input className="scene-search" placeholder="Search models…"
                value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} />
              <div className="scene-lib-list">
                {grouped.session.length > 0 && <div className="scene-divider">Your sessions</div>}
                {grouped.session.map(m => (
                  <button key={m.id} className="scene-lib-item" onClick={() => addFromLib(m.id)}>
                    <span className="scene-lib-dot" style={{ background: '#7cf' }} />
                    <span className="scene-lib-title">{m.title}</span>
                    <span className="scene-lib-add">+</span>
                  </button>
                ))}
                {grouped.user.length > 0 && <div className="scene-divider">Your published</div>}
                {grouped.user.map(m => (
                  <button key={m.id} className="scene-lib-item" onClick={() => addFromLib(m.id)}>
                    <span className="scene-lib-dot" style={{ background: '#ff7cf2' }} />
                    <span className="scene-lib-title">{m.title}</span>
                    <span className="scene-lib-add">+</span>
                  </button>
                ))}
                {grouped.featured.length > 0 && <div className="scene-divider">Featured</div>}
                {grouped.featured.map(m => (
                  <button key={m.id} className="scene-lib-item" onClick={() => addFromLib(m.id)}>
                    <span className="scene-lib-dot" style={{ background: '#a89cff' }} />
                    <span className="scene-lib-title">{m.title}</span>
                    <span className="scene-lib-add">+</span>
                  </button>
                ))}
                {filteredLib.length === 0 && <p className="scene-hint">No models match.</p>}
              </div>
            </>
          )}
        </div>

        <div className="scene-section">
          <div className="scene-section-title-row">
            <span className="scene-section-title">Scene</span>
            <span className="scene-count-pill">{items.length}</span>
            {items.length > 0 && (
              <button className="scene-text-btn" onClick={clearAll}>Clear</button>
            )}
          </div>
          {items.length === 0 && <p className="scene-hint">Add models or generate a scene above.</p>}
          <div className="scene-item-list">
            {items.map(it => (
              <div key={it.id}
                className={`scene-item-row${selectedId === it.id ? ' active' : ''}`}
                onClick={() => setSelectedId(it.id)}>
                <span className="scene-item-title">{it.label}</span>
                <button className="scene-item-action"
                  title="Duplicate"
                  onClick={e => { e.stopPropagation(); duplicateItem(it.id) }}>⎘</button>
                <button className="scene-item-del"
                  title="Remove"
                  onClick={e => { e.stopPropagation(); removeItem(it.id) }}>×</button>
              </div>
            ))}
          </div>
        </div>

        {selected && (
          <div className="scene-section">
            <div className="scene-section-title scene-transform-title">
              <span>Transform</span>
              <span className="scene-transform-label" title={selected.label}>{selected.label}</span>
            </div>
            <NumRow label="Pos" values={selected.position}
              onChange={v => patchItem(selected.id, { position: v })} />
            <NumRow label="Rot" values={selected.rotation} step={0.05}
              onChange={v => patchItem(selected.id, { rotation: v })} />
            <NumRow label="Scl" values={selected.scale} step={0.05}
              onChange={v => patchItem(selected.id, { scale: v })} />
          </div>
        )}

        <div className="scene-section scene-bg-section">
          <div className="scene-section-title">Background</div>
          <input type="color" value={background} onChange={e => setBackground(e.target.value)} />
        </div>
      </div>

      <div className="scene-canvas-wrap">
        {items.length === 0 ? (
          <div className="scene-empty">
            <div className="scene-empty-icon">⊞</div>
            <h3>Scene Builder</h3>
            <p>Generate a scene from a prompt, load a saved one, or compose manually from the library.</p>
          </div>
        ) : (
          <SceneCanvas items={items} background={background}
            selectedId={selectedId} onSelect={setSelectedId}
            terrain={terrain} onCtx={setThreeCtx} />
        )}
      </div>
    </div>
  )
}
