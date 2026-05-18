import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, EmptyState, Icon, SkeletonPanel, ConfirmDialog } from '../common'
import { Message } from '../../types'

type BotModulesTabProps = {
  botName: string
  botOnline: boolean
  messages: Message[]
  onCommandSilent: (cmd: string, pattern: RegExp, durationMs?: number) => void
  /** Required for rehash. */
  canEdit: boolean
}

type ModuleEntry = {
  file: string
  version: string
  author: string
}

// Format from bc_modules() (botcmd.cpp): "module: <file> (v<ver> by <author>)"
const SILENCE_RE = /^(?:\([^)]+\)\s+)?(?:module:\s|\d+\s+modules\s+have)/i
const MODULE_RE = /^(?:\([^)]+\)\s+)?module:\s+(\S+)\s+\(v([^)]+?)\s+by\s+([^)]+)\)\s*$/i
const COUNT_RE = /^(?:\([^)]+\)\s+)?(\d+)\s+modules\s+have\s+been\s+found/i
// `bc_modules` rejects non-+x with strerror(EACCES) (defines.h:257). Catch it
// to fail fast instead of timing out.
const NOPERM_RE = /Permission denied/i

const FETCH_TIMEOUT_MS = 6000
const QUIESCENCE_MS = 1200

export function BotModulesTab({
  botName,
  botOnline,
  messages,
  onCommandSilent,
  canEdit,
}: BotModulesTabProps) {
  const { t } = useTranslation()
  const [modules, setModules] = useState<ModuleEntry[]>([])
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmRehash, setConfirmRehash] = useState(false)

  const startIdxRef = useRef(0)
  const startTsRef = useRef(0)
  const lastMatchTsRef = useRef(0)
  const debounceRef = useRef<number | null>(null)

  const fetchModules = () => {
    if (!botOnline || !canEdit) return
    setError(null)
    setLoading(true)
    setModules([])
    setDone(false)
    startIdxRef.current = messages.length
    startTsRef.current = Date.now()
    lastMatchTsRef.current = Date.now()
    onCommandSilent(`bc ${botName} modules`, SILENCE_RE, FETCH_TIMEOUT_MS)
  }

  useEffect(() => {
    fetchModules()
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botName])

  useEffect(() => {
    if (!loading) return
    const slice = messages.slice(startIdxRef.current)
    if (slice.length === 0) return

    const collected: ModuleEntry[] = []
    const seen = new Set(modules.map(m => m.file))
    let countSeen = false
    for (const m of slice) {
      if (NOPERM_RE.test(m.text)) {
        setLoading(false)
        setDone(true)
        setError(t('bots.modulesReadonly'))
        return
      }
      const match = m.text.match(MODULE_RE)
      if (match && !seen.has(match[1])) {
        seen.add(match[1])
        collected.push({
          file: match[1],
          version: match[2].trim(),
          author: match[3].trim(),
        })
        lastMatchTsRef.current = Date.now()
        continue
      }
      if (COUNT_RE.test(m.text)) {
        countSeen = true
        lastMatchTsRef.current = Date.now()
      }
    }

    if (collected.length > 0) setModules(prev => [...prev, ...collected])

    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const sinceLast = Date.now() - lastMatchTsRef.current
      const sinceStart = Date.now() - startTsRef.current
      if (countSeen || sinceLast >= QUIESCENCE_MS || sinceStart >= FETCH_TIMEOUT_MS) {
        setLoading(false)
        setDone(true)
        if (!countSeen && collected.length === 0 && modules.length === 0 && sinceStart >= FETCH_TIMEOUT_MS) {
          setError(t('bots.modulesFetchTimeout'))
        }
      }
    }, QUIESCENCE_MS + 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading])

  const handleRehash = () => {
    onCommandSilent(`bc ${botName} rehash`, /^(?:\([^)]+\)\s+)?(?:rehash|cfg|loaded|module)/i, 3000)
    window.setTimeout(() => fetchModules(), 1000)
  }

  if (!canEdit) {
    return (
      <div className="bot-modules-panel">
        <div className="config-readonly-notice">
          <Icon name="lock" size={13} />
          {t('bots.modulesReadonly')}
        </div>
      </div>
    )
  }

  if (!botOnline) {
    return (
      <div className="bot-modules-panel">
        <EmptyState
          icon="wifi-off"
          title={t('bots.offline')}
          description={t('bots.modulesFetchTimeout')}
        />
      </div>
    )
  }

  return (
    <div className="bot-modules-panel">
      <div className="bot-status-toolbar">
        <p className="config-desc">{t('bots.modulesDesc')}</p>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <Button size="sm" variant="ghost" onClick={fetchModules} disabled={loading}>
            <Icon name="activity" size={13} />
            {t('common.refresh')}
          </Button>
          <Button size="sm" variant="primary" onClick={() => setConfirmRehash(true)} title={t('bots.rehashDesc')}>
            <Icon name="zap" size={13} />
            {t('bots.rehash')}
          </Button>
        </div>
      </div>

      {error && (
        <div className="config-readonly-notice" style={{ color: 'var(--err)', background: 'var(--err-lo)', borderColor: 'rgba(248, 113, 113, 0.25)' }}>
          <Icon name="alert-triangle" size={13} />
          {error}
        </div>
      )}

      {loading && modules.length === 0 ? (
        <SkeletonPanel lines={4} label={t('common.loading')} />
      ) : modules.length === 0 && done ? (
        <EmptyState
          icon="inbox"
          title={t('bots.modulesEmpty')}
          description={t('bots.modulesEmptyDesc')}
        />
      ) : (
        <>
          <div className="bot-modules-count">
            {t('bots.modulesCount').replace('{n}', String(modules.length))}
          </div>
          <ul className="bot-modules-list">
            {modules.map(m => (
              <li key={m.file} className="bot-modules-item">
                <span className="bot-modules-file mono">{m.file}</span>
                <span className="bot-modules-meta">
                  <span className="bot-modules-version mono">v{m.version}</span>
                  <span className="bot-modules-author">{m.author}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <ConfirmDialog
        isOpen={confirmRehash}
        onClose={() => setConfirmRehash(false)}
        onConfirm={handleRehash}
        title={t('bots.rehashConfirmTitle').replace('{bot}', botName)}
        message={t('bots.rehashConfirmBody')}
        confirmLabel={t('bots.rehash')}
        variant="primary"
      />
    </div>
  )
}
