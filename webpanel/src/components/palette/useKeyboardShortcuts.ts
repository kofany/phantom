import { useEffect, useRef } from 'react'

export type ShortcutHandler = () => void

export type ShortcutMap = {
  /** Command-palette trigger — ⌘K / Ctrl+K */
  onOpenPalette?: ShortcutHandler
  /** Help overlay — `?` */
  onShowHelp?: ShortcutHandler
  /** Quick-ban modal — Ctrl+B */
  onQuickBan?: ShortcutHandler
  /** Focus global search — `/` */
  onFocusSearch?: ShortcutHandler
  /** g-prefix navigation map: key → handler (e.g. { c: () => goTo('channels') }) */
  onGoto?: Record<string, ShortcutHandler>
  /** Enabled flag — shortcuts do nothing when false (e.g. pre-auth) */
  enabled?: boolean
}

// Keys that should NOT be intercepted while the user is typing
function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}

const GO_PREFIX_WINDOW_MS = 1200

/**
 * Global keyboard shortcuts — binds once at app root. Handles:
 *   - ⌘K / Ctrl+K               → open command palette
 *   - `?`                       → help overlay
 *   - Ctrl+B                    → quick ban
 *   - `/`                       → focus search (only when not typing)
 *   - `g` then {c,u,b,t,a,h}    → navigate (two-key sequence, 1.2s window)
 */
export function useKeyboardShortcuts(handlers: ShortcutMap) {
  // Keep latest handlers in a ref so the effect can stay mounted and read
  // current callbacks without re-binding on every parent re-render.
  const ref = useRef(handlers)
  ref.current = handlers

  useEffect(() => {
    let gPrefixTime = 0 // timestamp when `g` was last pressed

    const onKey = (e: KeyboardEvent) => {
      const h = ref.current
      if (h.enabled === false) return

      const editable = isEditable(e.target)
      const meta = e.metaKey || e.ctrlKey
      const key = e.key

      // ⌘K / Ctrl+K — always available (including while typing — it's a panel action)
      if (meta && (key === 'k' || key === 'K')) {
        e.preventDefault()
        h.onOpenPalette?.()
        return
      }

      // Ctrl+B — Quick ban. Don't hijack while typing.
      if (meta && (key === 'b' || key === 'B') && !editable) {
        e.preventDefault()
        h.onQuickBan?.()
        return
      }

      // Everything below is only for non-editable contexts
      if (editable) return

      // `/` — focus search
      if (key === '/') {
        e.preventDefault()
        h.onFocusSearch?.()
        return
      }

      // `?` — help overlay
      if (key === '?') {
        e.preventDefault()
        h.onShowHelp?.()
        return
      }

      // g-prefix navigation
      if (key === 'g' && !e.shiftKey && !meta) {
        gPrefixTime = Date.now()
        return
      }
      if (
        gPrefixTime > 0 &&
        Date.now() - gPrefixTime < GO_PREFIX_WINDOW_MS &&
        !meta &&
        /^[a-z]$/.test(key)
      ) {
        const goto = h.onGoto?.[key]
        if (goto) {
          e.preventDefault()
          gPrefixTime = 0
          goto()
          return
        }
      }
      // Any other key resets the g-prefix
      if (Date.now() - gPrefixTime > GO_PREFIX_WINDOW_MS) {
        gPrefixTime = 0
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
