import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import NavBar from './components/NavBar'
import LandingPage from './pages/LandingPage'
import NewJobPage from './pages/NewJobPage'
import JobPage from './pages/JobPage'
import EditorPassportPage from './pages/EditorPassportPage'
import DashboardPage from './pages/DashboardPage'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo({ top: 0 }) }, [pathname])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
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
