import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Icon, LanguageSwitcher, DensityToggle, Tooltip, Logo, NotificationCenter } from '../common'
import { getUnreadCount, subscribeHistory } from '../../toastHistory'
import { PresenceBar } from './PresenceBar'
import { User } from '../../types'
import { NotificationSettingsModal } from '../modals'
import {
  type NotificationSettings,
  getSettings,
  subscribeSettings,
  getPermission,
  isSupported,
} from '../../notifications'

type PartylineUser = { handle: string; online: boolean }

type HeaderProps = {
  handle: string
  onLogout: () => void
  onMenuToggle: () => void
  showMenuButton: boolean
  wsStatus: 'online' | 'connecting' | 'offline'
  searchValue: string
  onSearchChange: (v: string) => void
  onSearchSubmit?: () => void
  partylineUsers: PartylineUser[]
  users: User[]
  onBoot?: (handle: string, reason: string) => void
}

function initials(handle: string): string {
  const parts = handle.trim().split(/[\s._-]+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

export function Header({
  handle,
  onLogout,
  onMenuToggle,
  showMenuButton,
  wsStatus,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  partylineUsers,
  users,
  onBoot,
}: HeaderProps) {
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifSettingsOpen, setNotifSettingsOpen] = useState(false)
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>(() => getSettings())
  const [unread, setUnread] = useState(getUnreadCount())
  const searchRef = useRef<HTMLInputElement>(null)
  const menuWrapRef = useRef<HTMLDivElement>(null)
  const bellRef = useRef<HTMLButtonElement>(null)
  const [bellRect, setBellRect] = useState<DOMRect | null>(null)

  useEffect(() => subscribeSettings(setNotifSettings), [])
  useEffect(() => subscribeHistory(() => setUnread(getUnreadCount())), [])

  // Re-evaluate the bell icon state on every render — `getPermission()` is
  // a thin wrapper around `Notification.permission`, so this is cheap and
  // catches changes the user makes outside the panel (browser site
  // settings, system DND mode, etc.).
  const notifSupported = isSupported()
  const notifGranted = notifSupported && getPermission() === 'granted'
  const notifActive = notifSettings.enabled && notifGranted
  const bellIcon = notifActive ? 'bell' : 'bell-off'
  const bellTitle = !notifSupported
    ? t('notifications.unsupported')
    : notifActive
      ? t('notifications.activeTitle')
      : t('notifications.inactiveTitle')

  // `/` shortcut focuses search globally (unless typing in input)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      if (e.key === '/' && !isEditable) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        searchRef.current?.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Click outside closes avatar menu
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (!menuWrapRef.current?.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [menuOpen])

  const wsLabel =
    wsStatus === 'online'
      ? t('chrome.wsLive')
      : wsStatus === 'connecting'
      ? t('chrome.wsConnecting')
      : t('chrome.wsOffline')

  return (
    <header className="header">
      <div className="header-left">
        {showMenuButton && (
          <button
            className="menu-toggle"
            onClick={onMenuToggle}
            aria-label="Toggle navigation"
          >
            <Icon name="menu" size={18} />
          </button>
        )}
        <div className="header-brand">
          <Logo />
          <div className="brand-meta">
            <strong>Phantom</strong>
            <span>Botnet Control</span>
          </div>
        </div>
        <div className="header-divider" aria-hidden />
        <div className="header-sub">
          <span className="sub-primary">{t('chrome.subtitleMain')}</span>
          <span>{t('chrome.subtitleMeta')}</span>
        </div>
      </div>

      <div className="header-right">
        <label
          className="search-pill"
          onClick={() => searchRef.current?.focus()}
        >
          <Icon name="search" size={15} />
          <input
            ref={searchRef}
            type="text"
            placeholder={t('chrome.searchPlaceholder')}
            value={searchValue}
            onChange={e => onSearchChange(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                onSearchSubmit?.()
              }
            }}
            aria-label="Global search"
          />
          <span className="kbd-hint">
            <kbd>/</kbd>
          </span>
        </label>

        <Tooltip content={wsLabel} side="bottom">
          <span
            className="live-pill"
            data-state={wsStatus}
            aria-live="polite"
          >
            <span className="dot" />
            {wsLabel}
          </span>
        </Tooltip>

        <PresenceBar
          self={handle}
          partylineUsers={partylineUsers}
          users={users}
          onBoot={onBoot}
        />

        <DensityToggle />
        <LanguageSwitcher />

        <Tooltip content={bellTitle} side="bottom">
          <button
            ref={bellRef}
            type="button"
            className={`bell-btn${notifActive ? ' is-active' : ''}${unread > 0 ? ' has-unread' : ''}`}
            onClick={() => {
              setBellRect(bellRef.current?.getBoundingClientRect() ?? null)
              setNotifOpen(v => !v)
            }}
            aria-label={t('notifications.title')}
            aria-expanded={notifOpen}
          >
            <Icon name={bellIcon} size={16} />
            {unread > 0 && (
              <span className="bell-badge" aria-label={`${unread} unread`}>
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        </Tooltip>

        <div className="menu-wrap" ref={menuWrapRef}>
          <button
            className="avatar-btn"
            onClick={() => setMenuOpen(v => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            <span className="avatar">{initials(handle)}</span>
            <span className="handle">{handle}</span>
            <Icon name="chevron-down" size={14} />
          </button>
          {menuOpen && (
            <div className="menu-pop" role="menu">
              <div className="menu-label">{t('chrome.signedInAs')}</div>
              <div
                className="menu-item mono"
                style={{ color: 'var(--accent)', pointerEvents: 'none' }}
              >
                {handle}
              </div>
              <div className="menu-sep" />
              <button type="button" className="destructive" onClick={onLogout}>
                <Icon name="logout" size={15} />
                {t('auth.logout')}
              </button>
            </div>
          )}
        </div>
      </div>

      <NotificationCenter
        isOpen={notifOpen}
        onClose={() => setNotifOpen(false)}
        anchorRect={bellRect}
        onOpenSettings={() => {
          setNotifOpen(false)
          setNotifSettingsOpen(true)
        }}
      />

      <NotificationSettingsModal
        isOpen={notifSettingsOpen}
        onClose={() => setNotifSettingsOpen(false)}
      />
    </header>
  )
}
