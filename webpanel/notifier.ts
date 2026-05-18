/**
 * Phantom Telegram notifier
 *
 * Standalone Bun process that connects to the hub TCP WebAPI as a service
 * user, watches for events of interest (bot joins, bot quits, auth failures)
 * and forwards them to a Telegram chat via the Bot API.
 *
 * Designed to be deployable independently of `proxy.ts`. Both can run on
 * the same host; proxy keeps the panel alive,
 * notifier keeps Telegram alive — failure of one does not affect the other.
 *
 * ─── Setup checklist ────────────────────────────────────────────────────
 *
 * 1. Create the Telegram bot
 *    @BotFather -> /newbot. Save the token from BotFather's reply.
 *
 * 2. Create a Telegram group or channel for alerts
 *    Add the bot as admin (so it can post). Send any message in the
 *    group, then visit
 *      https://api.telegram.org/bot<TOKEN>/getUpdates
 *    The chat object's `id` (negative number, starts with -100…) is the
 *    group's chat_id.
 *
 * 3. Create a service handle on the hub for the notifier
 *    From any owner partyline session:
 *      .+user tgnotifier
 *      .chpass tgnotifier <random-strong-password>
 *      .chattr tgnotifier +PN
 *      .+addr tgnotifier 127.0.0.1     (or whichever IP this script runs from)
 *    +P allows WebAPI/partyline auth; +N allows notify/monitoring reads.
 *    Do NOT give +s/+x; the notifier only needs to listen.
 *
 * 4. Configure environment (`.env` or systemd EnvironmentFile)
 *      HUB_HOST=127.0.0.1
 *      HUB_PORT=5555
 *      HUB_SSL=false
 *      HUB_HANDLE=tgnotifier
 *      HUB_PASSWORD=<the password from step 3>
 *      TELEGRAM_BOT_TOKEN=<token from step 1>
 *      TELEGRAM_CHAT_ID=<chat_id from step 2>
 *      PANEL_URL=https://panel.example.com
 *    `chmod 600` the file. Token leak = anyone can post as the bot.
 *
 * 5. Run
 *      cd /opt/phantom/webpanel && bun run notifier
 *    or as a systemd unit (example below):
 *
 *      [Unit]
 *      Description=Phantom Telegram notifier
 *      After=network-online.target
 *
 *      [Service]
 *      Type=simple
 *      User=phantom
 *      WorkingDirectory=/opt/phantom/webpanel
 *      EnvironmentFile=/opt/phantom/webpanel/.env.notifier
 *      ExecStart=/usr/local/bin/bun run notifier.ts
 *      Restart=on-failure
 *      RestartSec=5s
 *
 *      [Install]
 *      WantedBy=multi-user.target
 *
 * On startup the notifier posts a one-line "online" message (silent) so
 * you know the pipe works without spamming your phone every restart.
 */

const env = {
  HUB_HOST:           process.env.HUB_HOST           ?? '127.0.0.1',
  HUB_PORT:           parseInt(process.env.HUB_PORT  ?? '5555', 10),
  HUB_SSL:            process.env.HUB_SSL === 'true',
  HUB_HANDLE:         process.env.HUB_HANDLE         ?? 'tgnotifier',
  HUB_PASSWORD:       process.env.HUB_PASSWORD       ?? '',
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ?? '',
  TELEGRAM_CHAT_ID:   process.env.TELEGRAM_CHAT_ID   ?? '',
  PANEL_URL:          process.env.PANEL_URL          ?? '',
  STATUS_FILE:        process.env.NOTIFIER_STATUS_FILE ?? '.notifier-status.json',
}

// Validate the bare-minimum config — the rest defaults sensibly.
const missing: string[] = []
if (!env.HUB_PASSWORD)       missing.push('HUB_PASSWORD')
if (!env.TELEGRAM_BOT_TOKEN) missing.push('TELEGRAM_BOT_TOKEN')
if (!env.TELEGRAM_CHAT_ID)   missing.push('TELEGRAM_CHAT_ID')
if (missing.length > 0) {
  console.error(`[notifier] Missing required env: ${missing.join(', ')}`)
  console.error('[notifier] See the comment header in notifier.ts for the setup checklist.')
  process.exit(1)
}

// ─── Telegram dispatcher ──────────────────────────────────────────────────

type SendOptions = {
  /** When true, recipients won't get an audible/buzz notification.
   *  Used for our "online" heartbeat so it doesn't wake anyone. */
  silent?: boolean
}

let sendInFlight = Promise.resolve()

/** Serialize Telegram sends — the API rate-limits at ~30/sec globally
 *  and we'd rather not race ourselves. Errors are logged, never thrown. */
function sendTelegram(text: string, opts: SendOptions = {}): Promise<void> {
  sendInFlight = sendInFlight.then(async () => {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: env.TELEGRAM_CHAT_ID,
            text,
            disable_notification: !!opts.silent,
            // Newer Bot API name; ignored by older instances.
            link_preview_options: { is_disabled: true },
          }),
        },
      )
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        console.error(`[notifier] Telegram ${res.status}:`, body.slice(0, 200))
      }
    } catch (e) {
      console.error('[notifier] Telegram send failed:', (e as Error).message)
    }
  })
  return sendInFlight
}

function tsLine(): string {
  const d = new Date()
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function panelLink(path: string): string {
  if (!env.PANEL_URL) return ''
  return `\nOpen panel: ${env.PANEL_URL}${path}`
}

// ─── Event state + handlers ───────────────────────────────────────────────

type BotState = { online: boolean; lastQuitReason?: string }
const knownBots = new Map<string, BotState>()
let hubConnected = false
let hubAuthenticated = false
let lastError: string | null = null
const startedAt = new Date().toISOString()

function writeStatus(extra: Record<string, unknown> = {}) {
  const body = {
    service: 'phantom-webpanel-notifier',
    started_at: startedAt,
    updated_at: new Date().toISOString(),
    connected: hubConnected,
    authenticated: hubAuthenticated,
    handle: env.HUB_HANDLE,
    seeded_bots: knownBots.size,
    last_error: lastError,
    ...extra,
  }
  Bun.write(env.STATUS_FILE, JSON.stringify(body, null, 2) + '\n').catch(e => {
    console.error('[notifier] Status write failed:', (e as Error).message)
  })
}

/** Auth-fail brute detector: per-IP rolling window of failure timestamps.
 *  Fires once at threshold; resets after silence so you don't get spammed
 *  by a script that never gives up. */
const AUTH_FAIL_WINDOW_MS = 5 * 60 * 1000
const AUTH_FAIL_THRESHOLD = 3
const authFailTimes = new Map<string, number[]>()
const authFailNotified = new Set<string>()

function noteAuthFail(ip: string) {
  const now = Date.now()
  const times = (authFailTimes.get(ip) ?? []).filter(t => now - t < AUTH_FAIL_WINDOW_MS)
  times.push(now)
  authFailTimes.set(ip, times)

  if (times.length >= AUTH_FAIL_THRESHOLD && !authFailNotified.has(ip)) {
    authFailNotified.add(ip)
    sendTelegram(
      `⚠️ Possible brute-force\n` +
      `${times.length} auth failures from ${ip} in ${AUTH_FAIL_WINDOW_MS / 60000} min` +
      panelLink('/#/audit'),
    )
  }
  // Cooldown — clear the "notified" flag once the IP has been quiet for a
  // full window. Lets us re-fire if they come back later.
  if (times.length === 0) {
    authFailNotified.delete(ip)
  }
}

/** Cleanup stale auth-fail entries every minute so the maps don't grow
 *  unbounded on long-running deployments. */
setInterval(() => {
  const now = Date.now()
  for (const [ip, times] of authFailTimes) {
    const fresh = times.filter(t => now - t < AUTH_FAIL_WINDOW_MS)
    if (fresh.length === 0) {
      authFailTimes.delete(ip)
      authFailNotified.delete(ip)
    } else {
      authFailTimes.set(ip, fresh)
    }
  }
}, 60_000).unref?.()

// ─── Hub event router ─────────────────────────────────────────────────────

interface HubEvent {
  type: string
  data?: Record<string, unknown>
}

function handleJsonEvent(ev: HubEvent) {
  switch (ev.type) {
    case 'auth_ok': {
      console.log(`[notifier] Authenticated as ${env.HUB_HANDLE}`)
      hubAuthenticated = true
      lastError = null
      writeStatus()
      // Seed the bot state by asking for the current list. The seed pass
      // does NOT notify — only subsequent transitions do.
      writeLine({ type: 'list_bots' })
      sendTelegram(`🟢 Phantom notifier online · ${tsLine()}`, { silent: true })
      break
    }

    case 'auth_fail': {
      const reason = (ev.data?.reason as string) ?? 'unknown'
      console.error(`[notifier] Auth failed:`, reason)
      hubAuthenticated = false
      lastError = `auth failed: ${reason}`
      writeStatus()
      // Don't post auth failures of our OWN handle — that'd be confusing.
      // Just exit so systemd restart logic can pick up the misconfiguration.
      process.exit(1)
      break
    }

    case 'list_bots': {
      const bots = (ev.data?.bots as Array<{ name: string; online?: boolean }>) ?? []
      for (const b of bots) {
        if (!knownBots.has(b.name)) {
          knownBots.set(b.name, { online: !!b.online })
        }
      }
      console.log(`[notifier] Seeded ${knownBots.size} bots`)
      writeStatus()
      break
    }

    case 'bot_join': {
      const name = ev.data?.name as string
      if (!name) break
      const prev = knownBots.get(name)
      const wasOffline = prev !== undefined && prev.online === false
      knownBots.set(name, { online: true })
      if (wasOffline) {
        const reason = prev?.lastQuitReason ?? 'unknown'
        sendTelegram(
          `✅ Bot ${name} is back online\n` +
          `was offline (${reason})\n` +
          tsLine() +
          panelLink(`/#/bots`),
        )
      }
      break
    }

    case 'bot_quit': {
      const name = ev.data?.name as string
      const reason = (ev.data?.reason as string) ?? 'disconnected'
      if (!name) break
      const prev = knownBots.get(name)
      knownBots.set(name, { online: false, lastQuitReason: reason })
      if (prev?.online) {
        sendTelegram(
          `❌ Bot ${name} disconnected\n` +
          `${reason}\n` +
          tsLine() +
          panelLink(`/#/bots`),
        )
      }
      break
    }

    // We don't currently surface bot_nick / user_chat / list_users etc.
    // — too gossipy for an alert channel. Add cases here if needed.
  }
}

// Some events arrive as plain text broadcasts rather than JSON; these are
// the `net.send(HAS_N, "...")` lines from class-* code.
function handleTextBroadcast(line: string) {
  // Auth-fail brute detection. The webapi side logs failed auths via
  // a text broadcast that includes the source IP.
  const failMatch = line.match(/auth.*fail.*from[: ]+(\d+\.\d+\.\d+\.\d+)/i)
  if (failMatch) {
    noteAuthFail(failMatch[1])
  }
}

// ─── TCP wire layer ───────────────────────────────────────────────────────

let socket: Bun.Socket | null = null
let buf = ''
let reconnectAttempt = 0
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

function writeLine(obj: object) {
  if (!socket) return
  try {
    socket.write(JSON.stringify(obj) + '\n')
  } catch (e) {
    console.error('[notifier] Write failed:', (e as Error).message)
  }
}

function processLine(line: string) {
  if (!line.trim()) return
  if (line.startsWith('{')) {
    try {
      handleJsonEvent(JSON.parse(line) as HubEvent)
    } catch {
      /* malformed JSON — skip */
    }
  } else {
    // Hub may prefix broadcasts with [HH:MM] timestamp; strip it for matching.
    const m = line.match(/^\[(\d{2}:\d{2})\]\s*(.*)$/)
    handleTextBroadcast(m ? m[2] : line)
  }
}

function connect() {
  console.log(`[notifier] Connecting to ${env.HUB_HOST}:${env.HUB_PORT}${env.HUB_SSL ? ' (TLS)' : ''}`)
  Bun.connect({
    hostname: env.HUB_HOST,
    port: env.HUB_PORT,
    tls: env.HUB_SSL ? { rejectUnauthorized: false } : false,
    socket: {
      open(s) {
        console.log('[notifier] TCP open — authenticating')
        socket = s
        hubConnected = true
        hubAuthenticated = false
        lastError = null
        writeStatus()
        reconnectAttempt = 0
        s.write(
          JSON.stringify({
            type: 'auth',
            data: { handle: env.HUB_HANDLE, password: env.HUB_PASSWORD },
          }) + '\n',
        )
      },
      data(_s, data) {
        buf += data.toString()
        let nl: number
        while ((nl = buf.indexOf('\n')) !== -1) {
          const line = buf.slice(0, nl)
          buf = buf.slice(nl + 1)
          processLine(line)
        }
      },
      close() {
        console.log('[notifier] TCP closed')
        socket = null
        hubConnected = false
        hubAuthenticated = false
        writeStatus()
        scheduleReconnect()
      },
      error(_s, error) {
        console.error('[notifier] TCP error:', error.message ?? error)
        lastError = error.message ?? String(error)
        writeStatus()
      },
    },
  }).catch(err => {
    console.error('[notifier] Connect failed:', (err as Error).message)
    scheduleReconnect()
  })
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectAttempt++
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempt - 1), 30_000)
  console.log(`[notifier] Reconnecting in ${delay}ms (attempt #${reconnectAttempt})`)
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

// ─── Lifecycle ────────────────────────────────────────────────────────────

function shutdown(reason: string) {
  console.log(`[notifier] Shutting down: ${reason}`)
  if (reconnectTimer) clearTimeout(reconnectTimer)
  hubConnected = false
  hubAuthenticated = false
  writeStatus({ shutdown_reason: reason })
  // Best-effort silent goodbye so operators see when the service rotated;
  // don't await — we want to exit promptly.
  sendTelegram(`🟡 Phantom notifier offline · ${tsLine()}`, { silent: true })
  socket?.end()
  setTimeout(() => process.exit(0), 500)
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT',  () => shutdown('SIGINT'))

writeStatus()
setInterval(() => writeStatus(), 30_000).unref?.()
connect()
