import { useApp } from '../context/AppContext.jsx'

const OPTIONS = [
  { key: 'threejs',  label: 'Three.js',    badge: 'GL'  },
  { key: 'babylon',  label: 'Babylon.js',  badge: 'BJS' },
  { key: 'blender',  label: 'Blender Py',  badge: 'PY'  },
]

const PRO_PLUS = new Set(['pro', 'premium'])

export default function RendererSelect() {
  const { renderer, setRenderer, shaderLang, setShaderLang, aiBrain, setAiBrain, plan } = useApp()
  const showShaderToggle = renderer !== 'blender'
  const showBrainToggle = PRO_PLUS.has(plan)
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
      {showBrainToggle && (
        <div className="shader-toggle brain-toggle" role="group" aria-label="AI model">
          <button
            className={`shader-toggle-opt${aiBrain === 'claude' ? ' active' : ''}`}
            onClick={() => setAiBrain('claude')}
            title="Claude Opus — premium quality, slower, higher cost">
            Claude
          </button>
          <button
            className={`shader-toggle-opt${aiBrain === 'gemini' ? ' active' : ''}`}
            onClick={() => setAiBrain('gemini')}
            title="Gemini Flash — fast, cheaper, good for quick iterations">
            Gemini
          </button>
        </div>
      )}
    </div>
  )
}
