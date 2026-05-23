/**
 * WebSocket to TCP Proxy for Phantom WebAPI
 *
 * Browser ←─ WS ─→ This Proxy ←─ TCP/JSON ─→ Hub (WebAPI)
 *
 * Usage: bun run proxy.ts
 * Config via environment variables:
 *   WS_PORT=8080       - WebSocket listen port
 *   HUB_HOST=127.0.0.1 - Hub TCP host
 *   HUB_PORT=5555      - Hub TCP port
 */

const WS_PORT = parseInt(process.env.WS_PORT || "8080");
const HUB_HOST = process.env.HUB_HOST || "127.0.0.1";
const HUB_PORT = parseInt(process.env.HUB_PORT || "5555");
const HUB_SSL = process.env.HUB_SSL === "true"; // SSL disabled by default for WebAPI
const PING_INTERVAL = 30000; // 30 seconds
const MAX_QUEUE_SIZE = parseInt(process.env.MAX_QUEUE_SIZE || "1000", 10);
const LOG_PAYLOADS = process.env.LOG_PAYLOADS === "true";
const NOTIFIER_UNIT = process.env.NOTIFIER_UNIT || "phantom-webpanel-notifier.service";
const NOTIFIER_ENV_FILE = process.env.NOTIFIER_ENV_FILE || `${process.cwd()}/.env.notifier`;
const NOTIFIER_STATUS_FILE = process.env.NOTIFIER_STATUS_FILE || `${process.cwd()}/.notifier-status.json`;
const NOTIFIER_STATUS_CACHE_MS = parseInt(process.env.NOTIFIER_STATUS_CACHE_MS || "5000", 10);

// Optional REST endpoint for unattended leaf bootstrap (POST /api/bot-add).
// Enabled only when all three env vars are set. The proxy itself talks to the
// hub as a service user — callers never see the hub credentials, only the
// shared API key.
const BOT_ADD_API_KEY = process.env.BOT_ADD_API_KEY || "";
const BOT_ADD_HUB_HANDLE = process.env.BOT_ADD_HUB_HANDLE || "";
const BOT_ADD_HUB_PASS = process.env.BOT_ADD_HUB_PASS || "";
const BOT_ADD_TIMEOUT_MS = parseInt(process.env.BOT_ADD_TIMEOUT_MS || "10000", 10);
const BOT_ADD_ENABLED = !!BOT_ADD_API_KEY && !!BOT_ADD_HUB_HANDLE && !!BOT_ADD_HUB_PASS;

function formatError(err: unknown) {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack,
    };
  }
  return { message: String(err) };
}

function log(level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    service: "phantom-webpanel-proxy",
    msg,
    ...meta,
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function redactSensitive(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (/token|password|secret|apikey|api_key|authorization/i.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = redactSensitive(nested);
      }
    }
    return out;
  }
  return value;
}

function previewMessage(data: string, maxLength = 120) {
  try {
    return JSON.stringify(redactSensitive(JSON.parse(data))).substring(0, maxLength);
  } catch {
    return data.substring(0, maxLength);
  }
}

function messageLogMeta(data: string, maxPreviewLength = 120) {
  const meta: Record<string, unknown> = { bytes: data.length };
  try {
    const parsed = JSON.parse(data) as { type?: unknown };
    if (typeof parsed.type === "string") {
      meta.type = parsed.type;
    }
  } catch {
    meta.type = "raw";
  }
  if (LOG_PAYLOADS) {
    meta.preview = previewMessage(data, maxPreviewLength);
  }
  return meta;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      ...(init.headers || {}),
    },
  });
}

function decodeBytes(bytes: Uint8Array) {
  return new TextDecoder().decode(bytes).trim();
}

function runStatusCommand(args: string[]) {
  const proc = Bun.spawnSync(args, {
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: proc.exitCode,
    stdout: decodeBytes(proc.stdout),
    stderr: decodeBytes(proc.stderr),
  };
}

function parseSystemctlShow(output: string) {
  const data: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    data[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return data;
}

async function readNotifierEnvSummary() {
  const data = await readNotifierEnvConfig();
  if (!data) {
    return { present: false, path: NOTIFIER_ENV_FILE };
  }

  const chatId = data.TELEGRAM_CHAT_ID || "";
  return {
    present: true,
    path: NOTIFIER_ENV_FILE,
    hub_host: data.HUB_HOST || null,
    hub_port: data.HUB_PORT || null,
    hub_ssl: data.HUB_SSL === "true",
    handle: data.HUB_HANDLE || null,
    panel_url: data.PANEL_URL || null,
    telegram_chat_id: chatId
      ? `${chatId.slice(0, Math.min(5, chatId.length))}…${chatId.slice(-4)}`
      : null,
    telegram_token_configured: !!data.TELEGRAM_BOT_TOKEN,
    hub_password_configured: !!data.HUB_PASSWORD,
  };
}

async function readNotifierEnvConfig() {
  const file = Bun.file(NOTIFIER_ENV_FILE);
  if (!(await file.exists())) {
    return null;
  }

  const data: Record<string, string> = {};
  const text = await file.text();
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    data[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return data;
}

async function readNotifierRuntimeStatus() {
  const file = Bun.file(NOTIFIER_STATUS_FILE);
  if (!(await file.exists())) return null;

  try {
    const data = await file.json() as {
      updated_at?: unknown;
      connected?: unknown;
      authenticated?: unknown;
      handle?: unknown;
      seeded_bots?: unknown;
      last_error?: unknown;
      started_at?: unknown;
    };
    return {
      path: NOTIFIER_STATUS_FILE,
      updated_at: typeof data.updated_at === "string" ? data.updated_at : null,
      started_at: typeof data.started_at === "string" ? data.started_at : null,
      connected: data.connected === true,
      authenticated: data.authenticated === true,
      handle: typeof data.handle === "string" ? data.handle : null,
      seeded_bots: typeof data.seeded_bots === "number" ? data.seeded_bots : null,
      last_error: typeof data.last_error === "string" ? data.last_error : null,
    };
  } catch (err) {
    log("warn", "notifier runtime status parse failed", { error: formatError(err) });
    return {
      path: NOTIFIER_STATUS_FILE,
      updated_at: null,
      started_at: null,
      connected: false,
      authenticated: false,
      handle: null,
      seeded_bots: null,
      last_error: "status parse failed",
    };
  }
}

async function getNotifierStatus() {
  const show = runStatusCommand([
    "systemctl",
    "show",
    NOTIFIER_UNIT,
    "--property=LoadState,ActiveState,SubState,UnitFileState,MainPID,ExecMainStartTimestamp,RestartUSec,NRestarts",
    "--no-page",
  ]);
  const props = show.code === 0 ? parseSystemctlShow(show.stdout) : {};
  const logs = runStatusCommand([
    "journalctl",
    "-u",
    NOTIFIER_UNIT,
    "-n",
    "12",
    "--no-pager",
    "-o",
    "cat",
  ]);

  const recentLogs = logs.code === 0
    ? logs.stdout.split("\n").filter(Boolean).slice(-12)
    : [];
  const runtime = await readNotifierRuntimeStatus();
  const runtimeFresh = runtime?.updated_at
    ? Date.now() - Date.parse(runtime.updated_at) < 90_000
    : false;
  const authenticated = !!runtimeFresh && runtime?.authenticated === true;

  return {
    unit: NOTIFIER_UNIT,
    installed: props.LoadState === "loaded",
    active: props.ActiveState === "active",
    state: props.ActiveState || "unknown",
    sub_state: props.SubState || "unknown",
    enabled: props.UnitFileState === "enabled",
    unit_file_state: props.UnitFileState || "unknown",
    main_pid: props.MainPID && props.MainPID !== "0" ? Number(props.MainPID) : null,
    started_at: props.ExecMainStartTimestamp || null,
    restarts: props.NRestarts ? Number(props.NRestarts) : 0,
    authenticated,
    connected: !!runtimeFresh && runtime?.connected === true,
    seeded_bots: typeof runtime?.seeded_bots === "number" ? runtime.seeded_bots : null,
    runtime,
    env: await readNotifierEnvSummary(),
    recent_logs: recentLogs,
    error: show.code === 0 ? null : (show.stderr || show.stdout || "systemctl failed"),
  };
}

let notifierStatusCache: { ts: number; data: unknown } | null = null;
let notifierStatusInFlight: Promise<unknown> | null = null;

async function getCachedNotifierStatus() {
  const now = Date.now();
  if (notifierStatusCache && now - notifierStatusCache.ts < NOTIFIER_STATUS_CACHE_MS) {
    return notifierStatusCache.data;
  }
  if (notifierStatusInFlight) {
    return notifierStatusInFlight;
  }

  notifierStatusInFlight = getNotifierStatus()
    .then(data => {
      notifierStatusCache = { ts: Date.now(), data };
      return data;
    })
    .finally(() => {
      notifierStatusInFlight = null;
    });
  return notifierStatusInFlight;
}

function bearerToken(req: Request) {
  const header = req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

type PanelTokenAuthResult = { ok: true; handle: string } | { ok: false; reason: string };

async function sendTelegramPanelMessage(text: string, sender: string) {
  const env = await readNotifierEnvConfig();
  if (!env?.TELEGRAM_BOT_TOKEN || !env?.TELEGRAM_CHAT_ID) {
    throw new Error("notifier Telegram config missing");
  }

  const message = `${text}\n\nsent by ${sender}`;
  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: message,
        link_preview_options: { is_disabled: true },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram HTTP ${res.status}: ${body.slice(0, 160)}`);
  }

  const body = await res.json().catch(() => null) as { ok?: boolean; description?: string } | null;
  if (!body?.ok) {
    throw new Error(body?.description || "Telegram rejected message");
  }
}

process.on("uncaughtException", err => {
  log("error", "uncaught exception", { error: formatError(err) });
  process.exit(1);
});

process.on("unhandledRejection", reason => {
  log("error", "unhandled rejection", { error: formatError(reason) });
  process.exit(1);
});

process.on("SIGTERM", () => {
  log("info", "received SIGTERM, shutting down");
  process.exit(0);
});

process.on("SIGINT", () => {
  log("info", "received SIGINT, shutting down");
  process.exit(0);
});

// IRCNet server list — cached server-side to avoid hammering the source
const IRCNET_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
// ircnet.info migrated to an Angular SPA — the old /servers HTML endpoint
// returns 404. Live server data now lives behind a JSON API served from a
// sister host. Override with IRCNET_API_URL if the endpoint moves again.
const IRCNET_API_URL = process.env.IRCNET_API_URL
  || "https://bot.ircnet.info/api/v2/serversByCountry";

type IrcServer = {
  host: string;
  port: number | null;
  region: string;
  users: number | null;
  max: number | null;
  ssl: boolean;
  open?: boolean;       // server's own "open" flag (policy, not reachability)
  sasl?: boolean;       // SASL auth supported
  version?: string;     // daemon version string
  serverInfo?: string;  // human-readable description
  lastSeen?: string;    // ISO timestamp of last heartbeat
};

let ircnetCache: { ts: number; data: IrcServer[] } | null = null;

/**
 * Fetch the public IRCNet server listing from bot.ircnet.info's JSON API.
 * This is the same endpoint that backs https://www.ircnet.info/servers
 * (the SPA pulls from it on page load). No auth; needs Origin/Referer
 * matching ircnet.info. Returns empty list on any failure — the caller
 * treats that as "source unavailable" and renders an empty-state banner
 * rather than substituting fabricated hosts.
 */
async function fetchIrcnetServers(): Promise<IrcServer[]> {
  let res: Response;
  try {
    res = await fetch(IRCNET_API_URL, {
      headers: {
        "user-agent": "phantom-panel/0.1",
        "accept": "application/json",
        "origin": "https://www.ircnet.info",
        "referer": "https://www.ircnet.info/",
      },
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    log("warn", "ircnet fetch error", { error: formatError(err) });
    return [];
  }

  if (!res.ok) {
    log("warn", "ircnet API returned non-OK response", { status: res.status });
    return [];
  }

  let payload: unknown;
  try {
    payload = await res.json();
  } catch (err) {
    log("warn", "ircnet JSON parse error", { error: formatError(err) });
    return [];
  }

  type RawServer = {
    serverName?: unknown;
    userCount?: unknown;
    version?: unknown;
    serverInfo?: unknown;
    lastSeen?: unknown;
    open?: unknown;
    sasl?: unknown;
  };
  type RawCountry = { countryCodeAlpha2?: unknown; serverList?: unknown };
  const p = payload as { countriesWithServers?: unknown };
  const countries = Array.isArray(p?.countriesWithServers)
    ? (p.countriesWithServers as RawCountry[]) : [];
  if (countries.length === 0) {
    log("warn", "ircnet API returned no countries");
    return [];
  }

  const servers: IrcServer[] = [];
  for (const c of countries) {
    const region = typeof c.countryCodeAlpha2 === "string" ? c.countryCodeAlpha2 : "";
    const list = Array.isArray(c.serverList) ? (c.serverList as RawServer[]) : [];
    for (const s of list) {
      const host = typeof s.serverName === "string" ? s.serverName.toLowerCase() : "";
      if (!host.includes(".")) continue;
      servers.push({
        host,
        port: null,
        region,
        users: typeof s.userCount === "number" ? s.userCount : null,
        max: null,
        ssl: false,
        open: typeof s.open === "boolean" ? s.open : undefined,
        sasl: typeof s.sasl === "boolean" ? s.sasl : undefined,
        version: typeof s.version === "string" ? s.version : undefined,
        serverInfo: typeof s.serverInfo === "string" ? s.serverInfo : undefined,
        lastSeen: typeof s.lastSeen === "string" ? s.lastSeen : undefined,
      });
    }
  }

  const seen = new Set<string>();
  const unique = servers.filter(s => {
    if (seen.has(s.host)) return false;
    seen.add(s.host);
    return true;
  });

  log("info", "ircnet API produced server list", {
    servers: unique.length,
    countries: countries.length,
  });
  return unique;
}

async function getIrcnetServers(forceRefresh = false): Promise<{
  servers: IrcServer[];
  cachedAt: number;
  source: "live" | "unavailable";
}> {
  const now = Date.now();
  if (!forceRefresh && ircnetCache && now - ircnetCache.ts < IRCNET_CACHE_TTL_MS) {
    return { servers: ircnetCache.data, cachedAt: ircnetCache.ts, source: "live" };
  }
  try {
    const fresh = await fetchIrcnetServers();
    if (fresh.length > 0) {
      ircnetCache = { ts: now, data: fresh };
      return { servers: fresh, cachedAt: now, source: "live" };
    }
  } catch (err) {
    log("error", "ircnet fetch unexpected error", { error: formatError(err) });
  }
  // No hand-rolled fallback. If the authoritative API is unreachable we
  // surface that honestly; panel shows a banner + empty state. Last
  // successful cache (if any) is retained by not clobbering ircnetCache.
  if (ircnetCache) {
    return { servers: ircnetCache.data, cachedAt: ircnetCache.ts, source: "live" };
  }
  return { servers: [], cachedAt: now, source: "unavailable" };
}

log("info", "starting WS to TCP proxy", { wsPort: WS_PORT });
log("info", "hub endpoint configured", { host: HUB_HOST, port: HUB_PORT, ssl: HUB_SSL });
log("info", "IRCNet source configured", { url: IRCNET_API_URL });

// Track active connections
type WSConnection = {
  tcpSocket: ReturnType<typeof Bun.connect> extends Promise<infer T> ? T : never;
  messageQueue: string[];
  ready: boolean;
  pingTimer: ReturnType<typeof setInterval> | null;
  clientIP: string;
  id: number;
  authenticatedHandle: string | null;
};

const connections = new WeakMap<any, WSConnection>();
let nextConnectionId = 1;

function safeCloseWs(ws: any, code?: number, reason?: string) {
  try {
    ws.close(code, reason);
  } catch (err) {
    log("warn", "failed to close websocket", { error: formatError(err) });
  }
}

function safeSendWs(ws: any, conn: WSConnection, data: string, context: string) {
  try {
    ws.send(data);
    return true;
  } catch (err) {
    log("error", "websocket send failed", {
      connId: conn.id,
      clientIP: conn.clientIP,
      context,
      error: formatError(err),
    });
    return false;
  }
}

function safeWriteTcp(conn: WSConnection, data: string, context: string) {
  if (!conn.ready || !conn.tcpSocket) {
    return false;
  }

  try {
    conn.tcpSocket.write(data);
    return true;
  } catch (err) {
    conn.ready = false;
    log("error", "TCP write failed", {
      connId: conn.id,
      clientIP: conn.clientIP,
      context,
      error: formatError(err),
    });
    safeCloseWsByConn(conn, 1011, "Hub write error");
    return false;
  }
}

function safeCloseWsByConn(conn: WSConnection, code?: number, reason?: string) {
  for (const [ws, stored] of activeConnections) {
    if (stored === conn) {
      safeCloseWs(ws, code, reason);
      break;
    }
  }
}

const activeConnections = new Map<any, WSConnection>();
const panelSessionTokens = new Map<string, { handle: string; ts: number }>();

function rememberPanelSessionToken(line: string) {
  try {
    const msg = JSON.parse(line) as { type?: string; data?: Record<string, unknown> };
    if (msg.type !== "auth_ok") return null;
    const token = typeof msg.data?.token === "string" ? msg.data.token : "";
    const handle = typeof msg.data?.handle === "string" ? msg.data.handle : "";
    if (!token || !handle) return null;
    panelSessionTokens.set(token, { handle, ts: Date.now() });
    return handle;
  } catch {
    return null;
  }
}

function verifyKnownPanelToken(token: string): PanelTokenAuthResult {
  if (!token) return { ok: false, reason: "missing token" };
  const entry = panelSessionTokens.get(token);
  if (!entry) return { ok: false, reason: "unknown panel session; reload panel after proxy restart" };
  entry.ts = Date.now();
  return { ok: true, handle: entry.handle };
}

// ─── Bot-add REST endpoint helpers ──────────────────────────────────────────

type BotAddRequest = {
  nick: string;
  password: string;
  addr: string;
  host_masks?: string[];
};

type BotAddCommandResult = {
  cmd: string;
  result: "ok" | "error";
  output?: string[];
};

type BotAddResult = {
  ok: boolean;
  nick: string;
  commands: BotAddCommandResult[];
  error?: string;
};

function bytesEqualConstantTime(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Open a one-shot WebAPI session against the hub as a service user and
 * run the canonical leaf-bootstrap sequence:
 *   .+bot <nick> <addr>
 *   .chattr <nick> +l
 *   .chpass <nick> <password>
 *   .+host <nick> <mask>   (for each entry in host_masks, optional)
 *   .save
 *
 * The hub's WebAPI replies with `cmd_ok` per command (or `error`); we step
 * through `commands[]` and resolve when the final cmd is acknowledged.
 */
function executeHubBotAdd(reqBody: BotAddRequest): Promise<BotAddResult> {
  const commands: string[] = [
    `+bot ${reqBody.nick} ${reqBody.addr}`,
    `chattr ${reqBody.nick} +l`,
    `chpass ${reqBody.nick} ${reqBody.password}`,
    ...(reqBody.host_masks ?? []).map(m => `+host ${reqBody.nick} ${m}`),
    `save`,
  ];

  return new Promise<BotAddResult>(resolve => {
    const results: BotAddCommandResult[] = [];
    let cmdIndex = -1; // -1 = waiting for auth_ok
    let pendingOutput: string[] = [];
    let socket: import("bun").Socket | null = null;
    let done = false;

    const finish = (ok: boolean, error?: string) => {
      if (done) return;
      done = true;
      try { socket?.end(); } catch { /* ignore */ }
      resolve({ ok, nick: reqBody.nick, commands: results, error });
    };

    const timeout = setTimeout(() => finish(false, "timeout"), BOT_ADD_TIMEOUT_MS);

    const sendNext = () => {
      if (!socket || cmdIndex < 0 || cmdIndex >= commands.length) return;
      const cmdStr = commands[cmdIndex];
      const sep = cmdStr.indexOf(" ");
      const cmd = sep === -1 ? cmdStr : cmdStr.slice(0, sep);
      const args = sep === -1 ? "" : cmdStr.slice(sep + 1);
      try {
        socket.write(JSON.stringify({ type: "cmd", data: { cmd, args } }) + "\n");
      } catch (err) {
        clearTimeout(timeout);
        finish(false, `write failed: ${String(err)}`);
      }
    };

    Bun.connect({
      hostname: HUB_HOST,
      port: HUB_PORT,
      tls: HUB_SSL ? { rejectUnauthorized: false } : false,
      socket: {
        open(sock) {
          socket = sock;
          try {
            sock.write(JSON.stringify({
              type: "auth",
              data: { handle: BOT_ADD_HUB_HANDLE, password: BOT_ADD_HUB_PASS },
            }) + "\n");
          } catch (err) {
            clearTimeout(timeout);
            finish(false, `auth write failed: ${String(err)}`);
          }
        },
        data(_sock, data) {
          const lines = data.toString().split("\n").filter(l => l.trim());
          for (const line of lines) {
            let msg: { type?: string; data?: Record<string, unknown> };
            try { msg = JSON.parse(line); } catch { continue; }

            if (cmdIndex === -1) {
              if (msg.type === "auth_ok") {
                cmdIndex = 0;
                sendNext();
              } else if (msg.type === "auth_fail") {
                clearTimeout(timeout);
                finish(false, `auth_fail: ${String(msg.data?.reason ?? "unknown")}`);
                return;
              }
              continue;
            }

            if (msg.type === "cmd_ok") {
              results.push({
                cmd: commands[cmdIndex],
                result: "ok",
                output: pendingOutput.length ? [...pendingOutput] : undefined,
              });
              pendingOutput = [];
              cmdIndex++;
              if (cmdIndex >= commands.length) {
                clearTimeout(timeout);
                finish(true);
                return;
              }
              sendNext();
            } else if (msg.type === "error") {
              const detail = String(msg.data?.message ?? msg.data?.code ?? "error");
              results.push({ cmd: commands[cmdIndex], result: "error", output: [detail] });
              clearTimeout(timeout);
              finish(false, detail);
              return;
            } else if (msg.type === "chat" || msg.type === "output" || msg.type === "system") {
              const text = typeof msg.data?.text === "string" ? msg.data.text : "";
              if (text) pendingOutput.push(text);
            }
          }
        },
        error(_sock, err) {
          clearTimeout(timeout);
          finish(false, `socket error: ${formatError(err).message}`);
        },
        close() {
          clearTimeout(timeout);
          if (!done) finish(false, "connection closed prematurely");
        },
      },
    }).catch(err => {
      clearTimeout(timeout);
      finish(false, `connect failed: ${formatError(err).message}`);
    });
  });
}

function validateBotAddRequest(raw: unknown): { ok: true; req: BotAddRequest } | { ok: false; detail: string } {
  if (!raw || typeof raw !== "object") return { ok: false, detail: "body must be a JSON object" };
  const o = raw as Record<string, unknown>;
  const nick = typeof o.nick === "string" ? o.nick : "";
  const password = typeof o.password === "string" ? o.password : "";
  const addr = typeof o.addr === "string" ? o.addr : "";
  if (!nick || !password || !addr) return { ok: false, detail: "nick, password, addr are required" };
  if (!/^[A-Za-z0-9_\-\[\]\\^`{|}]{1,32}$/.test(nick)) return { ok: false, detail: "nick contains invalid characters" };
  if (password.length > 128 || /[\r\n\0]/.test(password)) return { ok: false, detail: "password too long or has control chars" };
  if (addr.length > 255 || /[\r\n\0\s]/.test(addr)) return { ok: false, detail: "addr too long or has whitespace/control chars" };

  let host_masks: string[] | undefined;
  if (o.host_masks !== undefined) {
    if (!Array.isArray(o.host_masks)) return { ok: false, detail: "host_masks must be an array" };
    if (o.host_masks.length > 16) return { ok: false, detail: "too many host_masks (max 16)" };
    host_masks = [];
    for (const m of o.host_masks) {
      if (typeof m !== "string" || !m || m.length > 255 || /[\r\n\0\s]/.test(m)) {
        return { ok: false, detail: "each host_masks entry must be a non-empty whitespace-free string ≤255 chars" };
      }
      host_masks.push(m);
    }
  }

  return { ok: true, req: { nick, password, addr, host_masks } };
}

Bun.serve({
  hostname: "0.0.0.0",
  port: WS_PORT,
  idleTimeout: 120, // 2 minute idle timeout

  async fetch(req, server) {
    const url = new URL(req.url);

    // HTTP API endpoints — served alongside the WebSocket upgrade path
    if (url.pathname === "/api/ircnet-servers") {
      const forceRefresh = url.searchParams.get("refresh") === "1";
      try {
        const { servers, cachedAt, source } = await getIrcnetServers(forceRefresh);
        return jsonResponse(
          {
            servers,
            source,
            cached_at: cachedAt,
            cache_age_s: Math.floor((Date.now() - cachedAt) / 1000),
          },
          {
            headers: {
              "cache-control": "public, max-age=60",
            },
          },
        );
      } catch (err) {
        log("error", "HTTP ircnet endpoint failed", { error: formatError(err) });
        return jsonResponse(
          { error: "fetch_failed", detail: String(err) },
          {
            status: 503,
          },
        );
      }
    }

    if (url.pathname === "/api/notifier-status") {
      try {
        return jsonResponse(await getCachedNotifierStatus(), {
          headers: { "cache-control": "no-store" },
        });
      } catch (err) {
        log("error", "HTTP notifier status endpoint failed", { error: formatError(err) });
        return jsonResponse(
          { error: "status_failed", detail: String(err) },
          { status: 503 },
        );
      }
    }

    // Unattended leaf bootstrap. Caller authenticates with a shared bearer
    // token (BOT_ADD_API_KEY); the proxy then talks to the hub as a service
    // user that has permission to run .+bot / .chattr / .chpass / .+host /
    // .save. The hub's partyline TCP listener does NOT need to be public for
    // this to work — everything happens over the existing WebAPI socket the
    // proxy already uses for the panel.
    if (url.pathname === "/api/bot-add" && req.method === "POST") {
      if (!BOT_ADD_ENABLED) {
        return jsonResponse(
          {
            error: "bot_add_disabled",
            detail: "set BOT_ADD_API_KEY, BOT_ADD_HUB_HANDLE, BOT_ADD_HUB_PASS to enable",
          },
          { status: 503 },
        );
      }

      const token = bearerToken(req);
      if (!token || !bytesEqualConstantTime(token, BOT_ADD_API_KEY)) {
        log("warn", "bot-add rejected: bad token", { clientIP: (req as any).headers?.get?.("x-forwarded-for") || "?" });
        return jsonResponse({ error: "unauthorized" }, { status: 401 });
      }

      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        return jsonResponse({ error: "bad_json", detail: "body is not valid JSON" }, { status: 400 });
      }

      const validated = validateBotAddRequest(raw);
      if (!validated.ok) {
        return jsonResponse({ error: "bad_request", detail: validated.detail }, { status: 400 });
      }

      log("info", "bot-add request accepted", {
        nick: validated.req.nick,
        addr: validated.req.addr,
        host_masks: validated.req.host_masks?.length ?? 0,
      });

      try {
        const result = await executeHubBotAdd(validated.req);
        log(result.ok ? "info" : "error", "bot-add finished", {
          nick: validated.req.nick,
          ok: result.ok,
          error: result.error,
          steps: result.commands.length,
        });
        return jsonResponse(result, { status: result.ok ? 200 : 502 });
      } catch (err) {
        log("error", "bot-add crashed", { error: formatError(err) });
        return jsonResponse(
          { ok: false, nick: validated.req.nick, commands: [], error: String(err) },
          { status: 500 },
        );
      }
    }

    if (url.pathname === "/api/notifier-send") {
      if (req.method !== "POST") {
        return jsonResponse(
          { error: "method_not_allowed" },
          { status: 405, headers: { "allow": "POST" } },
        );
      }

      const auth = verifyKnownPanelToken(bearerToken(req));
      if (!auth.ok) {
        log("warn", "notifier send rejected", { reason: auth.reason });
        return jsonResponse({ error: "unauthorized", detail: auth.reason }, { status: 401 });
      }

      try {
        const body = await req.json().catch(() => null) as { text?: unknown } | null;
        const text = typeof body?.text === "string" ? body.text.trim() : "";
        if (!text) {
          return jsonResponse({ error: "empty_message" }, { status: 400 });
        }
        if (text.length > 3500) {
          return jsonResponse({ error: "message_too_long", max: 3500 }, { status: 400 });
        }

        await sendTelegramPanelMessage(text, auth.handle);
        log("info", "notifier panel message sent", {
          handle: auth.handle,
          chars: text.length,
        });
        return jsonResponse({ ok: true });
      } catch (err) {
        log("error", "notifier panel message failed", { error: formatError(err) });
        return jsonResponse(
          { error: "send_failed", detail: err instanceof Error ? err.message : String(err) },
          { status: 502 },
        );
      }
    }

    // Get real client IP from trusted forwarding headers or connection.
    const cfIP = req.headers.get("CF-Connecting-IP");
    const xForwardedFor = req.headers.get("X-Forwarded-For");
    const xRealIP = req.headers.get("X-Real-IP");
    const connIP = server.requestIP(req)?.address || "unknown";

    const clientIP = cfIP || xRealIP || (xForwardedFor?.split(",")[0].trim()) || connIP;

    if (server.upgrade(req, { data: { clientIP } })) {
      return;
    }

    // HTTP fallthrough — log unknown paths so unrestarted proxies / misconfigured
    // reverse-proxy rules are visible at a glance. Respond with JSON so the
    // panel can distinguish "proxy reachable but path unknown" from "network
    // error" cleanly.
    log("warn", "unhandled HTTP request", { method: req.method, path: url.pathname });
    return jsonResponse(
      {
        error: "unknown_path",
        path: url.pathname,
        hint: "This endpoint is unknown. Is proxy.ts up-to-date? Known routes: /api/ircnet-servers, /api/notifier-status, /api/notifier-send, / (websocket upgrade)",
      },
      {
        status: 404,
      },
    );
  },

  websocket: {
    idleTimeout: 120, // 2 minute idle timeout for WebSocket
    open(ws) {
      const clientIP = (ws.data as any)?.clientIP || "unknown";
      const connId = nextConnectionId++;
      log("info", "WS client connected", { connId, clientIP });

      // Initialize connection state
      const conn: WSConnection = {
        tcpSocket: null as any,
        messageQueue: [],
        ready: false,
        pingTimer: null,
        clientIP,
        id: connId,
        authenticatedHandle: null,
      };
      connections.set(ws, conn);
      activeConnections.set(ws, conn);

      // Start ping interval to keep both connections alive
      conn.pingTimer = setInterval(() => {
        // Ping the browser WebSocket to keep it alive
        try {
          ws.ping();
        } catch (err) {
          log("warn", "websocket ping failed", {
            connId: conn.id,
            clientIP: conn.clientIP,
            error: formatError(err),
          });
        }

        // Ping the hub TCP to keep that alive too
        safeWriteTcp(conn, '{"type":"ping"}\n', "ping timer");
      }, PING_INTERVAL);

      // Connect to hub TCP/TLS
      Bun.connect({
        hostname: HUB_HOST,
        port: HUB_PORT,
        tls: HUB_SSL ? { rejectUnauthorized: false } : false,

        socket: {
          open(socket) {
            log("info", "TCP connected to hub", { connId: conn.id, clientIP: conn.clientIP });
            conn.tcpSocket = socket;
            conn.ready = true;

            // Flush queued messages
            for (const msg of conn.messageQueue) {
              log("info", "flushing queued message", {
                connId: conn.id,
                clientIP: conn.clientIP,
                ...messageLogMeta(msg, 80),
              });
              if (!safeWriteTcp(conn, msg + "\n", "flush queue")) {
                break;
              }
            }
            conn.messageQueue = [];
          },

          data(socket, data) {
            // Forward TCP → WS (hub sends line-delimited JSON)
            const text = data.toString();
            log("info", "hub to websocket data", {
              connId: conn.id,
              clientIP: conn.clientIP,
              ...messageLogMeta(text),
            });

            const lines = text.split("\n").filter(l => l.trim());
            for (const line of lines) {
              const handle = rememberPanelSessionToken(line);
              if (handle) {
                conn.authenticatedHandle = handle;
              }
              if (!safeSendWs(ws, conn, line, "hub data")) {
                socket.end();
              }
            }
          },

          close() {
            log("warn", "TCP connection closed", { connId: conn.id, clientIP: conn.clientIP });
            conn.ready = false;
            if (conn.pingTimer) {
              clearInterval(conn.pingTimer);
              conn.pingTimer = null;
            }
            safeCloseWs(ws);
          },

          error(socket, error) {
            log("error", "TCP socket error", {
              connId: conn.id,
              clientIP: conn.clientIP,
              error: formatError(error),
            });
            conn.ready = false;
            if (conn.pingTimer) {
              clearInterval(conn.pingTimer);
              conn.pingTimer = null;
            }
            safeCloseWs(ws, 1011, "Hub connection error");
          },
        },
      }).catch(err => {
        log("error", "failed to connect to hub", {
          connId: conn.id,
          clientIP: conn.clientIP,
          host: HUB_HOST,
          port: HUB_PORT,
          error: formatError(err),
        });
        safeCloseWs(ws, 1011, "Cannot connect to hub");
      });
    },

    async message(ws, message) {
      const conn = connections.get(ws);
      if (!conn) return;

      const data = typeof message === "string" ? message : message.toString();

      // Try to parse as JSON so we can intercept proxy-level messages
      let parsed: { type?: string; [k: string]: unknown } | null = null;
      try {
        parsed = JSON.parse(data);
      } catch {
        /* non-JSON, forward as-is */
      }

      // Proxy-handled messages — don't forward to hub, answer via this WS.
      // This avoids requiring the reverse proxy (Caddy/nginx) to forward
      // /api/* to Bun — the existing WS path already works in every setup.
      if (parsed?.type === "fetch_ircnet") {
        const forceRefresh = Boolean(parsed.refresh);
        try {
          const { servers, cachedAt, source } = await getIrcnetServers(forceRefresh);
          safeSendWs(ws, conn, JSON.stringify({
            type: "ircnet_servers",
            data: {
              servers,
              source,
              cached_at: cachedAt,
              cache_age_s: Math.floor((Date.now() - cachedAt) / 1000),
            },
          }), "fetch_ircnet response");
        } catch (err) {
          log("error", "fetch_ircnet request failed", {
            connId: conn.id,
            clientIP: conn.clientIP,
            error: formatError(err),
          });
          safeSendWs(ws, conn, JSON.stringify({
            type: "ircnet_error",
            data: { error: "fetch_failed", detail: String(err) },
          }), "fetch_ircnet error");
        }
        return;
      }

      log("info", "websocket to hub data", {
        connId: conn.id,
        clientIP: conn.clientIP,
        ...messageLogMeta(data),
      });

      // Inject client_ip into JSON messages for WebAPI rate limiting
      let enrichedData = data;
      if (parsed) {
        parsed.client_ip = conn.clientIP;
        enrichedData = JSON.stringify(parsed);
      }

      if (conn.ready && conn.tcpSocket) {
        safeWriteTcp(conn, enrichedData + "\n", "websocket message");
      } else {
        // Queue message until TCP is ready
        if (conn.messageQueue.length >= MAX_QUEUE_SIZE) {
          log("error", "message queue limit reached", {
            connId: conn.id,
            clientIP: conn.clientIP,
            maxQueueSize: MAX_QUEUE_SIZE,
          });
          safeCloseWs(ws, 1011, "Hub queue full");
          return;
        }
        log("warn", "queueing message because TCP is not ready", {
          connId: conn.id,
          clientIP: conn.clientIP,
          queueSize: conn.messageQueue.length + 1,
        });
        conn.messageQueue.push(enrichedData);
      }
    },

    close(ws) {
      const conn = connections.get(ws);
      log("info", "WS client disconnected", {
        connId: conn?.id,
        clientIP: conn?.clientIP,
      });
      if (conn) {
        if (conn.pingTimer) {
          clearInterval(conn.pingTimer);
        }
        if (conn.tcpSocket) {
          try {
            conn.tcpSocket.end();
          } catch (err) {
            log("warn", "failed to end TCP socket during websocket close", {
              connId: conn.id,
              clientIP: conn.clientIP,
              error: formatError(err),
            });
          }
        }
      }
      connections.delete(ws);
      activeConnections.delete(ws);
    },
  },
});

log("info", "listening", { url: `ws://0.0.0.0:${WS_PORT}` });
