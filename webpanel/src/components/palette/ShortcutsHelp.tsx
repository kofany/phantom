import { useEffect } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Icon } from '../common'

type ShortcutsHelpProps = {
  isOpen: boolean
  onClose: () => void
}

type ShortcutEntry = {
  keys: string[]        // list of keys for chords ("Ctrl", "K") or sequences ("g", "c")
  sep?: 'plus' | 'then' // how to render the keys — "plus" = ⌘+K, "then" = g → c
  labelKey: string
}

type ShortcutGroup = {
  labelKey: string
  entries: ShortcutEntry[]
}

const GROUPS: ShortcutGroup[] = [
  {
    labelKey: 'shortcuts.groupActions',
    entries: [
      { keys: ['⌘', 'K'],      sep: 'plus', labelKey: 'shortcuts.openPalette' },
      { keys: ['Ctrl', 'B'],   sep: 'plus', labelKey: 'shortcuts.quickBan' },
      { keys: ['/'],           labelKey: 'shortcuts.focusSearch' },
      { keys: ['?'],           labelKey: 'shortcuts.showHelp' },
      { keys: ['Esc'],         labelKey: 'shortcuts.closeDialog' },
    ],
  },
  {
    labelKey: 'shortcuts.groupNavigation',
    entries: [
      { keys: ['g', 'h'], sep: 'then', labelKey: 'shortcuts.gotoOverview' },
      { keys: ['g', 'c'], sep: 'then', labelKey: 'shortcuts.gotoChannels' },
      { keys: ['g', 'u'], sep: 'then', labelKey: 'shortcuts.gotoUsers' },
      { keys: ['g', 'b'], sep: 'then', labelKey: 'shortcuts.gotoBots' },
      { keys: ['g', 't'], sep: 'then', labelKey: 'shortcuts.gotoTopology' },
      { keys: ['g', 'a'], sep: 'then', labelKey: 'shortcuts.gotoAudit' },
    ],
  },
  {
    labelKey: 'shortcuts.groupPalette',
    entries: [
      { keys: ['↑', '↓'], sep: 'then', labelKey: 'shortcuts.paletteMove' },
      { keys: ['↵'],               labelKey: 'shortcuts.paletteSelect' },
      { keys: ['Home'],            labelKey: 'shortcuts.paletteHome' },
      { keys: ['End'],             labelKey: 'shortcuts.paletteEnd' },
    ],
  },
]

export function ShortcutsHelp({ isOpen, onClose }: ShortcutsHelpProps) {
  const { t } = useTranslation()

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div className="shortcuts-backdrop" onClick={onClose}>
      <div
        className="shortcuts-card"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label={t('shortcuts.title')}
      >
        <div className="shortcuts-header">
          <h2>{t('shortcuts.title')}</h2>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="shortcuts-grid">
          {GROUPS.map(g => (
            <div key={g.labelKey} className="shortcuts-group">
              <div className="shortcuts-group-label">{t(g.labelKey)}</div>
              <ul>
                {g.entries.map((s, i) => (
                  <li key={i} className="shortcut-row">
                    <span className="shortcut-keys">
                      {s.keys.map((k, idx) => (
                        <span key={idx}>
                          <kbd>{k}</kbd>
                          {idx < s.keys.length - 1 && (
                            <span className="shortcut-sep">
                              {s.sep === 'then' ? 'then' : '+'}
                            </span>
                          )}
                        </span>
                      ))}
                    </span>
                    <span className="shortcut-label">{t(s.labelKey)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="shortcuts-footer">
          {t('shortcuts.hint')}
        </div>
      </div>
    </div>
  )
}
