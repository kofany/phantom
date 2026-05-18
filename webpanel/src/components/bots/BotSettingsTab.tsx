import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, Icon, EmptyState, SkeletonPanel } from '../common'
import { logSessionChange } from '../../sessionChanges'
import { Message } from '../../types'

type BotSettingsTabProps = {
  botName: string
  messages: Message[]
  onCommandSilent: (cmd: string, pattern: RegExp, durationMs?: number) => void
  canEdit: boolean
}

type SettingEntry = {
  name: string
  value: string
}

// `pset` (per-bot psotnic options) outputs lines like:
//   pset: var<padding>value
// Critical: the bot has NO `set` command — that's a hub-only partyline
// command. Earlier versions of this tab sent `bc <bot> set` which the
// bot silently dropped as unknown, so the tab loaded forever.
// (botcmd.cpp:42 only registers pset / cfg / cfg-save / etc.)
const SET_LINE_RE = /^(?:\([^)]+\)\s+)?pset:\s+([a-z][a-z0-9._-]*)(?:\s+(.*))?$/i
const FAUX_VALUE_RE = /\b(set to|changed to|no such|has been|invalid|cannot|rejected|ok,|error)\b/i
const VERB_NAMES = new Set(['added', 'removed', 'deleted', 'set', 'no', 'invalid', 'ok', 'error', 'failed'])

const FETCH_DEBOUNCE_MS = 1500
const FETCH_TIMEOUT_MS = 10000

/**
 * Settings variables are single-value (options::entInt, entBool, entTime, ...).
 * They persist via userlist.updated() — no explicit save command required.
 */
export function BotSettingsTab({ botName, messages, onCommandSilent, canEdit }: BotSettingsTabProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<SettingEntry[]>([])
  const [editingVar, setEditingVar] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStartIdxRef = useRef(0)
  const lastMatchTsRef = useRef(0)
  const fetchStartTsRef = useRef(0)
  const debounceTimerRef = useRef<number | null>(null)

  const fetchSettings = () => {
    if (!botName) return
    setError(null)
    setLoading(true)
    fetchStartIdxRef.current = messages.length
    fetchStartTsRef.current = Date.now()
    lastMatchTsRef.current = Date.now()
    const SILENCE = /^(?:\([^)]+\)\s+)?pset:\s+[a-z][a-z0-9._-]*(?:\s+|$)/i
    onCommandSilent(`bc ${botName} pset`, SILENCE, 3000)
  }

  // Fetch on mount / when bot changes
  useEffect(() => {
    setEntries([])
    fetchSettings()
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botName])

  // Parse messages
  useEffect(() => {
    if (!loading) return
    const newMsgs = messages.slice(fetchStartIdxRef.current)
    if (newMsgs.length === 0) return

    const byName = new Map<string, string>()
    let matched = 0

    for (const m of newMsgs) {
      const match = m.text.match(SET_LINE_RE)
      if (!match) continue
      const name = match[1].toLowerCase()
      const value = (match[2] ?? '').trim()
      if (VERB_NAMES.has(name)) continue
      if (value && FAUX_VALUE_RE.test(value)) continue
      matched++
      byName.set(name, value)   // settings are single-value — last write wins
    }

    if (byName.size > 0) {
      setEntries(Array.from(byName, ([name, value]) => ({ name, value })))
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

  const handleSetValue = (name: string, value: string) => {
    if (!canEdit) return
    const REPLY = /^(?:\([^)]+\)\s+)?pset:\s+/i
    const prevValue = entries.find(e => e.name === name)?.value ?? ''
    onCommandSilent(`bc ${botName} pset ${name} ${value}`, REPLY, 2000)
    logSessionChange('bot-setting', `bot:${botName}`, name, prevValue, value)
    setEntries(prev => prev.map(e => (e.name === name ? { ...e, value } : e)))
    window.setTimeout(() => fetchSettings(), 600)
  }

  const groups = useMemo(() => groupSettings(entries), [entries])

  return (
    <div className="bot-config-panel">
      <div className="config-toolbar">
        <p className="config-desc">{t('bots.settingsDesc')}</p>
        <div className="config-toolbar-right">
          <Button size="sm" variant="ghost" onClick={fetchSettings} disabled={loading}>
            <Icon name="activity" size={13} />
            {t('common.refresh')}
          </Button>
        </div>
      </div>

      {!canEdit && (
        <div className="config-readonly-notice">
          <Icon name="lock" size={13} />
          {t('bots.settingsReadonly')}
        </div>
      )}

      {error && (
        <div className="config-readonly-notice" style={{ color: 'var(--err)', background: 'var(--err-lo)', borderColor: 'rgba(248, 113, 113, 0.25)' }}>
          <Icon name="alert-triangle" size={13} />
          {error}
        </div>
      )}

      {loading && entries.length === 0 ? (
        <SkeletonPanel lines={8} label={t('common.loading')} />
      ) : !loading && entries.length === 0 ? (
        <EmptyState icon="settings" title={t('bots.noSettings')} description={t('bots.noSettingsDesc')} />
      ) : (
        <div className="config-groups">
          {groups.map(group => (
            <div key={group.label} className="config-group">
              <div className="config-group-label">{group.label}</div>
              <div className="chset-list">
                {group.entries.map(entry => {
                  const isBoolean = entry.value === 'ON' || entry.value === 'OFF'
                  return (
                    <div key={entry.name} className="chset-item">
                      <span className="chset-name">{entry.name}</span>
                      {isBoolean ? (
                        <label className="switch">
                          <input
                            type="checkbox"
                            checked={entry.value === 'ON'}
                            disabled={!canEdit}
                            onChange={e => handleSetValue(entry.name, e.target.checked ? 'ON' : 'OFF')}
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
                          <Button size="sm" onClick={() => { handleSetValue(entry.name, editValue); setEditingVar(null) }}>
                            ✓
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingVar(null)}>✕</Button>
                        </div>
                      ) : (
                        <>
                          {entry.value ? (
                            <span className="chset-value" title={entry.value}>{entry.value}</span>
                          ) : (
                            <span className="chset-value chset-unset" title="(unset)">—</span>
                          )}
                          {canEdit && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setEditingVar(entry.name); setEditValue(entry.value) }}
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Categorize settings by topic
type Group = { label: string; entries: SettingEntry[] }

const GROUP_MATCHERS: { label: string; match: (name: string) => boolean }[] = [
  { label: 'Flood protection', match: n => n.startsWith('flood') || n.includes('flood') },
  { label: 'Clone protection', match: n => n.includes('clone') || n.includes('clones') },
  { label: 'Network timings',  match: n => n.includes('timeout') || n.includes('delay') || n.includes('interval') },
  { label: 'SYN / rate limit', match: n => n.startsWith('synflood') || n.startsWith('perip') },
  { label: 'Channel behavior', match: n => ['cycle-delay', 'rejoin-delay', 'rejoin-fail-delay', 'ask-for-op-delay'].includes(n) },
  { label: 'Trust & safety',   match: n => n.startsWith('dont-') || n.startsWith('quarantine') || n.startsWith('ignore') },
  { label: 'Nick handling',    match: n => n.includes('nick') },
]

function groupSettings(entries: SettingEntry[]): Group[] {
  const groupMap = new Map<string, SettingEntry[]>()
  const other: SettingEntry[] = []
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
