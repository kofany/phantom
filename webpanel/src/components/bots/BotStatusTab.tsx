import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, EmptyState, Icon, SkeletonPanel, CopyableMono, KebabMenu, KebabAction } from '../common'
import { Message } from '../../types'

type BotStatusTabProps = {
  botName: string
  botOnline: boolean
  messages: Message[]
  onCommandSilent: (cmd: string, pattern: RegExp, durationMs?: number) => void
  /** When false, the user lacks +x — show readonly notice instead of fetching. */
  canFetch: boolean
  /** Generic command sender — used by per-channel kebab to issue
   *  rpart/rcycle/raw MODE on this bot for that channel. */
  onSendCommand?: (cmd: string) => void
  /** Jump to ChannelDetail by name (kebab "Open channel"). */
  onOpenChannel?: (chanName: string) => void
}

type ChannelLine = {
  name: string
  modes: string
  ops: number
  total: number
}

type ParsedStatus = {
  uptime?: string
  version?: string
  server?: string
  mask?: string
  lagMs?: number
  lagAgoSec?: number
  botsOnline?: number
  ownersOnline?: number
  channels: ChannelLine[]
}

// Lines from `client::sendStatus()` (class-client.cpp:84). The hub forwards
// these verbatim to our partyline socket; we silence them while parsing so
// they don't flood the visual console.
const SILENCE_RE = /^(?:\([^)]+\)\s+)?(?:- about me:|Hi\. I'm |Up for:|Connected to |Lag: |I have \d+ bots|- my channels:|#|&|\+|!|Antiptrace:|IRC Backtrace:|SSL support:|IPv6 support:|Asynchronus DNS|Resolving Threads:|FireDNS|Endianness:|Debug Mode:|Core Limit:|Module Support:|I'm configured)/i

const HI_RE = /Hi\. I'm (\S+) and I'm running Phantom (\S+)/
const UPTIME_RE = /^(?:\([^)]+\)\s+)?Up for:\s+(.+)$/
const CONNECTED_RE = /^(?:\([^)]+\)\s+)?Connected to (\S+) as (.+)$/
const LAG_NOT_CHECKED = /^(?:\([^)]+\)\s+)?Lag:\s+not checked/
const LAG_PROGRESS_RE = /^(?:\([^)]+\)\s+)?Lag:\s+(\d+)\s+\(waiting/
const LAG_DONE_RE = /^(?:\([^)]+\)\s+)?Lag:\s+([\d.]+)\s+\(last checked (\d+)s ago\)/
const BOTS_OWNERS_RE = /I have (\d+) bots and (\d+) owners on-line/
// Channel lines: "#chan (modes, X ops, Y total) [hash:...]" — modes may be empty
const CHANNEL_RE = /^(?:\([^)]+\)\s+)?([#&+!]\S+)\s+\(([^,]*),\s+(\d+)\s+ops,\s+(\d+)\s+total\)/

// `bc_status` rejects non-+x with strerror(EACCES) → "Permission denied"
// (botcmd.cpp:347-353 + defines.h:257). Matching it lets us fail fast
// instead of waiting out FETCH_TIMEOUT_MS.
const NOPERM_RE = /Permission denied/i

const FETCH_TIMEOUT_MS = 8000
const QUIESCENCE_MS = 1500

export function BotStatusTab({
  botName,
  onSendCommand,
  onOpenChannel,
  botOnline,
  messages,
  onCommandSilent,
  canFetch,
}: BotStatusTabProps) {
  const { t } = useTranslation()
  const [parsed, setParsed] = useState<ParsedStatus>({ channels: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startIdxRef = useRef(0)
  const startTsRef = useRef(0)
  const lastMatchTsRef = useRef(0)
  const debounceRef = useRef<number | null>(null)

  const fetchStatus = () => {
    if (!canFetch || !botOnline) return
    setError(null)
    setLoading(true)
    setParsed({ channels: [] })
    startIdxRef.current = messages.length
    startTsRef.current = Date.now()
    lastMatchTsRef.current = Date.now()
    onCommandSilent(`bc ${botName} status`, SILENCE_RE, FETCH_TIMEOUT_MS)
  }

  // Auto-fetch on mount / bot change
  useEffect(() => {
    fetchStatus()
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botName])

  // Parse status lines
  useEffect(() => {
    if (!loading) return
    const slice = messages.slice(startIdxRef.current)
    if (slice.length === 0) return

    const next: ParsedStatus = { channels: [...parsed.channels] }
    Object.assign(next, parsed)
    let matched = 0
    const seenChans = new Set(next.channels.map(c => c.name))

    for (const m of slice) {
      const text = m.text
      if (NOPERM_RE.test(text)) {
        setLoading(false)
        setError(t('bots.statusReadonly'))
        return
      }
      const hi = text.match(HI_RE)
      if (hi) {
        next.version = hi[2]
        matched++
        continue
      }
      const up = text.match(UPTIME_RE)
      if (up) {
        next.uptime = up[1].trim()
        matched++
        continue
      }
      const conn = text.match(CONNECTED_RE)
      if (conn) {
        next.server = conn[1]
        next.mask = conn[2].trim()
        matched++
        continue
      }
      if (LAG_NOT_CHECKED.test(text)) {
        next.lagMs = undefined
        next.lagAgoSec = undefined
        matched++
        continue
      }
      const lagP = text.match(LAG_PROGRESS_RE)
      if (lagP) {
        next.lagMs = parseInt(lagP[1], 10)
        matched++
        continue
      }
      const lagD = text.match(LAG_DONE_RE)
      if (lagD) {
        next.lagMs = Math.round(parseFloat(lagD[1]) * 1000)
        next.lagAgoSec = parseInt(lagD[2], 10)
        matched++
        continue
      }
      const bo = text.match(BOTS_OWNERS_RE)
      if (bo) {
        next.botsOnline = parseInt(bo[1], 10)
        next.ownersOnline = parseInt(bo[2], 10)
        matched++
        continue
      }
      const ch = text.match(CHANNEL_RE)
      if (ch && !seenChans.has(ch[1])) {
        seenChans.add(ch[1])
        next.channels.push({
          name: ch[1],
          modes: ch[2].trim(),
          ops: parseInt(ch[3], 10),
          total: parseInt(ch[4], 10),
        })
        matched++
        continue
      }
    }

    if (matched > 0) {
      setParsed(next)
      lastMatchTsRef.current = Date.now()
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const sinceLast = Date.now() - lastMatchTsRef.current
      const sinceStart = Date.now() - startTsRef.current
      if (sinceLast >= QUIESCENCE_MS || sinceStart >= FETCH_TIMEOUT_MS) {
        setLoading(false)
        if (matched === 0 && !next.uptime && sinceStart >= FETCH_TIMEOUT_MS) {
          setError(t('bots.statusFetchTimeout'))
        }
      }
    }, QUIESCENCE_MS + 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading])

  const lagBadge = useMemo(() => {
    if (parsed.lagMs === undefined) return null
    const ms = parsed.lagMs
    const tone = ms < 200 ? 'good' : ms < 800 ? 'warn' : 'bad'
    return { ms, tone }
  }, [parsed.lagMs])

  if (!canFetch) {
    return (
      <div className="bot-status-panel">
        <div className="config-readonly-notice">
          <Icon name="lock" size={13} />
          {t('bots.statusReadonly')}
        </div>
      </div>
    )
  }

  if (!botOnline) {
    return (
      <div className="bot-status-panel">
        <EmptyState
          icon="wifi-off"
          title={t('bots.offline')}
          description={t('bots.statusEmpty')}
        />
      </div>
    )
  }

  return (
    <div className="bot-status-panel">
      <div className="bot-status-toolbar">
        <p className="config-desc">{t('bots.statusDesc')}</p>
        <Button size="sm" variant="ghost" onClick={fetchStatus} disabled={loading}>
          <Icon name="activity" size={13} />
          {t('common.refresh')}
        </Button>
      </div>

      {error && (
        <div className="config-readonly-notice" style={{ color: 'var(--err)', background: 'var(--err-lo)', borderColor: 'rgba(248, 113, 113, 0.25)' }}>
          <Icon name="alert-triangle" size={13} />
          {error}
        </div>
      )}

      {loading && !parsed.uptime && (
        <SkeletonPanel lines={6} label={t('bots.statusFetching')} />
      )}

      {!loading && !parsed.uptime && (
        <EmptyState
          icon="server"
          title={t('bots.statusEmpty')}
          description={t('bots.statusFetchTimeout')}
        />
      )}

      {parsed.uptime && (
        <>
          <div className="bot-status-grid">
            <div className="info-item">
              <span className="info-label">{t('bots.statusUptime')}</span>
              <span className="info-value mono">{parsed.uptime}</span>
            </div>
            {parsed.version && (
              <div className="info-item">
                <span className="info-label">{t('bots.statusVersion')}</span>
                <span className="info-value mono">{parsed.version}</span>
              </div>
            )}
            <div className="info-item">
              <span className="info-label">{t('bots.statusServer')}</span>
              <span className="info-value">
                {parsed.server ? (
                  <CopyableMono value={parsed.server} size="md" />
                ) : (
                  <span className="info-value-muted">{t('bots.statusServerNone')}</span>
                )}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('bots.statusLag')}</span>
              <span className="info-value">
                {lagBadge ? (
                  <>
                    <span className={`bot-status-lag tone-${lagBadge.tone}`}>{lagBadge.ms} ms</span>
                    {parsed.lagAgoSec !== undefined && (
                      <span className="info-value-muted" style={{ marginLeft: '0.4rem' }}>
                        ({t('bots.statusLagChecked').replace('{ago}', String(parsed.lagAgoSec))})
                      </span>
                    )}
                  </>
                ) : (
                  <span className="info-value-muted">—</span>
                )}
              </span>
            </div>
            {parsed.botsOnline !== undefined && (
              <div className="info-item">
                <span className="info-label">{t('bots.statusBotsOnline')}</span>
                <span className="info-value mono">{parsed.botsOnline}</span>
              </div>
            )}
            {parsed.ownersOnline !== undefined && (
              <div className="info-item">
                <span className="info-label">{t('bots.statusOwners')}</span>
                <span className="info-value mono">{parsed.ownersOnline}</span>
              </div>
            )}
          </div>

          <div className="bot-status-channels">
            <div className="bot-status-channels-head">
              <h4>{t('bots.statusChannelsHeading')}</h4>
              <span className="form-hint">
                {t('bots.statusChannelsCount').replace('{n}', String(parsed.channels.length))}
              </span>
            </div>
            {parsed.channels.length === 0 ? (
              <p className="no-data">{t('common.noResults')}</p>
            ) : (
              <table className="bot-status-channels-table">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('bots.statusChannelModes')}</th>
                    <th>{t('bots.statusChannelOps')}</th>
                    <th>{t('bots.statusChannelTotal')}</th>
                    {(onOpenChannel || onSendCommand) && <th aria-label="" />}
                  </tr>
                </thead>
                <tbody>
                  {parsed.channels.map(c => {
                    const acts: KebabAction[] = []
                    if (onOpenChannel) {
                      acts.push({
                        id: 'open',
                        label: t('botStatusKebab.openChannel'),
                        icon: 'arrow-left',
                        onClick: () => onOpenChannel(c.name),
                      })
                    }
                    if (onSendCommand) {
                      acts.push(
                        {
                          id: 'cycle',
                          label: t('botStatusKebab.cycle'),
                          icon: 'play',
                          onClick: () => onSendCommand(`rcycle ${botName} ${c.name}`),
                        },
                        {
                          id: 'part',
                          label: t('botStatusKebab.part'),
                          icon: 'pause',
                          destructive: true,
                          onClick: () => onSendCommand(`rpart ${botName} ${c.name}`),
                        },
                      )
                    }
                    return (
                      <tr key={c.name}>
                        <td className="mono">{c.name}</td>
                        <td className="mono">{c.modes ? `+${c.modes}` : '—'}</td>
                        <td className="mono">{c.ops}</td>
                        <td className="mono">{c.total}</td>
                        {(onOpenChannel || onSendCommand) && (
                          <td style={{ width: 46, textAlign: 'right' }}>
                            {acts.length > 0 && (
                              <KebabMenu actions={acts} ariaLabel={`Actions for ${c.name}`} />
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
