import { useMemo } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Bot, Channel, User, Message } from '../../types'
import {
  AnimatedCount,
  EmptyState,
  Icon,
  IconName,
  Sparkline,
  StatusDot,
} from '../common'

type OverviewProps = {
  channels: Channel[]
  users: User[]
  bots: Bot[]
  messages: Message[]
  onNavigate: (view: 'channels' | 'users' | 'bots') => void
  onChannelSelect: (ch: Channel) => void
  onAddChannel?: () => void
  onAddUser?: () => void
  onAddBot?: () => void
  canManage: boolean
  searchValue?: string
}

type Delta = { value: number; dir: 'up' | 'down' | 'flat' }

// Build a simple 12-bucket series from message timestamps over a window.
function buildSeries(messages: Message[], windowMs: number, buckets = 12): number[] {
  const now = Date.now()
  const size = windowMs / buckets
  const series = new Array(buckets).fill(0)
  for (const m of messages) {
    const age = now - m.time.getTime()
    if (age < 0 || age > windowMs) continue
    const idx = buckets - 1 - Math.floor(age / size)
    if (idx >= 0 && idx < buckets) {
      series[idx] += 1
    }
  }
  return series
}

function seriesDelta(series: number[]): Delta {
  if (series.length < 2) return { value: 0, dir: 'flat' }
  const half = Math.floor(series.length / 2)
  const prev = series.slice(0, half).reduce((a, b) => a + b, 0)
  const cur = series.slice(half).reduce((a, b) => a + b, 0)
  if (prev === 0 && cur === 0) return { value: 0, dir: 'flat' }
  if (prev === 0) return { value: 100, dir: 'up' }
  const change = Math.round(((cur - prev) / prev) * 100)
  return {
    value: Math.abs(change),
    dir: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
  }
}

function classifyMessage(m: Message): { lvl: string; cls: string } {
  const t = m.text.toLowerCase()
  if (m.from === '[error]') return { lvl: 'ERR', cls: 'lvl-err' }
  if (t.includes('warn') || t.includes('lag')) return { lvl: 'WARN', cls: 'lvl-warn' }
  if (t.startsWith('✓')) return { lvl: 'OK', cls: 'lvl-ok' }
  if (t.includes('join')) return { lvl: 'EVT', cls: 'lvl-evt' }
  if (t.includes('quit') || t.includes('left')) return { lvl: 'EVT', cls: 'lvl-evt' }
  if (m.system) return { lvl: 'INFO', cls: 'lvl-info' }
  return { lvl: 'MSG', cls: 'lvl-info' }
}

function formatRelative(d: Date): string {
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return `${Math.floor(diff)}s`
  if (diff < 3600) return `${Math.floor(diff / 60)}m`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`
  return `${Math.floor(diff / 86400)}d`
}

type TileProps = {
  label: string
  icon: IconName
  value: number | string
  suffix?: string
  delta?: Delta
  series?: number[]
  color?: string
}

function Tile({ label, icon, value, suffix, delta, series, color = 'var(--accent)' }: TileProps) {
  return (
    <div className="tile">
      <div className="label">
        <span className="icon" style={{ color }}>
          <Icon name={icon} size={14} />
        </span>
        {label}
      </div>
      <div className="value">
        {typeof value === 'number'
          ? <AnimatedCount value={value} className="tile-value-anim" />
          : value}
        {suffix && <span className="suffix">{suffix}</span>}
      </div>
      <div className="delta">
        {delta ? (
          <span className={`change ${delta.dir}`}>
            {delta.dir !== 'flat' && (
              <Icon name={delta.dir === 'up' ? 'trend-up' : 'trend-down'} size={12} />
            )}
            {delta.dir === 'flat' ? '—' : `${delta.value}%`}
          </span>
        ) : (
          <span />
        )}
        {series && <Sparkline data={series} color={color} />}
      </div>
    </div>
  )
}

export function Overview({
  channels,
  users,
  bots,
  messages,
  onNavigate,
  onChannelSelect,
  onAddChannel,
  onAddUser,
  onAddBot,
  canManage,
  searchValue = '',
}: OverviewProps) {
  const { t } = useTranslation()

  const q = searchValue.trim().toLowerCase()
  const isSearching = q.length > 0

  // 24h events stream
  const events24h = useMemo(
    () => buildSeries(messages, 24 * 3600 * 1000, 12),
    [messages]
  )
  const eventsTotal = useMemo(
    () => events24h.reduce((a, b) => a + b, 0),
    [events24h]
  )
  const eventsDelta = useMemo(() => seriesDelta(events24h), [events24h])

  const botsOnline = bots.filter(b => b.online).length

  // Synthetic small series for tiles without real time series (visual only)
  const flatSeries = (value: number) => {
    const arr = [Math.max(0, value - 2), value - 1, value, value + 1, value, value - 1, value, value + 1, value, value, value + 1, value]
    return arr.map(x => Math.max(0, x))
  }

  // Hot channels: top 5 by usersCount (or filtered by search)
  const hotChannels = useMemo(() => {
    const base = isSearching
      ? channels.filter(c => c.name.toLowerCase().includes(q))
      : [...channels].filter(c => c.usersCount > 0)
    return base
      .sort((a, b) => b.usersCount - a.usersCount)
      .slice(0, isSearching ? 20 : 5)
  }, [channels, isSearching, q])

  // Channels currently in op-lockdown — surfaced prominently so admins
  // notice an activated protection immediately on the dashboard.
  const lockedChannels = useMemo(
    () => channels.filter(c => c.opLockdown),
    [channels],
  )

  // Recent activity: last 10 messages (or filtered by search across from/text).
  // Exclude hidden messages — those are programmatic fetch responses the user
  // shouldn't see (e.g. BotDetail's cfg listing).
  const recent = useMemo(() => {
    const visible = messages.filter(m => !m.hidden)
    if (!isSearching) return visible.slice(-10).reverse()
    return visible
      .filter(
        m =>
          m.text.toLowerCase().includes(q) ||
          (m.from || '').toLowerCase().includes(q)
      )
      .slice(-20)
      .reverse()
  }, [messages, isSearching, q])

  // Botnet health: bots with issues or all bots as status list (or matching search)
  const healthRows = useMemo(() => {
    if (isSearching) {
      return bots.filter(
        b =>
          b.name.toLowerCase().includes(q) ||
          (b.nick || '').toLowerCase().includes(q) ||
          (b.server || '').toLowerCase().includes(q) ||
          (b.ip || '').toLowerCase().includes(q)
      )
    }
    const offline = bots.filter(b => !b.online)
    const online = bots.filter(b => b.online).slice(0, 6)
    return [...offline.slice(0, 3), ...online]
  }, [bots, isSearching, q])

  // Matching users — only shown when searching
  const matchedUsers = useMemo(() => {
    if (!isSearching) return []
    return users
      .filter(u => !u.isBot && u.name.toLowerCase().includes(q))
      .slice(0, 20)
  }, [users, isSearching, q])

  const totalMatches =
    hotChannels.length + healthRows.length + matchedUsers.length + recent.length

  return (
    <div className="view-container">
      <div className="dash-hero">
        <div>
          <div className="hello">{t('overview.hello')}</div>
          <h1>
            {t('overview.title')} <span className="grad">·</span>
          </h1>
          <p className="tag">
            {isSearching ? (
              <>
                <Icon name="search" size={12} />{' '}
                <span className="mono" style={{ color: 'var(--accent)' }}>
                  "{searchValue}"
                </span>{' '}
                · <strong>{totalMatches}</strong> {t('overview.matches') || 'matches'}
              </>
            ) : (
              t('overview.tagline')
            )}
          </p>
        </div>
        {canManage && (
          <div className="quick-actions">
            {onAddChannel && (
              <button className="btn btn-secondary btn-sm" onClick={onAddChannel}>
                <Icon name="plus" size={14} /> {t('channels.add')}
              </button>
            )}
            {onAddUser && (
              <button className="btn btn-secondary btn-sm" onClick={onAddUser}>
                <Icon name="plus" size={14} /> {t('users.add')}
              </button>
            )}
            {onAddBot && (
              <button className="btn btn-primary btn-sm" onClick={onAddBot}>
                <Icon name="plus" size={14} /> {t('bots.add')}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="tiles">
        <Tile
          label={t('overview.kpiBots')}
          icon="bot"
          value={botsOnline}
          suffix={`/ ${bots.length}`}
          delta={{
            value: bots.length === 0 ? 0 : Math.round((botsOnline / bots.length) * 100),
            dir: botsOnline === bots.length ? 'flat' : botsOnline > 0 ? 'up' : 'down',
          }}
          series={flatSeries(botsOnline)}
          color="var(--accent)"
        />
        <Tile
          label={t('overview.kpiChannels')}
          icon="hash"
          value={channels.length}
          delta={{ value: 0, dir: 'flat' }}
          series={flatSeries(channels.length)}
          color="var(--ph)"
        />
        <Tile
          label={t('overview.kpiUsers')}
          icon="users"
          value={users.filter(u => !u.isBot).length}
          delta={{ value: 0, dir: 'flat' }}
          series={flatSeries(users.filter(u => !u.isBot).length)}
          color="var(--info)"
        />
        <Tile
          label={t('overview.kpiEvents')}
          icon="activity"
          value={eventsTotal}
          delta={eventsDelta}
          series={events24h}
          color="var(--ok)"
        />
      </div>

      <div className="dash-grid">
        <div className="panel">
          <div className="panel-head">
            <Icon name="activity" size={16} />
            <h3>{t('overview.activity')}</h3>
            <span className="meta">{t('overview.activityMeta')}</span>
          </div>
          {recent.length === 0 ? (
            <EmptyState
              icon="inbox"
              title={t('overview.noActivity')}
              description={t('overview.noActivityDesc')}
            />
          ) : (
            <div className="feed-list">
              {recent.map((m, i) => {
                const { lvl, cls } = classifyMessage(m)
                return (
                  <div className="feed-row" key={`${m.time.getTime()}-${i}`}>
                    <span className={`lvl ${cls}`}>{lvl}</span>
                    <span className="text">
                      <span className="mono" style={{ color: 'var(--ph)' }}>
                        {m.from}
                      </span>{' '}
                      {m.text}
                    </span>
                    <span className="time">{formatRelative(m.time)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="dash-side">
          {lockedChannels.length > 0 && (
            <div className="panel lockdown-panel">
              <div className="panel-head">
                <Icon name="lock" size={16} />
                <h3>{t('overview.lockdown')}</h3>
                <span className="meta">{t('overview.lockdownMeta')}</span>
              </div>
              <div className="lockdown-list">
                {lockedChannels.map(ch => (
                  <div
                    key={ch.name}
                    className="lockdown-row"
                    onClick={() => onChannelSelect(ch)}
                    role="button"
                    tabIndex={0}
                  >
                    <Icon name="alert-triangle" size={13} />
                    <span className="chan mono">{ch.name}</span>
                    <span className="count mono">{ch.usersCount} {t('overview.lockdownUsers')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <Icon name="zap" size={16} />
              <h3>{t('overview.hot')}</h3>
              <span className="meta">{t('overview.hotMeta')}</span>
              <button
                className="icon-btn"
                onClick={() => onNavigate('channels')}
                aria-label="All channels"
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
            {hotChannels.length === 0 ? (
              <EmptyState
                icon="hash"
                title={t('channels.noChannels')}
              />
            ) : (
              <div className="hot-channels">
                {hotChannels.map((ch, i) => (
                  <div
                    key={ch.name}
                    className="hot-row"
                    onClick={() => onChannelSelect(ch)}
                  >
                    <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                    <span className="chan">{ch.name}</span>
                    <span className="count">
                      <strong>{ch.usersCount}</strong> <em>users</em>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="panel-head">
              <Icon name="shield" size={16} />
              <h3>{t('overview.health')}</h3>
              <span className="meta">{t('overview.healthMeta')}</span>
              <button
                className="icon-btn"
                onClick={() => onNavigate('bots')}
                aria-label="All bots"
              >
                <Icon name="chevron-right" size={14} />
              </button>
            </div>
            {healthRows.length === 0 ? (
              <EmptyState icon="bot" title={t('bots.noBots')} />
            ) : (
              <div className="botnet-health">
                {healthRows.map(b => (
                  <div key={b.name} className="hot-row">
                    <StatusDot
                      state={b.online ? 'online' : 'offline'}
                      label={b.online ? 'online' : 'offline'}
                    />
                    <span className="chan">{b.name}</span>
                    <span className="count mono">{b.server || '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isSearching && matchedUsers.length > 0 && (
            <div className="panel">
              <div className="panel-head">
                <Icon name="users" size={16} />
                <h3>{t('users.title')}</h3>
                <span className="meta">
                  {matchedUsers.length} {t('table.of')} {users.filter(u => !u.isBot).length}
                </span>
                <button
                  className="icon-btn"
                  onClick={() => onNavigate('users')}
                  aria-label="All users"
                >
                  <Icon name="chevron-right" size={14} />
                </button>
              </div>
              <div className="botnet-health">
                {matchedUsers.map(u => (
                  <div key={u.name} className="hot-row">
                    <StatusDot
                      state={u.online ? 'online' : 'offline'}
                      label={u.online ? 'online' : 'offline'}
                    />
                    <span className="chan">{u.name}</span>
                    <span className="count mono">
                      {u.channelsCount || 0} ch · {u.hostsCount || 0} h
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
