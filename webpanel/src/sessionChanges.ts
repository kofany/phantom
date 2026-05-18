/**
 * In-memory diary of edits made during the current browser session.
 *
 * Unlike auditLog.ts (persisted to localStorage, captures all owners'
 * broadcasts) this log is tab-local and only records changes initiated
 * from the current panel. Useful as a "what did I just touch?" safety
 * net — a quick way to review your own recent edits without digging
 * through the global audit feed.
 *
 * Not persisted: a page refresh clears the list. That's intentional —
 * the list is meant for the current working session only.
 */

export type SessionChangeScope =
  | 'bot-config'
  | 'bot-setting'
  | 'user-flags'
  | 'channel-setting'
  | 'channel-protlist'

export type SessionChange = {
  id: string
  time: number
  scope: SessionChangeScope
  target: string        // e.g. `bot:<name>`, `user:<handle>`, `#channel`
  field: string         // what was edited (variable name, flag class, etc.)
  before: string        // stringified pre-value
  after: string         // stringified post-value
}

type Listener = (events: SessionChange[]) => void

let events: SessionChange[] = []
const listeners = new Set<Listener>()

// Session-wide cap. One full working session rarely exceeds a few dozen
// edits; the cap just protects against pathological edit loops.
const MAX_EVENTS = 200

export function logSessionChange(
  scope: SessionChangeScope,
  target: string,
  field: string,
  before: string,
  after: string,
) {
  if (before === after) return
  const ev: SessionChange = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    time: Date.now(),
    scope,
    target,
    field,
    before,
    after,
  }
  events = [...events, ev].slice(-MAX_EVENTS)
  listeners.forEach(l => l(events))
}

export function getSessionChanges(): SessionChange[] {
  return events
}

export function clearSessionChanges() {
  events = []
  listeners.forEach(l => l(events))
}

export function subscribeSessionChanges(cb: Listener): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
