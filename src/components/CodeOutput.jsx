import { useState } from 'react'

function copyText(t) { navigator.clipboard?.writeText(t).catch(() => {}) }

function downloadFile(content, filename) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }))
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function openBabylonPreview(code) {
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Plixie — Babylon.js Preview</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#050510;overflow:hidden}
#c{width:100vw;height:100vh;touch-action:none;display:block}
#hud{position:fixed;top:10px;left:12px;color:#64748b;font:11px/1.4 system-ui,sans-serif;pointer-events:none}
#hud span{color:#7c3aed}
</style>
</head>
<body>
<canvas id="c"></canvas>
<div id="hud"><span>✦ Plixie</span> · Babylon.js Preview<br>Drag to orbit · Scroll to zoom</div>
<script src="https://cdn.babylonjs.com/babylon.js"></script>
<script>
const canvas = document.getElementById('c');
const engine = new BABYLON.Engine(canvas, true, {preserveDrawingBuffer:true, stencil:true});
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.06, 1);

const camera = new BABYLON.ArcRotateCamera('cam', -Math.PI/2, Math.PI/3, 4.5, BABYLON.Vector3.Zero(), scene);
camera.attachControl(canvas, true);
camera.wheelPrecision = 50;
camera.minZ = 0.01;

new BABYLON.PointLight('l1', new BABYLON.Vector3(5, 5, 5), scene).intensity = 300;
const fill = new BABYLON.PointLight('l2', new BABYLON.Vector3(-5, -3, -5), scene);
fill.intensity = 80; fill.diffuse = new BABYLON.Color3(0.4, 0.5, 1.0);

let _time = 0;
let updateTime = null;

try {
${code}
} catch(e) {
  console.error('Model code error:', e);
  const msg = document.createElement('div');
  msg.style = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;color:#f87171;font:14px system-ui;padding:20px;text-align:center;pointer-events:none';
  msg.textContent = 'Shader error: ' + e.message;
  document.body.appendChild(msg);
}

engine.runRenderLoop(() => {
  _time += engine.getDeltaTime() / 1000;
  if (typeof updateTime === 'function') updateTime(_time);
  scene.render();
});
window.addEventListener('resize', () => engine.resize());
</script>
</body>
</html>`
  const blob = new Blob([html], { type: 'text/html' })
  window.open(URL.createObjectURL(blob), '_blank')
}

export default function CodeOutput({ modelData }) {
  const [copied, setCopied] = useState(false)

  if (!modelData) {
    return (
      <div className="code-output-empty">
        <div className="co-icon">{ '{  }' }</div>
        <p>Generate a model to see the code here</p>
      </div>
    )
  }

  const isBabylon = modelData.type === 'babylonjs' || modelData.renderer === 'babylon'
  const isBlender = modelData.type === 'blender'   || modelData.renderer === 'blender'
  const isHlsl    = modelData.type === 'hlsl'      || modelData.renderer === 'hlsl'
  const code    = modelData.code || modelData.pythonScript || ''
  const lang    = isHlsl ? 'hlsl' : isBabylon ? 'javascript' : 'python'
  const filename = isHlsl ? 'plixie_shader.hlsl' : isBlender ? 'plixie_model.py' : 'plixie_model.js'
  const badgeLabel = isHlsl ? 'HLSL Shader' : isBabylon ? 'Babylon.js' : 'Blender Python'

  function handleCopy() {
    copyText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="code-output">
      <div className="co-header">
        <div className="co-meta">
          <span className="co-badge">{badgeLabel}</span>
          <span className="co-desc">{modelData.description}</span>
        </div>
        <div className="co-actions">
          <button className="co-btn" onClick={handleCopy}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
          <button className="co-btn" onClick={() => downloadFile(code, filename)}>
            ↓ Download
          </button>
          {isBabylon && (
            <button className="co-btn co-btn-primary" onClick={() => openBabylonPreview(code)}>
              ▶ Preview
            </button>
          )}
          {isBlender && (
            <span className="co-hint">Paste into Blender → Scripting tab → Run</span>
          )}
          {isHlsl && (
            <span className="co-hint">Drop into Unity (ShaderLab wrapper) or paste into an Unreal Custom node</span>
          )}
        </div>
      </div>
      <pre className="co-pre"><code className={`lang-${lang}`}>{code}</code></pre>
    </div>
  )
}
