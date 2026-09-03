import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import PageLayout from './components/layout/PageLayout'
import Dashboard       from './pages/Dashboard'
import DatasetManager  from './pages/DatasetManager'
import AnalysisView    from './pages/AnalysisView'
import BenchmarkView   from './pages/BenchmarkView'
import ComplexityView  from './pages/ComplexityView'
import ReportView      from './pages/ReportView'
import MLView          from './pages/MLView'
import client          from './api/client'

/**
 * Root App component.
 * Checks API health on mount and passes `apiOnline` to PageLayout → Sidebar.
 */
export default function App() {
  const [apiOnline, setApiOnline] = useState(null) // null = checking, true = online, false = offline

  useEffect(() => {
    let isMounted = true

    const checkHealth = () => {
      client.get('/health')
        .then(() => { if (isMounted) setApiOnline(true) })
        .catch(() => { if (isMounted) setApiOnline(false) })
    }

    checkHealth()
    const id = setInterval(checkHealth, 30_000)

    return () => {
      isMounted = false
      clearInterval(id)
    }
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PageLayout apiOnline={apiOnline} />}>
          <Route index              element={<Dashboard />} />
          <Route path="datasets"   element={<DatasetManager />} />
          <Route path="analyze"    element={<AnalysisView />} />
          <Route path="benchmark"  element={<BenchmarkView />} />
          <Route path="complexity" element={<ComplexityView />} />
          <Route path="reports"    element={<ReportView />} />
          <Route path="ml"         element={<MLView />} />
          {/* Catch-all → Dashboard */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
