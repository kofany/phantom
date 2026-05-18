import { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

type CopyableMonoProps = {
  /** Text to render and copy on click. */
  value: string
  /** Override for the copied payload (e.g. render a short label, copy the full mask). */
  copyText?: string
  /** Visual sizing hint — matches existing `.text-xs` / `.text-sm` / `.text-md`. */
  size?: 'xs' | 'sm' | 'md'
  /** Extra class names (forwarded onto the wrapping element). */
  className?: string
  /**
   * When `false`, click has no effect (useful when the value is `—` or empty).
   * When omitted, defaults to `true` if value is non-empty.
   */
  enabled?: boolean
  /** Accessible label override; defaults to the value itself. */
  ariaLabel?: string
}

/**
 * Click to copy. Shows a brief checkmark flash on success, reverts after 1.2 s.
 *
 * Wraps a <button> so keyboard users get the same affordance — Enter / Space
 * trigger the copy. Visual weight matches nearby `.mono` cells so the
 * component can slot into tables without disrupting rhythm.
 */
export function CopyableMono({
  value,
  copyText,
  size = 'sm',
  className = '',
  enabled,
  ariaLabel,
}: CopyableMonoProps) {
  const [copied, setCopied] = useState(false)
  const timerRef = useRef<number | null>(null)

  const canCopy = (enabled ?? !!value) && typeof navigator !== 'undefined' && !!navigator.clipboard

  const handleCopy = useCallback(() => {
    if (!canCopy) return
    const payload = copyText ?? value
    navigator.clipboard.writeText(payload).then(
      () => {
        setCopied(true)
        if (timerRef.current) window.clearTimeout(timerRef.current)
        timerRef.current = window.setTimeout(() => setCopied(false), 1200)
      },
      () => {
        // Clipboard can fail in insecure contexts; silently drop.
      },
    )
  }, [canCopy, copyText, value])

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [])

  if (!canCopy) {
    return <span className={`mono text-${size} ${className}`}>{value}</span>
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`copyable-mono mono text-${size} ${copied ? 'copyable-copied' : ''} ${className}`}
      aria-label={ariaLabel ?? `Copy ${value}`}
      title={copied ? 'Copied' : 'Click to copy'}
    >
      <span className="copyable-mono-value">{value}</span>
      <Icon
        name={copied ? 'check' : 'copy'}
        size={11}
        className="copyable-mono-icon"
      />
    </button>
  )
}
