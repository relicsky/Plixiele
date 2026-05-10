import { useState } from 'react'
import { useApp } from './context/AppContext.jsx'
import LoginPage from './components/LoginPage.jsx'
import Sidebar from './components/Sidebar.jsx'
import HomePage from './components/HomePage.jsx'
import ModelGenerator from './components/ModelGenerator.jsx'
import ImageTo3D from './components/ImageTo3D.jsx'
import CodingBuddy from './components/CodingBuddy.jsx'
import CommunityTab from './components/CommunityTab.jsx'
import LabsTab from './components/LabsTab.jsx'
import PricingPage from './components/PricingPage.jsx'
import LegalPage from './components/LegalPage.jsx'
import AccountSettings from './components/AccountSettings.jsx'
import HelpDialog from './components/HelpDialog.jsx'
import VerifyBanner from './components/VerifyBanner.jsx'
import './App.css'

function Shell() {
  const { mode, setMode } = useApp()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [overlay, setOverlay] = useState(null) // 'pricing' | 'terms' | 'privacy' | 'conduct' | 'account' | 'help' | null
  function openOverlay(name) { setOverlay(name) }
  function closeOverlay(next) {
    if (typeof next === 'string') setOverlay(next)
    else setOverlay(null)
  }
  return (
    <div className={`shell${sidebarOpen ? '' : ' shell-collapsed'}`}>
      <Sidebar
        onClose={() => setSidebarOpen(false)}
        onOpenPricing={() => openOverlay('pricing')}
        onOpenLegal={(which) => openOverlay(which)}
        onOpenAccount={() => openOverlay('account')}
      />
      <main className="main">
        <VerifyBanner />
        {!sidebarOpen && (
          <button className="sidebar-reopen" onClick={() => setSidebarOpen(true)} title="Show sidebar">
            ☰
          </button>
        )}
        {overlay === 'pricing' && <PricingPage onClose={(n) => typeof n === 'string' ? openOverlay(n) : closeOverlay()} />}
        {(overlay === 'terms' || overlay === 'privacy' || overlay === 'conduct') && (
          <LegalPage initial={overlay} onClose={() => closeOverlay()} />
        )}
        {overlay === 'account' && (
          <AccountSettings
            onClose={() => closeOverlay()}
            onOpenPricing={() => openOverlay('pricing')}
          />
        )}
        {overlay === 'help' && <HelpDialog onClose={() => closeOverlay()} />}
        {!overlay && mode === 'home'      && <HomePage onOpenHelp={() => openOverlay('help')} />}
        {!overlay && mode === 'model'     && <ModelGenerator />}
        {!overlay && mode === 'image'     && <ImageTo3D />}
        {!overlay && mode === 'code'      && <CodingBuddy />}
        {!overlay && mode === 'community' && <CommunityTab />}
        {!overlay && mode === 'labs'      && <LabsTab />}
      </main>
    </div>
  )
}

export default function App() {
  const { user } = useApp()
  return user ? <Shell /> : <LoginPage />
}
