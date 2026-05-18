import { useTranslation } from '../../hooks/useTranslation'
import { useState } from 'react'
import { Table, Button, Badge, FlagBadge, StatusDot, Icon, FreshnessBadge, KebabMenu, KebabAction, ConfirmDialog, Column, BulkAction } from '../common'
import { User, Message, flagsToString } from '../../types'
import { UserMaskSearch } from './UserMaskSearch'

type UserListProps = {
  users: User[]
  onSelect: (user: User) => void
  onAdd?: () => void
  canAdd: boolean
  loading?: boolean
  searchValue?: string
  /** Live partyline message stream — needed for .match output capture. */
  messages?: Message[]
  onCommandSilent?: (cmd: string, pattern: RegExp, durationMs?: number) => void
  /** Optional handler to jump to a user by name (clicking a .match result). */
  onSelectHandle?: (handle: string) => void
  fetchedAt?: number | null
  onRefresh?: () => void
  onDelete?: (name: string) => void
}

export function UserList({
  users,
  onSelect,
  onAdd,
  canAdd,
  loading,
  searchValue,
  messages,
  onCommandSilent,
  onSelectHandle,
  fetchedAt,
  onRefresh,
  onDelete,
}: UserListProps) {
  const { t } = useTranslation()
  const [confirmDelete, setConfirmDelete] = useState<User | null>(null)
  const [bulkDeleteTargets, setBulkDeleteTargets] = useState<User[] | null>(null)
  const filtered = users.filter(u => !u.isBot)

  const bulkActions: BulkAction<User>[] | undefined = onDelete
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

  const columns: Column<User>[] = [
    {
      key: 'name',
      header: t('users.name'),
      sortable: true,
      minWidth: '140px',
      render: (u: User) => (
        <span className="mono text-ink-1" style={{ fontWeight: 500 }}>
          {u.name}
        </span>
      ),
    },
    {
      key: 'flags',
      header: 'Global',
      width: '120px',
      render: (u: User) => <FlagBadge flags={u.flags} condensed />,
      sortable: true,
      searchAccessor: (u: User) => flagsToString(u.flags),
    },
    {
      key: 'channelFlags',
      header: t('users.channels'),
      minWidth: '220px',
      accessor: (u: User) => u.channelFlags?.length ?? 0,
      render: (u: User) => {
        if (!u.channelFlags || u.channelFlags.length === 0) {
          return <span className="flag-empty">—</span>
        }
        return (
          <div className="channel-flags">
            {u.channelFlags.map(cf => (
              <span key={cf.channel} className="channel-flag">
                <span className="cf-chan">{cf.channel}</span>
                <FlagBadge flags={cf.flags} condensed />
              </span>
            ))}
          </div>
        )
      },
      searchAccessor: (u: User) =>
        (u.channelFlags || []).map(cf => `${cf.channel} ${flagsToString(cf.flags)}`).join(' '),
    },
    {
      key: 'isBot',
      header: 'Type',
      width: '80px',
      render: (u: User) => (
        <Badge variant={u.isBot ? 'warning' : 'default'}>
          {u.isBot ? 'Bot' : 'User'}
        </Badge>
      ),
      sortable: true,
      searchAccessor: (u: User) => u.isBot ? 'bot' : 'user',
    },
    {
      key: 'online',
      header: t('common.status'),
      width: '110px',
      render: (u: User) => (
        <StatusDot
          state={u.online ? 'online' : 'offline'}
          label={u.online ? t('users.online') : t('users.offline')}
        />
      ),
      sortable: true,
      searchAccessor: (u: User) => u.online ? 'online' : 'offline',
    },
    {
      key: 'hostsCount',
      header: t('users.hosts'),
      sortable: true,
      width: '80px',
      className: 'mono',
    },
  ]

  if (onDelete) {
    columns.push({
      key: '_actions',
      header: '',
      width: '46px',
      render: (u: User) => {
        const acts: KebabAction[] = [
          {
            id: 'delete',
            label: t('common.delete'),
            icon: 'trash',
            destructive: true,
            onClick: () => setConfirmDelete(u),
          },
        ]
        return <KebabMenu actions={acts} ariaLabel={`Actions for ${u.name}`} />
      },
    })
  }

  return (
    <div className="view-container">
      <div className="view-header">
        <div>
          <h2>{t('users.title')}</h2>
          <span className="view-subtitle">
            {filtered.length} total
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
              {t('users.add')}
            </Button>
          )}
        </div>
      </div>
      {messages && onCommandSilent && onSelectHandle && (
        <UserMaskSearch
          messages={messages}
          onCommandSilent={onCommandSilent}
          onSelectHandle={onSelectHandle}
        />
      )}
      <Table
        storageKey="users"
        columns={columns}
        data={filtered}
        keyExtractor={u => u.name}
        emptyMessage={t('users.noUsers')}
        emptyAction={
          canAdd && onAdd ? (
            <Button onClick={onAdd}>
              <Icon name="plus" size={14} />
              {t('users.add')}
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
        title={t('users.deleteConfirmTitle')}
        message={t('users.deleteConfirmBody', { name: confirmDelete?.name ?? '' })}
        confirmLabel={t('common.delete')}
      />
      <ConfirmDialog
        isOpen={bulkDeleteTargets !== null}
        onClose={() => setBulkDeleteTargets(null)}
        onConfirm={() => {
          if (bulkDeleteTargets && onDelete) {
            for (const u of bulkDeleteTargets) onDelete(u.name)
          }
          setBulkDeleteTargets(null)
        }}
        title={t('users.bulkDeleteConfirmTitle')}
        message={t('users.bulkDeleteConfirmBody', {
          n: String(bulkDeleteTargets?.length ?? 0),
        })}
        confirmLabel={t('common.delete')}
      />
    </div>
  )
}
