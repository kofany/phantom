import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import {
  Button,
  EmptyState,
  Icon,
  KebabMenu,
  KebabAction,
  SkeletonPanel,
} from '../common'
import { Bot, Message } from '../../types'

type IrcPresenceTabProps = {
  channel: string
  /** Bots currently online — only these can answer cwho. Local hub bot
   *  shows up here too via list_bots so the picker is one source of truth. */
  bots: Bot[]
  messages: Message[]
  onCommandSilent: (cmd: string, pattern: RegExp, durationMs?: number) => void
  /** Fire `.bc <bot> raw MODE/KICK ...` etc. — used by the per-nick kebab. */
  onSendCommand?: (cmd: string) => void
  canEdit: boolean
}

type IrcMember = {
  /** '@' = op, '+' = voice, ' ' = regular. */
  mode: '@' | '+' | ' '
  nick: string
  ident: string
  host: string
  /** Userlist flag string as bot reports (e.g. "n+", "+ko"); empty when
   *  the user has no userlist record on this bot. */
  flags: string
}

// Sample line: `[  3] [@alice       ] [    foo@dyn.example.com           ] +n`
// Output of `chan::cwho` in class-chan.cpp:233 — fixed-width format.
const CWHO_LINE = /^\[\s*\d+\s*\]\s*\[([@+ ])(.+?)\s*\]\s*\[\s*(\S+?)@(\S+?)\s*\]\s*(.*)$/
const NO_MATCHES_RE = /Psotnic:\s*No matches found/i
const PERMISSION_RE = /Permission denied/i
// Silent-pattern matcher hides every cwho-shaped line plus the "no matches"
// notice so the broadcast doesn't spam mini-console / overview.
const SILENCE_RE = /^(?:\([^)]+\)\s+)?(?:\[\s*\d+\s*\]\s*\[[@+ ].+?\s*\]\s*\[.+?@.+?\s*\]|Psotnic:\s*No matches found|Permission denied|Invalid channel)/

const FETCH_TIMEOUT_MS = 4500
const QUIESCENCE_MS = 700

export function IrcPresenceTab({
  channel,
  bots,
  messages,
  onCommandSilent,
  onSendCommand,
  canEdit,
}: IrcPresenceTabProps) {
  const { t } = useTranslation()

  const onlineBots = useMemo(() => bots.filter(b => b.online), [bots])
  // Default to the first online bot. If none, picker stays empty and we
  // surface the "no online bot" empty state instead of trying to query.
  const [actingBot, setActingBot] = useState<string | null>(
    onlineBots[0]?.name ?? null,
  )
  const [members, setMembers] = useState<IrcMember[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'op' | 'voice' | 'reg'>('all')
  const [nameSearch, setNameSearch] = useState('')

  // Track which slice of `messages` we should scan for the current request
  // — anything before `startIdx` is from previous sessions or other bots.
  const startIdxRef = useRef(0)
  const startTsRef = useRef(0)
  const lastMatchTsRef = useRef(0)
  const debounceRef = useRef<number | null>(null)

  // Re-pick the acting bot when the online list shrinks to nothing or our
  // current pick goes offline.
  useEffect(() => {
    if (actingBot && onlineBots.find(b => b.name === actingBot)) return
    setActingBot(onlineBots[0]?.name ?? null)
  }, [onlineBots, actingBot])

  const refresh = (botName: string | null) => {
    if (!botName) return
    setLoading(true)
    setError(null)
    setMembers([])
    startIdxRef.current = messages.length
    startTsRef.current = Date.now()
    lastMatchTsRef.current = startTsRef.current
    onCommandSilent(`bc ${botName} cwho ${channel}`, SILENCE_RE, FETCH_TIMEOUT_MS)
  }

  // Fire on mount and whenever the acting bot or channel changes.
  useEffect(() => {
    refresh(actingBot)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actingBot, channel])

  // Parse the silent broadcast as it streams in. We accept lines as long
  // as the cwho regex matches; we detect "done" by quiescence (no new
  // matching lines for QUIESCENCE_MS) since psotnic doesn't terminate the
  // listing with a sentinel.
  useEffect(() => {
    if (!loading) return
    const slice = messages.slice(startIdxRef.current)
    if (slice.length === 0) return

    const next: IrcMember[] = [...members]
    const seen = new Set(next.map(m => m.nick))
    let matched = 0
    let stopOnPerm = false

    for (const m of slice) {
      const text = m.text
      if (PERMISSION_RE.test(text)) {
        stopOnPerm = true
        break
      }
      if (NO_MATCHES_RE.test(text)) {
        // Empty channel from the bot's POV — we'll quiesce on this and
        // render empty state.
        matched++
        continue
      }
      const cw = text.match(CWHO_LINE)
      if (!cw) continue
      const mode = cw[1] as '@' | '+' | ' '
      const nick = cw[2].trim()
      if (!nick || seen.has(nick)) continue
      seen.add(nick)
      next.push({
        mode,
        nick,
        ident: cw[3].trim(),
        host: cw[4].trim(),
        flags: cw[5].trim(),
      })
      matched++
    }

    if (stopOnPerm) {
      setLoading(false)
      setError(t('ircPresence.permissionDenied'))
      return
    }

    if (matched > 0) {
      setMembers(next)
      lastMatchTsRef.current = Date.now()
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const sinceLast = Date.now() - lastMatchTsRef.current
      const sinceStart = Date.now() - startTsRef.current
      if (sinceLast >= QUIESCENCE_MS || sinceStart >= FETCH_TIMEOUT_MS) {
        setLoading(false)
        if (matched === 0 && next.length === 0 && sinceStart >= FETCH_TIMEOUT_MS) {
          setError(t('ircPresence.fetchTimeout'))
        }
      }
    }, QUIESCENCE_MS + 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading])

  const filtered = useMemo(() => {
    let out = members
    if (filter === 'op') out = out.filter(m => m.mode === '@')
    else if (filter === 'voice') out = out.filter(m => m.mode === '+')
    else if (filter === 'reg') out = out.filter(m => m.mode === ' ')
    const q = nameSearch.trim().toLowerCase()
    if (q) {
      out = out.filter(
        m =>
          m.nick.toLowerCase().includes(q) ||
          m.ident.toLowerCase().includes(q) ||
          m.host.toLowerCase().includes(q),
      )
    }
    return out
  }, [members, filter, nameSearch])

  const sendMode = (mode: '+o' | '-o' | '+v' | '-v', nick: string) => {
    if (!onSendCommand || !actingBot) return
    onSendCommand(`bc ${actingBot} raw MODE ${channel} ${mode} ${nick}`)
  }

  const sendKick = (nick: string) => {
    if (!onSendCommand || !actingBot) return
    const reason = window.prompt(t('ircPresence.kickReasonPrompt', { nick }), '')
    if (reason === null) return
    const finalReason = reason.trim() || 'requested'
    onSendCommand(`bc ${actingBot} raw KICK ${channel} ${nick} :${finalReason}`)
    // Optimistically drop them from our local list so the row disappears
    // until the next refresh. Bot will reflect reality on next cwho.
    setMembers(prev => prev.filter(m => m.nick !== nick))
  }

  const opCount   = members.filter(m => m.mode === '@').length
  const voiceCount = members.filter(m => m.mode === '+').length
  const regCount  = members.filter(m => m.mode === ' ').length

  if (onlineBots.length === 0) {
    return (
      <EmptyState
        icon="bot"
        title={t('ircPresence.noOnlineBotTitle')}
        description={t('ircPresence.noOnlineBotDesc')}
      />
    )
  }

  return (
    <div className="irc-presence">
      <div className="irc-presence-toolbar">
        <label className="irc-presence-bot">
          <span>{t('ircPresence.viewFromBot')}</span>
          <select
            value={actingBot ?? ''}
            onChange={e => setActingBot(e.target.value)}
          >
            {onlineBots.map(b => (
              <option key={b.name} value={b.name}>{b.name}</option>
            ))}
          </select>
        </label>

        <div className="irc-presence-filters" role="tablist">
          {(['all', 'op', 'voice', 'reg'] as const).map(f => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className={`irc-presence-filter${filter === f ? ' is-active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {t(`ircPresence.filter_${f}`)}
              <span className="irc-presence-filter-count">
                {f === 'all'   ? members.length :
                 f === 'op'    ? opCount        :
                 f === 'voice' ? voiceCount     :
                                 regCount       }
              </span>
            </button>
          ))}
        </div>

        <input
          type="text"
          className="irc-presence-search"
          placeholder={t('ircPresence.searchPlaceholder')}
          value={nameSearch}
          onChange={e => setNameSearch(e.target.value)}
        />

        <Button
          variant="ghost"
          size="sm"
          onClick={() => refresh(actingBot)}
          disabled={loading || !actingBot}
          title={t('ircPresence.refresh')}
        >
          <Icon name="activity" size={13} />
          {t('ircPresence.refresh')}
        </Button>
      </div>

      {error ? (
        <EmptyState variant="error" icon="alert-triangle" title={error} />
      ) : loading && members.length === 0 ? (
        <SkeletonPanel lines={6} label={t('common.loading')} />
      ) : filtered.length === 0 ? (
        <EmptyState
          variant={nameSearch || filter !== 'all' ? 'no-results' : 'empty'}
          icon="users"
          title={
            nameSearch || filter !== 'all'
              ? t('ircPresence.noMatches')
              : t('ircPresence.empty')
          }
          description={
            !nameSearch && filter === 'all'
              ? t('ircPresence.emptyDesc', { bot: actingBot ?? '' })
              : undefined
          }
        />
      ) : (
        <div className="table-shell">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>{t('ircPresence.nick')}</th>
                  <th>{t('ircPresence.identHost')}</th>
                  <th>{t('users.flags')}</th>
                  {canEdit && onSendCommand && <th aria-label="" style={{ width: 46 }} />}
                </tr>
              </thead>
              <tbody>
                {filtered.map(m => {
                  const acts: KebabAction[] = []
                  if (canEdit && onSendCommand) {
                    if (m.mode === '@') {
                      acts.push({
                        id: 'deop',
                        label: t('channelMember.deop'),
                        icon: 'unlock',
                        onClick: () => sendMode('-o', m.nick),
                      })
                    } else {
                      acts.push({
                        id: 'op',
                        label: t('channelMember.op'),
                        icon: 'shield',
                        onClick: () => sendMode('+o', m.nick),
                      })
                    }
                    if (m.mode === '+') {
                      acts.push({
                        id: 'devoice',
                        label: t('channelMember.devoice'),
                        icon: 'pause',
                        onClick: () => sendMode('-v', m.nick),
                      })
                    } else if (m.mode !== '@') {
                      acts.push({
                        id: 'voice',
                        label: t('channelMember.voice'),
                        icon: 'send',
                        onClick: () => sendMode('+v', m.nick),
                      })
                    }
                    acts.push({
                      id: 'kick',
                      label: t('channelMember.kick'),
                      icon: 'zap',
                      destructive: true,
                      onClick: () => sendKick(m.nick),
                    })
                  }
                  return (
                    <tr key={m.nick}>
                      <td className="mono">
                        <span className={`irc-mode irc-mode-${
                          m.mode === '@' ? 'op' : m.mode === '+' ? 'voice' : 'reg'
                        }`}>
                          {m.mode === ' ' ? '·' : m.mode}
                        </span>
                      </td>
                      <td className="mono">
                        <strong style={{ color: 'var(--ink-1)' }}>{m.nick}</strong>
                      </td>
                      <td className="mono text-ink-3">{m.ident}@{m.host}</td>
                      <td className="mono text-ink-3">{m.flags || '—'}</td>
                      {canEdit && onSendCommand && (
                        <td>
                          <KebabMenu actions={acts} ariaLabel={`Actions for ${m.nick}`} />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
