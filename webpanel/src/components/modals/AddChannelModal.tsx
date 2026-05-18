import { useMemo, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Modal, Input, Button } from '../common'
import { Bot } from '../../types'

type Mode = 'all' | 'selected'

type AddChannelModalProps = {
  isOpen: boolean
  onClose: () => void
  /** Permanent: add channel to userlist — all bots auto-join now and after restart */
  onAdd: (channel: string, key?: string) => void
  /** Temporary: send .rjoin to a chosen subset of bots — no userlist change.
   *  When `delaySeconds > 0`, the caller staggers the rjoins (one bot every
   *  `delaySeconds` seconds) instead of firing them all at once. */
  onSelectiveJoin?: (
    channel: string,
    key: string | undefined,
    bots: string[],
    delaySeconds: number,
  ) => void
  /** Issue a .mjoin with stagger after the channel is added — used in the
   *  "all bots" mode when user wants the join itself to be paced. */
  onMassJoin?: (
    channel: string,
    key: string | undefined,
    delaySeconds: number,
  ) => void
  bots?: Bot[]
}

export function AddChannelModal({
  isOpen,
  onClose,
  onAdd,
  onSelectiveJoin,
  onMassJoin,
  bots = [],
}: AddChannelModalProps) {
  const { t } = useTranslation()
  const [channel, setChannel] = useState('')
  const [key, setKey] = useState('')
  const [mode, setMode] = useState<Mode>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [delay, setDelay] = useState('')

  const delaySeconds = (() => {
    const n = parseInt(delay, 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  })()

  const onlineBots = useMemo(
    () => bots.filter(b => b.online).sort((a, b) => a.name.localeCompare(b.name)),
    [bots],
  )
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return onlineBots
    return onlineBots.filter(
      b =>
        b.name.toLowerCase().includes(q) ||
        b.nick?.toLowerCase().includes(q) ||
        b.server?.toLowerCase().includes(q),
    )
  }, [onlineBots, search])

  const visibleSelected = filtered.filter(b => selected.has(b.name)).length
  const allVisibleSelected = filtered.length > 0 && visibleSelected === filtered.length
  const someVisibleSelected = visibleSelected > 0 && !allVisibleSelected

  const toggle = (name: string) =>
    setSelected(s => {
      const next = new Set(s)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })

  const toggleAllVisible = () =>
    setSelected(s => {
      const next = new Set(s)
      if (allVisibleSelected) {
        for (const b of filtered) next.delete(b.name)
      } else {
        for (const b of filtered) next.add(b.name)
      }
      return next
    })

  const reset = () => {
    setChannel('')
    setKey('')
    setMode('all')
    setSelected(new Set())
    setSearch('')
    setDelay('')
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const canSubmit =
    channel.trim().length > 0 && (mode === 'all' || selected.size > 0)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    const ch = channel.trim()
    const k = key.trim() || undefined
    if (mode === 'all') {
      onAdd(ch, k)
      if (delaySeconds > 0 && onMassJoin) {
        onMassJoin(ch, k, delaySeconds)
      }
    } else if (onSelectiveJoin) {
      onSelectiveJoin(ch, k, Array.from(selected), delaySeconds)
    }
    reset()
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('channels.add')}>
      <form onSubmit={handleSubmit} className="modal-form">
        <Input
          label={t('channels.name')}
          value={channel}
          onChange={e => setChannel(e.target.value)}
          placeholder="#channel"
          autoFocus
          required
        />
        <Input
          label={t('channels.key')}
          value={key}
          onChange={e => setKey(e.target.value)}
          placeholder={t('channels.keyOptional')}
        />

        <fieldset className="form-fieldset">
          <legend>{t('channels.joinMode')}</legend>

          <label className={`radio-row${mode === 'all' ? ' active' : ''}`}>
            <input
              type="radio"
              name="join-mode"
              value="all"
              checked={mode === 'all'}
              onChange={() => setMode('all')}
            />
            <div className="radio-row-text">
              <strong>{t('channels.joinAll')}</strong>
              <span className="form-hint">{t('channels.joinAllHint')}</span>
            </div>
          </label>

          <label
            className={`radio-row${mode === 'selected' ? ' active' : ''}${
              onlineBots.length === 0 ? ' disabled' : ''
            }`}
          >
            <input
              type="radio"
              name="join-mode"
              value="selected"
              checked={mode === 'selected'}
              onChange={() => setMode('selected')}
              disabled={onlineBots.length === 0 || !onSelectiveJoin}
            />
            <div className="radio-row-text">
              <strong>{t('channels.joinSelected')}</strong>
              <span className="form-hint">
                {onlineBots.length === 0
                  ? t('channels.noOnlineBots')
                  : t('channels.joinSelectedHint')}
              </span>
            </div>
          </label>
        </fieldset>

        {mode === 'selected' && onlineBots.length > 0 && (
          <div className="bot-picker">
            <div className="bot-picker-toolbar">
              <input
                type="text"
                className="bot-picker-search"
                placeholder={t('channels.searchBots')}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <label className="bot-picker-all">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  ref={el => {
                    if (el) el.indeterminate = someVisibleSelected
                  }}
                  onChange={toggleAllVisible}
                />
                {allVisibleSelected
                  ? t('channels.deselectAll')
                  : t('channels.selectAll')}
              </label>
              <span className="bot-picker-count">
                {selected.size} / {onlineBots.length}
              </span>
            </div>

            {filtered.length === 0 ? (
              <div className="bot-picker-empty">{t('channels.noMatches')}</div>
            ) : (
              <ul className="bot-picker-list">
                {filtered.map(b => (
                  <li key={b.name}>
                    <label className="bot-picker-item">
                      <input
                        type="checkbox"
                        checked={selected.has(b.name)}
                        onChange={() => toggle(b.name)}
                      />
                      <span className="bot-picker-name">{b.name}</span>
                      {b.server && (
                        <span className="bot-picker-server">{b.server}</span>
                      )}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <label className="delay-field">
          <span className="delay-field-label">
            {t('channels.joinDelay')}
            <span className="form-hint">
              {mode === 'all'
                ? t('channels.joinDelayHintAll')
                : t('channels.joinDelayHintSelected')}
            </span>
          </span>
          <input
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            placeholder="0"
            value={delay}
            onChange={e => setDelay(e.target.value.replace(/[^\d]/g, ''))}
          />
          <span className="delay-field-suffix">s</span>
        </label>

        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {mode === 'all'
              ? t('common.add')
              : t('channels.joinNow', { n: String(selected.size) })}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
