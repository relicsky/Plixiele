import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { buildGeometry as makeGeom } from './buildGeometry.js'

function bakedColor(uniforms) {
  const keys = ['uColor1', 'uColor', 'color', 'uBaseColor', 'uTint']
  if (uniforms) {
    for (const k of keys) {
      const v = uniforms[k]?.value
      if (Array.isArray(v) && v.length >= 3) return new THREE.Color(v[0], v[1], v[2])
    }
  }
  return new THREE.Color(0x6080ff)
}

function meshFromPart(part) {
  const geom = makeGeom(part.geometry)
  const mat = new THREE.MeshStandardMaterial({
    color: bakedColor(part.uniforms),
    roughness: 0.45,
    metalness: 0.15,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(geom, mat)
  if (part.position) mesh.position.set(...part.position)
  if (part.rotation) mesh.rotation.set(...part.rotation)
  if (part.scale) mesh.scale.set(...part.scale)
  mesh.name = part.name || 'mesh'
  return mesh
}

function groupFromModelData(modelData, name) {
  const group = new THREE.Group()
  group.name = name || modelData.description?.slice(0, 40) || 'plixie-model'
  if (Array.isArray(modelData.parts)) {
    for (const p of modelData.parts) group.add(meshFromPart(p))
  } else {
    group.add(meshFromPart(modelData))
  }
  return group
}

function exportSceneToGLB(scene, filename) {
  const exporter = new GLTFExporter()
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        const blob = new Blob([result], { type: 'model/gltf-binary' })
        const a = document.createElement('a')
        a.download = filename
        a.href = URL.createObjectURL(blob)
        a.click()
        URL.revokeObjectURL(a.href)
        resolve()
      },
      (err) => reject(err),
      { binary: true },
    )
  })
}

export async function downloadModelGLB(modelData, filename = 'plixie-model.glb') {
  const root = new THREE.Scene()
  root.add(groupFromModelData(modelData))
  await exportSceneToGLB(root, filename)
}

export async function downloadSceneGLB(items, filename = 'plixie-scene.glb', sceneName = 'plixie-scene') {
  const root = new THREE.Scene()
  root.name = sceneName
  for (const item of items) {
    if (!item.modelData) continue
    const g = groupFromModelData(item.modelData, item.label)
    if (item.position) g.position.set(...item.position)
    if (item.rotation) g.rotation.set(...item.rotation)
    if (item.scale) {
      const s = Array.isArray(item.scale) ? item.scale : [item.scale, item.scale, item.scale]
      g.scale.set(...s)
    }
    root.add(g)
  }
  await exportSceneToGLB(root, filename)
}
