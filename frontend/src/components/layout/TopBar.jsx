import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'

const PAGE_META = {
  '/':           { title: 'Dashboard',             subtitle: 'Overview & recent activity' },
  '/datasets':   { title: 'Dataset Manager',       subtitle: 'Generate, upload & manage price datasets' },
  '/analyze':    { title: 'Algorithm Analysis',    subtitle: 'Run maximum subarray algorithms & compare results' },
  '/benchmark':  { title: 'Benchmark Suite',       subtitle: '10-iteration performance benchmarking' },
  '/complexity': { title: 'Complexity Visualizer', subtitle: 'Theory vs. observed growth curves' },
}

export default function TopBar() {
  const { pathname } = useLocation()
  const meta = PAGE_META[pathname] ?? PAGE_META[Object.keys(PAGE_META).find((k) => k !== '/' && pathname.startsWith(k))] ?? { title: 'Page', subtitle: '' }

  return (
    <header style={{
      height: 'var(--topbar-height)',
      background: 'var(--bg-surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 28px',
      position: 'sticky',
      top: 0,
      zIndex: 50,
      gap: 16,
    }}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: -6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
      >
        <h1 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>{meta.title}</h1>
        {meta.subtitle && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
            {meta.subtitle}
          </p>
        )}
      </motion.div>
    </header>
  )
}
