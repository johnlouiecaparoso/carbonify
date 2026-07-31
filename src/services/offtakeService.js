import { getSupabase } from '@/services/supabaseClient'

/**
 * Offtake agreements (ERPAs) — expansion #5's contracted-revenue layer.
 *
 * A developer records the agreements that commit a buyer to purchasing a volume
 * of credits at a price. The Investor Portal then separates CONTRACTED revenue
 * (under a signed/active agreement) from SPECULATIVE revenue (remaining credits
 * at the listed price), and can show a downside IRR on contracted revenue alone.
 *
 * Confidentiality: full rows are owner-only under RLS. Investors read aggregates
 * through the `offtake_summary` RPC, which never returns a counterparty or price.
 */

/**
 * The only statuses that count as contracted revenue. A `draft` or `negotiating`
 * agreement is not committed, and `completed`/`terminated` no longer commit future
 * volume — counting any of them would restate speculative revenue as contracted,
 * which is the exact error this whole feature exists to prevent.
 */
export const CONTRACTED_STATUSES = Object.freeze(['signed', 'active'])

export const OFFTAKE_STATUSES = Object.freeze([
  'draft',
  'negotiating',
  'signed',
  'active',
  'completed',
  'terminated',
])

export const OFFTAKE_STATUS_LABELS = Object.freeze({
  draft: 'Draft',
  negotiating: 'Negotiating',
  signed: 'Signed',
  active: 'Active',
  completed: 'Completed',
  terminated: 'Terminated',
})

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// ── Pure helpers (unit-tested) ─────────────────────────────────────────────

/** Validate an offtake agreement. Returns an array of error strings ([] = ok). */
export function validateOfftakeInput(a = {}) {
  const errors = []
  if (!a.project_id) errors.push('A project is required')
  if (!a.counterparty_name || !String(a.counterparty_name).trim()) {
    errors.push('A counterparty name is required')
  }
  const volume = Number(a.volume_credits)
  if (!a.volume_credits || isNaN(volume) || volume <= 0) {
    errors.push('Enter a contracted volume greater than zero')
  }
  const price = Number(a.price_per_credit)
  if (a.price_per_credit == null || a.price_per_credit === '' || isNaN(price) || price < 0) {
    errors.push('Enter a price per credit of zero or more')
  }
  if (a.status && !OFFTAKE_STATUSES.includes(a.status)) errors.push('Unknown agreement status')
  if (a.start_date && a.end_date && new Date(a.end_date) < new Date(a.start_date)) {
    errors.push('The end date cannot be before the start date')
  }
  return errors
}

/** Contract value of a single agreement (volume × price), 2dp. */
export function agreementValue(a = {}) {
  const volume = Number(a.volume_credits) || 0
  const price = Number(a.price_per_credit) || 0
  if (volume <= 0 || price < 0) return 0
  return round2(volume * price)
}

/**
 * Roll a project's agreements into its contracted position.
 *
 * @param {Array} agreements rows from `offtake_agreements`
 * @returns {{contractedVolume:number, contractedRevenue:number, agreementCount:number,
 *   pipelineVolume:number, byStatus:Object}}
 *   `agreementCount` counts only contracted agreements; `pipelineVolume` is volume
 *   under agreements still being negotiated (visibility into what may yet convert).
 */
export function summarizeOfftakes(agreements = []) {
  const rows = Array.isArray(agreements) ? agreements : []
  const byStatus = {}
  let contractedVolume = 0
  let contractedRevenue = 0
  let agreementCount = 0
  let pipelineVolume = 0

  for (const a of rows) {
    const status = a?.status || 'draft'
    byStatus[status] = (byStatus[status] || 0) + 1

    if (CONTRACTED_STATUSES.includes(status)) {
      contractedVolume += Number(a.volume_credits) || 0
      contractedRevenue += agreementValue(a)
      agreementCount += 1
    } else if (status === 'draft' || status === 'negotiating') {
      pipelineVolume += Number(a.volume_credits) || 0
    }
  }

  return {
    contractedVolume: round2(contractedVolume),
    contractedRevenue: round2(contractedRevenue),
    agreementCount,
    pipelineVolume: round2(pipelineVolume),
    byStatus,
  }
}

// ── Data access ────────────────────────────────────────────────────────────

async function currentUser() {
  const supabase = getSupabase()
  if (!supabase) return { supabase: null, user: null }
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user: user || null }
}

/** The signed-in developer's agreements, newest first. */
export async function getMyOfftakes() {
  const { supabase, user } = await currentUser()
  if (!supabase || !user) return []
  const { data, error } = await supabase
    .from('offtake_agreements')
    .select('*')
    .eq('developer_id', user.id)
    .order('created_at', { ascending: false })
  if (error) {
    // Not []: an offtake agreement is a developer's forward revenue. "You have
    // no agreements" is a claim about their business, not a loading state.
    // OfftakeAgreementsView already renders `loadError` for this.
    console.error('Error loading offtake agreements:', error.message)
    throw new Error(error.message || 'Failed to load your offtake agreements')
  }
  return data || []
}

const textOrNull = (v) => (v ? String(v).trim() : null)

/** Create an agreement on a project the signed-in developer owns. */
export async function createOfftake(payload = {}) {
  const errors = validateOfftakeInput(payload)
  if (errors.length) throw new Error(errors[0])
  const { supabase, user } = await currentUser()
  if (!supabase || !user) throw new Error('Not authenticated')

  const row = {
    project_id: payload.project_id,
    developer_id: user.id,
    counterparty_name: String(payload.counterparty_name).trim(),
    volume_credits: Number(payload.volume_credits),
    price_per_credit: Number(payload.price_per_credit),
    currency: payload.currency || 'PHP',
    start_date: payload.start_date || null,
    end_date: payload.end_date || null,
    signed_on: payload.signed_on || null,
    status: payload.status || 'draft',
    notes: textOrNull(payload.notes),
  }
  const { data, error } = await supabase.from('offtake_agreements').insert(row).select().single()
  if (error) throw new Error(error.message || 'Failed to record the agreement')
  return data
}

/** Update an agreement (owner-scoped by RLS). */
export async function updateOfftake(id, patch = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const { data, error } = await supabase
    .from('offtake_agreements')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message || 'Failed to update the agreement')
  return data
}

/** Delete an agreement (owner-scoped by RLS). */
export async function deleteOfftake(id) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const { error } = await supabase.from('offtake_agreements').delete().eq('id', id)
  if (error) throw new Error(error.message || 'Failed to delete the agreement')
  return true
}

/**
 * Investor-facing aggregate: project_id → { contractedVolume, contractedRevenue,
 * agreementCount }. Never returns counterparty or price. Degrades to {} when the
 * RPC is absent (migration #27 not yet applied), so the portal still renders.
 */
export async function getOfftakeSummary(projectIds = []) {
  if (!projectIds.length) return {}
  const supabase = getSupabase()
  if (!supabase) return {}
  try {
    const { data, error } = await supabase.rpc('offtake_summary', { p_project_ids: projectIds })
    if (error) {
      console.warn('[offtake] summary unavailable, skipping:', error.message)
      return {}
    }
    return Object.fromEntries(
      (data || []).map((r) => [
        r.project_id,
        {
          contractedVolume: Number(r.contracted_volume) || 0,
          contractedRevenue: Number(r.contracted_value) || 0,
          agreementCount: Number(r.agreement_count) || 0,
        },
      ]),
    )
  } catch (err) {
    console.warn('[offtake] summary threw, skipping:', err?.message)
    return {}
  }
}
