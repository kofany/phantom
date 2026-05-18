import {
  FLAG_A, FLAG_D, FLAG_O, FLAG_F, FLAG_M, FLAG_N, FLAG_S, FLAG_X,
  FLAG_V, FLAG_Q, FLAG_R, FLAG_K, FLAG_I, FLAG_E, FLAG_C,
  FLAG_B, FLAG_L, FLAG_H, FLAG_P,
} from '../../types'

type Tier = 'owner' | 'master' | 'op' | 'voice' | 'neutral' | 'restrict' | 'bot'

type FlagSpec = {
  letter: string
  bit: number
  label: string       // human-readable label matching psotnic FT[] desc
  tier: Tier
  priority: number    // higher = more important (matches psotnic priority field)
}

// Mirrors `flagTable FT[]` from class-userlist.cpp — same order, same labels.
// `.users` partyline command shows each user grouped under their HIGHEST
// matching tier here, and we follow the same convention so admins recognize
// labels from the bot directly.
const FLAG_SPECS: FlagSpec[] = [
  { letter: 'x', bit: FLAG_X, label: 'Main owner',    tier: 'owner',    priority: 7 },
  { letter: 's', bit: FLAG_S, label: 'Super owner',   tier: 'owner',    priority: 6 },
  { letter: 'n', bit: FLAG_N, label: 'Owner',         tier: 'owner',    priority: 5 },
  { letter: 'm', bit: FLAG_M, label: 'Master',        tier: 'master',   priority: 4 },
  { letter: 'f', bit: FLAG_F, label: 'Friend',        tier: 'op',       priority: 3 },
  { letter: 'o', bit: FLAG_O, label: 'Op',            tier: 'op',       priority: 2 },
  { letter: 'v', bit: FLAG_V, label: 'Voice',         tier: 'voice',    priority: 1 },
  { letter: 'r', bit: FLAG_R, label: 'Reop',          tier: 'voice',    priority: 0 },
  { letter: 'a', bit: FLAG_A, label: 'Auto mode',     tier: 'neutral',  priority: 0 },
  { letter: 'i', bit: FLAG_I, label: 'Auto invite',   tier: 'neutral',  priority: 0 },
  { letter: 'e', bit: FLAG_E, label: 'Idiot exempt',  tier: 'neutral',  priority: 0 },
  { letter: 'c', bit: FLAG_C, label: 'Clone exempt',  tier: 'neutral',  priority: 0 },
  { letter: 'p', bit: FLAG_P, label: 'Partyline',     tier: 'neutral',  priority: 0 },
  { letter: 'q', bit: FLAG_Q, label: 'Quiet',         tier: 'restrict', priority: -1 },
  { letter: 'd', bit: FLAG_D, label: 'Deoped',        tier: 'restrict', priority: -2 },
  { letter: 'k', bit: FLAG_K, label: 'Kicked',        tier: 'restrict', priority: -3 },
  { letter: 'b', bit: FLAG_B, label: 'Bot',           tier: 'bot',      priority: 0 },
  { letter: 'l', bit: FLAG_L, label: 'Leaf',          tier: 'bot',      priority: 0 },
  { letter: 'h', bit: FLAG_H, label: 'Hub',           tier: 'bot',      priority: 0 },
]

type FlagBadgeProps = {
  flags: number
  /** Show only the 5 most important flags as letter pills + overflow count.
   *  Used for cramped contexts where individual letter pills still fit. */
  compact?: boolean
  /** Single-badge mode with the highest-tier human name (e.g. "Owner",
   *  "Op"). Mirrors `.users` partyline output — admins recognize these
   *  labels directly. Restrictions (Quiet/Deoped/Kicked) shown as small
   *  modifier chips next to the primary tier badge. */
  condensed?: boolean
}

export function FlagBadge({ flags, compact = false, condensed = false }: FlagBadgeProps) {
  const active = FLAG_SPECS.filter(spec => (flags & spec.bit) !== 0)

  if (active.length === 0) {
    return <span className="flag-empty">—</span>
  }

  // Condensed (default for table rows): one badge with the highest-tier name,
  // optional modifier chips for restrictions / auto-mode flags.
  if (condensed) {
    // Highest-priority active flag is the "primary" label
    const primary = active.reduce(
      (best, spec) => (spec.priority > best.priority ? spec : best),
      active[0],
    )
    // Restrictions and auto-mode are MODIFIERS — shown as small letter chips
    // next to the primary tier badge. Owners/admins recognize the letters
    // directly; the tooltip keeps the full label for hover.
    const modifiers = active.filter(spec =>
      spec !== primary && (spec.tier === 'restrict' || spec.letter === 'a'),
    )
    const tooltip = active.map(s => `${s.letter} = ${s.label}`).join(', ')

    return (
      <span className="flag-tier-row" title={tooltip}>
        <span className="flag-tier-badge" data-tier={primary.tier}>
          {primary.label}
        </span>
        {modifiers.map(m => (
          <span
            key={m.letter}
            className="flag-mod"
            data-tier={m.tier}
            title={m.label}
          >
            {m.letter.toUpperCase()}
          </span>
        ))}
      </span>
    )
  }

  const visible = compact ? active.slice(0, 5) : active
  const overflow = compact ? active.length - visible.length : 0

  return (
    <span className="flag-row">
      {visible.map(spec => (
        <span
          key={spec.letter}
          className="flag"
          data-tier={spec.tier}
          aria-label={spec.label}
        >
          {spec.letter}
          <span className="tooltip">{spec.label} ({spec.letter})</span>
        </span>
      ))}
      {overflow > 0 && (
        <span className="flag" data-tier="neutral" aria-label={`+${overflow} more`}>
          +{overflow}
        </span>
      )}
    </span>
  )
}
