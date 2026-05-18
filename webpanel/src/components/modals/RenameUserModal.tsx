import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Modal, Input, Button, Icon } from '../common'

type RenameUserModalProps = {
  isOpen: boolean
  onClose: () => void
  oldHandle: string
  /** Fired with the new handle after client-side validation. The hub
   *  enforces uniqueness and replicates the rename to all bots. */
  onRename: (newHandle: string) => void
}

const HANDLE_RE = /^[A-Za-z0-9_\-\[\]\\^`{}|]{1,16}$/

export function RenameUserModal({
  isOpen,
  onClose,
  oldHandle,
  onRename,
}: RenameUserModalProps) {
  const { t } = useTranslation()
  const [newHandle, setNewHandle] = useState('')
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setNewHandle('')
    setError(null)
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = newHandle.trim()
    if (!HANDLE_RE.test(trimmed)) {
      setError(t('users.renameInvalid'))
      return
    }
    if (trimmed === oldHandle) {
      setError(t('users.renameSameHandle'))
      return
    }
    onRename(trimmed)
    reset()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t('users.renameTitle').replace('{old}', oldHandle)}
    >
      <form onSubmit={handleSubmit} className="modal-form">
        <p className="form-hint">{t('users.renameDesc')}</p>
        <Input
          label={t('users.renameNewHandle')}
          value={newHandle}
          onChange={e => {
            setNewHandle(e.target.value)
            if (error) setError(null)
          }}
          placeholder={t('users.renameNewHandlePlaceholder')}
          autoFocus
          required
        />
        {error && (
          <div className="form-error" role="alert">
            <Icon name="alert-triangle" size={13} />
            {error}
          </div>
        )}
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={!newHandle.trim() || newHandle.trim() === oldHandle}
          >
            <Icon name="pencil" size={13} />
            {t('users.renameSubmit')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
