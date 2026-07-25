import { describe, it, expect } from 'vitest'
import {
  computeLandUseSequestration,
  landUseSeqFactor,
  landUseLabel,
  LAND_USE_TYPES,
} from '@/constants/lgu'

describe('computeLandUseSequestration', () => {
  it('multiplies area by the per-hectare factor for the annual figure', () => {
    const mangrove = landUseSeqFactor('mangrove')
    const r = computeLandUseSequestration([{ type: 'mangrove', hectares: 10 }], 1)
    expect(r.hectares).toBe(10)
    expect(r.annual).toBeCloseTo(10 * mangrove, 6)
    expect(r.total).toBeCloseTo(10 * mangrove, 6) // 1-year horizon
  })

  it('scales the total by the horizon in years', () => {
    const r = computeLandUseSequestration([{ type: 'reforestation', hectares: 5 }], 10)
    expect(r.years).toBe(10)
    expect(r.total).toBeCloseTo(r.annual * 10, 6)
  })

  it('sums across multiple parcels of different types', () => {
    const r = computeLandUseSequestration(
      [
        { type: 'mangrove', hectares: 2 },
        { type: 'bamboo', hectares: 3 },
      ],
      1,
    )
    const expected = 2 * landUseSeqFactor('mangrove') + 3 * landUseSeqFactor('bamboo')
    expect(r.hectares).toBe(5)
    expect(r.annual).toBeCloseTo(expected, 6)
  })

  it('treats an unknown type as a zero factor and clamps negative area', () => {
    const r = computeLandUseSequestration(
      [
        { type: 'nonsense', hectares: 100 }, // unknown type → 0 sequestration
        { type: 'reforestation', hectares: -5 }, // negative area → clamped to 0
      ],
      3,
    )
    expect(r.annual).toBe(0) // neither parcel contributes any tCO₂e
    expect(r.hectares).toBe(100) // but the unknown parcel's real area still counts
  })

  it('forces a minimum horizon of 1 year', () => {
    const r = computeLandUseSequestration([{ type: 'grassland', hectares: 1 }], 0)
    expect(r.years).toBe(1)
  })

  it('exposes a human label for each land-use type', () => {
    for (const t of LAND_USE_TYPES) {
      expect(landUseLabel(t.value)).toBe(t.label)
    }
    expect(landUseLabel('unknown')).toBe('unknown')
  })
})
