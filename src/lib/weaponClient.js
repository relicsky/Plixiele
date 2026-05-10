// Client wrapper for the generateWeapon Cloud Function.
//
// Server emits SSE events with stage markers:
//   { stage: 'researching' }
//   { stage: 'modeling', description }
//   { stage: 'done', model, description, weaponName, style }
//   { stage: 'error', message }
//
// onStage(stage, payload?) lets the UI swap copy ("Researching…" → "Modeling…")
// without us doing two separate fetches. Returns the final result on success.

import { auth } from './firebase.js'

async function getIdToken() {
  const user = auth?.currentUser
  if (!user) throw new Error('Sign in to generate weapons')
  return user.getIdToken()
}

export async function generateWeapon(name, { style = 'Stylized', onStage } = {}) {
  const token = await getIdToken()

  const res = await fetch('/api/weapon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ name, style }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Weapon gen ${res.status}: ${body.slice(0, 320)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let final = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE events are separated by blank lines. Process each complete event.
    let split
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, split)
      buffer = buffer.slice(split + 2)
      const dataLine = block.split('\n').find(l => l.startsWith('data:'))
      if (!dataLine) continue
      const payload = dataLine.slice(5).trim()
      if (!payload) continue
      let event
      try { event = JSON.parse(payload) } catch { continue }

      if (event.stage === 'error') {
        throw new Error(event.message || 'Generation failed')
      }
      if (event.stage === 'done') {
        final = event
      }
      onStage?.(event.stage, event)
    }
  }

  if (!final || !final.model) {
    throw new Error('Generation completed without a model')
  }
  return final
}
