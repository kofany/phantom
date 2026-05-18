import { ReactNode } from 'react'
import { Icon } from './Icon'

export type BreadcrumbItem = {
  label: string
  /** Click handler — omitted on the trailing (current) crumb. */
  onClick?: () => void
  /** Render the label in monospace (handles, channel names, mask). */
  mono?: boolean
}

type BreadcrumbsProps = {
  items: BreadcrumbItem[]
  /** Optional trailing slot — status pill, actions, etc. */
  trailing?: ReactNode
}

/**
 * Horizontal crumb row used as the top of detail views. Replaces the old
 * pattern of "back-arrow button + h2 + status dot". The crumbs themselves
 * become the navigation (clicking the parent crumb routes back); the
 * trailing slot is reserved for per-page meta like status or actions.
 */
export function Breadcrumbs({ items, trailing }: BreadcrumbsProps) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1
          const content = (
            <span className={item.mono ? 'mono' : undefined}>{item.label}</span>
          )
          return (
            <li key={idx} className={`crumb ${isLast ? 'crumb-current' : ''}`}>
              {item.onClick && !isLast ? (
                <button
                  type="button"
                  className="crumb-link"
                  onClick={item.onClick}
                >
                  {content}
                </button>
              ) : (
                <span className="crumb-static" aria-current={isLast ? 'page' : undefined}>
                  {content}
                </span>
              )}
              {!isLast && (
                <Icon name="chevron-right" size={12} className="crumb-sep" aria-hidden />
              )}
            </li>
          )
        })}
      </ol>
      {trailing && <div className="breadcrumbs-trailing">{trailing}</div>}
    </nav>
  )
}
