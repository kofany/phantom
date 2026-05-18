import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Badge, Button, Icon, EmptyState, StatusDot } from '../common'

/**
 * Telegram notifier setup wizard.
 *
 * Goal: take a non-technical operator from "I have a bot token + chat_id"
 * to a working `.env.notifier` file on the notifier host, without making them
 * read systemd docs or shell-quote anything.
 *
 * Security model:
 * - The token is only ever held in this component's local state. It is
 *   sent directly to api.telegram.org from the browser when the user
 *   clicks "Validate" or "Test"; it never touches our backend, never
 *   gets persisted in localStorage. Reload = forget.
 * - The user pastes the token here once to validate it works, then
 *   copies the generated `.env.notifier` block to their target host via
 *   SSH. From that moment forward only the server has the token.
 * - We never log the token client-side either (no console.log, no
 *   error responses that include it).
 */

type ValidationState = 'idle' | 'checking' | 'ok' | 'fail'

type BotInfo = {
  username: string
  first_name: string
}

type NotifierStatus = {
  unit: string
  installed: boolean
  active: boolean
  state: string
  sub_state: string
  enabled: boolean
  unit_file_state: string
  main_pid: number | null
  started_at: string | null
  restarts: number
  authenticated: boolean
  seeded_bots: number | null
  env: {
    present: boolean
    path: string
    hub_host?: string | null
    hub_port?: string | null
    hub_ssl?: boolean
    handle?: string | null
    panel_url?: string | null
    telegram_chat_id?: string | null
    telegram_token_configured?: boolean
    hub_password_configured?: boolean
  }
  recent_logs: string[]
  error: string | null
}

const TOKEN_RE = /^\d+:[A-Za-z0-9_-]{30,}$/
const CHAT_ID_RE = /^-?\d+$/
const SESSION_TOKEN_KEY = 'phantom_session_token'
const MAX_PANEL_MESSAGE = 3500

export function TelegramSetup() {
  const { t } = useTranslation()
  const [token, setToken] = useState('')
  const [chatId, setChatId] = useState('')
  const [serviceHandle, setServiceHandle] = useState('tgnotifier')
  const [servicePassword, setServicePassword] = useState('')
  const [hubHost, setHubHost] = useState('127.0.0.1')
  const [hubPort, setHubPort] = useState('5555')
  const [hubSsl, setHubSsl] = useState(false)
  const [showToken, setShowToken] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const [tokenValidation, setTokenValidation] = useState<ValidationState>('idle')
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [botInfo, setBotInfo] = useState<BotInfo | null>(null)

  const [chatTest, setChatTest] = useState<ValidationState>('idle')
  const [chatTestError, setChatTestError] = useState<string | null>(null)
  const [notifierStatus, setNotifierStatus] = useState<NotifierStatus | null>(null)
  const [notifierStatusError, setNotifierStatusError] = useState<string | null>(null)
  const [notifierStatusLoading, setNotifierStatusLoading] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [panelMessage, setPanelMessage] = useState('')
  const [panelMessageState, setPanelMessageState] = useState<ValidationState>('idle')
  const [panelMessageError, setPanelMessageError] = useState<string | null>(null)

  // Re-validate state when inputs change so stale OK badges don't lie.
  useEffect(() => {
    setTokenValidation('idle')
    setBotInfo(null)
    setTokenError(null)
  }, [token])
  useEffect(() => {
    setChatTest('idle')
    setChatTestError(null)
  }, [chatId, token])

  const refreshNotifierStatus = async () => {
    setNotifierStatusLoading(true)
    setNotifierStatusError(null)
    try {
      const res = await fetch('/api/notifier-status', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json()
      setNotifierStatus(body)
      if (!body.active) setShowSetup(true)
    } catch (e) {
      setNotifierStatusError((e as Error).message)
    } finally {
      setNotifierStatusLoading(false)
    }
  }

  useEffect(() => {
    refreshNotifierStatus()
    const timer = window.setInterval(refreshNotifierStatus, 30000)
    return () => window.clearInterval(timer)
  }, [])

  const tokenLooksValid = TOKEN_RE.test(token.trim())
  const chatIdLooksValid = CHAT_ID_RE.test(chatId.trim())
  const passwordOk = servicePassword.length >= 8

  // ── Telegram API calls ──────────────────────────────────────────────

  const validateToken = async () => {
    if (!tokenLooksValid) return
    setTokenValidation('checking')
    setTokenError(null)
    try {
      const res = await fetch(`https://api.telegram.org/bot${token.trim()}/getMe`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setTokenValidation('fail')
        setTokenError(body.description ?? `HTTP ${res.status}`)
        return
      }
      const body = await res.json()
      if (body.ok && body.result) {
        setTokenValidation('ok')
        setBotInfo({
          username: body.result.username,
          first_name: body.result.first_name,
        })
      } else {
        setTokenValidation('fail')
        setTokenError(body.description ?? 'unknown')
      }
    } catch (e) {
      setTokenValidation('fail')
      setTokenError((e as Error).message)
    }
  }

  const sendTestMessage = async () => {
    if (!tokenLooksValid || !chatIdLooksValid) return
    setChatTest('checking')
    setChatTestError(null)
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${token.trim()}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId.trim(),
            text:
              'Test z panelu Phantom\n' +
              'Jeśli to czytasz w grupie, token + chat ID są poprawne i bot ma uprawnienia do postowania.',
          }),
        },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setChatTest('fail')
        setChatTestError(body.description ?? `HTTP ${res.status}`)
        return
      }
      const body = await res.json()
      if (body.ok) {
        setChatTest('ok')
      } else {
        setChatTest('fail')
        setChatTestError(body.description ?? 'unknown')
      }
    } catch (e) {
      setChatTest('fail')
      setChatTestError((e as Error).message)
    }
  }

  const sendPanelMessage = async () => {
    const text = panelMessage.trim()
    if (!text || text.length > MAX_PANEL_MESSAGE) return
    const sessionToken = localStorage.getItem(SESSION_TOKEN_KEY)
    if (!sessionToken) {
      setPanelMessageState('fail')
      setPanelMessageError(t('telegram.messageAuthMissing'))
      return
    }

    setPanelMessageState('checking')
    setPanelMessageError(null)
    try {
      const res = await fetch('/api/notifier-send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken}`,
        },
        body: JSON.stringify({ text }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body.ok) {
        setPanelMessageState('fail')
        setPanelMessageError(body.detail || body.error || `HTTP ${res.status}`)
        return
      }
      setPanelMessage('')
      setPanelMessageState('ok')
    } catch (e) {
      setPanelMessageState('fail')
      setPanelMessageError((e as Error).message)
    }
  }

  // ── Generated config blocks ─────────────────────────────────────────

  const partylineCommands = useMemo(() => {
    const handle = serviceHandle.trim() || 'tgnotifier'
    const pass = servicePassword || '<wpisz-haslo>'
    return [
      `.+user ${handle}`,
      `.chpass ${handle} ${pass}`,
      `.chattr ${handle} +PN`,
      `.+addr ${handle} 127.0.0.1`,
    ].join('\n')
  }, [serviceHandle, servicePassword])

  const envFileContents = useMemo(() => {
    const lines = [
      '# Generated by Phantom panel. Save as .env.notifier on the host',
      '# running the notifier. Run `chmod 600 .env.notifier` after saving.',
      '',
      `HUB_HOST=${hubHost.trim() || '127.0.0.1'}`,
      `HUB_PORT=${hubPort.trim() || '5555'}`,
      `HUB_SSL=${hubSsl ? 'true' : 'false'}`,
      `HUB_HANDLE=${serviceHandle.trim() || 'tgnotifier'}`,
      `HUB_PASSWORD=${servicePassword}`,
      `TELEGRAM_BOT_TOKEN=${token.trim()}`,
      `TELEGRAM_CHAT_ID=${chatId.trim()}`,
      `PANEL_URL=${typeof window !== 'undefined' ? window.location.origin : ''}`,
    ]
    return lines.join('\n')
  }, [hubHost, hubPort, hubSsl, serviceHandle, servicePassword, token, chatId])

  const sshCommands = `ssh <user>@<panel-host>
cd /opt/phantom/webpanel
nano .env.notifier   # wklej blok poniżej, zapisz Ctrl+O Enter Ctrl+X
chmod 600 .env.notifier
bun run notifier`

  // ── Step gating helpers ─────────────────────────────────────────────

  const tokenStep = tokenValidation === 'ok' ? 'done' : tokenLooksValid ? 'ready' : 'pending'
  const chatStep =
    chatTest === 'ok' ? 'done' :
    tokenStep === 'done' && chatIdLooksValid ? 'ready' :
    'pending'
  const handleStep = passwordOk && serviceHandle.trim().length > 0 ? 'done' : 'pending'
  const allDone = tokenStep === 'done' && chatStep === 'done' && handleStep === 'done'
  const notifierHealthy = !!notifierStatus?.active && !!notifierStatus.authenticated
  const notifierTone = notifierHealthy
    ? 'success'
    : notifierStatus?.active
      ? 'warning'
      : 'danger'

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="view-container telegram-setup">
      <div className="view-header">
        <div>
          <h2>{t('telegram.title')}</h2>
          <span className="view-subtitle">{t('telegram.subtitle')}</span>
        </div>
      </div>

      <section className={`tg-status-card tg-status-card-${notifierTone}`}>
        <div className="tg-status-main">
          <StatusDot
            state={notifierHealthy ? 'online' : notifierStatus?.active ? 'lag' : 'offline'}
            label={notifierHealthy ? t('telegram.statusRunning') : notifierStatus?.active ? t('telegram.statusNeedsAttention') : t('telegram.statusStopped')}
          />
          <div>
            <h3>{notifierHealthy ? t('telegram.statusTitleRunning') : t('telegram.statusTitleNotReady')}</h3>
            <p>
              {notifierHealthy
                ? t('telegram.statusDescRunning')
                : notifierStatus?.active
                  ? t('telegram.statusDescActiveNoAuth')
                  : t('telegram.statusDescStopped')}
            </p>
          </div>
        </div>

        <div className="tg-status-actions">
          <Badge variant={notifierTone}>
            {notifierStatus?.unit_file_state || t('telegram.statusUnknown')}
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={refreshNotifierStatus}
            disabled={notifierStatusLoading}
          >
            {notifierStatusLoading ? (
              <span className="spinner-tiny" aria-hidden />
            ) : (
              <Icon name="activity" size={13} />
            )}
            {t('telegram.refreshStatus')}
          </Button>
          <Button size="sm" onClick={() => setShowSetup(v => !v)}>
            <Icon name={showSetup ? 'chevron-down' : 'settings'} size={13} />
            {showSetup ? t('telegram.hideSetup') : t('telegram.showSetup')}
          </Button>
        </div>

        {notifierStatusError && (
          <div className="tg-status-line tg-fail">
            <Icon name="alert-triangle" size={13} />
            <span>{notifierStatusError}</span>
          </div>
        )}

        {notifierStatus && (
          <div className="tg-status-grid">
            <StatusMetric label={t('telegram.statusUnit')} value={notifierStatus.unit} />
            <StatusMetric label={t('telegram.statusPid')} value={notifierStatus.main_pid ? String(notifierStatus.main_pid) : '—'} />
            <StatusMetric label={t('telegram.statusHandle')} value={notifierStatus.env.handle || '—'} />
            <StatusMetric
              label={t('telegram.statusHub')}
              value={
                notifierStatus.env.present
                  ? `${notifierStatus.env.hub_host || '—'}:${notifierStatus.env.hub_port || '—'}${notifierStatus.env.hub_ssl ? ' TLS' : ''}`
                  : t('telegram.statusEnvMissing')
              }
            />
            <StatusMetric label={t('telegram.statusChat')} value={notifierStatus.env.telegram_chat_id || '—'} />
            <StatusMetric label={t('telegram.statusBotsSeeded')} value={notifierStatus.seeded_bots !== null ? String(notifierStatus.seeded_bots) : '—'} />
          </div>
        )}

        {notifierStatus?.recent_logs?.length ? (
          <details className="tg-log-details">
            <summary>{t('telegram.statusRecentLogs')}</summary>
            <pre className="tg-codeblock">{notifierStatus.recent_logs.join('\n')}</pre>
          </details>
        ) : null}
      </section>

      {showSetup && (
        <>
          <div className="tg-progress">
            <Step n={1} label={t('telegram.stepBot')}     state={tokenStep} />
            <Step n={2} label={t('telegram.stepChat')}    state={chatStep} />
            <Step n={3} label={t('telegram.stepHandle')}  state={handleStep} />
            <Step n={4} label={t('telegram.stepDeploy')}  state={allDone ? 'ready' : 'pending'} />
          </div>

      <section className="tg-section">
        <header>
          <h3>1. {t('telegram.botSectionTitle')}</h3>
          <p>{t('telegram.botSectionHint')}</p>
        </header>

        <div className="tg-field">
          <label>{t('telegram.botToken')}</label>
          <div className="tg-input-row">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="1234567890:ABCdef..."
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowToken(v => !v)}
              title={showToken ? t('telegram.hideValue') : t('telegram.showValue')}
              aria-label={showToken ? t('telegram.hideValue') : t('telegram.showValue')}
            >
              <Icon name={showToken ? 'lock' : 'unlock'} size={13} />
            </Button>
            <Button
              size="sm"
              onClick={validateToken}
              disabled={!tokenLooksValid || tokenValidation === 'checking'}
            >
              {tokenValidation === 'checking' ? (
                <span className="spinner-tiny" aria-hidden />
              ) : (
                <Icon name="check" size={13} />
              )}
              {t('telegram.validate')}
            </Button>
          </div>
          {tokenValidation === 'ok' && botInfo && (
            <div className="tg-status-line tg-ok">
              <Icon name="check" size={13} />
              <span>
                {t('telegram.botOk')}: <strong>{botInfo.first_name}</strong> (@{botInfo.username})
              </span>
            </div>
          )}
          {tokenValidation === 'fail' && tokenError && (
            <div className="tg-status-line tg-fail">
              <Icon name="alert-triangle" size={13} />
              <span>{tokenError}</span>
            </div>
          )}
          {token && !tokenLooksValid && (
            <div className="tg-status-line tg-warn">
              <Icon name="alert-triangle" size={13} />
              <span>{t('telegram.tokenShape')}</span>
            </div>
          )}
        </div>
      </section>

      <section className="tg-section" data-disabled={tokenStep !== 'done'}>
        <header>
          <h3>2. {t('telegram.chatSectionTitle')}</h3>
          <p>{t('telegram.chatSectionHint')}</p>
        </header>

        <div className="tg-field">
          <label>{t('telegram.chatId')}</label>
          <div className="tg-input-row">
            <input
              type="text"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
              placeholder="-1001234567890"
              autoComplete="off"
              spellCheck={false}
            />
            <Button
              size="sm"
              onClick={sendTestMessage}
              disabled={
                tokenStep !== 'done' ||
                !chatIdLooksValid ||
                chatTest === 'checking'
              }
            >
              {chatTest === 'checking' ? (
                <span className="spinner-tiny" aria-hidden />
              ) : (
                <Icon name="send" size={13} />
              )}
              {t('telegram.sendTest')}
            </Button>
          </div>
          {chatTest === 'ok' && (
            <div className="tg-status-line tg-ok">
              <Icon name="check" size={13} />
              <span>{t('telegram.chatOk')}</span>
            </div>
          )}
          {chatTest === 'fail' && chatTestError && (
            <div className="tg-status-line tg-fail">
              <Icon name="alert-triangle" size={13} />
              <span>{chatTestError}</span>
            </div>
          )}
          {chatId && !chatIdLooksValid && (
            <div className="tg-status-line tg-warn">
              <Icon name="alert-triangle" size={13} />
              <span>{t('telegram.chatShape')}</span>
            </div>
          )}
          <p className="form-hint">{t('telegram.chatHint')}</p>
        </div>
      </section>

      <section className="tg-section" data-disabled={chatStep !== 'done'}>
        <header>
          <h3>3. {t('telegram.handleSectionTitle')}</h3>
          <p>{t('telegram.handleSectionHint')}</p>
        </header>

        <div className="tg-field-grid">
          <div className="tg-field">
            <label>{t('telegram.serviceHandle')}</label>
            <input
              type="text"
              value={serviceHandle}
              onChange={e => setServiceHandle(e.target.value.trim())}
              placeholder="tgnotifier"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div className="tg-field">
            <label>{t('telegram.servicePassword')}</label>
            <div className="tg-input-row">
              <input
                type={showPassword ? 'text' : 'password'}
                value={servicePassword}
                onChange={e => setServicePassword(e.target.value)}
                placeholder={t('telegram.passwordPlaceholder')}
                autoComplete="new-password"
                spellCheck={false}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPassword(v => !v)}
                title={showPassword ? t('telegram.hideValue') : t('telegram.showValue')}
                aria-label={showPassword ? t('telegram.hideValue') : t('telegram.showValue')}
              >
                <Icon name={showPassword ? 'lock' : 'unlock'} size={13} />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  // 16-char URL-safe random — works in browsers since Bun
                  // and modern browsers have crypto.getRandomValues.
                  const arr = new Uint8Array(12)
                  window.crypto.getRandomValues(arr)
                  const out = Array.from(arr)
                    .map(b => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 62])
                    .join('')
                  setServicePassword(out)
                }}
                title={t('telegram.generatePassword')}
              >
                <Icon name="settings" size={13} />
              </Button>
            </div>
            {servicePassword && !passwordOk && (
              <div className="tg-status-line tg-warn">
                <Icon name="alert-triangle" size={13} />
                <span>{t('telegram.passwordShort')}</span>
              </div>
            )}
          </div>
        </div>

        <div className="tg-field">
          <label>{t('telegram.partylineCommands')}</label>
          <p className="form-hint">{t('telegram.partylineHint')}</p>
          <pre className="tg-codeblock">{partylineCommands}</pre>
          <CopyToClipboardButton value={partylineCommands} label={t('telegram.copyCommands')} />
        </div>
      </section>

      <section className="tg-section" data-disabled={!allDone}>
        <header>
          <h3>4. {t('telegram.deploySectionTitle')}</h3>
          <p>{t('telegram.deploySectionHint')}</p>
        </header>

        <div className="tg-field-grid">
          <div className="tg-field">
            <label>{t('telegram.hubHost')}</label>
            <input
              type="text"
              value={hubHost}
              onChange={e => setHubHost(e.target.value)}
            />
          </div>
          <div className="tg-field">
            <label>{t('telegram.hubPort')}</label>
            <input
              type="text"
              value={hubPort}
              onChange={e => setHubPort(e.target.value)}
            />
          </div>
          <div className="tg-field">
            <label className="tg-checkbox-label">
              <input
                type="checkbox"
                checked={hubSsl}
                onChange={e => setHubSsl(e.target.checked)}
              />
              <span>{t('telegram.hubSsl')}</span>
            </label>
          </div>
        </div>

        <div className="tg-field">
          <label>{t('telegram.envFile')}</label>
          <p className="form-hint">{t('telegram.envFileHint')}</p>
          <pre className="tg-codeblock tg-env-block">{envFileContents}</pre>
          <CopyToClipboardButton value={envFileContents} label={t('telegram.copyEnv')} />
        </div>

        <div className="tg-field">
          <label>{t('telegram.sshCommands')}</label>
          <pre className="tg-codeblock">{sshCommands}</pre>
          <CopyToClipboardButton value={sshCommands} label={t('telegram.copyShell')} />
        </div>

        <div className="tg-final">
          {allDone ? (
            <div className="tg-status-line tg-ok">
              <Icon name="check" size={14} />
              <strong>{t('telegram.allReady')}</strong>
            </div>
          ) : (
            <EmptyState
              variant="empty"
              icon="clock"
              title={t('telegram.completeSteps')}
              description={t('telegram.completeStepsDesc')}
            />
          )}
        </div>
      </section>
        </>
      )}

      <section className="tg-section">
        <header>
          <h3>{t('telegram.messageSectionTitle')}</h3>
          <p>{t('telegram.messageSectionHint')}</p>
        </header>

        <div className="tg-field">
          <label>{t('telegram.messageText')}</label>
          <textarea
            className="tg-message-input"
            value={panelMessage}
            onChange={e => {
              setPanelMessage(e.target.value)
              setPanelMessageState('idle')
              setPanelMessageError(null)
            }}
            maxLength={MAX_PANEL_MESSAGE}
            placeholder={t('telegram.messagePlaceholder')}
            disabled={!notifierHealthy || panelMessageState === 'checking'}
          />
          <div className="tg-message-toolbar">
            <span className="form-hint">
              {panelMessage.length}/{MAX_PANEL_MESSAGE}
            </span>
            <Button
              size="sm"
              onClick={sendPanelMessage}
              disabled={!notifierHealthy || !panelMessage.trim() || panelMessageState === 'checking'}
            >
              {panelMessageState === 'checking' ? (
                <span className="spinner-tiny" aria-hidden />
              ) : (
                <Icon name="send" size={13} />
              )}
              {t('telegram.messageSend')}
            </Button>
          </div>
          {panelMessageState === 'ok' && (
            <div className="tg-status-line tg-ok">
              <Icon name="check" size={13} />
              <span>{t('telegram.messageSent')}</span>
            </div>
          )}
          {panelMessageState === 'fail' && panelMessageError && (
            <div className="tg-status-line tg-fail">
              <Icon name="alert-triangle" size={13} />
              <span>{panelMessageError}</span>
            </div>
          )}
          {!notifierHealthy && (
            <div className="tg-status-line tg-warn">
              <Icon name="alert-triangle" size={13} />
              <span>{t('telegram.messageNotifierOffline')}</span>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function StatusMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="tg-status-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Step({
  n,
  label,
  state,
}: {
  n: number
  label: string
  state: 'pending' | 'ready' | 'done'
}) {
  return (
    <div className={`tg-step tg-step-${state}`}>
      <span className="tg-step-num">
        {state === 'done' ? <Icon name="check" size={12} /> : n}
      </span>
      <span className="tg-step-label">{label}</span>
    </div>
  )
}

function CopyToClipboardButton({
  value,
  label,
}: {
  value: string
  label: string
}) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          /* clipboard blocked in insecure context — ignore */
        }
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} size={13} />
      {copied ? '✓' : label}
    </Button>
  )
}

// Re-export so we can render it as a sibling.
export default TelegramSetup
