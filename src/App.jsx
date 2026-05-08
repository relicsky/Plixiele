import { useApp } from './context/AppContext.jsx'
import LoginPage from './components/LoginPage.jsx'
import Sidebar from './components/Sidebar.jsx'
import ModelGenerator from './components/ModelGenerator.jsx'
import ImageTo3D from './components/ImageTo3D.jsx'
import CodingBuddy from './components/CodingBuddy.jsx'
import CommunityTab from './components/CommunityTab.jsx'
import LabsTab from './components/LabsTab.jsx'
import './App.css'

function Shell() {
  const { mode } = useApp()
  return (
    <div className="shell">
      <Sidebar />
      <main className="main">
        {mode === 'model'     && <ModelGenerator />}
        {mode === 'image'     && <ImageTo3D />}
        {mode === 'code'      && <CodingBuddy />}
        {mode === 'community' && <CommunityTab />}
        {mode === 'labs'      && <LabsTab />}
      </main>
    </div>
  )
}

export default function App() {
  const { user } = useApp()
  return user ? <Shell /> : <LoginPage />
}
