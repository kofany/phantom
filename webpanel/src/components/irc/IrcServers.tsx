import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, Icon, EmptyState, Badge } from '../common'
import { Bot } from '../../types'
import type { IrcnetData, IrcnetServer } from '../../useHub'

type IrcServersProps = {
  bots: Bot[]
  data: IrcnetData | null
  loading: boolean
  error: string | null
  onRefresh: (forceRefresh?: boolean) => void
  onAddBotTo?: (host: string) => void
}

const AUTO_REFRESH_MS = 5 * 60 * 1000

type Filter = 'all' | 'connected' | 'available'

export function IrcServers({
  bots, data, loading, error,
  onRefresh, onAddBotTo,
}: IrcServersProps) {
  const { t } = useTranslation()
  const [sortBy, setSortBy] = useState<'host' | 'region' | 'users' | 'bots' | 'status'>('status')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  // Initial fetch + auto-refresh loop for server list
  useEffect(() => {
    onRefresh()
    const id = window.setInterval(() => onRefresh(), AUTO_REFRESH_MS)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Build host → bots map. Normalize server values.
  const hostToBots = useMemo(() => {
    const map = new Map<string, Bot[]>()
    for (const b of bots) {
      const raw = (b.server || '').toLowerCase()
      if (!raw) continue
      const host = raw.replace(/^ssl:/, '').replace(/\s.*$/, '').split(':')[0]
      if (!host) continue
      const list = map.get(host) ?? []
      list.push(b)
      map.set(host, list)
    }
    return map
  }, [bots])

  // Combined server list — from external list + any hosts where we have
  // bots but don't appear in the external list.
  type EnrichedServer = IrcnetServer & {
    bots: Bot[]
    botsCount: number
    onlineBotsCount: number
    status: 'connected' | 'has-bot-offline' | 'available'
  }

  const enriched = useMemo<EnrichedServer[]>(() => {
    const apiServers = data?.servers ?? []
    const apiMap = new Map(apiServers.map(s => [s.host, s]))
    const allHosts = new Set<string>([...apiServers.map(s => s.host), ...hostToBots.keys()])

    return Array.from(allHosts).map(host => {
      const apiEntry: IrcnetServer = apiMap.get(host) ?? {
        host, port: null, region: '', users: null, max: null, ssl: false,
      }
      const serverBots = hostToBots.get(host) ?? []
      const online = serverBots.filter(b => b.online)
      const status: EnrichedServer['status'] =
        online.length > 0 ? 'connected' :
        serverBots.length > 0 ? 'has-bot-offline' :
        'available'
      return {
        ...apiEntry,
        bots: serverBots,
        botsCount: serverBots.length,
        onlineBotsCount: online.length,
        status,
      }
    })
  }, [data, hostToBots])

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return enriched
    return enriched.filter(s =>
      s.host.toLowerCase().includes(q) ||
      s.region.toLowerCase().includes(q) ||
      s.bots.some(b => b.name.toLowerCase().includes(q)),
    )
  }, [enriched, search])

  const filtered = useMemo(() => {
    if (filter === 'connected') return searchFiltered.filter(s => s.onlineBotsCount > 0)
    if (filter === 'available')  return searchFiltered.filter(s => s.botsCount === 0)
    return searchFiltered
  }, [searchFiltered, filter])

  const sorted = useMemo(() => {
    const copy = [...filtered]
    const statusOrder: Record<EnrichedServer['status'], number> = {
      connected: 0, 'has-bot-offline': 1, available: 2,
    }
    copy.sort((a, b) => {
      let d = 0
      switch (sortBy) {
        case 'host':    d = a.host.localeCompare(b.host); break
        case 'region':  d = (a.region || 'ZZ').localeCompare(b.region || 'ZZ'); break
        case 'users':   d = (a.users ?? -1) - (b.users ?? -1); break
        case 'bots':    d = a.botsCount - b.botsCount; break
        case 'status':  d = statusOrder[a.status] - statusOrder[b.status]; break
      }
      return sortDir === 'asc' ? d : -d
    })
    return copy
  }, [filtered, sortBy, sortDir])

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortBy(col)
      setSortDir(col === 'host' || col === 'region' || col === 'status' ? 'asc' : 'desc')
    }
  }
  const sortIndicator = (col: typeof sortBy) =>
    sortBy === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''

  // Stats at the top
  const totalServers = enriched.length
  const connectedCount = enriched.filter(s => s.onlineBotsCount > 0).length
  const availableCount = enriched.filter(s => s.botsCount === 0).length
  const totalOnlineBots = bots.filter(b => b.online).length
  const coveragePct = totalServers > 0
    ? Math.round((connectedCount / totalServers) * 100) : 0

  const sourceUnavailable = data?.source === 'unavailable'
  const hasRealUserData = enriched.some(s => s.users !== null && s.users > 0)

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>{t('irc.title')}</h2>
          <span className="view-subtitle">{t('irc.subtitle')}</span>
        </div>
        <div className="view-tools">
          <Button size="sm" variant="ghost" onClick={() => onRefresh(true)} disabled={loading}>
            <Icon name="activity" size={13} />
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      <div className="irc-stats">
        <div className="irc-stat">
          <div className="irc-stat-label">{t('irc.statBotsOnline')}</div>
          <div className="irc-stat-value">{totalOnlineBots}</div>
          <div className="irc-stat-sub">/ {bots.length}</div>
        </div>
        <div className="irc-stat">
          <div className="irc-stat-label">{t('irc.statServersCovered')}</div>
          <div className="irc-stat-value" style={{ color: 'var(--accent)' }}>{connectedCount}</div>
          <div className="irc-stat-sub">/ {totalServers}</div>
        </div>
        <div className="irc-stat">
          <div className="irc-stat-label">{t('irc.statAvailable')}</div>
          <div className="irc-stat-value">{availableCount}</div>
          <div className="irc-stat-sub">{t('irc.statDeploymentSlots')}</div>
        </div>
        <div className="irc-stat">
          <div className="irc-stat-label">{t('irc.statCoverage')}</div>
          <div className="irc-stat-value">{coveragePct}<span className="irc-stat-unit">%</span></div>
          <div className="irc-stat-bar">
            <span style={{ width: `${coveragePct}%` }} />
          </div>
        </div>
      </div>

      {/* Info notes — soft banners, not alarms */}
      {sourceUnavailable && (
        <div className="irc-info-note">
          <Icon name="alert-triangle" size={12} />
          {t('irc.sourceUnavailable')}
        </div>
      )}
      {error && (
        <div className="irc-info-note">
          <Icon name="alert-triangle" size={12} />
          {t('irc.errorPrefix')}: {error}
        </div>
      )}

      {/* Filter toolbar */}
      <div className="irc-toolbar">
        <div className="irc-filter">
          <button
            className={`irc-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            <span>{t('irc.filterAll')}</span>
            <span className="irc-filter-count">{enriched.length}</span>
          </button>
          <button
            className={`irc-filter-btn ${filter === 'connected' ? 'active' : ''}`}
            onClick={() => setFilter('connected')}
          >
            <Icon name="check" size={11} />
            <span>{t('irc.filterConnected')}</span>
            <span className="irc-filter-count">{connectedCount}</span>
          </button>
          <button
            className={`irc-filter-btn ${filter === 'available' ? 'active' : ''}`}
            onClick={() => setFilter('available')}
          >
            <Icon name="plus" size={11} />
            <span>{t('irc.filterAvailable')}</span>
            <span className="irc-filter-count">{availableCount}</span>
          </button>
        </div>

        <label className="search-pill" style={{ minWidth: '220px', flex: '0 1 320px', marginLeft: 'auto' }}>
          <Icon name="search" size={14} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('irc.searchPlaceholder')}
            aria-label="Filter servers"
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
      </div>

      {sorted.length === 0 ? (
        filter === 'available' && enriched.length > 0 ? (
          <EmptyState icon="check" title={t('irc.allCoveredTitle')} description={t('irc.allCoveredDesc')} />
        ) : filter === 'connected' && enriched.length > 0 ? (
          <EmptyState icon="bot" title={t('irc.noConnectedTitle')} description={t('irc.noConnectedDesc')} />
        ) : (
          <EmptyState
            variant={loading ? 'empty' : 'no-results'}
            icon={loading ? 'globe' : undefined}
            title={loading ? t('common.loading') : t('irc.noMatches')}
          />
        )
      ) : (
        <div className="table-shell">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th className="sortable" onClick={() => toggleSort('status')} style={{ width: '130px' }}>
                    {t('irc.colStatus')}{sortIndicator('status')}
                  </th>
                  <th className="sortable" onClick={() => toggleSort('host')}>
                    {t('irc.colHost')}{sortIndicator('host')}
                  </th>
                  <th className="sortable" onClick={() => toggleSort('region')} style={{ width: '80px' }}>
                    {t('irc.colRegion')}{sortIndicator('region')}
                  </th>
                  <th className="sortable" onClick={() => toggleSort('users')} style={{ width: '110px' }}>
                    {t('irc.colUsers')}{sortIndicator('users')}
                  </th>
                  <th className="sortable" onClick={() => toggleSort('bots')} style={{ width: '180px' }}>
                    {t('irc.colBots')}{sortIndicator('bots')}
                  </th>
                  <th style={{ width: '130px' }}>{t('irc.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(s => (
                  <tr key={s.host} className={`irc-row status-${s.status}`}>
                    <td>
                      {s.status === 'connected' && (
                        <Badge variant="success">
                          <span className="irc-status-dot" /> {t('irc.statusConnected')}
                        </Badge>
                      )}
                      {s.status === 'has-bot-offline' && (
                        <Badge variant="warning">{t('irc.statusOffline')}</Badge>
                      )}
                      {s.status === 'available' && (
                        <Badge variant="default">{t('irc.statusAvailable')}</Badge>
                      )}
                    </td>
                    <td className="mono" style={{ color: 'var(--ink-1)' }}>
                      <span
                        title={[s.serverInfo, s.version && `v${s.version}`]
                          .filter(Boolean).join(' · ') || undefined}
                      >
                        {s.host}
                      </span>
                      {s.port && <span className="irc-port">:{s.port}</span>}
                      {s.ssl && <span className="irc-ssl">SSL</span>}
                      {s.sasl && <span className="irc-sasl" title={t('irc.saslHint')}>SASL</span>}
                    </td>
                    <td>
                      {s.region ? <span className="irc-region">{s.region}</span> : <span className="flag-empty">—</span>}
                    </td>
                    <td className="mono">
                      {s.users !== null && s.users > 0 ? (
                        <div className="irc-users-cell">
                          <span>{s.users.toLocaleString()}</span>
                          {s.max && (
                            <div className="irc-users-bar">
                              <span style={{ width: `${Math.min(100, (s.users / s.max) * 100)}%` }} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="flag-empty" title={hasRealUserData ? '' : t('irc.userDataUnavailable')}>—</span>
                      )}
                    </td>
                    <td>
                      {s.botsCount > 0 ? (
                        <div className="irc-bots-cell">
                          {s.bots.slice(0, 3).map(b => (
                            <Badge key={b.name} variant={b.online ? 'success' : 'default'}>
                              {b.name}
                            </Badge>
                          ))}
                          {s.botsCount > 3 && <span className="irc-bots-more">+{s.botsCount - 3}</span>}
                        </div>
                      ) : (
                        <span className="flag-empty">—</span>
                      )}
                    </td>
                    <td>
                      {onAddBotTo && s.botsCount === 0 && (
                        <Button size="sm" variant="ghost" onClick={() => onAddBotTo(s.host)}>
                          <Icon name="plus" size={12} />
                          {t('irc.addBotHere')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data && !sourceUnavailable && data.cache_age_s > 0 && (
        <div className="irc-cache-note">
          <Icon name="clock" size={12} />
          {t('irc.cacheNote').replace('{age}', String(data.cache_age_s))}
        </div>
      )}
    </div>
  )
}
