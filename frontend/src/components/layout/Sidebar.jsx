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
          background: 'var(--surface)',
          borderRight: '1px solid var(--divider)',
          boxShadow: '2px 0 10px var(--shadow-lo)',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 100,
          overflowY: 'auto',
          overflowX: 'hidden',
          transition: 'background-color var(--transition), border-color var(--transition)',
        }}
      >
        {/* Brand Header */}
        <div style={{
          padding: '16px 18px',
          borderBottom: '1px solid var(--divider)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 'var(--radius-sm)',
              background: 'var(--accent)',
              boxShadow: '0 3px 10px var(--accent-shadow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Activity size={18} color="var(--accent-ink)" />
            </div>
            <div>
              <div style={{
                fontWeight: 700,
                fontSize: '0.9375rem',
                color: 'var(--text-primary)',
                lineHeight: 1.15,
                letterSpacing: '-0.01em',
              }}>
                Stock Peak
              </div>
              <div style={{
                fontSize: '0.68rem',
                color: 'var(--text-muted)',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
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
            <X size={18} />
          </button>
        </div>

        {/* Section Label */}
        <div style={{
          padding: '18px 20px 8px',
          fontSize: '0.68rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted)',
        }}>
          Navigation Modules
        </div>

        {/* Navigation Items */}
        <nav style={{ flex: 1, padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {NAV.map(({ to, icon: Icon, label }) => {
            const active = to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(to)
            return (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={`sidebar-nav-link ${active ? 'active' : ''}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--accent)' : 'var(--text-secondary)',
                  background: active ? 'var(--surface)' : 'transparent',
                  boxShadow: active ? 'var(--shadow-inset)' : 'none',
                  border: active ? '1px solid var(--input-border)' : '1px solid transparent',
                  minHeight: 44,
                  transition: 'all var(--transition)',
                }}
              >
                <Icon
                  size={18}
                  strokeWidth={active ? 2.4 : 1.9}
                  style={{
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                    flexShrink: 0,
                  }}
                />
                <span style={{ flex: 1 }}>{label}</span>
                {active && (
                  <ChevronRight size={14} style={{ color: 'var(--accent)', opacity: 0.9 }} />
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* API Status Footer */}
        <div style={{
          padding: '16px',
          borderTop: '1px solid var(--divider)',
          marginTop: 'auto',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 12px',
            background: 'var(--surface)',
            boxShadow: 'var(--shadow-inset)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--input-border)',
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
                <span>FastAPI Service</span>
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  color: apiOnline === true ? 'var(--success)' : apiOnline === false ? 'var(--danger)' : 'var(--text-muted)'
                }}>
                  {apiOnline === true ? 'Connected' : apiOnline === false ? 'Offline' : 'Checking…'}
                </span>
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
                127.0.0.1:8000
              </div>
            </div>
          </div>
        </div>
      </aside>

      <style>{`
        .sidebar-nav-link:hover:not(.active) {
          color: var(--text-primary) !important;
          background: var(--surface) !important;
          box-shadow: var(--shadow-raised-sm) !important;
        }
        @media (max-width: 900px) {
          .app-sidebar {
            transform: translateX(-100%);
            transition: transform 0.24s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: none;
          }
          .app-sidebar.sidebar-open {
            transform: translateX(0);
            box-shadow: 6px 0 28px rgba(0, 0, 0, 0.45);
          }
          .sidebar-close-btn {
            display: inline-flex !important;
          }
        }
      `}</style>
    </>
  )
}
