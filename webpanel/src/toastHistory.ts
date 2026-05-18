// In-memory ring buffer of recent toasts. Survives across navigations within
// a session, but resets on full page reload — by design, since toasts are
// transient by nature and persisting them would feel stale.
//
// The Toast module pushes here on every fire; the NotificationCenter
// subscribes to render history and unread count.

export type ToastHistoryType = 'success' | 'error' | 'info' | 'warning'

export type ToastHistoryEntry = {
  id: number
  type: ToastHistoryType
  message: string
  time: Date
  read: boolean
}

const MAX = 50
let entries: ToastHistoryEntry[] = []
let nextId = 0
let panelOpen = false

const listeners = new Set<() => void>()

function emit() {
  for (const fn of listeners) fn()
}

export function pushToHistory(type: ToastHistoryType, message: string) {
  const entry: ToastHistoryEntry = {
    id: ++nextId,
    type,
    message,
    time: new Date(),
    // Auto-mark read if the panel is open right now (user is looking).
    read: panelOpen,
  }
  entries = [entry, ...entries].slice(0, MAX)
  emit()
}

export function getHistory(): ToastHistoryEntry[] {
  return entries
}

export function getUnreadCount(): number {
  return entries.filter(e => !e.read).length
}

export function markAllRead() {
  let changed = false
  entries = entries.map(e => {
    if (e.read) return e
    changed = true
    return { ...e, read: true }
  })
  if (changed) emit()
}

export function clearHistory() {
  if (entries.length === 0) return
  entries = []
  emit()
}

export function setPanelOpen(open: boolean) {
  panelOpen = open
  if (open) markAllRead()
}

export function subscribeHistory(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
