import { useState, useEffect, useCallback, useRef } from 'react'
import { Channel, ChannelDetail, UserDetail, User as UserType, Bot as BotType, Message } from './types'
import { toast } from './components/common/Toast'
import { useTranslation } from './hooks/useTranslation'
import { logLocalAction, ingestBroadcasts, AuditAction } from './auditLog'
import {
  parseProtlistOutput,
  SILENT_PROTLIST_REGEX,
  type ParsedProtlist,
  type ProtlistKind,
} from './components/bans/parseProtlist'
import { notify, matchMention } from './notifications'

// Session token storage key
const SESSION_TOKEN_KEY = 'phantom_session_token'
const SESSION_HANDLE_KEY = 'phantom_session_handle'

// Cap the partyline buffer so long-running sessions don't grow it without
// bound. Parsers (BotDetail, BotStatusTab, …) work on a slice anchored to
// `messages.length` at the moment a fetch is issued, so dropping the
// oldest entries is safe — they pre-date any in-flight fetch.
const MAX_MESSAGES = 2000

// Psotnic userlist handles: same character set as IRC nicks (RFC 2812
// special chars) plus length cap. Anything outside this set is junk
// (most often emoticons or stripped formatting from a partyline message
// that the parser misread) and must NEVER enter state.bots, where it
// would surface as a stale row in BotList / Matrix.
const VALID_HANDLE_RE = /^[A-Za-z0-9_\-\[\]\\^`{}|]{1,16}$/

function isValidHandle(name: unknown): name is string {
  return typeof name === 'string' && VALID_HANDLE_RE.test(name)
}

function appendMessage(prev: Message[], msg: Message): Message[] {
  // Single concat + slice keeps the operation O(n) on the cap, not on the
  // (unbounded) raw array.
  if (prev.length < MAX_MESSAGES) return [...prev, msg]
  return [...prev.slice(prev.length - MAX_MESSAGES + 1), msg]
}

// Parse the payload of a `[c]` reply (`.list c` output, see
// class-listcmd.cpp:141). Each token is a chan name optionally prefixed
// by one of @ ? - to encode bot's live state on that channel.
// `[c] no channels` → empty array.
function parsePresenceTokens(payload: string): BotChannelPresence[] {
  const trimmed = payload.trim()
  if (!trimmed || trimmed === 'no channels') return []
  return trimmed.split(/\s+/).filter(Boolean).map(tok => {
    if (tok.startsWith('@')) return { name: tok.slice(1), state: 'op' as const }
    if (tok.startsWith('?')) return { name: tok.slice(1), state: 'syncing' as const }
    if (tok.startsWith('-')) return { name: tok.slice(1), state: 'absent' as const }
    return { name: tok, state: 'joined' as const }
  })
}

export type PartylineUser = {
  handle: string
  online: boolean
}

export type IrcnetServer = {
  host: string
  port: number | null
  region: string
  users: number | null
  max: number | null
  ssl: boolean
  open?: boolean
  sasl?: boolean
  version?: string
  serverInfo?: string
  lastSeen?: string
}

export type IrcnetData = {
  servers: IrcnetServer[]
  source?: 'live' | 'unavailable'
  cached_at: number
  cache_age_s: number
}

/** A single bot's relationship to a single channel, as reported by
 *  `.list c` (class-listcmd.cpp::listcmd, case 'c').
 *  - `op`     — bot is on the channel and has +o
 *  - `joined` — bot is on the channel without +o
 *  - `syncing`— channel is in userlist + bot is on it but not synced yet
 *  - `absent` — channel is in userlist (rjoin target) but bot is NOT on it
 */
export type BotChannelPresenceState = 'op' | 'joined' | 'syncing' | 'absent'

export type BotChannelPresence = {
  name: string
  state: BotChannelPresenceState
}

export type HubState = {
  connected: boolean
  authenticated: boolean
  handle: string | null
  globalFlags: number
  partylineUsers: PartylineUser[]
  messages: Message[]
  error: string | null
  channels: Channel[]
  users: UserType[]
  bots: BotType[]
  currentChannel: ChannelDetail | null
  currentUser: UserDetail | null
  ircnet: IrcnetData | null
  ircnetError: string | null
  ircnetLoading: boolean
  loading: boolean
  reconnecting: boolean
  /** Wall-clock timestamps of the last successful list_* response. Used by
   *  the freshness badge — null until the first fetch lands. */
  channelsFetchedAt: number | null
  usersFetchedAt: number | null
  botsFetchedAt: number | null
}

const initialState: HubState = {
  connected: false,
  authenticated: false,
  handle: null,
  globalFlags: 0,
  partylineUsers: [],
  messages: [],
  error: null,
  channels: [],
  users: [],
  bots: [],
  currentChannel: null,
  currentUser: null,
  ircnet: null,
  ircnetError: null,
  ircnetLoading: false,
  loading: false,
  reconnecting: false,
  channelsFetchedAt: null,
  usersFetchedAt: null,
  botsFetchedAt: null,
}

// Backoff: 1s → 2s → 4s → 8s → 16s → 30s max
const RECONNECT_BASE = 1000
const RECONNECT_MAX = 30000

export function useHub(wsUrl: string) {
  const { t } = useTranslation()
  const tRef = useRef(t)
  tRef.current = t

  const ws = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<number | null>(null)
  const reconnectAttempt = useRef(0)
  const hadConnection = useRef(false)
  const intentionalClose = useRef(false)
  const [state, setState] = useState<HubState>(initialState)

  // Registry of patterns that silence matching incoming partyline lines
  // from the visual console. Used by components that fetch partyline data
  // programmatically (e.g. BotDetail sends `.bc <nick> cfg` automatically
  // and we don't want the whole config listing flooding the console).
  const silentPatterns = useRef<{ regex: RegExp; until: number }[]>([])

  // Live mirror of state.messages so callbacks (e.g. protlist query
  // polling) can read the latest partyline output without closing over
  // stale state. Kept in sync by a useEffect below.
  const messagesRef = useRef<Message[]>([])

  const send = useCallback((msg: object) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(msg))
    }
  }, [])

  const login = useCallback((handle: string, password: string) => {
    // Clear any existing session
    localStorage.removeItem(SESSION_TOKEN_KEY)
    localStorage.removeItem(SESSION_HANDLE_KEY)
    setState(s => ({ ...s, error: null }))
    send({ type: 'auth', data: { handle, password } })
  }, [send])

  const sendCommand = useCallback((command: string) => {
    send({ type: 'command', data: { cmd: command } })
  }, [send])

  /**
   * Send a command whose response should be hidden from the visual console.
   * Incoming partyline lines matching `pattern` within `durationMs` will be
   * flagged as hidden — they still live in messages[] so the caller's parser
   * can read them, but MiniConsole / Overview won't render them.
   */
  const sendCommandSilent = useCallback(
    (command: string, pattern: RegExp, durationMs = 5000) => {
      silentPatterns.current = silentPatterns.current
        .filter(p => p.until > Date.now())
        .concat({ regex: pattern, until: Date.now() + durationMs })
      send({ type: 'command', data: { cmd: command } })
    },
    [send],
  )

  // Discover offline bots by scraping `.bots`. The bot's WebAPI
   // (webapi_handle_list_bots) only enumerates active TCP connections,
   // so handles flagged as bots but not currently linked never appear in
   // list_bots responses. The `.bots` partyline command emits a single
   // line listing every bot handle in the userlist regardless of state:
   //
   //   "Bots(55): name1 name2 name3 ..."
   //
   // We send it silenced, parse the line, and append any handle missing
   // from state.bots as { online: false }. CRUD ops on bots and the
   // bot_quit/bot_join events don't need any change — they already
   // patch state.bots correctly.
  const discoverOfflineBots = useCallback((timeoutMs = 4000) => {
    const startIdx = messagesRef.current.length
    silentPatterns.current = silentPatterns.current
      .filter(p => p.until > Date.now())
      .concat({ regex: /^Bots\(\d+\):/, until: Date.now() + timeoutMs })
    send({ type: 'command', data: { cmd: 'bots' } })

    const deadline = Date.now() + timeoutMs
    const poll = () => {
      const slice = messagesRef.current.slice(startIdx)
      const line = slice.find(m => /^Bots\(\d+\):/.test(m.text))
      if (line) {
        // "Bots(55): name1 name2 name3 ..." → split, drop empties
        const names = line.text
          .replace(/^Bots\(\d+\):\s*/, '')
          .trim()
          .split(/\s+/)
          .filter(Boolean)
        setState(s => {
          const known = new Set(s.bots.map(b => b.name))
          const additions = names
            .filter(n => isValidHandle(n) && !known.has(n))
            .map(n => ({ name: n, nick: '', server: '', online: false }))
          if (additions.length === 0) return s
          return { ...s, bots: [...s.bots, ...additions] }
        })
        return
      }
      if (Date.now() > deadline) return
      setTimeout(poll, 150)
    }
    setTimeout(poll, 150)
  }, [send])

  // Query the bot's global + per-channel protlists by running the
  // partyline `.bans` / `.exempts` / `.invites` / `.reops` family of
  // commands sequentially. The bot's WebAPI exposes CRUD for protlists
  // but no list-reader, so we scrape the textual response instead.
  // SILENT_PROTLIST_REGEX
  // hides the lines from the visual console while they are being parsed.
  const queryGlobalProtlists = useCallback(
    async (timeoutMs = 8000): Promise<Record<ProtlistKind, ParsedProtlist>> => {
      const kinds: ProtlistKind[] = ['ban', 'exempt', 'invite', 'reop']
      const cmds: Record<ProtlistKind, string> = {
        ban: 'bans *', exempt: 'exempts *', invite: 'invites *', reop: 'reops *',
      }
      const out = {} as Record<ProtlistKind, ParsedProtlist>

      for (const k of kinds) {
        const startIdx = messagesRef.current.length
        silentPatterns.current = silentPatterns.current
          .filter(p => p.until > Date.now())
          .concat({ regex: SILENT_PROTLIST_REGEX, until: Date.now() + timeoutMs })
        send({ type: 'command', data: { cmd: cmds[k] } })

        out[k] = await new Promise<ParsedProtlist>((resolve, reject) => {
          const deadline = Date.now() + timeoutMs
          const poll = () => {
            const lines = messagesRef.current.slice(startIdx).map(m => m.text)
            const parsed = parseProtlistOutput(lines)
            if (parsed.done) return resolve(parsed)
            if (Date.now() > deadline) {
              // Resolve with whatever we got so the UI can show partial
              // data — the caller decides whether to surface a warning.
              return reject(new Error(`timeout on ${k}`))
            }
            setTimeout(poll, 150)
          }
          setTimeout(poll, 150)
        })
      }
      return out
    },
    [send],
  )

  const sendChat = useCallback((text: string) => {
    send({ type: 'chat', data: { text } })
  }, [send])

  const logout = useCallback(() => {
    // Invalidate session on server
    const token = localStorage.getItem(SESSION_TOKEN_KEY)
    if (token) {
      send({ type: 'logout', data: { token } })
    }

    // Clear local storage
    localStorage.removeItem(SESSION_TOKEN_KEY)
    localStorage.removeItem(SESSION_HANDLE_KEY)

    // Reset session-bound state but keep the socket alive — the next login
    // attempt will reuse it. Closing the WS would force the UI through a
    // misleading "connecting…" placeholder while nothing is actually
    // reconnecting (the autoreconnect path is guarded by intentionalClose).
    const stillConnected = ws.current?.readyState === WebSocket.OPEN
    setState({ ...initialState, connected: stillConnected })
  }, [send])

  const fetchChannels = useCallback(() => {
    setState(s => ({ ...s, loading: true }))
    send({ type: 'list_channels' })
  }, [send])

  const fetchUsers = useCallback((silent = false) => {
    if (!silent) setState(s => ({ ...s, loading: true }))
    send({ type: 'list_users' })
  }, [send])

  const fetchBots = useCallback((silent = false) => {
    if (!silent) setState(s => ({ ...s, loading: true }))
    send({ type: 'list_bots' })
    // After the JSON list_bots response (online only), scrape the full
    // bot handle list via partyline to surface offline bots too. Run
    // unconditionally — discoverOfflineBots is idempotent and cheap.
    discoverOfflineBots()
  }, [send, discoverOfflineBots])

  const fetchChannel = useCallback((channel: string) => {
    setState(s => ({ ...s, loading: true, currentChannel: null }))
    send({ type: 'get_channel', data: { channel } })
  }, [send])

  // Aggregate live channel presence for every online bot via a single
  // `.list c` broadcast. Each bot replies on its own line:
  //
  //   (botname) [c] @#foo #bar ?#baz -#quux
  //   [c] @#foo #bar                       ← reply from the LOCAL hub bot
  //
  // Token prefixes (class-listcmd.cpp:141): `@` op, none = joined no-ops,
  // `?` channel exists in userlist + bot on it but not synced yet,
  // `-` configured (rjoined) but bot is currently NOT on the channel.
  //
  // Requires HAS_N (pl_list:1718). One round-trip beats N×bc-status —
  // the matrix uses this for both speed AND per-cell op visibility.
  //
  // The unprefixed line comes from the local-hub bot (the same daemon
  // we're connected to). Without exposing config.handle through WebAPI
  // we can't name it deterministically, so the caller passes the list
  // of currently online bot handles and we resolve the local reply by
  // elimination — the bot that didn't appear in the prefixed replies.
  const fetchAllBotPresence = useCallback(
    (onlineBotNames: string[], timeoutMs = 4500): Promise<Map<string, BotChannelPresence[]>> => {
      const LIST_C_RE = /^(?:\(([^)]+)\)\s+)?\[c\]\s+(.*)$/
      const NOPERM_RE = /Permission denied/i
      const SILENCE_RE = /^(?:\([^)]+\)\s+)?\[c\]/
      const QUIESCENCE_MS = 600
      const POLL_INTERVAL_MS = 80

      return new Promise((resolve, reject) => {
        const startIdx = messagesRef.current.length
        silentPatterns.current = silentPatterns.current
          .filter(p => p.until > Date.now())
          .concat({ regex: SILENCE_RE, until: Date.now() + timeoutMs })
        send({ type: 'command', data: { cmd: 'list c' } })

        const result = new Map<string, BotChannelPresence[]>()
        let unprefixed: BotChannelPresence[] | null = null
        const deadline = Date.now() + timeoutMs
        let lastMatchTs = Date.now()
        let scanFrom = startIdx

        const finalize = () => {
          if (unprefixed !== null) {
            // Elimination: whichever online bot didn't reply with a
            // prefixed line is the local hub bot — attach the unprefixed
            // payload to it. If we can't pick exactly one, drop the
            // payload rather than guess (better to under-report than
            // mis-attribute).
            const replied = new Set(result.keys())
            const candidates = onlineBotNames.filter(n => !replied.has(n))
            if (candidates.length === 1) {
              result.set(candidates[0], unprefixed)
            }
          }
          resolve(result)
        }

        const poll = () => {
          const all = messagesRef.current
          for (let i = scanFrom; i < all.length; i++) {
            const text = all[i].text
            if (NOPERM_RE.test(text)) {
              scanFrom = all.length
              return reject(new Error('NOPERM'))
            }
            const m = text.match(LIST_C_RE)
            if (m) {
              const botName = m[1] || null
              const channels = parsePresenceTokens(m[2])
              if (botName) {
                result.set(botName, channels)
              } else {
                unprefixed = channels
              }
              lastMatchTs = Date.now()
            }
          }
          scanFrom = all.length

          const sinceLast = Date.now() - lastMatchTs
          if (Date.now() >= deadline || (result.size + (unprefixed ? 1 : 0) > 0 && sinceLast >= QUIESCENCE_MS)) {
            finalize()
            return
          }
          setTimeout(poll, POLL_INTERVAL_MS)
        }
        setTimeout(poll, 100)
      })
    },
    [send],
  )

  // Promise-based channel detail fetch — used by aggregate views (e.g.
  // BotChannelMatrix) that need to pull every channel without trampling
  // the singular currentChannel state used by ChannelDetail. Pending
  // requests are tracked here; the get_channel handler resolves them.
  const channelDetailQueue = useRef<Array<{
    channel: string
    resolve: (d: ChannelDetail) => void
    reject: (e: Error) => void
    deadline: number
  }>>([])

  const fetchChannelDetail = useCallback(
    (channel: string, timeoutMs = 6000): Promise<ChannelDetail> => {
      return new Promise((resolve, reject) => {
        channelDetailQueue.current.push({
          channel,
          resolve,
          reject,
          deadline: Date.now() + timeoutMs,
        })
        send({ type: 'get_channel', data: { channel } })
        // Sweep stale entries opportunistically so a never-arriving
        // response doesn't leak the slot indefinitely.
        window.setTimeout(() => {
          const now = Date.now()
          channelDetailQueue.current = channelDetailQueue.current.filter(item => {
            if (item.deadline > now) return true
            item.reject(new Error(`get_channel ${item.channel} timed out`))
            return false
          })
        }, timeoutMs + 100)
      })
    },
    [send],
  )

  const clearCurrentChannel = useCallback(() => {
    setState(s => ({ ...s, currentChannel: null }))
  }, [])

  const fetchUser = useCallback((name: string) => {
    setState(s => ({ ...s, loading: true, currentUser: null }))
    send({ type: 'get_user', data: { name } })
  }, [send])

  const clearCurrentUser = useCallback(() => {
    setState(s => ({ ...s, currentUser: null }))
  }, [])

  // CRUD: Users
  const addUser = useCallback((name: string, host?: string) => {
    send({ type: 'add_user', data: { name, host } })
    logLocalAction('add_user', name, host)
  }, [send])

  const delUser = useCallback((name: string) => {
    send({ type: 'del_user', data: { name } })
    logLocalAction('del_user', name)
  }, [send])

  const setUserFlags = useCallback((name: string, flags: string, channel?: string) => {
    send({ type: 'set_user_flags', data: { name, flags, channel } })
    logLocalAction('set_flags', channel ? `${name} · ${channel}` : name, flags)
  }, [send])

  const setUserPass = useCallback((name: string, password: string) => {
    send({ type: 'set_user_pass', data: { name, password } })
    logLocalAction('set_pass', name)
  }, [send])

  const addHost = useCallback((name: string, host: string) => {
    send({ type: 'add_host', data: { name, host } })
    logLocalAction('add_host', name, host)
  }, [send])

  const delHost = useCallback((name: string, host: string) => {
    send({ type: 'del_host', data: { name, host } })
    logLocalAction('del_host', name, host)
  }, [send])

  // Address (+addr / -addr) — IP-class entries in userlist, distinct from
  // host masks. WebAPI has no dedicated endpoint for these so we route
  // through partyline. The hub broadcasts a `# <owner> # +addr ...`
  // confirmation so audit log + freshness still trigger; we re-fetch the
  // selected user after a brief delay so the Addresses tab shows the new
  // entry without forcing a manual refresh.
  const addAddr = useCallback((name: string, ip: string) => {
    send({ type: 'command', data: { cmd: `+addr ${name} ${ip}` } })
    logLocalAction('add_addr' as never, name, ip)
    window.setTimeout(() => {
      send({ type: 'get_user', data: { name } })
    }, 350)
  }, [send])

  const delAddr = useCallback((name: string, ip: string) => {
    send({ type: 'command', data: { cmd: `-addr ${name} ${ip}` } })
    logLocalAction('del_addr' as never, name, ip)
    window.setTimeout(() => {
      send({ type: 'get_user', data: { name } })
    }, 350)
  }, [send])

  // User metadata (+info / -info) — runs through partyline since WebAPI
  // doesn't expose a dedicated CRUD endpoint for user info entries.
  // After mutating, re-fetch the user so UserDetail reflects the change.
  const addUserInfo = useCallback((name: string, key: string, value: string) => {
    send({ type: 'command', data: { cmd: `+info ${name} ${key} ${value}` } })
    logLocalAction('add_host', `${name} · ${key}`, value)
    window.setTimeout(() => send({ type: 'get_user', data: { name } }), 400)
  }, [send])

  const delUserInfo = useCallback((name: string, key: string) => {
    send({ type: 'command', data: { cmd: `-info ${name} ${key}` } })
    logLocalAction('del_host', `${name} · ${key}`)
    window.setTimeout(() => send({ type: 'get_user', data: { name } }), 400)
  }, [send])

  // CRUD: Bots
  //
  // Mirrors the partyline-side workflow for adding a bot:
  //   .+bot <name> <ip>          → structured `add_bot`
  //   .chattr <name> +<l|s|h|w>  → structured `set_user_flags` (bot type)
  //   .chpass <name> <password>  → structured `set_user_pass`  (link password)
  //
  // The hub processes the three messages in order on the same connection, so a
  // failure on `add_bot` (duplicate handle, bad IP, no perms) short-circuits
  // the follow-ups via the userlist not yet containing the handle.
  const addBot = useCallback(
    (
      name: string,
      ip: string,
      opts?: { typeFlag?: 'l' | 's' | 'h'; password?: string },
    ) => {
      send({ type: 'add_bot', data: { name, ip } })
      if (opts?.typeFlag) {
        send({
          type: 'set_user_flags',
          data: { name, flags: `+${opts.typeFlag}` },
        })
      }
      if (opts?.password) {
        send({ type: 'set_user_pass', data: { name, password: opts.password } })
      }
      const detail = opts?.typeFlag
        ? `${ip} · +${opts.typeFlag}${opts.password ? ' · pass' : ''}`
        : ip
      logLocalAction('add_bot', name, detail)
    },
    [send],
  )

  const delBot = useCallback((name: string) => {
    send({ type: 'del_bot', data: { name } })
    logLocalAction('del_bot', name)
  }, [send])

  // CRUD: Channels
  const addChan = useCallback((channel: string, key?: string) => {
    send({ type: 'add_chan', data: { channel, key } })
    logLocalAction('add_chan', channel, key)
  }, [send])

  const delChan = useCallback((channel: string) => {
    send({ type: 'del_chan', data: { channel } })
    logLocalAction('del_chan', channel)
  }, [send])

  const setChanset = useCallback((channel: string, variable: string, value: string) => {
    send({ type: 'set_chanset', data: { channel, var: variable, value } })
    logLocalAction('chset', `${channel} · ${variable}`, value)
  }, [send])

  // CRUD: Protlists
  const addProtlist = useCallback((listType: string, mask: string, channel?: string, reason?: string, time?: number) => {
    send({ type: 'add_protlist', data: { list_type: listType, mask, channel, reason, expires: time } })
    const action = `add_${listType}` as AuditAction
    const target = channel ? `${channel} · ${mask}` : mask
    const detail = [reason, time ? `expires in ${Math.round(time / 60)}m` : undefined].filter(Boolean).join(' · ')
    logLocalAction(action, target, detail || undefined)
  }, [send])

  const delProtlist = useCallback((listType: string, mask: string, channel?: string) => {
    send({ type: 'del_protlist', data: { list_type: listType, mask, channel } })
    const action = `del_${listType}` as AuditAction
    const target = channel ? `${channel} · ${mask}` : mask
    logLocalAction(action, target)
  }, [send])

  // IRC servers — fetched through the WebSocket proxy (no HTTP /api required)
  const fetchIrcServers = useCallback((refresh = false) => {
    setState(s => ({ ...s, ircnetLoading: true, ircnetError: null }))
    send({ type: 'fetch_ircnet', refresh })
  }, [send])

  // Keep messagesRef in sync with state.messages for async callbacks
  // that need to poll the latest partyline output.
  useEffect(() => { messagesRef.current = state.messages }, [state.messages])

  useEffect(() => {
    let isMounted = true
    let socket: WebSocket | null = null

    const scheduleReconnect = () => {
      const delay = Math.min(
        RECONNECT_BASE * Math.pow(2, reconnectAttempt.current),
        RECONNECT_MAX
      )
      reconnectAttempt.current++
      reconnectTimer.current = window.setTimeout(connect, delay)
    }

    const connect = () => {
      if (!isMounted) return

      socket = new WebSocket(wsUrl)
      ws.current = socket

      socket.onopen = () => {
        if (!isMounted) return
        // Reset backoff on successful connection
        const wasReconnecting = reconnectAttempt.current > 0
        reconnectAttempt.current = 0
        setState(s => ({ ...s, connected: true, reconnecting: false, error: null }))

        if (wasReconnecting && hadConnection.current) {
          toast('success', tRef.current('ws.reconnectedOk'))
        }
        hadConnection.current = true

        // Try to authenticate with saved token
        const token = localStorage.getItem(SESSION_TOKEN_KEY)
        if (token && socket) {
          socket.send(JSON.stringify({ type: 'auth_token', data: { token } }))
        }
      }

      socket.onclose = () => {
        if (!isMounted) return
        if (intentionalClose.current) {
          intentionalClose.current = false
          return
        }
        setState(s => ({
          ...s,
          connected: false,
          reconnecting: hadConnection.current,
        }))
        scheduleReconnect()
      }

      socket.onerror = () => {
        // handled by onclose
      }

      socket.onmessage = (event) => {
        if (!isMounted) return

        const data = event.data as string

        if (!data || !data.trim()) return

        if (data.startsWith('{')) {
          try {
            const msg = JSON.parse(data)
            handleMessage(msg)
          } catch {
            // malformed JSON — ignore
          }
        } else {
          const match = data.match(/^\[(\d{2}:\d{2})\]\s*(.*)$/)
          const text = match ? match[2] : data
          if (text) {
            // Drop expired silent patterns and check if this line matches
            // any active one — hidden lines stay in the array for parsers,
            // but render-side components filter on `hidden`.
            const now = Date.now()
            silentPatterns.current = silentPatterns.current.filter(p => p.until > now)
            const hidden = silentPatterns.current.some(p => p.regex.test(text))
            const msg = {
              from: '[hub]',
              text,
              time: new Date(),
              system: true,
              hidden,
            }
            // Feed audit log: any "# owner # action ..." broadcast is captured
            ingestBroadcasts([msg])
            setState(s => ({
              ...s,
              messages: appendMessage(s.messages, msg),
            }))
          }
        }
      }
    }

    const crudI18nKeys: Record<string, string> = {
      add_user_ok: 'crud.userAdded',
      del_user_ok: 'crud.userDeleted',
      set_user_flags_ok: 'crud.flagsUpdated',
      set_user_pass_ok: 'crud.passwordSet',
      add_host_ok: 'crud.hostAdded',
      del_host_ok: 'crud.hostRemoved',
      add_bot_ok: 'crud.botAdded',
      del_bot_ok: 'crud.botDeleted',
      add_chan_ok: 'crud.channelAdded',
      del_chan_ok: 'crud.channelDeleted',
      set_chanset_ok: 'crud.settingsSaved',
      add_protlist_ok: 'crud.entryAdded',
      del_protlist_ok: 'crud.entryRemoved',
    }

    const crudToast = (type: string) => {
      const i18nKey = crudI18nKeys[type]
      const label = i18nKey ? tRef.current(i18nKey) : type.replace('_ok', '').replace(/_/g, ' ')
      toast('success', label)
      setState(s => ({
        ...s,
        messages: appendMessage(s.messages, {
          from: '[system]',
          text: `✓ ${label}`,
          time: new Date(),
          system: true,
        }),
      }))
    }

    const handleMessage = (msg: { type: string; data?: Record<string, unknown> }) => {
      switch (msg.type) {
        case 'auth_ok':
          // Save session token if provided
          if (msg.data?.token) {
            localStorage.setItem(SESSION_TOKEN_KEY, msg.data.token as string)
            if (msg.data?.handle) {
              localStorage.setItem(SESSION_HANDLE_KEY, msg.data.handle as string)
            }
          }
          setState(s => ({
            ...s,
            authenticated: true,
            handle: (msg.data?.handle as string) || null,
            globalFlags: (msg.data?.flags as number) || 0,
            error: null,
            partylineUsers: [],
            messages: [],
          }))
          break

        case 'auth_fail':
          // Clear any saved token on auth failure
          localStorage.removeItem(SESSION_TOKEN_KEY)
          localStorage.removeItem(SESSION_HANDLE_KEY)
          setState(s => ({
            ...s,
            authenticated: false,
            handle: null,
            error: (msg.data?.reason as string) || 'Authentication failed',
          }))
          break

        case 'logout_ok':
          // Server confirmed logout
          localStorage.removeItem(SESSION_TOKEN_KEY)
          localStorage.removeItem(SESSION_HANDLE_KEY)
          setState(s => ({
            ...s,
            authenticated: false,
            handle: null,
          }))
          break

        case 'error': {
          const errMsg = (msg.data?.message as string) || (msg.data?.code as string) || 'Error'
          const errCode = (msg.data?.code as string) || ''
          // Filter out "Unknown message type" errors caused by an un-restarted
          // proxy forwarding proxy-only message types (fetch_ircnet, probe_*)
          // to the hub. The feature still works once the proxy is updated,
          // and surfacing a scary red toast for this is confusing.
          const isProxyRestartNeeded =
            errCode === 'UNKNOWN_TYPE' ||
            /unknown message type/i.test(errMsg)
          if (isProxyRestartNeeded) {
            // Silently record for diagnostics but don't toast or set error
            setState(s => ({
              ...s,
              messages: appendMessage(s.messages, {
                from: '[hub]',
                text: `Note: ${errMsg} — proxy may need restart for new features`,
                time: new Date(),
                system: true,
                hidden: true, // don't flood the console
              }),
            }))
            break
          }
          toast('error', errMsg)
          setState(s => ({
            ...s,
            error: errMsg,
            loading: false,
            messages: appendMessage(s.messages, {
              from: '[error]',
              text: errMsg,
              time: new Date(),
              system: true,
            }),
          }))
          break
        }

        case 'init':
          setState(s => ({
            ...s,
            partylineUsers: (msg.data?.users as PartylineUser[]) || [],
          }))
          break

        case 'list_channels':
          setState(s => ({
            ...s,
            channels: (msg.data?.channels as Channel[]) || [],
            channelsFetchedAt: Date.now(),
            loading: false,
          }))
          break

        case 'list_users':
          setState(s => ({
            ...s,
            users: (msg.data?.users as UserType[]) || [],
            usersFetchedAt: Date.now(),
            loading: false,
          }))
          break

        case 'list_bots': {
          // Drop any entry whose name doesn't look like a valid handle.
          // The hub shouldn't ever emit garbage here, but defending the
          // boundary keeps stale rows out of the UI if the C++ side
          // later regresses or a proxy mangles a frame.
          const fresh = ((msg.data?.bots as BotType[]) || []).filter(b => isValidHandle(b?.name))
          setState(s => {
            const freshNames = new Set(fresh.map(b => b.name))
            const offlineKept = s.bots.filter(b => !b.online && !freshNames.has(b.name))
            return { ...s, bots: [...fresh, ...offlineKept], botsFetchedAt: Date.now(), loading: false }
          })
          break
        }

        case 'get_channel': {
          const detail = msg.data as unknown as ChannelDetail
          // Resolve a queued fetchChannelDetail() request first (if any).
          // We always also publish to currentChannel so an aggregate-view
          // refresh doesn't leave the singular ChannelDetail screen blank
          // — last-write-wins is acceptable here since users don't
          // navigate the two views at the same time.
          if (detail?.name) {
            const idx = channelDetailQueue.current.findIndex(
              q => q.channel === detail.name && q.deadline > Date.now(),
            )
            if (idx !== -1) {
              const [item] = channelDetailQueue.current.splice(idx, 1)
              item.resolve(detail)
            }
          }
          setState(s => ({
            ...s,
            currentChannel: detail,
            loading: false,
          }))
          break
        }

        case 'ircnet_servers':
          setState(s => ({
            ...s,
            ircnet: msg.data as unknown as IrcnetData,
            ircnetLoading: false,
            ircnetError: null,
          }))
          break

        case 'ircnet_error':
          setState(s => ({
            ...s,
            ircnetLoading: false,
            ircnetError: (msg.data?.detail as string) || (msg.data?.error as string) || 'fetch failed',
          }))
          break

        case 'get_user':
          setState(s => ({
            ...s,
            currentUser: msg.data as unknown as UserDetail,
            loading: false,
          }))
          break

        case 'bot_join': {
          const name = msg.data?.name as string
          if (!isValidHandle(name)) break
          setState(s => {
            // Only notify / log on transitions the user can recognise as
            // "back online" — skip when the bot wasn't known yet (initial
            // discovery) or was already online (idempotent broadcast).
            const prev = s.bots.find(b => b.name === name)
            const wasKnownOffline = prev !== undefined && prev.online === false
            if (wasKnownOffline) {
              notify('bot_online', name, `Bot ${name} is back online`, { tag: `bot:${name}` })
            }
            const nextBots = [
              ...s.bots.filter(b => b.name !== name),
              {
                name,
                nick: msg.data?.nick as string || '',
                server: msg.data?.server as string || '',
                online: true,
              },
            ]
            // Surface transition in the activity feed so Overview shows
            // movement when bots come back. Skip first-discovery so the
            // feed isn't flooded on every page load.
            if (wasKnownOffline) {
              const server = (msg.data?.server as string) || ''
              return {
                ...s,
                bots: nextBots,
                messages: appendMessage(s.messages, {
                  from: '[system]',
                  text: server ? `Bot ${name} connected (${server})` : `Bot ${name} connected`,
                  time: new Date(),
                  system: true,
                }),
              }
            }
            return { ...s, bots: nextBots }
          })
          break
        }

        case 'bot_quit': {
          // Don't remove — mark offline so the panel keeps showing the
          // full fleet (Bots tab used to show only currently-online bots
          // because this handler filtered them out).
          const name = msg.data?.name as string
          if (!isValidHandle(name)) break
          setState(s => {
            const prev = s.bots.find(b => b.name === name)
            const wasOnline = prev?.online === true
            if (wasOnline) {
              const reason = (msg.data?.reason as string) || 'disconnected'
              notify('bot_offline', name, `Bot ${name} went offline: ${reason}`, { tag: `bot:${name}` })
            }
            const nextBots = s.bots.map(b =>
              b.name === name ? { ...b, online: false } : b,
            )
            if (wasOnline) {
              const reason = (msg.data?.reason as string) || 'disconnected'
              return {
                ...s,
                bots: nextBots,
                messages: appendMessage(s.messages, {
                  from: '[system]',
                  text: `Bot ${name} disconnected (${reason})`,
                  time: new Date(),
                  system: true,
                }),
              }
            }
            return { ...s, bots: nextBots }
          })
          break
        }

        case 'bot_nick': {
          const name = msg.data?.name as string
          if (!isValidHandle(name)) break
          setState(s => ({
            ...s,
            bots: s.bots.map(b =>
              b.name === name
                ? { ...b, nick: msg.data?.nick as string || '', server: msg.data?.server as string || '' }
                : b
            ),
          }))
          break
        }

        case 'user_join':
          setState(s => {
            const handle = msg.data?.handle as string
            if (s.partylineUsers.some(u => u.handle === handle)) {
              return s
            }
            return {
              ...s,
              partylineUsers: [...s.partylineUsers, { handle, online: true }],
              messages: appendMessage(s.messages, {
                from: '[system]',
                text: `${handle} joined`,
                time: new Date(),
                system: true,
              }),
            }
          })
          break

        case 'user_quit':
          setState(s => ({
            ...s,
            partylineUsers: s.partylineUsers.filter(u => u.handle !== msg.data?.handle),
            messages: appendMessage(s.messages, {
              from: '[system]',
              text: `${msg.data?.handle} left`,
              time: new Date(),
              system: true,
            }),
          }))
          break

        case 'user_chat': {
          const from = msg.data?.handle as string || '[unknown]'
          const text = msg.data?.text as string || ''
          setState(s => {
            // Don't notify on our own chat.
            if (from !== s.handle) {
              const trigger = matchMention(text, s.handle)
              if (trigger) {
                notify('mention', `${from} mentioned ${trigger}`, text, { tag: `chat:${from}` })
              }
            }
            return {
              ...s,
              messages: appendMessage(s.messages, {
                from,
                text,
                time: new Date(),
              }),
            }
          })
          break
        }

        case 'cmd_ok':
        case 'pong':
          break

        // Live updates from partyline changes
        case 'user_changed':
          // Refresh user list when a user's flags/hosts change
          send({ type: 'list_users' })
          break

        case 'channel_changed':
          // Refresh channels and current channel if viewing it
          send({ type: 'list_channels' })
          if (msg.data?.channel) {
            send({ type: 'get_channel', data: { channel: msg.data.channel } })
          }
          break

        case 'protlist_changed':
          // Refresh current channel if viewing it
          if (msg.data?.channel && msg.data.channel !== '*') {
            send({ type: 'get_channel', data: { channel: msg.data.channel } })
          } else {
            // Global protlist changed - refresh current channel if any
            send({ type: 'list_channels' })
          }
          break

        case 'userlist_changed':
          // Refresh user list when users added/removed
          send({ type: 'list_users' })
          break

        // CRUD success responses - refresh data + toast
        case 'add_user_ok':
        case 'del_user_ok':
          send({ type: 'list_users' })
          crudToast(msg.type)
          break

        case 'set_user_flags_ok':
        case 'set_user_pass_ok':
        case 'add_host_ok':
        case 'del_host_ok':
          send({ type: 'list_users' })
          // Re-fetch current user if it's the one being modified
          if (msg.data?.name) {
            send({ type: 'get_user', data: { name: msg.data.name } })
          }
          crudToast(msg.type)
          break

        case 'add_bot_ok':
        case 'del_bot_ok':
          send({ type: 'list_bots' })
          discoverOfflineBots()
          crudToast(msg.type)
          break

        case 'add_chan_ok':
        case 'del_chan_ok':
          send({ type: 'list_channels' })
          crudToast(msg.type)
          break

        case 'set_chanset_ok':
        case 'add_protlist_ok':
        case 'del_protlist_ok':
          // Refresh current channel if viewing one
          setState(s => {
            if (s.currentChannel) {
              send({ type: 'get_channel', data: { channel: s.currentChannel.name } })
            }
            return s
          })
          crudToast(msg.type)
          break

        default:
          break
      }
    }

    connect()

    return () => {
      isMounted = false
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
        reconnectTimer.current = null
      }
      if (socket) {
        socket.close()
      }
    }
  }, [wsUrl])

  return {
    ...state,
    login,
    sendCommand,
    sendCommandSilent,
    sendChat,
    logout,
    fetchChannels,
    fetchUsers,
    fetchBots,
    fetchChannel,
    fetchChannelDetail,
    fetchAllBotPresence,
    clearCurrentChannel,
    fetchUser,
    clearCurrentUser,
    // CRUD: Users
    addUser,
    delUser,
    setUserFlags,
    setUserPass,
    addHost,
    delHost,
    addAddr,
    delAddr,
    addUserInfo,
    delUserInfo,
    // CRUD: Bots
    addBot,
    delBot,
    // CRUD: Channels
    addChan,
    delChan,
    setChanset,
    // CRUD: Protlists
    addProtlist,
    delProtlist,
    queryGlobalProtlists,
    // IRC servers
    fetchIrcServers,
  }
}
