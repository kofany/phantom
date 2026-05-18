import { useState, ReactNode } from 'react'
import { useTranslation } from '../../hooks/useTranslation'
import { Button, Tabs, Table, Badge, FlagBadge, StatusDot, Icon, ConfirmDialog, PinButton, Modal, Breadcrumbs, KebabMenu, KebabAction, Column } from '../common'
import { ChannelDetail as ChannelDetailType, ChannelUser, ProtlistEntry, Bot, Message, formatTimestamp, formatExpires, flagsToString } from '../../types'
import { MassKickModal } from '../modals'
import { ObjectHistory } from '../audit'
import { IrcPresenceTab } from './IrcPresenceTab'
import { logSessionChange } from '../../sessionChanges'

type ChannelOp = 'mjoin' | 'mpart' | 'mcycle'
type PerBotOp = 'rjoin' | 'rpart' | 'rcycle'

type ChannelDetailProps = {
  channel: ChannelDetailType
  bots?: Bot[]                         // for per-bot rjoin/rpart/rcycle
  onBack: () => void
  onAddBan?: () => void
  onAddStick?: () => void
  onAddExempt?: () => void
  onAddInvite?: () => void
  onAddReop?: () => void
  onSetChanset?: (variable: string, value: string) => void
  onDelProtlist?: (listType: string, mask: string) => void
  onChannelOp?: (op: ChannelOp) => void
  onPerBotOp?: (op: PerBotOp, botName: string) => void
  onMassKick?: (tier: 'o' | 'n' | 'a', lock: boolean) => void
  /** Generic command pipe — used by the per-member kebab to issue
   *  `bc <bot> raw MODE/KICK ...`. When undefined, member kebab is hidden. */
  onSendCommand?: (cmd: string) => void
  /** Silent command pipe + live partyline stream — required for the
   *  IRC presence tab to issue `bc <bot> cwho` and parse the reply. */
  onCommandSilent?: (cmd: string, pattern: RegExp, durationMs?: number) => void
  messages?: Message[]
  /** Jump to UserDetail by handle (kebab "Open user"). */
  onOpenUser?: (handle: string) => void
  canEdit: boolean
}

export function ChannelDetail({
  channel,
  bots = [],
  onBack,
  onAddBan,
  onAddStick,
  onAddExempt,
  onAddInvite,
  onAddReop,
  onSetChanset,
  onDelProtlist,
  onChannelOp,
  onPerBotOp,
  onMassKick,
  onSendCommand,
  onCommandSilent,
  messages,
  onOpenUser,
  canEdit,
}: ChannelDetailProps) {
  const [confirmOp, setConfirmOp] = useState<ChannelOp | null>(null)
  const [editingVar, setEditingVar] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<{ listType: string; mask: string } | null>(null)
  const [showPerBot, setShowPerBot] = useState(false)
  const [showMassKick, setShowMassKick] = useState(false)
  // Per-member kick prompt — modal asks for an optional reason then issues
  // `.bc <bot> raw KICK <chan> <name> :<reason>` via onSendCommand.
  const [kickTarget, setKickTarget] = useState<ChannelUser | null>(null)
  const [kickReason, setKickReason] = useState('')
  const { t } = useTranslation()

  // Pick an online bot to act through — `.bc <bot> raw ...`. Strategy:
  //   1. Prefer a bot whose handle appears in `channel.users` AND is online —
  //      that's a bot we know is on this channel, so MODE/KICK will land.
  //   2. Fall back to any online bot (might not be on the channel; raw cmd
  //      then silently no-ops on IRC, mini-console will be empty — caller's
  //      job to verify).
  const memberNames = new Set(channel.users.map(u => u.name))
  const actingBot =
    bots.find(b => b.online && memberNames.has(b.name))?.name ??
    bots.find(b => b.online)?.name ??
    null

  const applyChanset = (name: string, value: string) => {
    if (!onSetChanset) return
    const prev = channel.chset.find(cs => cs.name === name)?.value ?? ''
    onSetChanset(name, value)
    logSessionChange('channel-setting', channel.name, name, prev, value)
  }

  const sendOp = (mode: '+o' | '-o' | '+v' | '-v', name: string) => {
    if (!onSendCommand || !actingBot) return
    onSendCommand(`bc ${actingBot} raw MODE ${channel.name} ${mode} ${name}`)
  }

  const submitKick = () => {
    if (kickTarget && onSendCommand && actingBot) {
      const reason = kickReason.trim() || t('channelMember.kickDefaultReason')
      onSendCommand(
        `bc ${actingBot} raw KICK ${channel.name} ${kickTarget.name} :${reason}`,
      )
    }
    setKickTarget(null)
  }

  const userColumns: Column<ChannelUser>[] = [
    {
      key: 'name',
      header: t('users.name'),
      sortable: true,
      render: (u: ChannelUser) => (
        <span className="mono" style={{ color: 'var(--ink-1)', fontWeight: 500 }}>
          {u.name}
        </span>
      ),
    },
    {
      key: 'flags',
      header: t('users.flags'),
      render: (u: ChannelUser) => <FlagBadge flags={u.flags} condensed />,
      searchAccessor: (u: ChannelUser) => flagsToString(u.flags),
    },
    {
      key: 'globalFlags',
      header: 'Global',
      render: (u: ChannelUser) => <FlagBadge flags={u.globalFlags} condensed />,
      searchAccessor: (u: ChannelUser) => flagsToString(u.globalFlags),
    },
    {
      key: 'online',
      header: t('common.status'),
      render: (u: ChannelUser) => (
        <StatusDot
          state={u.online ? 'online' : 'offline'}
          label={u.online ? t('users.online') : t('users.offline')}
        />
      ),
      sortable: true,
      searchAccessor: (u: ChannelUser) => u.online ? 'online' : 'offline',
    },
  ]

  if (onOpenUser || (canEdit && onSendCommand)) {
    userColumns.push({
      key: '_actions',
      header: '',
      width: '46px',
      render: (u: ChannelUser) => {
        const noBot = !actingBot
        const reason = noBot ? t('channelMember.noOnlineBot') : undefined
        const acts: KebabAction[] = []
        if (onOpenUser) {
          acts.push({
            id: 'open',
            label: t('channelMember.openUser'),
            icon: 'arrow-left',
            onClick: () => onOpenUser(u.name),
          })
        }
        if (canEdit && onSendCommand) {
          acts.push(
            {
              id: 'op',
              label: t('channelMember.op'),
              icon: 'shield',
              disabled: noBot,
              disabledReason: reason,
              onClick: () => sendOp('+o', u.name),
            },
            {
              id: 'deop',
              label: t('channelMember.deop'),
              icon: 'unlock',
              disabled: noBot,
              disabledReason: reason,
              onClick: () => sendOp('-o', u.name),
            },
            {
              id: 'voice',
              label: t('channelMember.voice'),
              icon: 'send',
              disabled: noBot,
              disabledReason: reason,
              onClick: () => sendOp('+v', u.name),
            },
            {
              id: 'devoice',
              label: t('channelMember.devoice'),
              icon: 'pause',
              disabled: noBot,
              disabledReason: reason,
              onClick: () => sendOp('-v', u.name),
            },
            {
              id: 'kick',
              label: t('channelMember.kick'),
              icon: 'zap',
              destructive: true,
              disabled: noBot,
              disabledReason: reason,
              onClick: () => {
                setKickReason('')
                setKickTarget(u)
              },
            },
          )
        }
        return <KebabMenu actions={acts} ariaLabel={`Actions for ${u.name}`} />
      },
    })
  }

  const makeProtlistColumns = (listType: string) => {
    const cols: { key: string; header: string; render?: (e: ProtlistEntry) => ReactNode; sortable?: boolean }[] = [
      { key: 'mask', header: t('protlist.mask'), sortable: true },
      { key: 'reason', header: t('protlist.reason') },
      { key: 'by', header: t('protlist.by') },
      {
        key: 'when',
        header: t('protlist.when'),
        render: (e: ProtlistEntry) => formatTimestamp(e.when),
      },
      {
        key: 'expires',
        header: t('protlist.expires'),
        render: (e: ProtlistEntry) => formatExpires(e.expires),
      },
    ]
    if (canEdit && onDelProtlist) {
      cols.push({
        key: 'actions',
        header: '',
        render: (e: ProtlistEntry) => (
          <Button
            size="sm"
            variant="danger"
            onClick={(ev: React.MouseEvent) => {
              ev.stopPropagation()
              setConfirmDelete({ listType, mask: e.mask })
            }}
            aria-label="Delete"
          >
            <Icon name="trash" size={13} />
          </Button>
        ),
      })
    }
    return cols
  }

  const tabs = [
    {
      id: 'users',
      label: t('channels.users'),
      count: channel.users.length,
      content: (
        <Table
          columns={userColumns}
          data={channel.users}
          keyExtractor={u => u.name}
          emptyMessage={t('users.noUsers')}
        />
      ),
    },
    ...(messages && onCommandSilent ? [{
      id: 'irc-presence',
      label: t('ircPresence.tabLabel'),
      content: (
        <IrcPresenceTab
          channel={channel.name}
          bots={bots}
          messages={messages}
          onCommandSilent={onCommandSilent}
          onSendCommand={onSendCommand}
          canEdit={canEdit}
        />
      ),
    }] : []),
    {
      id: 'bans',
      label: t('channels.bans'),
      count: channel.bans.length,
      action: canEdit && onAddBan ? <Button size="sm" onClick={onAddBan}>+</Button> : undefined,
      content: (
        <Table
          columns={makeProtlistColumns('ban')}
          data={channel.bans}
          keyExtractor={e => e.mask}
          emptyMessage={t('protlist.noEntries')}
        />
      ),
    },
    {
      id: 'sticks',
      label: t('channels.sticks'),
      count: channel.sticks.length,
      action: canEdit && onAddStick ? <Button size="sm" onClick={onAddStick}>+</Button> : undefined,
      content: (
        <Table
          columns={makeProtlistColumns('stick')}
          data={channel.sticks}
          keyExtractor={e => e.mask}
          emptyMessage={t('protlist.noEntries')}
        />
      ),
    },
    {
      id: 'exempts',
      label: t('channels.exempts'),
      count: channel.exempts.length,
      action: canEdit && onAddExempt ? <Button size="sm" onClick={onAddExempt}>+</Button> : undefined,
      content: (
        <Table
          columns={makeProtlistColumns('exempt')}
          data={channel.exempts}
          keyExtractor={e => e.mask}
          emptyMessage={t('protlist.noEntries')}
        />
      ),
    },
    {
      id: 'invites',
      label: t('channels.invites'),
      count: channel.invites.length,
      action: canEdit && onAddInvite ? <Button size="sm" onClick={onAddInvite}>+</Button> : undefined,
      content: (
        <Table
          columns={makeProtlistColumns('invite')}
          data={channel.invites}
          keyExtractor={e => e.mask}
          emptyMessage={t('protlist.noEntries')}
        />
      ),
    },
    {
      id: 'reops',
      label: t('channels.reops'),
      count: channel.reops.length,
      action: canEdit && onAddReop ? <Button size="sm" onClick={onAddReop}>+</Button> : undefined,
      content: (
        <Table
          columns={makeProtlistColumns('reop')}
          data={channel.reops}
          keyExtractor={e => e.mask}
          emptyMessage={t('protlist.noEntries')}
        />
      ),
    },
    {
      id: 'settings',
      label: t('channels.settings'),
      content: (
        <div className="chset-list">
          {channel.chset.map(cs => {
            const isBoolean = cs.value === 'ON' || cs.value === 'OFF'
            return (
              <div key={cs.name} className="chset-item">
                <span className="chset-name">{cs.name}</span>
                {isBoolean ? (
                  <label className="switch">
                    <input
                      type="checkbox"
                      checked={cs.value === 'ON'}
                      disabled={!canEdit || !onSetChanset}
                      onChange={e => applyChanset(cs.name, e.target.checked ? 'ON' : 'OFF')}
                    />
                    <span className="slider"></span>
                  </label>
                ) : editingVar === cs.name ? (
                  <div className="chset-edit">
                    <input
                      type="text"
                      className="chset-input"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          applyChanset(cs.name, editValue)
                          setEditingVar(null)
                        } else if (e.key === 'Escape') {
                          setEditingVar(null)
                        }
                      }}
                    />
                    <Button size="sm" onClick={() => {
                      applyChanset(cs.name, editValue)
                      setEditingVar(null)
                    }}>✓</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingVar(null)}>✕</Button>
                  </div>
                ) : (
                  <>
                    <span className="chset-value">{cs.value}</span>
                    {canEdit && onSetChanset && (
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditingVar(cs.name)
                        setEditValue(cs.value)
                      }}>✎</Button>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      ),
    },
    {
      id: 'history',
      label: t('objectHistory.title'),
      content: <ObjectHistory target={channel.name} limit={50} />,
    },
  ]

  // Check if op-lockdown is active
  const opLockdownEntry = channel.chset.find(cs => cs.name === 'op-lockdown')
  const isLockdownActive = opLockdownEntry?.value === 'ON'

  return (
    <div className="view-container">
      <Breadcrumbs
        items={[
          { label: t('nav.channels'), onClick: onBack },
          { label: channel.name, mono: true },
        ]}
        trailing={
          <>
            <PinButton kind="channel" name={channel.name} compact />
            {isLockdownActive && (
              <div className="lockdown-warning">
                <Badge variant="danger">{t('channels.opLockdownActive')}</Badge>
                {canEdit && onSetChanset && (
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onSetChanset('op-lockdown', 'OFF')}
                  >
                    {t('channels.disableOpLockdown')}
                  </Button>
                )}
              </div>
            )}
          </>
        }
      />
      {canEdit && onChannelOp && (
        <div className="channel-ops">
          <Button size="sm" variant="ghost" onClick={() => onChannelOp('mjoin')} title={t('channels.opMjoinDesc')}>
            <Icon name="plus" size={13} /> {t('channels.opMjoin')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmOp('mcycle')} title={t('channels.opMcycleDesc')}>
            <Icon name="activity" size={13} /> {t('channels.opMcycle')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmOp('mpart')} title={t('channels.opMpartDesc')}>
            <Icon name="x" size={13} /> {t('channels.opMpart')}
          </Button>
          {onPerBotOp && bots.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setShowPerBot(true)} title={t('channels.opPerBotDesc')}>
              <Icon name="bot" size={13} /> {t('channels.opPerBot')}
            </Button>
          )}
          {onMassKick && (
            <Button size="sm" variant="danger" onClick={() => setShowMassKick(true)} title={t('massKick.btnDesc')}>
              <Icon name="alert-triangle" size={13} /> {t('massKick.btn')}
            </Button>
          )}
        </div>
      )}
      <Tabs tabs={tabs} defaultTab="users" />

      <ConfirmDialog
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (confirmDelete && onDelProtlist) {
            onDelProtlist(confirmDelete.listType, confirmDelete.mask)
          }
        }}
        message={t('confirm.deleteProtlist').replace('{mask}', confirmDelete?.mask || '')}
      />

      <ConfirmDialog
        isOpen={!!confirmOp}
        onClose={() => setConfirmOp(null)}
        onConfirm={() => {
          if (confirmOp && onChannelOp) onChannelOp(confirmOp)
        }}
        title={confirmOp === 'mcycle' ? t('channels.confirmMcycleTitle') : t('channels.confirmMpartTitle')}
        message={
          confirmOp === 'mcycle'
            ? t('channels.confirmMcycle').replace('{chan}', channel.name)
            : t('channels.confirmMpart').replace('{chan}', channel.name)
        }
        confirmLabel={confirmOp === 'mcycle' ? t('channels.opMcycle') : t('channels.opMpart')}
      />

      {/* Per-bot operations modal — rjoin/rpart/rcycle for a specific bot */}
      <Modal
        isOpen={showPerBot}
        onClose={() => setShowPerBot(false)}
        title={t('channels.perBotTitle').replace('{chan}', channel.name)}
      >
        <p className="config-desc" style={{ marginBottom: '0.85rem' }}>
          {t('channels.perBotDesc')}
        </p>
        <div className="perbot-list">
          {bots.length === 0 ? (
            <div className="no-data">{t('bots.noBots')}</div>
          ) : (
            bots
              .slice()
              .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
              .map(b => (
                <div key={b.name} className={`perbot-row ${b.online ? 'online' : 'offline'}`}>
                  <span className={`perbot-dot ${b.online ? 'online' : 'offline'}`} />
                  <span className="perbot-name mono">{b.name}</span>
                  {b.nick && b.nick !== b.name && (
                    <span className="perbot-nick mono">{b.nick}</span>
                  )}
                  <div className="perbot-actions">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!b.online}
                      onClick={() => onPerBotOp?.('rjoin', b.name)}
                      title={t('channels.opRjoinDesc')}
                    >
                      <Icon name="plus" size={11} /> {t('channels.opRjoin')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!b.online}
                      onClick={() => onPerBotOp?.('rcycle', b.name)}
                      title={t('channels.opRcycleDesc')}
                    >
                      <Icon name="activity" size={11} /> {t('channels.opRcycle')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!b.online}
                      onClick={() => onPerBotOp?.('rpart', b.name)}
                      title={t('channels.opRpartDesc')}
                    >
                      <Icon name="x" size={11} /> {t('channels.opRpart')}
                    </Button>
                  </div>
                </div>
              ))
          )}
        </div>
      </Modal>

      {onMassKick && (
        <MassKickModal
          isOpen={showMassKick}
          onClose={() => setShowMassKick(false)}
          channel={channel.name}
          onMassKick={onMassKick}
        />
      )}

      <Modal
        isOpen={kickTarget !== null}
        onClose={() => setKickTarget(null)}
        title={t('channelMember.kickTitle')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setKickTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={submitKick}>
              <Icon name="zap" size={13} />
              {t('channelMember.kick')}
            </Button>
          </>
        }
      >
        {kickTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <p className="confirm-message">
              {t('channelMember.kickPrompt', {
                name: kickTarget.name,
                channel: channel.name,
              })}
            </p>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
                fontSize: '0.78rem',
                color: 'var(--ink-3)',
              }}
            >
              {t('channelMember.kickReasonLabel')}
              <input
                type="text"
                value={kickReason}
                onChange={e => setKickReason(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submitKick()
                  }
                }}
                placeholder={t('channelMember.kickReasonPlaceholder')}
                autoFocus
                style={{
                  padding: '0.5rem 0.65rem',
                  background: 'var(--bg-1)',
                  border: '1px solid var(--line-2)',
                  borderRadius: 6,
                  color: 'var(--ink-1)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.85rem',
                }}
              />
            </label>
          </div>
        )}
      </Modal>
    </div>
  )
}
