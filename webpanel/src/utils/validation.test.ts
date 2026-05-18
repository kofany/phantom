import { describe, expect, it } from 'vitest'
import { isValidIrcNick, isValidAddr } from './validation'

describe('isValidIrcNick', () => {
  it('accepts simple nicks', () => {
    expect(isValidIrcNick('alice')).toBe(true)
    expect(isValidIrcNick('alice')).toBe(true)
    expect(isValidIrcNick('a')).toBe(true)
  })

  it('accepts nicks with digits after the first character', () => {
    expect(isValidIrcNick('user123')).toBe(true)
    expect(isValidIrcNick('Bot42')).toBe(true)
  })

  it('accepts RFC-permitted special chars in any position after first', () => {
    expect(isValidIrcNick('test[bot]')).toBe(true)
    expect(isValidIrcNick('user{1}')).toBe(true)
    expect(isValidIrcNick('foo|bar')).toBe(true)
    expect(isValidIrcNick('a-b-c')).toBe(true)
    expect(isValidIrcNick('user_underscore')).toBe(true)
  })

  it('accepts RFC-permitted special chars as the FIRST character', () => {
    expect(isValidIrcNick('[bot]')).toBe(true)
    expect(isValidIrcNick('_alice')).toBe(true)
    expect(isValidIrcNick('|test')).toBe(true)
  })

  it('rejects empty / whitespace-only', () => {
    expect(isValidIrcNick('')).toBe(false)
    expect(isValidIrcNick(' ')).toBe(false)
    expect(isValidIrcNick('\t')).toBe(false)
  })

  it('rejects nicks longer than 30 chars', () => {
    expect(isValidIrcNick('a'.repeat(30))).toBe(true)
    expect(isValidIrcNick('a'.repeat(31))).toBe(false)
  })

  it('rejects nicks starting with a digit or hyphen', () => {
    expect(isValidIrcNick('1nick')).toBe(false)
    expect(isValidIrcNick('-nick')).toBe(false)
  })

  it('rejects nicks containing illegal chars', () => {
    expect(isValidIrcNick('a b')).toBe(false)
    expect(isValidIrcNick('user.com')).toBe(false)
    expect(isValidIrcNick('user@host')).toBe(false)
    expect(isValidIrcNick('user!')).toBe(false)
    expect(isValidIrcNick('user?')).toBe(false)
    expect(isValidIrcNick('user;rm')).toBe(false)
  })

  it('rejects unicode (psotnic ASCII-only)', () => {
    expect(isValidIrcNick('użytkownik')).toBe(false)
    expect(isValidIrcNick('日本')).toBe(false)
    expect(isValidIrcNick('emoji😀')).toBe(false)
  })
})

describe('isValidAddr', () => {
  it('accepts full IPv4 addresses', () => {
    expect(isValidAddr('1.2.3.4')).toBe(true)
    expect(isValidAddr('192.168.0.1')).toBe(true)
    expect(isValidAddr('255.255.255.255')).toBe(true)
    expect(isValidAddr('0.0.0.0')).toBe(true)
  })

  it('accepts wildcard classes', () => {
    expect(isValidAddr('192.168.0.*')).toBe(true)
    expect(isValidAddr('92.206.50.*')).toBe(true)
    expect(isValidAddr('10.*.*.*')).toBe(true)
    expect(isValidAddr('*.*.*.*')).toBe(true)
  })

  it('rejects too few or too many octets', () => {
    expect(isValidAddr('1.2.3')).toBe(false)
    expect(isValidAddr('1.2.3.4.5')).toBe(false)
    expect(isValidAddr('1')).toBe(false)
    expect(isValidAddr('')).toBe(false)
  })

  it('rejects octets out of range', () => {
    expect(isValidAddr('256.1.1.1')).toBe(false)
    expect(isValidAddr('1.1.1.999')).toBe(false)
    expect(isValidAddr('1000.0.0.0')).toBe(false)
  })

  it('rejects non-digit, non-wildcard content', () => {
    expect(isValidAddr('a.b.c.d')).toBe(false)
    expect(isValidAddr('1.2.3.0x')).toBe(false)
    expect(isValidAddr('1.2.3,4')).toBe(false)
    expect(isValidAddr('1.2.3.4/24')).toBe(false)
  })

  it('rejects IPv6', () => {
    expect(isValidAddr('::1')).toBe(false)
    expect(isValidAddr('2001:db8::1')).toBe(false)
  })

  it('rejects hostnames', () => {
    expect(isValidAddr('example.com')).toBe(false)
    expect(isValidAddr('foo.bar.baz.qux')).toBe(false)
  })
})
