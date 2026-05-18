import {
  cloneElement,
  ReactElement,
  useEffect,
  useId,
  useRef,
  useState,
  CSSProperties,
} from 'react'

type Side = 'top' | 'bottom' | 'left' | 'right'

type TooltipProps = {
  content: string
  side?: Side
  /** Delay before showing in ms. Default 350. */
  delay?: number
  /** Don't render if content is empty/false. */
  disabled?: boolean
  children: ReactElement
}

/**
 * Lightweight tooltip wrapper. Renders the trigger child with onMouseEnter/Leave
 * and onFocus/Blur handlers attached. Floats absolutely positioned tooltip body
 * after `delay` ms. No portal — relies on overflow:visible on the parent stack
 * (works for header buttons, sidebar items, table rows because their parents
 * already allow overflow).
 */
export function Tooltip({
  content,
  side = 'top',
  delay = 350,
  disabled,
  children,
}: TooltipProps) {
  const [open, setOpen] = useState(false)
  const timerRef = useRef<number | null>(null)
  const id = useId()

  const cancel = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const show = () => {
    if (disabled || !content) return
    cancel()
    timerRef.current = window.setTimeout(() => setOpen(true), delay)
  }
  const hide = () => {
    cancel()
    setOpen(false)
  }

  useEffect(() => () => cancel(), [])

  const triggerProps: Record<string, unknown> = {
    onMouseEnter: show,
    onMouseLeave: hide,
    onFocus: show,
    onBlur: hide,
    'aria-describedby': open ? id : undefined,
  }

  const wrapStyle: CSSProperties = {
    position: 'relative',
    display: 'inline-flex',
  }

  return (
    <span className="tooltip-wrap" style={wrapStyle}>
      {cloneElement(children, triggerProps)}
      {open && content && (
        <span
          id={id}
          role="tooltip"
          className={`tooltip tooltip-${side}`}
        >
          {content}
        </span>
      )}
    </span>
  )
}
