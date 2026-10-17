import { BrowserRouter, Routes, Route } from 'react-router-dom'
import NavBar from './components/NavBar'
import LandingPage from './pages/LandingPage'
import NewJobPage from './pages/NewJobPage'
import JobPage from './pages/JobPage'
import EditorPassportPage from './pages/EditorPassportPage'
import DashboardPage from './pages/DashboardPage'

// Spin keyframe for loader
const spinStyle = document.createElement('style')
spinStyle.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`
document.head.appendChild(spinStyle)

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
        <NavBar />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/new" element={<NewJobPage />} />
          <Route path="/job/:id" element={<JobPage />} />
          <Route path="/editor/:address" element={<EditorPassportPage />} />
          <Route path="/me" element={<DashboardPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
