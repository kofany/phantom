import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, Tabs, StatusDot, Icon, EmptyState, PinButton, SkeletonPanel, CopyableMono, Breadcrumbs, ConfirmDialog, toast } from '../common'
import { Bot, Message } from '../../types'
import { BotSettingsTab } from './BotSettingsTab'
import { BotStatusTab } from './BotStatusTab'
import { BotModulesTab } from './BotModulesTab'
import { ObjectHistory } from '../audit'
import { logSessionChange } from '../../sessionChanges'
import { isValidIrcNick } from '../../utils/validation'

type BotDetailProps = {
  bot: Bot
  messages: Message[]
  onCommandSilent: (cmd: string, pattern: RegExp, durationMs?: number) => void
  /** Generic command pipe (rcycle/rpart and similar) — used by the channel
   *  row kebab inside BotStatusTab. */
  onSendCommand?: (cmd: string) => void
  /** Jump to ChannelDetail by name. */
  onOpenChannel?: (chanName: string) => void
  onBack: () => void
  canEdit: boolean
}

type LifecycleAction = 'restart' | 'die' | 'rehash'

// One config variable as seen by `.bc <bot> cfg`. Multi-value vars (server,
// alt, listen, ownerpass, load, alias) hold many entries under the same
// name — psotnic returns them on consecutive lines; we preserve the order
// so `.bc <bot> jump #N` indices stay meaningful.
type ConfigEntry = {
  name: string
  values: string[]
}

// Variables that can occur multiple times. Even when only one is currently
// configured, the UI still shows an "Add" button for them.
const MULTI_VALUE_VARS = new Set([
  'server', 'alt', 'listen', 'listenport', 'ownerpass',
  'load', 'debugLoad', 'alias',
])

// Servers specifically — used to enable the "Jump" button per entry.
const JUMP_TARGETS = new Set(['server', 'alt'])

const CFG_LINE_RE = /^(?:\([^)]+\)\s+)?cfg:\s+([a-z][a-z0-9._-]*)(?:\s+(.*))?$/i
const CFG_SAVE_RE = /^(?:\([^)]+\)\s+)?cfg-save:\s+(.+)$/i
const FAUX_VALUE_RE = /\b(set to|changed to|no such|has been|invalid|cannot|rejected|ok,|error)\b/i
// `name` tokens that are actually verbs in confirmation messages like
// "cfg: added server irc.foo 6667" — not legitimate config variables.
const VERB_NAMES = new Set([
  'added', 'removed', 'deleted', 'set', 'no', 'invalid', 'ok', 'error', 'failed',
])

const FETCH_DEBOUNCE_MS = 1500
const FETCH_TIMEOUT_MS = 10000
const AUTOSAVE_DEBOUNCE_MS = 2000

const COLLAPSED_GROUPS_KEY = 'phantom:bot-config:collapsed-groups'
const DEFAULT_EXPANDED_GROUPS = new Set(['Identity', 'Network'])

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

export function BotDetail({
  bot,
  messages,
  onCommandSilent,
  onSendCommand,
  onOpenChannel,
  onBack,
  canEdit,
}: BotDetailProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<ConfigEntry[]>([])
  const [editingVar, setEditingVar] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [addValue, setAddValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Auto-save machinery
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const autoSaveTimerRef = useRef<number | null>(null)
  const savedClearTimerRef = useRef<number | null>(null)

  const fetchStartIdxRef = useRef(0)
  const lastMatchTsRef = useRef(0)
  const fetchStartTsRef = useRef(0)
  const debounceTimerRef = useRef<number | null>(null)
  const saveStartIdxRef = useRef<number | null>(null)

  // Lifecycle (restart/die/rehash) confirmation modal state
  const [confirmLifecycle, setConfirmLifecycle] = useState<LifecycleAction | null>(null)

  const runLifecycle = (action: LifecycleAction) => {
    if (!canEdit) return
    // Hub forwards `.bc <bot> die|restart|rehash` to the leaf where each
    // command is handled by botcmd.cpp's bc_die / bc_restart / bc_rehash.
    // None of these emit a structured WebAPI event — we rely on bot_quit /
    // bot_join broadcasts to update the live status afterwards.
    onCommandSilent(`bc ${bot.name} ${action}`, /^(?:\([^)]+\)\s+)?(?:rehash|cfg|loaded|module|module:|stopping|restarting|going down|see ya|\d+ modules)/i, 3000)
    logSessionChange('bot-config', `bot:${bot.name}`, `lifecycle:${action}`, '', 'issued')
  }

  const fetchConfig = () => {
    if (!bot.name) return
    setError(null)
    setLoading(true)
    fetchStartIdxRef.current = messages.length
    fetchStartTsRef.current = Date.now()
    lastMatchTsRef.current = Date.now()
    const SILENCE_PATTERN = /^(?:\([^)]+\)\s+)?cfg:\s+[a-z][a-z0-9._-]*(?:\s+|$)/i
    onCommandSilent(`bc ${bot.name} cfg`, SILENCE_PATTERN, 3000)
  }

  // Fetch when bot changes
  useEffect(() => {
    setEntries([])   // drop stale view immediately
    fetchConfig()
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
      if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current)
      if (savedClearTimerRef.current) window.clearTimeout(savedClearTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot.name])

  // Parse cfg lines out of the message stream. Preserve per-name ordering
  // and allow multiple entries per name (server list, etc.)
  useEffect(() => {
    if (!loading) return

    const newMsgs = messages.slice(fetchStartIdxRef.current)
    if (newMsgs.length === 0) return

    const byName = new Map<string, string[]>()
    const seen = new Set<string>()
    let matched = 0

    for (const m of newMsgs) {
      const match = m.text.match(CFG_LINE_RE)
      if (!match) continue
      const name = match[1].toLowerCase()
      const value = (match[2] ?? '').trim()
      // Reject verb-lead confirmation lines ("cfg: added server ..." etc.)
      if (VERB_NAMES.has(name)) continue
      if (value && FAUX_VALUE_RE.test(value)) continue
      matched++
      // Dedup by (name, value) pair so repeated streaming doesn't explode
      const key = `${name}\x00${value}`
      if (seen.has(key)) continue
      seen.add(key)
      const list = byName.get(name) ?? []
      list.push(value)
      byName.set(name, list)
    }

    if (byName.size > 0) {
      const newEntries: ConfigEntry[] = Array.from(byName, ([name, values]) => ({ name, values }))
      setEntries(newEntries)
      if (matched > 0) lastMatchTsRef.current = Date.now()
    }

    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = window.setTimeout(() => {
      const sinceLast = Date.now() - lastMatchTsRef.current
      const sinceStart = Date.now() - fetchStartTsRef.current
      if (sinceLast >= FETCH_DEBOUNCE_MS || sinceStart >= FETCH_TIMEOUT_MS) {
        setLoading(false)
        if (byName.size === 0 && sinceStart >= FETCH_TIMEOUT_MS) {
          setError(t('bots.configFetchTimeout'))
        }
      }
    }, FETCH_DEBOUNCE_MS + 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading])

  // Watch for cfg-save response — flip state back to "saved" with timestamp
  useEffect(() => {
    if (saveStartIdxRef.current === null) return
    const newMsgs = messages.slice(saveStartIdxRef.current)
    for (const m of newMsgs) {
      if (CFG_SAVE_RE.test(m.text)) {
        saveStartIdxRef.current = null
        setSaveState('saved')
        setSavedAt(Date.now())
        if (savedClearTimerRef.current) window.clearTimeout(savedClearTimerRef.current)
        savedClearTimerRef.current = window.setTimeout(() => setSaveState('idle'), 4000)
        break
      }
    }
  }, [messages])

  // ---- Auto-save ---------------------------------------------------------

  const scheduleAutoSave = () => {
    setSaveState('pending')
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = window.setTimeout(() => {
      doSave()
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  const doSave = () => {
    if (!canEdit) return
    if (autoSaveTimerRef.current) window.clearTimeout(autoSaveTimerRef.current)
    setSaveState('saving')
    saveStartIdxRef.current = messages.length
    const SAVE_REPLY = /^(?:\([^)]+\)\s+)?cfg-save:\s+/i
    onCommandSilent(`bc ${bot.name} cfg-save`, SAVE_REPLY, 3000)
  }

  // ---- Edit handlers -----------------------------------------------------

  const handleSetValue = (name: string, value: string) => {
    if (!canEdit) return
    const SET_REPLY = /^(?:\([^)]+\)\s+)?cfg:\s+/i
    const prevValue = entries.find(e => e.name === name)?.values.join(', ') ?? ''

    // Special-case live-applicable variables. The bot config is two layers:
    //   1. cfg <name> <value>  → updates in-memory config (persisted by
    //                            cfg-save, auto-fired by scheduleAutoSave)
    //   2. raw <IRC-CMD> ...   → applies to the live IRC connection
    //
    // For `nick`, layer 1 alone is misleading — the bot keeps the old IRC
    // nick until reconnect. The user's intuition is "I changed the nick,
    // change it now". So we fire BOTH and surface a toast either way.
    // Same idea applies to `realname` on servers with the SETNAME extension,
    // but that's not universal — skip for now.
    if (name === 'nick') {
      const v = value.trim()
      if (!isValidIrcNick(v)) {
        toast('error', t('bots.invalidNick'))
        return
      }
      onCommandSilent(`bc ${bot.name} cfg ${name} ${v}`, SET_REPLY, 2000)
      if (bot.online) {
        // raw NICK requires +x globally on the bot side — bc_raw checks
        // HAS_X before forwarding. If the user lacks it, the cfg part
        // still lands and the new nick takes effect on next reconnect.
        onCommandSilent(`bc ${bot.name} raw NICK ${v}`, /\.|/i, 1500)
        toast('success', t('bots.nickChangeLive', { nick: v }))
      } else {
        toast('info', t('bots.nickChangeQueued', { nick: v }))
      }
      logSessionChange('bot-config', `bot:${bot.name}`, name, prevValue, v)
      setEntries(prev => prev.map(e => (e.name === name ? { ...e, values: [v] } : e)))
      window.setTimeout(() => fetchConfig(), 600)
      scheduleAutoSave()
      return
    }

    onCommandSilent(`bc ${bot.name} cfg ${name} ${value}`, SET_REPLY, 2000)
    logSessionChange('bot-config', `bot:${bot.name}`, name, prevValue, value)
    // Optimistic single-value update
    setEntries(prev => prev.map(e => (e.name === name ? { ...e, values: [value] } : e)))
    window.setTimeout(() => fetchConfig(), 600)
    scheduleAutoSave()
  }

  const handleAddMulti = (name: string, value: string) => {
    if (!canEdit) return
    const trimmed = value.trim()
    if (!trimmed) return
    const ADD_REPLY = /^(?:\([^)]+\)\s+)?cfg:\s+/i
    const prevValue = entries.find(e => e.name === name)?.values.join(', ') ?? ''
    onCommandSilent(`bc ${bot.name} cfg +${name} ${trimmed}`, ADD_REPLY, 2000)
    logSessionChange('bot-config', `bot:${bot.name}`, `+${name}`, prevValue, `${prevValue}${prevValue ? ', ' : ''}${trimmed}`)
    window.setTimeout(() => fetchConfig(), 600)
    scheduleAutoSave()
  }

  const handleRemoveMulti = (name: string, value: string) => {
    if (!canEdit) return
    const RM_REPLY = /^(?:\([^)]+\)\s+)?cfg:\s+/i
    const prev = entries.find(e => e.name === name)?.values ?? []
    onCommandSilent(`bc ${bot.name} cfg -${name} ${value}`, RM_REPLY, 2000)
    logSessionChange('bot-config', `bot:${bot.name}`, `-${name}`, prev.join(', '), prev.filter(v => v !== value).join(', '))
    // Optimistic removal
    setEntries(prev => prev.map(e =>
      e.name === name ? { ...e, values: e.values.filter(v => v !== value) } : e,
    ))
    window.setTimeout(() => fetchConfig(), 600)
    scheduleAutoSave()
  }

  const handleJump = (index1based: number) => {
    if (!canEdit) return
    // Jump just reconnects the bot — no cfg write, no auto-save needed.
    // Silence pattern covers typical responses: "jumping to ...", "you are now on ..."
    onCommandSilent(`bc ${bot.name} jump #${index1based}`, /./, 2500)
  }

  // ---- Layout ------------------------------------------------------------

  const groups = useMemo(() => groupEntries(entries), [entries])
  const currentServer = normalizeServer(bot.server)

  // Collapsed-group state — persisted across sessions so power users keep
  // their preferred layout. Default: only Identity + Network expanded; the
  // other groups stay folded so the panel doesn't sprawl.
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY)
      if (raw) return new Set<string>(JSON.parse(raw))
    } catch { /* ignore */ }
    return new Set<string>(
      GROUP_MATCHERS
        .map(g => g.label)
        .filter(label => !DEFAULT_EXPANDED_GROUPS.has(label))
        .concat('Other')
    )
  })

  const toggleGroup = (label: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      try {
        localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]))
      } catch { /* ignore */ }
      return next
    })
  }

  const allCollapsed = groups.length > 0 && groups.every(g => collapsedGroups.has(g.label))
  const setAllGroups = (collapse: boolean) => {
    const next = collapse
      ? new Set<string>(groups.map(g => g.label))
      : new Set<string>()
    setCollapsedGroups(next)
    try {
      localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]))
    } catch { /* ignore */ }
  }

  // Save state label
  const saveLabel = (() => {
    switch (saveState) {
      case 'pending': return t('bots.saveStatePending')
      case 'saving':  return t('bots.saveStateSaving')
      case 'saved':
        return savedAt
          ? t('bots.saveStateSavedAt').replace('{time}', new Date(savedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }))
          : t('bots.saveStateSaved')
      case 'error':   return t('bots.saveStateError')
      default:        return ''
    }
  })()

  const tabs = [
    {
      id: 'info',
      label: t('bots.info'),
      content: (
        <div className="user-overview">
          <div className="user-info-grid">
            <div className="info-item">
              <span className="info-label">{t('bots.name')}</span>
              <span className="info-value">
                <CopyableMono value={bot.name} size="md" />
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('common.status')}</span>
              <div className="info-value">
                <StatusDot
                  state={bot.online ? 'online' : 'offline'}
                  label={bot.online ? t('bots.online') : t('bots.offline')}
                />
              </div>
            </div>
            <div className="info-item">
              <span className="info-label">{t('bots.nick')}</span>
              <span className="info-value">
                {bot.nick ? <CopyableMono value={bot.nick} size="md" className="text-accent" /> : '—'}
              </span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('bots.server')}</span>
              <span className="info-value">
                {bot.server ? <CopyableMono value={bot.server} size="md" /> : '—'}
              </span>
            </div>
            {bot.ip && (
              <div className="info-item">
                <span className="info-label">{t('bots.ip')}</span>
                <span className="info-value">
                  <CopyableMono value={bot.ip} size="md" />
                </span>
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'config',
      label: t('bots.config'),
      count: entries.length || undefined,
      content: (
        <div className="bot-config-panel">
          <div className="config-toolbar">
            <p className="config-desc">{t('bots.configDescAuto')}</p>
            <div className="config-toolbar-right">
              {saveLabel && (
                <span className={`config-save-status save-${saveState}`}>
                  {saveState === 'saving' && <span className="spinner-tiny" />}
                  {saveState === 'saved' && <Icon name="check" size={12} />}
                  {saveLabel}
                </span>
              )}
              {groups.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAllGroups(!allCollapsed)}
                  title={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}
                >
                  <Icon name={allCollapsed ? 'chevron-down' : 'chevron-right'} size={13} />
                  {allCollapsed ? 'Expand all' : 'Collapse all'}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={fetchConfig} disabled={loading}>
                <Icon name="activity" size={13} />
                {t('common.refresh')}
              </Button>
              {canEdit && saveState === 'pending' && (
                <Button size="sm" onClick={doSave}>
                  <Icon name="check" size={13} />
                  {t('bots.saveNow')}
                </Button>
              )}
            </div>
          </div>

          {!canEdit && (
            <div className="config-readonly-notice">
              <Icon name="lock" size={13} />
              {t('bots.configReadonly')}
            </div>
          )}

          {error && (
            <div className="config-readonly-notice" style={{ color: 'var(--err)', background: 'var(--err-lo)', borderColor: 'rgba(248, 113, 113, 0.25)' }}>
              <Icon name="alert-triangle" size={13} />
              {error}
            </div>
          )}

          {loading && entries.length === 0 ? (
            <SkeletonPanel lines={10} label={t('common.loading')} />
          ) : !loading && entries.length === 0 ? (
            <EmptyState icon="settings" title={t('bots.noConfig')} description={t('bots.noConfigDesc')} />
          ) : (
            <div className="config-groups">
              {groups.map(group => {
                const isCollapsed = collapsedGroups.has(group.label)
                return (
                <div
                  key={group.label}
                  className={`config-group${isCollapsed ? ' is-collapsed' : ''}`}
                >
                  <button
                    type="button"
                    className="config-group-label"
                    onClick={() => toggleGroup(group.label)}
                    aria-expanded={!isCollapsed}
                  >
                    <Icon
                      name="chevron-down"
                      size={14}
                      className="config-group-chevron"
                    />
                    <span className="config-group-name">{group.label}</span>
                    <span className="config-group-count">{group.entries.length}</span>
                  </button>
                  {!isCollapsed && (
                  <div className="chset-list">
                    {group.entries.map(entry => {
                      const isMulti = MULTI_VALUE_VARS.has(entry.name) || entry.values.length > 1
                      if (isMulti) {
                        return (
                          <MultiValueRow
                            key={entry.name}
                            entry={entry}
                            canEdit={canEdit}
                            canJump={JUMP_TARGETS.has(entry.name)}
                            currentServer={currentServer}
                            adding={addingFor === entry.name}
                            addValue={addValue}
                            onStartAdd={() => { setAddingFor(entry.name); setAddValue(''); }}
                            onCancelAdd={() => { setAddingFor(null); setAddValue(''); }}
                            onChangeAddValue={setAddValue}
                            onSubmitAdd={() => {
                              handleAddMulti(entry.name, addValue)
                              setAddingFor(null)
                              setAddValue('')
                            }}
                            onRemove={v => handleRemoveMulti(entry.name, v)}
                            onJump={idx => handleJump(idx)}
                          />
                        )
                      }

                      // Single-value row — original behaviour
                      const value = entry.values[0] ?? ''
                      const isBoolean = value === 'ON' || value === 'OFF'
                      return (
                        <div key={entry.name} className="chset-item">
                          <span className="chset-name">{entry.name}</span>
                          {isBoolean ? (
                            <label className="switch">
                              <input
                                type="checkbox"
                                checked={value === 'ON'}
                                disabled={!canEdit}
                                onChange={e =>
                                  handleSetValue(entry.name, e.target.checked ? 'ON' : 'OFF')
                                }
                              />
                              <span className="slider"></span>
                            </label>
                          ) : editingVar === entry.name ? (
                            <div className="chset-edit">
                              <input
                                type="text"
                                className="chset-input"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    handleSetValue(entry.name, editValue)
                                    setEditingVar(null)
                                  } else if (e.key === 'Escape') {
                                    setEditingVar(null)
                                  }
                                }}
                              />
                              <Button
                                size="sm"
                                onClick={() => {
                                  handleSetValue(entry.name, editValue)
                                  setEditingVar(null)
                                }}
                              >
                                ✓
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingVar(null)}>
                                ✕
                              </Button>
                            </div>
                          ) : (
                            <>
                              {value ? (
                                <span className="chset-value" title={value}>
                                  {value}
                                </span>
                              ) : (
                                <span className="chset-value chset-unset" title="(unset)">—</span>
                              )}
                              {canEdit && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingVar(entry.name)
                                    setEditValue(value)
                                  }}
                                >
                                  ✎
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'settings',
      label: t('bots.settings'),
      content: (
        <BotSettingsTab
          botName={bot.name}
          messages={messages}
          onCommandSilent={onCommandSilent}
          canEdit={canEdit}
        />
      ),
    },
    {
      id: 'status',
      label: t('bots.status'),
      content: (
        <BotStatusTab
          botName={bot.name}
          botOnline={bot.online}
          messages={messages}
          onCommandSilent={onCommandSilent}
          canFetch={canEdit}
          onSendCommand={canEdit ? onSendCommand : undefined}
          onOpenChannel={onOpenChannel}
        />
      ),
    },
    {
      id: 'modules',
      label: t('bots.modules'),
      content: (
        <BotModulesTab
          botName={bot.name}
          botOnline={bot.online}
          messages={messages}
          onCommandSilent={onCommandSilent}
          canEdit={canEdit}
        />
      ),
    },
    {
      id: 'history',
      label: t('objectHistory.title'),
      content: <ObjectHistory target={bot.name} limit={50} />,
    },
  ]

  const lifecycleCopy: Record<LifecycleAction, { title: string; body: string; btn: string; variant: 'danger' | 'primary' }> = {
    restart: {
      title: t('bots.restartConfirmTitle').replace('{bot}', bot.name),
      body: t('bots.restartConfirmBody'),
      btn: t('bots.restart'),
      variant: 'danger',
    },
    die: {
      title: t('bots.dieConfirmTitle').replace('{bot}', bot.name),
      body: t('bots.dieConfirmBody'),
      btn: t('bots.die'),
      variant: 'danger',
    },
    rehash: {
      title: t('bots.rehashConfirmTitle').replace('{bot}', bot.name),
      body: t('bots.rehashConfirmBody'),
      btn: t('bots.rehash'),
      variant: 'primary',
    },
  }

  return (
    <div className="view-container">
      <Breadcrumbs
        items={[
          { label: t('nav.bots'), onClick: onBack },
          { label: bot.name, mono: true },
        ]}
        trailing={
          <>
            <PinButton kind="bot" name={bot.name} compact />
            <StatusDot
              state={bot.online ? 'online' : 'offline'}
              label={bot.online ? t('bots.online') : t('bots.offline')}
            />
            {canEdit && bot.online && (
              <div className="bot-lifecycle-actions" role="group" aria-label={t('bots.lifecycle')}>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmLifecycle('rehash')}
                  title={t('bots.rehashDesc')}
                >
                  <Icon name="zap" size={13} />
                  {t('bots.rehash')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmLifecycle('restart')}
                  title={t('bots.restartDesc')}
                >
                  <Icon name="activity" size={13} />
                  {t('bots.restart')}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => setConfirmLifecycle('die')}
                  title={t('bots.dieDesc')}
                >
                  <Icon name="x" size={13} />
                  {t('bots.die')}
                </Button>
              </div>
            )}
          </>
        }
      />
      <Tabs tabs={tabs} defaultTab="info" />

      <ConfirmDialog
        isOpen={!!confirmLifecycle}
        onClose={() => setConfirmLifecycle(null)}
        onConfirm={() => {
          if (confirmLifecycle) runLifecycle(confirmLifecycle)
        }}
        title={confirmLifecycle ? lifecycleCopy[confirmLifecycle].title : ''}
        message={confirmLifecycle ? lifecycleCopy[confirmLifecycle].body : ''}
        confirmLabel={confirmLifecycle ? lifecycleCopy[confirmLifecycle].btn : undefined}
        variant={confirmLifecycle ? lifecycleCopy[confirmLifecycle].variant : 'danger'}
      />
    </div>
  )
}

// ----- Multi-value row (server list, alt, listen, etc.) --------------------

type MultiValueRowProps = {
  entry: ConfigEntry
  canEdit: boolean
  canJump: boolean
  currentServer: string        // normalized host of bot.server
  adding: boolean
  addValue: string
  onStartAdd: () => void
  onCancelAdd: () => void
  onChangeAddValue: (v: string) => void
  onSubmitAdd: () => void
  onRemove: (value: string) => void
  onJump: (index1based: number) => void
}

function MultiValueRow({
  entry, canEdit, canJump, currentServer,
  adding, addValue, onStartAdd, onCancelAdd, onChangeAddValue, onSubmitAdd,
  onRemove, onJump,
}: MultiValueRowProps) {
  const { t } = useTranslation()

  return (
    <div className="multi-entry">
      <div className="multi-entry-head">
        <span className="multi-entry-name">{entry.name}</span>
        <span className="multi-entry-count">{entry.values.length}</span>
      </div>

      <div className="multi-entry-list">
        {entry.values.length === 0 && !adding && (
          <div className="multi-entry-empty">{t('bots.multiEmpty')}</div>
        )}

        {entry.values.map((value, idx) => {
          const isCurrent = canJump && value.toLowerCase().includes(currentServer)
          return (
            <div key={`${idx}-${value}`} className={`multi-entry-row${isCurrent ? ' is-current' : ''}`}>
              <span className="multi-entry-idx">#{idx + 1}</span>
              {isCurrent && (
                <span className="multi-entry-dot" title={t('bots.currentServer')} />
              )}
              <span className="multi-entry-value mono" title={value}>{value}</span>
              <div className="multi-entry-actions">
                {canJump && canEdit && !isCurrent && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onJump(idx + 1)}
                    title={t('bots.jumpHere').replace('{n}', String(idx + 1))}
                  >
                    <Icon name="zap" size={12} />
                    {t('bots.jump')}
                  </Button>
                )}
                {canEdit && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRemove(value)}
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                  >
                    <Icon name="x" size={12} />
                  </Button>
                )}
              </div>
            </div>
          )
        })}

        {canEdit && adding && (
          <div className="multi-entry-row multi-entry-adding">
            <span className="multi-entry-idx">+</span>
            <input
              type="text"
              className="chset-input"
              value={addValue}
              onChange={e => onChangeAddValue(e.target.value)}
              placeholder={placeholderFor(entry.name)}
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') onSubmitAdd()
                else if (e.key === 'Escape') onCancelAdd()
              }}
            />
            <div className="multi-entry-actions">
              <Button size="sm" onClick={onSubmitAdd} disabled={!addValue.trim()}>
                ✓
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancelAdd}>✕</Button>
            </div>
          </div>
        )}

        {canEdit && !adding && (
          <button className="multi-entry-add-btn" onClick={onStartAdd}>
            <Icon name="plus" size={12} />
            {t('bots.addEntry').replace('{name}', entry.name)}
          </button>
        )}
      </div>
    </div>
  )
}

function placeholderFor(name: string): string {
  switch (name) {
    case 'server': return 'host 6667  or  ssl:host 6697 password'
    case 'alt':    return 'host 33100 password handle'
    case 'listen': return 'host 33100 bots   or  ssl:0.0.0.0 5555 users'
    case 'listenport': return 'host 33100 bots'
    case 'ownerpass': return '<md5 hash or plaintext>'
    case 'load':   return 'module.so'
    case 'alias':  return 'alias-name command'
    default:       return 'value'
  }
}

function normalizeServer(raw: string): string {
  if (!raw) return ''
  return raw.toLowerCase().replace(/^ssl:/, '').replace(/\s.*$/, '').split(':')[0].trim()
}

// ----- Groups --------------------------------------------------------------

type Group = { label: string; entries: ConfigEntry[] }

const GROUP_MATCHERS: { label: string; match: (name: string) => boolean }[] = [
  { label: 'Identity',    match: n => ['nick', 'altnick', 'ident', 'realname', 'handle', 'nickappend', 'botnetword'].includes(n) },
  { label: 'Network',     match: n => n === 'server' || n === 'hub' || n === 'alt' || n === 'vhost' || n.startsWith('myipv') },
  { label: 'Listeners',   match: n => n === 'listen' || n === 'listenport' },
  { label: 'SASL',        match: n => n.startsWith('sasl') },
  { label: 'Modules',     match: n => n === 'load' || n === 'debugLoad' || n === 'module_load' },
  { label: 'Behavior',    match: n => ['keepnick', 'dontfork', 'ctcptype', 'save_userlist', 'check_ban_on_nick_change'].includes(n) },
  { label: 'Files',       match: n => ['userlist', 'userlist_file', 'logfile'].includes(n) },
  { label: 'Security',    match: n => n === 'ownerpass' },
  { label: 'DNS',         match: n => n === 'resolve-threads' || n === 'resolve_threads' || n === 'domain-ttl' || n === 'domain_ttl' },
  { label: 'Aliases',     match: n => n === 'alias' },
]

function groupEntries(entries: ConfigEntry[]): Group[] {
  const groupMap = new Map<string, ConfigEntry[]>()
  const other: ConfigEntry[] = []

  for (const entry of entries) {
    const group = GROUP_MATCHERS.find(g => g.match(entry.name))
    if (group) {
      if (!groupMap.has(group.label)) groupMap.set(group.label, [])
      groupMap.get(group.label)!.push(entry)
    } else {
      other.push(entry)
    }
  }

  const result: Group[] = []
  for (const { label } of GROUP_MATCHERS) {
    const list = groupMap.get(label)
    if (list && list.length > 0) result.push({ label, entries: list })
  }
  if (other.length > 0) result.push({ label: 'Other', entries: other })
  return result
}
