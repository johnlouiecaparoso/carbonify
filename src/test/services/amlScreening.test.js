import { describe, it, expect } from 'vitest'
import {
  normalizeName,
  nameTokens,
  nameSimilarity,
  screenName,
  summariseScreenings,
  MATCH_THRESHOLD,
  AML_OPEN_STATUSES,
} from '@/services/amlService'

const entry = (over = {}) => ({
  id: 'w1',
  full_name: 'Juan Dela Cruz',
  aliases: [],
  entry_type: 'sanction',
  list_source: 'UN Consolidated',
  country: 'PH',
  is_active: true,
  ...over,
})

describe('normalizeName', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalizeName('  Juan   DELA Cruz ')).toBe('juan dela cruz')
  })

  it('strips diacritics so Jose and José compare equal', () => {
    expect(normalizeName('José Ramón')).toBe(normalizeName('Jose Ramon'))
  })

  it('strips punctuation', () => {
    expect(normalizeName('Dela Cruz, Juan P.')).toBe('dela cruz juan p')
  })

  it('strips honorifics and suffixes', () => {
    expect(normalizeName('Dr. Juan Dela Cruz Jr')).toBe('juan dela cruz')
  })

  it('handles empty input without throwing', () => {
    expect(normalizeName('')).toBe('')
    expect(normalizeName(null)).toBe('')
    expect(normalizeName(undefined)).toBe('')
  })
})

describe('nameTokens', () => {
  it('drops single-letter initials', () => {
    expect(nameTokens('Juan P Dela Cruz')).toEqual(['juan', 'dela', 'cruz'])
  })

  it('de-duplicates repeated tokens', () => {
    expect(nameTokens('Cruz Cruz')).toEqual(['cruz'])
  })
})

describe('nameSimilarity', () => {
  it('scores an exact name 1', () => {
    expect(nameSimilarity('Juan Dela Cruz', 'Juan Dela Cruz')).toBe(1)
  })

  it('is order-insensitive — the common real-world variation', () => {
    expect(nameSimilarity('Dela Cruz, Juan', 'Juan Dela Cruz')).toBe(1)
  })

  it('scores against the SHORTER name, so a middle name does not dilute a match', () => {
    // A full legal name must still match a two-token list entry.
    expect(nameSimilarity('Juan Pablo Dela Cruz', 'Juan Cruz')).toBe(1)
  })

  it('scores unrelated names 0', () => {
    expect(nameSimilarity('Maria Santos', 'Juan Dela Cruz')).toBe(0)
  })

  it('scores a partial overlap between 0 and 1', () => {
    const score = nameSimilarity('Juan Reyes', 'Juan Dela Cruz')
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(1)
  })

  it('returns 0 rather than NaN for empty input', () => {
    expect(nameSimilarity('', 'Juan')).toBe(0)
    expect(nameSimilarity('Juan', '')).toBe(0)
    expect(nameSimilarity(null, null)).toBe(0)
  })
})

describe('screenName', () => {
  it('reports clear when nothing matches — the evidence that a check happened', () => {
    const result = screenName('Maria Santos', [entry()])
    expect(result.status).toBe('clear')
    expect(result.matches).toEqual([])
  })

  it('flags an exact match as a potential match, never as confirmed', () => {
    // Confirmation is a human decision; the matcher may only raise a candidate.
    const result = screenName('Juan Dela Cruz', [entry()])
    expect(result.status).toBe('potential_match')
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].score).toBe(1)
  })

  it('matches against aliases as well as the primary name', () => {
    const result = screenName('Johnny Cruz', [entry({ aliases: ['Johnny Cruz'] })])
    expect(result.status).toBe('potential_match')
    expect(result.matches[0].matched_name).toBe('Johnny Cruz')
  })

  it('keeps the strongest score per entry rather than one row per alias', () => {
    const result = screenName('Juan Dela Cruz', [
      entry({ aliases: ['J Cruz', 'Juan Dela Cruz'] }),
    ])
    expect(result.matches).toHaveLength(1)
    expect(result.matches[0].score).toBe(1)
  })

  it('ignores inactive entries', () => {
    expect(screenName('Juan Dela Cruz', [entry({ is_active: false })]).status).toBe('clear')
  })

  it('carries the list source through, so evidence says what was screened against', () => {
    const [match] = screenName('Juan Dela Cruz', [entry()]).matches
    expect(match.list_source).toBe('UN Consolidated')
    expect(match.entry_type).toBe('sanction')
  })

  it('sorts the strongest match first', () => {
    const result = screenName('Juan Dela Cruz', [
      entry({ id: 'weak', full_name: 'Juan Reyes' }),
      entry({ id: 'strong', full_name: 'Juan Dela Cruz' }),
    ], 0.4)
    expect(result.matches[0].entry_id).toBe('strong')
  })

  it('respects a custom threshold', () => {
    const partial = 'Juan Reyes'
    expect(screenName(partial, [entry()], 0.9).status).toBe('clear')
    expect(screenName(partial, [entry()], 0.4).status).toBe('potential_match')
  })

  it('is clear against an empty watchlist', () => {
    expect(screenName('Juan Dela Cruz', []).status).toBe('clear')
    expect(screenName('Juan Dela Cruz').status).toBe('clear')
  })

  it('tolerates malformed entries', () => {
    expect(() => screenName('Juan', [null, {}, entry({ aliases: null })])).not.toThrow()
  })

  it('defaults to over-reporting rather than under-reporting', () => {
    // A false positive costs a reviewer a minute; a false negative onboards a
    // sanctioned party.
    expect(MATCH_THRESHOLD).toBeLessThanOrEqual(0.8)
  })
})

describe('summariseScreenings', () => {
  it('is all zeroes for an empty list', () => {
    expect(summariseScreenings([])).toEqual({ total: 0, potential: 0, confirmed: 0, cleared: 0 })
    expect(summariseScreenings().total).toBe(0)
  })

  it('buckets each status', () => {
    const s = summariseScreenings([
      { status: 'clear' },
      { status: 'potential_match' },
      { status: 'confirmed_match' },
      { status: 'cleared_after_review' },
    ])
    expect(s).toEqual({ total: 4, potential: 1, confirmed: 1, cleared: 1 })
  })
})

describe('AML_OPEN_STATUSES', () => {
  it('treats a confirmed match as still open — it needs action, not filing', () => {
    expect(AML_OPEN_STATUSES).toContain('confirmed_match')
    expect(AML_OPEN_STATUSES).toContain('potential_match')
    expect(AML_OPEN_STATUSES).not.toContain('clear')
    expect(AML_OPEN_STATUSES).not.toContain('cleared_after_review')
  })
})
