export type Channel = {
  name: string
  index: number
  userFlags: number
  bansCount: number
  sticksCount: number
  exemptsCount: number
  invitesCount: number
  reopsCount: number
  usersCount: number
  opLockdown: boolean
}

export type ChannelDetail = {
  name: string
  index: number
  chset: ChsetEntry[]
  users: ChannelUser[]
  bans: ProtlistEntry[]
  sticks: ProtlistEntry[]
  exempts: ProtlistEntry[]
  invites: ProtlistEntry[]
  reops: ProtlistEntry[]
}

export type ChsetEntry = {
  name: string
  value: string
}

export type ChannelUser = {
  name: string
  flags: number
  globalFlags: number
  online: boolean
}

export type ChannelFlag = {
  channel: string
  flags: number
}

export type User = {
  name: string
  flags: number
  isBot: boolean
  online: boolean
  channelsCount: number
  hostsCount: number
  channelFlags?: ChannelFlag[]
}

export type UserAddress = {
  ip: string
  by: string
  time: number
}

export type UserInfo = {
  key: string
  value: string
}

export type UserDetail = {
  name: string
  flags: number
  isBot: boolean
  online: boolean
  hasPassword: boolean
  createdBy?: string
  createdAt?: number
  hosts: string[]
  addresses: UserAddress[]
  channelFlags: ChannelFlag[]
  info: UserInfo[]
}

export type Bot = {
  name: string
  nick: string
  server: string
  online: boolean
  ip?: string
}

export type ProtlistEntry = {
  mask: string
  reason: string
  by: string
  when: number
  expires: number
}

export type Message = {
  from: string
  text: string
  time: Date
  system?: boolean
  /** Hidden from console display (set by silent programmatic fetches).
   *  Still present in messages[] so components that trigger the fetch
   *  can parse the response. */
  hidden?: boolean
}

export type View = 'overview' | 'channels' | 'users' | 'bots' | 'matrix' | 'channel-detail' | 'topology' | 'audit' | 'irc' | 'idiots' | 'health' | 'bans' | 'hub-settings' | 'telegram' | 'help'

// Flag values must match backend defines.h
export const FLAG_A = 0x00000001  // AutoOp
export const FLAG_D = 0x00000002  // Deop
export const FLAG_O = 0x00000004  // Op
export const FLAG_F = 0x00000008  // Friend
export const FLAG_M = 0x00000010  // Master
export const FLAG_N = 0x00000020  // Owner
export const FLAG_S = 0x00000040  // Super
export const FLAG_X = 0x00000080  // Super Owner
export const FLAG_V = 0x00000100  // Voice
export const FLAG_Q = 0x00000200  // Quiet
export const FLAG_R = 0x00000400  // Reop
export const FLAG_K = 0x00000800  // Kick
export const FLAG_I = 0x00001000  // Ignore
export const FLAG_E = 0x00002000  // Exempt
export const FLAG_C = 0x00004000  // Channel
export const FLAG_B = 0x00020000  // Bot
export const FLAG_L = 0x00040000  // Leaf
export const FLAG_H = 0x00080000  // Hub
export const FLAG_P = 0x08000000  // Partyline

export function flagsToString(flags: number): string {
  let result = ''
  if (flags & FLAG_X) result += 'x'
  if (flags & FLAG_S) result += 's'
  if (flags & FLAG_N) result += 'n'
  if (flags & FLAG_M) result += 'm'
  if (flags & FLAG_F) result += 'f'
  if (flags & FLAG_O) result += 'o'
  if (flags & FLAG_R) result += 'r'
  if (flags & FLAG_I) result += 'i'
  if (flags & FLAG_E) result += 'e'
  if (flags & FLAG_C) result += 'c'
  if (flags & FLAG_P) result += 'p'
  if (flags & FLAG_V) result += 'v'
  if (flags & FLAG_A) result += 'a'
  if (flags & FLAG_L) result += 'l'
  if (flags & FLAG_D) result += 'd'
  if (flags & FLAG_K) result += 'k'
  if (flags & FLAG_Q) result += 'q'
  if (flags & FLAG_B) result += 'b'
  if (flags & FLAG_H) result += 'h'
  return result || '-'
}

export function formatTimestamp(ts: number): string {
  if (ts === 0) return '-'
  return new Date(ts * 1000).toLocaleString()
}

export function formatExpires(ts: number): string {
  if (ts === 0) return 'never'
  const now = Math.floor(Date.now() / 1000)
  if (ts < now) return 'expired'
  return new Date(ts * 1000).toLocaleString()
}
