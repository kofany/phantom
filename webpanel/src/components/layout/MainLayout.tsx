import { ReactNode, useEffect, useState } from 'react'
import { Header } from './Header'
import { Sidebar } from './Sidebar'
import { MiniConsole } from './MiniConsole'
import { View, Message, User } from '../../types'
import { IconName, Icon, Tooltip } from '../common'

const SIDEBAR_COLLAPSED_KEY = 'phantom-sidebar-collapsed'

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function saveCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    /* private mode etc. — ignore */
  }
}

type PartylineUser = { handle: string; online: boolean }

type SidebarAction = {
  id: string
  icon: IconName
  labelKey: string
  variant?: 'default' | 'danger'
  onClick: () => void
}

type MainLayoutProps = {
  handle: string
  onLogout: () => void
  currentView: View
  onViewChange: (view: View) => void
  channelsCount: number
  usersCount: number
  botsCount: number
  messages: Message[]
  onCommand: (cmd: string) => void
  onChat: (text: string) => void
  wsStatus: 'online' | 'connecting' | 'offline'
  searchValue: string
  onSearchChange: (v: string) => void
  partylineUsers: PartylineUser[]
  users: User[]
  onBoot?: (handle: string, reason: string) => void
  onSelectFavorite?: (kind: 'channel' | 'user' | 'bot', name: string) => void
  sidebarActions?: SidebarAction[]
  children: ReactNode
}

export function MainLayout({
  handle,
  onLogout,
  currentView,
  onViewChange,
  channelsCount,
  usersCount,
  botsCount,
  messages,
  onCommand,
  onChat,
  wsStatus,
  searchValue,
  onSearchChange,
  partylineUsers,
  users,
  onBoot,
  onSelectFavorite,
  sidebarActions,
  children,
}: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadCollapsed)

  const toggleCollapsed = () => {
    setSidebarCollapsed(v => {
      const next = !v
      saveCollapsed(next)
      return next
    })
  }

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (!mobile) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <div className="layout">
      <Header
        handle={handle}
        onLogout={onLogout}
        onMenuToggle={() => setSidebarOpen(v => !v)}
        showMenuButton={isMobile}
        wsStatus={wsStatus}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        partylineUsers={partylineUsers}
        users={users}
        onBoot={onBoot}
      />
      <div className="layout-body">
        <Sidebar
          currentView={currentView}
          onViewChange={onViewChange}
          channelsCount={channelsCount}
          usersCount={usersCount}
          botsCount={botsCount}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onSelectFavorite={onSelectFavorite}
          actions={sidebarActions}
          collapsed={!isMobile && sidebarCollapsed}
        />
        {!isMobile && (
          <Tooltip
            content={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            side="right"
          >
            <button
              type="button"
              className={`sidebar-toggle ${sidebarCollapsed ? 'collapsed' : ''}`}
              onClick={toggleCollapsed}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <Icon name="chevron-left" size={14} />
            </button>
          </Tooltip>
        )}
        <main className="main-content">{children}</main>
      </div>
      {!isMobile && (
        <MiniConsole
          messages={messages}
          onCommand={onCommand}
          onChat={onChat}
        />
      )}
    </div>
  )
}
