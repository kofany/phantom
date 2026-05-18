import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import {
  Button,
  EmptyState,
  Icon,
  SkeletonPanel,
  Tabs,
  ConfirmDialog,
} from '../common'
import { Message } from '../../types'

type HubSettingsProps = {
  messages: Message[]
  onCommandSilent: (cmd: string, pattern: RegExp, durationMs?: number) => void
  onCommand: (cmd: string) => void
  /** False when the user lacks +s — shows a read-only notice; we still
   *  fetch (read needs +s too on most psotnic builds) but suppress edits. */
  canEdit: boolean
}

type Variable = {
  name: string
  value: string
}

// `gset` doesn't have a list mode in psotnic — it only sets variables
// across all channels. To "view defaults" the operator uses `dset`. So
// we expose two listable scopes (set, dset) and offer a "Push to all
// channels" action on dset rows that fires .gset with that value.
type Scope = 'set' | 'dset'

const SCOPE_PREFIX_RE: Record<Scope, RegExp> = {
  set:  /^(?:\([^)]+\)\s+)?set:\s+(\S+)(?:\s+(.*))?$/,
  dset: /^(?:\([^)]+\)\s+)?dset:\s+(\S+)(?:\s+(.*))?$/,
}

const NOPERM_RE = /Permission denied/i

// Hide the listing broadcast from mini-console / Overview while we're
// fetching. Each scope has its own pattern so `set` traffic doesn't
// silence `dset` broadcasts and vice-versa.
const SILENCE_RE: Record<Scope, RegExp> = {
  set:  /^(?:\([^)]+\)\s+)?set:\s+/,
  dset: /^(?:\([^)]+\)\s+)?dset:\s+/,
}

const FETCH_TIMEOUT_MS = 4000
const QUIESCENCE_MS = 600

function ScopePane({
  scope,
  messages,
  onCommandSilent,
  onCommand,
  canEdit,
}: {
  scope: Scope
} & Omit<HubSettingsProps, 'canEdit'> & { canEdit: boolean }) {
  const { t } = useTranslation()
  const [vars, setVars] = useState<Variable[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [confirmReset, setConfirmReset] = useState<Variable | null>(null)

  const startIdxRef = useRef(0)
  const startTsRef = useRef(0)
  const lastMatchTsRef = useRef(0)
  const debounceRef = useRef<number | null>(null)

  const refresh = () => {
    setLoading(true)
    setError(null)
    setVars([])
    startIdxRef.current = messages.length
    startTsRef.current = Date.now()
    lastMatchTsRef.current = startTsRef.current
    onCommandSilent(scope, SILENCE_RE[scope], FETCH_TIMEOUT_MS)
  }

  useEffect(() => {
    refresh()
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope])

  // Stream the silent broadcast as it lands.
  useEffect(() => {
    if (!loading) return
    const slice = messages.slice(startIdxRef.current)
    if (slice.length === 0) return

    const next: Variable[] = [...vars]
    const seen = new Set(next.map(v => v.name))
    let matched = 0
    let perm = false

    for (const m of slice) {
      if (NOPERM_RE.test(m.text)) {
        perm = true
        break
      }
      const cm = m.text.match(SCOPE_PREFIX_RE[scope])
      if (!cm) continue
      const name = cm[1]
      if (seen.has(name)) continue
      seen.add(name)
      next.push({ name, value: (cm[2] ?? '').trim() })
      matched++
    }

    if (perm) {
      setLoading(false)
      setError(t('hubSettings.permissionDenied'))
      return
    }

    if (matched > 0) {
      // Sort alphabetically so the list stays stable across refreshes.
      next.sort((a, b) => a.name.localeCompare(b.name))
      setVars(next)
      lastMatchTsRef.current = Date.now()
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const sinceLast = Date.now() - lastMatchTsRef.current
      const sinceStart = Date.now() - startTsRef.current
      if (sinceLast >= QUIESCENCE_MS || sinceStart >= FETCH_TIMEOUT_MS) {
        setLoading(false)
        if (next.length === 0 && sinceStart >= FETCH_TIMEOUT_MS) {
          setError(t('hubSettings.fetchTimeout'))
        }
      }
    }, QUIESCENCE_MS + 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vars
    return vars.filter(
      v =>
        v.name.toLowerCase().includes(q) ||
        v.value.toLowerCase().includes(q),
    )
  }, [vars, search])

  const beginEdit = (v: Variable) => {
    setEditing(v.name)
    setDraft(v.value)
  }

  const cancelEdit = () => {
    setEditing(null)
    setDraft('')
  }

  const saveEdit = (v: Variable) => {
    if (!canEdit) return
    const newValue = draft
    if (newValue === v.value) {
      cancelEdit()
      return
    }
    onCommand(`${scope} ${v.name} ${newValue}`)
    // Optimistically reflect the change locally; partyline broadcast
    // confirms within a frame anyway.
    setVars(prev => prev.map(x => x.name === v.name ? { ...x, value: newValue } : x))
    cancelEdit()
  }

  const resetToDefault = (v: Variable) => {
    // Sending the variable with no value resets it on most psotnic
    // option types. The exact behavior depends on the entBool/entString
    // override but server-side this is the canonical "unset" path.
    onCommand(`${scope} ${v.name}`)
    setConfirmReset(null)
    // Re-fetch so we can pick up the resolved default rather than
    // optimistically overwriting with an empty string.
    window.setTimeout(refresh, 350)
  }

  return (
    <div className="hub-settings-pane">
      <div className="hub-settings-toolbar">
        <input
          type="text"
          className="hub-settings-search"
          placeholder={t('hubSettings.searchPlaceholder')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span className="hub-settings-count">
          {filtered.length === vars.length
            ? `${vars.length}`
            : `${filtered.length} / ${vars.length}`}
        </span>
        <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
          <Icon name="activity" size={13} />
          {t('hubSettings.refresh')}
        </Button>
      </div>

      {error ? (
        <EmptyState variant="error" icon="alert-triangle" title={error} />
      ) : loading && vars.length === 0 ? (
        <SkeletonPanel lines={8} label={t('common.loading')} />
      ) : filtered.length === 0 ? (
        <EmptyState
          variant={search ? 'no-results' : 'empty'}
          icon="settings"
          title={search ? t('hubSettings.noMatches') : t('hubSettings.empty')}
        />
      ) : (
        <div className="hub-settings-list">
          {filtered.map(v => {
            const isEditing = editing === v.name
            return (
              <div key={v.name} className="hub-settings-row">
                <code className="hub-settings-name">{v.name}</code>
                {isEditing ? (
                  <>
                    <input
                      type="text"
                      className="hub-settings-input"
                      value={draft}
                      onChange={e => setDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          saveEdit(v)
                        } else if (e.key === 'Escape') {
                          cancelEdit()
                        }
                      }}
                      autoFocus
                    />
                    <div className="hub-settings-actions">
                      <Button size="sm" onClick={() => saveEdit(v)}>
                        <Icon name="check" size={12} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>
                        <Icon name="x" size={12} />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <code className="hub-settings-value">
                      {v.value || <span className="hub-settings-empty">—</span>}
                    </code>
                    {canEdit && (
                      <div className="hub-settings-actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => beginEdit(v)}
                          aria-label={t('common.edit')}
                          title={t('common.edit')}
                        >
                          <Icon name="pencil" size={12} />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmReset(v)}
                          aria-label={t('hubSettings.reset')}
                          title={t('hubSettings.reset')}
                        >
                          <Icon name="eraser" size={12} />
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmReset !== null}
        onClose={() => setConfirmReset(null)}
        onConfirm={() => confirmReset && resetToDefault(confirmReset)}
        title={t('hubSettings.resetConfirmTitle')}
        message={t('hubSettings.resetConfirmBody', { name: confirmReset?.name ?? '' })}
        confirmLabel={t('hubSettings.reset')}
      />
    </div>
  )
}

export function HubSettings({
  messages,
  onCommandSilent,
  onCommand,
  canEdit,
}: HubSettingsProps) {
  const { t } = useTranslation()

  const tabs = [
    {
      id: 'set',
      label: t('hubSettings.tabSet'),
      content: (
        <ScopePane
          scope="set"
          messages={messages}
          onCommandSilent={onCommandSilent}
          onCommand={onCommand}
          canEdit={canEdit}
        />
      ),
    },
    {
      id: 'dset',
      label: t('hubSettings.tabDset'),
      content: (
        <ScopePane
          scope="dset"
          messages={messages}
          onCommandSilent={onCommandSilent}
          onCommand={onCommand}
          canEdit={canEdit}
        />
      ),
    },
  ]

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>{t('hubSettings.title')}</h2>
          <span className="view-subtitle">{t('hubSettings.subtitle')}</span>
        </div>
      </div>

      {!canEdit && (
        <div className="hub-settings-readonly">
          <Icon name="lock" size={14} />
          <span>{t('hubSettings.readonlyNotice')}</span>
        </div>
      )}

      <Tabs tabs={tabs} defaultTab="set" />
    </div>
  )
}
