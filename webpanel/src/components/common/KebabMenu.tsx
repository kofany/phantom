import { useEffect, useRef, useState, MouseEvent, KeyboardEvent } from 'react'
import { Icon, IconName } from './Icon'

export type KebabAction = {
  /** Stable id used as React key. */
  id: string
  /** Visible label. */
  label: string
  /** Optional left-icon. */
  icon?: IconName
  /** When true, styled in danger red (delete, kick, etc.). */
  destructive?: boolean
  /** Disabled actions stay visible but don't fire — used to advertise the
   *  affordance even when permission is missing. Add `disabledReason` for
   *  the title attribute hint. */
  disabled?: boolean
  disabledReason?: string
  onClick: () => void
}

type KebabMenuProps = {
  actions: KebabAction[]
  /** Aria label for the trigger button. */
  ariaLabel?: string
  /** Anchor side. Default 'bottom-right' (menu drops below, aligned right). */
  side?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'
}

/**
 * Three-dot row-action button with a popover menu. Stops click propagation so
 * placing it inside a clickable table row won't also trigger row-select.
 * Closes on outside click, Escape, blur, or after action fires.
 */
export function KebabMenu({
  actions,
  ariaLabel = 'Row actions',
  side = 'bottom-right',
}: KebabMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: globalThis.MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Filter empty actions and gate by disabled but keep them rendered for hint.
  if (actions.length === 0) return null

  const stop = (e: MouseEvent | KeyboardEvent) => {
    e.stopPropagation()
  }

  return (
    <div
      className={`kebab-wrap kebab-${side}`}
      ref={wrapRef}
      onClick={stop}
      onKeyDown={stop}
    >
      <button
        type="button"
        className={`kebab-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <Icon name="more-vertical" size={16} />
      </button>
      {open && (
        <div className="kebab-menu" role="menu">
          {actions.map(a => (
            <button
              key={a.id}
              type="button"
              role="menuitem"
              className={`kebab-item${a.destructive ? ' destructive' : ''}`}
              disabled={a.disabled}
              title={a.disabled ? a.disabledReason : undefined}
              onClick={() => {
                if (a.disabled) return
                setOpen(false)
                a.onClick()
              }}
            >
              {a.icon && <Icon name={a.icon} size={14} />}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
