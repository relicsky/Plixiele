const FEATURES = [
  {
    key: 'scene',
    icon: '⊞',
    title: 'Scene Builder',
    blurb: 'Arrange models in 3D space with AI layout, terrain, save/load, and GLB export.',
    accent: '#22d3ee',
  },
  {
    key: 'shader',
    icon: '⚗',
    title: 'Shader Lab',
    blurb: 'Tweak GLSL shaders and uniforms on any model in real time.',
    accent: '#a855f7',
  },
  {
    key: 'sound',
    icon: '♫',
    title: 'Sound Lab',
    blurb: 'AI-generated sound effects and short music. Plays in browser, exports as WAV. (50 credits)',
    accent: '#7cffa8',
  },
]

export default function LabsHome({ onPick }) {
  return (
    <div className="labs-home">
      <div className="labs-home-head">
        <h2>Labs</h2>
        <p>Experimental tools for building, editing, and styling 3D content. Pick a workspace.</p>
      </div>
      <div className="labs-home-grid">
        {FEATURES.map(f => (
          <button key={f.key} className="labs-home-card" onClick={() => onPick(f.key)}
            style={{ '--card-accent': f.accent }}>
            <span className="labs-home-icon">{f.icon}</span>
            <span className="labs-home-title">{f.title}</span>
            <span className="labs-home-blurb">{f.blurb}</span>
            <span className="labs-home-cta">Open →</span>
          </button>
        ))}
      </div>
    </div>
  )
}
