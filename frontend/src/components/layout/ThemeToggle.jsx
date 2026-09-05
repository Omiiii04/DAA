import { Sun, Moon } from 'lucide-react'
import { useTheme } from '../../hooks/useTheme'

export default function ThemeToggle() {
  const { theme, isDark, toggleTheme } = useTheme()

  const handleKeyDown = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault()
      toggleTheme()
    }
  }

  return (
    <div
      className="theme-toggle-wrapper"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        userSelect: 'none',
      }}
    >
      <span
        id="theme-toggle-label"
        className="theme-toggle-label"
        style={{
          fontSize: '0.8125rem',
          fontWeight: 600,
          color: 'var(--text-secondary)',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {isDark ? (
          <>
            <Moon size={14} className="theme-toggle-icon" aria-hidden="true" style={{ color: 'var(--accent)' }} />
            <span>Dark</span>
          </>
        ) : (
          <>
            <Sun size={14} className="theme-toggle-icon" aria-hidden="true" style={{ color: 'var(--accent-2)' }} />
            <span>Light</span>
          </>
        )}
      </span>

      <button
        type="button"
        role="switch"
        id="app-theme-toggle"
        aria-checked={isDark}
        aria-labelledby="theme-toggle-label"
        title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
        onClick={toggleTheme}
        onKeyDown={handleKeyDown}
        className="theme-toggle__track"
        style={{
          border: 'none',
          padding: 0,
          outline: 'none',
          cursor: 'pointer',
        }}
      >
        <span className="theme-toggle__thumb" aria-hidden="true">
          {isDark ? (
            <Moon size={11} style={{ color: 'var(--accent-ink)' }} />
          ) : (
            <Sun size={11} style={{ color: 'var(--accent)' }} />
          )}
        </span>
      </button>
    </div>
  )
}
