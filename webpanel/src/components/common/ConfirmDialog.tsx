import { useTranslation } from '../../hooks/useTranslation'
import { Modal } from './Modal'
import { Button } from './Button'
import { Icon } from './Icon'

type ConfirmDialogProps = {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'primary'
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'danger',
}: ConfirmDialogProps) {
  const { t } = useTranslation()

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || t('confirm.title')}
      footer={
        <div className="confirm-actions">
          <Button variant="ghost" onClick={onClose}>
            {cancelLabel || t('common.cancel')}
          </Button>
          <Button variant={variant} onClick={handleConfirm}>
            <Icon name="trash" size={14} />
            {confirmLabel || t('common.delete')}
          </Button>
        </div>
      }
    >
      <p className="confirm-message">{message}</p>
    </Modal>
  )
}
