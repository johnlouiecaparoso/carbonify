import { getSupabase } from '@/services/supabaseClient'
import { notifyCounterparty } from '@/services/notificationService'
import { uploadProjectDocument } from '@/services/storageService'

/**
 * Farmer Portal service (expansion feature #6).
 *
 * A farmer registers plantation parcels (`farm_parcels`), then logs feedstock
 * deliveries (`farmer_deliveries`) against an ACCEPTED biomass RFQ. The buyer
 * confirms receipt and marks the delivery paid.
 *
 * **Carbonify is not the payment rail for feedstock** (decided 2026-07-28,
 * DEFERRED_BACKLOG.md #26). Buyer and farmer settle directly — cash, GCash, bank
 * transfer — and Carbonify records that they did. Payment status here never
 * touches `ledger_entries` / `escrow_holds` / `payout_requests`, so the proven
 * money path is unaffected.
 *
 * Because that record is the *entire* product on this path, it is **two-sided**:
 * `payment_status` is the buyer's assertion, `farmer_payment_ack` is the farmer's
 * answer to it (confirm or dispute), and `payment_resolution` is how staff closed
 * a disagreement. Never render the buyer's assertion alone as settled fact.
 *
 * Every delivery write goes through a SECURITY DEFINER RPC (record_farmer_delivery
 * / confirm_farmer_delivery / mark_farmer_delivery_paid /
 * acknowledge_farmer_delivery_payment / resolve_farmer_delivery_payment) which
 * self-guards on auth.uid(); parcels are plain RLS-scoped table access.
 *
 * Pure validation/aggregation helpers are exported for unit testing.
 */

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────

/** Validate a plantation parcel. Returns an array of error strings ([] = ok). */
export function validateParcelInput(p = {}) {
  const errors = []
  if (!p.name || !String(p.name).trim()) errors.push('A parcel name is required')
  if (!p.crop_type) errors.push('Crop type is required')
  if (p.area_hectares != null && p.area_hectares !== '' && Number(p.area_hectares) < 0) {
    errors.push('Area cannot be negative')
  }
  if (
    p.expected_yield_tonnes != null &&
    p.expected_yield_tonnes !== '' &&
    Number(p.expected_yield_tonnes) < 0
  ) {
    errors.push('Expected yield cannot be negative')
  }
  if (p.latitude != null && p.latitude !== '' && Math.abs(Number(p.latitude)) > 90) {
    errors.push('Latitude must be between -90 and 90')
  }
  if (p.longitude != null && p.longitude !== '' && Math.abs(Number(p.longitude)) > 180) {
    errors.push('Longitude must be between -180 and 180')
  }
  return errors
}

/** Validate a delivery record. Returns an array of error strings ([] = ok). */
export function validateDeliveryInput(p = {}) {
  const errors = []
  const qty = Number(p.quantity)
  if (!p.rfq_id) errors.push('An accepted quote is required')
  if (!p.quantity || isNaN(qty) || qty <= 0) errors.push('Enter a delivered quantity greater than zero')
  if (p.price_per_unit != null && p.price_per_unit !== '' && Number(p.price_per_unit) < 0) {
    errors.push('Price cannot be negative')
  }
  return errors
}

/** Delivery value from a per-unit price × quantity (2dp), or null if unpriced. */
export function estimateDeliveryTotal(pricePerUnit, quantity) {
  const price = Number(pricePerUnit)
  const qty = Number(quantity)
  if (!price || !qty || price < 0 || qty <= 0) return null
  return Math.round(price * qty * 100) / 100
}

const num = (v) => {
  const n = Number(v)
  return isFinite(n) ? n : 0
}

/** Units we can express in tonnes. Sacks/bales/m³ need bulk density we don't have. */
const TONNE_FACTORS = { tonnes: 1, kg: 0.001 }

/** A delivery's mass in tonnes, or null when its unit isn't mass-denominated. */
export function deliveryTonnes(delivery = {}) {
  const factor = TONNE_FACTORS[String(delivery.unit || '').toLowerCase()]
  if (factor == null) return null
  const qty = Number(delivery.quantity)
  return isFinite(qty) && qty > 0 ? qty * factor : null
}

/**
 * The farmer's attributed share of a project's verified carbon.
 *
 * Pro-rata by delivered mass: `verified × farmerTonnes / projectTonnes`. Shares
 * across all farmers sum to exactly 1, so nobody is attributed carbon the project
 * never verified. See docs/FARMER_CARBON_ATTRIBUTION.md for why this rule and not
 * a per-delivery carbon factor.
 *
 * Returns zeros when the denominator is zero or the inputs are nonsense, rather
 * than NaN or Infinity — a farmer must never be shown "NaN tCO₂e".
 *
 * @returns {{share:number, attributed:number}}
 */
export function attributeCarbon(farmerTonnes, projectTonnes, verifiedTco2e) {
  const farmer = num(farmerTonnes)
  const project = num(projectTonnes)
  const verified = num(verifiedTco2e)
  if (farmer <= 0 || project <= 0) return { share: 0, attributed: 0 }

  // A farmer cannot have supplied more than the project received; clamp rather
  // than emit a share above 1, which would over-attribute verified carbon.
  const share = Math.min(1, farmer / project)
  return {
    share: Math.round(share * 1e6) / 1e6,
    attributed: Math.round(Math.max(0, verified) * share * 1000) / 1000,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Plantation performance: what each parcel actually delivered, against what it
 * was expected to yield.
 *
 * `expected_yield_tonnes` is an ANNUAL figure, so it is compared against the
 * TRAILING 12 MONTHS of deliveries — not lifetime. Comparing a three-year-old
 * parcel's lifetime output against one year's expectation would show 300%
 * performance and mean nothing.
 *
 * Only confirmed, mass-denominated deliveries count (see `deliveryTonnes`).
 * A parcel with no expected yield reports its actuals with `performance: null`
 * rather than a fabricated ratio.
 *
 * @param {Array} parcels rows from `farm_parcels`
 * @param {Array} deliveries rows from `farmer_deliveries` (must carry `parcel_id`)
 * @param {number} [now] injectable clock for tests
 * @returns {Array<{parcelId:string, name:string, cropType:string, expectedAnnual:number|null,
 *   deliveredTrailingYear:number, deliveredLifetime:number, performance:number|null,
 *   deliveryCount:number, lastDeliveredOn:string|null, status:string}>}
 */
export function aggregateParcelPerformance(parcels = [], deliveries = [], now = Date.now()) {
  const parcelRows = Array.isArray(parcels) ? parcels : []
  const deliveryRows = Array.isArray(deliveries) ? deliveries : []
  const cutoff = now - 365 * DAY_MS

  const byParcel = new Map()
  for (const d of deliveryRows) {
    if (d?.status !== 'confirmed' || !d.parcel_id) continue
    const tonnes = deliveryTonnes(d)
    if (tonnes == null) continue // non-mass unit: no defensible tonnage

    const cur = byParcel.get(d.parcel_id) || {
      trailing: 0,
      lifetime: 0,
      count: 0,
      lastDeliveredOn: null,
    }
    cur.lifetime += tonnes
    cur.count += 1
    const at = d.delivered_on ? new Date(d.delivered_on).getTime() : null
    if (at != null && !isNaN(at) && at >= cutoff) cur.trailing += tonnes
    if (d.delivered_on && (!cur.lastDeliveredOn || d.delivered_on > cur.lastDeliveredOn)) {
      cur.lastDeliveredOn = d.delivered_on
    }
    byParcel.set(d.parcel_id, cur)
  }

  const round2 = (n) => Math.round(n * 100) / 100

  return parcelRows.map((p) => {
    const agg = byParcel.get(p.id) || { trailing: 0, lifetime: 0, count: 0, lastDeliveredOn: null }
    const expected = num(p?.expected_yield_tonnes)
    return {
      parcelId: p.id,
      name: p.name || 'Parcel',
      cropType: p.crop_type || '',
      status: p.status || 'active',
      expectedAnnual: expected > 0 ? round2(expected) : null,
      deliveredTrailingYear: round2(agg.trailing),
      deliveredLifetime: round2(agg.lifetime),
      // Ratio of a year's actual to a year's expectation. Null — not zero, and
      // not 100% — when nothing was expected: an absent target isn't a met one.
      performance: expected > 0 ? Math.round((agg.trailing / expected) * 1e4) / 1e4 : null,
      deliveryCount: agg.count,
      lastDeliveredOn: agg.lastDeliveredOn,
    }
  })
}

/**
 * Deliveries that cannot be attributed, and why. The farmer is told this rather
 * than left to wonder why their tonnage doesn't match their carbon.
 *
 * @returns {{unattributedProject:number, nonMassUnits:number}}
 */
export function unattributableDeliveries(deliveries = []) {
  const rows = Array.isArray(deliveries) ? deliveries : []
  let unattributedProject = 0
  let nonMassUnits = 0
  for (const d of rows) {
    if (d?.status !== 'confirmed') continue
    if (deliveryTonnes(d) == null) nonMassUnits += 1
    else if (!d.project_id) unattributedProject += 1
  }
  return { unattributedProject, nonMassUnits }
}

/**
 * Roll a farmer's deliveries up into the portal's headline numbers.
 *
 * Rejected deliveries are excluded from every money figure — they were never
 * accepted, so they are neither earned nor owed. `amountOwed` is the money a
 * buyer has confirmed receipt for but not yet paid.
 *
 * `totalEarned` and `paidCount` follow the **buyer's assertion**
 * (`payment_status`), because that is what the buyer has claimed and what the
 * farmer is being asked about. `awaitingAck` counts assertions the farmer has not
 * answered yet and `disputedCount` those they have contradicted — surface both
 * next to the money, or the page states a total the farmer may not agree with.
 *
 * @param {Array} deliveries rows from `farmer_deliveries`
 * @returns {{deliveryCount:number, pendingCount:number, confirmedCount:number,
 *   rejectedCount:number, quantityDelivered:number, quantityPending:number,
 *   totalEarned:number, amountOwed:number, paidCount:number,
 *   awaitingAck:number, disputedCount:number}}
 */
export function aggregateFarmerDeliveries(deliveries = []) {
  const rows = Array.isArray(deliveries) ? deliveries : []
  const out = {
    deliveryCount: rows.length,
    pendingCount: 0,
    confirmedCount: 0,
    rejectedCount: 0,
    quantityDelivered: 0,
    quantityPending: 0,
    totalEarned: 0,
    amountOwed: 0,
    paidCount: 0,
    awaitingAck: 0,
    disputedCount: 0,
  }

  for (const d of rows) {
    const qty = num(d?.quantity)
    const amount = num(d?.total_amount)

    if (d?.status === 'rejected') {
      out.rejectedCount += 1
      continue
    }
    if (d?.status === 'pending') {
      out.pendingCount += 1
      out.quantityPending += qty
      continue
    }
    if (d?.status === 'confirmed') {
      out.confirmedCount += 1
      out.quantityDelivered += qty
      if (d?.payment_status === 'paid') {
        out.totalEarned += amount
        out.paidCount += 1
        if (d?.farmer_payment_ack !== 'confirmed' && d?.farmer_payment_ack !== 'disputed') {
          out.awaitingAck += 1
        }
      } else {
        out.amountOwed += amount
      }
      // A dispute counts on either side of the paid/unpaid split: "you said you
      // paid me and did not" and "you never paid me at all" are both disputes.
      if (d?.farmer_payment_ack === 'disputed') out.disputedCount += 1
    }
  }

  // Guard against float drift accumulating across many rows.
  out.quantityDelivered = Math.round(out.quantityDelivered * 100) / 100
  out.quantityPending = Math.round(out.quantityPending * 100) / 100
  out.totalEarned = Math.round(out.totalEarned * 100) / 100
  out.amountOwed = Math.round(out.amountOwed * 100) / 100
  return out
}

/**
 * Roll a farmer's parcels up into plantation totals.
 * @param {Array} parcels rows from `farm_parcels`
 * @returns {{parcelCount:number, activeCount:number, totalHectares:number, totalExpectedYield:number}}
 */
export function aggregateParcels(parcels = []) {
  const rows = Array.isArray(parcels) ? parcels : []
  let totalHectares = 0
  let totalExpectedYield = 0
  let activeCount = 0

  for (const p of rows) {
    if (p?.status === 'active') activeCount += 1
    if (p?.status !== 'retired') {
      totalHectares += num(p?.area_hectares)
      totalExpectedYield += num(p?.expected_yield_tonnes)
    }
  }

  return {
    parcelCount: rows.length,
    activeCount,
    totalHectares: Math.round(totalHectares * 100) / 100,
    totalExpectedYield: Math.round(totalExpectedYield * 100) / 100,
  }
}

// ── Data access ────────────────────────────────────────────────────────────

async function currentUser() {
  const supabase = getSupabase()
  if (!supabase) return { supabase: null, user: null }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user: user || null }
}

/** The signed-in farmer's plantation parcels. */
export async function getMyParcels() {
  const { supabase, user } = await currentUser()
  if (!supabase || !user) return []
  const { data, error } = await supabase
    .from('farm_parcels')
    .select('*')
    .eq('farmer_id', user.id)
    .order('created_at', { ascending: false })
  // Throw rather than returning []. An empty array is indistinguishable from
  // "you have registered no parcels", and a farmer shown an empty farm may
  // reasonably re-register land they already have, creating duplicates.
  if (error) throw new Error(error.message || 'Could not load your parcels')
  return data || []
}

const numOrNull = (v) => (v != null && v !== '' ? Number(v) : null)
const textOrNull = (v) => (v ? String(v).trim() : null)

/** Register a plantation parcel owned by the signed-in farmer. */
export async function createParcel(payload = {}) {
  const errors = validateParcelInput(payload)
  if (errors.length) throw new Error(errors[0])
  const { supabase, user } = await currentUser()
  if (!supabase || !user) throw new Error('Not authenticated')

  const row = {
    farmer_id: user.id,
    name: String(payload.name).trim(),
    crop_type: payload.crop_type,
    area_hectares: numOrNull(payload.area_hectares),
    expected_yield_tonnes: numOrNull(payload.expected_yield_tonnes),
    location: textOrNull(payload.location),
    region: textOrNull(payload.region),
    latitude: numOrNull(payload.latitude),
    longitude: numOrNull(payload.longitude),
    planted_on: payload.planted_on || null,
    notes: textOrNull(payload.notes),
    status: payload.status || 'active',
  }
  const { data, error } = await supabase.from('farm_parcels').insert(row).select().single()
  if (error) throw new Error(error.message || 'Failed to register parcel')
  return data
}

/** Flip a parcel's status (active / fallow / retired). Owner-scoped by RLS. */
export async function setParcelStatus(id, status) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const { data, error } = await supabase
    .from('farm_parcels')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message || 'Failed to update parcel')
  return data
}

/** Delete a parcel. Owner-scoped by RLS. */
export async function deleteParcel(id) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const { error } = await supabase.from('farm_parcels').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Failed to delete parcel')
  return true
}

/**
 * Accepted RFQs the signed-in farmer is the supplier on — these are the only
 * requests a delivery can be recorded against.
 */
export async function getMyAcceptedRfqs() {
  const { supabase, user } = await currentUser()
  if (!supabase || !user) return []
  const { data, error } = await supabase
    .from('biomass_rfqs')
    .select(
      'id, buyer_id, product_type, product_title, quantity, unit, quoted_price_per_unit, quoted_total, delivery_location, needed_by, status, created_at',
    )
    .eq('seller_id', user.id)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
  // The sharpest of the three to swallow: this list is what the "Record
  // delivery" action is driven from, so returning [] on failure told a farmer
  // who had an accepted order that they had none, and removed the only way to
  // log the delivery they are owed money for.
  if (error) throw new Error(error.message || 'Could not load your accepted quotes')
  return data || []
}

/** Deliveries the signed-in farmer has logged. */
export async function getMyDeliveries() {
  const { supabase, user } = await currentUser()
  if (!supabase || !user) return []
  const { data, error } = await supabase
    .from('farmer_deliveries')
    .select('*')
    .eq('farmer_id', user.id)
    .order('created_at', { ascending: false })
  // Deliveries drive the earnings summary, so a swallowed failure here did not
  // just hide history — it reported the farmer's total paid and outstanding as
  // PHP 0.00.
  if (error) throw new Error(error.message || 'Could not load your deliveries')
  return data || []
}

/** Deliveries awaiting the signed-in buyer's confirmation / payment. */
export async function getIncomingDeliveries() {
  const { supabase, user } = await currentUser()
  if (!supabase || !user) return []
  const { data, error } = await supabase
    .from('farmer_deliveries')
    .select('*')
    .eq('buyer_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message || 'Could not load incoming deliveries')
  return data || []
}

/**
 * The signed-in farmer's estimated carbon participation, per project.
 *
 * Computed server-side by `farmer_carbon_participation()` so the farmer never
 * needs read access to `verified_emission_reductions` or to other farmers'
 * deliveries. Degrades to [] when migration #31 isn't applied — the portal then
 * simply doesn't show the section, rather than erroring.
 */
export async function getMyCarbonParticipation() {
  const supabase = getSupabase()
  if (!supabase) return []
  try {
    const { data, error } = await supabase.rpc('farmer_carbon_participation')
    if (error) {
      console.warn('[farmer] carbon participation unavailable:', error.message)
      return []
    }
    return (data || []).map((r) => ({
      projectId: r.project_id,
      projectTitle: r.project_title,
      farmerTonnes: Number(r.farmer_tonnes) || 0,
      projectTonnes: Number(r.project_tonnes) || 0,
      share: Number(r.share) || 0,
      projectVerifiedTco2e: Number(r.project_verified_tco2e) || 0,
      attributedTco2e: Number(r.attributed_tco2e) || 0,
    }))
  } catch (err) {
    console.warn('[farmer] carbon participation threw:', err?.message)
    return []
  }
}

/**
 * Upload a delivery proof photo/receipt to the private `project-documents`
 * bucket. Returns `{ path, name }` for storing in `proof_docs`.
 */
export async function uploadDeliveryProof(file) {
  const { user } = await currentUser()
  if (!user) throw new Error('Not authenticated')
  const path = await uploadProjectDocument(file, user.id, 'delivery_proof')
  return { path, name: file?.name || 'proof' }
}

/** Farmer logs a delivery against an accepted RFQ. Notifies the buyer. */
export async function recordDelivery({
  rfq,
  quantity,
  unit,
  delivered_on,
  parcel_id,
  price_per_unit,
  proof_docs,
  note,
}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')

  const errors = validateDeliveryInput({ rfq_id: rfq?.id, quantity, price_per_unit })
  if (errors.length) throw new Error(errors[0])

  const { data, error } = await supabase.rpc('record_farmer_delivery', {
    p_rfq_id: rfq.id,
    p_quantity: Number(quantity),
    p_unit: unit || null,
    p_delivered_on: delivered_on || null,
    p_parcel_id: parcel_id || null,
    p_price_per_unit: numOrNull(price_per_unit),
    p_proof_docs: proof_docs || [],
    p_note: note || null,
  })
  if (error) throw new Error(error.message || 'Failed to record delivery')

  try {
    await notifyCounterparty('biomass_rfq', rfq.id, 'counterparty', {
      type: 'farmer_delivery_recorded',
      title: 'Feedstock delivery logged',
      message: `A supplier logged a delivery of ${Number(quantity)} ${unit || rfq.unit || 'tonnes'} of ${rfq.product_title || 'biomass'}. Confirm receipt to proceed.`,
      link: '/biomass/rfqs',
      metadata: { rfq_id: rfq.id, delivery_id: data?.id },
    })
  } catch (e) {
    console.warn('Delivery notify failed (non-fatal):', e?.message)
  }
  return data
}

/**
 * Buyer confirms or rejects receipt of a delivery. Notifies the farmer.
 *
 * `projectId` names the project this feedstock fed — the link that makes carbon
 * attribution possible. Optional: a delivery with no project simply can't be
 * attributed, and the farmer is told so rather than being credited by guesswork.
 */
export async function confirmDelivery(delivery, accept, note, projectId = null) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const { data, error } = await supabase.rpc('confirm_farmer_delivery', {
    p_delivery_id: delivery.id,
    p_accept: !!accept,
    p_note: note || null,
    p_project_id: projectId || null,
  })
  if (error) throw new Error(error.message || 'Failed to update delivery')

  try {
    await notifyCounterparty('farmer_delivery', delivery.id, 'counterparty', {
      type: 'farmer_delivery_reviewed',
      title: accept ? 'Delivery confirmed' : 'Delivery rejected',
      message: `The buyer ${accept ? 'confirmed' : 'rejected'} your delivery of ${delivery.quantity} ${delivery.unit}.`,
      link: '/farmer',
      metadata: { delivery_id: delivery.id, accepted: !!accept },
    })
  } catch (e) {
    console.warn('Delivery review notify failed (non-fatal):', e?.message)
  }
  return data
}

/**
 * Buyer records that they settled a confirmed delivery off-platform. Notifies
 * the farmer — as an assertion awaiting their answer, not as a settled fact.
 *
 * Carbonify moves no money here. See the module header and #26.
 */
export async function markDeliveryPaid(delivery, reference) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const { data, error } = await supabase.rpc('mark_farmer_delivery_paid', {
    p_delivery_id: delivery.id,
    p_reference: reference || null,
  })
  if (error) throw new Error(error.message || 'Failed to record payment')

  try {
    await notifyCounterparty('farmer_delivery', delivery.id, 'counterparty', {
      type: 'farmer_delivery_paid',
      title: 'Buyer says they paid you',
      message:
        `The buyer recorded that they paid you for your delivery of ` +
        `${delivery.quantity} ${delivery.unit}. Carbonify does not hold or ` +
        `transfer this money — please confirm you received it, or say if you did not.`,
      link: '/farmer',
      metadata: { delivery_id: delivery.id },
    })
  } catch (e) {
    console.warn('Payment notify failed (non-fatal):', e?.message)
  }
  return data
}

/**
 * The farmer answers the buyer's payment assertion: confirm receipt, or dispute.
 *
 * Usable in both failure modes — "you said you paid me and you did not" and "you
 * confirmed my delivery and never paid at all". A dispute must carry a reason
 * (the RPC enforces it too) and notifies the buyer plus admins, because on a
 * records-layer product an unanswered dispute has nowhere else to go.
 *
 * @param {object} delivery the `farmer_deliveries` row
 * @param {boolean} confirm true = money received, false = dispute
 * @param {string} [note] required when disputing
 */
export async function acknowledgeDeliveryPayment(delivery, confirm, note = '') {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')

  if (!confirm && !String(note || '').trim()) {
    throw new Error('Please describe what happened so this can be looked into')
  }

  const { data, error } = await supabase.rpc('acknowledge_farmer_delivery_payment', {
    p_delivery_id: delivery.id,
    p_confirm: !!confirm,
    p_note: String(note || '').trim() || null,
  })
  if (error) throw new Error(error.message || 'Failed to record your response')

  const qty = `${delivery.quantity} ${delivery.unit}`
  try {
    if (confirm) {
      await notifyCounterparty('farmer_delivery', delivery.id, 'counterparty', {
        type: 'farmer_payment_confirmed',
        title: 'Farmer confirmed your payment',
        message: `The farmer confirmed they received payment for the delivery of ${qty}.`,
        link: '/biomass/buy',
        metadata: { delivery_id: delivery.id },
      })
    } else {
      // The escalation point (#29). These are now genuinely separate: the
      // comment used to say a failure to reach the buyer could not silence
      // staff, while both sat in ONE try block, so it could. Staff first --
      // if only one of the two can land, it should be the one that gets a
      // human involved.
      try {
        await notifyCounterparty('farmer_delivery', delivery.id, 'admins', {
          type: 'farmer_payment_disputed',
          title: 'Feedstock payment disputed',
          message: `A farmer says they have not been paid for a confirmed delivery of ${qty}.`,
          link: '/admin/feedstock',
          metadata: { delivery_id: delivery.id },
        })
      } catch (e) {
        console.warn('Dispute escalation notify failed (non-fatal):', e?.message)
      }

      await notifyCounterparty('farmer_delivery', delivery.id, 'counterparty', {
        type: 'farmer_payment_disputed',
        title: 'Farmer disputes a payment record',
        message: `The farmer says they have not been paid for the delivery of ${qty}.`,
        link: '/biomass/buy',
        metadata: { delivery_id: delivery.id },
      })
    }
  } catch (e) {
    console.warn('Payment acknowledgement notify failed (non-fatal):', e?.message)
  }
  return data
}
