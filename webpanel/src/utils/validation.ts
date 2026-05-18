/**
 * Pure validation helpers — extracted from component bodies so they're
 * importable in tests and reusable across views.
 *
 * These match psotnic's server-side parsing as closely as practical so
 * we can reject obviously-bad input client-side rather than letting the
 * hub silently drop it (which would look like the panel did nothing).
 */

/**
 * IRC nick per RFC 2812-ish:
 *   - 1–30 characters total (psotnic-friendly cap; some servers allow 9)
 *   - First char: letter or one of `[]\`_^{|}`
 *   - Body chars: letters, digits, hyphen, or any of the special chars above
 *
 * Rejects: empty string, leading digit/hyphen, length > 30,
 * unicode, whitespace, common punctuation (.,;:?!@#$%&* etc.)
 */
export function isValidIrcNick(s: string): boolean {
  if (!s || s.length > 30) return false
  return /^[A-Za-z\[\]\\`_^{|}][A-Za-z0-9\[\]\\`_^{|}-]{0,29}$/.test(s)
}

/**
 * IPv4 address or class with `*` wildcards. Accepts shapes the
 * partyline `+addr` command tolerates:
 *   - 1.2.3.4         (full address)
 *   - 1.2.3.*         (last-octet class)
 *   - 1.2.*.*         (subnet class)
 *   - *.* / *.*.*.*   (degenerate but legal — psotnic doesn't reject)
 *
 * Rejects: anything other than 4 dot-separated parts, octets >255,
 * non-digit non-`*` content, IPv6, hostnames.
 */
export function isValidAddr(s: string): boolean {
  const parts = s.split('.')
  if (parts.length !== 4) return false
  return parts.every(p => {
    if (p === '*') return true
    if (!/^\d{1,3}$/.test(p)) return false
    const n = +p
    return n >= 0 && n <= 255
  })
}
