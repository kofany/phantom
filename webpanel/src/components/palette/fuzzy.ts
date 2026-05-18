/**
 * Lightweight fuzzy matcher. No dependencies, fast enough for a few hundred
 * commands + resources. Scores higher when:
 *   - query is a full substring match (exact word > start > middle)
 *   - query characters appear in order (fuzzy match)
 *   - matches are close together (tight clusters > scattered)
 */

export type FuzzyMatch = {
  score: number
  // indices of matched characters in the target, for highlighting
  indices: number[]
}

export function fuzzyScore(query: string, target: string): FuzzyMatch | null {
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  if (!q) return { score: 1, indices: [] }
  if (!t) return null

  // Exact substring — high base score with position-based bonus
  const idx = t.indexOf(q)
  if (idx !== -1) {
    const indices: number[] = []
    for (let i = 0; i < q.length; i++) indices.push(idx + i)
    // word-boundary start = highest
    const atStart = idx === 0
    const atWordBoundary = idx > 0 && /[\s_.\-/]/.test(t[idx - 1])
    let score = 100 - idx * 0.5 // prefer earlier matches
    if (atStart) score += 50
    else if (atWordBoundary) score += 25
    return { score, indices }
  }

  // Fuzzy — every char in query must appear in target, in order
  let ti = 0
  let qi = 0
  const indices: number[] = []
  let score = 0
  let prevMatchPos = -2

  while (qi < q.length && ti < t.length) {
    if (q[qi] === t[ti]) {
      indices.push(ti)
      // adjacency bonus — consecutive matches score higher
      if (prevMatchPos === ti - 1) score += 5
      // word-boundary bonus
      if (ti === 0 || /[\s_.\-/]/.test(t[ti - 1])) score += 3
      prevMatchPos = ti
      qi++
    }
    ti++
  }

  if (qi < q.length) return null // not all query chars matched
  // penalize by target length (shorter = better match)
  score += 20 - Math.min(20, t.length * 0.1)
  return { score, indices }
}

/** Filter + rank a list of items. `getText` extracts the searchable string. */
export function fuzzyFilter<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
): { item: T; match: FuzzyMatch }[] {
  if (!query.trim()) {
    return items.map(item => ({ item, match: { score: 0, indices: [] } }))
  }
  const scored: { item: T; match: FuzzyMatch }[] = []
  for (const item of items) {
    const m = fuzzyScore(query, getText(item))
    if (m) scored.push({ item, match: m })
  }
  return scored.sort((a, b) => b.match.score - a.match.score)
}
