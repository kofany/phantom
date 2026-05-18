import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Modal, Input, Button } from '../common'

type AddUserModalProps = {
  isOpen: boolean
  onClose: () => void
  onAdd: (name: string, host?: string) => void
}

export function AddUserModal({ isOpen, onClose, onAdd }: AddUserModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [host, setHost] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onAdd(name.trim(), host.trim() || undefined)
      setName('')
      setHost('')
      onClose()
    }
  }

  const handleClose = () => {
    setName('')
    setHost('')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('users.add')}>
      <form onSubmit={handleSubmit} className="modal-form">
        <Input
          label={t('users.name')}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="handle"
          autoFocus
          required
        />
        <Input
          label={t('users.host')}
          value={host}
          onChange={e => setHost(e.target.value)}
          placeholder="*!*@example.com"
        />
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            {t('common.add')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
