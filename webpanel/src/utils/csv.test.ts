import { describe, expect, it } from 'vitest'
import { csvEscape, csvBuild } from './csv'

describe('csvEscape', () => {
  it('returns plain strings unchanged', () => {
    expect(csvEscape('hello')).toBe('hello')
    expect(csvEscape('123')).toBe('123')
    expect(csvEscape('user_handle')).toBe('user_handle')
    expect(csvEscape('')).toBe('')
  })

  it('wraps and escapes when value contains a comma', () => {
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('one, two, three')).toBe('"one, two, three"')
  })

  it('wraps and escapes when value contains a quote', () => {
    expect(csvEscape('he said "hi"')).toBe('"he said ""hi"""')
    expect(csvEscape('"')).toBe('""""')
  })

  it('wraps when value contains newlines', () => {
    expect(csvEscape('line1\nline2')).toBe('"line1\nline2"')
    expect(csvEscape('a\rb')).toBe('"a\rb"')
    expect(csvEscape('a\r\nb')).toBe('"a\r\nb"')
  })

  it('handles tab + space without wrapping (not RFC 4180 special)', () => {
    expect(csvEscape('a\tb')).toBe('a\tb')
    expect(csvEscape('hello world')).toBe('hello world')
  })
})

describe('csvBuild', () => {
  it('joins rows with CRLF', () => {
    expect(csvBuild([['a', 'b'], ['c', 'd']])).toBe('a,b\r\nc,d')
  })

  it('escapes per-cell within a row', () => {
    expect(csvBuild([['a,b', 'c']])).toBe('"a,b",c')
  })

  it('handles empty matrix and empty rows', () => {
    expect(csvBuild([])).toBe('')
    expect(csvBuild([[]])).toBe('')
    expect(csvBuild([['x']])).toBe('x')
  })

  it('preserves structure across mixed escape needs', () => {
    const out = csvBuild([
      ['handle', 'flags', 'channels'],
      ['alice', '+sn', '#a, #b'],
      ['"weird"', '+x', ''],
    ])
    expect(out).toBe(
      'handle,flags,channels\r\nalice,+sn,"#a, #b"\r\n"""weird""",+x,',
    )
  })
})
