/**
 * Developer impact disclosure — the climate half of a project developer's story.
 *
 * ## Why this is not the seller export
 *
 * `sellerExportService` answers "what did I earn". It is a FINANCIAL export and
 * a good one. This answers a different question, asked by a different reader: a
 * corporate partner's sustainability team, a grant body, or an investor doing
 * diligence wants tCO2e, not pesos, and they want it split by who is entitled to
 * claim it.
 *
 * ## The split is the whole point
 *
 * A developer who reports "our projects generated 10,000 tCO2e" while 6,000 of
 * those credits sit retired in buyers' names has double-counted: the buyer has
 * already made that claim, and it is the reason retirement is permanent and
 * public. Every row here therefore separates:
 *
 *   retired        a buyer has permanently claimed it — the developer must NOT
 *   soldUnretired  transferred; the claim is the buyer's, not yet exercised
 *   unsold         still the developer's, unclaimed by anyone
 *
 * and states `claimableByDeveloper` explicitly, which is `unsold` alone. That
 * number exists nowhere else in the product. An export that printed only
 * "issued" would be technically accurate and routinely misused, and this is a
 * disclosure document — its job is to be hard to misread.
 *
 * 1 credit = 1 tCO2e, as everywhere else in the platform.
 *
 * Volumes come from `aggregateAssetLedger`, so this cannot drift from the Carbon
 * Asset Ledger screen: one aggregation, two renderings. `buildImpactDisclosure`
 * is pure and unit-tested; the export helpers are thin wrappers.
 */

import { toCsv } from '@/services/esgReportService'
import { downloadBlob } from '@/utils/download'
import { getMyAssetLedger } from '@/services/assetLedgerService'

const TONNES_PER_CREDIT = 1

/** `carbonify-impact-disclosure-2026-08-08.csv` — dated so exports do not collide. */
export function impactFilename(now = new Date()) {
  return `carbonify-impact-disclosure-${now.toISOString().slice(0, 10)}.csv`
}

/**
 * Volumes for one ledger row, split by who may claim them.
 *
 * `soldUnretired` is clamped at zero rather than trusted: `sold` and `retired`
 * come from different tables (`credit_transactions` and `credit_retirements`),
 * and a retirement of a credit bought before this platform recorded the sale
 * would otherwise render a negative tonnage in a disclosure document.
 */
export function splitClaims(row = {}) {
  const issued = Number(row.issued) || 0
  const sold = Number(row.sold) || 0
  const retired = Number(row.retired) || 0
  const unsold = Number(row.inventory) || 0
  const soldUnretired = Math.max(0, sold - retired)

  return {
    issued,
    retired,
    soldUnretired,
    unsold,
    claimableByDeveloper: unsold,
  }
}

const COLUMNS = [
  { key: 'project', header: 'Project' },
  { key: 'category', header: 'Category' },
  { key: 'methodology', header: 'Methodology' },
  { key: 'location', header: 'Location' },
  { key: 'development_status', header: 'Development status' },
  { key: 'registry_status', header: 'Registry status' },
  { key: 'issued_tco2e', header: 'Issued (tCO2e)' },
  { key: 'retired_tco2e', header: 'Retired by buyers (tCO2e)' },
  { key: 'sold_unretired_tco2e', header: 'Sold, not yet retired (tCO2e)' },
  { key: 'unsold_tco2e', header: 'Unsold inventory (tCO2e)' },
  { key: 'claimable_tco2e', header: 'Claimable by developer (tCO2e)' },
  { key: 'pending_tco2e', header: 'Pending verification (tCO2e)' },
]

/**
 * Build the disclosure dataset from an asset ledger.
 *
 * Draft and rejected projects are excluded: they have no verified volume, and a
 * disclosure that lists an unsubmitted project alongside validated ones invites
 * exactly the reading it should prevent. A project with no issued volume but a
 * pending VER is kept — "awaiting verification" is a legitimate disclosure.
 *
 * @param {{rows: Array<object>}} ledger from `getMyAssetLedger` / `aggregateAssetLedger`
 * @param {Date} [now]
 */
export function buildImpactDisclosure(ledger = {}, now = new Date()) {
  const excluded = new Set(['draft', 'rejected'])
  const source = (ledger.rows || []).filter((r) => !excluded.has(r.status))

  const rows = source.map((r) => {
    const claims = splitClaims(r)
    return {
      project: r.projectTitle || 'Untitled Project',
      category: r.category || '',
      methodology: r.methodology || '',
      location: r.location || '',
      development_status: r.developmentStatus || '',
      registry_status: r.status || '',
      issued_tco2e: claims.issued * TONNES_PER_CREDIT,
      retired_tco2e: claims.retired * TONNES_PER_CREDIT,
      sold_unretired_tco2e: claims.soldUnretired * TONNES_PER_CREDIT,
      unsold_tco2e: claims.unsold * TONNES_PER_CREDIT,
      claimable_tco2e: claims.claimableByDeveloper * TONNES_PER_CREDIT,
      pending_tco2e: (Number(r.pending) || 0) * TONNES_PER_CREDIT,
    }
  })

  const totals = rows.reduce(
    (t, r) => {
      t.projects += 1
      t.issued += r.issued_tco2e
      t.retired += r.retired_tco2e
      t.soldUnretired += r.sold_unretired_tco2e
      t.unsold += r.unsold_tco2e
      t.claimable += r.claimable_tco2e
      t.pending += r.pending_tco2e
      return t
    },
    { projects: 0, issued: 0, retired: 0, soldUnretired: 0, unsold: 0, claimable: 0, pending: 0 },
  )

  return { generatedAt: now.toISOString(), rows, totals }
}

/**
 * The footer written under the table.
 *
 * A disclosure that a reader can misattribute is worse than none, and these two
 * sentences are the ones a sustainability team needs in writing. The beta limit
 * is stated here for the same reason it is stated in-app: the export outlives
 * the screen it was downloaded from.
 */
export function disclosureNotes(totals = {}) {
  return [
    '1 credit = 1 tCO2e.',
    `Of ${totals.issued || 0} tCO2e issued, ${totals.retired || 0} have been permanently retired ` +
      'by buyers and are claimed by them, not by the project developer.',
    `${totals.soldUnretired || 0} tCO2e have been sold but not yet retired; that claim belongs to ` +
      'the buyer.',
    `${totals.claimable || 0} tCO2e remain unsold and are the only volume the developer may claim.`,
    'Carbonify credits are not yet backed by an external registry (Verra, Gold Standard). ' +
      'This document reports platform-verified volumes.',
  ]
}

/**
 * Download the disclosure as CSV. Returns the dataset so a caller can render
 * totals without rebuilding it.
 */
export function exportImpactDisclosureCsv(ledger, now = new Date()) {
  const data = buildImpactDisclosure(ledger, now)
  const table = toCsv(data.rows, COLUMNS)
  // Notes go below the table, each on its own line in the first column, so a
  // spreadsheet import keeps them readable instead of splitting them on commas.
  const notes = disclosureNotes(data.totals)
    .map((n) => toCsv([{ note: n }], [{ key: 'note', header: 'Notes' }]).split('\r\n')[1])
    .join('\r\n')
  const csv = `${table}\r\n\r\nNotes\r\n${notes}`

  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), impactFilename(now))
  return data
}

/** Fetch the signed-in developer's ledger and export it. */
export async function exportMyImpactDisclosureCsv() {
  const ledger = await getMyAssetLedger()
  return exportImpactDisclosureCsv(ledger)
}
