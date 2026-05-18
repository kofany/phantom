import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, Icon, EmptyState, ConfirmDialog, SkeletonPanel } from '../common'
import { Message } from '../../types'
import { parseIdiotsOutput, IDIOTS_SILENT_RE, IdiotEntry } from '../../utils/parsers'

type IdiotsListProps = {
  messages: Message[]
  onCommandSilent: (cmd: string, pattern: RegExp, durationMs?: number) => void
  canEdit: boolean
}

export function IdiotsList({ messages, onCommandSilent, canEdit }: IdiotsListProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<IdiotEntry[]>([])
  const [addrs, setAddrs] = useState<string[]>([])
  const [offenceCount, setOffenceCount] = useState(0)
  const [sawHostsHeader, setSawHostsHeader] = useState(false)
  const [loading, setLoading] = useState(false)
  const [denied, setDenied] = useState(false)
  const [addingHost, setAddingHost] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const fetchStartIdxRef = useRef(0)
  const lastMatchTsRef = useRef(0)
  const fetchStartTsRef = useRef(0)
  const debounceTimerRef = useRef<number | null>(null)

  const fetch = () => {
    setLoading(true)
    setDenied(false)
    setOffenceCount(0)
    setSawHostsHeader(false)
    fetchStartIdxRef.current = messages.length
    fetchStartTsRef.current = Date.now()
    lastMatchTsRef.current = Date.now()
    onCommandSilent('idiots', IDIOTS_SILENT_RE, 5000)
  }

  useEffect(() => {
    fetch()
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loading) return
    const newMsgs = messages.slice(fetchStartIdxRef.current)
    if (newMsgs.length === 0) return

    // We re-run the parser on the entire window since the last fetch.
    // It's cheap (few dozen lines tops) and lets the parser own all the
    // section / header logic in one place. Tests in utils/parsers.test
    // cover the format exhaustively.
    const result = parseIdiotsOutput(newMsgs.map(m => m.text))

    if (result.denied) {
      setDenied(true)
      setLoading(false)
      return
    }

    // Track when we last saw a parser-relevant line to drive quiescence.
    const sawAnything = newMsgs.some(m =>
      IDIOTS_SILENT_RE.test(m.text),
    )
    if (sawAnything) {
      lastMatchTsRef.current = Date.now()
    }

    if (result.hosts.length > 0 || result.addrs.length > 0) {
      setEntries(result.hosts)
      setAddrs(result.addrs)
    }
    if (result.offenceCount > 0) setOffenceCount(result.offenceCount)
    if (result.sawHostsHeader) setSawHostsHeader(true)

    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = window.setTimeout(() => {
      const sinceLast = Date.now() - lastMatchTsRef.current
      const sinceStart = Date.now() - fetchStartTsRef.current
      if (sinceLast >= 1500 || sinceStart >= 10000) {
        // Empty result after a real reply means hosts genuinely empty —
        // commit to the empty state rather than spinning forever.
        if (result.hosts.length === 0 && result.addrs.length === 0) {
          setEntries([])
          setAddrs([])
        }
        setLoading(false)
      }
    }, 1550)
  }, [messages, loading])

  const handleAdd = () => {
    const host = addingHost.trim()
    if (!host || !canEdit) return
    onCommandSilent(`+idiot ${host}`, /^(?:\([^)]+\)\s+)?(?:idiots?:|added|ok,)/i, 2000)
    setAddingHost('')
    window.setTimeout(() => fetch(), 600)
  }

  const handleRemove = (mask: string) => {
    if (!canEdit) return
    onCommandSilent(`-idiot ${mask}`, /^(?:\([^)]+\)\s+)?(?:idiots?:|removed|ok,)/i, 2000)
    setEntries(prev => prev.filter(e => e.mask !== mask))
    window.setTimeout(() => fetch(), 600)
  }

  // Quick search
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return entries
    return entries.filter(e =>
      e.mask.toLowerCase().includes(needle) ||
      (e.addedBy ?? '').toLowerCase().includes(needle)
    )
  }, [entries, q])

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>{t('idiots.title')}</h2>
          <span className="view-subtitle">
            {entries.length} {t('idiots.totalEntries')}
            {offenceCount > 0 && (
              <>
                {' · '}
                <span className="text-ink-3">
                  {t('idiots.offenceCount', { n: String(offenceCount) })}
                </span>
              </>
            )}
            {!loading && !denied && !sawHostsHeader && (
              <>
                {' · '}
                <span className="text-warn" title={t('idiots.truncatedHint')}>
                  {t('idiots.truncated')}
                </span>
              </>
            )}
          </span>
        </div>
        <div className="view-tools">
          <Button size="sm" variant="ghost" onClick={fetch} disabled={loading}>
            <Icon name="activity" size={13} />
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      <p className="config-desc" style={{ marginBottom: '0.85rem' }}>
        {t('idiots.desc')}
      </p>

      {canEdit && (
        <div className="idiots-add">
          <Icon name="plus" size={14} />
          <input
            type="text"
            placeholder={t('idiots.placeholder')}
            value={addingHost}
            onChange={e => setAddingHost(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
          <Button size="sm" onClick={handleAdd} disabled={!addingHost.trim()}>
            {t('idiots.addBtn')}
          </Button>
        </div>
      )}

      <label className="search-pill" style={{ marginBottom: '0.85rem', maxWidth: '360px' }}>
        <Icon name="search" size={14} />
        <input
          type="text"
          placeholder={t('idiots.searchPlaceholder')}
          value={q}
          onChange={e => setQ(e.target.value)}
        />
        {q && (
          <button type="button" onClick={() => setQ('')} className="icon-btn" style={{ width: 22, height: 22, borderRadius: 4 }}>
            <Icon name="x" size={12} />
          </button>
        )}
      </label>

      {denied ? (
        <EmptyState
          variant="error"
          icon="lock"
          title={t('idiots.deniedTitle')}
          description={t('idiots.deniedDesc')}
        />
      ) : loading && entries.length === 0 ? (
        <SkeletonPanel lines={7} label={t('common.loading')} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="shield"
          title={entries.length === 0 ? t('idiots.emptyTitle') : t('idiots.noMatches')}
          description={entries.length === 0 ? t('idiots.emptyDesc') : undefined}
        />
      ) : (
        <div className="table-shell">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('idiots.colHost')}</th>
                  <th>{t('idiots.colMeta')}</th>
                  {canEdit && <th style={{ width: '100px' }}>{t('common.actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(entry => (
                  <tr key={entry.mask}>
                    <td className="mono text-ink-1">
                      {entry.mask}
                      {entry.temporary && (
                        <span className="badge" style={{ marginLeft: 6, fontSize: '0.7rem' }}>
                          tmp
                        </span>
                      )}
                    </td>
                    <td className="mono text-ink-3 text-sm">
                      {entry.addedBy ? `+ ${entry.addedBy}` : '—'}
                    </td>
                    {canEdit && (
                      <td>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => setConfirmRemove(entry.mask)}
                          aria-label="Remove"
                          disabled={entry.temporary}
                          title={entry.temporary ? t('idiots.tmpCantRemove') : undefined}
                        >
                          <Icon name="trash" size={12} />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && !denied && addrs.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
            {t('idiots.addrsTitle')}
            <span className="form-hint" style={{ marginLeft: '0.5rem' }}>
              ({addrs.length})
            </span>
          </h3>
          <p className="form-hint" style={{ marginBottom: '0.65rem' }}>
            {t('idiots.addrsDesc')}
          </p>
          <ul className="addresses-list">
            {addrs.map(ip => (
              <li key={ip} className="address-item">
                <code>{ip}</code>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmRemove}
        onClose={() => setConfirmRemove(null)}
        onConfirm={() => { if (confirmRemove) handleRemove(confirmRemove) }}
        message={t('idiots.confirmRemove').replace('{host}', confirmRemove || '')}
      />
    </div>
  )
}
