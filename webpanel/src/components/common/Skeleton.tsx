type SkeletonRowsProps = {
  rows?: number
  columns?: number
}

export function SkeletonRows({ rows = 4, columns = 5 }: SkeletonRowsProps) {
  const widths = ['w-md', 'w-sm', 'w-lg', 'w-md', 'w-sm']
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="skel-row" aria-hidden>
          {Array.from({ length: columns }).map((__, c) => (
            <td key={c}>
              <span className={`skel ${widths[c % widths.length]}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

type SkeletonLinesProps = {
  lines?: number
  /** Optional aria label forwarded on the wrapper for screen readers. */
  label?: string
  /** When embedded inside another status region (e.g. SkeletonPanel), set
   *  false to avoid nested landmarks. Default true (standalone use). */
  standalone?: boolean
}

export function SkeletonLines({ lines = 5, label, standalone = true }: SkeletonLinesProps) {
  const widths = ['w-1', 'w-2', 'w-3', 'w-2', 'w-4', 'w-1']
  const ariaProps = standalone
    ? { 'aria-label': label, 'aria-busy': true as const, role: 'status' }
    : {}
  return (
    <div className="skel-lines" {...ariaProps}>
      {Array.from({ length: lines }).map((_, i) => (
        <span key={i} className={`skel skel-line ${widths[i % widths.length]}`} />
      ))}
    </div>
  )
}

type SkeletonPanelProps = {
  /** Body rows to render. Default 6. */
  lines?: number
  /** Render a header row of two shorter shimmers above the body. */
  header?: boolean
  label?: string
}

export function SkeletonPanel({ lines = 6, header = true, label }: SkeletonPanelProps) {
  return (
    <div className="skel-panel" aria-label={label} aria-busy="true" role="status">
      {header && (
        <div className="skel-panel-header" aria-hidden>
          <span className="skel w-sm" />
          <span className="skel w-md" />
        </div>
      )}
      <SkeletonLines lines={lines} standalone={false} />
    </div>
  )
}
