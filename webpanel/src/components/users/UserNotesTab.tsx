import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, Icon, EmptyState, ConfirmDialog } from '../common'
import { UserInfo } from '../../types'

type UserNotesTabProps = {
  userName: string
  info: UserInfo[]
  onAddInfo?: (key: string, value: string) => void   // .+info <handle> <key> <value>
  onDelInfo?: (key: string) => void                  // .-info <handle> <key>
  canEdit: boolean
}

export function UserNotesTab({ userName, info, onAddInfo, onDelInfo, canEdit }: UserNotesTabProps) {
  const { t } = useTranslation()
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleAdd = () => {
    if (!canEdit || !onAddInfo) return
    const key = newKey.trim()
    const value = newValue.trim()
    if (!key || !value) return
    onAddInfo(key, value)
    setNewKey('')
    setNewValue('')
  }

  const handleSaveEdit = (key: string) => {
    if (!canEdit || !onAddInfo) return
    const v = editValue.trim()
    if (!v) return
    // psotnic +info replaces existing key value, no need to delete first
    onAddInfo(key, v)
    setEditingKey(null)
  }

  return (
    <div className="notes-panel">
      <div className="notes-header">
        <p className="config-desc">{t('userNotes.desc').replace('{user}', userName)}</p>
      </div>

      {canEdit && onAddInfo && (
        <div className="notes-add">
          <input
            type="text"
            className="input notes-add-key"
            placeholder={t('userNotes.keyPlaceholder')}
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
          <input
            type="text"
            className="input notes-add-value"
            placeholder={t('userNotes.valuePlaceholder')}
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
          <Button onClick={handleAdd} disabled={!newKey.trim() || !newValue.trim()}>
            <Icon name="plus" size={13} />
            {t('userNotes.addBtn')}
          </Button>
        </div>
      )}

      {info.length === 0 ? (
        <EmptyState
          icon="inbox"
          title={t('userNotes.emptyTitle')}
          description={canEdit ? t('userNotes.emptyDescAdmin') : t('userNotes.emptyDesc')}
        />
      ) : (
        <div className="notes-list">
          {info.map(entry => (
            <div key={entry.key} className="notes-row">
              <span className="notes-key mono">{entry.key}</span>
              {editingKey === entry.key ? (
                <>
                  <input
                    type="text"
                    className="input"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    autoFocus
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleSaveEdit(entry.key)
                      else if (e.key === 'Escape') setEditingKey(null)
                    }}
                  />
                  <div className="notes-actions">
                    <Button size="sm" onClick={() => handleSaveEdit(entry.key)}>✓</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingKey(null)}>✕</Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="notes-value">{entry.value}</span>
                  {canEdit && (
                    <div className="notes-actions">
                      {onAddInfo && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingKey(entry.key); setEditValue(entry.value) }}
                          title={t('common.edit')}
                          aria-label={t('common.edit')}
                        >
                          <Icon name="pencil" size={11} />
                        </Button>
                      )}
                      {onDelInfo && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmDelete(entry.key)}
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                        >
                          <Icon name="trash" size={11} />
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => { if (confirmDelete && onDelInfo) onDelInfo(confirmDelete) }}
        message={t('userNotes.confirmDelete').replace('{key}', confirmDelete || '')}
      />
    </div>
  )
}
