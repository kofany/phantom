import { useEffect, useRef, useState } from 'react'

type AnimatedCountProps = {
  value: number
  className?: string
}

/**
 * Renders the value, and toggles `data-flash="1"` for ~600 ms whenever the
 * number changes — the actual visual is purely CSS (`@keyframes countFlash`).
 * Skips the initial mount so a fresh page load doesn't pulse every count.
 */
export function AnimatedCount({ value, className = 'nav-count' }: AnimatedCountProps) {
  const [flash, setFlash] = useState(false)
  const previous = useRef(value)
  const mounted = useRef(false)

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true
      previous.current = value
      return
    }
    if (previous.current === value) return
    previous.current = value
    setFlash(true)
    const id = window.setTimeout(() => setFlash(false), 600)
    return () => window.clearTimeout(id)
  }, [value])

  return (
    <span className={className} data-flash={flash ? '1' : undefined}>
      {value}
    </span>
  )
}
