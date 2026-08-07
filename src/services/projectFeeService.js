import { getSupabase } from '@/services/supabaseClient'

/**
 * Project onboarding & verification fees.
 *
 * Two of the five stated revenue streams used to be a pair of numbers rendered
 * on the submit-project form and nothing else. Migration 20260806000300 turned
 * them into real receivables: an invoice is raised when a project is *validated*
 * (not when it is submitted — the platform bills only for a decision it has
 * already delivered), and it can be settled from the wallet or by card.
 *
 * ## What is deliberately NOT here
 * There is no `createInvoice`. Invoices are raised by database triggers and the
 * raising function is revoked from `authenticated`, so no client — this one
 * included — can conjure a debt or decide its amount. Everything below either
 * reads an invoice or asks the server to settle one it already owns.
 *
 * ## Reads throw
 * A failed read returns an error, never `[]`. An empty array is a *claim* —
 * "you owe nothing" — and rendering that from an RLS denial or a dropped
 * connection tells the user something false about their own account.
 */

export const FEE_TYPE_LABELS = Object.freeze({
  onboarding: 'Project onboarding',
  verification: 'Verification & certification',
})

export const FEE_STATUS_LABELS = Object.freeze({
  due: 'Due',
  paid: 'Paid',
  waived: 'Waived',
  void: 'Void',
})

/** The columns every fee read selects. One list, so the shapes cannot drift. */
const INVOICE_COLUMNS =
  'id, project_id, user_id, fee_type, source_ref, amount, currency, status, ' +
  'payment_method, payment_intent_id, waived_reason, paid_at, created_at'

function client() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  return supabase
}

// ── Pure helpers (unit-tested without a database) ──────────────────────────

/**
 * Total still owed across a set of invoices.
 * Only 'due' counts: 'paid' is collected, and 'waived'/'void' are decisions not
 * to collect. Summing those would report a debt that nobody owes.
 * @param {Array<{status?: string, amount?: number|string}>} invoices
 * @returns {number}
 */
export function totalOutstanding(invoices = []) {
  if (!Array.isArray(invoices)) return 0
  const total = invoices.reduce((sum, inv) => {
    if (inv?.status !== 'due') return sum
    const amount = Number(inv?.amount)
    return Number.isFinite(amount) ? sum + amount : sum
  }, 0)
  return Math.round(total * 100) / 100
}

/**
 * Can this invoice be paid right now, and if not, why?
 * Returned as a reason string rather than a bare boolean so the button and its
 * explanation cannot disagree — a disabled control with no stated cause is the
 * complaint this shape exists to prevent.
 * @param {{status?: string, amount?: number|string}|null} invoice
 * @param {number} walletBalance
 * @returns {{payable: boolean, reason: string}}
 */
export function payableFromWallet(invoice, walletBalance) {
  if (!invoice) return { payable: false, reason: 'No invoice selected.' }
  if (invoice.status !== 'due') {
    return { payable: false, reason: `This fee is already ${invoice.status}.` }
  }
  const amount = Number(invoice.amount)
  if (!Number.isFinite(amount) || amount <= 0) {
    return { payable: false, reason: 'This invoice has no valid amount.' }
  }
  const balance = Number(walletBalance)
  if (!Number.isFinite(balance) || balance < amount) {
    return { payable: false, reason: 'Your wallet balance does not cover this fee.' }
  }
  return { payable: true, reason: '' }
}

// ── Reads ──────────────────────────────────────────────────────────────────

/**
 * Every fee invoice addressed to the signed-in user, newest first.
 * @returns {Promise<Array<object>>}
 */
export async function listMyFeeInvoices() {
  const supabase = client()
  const { data: userData } = await supabase.auth.getUser()
  const userId = userData?.user?.id ?? null
  if (!userId) throw new Error('You must be signed in to view your fees.')

  const { data, error } = await supabase
    .from('project_fee_invoices')
    .select(INVOICE_COLUMNS)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load your fee invoices')
  return data || []
}

/**
 * Every fee invoice on the platform. RLS restricts this to admins — a
 * non-admin caller gets rows they own, not an error, so never present the
 * result as platform-wide without checking the caller's role first.
 * @param {{status?: string, limit?: number}} [options]
 * @returns {Promise<Array<object>>}
 */
export async function listAllFeeInvoices({ status = null, limit = 200 } = {}) {
  const supabase = client()
  let query = supabase
    .from('project_fee_invoices')
    .select(INVOICE_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(error.message || 'Failed to load fee invoices')
  return data || []
}

/**
 * Project titles for a set of invoices, as { [projectId]: title }.
 * Separate from the invoice read on purpose: `project_fee_invoices` has its own
 * RLS policy and `projects` has another, so an embedded join would make a
 * readable invoice disappear whenever the project row happened not to be
 * readable. A missing title is a cosmetic gap; a missing invoice is a bill the
 * user never sees.
 * @param {Array<{project_id?: string}>} invoices
 * @returns {Promise<Record<string, string>>}
 */
export async function fetchProjectTitles(invoices = []) {
  const ids = [...new Set((invoices || []).map((i) => i?.project_id).filter(Boolean))]
  if (ids.length === 0) return {}

  const supabase = client()
  const { data, error } = await supabase.from('projects').select('id, title').in('id', ids)
  if (error) return {} // cosmetic only — see the note above
  return Object.fromEntries((data || []).map((p) => [p.id, p.title]))
}

// ── Settlement ─────────────────────────────────────────────────────────────

/**
 * Pay a fee from the wallet balance. The RPC re-checks ownership, status and
 * balance server-side; this call cannot choose the amount.
 * @param {string} invoiceId
 * @returns {Promise<string>} the settled invoice id
 */
export async function payFeeFromWallet(invoiceId) {
  if (!invoiceId) throw new Error('An invoice is required')
  const supabase = client()
  const { data, error } = await supabase.rpc('pay_project_fee_from_wallet', {
    p_invoice_id: invoiceId,
  })
  if (error) throw new Error(error.message || 'Failed to pay the fee from your wallet')
  return data
}

/**
 * Start a card/e-wallet checkout for a fee. Mirrors the subscription flow: the
 * client sends only the invoice id, the Edge Function reads the authoritative
 * amount, and the invoice is marked paid only after the webhook confirms.
 * @param {string} invoiceId
 * @returns {Promise<{checkout_url?: string}>}
 */
export async function startFeeCheckout(invoiceId) {
  if (!invoiceId) throw new Error('An invoice is required')
  const supabase = client()

  const { data: result, error } = await supabase.functions.invoke('paymongo-checkout', {
    body: {
      action: 'create_project_fee_checkout',
      invoice_id: invoiceId,
      origin: window.location.origin,
    },
  })

  if (error) throw new Error(error.message || 'Failed to start the fee checkout')
  if (result?.error) throw new Error(result.error)
  return result
}

/**
 * Waive a fee. Admin-only — enforced by the RPC, not by hiding the button.
 * @param {string} invoiceId
 * @param {string} [reason]
 * @returns {Promise<boolean>} true if a 'due' invoice was waived
 */
export async function waiveFee(invoiceId, reason = '') {
  if (!invoiceId) throw new Error('An invoice is required')
  const supabase = client()
  const { data, error } = await supabase.rpc('waive_project_fee', {
    p_invoice_id: invoiceId,
    p_reason: reason || null,
  })
  if (error) throw new Error(error.message || 'Failed to waive the fee')
  return data === true
}
