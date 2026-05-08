import { useApp } from '../context/AppContext.jsx'

const OPTIONS = [
  { key: 'threejs',  label: 'Three.js',    badge: 'GL'  },
  { key: 'babylon',  label: 'Babylon.js',  badge: 'BJS' },
  { key: 'blender',  label: 'Blender Py',  badge: 'PY'  },
]

export default function RendererSelect() {
  const { renderer, setRenderer } = useApp()
  return (
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
  )
}
