import { ReactNode } from 'react'
import { Icon, IconName } from './Icon'

export type EmptyStateVariant = 'empty' | 'no-results' | 'error'

type EmptyStateProps = {
  /** Visual tone of the state. Controls icon-bubble colour and border. */
  variant?: EmptyStateVariant
  /** Lucide icon name — defaults per variant if omitted. */
  icon?: IconName
  title: string
  description?: string
  /** Typically a retry / reset button or a "create first X" CTA. */
  action?: ReactNode
}

const DEFAULTS: Record<EmptyStateVariant, { icon: IconName; className: string }> = {
  'empty':      { icon: 'inbox',           className: 'empty-state-empty' },
  'no-results': { icon: 'filter',          className: 'empty-state-no-results' },
  'error':      { icon: 'alert-triangle',  className: 'empty-state-error' },
}

export function EmptyState({
  variant = 'empty',
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  const defaults = DEFAULTS[variant]
  const resolvedIcon = icon ?? defaults.icon
  return (
    <div className={`empty-state ${defaults.className}`} role={variant === 'error' ? 'alert' : undefined}>
      <div className="ghost-icon">
        <Icon name={resolvedIcon} size={24} />
      </div>
      <h4>{title}</h4>
      {description && <p>{description}</p>}
      {action}
    </div>
  )
}
