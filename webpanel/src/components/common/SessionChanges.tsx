import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Icon } from './Icon'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'
import {
  SessionChange,
  clearSessionChanges,
  getSessionChanges,
  subscribeSessionChanges,
} from '../../sessionChanges'

const SCOPE_LABELS: Record<string, string> = {
  'bot-config': 'config',
  'bot-setting': 'setting',
  'user-flags': 'flags',
  'channel-setting': 'chanset',
  'channel-protlist': 'protlist',
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function truncate(v: string, max = 64): string {
  return v.length > max ? v.slice(0, max - 1) + '…' : v
}

export function SessionChanges() {
  const { t } = useTranslation()
  const [changes, setChanges] = useState<SessionChange[]>(() => getSessionChanges())
  const [open, setOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    return subscribeSessionChanges(setChanges)
  }, [])

  const ordered = useMemo(() => [...changes].reverse(), [changes])

  if (changes.length === 0) return null

  return (
    <div className={`session-changes${open ? ' open' : ''}`}>
      {!open && (
        <button
          type="button"
          className="session-changes-pill"
          onClick={() => setOpen(true)}
          aria-label={t('sessionChanges.title')}
          title={t('sessionChanges.title')}
        >
          <Icon name="clock" size={13} />
          <span className="mono">{changes.length}</span>
        </button>
      )}
      {open && (
        <div className="session-changes-drawer" role="dialog" aria-label={t('sessionChanges.title')}>
          <div className="session-changes-head">
            <Icon name="clock" size={14} />
            <h4>{t('sessionChanges.title')}</h4>
            <span className="mono session-changes-count">{changes.length}</span>
            <div className="session-changes-actions">
              <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
                <Icon name="trash" size={12} />
                {t('sessionChanges.clear')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)} aria-label={t('common.close')}>
                <Icon name="x" size={12} />
              </Button>
            </div>
          </div>
          <p className="session-changes-hint">{t('sessionChanges.hint')}</p>
          <ul className="session-changes-list">
            {ordered.map(c => (
              <li key={c.id} className="session-changes-row">
                <div className="session-changes-row-head">
                  <span className="session-changes-time mono">{formatTime(c.time)}</span>
                  <span className="session-changes-scope">{SCOPE_LABELS[c.scope] ?? c.scope}</span>
                  <span className="mono session-changes-target">{c.target}</span>
                </div>
                <div className="session-changes-diff">
                  <span className="session-changes-field mono">{c.field}</span>
                  <span className="session-changes-before mono" title={c.before}>
                    {c.before ? truncate(c.before) : '—'}
                  </span>
                  <Icon name="chevron-right" size={11} />
                  <span className="session-changes-after mono" title={c.after}>
                    {c.after ? truncate(c.after) : '—'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ConfirmDialog
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          clearSessionChanges()
          setConfirmClear(false)
        }}
        title={t('sessionChanges.clearConfirmTitle')}
        message={t('sessionChanges.clearConfirmDesc')}
        confirmLabel={t('sessionChanges.clear')}
      />
    </div>
  )
}
