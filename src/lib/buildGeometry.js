// Single source of truth for converting a JSON geometry spec into a
// THREE.BufferGeometry. Used by every renderer + the GLB exporter so that
// adding a new geometry type only requires changes here (and a system-prompt
// update so the model knows about it).
//
// Supports:
//  - All "simple" primitives whose constructor takes a numeric params array
//    (BoxGeometry, SphereGeometry, etc.). Pass: { type, params: [...] }.
//  - LatheGeometry, where points are 2D coords as [[x, y], ...] arrays:
//      { type: 'LatheGeometry', points: [[0,-0.5], [0.3,0], [0,0.5]],
//        segments?: 32, phiStart?: 0, phiLength?: 6.283185 }
//  - ExtrudeGeometry, where the shape is a closed 2D path of [x, y] arrays:
//      { type: 'ExtrudeGeometry', shape: [[0,0],[1,0],[1,1],[0,1]],
//        holes?: [[[...],[...]], ...],
//        options?: { depth, bevelEnabled, bevelThickness, bevelSize,
//                    bevelSegments, curveSegments, steps } }
//
// On any malformed input, returns a SphereGeometry fallback so a single bad
// part never crashes the renderer.

import * as THREE from 'three'

const FALLBACK = () => new THREE.SphereGeometry(1, 32, 32)

function makeShapeFromPoints(points) {
  const shape = new THREE.Shape()
  if (!Array.isArray(points) || points.length < 3) return shape
  const [x0, y0] = points[0]
  shape.moveTo(Number(x0) || 0, Number(y0) || 0)
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i]
    shape.lineTo(Number(x) || 0, Number(y) || 0)
  }
  shape.closePath()
  return shape
}

function buildLathe(def) {
  const pts = (def.points || []).map(([x, y]) => new THREE.Vector2(Number(x) || 0, Number(y) || 0))
  if (pts.length < 2) return FALLBACK()
  return new THREE.LatheGeometry(
    pts,
    Number.isFinite(def.segments) ? def.segments : 32,
    Number.isFinite(def.phiStart) ? def.phiStart : 0,
    Number.isFinite(def.phiLength) ? def.phiLength : Math.PI * 2,
  )
}

function buildExtrude(def) {
  const shape = makeShapeFromPoints(def.shape || [])
  if ((def.shape || []).length < 3) return FALLBACK()
  if (Array.isArray(def.holes)) {
    for (const holePoints of def.holes) {
      const hole = new THREE.Path()
      if (!Array.isArray(holePoints) || holePoints.length < 3) continue
      const [hx, hy] = holePoints[0]
      hole.moveTo(Number(hx) || 0, Number(hy) || 0)
      for (let i = 1; i < holePoints.length; i++) {
        const [x, y] = holePoints[i]
        hole.lineTo(Number(x) || 0, Number(y) || 0)
      }
      hole.closePath()
      shape.holes.push(hole)
    }
  }
  const opts = {
    depth: 0.5,
    bevelEnabled: false,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 12,
    steps: 1,
    ...(def.options || {}),
  }
  return new THREE.ExtrudeGeometry(shape, opts)
}

export function buildGeometry(def) {
  if (!def || typeof def !== 'object') return FALLBACK()
  try {
    if (def.type === 'LatheGeometry')   return buildLathe(def)
    if (def.type === 'ExtrudeGeometry') return buildExtrude(def)
    const G = THREE[def.type]
    if (typeof G !== 'function') return FALLBACK()
    return new G(...(def.params || []))
  } catch {
    return FALLBACK()
  }
}
