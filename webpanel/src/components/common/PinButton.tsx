import { useEffect, useState } from 'react'
import { Icon } from './Icon'
import {
  FavoriteKind, isPinned, togglePinned, subscribePinned,
} from '../../favorites'

type PinButtonProps = {
  kind: FavoriteKind
  name: string
  compact?: boolean
}

/**
 * Small toggle that pins/unpins the current resource to the sidebar.
 * Reacts live to external changes (another tab pinning the same item).
 */
export function PinButton({ kind, name, compact = false }: PinButtonProps) {
  const [pinned, setPinned] = useState(() => isPinned(kind, name))

  useEffect(() => {
    setPinned(isPinned(kind, name))
    const unsub = subscribePinned(() => setPinned(isPinned(kind, name)))
    return unsub
  }, [kind, name])

  return (
    <button
      type="button"
      className={`pin-btn ${pinned ? 'pinned' : ''} ${compact ? 'compact' : ''}`}
      onClick={() => togglePinned(kind, name)}
      aria-pressed={pinned}
      title={pinned ? 'Unpin' : 'Pin to sidebar'}
    >
      <Icon name={pinned ? 'check' : 'plus'} size={12} />
      {!compact && <span>{pinned ? 'Pinned' : 'Pin'}</span>}
    </button>
  )
}
