/**
 * Pinned favorites + recently viewed — stored per-browser in localStorage.
 *
 * Keeps a small list of "important" resources that the operator uses daily
 * (pinned) and a separate list of the last N resources they opened (recent).
 * Both sets are displayed in the sidebar for one-click access.
 */

const PINNED_KEY = 'phantom_pinned_v1'
const RECENT_KEY = 'phantom_recent_v1'
const MAX_RECENT = 6
const MAX_PINNED = 12

export type FavoriteKind = 'channel' | 'user' | 'bot'

export type Favorite = {
  kind: FavoriteKind
  name: string       // channel name / user handle / bot handle
  pinnedAt: number   // ms (used as stable sort)
}

export type RecentItem = {
  kind: FavoriteKind
  name: string
  visitedAt: number  // ms
}

type Listener<T> = (items: T[]) => void

const pinListeners = new Set<Listener<Favorite>>()
const recentListeners = new Set<Listener<RecentItem>>()

function loadJson<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveJson(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch { /* storage full — drop silently */ }
}

// ----------- Pinned -------------------------------------------------------

export function getPinned(): Favorite[] {
  return loadJson<Favorite>(PINNED_KEY)
}

export function isPinned(kind: FavoriteKind, name: string): boolean {
  return getPinned().some(f => f.kind === kind && f.name === name)
}

export function togglePinned(kind: FavoriteKind, name: string): boolean {
  const current = getPinned()
  const existing = current.findIndex(f => f.kind === kind && f.name === name)
  let next: Favorite[]
  let nowPinned: boolean
  if (existing >= 0) {
    next = current.filter((_, i) => i !== existing)
    nowPinned = false
  } else {
    next = [...current, { kind, name, pinnedAt: Date.now() }].slice(-MAX_PINNED)
    nowPinned = true
  }
  saveJson(PINNED_KEY, next)
  pinListeners.forEach(l => l(next))
  return nowPinned
}

export function subscribePinned(cb: Listener<Favorite>): () => void {
  pinListeners.add(cb)
  return () => pinListeners.delete(cb)
}

// ----------- Recently viewed ---------------------------------------------

export function getRecent(): RecentItem[] {
  return loadJson<RecentItem>(RECENT_KEY)
}

export function markVisited(kind: FavoriteKind, name: string) {
  const current = getRecent()
  const next = [
    { kind, name, visitedAt: Date.now() },
    ...current.filter(r => !(r.kind === kind && r.name === name)),
  ].slice(0, MAX_RECENT)
  saveJson(RECENT_KEY, next)
  recentListeners.forEach(l => l(next))
}

export function subscribeRecent(cb: Listener<RecentItem>): () => void {
  recentListeners.add(cb)
  return () => recentListeners.delete(cb)
}
