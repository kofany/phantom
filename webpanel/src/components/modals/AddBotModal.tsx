import { useMemo, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Modal, Input, Button, Icon } from '../common'

type BotType = 'l' | 's' | 'h'

type AddBotModalProps = {
  isOpen: boolean
  onClose: () => void
  onAdd: (
    name: string,
    ip: string,
    opts: { typeFlag: BotType; password?: string },
  ) => void
}

const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/
const IPV6_RE = /^(?:[0-9a-f]{1,4}:){1,7}[0-9a-f]{0,4}$/i
const HANDLE_RE = /^[A-Za-z][A-Za-z0-9_`\-\[\]\\{}|^]{0,8}$/
const PASS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function generatePassword(length = 16): string {
  const buf = new Uint32Array(length)
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += PASS_ALPHABET[buf[i] % PASS_ALPHABET.length]
  }
  return out
}

export function AddBotModal({ isOpen, onClose, onAdd }: AddBotModalProps) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [ip, setIp] = useState('')
  const [typeFlag, setTypeFlag] = useState<BotType>('l')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [touched, setTouched] = useState({ name: false, ip: false })

  const reset = () => {
    setName('')
    setIp('')
    setTypeFlag('l')
    setPassword('')
    setShowPassword(false)
    setTouched({ name: false, ip: false })
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const nameError = useMemo(() => {
    if (!touched.name) return undefined
    const v = name.trim()
    if (!v) return t('bots.errNameRequired')
    if (!HANDLE_RE.test(v)) return t('bots.errInvalidHandle')
    return undefined
  }, [name, touched.name, t])

  const ipError = useMemo(() => {
    if (!touched.ip) return undefined
    const v = ip.trim()
    if (!v) return t('bots.errIpRequired')
    if (!IPV4_RE.test(v) && !IPV6_RE.test(v)) return t('bots.errInvalidIp')
    return undefined
  }, [ip, touched.ip, t])

  const canSubmit =
    HANDLE_RE.test(name.trim()) &&
    (IPV4_RE.test(ip.trim()) || IPV6_RE.test(ip.trim()))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setTouched({ name: true, ip: true })
    if (!canSubmit) return
    onAdd(name.trim(), ip.trim(), {
      typeFlag,
      password: password.trim() || undefined,
    })
    reset()
    onClose()
  }

  const types: { flag: BotType; key: string }[] = [
    { flag: 'l', key: 'leaf' },
    { flag: 's', key: 'slave' },
    { flag: 'h', key: 'main' },
  ]

  // Plan-ahead summary mirrors the partyline workflow so admins can verify
  // exactly what the panel will send to the hub.
  const plan = useMemo(() => {
    const lines: string[] = []
    const n = name.trim() || '<handle>'
    const i = ip.trim() || '<ip>'
    lines.push(`.+bot ${n} ${i}`)
    lines.push(`.chattr ${n} +${typeFlag}`)
    if (password.trim()) lines.push(`.chpass ${n} ${'•'.repeat(Math.min(password.trim().length, 16))}`)
    return lines
  }, [name, ip, typeFlag, password])

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title={t('bots.add')}>
      <form onSubmit={handleSubmit} className="modal-form add-bot-form">
        <div className="form-grid-2">
          <Input
            label={t('bots.name')}
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={() => setTouched(s => ({ ...s, name: true }))}
            placeholder="bot1"
            autoComplete="off"
            spellCheck={false}
            autoFocus
            required
            error={nameError}
          />
          <Input
            label={t('bots.ip')}
            value={ip}
            onChange={e => setIp(e.target.value)}
            onBlur={() => setTouched(s => ({ ...s, ip: true }))}
            placeholder="192.168.1.10"
            autoComplete="off"
            spellCheck={false}
            required
            error={ipError}
          />
        </div>

        <fieldset className="form-fieldset bot-type-fieldset">
          <legend>{t('bots.typeLegend')}</legend>
          <div className="bot-type-grid">
            {types.map(({ flag, key }) => (
              <label
                key={flag}
                className={`bot-type-card${typeFlag === flag ? ' active' : ''}`}
              >
                <input
                  type="radio"
                  name="bot-type"
                  value={flag}
                  checked={typeFlag === flag}
                  onChange={() => setTypeFlag(flag)}
                />
                <div className="bot-type-card-head">
                  <span className="bot-type-name">{t(`bots.type.${key}`)}</span>
                  <code className="bot-type-flag">+{flag}</code>
                </div>
                <span className="form-hint">{t(`bots.type.${key}Desc`)}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="password-field">
          <label className="password-field-label" htmlFor="add-bot-pass">
            <span>{t('bots.linkPassword')}</span>
            <span className="form-hint">{t('bots.linkPasswordHint')}</span>
          </label>
          <div className="password-field-row">
            <input
              id="add-bot-pass"
              type={showPassword ? 'text' : 'password'}
              className="input mono"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('bots.linkPasswordPlaceholder')}
              autoComplete="new-password"
              spellCheck={false}
            />
            <button
              type="button"
              className="icon-btn"
              onClick={() => setShowPassword(s => !s)}
              title={showPassword ? t('common.hide') : t('common.show')}
              aria-label={showPassword ? t('common.hide') : t('common.show')}
            >
              <Icon name={showPassword ? 'eye-off' : 'eye'} size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setPassword(generatePassword(16))
                setShowPassword(true)
              }}
              title={t('bots.generatePassword')}
              aria-label={t('bots.generatePassword')}
            >
              <Icon name="refresh" size={16} />
            </button>
          </div>
        </div>

        <div className="add-bot-plan" aria-label={t('bots.planPreview')}>
          <div className="add-bot-plan-title">
            <Icon name="terminal" size={13} />
            <span>{t('bots.planPreview')}</span>
          </div>
          <ol className="add-bot-plan-list">
            {plan.map((line, idx) => (
              <li key={idx}>
                <code>{line}</code>
              </li>
            ))}
          </ol>
        </div>

        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {t('common.add')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
