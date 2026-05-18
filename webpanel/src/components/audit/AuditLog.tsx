import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, Icon, EmptyState, Badge, ConfirmDialog, VIRTUALIZE_THRESHOLD } from '../common'
import {
  AuditEvent,
  AuditAction,
  clearAuditLog,
  exportAuditAsCsv,
  exportAuditAsJson,
  getAuditEvents,
  subscribeAudit,
} from '../../auditLog'

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
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }
  return d.toLocaleString(undefined, {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

function download(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function AuditLog() {
  const { t } = useTranslation()
  const [events, setEvents] = useState<AuditEvent[]>(() => getAuditEvents())
  const [actorFilter, setActorFilter] = useState('')
  const [actionFilter, setActionFilter] = useState<AuditAction | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'local' | 'broadcast'>('all')
  const [search, setSearch] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [visibleCount, setVisibleCount] = useState(100)

  useEffect(() => {
    const unsub = subscribeAudit(setEvents)
    return unsub
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events
      .filter(e => actorFilter === '' || e.actor.toLowerCase().includes(actorFilter.toLowerCase()))
      .filter(e => actionFilter === 'all' || e.action === actionFilter)
      .filter(e => sourceFilter === 'all' || e.source === sourceFilter)
      .filter(e => {
        if (!q) return true
        return (
          e.target.toLowerCase().includes(q) ||
          (e.detail ?? '').toLowerCase().includes(q) ||
          e.action.toLowerCase().includes(q) ||
          e.actor.toLowerCase().includes(q)
        )
      })
      .sort((a, b) => b.time - a.time)
  }, [events, actorFilter, actionFilter, sourceFilter, search])

  useEffect(() => {
    setVisibleCount(c => (c === 100 ? c : 100))
  }, [actorFilter, actionFilter, sourceFilter, search])

  const visible = useMemo(
    () => filtered.slice(0, visibleCount),
    [filtered, visibleCount]
  )
  const hasMore = filtered.length > visible.length

  // Distinct actors and actions for filter dropdowns
  const actors = useMemo(() => {
    return Array.from(new Set(events.map(e => e.actor))).sort()
  }, [events])
  const actions = useMemo(() => {
    return Array.from(new Set(events.map(e => e.action))).sort()
  }, [events])

  const handleClear = () => {
    clearAuditLog()
    setConfirmClear(false)
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>{t('audit.title')}</h2>
          <span className="view-subtitle">
            {events.length} {t('audit.totalEvents')}
          </span>
        </div>
        <div className="view-tools">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => download(`audit-${Date.now()}.json`, exportAuditAsJson(), 'application/json')}
          >
            <Icon name="inbox" size={13} />
            JSON
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => download(`audit-${Date.now()}.csv`, exportAuditAsCsv(), 'text/csv')}
          >
            <Icon name="inbox" size={13} />
            CSV
          </Button>
          <Button
            size="sm"
            variant="danger"
            onClick={() => setConfirmClear(true)}
            disabled={events.length === 0}
          >
            <Icon name="trash" size={13} />
            {t('audit.clear')}
          </Button>
        </div>
      </div>

      <div className="audit-filters">
        <label className="search-pill" style={{ minWidth: '220px', flex: '0 1 320px' }}>
          <Icon name="search" size={14} />
          <input
            type="text"
            placeholder={t('audit.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="icon-btn"
              style={{ width: 22, height: 22, borderRadius: 4 }}
              aria-label="Clear"
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </label>

        <select value={actorFilter} onChange={e => setActorFilter(e.target.value)} className="audit-select">
          <option value="">{t('audit.allActors')}</option>
          {actors.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <select
          value={actionFilter}
          onChange={e => setActionFilter(e.target.value as AuditAction | 'all')}
          className="audit-select"
        >
          <option value="all">{t('audit.allActions')}</option>
          {actions.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>

        <div className="filter-seg audit-source">
          <button
            className={sourceFilter === 'all' ? 'active' : ''}
            onClick={() => setSourceFilter('all')}
          >
            {t('audit.allSources')}
          </button>
          <button
            className={sourceFilter === 'local' ? 'active' : ''}
            onClick={() => setSourceFilter('local')}
          >
            {t('audit.sourceLocal')}
          </button>
          <button
            className={sourceFilter === 'broadcast' ? 'active' : ''}
            onClick={() => setSourceFilter('broadcast')}
          >
            {t('audit.sourceBroadcast')}
          </button>
        </div>

        <span className="mono text-xs text-ink-4 u-ml-auto">
          {hasMore ? `${visible.length} · ` : ''}{filtered.length} / {events.length}
        </span>
      </div>

      {events.length === 0 ? (
        <EmptyState
          icon="clock"
          title={t('audit.emptyTitle')}
          description={t('audit.emptyDesc')}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          variant="no-results"
          title={t('audit.noMatches')}
        />
      ) : (
        <div className="table-shell">
          <div className="table-wrapper">
            <table className={`table${visible.length >= VIRTUALIZE_THRESHOLD ? ' virtualized' : ''}`}>
              <thead>
                <tr>
                  <th style={{ width: '110px' }}>{t('audit.time')}</th>
                  <th style={{ width: '140px' }}>{t('audit.actor')}</th>
                  <th style={{ width: '140px' }}>{t('audit.action')}</th>
                  <th>{t('audit.target')}</th>
                  <th>{t('audit.detail')}</th>
                  <th style={{ width: '90px' }}>{t('audit.source')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(e => (
                  <tr key={e.id}>
                    <td className="mono text-xs text-ink-3">
                      {formatTime(e.time)}
                    </td>
                    <td className={`mono ${e.actor === 'me' ? 'text-accent' : 'text-ph'}`}>
                      {e.actor}
                    </td>
                    <td>
                      <Badge variant={ACTION_VARIANTS[e.action] ?? 'default'}>
                        {e.action}
                      </Badge>
                    </td>
                    <td className="mono text-sm">{e.target}</td>
                    <td className="mono text-xs text-ink-3">
                      {e.detail ?? '—'}
                    </td>
                    <td>
                      <span className={`audit-src audit-src-${e.source}`}>{e.source}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <div className="audit-loadmore">
              <Button size="sm" variant="ghost" onClick={() => setVisibleCount(c => c + 200)}>
                {t('audit.loadMore', { n: String(Math.min(200, filtered.length - visible.length)) })}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setVisibleCount(filtered.length)}>
                {t('audit.loadAll', { n: String(filtered.length) })}
              </Button>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={handleClear}
        title={t('audit.clearConfirmTitle')}
        message={t('audit.clearConfirmDesc')}
        confirmLabel={t('audit.clear')}
      />
    </div>
  )
}
