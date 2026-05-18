import { describe, expect, it } from 'vitest'
import {
  parseCwhoLine,
  parseSetLine,
  parseDsetLine,
  parsePsetLine,
  parseOptionLine,
  parseUptimeLine,
  parseVersionLine,
  parseLagLine,
  parseIdiotsOutput,
} from './parsers'

describe('parseCwhoLine', () => {
  it('parses an op line', () => {
    const out = parseCwhoLine('[  1] [@alice        ] [   alice@example.com                       ] +n')
    expect(out).toEqual({
      mode: '@',
      nick: 'alice',
      ident: 'alice',
      host: 'example.com',
      flags: '+n',
    })
  })

  it('parses a voice line', () => {
    const out = parseCwhoLine('[  2] [+alice      ] [   ko@dyn.host.example                     ] ')
    expect(out).toEqual({
      mode: '+',
      nick: 'alice',
      ident: 'ko',
      host: 'dyn.host.example',
      flags: '',
    })
  })

  it('parses a regular (no mode) line', () => {
    const out = parseCwhoLine('[  3] [ ruciu       ] [   r@1.2.3.4                              ] ')
    expect(out).toEqual({
      mode: ' ',
      nick: 'ruciu',
      ident: 'r',
      host: '1.2.3.4',
      flags: '',
    })
  })

  it('handles a botname prefix from the hub relay', () => {
    const out = parseCwhoLine('(daimos) [  1] [@alice        ] [   alice@host                               ] +s')
    expect(out).toEqual({
      mode: '@',
      nick: 'alice',
      ident: 'alice',
      host: 'host',
      flags: '+s',
    })
  })

  it('returns null for non-matching lines', () => {
    expect(parseCwhoLine('not a cwho line')).toBeNull()
    expect(parseCwhoLine('Psotnic: No matches found')).toBeNull()
    expect(parseCwhoLine('')).toBeNull()
    expect(parseCwhoLine('[  1] alice')).toBeNull()
  })
})

describe('parseOptionLine (set / dset / pset)', () => {
  it('parses a set line', () => {
    expect(parseSetLine('set: max_clients     50')).toEqual({
      name: 'max_clients',
      value: '50',
    })
  })

  it('parses a dset line', () => {
    expect(parseDsetLine('dset: defaultflags    +V')).toEqual({
      name: 'defaultflags',
      value: '+V',
    })
  })

  it('parses a pset line', () => {
    expect(parsePsetLine('pset: sendQ_burst     5120')).toEqual({
      name: 'sendQ_burst',
      value: '5120',
    })
  })

  it('handles a botname prefix from the hub relay', () => {
    expect(parseSetLine('(daimos) set: nick_format default')).toEqual({
      name: 'nick_format',
      value: 'default',
    })
  })

  it('preserves multi-word values', () => {
    const out = parseSetLine('set: motd  Welcome to the channel friends')
    expect(out).toEqual({
      name: 'motd',
      value: 'Welcome to the channel friends',
    })
  })

  it('returns empty string for variables with no value', () => {
    expect(parseSetLine('set: empty')).toEqual({ name: 'empty', value: '' })
    expect(parseSetLine('set: empty   ')).toEqual({ name: 'empty', value: '' })
  })

  it('does not match wrong scope', () => {
    expect(parseSetLine('dset: foo bar')).toBeNull()
    expect(parsePsetLine('set: foo bar')).toBeNull()
    expect(parseDsetLine('pset: foo bar')).toBeNull()
  })

  it('rejects garbage / non-listing lines', () => {
    expect(parseSetLine('Permission denied')).toBeNull()
    expect(parseSetLine('No such variable')).toBeNull()
    expect(parseSetLine('')).toBeNull()
  })

  it('parseOptionLine with explicit scope arg works the same', () => {
    expect(parseOptionLine('set: foo bar', 'set')).toEqual({ name: 'foo', value: 'bar' })
    expect(parseOptionLine('dset: foo bar', 'dset')).toEqual({ name: 'foo', value: 'bar' })
    expect(parseOptionLine('pset: foo bar', 'pset')).toEqual({ name: 'foo', value: 'bar' })
  })
})

describe('parseUptimeLine', () => {
  it('parses a basic uptime line', () => {
    expect(parseUptimeLine('Uptime: 2 days, 3 hours, 17 minutes')).toBe('2 days, 3 hours, 17 minutes')
  })

  it('handles botname prefix', () => {
    expect(parseUptimeLine('(daimos) Uptime: 5d 12h')).toBe('5d 12h')
  })

  it('returns null for unrelated lines', () => {
    expect(parseUptimeLine('Connected to: irc.example.com')).toBeNull()
    expect(parseUptimeLine('')).toBeNull()
  })
})

describe('parseVersionLine', () => {
  it('parses a Hi line with handle + version', () => {
    expect(parseVersionLine("Hi, I'm daimos psotnic-2.5.7")).toEqual({
      handle: 'daimos',
      version: 'psotnic-2.5.7',
    })
  })

  it('returns null for unrelated lines', () => {
    expect(parseVersionLine('Hi there')).toBeNull()
  })
})

describe('parseLagLine', () => {
  it('parses lag with ago seconds', () => {
    expect(parseLagLine('Lag: 0.182s (15s ago)')).toEqual({
      lagMs: 182,
      agoSec: 15,
    })
  })

  it('rounds milliseconds correctly', () => {
    expect(parseLagLine('Lag: 1.999s (3s ago)')).toEqual({ lagMs: 1999, agoSec: 3 })
  })

  it('returns null for non-matching lines', () => {
    expect(parseLagLine('Lag: not_checked')).toBeNull()
    expect(parseLagLine('Lag: in progress')).toBeNull()
  })
})

describe('parseIdiotsOutput', () => {
  // Real-shape capture from psotnic class-userlist.cpp:sendHandleInfo
  it('parses a typical .idiots reply with multiple hosts and addrs', () => {
    const out = parseIdiotsOutput([
      "Matching user 'idiots'",
      'global flags: +V',
      'created at Thu Jan 29 21:16:36 2026 by alice',
      'hosts: ',
      '[ #1]:  *!*@spam1.host (alice)',
      '[ #2]:  *!*@spam2.host (alice)',
      '[ #3]:  *!*@bare.host',
      'addrs: ',
      '[ #1]:  10.0.0.0',
      '[ #2]:  192.168.0.1',
    ])
    expect(out.denied).toBe(false)
    expect(out.sawHostsHeader).toBe(true)
    expect(out.offenceCount).toBe(0)
    expect(out.hosts).toHaveLength(3)
    expect(out.hosts[0]).toEqual({ mask: '*!*@spam1.host', addedBy: 'alice', temporary: false })
    expect(out.hosts[1]).toEqual({ mask: '*!*@spam2.host', addedBy: 'alice',   temporary: false })
    expect(out.hosts[2]).toEqual({ mask: '*!*@bare.host',  addedBy: undefined, temporary: false })
    expect(out.addrs).toEqual(['10.0.0.0', '192.168.0.1'])
  })

  // Real-world capture from alice on 2026-05-03 — hub returned offence
  // history entries before the empty hosts: section. We count those
  // for diagnostic display but still report 0 hosts.
  it('parses real-world offence-rich response with empty hosts list', () => {
    const out = parseIdiotsOutput([
      "Matching user 'idiots'",
      'global flags: +V',
      'created at Sat May  3 16:00:00 2026 by alice',
      'offence history: ',
      '[ 1]: #control(1): kick user1 (by operator!user@example.net)',
      '       Channel flags decreased from `-\' to `d\'',
      '       Created: 03/05/2026 16:32:55',
      '[ 2]: #control(1): kick another (by operator!user@example.net)',
      '       Channel flags decreased from `-\' to `d\'',
      '       Created: 03/05/2026 17:05:00',
      'hosts: ',
      'No hosts has been found',
      'addrs: ',
    ])
    expect(out.offenceCount).toBe(2)
    expect(out.sawHostsHeader).toBe(true)
    expect(out.hosts).toHaveLength(0)
    expect(out.addrs).toHaveLength(0)
    expect(out.denied).toBe(false)
  })

  it('does NOT count offence rows as hosts (they have no # before the digit)', () => {
    const out = parseIdiotsOutput([
      'offence history: ',
      '[ 1]: #foo(1): kick someone',
      '[ 2]: #bar(2): kick another',
      'hosts: ',
      '[ #1]:  *!*@real.host (alice)',
    ])
    expect(out.offenceCount).toBe(2)
    expect(out.hosts).toHaveLength(1)
    expect(out.hosts[0].mask).toBe('*!*@real.host')
  })

  it('reports sawHostsHeader=false when reply is truncated', () => {
    const out = parseIdiotsOutput([
      "Matching user 'idiots'",
      'global flags: +V',
      // hub disconnect / partial reply — never got to hosts section
    ])
    expect(out.sawHostsHeader).toBe(false)
    expect(out.hosts).toHaveLength(0)
  })

  it('flags the [tmp] row as temporary', () => {
    const out = parseIdiotsOutput([
      'hosts: ',
      '[ #1]:  *!*@perm.host (alice)',
      '[tmp]:  *!*@runtime.host (auto)',
    ])
    expect(out.hosts).toHaveLength(2)
    expect(out.hosts[0].temporary).toBe(false)
    expect(out.hosts[1]).toMatchObject({
      mask: '*!*@runtime.host',
      addedBy: 'auto',
      temporary: true,
    })
  })

  it('returns empty hosts when "No hosts has been found"', () => {
    const out = parseIdiotsOutput([
      "Matching user 'idiots'",
      'global flags: +V',
      'hosts: ',
      'No hosts has been found',
      'addrs: ',
    ])
    expect(out.hosts).toHaveLength(0)
    expect(out.addrs).toHaveLength(0)
    expect(out.denied).toBe(false)
  })

  it('marks denied=true on Permission denied', () => {
    const out = parseIdiotsOutput(['Permission denied'])
    expect(out.denied).toBe(true)
    expect(out.hosts).toHaveLength(0)
  })

  it('marks denied=true on Invalid handle', () => {
    const out = parseIdiotsOutput(['Invalid handle'])
    expect(out.denied).toBe(true)
  })

  it('does not pick up host rows before the hosts: header (preamble safety)', () => {
    const out = parseIdiotsOutput([
      "Matching user 'idiots'",
      'channel flags: #foo(b)',
      // This shouldn't ever appear before hosts: but be defensive
      '[ #1]:  *!*@should.not.parse',
      'hosts: ',
      '[ #1]:  *!*@real.host',
    ])
    expect(out.hosts).toHaveLength(1)
    expect(out.hosts[0].mask).toBe('*!*@real.host')
  })

  it('survives botname (foo) prefix from cross-bot relay', () => {
    const out = parseIdiotsOutput([
      "(daimos) Matching user 'idiots'",
      '(daimos) hosts:',
      '(daimos) [ #1]:  *!*@x (alice)',
    ])
    expect(out.hosts).toHaveLength(1)
    expect(out.hosts[0]).toMatchObject({ mask: '*!*@x', addedBy: 'alice' })
  })

  it('does not confuse addrs section rows with host entries', () => {
    const out = parseIdiotsOutput([
      'hosts: ',
      '[ #1]:  *!*@host.example (alice)',
      'addrs: ',
      '[ #1]:  10.0.0.0',
    ])
    expect(out.hosts).toHaveLength(1)
    expect(out.hosts[0].mask).toBe('*!*@host.example')
    expect(out.addrs).toEqual(['10.0.0.0'])
  })
})
