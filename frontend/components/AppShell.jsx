'use client'
import { useState, useCallback, useEffect, createContext, useContext } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

const MobileSidebarCtx = createContext(() => {})
export const useOpenMobileSidebar = () => useContext(MobileSidebarCtx)

const ThemeCtx = createContext({ isDark: false, toggleTheme: () => {} })
export const useTheme = () => useContext(ThemeCtx)

function activeItemFromPath(pathname) {
  // 'new-contract' is an action button, not a page — never highlight it
  if (/^\/contracts\/[^/]+\/workspace/.test(pathname))      return 'workspace'
  if (pathname.startsWith('/contracts'))                     return 'contracts'
  if (pathname.startsWith('/dashboard'))                     return 'dashboard'
  if (pathname.startsWith('/settings'))                      return 'settings'
  return ''
}

const APP_PATHS = ['/dashboard', '/contracts', '/settings']

export default function AppShell({ children }) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const openMobile = useCallback(() => setMobileOpen(true), [])
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  useEffect(() => {
    const saved = localStorage.getItem('outcomex-theme')
    if (saved === 'dark') {
      setIsDark(true)
      document.documentElement.dataset.theme = 'dark'
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setIsDark(d => {
      const next = !d
      document.documentElement.dataset.theme = next ? 'dark' : ''
      localStorage.setItem('outcomex-theme', next ? 'dark' : 'light')
      return next
    })
  }, [])

  const isApp = APP_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  const theme = { isDark, toggleTheme }

  if (!isApp) {
    return (
      <ThemeCtx.Provider value={theme}>
        <MobileSidebarCtx.Provider value={openMobile}>{children}</MobileSidebarCtx.Provider>
      </ThemeCtx.Provider>
    )
  }

  const activeItem = activeItemFromPath(pathname)

  return (
    <ThemeCtx.Provider value={theme}>
      <MobileSidebarCtx.Provider value={openMobile}>
        <div className="app-shell" style={{ display: 'flex', height: '100svh', overflow: 'hidden' }}>
          <div className="app-sidebar-static">
            <Sidebar activeItem={activeItem} />
          </div>
          {mobileOpen && <Sidebar activeItem={activeItem} onClose={() => setMobileOpen(false)} />}
          {children}
        </div>
      </MobileSidebarCtx.Provider>
    </ThemeCtx.Provider>
  )
}
