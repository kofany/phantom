import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import { useTranslation } from '../../hooks/useTranslation'

const KEY = 'phantom:density'
type Density = 'comfortable' | 'compact'

function loadDensity(): Density {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'compact' ? 'compact' : 'comfortable'
  } catch {
    return 'comfortable'
  }
}

function applyDensity(d: Density) {
  document.documentElement.setAttribute('data-density', d)
}

export function DensityToggle() {
  const { t } = useTranslation()
  const [density, setDensity] = useState<Density>(loadDensity)

  useEffect(() => {
    applyDensity(density)
    try { localStorage.setItem(KEY, density) } catch { /* ignore quota */ }
  }, [density])

  const next: Density = density === 'comfortable' ? 'compact' : 'comfortable'
  const label =
    density === 'compact' ? t('density.compact') : t('density.comfortable')
  const tooltip =
    density === 'compact' ? t('density.switchToComfortable') : t('density.switchToCompact')

  return (
    <button
      type="button"
      className="density-toggle"
      onClick={() => setDensity(next)}
      aria-label={tooltip}
      title={tooltip}
      data-density={density}
    >
      <Icon name={density === 'compact' ? 'menu' : 'dashboard'} size={14} />
      <span className="density-label">{label}</span>
    </button>
  )
}
