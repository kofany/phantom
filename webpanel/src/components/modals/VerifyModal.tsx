import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Modal, Button, Icon } from '../common'
import { Message } from '../../types'

type VerifyModalProps = {
  isOpen: boolean
  onClose: () => void
  messages: Message[]
  onCommandSilent: (cmd: string, pattern: RegExp, durationMs?: number) => void
}

// `.verify` iterates userlist + all protlists on every connected bot and
// compares checksums — on a large botnet this legitimately takes 10-60s.
const VERIFY_SILENCE = /^(?:\([^)]+\)\s+)?(?:verify|consistency|mismatch|checking|up to date|ok|error|\d+\s)/i

// Stop waiting if no verify-looking line has arrived for this long.
const IDLE_STOP_MS = 4000
// Hard ceiling — psotnic should have emitted *something* in this time.
const MAX_RUN_MS = 90_000

export function VerifyModal({ isOpen, onClose, messages, onCommandSilent }: VerifyModalProps) {
  const { t } = useTranslation()
  const [lines, setLines] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const fetchStartIdxRef = useRef(0)
  const fetchStartTsRef = useRef(0)
  const lastMatchTsRef = useRef(0)
  const debounceRef = useRef<number | null>(null)
  const tickRef = useRef<number | null>(null)

  const runVerify = () => {
    setLines([])
    setRunning(true)
    setElapsed(0)
    fetchStartIdxRef.current = messages.length
    fetchStartTsRef.current = Date.now()
    lastMatchTsRef.current = Date.now()
    onCommandSilent('verify', VERIFY_SILENCE, MAX_RUN_MS)
  }

  useEffect(() => {
    if (isOpen) {
      runVerify()
    }
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
      if (tickRef.current) window.clearInterval(tickRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  // Elapsed-time ticker while running
  useEffect(() => {
    if (!running) {
      if (tickRef.current) window.clearInterval(tickRef.current)
      return
    }
    tickRef.current = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - fetchStartTsRef.current) / 1000))
    }, 500)
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current)
    }
  }, [running])

  useEffect(() => {
    if (!running || !isOpen) return
    const newMsgs = messages.slice(fetchStartIdxRef.current)
    if (newMsgs.length === 0) return

    const collected: string[] = []
    for (const m of newMsgs) {
      const t = m.text.trim()
      if (!t) continue
      if (VERIFY_SILENCE.test(t) || /\b(verify|userlist|protlist|checksum|mismatch|synced)\b/i.test(t)) {
        collected.push(t)
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
      if (sinceLast >= IDLE_STOP_MS || sinceStart >= MAX_RUN_MS) setRunning(false)
    }, IDLE_STOP_MS + 100)
  }, [messages, running, isOpen])

  const hasIssues = lines.some(l => /\b(mismatch|error|fail|differ|desync)\b/i.test(l))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('verify.title')}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <p className="config-desc">{t('verify.desc')}</p>

        {running ? (
          <div className="verify-running">
            <span className="spinner-tiny" />
            <span>{t('verify.running')}</span>
            <span className="mono verify-elapsed">{elapsed}s</span>
            {lines.length > 0 && (
              <span className="verify-progress-count mono">
                {t('verify.linesCaptured', { n: String(lines.length) })}
              </span>
            )}
          </div>
        ) : lines.length === 0 ? (
          <div className="verify-empty">
            <Icon name="check" size={16} />
            <span>{t('verify.noOutput')}</span>
          </div>
        ) : (
          <div className={`verify-output ${hasIssues ? 'has-issues' : 'ok'}`}>
            {lines.map((line, i) => (
              <div key={i} className="verify-line mono">{line}</div>
            ))}
          </div>
        )}

        <div className="modal-actions">
          <Button variant="ghost" onClick={onClose}>{t('common.close')}</Button>
          <Button onClick={runVerify} disabled={running}>
            <Icon name="activity" size={13} />
            {t('verify.runAgain')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
