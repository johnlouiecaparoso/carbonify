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
      console.error('❌ Error in getUserCreditPortfolio:', error)
      return []
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
      // Get credit purchases
      const { data: purchases, error: purchasesError } = await this.supabase
        .from('credit_purchases')
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
        .eq('buyer_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (purchasesError) {
        console.error('❌ Error fetching purchases:', purchasesError)
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

      if (retirementsError) {
        console.error('❌ Error fetching retirements:', retirementsError)
      }

      // Combine and sort transactions
      const transactions = [
        ...(purchases || []).map((p) => ({
          id: p.id,
          type: 'purchase',
          project_title: p.projects?.title || 'Unknown Project',
          project_category: p.projects?.category || 'Unknown',
          project_location: p.projects?.location || 'Unknown',
          quantity: p.credits_amount,
          amount: p.total_amount,
          currency: p.currency,
          status: p.status,
          created_at: p.created_at,
          description: `Purchased ${p.credits_amount} credits from ${p.projects?.title}`,
        })),
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
      console.error('❌ Error fetching transaction history:', error)
      return []
    }
  }
}

// Export singleton instance
export const creditOwnershipService = new CreditOwnershipService()




