import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Icon, IconName } from '../common'
import { fuzzyFilter, FuzzyMatch } from './fuzzy'
import { Channel, User, Bot, View } from '../../types'

const RECENT_KEY = 'phantom_palette_recent_v1'
const RECENT_MAX = 8

export type Command = {
  id: string
  title: string
  subtitle?: string
  icon?: IconName
  shortcut?: string
  group: 'navigation' | 'actions' | 'channels' | 'users' | 'bots' | 'recent'
  keywords?: string[]
  run: () => void
}

type CommandPaletteProps = {
  isOpen: boolean
  onClose: () => void
  channels: Channel[]
  users: User[]
  bots: Bot[]
  onNavigate: (view: View) => void
  onSelectChannel: (channel: Channel) => void
  onSelectUser: (user: User) => void
  onSelectBot: (bot: Bot) => void
  onAddUser?: () => void
  onAddBot?: () => void
  onAddChannel?: () => void
  onQuickBan?: () => void
  onMassBan?: () => void
  onVerify?: () => void
  onLogout: () => void
}

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveRecent(ids: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, RECENT_MAX)))
  } catch { /* storage full — drop */ }
}

// Render a title string with fuzzy-match indices highlighted
function Highlighted({ text, match }: { text: string; match: FuzzyMatch }) {
  if (match.indices.length === 0) return <>{text}</>
  const parts: { char: string; hit: boolean }[] = []
  let setIdx = new Set(match.indices)
  for (let i = 0; i < text.length; i++) {
    parts.push({ char: text[i], hit: setIdx.has(i) })
  }
  return (
    <>
      {parts.map((p, i) =>
        p.hit
          ? <span key={i} className="palette-hl">{p.char}</span>
          : <span key={i}>{p.char}</span>,
      )}
    </>
  )
}

const GROUP_LABELS: Record<Command['group'], string> = {
  recent: 'Recent',
  actions: 'Actions',
  navigation: 'Navigation',
  channels: 'Channels',
  users: 'Users',
  bots: 'Bots',
}

export function CommandPalette({
  isOpen,
  onClose,
  channels,
  users,
  bots,
  onNavigate,
  onSelectChannel,
  onSelectUser,
  onSelectBot,
  onAddUser,
  onAddBot,
  onAddChannel,
  onQuickBan,
  onMassBan,
  onVerify,
  onLogout,
}: CommandPaletteProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [recent, setRecent] = useState<string[]>(() => loadRecent())
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const commitRecent = (cmdId: string) => {
    const next = [cmdId, ...recent.filter(id => id !== cmdId)].slice(0, RECENT_MAX)
    setRecent(next)
    saveRecent(next)
  }

  // Reset state on open + focus input
  useEffect(() => {
    if (!isOpen) return
    setQuery('')
    setActiveIdx(0)
    setTimeout(() => inputRef.current?.focus(), 10)
  }, [isOpen])

  // Build the full command catalog — navigation + actions + resources
  const allCommands: Command[] = useMemo(() => {
    const cmds: Command[] = []

    // Navigation
    cmds.push(
      { id: 'nav:overview',  title: t('palette.navOverview'),   group: 'navigation', icon: 'dashboard', shortcut: 'g h', run: () => onNavigate('overview') },
      { id: 'nav:health',    title: t('palette.navHealth'),     group: 'navigation', icon: 'check',     shortcut: 'g k', run: () => onNavigate('health') },
      { id: 'nav:channels',  title: t('palette.navChannels'),   group: 'navigation', icon: 'hash',      shortcut: 'g c', run: () => onNavigate('channels') },
      { id: 'nav:users',     title: t('palette.navUsers'),      group: 'navigation', icon: 'users',     shortcut: 'g u', run: () => onNavigate('users') },
      { id: 'nav:bots',      title: t('palette.navBots'),       group: 'navigation', icon: 'bot',       shortcut: 'g b', run: () => onNavigate('bots') },
      { id: 'nav:topology',  title: t('palette.navTopology'),   group: 'navigation', icon: 'globe',     shortcut: 'g t', run: () => onNavigate('topology') },
      { id: 'nav:audit',     title: t('palette.navAudit'),      group: 'navigation', icon: 'clock',     shortcut: 'g a', run: () => onNavigate('audit') },
    )

    // Actions
    if (onQuickBan)  cmds.push({ id: 'act:quickban',  title: t('palette.actQuickBan'),   group: 'actions', icon: 'shield',   shortcut: 'Ctrl+B', keywords: ['ban', 'kick', 'mask'], run: onQuickBan })
    if (onMassBan)   cmds.push({ id: 'act:massban',   title: t('palette.actMassBan'),    group: 'actions', icon: 'zap',      keywords: ['ban', 'batch', 'mass', 'list', 'paste'], run: onMassBan })
    if (onVerify)    cmds.push({ id: 'act:verify',    title: t('palette.actVerify'),     group: 'actions', icon: 'check',    keywords: ['verify', 'consistency', 'sync', 'check'], run: onVerify })
    if (onAddUser)   cmds.push({ id: 'act:adduser',   title: t('palette.actAddUser'),    group: 'actions', icon: 'plus',     keywords: ['new', 'create'], run: onAddUser })
    if (onAddBot)    cmds.push({ id: 'act:addbot',    title: t('palette.actAddBot'),     group: 'actions', icon: 'plus',     keywords: ['new', 'create'], run: onAddBot })
    if (onAddChannel) cmds.push({ id: 'act:addchan',  title: t('palette.actAddChannel'), group: 'actions', icon: 'plus',     keywords: ['new', 'create'], run: onAddChannel })
    cmds.push({ id: 'act:logout', title: t('palette.actLogout'), group: 'actions', icon: 'logout', keywords: ['exit', 'signout', 'sign out'], run: onLogout })

    // Resources — channels, users, bots
    for (const ch of channels) {
      cmds.push({
        id: `chan:${ch.name}`,
        title: ch.name,
        subtitle: `${ch.usersCount} users${ch.opLockdown ? ' · op-lockdown' : ''}`,
        group: 'channels',
        icon: 'hash',
        run: () => onSelectChannel(ch),
      })
    }
    for (const u of users.filter(x => !x.isBot)) {
      cmds.push({
        id: `user:${u.name}`,
        title: u.name,
        subtitle: u.online ? 'online' : 'offline',
        group: 'users',
        icon: 'users',
        run: () => onSelectUser(u),
      })
    }
    for (const b of bots) {
      cmds.push({
        id: `bot:${b.name}`,
        title: b.name,
        subtitle: `${b.online ? 'online' : 'offline'}${b.server ? ' · ' + b.server : ''}`,
        group: 'bots',
        icon: 'bot',
        run: () => onSelectBot(b),
      })
    }

    return cmds
  }, [channels, users, bots, onNavigate, onSelectChannel, onSelectUser, onSelectBot, onAddUser, onAddBot, onAddChannel, onQuickBan, onMassBan, onVerify, onLogout, t])

  // Filter + rank
  const filtered = useMemo(() => {
    const q = query.trim()
    const searchText = (c: Command) =>
      [c.title, c.subtitle ?? '', (c.keywords ?? []).join(' ')].join(' ')
    const results = fuzzyFilter(q, allCommands, searchText)
    // When there's no query, inject "recent" section at the top
    if (!q) {
      const recentCmds = recent
        .map(id => allCommands.find(c => c.id === id))
        .filter((c): c is Command => !!c)
        .slice(0, RECENT_MAX)
      const recentEntries = recentCmds.map(c => ({
        item: { ...c, group: 'recent' as const },
        match: { score: 1000, indices: [] },
      }))
      const remaining = results.filter(r => !recentCmds.some(rc => rc.id === r.item.id))
      return [...recentEntries, ...remaining]
    }
    return results
  }, [query, allCommands, recent])

  // Group results for visual sections
  const grouped = useMemo(() => {
    const map = new Map<Command['group'], { item: Command; match: FuzzyMatch }[]>()
    for (const r of filtered) {
      const arr = map.get(r.item.group) ?? []
      arr.push(r)
      map.set(r.item.group, arr)
    }
    const groupOrder: Command['group'][] = ['recent', 'actions', 'navigation', 'channels', 'users', 'bots']
    return groupOrder
      .map(g => ({ group: g, items: map.get(g) ?? [] }))
      .filter(g => g.items.length > 0)
  }, [filtered])

  // Flat list for keyboard navigation (matches display order)
  const flatItems = useMemo(() => grouped.flatMap(g => g.items), [grouped])

  // Clamp active index when list changes
  useEffect(() => {
    if (activeIdx >= flatItems.length) setActiveIdx(Math.max(0, flatItems.length - 1))
  }, [flatItems, activeIdx])

  // Scroll active row into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const executeAt = (idx: number) => {
    const entry = flatItems[idx]
    if (!entry) return
    commitRecent(entry.item.id)
    entry.item.run()
    onClose()
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(flatItems.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      executeAt(activeIdx)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Home') {
      setActiveIdx(0)
    } else if (e.key === 'End') {
      setActiveIdx(flatItems.length - 1)
    }
  }

  if (!isOpen) return null

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette-card"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={t('palette.title')}
      >
        <div className="palette-input-row">
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => { setQuery(e.target.value); setActiveIdx(0) }}
            onKeyDown={handleKey}
            placeholder={t('palette.placeholder')}
            spellCheck={false}
            autoComplete="off"
          />
          <span className="palette-hint">
            <kbd>↑↓</kbd> <kbd>↵</kbd> <kbd>Esc</kbd>
          </span>
        </div>

        <div className="palette-list" ref={listRef}>
          {flatItems.length === 0 ? (
            <div className="palette-empty">{t('palette.noResults')}</div>
          ) : (
            grouped.map(group => {
              let runningIdx = 0
              // compute starting index for this group in flat list
              for (const g of grouped) {
                if (g.group === group.group) break
                runningIdx += g.items.length
              }
              return (
                <div key={group.group} className="palette-group">
                  <div className="palette-group-label">{GROUP_LABELS[group.group] || group.group}</div>
                  {group.items.map((entry, i) => {
                    const idx = runningIdx + i
                    const active = idx === activeIdx
                    return (
                      <button
                        key={entry.item.id}
                        data-idx={idx}
                        className={`palette-item ${active ? 'active' : ''}`}
                        onMouseMove={() => setActiveIdx(idx)}
                        onMouseDown={e => {
                          e.preventDefault()
                          executeAt(idx)
                        }}
                      >
                        {entry.item.icon && (
                          <span className="palette-icon">
                            <Icon name={entry.item.icon} size={14} />
                          </span>
                        )}
                        <span className="palette-title">
                          <Highlighted text={entry.item.title} match={entry.match} />
                        </span>
                        {entry.item.subtitle && (
                          <span className="palette-subtitle">{entry.item.subtitle}</span>
                        )}
                        {entry.item.shortcut && (
                          <span className="palette-shortcut mono">
                            {entry.item.shortcut}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

        <div className="palette-footer">
          <span className="mono"><kbd>⌘K</kbd> {t('palette.toggleHint')}</span>
          <span>{flatItems.length} {t('palette.results')}</span>
        </div>
      </div>
    </div>
  )
}
