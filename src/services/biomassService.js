import { getSupabase } from '@/services/supabaseClient'
import { createNotificationsForUsers } from '@/services/notificationService'

/**
 * Biomass Marketplace service (expansion feature #3).
 *
 * Suppliers list feedstock products; buyers submit a request-for-quotation (RFQ);
 * the supplier quotes; the buyer accepts/declines. Status transitions run through
 * SECURITY DEFINER RPCs (submit_biomass_quote / respond_biomass_quote /
 * close_biomass_rfq); everything else is direct RLS-scoped table access.
 *
 * Pure validation/estimation helpers are exported for unit testing.
 */

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────

/** Validate a supplier product listing. Returns an array of error strings ([] = ok). */
export function validateProductInput(p = {}) {
  const errors = []
  if (!p.product_type) errors.push('Product type is required')
  if (!p.title || !String(p.title).trim()) errors.push('A short title is required')
  if (!p.unit) errors.push('Unit is required')
  if (p.price_per_unit != null && p.price_per_unit !== '' && Number(p.price_per_unit) < 0) {
    errors.push('Price cannot be negative')
  }
  if (
    p.quantity_available != null &&
    p.quantity_available !== '' &&
    Number(p.quantity_available) < 0
  ) {
    errors.push('Quantity available cannot be negative')
  }
  return errors
}

/** Validate a buyer RFQ. Returns an array of error strings ([] = ok). */
export function validateRfqInput(p = {}) {
  const errors = []
  const qty = Number(p.quantity)
  if (!p.quantity || isNaN(qty) || qty <= 0) errors.push('Enter a quantity greater than zero')
  if (!p.unit) errors.push('Unit is required')
  if (!p.seller_id) errors.push('A supplier is required')
  return errors
}

/** Estimated RFQ total from a per-unit price × quantity (2dp), or null if unpriced. */
export function estimateRfqTotal(pricePerUnit, quantity) {
  const price = Number(pricePerUnit)
  const qty = Number(quantity)
  if (!price || !qty || price < 0 || qty <= 0) return null
  return Math.round(price * qty * 100) / 100
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

/** Public browse: active feedstock products, optionally filtered by type/search. */
export async function getBiomassProducts({ type = '', search = '' } = {}) {
  const supabase = getSupabase()
  if (!supabase) return []

  let query = supabase
    .from('biomass_products')
    .select(
      'id, seller_id, product_type, title, description, unit, price_per_unit, quantity_available, location, region, currency, status, created_at',
    )
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(200)

  if (type) query = query.eq('product_type', type)

  const { data, error } = await query
  // Throw: BiomassMarketplaceView already has a loadError branch waiting for
  // this, and "no feedstock is for sale" is a very different message to a buyer
  // than "we couldn't reach the listings".
  if (error) throw new Error(error.message || 'Could not load feedstock listings')
  let rows = data || []
  const q = String(search || '').trim().toLowerCase()
  if (q) {
    rows = rows.filter((r) =>
      [r.title, r.description, r.location, r.region].some((f) =>
        String(f || '').toLowerCase().includes(q),
      ),
    )
  }
  return rows
}

/** The signed-in supplier's own products (any status). */
export async function getMyBiomassProducts() {
  const { supabase, user } = await currentUser()
  if (!supabase || !user) return []
  const { data, error } = await supabase
    .from('biomass_products')
    .select('*')
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false })
  // Same reasoning as getMyParcels in farmerService: a supplier shown an empty
  // list may re-list feedstock they already have up, and BiomassSellView
  // already wraps this call in a try/catch with a loadError branch.
  if (error) throw new Error(error.message || 'Could not load your listings')
  return data || []
}

/** Create a feedstock product listing owned by the signed-in supplier. */
export async function createBiomassProduct(payload = {}) {
  const errors = validateProductInput(payload)
  if (errors.length) throw new Error(errors[0])
  const { supabase, user } = await currentUser()
  if (!supabase || !user) throw new Error('Not authenticated')

  const row = {
    seller_id: user.id,
    product_type: payload.product_type,
    title: String(payload.title).trim(),
    description: payload.description ? String(payload.description).trim() : null,
    unit: payload.unit || 'tonnes',
    price_per_unit:
      payload.price_per_unit != null && payload.price_per_unit !== ''
        ? Number(payload.price_per_unit)
        : null,
    quantity_available:
      payload.quantity_available != null && payload.quantity_available !== ''
        ? Number(payload.quantity_available)
        : null,
    location: payload.location ? String(payload.location).trim() : null,
    region: payload.region ? String(payload.region).trim() : null,
    currency: payload.currency || 'PHP',
    status: 'active',
  }
  const { data, error } = await supabase.from('biomass_products').insert(row).select().single()
  if (error) throw new Error(error.message || 'Failed to list product')
  return data
}

/** Flip a product's status (active / inactive / sold_out). Owner-scoped by RLS. */
export async function setBiomassProductStatus(id, status) {
  const { supabase, user } = await currentUser()
  if (!supabase || !user) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('biomass_products')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message || 'Failed to update product')
  return data
}

/**
 * Buyer submits an RFQ. `product` is the biomass_products row being requested
 * (its seller becomes the RFQ's supplier). Notifies the supplier best-effort.
 */
export async function submitRfq({ product, quantity, unit, delivery_location, needed_by, message }) {
  const { supabase, user } = await currentUser()
  if (!supabase || !user) throw new Error('Not authenticated')
  if (!product?.seller_id) throw new Error('A supplier is required')

  const payload = {
    quantity: Number(quantity),
    unit: unit || product.unit || 'tonnes',
    seller_id: product.seller_id,
  }
  const errors = validateRfqInput(payload)
  if (errors.length) throw new Error(errors[0])
  if (product.seller_id === user.id) throw new Error('You cannot request a quote on your own listing')

  const row = {
    product_id: product.id || null,
    buyer_id: user.id,
    seller_id: product.seller_id,
    product_type: product.product_type || null,
    product_title: product.title || null,
    quantity: Number(quantity),
    unit: payload.unit,
    delivery_location: delivery_location ? String(delivery_location).trim() : null,
    needed_by: needed_by || null,
    message: message ? String(message).trim() : null,
    status: 'open',
  }
  const { data, error } = await supabase.from('biomass_rfqs').insert(row).select().single()
  if (error) throw new Error(error.message || 'Failed to submit request')

  try {
    await createNotificationsForUsers([product.seller_id], {
      type: 'biomass_rfq_received',
      title: 'New feedstock quote request',
      message: `A buyer requested a quote for ${row.quantity} ${row.unit} of ${row.product_title || 'biomass'}.`,
      link: '/biomass/rfqs',
      metadata: { rfq_id: data.id, product_id: row.product_id },
    })
  } catch (e) {
    console.warn('RFQ notify failed (non-fatal):', e?.message)
  }
  return data
}

/** RFQs the signed-in user submitted as a buyer. */
export async function getMyBuyerRfqs() {
  const { supabase, user } = await currentUser()
  if (!supabase || !user) return []
  const { data, error } = await supabase
    .from('biomass_rfqs')
    .select('*')
    .eq('buyer_id', user.id)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message || 'Could not load your requests')
  return data || []
}

/** RFQs the signed-in user received as a supplier. */
export async function getMySellerRfqs() {
  const { supabase, user } = await currentUser()
  if (!supabase || !user) return []
  const { data, error } = await supabase
    .from('biomass_rfqs')
    .select('*')
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false })
  // Income-critical for a supplier: swallowing this reported "no buyer has
  // requested a quote from you" when the query had simply failed.
  if (error) throw new Error(error.message || 'Could not load quote requests')
  return data || []
}

/** Supplier answers an RFQ with a per-unit price. Notifies the buyer. */
export async function submitQuote(rfq, pricePerUnit, message) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const { data, error } = await supabase.rpc('submit_biomass_quote', {
    p_rfq_id: rfq.id,
    p_price_per_unit: Number(pricePerUnit),
    p_message: message || null,
  })
  if (error) throw new Error(error.message || 'Failed to submit quote')

  try {
    await createNotificationsForUsers([rfq.buyer_id], {
      type: 'biomass_rfq_quoted',
      title: 'You received a feedstock quote',
      message: `Your request for ${rfq.quantity} ${rfq.unit} of ${rfq.product_title || 'biomass'} was quoted.`,
      link: '/biomass/rfqs',
      metadata: { rfq_id: rfq.id },
    })
  } catch (e) {
    console.warn('Quote notify failed (non-fatal):', e?.message)
  }
  return data
}

/** Buyer accepts or declines a supplier's quote. Notifies the supplier. */
export async function respondToQuote(rfq, accept) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const { data, error } = await supabase.rpc('respond_biomass_quote', {
    p_rfq_id: rfq.id,
    p_accept: !!accept,
  })
  if (error) throw new Error(error.message || 'Failed to respond to quote')

  try {
    await createNotificationsForUsers([rfq.seller_id], {
      type: 'biomass_rfq_response',
      title: accept ? 'Your quote was accepted' : 'Your quote was declined',
      message: `The buyer ${accept ? 'accepted' : 'declined'} your quote for ${rfq.product_title || 'biomass'}.`,
      link: '/biomass/rfqs',
      metadata: { rfq_id: rfq.id, accepted: !!accept },
    })
  } catch (e) {
    console.warn('Response notify failed (non-fatal):', e?.message)
  }
  return data
}

/** Buyer closes/cancels their own RFQ. */
export async function closeRfq(rfqId) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const { data, error } = await supabase.rpc('close_biomass_rfq', { p_rfq_id: rfqId })
  if (error) throw new Error(error.message || 'Failed to close request')
  return data
}
