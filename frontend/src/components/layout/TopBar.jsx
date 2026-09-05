import { useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import ThemeToggle from './ThemeToggle'

const PAGE_META = {
  '/':           { title: 'Dashboard',             subtitle: 'System overview & recent activity' },
  '/datasets':   { title: 'Dataset Manager',       subtitle: 'Generate, upload & inspect price datasets' },
  '/analyze':    { title: 'Algorithm Analysis',    subtitle: 'Run maximum subarray algorithms & compare profits' },
  '/benchmark':  { title: 'Benchmark Suite',       subtitle: '10-iteration runtime & memory profiling' },
  '/complexity': { title: 'Complexity Visualizer', subtitle: 'Theoretical Big-O vs. empirical growth curves' },
  '/reports':    { title: 'PDF Report Generator',  subtitle: 'Export comprehensive academic analysis reports' },
  '/ml':         { title: 'ML Model Trainer',      subtitle: 'Train anomaly, regime & signal models' },
}

export default function TopBar({ onMenuToggle, isMobileMenuOpen }) {
  const { pathname } = useLocation()
  const meta = PAGE_META[pathname] ?? PAGE_META[Object.keys(PAGE_META).find((k) => k !== '/' && pathname.startsWith(k))] ?? { title: 'Stock Peak Analyzer', subtitle: 'DAA Project' }

  return (
    <header
      role="banner"
      className="app-topbar"
      style={{
        height: 'var(--topbar-height)',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--divider)',
        boxShadow: '0 2px 8px var(--shadow-lo)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 20px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
        gap: 14,
        transition: 'background-color var(--transition), border-color var(--transition)',
      }}
    >
      {/* Skip to main content link for screen readers */}
      <a href="#main-content" className="skip-to-content">
        Skip to main content
      </a>

      {/* Mobile Menu Hamburger Button */}
      <button
        type="button"
        className="btn btn-ghost btn-icon mobile-menu-btn"
        onClick={onMenuToggle}
        aria-label={isMobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isMobileMenuOpen}
        aria-controls="app-sidebar"
        style={{
          display: 'none',
          flexShrink: 0,
        }}
      >
        {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Page Title & Subtitle */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {meta.title}
        </h1>
        {meta.subtitle && (
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {meta.subtitle}
          </p>
        )}
      </div>

      {/* Accessible Neumorphic Theme Switcher */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
        <ThemeToggle />
      </div>

      <style>{`
        @media (max-width: 900px) {
          .mobile-menu-btn {
            display: inline-flex !important;
          }
        }
      `}</style>
    </header>
  )
}
