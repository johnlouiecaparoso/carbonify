import { getSupabase } from '@/services/supabaseClient'

/**
 * Seller payout / withdrawal client service (Phase 2.4).
 *
 * Withdrawals draw from the seller's ledger balance (seller_payable), not the
 * wallet. The request_payout RPC reserves the funds and records a payout_request;
 * a server-side worker (process-payouts) disburses it via the PayoutProvider.
 */

/** The caller's seller balance: { available, held, currency }. */
export async function getSellerBalance() {
  const supabase = getSupabase()
  if (!supabase) return { available: 0, held: 0, currency: 'PHP' }

  const { data, error } = await supabase.rpc('get_my_seller_balance')
  // Throw rather than returning zeros. A swallowed error here rendered
  // "PHP 0.00 available" — which a seller reads as "I have no money", not as
  // "we could not look". On the page where someone decides whether to withdraw,
  // an invented zero is worse than an error.
  if (error) throw new Error(error.message || 'Could not load your seller balance')
  // RPC returns a single-row table.
  const row = Array.isArray(data) ? data[0] : data
  return {
    available: Number(row?.available) || 0,
    held: Number(row?.held) || 0,
    currency: row?.currency || 'PHP',
  }
}

/**
 * The caller's still-held escrow, soonest release first.
 *
 * `get_my_seller_balance` returns a single `held` total with no dates, so the
 * earnings page could tell a seller that money existed and was not theirs yet,
 * without ever saying when it would be — the one question that balance actually
 * raises. `escrow_holds.hold_until` has always carried the answer, and sellers
 * have had RLS read access to their own rows since 20260606000600; nothing
 * queried it.
 *
 * @returns {Promise<Array<{id: string, amount: number, currency: string, holdUntil: (string|null), transactionId: string}>>}
 */
export async function getMyEscrowHolds(limit = 50) {
  const supabase = getSupabase()
  if (!supabase) return []

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('escrow_holds')
    .select('id, amount, currency, hold_until, transaction_id')
    .eq('seller_id', user.id)
    .eq('status', 'held')
    // Matches idx_escrow_holds_due (status, hold_until); nulls last so a hold
    // with no window set never claims to be the next release.
    .order('hold_until', { ascending: true, nullsFirst: false })
    .limit(limit)

  if (error) throw new Error(error.message || 'Could not load your escrow holds')

  return (data || []).map((h) => ({
    id: h.id,
    amount: Number(h.amount) || 0,
    currency: h.currency || 'PHP',
    holdUntil: h.hold_until || null,
    transactionId: h.transaction_id,
  }))
}

/**
 * The soonest upcoming escrow release, or null when nothing is held.
 *
 * Pure so the "next release" line can be unit-tested without a database.
 *
 * @param {Array<{amount?: number, holdUntil?: (string|null)}>} holds
 */
export function nextEscrowRelease(holds = []) {
  const dated = (holds || []).filter((h) => h?.holdUntil)
  if (!dated.length) return null

  let soonest = dated[0]
  for (const h of dated) {
    if (new Date(h.holdUntil) < new Date(soonest.holdUntil)) soonest = h
  }
  // Sum everything releasing on that same day, not just the one row — a seller
  // reads this as "what lands next", and same-day holds land together.
  const day = String(soonest.holdUntil).slice(0, 10)
  const amount = dated
    .filter((h) => String(h.holdUntil).slice(0, 10) === day)
    .reduce((sum, h) => sum + (Number(h.amount) || 0), 0)

  return { holdUntil: soonest.holdUntil, amount: round2(amount) }
}

/**
 * Request a withdrawal of `amount` to `destination`.
 * @param {{ amount: number, destination: { method: string, accountName: string, accountNumber: string, bankCode?: string }, idempotencyKey?: string }} args
 * @returns {Promise<string>} the payout request id
 */
export async function requestWithdrawal({ amount, destination, idempotencyKey } = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')

  if (!amount || amount <= 0) throw new Error('A positive amount is required')
  if (!destination?.method || !destination?.accountNumber || !destination?.accountName) {
    throw new Error('Destination method, account name and account number are required')
  }
  if (destination.method === 'bank' && !destination.bankCode) {
    throw new Error('Bank withdrawals require a bank code')
  }

  const { data, error } = await supabase.rpc('request_payout', {
    p_amount: amount,
    p_destination: destination,
    p_idempotency_key: idempotencyKey ?? null,
  })
  if (error) throw new Error(error.message || 'Failed to request withdrawal')
  return data
}

/** The caller's sales (as seller), most recent first. */
export async function getMySales(limit = 50) {
  const supabase = getSupabase()
  if (!supabase) return []

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  // transaction_fee is selected because the seller is entitled to see it: the
  // "Total" on a sale is GROSS, but what reaches their balance is gross minus
  // this fee (process_marketplace_purchase computes v_seller_net exactly this
  // way and credits seller_payable with it). Without the fee column the sales
  // table and the available balance disagree and nothing in the UI explains why.
  const { data, error } = await supabase
    .from('credit_transactions')
    .select(
      'id, quantity, price_per_credit, total_amount, transaction_fee, currency, status, created_at, completed_at',
    )
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  // Throw, don't return []. An empty array is indistinguishable from "you have
  // made no sales", so a failed query used to tell a seller with a full ledger
  // that they had sold nothing.
  if (error) throw new Error(error.message || 'Could not load your sales')
  return (data || []).map((row) => ({ ...row, net_amount: netOf(row) }))
}

/**
 * What the seller actually receives for a sale: gross less the platform fee.
 *
 * Mirrors `v_seller_net := v_amount - v_fee` in
 * `20260606000400_process_marketplace_purchase.sql`. Kept as one exported
 * helper so the per-sale row and the per-project rollup cannot drift apart.
 *
 * @param {{total_amount?: number|string, transaction_fee?: number|string}} row
 * @returns {number}
 */
export function netOf(row) {
  return round2((Number(row?.total_amount) || 0) - (Number(row?.transaction_fee) || 0))
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * Aggregate a seller's completed sales into a per-project earnings breakdown —
 * pure and side-effect-free so it can be unit-tested without a DB.
 *
 * Only `completed` sales count toward earnings; pending/refunded rows are
 * ignored so the totals stay honest (a refund flips a row's status rather than
 * adding a negative row). Result is sorted by gross earnings, highest first.
 *
 * @param {Array<{project_id?:string, project_title?:string, quantity?:number, total_amount?:number, currency?:string, status?:string, date?:string}>} rows
 * @returns {Array<{projectId:string, projectTitle:string, salesCount:number, creditsSold:number, grossEarnings:number, currency:string, lastSaleDate:(string|null)}>}
 */
export function aggregateSalesByProject(rows = []) {
  const byProject = new Map()

  for (const r of rows || []) {
    if (r?.status !== 'completed') continue
    const id = r.project_id || 'unknown'
    const existing = byProject.get(id) || {
      projectId: id,
      projectTitle: r.project_title || 'Unknown Project',
      salesCount: 0,
      creditsSold: 0,
      grossEarnings: 0,
      platformFees: 0,
      netEarnings: 0,
      currency: r.currency || 'PHP',
      lastSaleDate: null,
    }

    existing.salesCount += 1
    existing.creditsSold += Number(r.quantity) || 0
    existing.grossEarnings += Number(r.total_amount) || 0
    existing.platformFees += Number(r.transaction_fee) || 0
    existing.netEarnings += netOf(r)
    if (r.date && (!existing.lastSaleDate || new Date(r.date) > new Date(existing.lastSaleDate))) {
      existing.lastSaleDate = r.date
    }

    byProject.set(id, existing)
  }

  return Array.from(byProject.values())
    .map((p) => ({
      ...p,
      grossEarnings: round2(p.grossEarnings),
      platformFees: round2(p.platformFees),
      netEarnings: round2(p.netEarnings),
    }))
    .sort((a, b) => b.grossEarnings - a.grossEarnings)
}

/**
 * The caller's completed sales grouped per project (earnings + issuance/volume
 * history). Reads `credit_transactions` joined to the project, then aggregates
 * client-side via {@link aggregateSalesByProject}.
 */
export async function getMySalesByProject(limit = 200) {
  const supabase = getSupabase()
  if (!supabase) return []

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const { data, error } = await supabase
    .from('credit_transactions')
    .select(
      `id, quantity, total_amount, transaction_fee, currency, status, created_at, completed_at,
       project_credits!inner(projects!inner(id, title))`,
    )
    .eq('seller_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message || 'Could not load your earnings by project')

  const rows = (data || []).map((t) => ({
    project_id: t.project_credits?.projects?.id,
    project_title: t.project_credits?.projects?.title,
    quantity: t.quantity,
    total_amount: t.total_amount,
    transaction_fee: t.transaction_fee,
    currency: t.currency,
    status: t.status,
    date: t.completed_at || t.created_at,
  }))

  return aggregateSalesByProject(rows)
}

/** The caller's payout requests, most recent first. */
export async function getMyPayouts(limit = 20) {
  const supabase = getSupabase()
  if (!supabase) return []

  const { data, error } = await supabase
    .from('payout_requests')
    .select('id, amount, currency, status, destination, failure_reason, created_at, settled_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message || 'Could not load your withdrawals')
  return data || []
}
