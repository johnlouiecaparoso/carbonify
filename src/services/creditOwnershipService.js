/**
 * Credit Ownership Service
 * Manages user credit ownership, portfolio, and transactions
 */

import { getSupabase } from '@/services/supabaseClient'

export class CreditOwnershipService {
  constructor() {
    // Don't initialize supabase here - it might not be ready yet
    // Get it dynamically in each method to ensure it's initialized
  }
  
  get supabase() {
    const client = getSupabase()
    if (!client) {
      throw new Error('Supabase client not initialized. Please wait for app initialization.')
    }
    return client
  }

  /**
   * Get user's credit portfolio
   * @param {string} userId - User ID
   * @returns {Promise<Array>} User's credit portfolio
   */
  async getUserCreditPortfolio(userId) {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }

    try {
      console.log('🔍 Fetching credit portfolio for user:', userId)

      // Get user's credit ownership with project details
      const { data: ownership, error: ownershipError } = await this.supabase
        .from('credit_ownership')
        .select(
          `
          *,
          projects!inner(
            id,
            title,
            description,
            category,
            location,
            project_image,
            image_name,
            image_type
          )
        `,
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (ownershipError) {
        console.error('❌ Error fetching credit ownership:', ownershipError)
        throw ownershipError
      }

      console.log('✅ Found', ownership?.length || 0, 'credit ownership records')

      // Transform the data for frontend
      const portfolio =
        ownership?.map((record) => ({
          id: record.id,
          project_id: record.project_id,
          project_title: record.projects?.title || 'Unknown Project',
          project_description: record.projects?.description || '',
          project_category: record.projects?.category || 'Unknown',
          project_location: record.projects?.location || 'Unknown',
          project_image: record.projects?.project_image,
          image_name: record.projects?.image_name,
          image_type: record.projects?.image_type,
          quantity: record.quantity,
          ownership_type: record.ownership_type,
          // Cost basis for portfolio P&L (undefined on schema versions without the column).
          purchase_price: record.purchase_price,
          created_at: record.created_at,
          updated_at: record.updated_at,
          // Add status for frontend display
          ownership_status: record.ownership_type === 'retired' ? 'retired' : 'owned',
        })) || []

      return portfolio
    } catch (error) {
      // Rethrow — do NOT return []. An empty portfolio is a claim about the
      // user ("you own nothing"), and returning it on a failed read renders a
      // database error as that claim. Every caller already handles a rejection:
      // CreditPortfolioView and RetireView catch and show an error banner, and
      // BuyerDashboardView explicitly tests `holdingsRes.status === 'rejected'`
      // — code that could never run while this swallowed.
      console.error('❌ Error in getUserCreditPortfolio:', error)
      throw error
    }
  }

  /**
   * Get user's credit statistics
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Credit statistics
   */
  async getUserCreditStats(userId) {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }

    try {
      // Get total owned credits
      const { data: ownedCredits, error: ownedError } = await this.supabase
        .from('credit_ownership')
        .select('quantity')
        .eq('user_id', userId)

      if (ownedError) {
        throw new Error(`Failed to fetch owned credits: ${ownedError.message}`)
      }

      // Get total retired credits
      const { data: retiredCredits, error: retiredError } = await this.supabase
        .from('credit_retirements')
        .select('quantity')
        .eq('user_id', userId)

      if (retiredError) {
        throw new Error(`Failed to fetch retired credits: ${retiredError.message}`)
      }

      const totalOwned = ownedCredits?.reduce((sum, record) => sum + record.quantity, 0) || 0
      const totalRetired = retiredCredits?.reduce((sum, record) => sum + record.quantity, 0) || 0

      return {
        total_owned: totalOwned,
        total_retired: totalRetired,
        total_credits: totalOwned + totalRetired,
        projects_count: ownedCredits?.length || 0,
      }
    } catch (error) {
      console.error('❌ Error fetching credit stats:', error)
      return {
        total_owned: 0,
        total_retired: 0,
        total_credits: 0,
        projects_count: 0,
      }
    }
  }

  /**
   * Get user's transaction history (purchases + retirements, newest first).
   *
   * `limit` caps each transaction type SEPARATELY, not the combined result — so
   * the return can hold up to 2 × limit rows. That is deliberate: this used to
   * `.slice(0, limit)` the merged list, which silently dropped whichever type
   * sorted later. A user with `limit` purchases newer than their oldest
   * retirement lost EVERY retirement.
   *
   * That mattered because the only caller is `esgReportService.buildEsgDataset`,
   * which derives `retiredCredits` / `retiredTco2e` and the by-project and
   * by-category groupings from exactly these retirement rows. A dropped
   * retirement understates the offset claim the ESG report exists to state —
   * the report would under-report, with no error and nothing missing on screen.
   *
   * Do not re-add a cross-type slice. If a caller needs a true "most recent N
   * overall", slice at the call site where the semantics are visible.
   *
   * @param {string} userId - User ID
   * @param {number} limit - Max rows fetched PER TYPE (purchases, retirements)
   * @returns {Promise<Array>} Combined history, newest first, up to 2 × limit
   */
  async getUserTransactionHistory(userId, limit = 50) {
    if (!this.supabase) {
      throw new Error('Supabase client not available')
    }

    try {
      // Purchases come from `credit_transactions`, NOT `credit_purchases`.
      //
      // This read used to target `credit_purchases`, and **nothing writes that
      // table** — not one migration, edge function or client path. Every
      // settled purchase is inserted into `credit_transactions` by
      // `process_marketplace_purchase` (20260606000400). So the purchases half
      // of this history was structurally empty, and the ESG report it feeds
      // printed "Credits purchased (lifetime): 0" for every user who has ever
      // bought anything.
      //
      // That is #11's original failure mode a third time — a wrong number on a
      // document someone discloses — but reached through the TABLE CHOICE
      // rather than through the cross-type slice (fixed 2026-07-28) or the
      // swallowed error (fixed 2026-07-30). Both earlier fixes edited this very
      // function without anyone asking whether the table under it had rows.
      //
      // `status = 'completed'` is deliberate: a pending or failed checkout is
      // not a purchase, and an ESG disclosure must not count one.
      // The project embed is two levels deep here — credit_transactions links
      // to projects THROUGH project_credits — which is the other reason the
      // shapes were never interchangeable.
      const { data: purchases, error: purchasesError } = await this.supabase
        .from('credit_transactions')
        .select(
          `
          id, quantity, total_amount, currency, status, created_at, completed_at,
          project_credits!inner(
            id,
            projects!inner(
              id,
              title,
              category,
              location
            )
          )
        `,
        )
        .eq('buyer_id', userId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false, nullsFirst: false })
        .limit(limit)

      // Throw, don't log-and-continue. A failed purchases query used to fall
      // through with `purchases` undefined, and the caller
      // (esgReportService.buildEsgDataset) would report the resulting 0 as the
      // user's actual purchased total on an exported ESG report. That is #11's
      // failure mode — a wrong number on a document someone discloses — arriving
      // by a different route than the slice that fix addressed.
      if (purchasesError) {
        console.error('❌ Error fetching purchases:', purchasesError)
        throw purchasesError
      }

      // Get credit retirements
      const { data: retirements, error: retirementsError } = await this.supabase
        .from('credit_retirements')
        .select(
          `
          *,
          projects!inner(
            id,
            title,
            category,
            location
          )
        `,
        )
        .eq('user_id', userId)
        .order('retired_at', { ascending: false })
        .limit(limit)

      // Same reasoning as purchases above, and worse here: retirements are the
      // OFFSET side of the report, so swallowing this reports zero offsets.
      if (retirementsError) {
        console.error('❌ Error fetching retirements:', retirementsError)
        throw retirementsError
      }

      // Combine and sort transactions
      const transactions = [
        ...(purchases || []).map((p) => {
          // credit_transactions -> project_credits -> projects. The old
          // credit_purchases shape had `projects` directly and a
          // `credits_amount` column; both are gone, and reading them off this
          // row would yield `undefined` quantities that sum to 0 — the same
          // zero, arrived at a second way.
          const project = p.project_credits?.projects
          return {
            id: p.id,
            type: 'purchase',
            project_title: project?.title || 'Unknown Project',
            project_category: project?.category || 'Unknown',
            project_location: project?.location || 'Unknown',
            quantity: p.quantity,
            amount: p.total_amount,
            currency: p.currency,
            status: p.status,
            created_at: p.completed_at || p.created_at,
            description: `Purchased ${p.quantity} credits from ${project?.title}`,
          }
        }),
        ...(retirements || []).map((r) => ({
          id: r.id,
          type: 'retirement',
          project_title: r.projects?.title || 'Unknown Project',
          project_category: r.projects?.category || 'Unknown',
          project_location: r.projects?.location || 'Unknown',
          quantity: r.quantity,
          amount: 0,
          currency: 'PHP',
          status: 'completed',
          created_at: r.retired_at,
          description: `Retired ${r.quantity} credits from ${r.projects?.title}`,
        })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

      // No cross-type slice here — see the JSDoc. Each query is already capped
      // at `limit`, so this is bounded; slicing the merged list is what dropped
      // retirements out of the ESG report.
      return transactions
    } catch (error) {
      // Rethrow for the same reason as getUserCreditPortfolio: "no transactions"
      // is an assertion, and the ESG export caller (CreditPortfolioView
      // .downloadEsg) already catches and surfaces the failure instead of
      // handing the user a report that reads "no credits to disclose yet".
      console.error('❌ Error fetching transaction history:', error)
      throw error
    }
  }
}

// Export singleton instance
export const creditOwnershipService = new CreditOwnershipService()




