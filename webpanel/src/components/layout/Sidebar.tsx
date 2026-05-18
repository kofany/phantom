import { useEffect, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { View } from '../../types'
import { Icon, IconName, Logo, AnimatedCount } from '../common'
import {
  Favorite, RecentItem, FavoriteKind,
  getPinned, getRecent, subscribePinned, subscribeRecent, togglePinned,
} from '../../favorites'

// Persist per-section collapsed state across reloads. Stored as an object
// keyed by section id so future sections don't need a migration.
const COLLAPSED_KEY = 'phantom:sidebar:collapsed'

type CollapsedMap = Record<string, boolean>

function loadCollapsed(): CollapsedMap {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveCollapsed(map: CollapsedMap) {
  try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(map)) } catch { /* ignore quota */ }
}

type SidebarAction = {
  id: string
  icon: IconName
  labelKey: string
  variant?: 'default' | 'danger'
  onClick: () => void
}

type SidebarProps = {
  currentView: View
  onViewChange: (view: View) => void
  channelsCount: number
  usersCount: number
  botsCount: number
  isOpen: boolean
  onClose: () => void
  /** Navigate to a specific pinned / recent resource */
  onSelectFavorite?: (kind: FavoriteKind, name: string) => void
  /** Optional destructive/quick actions rendered under an "Actions" section */
  actions?: SidebarAction[]
  /** Collapse to icon-only mode (desktop only). Mobile drawer ignores this. */
  collapsed?: boolean
}

const KIND_ICON: Record<FavoriteKind, IconName> = {
  channel: 'hash',
  user: 'users',
  bot: 'bot',
}

type NavEntry = {
  view: View
  icon: IconName
  labelKey: string
  count?: number
}

export function Sidebar({
  currentView,
  onViewChange,
  channelsCount,
  usersCount,
  botsCount,
  isOpen,
  onClose,
  onSelectFavorite,
  actions,
  collapsed = false,
}: SidebarProps) {
  const { t } = useTranslation()
  const [pinned, setPinned] = useState<Favorite[]>(() => getPinned())
  const [recent, setRecent] = useState<RecentItem[]>(() => getRecent())
  const [collapsedMap, setCollapsedMap] = useState<CollapsedMap>(() => loadCollapsed())

  useEffect(() => {
    const unsubP = subscribePinned(setPinned)
    const unsubR = subscribeRecent(setRecent)
    return () => { unsubP(); unsubR() }
  }, [])

  const toggleSection = (id: string) => {
    setCollapsedMap(m => {
      const next = { ...m, [id]: !m[id] }
      saveCollapsed(next)
      return next
    })
  }
  const isCollapsed = (id: string) => collapsedMap[id] === true

  const handleClick = (view: View) => {
    onViewChange(view)
    onClose()
  }

  const handleFav = (kind: FavoriteKind, name: string) => {
    onSelectFavorite?.(kind, name)
    onClose()
  }

  // Recent items minus ones already pinned (avoid duplication)
  const recentFiltered = recent.filter(
    r => !pinned.some(p => p.kind === r.kind && p.name === r.name),
  )

  const primary: NavEntry[] = [
    { view: 'overview', icon: 'dashboard', labelKey: 'nav.overview' },
    { view: 'help',     icon: 'help-circle', labelKey: 'nav.help' },
  ]

  const manage: NavEntry[] = [
    { view: 'channels', icon: 'hash',   labelKey: 'nav.channels', count: channelsCount },
    { view: 'users',    icon: 'users',  labelKey: 'nav.users',    count: usersCount },
    { view: 'bots',     icon: 'bot',    labelKey: 'nav.bots',     count: botsCount },
    { view: 'matrix',   icon: 'grid',   labelKey: 'nav.matrix' },
    { view: 'bans',     icon: 'shield', labelKey: 'nav.bans' },
  ]

  const monitor: NavEntry[] = [
    { view: 'health',   icon: 'check',  labelKey: 'nav.health' },
    { view: 'topology', icon: 'globe',  labelKey: 'nav.topology' },
    { view: 'irc',      icon: 'server', labelKey: 'nav.irc' },
    { view: 'idiots',   icon: 'alert-triangle', labelKey: 'nav.idiots' },
    { view: 'audit',    icon: 'clock',  labelKey: 'nav.audit' },
    { view: 'hub-settings', icon: 'settings', labelKey: 'nav.hubSettings' },
    { view: 'telegram', icon: 'send', labelKey: 'nav.telegram' },
  ]

  const renderSectionHeader = (id: string, labelKey: string, count?: number) => {
    const collapsed = isCollapsed(id)
    return (
      <button
        key={`h:${id}`}
        type="button"
        className={`nav-section nav-section-toggle${collapsed ? ' collapsed' : ''}`}
        onClick={() => toggleSection(id)}
        aria-expanded={!collapsed}
      >
        <Icon name="chevron-right" size={11} />
        <span className="nav-section-label">{t(labelKey)}</span>
        {count !== undefined && <span className="nav-section-count">{count}</span>}
      </button>
    )
  }

  const renderEntry = (e: NavEntry) => (
    <button
      key={e.view}
      className={`nav-item ${currentView === e.view ? 'active' : ''}`}
      onClick={() => handleClick(e.view)}
      aria-current={currentView === e.view ? 'page' : undefined}
      title={collapsed ? t(e.labelKey) : undefined}
    >
      <span className="nav-icon">
        <Icon name={e.icon} size={17} />
      </span>
      <span className="nav-label">{t(e.labelKey)}</span>
      {e.count !== undefined && <AnimatedCount value={e.count} />}
    </button>
  )

  return (
    <>
      <div className={`sidebar-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <aside
        className={`sidebar ${isOpen ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`}
        aria-label="Primary navigation"
      >
        <nav className="sidebar-nav">
          {renderSectionHeader('home', 'nav.sectionHome')}
          {!isCollapsed('home') && primary.map(renderEntry)}
          {renderSectionHeader('manage', 'nav.sectionManage')}
          {!isCollapsed('manage') && manage.map(renderEntry)}
          {renderSectionHeader('monitor', 'nav.sectionMonitor')}
          {!isCollapsed('monitor') && monitor.map(renderEntry)}

          {actions && actions.length > 0 && (
            <>
              {renderSectionHeader('actions', 'nav.sectionActions')}
              {!isCollapsed('actions') && actions.map(a => (
                <button
                  key={a.id}
                  className={`nav-item nav-action${a.variant === 'danger' ? ' nav-action-danger' : ''}`}
                  onClick={() => { a.onClick(); onClose() }}
                >
                  <span className="nav-icon"><Icon name={a.icon} size={17} /></span>
                  <span className="nav-label">{t(a.labelKey)}</span>
                </button>
              ))}
            </>
          )}

          {pinned.length > 0 && (
            <>
              {renderSectionHeader('pinned', 'nav.sectionPinned', pinned.length)}
              {!isCollapsed('pinned') && pinned.map(p => (
                <button
                  key={`p:${p.kind}:${p.name}`}
                  className="nav-item nav-fav"
                  onClick={() => handleFav(p.kind, p.name)}
                  title={p.name}
                >
                  <span className="nav-icon"><Icon name={KIND_ICON[p.kind]} size={15} /></span>
                  <span className="nav-label">{p.name}</span>
                  <button
                    className="nav-fav-unpin"
                    onClick={e => {
                      e.stopPropagation()
                      togglePinned(p.kind, p.name)
                    }}
                    aria-label={t('nav.unpin')}
                    title={t('nav.unpin')}
                  >
                    <Icon name="x" size={10} />
                  </button>
                </button>
              ))}
            </>
          )}

          {recentFiltered.length > 0 && (
            <>
              {renderSectionHeader('recent', 'nav.sectionRecent', recentFiltered.length)}
              {!isCollapsed('recent') && recentFiltered.map(r => (
                <button
                  key={`r:${r.kind}:${r.name}`}
                  className="nav-item nav-fav nav-fav-recent"
                  onClick={() => handleFav(r.kind, r.name)}
                  title={r.name}
                >
                  <span className="nav-icon"><Icon name={KIND_ICON[r.kind]} size={14} /></span>
                  <span className="nav-label">{r.name}</span>
                </button>
              ))}
            </>
          )}
        </nav>
        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Logo size="sm" />
            <span>Phantom · v0.1</span>
          </div>
        </div>
      </aside>
    </>
  )
}
