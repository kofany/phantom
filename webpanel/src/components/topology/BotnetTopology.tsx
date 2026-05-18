import { useMemo, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Bot, Message } from '../../types'
import { Icon, EmptyState } from '../common'
import { BotTree } from './BotTree'

type BotnetTopologyProps = {
  bots: Bot[]
  hubLabel: string
  messages: Message[]
  onCommandSilent: (cmd: string, pattern: RegExp, durationMs?: number) => void
  onBotSelect: (bot: Bot) => void
}

type ServerGroup = {
  server: string              // raw host ("" for unknown)
  displayName: string
  bots: Bot[]
  onlineCount: number
  totalCount: number
}

type FilterMode = 'all' | 'issues' | 'healthy'
type SortMode = 'name' | 'online'

function normalizeServer(raw: string): string {
  if (!raw) return ''
  return raw.toLowerCase().replace(/^ssl:/, '').replace(/\s.*$/, '').split(':')[0].trim()
}

function groupBots(bots: Bot[]): ServerGroup[] {
  const byServer = new Map<string, Bot[]>()
  for (const b of bots) {
    const key = normalizeServer(b.server) || ''
    const list = byServer.get(key) ?? []
    list.push(b)
    byServer.set(key, list)
  }
  return Array.from(byServer, ([server, list]) => ({
    server,
    displayName: server || 'Unknown server',
    bots: list.slice().sort((a, b) => a.name.localeCompare(b.name)),
    onlineCount: list.filter(b => b.online).length,
    totalCount: list.length,
  }))
}

function healthOf(g: ServerGroup): 'healthy' | 'partial' | 'down' {
  if (g.totalCount === 0) return 'down'
  if (g.onlineCount === 0) return 'down'
  if (g.onlineCount < g.totalCount) return 'partial'
  return 'healthy'
}

export function BotnetTopology({ bots, hubLabel, messages, onCommandSilent, onBotSelect }: BotnetTopologyProps) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<FilterMode>('all')
  const [sort, setSort] = useState<SortMode>('online')

  const groups = useMemo(() => groupBots(bots), [bots])

  const filteredGroups = useMemo(() => {
    const f = filter === 'all'
      ? groups
      : filter === 'issues'
        ? groups.filter(g => healthOf(g) !== 'healthy')
        : groups.filter(g => healthOf(g) === 'healthy')
    const copy = [...f]
    copy.sort((a, b) => {
      switch (sort) {
        case 'name':    return a.displayName.localeCompare(b.displayName)
        case 'online':  return b.onlineCount - a.onlineCount || b.totalCount - a.totalCount
      }
    })
    return copy
  }, [groups, filter, sort])

  const onlineBots = bots.filter(b => b.online).length
  const activeServers = groups.filter(g => g.onlineCount > 0).length
  const totalServers = groups.filter(g => g.server !== '').length
  const issuesCount = groups.filter(g => healthOf(g) !== 'healthy').length

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>{t('topology.title')}</h2>
          <span className="view-subtitle">
            {hubLabel ? `hub · ${hubLabel}` : t('topology.title')}
          </span>
        </div>
      </div>

      <div className="topo-stats">
        <div className="topo-stat">
          <div className="topo-stat-label">{t('topology.statBotsOnline')}</div>
          <div className="topo-stat-value">{onlineBots}</div>
          <div className="topo-stat-sub">/ {bots.length}</div>
        </div>
        <div className="topo-stat">
          <div className="topo-stat-label">{t('topology.statServersActive')}</div>
          <div className="topo-stat-value" style={{ color: 'var(--accent)' }}>{activeServers}</div>
          <div className="topo-stat-sub">/ {totalServers}</div>
        </div>
        <div className="topo-stat">
          <div className="topo-stat-label">{t('topology.statIssues')}</div>
          <div className="topo-stat-value" style={{ color: issuesCount > 0 ? 'var(--warn)' : 'var(--ink-1)' }}>
            {issuesCount}
          </div>
          <div className="topo-stat-sub">{issuesCount === 0 ? t('topology.statAllHealthy') : t('topology.statGroupsAffected')}</div>
        </div>
      </div>

      {bots.length === 0 ? (
        <EmptyState icon="bot" title={t('bots.noBots')} />
      ) : (
        <>
          <div className="topo-toolbar">
            <div className="irc-filter">
              <button
                className={`irc-filter-btn ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                <span>{t('topology.filterAll')}</span>
                <span className="irc-filter-count">{groups.length}</span>
              </button>
              <button
                className={`irc-filter-btn ${filter === 'issues' ? 'active' : ''}`}
                onClick={() => setFilter('issues')}
              >
                <Icon name="alert-triangle" size={11} />
                <span>{t('topology.filterIssues')}</span>
                <span className="irc-filter-count">{issuesCount}</span>
              </button>
              <button
                className={`irc-filter-btn ${filter === 'healthy' ? 'active' : ''}`}
                onClick={() => setFilter('healthy')}
              >
                <Icon name="check" size={11} />
                <span>{t('topology.filterHealthy')}</span>
                <span className="irc-filter-count">{groups.length - issuesCount}</span>
              </button>
            </div>

            <div className="topo-sort">
              <span className="topo-sort-label">{t('topology.sortBy')}:</span>
              <select value={sort} onChange={e => setSort(e.target.value as SortMode)}>
                <option value="online">{t('topology.sortOnline')}</option>
                <option value="name">{t('topology.sortName')}</option>
              </select>
            </div>
          </div>

          {filteredGroups.length === 0 ? (
            <EmptyState
              icon={filter === 'issues' ? 'check' : 'inbox'}
              title={
                filter === 'issues'
                  ? t('topology.noIssuesTitle')
                  : filter === 'healthy'
                    ? t('topology.noHealthyTitle')
                    : t('topology.noGroupsTitle')
              }
              description={filter === 'issues' ? t('topology.noIssuesDesc') : undefined}
            />
          ) : (
            <div className="topo-grid">
              {filteredGroups.map(g => {
                const h = healthOf(g)
                return (
                  <div key={g.server || '__unknown__'} className={`topo-card topo-card-${h}`}>
                    <div className="topo-card-head">
                      <div className="topo-card-head-main">
                        <span className={`topo-card-dot dot-${h}`} />
                        <span className="topo-card-title mono">{g.displayName}</span>
                      </div>
                    </div>

                    <div className="topo-card-summary">
                      <span className="summary-main">
                        <strong>{g.onlineCount}</strong>
                        <span className="summary-slash">/</span>
                        {g.totalCount}
                      </span>
                      <span className="summary-text">
                        {g.onlineCount === g.totalCount
                          ? t('topology.allOnline')
                          : g.onlineCount === 0
                            ? t('topology.allOffline')
                            : t('topology.partialOnline')}
                      </span>
                    </div>

                    <div className="topo-card-bots">
                      {g.bots.map(b => (
                        <button
                          key={b.name}
                          className="topo-bot-row"
                          onClick={() => onBotSelect(b)}
                          title={t('topology.openDetail')}
                        >
                          <span className={`topo-bot-dot ${b.online ? 'online' : 'offline'}`} />
                          <span className="topo-bot-name mono">{b.name}</span>
                          {b.nick && b.nick !== b.name && (
                            <span className="topo-bot-nick mono">{b.nick}</span>
                          )}
                          {b.ip && (
                            <span className="topo-bot-ip mono" title={b.ip}>
                              {b.ip.length > 22 ? b.ip.slice(0, 20) + '…' : b.ip}
                            </span>
                          )}
                          <Icon name="chevron-right" size={12} />
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: '1.25rem' }}>
        <BotTree messages={messages} onCommandSilent={onCommandSilent} />
      </div>
    </div>
  )
}
