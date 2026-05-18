import { describe, expect, it } from 'vitest'
import { parseProtlistOutput } from './parseProtlist'

describe('parseProtlistOutput', () => {
  it('returns empty result when given the no-matches marker', () => {
    const out = parseProtlistOutput(['No matches has been found'])
    expect(out.done).toBe(true)
    expect(out.noMatches).toBe(true)
    expect(out.global).toHaveLength(0)
    expect(out.perChannel).toEqual({})
  })

  it('parses a single global ban with full metadata', () => {
    const out = parseProtlistOutput([
      'Global',
      '[   1 ]:  *!*@spam.example.com  (expires:  never )',
      '        ruciu :  spamming users',
      '       created: 29/01/2026 21:16:36',
      '--- Found 1  match',
    ])
    expect(out.done).toBe(true)
    expect(out.noMatches).toBe(false)
    expect(out.global).toHaveLength(1)
    expect(out.global[0]).toMatchObject({
      mask: '*!*@spam.example.com',
      by: 'ruciu',
      reason: 'spamming users',
      expires: 0,
    })
    expect(out.global[0].when).toBeGreaterThan(0)
  })

  it('parses sticky-bracketed meta variant', () => {
    const out = parseProtlistOutput([
      'Global',
      '[   1 ]:  *!*@a.com  (expires:  never )',
      '[ * ]   alice :  permanent',
      '       created: 01/02/2026 10:00:00',
      '--- Found 1  match',
    ])
    expect(out.global[0].by).toBe('alice')
    expect(out.global[0].reason).toBe('permanent')
  })

  it('groups entries under their channel sections', () => {
    const out = parseProtlistOutput([
      'Global',
      '[   1 ]:  *!*@global.host  (expires:  never )',
      '        admin :  global ban',
      '       created: 01/01/2026 00:00:00',
      '#koza',
      '[   1 ]:  *!*@koza1.host  (expires:  never )',
      '        admin :  k1',
      '       created: 02/02/2026 00:00:00',
      '[   2 ]:  *!*@koza2.host  (expires:  never )',
      '        admin :  k2',
      '       created: 02/02/2026 00:01:00',
      '#help',
      '[   1 ]:  *!*@help.host  (expires:  never )',
      '        admin :  h1',
      '       created: 03/03/2026 00:00:00',
      '--- Found 4  matches',
    ])
    expect(out.done).toBe(true)
    expect(out.global).toHaveLength(1)
    expect(Object.keys(out.perChannel).sort()).toEqual(['#help', '#koza'])
    expect(out.perChannel['#koza']).toHaveLength(2)
    expect(out.perChannel['#help']).toHaveLength(1)
  })

  it('parses dated expiry into a unix timestamp', () => {
    const out = parseProtlistOutput([
      'Global',
      '[   1 ]:  *!*@temp.com  (expires:  31/12/2026 23:59:59 )',
      '        admin :  temporary',
      '       created: 01/01/2026 00:00:00',
      '--- Found 1  match',
    ])
    expect(out.global[0].expires).toBeGreaterThan(0)
    // Sanity: end-of-2026 should be > start-of-2026
    expect(out.global[0].expires).toBeGreaterThan(out.global[0].when)
  })

  it('strips a leading [HH:MM] timestamp on lines that still have one', () => {
    const out = parseProtlistOutput([
      '[16:45] Global',
      '[16:45] [   1 ]:  *!*@example.com  (expires:  never )',
      '[16:45]         ruciu :  reason',
      '[16:45]        created: 29/01/2026 21:16:36',
      '[16:45] --- Found 1  match',
    ])
    expect(out.global).toHaveLength(1)
    expect(out.global[0].mask).toBe('*!*@example.com')
  })

  it('survives unrelated noise lines without crashing', () => {
    const out = parseProtlistOutput([
      'Some random partyline broadcast',
      '* alice says hi',
      'Global',
      '[   1 ]:  *!*@x  (expires:  never )',
      '        a :  b',
      '       created: 01/01/2026 00:00:00',
      'random tail line',
      '--- Found 1  match',
    ])
    expect(out.done).toBe(true)
    expect(out.global).toHaveLength(1)
  })

  it('does NOT mark done when the terminator never arrived', () => {
    const out = parseProtlistOutput([
      'Global',
      '[   1 ]:  *!*@x  (expires:  never )',
      '        a :  b',
      '       created: 01/01/2026 00:00:00',
    ])
    expect(out.done).toBe(false)
    // ...but it still flushes the pending entry so partial results are usable
    expect(out.global).toHaveLength(1)
  })
})
