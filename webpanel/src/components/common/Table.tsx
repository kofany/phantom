import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Icon, IconName } from './Icon'
import { SkeletonRows } from './Skeleton'
import { EmptyState } from './EmptyState'
import { csvBuild } from '../../utils/csv'

export type BulkAction<T> = {
  id: string
  label: string
  icon?: IconName
  /** Styled in danger red. */
  destructive?: boolean
  /** Filter which selected rows the action applies to. The bar shows the
   *  count of applicable rows next to the label. When 0, button disables. */
  appliesTo?: (item: T) => boolean
  /** Receives only the rows that pass `appliesTo` (or all selected if none). */
  onClick: (selected: T[]) => void
}

// Re-exported for callers that build column arrays incrementally.
export type Column<T> = {
  key: string
  header: string
  render?: (item: T) => ReactNode
  sortable?: boolean
  /** Override the value used for sorting for this column. */
  accessor?: (item: T) => string | number | null | undefined
  /** Override the value used for searching. Falls back to accessor, then raw key. */
  searchAccessor?: (item: T) => string
  className?: string
  /** Fixed column width (any valid CSS length string). Goes on <col>. */
  width?: string
  /** Minimum column width — enforced on the cell so long values collapse
   *  into ellipsis rather than blowing up the layout. */
  minWidth?: string
  /** Treat contents as overflow-wrap: anywhere (primary columns). */
  flex?: boolean
}

type TableProps<T> = {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  emptyMessage?: string
  emptyDescription?: string
  /** CTA shown in the empty state when `data` is empty (and no search filter
   *  is active). Typically an "Add first X" button. */
  emptyAction?: ReactNode
  onRowClick?: (item: T) => void
  loading?: boolean
  search?: string
  showToolbar?: boolean
  onSearchChange?: (v: string) => void
  toolbarExtra?: ReactNode
  /** Rows to render as skeletons while loading. Default 5. */
  skeletonRows?: number
  /** When provided, sortKey + sortDir are persisted in localStorage under
   *  `phantom:table:sort:<storageKey>` and restored on mount. Omit to keep the
   *  table sort ephemeral (sub-tables, transient lists). */
  storageKey?: string
  /** Enable bulk row selection with these actions. Renders a leading
   *  checkbox column and a sticky action bar above the table when at
   *  least one row is selected. Omit to hide entirely. */
  bulkActions?: BulkAction<T>[]
}

/** Row count at which CSS content-visibility virtualization kicks in. */
export const VIRTUALIZE_THRESHOLD = 80

const defaultAccessor = <T,>(item: T, key: string): unknown => {
  return (item as Record<string, unknown>)[key]
}

const toSearchString = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string') return v.toLowerCase()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).toLowerCase()
  return ''
}

// CSV cell value: prefer searchAccessor (already a clean string), then
// accessor (might be number), then raw key. Skip render() — that returns
// JSX which can't be flattened to CSV reliably.
function csvCellValue<T>(item: T, col: Column<T>): string {
  if (col.searchAccessor) return col.searchAccessor(item)
  if (col.accessor) {
    const v = col.accessor(item)
    return v == null ? '' : String(v)
  }
  const v = (item as Record<string, unknown>)[col.key]
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v)
  }
  return ''
}

function downloadCsv(filename: string, rows: string[][]) {
  // Prepend BOM so Excel reads UTF-8 correctly on Windows.
  const blob = new Blob(['﻿' + csvBuild(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Slight delay before revoke — some browsers race the click.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function loadSort(key: string | undefined): { sortKey: string | null; sortDir: 'asc' | 'desc' } {
  if (!key) return { sortKey: null, sortDir: 'asc' }
  try {
    const raw = localStorage.getItem(`phantom:table:sort:${key}`)
    if (!raw) return { sortKey: null, sortDir: 'asc' }
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.sortKey === 'string' &&
        (parsed.sortDir === 'asc' || parsed.sortDir === 'desc')) {
      return { sortKey: parsed.sortKey, sortDir: parsed.sortDir }
    }
  } catch { /* ignore corrupted entry */ }
  return { sortKey: null, sortDir: 'asc' }
}

function loadHiddenCols(key: string | undefined): Set<string> {
  if (!key) return new Set()
  try {
    const raw = localStorage.getItem(`phantom:table:cols:${key}`)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return new Set(parsed.filter(v => typeof v === 'string'))
  } catch { /* ignore */ }
  return new Set()
}

type SavedView = {
  name: string
  sortKey: string | null
  sortDir: 'asc' | 'desc'
  hiddenCols: string[]
}

function loadViews(key: string | undefined): SavedView[] {
  if (!key) return []
  try {
    const raw = localStorage.getItem(`phantom:table:views:${key}`)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (v): v is SavedView =>
        v && typeof v.name === 'string' &&
        Array.isArray(v.hiddenCols) &&
        (v.sortDir === 'asc' || v.sortDir === 'desc'),
    )
  } catch { /* ignore */ }
  return []
}

export function Table<T extends object>({
  columns,
  data,
  keyExtractor,
  emptyMessage,
  emptyDescription,
  emptyAction,
  onRowClick,
  loading = false,
  search: externalSearch,
  showToolbar = true,
  onSearchChange,
  toolbarExtra,
  skeletonRows = 5,
  storageKey,
  bulkActions,
}: TableProps<T>) {
  const { t } = useTranslation()
  const initialSort = useMemo(() => loadSort(storageKey), [storageKey])
  const [sortKey, setSortKey] = useState<string | null>(initialSort.sortKey)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSort.sortDir)
  const [internalSearch, setInternalSearch] = useState('')
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => loadHiddenCols(storageKey))
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)
  const [views, setViews] = useState<SavedView[]>(() => loadViews(storageKey))
  const [viewsOpen, setViewsOpen] = useState(false)
  const [savingView, setSavingView] = useState(false)
  const [newViewName, setNewViewName] = useState('')
  const viewsMenuRef = useRef<HTMLDivElement>(null)
  // -1 = no row focused. Reset to -1 when data shrinks below the focused
  // index, when search/sort changes, or on user Esc.
  const [focusIndex, setFocusIndex] = useState<number>(-1)
  const tbodyRef = useRef<HTMLTableSectionElement>(null)

  // Persist hidden columns whenever the set changes — keyed by storageKey.
  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(
        `phantom:table:cols:${storageKey}`,
        JSON.stringify(Array.from(hiddenCols)),
      )
    } catch { /* ignore */ }
  }, [storageKey, hiddenCols])

  // Close column menu on outside click / Escape.
  useEffect(() => {
    if (!colMenuOpen) return
    const onDown = (e: globalThis.MouseEvent) => {
      if (!colMenuRef.current?.contains(e.target as Node)) setColMenuOpen(false)
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setColMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [colMenuOpen])

  // Persist views.
  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(`phantom:table:views:${storageKey}`, JSON.stringify(views))
    } catch { /* ignore */ }
  }, [storageKey, views])

  // Close views menu on outside / Esc.
  useEffect(() => {
    if (!viewsOpen) return
    const onDown = (e: globalThis.MouseEvent) => {
      if (!viewsMenuRef.current?.contains(e.target as Node)) {
        setViewsOpen(false)
        setSavingView(false)
      }
    }
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setViewsOpen(false)
        setSavingView(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [viewsOpen])

  const applyView = (v: SavedView) => {
    setSortKey(v.sortKey)
    setSortDir(v.sortDir)
    setHiddenCols(new Set(v.hiddenCols))
    setViewsOpen(false)
  }

  const saveCurrentView = () => {
    const name = newViewName.trim()
    if (!name) return
    setViews(prev => {
      // Replace if name collides — saves cleanly.
      const filtered = prev.filter(v => v.name !== name)
      return [
        ...filtered,
        { name, sortKey, sortDir, hiddenCols: Array.from(hiddenCols) },
      ]
    })
    setSavingView(false)
    setNewViewName('')
  }

  const deleteView = (name: string) => {
    setViews(prev => prev.filter(v => v.name !== name))
  }

  // Visible columns = all minus user-hidden minus underscore-prefixed
  // (those are pseudo-columns like the kebab — never hidable, but we still
  // render them in the actual table). Kebab/_action columns appear in the
  // dropdown as disabled to make their presence obvious.
  const visibleColumns = useMemo(
    () => columns.filter(c => !hiddenCols.has(c.key)),
    [columns, hiddenCols],
  )

  // First non-_ column is treated as the "anchor" and can't be hidden.
  const anchorKey = useMemo(
    () => columns.find(c => !c.key.startsWith('_'))?.key,
    [columns],
  )

  const toggleColHidden = (key: string) => {
    setHiddenCols(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set())
  const hasBulk = !!bulkActions && bulkActions.length > 0

  // Persist sort whenever it changes — only when a key is provided.
  useEffect(() => {
    if (!storageKey) return
    try {
      if (sortKey == null) {
        localStorage.removeItem(`phantom:table:sort:${storageKey}`)
      } else {
        localStorage.setItem(
          `phantom:table:sort:${storageKey}`,
          JSON.stringify({ sortKey, sortDir }),
        )
      }
    } catch { /* private mode etc. — ignore */ }
  }, [storageKey, sortKey, sortDir])

  // When parent controls search (externalSearch provided), the internal toolbar
  // input is hidden — the parent's header search pill drives filtering. When
  // used standalone (e.g. sub-tables in ChannelDetail) the table owns the input.
  const isControlled = externalSearch !== undefined
  const search = isControlled ? (externalSearch as string) : internalSearch
  const handleSearchChange = onSearchChange ?? setInternalSearch

  const filtered = useMemo(() => {
    if (!search.trim()) return data
    const q = search.toLowerCase()
    // Always search across ALL columns — hiding doesn't restrict the index,
    // only the rendering (matches user intent: "find X" should find X even
    // if its column is hidden).
    return data.filter(row =>
      columns.some(col => {
        if (col.searchAccessor) {
          return col.searchAccessor(row).toLowerCase().includes(q)
        }
        const raw = col.accessor
          ? col.accessor(row)
          : defaultAccessor(row, col.key)
        return toSearchString(raw).includes(q)
      })
    )
  }, [data, columns, search])

  const sorted = useMemo(() => {
    if (!sortKey) return filtered
    const col = columns.find(c => c.key === sortKey)
    if (!col) return filtered
    const getValue = (row: T) => {
      if (col.accessor) return col.accessor(row)
      return defaultAccessor(row, sortKey) as string | number | null | undefined
    }
    return [...filtered].sort((a, b) => {
      const av = getValue(a)
      const bv = getValue(b)
      if (av === bv) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const cmp = av < bv ? -1 : 1
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [filtered, sortKey, sortDir, columns])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  // Reset focus when the underlying ordered data changes shape — prevents
  // the focused index from pointing past the end after a filter/sort.
  useEffect(() => {
    setFocusIndex(idx => (idx >= sorted.length ? -1 : idx))
  }, [sorted.length])

  const onTableKeyDown = (e: React.KeyboardEvent<HTMLTableElement>) => {
    // Don't fight the kebab/menu/checkbox/etc. that handle their own keys.
    const target = e.target as HTMLElement | null
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      return
    }

    const key = e.key
    const isDown = key === 'ArrowDown' || key === 'j'
    const isUp   = key === 'ArrowUp'   || key === 'k'

    if (isDown || isUp) {
      e.preventDefault()
      if (sorted.length === 0) return
      setFocusIndex(idx => {
        if (idx < 0) return isDown ? 0 : sorted.length - 1
        if (isDown) return Math.min(idx + 1, sorted.length - 1)
        return Math.max(idx - 1, 0)
      })
      return
    }

    if (key === 'Home') {
      e.preventDefault()
      if (sorted.length > 0) setFocusIndex(0)
      return
    }
    if (key === 'End') {
      e.preventDefault()
      if (sorted.length > 0) setFocusIndex(sorted.length - 1)
      return
    }

    if (key === 'Escape') {
      setFocusIndex(-1)
      return
    }

    if (focusIndex < 0 || focusIndex >= sorted.length) return

    if (key === 'Enter' && onRowClick) {
      e.preventDefault()
      onRowClick(sorted[focusIndex])
      return
    }

    // Space or 'x' — toggle bulk selection if enabled.
    if (hasBulk && (key === ' ' || key === 'x' || key === 'X')) {
      e.preventDefault()
      toggleRow(keyExtractor(sorted[focusIndex]))
      return
    }
  }

  // Scroll focused row into view smoothly when keyboard nav moves it.
  useEffect(() => {
    if (focusIndex < 0 || !tbodyRef.current) return
    const row = tbodyRef.current.querySelectorAll('tr')[focusIndex]
    if (row instanceof HTMLElement) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [focusIndex])

  // Drop selected keys whose row disappeared (e.g. after bulk delete or
  // server refresh). Runs whenever the dataset shifts.
  useEffect(() => {
    if (!hasBulk || selectedKeys.size === 0) return
    const live = new Set(data.map(keyExtractor))
    let changed = false
    const next = new Set<string>()
    for (const k of selectedKeys) {
      if (live.has(k)) next.add(k)
      else changed = true
    }
    if (changed) setSelectedKeys(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, hasBulk])

  const selectedItems = useMemo(
    () => (hasBulk ? sorted.filter(item => selectedKeys.has(keyExtractor(item))) : []),
    [sorted, selectedKeys, hasBulk, keyExtractor],
  )

  const toggleRow = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAllVisible = () => {
    setSelectedKeys(prev => {
      const visibleKeys = sorted.map(keyExtractor)
      const allChecked = visibleKeys.length > 0 && visibleKeys.every(k => prev.has(k))
      const next = new Set(prev)
      if (allChecked) {
        for (const k of visibleKeys) next.delete(k)
      } else {
        for (const k of visibleKeys) next.add(k)
      }
      return next
    })
  }

  const visibleKeys = useMemo(() => sorted.map(keyExtractor), [sorted, keyExtractor])
  const allVisibleChecked =
    hasBulk && visibleKeys.length > 0 && visibleKeys.every(k => selectedKeys.has(k))
  const someVisibleChecked =
    hasBulk && !allVisibleChecked && visibleKeys.some(k => selectedKeys.has(k))

  const totalCols = visibleColumns.length + (hasBulk ? 1 : 0)
  const showSkeleton = loading && data.length === 0
  const hidableColumns = columns.filter(c => !c.key.startsWith('_') && c.key !== anchorKey)

  return (
    <div className="table-shell">
      {hasBulk && selectedKeys.size > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label="Bulk actions">
          <span className="bulk-count">
            <strong>{selectedKeys.size}</strong> {t('table.selected')}
          </span>
          <div className="bulk-actions">
            {[
              ...bulkActions!,
              {
                id: '__csv',
                label: t('table.exportCsv'),
                icon: 'copy' as const,
                onClick: (items: T[]) => {
                  const exportable = columns.filter(c => !c.key.startsWith('_'))
                  const header = exportable.map(c => c.header)
                  const rows = items.map(it => exportable.map(c => csvCellValue(it, c)))
                  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
                  downloadCsv(`${storageKey ?? 'export'}-${stamp}.csv`, [header, ...rows])
                },
              } as BulkAction<T>,
            ].map(act => {
              const applicable = act.appliesTo
                ? selectedItems.filter(act.appliesTo)
                : selectedItems
              const disabled = applicable.length === 0
              return (
                <button
                  key={act.id}
                  type="button"
                  className={`bulk-btn${act.destructive ? ' destructive' : ''}`}
                  disabled={disabled}
                  onClick={() => act.onClick(applicable)}
                  title={act.appliesTo ? `${applicable.length}/${selectedItems.length}` : undefined}
                >
                  {act.icon && <Icon name={act.icon} size={13} />}
                  {act.label}
                  {act.appliesTo && (
                    <span className="bulk-btn-count">{applicable.length}</span>
                  )}
                </button>
              )
            })}
          </div>
          <button
            type="button"
            className="bulk-clear"
            onClick={() => setSelectedKeys(new Set())}
            title={t('table.clearSelection')}
            aria-label={t('table.clearSelection')}
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      )}
      {showToolbar && (
        <div className="table-toolbar">
          {!isControlled && (
            <label className="search-pill" style={{ minWidth: '260px', flex: '0 1 340px' }}>
              <Icon name="search" size={14} />
              <input
                type="text"
                placeholder={t('table.searchPlaceholder')}
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                aria-label="Filter"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  className="icon-btn"
                  style={{ width: 22, height: 22, borderRadius: 4 }}
                  aria-label="Clear"
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </label>
          )}
          <span className="text-xs text-ink-4">
            {t('table.showing')} <strong className="text-ink-2">{sorted.length}</strong>{' '}
            {t('table.of')} {data.length}
            {isControlled && search && (
              <>
                {' · '}
                <span className="text-accent">
                  "{search}"
                </span>
              </>
            )}
          </span>
          {storageKey && (
            <div className="views-menu-wrap" ref={viewsMenuRef}>
              <button
                type="button"
                className={`col-menu-trigger${viewsOpen ? ' is-open' : ''}`}
                onClick={() => setViewsOpen(v => !v)}
                aria-haspopup="menu"
                aria-expanded={viewsOpen}
                title={t('table.views')}
              >
                <Icon name="bookmark" size={14} />
              </button>
              {viewsOpen && (
                <div className="col-menu" role="menu">
                  <div className="col-menu-head">
                    <span>{t('table.views')}</span>
                  </div>
                  {views.length === 0 ? (
                    <div className="col-menu-item" style={{ color: 'var(--ink-4)', fontSize: '0.75rem', cursor: 'default' }}>
                      {t('table.noViews')}
                    </div>
                  ) : (
                    views.map(v => (
                      <div key={v.name} className="view-row">
                        <button
                          type="button"
                          className="view-apply"
                          onClick={() => applyView(v)}
                          title={t('table.applyView')}
                        >
                          <Icon name="play" size={11} />
                          <span>{v.name}</span>
                        </button>
                        <button
                          type="button"
                          className="view-del"
                          onClick={() => deleteView(v.name)}
                          aria-label={t('table.deleteView')}
                          title={t('table.deleteView')}
                        >
                          <Icon name="x" size={11} />
                        </button>
                      </div>
                    ))
                  )}
                  <div className="col-menu-sep" />
                  {savingView ? (
                    <div className="view-save-form">
                      <input
                        type="text"
                        value={newViewName}
                        onChange={e => setNewViewName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            saveCurrentView()
                          }
                          if (e.key === 'Escape') {
                            setSavingView(false)
                            setNewViewName('')
                          }
                        }}
                        placeholder={t('table.viewNamePlaceholder')}
                        autoFocus
                        className="view-name-input"
                      />
                      <button type="button" className="view-save-btn" onClick={saveCurrentView}>
                        <Icon name="check" size={11} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="col-menu-item view-save-trigger"
                      onClick={() => setSavingView(true)}
                    >
                      <Icon name="plus" size={12} />
                      <span>{t('table.saveCurrentView')}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {hidableColumns.length > 0 && (
            <div className="col-menu-wrap" ref={colMenuRef}>
              <button
                type="button"
                className={`col-menu-trigger${colMenuOpen ? ' is-open' : ''}`}
                onClick={() => setColMenuOpen(v => !v)}
                aria-haspopup="menu"
                aria-expanded={colMenuOpen}
                title={t('table.columns')}
              >
                <Icon name="settings" size={14} />
              </button>
              {colMenuOpen && (
                <div className="col-menu" role="menu">
                  <div className="col-menu-head">
                    <span>{t('table.columns')}</span>
                    {hiddenCols.size > 0 && (
                      <button
                        type="button"
                        className="col-menu-reset"
                        onClick={() => setHiddenCols(new Set())}
                      >
                        {t('table.showAll')}
                      </button>
                    )}
                  </div>
                  {hidableColumns.map(c => (
                    <label key={c.key} className="col-menu-item">
                      <input
                        type="checkbox"
                        checked={!hiddenCols.has(c.key)}
                        onChange={() => toggleColHidden(c.key)}
                      />
                      <span>{c.header}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
          {toolbarExtra && (
            <div className="u-row u-gap-sm u-ml-auto">
              {toolbarExtra}
            </div>
          )}
        </div>
      )}

      <div className="table-wrapper">
        <table
          tabIndex={0}
          onKeyDown={onTableKeyDown}
          className={`table${sorted.length >= VIRTUALIZE_THRESHOLD ? ' virtualized' : ''}`}>
          {visibleColumns.some(c => c.width) && (
            <colgroup>
              {hasBulk && <col style={{ width: 36 }} />}
              {visibleColumns.map(c => (
                <col key={c.key} style={c.width ? { width: c.width } : undefined} />
              ))}
            </colgroup>
          )}
          <thead>
            <tr>
              {hasBulk && (
                <th className="bulk-cell" style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label={t('table.selectAll')}
                    checked={allVisibleChecked}
                    ref={el => {
                      if (el) el.indeterminate = someVisibleChecked
                    }}
                    onChange={toggleAllVisible}
                    onClick={e => e.stopPropagation()}
                  />
                </th>
              )}
              {visibleColumns.map(col => {
                const active = sortKey === col.key
                return (
                  <th
                    key={col.key}
                    className={`${col.sortable ? 'sortable' : ''} ${
                      active ? 'active' : ''
                    } ${col.className || ''}`}
                    style={col.minWidth ? { minWidth: col.minWidth } : undefined}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    aria-sort={
                      col.sortable
                        ? active
                          ? sortDir === 'asc'
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                        : undefined
                    }
                  >
                    <span className="th-inner">
                      {col.header}
                      {col.sortable && (
                        <span
                          className={`sort-chevron${active ? ' is-active' : ''}${
                            active && sortDir === 'asc' ? ' is-asc' : ''
                          }`}
                          aria-hidden
                        >
                          <Icon name="chevron-down" size={12} />
                        </span>
                      )}
                    </span>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {showSkeleton ? (
              <SkeletonRows rows={skeletonRows} columns={totalCols} />
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={totalCols} style={{ padding: 0, borderBottom: 0 }}>
                  <EmptyState
                    variant={search ? 'no-results' : 'empty'}
                    title={emptyMessage || t('common.noResults')}
                    description={emptyDescription}
                    action={search ? undefined : emptyAction}
                  />
                </td>
              </tr>
            ) : (
              sorted.map((item, idx) => {
                const itemKey = keyExtractor(item)
                const checked = hasBulk && selectedKeys.has(itemKey)
                const focused = idx === focusIndex
                return (
                  <tr
                    key={itemKey}
                    onClick={onRowClick ? () => onRowClick(item) : undefined}
                    onMouseEnter={() => setFocusIndex(idx)}
                    className={`${onRowClick ? 'clickable' : ''}${checked ? ' is-selected' : ''}${focused ? ' is-kbd-focus' : ''}`}
                  >
                    {hasBulk && (
                      <td className="bulk-cell" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={t('table.selectRow')}
                          checked={checked}
                          onChange={() => toggleRow(itemKey)}
                        />
                      </td>
                    )}
                    {visibleColumns.map(col => (
                      <td key={col.key} className={col.className}>
                        {col.render
                          ? col.render(item)
                          : String(defaultAccessor(item, col.key) ?? '')}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
