/**
 * RFC 4180 CSV escaping. Wrap in quotes when the field contains a quote,
 * comma, or newline; double internal quotes.
 */
export function csvEscape(s: string): string {
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/**
 * Build a CSV body from a 2D array of cells. Adds CRLF line breaks
 * (Excel-friendly). Caller wraps in BOM + Blob if downloading.
 */
export function csvBuild(rows: string[][]): string {
  return rows.map(r => r.map(csvEscape).join(',')).join('\r\n')
}
