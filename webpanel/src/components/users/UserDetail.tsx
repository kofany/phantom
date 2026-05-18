import { useState } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, Tabs, Badge, FlagBadge, StatusDot, Icon, ConfirmDialog, PinButton, CopyableMono, Breadcrumbs } from '../common'
import { isValidAddr } from '../../utils/validation'
import { UserDetail as UserDetailType, ChannelFlag, Message, flagsToString, formatTimestamp } from '../../types'
import { UserOffencesTab } from './UserOffencesTab'
import { UserNotesTab } from './UserNotesTab'
import { RenameUserModal } from '../modals'
import { ObjectHistory } from '../audit'
import { logSessionChange } from '../../sessionChanges'

type UserDetailProps = {
  user: UserDetailType
  channels: string[]
  messages: Message[]
  onBack: () => void
  onSetFlags?: (flags: string, channel?: string) => void
  onSetPassword?: (password: string) => void
  onAddHost?: (host: string) => void
  onDelHost?: (host: string) => void
  /** `+addr <handle> <ip>` — add a literal IP / IP-class to userlist.
   *  Distinct from hosts: hosts are IRC masks (`*!user@dom`),
   *  addresses are network-level (`92.206.50.*`). Both are checked
   *  independently at auth time per psotnic source. */
  onAddAddr?: (ip: string) => void
  onDelAddr?: (ip: string) => void
  onAddInfo?: (key: string, value: string) => void
  onDelInfo?: (key: string) => void
  onCommandSilent: (cmd: string, pattern: RegExp, durationMs?: number) => void
  /** Rename handle via .chhandle. Hub-side replicates to all bots. */
  onRename?: (newHandle: string) => void
  /** Reset channel flags to offence-history defaults via .rflags. */
  onResetChanFlags?: (channel: string) => void
  onDelete?: () => void
  canEdit: boolean
}

export function UserDetail({
  user,
  channels,
  messages,
  onBack,
  onSetFlags,
  onSetPassword,
  onAddHost,
  onDelHost,
  onAddAddr,
  onDelAddr,
  onAddInfo,
  onDelInfo,
  onCommandSilent,
  onRename,
  onResetChanFlags,
  onDelete,
  canEdit,
}: UserDetailProps) {
  const { t } = useTranslation()
  const [editingGlobalFlags, setEditingGlobalFlags] = useState(false)
  const [editingChannelFlags, setEditingChannelFlags] = useState<string | null>(null)
  const [newFlagString, setNewFlagString] = useState('')
  const [newHost, setNewHost] = useState('')
  const [newAddr, setNewAddr] = useState('')
  const [confirmDeleteAddr, setConfirmDeleteAddr] = useState<string | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [confirmDeleteHost, setConfirmDeleteHost] = useState<string | null>(null)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [showRename, setShowRename] = useState(false)
  const [confirmResetChan, setConfirmResetChan] = useState<string | null>(null)

  const handleSaveGlobalFlags = () => {
    if (onSetFlags) {
      onSetFlags(newFlagString)
      logSessionChange('user-flags', `user:${user.name}`, 'global', flagsToString(user.flags), newFlagString)
    }
    setEditingGlobalFlags(false)
    setNewFlagString('')
  }

  const handleSaveChannelFlags = (channel: string) => {
    if (onSetFlags) {
      const prev = user.channelFlags.find(cf => cf.channel === channel)?.flags
      onSetFlags(newFlagString, channel)
      logSessionChange(
        'user-flags',
        `user:${user.name}`,
        channel,
        prev ? flagsToString(prev) : '',
        newFlagString,
      )
    }
    setEditingChannelFlags(null)
    setNewFlagString('')
  }

  const handleAddHost = () => {
    if (onAddHost && newHost.trim()) {
      onAddHost(newHost.trim())
      setNewHost('')
    }
  }

  const handleAddAddr = () => {
    const v = newAddr.trim()
    if (onAddAddr && v && isValidAddr(v)) {
      onAddAddr(v)
      setNewAddr('')
    }
  }

  const handleSetPassword = () => {
    if (onSetPassword && newPassword) {
      onSetPassword(newPassword)
      setNewPassword('')
      setShowPasswordForm(false)
    }
  }

  const tabs = [
    {
      id: 'overview',
      label: t('users.overview'),
      content: (
        <div className="user-overview">
          <div className="user-info-grid">
            <div className="info-item">
              <span className="info-label">{t('users.name')}</span>
              <span className="info-value">{user.name}</span>
            </div>
            <div className="info-item">
              <span className="info-label">{t('common.status')}</span>
              <div className="info-value">
                <StatusDot
                  state={user.online ? 'online' : 'offline'}
                  label={user.online ? t('users.online') : t('users.offline')}
                />
              </div>
            </div>
            <div className="info-item">
              <span className="info-label">Typ</span>
              <Badge variant={user.isBot ? 'warning' : 'default'}>
                {user.isBot ? 'Bot' : 'User'}
              </Badge>
            </div>
            <div className="info-item">
              <span className="info-label">{t('users.password')}</span>
              <span className="info-value">
                {user.hasPassword ? t('common.yes') : t('common.no')}
                {canEdit && onSetPassword && (
                  <Button size="sm" variant="ghost" onClick={() => setShowPasswordForm(!showPasswordForm)}>
                    {showPasswordForm ? t('common.cancel') : t('users.setPassword')}
                  </Button>
                )}
              </span>
            </div>
            {showPasswordForm && (
              <div className="info-item password-form">
                <input
                  type="password"
                  placeholder={t('users.newPassword')}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
                <Button size="sm" onClick={handleSetPassword}>{t('common.save')}</Button>
              </div>
            )}
            {user.createdBy && (
              <div className="info-item">
                <span className="info-label">{t('users.createdBy')}</span>
                <span className="info-value">{user.createdBy}</span>
              </div>
            )}
            {user.createdAt && (
              <div className="info-item">
                <span className="info-label">{t('users.createdAt')}</span>
                <span className="info-value">{formatTimestamp(user.createdAt)}</span>
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'flags',
      label: t('users.flags'),
      content: (
        <div className="user-flags">
          <div className="flags-section">
            <div className="flags-header">
              <h4>Global Flags</h4>
              {canEdit && onSetFlags && !editingGlobalFlags && (
                <Button size="sm" variant="ghost" onClick={() => {
                  setEditingGlobalFlags(true)
                  setNewFlagString(flagsToString(user.flags))
                }}>
                  {t('common.edit')}
                </Button>
              )}
            </div>
            {editingGlobalFlags ? (
              <div className="flags-edit">
                <input
                  type="text"
                  value={newFlagString}
                  onChange={e => setNewFlagString(e.target.value)}
                  placeholder="+sn lub nmfop"
                />
                <Button size="sm" onClick={handleSaveGlobalFlags}>{t('common.save')}</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingGlobalFlags(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            ) : (
              <div className="flags-display">
                <FlagBadge flags={user.flags} />
              </div>
            )}
          </div>

          <div className="flags-section">
            <h4>{t('users.channelFlags')}</h4>
            {user.channelFlags.length > 0 ? (
              <div className="channel-flags-list">
                {user.channelFlags.map((cf: ChannelFlag) => (
                  <div key={cf.channel} className="channel-flag-item">
                    <span className="cf-channel">{cf.channel}</span>
                    {editingChannelFlags === cf.channel ? (
                      <div className="flags-edit">
                        <input
                          type="text"
                          value={newFlagString}
                          onChange={e => setNewFlagString(e.target.value)}
                          placeholder="+o lub nmo"
                        />
                        <Button size="sm" onClick={() => handleSaveChannelFlags(cf.channel)}>
                          {t('common.save')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingChannelFlags(null)}>
                          {t('common.cancel')}
                        </Button>
                      </div>
                    ) : (
                      <>
                        <FlagBadge flags={cf.flags} />
                        {canEdit && onSetFlags && (
                          <Button size="sm" variant="ghost" onClick={() => {
                            setEditingChannelFlags(cf.channel)
                            setNewFlagString(flagsToString(cf.flags))
                          }}>
                            {t('common.edit')}
                          </Button>
                        )}
                        {canEdit && onResetChanFlags && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmResetChan(cf.channel)}
                            title={t('users.resetChanFlagsBody')
                              .replace('{handle}', user.name)
                              .replace('{chan}', cf.channel)}
                          >
                            <Icon name="eraser" size={12} />
                            {t('users.resetChanFlags')}
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="no-data">{t('users.noChannelFlags')}</p>
            )}

            {/* Form for adding flags to new channel */}
            {editingChannelFlags && !user.channelFlags.some(cf => cf.channel === editingChannelFlags) && (
              <div className="channel-flag-item new-channel-flags">
                <span className="cf-channel">{editingChannelFlags}</span>
                <div className="flags-edit">
                  <input
                    type="text"
                    value={newFlagString}
                    onChange={e => setNewFlagString(e.target.value)}
                    placeholder="+o lub nmo"
                    autoFocus
                  />
                  <Button size="sm" onClick={() => handleSaveChannelFlags(editingChannelFlags)}>
                    {t('common.save')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingChannelFlags(null)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            )}

            {canEdit && onSetFlags && channels.length > 0 && !editingChannelFlags && (
              <div className="add-channel-flags">
                <select onChange={e => {
                  if (e.target.value) {
                    setEditingChannelFlags(e.target.value)
                    setNewFlagString('')
                  }
                }} value="">
                  <option value="">{t('users.addChannelFlags')}</option>
                  {channels
                    .filter(ch => !user.channelFlags.some(cf => cf.channel === ch))
                    .map(ch => (
                      <option key={ch} value={ch}>{ch}</option>
                    ))
                  }
                </select>
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'hosts',
      label: t('users.hosts'),
      count: user.hosts.length,
      content: (
        <div className="user-hosts">
          {user.hosts.length > 0 ? (
            <ul className="hosts-list">
              {user.hosts.map((host, idx) => (
                <li key={idx} className="host-item">
                  <CopyableMono value={host} size="sm" />
                  {canEdit && onDelHost && (
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteHost(host)}>
                      {t('common.delete')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-data">{t('users.noHosts')}</p>
          )}

          {canEdit && onAddHost && (
            <div className="add-host-form">
              <input
                type="text"
                placeholder="*!*@example.com"
                value={newHost}
                onChange={e => setNewHost(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddHost()}
              />
              <Button size="sm" onClick={handleAddHost}>{t('users.addHost')}</Button>
            </div>
          )}
        </div>
      ),
    },
    {
      id: 'addresses',
      label: t('users.addresses'),
      count: user.addresses.length,
      content: (
        <div className="user-addresses">
          {user.addresses.length > 0 ? (
            <ul className="addresses-list">
              {user.addresses.map((addr, idx) => (
                <li key={idx} className="address-item">
                  <CopyableMono value={addr.ip} size="sm" />
                  <span className="addr-meta">
                    {t('common.by')} {addr.by} @ {formatTimestamp(addr.time)}
                  </span>
                  {canEdit && onDelAddr && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmDeleteAddr(addr.ip)}
                    >
                      {t('common.delete')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="no-data">{t('users.noAddresses')}</p>
          )}

          {canEdit && onAddAddr && (
            <div className="add-host-form">
              <input
                type="text"
                placeholder="92.206.50.* / 192.168.0.0"
                value={newAddr}
                onChange={e => setNewAddr(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddAddr()}
                pattern="[0-9*.]+"
                inputMode="numeric"
              />
              <Button
                size="sm"
                onClick={handleAddAddr}
                disabled={!newAddr.trim() || !isValidAddr(newAddr.trim())}
              >
                {t('users.addAddr')}
              </Button>
            </div>
          )}
          {canEdit && (
            <p className="form-hint">{t('users.addrHint')}</p>
          )}
        </div>
      ),
    },
    {
      id: 'notes',
      label: t('userNotes.title'),
      count: user.info.length || undefined,
      content: (
        <UserNotesTab
          userName={user.name}
          info={user.info}
          onAddInfo={onAddInfo}
          onDelInfo={onDelInfo}
          canEdit={canEdit}
        />
      ),
    },
    {
      id: 'offences',
      label: t('offences.title'),
      content: (
        <UserOffencesTab
          userName={user.name}
          messages={messages}
          onCommandSilent={onCommandSilent}
          canEdit={canEdit}
        />
      ),
    },
    {
      id: 'history',
      label: t('objectHistory.title'),
      content: <ObjectHistory target={user.name} limit={50} />,
    },
  ]

  return (
    <div className="view-container">
      <Breadcrumbs
        items={[
          { label: t('nav.users'), onClick: onBack },
          { label: user.name, mono: true },
        ]}
        trailing={
          <>
            <PinButton kind="user" name={user.name} compact />
            <StatusDot
              state={user.online ? 'online' : 'offline'}
              label={user.online ? t('users.online') : t('users.offline')}
            />
            {canEdit && onRename && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRename(true)}
                title={t('users.renameDesc')}
              >
                <Icon name="pencil" size={13} />
                {t('users.rename')}
              </Button>
            )}
            {canEdit && onDelete && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirmDeleteUser(true)}
              >
                <Icon name="trash" size={14} />
                {t('common.delete')}
              </Button>
            )}
          </>
        }
      />
      <Tabs tabs={tabs} defaultTab="overview" />

      <ConfirmDialog
        isOpen={!!confirmDeleteHost}
        onClose={() => setConfirmDeleteHost(null)}
        onConfirm={() => {
          if (confirmDeleteHost && onDelHost) {
            onDelHost(confirmDeleteHost)
          }
        }}
        message={t('confirm.deleteHost').replace('{host}', confirmDeleteHost || '')}
      />

      <ConfirmDialog
        isOpen={!!confirmDeleteAddr}
        onClose={() => setConfirmDeleteAddr(null)}
        onConfirm={() => {
          if (confirmDeleteAddr && onDelAddr) {
            onDelAddr(confirmDeleteAddr)
          }
        }}
        title={t('confirm.deleteAddrTitle')}
        message={t('confirm.deleteAddr').replace('{addr}', confirmDeleteAddr || '')}
      />

      <ConfirmDialog
        isOpen={confirmDeleteUser}
        onClose={() => setConfirmDeleteUser(false)}
        onConfirm={() => {
          if (onDelete) {
            onDelete()
          }
        }}
        message={t('users.confirmDelete').replace('{name}', user.name)}
      />

      {onRename && (
        <RenameUserModal
          isOpen={showRename}
          onClose={() => setShowRename(false)}
          oldHandle={user.name}
          onRename={newHandle => {
            onRename(newHandle)
            logSessionChange('user-flags', `user:${user.name}`, 'handle', user.name, newHandle)
          }}
        />
      )}

      <ConfirmDialog
        isOpen={!!confirmResetChan}
        onClose={() => setConfirmResetChan(null)}
        onConfirm={() => {
          if (confirmResetChan && onResetChanFlags) {
            const prev = user.channelFlags.find(cf => cf.channel === confirmResetChan)?.flags ?? 0
            onResetChanFlags(confirmResetChan)
            logSessionChange(
              'user-flags',
              `user:${user.name}`,
              `${confirmResetChan} (rflags)`,
              flagsToString(prev),
              '(reset)',
            )
          }
        }}
        title={t('users.resetChanFlagsTitle')}
        message={t('users.resetChanFlagsBody')
          .replace('{handle}', user.name)
          .replace('{chan}', confirmResetChan || '')}
        confirmLabel={t('users.resetChanFlags')}
        variant="primary"
      />
    </div>
  )
}
