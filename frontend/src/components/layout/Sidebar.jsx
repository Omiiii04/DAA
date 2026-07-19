import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutDashboard, Database, PlayCircle, Timer,
  TrendingUp, Activity, ChevronRight, FileText, Brain
} from 'lucide-react'
import { motion } from 'framer-motion'

const NAV = [
  { to: '/',           icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/datasets',   icon: Database,        label: 'Datasets' },
  { to: '/analyze',    icon: PlayCircle,      label: 'Analyze' },
  { to: '/benchmark',  icon: Timer,           label: 'Benchmark' },
  { to: '/complexity', icon: TrendingUp,      label: 'Complexity' },
  { to: '/reports',    icon: FileText,        label: 'Reports' },
  { to: '/ml',         icon: Brain,           label: 'ML Trainer' },
]

export default function Sidebar({ apiOnline }) {
  const location = useLocation()

  return (
    <aside style={{
      width: 'var(--sidebar-width)',
      minHeight: '100vh',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 100,
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{
        padding: '20px 20px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{
          width: 36, height: 36,
          borderRadius: 10,
          background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 16px var(--primary-glow)',
          flexShrink: 0,
        }}>
          <Activity size={18} color="#fff" />
        </div>
        <div>
          <div style={{
            fontWeight: 800,
            fontSize: '0.875rem',
            color: 'var(--text-primary)',
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
          }}>Stock Peak</div>
          <div style={{
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            fontWeight: 500,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>DAA Analyzer</div>
        </div>
      </div>

      {/* Nav Label */}
      <div style={{
        padding: '20px 20px 8px',
        fontSize: '0.65rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--text-muted)',
      }}>Navigation</div>

      {/* Nav Links */}
      <nav style={{ flex: 1, padding: '0 12px' }}>
        {NAV.map(({ to, icon: Icon, label }) => {
          const active = to === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(to)
          return (
            <NavLink
              key={to}
              to={to}
              style={{ display: 'block', marginBottom: 2, textDecoration: 'none' }}
            >
              <motion.div
                whileHover={{ x: 2 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '9px 12px',
                  borderRadius: 'var(--radius)',
                  cursor: 'pointer',
                  background: active ? 'var(--primary-dim)' : 'transparent',
                  border: active ? '1px solid var(--border-active)' : '1px solid transparent',
                  boxShadow: active ? '0 0 16px var(--primary-glow)' : 'none',
                  transition: 'all 0.15s ease',
                  color: active ? 'var(--primary-light)' : 'var(--text-muted)',
                }}
              >
                <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                <span style={{
                  fontSize: '0.875rem',
                  fontWeight: active ? 600 : 500,
                  flex: 1,
                }}>{label}</span>
                {active && <ChevronRight size={12} style={{ opacity: 0.7 }} />}
              </motion.div>
            </NavLink>
          )
        })}
      </nav>

      {/* API Status Footer */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px',
          background: 'var(--bg-surface-2)',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
        }}>
          <span className={`status-dot ${apiOnline ? 'green' : 'red'}`} />
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              API {apiOnline ? 'Online' : 'Offline'}
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
              localhost:8000
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
