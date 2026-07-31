/**
 * LGU (Local Government Unit) tooling constants.
 *
 * Municipal solid waste (MSW) emission factors use the IPCC default first-order
 * approximation also used by the carbon calculator: methane generated per tonne
 * of landfilled waste, converted to CO2e via the AR5 100-year GWP.
 */

export const WASTE_CH4_FACTOR = 0.052 // tonnes CH4 per tonne MSW (IPCC default)
export const CH4_GWP = 28 // IPCC AR5 100-year GWP for methane

/** tCO2e avoided/emitted per tonne of MSW landfilled. */
export const EMISSION_PER_TONNE = WASTE_CH4_FACTOR * CH4_GWP

export const ORGANIZATION_TYPES = [
  'Municipal LGU',
  'City Government',
  'Provincial LGU',
  'Barangay',
  'Cooperative',
  'NGO / Civil Society',
  'Private Company',
  'Other',
]

/**
 * Compute MSW emissions from generated + diverted tonnage.
 * Diverting waste from landfill avoids its methane emissions.
 */
export function computeWasteEmissions(generated, diverted) {
  const g = Math.max(Number(generated) || 0, 0)
  const d = Math.min(Math.max(Number(diverted) || 0, 0), g)
  const baseline = g * EMISSION_PER_TONNE
  const avoided = d * EMISSION_PER_TONNE
  return {
    generated: g, // sanitized (>= 0)
    diverted: d, // sanitized + clamped to <= generated
    baseline, // if all generated waste were landfilled
    avoided, // avoided by diversion
    net: baseline - avoided, // actual emissions after diversion
    diversionRate: g > 0 ? (d / g) * 100 : 0,
  }
}

/** Rough estimate of annual MSW (tonnes) from population (0.4 kg/person/day). */
export function estimateWasteFromPopulation(population) {
  const p = Math.max(Number(population) || 0, 0)
  return (p * 0.4 * 365) / 1000
}

// ── Land-use carbon modeling ───────────────────────────────────────────────
/**
 * Illustrative annual carbon-sequestration factors (tCO₂e per hectare per year)
 * for land-use / restoration types — Tier-1 approximations from IPCC and
 * published tropical / Philippine literature. For LGU *planning* estimates only:
 * credit issuance runs through the MRV pipeline (methodology_factors), never
 * these round numbers.
 */
export const LAND_USE_TYPES = [
  { value: 'mangrove', label: 'Mangrove restoration', seqPerHa: 17, note: 'Blue carbon — highest uptake.' },
  { value: 'reforestation', label: 'Reforestation (tropical)', seqPerHa: 12, note: 'New native / mixed forest.' },
  { value: 'bamboo', label: 'Bamboo', seqPerHa: 15, note: 'Fast-growing; high early uptake.' },
  { value: 'agroforestry', label: 'Agroforestry / mixed', seqPerHa: 6, note: 'Trees intercropped with farmland.' },
  { value: 'grassland', label: 'Grassland / Bana grass', seqPerHa: 4, note: 'Perennial grass cover.' },
]

const LAND_USE_FACTORS = Object.fromEntries(LAND_USE_TYPES.map((t) => [t.value, t.seqPerHa]))

/** tCO₂e/ha/yr for a land-use type value, or 0 if unknown. */
export function landUseSeqFactor(type) {
  return LAND_USE_FACTORS[type] || 0
}

/** Human label for a land-use type value. */
export function landUseLabel(type) {
  return LAND_USE_TYPES.find((t) => t.value === type)?.label || type || '—'
}

/**
 * Estimate annual and multi-year CO₂e sequestration for a set of land parcels.
 * @param {{type:string, hectares:(number|string)}[]} parcels
 * @param {number} years horizon (>= 1)
 */
export function computeLandUseSequestration(parcels = [], years = 1) {
  const y = Math.max(Number(years) || 1, 1)
  const rows = (parcels || []).map((p) => {
    const ha = Math.max(Number(p.hectares) || 0, 0)
    const perYear = ha * landUseSeqFactor(p.type)
    return { type: p.type, hectares: ha, perYear, total: perYear * y }
  })
  const annual = rows.reduce((s, r) => s + r.perYear, 0)
  return {
    rows,
    hectares: rows.reduce((s, r) => s + r.hectares, 0),
    annual, // tCO₂e / yr
    years: y,
    total: annual * y, // tCO₂e over the horizon
  }
}
