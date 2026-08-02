import { getSupabase } from '@/services/supabaseClient'

/**
 * Filing and reading "report a problem" reports.
 *
 * THROWS on every failure, deliberately. The one thing this feature must never
 * do is tell someone their report was received when it was not — that is worse
 * than having no form, because it stops them telling anyone by another route.
 * See the header of supabase/migrations/20260802000600_support_reports.sql.
 */

const TABLE = 'support_reports'

/**
 * File a report.
 *
 * @param {object} report
 * @param {string} report.category  one of SUPPORT_CATEGORIES[].value
 * @param {string} report.subject   one-line summary
 * @param {string} report.details   the description
 * @param {string} [report.pagePath] where the user was; captured by the caller
 * @param {string} [report.reporterRole]
 * @param {string} [report.transactionId]
 * @returns {Promise<string>} the new report id
 */
export async function fileSupportReport({
  category,
  subject,
  details,
  pagePath = '',
  reporterRole = '',
  transactionId = '',
} = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  if (!category) throw new Error('Please choose what the problem is about')
  if (!subject?.trim()) throw new Error('Please give the problem a short title')
  if (!details?.trim()) throw new Error('Please describe the problem')

  // Identity comes from the session, never from the caller — the RLS insert
  // policy checks `auth.uid() = user_id`, so a client-supplied id would simply
  // be rejected, and quietly filing reports as someone else is not a thing we
  // want possible even in principle.
  const { data: sessionData } = await supabase.auth.getSession()
  const userId = sessionData?.session?.user?.id
  if (!userId) {
    throw new Error('Please sign in again before reporting a problem.')
  }

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      category,
      subject: subject.trim().slice(0, 200),
      details: details.trim().slice(0, 5000),
      page_path: pagePath.slice(0, 300) || null,
      reporter_role: reporterRole || null,
      transaction_id: transactionId || null,
      user_agent:
        typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 500) || null : null,
    })
    .select('id')
    .single()

  if (error) {
    // 42P01 = undefined_table. Worth naming, because the fix is an unapplied
    // migration rather than anything the user or the code did.
    if (error.code === '42P01') {
      console.error(
        `[support] ${TABLE} does not exist — apply migration 20260802000600_support_reports.sql`,
      )
      throw new Error(
        'Problem reports are not available yet on this deployment. Please contact support directly.',
      )
    }
    throw new Error(error.message || 'Could not file your report. Please try again.')
  }

  return data?.id
}

/**
 * The caller's own reports, newest first. Throws rather than returning [] —
 * "you have reported nothing" is a claim about the user, and a failed read is
 * not evidence for it.
 */
export async function getMySupportReports(limit = 20) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, category, subject, details, status, admin_notes, page_path, created_at, resolved_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message || 'Could not load your reports')
  return data || []
}

/** Admin: every report, newest first, optionally filtered by status. */
export async function listSupportReports(status = null, limit = 100) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')

  let query = supabase
    .from(TABLE)
    .select(
      'id, user_id, category, subject, details, page_path, reporter_role, transaction_id, status, admin_notes, created_at, resolved_at',
    )
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(error.message || 'Could not load support reports')
  return data || []
}

/** Admin: move a report along. */
export async function updateSupportReport(id, { status, adminNotes } = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  if (!id) throw new Error('A report id is required')

  const patch = {}
  if (status) {
    patch.status = status
    patch.resolved_at = ['resolved', 'wont_fix'].includes(status) ? new Date().toISOString() : null
  }
  if (adminNotes !== undefined) patch.admin_notes = adminNotes

  const { error } = await supabase.from(TABLE).update(patch).eq('id', id)
  if (error) throw new Error(error.message || 'Could not update the report')
}
