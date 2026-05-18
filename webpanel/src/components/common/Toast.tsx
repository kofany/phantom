import { useEffect, useRef, useState } from 'react'
import { Icon, IconName } from './Icon'
import { pushToHistory } from '../../toastHistory'

type ToastType = 'success' | 'error' | 'info' | 'warning'

type ToastOptions = {
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

type ToastMessage = {
  id: number
  type: ToastType
  message: string
  duration: number
  action?: ToastOptions['action']
}

let toastId = 0
let addToastFn:
  | ((type: ToastType, message: string, options?: ToastOptions) => void)
  | null = null

// Dedupe identical messages fired within this window (ms).
const DEDUPE_WINDOW = 1500
const recentToasts = new Map<string, number>()

export function toast(
  type: ToastType,
  message: string,
  options?: ToastOptions,
) {
  const key = `${type}:${message}`
  const now = Date.now()
  const last = recentToasts.get(key)
  if (last && now - last < DEDUPE_WINDOW) return
  recentToasts.set(key, now)
  // Always push to history — even if the live container isn't mounted yet
  // (e.g. during the brief login → dashboard transition the user wouldn't
  // miss the toast in the bell panel).
  pushToHistory(type, message)
  if (addToastFn) {
    addToastFn(type, message, options)
  }
}

const ICONS: Record<ToastType, IconName> = {
  success: 'check',
  error: 'alert-triangle',
  warning: 'alert-triangle',
  info: 'help-circle',
}

function ToastItem({
  toast: t,
  onDismiss,
}: {
  toast: ToastMessage
  onDismiss: (id: number) => void
}) {
  const [paused, setPaused] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const remaining = useRef(t.duration)
  const lastStart = useRef(Date.now())

  useEffect(() => {
    if (paused) {
      remaining.current -= Date.now() - lastStart.current
      return
    }
    lastStart.current = Date.now()
    const id = window.setTimeout(() => {
      setLeaving(true)
      window.setTimeout(() => onDismiss(t.id), 200)
    }, Math.max(remaining.current, 0))
    return () => window.clearTimeout(id)
  }, [paused, t.id, onDismiss])

  const dismiss = () => {
    setLeaving(true)
    window.setTimeout(() => onDismiss(t.id), 200)
  }

  return (
    <div
      className={`toast toast-${t.type}${leaving ? ' toast-leaving' : ''}`}
      role={t.type === 'error' ? 'alert' : 'status'}
      aria-live={t.type === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className="toast-icon" aria-hidden="true">
        <Icon name={ICONS[t.type]} size={16} />
      </span>
      <span className="toast-message">{t.message}</span>
      {t.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            t.action!.onClick()
            dismiss()
          }}
        >
          {t.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast-dismiss"
        aria-label="Dismiss"
        onClick={dismiss}
      >
        <Icon name="x" size={14} />
      </button>
      <span
        className="toast-progress"
        style={{
          animationDuration: `${t.duration}ms`,
          animationPlayState: paused ? 'paused' : 'running',
        }}
        aria-hidden="true"
      />
    </div>
  )
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  useEffect(() => {
    addToastFn = (
      type: ToastType,
      message: string,
      options?: ToastOptions,
    ) => {
      const id = ++toastId
      const duration = options?.duration ?? (type === 'error' ? 6000 : 4000)
      setToasts(prev => {
        const next = [...prev, { id, type, message, duration, action: options?.action }]
        // Cap to 5 simultaneous; drop oldest.
        return next.length > 5 ? next.slice(next.length - 5) : next
      })
    }
    return () => {
      addToastFn = null
    }
  }, [])

  const removeToast = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div className="toast-container" aria-live="polite">
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={removeToast} />
      ))}
    </div>
  )
}
