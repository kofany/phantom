import { useState, useEffect } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Modal, Button, Icon } from '../common'

type MassKickModalProps = {
  isOpen: boolean
  onClose: () => void
  channel: string
  onMassKick: (tier: 'o' | 'n' | 'a', lock: boolean) => void
}

type Tier = 'o' | 'n' | 'a'

/**
 * .mk <o|n|a> <chan> [lock]
 *   o — kick all that don't have +o (operators)
 *   n — kick all that don't have +n (owners)
 *   a — kick everyone (anyone)
 *   lock — additionally activate op-lockdown
 *
 * Used as an emergency response to spam waves, takeover attempts, etc.
 */
export function MassKickModal({ isOpen, onClose, channel, onMassKick }: MassKickModalProps) {
  const { t } = useTranslation()
  const [tier, setTier] = useState<Tier>('o')
  const [lock, setLock] = useState(false)

  useEffect(() => {
    if (isOpen) { setTier('o'); setLock(false) }
  }, [isOpen])

  const handleSubmit = () => {
    onMassKick(tier, lock)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('massKick.title').replace('{chan}', channel)}>
      <div className="mass-kick-form">
        <div className="mass-kick-warning">
          <Icon name="alert-triangle" size={14} />
          <span>{t('massKick.warning')}</span>
        </div>

        <div className="mass-kick-section">
          <div className="field-label">{t('massKick.tierLabel')}</div>
          <div className="mass-kick-tiers">
            {(['o', 'n', 'a'] as const).map(tv => (
              <button
                key={tv}
                type="button"
                className={`mass-kick-tier ${tier === tv ? 'active' : ''} tier-${tv}`}
                onClick={() => setTier(tv)}
              >
                <div className="mass-kick-tier-name">{t(`massKick.tier.${tv}.name`)}</div>
                <div className="mass-kick-tier-desc">{t(`massKick.tier.${tv}.desc`)}</div>
              </button>
            ))}
          </div>
        </div>

        <label className="mass-kick-lock">
          <input type="checkbox" checked={lock} onChange={e => setLock(e.target.checked)} />
          <div>
            <div className="mass-kick-lock-name">{t('massKick.lockLabel')}</div>
            <div className="mass-kick-lock-desc">{t('massKick.lockDesc')}</div>
          </div>
        </label>

        <div className="mass-kick-summary">
          <span className="mono">.mk {tier} {channel}{lock ? ' lock' : ''}</span>
        </div>

        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={handleSubmit}>
            <Icon name="alert-triangle" size={14} />
            {t('massKick.executeBtn')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
