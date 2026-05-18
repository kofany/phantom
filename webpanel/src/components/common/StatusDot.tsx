type StatusDotProps = {
  state: 'online' | 'lag' | 'offline' | 'connecting'
  label?: string
}

export function StatusDot({ state, label }: StatusDotProps) {
  return (
    <span className={`status-dot ${state}`}>
      {label || state}
    </span>
  )
}
