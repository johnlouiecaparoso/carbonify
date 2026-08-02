import { describe, it, expect } from 'vitest'
import { summariseEndorsements } from '@/services/endorsementService'

/**
 * The LGU's endorsement record. An endorsement is one of the nine documents a
 * carbon project submits, so these counts are what a council or an auditor is
 * shown — they have to be right about reversals in particular, since a
 * withdrawn endorsement is the most consequential thing in the list.
 */

const history = [
  {
    id: '1',
    decision: 'endorsed',
    decidedAt: '2026-02-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    revised: false,
  },
  {
    id: '2',
    decision: 'declined',
    decidedAt: '2026-01-05T00:00:00.000Z',
    updatedAt: '2026-01-05T00:00:00.000Z',
    revised: false,
  },
  {
    id: '3',
    // Endorsed, then changed later — still one decision, but a revised one.
    decision: 'endorsed',
    decidedAt: '2026-03-10T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
    revised: true,
  },
]

describe('summariseEndorsements', () => {
  it('returns zeros and null bounds for an empty record', () => {
    expect(summariseEndorsements([])).toEqual({
      total: 0,
      endorsed: 0,
      declined: 0,
      revised: 0,
      firstAt: null,
      lastAt: null,
    })
  })

  it('tolerates being called with nothing', () => {
    expect(summariseEndorsements().total).toBe(0)
  })

  it('counts endorsed and declined separately', () => {
    const s = summariseEndorsements(history)
    expect(s.total).toBe(3)
    expect(s.endorsed).toBe(2)
    expect(s.declined).toBe(1)
  })

  it('counts a revised decision once, and flags it', () => {
    // A reversal must not inflate the total — it is the same decision, changed.
    const s = summariseEndorsements(history)
    expect(s.total).toBe(3)
    expect(s.revised).toBe(1)
  })

  it('bounds the range by when decisions were FIRST made', () => {
    // Not by updatedAt: the record covers the period this office was deciding,
    // and a late edit to an old decision does not extend that period.
    const s = summariseEndorsements(history)
    expect(s.firstAt).toBe('2026-01-05T00:00:00.000Z')
    expect(s.lastAt).toBe('2026-03-10T00:00:00.000Z')
  })

  it('ignores rows with no decision date rather than producing a null bound', () => {
    const s = summariseEndorsements([...history, { id: '4', decision: 'endorsed' }])
    expect(s.total).toBe(4)
    expect(s.endorsed).toBe(3)
    expect(s.firstAt).toBe('2026-01-05T00:00:00.000Z')
  })
})
