/**
 * Farmer data export — the last role on the platform with no way to get its own
 * records out.
 *
 * Buyers export an ESG report, LGUs export a city ESG report, sellers export a
 * sales ledger, verifiers export a verification report and a decision history,
 * admins export audit logs and transactions. The farmer — who hands over a
 * physical good they cannot take back, and whose counterparty risk this platform
 * reduces by transparency rather than by holding the money — could read their
 * deliveries on a screen and nothing else.
 *
 * That gap is sharper for this role than for any other. A farmer chasing an
 * unpaid delivery, or substantiating one to a cooperative or a lender, needs the
 * record in a form they can send to somebody. "Open the app and look" is not a
 * record.
 *
 * Follows the convention set by sellerExportService and lguReportService: the
 * canonical `toCsv` from esgReportService, `downloadBlob` from utils/download.js,
 * and pure row builders so the columns can be unit-tested without a DOM.
 */

import { toCsv } from '@/services/esgReportService'
import { downloadBlob } from '@/utils/download'
import { deliveryTonnes } from '@/services/farmerService'
import { paymentState as adminPaymentState } from '@/services/adminFeedstockService'

/** `carbonify-deliveries-2026-08-07.csv` — dated so exports do not collide. */
export function exportFilename(kind, now = new Date()) {
  const stamp = now.toISOString().slice(0, 10)
  return `carbonify-${kind}-${stamp}.csv`
}

/** Money to a fixed 2dp string: a spreadsheet should not have to guess. */
function money(n) {
  return (Number(n) || 0).toFixed(2)
}

function isoDay(value) {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

/**
 * What the delivery's payment record actually says, in one column.
 *
 * ⚠️ **This delegates to `adminFeedstockService.paymentState` on purpose, and
 * the first version of this file did not.** It carried its own four-branch
 * copy, which `duplicateServiceReads.test.js` refused — correctly. The copy was
 * not merely redundant, it was **wrong**: it had no branch for
 * `payment_resolution`, so a dispute a staff member had already resolved
 * exported as *"Disputed by farmer"*, and a farmer who disputed again after a
 * resolution was indistinguishable from one disputing for the first time. Both
 * states are visible on the admin console and on the farmer's own screen.
 *
 * That is this repository's signature defect — a correct rule applied to one
 * branch and not its sibling — reached from the export side, and it was caught
 * by a ratchet rather than by review.
 *
 * The distinction being preserved is the reason #26 exists: a buyer marking a
 * delivery paid is an assertion, not a fact, until the farmer acknowledges it.
 * A spreadsheet has no badge colours and gets forwarded to people who never saw
 * the screen, so the export has to say so in words.
 *
 * @param {object} delivery a row from `farmer_deliveries`
 * @returns {string} the human label, e.g. 'Buyer claims paid'
 */
export function paymentLabel(delivery = {}) {
  return adminPaymentState(delivery).label
}

const DELIVERY_COLUMNS = [
  { key: 'date', header: 'Date' },
  { key: 'delivery_id', header: 'Delivery ID' },
  // The delivery row carries no product name — feedstock lives on the RFQ, and
  // `getMyDeliveries` does not embed it. The quote id is what the farmer can
  // actually match this row back to, so it is exported instead of inventing a
  // feedstock column that would be blank on every row.
  { key: 'rfq_id', header: 'Quote ID' },
  { key: 'quantity', header: 'Quantity' },
  { key: 'unit', header: 'Unit' },
  { key: 'tonnes', header: 'Tonnes' },
  { key: 'unit_price', header: 'Unit price' },
  { key: 'total', header: 'Total' },
  { key: 'currency', header: 'Currency' },
  { key: 'status', header: 'Delivery status' },
  { key: 'payment', header: 'Payment' },
  { key: 'paid_on', header: 'Paid on' },
]

/**
 * One row per delivery, in the order the portal shows them.
 *
 * Every delivery is exported, including rejected and pending ones. A farmer
 * disputing what they were paid needs the rejections in front of them, and an
 * export that quietly disagrees with the screen it came from is worse than none.
 *
 * `tonnes` is blank rather than zero where the unit cannot be converted — sacks
 * and bales have no fixed mass, and `deliveryTonnes` returns null for exactly
 * that reason. Writing 0 would understate a real delivery.
 *
 * @param {Array<object>} deliveries rows from farmerService.getMyDeliveries
 */
export function deliveriesToRows(deliveries = []) {
  return (Array.isArray(deliveries) ? deliveries : []).map((d) => {
    const tonnes = deliveryTonnes(d)
    return {
      // `delivered_on` is the column that exists — measured against live, not
      // read off a migration. `delivered_at` does not exist on this table.
      date: isoDay(d?.delivered_on || d?.created_at),
      delivery_id: d?.id ?? '',
      rfq_id: d?.rfq_id ?? '',
      quantity: Number(d?.quantity) || 0,
      unit: d?.unit || '',
      tonnes: tonnes == null ? '' : String(Math.round(tonnes * 1000) / 1000),
      unit_price: money(d?.price_per_unit),
      total: money(d?.total_amount),
      currency: d?.currency || 'PHP',
      status: d?.status || '',
      payment: paymentLabel(d),
      paid_on: isoDay(d?.paid_at),
    }
  })
}

/** Download the farmer's delivery record as CSV. Returns the row count. */
export function exportDeliveriesCsv(deliveries = []) {
  const rows = deliveriesToRows(deliveries)
  const csv = toCsv(rows, DELIVERY_COLUMNS)
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), exportFilename('deliveries'))
  return rows.length
}

const CARBON_COLUMNS = [
  { key: 'project', header: 'Project' },
  { key: 'farmer_tonnes', header: 'Your tonnes delivered' },
  { key: 'project_tonnes', header: 'Project tonnes received' },
  { key: 'share_pct', header: 'Your share (%)' },
  { key: 'project_verified', header: 'Project verified tCO2e' },
  { key: 'attributed', header: 'Attributed to you (tCO2e)' },
]

/**
 * One row per project the farmer supplied, with their pro-rata carbon share.
 *
 * The share is written as a percentage to 4dp rather than as a raw fraction:
 * this file is read by cooperatives and lenders, and `0.0271` invites being read
 * as 2.71% by someone who is right to expect a percentage in a column headed
 * "share".
 *
 * ⚠️ Attribution is pro-rata by delivered mass, not a per-delivery carbon
 * measurement — see docs/FARMER_CARBON_ATTRIBUTION.md. The disclaimer row below
 * ships with the file so the number cannot travel without it.
 *
 * @param {Array<object>} participation rows from getMyCarbonParticipation
 */
export function carbonParticipationToRows(participation = []) {
  return (Array.isArray(participation) ? participation : []).map((p) => ({
    project: p?.projectTitle || 'Unknown project',
    farmer_tonnes: String(Math.round((Number(p?.farmerTonnes) || 0) * 1000) / 1000),
    project_tonnes: String(Math.round((Number(p?.projectTonnes) || 0) * 1000) / 1000),
    share_pct: ((Number(p?.share) || 0) * 100).toFixed(4),
    project_verified: String(Math.round((Number(p?.projectVerifiedTco2e) || 0) * 1000) / 1000),
    attributed: String(Math.round((Number(p?.attributedTco2e) || 0) * 1000) / 1000),
  }))
}

/**
 * Download the farmer's carbon participation as CSV. Returns the row count.
 *
 * A trailing note names the attribution basis. Carbon numbers get forwarded to
 * people who did not see the screen that produced them, and an unqualified
 * "attributed tCO2e" column in a spreadsheet reads as a measured quantity the
 * farmer owns. It is neither: it is a pro-rata share of what a verifier approved
 * for the whole project, and it is not a tradeable holding.
 */
export function exportCarbonParticipationCsv(participation = []) {
  const rows = carbonParticipationToRows(participation)
  const csv =
    toCsv(rows, CARBON_COLUMNS) +
    '\n"Attribution is pro-rata by delivered mass of the carbon a verifier ' +
    'approved for each project. It is a share of the project\'s verified total, ' +
    'not a separately measured or tradeable credit holding."\n'
  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
    exportFilename('carbon-participation'),
  )
  return rows.length
}
