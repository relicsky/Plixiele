import { useApp } from '../context/AppContext.jsx'

const PRO_PLUS = new Set(['pro', 'premium'])

// Each option: { value, label, brain, variant, minPlan }.
// `value` is what we persist in localStorage. brain+variant are forwarded
// to the AI client. minPlan controls visibility/disabled state.
const OPTIONS = [
  { value: 'gemini-flash', label: 'Gemini Flash', brain: 'gemini', variant: 'flash',   minPlan: 'free'    },
  { value: 'claude-sonnet',label: 'Claude Sonnet',brain: 'claude', variant: 'pro',     minPlan: 'pro'     },
  { value: 'claude-opus',  label: 'Claude Opus',  brain: 'claude', variant: 'premium', minPlan: 'premium' },
]

const PLAN_RANK = { free: 0, basic: 1, pro: 2, premium: 3 }

function valueFor(brain, variant) {
  return OPTIONS.find(o => o.brain === brain && o.variant === variant)?.value || 'gemini-flash'
}

export default function AiBrainToggle() {
  const { aiBrain, setAiBrain, aiVariant, setAiVariant, plan } = useApp()
  if (!PRO_PLUS.has(plan)) return null

  const explicit = aiVariant && OPTIONS.find(o => o.brain === aiBrain && o.variant === aiVariant)
  const current = explicit
    ? explicit.value
    : aiBrain === 'claude'
      ? (plan === 'premium' ? 'claude-opus' : 'claude-sonnet')
      : 'gemini-flash'

  function onChange(e) {
    const opt = OPTIONS.find(o => o.value === e.target.value)
    if (!opt) return
    setAiBrain(opt.brain)
    setAiVariant(opt.variant)
  }

  return (
    <div className="brain-row">
      <span className="brain-row-label">AI</span>
      <select className="brain-select" value={current} onChange={onChange}>
        {OPTIONS.map((o) => {
          const allowed = PLAN_RANK[plan] >= PLAN_RANK[o.minPlan]
          return (
            <option key={o.value} value={o.value} disabled={!allowed}>
              {o.label}{!allowed ? ' (locked)' : ''}
            </option>
          )
        })}
      </select>
    </div>
  )
}
