import { ReactNode } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info'

type BadgeProps = {
  variant?: BadgeVariant
  children: ReactNode
}

export function Badge({ variant = 'default', children }: BadgeProps) {
  return (
    <span className={`badge badge-${variant}`}>
      {children}
    </span>
  )
}
