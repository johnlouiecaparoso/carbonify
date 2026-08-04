import { getSupabase } from '@/services/supabaseClient'
import { logUserAction } from '@/services/auditService'
// Import real payment service
import { realPaymentService } from './realPaymentService.js'
import { getCurrentUserId } from '@/utils/authHelper'
import { normalizeCoBenefits } from '@/constants/sdgs'

const isDev = import.meta.env?.DEV ?? false
const MARKETPLACE_CACHE_TTL = 10000 // 10 seconds

let cachedMarketplaceListings = []
let lastMarketplaceFetch = 0
let cleanupTriggered = false

/** Call after purchase so next getMarketplaceListings() fetches fresh data */
export function invalidateMarketplaceCache() {
  cachedMarketplaceListings = []
  lastMarketplaceFetch = 0
}

/**
 * Update marketplace stock after a purchase (credits_available + credit_listings).
 * Call this from both in-app purchase and payment callback (PayMongo) so sold-out state is correct.
 * @param {string} projectCreditId - project_credits.id
 * @param {number} quantityPurchased - credits just purchased
 * @param {{ listingQuantity?: number }} [opts] - optional fallback when credits_available/total_credits are null
 */
export async function updateMarketplaceAvailabilityAfterPurchase(
  projectCreditId,
  quantityPurchased,
  opts = {},
) {
  const supabase = getSupabase()
  if (!supabase) return

  const { listingQuantity } = opts

  try {
    const { data: projectCredit } = await supabase
      .from('project_credits')
      .select('credits_available, total_credits')
      .eq('id', projectCreditId)
      .single()

    const currentAvailable =
      projectCredit?.credits_available ??
      projectCredit?.total_credits ??
      listingQuantity ??
      0
    const newCreditsAvailable = Math.max(0, currentAvailable - quantityPurchased)

    const { error: creditsUpdateError } = await supabase
      .from('project_credits')
      .update({ credits_available: newCreditsAvailable })
      .eq('id', projectCreditId)

    if (creditsUpdateError) {
      console.error('Error updating project_credits.credits_available:', creditsUpdateError)
    }

    const listingUpdate = {
      quantity: newCreditsAvailable,
      status: 'active',
    }
    const { error: allListingsUpdateError } = await supabase
      .from('credit_listings')
      .update(listingUpdate)
      .eq('project_credit_id', projectCreditId)

    if (allListingsUpdateError) {
      console.error('Error syncing credit_listings quantities:', allListingsUpdateError)
    }

    invalidateMarketplaceCache()
    if (isDev) {
      console.log('Marketplace availability updated after purchase:', {
        projectCreditId,
        quantityPurchased,
        newCreditsAvailable,
      })
    }

    return newCreditsAvailable
  } catch (err) {
    console.error('updateMarketplaceAvailabilityAfterPurchase error:', err)
    return null
  }
}

/**
 * Get all active marketplace listings with project details
 * Real data implementation with proper error handling
 */
/**
 * Clean up orphaned credit_listings and project_credits that reference deleted projects
 * This function should be called periodically or when marketplace loads
 */
async function cleanupOrphanedRecords() {
  const supabase = getSupabase()
  if (!supabase) return

  // Add timeout protection - cleanup should not block marketplace loading
  const cleanupTimeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Cleanup timeout')), 10000) // 10 second timeout for cleanup
  )

  try {
    console.log('[Cleanup] Checking for orphaned records...')

    // Race cleanup against timeout - if it takes too long, skip it
    await Promise.race([
      (async () => {
        // Get all project_credits
        const { data: allCredits, error: creditsError } = await supabase
          .from('project_credits')
          .select('id, project_id')
          .limit(1000) // Limit to prevent huge queries

        if (creditsError || !allCredits || allCredits.length === 0) {
          return
        }

        // Get all project IDs from credits
        const creditProjectIds = [...new Set(allCredits.map((c) => c.project_id).filter(Boolean))]

        if (creditProjectIds.length === 0) {
          return
        }

        // Check which projects actually exist
        const { data: existingProjects, error: projectsError } = await supabase
          .from('projects')
          .select('id')
          .in('id', creditProjectIds)

        if (projectsError) {
          console.warn('Warning: Error checking existing projects:', projectsError)
          return
        }

        const existingProjectIds = new Set(existingProjects?.map((p) => p.id) || [])
        const orphanedProjectIds = creditProjectIds.filter((id) => !existingProjectIds.has(id))

        if (orphanedProjectIds.length === 0) {
          console.log('[Cleanup] No orphaned records found')
          return
        }

        console.log(`[Cleanup] Found ${orphanedProjectIds.length} orphaned project references`)

        // Find orphaned credits
        const orphanedCredits = allCredits.filter((c) => orphanedProjectIds.includes(c.project_id))
        const orphanedCreditIds = orphanedCredits.map((c) => c.id)

        if (orphanedCreditIds.length === 0) {
          return
        }

        console.log(
          `[Cleanup] Removing ${orphanedCreditIds.length} orphaned project_credits and their listings`,
        )

        // Delete orphaned credit_listings first
        const { error: listingsError, count: deletedListings } = await supabase
          .from('credit_listings')
          .delete({ count: 'exact' })
          .in('project_credit_id', orphanedCreditIds)

        if (listingsError) {
          console.warn('Warning: Error cleaning up orphaned credit_listings:', listingsError)
        } else {
          console.log(`[Cleanup] Removed ${deletedListings || 0} orphaned credit_listings`)
        }

        // Delete orphaned project_credits
        const { error: creditsDeleteError, count: deletedCredits } = await supabase
          .from('project_credits')
          .delete({ count: 'exact' })
          .in('id', orphanedCreditIds)

        if (creditsDeleteError) {
          console.warn('Warning: Error cleaning up orphaned project_credits:', creditsDeleteError)
        } else {
          console.log(`[Cleanup] Removed ${deletedCredits || 0} orphaned project_credits`)
        }

        console.log(
          `[Cleanup] Completed removal of ${deletedListings || 0} listings and ${deletedCredits || 0} credits`,
        )
      })(),
      cleanupTimeout,
    ])
  } catch (error) {
    // If it's a timeout, just log and continue - don't block marketplace loading
    if (error.message?.includes('timeout') || error.message?.includes('Cleanup timeout')) {
      console.warn('Warning: Cleanup timed out, continuing with marketplace load...')
    } else {
      console.error('Error during orphaned records cleanup:', error)
    }
  }
}

function triggerCleanupOnce() {
  if (cleanupTriggered) {
    return
  }
  cleanupTriggered = true
    cleanupOrphanedRecords().catch((err) => {
    if (isDev) {
      console.warn('Warning: Orphaned records cleanup failed (non-critical):', err?.message || err)
    }
  })
}

function applyMarketplaceFilters(sourceListings = [], filters = {}) {
  const { ...criteria } = filters || {}
  let filtered = [...sourceListings]

  if (criteria.category && criteria.category !== 'all') {
    filtered = filtered.filter((listing) => listing.category === criteria.category)
  }

  if (criteria.source && criteria.source !== 'all') {
    filtered = filtered.filter((listing) => (listing.source || 'local') === criteria.source)
  }

  // SDG filter: keep listings tagged with ANY of the selected SDGs.
  if (Array.isArray(criteria.sdgs) && criteria.sdgs.length) {
    filtered = filtered.filter((listing) => {
      const tags = Array.isArray(listing.co_benefits) ? listing.co_benefits : []
      return criteria.sdgs.some((sdg) => tags.includes(sdg))
    })
  }

  if (criteria.country) {
    const searchLocation = criteria.country.toLowerCase()
    filtered = filtered.filter((listing) =>
      listing.location?.toLowerCase().includes(searchLocation),
    )
  }

  if (criteria.minPrice) {
    filtered = filtered.filter((listing) => listing.price_per_credit >= criteria.minPrice)
  }

  if (criteria.maxPrice) {
    filtered = filtered.filter((listing) => listing.price_per_credit <= criteria.maxPrice)
  }

  if (criteria.search) {
    const term = criteria.search.toLowerCase()
    filtered = filtered.filter(
      (listing) =>
        listing.project_title?.toLowerCase().includes(term) ||
        listing.project_description?.toLowerCase().includes(term) ||
        listing.location?.toLowerCase().includes(term),
    )
  }

  return filtered
}

export async function getMarketplaceListings(filters = {}) {
  const supabase = getSupabase()

  if (!supabase) {
    console.warn('Supabase client not initialized')
    return []
  }

  triggerCleanupOnce()

  const now = Date.now()
  const forceRefresh = Boolean(filters?.forceRefresh)
  const cacheIsFresh =
    !forceRefresh &&
    cachedMarketplaceListings.length > 0 &&
    now - lastMarketplaceFetch < MARKETPLACE_CACHE_TTL

  if (cacheIsFresh) {
    if (isDev) {
      console.log('Marketplace cache hit, serving cached listings')
    }
    return applyMarketplaceFilters(cachedMarketplaceListings, filters)
  }

  const { data, error } = await supabase
    .from('credit_listings')
    .select(
      `
      id,
      created_at,
      quantity,
      price_per_credit,
      currency,
      seller_id,
      status,
      source,
      project_credit_id,
      project_credits:project_credits (
        id,
        project_id,
        price_per_credit,
        currency,
        total_credits,
        credits_available,
        vintage_year,
        verification_standard,
        projects:projects!inner(
          id,
          title,
          description,
          category,
          location,
          geo_coordinates,
          barangay,
          municipality,
          feasibility_score,
          social_impact_score,
          climate_risk_rating,
          co_benefits,
          project_image,
          image_name,
          image_type,
          credit_price,
          estimated_credits,
          status
        )
      )
    `,
    )
    .eq('status', 'active')

  if (error) {
    // Not []: this renders as "no credits available" on the marketplace — the
    // buyer's primary surface, and the worst false statement a marketplace can
    // make about itself. MarketplaceViewEnhanced, ProjectsMapView and
    // WatchlistView all already render an error state for this; every one of
    // those branches was dead code. OrdersView opts out explicitly with
    // `.catch(() => [])` because there it is only enrichment for listing titles.
    console.error('Error fetching marketplace listings:', error)
    throw new Error(error.message || 'Failed to load marketplace listings')
  }

  let sellerMap = new Map()
  if (data?.length) {
    const sellerIds = [...new Set(data.map((listing) => listing.seller_id).filter(Boolean))]
    if (sellerIds.length > 0) {
      const { data: sellers, error: sellerError } = await supabase
        .from('profiles')
        .select('id, full_name, kyc_level')
        .in('id', sellerIds)

      if (!sellerError && sellers) {
        sellerMap = new Map(sellers.map((seller) => [seller.id, seller]))
      } else if (sellerError) {
        console.warn('Warning: Failed to load seller profiles:', sellerError)
      }
    }
  }

  // Derive sold quantities from credit_transactions (source of truth) so sold-out is correct
  // even when project_credits/credit_listings updates are blocked by RLS
  const projectCreditIds = [...new Set((data || []).map((l) => l.project_credits?.id).filter(Boolean))]
  const soldByProjectCredit = new Map()
  if (projectCreditIds.length > 0) {
    const { data: transactions } = await supabase
      .from('credit_transactions')
      .select('project_credit_id, quantity')
      .in('project_credit_id', projectCreditIds)
      .eq('status', 'completed')
    if (transactions?.length) {
      for (const t of transactions) {
        const id = t.project_credit_id
        soldByProjectCredit.set(id, (soldByProjectCredit.get(id) || 0) + (t.quantity || 0))
      }
    }
  }

  const dedupeMap = new Map()

  for (const listing of data || []) {
    const credit = listing.project_credits
    const project = credit?.projects

      if (!credit || !project || !['approved', 'validated'].includes(project.status)) {
      continue
    }

    const cacheKey = listing.project_credit_id || credit.id
    const existing = dedupeMap.get(cacheKey)
    if (existing && new Date(listing.created_at) <= new Date(existing.listed_at)) {
      continue
    }

    // Use || (not ??) so a 0 / null estimated_credits falls back to the credit
    // pool instead of zeroing it. `credits_available` is the canonical pool column
    // (the legacy `available_credits` stray was retired in 20260718000600).
    const creditPool = credit.credits_available
    const totalPool =
      Number(project.estimated_credits) ||
      Number(credit.total_credits) ||
      Number(creditPool) ||
      Number(listing.quantity) ||
      0
    const soldQuantity = soldByProjectCredit.get(credit.id) || 0
    const availableFromTransactions = Math.max(0, totalPool - soldQuantity)

    let availableQuantity = listing.quantity ?? 0
    if (project.estimated_credits) {
      availableQuantity = Math.min(availableQuantity, project.estimated_credits)
    }
    // Only treat the pool column as a cap when it is a positive number — a 0 here
    // usually means "trigger wrote the other column", not genuinely sold out.
    if (creditPool !== null && creditPool !== undefined && Number(creditPool) > 0) {
      availableQuantity = Math.min(availableQuantity, Number(creditPool))
    }
    // Source of truth: never show more than (total pool - already sold)
    availableQuantity = Math.min(availableQuantity, availableFromTransactions)

    // The listing price is what the buyer is actually CHARGED — the checkout
    // edge function recomputes the amount from credit_listings.price_per_credit,
    // and so does process_wallet_purchase. It has to be what we display too.
    //
    // This used to prefer projects.credit_price (the price the verifier sets at
    // validation). That was equivalent right up until sellers could edit their
    // own price: update_my_listing (20260721000400) writes price_per_credit and
    // never touches projects.credit_price, so after the first price edit the
    // card showed the stale validation price while checkout charged the new one.
    // The remaining fallbacks are for rows that predate a listing price.
    const pricePerCredit =
      listing.price_per_credit ??
      credit.price_per_credit ??
      project.credit_price ??
      0

    dedupeMap.set(cacheKey, {
          listing_id: listing.id,
          project_id: project.id,
          project_title: project.title,
          project_description: project.description,
          category: project.category,
          location: project.location,
          geo_coordinates: project.geo_coordinates,
          feasibility_score: project.feasibility_score,
          social_impact_score: project.social_impact_score,
          climate_risk_rating: project.climate_risk_rating,
          co_benefits: normalizeCoBenefits(project.co_benefits),
          vintage_year: credit.vintage_year,
          verification_standard: credit.verification_standard,
      available_quantity: availableQuantity,
          price_per_credit: pricePerCredit,
          currency: listing.currency || credit.currency || 'PHP',
          seller_id: listing.seller_id,
      seller_name: sellerMap.get(listing.seller_id)?.full_name || 'Unknown Seller',
      seller_kyc_verified: Number(sellerMap.get(listing.seller_id)?.kyc_level) >= 2,
          source: listing.source || 'local',
          listed_at: listing.created_at,
          project_image: project.project_image,
          image_name: project.image_name,
          image_type: project.image_type,
      estimated_credits: project.estimated_credits,
          credit_price: project.credit_price,
          project_credits_available: credit.credits_available,
          project_credits_total: credit.total_credits,
        })
      }

  const transformedListings = Array.from(dedupeMap.values())

  cachedMarketplaceListings = transformedListings
  lastMarketplaceFetch = now

  if (isDev) {
    console.log(`Loaded ${transformedListings.length} marketplace listings from Supabase`)
  }

  return applyMarketplaceFilters(transformedListings, filters)
}

/**
 * Get a specific marketplace listing by ID
 */
export async function getMarketplaceListing(listingId) {
  const supabase = getSupabase()

  try {
    const { data, error } = await supabase
      .from('credit_listings')
      .select('*')
      .eq('id', listingId)
      .single()

    if (error) {
      throw error
    }

    return data
  } catch (error) {
    console.error('Error fetching marketplace listing:', error)
    throw error
  }
}

/**
 * Check if a credit listing already exists for a project_credit_id
 * @param {string} projectCreditId - Project credit ID
 * @returns {Promise<boolean>} True if listing exists
 */
export async function checkExistingListing(projectCreditId) {
  const supabase = getSupabase()

  if (!supabase) {
    return false
  }

  try {
    const { data, error } = await supabase
      .from('credit_listings')
      .select('id')
      .eq('project_credit_id', projectCreditId)
      .eq('status', 'active')
      .single()

    if (error && error.code !== 'PGRST116') {
      console.error('Error checking existing listing:', error)
      return false
    }

    return !!data
  } catch (error) {
    console.error('Error in checkExistingListing:', error)
    return false
  }
}

/**
 * Get marketplace statistics
 */
export async function getMarketplaceStats() {
  const supabase = getSupabase()

  try {
    const { data: listings, error } = await supabase
      .from('credit_listings')
      .select('quantity, price_per_credit, currency')
      .eq('status', 'active')

    if (error) {
      throw error
    }

    // Guard every term. `price_per_credit` is legitimately null on listings that
    // inherit the project's price, and a single null turned the whole reduce into
    // NaN — which `|| 0` then collapsed to zero, silently reporting the entire
    // market as worthless rather than skipping the one unpriced row.
    const rows = Array.isArray(listings) ? listings : []
    const stats = {
      totalListings: rows.length,
      totalCreditsAvailable: rows.reduce((sum, l) => sum + (Number(l?.quantity) || 0), 0),
      totalMarketValue: rows.reduce(
        (sum, l) => sum + (Number(l?.quantity) || 0) * (Number(l?.price_per_credit) || 0),
        0,
      ),
    }

    return stats
  } catch (error) {
    console.error('Error fetching marketplace stats:', error)
    return {
      totalListings: 0,
      totalCreditsAvailable: 0,
      totalMarketValue: 0,
    }
  }
}

// `getUserCreditPortfolio` used to live here as well, reading the same
// `credit_ownership` rows as `creditOwnershipService.getUserCreditPortfolio`.
// It was removed 2026-08-01: the two copies had drifted, and the surviving one
// rethrows while this one swallowed the error and returned [] -- which rendered
// on RetireView as "you own no credits to retire" and made that view's error
// banner dead code. The 2026-07-30 fix named RetireView as already covered; it
// was not, because RetireView imported this copy. Import from
// `creditOwnershipService` instead.

/**
 * Purchase credits from marketplace listing
 * @param {string} listingId - Listing ID
 * @param {Object} purchaseData - Purchase information
 * @param {number} purchaseData.quantity - Number of credits to purchase
 * @param {string} purchaseData.paymentMethod - Payment method (gcash/maya)
 * @param {Object} purchaseData.paymentData - Payment details
 * @returns {Promise<Object>} Purchase result
 */
export async function purchaseCredits(listingId, purchaseData) {
  const supabase = getSupabase()

  if (!supabase) {
    throw new Error('Supabase client not available')
  }

  try {
    console.log('🛒 Processing credit purchase:', { listingId, purchaseData })

    // Get current user ID using helper (works for test accounts too)
    const userId = await getCurrentUserId()
    console.log('getCurrentUserId result:', userId)

    if (!userId) {
      console.error('No user ID found')
      throw new Error('User not authenticated')
    }

    // KYC gate: buyers must be identity-verified before purchasing credits.
    const { assertCanTrade } = await import('@/services/kycService')
    await assertCanTrade(userId)

    const user = { id: userId }

    // Get listing details with project information
    const { data: listing, error: listingError } = await supabase
      .from('credit_listings')
      .select(
        `
        *,
        project_credits!inner(
          id,
          project_id,
          projects!inner(
            id,
            title,
            category,
            location
          )
        )
      `,
      )
      .eq('id', listingId)
      .eq('status', 'active')
      .single()

    if (listingError || !listing) {
      throw new Error('Listing not found or no longer available')
    }

    // Validate purchase quantity
    if (purchaseData.quantity <= 0) {
      throw new Error('Invalid purchase quantity')
    }

    // CRITICAL: Get the correct price from project (developer-set price), not listing
    // This ensures we use the same price logic as the marketplace display
    const { data: project } = await supabase
      .from('projects')
      .select('credit_price, estimated_credits')
      .eq('id', listing.project_credits.project_id)
      .single()

    // Quote from the LISTING price, because that is the one that gets charged:
    // createMarketplaceCheckout recomputes the amount from
    // credit_listings.price_per_credit, and process_wallet_purchase reads the
    // same column. Preferring projects.credit_price here (as this did) meant the
    // confirmation and the returned receipt total could quote a price the buyer
    // was not charged, from the moment a seller edited their listing.
    const actualPricePerCredit = listing.price_per_credit || project?.credit_price
    const totalCost = actualPricePerCredit * purchaseData.quantity

    // CRITICAL: Get current available credits for THIS listing's project_credits row (by id)
    const { data: projectCredit } = await supabase
      .from('project_credits')
      .select('credits_available, total_credits')
      .eq('id', listing.project_credits.id)
      .single()

    // Calculate actual available quantity (respects developer limit)
    // Priority: project_credits.credits_available > project.estimated_credits > listing.quantity
    let actualAvailable = listing.quantity

    // If developer set estimated_credits, use that as the maximum limit
    if (project?.estimated_credits && project.estimated_credits > 0) {
      actualAvailable = Math.min(actualAvailable, project.estimated_credits)
    }

    // If project_credits has credits_available, use that (it's the most accurate)
    if (
      projectCredit?.credits_available !== null &&
      projectCredit?.credits_available !== undefined
    ) {
      actualAvailable = Math.min(
        actualAvailable,
        projectCredit.credits_available,
        project?.estimated_credits || Infinity,
      )
    }

    // Validate purchase quantity against calculated available quantity
    if (purchaseData.quantity > actualAvailable) {
      throw new Error(
        `Cannot purchase ${purchaseData.quantity} credits. ` +
          `Only ${actualAvailable} credits available. ` +
          (project?.estimated_credits ? `(Developer limit: ${project.estimated_credits})` : ''),
      )
    }

    console.log('Purchase quantity validated:', {
      requested: purchaseData.quantity,
      listing_quantity: listing.quantity,
      developer_limit: project?.estimated_credits,
      project_credits_available: projectCredit?.credits_available,
      project_credits_total: projectCredit?.total_credits,
      actual_available: actualAvailable,
    })

    console.log('Purchase details:', {
      quantity: purchaseData.quantity,
      listing_price_per_credit: listing.price_per_credit,
      project_credit_price: project?.credit_price,
      actual_price_per_credit: actualPricePerCredit,
      totalCost,
      currency: listing.currency,
      project_title: listing.project_credits.projects.title,
    })

    // Handle different payment methods. Both live methods settle server-side and
    // return here: 'wallet' via the process_wallet_purchase RPC, and
    // card/gcash/maya via the paymongo-checkout → webhook →
    // process_marketplace_purchase path. There is no client-side settlement
    // fallback (the old 'demo' branch + browser-write tail were removed).
    if (purchaseData.paymentMethod === 'wallet') {
      // Server-authoritative wallet purchase (Phase 1 P2 cutover). A single
      // atomic RPC checks the buyer's wallet balance, decrements the pool,
      // debits the wallet, and writes credit_transactions + credit_ownership +
      // the balanced double-entry ledger — all server-side. The browser writes
      // NO financial tables for wallet purchases anymore.
      const supabase = getSupabase()
      const { data: walletTxnId, error: walletErr } = await supabase.rpc(
        'process_wallet_purchase',
        {
          p_listing_id: listingId,
          p_quantity: purchaseData.quantity,
        },
      )

      if (walletErr) {
        const message = /insufficient wallet balance/i.test(walletErr.message || '')
          ? 'Insufficient wallet balance for this purchase.'
          : walletErr.message || 'Wallet purchase failed'
        throw new Error(message)
      }

      // Issue the receipt + certificate (best-effort, idempotent/guarded). No
      // financial writes here — those already happened in the RPC.
      try {
        const { generateReceipt } = await import('@/services/receiptService')
        await generateReceipt(walletTxnId)
      } catch (receiptError) {
        console.warn('⚠️ Receipt generation failed (non-critical):', receiptError?.message)
      }
      try {
        const { data: existingCert } = await supabase
          .from('certificates')
          .select('id')
          .eq('transaction_id', walletTxnId)
          .limit(1)
          .maybeSingle()
        if (!existingCert) {
          const { generateCreditCertificate } = await import('@/services/certificateService')
          await generateCreditCertificate(walletTxnId, 'purchase')
        }
      } catch (certError) {
        console.warn('⚠️ Certificate generation failed (non-critical):', certError?.message)
      }

      console.log('✅ Wallet purchase settled server-side:', walletTxnId)
      return {
        success: true,
        redirect: false,
        transaction: {
          id: walletTxnId,
          total_amount: totalCost,
          currency: listing.currency || 'PHP',
          quantity: purchaseData.quantity,
        },
        message: 'Purchase completed from wallet balance.',
      }
    } else if (
      purchaseData.paymentMethod === 'card' ||
      purchaseData.paymentMethod === 'gcash' ||
      purchaseData.paymentMethod === 'maya'
    ) {
      // Server-authoritative online checkout (Phase 1 P2 cutover).
      //
      // The client now sends ONLY { listingId, quantity }. The paymongo-checkout
      // Edge Function recomputes the amount from credit_listings.price_per_credit
      // and records a payment_intent; the paymongo-webhook then settles the
      // purchase atomically via process_marketplace_purchase (decrement + ledger
      // + credit_transactions + credit_ownership). The browser NO LONGER writes
      // any financial tables for card/gcash/maya — this closes both the
      // client-controlled-amount hole and the callback double-write hazard.
      const { createMarketplaceCheckout } = await import('@/services/paymongoService')

      let billing = null
      try {
        billing = await realPaymentService.getBuyerBillingInfo(user.id)
      } catch {
        // billing prefill is best-effort; the amount is server-computed regardless
      }

      const checkout = await createMarketplaceCheckout({
        listingId,
        quantity: purchaseData.quantity,
        billing,
      })

      const checkoutUrl = checkout?.checkoutUrl || checkout?.checkout_url
      if (!checkoutUrl) {
        console.error('❌ No checkout URL returned from marketplace checkout')
        throw new Error('Failed to create payment checkout. Please try again or contact support.')
      }

      console.log('🔗 Redirecting to server-authoritative PayMongo checkout:', checkoutUrl)
      return {
        success: true,
        redirect: true,
        checkoutUrl,
        sessionId: checkout.sessionId,
        // The callback page uses the intent id to find the webhook-settled
        // transaction (and then generate the certificate/receipt).
        paymentIntentId: checkout.paymentIntentId,
        message: 'Redirecting to payment...',
      }
    } else {
      throw new Error(`Invalid payment method: ${purchaseData.paymentMethod}`)
    }
  } catch (error) {
    console.error('Error in purchaseCredits:', error)
    throw error
  }
}

/**
 * Retire credits (mark them as retired/used)
 * @param {string} userId - User ID
 * @param {string} projectId - Project ID
 * @param {number} quantity - Number of credits to retire
 * @param {string} reason - Reason for retirement
 * @returns {Promise<Object>} Retirement result
 */
export async function retireCredits(userId, projectId, quantity, reason) {
  const supabase = getSupabase()

  if (!supabase) {
    throw new Error('Supabase client not available')
  }

  try {
    // Atomically burn the owner's balance AND write the credit_retirements row in
    // one server transaction. retire_credits_atomic (SECURITY DEFINER) decrements
    // only when enough credits exist — the anti-double-counting guard (the same
    // unit can never be retired twice, even concurrently) — and, since the H1 fix,
    // inserts the retirement record itself and returns it. Doing both in the RPC
    // is what makes retirement atomic: previously the burn and the record were two
    // separate statements, so a failed insert left credits gone with no record.
    // It also keeps retirement working after the financial-table RLS lockdown.
    const { data: retirement, error: rpcErr } = await supabase.rpc('retire_credits_atomic', {
      p_user_id: userId,
      p_project_id: projectId,
      p_quantity: quantity,
      p_reason: reason,
    })
    if (rpcErr) {
      throw new Error(`Failed to retire credits: ${rpcErr.message}`)
    }
    // NULL return = not enough credits (nothing was burned or recorded).
    if (!retirement || !retirement.id) {
      throw new Error('Insufficient credits to retire')
    }

    // Log the retirement action
    await logUserAction('RETIRE_CREDITS', 'retirement', userId, retirement.id, {
      project_id: projectId,
      quantity: quantity,
      reason: reason,
    })

    // Generate retirement certificate automatically
    try {
      const { generateRetirementCertificate } = await import('@/services/certificateService')
      const certificate = await generateRetirementCertificate(retirement.id, userId)
      console.log(
        'Retirement certificate generated automatically:',
        certificate?.certificate_number,
      )
    } catch (certError) {
      console.error('Error generating retirement certificate:', certError)
      // Continue - certificate generation failure shouldn't break retirement
    }

    return {
      success: true,
      retirement_id: retirement.id,
      serial_number: retirement.serial_number,
      message: `Successfully retired ${quantity} credits`,
    }
  } catch (error) {
    console.error('Error retiring credits:', error)
    throw error
  }
}
