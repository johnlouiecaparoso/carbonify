import { getSupabase } from '@/services/supabaseClient'

/**
 * Dispute client service (Phase 2.6). Buyers open disputes on their own
 * transactions; an admin resolves them (resolve_dispute RPC), and a refund
 * resolution triggers the compensating reversal (refund_purchase).
 */

/** Buyer opens a dispute on a transaction. Returns the dispute id. */
export async function openDispute({ transactionId, reason } = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  if (!transactionId) throw new Error('transactionId is required')
  if (!reason?.trim()) throw new Error('A reason is required')

  const { data, error } = await supabase.rpc('open_dispute', {
    p_transaction_id: transactionId,
    p_reason: reason.trim(),
  })
  if (error) throw new Error(error.message || 'Failed to open dispute')
  return data
}

/**
 * The caller's disputes (RLS returns own + admin sees all), most recent first.
 *
 * Throws rather than returning []. "You have reported no problems" is a claim
 * about the user; a failed query is not evidence for it. MyDisputesView already
 * has the catch that renders the difference.
 */
export async function getMyDisputes(limit = 20) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')

  const { data, error } = await supabase
    .from('disputes')
    .select('id, transaction_id, reason, status, resolution_notes, created_at, resolved_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching disputes:', error)
    throw new Error(error.message || 'Failed to load your reported problems')
  }
  return data || []
}

/**
 * Admin: all disputes (the RLS returns every row for admins). Optionally filter
 * by status ('open' | 'resolved_refunded' | 'resolved_rejected').
 */
export async function listAllDisputes(status = null, limit = 100) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')

  let query = supabase
    .from('disputes')
    .select('id, transaction_id, raised_by, reason, status, resolution_notes, created_at, resolved_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    console.error('Error fetching disputes:', error)
    throw new Error(error.message || 'Failed to load disputes')
  }
  return data || []
}

/** Admin: recent transactions (via the admin-gated RPC) for the refund console. */
export async function listRecentTransactions(limit = 50) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')

  const { data, error } = await supabase.rpc('admin_recent_transactions', { p_limit: limit })
  if (error) {
    console.error('Error fetching recent transactions:', error)
    throw new Error(error.message || 'Failed to load recent transactions')
  }
  return data || []
}

/** Admin: resolve a dispute; refunding triggers the compensating reversal. */
export async function resolveDispute(disputeId, refund, notes = '') {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  if (!disputeId) throw new Error('disputeId is required')

  const { error } = await supabase.rpc('resolve_dispute', {
    p_dispute_id: disputeId,
    p_refund: refund,
    p_notes: notes || '',
  })
  if (error) throw new Error(error.message || 'Failed to resolve dispute')
}

/**
 * Admin: refund a transaction directly (no buyer dispute required) via the
 * admin-gated admin_refund_transaction RPC.
 */
export async function adminRefundTransaction(transactionId, reason = '') {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  if (!transactionId) throw new Error('transactionId is required')

  const { error } = await supabase.rpc('admin_refund_transaction', {
    p_transaction_id: transactionId,
    p_reason: reason || '',
  })
  if (error) throw new Error(error.message || 'Failed to refund transaction')
}
