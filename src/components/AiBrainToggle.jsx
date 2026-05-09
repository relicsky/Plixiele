import { useApp } from '../context/AppContext.jsx'

const PRO_PLUS = new Set(['pro', 'premium'])

export default function AiBrainToggle() {
  const { aiBrain, setAiBrain, plan } = useApp()
  if (!PRO_PLUS.has(plan)) return null
  return (
    <div className="brain-row">
      <span className="brain-row-label">AI</span>
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
    </div>
  )
}
