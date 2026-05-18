import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, Icon, EmptyState, ConfirmDialog, SkeletonPanel } from '../common'
import { Message } from '../../types'

type UserOffencesTabProps = {
  userName: string
  messages: Message[]
  onCommandSilent: (cmd: string, pattern: RegExp, durationMs?: number) => void
  canEdit: boolean
}

type OffenceLine = {
  text: string
  time: number
}

// `.offences <handle>` emits a freeform textual report. We preserve the raw
// output and render line-by-line with monospace formatting. Not trying to
// parse structure because psotnic variations differ.
const OFFENCE_SILENCE = /^(?:\([^)]+\)\s+)?(?:offence|offences|offense|offenses|idiot\s+level|\-\-\-|no offences)/i

export function UserOffencesTab({ userName, messages, onCommandSilent, canEdit }: UserOffencesTabProps) {
  const { t } = useTranslation()
  const [lines, setLines] = useState<OffenceLine[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const fetchStartIdxRef = useRef(0)
  const fetchStartTsRef = useRef(0)
  const lastMatchTsRef = useRef(0)
  const debounceRef = useRef<number | null>(null)

  const fetchOffences = () => {
    setLoading(true)
    setLines([])
    fetchStartIdxRef.current = messages.length
    fetchStartTsRef.current = Date.now()
    lastMatchTsRef.current = Date.now()
    onCommandSilent(`offences ${userName}`, OFFENCE_SILENCE, 3000)
  }

  useEffect(() => {
    fetchOffences()
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName])

  // Collect matching lines; generous heuristic since output isn't structured
  useEffect(() => {
    if (!loading) return
    const newMsgs = messages.slice(fetchStartIdxRef.current)
    if (newMsgs.length === 0) return

    const collected: OffenceLine[] = []
    let matched = 0
    for (const m of newMsgs) {
      const t = m.text.trim()
      if (!t) continue
      if (OFFENCE_SILENCE.test(t) || /\b(offence|offense|idiot)\b/i.test(t)) {
        collected.push({ text: t, time: m.time.getTime() })
        matched++
      }
    }

    if (collected.length > 0) {
      setLines(collected)
      lastMatchTsRef.current = Date.now()
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const sinceLast = Date.now() - lastMatchTsRef.current
      const sinceStart = Date.now() - fetchStartTsRef.current
      if (sinceLast >= 1500 || sinceStart >= 10000) setLoading(false)
    }, 1550)
  }, [messages, loading])

  const handleClear = () => {
    if (!canEdit) return
    onCommandSilent(`clearoffences ${userName}`, /^(?:\([^)]+\)\s+)?(?:offences?|cleared|ok)/i, 2000)
    window.setTimeout(() => fetchOffences(), 600)
  }

  return (
    <div className="offences-panel">
      <div className="offences-toolbar">
        <p className="config-desc" style={{ margin: 0 }}>{t('offences.desc')}</p>
        <div style={{ display: 'flex', gap: '0.4rem', marginLeft: 'auto' }}>
          <Button size="sm" variant="ghost" onClick={fetchOffences} disabled={loading}>
            <Icon name="activity" size={13} />
            {t('common.refresh')}
          </Button>
          {canEdit && lines.length > 0 && (
            <Button size="sm" variant="danger" onClick={() => setConfirmClear(true)}>
              <Icon name="eraser" size={13} />
              {t('offences.clearAll')}
            </Button>
          )}
        </div>
      </div>

      {loading && lines.length === 0 ? (
        <SkeletonPanel lines={6} header={false} label={t('common.loading')} />
      ) : lines.length === 0 ? (
        <EmptyState icon="check" title={t('offences.emptyTitle')} description={t('offences.emptyDesc')} />
      ) : (
        <div className="offences-stream">
          {lines.map((l, i) => (
            <div key={`${l.time}-${i}`} className="offences-line">
              <span className="offences-time mono">
                {new Date(l.time).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="offences-text mono">{l.text}</span>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={handleClear}
        title={t('offences.confirmClearTitle')}
        message={t('offences.confirmClear').replace('{user}', userName)}
        confirmLabel={t('offences.clearAll')}
      />
    </div>
  )
}
