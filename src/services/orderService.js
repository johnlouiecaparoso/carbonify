/**
 * Buyer order status.
 *
 * `payment_intents` is the server-authoritative record of an intended payment —
 * it exists from the moment checkout starts, before any money moves. Receipts,
 * by contrast, only exist once a purchase *completes*. That meant a buyer whose
 * payment was pending, failed or expired saw nothing at all: no confirmation, no
 * error, no way to retry. This surfaces that record to the person who created it.
 *
 * No migration needed — the table already carries an owner-scoped RLS policy
 * ("Users read own payment intents"), so a plain select returns only your rows.
 */
import { getSupabase } from '@/services/supabaseClient'
import { getCurrentUserId } from '@/utils/authHelper'

/**
 * How each raw intent status reads to a buyer, and what they can do about it.
 * `tone` drives the badge colour; `terminal` marks states that will never change
 * on their own (so the UI can offer "try again" rather than "check back").
 */
export const ORDER_STATUS = {
  created: { label: 'Awaiting payment', tone: 'pending', terminal: false, canRetry: true },
  pending: { label: 'Payment processing', tone: 'pending', terminal: false, canRetry: false },
  paid: { label: 'Completed', tone: 'good', terminal: true, canRetry: false },
  failed: { label: 'Payment failed', tone: 'bad', terminal: true, canRetry: true },
  expired: { label: 'Checkout expired', tone: 'bad', terminal: true, canRetry: true },
  canceled: { label: 'Canceled', tone: 'muted', terminal: true, canRetry: true },
  refunded: { label: 'Refunded', tone: 'muted', terminal: true, canRetry: false },
}

export function describeOrderStatus(status) {
  return (
    ORDER_STATUS[status] || { label: status || 'Unknown', tone: 'muted', terminal: true, canRetry: false }
  )
}

/** True for orders the buyer started but never completed — worth nudging about. */
export function isUnfinished(order) {
  return order?.status === 'created' || order?.status === 'pending'
}

/**
 * The current user's orders, newest first.
 *
 * `listing_id` has no declared FK (the listing tables have known drift), so the
 * project title can't be embedded. Callers that want titles pass the marketplace
 * listings in and we join in memory — see `attachListingTitles`.
 */
export async function getMyOrders(limit = 50) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const uid = await getCurrentUserId()
  // No signed-in user genuinely means no orders — that is an answer, not a
  // failure. A failed QUERY is the case that must not render as one.
  if (!uid) return []

  const { data, error } = await supabase
    .from('payment_intents')
    .select(
      'id, purpose, listing_id, quantity, unit_amount, amount, currency, status, provider, provider_session_id, metadata, created_at, updated_at',
    )
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    // Not []: an unfinished order is money the buyer has started to spend.
    // "You have no orders" must never be the way a failed read presents itself.
    console.warn('Failed to load orders:', error.message)
    throw new Error(error.message || 'Failed to load your orders')
  }
  return data || []
}

/** Orders the buyer started but hasn't finished paying for. */
export async function getUnfinishedOrders(limit = 10) {
  const orders = await getMyOrders(limit)
  return orders.filter(isUnfinished)
}

/**
 * The intent behind one checkout session, for the caller who owns it.
 *
 * Used by the payment callback to ask the SERVER what kind of payment just
 * settled, instead of inferring it from a `localStorage` key written before the
 * redirect (P5). See `services/paymentPurpose.js` for why that mattered.
 *
 * Returns `null` — not a throw — when there is no such row or the read fails.
 * That is the opposite of `getMyOrders`, and deliberately so: there, `[]` would
 * masquerade as "you have no orders" and hide money the buyer has started to
 * spend. Here the caller has a documented fallback and the *payment itself is
 * already settled server-side*, so a failed lookup must degrade to the previous
 * behaviour rather than break a confirmation screen the buyer is waiting on.
 *
 * `.maybeSingle()`, not `.single()` — `.single()` raises an error for zero rows,
 * which is how `walletService.getTransactions` ended up unable to tell "no
 * wallet yet" from "the read failed".
 */
export async function getIntentBySession(sessionId) {
  if (!sessionId) return null
  const supabase = getSupabase()
  if (!supabase) return null
  const uid = await getCurrentUserId()
  if (!uid) return null

  const { data, error } = await supabase
    .from('payment_intents')
    .select('id, purpose, amount, currency, status, listing_id, quantity')
    .eq('provider_session_id', sessionId)
    .eq('user_id', uid)
    .maybeSingle()

  if (error) {
    console.warn('Could not read payment intent for session:', error.message)
    return null
  }
  return data || null
}

/**
 * Best-effort project titles, joined in memory from marketplace listings.
 * An order whose listing has since sold out or been delisted keeps its generic
 * label rather than disappearing — the buyer still paid for it.
 */
export function attachListingTitles(orders = [], listings = []) {
  const byId = new Map((listings || []).map((l) => [l.listing_id, l]))
  return (orders || []).map((order) => {
    const listing = order.listing_id ? byId.get(order.listing_id) : null
    return {
      ...order,
      projectTitle:
        listing?.project_title ||
        (order.purpose === 'wallet_topup' ? 'Wallet top-up' : 'Carbon credits'),
      projectId: listing?.project_id || null,
      listingAvailable: Boolean(listing),
    }
  })
}
