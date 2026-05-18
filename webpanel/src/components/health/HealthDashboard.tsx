import { useMemo } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Icon, IconName } from '../common'
import { Bot, Channel, Message, View } from '../../types'

type WsStatus = 'online' | 'connecting' | 'offline'
type Severity = 'healthy' | 'degraded' | 'critical' | 'unknown'

type HealthDashboardProps = {
  bots: Bot[]
  channels: Channel[]
  messages: Message[]
  wsStatus: WsStatus
  hubHandle: string
  partylineUsersCount: number
  onNavigate: (view: View) => void
  onSelectChannel: (channel: Channel) => void
  onSelectBot: (bot: Bot) => void
}

type Issue = {
  id: string
  severity: 'critical' | 'medium' | 'low'
  icon: IconName
  message: string
  detail?: string
  view?: View                      // jump target on click
  onClick?: () => void             // explicit handler overrides view
}

type SystemCard = {
  id: string
  label: string
  status: Severity
  icon: IconName
  primary: string                  // headline value
  secondary?: string               // sub-line
  view?: View
}

// --- Pure-function status calculators --------------------------------------

function botsSeverity(bots: Bot[]): Severity {
  if (bots.length === 0) return 'unknown'
  const online = bots.filter(b => b.online).length
  if (online === bots.length) return 'healthy'
  if (online === 0) return 'critical'
  if (online < bots.length / 2) return 'critical'
  return 'degraded'
}

function wsSeverity(s: WsStatus): Severity {
  return s === 'online' ? 'healthy' : 'critical'
}

function lockdownSeverity(channels: Channel[]): Severity {
  return channels.some(c => c.opLockdown) ? 'degraded' : 'healthy'
}

// Worst severity across systems (used for the hero traffic light)
function worst(...severities: Severity[]): Severity {
  if (severities.includes('critical')) return 'critical'
  if (severities.includes('degraded')) return 'degraded'
  if (severities.every(s => s === 'unknown' || s === 'healthy')) {
    return severities.includes('healthy') ? 'healthy' : 'unknown'
  }
  return 'healthy'
}

// --- Component -------------------------------------------------------------

export function HealthDashboard({
  bots, channels, messages, wsStatus, hubHandle,
  partylineUsersCount,
  onNavigate, onSelectChannel, onSelectBot,
}: HealthDashboardProps) {
  const { t } = useTranslation()

  // --- Derived facts -------------------------------------------------------
  const onlineBots = bots.filter(b => b.online)
  const offlineBots = bots.filter(b => !b.online)
  const lockedChannels = channels.filter(c => c.opLockdown)

  // Recent errors and netsplits (last hour, from messages)
  const cutoffTs = Date.now() - 3600_000
  const recentErrors = useMemo(
    () => messages.filter(m =>
      m.time.getTime() > cutoffTs && (m.from === '[error]' || /\b(error|fail|cannot|invalid)\b/i.test(m.text))
    ).slice(-5),
    [messages, cutoffTs],
  )
  const recentNetsplits = useMemo(
    () => messages.filter(m =>
      m.time.getTime() > cutoffTs && /net\s*split|netsplit/i.test(m.text)
    ).length,
    [messages, cutoffTs],
  )

  // --- Per-system severities -----------------------------------------------
  const sevBots     = botsSeverity(bots)
  const sevWs       = wsSeverity(wsStatus)
  const sevLockdown = lockdownSeverity(channels)
  const sevErrors: Severity =
    recentErrors.length === 0 ? 'healthy' :
    recentErrors.length >= 5 ? 'critical' :
    recentErrors.length >= 3 ? 'degraded' : 'healthy'
  // overall traffic light
  const overall = worst(sevBots, sevWs, sevLockdown, sevErrors)

  // --- Issues list ---------------------------------------------------------
  const issues: Issue[] = []

  if (wsStatus !== 'online') {
    issues.push({
      id: 'ws_disconnect',
      severity: 'critical',
      icon: 'wifi-off',
      message: t('health.issues.wsDisconnect'),
      detail: t('health.issues.wsDisconnectDetail'),
    })
  }

  for (const b of offlineBots) {
    issues.push({
      id: `bot_off_${b.name}`,
      severity: 'medium',
      icon: 'bot',
      message: t('health.issues.botOffline').replace('{bot}', b.name),
      detail: b.server || undefined,
      onClick: () => onSelectBot(b),
    })
  }

  for (const c of lockedChannels) {
    issues.push({
      id: `lockdown_${c.name}`,
      severity: 'medium',
      icon: 'lock',
      message: t('health.issues.lockdown').replace('{chan}', c.name),
      detail: t('health.issues.lockdownDetail'),
      onClick: () => onSelectChannel(c),
    })
  }

  if (recentNetsplits > 0) {
    issues.push({
      id: 'netsplit',
      severity: 'medium',
      icon: 'alert-triangle',
      message: t('health.issues.netsplit').replace('{n}', String(recentNetsplits)),
      detail: t('health.issues.netsplitDetail'),
    })
  }

  if (recentErrors.length >= 3) {
    issues.push({
      id: 'errors',
      severity: 'medium',
      icon: 'alert-triangle',
      message: t('health.issues.errors').replace('{n}', String(recentErrors.length)),
      detail: recentErrors[recentErrors.length - 1]?.text,
    })
  }

  // Sort: critical → medium → low
  const severityOrder: Record<Issue['severity'], number> = { critical: 0, medium: 1, low: 2 }
  issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

  // --- System cards --------------------------------------------------------
  const systems: SystemCard[] = [
    {
      id: 'ws',
      label: t('health.cards.connection'),
      status: sevWs,
      icon: wsStatus === 'online' ? 'wifi' : 'wifi-off',
      primary: wsStatus === 'online' ? t('health.cards.wsConnected') : t('health.cards.wsDisconnected'),
      secondary: t('health.cards.wsHandle').replace('{handle}', hubHandle || '—'),
    },
    {
      id: 'bots',
      label: t('health.cards.bots'),
      status: sevBots,
      icon: 'bot',
      primary: `${onlineBots.length} / ${bots.length}`,
      secondary: offlineBots.length > 0
        ? t('health.cards.botsOffline').replace('{n}', String(offlineBots.length))
        : t('health.cards.botsAllOnline'),
      view: 'bots',
    },
    {
      id: 'lockdown',
      label: t('health.cards.protections'),
      status: sevLockdown,
      icon: 'shield',
      primary: lockedChannels.length === 0
        ? t('health.cards.protectionsNone')
        : t('health.cards.protectionsActive').replace('{n}', String(lockedChannels.length)),
      secondary: lockedChannels.length === 0
        ? t('health.cards.protectionsAllClear')
        : lockedChannels.map(c => c.name).slice(0, 3).join(', '),
      view: 'channels',
    },
    {
      id: 'admins',
      label: t('health.cards.admins'),
      status: 'healthy',
      icon: 'users',
      primary: String(partylineUsersCount),
      secondary: t('health.cards.adminsOnline'),
    },
  ]

  // --- Render --------------------------------------------------------------
  const heroMessage = (() => {
    if (overall === 'critical') return t('health.heroCritical')
    if (overall === 'degraded') return t('health.heroDegraded')
    if (overall === 'unknown')  return t('health.heroUnknown')
    return t('health.heroHealthy')
  })()
  const heroDetail = issues.length === 0
    ? t('health.heroDetailHealthy')
    : t('health.heroDetailIssues').replace('{n}', String(issues.length))

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>{t('health.title')}</h2>
          <span className="view-subtitle">{t('health.subtitle')}</span>
        </div>
      </div>

      {/* Overall traffic-light hero */}
      <div className={`health-hero health-hero-${overall}`}>
        <div className="health-hero-icon">
          <Icon
            name={overall === 'critical' ? 'alert-triangle' : overall === 'degraded' ? 'alert-triangle' : 'check'}
            size={28}
          />
        </div>
        <div className="health-hero-text">
          <div className="health-hero-title">{heroMessage}</div>
          <div className="health-hero-detail">{heroDetail}</div>
        </div>
      </div>

      {/* Per-system status cards */}
      <div className="health-grid">
        {systems.map(card => {
          const clickable = !!card.view
          return (
            <div
              key={card.id}
              className={`health-card health-card-${card.status} ${clickable ? 'is-clickable' : ''}`}
              onClick={() => card.view && onNavigate(card.view)}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
            >
              <div className="health-card-head">
                <span className="health-card-icon"><Icon name={card.icon} size={14} /></span>
                <span className="health-card-label">{card.label}</span>
                <span className={`health-card-pip pip-${card.status}`} title={card.status} />
              </div>
              <div className="health-card-primary">{card.primary}</div>
              {card.secondary && <div className="health-card-secondary">{card.secondary}</div>}
            </div>
          )
        })}
      </div>

      {/* Actionable issues list */}
      <div className="health-issues">
        <div className="health-issues-head">
          <h3>{t('health.issuesTitle')}</h3>
          <span className="health-issues-count">{issues.length}</span>
        </div>
        {issues.length === 0 ? (
          <div className="health-issues-empty">
            <Icon name="check" size={16} />
            <span>{t('health.noIssues')}</span>
          </div>
        ) : (
          <ul className="health-issues-list">
            {issues.map(issue => {
              const clickable = !!issue.onClick || !!issue.view
              return (
                <li
                  key={issue.id}
                  className={`health-issue sev-${issue.severity} ${clickable ? 'is-clickable' : ''}`}
                  onClick={() => {
                    if (issue.onClick) issue.onClick()
                    else if (issue.view) onNavigate(issue.view)
                  }}
                  role={clickable ? 'button' : undefined}
                  tabIndex={clickable ? 0 : undefined}
                >
                  <span className="health-issue-icon"><Icon name={issue.icon} size={14} /></span>
                  <div className="health-issue-body">
                    <div className="health-issue-msg">{issue.message}</div>
                    {issue.detail && <div className="health-issue-detail">{issue.detail}</div>}
                  </div>
                  {clickable && <Icon name="chevron-right" size={13} />}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Recent errors mini-feed */}
      {recentErrors.length > 0 && (
        <div className="health-errors">
          <div className="health-issues-head">
            <h3>{t('health.recentErrors')}</h3>
            <span className="health-issues-count">{recentErrors.length}</span>
          </div>
          <ul className="health-error-list">
            {recentErrors.map((m, i) => (
              <li key={`${m.time.getTime()}-${i}`} className="health-error-line">
                <span className="health-error-time mono">
                  {m.time.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="health-error-text mono">{m.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
