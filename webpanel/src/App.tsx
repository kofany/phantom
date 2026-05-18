import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useHub } from './useHub'
import { I18nProvider } from './contexts/I18nContext'
import { useTranslation } from './hooks/useTranslation'
import { useRoute } from './hooks/useRoute'
import { markVisited, FavoriteKind } from './favorites'
import { MainLayout } from './components/layout'
import { ToastContainer, Logo, Icon, ErrorBoundary, SessionChanges, SkeletonPanel, toast } from './components/common'
import { ChannelList, ChannelDetail } from './components/channels'
import { UserList, UserDetail } from './components/users'
import { BotList, BotDetail, BotChannelMatrix } from './components/bots'
import { Overview } from './components/overview'
import { BansView } from './components/bans'
import { HealthDashboard } from './components/health'

// Code-split rarely-visited views. Each becomes its own chunk so the
// initial bundle only loads what the user lands on (Overview / lists /
// details). The Suspense boundary in Dashboard renders a SkeletonPanel
// while the chunk fetches.
//
// Why named exports need this dance: React.lazy expects { default }, so
// for our barrel-free named exports we re-shape the import.
const BotnetTopology = lazy(() =>
  import('./components/topology/BotnetTopology').then(m => ({ default: m.BotnetTopology })),
)
const AuditLog = lazy(() =>
  import('./components/audit/AuditLog').then(m => ({ default: m.AuditLog })),
)
const IrcServers = lazy(() =>
  import('./components/irc/IrcServers').then(m => ({ default: m.IrcServers })),
)
const IdiotsList = lazy(() =>
  import('./components/idiots/IdiotsList').then(m => ({ default: m.IdiotsList })),
)
const HubSettings = lazy(() =>
  import('./components/hub/HubSettings').then(m => ({ default: m.HubSettings })),
)
const TelegramSetup = lazy(() =>
  import('./components/telegram/TelegramSetup').then(m => ({ default: m.TelegramSetup })),
)
const Help = lazy(() =>
  import('./components/help/Help').then(m => ({ default: m.Help })),
)
import { CommandPalette, ShortcutsHelp, useKeyboardShortcuts } from './components/palette'
import {
  AddUserModal,
  AddBotModal,
  AddChannelModal,
  AddProtlistModal,
  QuickBanModal,
  MassBanModal,
  VerifyModal,
} from './components/modals'
import { View, Channel, User, Bot, FLAG_S, FLAG_X, FLAG_N } from './types'

const WS_URL = import.meta.env.PROD
  ? `wss://${window.location.host}/ws`
  : `ws://${window.location.hostname}:8080`

function LoginForm({
  onLogin,
  error,
  connecting,
}: {
  onLogin: (h: string, p: string) => void
  error: string | null
  connecting: boolean
}) {
  const { t } = useTranslation()
  const [handle, setHandle] = useState('')
  const [password, setPassword] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (handle && password) {
      onLogin(handle, password)
    }
  }

  const year = new Date().getFullYear()

  const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const endpoint = typeof window !== 'undefined' ? window.location.hostname : ''

  return (
    <div className="login-container">
      <div className="login-card">
        <span className="login-version" aria-label="version">{t('intro.version')}</span>

        <div className="brand-row">
          <Logo size="lg" />
          <div className="brand-text">
            <span className="eyebrow">Control Panel</span>
            <h1>Phantom</h1>
          </div>
        </div>

        <p className="login-tagline">{t('intro.tagline')}</p>

        <div className="login-divider" aria-hidden />

        {connecting ? (
          <div className="connecting-state" role="status" aria-live="polite">
            <span className="connecting-spinner" aria-hidden="true">
              <span /><span /><span />
            </span>
            <div className="connecting-copy">
              <strong>{t('auth.connecting')}</strong>
              <span className="connecting-target">{endpoint}</span>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} autoComplete="on">
            <div className="field">
              <label htmlFor="login-handle">{t('auth.handle')}</label>
              <input
                id="login-handle"
                type="text"
                value={handle}
                onChange={e => setHandle(e.target.value)}
                autoFocus
                autoComplete="username"
                spellCheck={false}
              />
            </div>
            <div className="field">
              <label htmlFor="login-password">{t('auth.password')}</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && (
              <div className="error" role="alert">
                <Icon name="alert-triangle" size={14} />
                {error}
              </div>
            )}
            <button type="submit">
              <span>{t('auth.login')}</span>
              <Icon name="chevron-right" size={16} />
            </button>
          </form>
        )}

        <div className="login-meta" role="contentinfo">
          <span className={`login-meta-item${isSecure ? ' is-secure' : ''}`}>
            <Icon name={isSecure ? 'lock' : 'unlock'} size={12} />
            <span>{t('intro.secure')}</span>
          </span>
          <span className="login-meta-sep" aria-hidden>·</span>
          <span className="login-meta-item login-meta-endpoint" title={t('intro.endpoint')}>
            <Icon name="globe" size={12} />
            <span>{endpoint}</span>
          </span>
        </div>
      </div>
      <div className="login-footer">
        <span>© {year} · Phantom</span>
      </div>
    </div>
  )
}

function Dashboard() {
  const hub = useHub(WS_URL)
  const { t } = useTranslation()
  const { route, navigate } = useRoute()
  const currentView = route.view
  const selectedChannel = route.selectedChannel
  const selectedUser = route.selectedUser
  // Bot selection stores the full Bot object locally (for transitions before
  // list arrives); route holds just the handle.
  const [selectedBotLocal, setSelectedBotLocal] = useState<Bot | null>(null)
  const selectedBot = useMemo<Bot | null>(() => {
    if (!route.selectedBot) return null
    // Prefer live data from hub.bots, fall back to cached local, else stub
    const live = hub.bots.find(b => b.name === route.selectedBot)
    return live ?? selectedBotLocal ?? {
      name: route.selectedBot, nick: '', server: '', online: false,
    }
  }, [route.selectedBot, hub.bots, selectedBotLocal])
  const [searchValue, setSearchValue] = useState('')

  // Modal state
  const [showAddUser, setShowAddUser] = useState(false)
  const [showAddBot, setShowAddBot] = useState(false)
  const [showAddChannel, setShowAddChannel] = useState(false)
  const [showAddProtlist, setShowAddProtlist] = useState(false)
  const [protlistType, setProtlistType] = useState<
    'ban' | 'stick' | 'exempt' | 'invite' | 'reop'
  >('ban')
  const [showQuickBan, setShowQuickBan] = useState(false)
  const [showMassBan, setShowMassBan] = useState(false)
  const [showPalette, setShowPalette] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showVerify, setShowVerify] = useState(false)

  const isSuper = (hub.globalFlags & (FLAG_S | FLAG_X)) !== 0
  const hasOwner = (hub.globalFlags & FLAG_N) !== 0
  const canManage = isSuper || hasOwner
  // `.bc <bot> *` (cfg/cfg-save/set/pset/status/modules/rehash/die/restart/jump)
  // every handler in botcmd.cpp checks HAS_X strictly, so +s alone is not enough.
  const canBotControl = (hub.globalFlags & FLAG_X) !== 0

  useEffect(() => {
    if (hub.authenticated) {
      hub.fetchChannels()
      hub.fetchUsers()
      hub.fetchBots()

      // First-login onboarding hint — only fires once per browser, points
      // the user at the shortcut help so they discover Cmd+K / "?".
      const ONBOARDED_KEY = 'phantom:onboarded:v1'
      try {
        if (!localStorage.getItem(ONBOARDED_KEY)) {
          window.setTimeout(() => {
            toast('info', t('onboarding.shortcutHint'), {
              duration: 9000,
              action: {
                label: t('onboarding.show'),
                onClick: () => setShowShortcuts(true),
              },
            })
            try { localStorage.setItem(ONBOARDED_KEY, '1') } catch { /* ignore quota */ }
          }, 800)
        }
      } catch { /* private mode etc. — never block boot */ }

      // Live refresh — every 15s, but only while the tab is visible. When
      // the tab goes to the background we stop polling and resume on focus
      // with an immediate fetch so the user never sees stale-by-default
      // data after switching back.
      const REFRESH_MS = 15000
      let interval: number | null = null

      const tick = () => {
        hub.fetchUsers(true)
        hub.fetchBots(true)
        hub.fetchChannels()
      }

      const start = () => {
        if (interval !== null) return
        interval = window.setInterval(tick, REFRESH_MS)
      }
      const stop = () => {
        if (interval === null) return
        window.clearInterval(interval)
        interval = null
      }

      const onVisibility = () => {
        if (document.visibilityState === 'visible') {
          tick()
          start()
        } else {
          stop()
        }
      }

      document.addEventListener('visibilitychange', onVisibility)
      if (document.visibilityState === 'visible') start()

      return () => {
        stop()
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
  }, [hub.authenticated])

  useEffect(() => {
    if (selectedChannel) {
      hub.fetchChannel(selectedChannel)
    }
  }, [selectedChannel])

  useEffect(() => {
    if (selectedUser) {
      hub.fetchUser(selectedUser)
    }
  }, [selectedUser])

  // Reset search when view changes
  useEffect(() => {
    setSearchValue('')
  }, [currentView])

  // Global keyboard shortcuts — palette, quick-ban, g-prefix nav, help
  useKeyboardShortcuts({
    enabled: hub.authenticated,
    onOpenPalette: () => setShowPalette(true),
    onShowHelp: () => setShowShortcuts(true),
    onQuickBan: canManage ? () => setShowQuickBan(true) : undefined,
    onFocusSearch: () => {
      const el = document.querySelector<HTMLInputElement>('.header .search-pill input')
      el?.focus()
    },
    onGoto: {
      h: () => handleViewChange('overview'),
      c: () => handleViewChange('channels'),
      u: () => handleViewChange('users'),
      b: () => handleViewChange('bots'),
      m: () => handleViewChange('matrix'),
      t: () => handleViewChange('topology'),
      a: () => handleViewChange('audit'),
      i: () => handleViewChange('irc'),
      k: () => handleViewChange('health'),
    },
  })

  // Tab title live indicator when WS is down
  useEffect(() => {
    const base = 'Phantom · Botnet Control'
    if (!hub.connected) {
      document.title = `• ${base}`
    } else if (!hub.authenticated) {
      document.title = `~ ${base}`
    } else {
      document.title = base
    }
  }, [hub.connected, hub.authenticated])

  const handleViewChange = (view: View) => {
    navigate({
      view,
      selectedChannel: null,
      selectedUser: null,
      selectedBot: null,
    })
    setSelectedBotLocal(null)
    hub.clearCurrentChannel()
    hub.clearCurrentUser()
  }

  const handleChannelSelect = (ch: Channel) => {
    markVisited('channel', ch.name)
    navigate({ view: 'channels', selectedChannel: ch.name })
  }
  const handleBackFromChannel = () => {
    navigate({ view: 'channels', selectedChannel: null })
    hub.clearCurrentChannel()
  }
  const handleUserSelect = (user: User) => {
    markVisited('user', user.name)
    navigate({ view: 'users', selectedUser: user.name })
  }
  const handleBackFromUser = () => {
    navigate({ view: 'users', selectedUser: null })
    hub.clearCurrentUser()
  }
  const handleBotSelect = (bot: Bot) => {
    markVisited('bot', bot.name)
    setSelectedBotLocal(bot)
    navigate({ view: 'bots', selectedBot: bot.name })
  }

  // Clicked a pinned/recent favorite in sidebar
  const handleSelectFavorite = (kind: FavoriteKind, name: string) => {
    if (kind === 'channel') {
      navigate({ view: 'channels', selectedChannel: name })
    } else if (kind === 'user') {
      navigate({ view: 'users', selectedUser: name })
    } else if (kind === 'bot') {
      navigate({ view: 'bots', selectedBot: name })
    }
  }
  const handleBackFromBot = () => {
    navigate({ view: 'bots', selectedBot: null })
    setSelectedBotLocal(null)
  }

  // Protlist add handlers
  const handleAddBan = () => { setProtlistType('ban');    setShowAddProtlist(true) }
  const handleAddStick = () => { setProtlistType('stick');  setShowAddProtlist(true) }
  const handleAddExempt = () => { setProtlistType('exempt'); setShowAddProtlist(true) }
  const handleAddInvite = () => { setProtlistType('invite'); setShowAddProtlist(true) }
  const handleAddReop = () => { setProtlistType('reop');   setShowAddProtlist(true) }

  const wsStatus: 'online' | 'connecting' | 'offline' = useMemo(() => {
    if (!hub.connected) return 'connecting'
    if (!hub.authenticated) return 'connecting'
    return 'online'
  }, [hub.connected, hub.authenticated])

  if (!hub.connected) {
    return <LoginForm onLogin={hub.login} error={null} connecting={true} />
  }

  if (!hub.authenticated) {
    return <LoginForm onLogin={hub.login} error={hub.error} connecting={false} />
  }

  const renderContent = () => {
    if (selectedChannel && hub.currentChannel) {
      return (
        <ChannelDetail
          channel={hub.currentChannel}
          onBack={handleBackFromChannel}
          onAddBan={handleAddBan}
          onAddStick={handleAddStick}
          onAddExempt={handleAddExempt}
          onAddInvite={handleAddInvite}
          onAddReop={handleAddReop}
          onSetChanset={(variable, value) =>
            hub.setChanset(selectedChannel, variable, value)
          }
          onDelProtlist={(listType, mask) =>
            hub.delProtlist(listType, mask, selectedChannel || undefined)
          }
          bots={hub.bots}
          onChannelOp={op => hub.sendCommand(`${op} ${selectedChannel}`)}
          onPerBotOp={(op, botName) => hub.sendCommand(`${op} ${botName} ${selectedChannel}`)}
          onMassKick={(tier, lock) =>
            hub.sendCommand(`mk ${tier} ${selectedChannel}${lock ? ' lock' : ''}`)
          }
          onSendCommand={canManage ? hub.sendCommand : undefined}
          onCommandSilent={hub.sendCommandSilent}
          messages={hub.messages}
          onOpenUser={(handle) => navigate({ view: 'users', selectedUser: handle })}
          canEdit={canManage}
        />
      )
    }

    if (selectedBot) {
      return (
        <BotDetail
          bot={selectedBot}
          messages={hub.messages}
          onCommandSilent={hub.sendCommandSilent}
          onSendCommand={canBotControl ? hub.sendCommand : undefined}
          onOpenChannel={(name) => navigate({ view: 'channels', selectedChannel: name })}
          onBack={handleBackFromBot}
          canEdit={canBotControl}
        />
      )
    }

    if (selectedUser && hub.currentUser) {
      return (
        <UserDetail
          user={hub.currentUser}
          channels={hub.channels.map(c => c.name)}
          messages={hub.messages}
          onCommandSilent={hub.sendCommandSilent}
          onBack={handleBackFromUser}
          onSetFlags={(flags, channel) =>
            hub.setUserFlags(selectedUser, flags, channel)
          }
          onSetPassword={password => hub.setUserPass(selectedUser, password)}
          onAddHost={host => hub.addHost(selectedUser, host)}
          onDelHost={host => hub.delHost(selectedUser, host)}
          onAddAddr={canManage ? ip => hub.addAddr(selectedUser, ip) : undefined}
          onDelAddr={canManage ? ip => hub.delAddr(selectedUser, ip) : undefined}
          onAddInfo={canManage ? (k, v) => hub.addUserInfo(selectedUser, k, v) : undefined}
          onDelInfo={canManage ? k => hub.delUserInfo(selectedUser, k) : undefined}
          onRename={canManage ? newHandle => {
            hub.sendCommand(`chhandle ${selectedUser} ${newHandle}`)
            // Wait for hub to broadcast the rename + replicate before we
            // re-fetch and follow the handle.
            window.setTimeout(() => {
              hub.fetchUsers(true)
              navigate({ view: 'users', selectedUser: newHandle })
            }, 600)
          } : undefined}
          onResetChanFlags={canManage ? channel => {
            hub.sendCommand(`rflags ${selectedUser} ${channel}`)
            window.setTimeout(() => hub.fetchUser(selectedUser), 600)
          } : undefined}
          onDelete={() => {
            hub.delUser(selectedUser)
            handleBackFromUser()
          }}
          canEdit={canManage}
        />
      )
    }

    switch (currentView) {
      case 'overview':
        return (
          <Overview
            channels={hub.channels}
            users={hub.users}
            bots={hub.bots}
            messages={hub.messages}
            onNavigate={v => handleViewChange(v)}
            onChannelSelect={handleChannelSelect}
            onAddChannel={isSuper ? () => setShowAddChannel(true) : undefined}
            onAddUser={canManage ? () => setShowAddUser(true) : undefined}
            onAddBot={isSuper ? () => setShowAddBot(true) : undefined}
            canManage={canManage}
            searchValue={searchValue}
          />
        )
      case 'channels':
        return (
          <ChannelList
            channels={hub.channels}
            onSelect={handleChannelSelect}
            onAdd={() => setShowAddChannel(true)}
            canAdd={isSuper}
            loading={hub.loading}
            searchValue={searchValue}
            fetchedAt={hub.channelsFetchedAt}
            onRefresh={() => hub.fetchChannels()}
            onDelete={isSuper ? hub.delChan : undefined}
          />
        )
      case 'users':
        return (
          <UserList
            users={hub.users}
            onSelect={handleUserSelect}
            onAdd={() => setShowAddUser(true)}
            canAdd={canManage}
            loading={hub.loading}
            searchValue={searchValue}
            messages={hub.messages}
            onCommandSilent={hub.sendCommandSilent}
            onSelectHandle={handle =>
              navigate({ view: 'users', selectedUser: handle })
            }
            fetchedAt={hub.usersFetchedAt}
            onRefresh={() => hub.fetchUsers(true)}
            onDelete={canManage ? hub.delUser : undefined}
          />
        )
      case 'bots':
        return (
          <BotList
            bots={hub.bots}
            onSelect={handleBotSelect}
            onAdd={() => setShowAddBot(true)}
            onUpAll={hasOwner || isSuper ? () => hub.sendCommand('upbots') : undefined}
            onDownAll={hasOwner || isSuper ? () => hub.sendCommand('downbots') : undefined}
            canAdd={isSuper}
            loading={hub.loading}
            searchValue={searchValue}
            fetchedAt={hub.botsFetchedAt}
            onRefresh={() => hub.fetchBots(true)}
            onDelete={isSuper ? hub.delBot : undefined}
            onSendCommand={hasOwner || canBotControl ? hub.sendCommand : undefined}
          />
        )
      case 'matrix':
        return (
          <BotChannelMatrix
            bots={hub.bots}
            fetchAllBotPresence={hub.fetchAllBotPresence}
            canFetch={hasOwner || canBotControl}
            onSelectChannel={name => {
              const ch = hub.channels.find(c => c.name === name)
              if (ch) handleChannelSelect(ch)
            }}
            onSelectBot={name => {
              const b = hub.bots.find(x => x.name === name)
              if (b) handleBotSelect(b)
            }}
          />
        )
      case 'topology':
        return (
          <BotnetTopology
            bots={hub.bots}
            hubLabel={hub.handle || 'HUB'}
            messages={hub.messages}
            onCommandSilent={hub.sendCommandSilent}
            onBotSelect={handleBotSelect}
          />
        )
      case 'audit':
        return <AuditLog />
      case 'idiots':
        return (
          <IdiotsList
            messages={hub.messages}
            onCommandSilent={hub.sendCommandSilent}
            canEdit={canManage}
          />
        )
      case 'health':
        return (
          <HealthDashboard
            bots={hub.bots}
            channels={hub.channels}
            messages={hub.messages}
            wsStatus={wsStatus}
            hubHandle={hub.handle || ''}
            partylineUsersCount={hub.partylineUsers.filter(u => u.online).length}
            onNavigate={handleViewChange}
            onSelectChannel={handleChannelSelect}
            onSelectBot={handleBotSelect}
          />
        )
      case 'irc':
        return (
          <IrcServers
            bots={hub.bots}
            data={hub.ircnet}
            loading={hub.ircnetLoading}
            error={hub.ircnetError}
            onRefresh={hub.fetchIrcServers}
            onAddBotTo={isSuper ? () => setShowAddBot(true) : undefined}
          />
        )
      case 'help':
        return <Help />
      case 'hub-settings':
        return (
          <HubSettings
            messages={hub.messages}
            onCommandSilent={hub.sendCommandSilent}
            onCommand={hub.sendCommand}
            canEdit={isSuper}
          />
        )
      case 'telegram':
        return <TelegramSetup />

      case 'bans':
        return (
          <BansView
            channels={hub.channels}
            currentChannel={hub.currentChannel}
            loading={hub.loading}
            canEdit={canManage}
            onFetchChannel={hub.fetchChannel}
            onAddProtlist={hub.addProtlist}
            onDelProtlist={hub.delProtlist}
            onQueryGlobalProtlists={hub.queryGlobalProtlists}
          />
        )
      default:
        return null
    }
  }

  return (
    <>
      {hub.reconnecting && (
        <div className="reconnect-banner" role="alert">
          <span className="spinner-sm" />
          {t('ws.reconnecting')}
        </div>
      )}
      <MainLayout
        handle={hub.handle || ''}
        onLogout={hub.logout}
        currentView={currentView}
        onViewChange={handleViewChange}
        channelsCount={hub.channels.length}
        usersCount={hub.users.filter(u => !u.isBot).length}
        botsCount={hub.bots.length}
        messages={hub.messages}
        onCommand={hub.sendCommand}
        onChat={hub.sendChat}
        wsStatus={wsStatus}
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        partylineUsers={hub.partylineUsers}
        users={hub.users}
        onBoot={isSuper ? (handle, reason) => hub.sendCommand(`boot ${handle} ${reason}`) : undefined}
        onSelectFavorite={handleSelectFavorite}
        sidebarActions={
          canManage
            ? [
                { id: 'quickban', icon: 'shield', labelKey: 'nav.actionQuickBan', onClick: () => setShowQuickBan(true) },
                { id: 'massban',  icon: 'zap',    labelKey: 'nav.actionMassBan',  variant: 'danger', onClick: () => setShowMassBan(true) },
                { id: 'verify',   icon: 'check',  labelKey: 'nav.actionVerify',   onClick: () => setShowVerify(true) },
              ]
            : undefined
        }
      >
        <ErrorBoundary
          scope={`view:${currentView}`}
          resetKey={`${currentView}:${selectedChannel ?? ''}:${selectedUser ?? ''}:${route.selectedBot ?? ''}`}
        >
          {/* Suspense covers the lazy-loaded views (topology, audit,
              irc, idiots, hub-settings, telegram, help). Eager
              views — overview, channels/users/bots lists+details, bans,
              health, matrix — render synchronously and never trigger
              the fallback. */}
          <Suspense fallback={<div className="view-container"><SkeletonPanel lines={8} /></div>}>
            {renderContent()}
          </Suspense>
        </ErrorBoundary>
      </MainLayout>

      <AddUserModal
        isOpen={showAddUser}
        onClose={() => setShowAddUser(false)}
        onAdd={hub.addUser}
      />

      <AddBotModal
        isOpen={showAddBot}
        onClose={() => setShowAddBot(false)}
        onAdd={hub.addBot}
      />

      <AddChannelModal
        isOpen={showAddChannel}
        onClose={() => setShowAddChannel(false)}
        onAdd={hub.addChan}
        bots={hub.bots}
        onSelectiveJoin={(channel, key, botNames, delaySeconds) => {
          const tail = key ? ` ${key}` : ''
          if (delaySeconds <= 0) {
            for (const b of botNames) hub.sendCommand(`rjoin ${b} ${channel}${tail}`)
            return
          }
          // Stagger: bot[i] joins at i * delaySeconds — front-end paced
          // because .rjoin has no native delay arg (.mjoin does, .rjoin does not).
          botNames.forEach((b, i) => {
            window.setTimeout(
              () => hub.sendCommand(`rjoin ${b} ${channel}${tail}`),
              i * delaySeconds * 1000,
            )
          })
        }}
        onMassJoin={(channel, key, delaySeconds) => {
          // .mjoin <chan> <key> <delay> — positional. Psotnic's str2words
          // collapses whitespace so we can't skip the key slot when delay
          // is set. add_chan was already issued before this fires, so the
          // userlist entry's real key (or none) is preserved by
          // ul::addChannel which only writes pass on first create. The
          // placeholder "-" here is just a positional filler — IRC joins
          // ignore the key arg on channels without +k.
          const keyArg = key ?? '-'
          hub.sendCommand(`mjoin ${channel} ${keyArg} ${delaySeconds}`)
        }}
      />

      <AddProtlistModal
        isOpen={showAddProtlist}
        onClose={() => setShowAddProtlist(false)}
        onAdd={hub.addProtlist}
        defaultType={protlistType}
        channel={selectedChannel || undefined}
      />

      <QuickBanModal
        isOpen={showQuickBan}
        onClose={() => setShowQuickBan(false)}
        channels={hub.channels.map(c => c.name)}
        currentChannel={selectedChannel || hub.currentChannel?.name}
        channelUsers={hub.currentChannel?.users}
        onBan={(mask, channel, reason, expires) =>
          hub.addProtlist('ban', mask, channel, reason, expires)
        }
        onStick={(mask, channel, reason, expires) =>
          hub.addProtlist('stick', mask, channel, reason, expires)
        }
      />

      <MassBanModal
        isOpen={showMassBan}
        onClose={() => setShowMassBan(false)}
        channels={hub.channels.map(c => c.name)}
        currentChannel={selectedChannel || hub.currentChannel?.name}
        onBan={(mask, channel, reason, expires) =>
          hub.addProtlist('ban', mask, channel, reason, expires)
        }
        onStick={(mask, channel, reason, expires) =>
          hub.addProtlist('stick', mask, channel, reason, expires)
        }
        onSendCommand={hub.sendCommand}
      />

      <CommandPalette
        isOpen={showPalette}
        onClose={() => setShowPalette(false)}
        channels={hub.channels}
        users={hub.users}
        bots={hub.bots}
        onNavigate={handleViewChange}
        onSelectChannel={handleChannelSelect}
        onSelectUser={handleUserSelect}
        onSelectBot={handleBotSelect}
        onAddUser={canManage ? () => setShowAddUser(true) : undefined}
        onAddBot={isSuper ? () => setShowAddBot(true) : undefined}
        onAddChannel={isSuper ? () => setShowAddChannel(true) : undefined}
        onQuickBan={canManage ? () => setShowQuickBan(true) : undefined}
        onMassBan={canManage ? () => setShowMassBan(true) : undefined}
        onVerify={canManage ? () => setShowVerify(true) : undefined}
        onLogout={hub.logout}
      />

      <VerifyModal
        isOpen={showVerify}
        onClose={() => setShowVerify(false)}
        messages={hub.messages}
        onCommandSilent={hub.sendCommandSilent}
      />

      <ShortcutsHelp
        isOpen={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      <SessionChanges />
    </>
  )
}

export default function App() {
  return (
    <I18nProvider>
      <ErrorBoundary scope="app">
        <Dashboard />
      </ErrorBoundary>
      <ToastContainer />
    </I18nProvider>
  )
}
