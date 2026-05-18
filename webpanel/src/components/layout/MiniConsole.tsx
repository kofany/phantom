import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Message } from '../../types'
import { Icon } from '../common'

const MAX_MESSAGES = 400
const HISTORY_KEY = 'phantom_console_history'
const HISTORY_LIMIT = 200
const HEIGHT_KEY = 'phantom_console_height'
const DEFAULT_HEIGHT = 200
const MIN_HEIGHT = 140
// Max height is computed per-drag from the viewport so on tall screens you can
// drag the console up to ~80% of the window. Falls back to 900 in SSR.
const MAX_HEIGHT_FALLBACK = 900
function getMaxHeight(): number {
  if (typeof window === 'undefined') return MAX_HEIGHT_FALLBACK
  // Leave ~120px for header + breathing room so content area is never zero.
  return Math.max(MIN_HEIGHT + 40, Math.floor(window.innerHeight * 0.8))
}

type Level = 'all' | 'cmd' | 'evt' | 'raw'

type Classified = {
  id: string
  time: Date
  from: string
  text: string
  lvl: 'INFO' | 'OK' | 'WARN' | 'ERR' | 'RAW' | 'CMD' | 'EVT'
  lvlClass: string
  bucket: Level
}

// Suggestion catalogue: dot-command + one-line gloss. The gloss is what makes
// the dropdown actually useful (vs. just listing names), so we keep entries
// short and partyline-accurate. Add entries in usage order — sort happens at
// render time.
type QuickCmd = { cmd: string; hint: string }
const QUICK_CMDS: QuickCmd[] = [
  { cmd: '.help',    hint: 'List commands' },
  { cmd: '.bots',    hint: 'Show connected bots' },
  { cmd: '.users',   hint: 'List userlist handles' },
  { cmd: '.chans',   hint: 'List channels' },
  { cmd: '.who',     hint: 'Who is on partyline' },
  { cmd: '.uptime',  hint: 'Hub uptime' },
  { cmd: '.upbots',  hint: 'Bring bots up' },
  { cmd: '.downbots',hint: 'Take bots down' },
  { cmd: '.+bot',    hint: '.+bot <handle> <ip>' },
  { cmd: '.-bot',    hint: '.-bot <handle>' },
  { cmd: '.+user',   hint: '.+user <handle> <hostmask>' },
  { cmd: '.-user',   hint: '.-user <handle>' },
  { cmd: '.chattr',  hint: '.chattr <handle> <flags> [#chan]' },
  { cmd: '.chpass',  hint: '.chpass <handle> <password>' },
  { cmd: '.+addr',   hint: '.+addr <handle> <ip>' },
  { cmd: '.+chan',   hint: '.+chan <#name>' },
  { cmd: '.-chan',   hint: '.-chan <#name>' },
  { cmd: '.chanset', hint: '.chanset <#chan> <var> <value>' },
  { cmd: '.bc',      hint: '.bc <bot|*> <command>' },
  { cmd: '.save',    hint: 'Save userlist to disk' },
  { cmd: '.set',     hint: '.set <var> [value]' },
  { cmd: '.match',   hint: '.match <mask>' },
  { cmd: '.list',    hint: '.list [flags]' },
]
const QUICK_CMD_NAMES = QUICK_CMDS.map(q => q.cmd)

function classify(m: Message, idx: number): Classified {
  const from = m.from || '[hub]'
  const text = m.text
  const lower = text.toLowerCase()

  let lvl: Classified['lvl'] = 'INFO'
  let lvlClass = 'lvl-info'
  let bucket: Level = 'raw'

  if (from === '[error]' || lower.includes('error')) {
    lvl = 'ERR'
    lvlClass = 'lvl-err'
    bucket = 'evt'
  } else if (lower.startsWith('✓')) {
    lvl = 'OK'
    lvlClass = 'lvl-ok'
    bucket = 'evt'
  } else if (lower.includes('warn') || lower.includes('lag')) {
    lvl = 'WARN'
    lvlClass = 'lvl-warn'
    bucket = 'evt'
  } else if (from === '[system]') {
    lvl = 'EVT'
    lvlClass = 'lvl-evt'
    bucket = 'evt'
  } else if (!m.system) {
    lvl = 'CMD'
    lvlClass = 'lvl-cmd'
    bucket = 'cmd'
  } else {
    lvl = 'RAW'
    lvlClass = 'lvl-raw'
    bucket = 'raw'
  }

  return {
    id: `${m.time.getTime()}-${idx}`,
    time: m.time,
    from,
    text,
    lvl,
    lvlClass,
    bucket,
  }
}

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(-HISTORY_LIMIT) : []
  } catch {
    return []
  }
}

function saveHistory(history: string[]) {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(history.slice(-HISTORY_LIMIT))
    )
  } catch {
    /* ignore quota */
  }
}

function formatTime(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

type MiniConsoleProps = {
  messages: Message[]
  onCommand: (cmd: string) => void
  onChat: (text: string) => void
}

export function MiniConsole({ messages, onCommand, onChat }: MiniConsoleProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [history, setHistory] = useState<string[]>(() => loadHistory())
  const [historyIdx, setHistoryIdx] = useState<number | null>(null)
  const [filter, setFilter] = useState<Level>('all')
  const [paused, setPaused] = useState(false)
  const [cleared, setCleared] = useState(0)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [height, setHeight] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(HEIGHT_KEY)
      const n = raw ? Number(raw) : DEFAULT_HEIGHT
      if (!Number.isFinite(n)) return DEFAULT_HEIGHT
      return Math.max(MIN_HEIGHT, Math.min(getMaxHeight(), n))
    } catch {
      return DEFAULT_HEIGHT
    }
  })
  const messagesRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Messages that arrived after the last "clear" action, excluding ones
  // marked as hidden (programmatic silent-fetch responses — e.g. the
  // `.bc <bot> cfg` listing triggered by opening BotDetail).
  const liveMessages = useMemo(() => {
    const sliceFrom = Math.max(0, cleared)
    return messages.slice(sliceFrom).filter(m => !m.hidden)
  }, [messages, cleared])

  const classified = useMemo(() => {
    const base = liveMessages.slice(-MAX_MESSAGES)
    return base.map((m, i) => classify(m, i))
  }, [liveMessages])

  const filtered = useMemo(() => {
    if (filter === 'all') return classified
    return classified.filter(c => c.bucket === filter)
  }, [classified, filter])

  // Auto-scroll when new messages arrive (unless paused)
  useEffect(() => {
    if (paused || !messagesRef.current) return
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [filtered, paused])

  // Keyboard focus shortcut: Ctrl+` focuses console input
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Drag-to-resize — uses refs so the listeners don't get torn down and
  // re-attached mid-drag on every setHeight() render (which broke the previous
  // implementation because its [height] effect reset drag state).
  const heightRef = useRef<number>(height)
  const draggingRef = useRef<boolean>(false)
  const dragStartY = useRef<number>(0)
  const dragStartH = useRef<number>(0)
  const dragMaxH = useRef<number>(MAX_HEIGHT_FALLBACK)
  const [isDragging, setIsDragging] = useState(false)

  // Keep heightRef in sync with state + expose height as CSS variable so
  // .main-content can reserve the right bottom padding.
  useEffect(() => {
    heightRef.current = height
    document.documentElement.style.setProperty(
      '--console-h',
      `${height}px`
    )
  }, [height])

  // Clear the CSS variable on unmount (e.g. when dropping to mobile layout).
  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty('--console-h')
    }
  }, [])

  // Also clamp height if the viewport shrinks below the current console height.
  useEffect(() => {
    const onResize = () => {
      const maxH = getMaxHeight()
      if (heightRef.current > maxH) {
        setHeight(maxH)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    draggingRef.current = true
    dragStartY.current = e.clientY
    dragStartH.current = heightRef.current
    dragMaxH.current = getMaxHeight()
    setIsDragging(true)
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'ns-resize'

    const onMove = (ev: PointerEvent) => {
      if (!draggingRef.current) return
      const dy = dragStartY.current - ev.clientY
      const next = Math.max(
        MIN_HEIGHT,
        Math.min(dragMaxH.current, dragStartH.current + dy)
      )
      setHeight(next)
    }
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      setIsDragging(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      try {
        localStorage.setItem(HEIGHT_KEY, String(heightRef.current))
      } catch {
        /* ignore quota */
      }
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const onHandleDoubleClick = () => {
    // Reset to default on double-click
    setHeight(DEFAULT_HEIGHT)
    try {
      localStorage.setItem(HEIGHT_KEY, String(DEFAULT_HEIGHT))
    } catch {
      /* ignore quota */
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const value = input.trim()
    if (!value) return

    if (value.startsWith('.')) {
      onCommand(value.slice(1))
    } else {
      onChat(value)
    }

    const nextHistory = [...history.filter(h => h !== value), value].slice(
      -HISTORY_LIMIT
    )
    setHistory(nextHistory)
    saveHistory(nextHistory)
    setHistoryIdx(null)
    setInput('')
    setSuggestOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      if (history.length === 0) return
      e.preventDefault()
      const next =
        historyIdx === null
          ? history.length - 1
          : Math.max(0, historyIdx - 1)
      setHistoryIdx(next)
      setInput(history[next])
      return
    }
    if (e.key === 'ArrowDown') {
      if (historyIdx === null) return
      e.preventDefault()
      const next = historyIdx + 1
      if (next >= history.length) {
        setHistoryIdx(null)
        setInput('')
      } else {
        setHistoryIdx(next)
        setInput(history[next])
      }
      return
    }
    if (e.key === 'Tab') {
      // Tab complete for dot commands
      if (input.startsWith('.')) {
        e.preventDefault()
        const match = QUICK_CMD_NAMES.find(c => c.startsWith(input))
        if (match) setInput(match)
      }
    }
    if (e.key === 'Escape') {
      setSuggestOpen(false)
      inputRef.current?.blur()
    }
  }

  const handleClear = () => {
    setCleared(messages.length)
  }

  const togglePause = () => setPaused(p => !p)

  const stats = useMemo(() => {
    let cmd = 0, evt = 0, raw = 0
    for (const c of classified) {
      if (c.bucket === 'cmd') cmd++
      else if (c.bucket === 'evt') evt++
      else raw++
    }
    return { cmd, evt, raw }
  }, [classified])

  const showQuickstart = classified.length === 0

  // Suggestion list as user types a dot command. Match by prefix on the command
  // itself OR by substring in the hint, so typing `.add` surfaces `.+bot` /
  // `.+user`. Cap at 6 entries to keep the popover tight.
  const suggestions = useMemo(() => {
    if (!input.startsWith('.') || input.length < 1) return [] as QuickCmd[]
    const q = input.toLowerCase()
    const prefix = QUICK_CMDS.filter(
      c => c.cmd.startsWith(q) && c.cmd !== q,
    )
    if (prefix.length >= 6) return prefix.slice(0, 6)
    const seen = new Set(prefix.map(p => p.cmd))
    const fuzzy = QUICK_CMDS.filter(
      c => !seen.has(c.cmd) && c.hint.toLowerCase().includes(q.slice(1)),
    )
    return [...prefix, ...fuzzy].slice(0, 6)
  }, [input])

  return (
    <div
      className={`mini-console${isDragging ? ' resizing' : ''}`}
      style={{ height: `${height}px` }}
    >
      <div
        className="drag-handle"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize console"
        title="Drag to resize · double-click to reset"
        onPointerDown={onHandlePointerDown}
        onDoubleClick={onHandleDoubleClick}
      />
      <div className="mini-console-header" data-paused={paused}>
        <div className="title">
          <span className="dot" />
          {t('nav.console')}
        </div>
        <div className="counts">
          <span>CMD {stats.cmd}</span>
          <span>EVT {stats.evt}</span>
          <span>RAW {stats.raw}</span>
        </div>
        <div className="tools">
          <div className="filter-seg" role="tablist" aria-label="Filter">
            {(['all', 'cmd', 'evt', 'raw'] as Level[]).map(l => (
              <button
                key={l}
                className={filter === l ? 'active' : ''}
                onClick={() => setFilter(l)}
                role="tab"
                aria-selected={filter === l}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            className="tool-btn"
            onClick={togglePause}
            title={paused ? 'Resume' : 'Pause'}
            aria-label={paused ? 'Resume' : 'Pause'}
          >
            <Icon name={paused ? 'play' : 'pause'} size={13} />
          </button>
          <button
            className="tool-btn"
            onClick={handleClear}
            title="Clear console"
            aria-label="Clear"
          >
            <Icon name="eraser" size={13} />
          </button>
        </div>
      </div>

      <div className="mini-console-messages" ref={messagesRef}>
        {showQuickstart ? (
          <div className="empty-quickstart">
            <div className="intro">{t('console.hint')}</div>
            <div className="hints">
              {QUICK_CMDS.slice(0, 6).map(({ cmd }) => (
                <button
                  key={cmd}
                  className="chip"
                  onClick={() => {
                    setInput(cmd)
                    inputRef.current?.focus()
                  }}
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        ) : (
          filtered.map(c => (
            <div className="console-row" key={c.id}>
              <span className="time">{formatTime(c.time)}</span>
              <span className={`lvl ${c.lvlClass}`}>{c.lvl}</span>
              <span className="text">
                <span className="from">{c.from}</span>
                {c.text}
              </span>
            </div>
          ))
        )}
      </div>

      <form
        className="mini-console-input"
        onSubmit={handleSubmit}
        style={{ position: 'relative' }}
      >
        <span className="prompt">{'❯'}</span>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => {
            setInput(e.target.value)
            setHistoryIdx(null)
            setSuggestOpen(true)
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => setSuggestOpen(true)}
          onBlur={() => {
            // Defer so click on a suggestion item still fires before close.
            window.setTimeout(() => setSuggestOpen(false), 120)
          }}
          placeholder={t('console.placeholder')}
          // Chrome/Edge ignore plain autoComplete=off for free-text inputs and
          // happily pop their own (very low-contrast) history dropdown. The
          // combination below is what actually suppresses it cross-browser.
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          // Password-manager opt-outs (1Password / LastPass / Bitwarden) —
          // the console isn't a credential field.
          data-1p-ignore="true"
          data-lpignore="true"
          data-form-type="other"
          aria-label="Console input"
          aria-autocomplete="list"
          aria-expanded={suggestOpen && suggestions.length > 0}
        />
        {suggestOpen && suggestions.length > 0 && (
          <div className="console-suggest" role="listbox" aria-label="Console suggestions">
            <div className="console-suggest-label">COMMANDS</div>
            {suggestions.map(s => (
              <button
                type="button"
                key={s.cmd}
                role="option"
                aria-selected="false"
                className="console-suggest-item"
                onMouseDown={e => {
                  e.preventDefault()
                  setInput(s.cmd)
                  setSuggestOpen(false)
                  inputRef.current?.focus()
                }}
              >
                <span className="mono">{s.cmd}</span>
                <span className="hint">{s.hint}</span>
              </button>
            ))}
          </div>
        )}
        <button type="submit">Send</button>
      </form>
    </div>
  )
}
