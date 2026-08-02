// Admin feedstock oversight — the escalation point for the biomass side of the
// marketplace (DEFERRED_BACKLOG.md #29).
//
// Before this existed, no admin console read `farmer_deliveries` or
// `biomass_rfqs` at all. `/admin/finance` reports the CREDIT trade and
// `/admin/refunds` resolves disputes keyed to `credit_transactions`, so a farmer
// owed money for a delivered physical good could be helped by nobody: no screen
// showed the delivery, no screen showed the buyer's side of it, and "contact
// support" resolved to a person with no record to look at.
//
// Read-only by design. Carbonify is an introduction-and-records layer for
// feedstock, not the payment rail (#26, decided 2026-07-28), so there is no
// payments console here and nothing on this screen moves money. The one write is
// `resolveDeliveryPayment` — recording what staff established happened between
// two parties who settled directly.
//
// Backed by SECURITY DEFINER RPCs that self-gate on is_admin(). Counterparty
// names come through those RPCs rather than a client-side `profiles` join,
// because `profiles` SELECT is deliberately hardened (20260703000300).

import { getSupabase } from '@/services/supabaseClient'
import { notifyCounterparty } from '@/services/notificationService'

function friendlyError(error, fallback) {
  const msg = String(error?.message || '')
  if (msg.includes('admin only')) return 'Admin access required.'
  return msg || fallback
}

export const FEEDSTOCK_FILTERS = [
  { value: 'disputed', label: 'Open disputes' },
  { value: 'awaiting_ack', label: 'Awaiting farmer confirmation' },
  { value: 'unpaid', label: 'Confirmed but unpaid' },
  { value: 'all', label: 'All deliveries' },
]

export const RESOLUTION_OPTIONS = [
  {
    value: 'paid_confirmed',
    label: 'Payment was made',
    hint: "Marks the delivery paid and records the farmer's side as confirmed.",
  },
  {
    value: 'unpaid_confirmed',
    label: 'Payment was NOT made',
    hint: "Reverses the buyer's claim: the delivery goes back to unpaid.",
  },
  {
    value: 'withdrawn',
    label: 'Report withdrawn',
    hint: 'The farmer no longer wishes to pursue it. Nothing else changes.',
  },
  { value: 'other', label: 'Other outcome', hint: 'Closed with a note. Nothing else changes.' },
]

/**
 * A delivery's payment state as ONE value, reading both sides of the record.
 *
 * The buyer's `payment_status` alone is an assertion; rendering it as the
 * platform's own conclusion is the #26 defect this whole surface exists to fix.
 *
 * @param {object} d a row from `admin_feedstock_deliveries`
 * @returns {{key:string, label:string, tone:'ok'|'warn'|'bad'|'muted'}}
 */
export function paymentState(d = {}) {
  if (d.farmer_payment_ack === 'disputed' && !d.payment_resolution) {
    return { key: 'disputed', label: 'Disputed by farmer', tone: 'bad' }
  }
  if (d.farmer_payment_ack === 'disputed' && d.payment_resolution) {
    // The farmer disputed again after staff closed it. The prior resolution
    // stays on the record; the row is open again.
    return { key: 'reopened', label: 'Reopened after resolution', tone: 'bad' }
  }
  if (d.payment_resolution) {
    return { key: 'resolved', label: 'Resolved by staff', tone: 'muted' }
  }
  if (d.farmer_payment_ack === 'confirmed') {
    return { key: 'agreed', label: 'Both parties agree', tone: 'ok' }
  }
  if (d.payment_status === 'paid') {
    return { key: 'claimed', label: 'Buyer claims paid', tone: 'warn' }
  }
  if (d.status === 'confirmed') {
    return { key: 'unpaid', label: 'Confirmed, unpaid', tone: 'warn' }
  }
  return { key: 'none', label: '—', tone: 'muted' }
}

/** Headline counts for the summary cards. */
export async function getFeedstockSummary() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Service unavailable. Please try again in a moment.')

  const { data, error } = await supabase.rpc('admin_feedstock_summary')
  if (error) throw new Error(friendlyError(error, 'Failed to load the feedstock summary.'))

  return {
    deliveryCount: Number(data?.delivery_count) || 0,
    pendingCount: Number(data?.pending_count) || 0,
    confirmedCount: Number(data?.confirmed_count) || 0,
    disputedOpen: Number(data?.disputed_open) || 0,
    disputedTotal: Number(data?.disputed_total) || 0,
    awaitingAck: Number(data?.awaiting_ack) || 0,
    recordedPaidValue: Number(data?.recorded_paid_value) || 0,
    unpaidValue: Number(data?.unpaid_value) || 0,
    rfqOpenCount: Number(data?.rfq_open_count) || 0,
    rfqCount: Number(data?.rfq_count) || 0,
  }
}

/**
 * Deliveries with both parties' names. Open disputes sort first regardless of
 * filter — the queue exists for them.
 *
 * @param {string} [filter] one of FEEDSTOCK_FILTERS
 */
export async function getFeedstockDeliveries(filter = 'disputed', limit = 100) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Service unavailable. Please try again in a moment.')

  const { data, error } = await supabase.rpc('admin_feedstock_deliveries', {
    p_filter: filter,
    p_limit: limit,
  })
  // Deliberately throws rather than returning []. An empty feedstock queue reads
  // as "no farmer is owed anything", which is exactly the wrong thing to tell an
  // administrator investigating whether one is.
  if (error) throw new Error(friendlyError(error, 'Failed to load feedstock deliveries.'))

  return data || []
}

/**
 * Record how a feedstock payment disagreement was settled off-platform.
 *
 * This is a RECORD, not a settlement: no funds are held, moved or released.
 * `paid_confirmed` and `unpaid_confirmed` bring the delivery row into line with
 * what staff established — including reversing a buyer's false "Paid", which is
 * the whole reason this escalation point had to exist.
 *
 * @param {object} delivery row from `admin_feedstock_deliveries`
 * @param {string} resolution one of RESOLUTION_OPTIONS
 * @param {string} note required — what was established
 */
export async function resolveDeliveryPayment(delivery, resolution, note) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Service unavailable. Please try again in a moment.')

  if (!String(note || '').trim()) {
    throw new Error('Record what was established before closing this.')
  }

  const { data, error } = await supabase.rpc('resolve_farmer_delivery_payment', {
    p_delivery_id: delivery.id,
    p_resolution: resolution,
    p_note: String(note).trim(),
  })
  if (error) throw new Error(friendlyError(error, 'Failed to record the resolution.'))

  // Both parties are told, not just the one who raised it — the outcome is a
  // finding about both of them.
  try {
    const label =
      RESOLUTION_OPTIONS.find((o) => o.value === resolution)?.label || 'reviewed by Carbonify'
    // An admin is not a party to the delivery, so they address both sides
    // explicitly; `counterparty` has no meaning for them.
    await notifyCounterparty('farmer_delivery', delivery.id, 'both_parties', {
      type: 'feedstock_payment_resolved',
      title: 'Feedstock payment record updated',
      message: `Carbonify reviewed the payment record for a delivery of ${delivery.quantity} ${delivery.unit}: ${label}.`,
      link: '/farmer',
      metadata: { delivery_id: delivery.id, resolution },
    })
  } catch (e) {
    console.warn('Resolution notify failed (non-fatal):', e?.message)
  }

  return data
}
