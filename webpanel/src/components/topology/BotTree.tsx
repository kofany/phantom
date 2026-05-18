import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, Icon, EmptyState, SkeletonPanel } from '../common'
import { Message } from '../../types'

type BotTreeProps = {
  messages: Message[]
  onCommandSilent: (cmd: string, pattern: RegExp, durationMs?: number) => void
}

type Slave = {
  name: string
  warning?: string                    // psotnic flags inconsistencies
  leafs: { name: string; warning?: string }[]
}

type ParsedTree = {
  hubName: string
  slaves: Slave[]
  directLeafs: { name: string; warning?: string }[]
  totalBots: number
}

// `.bt` output (from sendBotTree in class-userlist.cpp):
//
//   hubname (has 2 slaves)
//    |-slave1 (has 3 leafs)
//    |   |-leaf-a
//    |   |-leaf-b
//    |   `-leaf-c
//    `-slave2 (has 1 leaf)
//        `-leaf-d
//    |-leaf-on-main-1
//    `-leaf-on-main-2
//   5 bots on-line
//
// Bold (\002 wrapped) lines are warnings ("X has slave flags but is not linked to me").
// We strip control chars and parse line-by-line into a structured tree.
const HUB_RE      = /^(\S+)\s+\(has\s+(\d+)\s+slaves?\)\s*$/
const SLAVE_RE    = /^[ |`]+\-(\S+)\s+\(has\s+(\d+)\s+leafs?\)\s*$/
const LEAF_RE     = /^[ |`]+\-(\S+)\s*$/
const TOTAL_RE    = /^(\d+)\s+bots?\s+on-line\s*$/
const WARN_RE     = /^[\x02]?(.+?)[\x02]?$/

const SILENCE_PATTERN = /^(?:\([^)]+\)\s+)?(?:[\x02]?\S+(?:\s+\(has\s+\d+\s+(?:slave|leaf)s?\))?|\d+\s+bots?\s+on-line|[ |`]+\-)/i

function stripControl(s: string): string {
  return s.replace(/[\x02\x1f\x0f]/g, '').trim()
}

function isBoldWarning(raw: string): boolean {
  return raw.includes('\x02')
}

function parseBotTree(lines: string[]): ParsedTree | null {
  const tree: ParsedTree = {
    hubName: '', slaves: [], directLeafs: [], totalBots: 0,
  }
  let currentSlave: Slave | null = null
  let foundHub = false

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const isWarn = isBoldWarning(raw)
    const clean = stripControl(line)

    // Hub line
    const hub = clean.match(HUB_RE)
    if (hub && !foundHub) {
      tree.hubName = hub[1]
      foundHub = true
      continue
    }

    // Total count line
    const total = clean.match(TOTAL_RE)
    if (total) { tree.totalBots = parseInt(total[1], 10); continue }

    // Try to detect slave vs leaf by indentation depth
    // Slaves start with " |-" or " `-" (1 indent level)
    // Leafs of a slave start with " |   |-" or " |   `-" (2 indent levels)
    // Leafs of main start with " |-" or " `-" (same as slaves but no "(has N leafs)")
    const indentDepth = (raw.match(/^[ |]*/)?.[0] || '').length
    const slaveMatch = clean.match(SLAVE_RE)
    if (slaveMatch) {
      currentSlave = { name: slaveMatch[1], leafs: [] }
      tree.slaves.push(currentSlave)
      continue
    }

    const leafMatch = clean.match(LEAF_RE)
    if (leafMatch) {
      const name = leafMatch[1]
      // Heuristic: depth >= 5 means it's a slave's leaf (4 chars of " |   " or "     ")
      const isSlaveLeaf = currentSlave && indentDepth >= 4
      if (isSlaveLeaf && currentSlave) {
        currentSlave.leafs.push({ name, warning: isWarn ? clean : undefined })
      } else {
        // direct leaf of main hub
        tree.directLeafs.push({ name, warning: isWarn ? clean : undefined })
        currentSlave = null   // direct leafs come after slaves' leaf groups
      }
      continue
    }

    // Could be a warning line that doesn't fit other patterns —
    // attach to current slave if we have one, else log to direct
    if (isWarn) {
      const w = clean.match(WARN_RE)?.[1]
      if (w && currentSlave) currentSlave.warning = w
    }
  }

  return foundHub ? tree : null
}

export function BotTree({ messages, onCommandSilent }: BotTreeProps) {
  const { t } = useTranslation()
  const [rawLines, setRawLines] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  const fetchStartIdxRef = useRef(0)
  const fetchStartTsRef = useRef(0)
  const lastMatchTsRef = useRef(0)
  const debounceRef = useRef<number | null>(null)

  const fetchTree = () => {
    setLoading(true)
    setRawLines([])
    fetchStartIdxRef.current = messages.length
    fetchStartTsRef.current = Date.now()
    lastMatchTsRef.current = Date.now()
    onCommandSilent('bt', SILENCE_PATTERN, 4000)
  }

  useEffect(() => {
    fetchTree()
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!loading) return
    const newMsgs = messages.slice(fetchStartIdxRef.current)
    if (newMsgs.length === 0) return

    const collected: string[] = []
    let matched = 0
    for (const m of newMsgs) {
      const t = m.text
      // Bottree lines: hub (has N slaves) | indented branches | "N bots on-line"
      if (
        HUB_RE.test(stripControl(t)) ||
        SLAVE_RE.test(stripControl(t)) ||
        LEAF_RE.test(stripControl(t)) ||
        TOTAL_RE.test(stripControl(t)) ||
        isBoldWarning(t)
      ) {
        collected.push(t)
        matched++
      }
    }

    if (collected.length > 0) {
      setRawLines(collected)
      lastMatchTsRef.current = Date.now()
    }

    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      const sinceLast = Date.now() - lastMatchTsRef.current
      const sinceStart = Date.now() - fetchStartTsRef.current
      if (sinceLast >= 1500 || sinceStart >= 8000) setLoading(false)
    }, 1550)
  }, [messages, loading])

  const tree = useMemo(() => parseBotTree(rawLines), [rawLines])

  return (
    <div className="bottree-panel">
      <div className="bottree-head">
        <div>
          <h3 className="bottree-title">{t('bottree.title')}</h3>
          <p className="config-desc">{t('bottree.desc')}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={fetchTree} disabled={loading}>
          <Icon name="activity" size={13} />
          {t('common.refresh')}
        </Button>
      </div>

      {loading && rawLines.length === 0 ? (
        <SkeletonPanel lines={6} label={t('common.loading')} />
      ) : !tree ? (
        <EmptyState icon="bot" title={t('bottree.emptyTitle')} description={t('bottree.emptyDesc')} />
      ) : (
        <div className="bottree-view">
          <div className="bottree-stats">
            <span className="bottree-stat">
              <strong>{tree.totalBots}</strong> {t('bottree.totalBots')}
            </span>
            <span className="bottree-stat">
              <strong>{tree.slaves.length}</strong> {t('bottree.slaves')}
            </span>
            <span className="bottree-stat">
              <strong>{tree.directLeafs.length}</strong> {t('bottree.directLeafs')}
            </span>
          </div>

          <div className="bottree-tree">
            {/* Hub root */}
            <div className="bottree-node bottree-hub">
              <span className="bottree-node-icon"><Icon name="server" size={14} /></span>
              <span className="bottree-node-name mono">{tree.hubName}</span>
              <span className="bottree-node-tag">HUB</span>
            </div>

            {/* Slaves with their leafs */}
            {tree.slaves.map(slave => (
              <div key={`s-${slave.name}`} className="bottree-branch">
                <div className={`bottree-node bottree-slave ${slave.warning ? 'has-warning' : ''}`}>
                  <span className="bottree-node-icon"><Icon name="server" size={13} /></span>
                  <span className="bottree-node-name mono">{slave.name}</span>
                  <span className="bottree-node-tag tag-slave">SLAVE</span>
                  {slave.warning && (
                    <span className="bottree-warning" title={slave.warning}>
                      <Icon name="alert-triangle" size={11} />
                    </span>
                  )}
                </div>
                {slave.leafs.map(leaf => (
                  <div key={`l-${leaf.name}`} className={`bottree-node bottree-leaf bottree-leaf-of-slave ${leaf.warning ? 'has-warning' : ''}`}>
                    <span className="bottree-tree-line"></span>
                    <span className="bottree-node-icon"><Icon name="bot" size={12} /></span>
                    <span className="bottree-node-name mono">{leaf.name}</span>
                    {leaf.warning && (
                      <span className="bottree-warning" title={leaf.warning}>
                        <Icon name="alert-triangle" size={11} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {/* Direct leafs of main hub */}
            {tree.directLeafs.length > 0 && (
              <div className="bottree-branch">
                {tree.directLeafs.map(leaf => (
                  <div key={`dl-${leaf.name}`} className={`bottree-node bottree-leaf ${leaf.warning ? 'has-warning' : ''}`}>
                    <span className="bottree-node-icon"><Icon name="bot" size={12} /></span>
                    <span className="bottree-node-name mono">{leaf.name}</span>
                    <span className="bottree-node-tag tag-leaf">LEAF</span>
                    {leaf.warning && (
                      <span className="bottree-warning" title={leaf.warning}>
                        <Icon name="alert-triangle" size={11} />
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
