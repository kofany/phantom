import { ProtlistEntry } from '../../types'

export type ProtlistKind = 'ban' | 'exempt' | 'invite' | 'reop'

export type ParsedProtlist = {
  /** Global section entries — what the bot calls "Global". */
  global: ProtlistEntry[]
  /** Per-channel sections. Key is channel name (with leading '#'). */
  perChannel: Record<string, ProtlistEntry[]>
  /** Parser state: done once we see the "--- Found N" terminator or a
   *  "No matches" marker. The caller uses this to know when it is safe
   *  to stop waiting. */
  done: boolean
  /** True only if the bot emitted the "No matches" marker — useful to
   *  distinguish "we queried and there's nothing" from "still waiting". */
  noMatches: boolean
}

// Real captured lines from daimos (2026-04-24) show an EXACT format that
// is stable across ban/stick/exempt/invite/reop. The "[HH:MM] " leading
// timestamp is stripped by useHub before the line lands in messages[].
//
// Section header     →  "Global"   or   "#channelname"
// Entry mask line    →  "[   1 ]:  *!*@example.com  (expires:  never )"
//                    →  "[  12 ]:  *!user@host  (expires:  31/12/2026 12:00:00 )"
// Sticky meta line   →  "[ * ]   author :  reason"
// Plain  meta line   →  "        author :  reason"
// Created line       →  "       created: 29/01/2026 21:16:36"
// Terminator         →  "--- Found 10  matches"
//   (irregular plural, sometimes "--- Found 1  match")
// No-match marker    →  "No matches has been found"

const RE_STRIP_PREFIX   = /^\[\d{2}:\d{2}\]\s?/
const RE_SECTION_HEADER = /^(Global|#\S+)$/
const RE_ENTRY          = /^\[\s*\d+\s*\]:\s+(\S+)\s+\(expires:\s+(never|\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})\s*\)$/
const RE_STICKY_META    = /^\[\s*\*\s*\]\s+(\S+)\s*:\s+(.*?)\s*$/
const RE_PLAIN_META     = /^\s{4,}(\S+)\s+:\s+(.*?)\s*$/
const RE_CREATED        = /^\s+created:\s+(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})$/
const RE_TERMINATOR     = /^---\s+Found\s+\d+/
const RE_NO_MATCHES     = /^No matches/

// Silent pattern that hides every line of a protlist response from the
// console while parsing. We prefer this to a catch-all /^.*/ so unrelated
// partyline traffic during the query window is not silenced.
export const SILENT_PROTLIST_REGEX = /^(Global$|#\S+$|\[\s*\d+\s*\]:|\[\s*\*\s*\]|\s{4,}\S+\s+:|\s+created:|---\s+Found|No matches)/

function parseDateToUnix(dmy: string): number {
  // "29/01/2026 21:16:36" → epoch seconds, local-time interpreted. The bot
  // uses timestr() which formats in the bot host's local zone; we round-
  // trip through the browser's zone for display, accepting a small drift
  // if bot and browser are in different TZ. For our use (readability of
  // "when was this set"), this is fine.
  const m = dmy.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})$/)
  if (!m) return 0
  const [, d, mo, y, h, mi, s] = m
  const dt = new Date(
    parseInt(y, 10),
    parseInt(mo, 10) - 1,
    parseInt(d, 10),
    parseInt(h, 10),
    parseInt(mi, 10),
    parseInt(s, 10),
  )
  return Math.floor(dt.getTime() / 1000)
}

/**
 * Run over a sequence of partyline text lines and extract protlist
 * entries grouped by section (Global + channels).
 *
 * Lines may already have their "[HH:MM] " prefix stripped (our WS path
 * does this upstream) or may still include it; we tolerate both.
 *
 * This parser is intentionally defensive: any line that does not match
 * one of the known shapes is skipped silently. The upstream format is
 * set by partyline.cpp / class-shitlist.cpp; if the bot is ever rebuilt
 * with a changed format, we want to degrade to an empty result rather
 * than crash the panel.
 */
export function parseProtlistOutput(lines: string[]): ParsedProtlist {
  const result: ParsedProtlist = {
    global: [],
    perChannel: {},
    done: false,
    noMatches: false,
  }

  let section: string | null = null  // 'Global' | '#channel' | null
  let pending: Partial<ProtlistEntry> | null = null

  const pushPending = () => {
    if (!pending || !pending.mask) return
    const entry: ProtlistEntry = {
      mask:    pending.mask,
      reason:  pending.reason  ?? '',
      by:      pending.by      ?? '',
      when:    pending.when    ?? 0,
      expires: pending.expires ?? 0,
    }
    if (section === 'Global' || section === null) {
      result.global.push(entry)
    } else {
      const key = section
      ;(result.perChannel[key] ||= []).push(entry)
    }
    pending = null
  }

  for (const rawLine of lines) {
    const line = rawLine.replace(RE_STRIP_PREFIX, '')

    if (RE_TERMINATOR.test(line)) {
      pushPending()
      result.done = true
      continue
    }

    if (RE_NO_MATCHES.test(line)) {
      pushPending()
      result.done = true
      result.noMatches = true
      continue
    }

    const hdr = line.match(RE_SECTION_HEADER)
    if (hdr) {
      pushPending()
      section = hdr[1]
      continue
    }

    const entry = line.match(RE_ENTRY)
    if (entry) {
      pushPending()
      pending = {
        mask: entry[1],
        expires: entry[2] === 'never' ? 0 : parseDateToUnix(entry[2]),
      }
      continue
    }

    // Meta line (author + reason). Sticky variant goes first because its
    // leading brackets would otherwise match the plain-meta spaces rule.
    if (pending) {
      const sticky = line.match(RE_STICKY_META)
      if (sticky) {
        pending.by = sticky[1]
        pending.reason = sticky[2]
        continue
      }
      const plain = line.match(RE_PLAIN_META)
      if (plain) {
        pending.by = plain[1]
        pending.reason = plain[2]
        continue
      }
      const created = line.match(RE_CREATED)
      if (created) {
        pending.when = parseDateToUnix(created[1])
        continue
      }
    }

    // Any other line (blank lines, reconnects, unrelated partyline
    // noise that leaked through the silent filter): skip.
  }

  // Flush an entry that was mid-parse when the input ran out — the bot
  // always terminates with "--- Found N", but if our timeout truncates
  // the stream, we still want what we have.
  pushPending()

  return result
}
