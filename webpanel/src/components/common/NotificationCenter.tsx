import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, IconName } from './Icon'
import {
  getHistory,
  clearHistory,
  setPanelOpen,
  subscribeHistory,
  ToastHistoryEntry,
  ToastHistoryType,
} from '../../toastHistory'
import { useTranslation } from '../../hooks/useTranslation'

type NotificationCenterProps = {
  isOpen: boolean
  onClose: () => void
  /** Anchor element so the popover positions just below the bell. */
  anchorRect: DOMRect | null
  /** Emit when user clicks "Settings" — parent opens the existing modal. */
  onOpenSettings: () => void
}

const TYPE_ICON: Record<ToastHistoryType, IconName> = {
  success: 'check',
  error: 'alert-triangle',
  warning: 'alert-triangle',
  info: 'help-circle',
}

const FILTER_TYPES: Array<{ id: 'all' | ToastHistoryType; labelKey: string }> = [
  { id: 'all', labelKey: 'notifCenter.filterAll' },
  { id: 'error', labelKey: 'notifCenter.filterError' },
  { id: 'warning', labelKey: 'notifCenter.filterWarning' },
  { id: 'success', labelKey: 'notifCenter.filterSuccess' },
  { id: 'info', labelKey: 'notifCenter.filterInfo' },
]

function formatTime(d: Date, t: (k: string, p?: Record<string, string>) => string): string {
  const sec = Math.floor((Date.now() - d.getTime()) / 1000)
  if (sec < 30) return t('notifCenter.justNow')
  if (sec < 60) return t('notifCenter.secondsAgo', { n: String(sec) })
  if (sec < 3600) return t('notifCenter.minutesAgo', { n: String(Math.floor(sec / 60)) })
  if (sec < 86400) return t('notifCenter.hoursAgo', { n: String(Math.floor(sec / 3600)) })
  return d.toLocaleString()
}

export function NotificationCenter({
  isOpen,
  onClose,
  anchorRect,
  onOpenSettings,
}: NotificationCenterProps) {
  const { t } = useTranslation()
  const [, force] = useState(0)
  const [filter, setFilter] = useState<'all' | ToastHistoryType>('all')
  const wrapRef = useRef<HTMLDivElement>(null)

  // Reactive — re-render when history changes; also tick every 30s so the
  // relative timestamps stay accurate while the panel is open.
  useEffect(() => {
    if (!isOpen) return
    const unsub = subscribeHistory(() => force(n => n + 1))
    const id = window.setInterval(() => force(n => n + 1), 30000)
    return () => {
      unsub()
      window.clearInterval(id)
    }
  }, [isOpen])

  // Tell the history module so newly-fired toasts mark as read while open.
  useEffect(() => {
    setPanelOpen(isOpen)
    return () => setPanelOpen(false)
  }, [isOpen])

  // Outside click + Escape close.
  useEffect(() => {
    if (!isOpen) return
    const onDown = (e: globalThis.MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [isOpen, onClose])

  const all = getHistory()
  const filtered = useMemo<ToastHistoryEntry[]>(
    () => (filter === 'all' ? all : all.filter(e => e.type === filter)),
    [all, filter],
  )

  if (!isOpen) return null

  const positionStyle: React.CSSProperties = anchorRect
    ? {
        top: anchorRect.bottom + 8,
        right: window.innerWidth - anchorRect.right,
      }
    : { top: 60, right: 16 }

  return (
    <div className="notif-center" ref={wrapRef} style={positionStyle} role="dialog" aria-label={t('notifCenter.title')}>
      <div className="notif-head">
        <strong>{t('notifCenter.title')}</strong>
        <div className="notif-head-actions">
          <button
            type="button"
            className="notif-link"
            onClick={() => onOpenSettings()}
            title={t('notifCenter.settings')}
          >
            <Icon name="settings" size={13} />
          </button>
          {all.length > 0 && (
            <button
              type="button"
              className="notif-link"
              onClick={() => clearHistory()}
              title={t('notifCenter.clear')}
            >
              <Icon name="trash" size={13} />
            </button>
          )}
        </div>
      </div>

      <div className="notif-filters" role="tablist">
        {FILTER_TYPES.map(f => {
          const count =
            f.id === 'all' ? all.length : all.filter(e => e.type === f.id).length
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              className={`notif-filter${filter === f.id ? ' is-active' : ''}`}
              onClick={() => setFilter(f.id)}
            >
              {t(f.labelKey)}
              <span className="notif-filter-count">{count}</span>
            </button>
          )
        })}
      </div>

      <div className="notif-list">
        {filtered.length === 0 ? (
          <div className="notif-empty">
            <Icon name="bell-off" size={20} />
            <span>{t('notifCenter.empty')}</span>
          </div>
        ) : (
          filtered.map(e => (
            <div key={e.id} className={`notif-item notif-${e.type}${!e.read ? ' is-unread' : ''}`}>
              <span className="notif-item-icon" aria-hidden>
                <Icon name={TYPE_ICON[e.type]} size={14} />
              </span>
              <div className="notif-item-body">
                <span className="notif-item-msg">{e.message}</span>
                <span className="notif-item-time">{formatTime(e.time, t)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
