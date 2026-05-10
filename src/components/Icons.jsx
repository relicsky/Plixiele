const s = { fill: 'none', stroke: 'currentColor', strokeWidth: '1.7', strokeLinecap: 'round', strokeLinejoin: 'round' }

export const IconCube = () => <svg viewBox="0 0 24 24" {...s}>
  <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>
  <polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>
</svg>

export const IconImage = () => <svg viewBox="0 0 24 24" {...s}>
  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
  <circle cx="8.5" cy="8.5" r="1.5"/>
  <polyline points="21 15 16 10 5 21"/>
</svg>

export const IconCode = () => <svg viewBox="0 0 24 24" {...s}>
  <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
</svg>

export const IconPlus = () => <svg viewBox="0 0 24 24" {...s}>
  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
</svg>

export const IconTrash = () => <svg viewBox="0 0 24 24" {...s}>
  <polyline points="3 6 5 6 21 6"/>
  <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/>
  <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
</svg>

export const IconLogOut = () => <svg viewBox="0 0 24 24" {...s}>
  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
  <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
</svg>

export const IconSend = () => <svg viewBox="0 0 24 24" {...s}>
  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
</svg>

export const IconUpload = () => <svg viewBox="0 0 24 24" {...s}>
  <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
  <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
</svg>

export const IconSparkle = () => <svg viewBox="0 0 24 24" fill="currentColor">
  <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17 5.8 21.3l2.4-7.4L2 9.4h7.6z"/>
</svg>

export const IconHome = () => <svg viewBox="0 0 24 24" {...s}>
  <path d="M3 12l9-9 9 9"/><path d="M5 10v10a1 1 0 001 1h4v-7h4v7h4a1 1 0 001-1V10"/>
</svg>

export const IconHelp = () => <svg viewBox="0 0 24 24" {...s}>
  <circle cx="12" cy="12" r="10"/>
  <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/>
  <line x1="12" y1="17" x2="12.01" y2="17"/>
</svg>
