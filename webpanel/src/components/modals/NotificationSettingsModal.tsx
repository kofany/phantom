import { useEffect, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Modal, Button, Icon } from '../common'
import {
  type NotificationSettings,
  type NotificationKind,
  getSettings,
  updateSettings,
  setKindEnabled,
  subscribeSettings,
  isSupported,
  getPermission,
  requestPermission,
  notifyTest,
} from '../../notifications'

type Props = {
  isOpen: boolean
  onClose: () => void
}

const KIND_KEYS: Array<{ kind: NotificationKind; labelKey: string; descKey: string }> = [
  { kind: 'bot_offline', labelKey: 'notifications.kindBotOffline', descKey: 'notifications.kindBotOfflineDesc' },
  { kind: 'bot_online',  labelKey: 'notifications.kindBotOnline',  descKey: 'notifications.kindBotOnlineDesc' },
  { kind: 'mention',     labelKey: 'notifications.kindMention',    descKey: 'notifications.kindMentionDesc' },
]

export function NotificationSettingsModal({ isOpen, onClose }: Props) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<NotificationSettings>(() => getSettings())
  const [permission, setPermission] = useState<NotificationPermission>(() => getPermission())
  const [keywordDraft, setKeywordDraft] = useState('')

  useEffect(() => {
    return subscribeSettings(setSettings)
  }, [])

  // Re-read permission on open — the user may have changed it in browser
  // settings between sessions and we want the modal to reflect reality.
  useEffect(() => {
    if (isOpen) setPermission(getPermission())
  }, [isOpen])

  const supported = isSupported()
  const granted = permission === 'granted'
  const blocked = permission === 'denied'

  const handleEnable = async () => {
    if (!supported) return
    if (!granted) {
      const next = await requestPermission()
      setPermission(next)
      if (next !== 'granted') return
    }
    updateSettings({ enabled: true })
  }

  const handleDisable = () => {
    updateSettings({ enabled: false })
  }

  const handleAddKeyword = (e: React.FormEvent) => {
    e.preventDefault()
    const k = keywordDraft.trim()
    if (!k) return
    if (settings.mentionKeywords.includes(k)) {
      setKeywordDraft('')
      return
    }
    updateSettings({ mentionKeywords: [...settings.mentionKeywords, k] })
    setKeywordDraft('')
  }

  const handleRemoveKeyword = (k: string) => {
    updateSettings({ mentionKeywords: settings.mentionKeywords.filter(x => x !== k) })
  }

  const handleTest = () => {
    const ok = notifyTest()
    if (!ok) setPermission(getPermission())
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('notifications.title')}
    >
      <div className="notification-settings">
        <p className="form-hint">{t('notifications.desc')}</p>

        {!supported && (
          <div className="form-error" role="alert">
            <Icon name="alert-triangle" size={13} />
            {t('notifications.unsupported')}
          </div>
        )}

        {supported && blocked && (
          <div className="form-error" role="alert">
            <Icon name="bell-off" size={13} />
            {t('notifications.blocked')}
          </div>
        )}

        {supported && !blocked && (
          <div className="notification-master-row">
            <div>
              <strong>{t('notifications.master')}</strong>
              <div className="form-hint">{t('notifications.masterDesc')}</div>
            </div>
            {settings.enabled ? (
              <Button size="sm" variant="ghost" onClick={handleDisable}>
                <Icon name="bell-off" size={13} />
                {t('notifications.disable')}
              </Button>
            ) : (
              <Button size="sm" variant="primary" onClick={handleEnable}>
                <Icon name="bell" size={13} />
                {t(granted ? 'notifications.enable' : 'notifications.enableAndAsk')}
              </Button>
            )}
          </div>
        )}

        {supported && settings.enabled && granted && (
          <>
            <div className="notification-section">
              <h4>{t('notifications.events')}</h4>
              <ul className="notification-kind-list">
                {KIND_KEYS.map(({ kind, labelKey, descKey }) => (
                  <li key={kind}>
                    <label className="notification-kind-row">
                      <input
                        type="checkbox"
                        checked={settings.kinds[kind]}
                        onChange={e => setKindEnabled(kind, e.target.checked)}
                      />
                      <div>
                        <strong>{t(labelKey)}</strong>
                        <div className="form-hint">{t(descKey)}</div>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </div>

            {settings.kinds.mention && (
              <div className="notification-section">
                <h4>{t('notifications.keywords')}</h4>
                <p className="form-hint">{t('notifications.keywordsDesc')}</p>
                <form onSubmit={handleAddKeyword} className="notification-keyword-form">
                  <input
                    type="text"
                    className="chset-input"
                    placeholder={t('notifications.keywordPlaceholder')}
                    value={keywordDraft}
                    onChange={e => setKeywordDraft(e.target.value)}
                    maxLength={64}
                  />
                  <Button type="submit" size="sm" disabled={!keywordDraft.trim()}>
                    <Icon name="plus" size={13} />
                    {t('common.add')}
                  </Button>
                </form>
                {settings.mentionKeywords.length > 0 && (
                  <ul className="notification-keyword-chips">
                    {settings.mentionKeywords.map(k => (
                      <li key={k} className="keyword-chip">
                        <span className="mono">{k}</span>
                        <button
                          type="button"
                          className="keyword-chip-remove"
                          onClick={() => handleRemoveKeyword(k)}
                          aria-label={t('common.remove')}
                          title={t('common.remove')}
                        >
                          <Icon name="x" size={11} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="notification-section">
              <Button size="sm" variant="ghost" onClick={handleTest}>
                <Icon name="bell" size={13} />
                {t('notifications.test')}
              </Button>
              <span className="form-hint" style={{ marginLeft: '0.6rem' }}>
                {t('notifications.testDesc')}
              </span>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
