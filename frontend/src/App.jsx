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
  const [apiOnline, setApiOnline] = useState(null)   // null = checking

  useEffect(() => {
    client.get('/health')
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false))
    // Re-check every 30s
    const id = setInterval(() => {
      client.get('/health')
        .then(() => setApiOnline(true))
        .catch(() => setApiOnline(false))
    }, 30_000)
    return () => clearInterval(id)
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
