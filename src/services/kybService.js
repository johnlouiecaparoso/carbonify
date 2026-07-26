import { getSupabase } from '@/services/supabaseClient'

/**
 * KYB (Know Your Business) client service (Phase 2.5).
 * Sellers submit business verification; an admin reviews it
 * (review_kyb_application RPC), which sets profiles.kyb_verified — required
 * before withdrawals.
 */

/**
 * Submit (or re-submit) a business verification application.
 * @param {{
 *   businessName: string, businessType?: string, registrationNumber?: string,
 *   taxId?: string, businessAddress?: string, authorizedRepresentative?: string,
 *   registrationDocumentUrl?: string, taxDocumentUrl?: string
 * }} application
 */
export async function submitKyb(application = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  if (!application.businessName?.trim()) {
    throw new Error('Business name is required')
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await supabase
    .from('kyb_applications')
    .insert({
      user_id: user.id,
      business_name: application.businessName.trim(),
      business_type: application.businessType || null,
      registration_number: application.registrationNumber || null,
      tax_id: application.taxId || null,
      business_address: application.businessAddress || null,
      authorized_representative: application.authorizedRepresentative || null,
      registration_document_url: application.registrationDocumentUrl || null,
      tax_document_url: application.taxDocumentUrl || null,
    })
    .select()
    .single()

  if (error) throw new Error(error.message || 'Failed to submit KYB application')
  return data
}

/**
 * The caller's KYB status: { verified, application } where application is the
 * latest submission (or null).
 */
export async function getMyKyb() {
  const supabase = getSupabase()
  if (!supabase) return { verified: false, application: null }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { verified: false, application: null }

  const [{ data: profile, error: profileError }, { data: apps }] = await Promise.all([
    supabase.from('profiles').select('kyb_verified').eq('id', user.id).single(),
    supabase
      .from('kyb_applications')
      .select('id, business_name, status, review_notes, submitted_at, reviewed_at')
      .order('submitted_at', { ascending: false })
      .limit(1),
  ])

  // The profile row is the ONLY thing that decides `verified`, and this error
  // used to be discarded — so a transient failure came back as
  // `verified: false`, indistinguishable from a genuine "not verified yet".
  // Callers then told an already-verified seller that business verification was
  // required and disabled their withdraw button. A failed lookup is not a fact
  // about the user.
  //
  // The applications query is deliberately NOT fatal: it only supplies the
  // detail shown alongside the status, and losing it degrades the message
  // rather than inverting it.
  if (profileError) {
    throw new Error(profileError.message || 'Could not check your business verification status')
  }

  return {
    verified: Boolean(profile?.kyb_verified),
    application: Array.isArray(apps) && apps.length ? apps[0] : null,
  }
}

/**
 * Admin: list KYB applications (the `kyb_applications` RLS returns every row for
 * admins). Optionally filter by status ('pending' | 'approved' | 'rejected').
 */
export async function listKybApplications(status = null) {
  const supabase = getSupabase()
  if (!supabase) return []

  let query = supabase
    .from('kyb_applications')
    .select(
      `id, user_id, business_name, business_type, registration_number, tax_id,
       business_address, authorized_representative, registration_document_url,
       tax_document_url, status, submitted_at, reviewed_at, review_notes`,
    )
    .order('submitted_at', { ascending: false })
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    console.error('listKybApplications failed:', error.message)
    return []
  }
  return data || []
}

/**
 * Admin: approve or reject a KYB application via the admin-gated RPC. On approve,
 * the RPC flags the seller `kyb_verified`. Returns the updated application row.
 */
export async function reviewKyb(applicationId, approve, notes = '') {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  if (!applicationId) throw new Error('applicationId is required')

  const { data, error } = await supabase.rpc('review_kyb_application', {
    p_application_id: applicationId,
    p_approve: approve,
    p_notes: notes || '',
  })
  if (error) throw new Error(error.message || 'Failed to review KYB application')
  return data
}

/**
 * Admin: directly set a user's KYB verification, independent of any application
 * row. Used by User Management to verify (or un-verify) a business manually.
 * Returns the updated profile row.
 */
export async function adminSetKybVerified({ userId, verified }) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  if (!userId) throw new Error('userId is required')

  const { data, error } = await supabase.rpc('admin_set_kyb_verified', {
    p_user_id: userId,
    p_verified: !!verified,
  })
  if (error) throw new Error(error.message || 'Failed to set KYB verification')
  return data
}
