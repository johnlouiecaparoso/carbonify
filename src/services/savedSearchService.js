import { getSupabase } from '@/services/supabaseClient'
import { createNotificationsForUsers } from '@/services/notificationService'

/**
 * Buyer saved searches + price alerts (Phase 6 — buyer experience).
 *
 * A saved search persists a marketplace filter; when a NEW matching listing
 * appears (or one drops to/below the saved price ceiling), the buyer gets a bell
 * notification. Matching is pure and unit-tested here; the network calls are
 * thin wrappers over the owner-only `saved_searches` table.
 */

// The marketplace-filter keys we persist. Everything else (forceRefresh, paging)
// is transient and must not be stored.
const CRITERIA_KEYS = ['category', 'source', 'sdgs', 'country', 'minPrice', 'maxPrice', 'search']

/**
 * Keep only meaningful filter values — drops empty strings, null, and the "all"
 * sentinel so an empty filter persists as `{}` (which matches everything).
 * @param {object} criteria
 * @returns {object}
 */
export function sanitizeCriteria(criteria = {}) {
  const out = {}
  for (const key of CRITERIA_KEYS) {
    const v = criteria?.[key]
    if (v == null || v === '' || v === 'all') continue
    if (Array.isArray(v)) {
      if (v.length) out[key] = [...v]
      continue
    }
    out[key] = v
  }
  return out
}

/**
 * A short human label for a criteria object, used as the default saved-search
 * name (e.g. "reforestation · local · ≤ ₱250"). Pure.
 * @param {object} criteria
 * @returns {string}
 */
export function describeCriteria(criteria = {}) {
  const c = criteria || {}
  const parts = []
  if (c.search) parts.push(`"${c.search}"`)
  if (c.category && c.category !== 'all') parts.push(c.category)
  if (c.source && c.source !== 'all') parts.push(c.source === 'supplier' ? 'registry' : 'local')
  if (Array.isArray(c.sdgs) && c.sdgs.length) parts.push(c.sdgs.join('/'))
  if (c.country) parts.push(c.country)
  if (c.minPrice != null && c.minPrice !== '') parts.push(`≥ ₱${c.minPrice}`)
  if (c.maxPrice != null && c.maxPrice !== '') parts.push(`≤ ₱${c.maxPrice}`)
  return parts.length ? parts.join(' · ') : 'All listings'
}

/**
 * Does a listing satisfy a saved search's criteria? Pure — mirrors the marketplace
 * filters relevant to alerts (category, source, SDGs, location, price band, keyword).
 * An empty criteria object matches every listing.
 * @param {object} listing
 * @param {object} criteria
 * @returns {boolean}
 */
export function listingMatchesSearch(listing, criteria = {}) {
  if (!listing) return false
  const c = criteria || {}

  if (c.category && c.category !== 'all' && listing.category !== c.category) return false
  if (c.source && c.source !== 'all' && (listing.source || 'local') !== c.source) return false

  if (Array.isArray(c.sdgs) && c.sdgs.length) {
    const tags = Array.isArray(listing.co_benefits) ? listing.co_benefits : []
    if (!c.sdgs.some((s) => tags.includes(s))) return false
  }

  if (c.country) {
    const loc = String(listing.location || '').toLowerCase()
    if (!loc.includes(String(c.country).toLowerCase())) return false
  }

  const price = Number(listing.price_per_credit)
  if (c.minPrice != null && c.minPrice !== '' && !(price >= Number(c.minPrice))) return false
  if (c.maxPrice != null && c.maxPrice !== '' && !(price <= Number(c.maxPrice))) return false

  if (c.search) {
    const term = String(c.search).toLowerCase()
    const hay = [listing.project_title, listing.project_description, listing.location].map((x) =>
      String(x || '').toLowerCase(),
    )
    if (!hay.some((h) => h.includes(term))) return false
  }

  return true
}

/**
 * Listings that match a saved search AND are newer than its high-water mark
 * (`last_seen_at`) — i.e. the ones the buyer hasn't been alerted about yet. Pure.
 * @param {{criteria?:object, last_seen_at?:string}} savedSearch
 * @param {Array<object>} listings
 * @returns {Array<object>}
 */
export function findNewMatches(savedSearch, listings = []) {
  if (!savedSearch) return []
  const since = savedSearch.last_seen_at ? new Date(savedSearch.last_seen_at).getTime() : 0
  return (listings || []).filter((l) => {
    if (!listingMatchesSearch(l, savedSearch.criteria)) return false
    const created = l?.created_at ? new Date(l.created_at).getTime() : 0
    return created > since
  })
}

async function currentUserId() {
  const supabase = getSupabase()
  if (!supabase) return null
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user?.id || null
}

/**
 * The signed-in buyer's saved searches, most recent first.
 *
 * Throws on a failed read. An empty list reads as "you have saved no searches",
 * and the buyer's response to that is to save the same search again — so the
 * failure is not just invisible, it produces a duplicate row and a second set
 * of price alerts for the same criteria.
 */
export async function listMySavedSearches() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const { data, error } = await supabase
    .from('saved_searches')
    .select('id, label, criteria, last_seen_at, created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message || 'Failed to load your saved searches')
  return data || []
}

/** Persist the current marketplace filter as a saved search. */
export async function saveSearch({ label, criteria } = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const userId = await currentUserId()
  if (!userId) throw new Error('You must be signed in to save a search')

  const { data, error } = await supabase
    .from('saved_searches')
    .insert({
      user_id: userId,
      label: String(label || 'Saved search').slice(0, 120),
      criteria: sanitizeCriteria(criteria),
    })
    .select('id, label, criteria, last_seen_at, created_at')
    .single()
  if (error) throw new Error(error.message || 'Failed to save search')
  return data
}

/** Delete one of the buyer's saved searches. */
export async function deleteSavedSearch(id) {
  const supabase = getSupabase()
  if (!supabase || !id) return
  const { error } = await supabase.from('saved_searches').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Failed to delete saved search')
}

/**
 * Evaluate the buyer's saved searches against the currently-loaded listings and
 * raise a bell notification for each search with new matches, then advance its
 * high-water mark so the same listing isn't alerted twice. Best-effort: a single
 * search failing never blocks the others. Returns the number of searches alerted.
 * @param {Array<object>} listings
 * @returns {Promise<number>}
 */
export async function checkSavedSearchAlerts(listings = []) {
  const supabase = getSupabase()
  if (!supabase) return 0
  const userId = await currentUserId()
  if (!userId) return 0

  const searches = await listMySavedSearches()
  let alerted = 0

  for (const s of searches) {
    try {
      const matches = findNewMatches(s, listings)
      if (!matches.length) continue

      await createNotificationsForUsers([userId], {
        type: 'saved_search',
        title: `New match for "${s.label}"`,
        message:
          matches.length === 1
            ? `A new listing matches your saved search "${s.label}".`
            : `${matches.length} new listings match your saved search "${s.label}".`,
        link: '/marketplace',
        metadata: { saved_search_id: s.id, match_count: matches.length },
      })

      await supabase
        .from('saved_searches')
        .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', s.id)
      alerted += 1
    } catch (err) {
      console.warn('Saved-search alert failed for', s?.id, err?.message)
    }
  }

  return alerted
}
