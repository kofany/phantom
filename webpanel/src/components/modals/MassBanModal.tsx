import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Modal, Button, Icon, Input } from '../common'

type BanAction = 'ban' | 'stick' | 'ban_kick'

type MassBanModalProps = {
  isOpen: boolean
  onClose: () => void
  channels: string[]
  currentChannel?: string
  onBan: (mask: string, channel: string | undefined, reason: string | undefined, expires: number | undefined) => void
  onStick: (mask: string, channel: string | undefined, reason: string | undefined, expires: number | undefined) => void
  onSendCommand: (cmd: string) => void
}

type ParsedEntry = {
  raw: string
  mask: string
  kind: 'mask' | 'nick' | 'host'
  skipped?: string
}

const EXPIRY_CHIPS: { key: string; seconds: number; labelKey: string }[] = [
  { key: 'perm', seconds: 0,      labelKey: 'quickban.expPerm' },
  { key: '1h',   seconds: 3600,   labelKey: 'quickban.exp1h' },
  { key: '6h',   seconds: 21600,  labelKey: 'quickban.exp6h' },
  { key: '24h',  seconds: 86400,  labelKey: 'quickban.exp24h' },
  { key: '7d',   seconds: 604800, labelKey: 'quickban.exp7d' },
]

// A token looks like a mask when it contains ! or @. A pure-nick token is
// converted to `<nick>!*@*`; a bare hostname becomes `*!*@<host>`. Comment
// lines (# prefix) and blank lines are ignored. Each command goes through
// one hub send, so no server-side parsing logic changes.
const NICK_RE = /^[a-zA-Z0-9_\-\[\]{}^|`\\]+$/
const HOST_RE = /^[a-zA-Z0-9.\-_*]+\.[a-zA-Z0-9.\-_*]+$/

function parseLine(raw: string): ParsedEntry | null {
  const line = raw.trim()
  if (!line || line.startsWith('#')) return null
  if (line.includes('!') || line.includes('@')) {
    return { raw: line, mask: line, kind: 'mask' }
  }
  if (NICK_RE.test(line)) {
    return { raw: line, mask: `${line}!*@*`, kind: 'nick' }
  }
  if (HOST_RE.test(line)) {
    return { raw: line, mask: `*!*@${line}`, kind: 'host' }
  }
  return { raw: line, mask: line, kind: 'mask', skipped: 'unrecognised format' }
}

function dedupe(entries: ParsedEntry[]): ParsedEntry[] {
  const seen = new Set<string>()
  const out: ParsedEntry[] = []
  for (const e of entries) {
    if (seen.has(e.mask)) continue
    seen.add(e.mask)
    out.push(e)
  }
  return out
}

// Small delay between batched sends — WebSocket is happy to take them all at
// once, but the hub's penalty system may throttle a burst. 40ms per command
// keeps us comfortably under typical floor limits.
const SEND_INTERVAL_MS = 40

export function MassBanModal({
  isOpen,
  onClose,
  channels,
  currentChannel,
  onBan,
  onStick,
  onSendCommand,
}: MassBanModalProps) {
  const { t } = useTranslation()
  const [action, setAction] = useState<BanAction>('ban')
  const [targets, setTargets] = useState('')
  const [channel, setChannel] = useState<string>(currentChannel ?? '*')
  const [reason, setReason] = useState('')
  const [expiryKey, setExpiryKey] = useState<string>('24h')
  const [executing, setExecuting] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  // Cancelation flag for the send loop. Set when the user clicks
  // Cancel/closes the modal mid-execution — the loop reads it each
  // iteration and stops cleanly after the current entry.
  const cancelRef = useRef(false)

  useEffect(() => {
    if (!isOpen) return
    setAction('ban')
    setTargets('')
    setChannel(currentChannel ?? '*')
    setReason('')
    setExpiryKey('24h')
    setExecuting(false)
    setProgress(null)
    cancelRef.current = false
  }, [isOpen, currentChannel])

  const parsed = useMemo(() => {
    const lines = targets.split('\n').map(parseLine).filter((e): e is ParsedEntry => e !== null)
    return dedupe(lines)
  }, [targets])

  const validEntries = parsed.filter(e => !e.skipped)
  const skippedEntries = parsed.filter(e => !!e.skipped)

  const selectedExpiry = EXPIRY_CHIPS.find(c => c.key === expiryKey) ?? EXPIRY_CHIPS[0]
  const kickNeedsChannel = action === 'ban_kick' && channel === '*'
  const canSubmit = validEntries.length > 0 && !executing && !kickNeedsChannel

  const handleExecute = async () => {
    if (!canSubmit) return
    cancelRef.current = false
    setExecuting(true)
    setProgress({ done: 0, total: validEntries.length })

    const ch = channel === '*' ? undefined : channel
    const rs = reason.trim() || undefined
    const exp = selectedExpiry.seconds === 0 ? undefined : selectedExpiry.seconds

    for (let i = 0; i < validEntries.length; i++) {
      if (cancelRef.current) break
      const entry = validEntries[i]
      if (action === 'stick') {
        onStick(entry.mask, ch, rs, exp)
      } else {
        onBan(entry.mask, ch, rs, exp)
        if (action === 'ban_kick' && ch) {
          onSendCommand(`kick ${ch} ${entry.mask}${rs ? ` ${rs}` : ''}`)
        }
      }
      setProgress({ done: i + 1, total: validEntries.length })
      if (i < validEntries.length - 1) {
        await new Promise(r => setTimeout(r, SEND_INTERVAL_MS))
      }
    }

    // Give the user a brief moment to see completion (or the cancel
    // state), then close.
    window.setTimeout(() => {
      setExecuting(false)
      onClose()
    }, 400)
  }

  // Unified close handler: if we're mid-execution, flip the cancel flag
  // so the send loop can stop cleanly. Otherwise just close. Passed to
  // the Modal and to the Cancel button so Esc / overlay / button all
  // agree.
  const handleClose = () => {
    if (executing) {
      cancelRef.current = true
      return
    }
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('massBan.title')}>
      <div className="modal-form mass-ban-form">
        <div className="mass-kick-warning">
          <Icon name="alert-triangle" size={14} />
          <span>{t('massBan.warning')}</span>
        </div>

        <div className="filter-seg quickban-tabs">
          <button
            type="button"
            className={action === 'ban' ? 'active' : ''}
            onClick={() => setAction('ban')}
            disabled={executing}
          >
            <Icon name="shield" size={13} /> {t('massBan.modeBan')}
          </button>
          <button
            type="button"
            className={action === 'stick' ? 'active' : ''}
            onClick={() => setAction('stick')}
            disabled={executing}
          >
            <Icon name="lock" size={13} /> {t('massBan.modeStick')}
          </button>
          <button
            type="button"
            className={action === 'ban_kick' ? 'active' : ''}
            onClick={() => setAction('ban_kick')}
            disabled={executing}
          >
            <Icon name="zap" size={13} /> {t('massBan.modeBanKick')}
          </button>
        </div>

        <div className="quickban-field">
          <label className="field-label">{t('massBan.targets')}</label>
          <textarea
            className="mass-ban-textarea mono"
            value={targets}
            onChange={e => setTargets(e.target.value)}
            placeholder={t('massBan.targetsPlaceholder')}
            rows={8}
            disabled={executing}
          />
          <div className="mass-ban-help">{t('massBan.targetsHelp')}</div>
        </div>

        <div className={`quickban-field${kickNeedsChannel ? ' field-required' : ''}`}>
          <label className="field-label">
            {t('quickban.channel')}
            {kickNeedsChannel && (
              <span className="field-required-tag">{t('massBan.kickNeedsChannel')}</span>
            )}
          </label>
          <select
            value={channel}
            onChange={e => setChannel(e.target.value)}
            className="quickban-select"
            disabled={executing}
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
            disabled={executing}
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
                disabled={executing}
              >
                {t(chip.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {parsed.length > 0 && (
          <div className="mass-ban-preview">
            <div className="mass-ban-preview-head">
              <Icon name="filter" size={13} />
              <span>{t('massBan.preview')}</span>
              <span className="mono mass-ban-count">
                {t('massBan.previewCount', {
                  ok: String(validEntries.length),
                  skipped: String(skippedEntries.length),
                })}
              </span>
            </div>
            <ul className="mass-ban-preview-list">
              {validEntries.slice(0, 8).map((e, i) => (
                <li key={i} className="mass-ban-preview-row">
                  <span className="mass-ban-kind">{e.kind}</span>
                  <span className="mono">{e.mask}</span>
                  {e.raw !== e.mask && (
                    <span className="mass-ban-orig mono">({e.raw})</span>
                  )}
                </li>
              ))}
              {validEntries.length > 8 && (
                <li className="mass-ban-preview-more">
                  {t('massBan.previewMore', { n: String(validEntries.length - 8) })}
                </li>
              )}
              {skippedEntries.length > 0 && (
                <li className="mass-ban-preview-skipped">
                  <Icon name="alert-triangle" size={11} />
                  {t('massBan.skipped', { n: String(skippedEntries.length) })}: {skippedEntries.map(s => s.raw).join(', ')}
                </li>
              )}
            </ul>
          </div>
        )}

        {progress && (
          <div className="mass-ban-progress">
            <div
              className="mass-ban-progress-bar"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
            <span className="mono mass-ban-progress-label">
              {progress.done} / {progress.total}
            </span>
          </div>
        )}

        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={handleClose}>
            {executing && !cancelRef.current ? t('massBan.stop') : t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={handleExecute}
            disabled={!canSubmit}
          >
            <Icon name="zap" size={14} />
            {executing
              ? t('massBan.executing')
              : t('massBan.execute', { n: String(validEntries.length) })}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
