import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Modal, Input, Button, Icon } from '../common'
import { ChannelUser } from '../../types'

type BanMode = 'ban' | 'stick'

type QuickBanModalProps = {
  isOpen: boolean
  onClose: () => void
  channels: string[]
  currentChannel?: string
  channelUsers?: ChannelUser[]   // for autocomplete when viewing a channel
  knownMasks?: string[]           // recent masks from existing bans (optional)
  onBan: (mask: string, channel: string | undefined, reason: string | undefined, expires: number | undefined) => void
  onStick: (mask: string, channel: string | undefined, reason: string | undefined, expires: number | undefined) => void
}

// Chip presets for expiry — value in seconds, 0 = permanent
const EXPIRY_CHIPS: { key: string; seconds: number; labelKey: string }[] = [
  { key: 'perm', seconds: 0,      labelKey: 'quickban.expPerm' },
  { key: '1h',   seconds: 3600,   labelKey: 'quickban.exp1h' },
  { key: '6h',   seconds: 21600,  labelKey: 'quickban.exp6h' },
  { key: '24h',  seconds: 86400,  labelKey: 'quickban.exp24h' },
  { key: '7d',   seconds: 604800, labelKey: 'quickban.exp7d' },
]

export function QuickBanModal({
  isOpen,
  onClose,
  channels,
  currentChannel,
  channelUsers = [],
  knownMasks = [],
  onBan,
  onStick,
}: QuickBanModalProps) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<BanMode>('ban')
  const [mask, setMask] = useState('')
  const [channel, setChannel] = useState<string>(currentChannel ?? '*')
  const [reason, setReason] = useState('')
  const [expiryKey, setExpiryKey] = useState<string>('24h')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  // Reset state on open
  useEffect(() => {
    if (!isOpen) return
    setMode('ban')
    setMask('')
    setChannel(currentChannel ?? '*')
    setReason('')
    setExpiryKey('24h')
    setShowSuggestions(false)
    // autofocus after render
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [isOpen, currentChannel])

  // Build autocomplete suggestions: channel users + known masks, filtered by input
  const suggestions = useMemo(() => {
    const q = mask.trim().toLowerCase()
    if (!q) return []
    const fromUsers = channelUsers
      .filter(u => u.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map(u => ({
        value: `*!*@${u.name}.users.IRC`, // conservative mask placeholder
        label: u.name,
        hint: 'channel user',
      }))
    const fromMasks = knownMasks
      .filter(m => m.toLowerCase().includes(q))
      .slice(0, 5)
      .map(m => ({ value: m, label: m, hint: 'recent' }))
    // Simple nick->common masks if mask is just a word with no special chars
    const patternSuggestions: { value: string; label: string; hint: string }[] = []
    if (/^[a-zA-Z0-9_\-\[\]{}^|`]+$/.test(mask.trim())) {
      patternSuggestions.push(
        { value: `${mask.trim()}!*@*`,   label: `${mask.trim()}!*@*`,   hint: 'nick' },
        { value: `*!*@${mask.trim()}`,   label: `*!*@${mask.trim()}`,   hint: 'host' },
      )
    }
    // Dedup by value
    const seen = new Set<string>()
    return [...fromUsers, ...fromMasks, ...patternSuggestions].filter(s => {
      if (seen.has(s.value)) return false
      seen.add(s.value)
      return true
    }).slice(0, 6)
  }, [mask, channelUsers, knownMasks])

  const selectedExpiry = EXPIRY_CHIPS.find(c => c.key === expiryKey) ?? EXPIRY_CHIPS[0]

  const canSubmit = mask.trim().length > 0

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!canSubmit) return
    const m = mask.trim()
    const ch = channel === '*' ? undefined : channel
    const rs = reason.trim() || undefined
    // addProtlist uses "time" (seconds from now, 0 = permanent), per hub.addProtlist signature
    const exp = selectedExpiry.seconds === 0 ? undefined : selectedExpiry.seconds

    if (mode === 'ban') {
      onBan(m, ch, rs, exp)
    } else {
      onStick(m, ch, rs, exp)
    }
    onClose()
  }

  // Global Enter outside input field area would still work inside <form>
  const handleSuggestionClick = (value: string) => {
    setMask(value)
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('quickban.title')}>
      <form onSubmit={handleSubmit} className="modal-form quickban-form">
        <div className="filter-seg quickban-tabs">
          <button
            type="button"
            className={mode === 'ban' ? 'active' : ''}
            onClick={() => setMode('ban')}
          >
            <Icon name="shield" size={13} /> {t('quickban.modeBan')}
          </button>
          <button
            type="button"
            className={mode === 'stick' ? 'active' : ''}
            onClick={() => setMode('stick')}
          >
            <Icon name="lock" size={13} /> {t('quickban.modeStick')}
          </button>
        </div>
        <p className="quickban-blurb">{t('quickban.blurb')}</p>

        <div className="quickban-field">
          <label className="field-label">{t('quickban.mask')}</label>
          <div className="quickban-mask-wrap">
            <input
              ref={inputRef}
              className="input"
              type="text"
              value={mask}
              onChange={e => {
                setMask(e.target.value)
                setShowSuggestions(true)
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="nick!user@host or *!*@host"
              required
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="quickban-suggestions">
                {suggestions.map(s => (
                  <button
                    key={s.value}
                    type="button"
                    className="quickban-suggestion"
                    onMouseDown={e => {
                      // onMouseDown so it fires before input blur
                      e.preventDefault()
                      handleSuggestionClick(s.value)
                    }}
                  >
                    <span className="mono">{s.label}</span>
                    <span className="hint">{s.hint}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="quickban-field">
          <label className="field-label">{t('quickban.channel')}</label>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value)}
            className="quickban-select"
          >
            <option value="*">{t('quickban.allChannels')}</option>
            {channels.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className="quickban-field">
          <label className="field-label">{t('quickban.reason')}</label>
          <Input
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder={t('protlist.reasonOptional')}
          />
        </div>

        <div className="quickban-field">
          <label className="field-label">{t('quickban.expires')}</label>
          <div className="quickban-chips">
            {EXPIRY_CHIPS.map(chip => (
              <button
                key={chip.key}
                type="button"
                className={`quickban-chip ${expiryKey === chip.key ? 'active' : ''}`}
                onClick={() => setExpiryKey(chip.key)}
              >
                {t(chip.labelKey)}
              </button>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            <Icon name="shield" size={14} />
            {mode === 'ban' ? t('quickban.submitBan') : t('quickban.submitStick')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
