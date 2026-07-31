// ============================================================================
// Data Privacy (DPA) service — self-service data export + account-deletion
// requests, fulfilling the data-subject rights promised in the Privacy Policy
// (Data Privacy Act of 2012 / GDPR-style access, portability, and erasure).
//
//  * exportMyData()       — gather everything we hold about the signed-in user
//                           into one JSON object (RLS scopes the reads to them).
//  * downloadMyData()     — run the export and trigger a browser download.
//  * requestAccountDeletion() — record a deletion request for admin processing.
//  * getMyDataRequests()  — list the user's past requests.
//  * cancelDeletionRequest() — withdraw a still-pending deletion request.
//
// Export is drift-proof: each source lists candidate user-id columns and we try
// them in turn, silently skipping tables/columns that don't exist or that RLS
// blocks. New tables only need a line added to USER_DATA_SOURCES.
// ============================================================================

import { getSupabase } from '@/services/supabaseClient'
import { getSession } from '@/services/authService'
import { logUserAction } from '@/services/auditService'

const REQUESTS_TABLE = 'data_subject_requests'

// Tables that hold personal data, with the column(s) that key a row to a user.
// We try each candidate column and merge the matches (e.g. a user can appear in
// credit_transactions as either buyer or seller).
const USER_DATA_SOURCES = [
  { table: 'profiles', columns: ['id'], label: 'Profile' },
  { table: 'projects', columns: ['user_id'], label: 'Projects' },
  { table: 'credit_ownership', columns: ['user_id'], label: 'Credit holdings' },
  { table: 'credit_transactions', columns: ['buyer_id', 'seller_id'], label: 'Transactions' },
  { table: 'credit_purchases', columns: ['buyer_id', 'user_id'], label: 'Purchases' },
  { table: 'credit_retirements', columns: ['user_id'], label: 'Retirements' },
  { table: 'certificates', columns: ['user_id', 'buyer_id'], label: 'Certificates' },
  { table: 'payment_intents', columns: ['user_id'], label: 'Payments' },
  { table: 'payout_requests', columns: ['seller_id'], label: 'Payouts' },
  { table: 'subscriptions', columns: ['user_id'], label: 'Subscriptions' },
  { table: 'kyc_applications', columns: ['user_id'], label: 'KYC applications' },
  { table: 'kyb_applications', columns: ['user_id'], label: 'KYB applications' },
  { table: 'role_applications', columns: ['user_id'], label: 'Role applications' },
  { table: 'project_comments', columns: ['author_id', 'user_id'], label: 'Project comments' },
  { table: 'monitoring_reports', columns: ['user_id'], label: 'Monitoring reports' },
  { table: 'watchlist', columns: ['user_id'], label: 'Watchlist' },
  { table: 'system_notifications', columns: ['user_id'], label: 'Notifications' },
  { table: 'lgu_emissions_records', columns: ['user_id'], label: 'LGU emissions records' },
  { table: 'audit_logs', columns: ['user_id'], label: 'Activity log' },
]

async function getCurrentUser() {
  const session = await getSession()
  const user = session?.user
  if (!user?.id) throw new Error('You must be signed in to manage your data.')
  return user
}

function dedupeRows(rows) {
  const seen = new Set()
  const out = []
  for (const row of rows) {
    const key = row?.id ?? JSON.stringify(row)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}

/**
 * Collect all rows a single source holds for this user across its candidate
 * columns. Returns [] on any error (missing table/column or RLS) so one bad
 * source never breaks the whole export.
 */
async function collectFromSource(supabase, source, userId) {
  const collected = []
  for (const column of source.columns) {
    try {
      const { data, error } = await supabase.from(source.table).select('*').eq(column, userId)
      if (error) {
        // Unknown table/column or RLS — skip this column quietly.
        if (import.meta.env.DEV) {
          console.warn(`[dataPrivacy] skip ${source.table}.${column}: ${error.message}`)
        }
        continue
      }
      if (Array.isArray(data) && data.length) collected.push(...data)
    } catch (e) {
      if (import.meta.env.DEV) {
        console.warn(`[dataPrivacy] error reading ${source.table}.${column}:`, e?.message)
      }
    }
  }
  return dedupeRows(collected)
}

/**
 * Build a single JSON-serialisable object with everything we hold about the
 * signed-in user. Empty sources are omitted to keep the export readable.
 */
export async function exportMyData() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Service unavailable. Please try again in a moment.')

  const user = await getCurrentUser()

  const sections = {}
  for (const source of USER_DATA_SOURCES) {
    const rows = await collectFromSource(supabase, source, user.id)
    if (rows.length) sections[source.table] = rows
  }

  const totalRecords = Object.values(sections).reduce((sum, rows) => sum + rows.length, 0)

  const exportPayload = {
    export_metadata: {
      generated_at: new Date().toISOString(),
      user_id: user.id,
      email: user.email ?? null,
      platform: 'Carbonify',
      format_version: 1,
      note: 'Personal data export under your Data Privacy Act / data-subject access rights. Only records visible to your account are included.',
      total_records: totalRecords,
      sections: Object.keys(sections),
    },
    data: sections,
  }

  // Record the access for the audit trail (best-effort; never blocks the export).
  try {
    await supabase.rpc('submit_data_subject_request', { p_type: 'export', p_reason: null })
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[dataPrivacy] could not log export request:', e?.message)
  }
  logUserAction('DATA_EXPORT', 'user', user.id, user.id, {
    total_records: totalRecords,
  }).catch(() => {})

  return exportPayload
}

/** Run the export and download it as a JSON file. Returns the export payload. */
export async function downloadMyData() {
  const payload = await exportMyData()

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const stamp = new Date().toISOString().slice(0, 10)
    const a = document.createElement('a')
    a.href = url
    a.download = `carbonify-my-data-${stamp}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return payload
}

/**
 * Record a request to delete this account. Erasure is performed by an admin /
 * the account-deletion edge function (needs service-role); this captures the
 * request and returns its id. Idempotent: an existing open request is reused.
 */
export async function requestAccountDeletion(reason = null) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Service unavailable. Please try again in a moment.')

  const user = await getCurrentUser()

  const { data, error } = await supabase.rpc('submit_data_subject_request', {
    p_type: 'deletion',
    p_reason: reason || null,
  })
  if (error) throw new Error(error.message || 'Could not submit your deletion request.')

  logUserAction('ACCOUNT_DELETION_REQUESTED', 'user', user.id, user.id, {
    request_id: data,
  }).catch(() => {})

  return data // request id
}

/** List the signed-in user's data-subject requests, newest first. */
export async function getMyDataRequests() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')

  const user = await getCurrentUser()
  const { data, error } = await supabase
    .from(REQUESTS_TABLE)
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    // Not []: a user who asked to be deleted, and is shown no pending request,
    // reasonably concludes the request never registered and asks again.
    console.warn('[dataPrivacy] could not load requests:', error.message)
    throw new Error(error.message || 'Failed to load your data requests')
  }
  return data || []
}

/** Withdraw a still-pending deletion request. */
export async function cancelDeletionRequest(requestId) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Service unavailable. Please try again in a moment.')

  await getCurrentUser()
  const { error } = await supabase.rpc('cancel_data_subject_request', { p_id: requestId })
  if (error) throw new Error(error.message || 'Could not cancel the request.')
  return true
}

// ============================================================================
// Admin side — actioning the queue.
//
// Everything above is what the data subject can do for themselves. Until
// 20260722000700 there was nothing here at all: requests landed in a table with
// admin-action columns and an index built for a pending queue, and no admin
// could see one. Under the Data Privacy Act a deletion request starts a clock,
// so an unread queue is a legal exposure, not a missing convenience.
//
// NOTE: none of this erases anything. The account-deletion worker holds the
// service role and is gated by a shared secret a browser must never carry, so
// these functions manage triage and status only.
// ============================================================================

/** Statuses an admin may move a request into (see the RPC). */
export const DSR_ADMIN_STATUSES = ['in_progress', 'completed', 'rejected']

/** Statuses that still need someone to act. */
export const DSR_OPEN_STATUSES = ['pending', 'in_progress']

/**
 * Every data-subject request, newest first, with the requester's name/email
 * attached. Admin-only in practice — RLS returns just the caller's own rows to
 * anyone else, so a non-admin sees their own requests rather than an error.
 *
 * @param {Object} [opts]
 * @param {string} [opts.status] - a single status, or 'open' for anything unresolved
 */
export async function listDataSubjectRequests({ status = 'open' } = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')

  let query = supabase.from(REQUESTS_TABLE).select('*').order('created_at', { ascending: false })
  if (status === 'open') query = query.in('status', DSR_OPEN_STATUSES)
  else if (status && status !== 'all') query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    // Not []: this is the DPA erasure queue, and every row on it has a
    // statutory clock running. "No outstanding requests" is precisely the
    // wrong thing to show when the query failed — the same shape as the
    // account-deletion secret that made every request queue forever while
    // the docs recorded erasure as shipping.
    console.warn('[dataPrivacy] could not load requests:', error.message)
    throw new Error(error.message || 'Failed to load data-subject requests')
  }

  const rows = data || []
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
  if (!userIds.length) return rows

  // Best-effort: if profile reads are restricted the queue still renders, just
  // without names.
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)

  const byId = new Map((profiles || []).map((p) => [p.id, p]))
  return rows.map((r) => ({
    ...r,
    requester_name: byId.get(r.user_id)?.full_name || null,
    requester_email: byId.get(r.user_id)?.email || null,
  }))
}

/**
 * Move a request through triage. `notes` is required when rejecting — refusing
 * a statutory right has to carry a reason on the record.
 *
 * @param {string} requestId
 * @param {'in_progress'|'completed'|'rejected'} status
 * @param {string} [notes]
 */
export async function processDataSubjectRequest(requestId, status, notes = '') {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Service unavailable. Please try again in a moment.')
  if (!requestId) throw new Error('Request is required')
  if (!DSR_ADMIN_STATUSES.includes(status)) throw new Error('Unsupported status')

  const { data, error } = await supabase.rpc('process_data_subject_request', {
    p_id: requestId,
    p_status: status,
    p_notes: notes || null,
  })
  if (error) throw new Error(error.message || 'Could not update the request.')

  logUserAction('DSR_PROCESSED', 'data_subject_request', null, requestId, {
    status,
  }).catch(() => {})

  return data
}

/**
 * Split a request list into the counts an admin cares about.
 * Pure — exported for unit testing.
 */
export function summariseDataRequests(requests = []) {
  const summary = { total: requests.length, pending: 0, inProgress: 0, deletions: 0, overdue: 0 }
  // The DPA gives a controller a limited window to respond; 30 days is the
  // convention used here to surface anything ageing, not a legal assertion.
  const cutoff = Date.now() - 30 * 86400000

  for (const r of requests) {
    if (r.status === 'pending') summary.pending += 1
    if (r.status === 'in_progress') summary.inProgress += 1
    if (r.request_type === 'deletion' && DSR_OPEN_STATUSES.includes(r.status)) summary.deletions += 1
    if (
      DSR_OPEN_STATUSES.includes(r.status) &&
      r.created_at &&
      new Date(r.created_at).getTime() < cutoff
    ) {
      summary.overdue += 1
    }
  }
  return summary
}
