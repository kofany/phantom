import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, Icon, Spinner } from '../common'
import { Message } from '../../types'

type UserMaskSearchProps = {
  messages: Message[]
  onCommandSilent: (cmd: string, pattern: RegExp, durationMs?: number) => void
  /** Click on a result row jumps to the matching user. */
  onSelectHandle: (handle: string) => void
}

type ResultLine = {
  raw: string
  handle: string | null
}

/**
 * Wraps `.match <expr> [flags] [chan]`. Hub returns a free-form text reply:
 *   "<handle>! <hosts> {flags}"            (one line per match)
 *   "(more than N matches, list truncated)"
 *   "No matches has been found"
 *   "--- Found N matches for '<expr>'"
 *
 * We capture every line that arrives while a query is in-flight and parse
 * the leading word as the handle. Lines we can't parse are still shown
 * verbatim so the operator sees raw output if psotnic varies the format.
 */
const SILENCE_RE = /^(?:\([^)]+\)\s+)?(?:[A-Za-z0-9_\-\[\]\\^`{}|]+!|---\s+Found|No matches|\(more than|Total of)/i
const HANDLE_LINE_RE = /^([A-Za-z0-9_\-\[\]\\^`{}|]{1,16})!/
const SUMMARY_RE = /^---\s+Found (\d+) match(?:es)? for '([^']*)'/i
const NONE_RE = /^No matches has been found/i

const FETCH_TIMEOUT_MS = 6000
const QUIESCENCE_MS = 1200

export function UserMaskSearch({
  messages,
  onCommandSilent,
  onSelectHandle,
}: UserMaskSearchProps) {
  const { t } = useTranslation()
  const [expr, setExpr] = useState('')
  const [flags, setFlags] = useState('')
  const [chan, setChan] = useState('')
  const [results, setResults] = useState<ResultLine[]>([])
  const [summary, setSummary] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [open, setOpen] = useState(false)

  const startIdxRef = useRef(0)
  const startTsRef = useRef(0)
  const lastMatchTsRef = useRef(0)
  const debounceRef = useRef<number | null>(null)

  const run = () => {
    const e = expr.trim()
    if (!e) return
    setOpen(true)
    setRunning(true)
    setResults([])
    setSummary(null)
    startIdxRef.current = messages.length
    startTsRef.current = Date.now()
    lastMatchTsRef.current = Date.now()

    // Build args: "match <expr> [flags] [chan]". Each token is a positional
    // argument so we can't skip flags if chan is present — psotnic's
    // str2words collapses whitespace. When chan is set without flags we
    // pass "*" as the flag placeholder which matches everything.
    const f = flags.trim()
    const c = chan.trim()
    let args = e
    if (c && !f) args = `${e} * ${c}`
    else if (c) args = `${e} ${f} ${c}`
    else if (f) args = `${e} ${f}`

    onCommandSilent(`match ${args}`, SILENCE_RE, FETCH_TIMEOUT_MS)
  }

  // Collect lines while running
  useEffect(() => {
    if (!running) return
    const slice = messages.slice(startIdxRef.current)
    if (slice.length === 0) return

    let summaryText: string | null = summary
    const collected: ResultLine[] = []
    for (const m of slice) {
      const text = m.text.trim()
      if (!text) continue
      const summaryMatch = text.match(SUMMARY_RE)
      if (summaryMatch) {
        summaryText = t('users.matchSummary')
          .replace('{n}', summaryMatch[1])
          .replace('{q}', summaryMatch[2])
        continue
      }
      if (NONE_RE.test(text)) {
        summaryText = t('users.matchEmpty')
        continue
      }
      const handleMatch = text.match(HANDLE_LINE_RE)
      collected.push({
        raw: text,
        handle: handleMatch ? handleMatch[1] : null,
      })
      lastMatchTsRef.current = Date.now()
    }

    if (collected.length || summaryText !== summary) {
      setResults(prev => [...prev, ...collected])
      if (summaryText !== summary) setSummary(summaryText)
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const sinceLast = Date.now() - lastMatchTsRef.current
      const sinceStart = Date.now() - startTsRef.current
      if (sinceLast >= QUIESCENCE_MS || sinceStart >= FETCH_TIMEOUT_MS) {
        setRunning(false)
        startIdxRef.current = messages.length
      }
    }, QUIESCENCE_MS + 50)
  }, [messages, running, summary, t])

  useEffect(() => () => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
  }, [])

  return (
    <div className="user-mask-search">
      <form
        className="user-mask-search-form"
        onSubmit={e => {
          e.preventDefault()
          run()
        }}
      >
        <input
          type="text"
          className="user-mask-search-expr"
          placeholder={t('users.matchSearchPlaceholder')}
          value={expr}
          onChange={e => setExpr(e.target.value)}
          aria-label={t('users.matchSearch')}
        />
        <input
          type="text"
          className="user-mask-search-flags"
          placeholder={t('users.matchSearchFlags')}
          value={flags}
          onChange={e => setFlags(e.target.value)}
          aria-label={t('users.matchSearchFlags')}
        />
        <input
          type="text"
          className="user-mask-search-chan"
          placeholder={t('users.matchSearchChan')}
          value={chan}
          onChange={e => setChan(e.target.value)}
          aria-label={t('users.matchSearchChan')}
        />
        <Button type="submit" size="sm" disabled={!expr.trim() || running}>
          {running ? <Spinner size={12} /> : <Icon name="search" size={13} />}
          {running ? t('users.matchRunning') : t('users.matchRun')}
        </Button>
      </form>
      <p className="form-hint user-mask-search-hint">{t('users.matchSearchHint')}</p>

      {open && (
        <div className="user-mask-search-results" role="region" aria-live="polite">
          <div className="user-mask-search-results-head">
            <strong>{t('users.matchResults')}</strong>
            {summary && <span className="user-mask-search-summary">{summary}</span>}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOpen(false)}
              aria-label={t('users.matchClose')}
            >
              <Icon name="x" size={12} />
            </Button>
          </div>

          {!running && results.length === 0 && !summary && (
            <div className="user-mask-search-empty">{t('users.matchTimeout')}</div>
          )}

          {results.length > 0 && (
            <ul className="user-mask-search-list">
              {results.map((r, i) => (
                <li key={`${i}-${r.raw}`}>
                  {r.handle ? (
                    <button
                      type="button"
                      className="user-mask-search-row clickable"
                      onClick={() => onSelectHandle(r.handle as string)}
                    >
                      <span className="user-mask-search-handle mono">{r.handle}</span>
                      <span className="user-mask-search-detail mono">
                        {r.raw.replace(`${r.handle}!`, '').trim()}
                      </span>
                    </button>
                  ) : (
                    <div className="user-mask-search-row">
                      <span className="user-mask-search-detail mono">{r.raw}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
