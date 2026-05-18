/**
 * Hub-broadcast line parsers — extracted from view components so they
 * can be unit-tested without spinning up React. Each parser corresponds
 * to a partyline / botcmd output format documented in psotnic source.
 */

// ── chan::cwho output (class-chan.cpp:213) ───────────────────────────
//
// Fixed-width: `[ N] [@nick<padded>] [ ident@host<padded>] flags`
//   - mode char in slot 1: '@' op, '+' voice, ' ' regular
//   - flags is the userlist flag string for that nick (may be empty)
//
// Each `[ ]` is whitespace-padded by psotnic to align columns. We
// allow optional `(botname)` prefix which the hub adds when relaying
// the answer from a remote bot's session.

export type CwhoMember = {
  mode: '@' | '+' | ' '
  nick: string
  ident: string
  host: string
  flags: string
}

const CWHO_RE =
  /^(?:\([^)]+\)\s+)?\[\s*\d+\s*\]\s*\[([@+ ])(.+?)\s*\]\s*\[\s*(\S+?)@(\S+?)\s*\]\s*(.*)$/

/** Parse one cwho output line. Returns null if the line doesn't match. */
export function parseCwhoLine(line: string): CwhoMember | null {
  const m = line.match(CWHO_RE)
  if (!m) return null
  return {
    mode: m[1] as '@' | '+' | ' ',
    nick: m[2].trim(),
    ident: m[3].trim(),
    host: m[4].trim(),
    flags: m[5].trim(),
  }
}

// ── options::sendToOwner output (class-options.cpp:81) ───────────────
//
// Format: `<prefix>: <name><padded><value>`. Used by .set / .dset /
// .pset listings — same shape, different prefix per scope.

export type Variable = {
  name: string
  value: string
}

function makeOptionRe(prefix: string): RegExp {
  // Match optional botname prefix, then `<prefix>: <name>` with optional
  // value. The body capture is greedy-trim — psotnic right-justifies
  // values so leading whitespace is intentional padding.
  return new RegExp(`^(?:\\([^)]+\\)\\s+)?${prefix}:\\s+(\\S+)(?:\\s+(.*))?$`, 'i')
}

const SET_RE  = makeOptionRe('set')
const DSET_RE = makeOptionRe('dset')
const PSET_RE = makeOptionRe('pset')

export function parseOptionLine(
  line: string,
  scope: 'set' | 'dset' | 'pset',
): Variable | null {
  const re = scope === 'set' ? SET_RE : scope === 'dset' ? DSET_RE : PSET_RE
  const m = line.match(re)
  if (!m) return null
  return { name: m[1], value: (m[2] ?? '').trim() }
}

// Convenience wrappers for callers that prefer named functions.
export const parseSetLine  = (line: string) => parseOptionLine(line, 'set')
export const parseDsetLine = (line: string) => parseOptionLine(line, 'dset')
export const parsePsetLine = (line: string) => parseOptionLine(line, 'pset')

// ── Bot status (class-status / partyline) ────────────────────────────
//
// Excerpts from `bc <bot> status` we care about. Format strings come
// from class-status.cpp; we only parse the lines used by BotStatusTab.

const UPTIME_RE  = /^(?:\([^)]+\)\s+)?Uptime:\s+(.+?)$/i
const VERSION_RE = /^(?:\([^)]+\)\s+)?Hi,\s+I'?m\s+(\S+)\s+(.+)$/i
const LAG_DONE_RE = /^(?:\([^)]+\)\s+)?Lag:\s+([\d.]+)s\s+\((\d+)s\s+ago\)/i

export function parseUptimeLine(line: string): string | null {
  const m = line.match(UPTIME_RE)
  return m ? m[1].trim() : null
}

export function parseVersionLine(line: string): { handle: string; version: string } | null {
  const m = line.match(VERSION_RE)
  return m ? { handle: m[1], version: m[2].trim() } : null
}

export function parseLagLine(line: string): { lagMs: number; agoSec: number } | null {
  const m = line.match(LAG_DONE_RE)
  if (!m) return null
  return {
    lagMs: Math.round(parseFloat(m[1]) * 1000),
    agoSec: parseInt(m[2], 10),
  }
}

// ── .idiots output (partyline.cpp:pl_idiots → sendHandleInfo) ────────
//
// Psotnic prints the special "idiots" pseudo-handle's info, with the
// actual entries living under sections:
//
//   Matching user 'idiots'
//   global flags: ...
//   created at <date> by <handle>
//   hosts:
//   [ #1]:  *!*@spammer1.host (alice)
//   [ #2]:  *!*@spammer2.host
//   [tmp]:  *!*@temporary.host (someone)
//   addrs:
//   [ #1]:  192.168.0.1
//   [ #2]:  10.0.0.0
//
// We care about the `hosts:` rows (those are .+idiot entries). The
// `addrs:` block is also returned for callers that want to display it,
// since psotnic's idiots logic checks both.

export type IdiotEntry = {
  mask: string
  /** Owner who added this entry (in the trailing `(name)` group). */
  addedBy?: string
  /** True for the bot's transient slot — `[tmp]:` instead of `[ #N]:`. */
  temporary?: boolean
}

export type IdiotsParseResult = {
  hosts: IdiotEntry[]
  addrs: string[]
  /** True only on a "Permission denied" or "Invalid handle" reply. */
  denied: boolean
  /** Past offences psotnic tracks on this pseudo-handle. Surfacing this
   *  count helps the user see the panel IS receiving real data even when
   *  the hosts list is empty (avoids the "panel doesn't work" feeling). */
  offenceCount: number
  /** True if we observed the `hosts:` section header. False is a useful
   *  signal that the hub's reply was truncated or shaped unexpectedly. */
  sawHostsHeader: boolean
}

const IDIOT_HOSTS_HEADER    = /^hosts:\s*$/i
const IDIOT_ADDRS_HEADER    = /^addrs:\s*$/i
const IDIOT_OFFENCES_HEADER = /^offence history:\s*$/i
const IDIOT_NO_HOSTS        = /^No hosts has been found$/i
const IDIOT_HOST_ROW        = /^\[\s*(?:tmp|#\s*\d+)\s*\]:\s+(\S+)(?:\s+\((.+?)\))?\s*$/i
const IDIOT_TMP_ROW         = /^\[\s*tmp\s*\]:\s+(\S+)/i
const IDIOT_ADDR_ROW        = /^\[\s*(?:tmp|#\s*\d+)\s*\]:\s+(\S+)\s*$/i
const IDIOT_OFFENCE_ROW     = /^\[\s*\d+\s*\]:\s+\S+\(\d+\):/  // [ 1]: #chan(N): kick ...
const IDIOT_DENIED          = /^Permission denied$|^Invalid handle$/i
const IDIOT_STRIP_PREFIX    = /^(?:\([^)]+\)\s+)?/

/**
 * Parse the multi-line `.idiots` output into structured entries.
 *
 * The parser is section-aware: it only treats `[#N]: mask` rows as
 * hosts after seeing the `hosts:` header, and only treats them as
 * addrs after `addrs:`. This avoids miscategorising rows when the
 * user's local hub adds extra prelude lines.
 */
export function parseIdiotsOutput(lines: string[]): IdiotsParseResult {
  const result: IdiotsParseResult = {
    hosts: [],
    addrs: [],
    denied: false,
    offenceCount: 0,
    sawHostsHeader: false,
  }
  type Section = 'preamble' | 'offences' | 'hosts' | 'addrs' | 'tail'
  let section: Section = 'preamble'

  for (const raw of lines) {
    const line = raw.replace(IDIOT_STRIP_PREFIX, '').trim()
    if (!line) continue

    if (IDIOT_DENIED.test(line)) {
      result.denied = true
      continue
    }

    // Section headers — observed once each in a normal reply, in order.
    if (IDIOT_OFFENCES_HEADER.test(line)) { section = 'offences'; continue }
    if (IDIOT_HOSTS_HEADER.test(line))    { section = 'hosts'; result.sawHostsHeader = true; continue }
    if (IDIOT_ADDRS_HEADER.test(line))    { section = 'addrs'; continue }

    if (section === 'offences') {
      // Count [ N]: chan(C): mode rows so callers can show "X past offences"
      // as confirmation the panel is receiving real data. We don't parse
      // the entries themselves — the channel-detail offence views handle
      // that at a much richer level.
      if (IDIOT_OFFENCE_ROW.test(line)) result.offenceCount++
      continue
    }

    if (section === 'hosts') {
      if (IDIOT_NO_HOSTS.test(line)) { section = 'tail'; continue }
      const m = line.match(IDIOT_HOST_ROW)
      if (m) {
        result.hosts.push({
          mask: m[1],
          addedBy: m[2]?.trim() || undefined,
          temporary: IDIOT_TMP_ROW.test(line),
        })
      }
      continue
    }

    if (section === 'addrs') {
      const m = line.match(IDIOT_ADDR_ROW)
      if (m) result.addrs.push(m[1])
    }
  }

  return result
}

/** Silent-pattern matcher that hides the entire .idiots reply, including
 *  the offence-history block that sendHandleInfo prints between the
 *  `created at` and `hosts:` sections. Without offence-history coverage
 *  rows like `[  1]: #control(1): kick user1` and the indented meta
 *  lines beneath them leaked into the mini-console. */
export const IDIOTS_SILENT_RE =
  /^(?:\([^)]+\)\s+)?(?:Matching\s+|global flags:|flags:|channel flags:|created at|offence history:|channels:|hosts:|addrs:|No hosts has been found|\[\s*\d+\s*\]:\s+\S+|\[\s*(?:tmp|\*)\s*\]:\s+\S+|\s+\S+\s+flags decreased from|\s+Created:\s+\d|Permission denied|Invalid handle)/i
