import { useState, useEffect } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Modal, Input, Button, Select } from '../common'

type ProtlistType = 'ban' | 'stick' | 'exempt' | 'invite' | 'reop'

type AddProtlistModalProps = {
  isOpen: boolean
  onClose: () => void
  onAdd: (listType: string, mask: string, channel?: string, reason?: string, time?: number) => void
  defaultType?: ProtlistType
  channel?: string
}

const TIME_OPTIONS = [
  { value: '0', label: 'permanent' },
  { value: '3600', label: '1h' },
  { value: '86400', label: '24h' },
  { value: '604800', label: '7d' },
  { value: '2592000', label: '30d' },
]

export function AddProtlistModal({ isOpen, onClose, onAdd, defaultType = 'ban', channel }: AddProtlistModalProps) {
  const { t } = useTranslation()
  const [listType, setListType] = useState<ProtlistType>(defaultType)

  useEffect(() => {
    if (isOpen) setListType(defaultType)
  }, [isOpen, defaultType])

  const [mask, setMask] = useState('')
  const [reason, setReason] = useState('')
  const [time, setTime] = useState('0')

  const typeOptions = [
    { value: 'ban', label: t('protlist.ban') },
    { value: 'stick', label: t('protlist.stick') },
    { value: 'exempt', label: t('protlist.exempt') },
    { value: 'invite', label: t('protlist.invite') },
    { value: 'reop', label: t('protlist.reop') },
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mask.trim()) {
      onAdd(listType, mask.trim(), channel, reason.trim() || undefined, parseInt(time) || undefined)
      setMask('')
      setReason('')
      setTime('0')
      onClose()
    }
  }

  const handleClose = () => {
    setMask('')
    setReason('')
    setTime('0')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('protlist.add')}>
      <form onSubmit={handleSubmit} className="modal-form">
        <Select
          label={t('protlist.type')}
          value={listType}
          onChange={e => setListType(e.target.value as ProtlistType)}
          options={typeOptions}
        />
        <Input
          label={t('protlist.mask')}
          value={mask}
          onChange={e => setMask(e.target.value)}
          placeholder="*!*@example.com"
          autoFocus
          required
        />
        <Input
          label={t('protlist.reason')}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={t('protlist.reasonOptional')}
        />
        <Select
          label={t('protlist.expires')}
          value={time}
          onChange={e => setTime(e.target.value)}
          options={TIME_OPTIONS}
        />
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!mask.trim()}>
            {t('common.add')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
