import { useEffect, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Icon, Badge, EmptyState } from '../common'
import { AuditEvent, getAuditEventsForTarget, subscribeAudit } from '../../auditLog'

type ObjectHistoryProps = {
  target: string
  /** Cap the rendered list. Defaults to 20 — enough for at-a-glance context. */
  limit?: number
  /** Optional click handler to open the full audit view filtered to `target`. */
  onOpenFull?: () => void
}

const ACTION_VARIANTS: Record<string, 'default' | 'warning' | 'danger' | 'success'> = {
  add_user: 'success', add_host: 'success', add_bot: 'success', add_chan: 'success',
  add_ban: 'warning', add_stick: 'warning', add_exempt: 'default', add_invite: 'default',
  add_reop: 'default',
  del_user: 'danger', del_host: 'danger', del_bot: 'danger', del_chan: 'danger',
  del_ban: 'default', del_exempt: 'default', del_invite: 'default', del_reop: 'default',
  set_flags: 'warning', chattr: 'warning',
  chset: 'default', set_cfg: 'default', cfg_save: 'default',
  set_pass: 'warning',
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const now = new Date()
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  return d.toLocaleString(undefined, {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export function ObjectHistory({ target, limit = 20, onOpenFull }: ObjectHistoryProps) {
  const { t } = useTranslation()
  const [events, setEvents] = useState<AuditEvent[]>(() =>
    getAuditEventsForTarget(target, limit)
  )

  useEffect(() => {
    setEvents(getAuditEventsForTarget(target, limit))
    const unsub = subscribeAudit(() => {
      setEvents(getAuditEventsForTarget(target, limit))
    })
    return unsub
  }, [target, limit])

  if (events.length === 0) {
    return (
      <div className="object-history">
        <div className="object-history-head">
          <Icon name="clock" size={13} />
          <span>{t('objectHistory.title')}</span>
        </div>
        <EmptyState
          icon="clock"
          title={t('objectHistory.emptyTitle')}
          description={t('objectHistory.emptyDesc')}
        />
      </div>
    )
  }

  return (
    <div className="object-history">
      <div className="object-history-head">
        <Icon name="clock" size={13} />
        <span>{t('objectHistory.title')}</span>
        <span className="mono object-history-count">{events.length}</span>
        {onOpenFull && (
          <button type="button" className="object-history-link" onClick={onOpenFull}>
            {t('objectHistory.openFull')}
          </button>
        )}
      </div>
      <ul className="object-history-list">
        {events.map(e => (
          <li key={e.id} className="object-history-row">
            <span className="object-history-time mono">{formatTime(e.time)}</span>
            <span
              className="object-history-actor mono"
              style={{ color: e.actor === 'me' ? 'var(--accent)' : 'var(--ph)' }}
            >
              {e.actor}
            </span>
            <Badge variant={ACTION_VARIANTS[e.action] ?? 'default'}>
              {e.action}
            </Badge>
            {e.detail && (
              <span className="object-history-detail mono" title={e.detail}>
                {e.detail}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
