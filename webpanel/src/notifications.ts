// Desktop notifications via the standard Notification API.
//
// Settings live in localStorage so they survive reloads and can be edited
// from a single Settings modal. The module exposes a thin imperative API
// (`notify(...)`) plus a pub/sub interface so React components can mirror
// the current settings without prop-drilling.
//
// Notifications never fire when the tab is focused — when the user is
// looking at the panel, in-app feedback (toasts, list updates) is enough
// and a desktop popup just adds noise.

export type NotificationKind =
  | 'bot_offline'
  | 'bot_online'
  | 'mention'

export type NotificationSettings = {
  /** Master switch. When false the module silently drops every notify(). */
  enabled: boolean
  /** Per-kind opt-in. */
  kinds: Record<NotificationKind, boolean>
  /**
   * Lowercase substrings that trigger a `mention` notification when found
   * in any partyline chat line. Matched case-insensitively. The user's own
   * handle is matched separately and unconditionally (assuming `mention`
   * is enabled) — keywords are for additional triggers like nicks of
   * teammates or topics worth watching.
   */
  mentionKeywords: string[]
  /**
   * Minimum gap between two notifications sharing the same throttle key.
   * Prevents flooding when a botnet-wide reconnect makes 50 bots quit
   * at once.
   */
  throttleMs: number
}

const STORAGE_KEY = 'phantom:notifications:v1'

const DEFAULTS: NotificationSettings = {
  enabled: false,
  kinds: {
    bot_offline: true,
    bot_online: false,
    mention: true,
  },
  mentionKeywords: [],
  throttleMs: 2500,
}

function loadSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>
    // Defensive merge so a stored old shape with a missing `kinds` key
    // doesn't crash the module on load.
    return {
      ...DEFAULTS,
      ...parsed,
      kinds: { ...DEFAULTS.kinds, ...(parsed.kinds ?? {}) },
      mentionKeywords: Array.isArray(parsed.mentionKeywords)
        ? parsed.mentionKeywords.filter(k => typeof k === 'string')
        : [],
    }
  } catch {
    return { ...DEFAULTS }
  }
}

let settings: NotificationSettings = loadSettings()
const listeners = new Set<(s: NotificationSettings) => void>()
const lastNotifyAt = new Map<string, number>()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // localStorage quota / disabled — settings stay in-memory for the session.
  }
  for (const fn of listeners) fn(settings)
}

export function getSettings(): NotificationSettings {
  return settings
}

export function updateSettings(patch: Partial<NotificationSettings>): void {
  settings = {
    ...settings,
    ...patch,
    kinds: patch.kinds ? { ...settings.kinds, ...patch.kinds } : settings.kinds,
  }
  persist()
}

export function setKindEnabled(kind: NotificationKind, on: boolean): void {
  updateSettings({ kinds: { ...settings.kinds, [kind]: on } })
}

export function subscribeSettings(fn: (s: NotificationSettings) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getPermission(): NotificationPermission {
  return isSupported() ? Notification.permission : 'denied'
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!isSupported()) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return 'denied'
  }
}

type NotifyOptions = {
  /** Coalesces repeated notifications of the same logical event (e.g.
   *  same bot offline twice within throttle window). */
  tag?: string
  /** Optional click handler — focuses window and runs the callback. */
  onClick?: () => void
}

export function notify(
  kind: NotificationKind,
  title: string,
  body: string,
  opts: NotifyOptions = {},
): void {
  if (!settings.enabled || !settings.kinds[kind]) return
  if (!isSupported() || Notification.permission !== 'granted') return

  // Don't notify when the user is already looking at the panel — toast
  // / list updates carry the same information without an OS popup.
  if (
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible' &&
    document.hasFocus()
  ) {
    return
  }

  const throttleKey = `${kind}:${opts.tag ?? title}`
  const now = Date.now()
  const last = lastNotifyAt.get(throttleKey) ?? 0
  if (now - last < settings.throttleMs) return
  lastNotifyAt.set(throttleKey, now)

  try {
    const n = new Notification(title, {
      body,
      tag: opts.tag,
      icon: '/favicon.svg',
      // Sensible defaults — silent stays false (let OS handle sound),
      // requireInteraction false (auto-dismiss like other webapp notifs).
    })
    if (opts.onClick) {
      n.onclick = () => {
        try { window.focus() } catch { /* cross-origin or popup blocker */ }
        opts.onClick?.()
        n.close()
      }
    }
  } catch {
    // Construction can throw on some browsers when the tag service is
    // misbehaving — degrade gracefully.
  }
}

/**
 * Test-fire a notification so the user can verify their OS-level setup
 * (sound, banner placement, do-not-disturb). Bypasses the master enabled
 * check so the test still works while the user is configuring the panel.
 */
export function notifyTest(): boolean {
  if (!isSupported() || Notification.permission !== 'granted') return false
  try {
    new Notification('Phantom — test notification', {
      body: 'Notifications are working. You\'ll see real ones when bots go offline or you\'re mentioned.',
      icon: '/favicon.svg',
      tag: 'phantom:test',
    })
    return true
  } catch {
    return false
  }
}

/**
 * Decide whether a partyline chat line should fire a mention notification.
 * Returns the matched trigger (the keyword or the user's handle) or null.
 */
export function matchMention(text: string, ownHandle: string | null): string | null {
  if (!text) return null
  const lower = text.toLowerCase()
  if (ownHandle) {
    const h = ownHandle.toLowerCase()
    // Match handle with word-boundary-ish check - avoids a handle matching
    // inside an unrelated longer word.
    if (lower.includes(h)) {
      const idx = lower.indexOf(h)
      const before = idx === 0 ? '' : lower[idx - 1]
      const after = lower[idx + h.length] ?? ''
      const isWordBoundary = (c: string) => !/[a-z0-9_]/.test(c)
      if ((before === '' || isWordBoundary(before)) && (after === '' || isWordBoundary(after))) {
        return ownHandle
      }
    }
  }
  for (const k of settings.mentionKeywords) {
    if (k && lower.includes(k.toLowerCase())) return k
  }
  return null
}
