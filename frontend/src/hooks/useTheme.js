import { useState, useEffect, useCallback } from 'react'

const THEME_KEY = 'theme'

function getInitialTheme() {
  if (typeof window === 'undefined') return 'dark'
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr) return attr

  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'light' || stored === 'dark') return stored

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setThemeState] = useState(getInitialTheme)

  const applyTheme = useCallback((nextTheme) => {
    const valid = nextTheme === 'light' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', valid)
    localStorage.setItem(THEME_KEY, valid)
    setThemeState(valid)
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: valid } }))
  }, [])

  const toggleTheme = useCallback(() => {
    const current = document.documentElement.getAttribute('data-theme') || theme
    const next = current === 'dark' ? 'light' : 'dark'
    applyTheme(next)
  }, [theme, applyTheme])

  // Synchronize if system theme changes and no explicit stored preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleSystemChange = (e) => {
      if (!localStorage.getItem(THEME_KEY)) {
        applyTheme(e.matches ? 'dark' : 'light')
      }
    }

    mediaQuery.addEventListener('change', handleSystemChange)
    return () => mediaQuery.removeEventListener('change', handleSystemChange)
  }, [applyTheme])

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme,
    setTheme: applyTheme,
  }
}
