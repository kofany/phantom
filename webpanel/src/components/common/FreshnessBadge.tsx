import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useTranslation } from '../../hooks/useTranslation'

type FreshnessBadgeProps = {
  /** Wall-clock ms of the last successful refresh. `null` if never fetched yet. */
  fetchedAt: number | null
  /** Above this age (s) the badge turns warm to suggest a manual refresh. */
  warnAfterSec?: number
  /** Optional click handler — typically a force-refresh of the list. */
  onRefresh?: () => void
}

function formatAge(seconds: number, t: (k: string, p?: Record<string, string>) => string): string {
  if (seconds < 5) return t('freshness.justNow')
  if (seconds < 60) return t('freshness.secondsAgo', { n: String(seconds) })
  if (seconds < 3600) return t('freshness.minutesAgo', { n: String(Math.floor(seconds / 60)) })
  return t('freshness.hoursAgo', { n: String(Math.floor(seconds / 3600)) })
}

/**
 * Small pill in view headers showing how stale the data is. Self-ticks every
 * second. When older than `warnAfterSec`, switches to warm color so the user
 * knows the snapshot may not reflect reality. Click triggers `onRefresh`.
 */
export function FreshnessBadge({
  fetchedAt,
  warnAfterSec = 30,
  onRefresh,
}: FreshnessBadgeProps) {
  const { t } = useTranslation()
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  if (fetchedAt == null) {
    return (
      <span className="freshness-badge freshness-badge-pending">
        <Icon name="clock" size={11} />
        {t('freshness.pending')}
      </span>
    )
  }

  const ageSec = Math.max(0, Math.floor((now - fetchedAt) / 1000))
  const stale = ageSec >= warnAfterSec
  const Tag = onRefresh ? 'button' : 'span'

  return (
    <Tag
      type={onRefresh ? 'button' : undefined}
      onClick={onRefresh}
      className={`freshness-badge${stale ? ' freshness-badge-stale' : ''}${onRefresh ? ' freshness-badge-clickable' : ''}`}
      title={onRefresh ? t('freshness.clickToRefresh') : undefined}
    >
      <Icon name="clock" size={11} />
      {formatAge(ageSec, t)}
    </Tag>
  )
}
