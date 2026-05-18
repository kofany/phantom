import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, EmptyState, Icon, Spinner } from '../common'
import { Bot } from '../../types'
import type { BotChannelPresence, BotChannelPresenceState } from '../../useHub'

type BotChannelMatrixProps = {
  bots: Bot[]
  /** Single-shot batch query: `.list c` broadcast, parsed per bot. The
   *  hook needs the online-bot list to resolve the local hub's reply,
   *  which arrives without an `(<botname>) ` prefix. */
  fetchAllBotPresence: (
    onlineBotNames: string[],
    timeoutMs?: number,
  ) => Promise<Map<string, BotChannelPresence[]>>
  /** True iff the current user has +n — `.list c` requires it (pl_list:1718). */
  canFetch: boolean
  onSelectChannel: (channel: string) => void
  onSelectBot: (bot: string) => void
}

type FetchPhase = 'idle' | 'loading' | 'ok' | 'noperm' | 'failed'

type FilterMode = 'all' | 'gaps' | 'noops' | 'syncing'

export function BotChannelMatrix({
  bots,
  fetchAllBotPresence,
  canFetch,
  onSelectChannel,
  onSelectBot,
}: BotChannelMatrixProps) {
  const { t } = useTranslation()
  // botName → (chanName → state). Built once per fetch, then read by
  // every render. Stable reference between fetches keeps useMemo cheap.
  const [presence, setPresence] = useState<Map<string, Map<string, BotChannelPresenceState>>>(new Map())
  const [phase, setPhase] = useState<FetchPhase>('idle')
  const [filter, setFilter] = useState<FilterMode>('all')
  const [search, setSearch] = useState('')
  const [hoverChan, setHoverChan] = useState<string | null>(null)
  const [hoverBot, setHoverBot] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<number | null>(null)

  const sortedBots = useMemo(
    () => [...bots].sort((a, b) => a.name.localeCompare(b.name)),
    [bots],
  )
  const onlineBots = useMemo(() => sortedBots.filter(b => b.online), [sortedBots])

  const refresh = async () => {
    if (!canFetch || phase === 'loading' || onlineBots.length === 0) return
    setPhase('loading')
    try {
      const raw = await fetchAllBotPresence(onlineBots.map(b => b.name))
      const next = new Map<string, Map<string, BotChannelPresenceState>>()
      for (const [bot, list] of raw) {
        const chanMap = new Map<string, BotChannelPresenceState>()
        for (const p of list) chanMap.set(p.name, p.state)
        next.set(bot, chanMap)
      }
      setPresence(next)
      setFetchedAt(Date.now())
      setPhase('ok')
    } catch (err) {
      const isNoperm = err instanceof Error && err.message === 'NOPERM'
      setPhase(isNoperm ? 'noperm' : 'failed')
    }
  }

  // Initial load when bots become available + on +n toggle.
  useEffect(() => {
    if (canFetch && onlineBots.length > 0 && phase === 'idle') {
      refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch, onlineBots.length])

  // Channel set is the union of every channel seen in any bot's reply,
  // sorted alphabetically. We include `absent` channels — those signal
  // "configured target the bot isn't on", which is exactly what the
  // operator wants surfaced.
  const allChannels = useMemo(() => {
    const set = new Set<string>()
    for (const chanMap of presence.values()) {
      for (const ch of chanMap.keys()) set.add(ch)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [presence])

  // Per-channel aggregate counts. Operator's eye should land on these
  // first when scanning the matrix.
  const channelStats = useMemo(() => {
    const map = new Map<string, { ops: number; joined: number; syncing: number; absent: number }>()
    for (const ch of allChannels) {
      let ops = 0, joined = 0, syncing = 0, absent = 0
      for (const bot of onlineBots) {
        const state = presence.get(bot.name)?.get(ch)
        if (state === 'op') ops++
        else if (state === 'joined') joined++
        else if (state === 'syncing') syncing++
        else if (state === 'absent') absent++
      }
      map.set(ch, { ops, joined, syncing, absent })
    }
    return map
  }, [allChannels, onlineBots, presence])

  // Per-bot count of channels they're actively on (op + joined + syncing).
  const botChanCount = useMemo(() => {
    const map = new Map<string, number>()
    for (const [bot, chanMap] of presence) {
      let count = 0
      for (const state of chanMap.values()) {
        if (state === 'op' || state === 'joined' || state === 'syncing') count++
      }
      map.set(bot, count)
    }
    return map
  }, [presence])

  const visibleChannels = useMemo(() => {
    return allChannels.filter(ch => {
      if (search) {
        const s = search.toLowerCase()
        if (!ch.toLowerCase().includes(s)) return false
      }
      const cs = channelStats.get(ch)
      if (!cs) return true
      switch (filter) {
        case 'gaps':
          return cs.absent > 0 || (cs.ops + cs.joined + cs.syncing) < onlineBots.length
        case 'noops':
          return cs.ops === 0 && (cs.joined > 0 || cs.syncing > 0)
        case 'syncing':
          return cs.syncing > 0
        default:
          return true
      }
    })
  }, [allChannels, search, filter, channelStats, onlineBots.length])

  const stats = useMemo(() => {
    let absentCount = 0
    let chansNoOps = 0
    let chansOpped = 0
    for (const cs of channelStats.values()) {
      absentCount += cs.absent
      const occupied = cs.ops + cs.joined + cs.syncing
      if (occupied > 0) {
        if (cs.ops === 0) chansNoOps++
        else chansOpped++
      }
    }
    return {
      onlineBots: onlineBots.length,
      offlineBots: sortedBots.length - onlineBots.length,
      channels: allChannels.length,
      absentCount,
      chansNoOps,
      chansOpped,
    }
  }, [onlineBots.length, sortedBots.length, allChannels.length, channelStats])

  const renderCell = (bot: Bot, chan: string) => {
    if (!bot.online) {
      return <span className="matrix-cell matrix-offline" title={t('matrix.cellBotOffline')}>—</span>
    }
    if (phase === 'loading' && !presence.has(bot.name)) {
      return <span className="matrix-cell matrix-loading" aria-label={t('common.loading')}>·</span>
    }
    const state = presence.get(bot.name)?.get(chan)
    switch (state) {
      case 'op':
        return <span className="matrix-cell matrix-op" title={t('matrix.cellOp').replace('{bot}', bot.name).replace('{chan}', chan)}>@</span>
      case 'joined':
        return <span className="matrix-cell matrix-joined" title={t('matrix.cellJoined').replace('{bot}', bot.name).replace('{chan}', chan)}>•</span>
      case 'syncing':
        return <span className="matrix-cell matrix-syncing" title={t('matrix.cellSyncing').replace('{bot}', bot.name).replace('{chan}', chan)}>?</span>
      case 'absent':
        return <span className="matrix-cell matrix-absent" title={t('matrix.cellAbsent').replace('{bot}', bot.name).replace('{chan}', chan)}>✗</span>
      default:
        // Bot replied but channel isn't in its userlist at all — show
        // a faint marker so the cell isn't blank but we don't claim
        // the bot is "missing" a channel it isn't supposed to handle.
        return <span className="matrix-cell matrix-na" title={t('matrix.cellNA').replace('{bot}', bot.name).replace('{chan}', chan)}>·</span>
    }
  }

  if (!canFetch) {
    return (
      <div className="view-container">
        <h2 style={{ margin: '0 0 0.6rem' }}>{t('matrix.title')}</h2>
        <div className="config-readonly-notice">
          <Icon name="lock" size={13} />
          {t('matrix.readonly')}
        </div>
      </div>
    )
  }

  if (onlineBots.length === 0) {
    return (
      <div className="view-container">
        <h2 style={{ margin: '0 0 0.6rem' }}>{t('matrix.title')}</h2>
        <EmptyState
          icon="grid"
          title={t('matrix.empty')}
          description={t('matrix.emptyDesc')}
        />
      </div>
    )
  }

  if (phase === 'noperm') {
    return (
      <div className="view-container">
        <h2 style={{ margin: '0 0 0.6rem' }}>{t('matrix.title')}</h2>
        <div className="config-readonly-notice">
          <Icon name="lock" size={13} />
          {t('matrix.readonly')}
        </div>
      </div>
    )
  }

  const showEmptyChans = phase === 'ok' && allChannels.length === 0
  const fetchedAtLabel = fetchedAt
    ? new Date(fetchedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null

  return (
    <div className="view-container matrix-view">
      <div className="matrix-header">
        <div>
          <h2>{t('matrix.title')}</h2>
          <p className="form-hint">
            {t('matrix.descLive')}
            {fetchedAtLabel && (
              <>
                {' · '}
                <span className="form-hint">{t('matrix.fetchedAt').replace('{time}', fetchedAtLabel)}</span>
              </>
            )}
          </p>
        </div>
        <div className="matrix-toolbar">
          <input
            type="text"
            className="chset-input matrix-search"
            placeholder={t('matrix.searchPlaceholder')}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="matrix-filter"
            value={filter}
            onChange={e => setFilter(e.target.value as FilterMode)}
            aria-label={t('matrix.filterLabel')}
          >
            <option value="all">{t('matrix.filterAll')}</option>
            <option value="gaps">{t('matrix.filterGaps')}</option>
            <option value="noops">{t('matrix.filterNoOps')}</option>
            <option value="syncing">{t('matrix.filterSyncing')}</option>
          </select>
          <Button size="sm" variant="ghost" onClick={refresh} disabled={phase === 'loading'}>
            {phase === 'loading' ? <Spinner size={13} /> : <Icon name="activity" size={13} />}
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      <div className="matrix-stats">
        <div className="matrix-stat">
          <strong>{stats.onlineBots}</strong>
          <span>{t('matrix.statOnlineBots')}</span>
        </div>
        {stats.offlineBots > 0 && (
          <div className="matrix-stat tone-mute">
            <strong>{stats.offlineBots}</strong>
            <span>{t('matrix.statOfflineBots')}</span>
          </div>
        )}
        <div className="matrix-stat">
          <strong>{stats.channels}</strong>
          <span>{t('matrix.statChannels')}</span>
        </div>
        <div className={`matrix-stat${stats.chansOpped > 0 ? ' tone-good' : ''}`}>
          <strong>{stats.chansOpped}</strong>
          <span>{t('matrix.statOppedChans')}</span>
        </div>
        <div className={`matrix-stat${stats.chansNoOps > 0 ? ' tone-bad' : ''}`}>
          <strong>{stats.chansNoOps}</strong>
          <span>{t('matrix.statNoOps')}</span>
        </div>
        {stats.absentCount > 0 && (
          <div className="matrix-stat tone-warn">
            <strong>{stats.absentCount}</strong>
            <span>{t('matrix.statAbsent')}</span>
          </div>
        )}
      </div>

      {phase === 'loading' && (
        <div className="matrix-progress">
          <span className="matrix-progress-label">{t('matrix.loadingBatch')}</span>
          <div className="matrix-progress-bar">
            <div className="matrix-progress-fill matrix-progress-indeterminate" />
          </div>
        </div>
      )}

      {phase === 'failed' && (
        <div className="form-error" role="alert">
          <Icon name="alert-triangle" size={13} />
          {t('matrix.fetchFailed')}
        </div>
      )}

      {showEmptyChans ? (
        <EmptyState
          icon="inbox"
          title={t('matrix.noChans')}
          description={t('matrix.noChansDesc')}
        />
      ) : (
        <div className="matrix-scroll">
          <table className="matrix-table">
            <thead>
              <tr>
                <th className="matrix-corner">{t('matrix.botsHeader')}</th>
                {visibleChannels.map(ch => {
                  const cs = channelStats.get(ch)
                  const isHover = hoverChan === ch
                  const occupied = cs ? cs.ops + cs.joined + cs.syncing : 0
                  // Two badges per channel: ops/total-joined ratio (green
                  // when fully opped, red on zero ops) and join-coverage
                  // (warn-toned when any bot is missing).
                  const opsBadge = cs && occupied > 0 && (
                    cs.ops === 0
                      ? <span className="matrix-col-ops tone-bad" title={t('matrix.colOpsBad')}>0/{occupied} ops</span>
                      : <span className="matrix-col-ops" title={t('matrix.colOpsCount').replace('{ops}', String(cs.ops)).replace('{total}', String(occupied))}>{cs.ops}/{occupied} ops</span>
                  )
                  const coverageBadge = cs && (
                    <span
                      className={`matrix-col-joined${cs.absent > 0 ? ' tone-warn' : ''}`}
                      title={t('matrix.colCoverage').replace('{joined}', String(occupied)).replace('{total}', String(onlineBots.length))}
                    >
                      {occupied}/{onlineBots.length}
                    </span>
                  )
                  return (
                    <th
                      key={ch}
                      className={`matrix-col-head${isHover ? ' is-hover' : ''}`}
                      onClick={() => onSelectChannel(ch)}
                      onMouseEnter={() => setHoverChan(ch)}
                      onMouseLeave={() => setHoverChan(null)}
                      title={ch}
                    >
                      <span className="matrix-col-name mono">{ch}</span>
                      <div className="matrix-col-badges">
                        {coverageBadge}
                        {opsBadge}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {sortedBots.map(bot => {
                const chanCount = botChanCount.get(bot.name)
                const isOffline = !bot.online
                const isHover = hoverBot === bot.name
                const hasReply = presence.has(bot.name)
                return (
                  <tr
                    key={bot.name}
                    className={[
                      isOffline ? 'matrix-row-offline' : '',
                      isHover ? 'is-hover' : '',
                      !isOffline && phase === 'ok' && !hasReply ? 'matrix-row-failed' : '',
                    ].filter(Boolean).join(' ')}
                    onMouseEnter={() => setHoverBot(bot.name)}
                    onMouseLeave={() => setHoverBot(null)}
                  >
                    <th
                      scope="row"
                      className="matrix-row-head"
                      onClick={() => onSelectBot(bot.name)}
                      title={bot.name}
                    >
                      <span className={`matrix-bot-dot${bot.online ? ' online' : ' offline'}`} />
                      <span className="matrix-bot-name mono">{bot.name}</span>
                      {bot.online && hasReply && chanCount !== undefined && (
                        <span className="matrix-row-count" title={t('matrix.rowChanCount').replace('{n}', String(chanCount))}>
                          {chanCount}
                        </span>
                      )}
                      {bot.online && phase === 'loading' && !hasReply && (
                        <span className="matrix-row-spin"><Spinner size={10} /></span>
                      )}
                      {!isOffline && phase === 'ok' && !hasReply && (
                        <Icon name="alert-triangle" size={10} />
                      )}
                    </th>
                    {visibleChannels.map(ch => (
                      <td
                        key={ch}
                        className={`matrix-cell-wrap${hoverChan === ch ? ' is-col-hover' : ''}`}
                      >
                        {renderCell(bot, ch)}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="matrix-legend">
        <span><span className="matrix-cell matrix-op">@</span> {t('matrix.legendOp')}</span>
        <span><span className="matrix-cell matrix-joined">•</span> {t('matrix.legendJoined')}</span>
        <span><span className="matrix-cell matrix-syncing">?</span> {t('matrix.legendSyncing')}</span>
        <span><span className="matrix-cell matrix-absent">✗</span> {t('matrix.legendAbsent')}</span>
        <span><span className="matrix-cell matrix-offline">—</span> {t('matrix.legendOffline')}</span>
      </div>
    </div>
  )
}
