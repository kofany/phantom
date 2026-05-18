import { useCallback, useEffect, useState } from 'react'
import { View } from '../types'

/**
 * Hash-based router. Works without any server-side config (SPA fallback etc).
 * Syncs three pieces of state into `window.location.hash`:
 *
 *   view                 — which top-level screen is active
 *   selectedChannel      — when view is a channel detail
 *   selectedUser         — when view is a user detail
 *   selectedBot          — when view is a bot detail
 *
 * Hash format (examples):
 *   #/overview
 *   #/channels
 *   #/channels/%23dev        (channel #dev — URI-encoded)
 *   #/users
 *   #/users/alice
 *   #/bots
 *   #/bots/irkop
 *   #/topology
 *   #/irc
 *   #/audit
 *
 * Calling `navigate(...)` writes to history; browser back/forward works.
 */

export type Route = {
  view: View
  selectedChannel: string | null
  selectedUser: string | null
  selectedBot: string | null
}

const DEFAULT_ROUTE: Route = {
  view: 'overview',
  selectedChannel: null,
  selectedUser: null,
  selectedBot: null,
}

function parseHash(hash: string): Route {
  // Strip leading '#/' or '#'
  const path = hash.replace(/^#\/?/, '')
  if (!path) return { ...DEFAULT_ROUTE }

  const [view, resource] = path.split('/')

  switch (view) {
    case 'overview':
    case 'topology':
    case 'audit':
    case 'irc':
    case 'idiots':
    case 'health':
    case 'help':
      return { ...DEFAULT_ROUTE, view }
    case 'channels':
      return {
        ...DEFAULT_ROUTE,
        view: 'channels',
        selectedChannel: resource ? decodeURIComponent(resource) : null,
      }
    case 'users':
      return {
        ...DEFAULT_ROUTE,
        view: 'users',
        selectedUser: resource ? decodeURIComponent(resource) : null,
      }
    case 'bots':
      return {
        ...DEFAULT_ROUTE,
        view: 'bots',
        selectedBot: resource ? decodeURIComponent(resource) : null,
      }
    default:
      return { ...DEFAULT_ROUTE }
  }
}

function buildHash(route: Route): string {
  switch (route.view) {
    case 'channels':
      return route.selectedChannel
        ? `#/channels/${encodeURIComponent(route.selectedChannel)}`
        : '#/channels'
    case 'users':
      return route.selectedUser
        ? `#/users/${encodeURIComponent(route.selectedUser)}`
        : '#/users'
    case 'bots':
      return route.selectedBot
        ? `#/bots/${encodeURIComponent(route.selectedBot)}`
        : '#/bots'
    case 'channel-detail':
      // legacy — channel-detail + selectedChannel = same as channels/:name
      return route.selectedChannel
        ? `#/channels/${encodeURIComponent(route.selectedChannel)}`
        : '#/channels'
    default:
      return `#/${route.view}`
  }
}

export function useRoute(): {
  route: Route
  navigate: (next: Partial<Route>) => void
  back: () => void
} {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash))

  // Listen for browser back/forward + manual URL changes
  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((next: Partial<Route>) => {
    setRoute(current => {
      const merged: Route = { ...current, ...next }
      const nextHash = buildHash(merged)
      // Only push if hash actually changed (avoid dupe history entries)
      if (nextHash !== window.location.hash) {
        window.history.pushState(null, '', nextHash)
      }
      return merged
    })
  }, [])

  const back = useCallback(() => {
    window.history.back()
  }, [])

  return { route, navigate, back }
}
