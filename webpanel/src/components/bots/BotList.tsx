import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Table, Button, StatusDot, Icon, ConfirmDialog, FreshnessBadge, KebabMenu, KebabAction, Column, BulkAction } from '../common'
import { Bot } from '../../types'

type BotListProps = {
  bots: Bot[]
  onSelect: (bot: Bot) => void
  onAdd?: () => void
  /** Bring all offline bots online (.upbots). Requires +n or higher. */
  onUpAll?: () => void
  /** Disconnect every online bot from the hub (.downbots). Destructive. */
  onDownAll?: () => void
  canAdd: boolean
  loading?: boolean
  searchValue?: string
  /** Wall-clock ms of last list_bots; null until first fetch arrives. */
  fetchedAt?: number | null
  onRefresh?: () => void
  /** When provided, exposes a kebab "Delete" action per row. Caller is
   *  responsible for confirmation UI. */
  onDelete?: (name: string) => void
  /** When provided, shows ".up <bot>" and ".down <bot>" actions in the kebab,
   *  routed through this generic command sender. Permission-gated by caller. */
  onSendCommand?: (cmd: string) => void
}

export function BotList({
  bots,
  onSelect,
  onAdd,
  onUpAll,
  onDownAll,
  canAdd,
  loading,
  searchValue,
  fetchedAt,
  onRefresh,
  onDelete,
  onSendCommand,
}: BotListProps) {
  const { t } = useTranslation()
  const [confirmAction, setConfirmAction] = useState<'up' | 'down' | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Bot | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState<{ action: 'delete'; targets: Bot[] } | null>(null)
  const onlineCount = bots.filter(b => b.online).length
  const offlineCount = bots.length - onlineCount

  const columns: Column<Bot>[] = [
    {
      key: 'name',
      header: t('bots.name'),
      sortable: true,
      minWidth: '140px',
      render: (b: Bot) => (
        <span className="mono text-ink-1" style={{ fontWeight: 500 }}>
          {b.name}
        </span>
      ),
    },
    {
      key: 'online',
      header: t('common.status'),
      width: '120px',
      render: (b: Bot) => (
        <StatusDot
          state={b.online ? 'online' : 'offline'}
          label={b.online ? t('bots.online') : t('bots.offline')}
        />
      ),
      sortable: true,
      searchAccessor: (b: Bot) => b.online ? 'online' : 'offline',
    },
    {
      key: 'nick',
      header: t('bots.nick'),
      sortable: true,
      minWidth: '120px',
      render: (b: Bot) =>
        b.nick ? (
          <span className="mono text-accent">
            {b.nick}
          </span>
        ) : (
          <span className="flag-empty">—</span>
        ),
    },
    {
      key: 'server',
      header: t('bots.server'),
      sortable: true,
      minWidth: '180px',
      render: (b: Bot) =>
        b.server ? (
          <span className="mono text-ink-2">
            {b.server}
          </span>
        ) : (
          <span className="flag-empty">—</span>
        ),
    },
    {
      key: 'ip',
      header: t('bots.ip'),
      width: '160px',
      render: (b: Bot) =>
        b.ip ? (
          <span className="mono text-ink-3 u-truncate" title={b.ip}>
            {b.ip}
          </span>
        ) : (
          <span className="flag-empty">—</span>
        ),
    },
  ]

  if (onDelete || onSendCommand) {
    columns.push({
      key: '_actions',
      header: '',
      width: '46px',
      render: (b: Bot) => {
        const acts: KebabAction[] = []
        if (onSendCommand) {
          if (!b.online) {
            acts.push({
              id: 'up',
              label: t('bots.up'),
              icon: 'play',
              onClick: () => onSendCommand(`up ${b.name}`),
            })
          } else {
            acts.push({
              id: 'down',
              label: t('bots.down'),
              icon: 'pause',
              onClick: () => onSendCommand(`down ${b.name}`),
            })
          }
        }
        if (onDelete) {
          acts.push({
            id: 'delete',
            label: t('common.delete'),
            icon: 'trash',
            destructive: true,
            onClick: () => setConfirmDelete(b),
          })
        }
        return <KebabMenu actions={acts} ariaLabel={`Actions for ${b.name}`} />
      },
    })
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>{t('bots.title')}</h2>
          <span className="view-subtitle">
            {onlineCount} / {bots.length} online
            {fetchedAt !== undefined && (
              <>
                {' '}<FreshnessBadge fetchedAt={fetchedAt ?? null} onRefresh={onRefresh} />
              </>
            )}
          </span>
        </div>
        <div className="view-tools">
          {onUpAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmAction('up')}
              disabled={offlineCount === 0}
              title={t('bots.upAllDesc')}
            >
              <Icon name="play" size={13} />
              {t('bots.upAll')}
              <span className="bot-bulk-count">({offlineCount})</span>
            </Button>
          )}
          {onDownAll && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmAction('down')}
              disabled={onlineCount === 0}
              title={t('bots.downAllDesc')}
            >
              <Icon name="pause" size={13} />
              {t('bots.downAll')}
              <span className="bot-bulk-count">({onlineCount})</span>
            </Button>
          )}
          {canAdd && onAdd && (
            <Button onClick={onAdd}>
              <Icon name="plus" size={14} />
              {t('bots.add')}
            </Button>
          )}
        </div>
      </div>
      <ConfirmDialog
        isOpen={confirmAction === 'up'}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => onUpAll?.()}
        title={t('bots.upAllConfirmTitle')}
        message={t('bots.upAllConfirmBody')}
        confirmLabel={t('bots.upAll')}
        variant="primary"
      />
      <ConfirmDialog
        isOpen={confirmAction === 'down'}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => onDownAll?.()}
        title={t('bots.downAllConfirmTitle')}
        message={t('bots.downAllConfirmBody')}
        confirmLabel={t('bots.downAll')}
      />
      <ConfirmDialog
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete) {
            onDelete?.(confirmDelete.name)
            setConfirmDelete(null)
          }
        }}
        title={t('bots.deleteConfirmTitle')}
        message={t('bots.deleteConfirmBody', { name: confirmDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
      />
      <Table
        storageKey="bots"
        columns={columns}
        data={bots}
        keyExtractor={b => b.name}
        emptyMessage={t('bots.noBots')}
        emptyAction={
          canAdd && onAdd ? (
            <Button onClick={onAdd}>
              <Icon name="plus" size={14} />
              {t('bots.add')}
            </Button>
          ) : undefined
        }
        onRowClick={onSelect}
        loading={loading}
        search={searchValue}
        bulkActions={bulkBotActions(onSendCommand, onDelete, t, setBulkConfirm)}
      />
      <ConfirmDialog
        isOpen={bulkConfirm?.action === 'delete'}
        onClose={() => setBulkConfirm(null)}
        onConfirm={() => {
          if (bulkConfirm && onDelete) {
            for (const b of bulkConfirm.targets) onDelete(b.name)
          }
          setBulkConfirm(null)
        }}
        title={t('bots.bulkDeleteConfirmTitle')}
        message={t('bots.bulkDeleteConfirmBody', {
          n: String(bulkConfirm?.targets.length ?? 0),
        })}
        confirmLabel={t('common.delete')}
      />
    </div>
  )
}

function bulkBotActions(
  send: ((cmd: string) => void) | undefined,
  del: ((name: string) => void) | undefined,
  t: (k: string, p?: Record<string, string>) => string,
  setBulkConfirm: (v: { action: 'delete'; targets: Bot[] } | null) => void,
): BulkAction<Bot>[] | undefined {
  if (!send && !del) return undefined
  const acts: BulkAction<Bot>[] = []
  if (send) {
    acts.push(
      {
        id: 'up',
        label: t('bots.up'),
        icon: 'play',
        appliesTo: b => !b.online,
        onClick: items => items.forEach(b => send(`up ${b.name}`)),
      },
      {
        id: 'down',
        label: t('bots.down'),
        icon: 'pause',
        appliesTo: b => b.online,
        onClick: items => items.forEach(b => send(`down ${b.name}`)),
      },
    )
  }
  if (del) {
    acts.push({
      id: 'delete',
      label: t('common.delete'),
      icon: 'trash',
      destructive: true,
      onClick: items => setBulkConfirm({ action: 'delete', targets: items }),
    })
  }
  return acts
}
