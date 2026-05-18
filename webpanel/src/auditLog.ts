/**
 * Frontend audit log — captures changes happening on the botnet and keeps a
 * local history per browser. Two sources:
 *
 *  1. **Broadcast messages** (`# <owner> # <action> ...`) — these are emitted
 *     by the bot when ANY owner makes a change via partyline or panel.
 *     Parsed from the `messages` stream so we see activity from other
 *     owners' sessions too.
 *
 *  2. **Our own local CRUD responses** (`*_ok` from WebAPI) — some actions
 *     (deletes, host removal) don't emit text broadcasts. We log those
 *     directly when we trigger them.
 *
 * Storage: localStorage, capped at MAX_EVENTS to avoid unbounded growth.
 */

const STORAGE_KEY = 'phantom_audit_log_v1'
const MAX_EVENTS = 1000

export type AuditAction =
  | 'add_user'    | 'del_user'      | 'set_flags'
  | 'set_pass'    | 'add_host'      | 'del_host'
  | 'add_bot'     | 'del_bot'
  | 'add_chan'    | 'del_chan'      | 'chset'
  | 'add_ban'     | 'del_ban'       | 'add_stick'
  | 'add_exempt'  | 'del_exempt'
  | 'add_invite'  | 'del_invite'
  | 'add_reop'    | 'del_reop'
  | 'set_cfg'     | 'cfg_save'
  | 'chattr'
  | 'other'

export type AuditSource = 'local' | 'broadcast'

export type AuditEvent = {
  id: string
  time: number           // unix ms
  actor: string          // handle who made the change, or 'me' for local
  action: AuditAction
  target: string         // channel / handle / mask affected
  detail?: string        // extra info (flags, value, reason)
  source: AuditSource
}

type Listener = (events: AuditEvent[]) => void
const listeners = new Set<Listener>()

function load(): AuditEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function save(events: AuditEvent[]) {
  try {
    const trimmed = events.slice(-MAX_EVENTS)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    listeners.forEach(l => l(trimmed))
  } catch {
    // quota exceeded — drop older half and retry
    try {
      const half = events.slice(-Math.floor(MAX_EVENTS / 2))
      localStorage.setItem(STORAGE_KEY, JSON.stringify(half))
      listeners.forEach(l => l(half))
    } catch {
      /* give up silently */
    }
  }
}

export function getAuditEvents(): AuditEvent[] {
  return load()
}

/**
 * Return events whose `target` matches the given object. Matching is
 * case-insensitive and also succeeds for composite targets like
 * `#channel · varname` emitted by `chset` events. Sorted newest-first.
 */
export function getAuditEventsForTarget(target: string, limit?: number): AuditEvent[] {
  if (!target) return []
  const needle = target.toLowerCase()
  const all = load()
  const matched: AuditEvent[] = []
  for (let i = all.length - 1; i >= 0; i--) {
    const e = all[i]
    const et = e.target.toLowerCase()
    if (et === needle || et.startsWith(`${needle} ·`)) {
      matched.push(e)
      if (limit && matched.length >= limit) break
    }
  }
  return matched
}

export function subscribeAudit(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export function clearAuditLog() {
  localStorage.removeItem(STORAGE_KEY)
  listeners.forEach(l => l([]))
}

export function exportAuditAsJson(): string {
  return JSON.stringify(load(), null, 2)
}

export function exportAuditAsCsv(): string {
  const events = load()
  const header = 'time,actor,action,target,detail,source'
  const rows = events.map(e => {
    const time = new Date(e.time).toISOString()
    const esc = (v: string) =>
      /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
    return [time, esc(e.actor), e.action, esc(e.target), esc(e.detail ?? ''), e.source].join(',')
  })
  return [header, ...rows].join('\n')
}

// Dedup window — same event within this ms is considered a duplicate (e.g. our
// own action is both logged locally AND broadcast back to us).
const DEDUP_WINDOW_MS = 3000

function isDuplicate(events: AuditEvent[], candidate: AuditEvent): boolean {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]
    if (candidate.time - e.time > DEDUP_WINDOW_MS) return false
    if (
      e.action === candidate.action &&
      e.target === candidate.target &&
      e.detail === candidate.detail
    ) {
      return true
    }
  }
  return false
}

function addEvent(partial: Omit<AuditEvent, 'id' | 'time'> & { time?: number }) {
  const events = load()
  const ev: AuditEvent = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    time: partial.time ?? Date.now(),
    ...partial,
  }
  if (isDuplicate(events, ev)) return
  events.push(ev)
  save(events)
}

/**
 * Log a locally-triggered action (from our panel). Use `actor = 'me'` since
 * our own handle may already be known upstream.
 */
export function logLocalAction(
  action: AuditAction,
  target: string,
  detail?: string,
) {
  addEvent({ actor: 'me', action, target, detail, source: 'local' })
}

/**
 * Try to parse a partyline broadcast line into an audit event.
 * Format: `# <owner> # <verb> <args>`
 *
 * Returns the parsed event or null if not an audit-worthy line.
 */
export function parseBroadcast(text: string): AuditEvent | null {
  // `# owner # verb args...`
  const m = text.match(/^#\s+(\S+)\s+#\s+(\S+)\s*(.*)$/)
  if (!m) return null
  const [, owner, verb, rest] = m

  const time = Date.now()
  const id = `${time}-${Math.random().toString(36).slice(2, 9)}`
  const base = { id, time, actor: owner, source: 'broadcast' as const }

  // Chanset:  chset #chan var value
  if (verb === 'chset') {
    const mm = rest.match(/^(\S+)\s+(\S+)\s+(.+)$/)
    if (!mm) return null
    return { ...base, action: 'chset', target: `${mm[1]} · ${mm[2]}`, detail: mm[3] }
  }

  // Chattr:  chattr handle flags (now: current) reason
  if (verb === 'chattr') {
    const mm = rest.match(/^(\S+)\s+(\S+)(?:\s+\(now:\s*([^)]+)\))?(?:\s+(.*))?$/)
    if (!mm) return { ...base, action: 'chattr', target: rest.split(/\s+/)[0] ?? '', detail: rest }
    return {
      ...base,
      action: 'chattr',
      target: mm[1],
      detail: `${mm[2]}${mm[3] ? ` (now ${mm[3]})` : ''}${mm[4] ? ` · ${mm[4]}` : ''}`,
    }
  }

  // Add user:  +user handle [host]
  if (verb === '+user') {
    const mm = rest.match(/^(\S+)(?:\s+(.+))?$/)
    if (!mm) return null
    return { ...base, action: 'add_user', target: mm[1], detail: mm[2] }
  }

  // Add host:  +host handle host
  if (verb === '+host') {
    const mm = rest.match(/^(\S+)\s+(.+)$/)
    if (!mm) return null
    return { ...base, action: 'add_host', target: mm[1], detail: mm[2] }
  }

  // Add chan: +chan #chan key delay
  if (verb === '+chan') {
    const mm = rest.match(/^(\S+)(?:\s+(\S+))?(?:\s+(\S+))?/)
    if (!mm) return null
    const detail = [mm[2], mm[3]].filter(Boolean).join(' ') || undefined
    return { ...base, action: 'add_chan', target: mm[1], detail }
  }

  // Generic config change:  prefix2 prefix var value
  // Psotnic emits this for `cfg` and similar — when prefix is "cfg"
  if (rest.includes(' cfg ') || /^cfg\s+/.test(rest)) {
    const mm = rest.match(/^(?:\S+\s+)?cfg\s+(\S+)\s+(.+)$/)
    if (mm) {
      return { ...base, action: 'set_cfg', target: mm[1], detail: mm[2] }
    }
  }

  return null
}

/**
 * Scan new messages for broadcast lines and log them.
 * Call with a slice of messages AFTER the last processed index.
 */
export function ingestBroadcasts(messages: { text: string; time: Date }[]) {
  const events = load()
  let changed = false
  for (const m of messages) {
    const parsed = parseBroadcast(m.text)
    if (!parsed) continue
    // Use the message's timestamp, not now() — preserves ordering when
    // multiple arrive rapidly.
    parsed.time = m.time.getTime()
    if (isDuplicate(events, parsed)) continue
    events.push(parsed)
    changed = true
  }
  if (changed) save(events)
}
