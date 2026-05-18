import { Component, ErrorInfo, ReactNode } from 'react'
import { Icon } from './Icon'
import { Button } from './Button'
import { useTranslation } from '../../hooks/useTranslation'

type ErrorBoundaryProps = {
  /**
   * Optional override for the fallback UI. Receives the caught error and a
   * reset callback that clears the boundary's error state so the children can
   * re-mount. If omitted, a default panel-style fallback is rendered.
   */
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode)
  /**
   * Re-mount boundary when this key changes. Used to automatically recover
   * after navigation (e.g. user switches to a different bot after a crash).
   */
  resetKey?: string | number
  /** Optional label shown in the default fallback to aid debugging. */
  scope?: string
  /** Use the compact in-pane styling rather than the full-panel fallback. */
  inline?: boolean
  /** Fired once per caught error. Safe to use for toast/telemetry. */
  onError?: (error: Error, info: ErrorInfo) => void
  children: ReactNode
}

type ErrorBoundaryState = {
  error: Error | null
}

function DefaultFallback({
  error,
  scope,
  onReset,
  inline,
}: {
  error: Error
  scope?: string
  onReset: () => void
  inline?: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className={`error-boundary${inline ? ' inline' : ''}`} role="alert">
      <div className="error-boundary-icon">
        <Icon name="alert-triangle" size={inline ? 22 : 28} />
      </div>
      <h3>{t('boundary.title')}</h3>
      {scope && <p className="error-boundary-scope mono">scope: {scope}</p>}
      <p className="error-boundary-msg mono">{error.message || String(error)}</p>
      <p className="error-boundary-hint">{t('boundary.hint')}</p>
      <div className="error-boundary-actions">
        <Button size="sm" variant="primary" onClick={onReset}>
          <Icon name="activity" size={13} />
          {t('boundary.retry')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => window.location.reload()}
        >
          {t('boundary.reload')}
        </Button>
      </div>
      {import.meta.env.DEV && error.stack && (
        <details className="error-boundary-stack">
          <summary>{t('boundary.stack')}</summary>
          <pre className="mono">{error.stack}</pre>
        </details>
      )}
    </div>
  )
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidUpdate(prev: ErrorBoundaryProps) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface errors clearly — webpanel has no telemetry, so the console is
    // the only trail. Keep this even in production.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', this.props.scope || 'unknown', error, info)
    this.props.onError?.(error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const { fallback, scope, inline } = this.props
    if (typeof fallback === 'function') return fallback(error, this.reset)
    if (fallback !== undefined) return fallback

    return <DefaultFallback error={error} scope={scope} onReset={this.reset} inline={inline} />
  }
}
