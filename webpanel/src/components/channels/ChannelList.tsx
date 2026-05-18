import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Table, Button, FlagBadge, Icon, Badge, FreshnessBadge, KebabMenu, KebabAction, ConfirmDialog, Column, BulkAction } from '../common'
import { Channel, flagsToString } from '../../types'

type ChannelListProps = {
  channels: Channel[]
  onSelect: (channel: Channel) => void
  onAdd?: () => void
  canAdd: boolean
  loading?: boolean
  searchValue?: string
  fetchedAt?: number | null
  onRefresh?: () => void
  onDelete?: (channel: string) => void
}

export function ChannelList({
  channels,
  onSelect,
  onAdd,
  canAdd,
  loading,
  searchValue,
  fetchedAt,
  onRefresh,
  onDelete,
}: ChannelListProps) {
  const { t } = useTranslation()
  const [confirmDelete, setConfirmDelete] = useState<Channel | null>(null)
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<Channel[] | null>(null)

  const bulkActions: BulkAction<Channel>[] | undefined = onDelete
    ? [
        {
          id: 'delete',
          label: t('common.delete'),
          icon: 'trash',
          destructive: true,
          onClick: items => setBulkDeleteTargets(items),
        },
      ]
    : undefined

  const columns: Column<Channel>[] = [
    {
      key: 'name',
      header: t('channels.name'),
      sortable: true,
      minWidth: '180px',
      render: (ch: Channel) => (
        <span className="mono text-accent" style={{ fontWeight: 500 }}>
          {ch.name}
        </span>
      ),
    },
    {
      key: 'userFlags',
      header: t('users.flags'),
      width: '140px',
      render: (ch: Channel) => <FlagBadge flags={ch.userFlags} condensed />,
      searchAccessor: (ch: Channel) => flagsToString(ch.userFlags),
    },
    {
      key: 'usersCount',
      header: t('channels.users'),
      sortable: true,
      width: '80px',
      className: 'mono',
    },
    {
      key: 'bansCount',
      header: t('channels.bans'),
      sortable: true,
      width: '80px',
      className: 'mono',
    },
    {
      key: 'sticksCount',
      header: t('channels.sticks'),
      sortable: true,
      width: '80px',
      className: 'mono',
    },
    {
      key: 'exemptsCount',
      header: t('channels.exempts'),
      sortable: true,
      width: '90px',
      className: 'mono',
    },
    {
      key: 'invitesCount',
      header: t('channels.invites'),
      sortable: true,
      width: '90px',
      className: 'mono',
    },
    {
      key: 'reopsCount',
      header: t('channels.reops'),
      sortable: true,
      width: '80px',
      className: 'mono',
    },
    {
      key: 'opLockdown',
      header: t('channels.opLockdown'),
      width: '110px',
      render: (ch: Channel) =>
        ch.opLockdown ? (
          <Badge variant="danger">
            <Icon name="lock" size={10} /> LOCK
          </Badge>
        ) : (
          <span className="flag-empty">—</span>
        ),
      searchAccessor: (ch: Channel) => ch.opLockdown ? 'lock lockdown' : '',
    },
  ]

  if (onDelete) {
    columns.push({
      key: '_actions',
      header: '',
      width: '46px',
      render: (ch: Channel) => {
        const acts: KebabAction[] = [
          {
            id: 'delete',
            label: t('common.delete'),
            icon: 'trash',
            destructive: true,
            onClick: () => setConfirmDelete(ch),
          },
        ]
        return <KebabMenu actions={acts} ariaLabel={`Actions for ${ch.name}`} />
      },
    })
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>{t('channels.title')}</h2>
          <span className="view-subtitle">
            {t('chrome.subtitleMeta')}
            {fetchedAt !== undefined && (
              <>
                {' '}<FreshnessBadge fetchedAt={fetchedAt ?? null} onRefresh={onRefresh} />
              </>
            )}
          </span>
        </div>
        <div className="view-tools">
          {canAdd && onAdd && (
            <Button onClick={onAdd}>
              <Icon name="plus" size={14} />
              {t('channels.add')}
            </Button>
          )}
        </div>
      </div>
      <Table
        storageKey="channels"
        columns={columns}
        data={channels}
        keyExtractor={ch => ch.name}
        emptyMessage={t('channels.noChannels')}
        emptyAction={
          canAdd && onAdd ? (
            <Button onClick={onAdd}>
              <Icon name="plus" size={14} />
              {t('channels.add')}
            </Button>
          ) : undefined
        }
        onRowClick={onSelect}
        loading={loading}
        search={searchValue}
        bulkActions={bulkActions}
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
        title={t('channels.deleteConfirmTitle')}
        message={t('channels.deleteConfirmBody', { name: confirmDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
      />
      <ConfirmDialog
        isOpen={bulkDeleteTargets !== null}
        onClose={() => setBulkDeleteTargets(null)}
        onConfirm={() => {
          if (bulkDeleteTargets && onDelete) {
            for (const ch of bulkDeleteTargets) onDelete(ch.name)
          }
          setBulkDeleteTargets(null)
        }}
        title={t('channels.bulkDeleteConfirmTitle')}
        message={t('channels.bulkDeleteConfirmBody', {
          n: String(bulkDeleteTargets?.length ?? 0),
        })}
        confirmLabel={t('common.delete')}
      />
    </div>
  )
}
