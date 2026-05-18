import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Icon } from '../common'
import {
  User, FLAG_X, FLAG_S, FLAG_N, flagsToString,
} from '../../types'

type PartylineUser = {
  handle: string
  online: boolean
}

type PresenceBarProps = {
  self: string              // current user's handle
  partylineUsers: PartylineUser[]
  users: User[]             // userlist for cross-referencing flags
  /** Boot another admin off partyline. When not provided, the action
   *  is hidden — typically only +x/+s owners should see it. */
  onBoot?: (handle: string, reason: string) => void
}

type PresenceEntry = {
  handle: string
  flags: number             // global flags, 0 if unknown
  flagString: string        // "xsnm..." or "-"
  tier: 'super' | 'owner' | 'admin' | 'unknown'
  isSelf: boolean
}

const MAX_VISIBLE = 4

function firstChar(handle: string): string {
  if (!handle) return '?'
  return handle[0].toUpperCase()
}

function classifyTier(flags: number): PresenceEntry['tier'] {
  if (flags & (FLAG_X | FLAG_S)) return 'super'
  if (flags & FLAG_N) return 'owner'
  return 'admin'
}

function sortPresence(a: PresenceEntry, b: PresenceEntry): number {
  if (a.isSelf && !b.isSelf) return -1
  if (!a.isSelf && b.isSelf) return 1
  const tierOrder: Record<PresenceEntry['tier'], number> = {
    super: 0, owner: 1, admin: 2, unknown: 3,
  }
  const diff = tierOrder[a.tier] - tierOrder[b.tier]
  if (diff !== 0) return diff
  return a.handle.localeCompare(b.handle)
}

export function PresenceBar({ self, partylineUsers, users, onBoot }: PresenceBarProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [bootTarget, setBootTarget] = useState<string | null>(null)
  const [bootReason, setBootReason] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click / Escape
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const entries = useMemo<PresenceEntry[]>(() => {
    // Deduplicate partyline users — sometimes duplicates arrive mid-state
    const seen = new Set<string>()
    const result: PresenceEntry[] = []

    for (const pu of partylineUsers) {
      if (!pu.online) continue
      const key = pu.handle.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)

      // Find matching user in userlist (case-insensitive)
      const user = users.find(u => u.name.toLowerCase() === key)
      const flags = user?.flags ?? 0

      result.push({
        handle: pu.handle,
        flags,
        flagString: flagsToString(flags),
        tier: user ? classifyTier(flags) : 'unknown',
        isSelf: pu.handle.toLowerCase() === self.toLowerCase(),
      })
    }

    // Ensure self is present even if partylineUsers doesn't list us yet
    if (self && !seen.has(self.toLowerCase())) {
      const user = users.find(u => u.name.toLowerCase() === self.toLowerCase())
      const flags = user?.flags ?? 0
      result.unshift({
        handle: self,
        flags,
        flagString: flagsToString(flags),
        tier: user ? classifyTier(flags) : 'unknown',
        isSelf: true,
      })
    }

    return result.sort(sortPresence)
  }, [partylineUsers, users, self])

  const visible = entries.slice(0, MAX_VISIBLE)
  const overflow = Math.max(0, entries.length - MAX_VISIBLE)

  if (entries.length === 0) return null

  return (
    <div className="presence-wrap" ref={wrapRef}>
      <button
        className={`presence-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={t('presence.tooltip')}
      >
        <div className="presence-pills">
          {visible.map(e => (
            <span
              key={e.handle}
              className={`presence-pill tier-${e.tier}${e.isSelf ? ' is-self' : ''}`}
              title={`${e.handle}${e.flagString && e.flagString !== '-' ? ` +${e.flagString}` : ''}${e.isSelf ? ' (you)' : ''}`}
            >
              {firstChar(e.handle)}
            </span>
          ))}
          {overflow > 0 && (
            <span className="presence-pill presence-more">+{overflow}</span>
          )}
        </div>
        <span className="presence-label">
          {entries.length} {t('presence.online')}
        </span>
        <Icon name="chevron-down" size={13} />
      </button>

      {open && (
        <div className="presence-dropdown" role="menu">
          <div className="presence-dropdown-header">
            {t('presence.title')}
            <span className="presence-count">{entries.length}</span>
          </div>
          <div className="presence-list">
            {entries.map(e => (
              <div
                key={e.handle}
                className={`presence-row tier-${e.tier}${e.isSelf ? ' is-self' : ''}`}
              >
                <span className={`presence-pill tier-${e.tier}`}>
                  {firstChar(e.handle)}
                </span>
                <span className="presence-handle mono">
                  {e.handle}
                  {e.isSelf && <span className="presence-you">{t('presence.you')}</span>}
                </span>
                <span className="presence-flags mono" title={e.flagString}>
                  {e.flagString !== '-' ? `+${e.flagString}` : '—'}
                </span>
                {onBoot && !e.isSelf && (
                  <button
                    className="presence-boot-btn"
                    onClick={() => { setBootTarget(e.handle); setBootReason('') }}
                    title={t('presence.boot')}
                    aria-label={t('presence.boot')}
                  >
                    <Icon name="logout" size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Boot confirmation + reason input */}
      {bootTarget && (
        <div className="shortcuts-backdrop" onClick={() => setBootTarget(null)}>
          <div className="shortcuts-card" style={{ maxWidth: 420 }} onClick={ev => ev.stopPropagation()}>
            <div className="shortcuts-header">
              <h2>{t('presence.bootConfirmTitle').replace('{user}', bootTarget)}</h2>
              <button className="icon-btn" onClick={() => setBootTarget(null)}>
                <Icon name="x" size={14} />
              </button>
            </div>
            <div style={{ padding: '1rem 1.25rem' }}>
              <p className="config-desc" style={{ marginBottom: '0.85rem' }}>
                {t('presence.bootConfirmBody')}
              </p>
              <input
                type="text"
                className="input"
                value={bootReason}
                onChange={ev => setBootReason(ev.target.value)}
                placeholder={t('presence.bootReasonPlaceholder')}
                autoFocus
                onKeyDown={ev => {
                  if (ev.key === 'Enter' && bootReason.trim()) {
                    onBoot?.(bootTarget, bootReason.trim())
                    setBootTarget(null)
                  }
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setBootTarget(null)}>
                  {t('common.cancel')}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={!bootReason.trim()}
                  onClick={() => {
                    onBoot?.(bootTarget, bootReason.trim())
                    setBootTarget(null)
                  }}
                >
                  <Icon name="logout" size={12} />
                  {t('presence.boot')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
