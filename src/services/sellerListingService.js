/**
 * Seller listing management — price, inventory, pause/relist.
 *
 * A developer's credits are auto-listed when their project is validated (the
 * activate_validated_project_trigger seeds the pool AND an active listing from
 * `estimated_credits` / `credit_price`). Until now that first price was final:
 * nothing in the UI could change it.
 *
 * Writes go through the `update_my_listing` RPC (20260721000400), never a direct
 * table UPDATE. The RPC owns the rules that matter — ownership via auth.uid(),
 * quantity clamped to the pool's credits_available, positive price, status
 * restricted to active/paused. {@link validateListingEdit} mirrors those rules
 * client-side purely so the form can object before a round trip; the RPC stays
 * authoritative.
 */
import { getSupabase } from '@/services/supabaseClient'

/** Listing statuses a seller may set. Anything else is provider/system-owned. */
export const SELLER_LISTING_STATUSES = ['active', 'paused']

/**
 * Client-side mirror of the RPC's guards, for immediate form feedback.
 *
 * @param {Object} edit
 * @param {number|string} [edit.pricePerCredit]
 * @param {number|string} [edit.quantity]
 * @param {string} [edit.status]
 * @param {number} [edit.creditsAvailable] - pool ceiling for quantity
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateListingEdit({
  pricePerCredit,
  quantity,
  status,
  creditsAvailable = 0,
} = {}) {
  const price = Number(pricePerCredit)
  if (!Number.isFinite(price) || price <= 0) {
    return { valid: false, error: 'Price per credit must be greater than zero.' }
  }

  const qty = Number(quantity)
  if (!Number.isFinite(qty) || qty < 0) {
    return { valid: false, error: 'Quantity cannot be negative.' }
  }

  const ceiling = Number(creditsAvailable) || 0
  if (qty > ceiling) {
    // The pool is the ceiling: offering more than exists would only fail after
    // the buyer has paid (process_marketplace_purchase re-checks the pool).
    return {
      valid: false,
      error: `You only have ${ceiling.toLocaleString('en-PH')} credit(s) available to sell.`,
    }
  }

  if (status && !SELLER_LISTING_STATUSES.includes(status)) {
    return { valid: false, error: 'Listing status must be active or paused.' }
  }

  return { valid: true, error: null }
}

/**
 * Flatten one joined credit_listings row into the shape the UI wants.
 * Exported for unit testing. Returns null for a row with no resolvable project.
 */
export function normalizeListingRow(row) {
  if (!row?.id) return null
  const pool = row.project_credits || null
  const project = pool?.projects || null
  const projectId = pool?.project_id || project?.id || null
  if (!projectId) return null

  return {
    id: row.id,
    projectId,
    projectTitle: project?.title || 'Untitled Project',
    status: row.status || 'active',
    pricePerCredit: Number(row.price_per_credit) || 0,
    quantity: Number(row.quantity) || 0,
    currency: row.currency || 'PHP',
    // The pool ceiling. A seller can offer at most this much for sale.
    creditsAvailable: Number(pool?.credits_available) || 0,
  }
}

/**
 * Index listings by project id. A project has at most one active listing in
 * practice, but a paused-then-revalidated project can carry a second row, so
 * prefer the active one and fall back to the largest quantity.
 *
 * Exported for unit testing.
 * @param {Array<Object>} listings - normalized rows
 * @returns {Object<string, Object>} projectId → listing
 */
export function indexListingsByProject(listings = []) {
  const byProject = {}
  for (const listing of listings) {
    if (!listing?.projectId) continue
    const prev = byProject[listing.projectId]
    if (!prev) {
      byProject[listing.projectId] = listing
      continue
    }
    const prevActive = prev.status === 'active'
    const nextActive = listing.status === 'active'
    if ((nextActive && !prevActive) || (nextActive === prevActive && listing.quantity > prev.quantity)) {
      byProject[listing.projectId] = listing
    }
  }
  return byProject
}

/**
 * Every listing the signed-in developer sells, including paused ones.
 * Degrades to [] rather than throwing — the dashboard must still render its
 * projects when listing data is unavailable.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function getMyListings() {
  const supabase = getSupabase()
  if (!supabase) return []

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('credit_listings')
    .select(
      `
      id,
      status,
      quantity,
      price_per_credit,
      currency,
      project_credit_id,
      project_credits:project_credits (
        id,
        project_id,
        credits_available,
        projects:projects ( id, title )
      )
    `,
    )
    .eq('seller_id', user.id)

  if (error) {
    console.warn('[sellerListings] unavailable:', error.message)
    return []
  }

  return (data || []).map(normalizeListingRow).filter(Boolean)
}

/**
 * Update one of the caller's own listings. Only the fields you pass change.
 *
 * @param {string} listingId
 * @param {Object} edit
 * @param {number} [edit.pricePerCredit]
 * @param {number} [edit.quantity]
 * @param {'active'|'paused'} [edit.status]
 * @returns {Promise<Object>} the updated listing fields from the RPC
 */
export async function updateMyListing(listingId, { pricePerCredit, quantity, status } = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  if (!listingId) throw new Error('Listing is required')

  const { data, error } = await supabase.rpc('update_my_listing', {
    p_listing_id: listingId,
    p_price_per_credit: pricePerCredit == null ? null : Number(pricePerCredit),
    p_quantity: quantity == null ? null : Number(quantity),
    p_status: status || null,
  })

  if (error) {
    throw new Error(error.message || 'Failed to update your listing')
  }
  return data
}
