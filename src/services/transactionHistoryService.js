import { getSupabase } from '@/services/supabaseClient'

/**
 * Get a user's purchases and retirements, grouped.
 *
 * ── RENAMED 2026-08-01, and the rename IS the fix for DEFERRED_BACKLOG #11's
 * "dual-source" half ──
 * This was `getUserTransactionHistory`, the same name
 * `creditOwnershipService` exports for a function that returns a completely
 * different thing: a FLAT array, from different tables, for the ESG report.
 * One name over two shapes is what let a fix land on one copy while the other
 * kept the defect — twice now (the `getUserCreditPortfolio` duplicate on
 * 2026-08-01, and this pair). The name now says which of the two it is.
 *
 * @returns {Promise<{purchases: Array, retirements: Array, all: Array}>}
 * @throws if either read fails — an empty history is a claim about the user
 *   ("you have bought nothing"), not a safe default.
 */
export async function getPurchaseAndRetirementHistory(userId) {
  const supabase = getSupabase()

  if (!supabase) {
    console.warn('Supabase client not available')
    return { purchases: [], retirements: [] }
  }

  try {
    // Purchases live in `credit_transactions` — the table
    // `process_marketplace_purchase` actually writes.
    let purchases = []

    try {
      const { data: transactions, error: transError } = await supabase
        .from('credit_transactions')
        .select(
          `
          *,
          project_credits!inner(
            id,
            vintage_year,
            verification_standard,
            projects!inner(
              id,
              title,
              category,
              location,
              project_image
            )
          )
        `,
        )
        .eq('buyer_id', userId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })

      if (transError) throw transError
      purchases = transactions || []
    } catch (err) {
      // Was: log a warning, set `purchaseError`, and carry on with `purchases`
      // still []. A failed read then rendered as "you have bought nothing".
      console.error('❌ Error in credit_transactions query:', err)
      throw new Error(err?.message || 'Could not load your purchase history')
    }

    // The `credit_purchases` fallback that used to sit here has been REMOVED.
    // It queried the table, logged "✅ Found purchases in credit_purchases
    // table", and then discarded the rows behind a `// TODO: Implement proper
    // fallback` — so it printed a success line for data it never used. Worse,
    // nothing writes `credit_purchases` anywhere in this project, so the
    // fallback could not have helped even fully implemented. A log line that
    // says a thing worked is not evidence the thing worked.

    // Fetch certificates separately for purchases (linked via transaction_id)
    let purchaseCertificates = {}
    if (purchases && purchases.length > 0) {
      const transactionIds = purchases.map((p) => p.id)
      try {
        // Query certificates - start with minimal fields only (certificate_type column doesn't exist)
        // All certificates linked to purchase transactions are purchase certificates
        let { data: certs, error: certError } = await supabase
          .from('certificates')
          .select('id, transaction_id, certificate_number, issued_at, status')
          .in('transaction_id', transactionIds)

        // If query failed, log warning but don't show error (non-critical)
        if (certError) {
          console.warn('⚠️ Could not fetch certificates (non-critical):', certError.message)
          certs = []
          certError = null // Clear error to continue without certificates
        }

        if (!certError && certs && certs.length > 0) {
          // Create a map for quick lookup
          purchaseCertificates = certs.reduce((acc, cert) => {
            if (!acc[cert.transaction_id]) {
              acc[cert.transaction_id] = []
            }
            acc[cert.transaction_id].push(cert)
            return acc
          }, {})
          console.log('✅ Fetched certificates for purchases:', Object.keys(purchaseCertificates).length)
        } else if (certError) {
          console.warn('⚠️ Error fetching certificates:', certError)
          // Continue without certificates - purchases should still show
        } else {
          console.log('ℹ️ No certificates found for transactions:', transactionIds.length)
        }
      } catch (certErr) {
        console.error('❌ Error fetching certificates:', certErr)
        // Continue without certificates - purchases should still show
      }
    }

    // Fetch retirement records (certificates are not directly linked to retirements)
    const { data: retirements, error: retirementError } = await supabase
      .from('credit_retirements')
      .select(
        `
        *,
        projects(
          id,
          title,
          category,
          location,
          project_image
        )
      `,
      )
      .eq('user_id', userId)
      .order('retired_at', { ascending: false })

    // Throw rather than log-and-continue. `getUserRetirementHistory` is built on
    // this function and is what RetireView renders, so a swallowed error here
    // left `retirements` undefined, mapped to [], and told a user who has
    // retired credits that they have retired nothing — on the screen that
    // exists to show them. The same `[]`-as-a-fact-about-the-user class the
    // 2026-07-30 and 2026-07-31 passes swept out of the other reads.
    if (retirementError) {
      console.error('Error fetching retirement history:', retirementError)
      throw new Error(retirementError.message || 'Could not load your retirement history')
    }

    // Transform purchase data
    const purchaseHistory = (purchases || []).map((purchase) => {
      const cert = purchaseCertificates[purchase.id]?.[0] || null
      return {
        id: purchase.id,
        type: 'purchase',
        transaction_id: purchase.id,
        project_id: purchase.project_credits?.projects?.id,
        project_title: purchase.project_credits?.projects?.title || 'Unknown Project',
        project_category: purchase.project_credits?.projects?.category || 'Unknown',
        project_location: purchase.project_credits?.projects?.location || 'Unknown',
        project_image: purchase.project_credits?.projects?.project_image,
        credits_quantity: purchase.quantity,
        price_per_credit: purchase.price_per_credit,
        total_amount: purchase.total_amount,
        currency: purchase.currency || 'PHP',
        payment_method: purchase.payment_method || 'wallet',
        payment_reference: purchase.payment_reference,
        vintage_year: purchase.project_credits?.vintage_year,
        verification_standard: purchase.project_credits?.verification_standard,
        date: purchase.completed_at || purchase.created_at,
        certificate: cert,
        certificate_number: cert?.certificate_number || null,
        status: purchase.status,
      }
    })

    // Fetch retirement certificates separately (linked via retirement_id or user_id + project)
    let retirementCertificates = []
    if (retirements && retirements.length > 0) {
      const retirementIds = retirements.map((r) => r.id)
      const userId = retirements[0]?.user_id
      
      // Try to fetch certificates by retirement_id first, then by user_id and project
      const { data: certs } = await supabase
        .from('certificates')
        .select('id, retirement_id, certificate_number, issued_at, status, certificate_data')
        .or(`retirement_id.in.(${retirementIds.join(',')}),user_id.eq.${userId}`)
        .eq('certificate_type', 'retirement')

      if (certs) {
        // Create a map for quick lookup by retirement_id
        retirementCertificates = certs.reduce((acc, cert) => {
          if (cert.retirement_id) {
            if (!acc[cert.retirement_id]) {
              acc[cert.retirement_id] = []
            }
            acc[cert.retirement_id].push(cert)
          }
          return acc
        }, {})
      }
    }

    // Transform retirement data
    const retirementHistory = (retirements || []).map((retirement) => {
      const cert = retirementCertificates[retirement.id]?.[0] || null
      return {
        id: retirement.id,
        type: 'retirement',
        project_id: retirement.project_id,
        project_title: retirement.projects?.title || 'Unknown Project',
        project_category: retirement.projects?.category || 'Unknown',
        project_location: retirement.projects?.location || 'Unknown',
        project_image: retirement.projects?.project_image,
        credits_quantity: retirement.quantity,
        purpose: retirement.reason || 'Carbon Offset',
        date: retirement.retired_at || retirement.created_at,
        certificate: cert,
        certificate_number: cert?.certificate_number || null,
        status: retirement.status || 'completed',
      }
    })

    return {
      purchases: purchaseHistory,
      retirements: retirementHistory,
      all: [...purchaseHistory, ...retirementHistory].sort(
        (a, b) => new Date(b.date) - new Date(a.date),
      ),
    }
  } catch (error) {
    // Rethrow. Returning empty here re-swallowed the two throws added above and
    // put the whole function back where it started: a database failure
    // rendering as "you have bought nothing and retired nothing". RetireView
    // already has the catch that surfaces this — it was simply never reachable.
    console.error('Error in getPurchaseAndRetirementHistory:', error)
    throw error
  }
}

/**
 * Get purchase history only
 */
export async function getUserPurchaseHistory(userId) {
  const history = await getPurchaseAndRetirementHistory(userId)
  return history.purchases
}

/**
 * Server-side paginated purchase history (Phase 3 — scale).
 *
 * Unlike getPurchaseAndRetirementHistory (which loads everything and sorts in the
 * client), this pages at the database with `.range()` and returns the total row
 * count so callers can render pagination without fetching every row. Ordering
 * and filtering happen in SQL, served by the composite index
 * `credit_transactions (buyer_id, status, completed_at desc)`.
 *
 * @param {{ userId: string, limit?: number, offset?: number, status?: string }} args
 * @returns {Promise<{ rows: object[], total: number, limit: number, offset: number }>}
 */
export async function getUserPurchaseHistoryPage({ userId, limit = 20, offset = 0, status = 'completed' } = {}) {
  const supabase = getSupabase()
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100)
  const safeOffset = Math.max(Number(offset) || 0, 0)
  const empty = { rows: [], total: 0, limit: safeLimit, offset: safeOffset }

  if (!supabase || !userId) return empty

  let query = supabase
    .from('credit_transactions')
    .select(
      `
      id, quantity, price_per_credit, total_amount, currency, status,
      payment_method, payment_reference, created_at, completed_at,
      project_credits!inner(
        id, vintage_year, verification_standard,
        projects!inner(id, title, category, location, project_image)
      )
    `,
      { count: 'exact' },
    )
    .eq('buyer_id', userId)

  if (status) query = query.eq('status', status)

  const { data, count, error } = await query
    .order('completed_at', { ascending: false, nullsFirst: false })
    .range(safeOffset, safeOffset + safeLimit - 1)

  if (error) {
    console.warn('getUserPurchaseHistoryPage failed:', error.message)
    return empty
  }

  // Attach purchase certificates for just this page of rows (linked via
  // transaction_id), mirroring getPurchaseAndRetirementHistory so the paginated list
  // can show the same "View Certificate" affordance. Non-critical: on failure
  // rows still render, just without a certificate.
  let certsByTransaction = {}
  const pageIds = (data || []).map((p) => p.id)
  if (pageIds.length) {
    try {
      const { data: certs, error: certError } = await supabase
        .from('certificates')
        .select('id, transaction_id, certificate_number, issued_at, status')
        .in('transaction_id', pageIds)
      if (certError) {
        console.warn('getUserPurchaseHistoryPage certificates (non-critical):', certError.message)
      } else {
        certsByTransaction = (certs || []).reduce((acc, cert) => {
          if (!acc[cert.transaction_id]) acc[cert.transaction_id] = cert
          return acc
        }, {})
      }
    } catch (certErr) {
      console.warn('getUserPurchaseHistoryPage certificates (non-critical):', certErr?.message)
    }
  }

  const rows = (data || []).map((p) => {
    const cert = certsByTransaction[p.id] || null
    return {
      id: p.id,
      transaction_id: p.id,
      project_id: p.project_credits?.projects?.id,
      project_title: p.project_credits?.projects?.title || 'Unknown Project',
      project_category: p.project_credits?.projects?.category || 'Unknown',
      project_location: p.project_credits?.projects?.location || 'Unknown',
      project_image: p.project_credits?.projects?.project_image,
      credits_quantity: p.quantity,
      price_per_credit: p.price_per_credit,
      total_amount: p.total_amount,
      currency: p.currency || 'PHP',
      payment_method: p.payment_method || 'wallet',
      payment_reference: p.payment_reference,
      vintage_year: p.project_credits?.vintage_year,
      verification_standard: p.project_credits?.verification_standard,
      date: p.completed_at || p.created_at,
      certificate: cert,
      certificate_number: cert?.certificate_number || null,
      status: p.status,
    }
  })

  return { rows, total: Number(count) || 0, limit: safeLimit, offset: safeOffset }
}

/**
 * Get retirement history only
 */
export async function getUserRetirementHistory(userId) {
  const history = await getPurchaseAndRetirementHistory(userId)
  return history.retirements
}

