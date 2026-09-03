import { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Database, PlayCircle, Timer,
  TrendingUp, Activity, ChevronRight, FileText, Brain, X
} from 'lucide-react'

const NAV = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/datasets',   icon: Database,        label: 'Datasets' },
  { to: '/analyze',    icon: PlayCircle,      label: 'Analyze' },
  { to: '/benchmark',  icon: Timer,           label: 'Benchmark' },
  { to: '/complexity', icon: TrendingUp,      label: 'Complexity' },
  { to: '/reports',    icon: FileText,        label: 'Reports' },
  { to: '/ml',         icon: Brain,           label: 'ML Trainer' },
]

export default function Sidebar({ apiOnline, isOpen = false, onClose }) {
  const location = useLocation()

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="app-sidebar"
        role="navigation"
        aria-label="Sidebar Navigation"
        className={`app-sidebar ${isOpen ? 'sidebar-open' : ''}`}
        style={{
          width: 'var(--sidebar-width)',
          height: '100vh',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 100,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {/* Brand Header */}
        <div style={{
          padding: '16px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius)',
              background: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Activity size={17} color="#fff" />
            </div>
            <div>
              <div style={{
                fontWeight: 700,
                fontSize: '0.875rem',
                color: 'var(--text-primary)',
                lineHeight: 1.15,
                letterSpacing: '-0.01em',
              }}>
                Stock Peak
              </div>
              <div style={{
                fontSize: '0.65rem',
                color: 'var(--text-muted)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}>
                DAA Analyzer
              </div>
            </div>
          </div>

          {/* Close button for mobile */}
          <button
            type="button"
            className="btn btn-ghost btn-icon sidebar-close-btn"
            onClick={onClose}
            aria-label="Close menu"
            style={{ display: 'none' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Section Label */}
        <div style={{
          padding: '16px 18px 6px',
          fontSize: '0.68rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
        }}>
          Modules
        </div>

        {/* Navigation Items */}
        <nav style={{ flex: 1, padding: '0 8px' }}>
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(to)
            return (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius)',
                  textDecoration: 'none',
                  marginBottom: 3,
                  fontSize: '0.85rem',
                  fontWeight: active ? 600 : 500,
                  color: active ? '#ffffff' : 'var(--text-secondary)',
                  background: active ? 'var(--primary-dim)' : 'transparent',
                  border: active ? '1px solid var(--border-active)' : '1px solid transparent',
                  transition: 'background-color var(--transition-fast), color var(--transition-fast)',
                }}
              >
                <Icon size={16} strokeWidth={active ? 2.2 : 1.8} style={{ color: active ? 'var(--primary-light)' : 'var(--text-muted)' }} />
                <span style={{ flex: 1 }}>{label}</span>
                {active && <ChevronRight size={13} style={{ color: 'var(--primary-light)', opacity: 0.8 }} />}
              </NavLink>
            )
          })}
        </nav>

        {/* API Status Footer */}
        <div style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--border)',
          marginTop: 'auto',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 10px',
            background: 'var(--bg-surface-2)',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
          }}>
            <span
              className={`status-dot ${apiOnline === true ? 'green' : apiOnline === false ? 'red' : 'gray'}`}
              aria-hidden="true"
            />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span>API Status</span>
                <span style={{
                  fontSize: '0.65rem',
                  color: apiOnline === true ? 'var(--success)' : apiOnline === false ? 'var(--danger)' : 'var(--text-muted)'
                }}>
                  {apiOnline === true ? 'Connected' : apiOnline === false ? 'Offline' : 'Checking…'}
                </span>
              </div>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                127.0.0.1:8000
              </div>
            </div>
          </div>
        </div>
      </aside>

      <style>{`
        @media (max-width: 900px) {
          .app-sidebar {
            transform: translateX(-100%);
            transition: transform 0.22s ease-in-out;
            box-shadow: none;
          }
          .app-sidebar.sidebar-open {
            transform: translateX(0);
            box-shadow: 4px 0 24px rgba(0, 0, 0, 0.6);
          }
          .sidebar-close-btn {
            display: inline-flex !important;
          }
        }
      `}</style>
    </>
  )
}
