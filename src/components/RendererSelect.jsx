import { useApp } from '../context/AppContext.jsx'

const OPTIONS = [
  { key: 'threejs',  label: 'Three.js',    badge: 'GL'  },
  { key: 'babylon',  label: 'Babylon.js',  badge: 'BJS' },
  { key: 'blender',  label: 'Blender Py',  badge: 'PY'  },
]

export default function RendererSelect() {
  const { renderer, setRenderer, shaderLang, setShaderLang } = useApp()
  const showShaderToggle = renderer !== 'blender'
  return (
    <div className="renderer-row">
      <div className="renderer-select">
        {OPTIONS.map(({ key, label, badge }) => (
          <button
            key={key}
            className={`renderer-opt${renderer === key ? ' active' : ''}`}
            onClick={() => setRenderer(key)}
            title={label}
          >
            <span className="renderer-badge">{badge}</span>
            <span className="renderer-label">{label}</span>
          </button>
        ))}
      </div>
      {showShaderToggle && (
        <div className="shader-toggle" role="group" aria-label="Shader language">
          <button
            className={`shader-toggle-opt${shaderLang === 'glsl' ? ' active' : ''}`}
            onClick={() => setShaderLang('glsl')}
            title="GLSL — runs in Three.js / Babylon.js previews">
            GLSL
          </button>
          <button
            className={`shader-toggle-opt${shaderLang === 'hlsl' ? ' active' : ''}`}
            onClick={() => setShaderLang('hlsl')}
            title="HLSL — Unity / Unreal / DirectX shader file (code only)">
            HLSL
          </button>
        </div>
      )}
    </div>
  )
}
