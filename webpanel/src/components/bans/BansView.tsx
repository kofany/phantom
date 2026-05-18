import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, Icon, Badge, ConfirmDialog, EmptyState } from '../common'
import { AddProtlistModal } from '../modals'
import { Channel, ChannelDetail, ProtlistEntry, formatTimestamp, formatExpires } from '../../types'
import type { ParsedProtlist, ProtlistKind } from './parseProtlist'

type ProtlistType = 'ban' | 'stick' | 'exempt' | 'invite' | 'reop'

// The "Global" view is a pseudo-channel in the selector. Pick a sentinel
// value that cannot collide with a real IRC channel (all real channels
// begin with '#', '&', '+' or '!').
const GLOBAL_SENTINEL = '__global__'

// Cache scraped global lists in-memory for 30s so flipping through the
// ban/stick/exempt/invite/reop tabs doesn't re-run `.bans *` every time.
const GLOBAL_CACHE_TTL_MS = 30_000

type BansViewProps = {
  channels: Channel[]
  currentChannel: ChannelDetail | null
  loading: boolean
  canEdit: boolean
  onFetchChannel: (channel: string) => void
  onAddProtlist: (listType: string, mask: string, channel?: string, reason?: string, expires?: number) => void
  onDelProtlist: (listType: string, mask: string, channel?: string) => void
  onQueryGlobalProtlists: () => Promise<Record<ProtlistKind, ParsedProtlist>>
}

const LIST_TYPES: { key: ProtlistType; labelKey: string; icon: string }[] = [
  { key: 'ban',    labelKey: 'bans.tabBans',    icon: 'shield' },
  { key: 'stick',  labelKey: 'bans.tabSticks',  icon: 'lock' },
  { key: 'exempt', labelKey: 'bans.tabExempts', icon: 'check' },
  { key: 'invite', labelKey: 'bans.tabInvites', icon: 'plus' },
  { key: 'reop',   labelKey: 'bans.tabReops',   icon: 'zap' },
]

function perChannelList(ch: ChannelDetail | null, type: ProtlistType): ProtlistEntry[] {
  if (!ch) return []
  switch (type) {
    case 'ban':    return ch.bans ?? []
    case 'stick':  return ch.sticks ?? []
    case 'exempt': return ch.exempts ?? []
    case 'invite': return ch.invites ?? []
    case 'reop':   return ch.reops ?? []
  }
}

// Map the UI's 5 list types onto the 4 protlist kinds used by the parser.
// "ban" and "stick" both come from the .bans query; the parser doesn't
// know which is which (the bot's [ * ] sticky marker only appears per
// entry), so we synthesise "stick" globals as an empty list for now and
// show all .bans output under "ban". A later iteration can split them
// once we start tracking the sticky marker per-entry in the parser.
const UI_TO_KIND: Record<Exclude<ProtlistType, 'stick'>, ProtlistKind> = {
  ban: 'ban', exempt: 'exempt', invite: 'invite', reop: 'reop',
}

export function BansView({
  channels, currentChannel, loading, canEdit,
  onFetchChannel, onAddProtlist, onDelProtlist, onQueryGlobalProtlists,
}: BansViewProps) {
  const { t } = useTranslation()
  const [selectedChannel, setSelectedChannel] = useState<string>('')
  const [activeType, setActiveType] = useState<ProtlistType>('ban')
  const [search, setSearch] = useState('')
  const [addMode, setAddMode] = useState<null | { scope: 'channel' | 'global'; type: ProtlistType }>(null)
  const [pendingDelete, setPendingDelete] = useState<null | { mask: string; type: ProtlistType; channel: string | undefined }>(null)

  // Global scrape state
  const [globalData, setGlobalData] = useState<Record<ProtlistKind, ParsedProtlist> | null>(null)
  const [globalLoading, setGlobalLoading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [globalFetchedAt, setGlobalFetchedAt] = useState(0)
  // Suppresses duplicate fetches when the user mashes the refresh button
  const inFlightRef = useRef(false)

  const isGlobal = selectedChannel === GLOBAL_SENTINEL

  // Pick a default channel on mount if we have any
  useEffect(() => {
    if (!selectedChannel && channels.length > 0) {
      setSelectedChannel(channels[0].name)
    }
  }, [channels, selectedChannel])

  // Fetch channel detail whenever the per-channel selection changes
  useEffect(() => {
    if (!selectedChannel || isGlobal) return
    if (currentChannel?.name !== selectedChannel) {
      onFetchChannel(selectedChannel)
    }
  }, [selectedChannel, isGlobal, currentChannel?.name, onFetchChannel])

  const refreshGlobal = useCallback(async (force = false) => {
    if (inFlightRef.current) return
    if (!force && globalData && Date.now() - globalFetchedAt < GLOBAL_CACHE_TTL_MS) return
    inFlightRef.current = true
    setGlobalLoading(true)
    setGlobalError(null)
    try {
      const data = await onQueryGlobalProtlists()
      setGlobalData(data)
      setGlobalFetchedAt(Date.now())
    } catch (e) {
      setGlobalError(e instanceof Error ? e.message : String(e))
    } finally {
      setGlobalLoading(false)
      inFlightRef.current = false
    }
  }, [onQueryGlobalProtlists, globalData, globalFetchedAt])

  // Kick off the global scrape the first time the user flips to "Global"
  useEffect(() => {
    if (isGlobal && !globalData && !globalLoading) {
      refreshGlobal(false)
    }
  }, [isGlobal, globalData, globalLoading, refreshGlobal])

  // Raw entries for whichever view is active
  const rawEntries = useMemo(() => {
    if (!isGlobal) return perChannelList(currentChannel, activeType)
    if (activeType === 'stick' || !globalData) return []
    const kind = UI_TO_KIND[activeType]
    return globalData[kind]?.global ?? []
  }, [isGlobal, currentChannel, activeType, globalData])

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rawEntries
    return rawEntries.filter(e =>
      e.mask.toLowerCase().includes(q) ||
      (e.reason || '').toLowerCase().includes(q) ||
      (e.by || '').toLowerCase().includes(q)
    )
  }, [rawEntries, search])

  const tabCounts: Record<ProtlistType, number> = useMemo(() => {
    if (isGlobal) {
      return {
        ban:    globalData?.ban?.global.length    ?? 0,
        stick:  0,  // see UI_TO_KIND note
        exempt: globalData?.exempt?.global.length ?? 0,
        invite: globalData?.invite?.global.length ?? 0,
        reop:   globalData?.reop?.global.length   ?? 0,
      }
    }
    return {
      ban: currentChannel?.bans?.length ?? 0,
      stick: currentChannel?.sticks?.length ?? 0,
      exempt: currentChannel?.exempts?.length ?? 0,
      invite: currentChannel?.invites?.length ?? 0,
      reop: currentChannel?.reops?.length ?? 0,
    }
  }, [isGlobal, globalData, currentChannel])

  const handleDelete = () => {
    if (!pendingDelete) return
    onDelProtlist(pendingDelete.type, pendingDelete.mask, pendingDelete.channel)
    // Optimistic: invalidate the global cache so the next flip re-fetches
    if (!pendingDelete.channel) {
      setGlobalData(null)
      setGlobalFetchedAt(0)
    }
    setPendingDelete(null)
  }

  const handleAdd = (listType: string, mask: string, channel: string | undefined, reason: string | undefined, time: number | undefined) => {
    onAddProtlist(listType, mask, channel, reason, time)
    // Invalidate global cache so a fresh add is visible after refresh
    if (!channel) {
      setGlobalData(null)
      setGlobalFetchedAt(0)
    }
  }

  const refreshCurrent = () => {
    if (isGlobal) { refreshGlobal(true); return }
    if (selectedChannel) onFetchChannel(selectedChannel)
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>{t('bans.title')}</h2>
          <span className="view-subtitle">
            {isGlobal ? t('bans.subtitleGlobal') : t('bans.subtitle')}
          </span>
        </div>
        <div className="view-tools">
          {canEdit && (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAddMode({ scope: 'global', type: activeType === 'stick' ? 'ban' : activeType })}
                title={t('bans.addGlobalHint')}
              >
                <Icon name="globe" size={13} />
                {t('bans.addGlobal')}
              </Button>
              <Button
                size="sm"
                onClick={() => setAddMode({ scope: 'channel', type: activeType })}
                disabled={isGlobal || !selectedChannel}
              >
                <Icon name="plus" size={13} />
                {t('bans.addChannel')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Channel selector (with Global pseudo-entry at the top) */}
      <div className="bans-channel-row">
        <label className="field-label">{t('bans.selectChannel')}</label>
        <select
          className="quickban-select"
          value={selectedChannel}
          onChange={e => setSelectedChannel(e.target.value)}
        >
          <option value={GLOBAL_SENTINEL}>🌐 {t('bans.globalOption')}</option>
          {channels.length === 0 && <option value="">{t('bans.noChannels')}</option>}
          {channels.map(c => (
            <option key={c.name} value={c.name}>
              {c.name}
              {c.bansCount !== undefined ? ` · ${c.bansCount} ban${c.bansCount === 1 ? '' : 's'}` : ''}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="ghost"
          onClick={refreshCurrent}
          disabled={loading || globalLoading}
        >
          <Icon name="activity" size={13} />
          {t('common.refresh')}
        </Button>
      </div>

      {/* Global-mode status bar */}
      {isGlobal && (
        <div className="irc-info-note" style={{ marginBottom: '0.6rem' }}>
          <Icon name="globe" size={12} />
          {globalLoading
            ? t('bans.globalFetching')
            : globalError
              ? t('bans.globalError').replace('{err}', globalError)
              : globalData
                ? t('bans.globalFetched').replace('{age}', String(Math.floor((Date.now() - globalFetchedAt) / 1000)))
                : t('bans.globalNotLoaded')}
        </div>
      )}

      {/* List-type tabs */}
      <div className="filter-seg bans-type-tabs">
        {LIST_TYPES.map(lt => {
          const disabled = isGlobal && lt.key === 'stick'
          return (
            <button
              key={lt.key}
              type="button"
              className={activeType === lt.key ? 'active' : ''}
              onClick={() => !disabled && setActiveType(lt.key)}
              disabled={disabled}
              title={disabled ? t('bans.stickGlobalUnavailable') : undefined}
            >
              <Icon name={lt.icon as never} size={13} />
              {t(lt.labelKey)}
              <span className="nav-count">{tabCounts[lt.key]}</span>
            </button>
          )
        })}
      </div>

      {/* Search */}
      <div className="irc-toolbar">
        <label className="search-pill" style={{ flex: 1 }}>
          <Icon name="search" size={14} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('bans.searchPlaceholder')}
            aria-label="Filter entries"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="icon-btn"
              style={{ width: 22, height: 22, borderRadius: 4 }}
              aria-label="Clear"
            >
              <Icon name="x" size={12} />
            </button>
          )}
        </label>
      </div>

      {/* Table */}
      {!selectedChannel ? (
        <EmptyState icon="hash" title={t('bans.pickChannelTitle')} description={t('bans.pickChannelDesc')} />
      ) : !isGlobal && loading && !currentChannel ? (
        <EmptyState variant="empty" icon="clock" title={t('common.loading')} />
      ) : isGlobal && globalLoading && !globalData ? (
        <EmptyState variant="empty" icon="clock" title={t('bans.globalFetching')} />
      ) : entries.length === 0 ? (
        <EmptyState
          variant="no-results"
          title={search ? t('bans.noMatches') : isGlobal && activeType === 'stick' ? t('bans.stickGlobalUnavailable') : t('bans.emptyList')}
          description={search ? undefined : isGlobal && activeType === 'stick' ? undefined : t('bans.emptyListDesc')}
        />
      ) : (
        <div className="table-shell">
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('bans.colMask')}</th>
                  <th>{t('bans.colReason')}</th>
                  <th style={{ width: '120px' }}>{t('bans.colBy')}</th>
                  <th style={{ width: '170px' }}>{t('bans.colWhen')}</th>
                  <th style={{ width: '170px' }}>{t('bans.colExpires')}</th>
                  {canEdit && <th style={{ width: '80px' }}>{t('bans.colAction')}</th>}
                </tr>
              </thead>
              <tbody>
                {entries.map(e => {
                  const isExpired = e.expires > 0 && e.expires < Math.floor(Date.now() / 1000)
                  return (
                    <tr key={`${activeType}:${e.mask}`}>
                      <td className="mono" style={{ color: 'var(--ink-1)' }}>{e.mask}</td>
                      <td>{e.reason || <span className="flag-empty">—</span>}</td>
                      <td className="mono text-ink-2">{e.by || <span className="flag-empty">—</span>}</td>
                      <td className="mono text-ink-3">{formatTimestamp(e.when)}</td>
                      <td>
                        {e.expires === 0 ? (
                          <Badge variant="default">{t('bans.permanent')}</Badge>
                        ) : isExpired ? (
                          <Badge variant="warning">{t('bans.expired')}</Badge>
                        ) : (
                          <span className="mono text-ink-3">{formatExpires(e.expires)}</span>
                        )}
                      </td>
                      {canEdit && (
                        <td>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setPendingDelete({
                              mask: e.mask,
                              type: activeType,
                              channel: isGlobal ? undefined : selectedChannel,
                            })}
                            title={t('common.delete')}
                          >
                            <Icon name="trash" size={12} />
                          </Button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddProtlistModal
        isOpen={addMode !== null}
        onClose={() => setAddMode(null)}
        onAdd={handleAdd}
        defaultType={addMode?.type ?? 'ban'}
        channel={addMode?.scope === 'channel' ? selectedChannel : undefined}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={handleDelete}
        title={t('bans.deleteTitle')}
        message={
          pendingDelete
            ? t('bans.deleteConfirm')
                .replace('{mask}', pendingDelete.mask)
                .replace('{channel}', pendingDelete.channel || t('bans.globalOption'))
            : ''
        }
        confirmLabel={t('common.delete')}
      />
    </div>
  )
}
