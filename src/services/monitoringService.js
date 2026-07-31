import { getSupabase } from '@/services/supabaseClient'
import { getCurrentUserId } from '@/utils/authHelper'
import { logUserAction } from '@/services/auditService'

/**
 * MRV monitoring service.
 *
 * Developers create/submit monitoring reports (activity data + evidence). The
 * platform computes proposed emission reductions SERVER-SIDE via the
 * `calculate_report_vers` RPC. Verifiers approve reports, which inserts a
 * Verified Emission Reduction (VER) row — the DB trigger then mints credits.
 */

function client() {
  const supabase = getSupabase()
  if (!supabase) {
    throw new Error('Supabase client not available')
  }
  return supabase
}

/**
 * Validated projects owned by the developer that are eligible for monitoring.
 */
export async function getMonitorableProjects(userId = null) {
  const supabase = client()
  const uid = userId || (await getCurrentUserId())
  if (!uid) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('projects')
    .select('id, title, category, location, status, user_id')
    .eq('user_id', uid)
    .eq('status', 'validated')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load projects')
  return data || []
}

/**
 * Reports for a project (newest first).
 */
export async function getReportsByProject(projectId) {
  const supabase = client()
  const { data, error } = await supabase
    .from('monitoring_reports')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message || 'Failed to load reports')
  return data || []
}

/**
 * Full report with its activity data + evidence.
 */
export async function getReport(reportId) {
  const supabase = client()
  const { data: report, error } = await supabase
    .from('monitoring_reports')
    .select('*')
    .eq('id', reportId)
    .single()
  if (error) throw new Error(error.message || 'Report not found')

  const { data: activity } = await supabase
    .from('monitoring_activity_data')
    .select('*')
    .eq('report_id', reportId)

  const { data: evidence } = await supabase
    .from('monitoring_evidence')
    .select('*')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true })

  // The project rides along the way it does on the review-queue rows. Without
  // it the reviewer had no category, so the reduction-type suggestion always
  // received '' — and the emission factors (keyed by project_type) could not be
  // looked up at all. `user_id` is the owner, used for the self-review guard;
  // `status` drives the double-issuance warning.
  const { data: project } = await supabase
    .from('projects')
    .select('id, title, category, location, user_id, status')
    .eq('id', report.project_id)
    .maybeSingle()

  // Set here as well as in getReviewQueue: the review screen selects a report
  // through THIS function, not from the queue row, so a flag attached only to
  // the queue would never reach the screen that has to show it.
  return {
    ...report,
    project: project || null,
    doubleIssuanceRisk: alreadyIssuedOnValidation(project),
    activity: activity || [],
    evidence: evidence || [],
  }
}

/**
 * Emission factors for a project type, keyed by metric.
 *
 * Same source the server-side calculate_report_vers() joins against, so a
 * breakdown built from these reproduces the stored proposed_vers exactly.
 * Readable by any authenticated user; degrades to [] so the review screen still
 * renders without the breakdown.
 */
export async function getMethodologyFactors(projectType) {
  const supabase = client()
  if (!projectType) return []
  const { data, error } = await supabase
    .from('methodology_factors')
    .select('metric_key, label, unit, factor, description')
    .eq('project_type', projectType)
  if (error) {
    console.warn('[mrv] methodology factors unavailable:', error.message)
    return []
  }
  return data || []
}

/**
 * Reproduce the platform's VER arithmetic, line by line, for verifier review.
 *
 * Mirrors calculate_report_vers() (20260604010000):
 *   sum(activity.value * factor.factor) for factors matching the project type.
 *
 * That is an INNER JOIN server-side, so an activity metric with no factor for
 * this project type contributes NOTHING to the total and simply disappears.
 * Those lines are returned with `matched: false` and a zero subtotal, because a
 * metric silently worth nothing is exactly the kind of thing a verifier is
 * accountable for noticing.
 *
 * Pure — exported for unit testing.
 *
 * @param {Object} input
 * @param {Array<{metric_key:string, value:number, unit?:string}>} input.activity
 * @param {Array<{metric_key:string, label?:string, unit?:string, factor:number}>} input.factors
 * @returns {{lines:Array<Object>, total:number, unmatched:number}}
 */
export function buildVerCalculation({ activity = [], factors = [] } = {}) {
  const factorByKey = new Map(
    (factors || []).filter((f) => f?.metric_key).map((f) => [f.metric_key, f]),
  )

  const lines = (activity || []).map((row) => {
    const factorRow = factorByKey.get(row?.metric_key)
    const value = Number(row?.value) || 0
    const factor = factorRow ? Number(factorRow.factor) || 0 : null
    const matched = !!factorRow
    return {
      metricKey: row?.metric_key || '',
      label: factorRow?.label || row?.metric_key || 'Unknown metric',
      value,
      unit: row?.unit || factorRow?.unit || '',
      factor,
      // Unmatched metrics contribute 0 — the server-side join drops them.
      subtotal: matched ? value * factor : 0,
      matched,
    }
  })

  const total = lines.reduce((sum, line) => sum + line.subtotal, 0)
  return {
    lines,
    // Round the way a tCO2e figure is reported; the per-line values stay exact.
    total: Math.round(total * 1e6) / 1e6,
    unmatched: lines.filter((line) => !line.matched).length,
  }
}

/**
 * Create a new draft report.
 */
export async function createReport({ projectId, periodType = 'yearly', periodStart = null, periodEnd = null, notes = '' }, userId = null) {
  const supabase = client()
  const uid = userId || (await getCurrentUserId())
  if (!uid) throw new Error('User not authenticated')

  const { data, error } = await supabase
    .from('monitoring_reports')
    .insert([
      {
        project_id: projectId,
        period_type: periodType,
        period_start: periodStart,
        period_end: periodEnd,
        notes,
        status: 'draft',
        submitted_by: uid,
      },
    ])
    .select()
    .single()

  if (error) throw new Error(error.message || 'Failed to create report')
  return data
}

/**
 * Update a draft report's metadata (period, notes).
 */
export async function updateReportMeta(reportId, { periodType, periodStart, periodEnd, notes }) {
  const supabase = client()
  const fields = { updated_at: new Date().toISOString() }
  if (periodType !== undefined) fields.period_type = periodType
  if (periodStart !== undefined) fields.period_start = periodStart
  if (periodEnd !== undefined) fields.period_end = periodEnd
  if (notes !== undefined) fields.notes = notes

  const { data, error } = await supabase
    .from('monitoring_reports')
    .update(fields)
    .eq('id', reportId)
    .select()
    .single()
  if (error) throw new Error(error.message || 'Failed to update report')
  return data
}

/**
 * Replace a report's activity data with the supplied rows.
 * @param {string} reportId
 * @param {Array<{metric_key:string, value:number, unit:string}>} items
 */
export async function saveActivityData(reportId, items = []) {
  const supabase = client()

  // Clear existing rows then insert the current set (simple + idempotent)
  const { error: delError } = await supabase
    .from('monitoring_activity_data')
    .delete()
    .eq('report_id', reportId)
  if (delError) throw new Error(delError.message || 'Failed to update activity data')

  const rows = items
    .filter((i) => i.metric_key && i.value !== '' && i.value !== null && !isNaN(Number(i.value)))
    .map((i) => ({
      report_id: reportId,
      metric_key: i.metric_key,
      value: Number(i.value),
      unit: i.unit || null,
    }))

  if (rows.length > 0) {
    const { error: insError } = await supabase.from('monitoring_activity_data').insert(rows)
    if (insError) throw new Error(insError.message || 'Failed to save activity data')
  }

  return rows
}

/**
 * Attach an evidence item (file stored as a data URL, like project images).
 */
export async function addEvidence(reportId, { file_url, file_type = null, caption = '' }) {
  const supabase = client()

  // Capture metadata + content hash at upload (20260722000400). Best-effort:
  // integrity data supports the verifier's review, it is never a reason to lose
  // a developer's upload, so a failure here still stores the file.
  let integrity = {}
  try {
    const { analyseEvidence } = await import('@/utils/imageEvidence')
    integrity = await analyseEvidence(file_url)
  } catch (err) {
    console.warn('[mrv] evidence analysis skipped:', err?.message)
  }

  const insert = async (row) =>
    supabase.from('monitoring_evidence').insert([row]).select().single()

  let { data, error } = await insert({
    report_id: reportId,
    file_url,
    file_type,
    caption,
    ...integrity,
  })

  // Schema-drift safety, as the project services do: if the integrity columns
  // are not applied on this DB, store the evidence without them rather than
  // failing the upload.
  if (error && /column .* does not exist/i.test(error.message || '')) {
    console.warn('[mrv] integrity columns missing, storing evidence without them')
    ;({ data, error } = await insert({ report_id: reportId, file_url, file_type, caption }))
  }

  if (error) throw new Error(error.message || 'Failed to add evidence')
  return data
}

/**
 * Other evidence rows sharing this file's exact bytes.
 *
 * An identical hash on a different report means the same photo is doing duty
 * twice — the check the verifier cannot perform by eye. Excludes the row's own
 * report so re-uploading within one report is not reported as a duplicate.
 *
 * Verifier/admin only in practice (mrv_evidence_all is staff-or-owner), and
 * degrades to [] so a review screen never breaks over it.
 */
export async function findDuplicateEvidence(contentHash, excludeReportId = null) {
  if (!contentHash) return []
  const supabase = client()
  let query = supabase
    .from('monitoring_evidence')
    .select('id, report_id, caption, created_at')
    .eq('content_hash', contentHash)
  if (excludeReportId) query = query.neq('report_id', excludeReportId)

  const { data, error } = await query.limit(20)
  if (error) {
    console.warn('[mrv] duplicate evidence lookup unavailable:', error.message)
    return []
  }
  return data || []
}

export async function deleteEvidence(evidenceId) {
  const supabase = client()
  const { error } = await supabase.from('monitoring_evidence').delete().eq('id', evidenceId)
  if (error) throw new Error(error.message || 'Failed to delete evidence')
}

/**
 * Server-side emission-reduction calculation. Returns the proposed tCO2e.
 */
export async function calculateVers(reportId) {
  const supabase = client()
  const { data, error } = await supabase.rpc('calculate_report_vers', { p_report_id: reportId })
  if (error) throw new Error(error.message || 'Failed to calculate emission reductions')
  return Number(data) || 0
}

/**
 * Submit a report for verification (recomputes proposed VERs first).
 */
export async function submitReport(reportId) {
  const supabase = client()
  const uid = await getCurrentUserId()

  await calculateVers(reportId)

  const { data, error } = await supabase
    .from('monitoring_reports')
    .update({
      status: 'submitted',
      submitted_by: uid,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select()
    .single()

  if (error) throw new Error(error.message || 'Failed to submit report')

  try {
    await logUserAction('MRV_REPORT_SUBMITTED', 'monitoring_report', uid, reportId, {})
  } catch (e) {
    console.warn('audit log failed (non-critical):', e)
  }
  return data
}

// ───────────────────────── verifier actions ─────────────────────────────────

/**
 * Reports awaiting verification (submitted or under review), with project +
 * developer info. RLS lets verifiers/admins read all reports.
 */
export async function getReviewQueue() {
  const supabase = client()
  const { data: reports, error } = await supabase
    .from('monitoring_reports')
    .select('*')
    .in('status', ['submitted', 'under_review'])
    .order('submitted_at', { ascending: true })

  if (error) throw new Error(error.message || 'Failed to load review queue')
  if (!reports || reports.length === 0) return []

  const projectIds = [...new Set(reports.map((r) => r.project_id))]
  // `status` is selected so the reviewer can be told when approving this report
  // would be a SECOND issuance against the same project — see
  // alreadyIssuedOnValidation below.
  const { data: projects } = await supabase
    .from('projects')
    .select('id, title, category, location, user_id, status')
    .in('id', projectIds)

  return reports.map((r) => {
    const project = (projects || []).find((p) => p.id === r.project_id)
    return { ...r, project: project || null, doubleIssuanceRisk: alreadyIssuedOnValidation(project) }
  })
}

/**
 * Would approving a VER against this project mint credits it has ALREADY been
 * issued once?
 *
 * Live runs both issuance triggers at the same time, which no single migration
 * intended:
 *
 *   20260604010100  dropped trg_activate_validated_project and created
 *                   trg_mint_credits_on_ver_approval  (decoupled, mint-on-VER)
 *   20260626000500  re-created trg_activate_validated_project
 *   ...             nothing ever dropped trg_mint_credits_on_ver_approval
 *
 * So validating a project mints a pool and an active listing, and then
 * approving a VER against that same project mints again. For a registry that is
 * the cardinal error — the same tonne sold twice — and the only thing currently
 * preventing it is a reviewer remembering a sentence in DEFERRED_BACKLOG.md
 * (#17, still open: which model is canonical has not been decided).
 *
 * This does NOT block the approval. Which trigger to drop is an architecture
 * decision, and blocking would strand legitimate approvals if mint-on-VER turns
 * out to be the intended model. It exists so the warning reaches the one person
 * in a position to notice, at the moment they are deciding.
 *
 * @param {{status?: string}|null} project
 * @returns {boolean}
 */
export function alreadyIssuedOnValidation(project) {
  return ['validated', 'approved'].includes(String(project?.status || '').toLowerCase())
}

/**
 * Move a report into "under review".
 */
export async function startReview(reportId) {
  const supabase = client()
  const uid = await getCurrentUserId()
  const { data, error } = await supabase
    .from('monitoring_reports')
    .update({ status: 'under_review', reviewed_by: uid, updated_at: new Date().toISOString() })
    .eq('id', reportId)
    .select()
    .single()
  if (error) throw new Error(error.message || 'Failed to start review')
  return data
}

/**
 * Approve a report → records a VER (which mints credits via DB trigger).
 * @param {string} reportId
 * @param {{approvedQuantity:number, vintageYear?:number, projectId:string, notes?:string,
 *   reductionType?:'removal'|'avoidance'|''}} opts
 *   `reductionType` classifies the credits as removals or avoidances. Optional:
 *   omitting it leaves the VER unclassified rather than guessing.
 */
export async function approveReport(
  reportId,
  { approvedQuantity, vintageYear = null, projectId, notes = '', reductionType = '' },
) {
  const supabase = client()
  const uid = await getCurrentUserId()
  const qty = Number(approvedQuantity)
  if (isNaN(qty) || qty <= 0) {
    throw new Error('Approved quantity must be a positive number')
  }
  if (reductionType && !['removal', 'avoidance'].includes(reductionType)) {
    throw new Error('Reduction type must be either removal or avoidance')
  }

  // Independence: approving a VER mints credits against the project, so the
  // owner may not be the approver. Enforced by trg_guard_ver_self_approval
  // (20260722000100); checked here for a readable message.
  if (projectId && uid) {
    const { data: owned } = await supabase
      .from('projects')
      .select('user_id')
      .eq('id', projectId)
      .maybeSingle()
    if (owned?.user_id && owned.user_id === uid) {
      throw new Error(
        'You cannot approve emission reductions for your own project. Verification must be carried out by someone who does not own the project.',
      )
    }
  }

  // Approving mints credits, so departing from the platform's own calculation
  // has to be justified on the record. Read the stored figure rather than
  // trusting one passed in alongside the amount being overridden.
  const { data: reportRow } = await supabase
    .from('monitoring_reports')
    .select('proposed_vers')
    .eq('id', reportId)
    .maybeSingle()

  const proposed = Number(reportRow?.proposed_vers ?? qty)
  if (Math.abs(qty - proposed) > 0.000001 && String(notes || '').trim().length < 5) {
    throw new Error(
      `You are approving ${qty} tCO₂e against a calculated ${proposed}. Add a note (at least 5 characters) explaining the adjustment.`,
    )
  }

  const nowIso = new Date().toISOString()

  // 1) Mark the report approved
  const { error: reportError } = await supabase
    .from('monitoring_reports')
    .update({
      status: 'approved',
      reviewed_by: uid,
      reviewed_at: nowIso,
      review_notes: notes,
      updated_at: nowIso,
    })
    .eq('id', reportId)
  if (reportError) throw new Error(reportError.message || 'Failed to approve report')

  // 2) Record the VER — the trigger mints credits + ensures a listing
  const verRow = {
    report_id: reportId,
    project_id: projectId,
    approved_quantity: qty,
    vintage_year: vintageYear || new Date().getFullYear(),
    status: 'approved',
    approved_by: uid,
    approved_at: nowIso,
    ...(reductionType && { reduction_type: reductionType }),
  }

  let { data: ver, error: verError } = await supabase
    .from('verified_emission_reductions')
    .insert([verRow])
    .select()
    .single()

  // Schema-drift safety: `reduction_type` arrives with migration #29. Issuance is
  // the load-bearing step here — never fail a mint because a classification column
  // is missing. Retry without it; the VER lands unclassified.
  if (verError && /reduction_type/.test(verError.message || '')) {
    console.warn('[mrv] reduction_type absent, recording VER unclassified')
    delete verRow.reduction_type
    ;({ data: ver, error: verError } = await supabase
      .from('verified_emission_reductions')
      .insert([verRow])
      .select()
      .single())
  }
  if (verError) throw new Error(verError.message || 'Failed to record verified emission reduction')

  try {
    await logUserAction('MRV_REPORT_APPROVED', 'monitoring_report', uid, reportId, {
      approved_quantity: qty,
      ver_id: ver.id,
    })
  } catch (e) {
    console.warn('audit log failed (non-critical):', e)
  }

  return ver
}

/**
 * Reject a report (no credits minted).
 */
export async function rejectReport(reportId, notes = '') {
  const supabase = client()
  const uid = await getCurrentUserId()
  if (!notes || notes.trim().length < 5) {
    throw new Error('Please provide a rejection reason (at least 5 characters).')
  }
  const { data, error } = await supabase
    .from('monitoring_reports')
    .update({
      status: 'rejected',
      reviewed_by: uid,
      reviewed_at: new Date().toISOString(),
      review_notes: notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)
    .select()
    .single()
  if (error) throw new Error(error.message || 'Failed to reject report')

  try {
    await logUserAction('MRV_REPORT_REJECTED', 'monitoring_report', uid, reportId, {})
  } catch (e) {
    console.warn('audit log failed (non-critical):', e)
  }
  return data
}
