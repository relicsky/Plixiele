import { useApp } from '../context/AppContext.jsx'

const PRO_PLUS = new Set(['pro', 'premium'])
// While we build out subscriptions the brain toggle stays visible to everyone
// for development. Flip this to false at launch.
const DEV_BRAIN_TOGGLE_FOR_ALL = true

export default function AiBrainToggle() {
  const { aiBrain, setAiBrain, plan } = useApp()
  const visible = DEV_BRAIN_TOGGLE_FOR_ALL || PRO_PLUS.has(plan)
  if (!visible) return null
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
