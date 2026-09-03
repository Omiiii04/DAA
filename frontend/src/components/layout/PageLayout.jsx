import { useState, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function PageLayout({ apiOnline }) {
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Automatically close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
      {/* Sidebar (fixed desktop, drawer mobile) */}
      <Sidebar
        apiOnline={apiOnline}
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area */}
      <div
        className="layout-main-column"
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          minWidth: 0,
        }}
      >
        <TopBar
          onMenuToggle={() => setMobileMenuOpen((prev) => !prev)}
          isMobileMenuOpen={mobileMenuOpen}
        />

        <main id="main-content" style={{ flex: 1, overflowY: 'auto' }}>
          <div
            className="page-content-container"
            style={{
              padding: '24px',
              maxWidth: 1360,
              margin: '0 auto',
              width: '100%',
            }}
          >
            <Outlet />
          </div>
        </main>
      </div>

      <style>{`
        .layout-main-column {
          margin-left: var(--sidebar-width);
          transition: margin-left var(--transition);
        }
        @media (max-width: 900px) {
          .layout-main-column {
            margin-left: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}
