/**
 * Buyer watchlist — save/follow marketplace listings.
 *
 * Keyed on the marketplace listing id (the `listing_id` field returned by
 * marketplaceService.getMarketplaceListings). RLS scopes every row to its
 * owner, so these calls never need to pass a user id for reads.
 */
import { getSupabase } from '@/services/supabaseClient'
import { getCurrentUserId } from '@/utils/authHelper'
import { createNotificationsForUsers } from '@/services/notificationService'

/**
 * A drop has to be worth interrupting someone for. Below this, price noise on a
 * ₱500 credit would fire an alert for a ₱5 move.
 */
export const MIN_DROP_PERCENT = 5

/** Full watchlist rows for the current user (newest first). */
export async function getMyWatchlist() {
  const supabase = getSupabase()
  if (!supabase) return []
  const uid = await getCurrentUserId()
  if (!uid) return []
  const { data, error } = await supabase
    .from('watchlist')
    .select(
      'id, listing_id, project_id, created_at, price_at_save, notify_on_drop, last_alerted_price, last_alerted_at',
    )
    .eq('user_id', uid)
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('Failed to load watchlist:', error.message)
    return []
  }
  return data || []
}

/** Set of watched listing ids — handy for marking cards in a list view. */
export async function getMyWatchlistIds() {
  const rows = await getMyWatchlist()
  return new Set(rows.map((r) => r.listing_id))
}

/**
 * Add a listing to the watchlist (idempotent on the unique constraint).
 *
 * `pricePerCredit` becomes the baseline a future price drop is measured against
 * — without it the row can be saved but never alerted on.
 */
export async function addToWatchlist({ listingId, projectId = null, pricePerCredit = null }) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  if (!listingId) throw new Error('listingId is required')
  const uid = await getCurrentUserId()
  if (!uid) throw new Error('You must be signed in to save listings.')

  const price = Number(pricePerCredit)
  const { error } = await supabase.from('watchlist').upsert(
    {
      user_id: uid,
      listing_id: listingId,
      project_id: projectId,
      price_at_save: Number.isFinite(price) && price > 0 ? price : null,
    },
    { onConflict: 'user_id,listing_id', ignoreDuplicates: true },
  )
  if (error) throw new Error(error.message || 'Failed to save to watchlist')
  return true
}

/**
 * Decide whether a watched row deserves a price-drop alert right now.
 * Pure, so the thresholds and the re-alert rule are testable without a database.
 *
 * @param {{price_at_save?:number, notify_on_drop?:boolean, last_alerted_price?:number}} row
 * @param {{price_per_credit?:number}|null} listing current listing, or null if delisted
 * @returns {{alert:boolean, dropPercent:number, currentPrice:number, basePrice:number}}
 */
export function evaluatePriceDrop(row, listing) {
  const none = { alert: false, dropPercent: 0, currentPrice: 0, basePrice: 0 }
  if (!row || row.notify_on_drop === false || !listing) return none

  const basePrice = Number(row.price_at_save)
  const currentPrice = Number(listing.price_per_credit)
  // No baseline (saved before alerts existed) or nonsense prices — nothing to compare.
  if (!(basePrice > 0) || !(currentPrice > 0) || currentPrice >= basePrice) {
    return { ...none, currentPrice: currentPrice || 0, basePrice: basePrice || 0 }
  }

  const dropPercent = Math.round(((basePrice - currentPrice) / basePrice) * 100)
  if (dropPercent < MIN_DROP_PERCENT) {
    return { alert: false, dropPercent, currentPrice, basePrice }
  }

  // Already told them about this price (or lower) — don't repeat on every load.
  const lastAlerted = Number(row.last_alerted_price)
  if (Number.isFinite(lastAlerted) && lastAlerted > 0 && currentPrice >= lastAlerted) {
    return { alert: false, dropPercent, currentPrice, basePrice }
  }

  return { alert: true, dropPercent, currentPrice, basePrice }
}

/**
 * Check every watched listing for a price drop and raise a bell notification for
 * each one, advancing `last_alerted_price` so the same drop isn't reported twice.
 *
 * Mirrors `checkSavedSearchAlerts`: it runs client-side when the buyer loads a
 * page that has the listings to hand (the dashboard and the marketplace). That
 * means alerts land the next time they visit, not the instant a price moves —
 * delivering while they're away needs a scheduled job, which is a separate piece
 * of infrastructure this repo doesn't have yet.
 *
 * Best-effort throughout: one failing row never blocks the rest.
 * @returns {Promise<number>} how many alerts were raised
 */
export async function checkWatchlistPriceAlerts(listings = []) {
  const supabase = getSupabase()
  if (!supabase) return 0
  const uid = await getCurrentUserId()
  if (!uid) return 0

  const rows = await getMyWatchlist()
  if (!rows.length) return 0

  const byId = new Map((listings || []).map((l) => [l.listing_id, l]))
  let alerted = 0

  for (const row of rows) {
    try {
      const listing = byId.get(row.listing_id) || null
      const verdict = evaluatePriceDrop(row, listing)
      if (!verdict.alert) continue

      const title = listing.project_title || 'A saved listing'
      await createNotificationsForUsers([uid], {
        type: 'price_drop',
        title: `Price drop: ${title}`,
        message:
          `Now ₱${verdict.currentPrice.toLocaleString()} per credit, ` +
          `down ${verdict.dropPercent}% from ₱${verdict.basePrice.toLocaleString()} when you saved it.`,
        link: '/watchlist',
        metadata: {
          listing_id: row.listing_id,
          drop_percent: verdict.dropPercent,
          current_price: verdict.currentPrice,
        },
      })

      await supabase
        .from('watchlist')
        .update({
          last_alerted_price: verdict.currentPrice,
          last_alerted_at: new Date().toISOString(),
        })
        .eq('id', row.id)

      alerted += 1
    } catch (err) {
      console.warn('Price-drop alert failed for watchlist row', row?.id, err?.message)
    }
  }

  return alerted
}

/** Turn price-drop alerts on/off for a saved listing. */
export async function setWatchlistAlert(listingId, enabled) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const uid = await getCurrentUserId()
  if (!uid) throw new Error('You must be signed in.')

  const { error } = await supabase
    .from('watchlist')
    .update({ notify_on_drop: Boolean(enabled) })
    .eq('user_id', uid)
    .eq('listing_id', listingId)
  if (error) throw new Error(error.message || 'Failed to update alert preference')
  return true
}

/** Remove a listing from the watchlist. */
export async function removeFromWatchlist(listingId) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const uid = await getCurrentUserId()
  if (!uid) return true
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('user_id', uid)
    .eq('listing_id', listingId)
  if (error) throw new Error(error.message || 'Failed to remove from watchlist')
  return true
}
