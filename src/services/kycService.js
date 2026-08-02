import { getSupabase } from '@/services/supabaseClient'
import { getCurrentUserId } from '@/utils/authHelper'
import { logUserAction } from '@/services/auditService'

/**
 * KYC (Know Your Customer) service.
 *
 * Buyers/sellers submit a verification application; admins approve it, which
 * raises their profiles.kyc_level. Trading is gated on kyc_level
 * (assertCanTrade), with the threshold managed by admins in System Config
 * (app_settings.min_kyc_level_to_trade). MIN_KYC_LEVEL_TO_TRADE is the
 * fallback default when the setting is unavailable.
 */

export const MIN_KYC_LEVEL_TO_TRADE = 1

/**
 * KYC tiers (mirrors the `kyc_tiers` app_setting seed). Level 3 is an admin-only
 * "Enhanced" override not offered in the normal application flow.
 */
export const KYC_LEVELS = [
  { level: 0, label: 'Unverified' },
  { level: 1, label: 'Basic' },
  { level: 2, label: 'Verified' },
  { level: 3, label: 'Enhanced' },
]

/** Human label for a KYC level (e.g. 1 → "Basic"). */
export function kycLevelLabel(level) {
  const n = Number(level) || 0
  return KYC_LEVELS.find((t) => t.level === n)?.label || `Level ${n}`
}

/**
 * Admin: manually set a user's KYC level (and optionally role / full name) via
 * the admin-gated RPC. Used by User Management — a testing override for the
 * normal kyc_applications review flow.
 */
export async function adminSetUserProfile({ userId, kycLevel, role, fullName } = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  if (!userId) throw new Error('userId is required')

  const { data, error } = await supabase.rpc('admin_set_user_profile', {
    p_user_id: userId,
    p_kyc_level: kycLevel ?? null,
    p_role: role ?? null,
    p_full_name: fullName ?? null,
  })
  if (error) throw new Error(error.message || 'Failed to update user')
  return data
}

/**
 * Admin: set an LGU account's municipality / province.
 *
 * Deliberately a SEPARATE RPC from adminSetUserProfile rather than two more of
 * its parameters — see the header of
 * supabase/migrations/20260802000700_admin_set_user_jurisdiction.sql. Short
 * version: changing that function's signature would break editing EVERY user
 * on a database where the migration has not been applied yet.
 *
 * Pass '' (not null) to clear a field; null leaves it unchanged.
 */
export async function adminSetUserJurisdiction({ userId, municipality, province } = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  if (!userId) throw new Error('userId is required')

  const { data, error } = await supabase.rpc('admin_set_user_jurisdiction', {
    p_user_id: userId,
    p_municipality: municipality ?? null,
    p_province: province ?? null,
  })
  if (error) {
    // PGRST202 = no function matching that name/arguments, i.e. the migration
    // is not applied. Name it, because the fix is a deployment step and the raw
    // message sends you looking at the client instead.
    if (error.code === 'PGRST202') {
      throw new Error(
        'Setting an LGU jurisdiction is not available on this deployment yet ' +
          '(migration 20260802000700 has not been applied). The rest of the changes were saved.',
      )
    }
    throw new Error(error.message || 'Failed to set the jurisdiction')
  }
  return data
}

function client() {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  return supabase
}

/**
 * Current user's KYC level (0 if none).
 */
export async function getMyKycLevel(userId = null) {
  const supabase = client()
  const uid = userId || (await getCurrentUserId())
  if (!uid) return 0
  const { data, error } = await supabase
    .from('profiles')
    .select('kyc_level')
    .eq('id', uid)
    .single()
  if (error) return 0
  return Number(data?.kyc_level) || 0
}

/**
 * Throw if the user is not KYC-verified enough to trade.
 */
export async function assertCanTrade(userId = null) {
  const [level, minLevel] = await Promise.all([
    getMyKycLevel(userId),
    getMinTradeLevel(),
  ])
  if (level < minLevel) {
    throw new Error(
      'KYC verification required before trading. Please complete identity verification on the KYC page.',
    )
  }
  return true
}

/** Admin-configured minimum KYC level to trade (falls back to the constant). */
async function getMinTradeLevel() {
  try {
    const { getMinKycLevelToTrade } = await import('@/services/settingsService')
    return await getMinKycLevelToTrade()
  } catch {
    return MIN_KYC_LEVEL_TO_TRADE
  }
}

/**
 * The current user's KYC applications (newest first).
 */
export async function getMyKycApplications(userId = null) {
  const supabase = client()
  const uid = userId || (await getCurrentUserId())
  if (!uid) return []
  const { data, error } = await supabase
    .from('kyc_applications')
    .select('*')
    .eq('user_id', uid)
    .order('submitted_at', { ascending: false })
  if (error) throw new Error(error.message || 'Failed to load KYC applications')
  return data || []
}

/**
 * Submit a KYC application.
 */
export async function submitKycApplication({
  fullName,
  idDocumentType,
  idDocumentUrl = null,
  organization = '',
  levelRequested = 1,
}) {
  const supabase = client()
  const uid = await getCurrentUserId()
  if (!uid) throw new Error('User not authenticated')

  if (!fullName || !idDocumentType) {
    throw new Error('Full name and ID document type are required.')
  }

  // Clamp the self-requested tier to [1,2]. Tier 3 ("Enhanced") is admin-only and
  // is never granted by approving a self-submitted application (the RPC clamps too,
  // and a CHECK backstops the column); this keeps the UI from ever asking for it.
  const requestedLevel = Math.min(Math.max(Math.floor(Number(levelRequested) || 1), 1), 2)

  const { data, error } = await supabase
    .from('kyc_applications')
    .insert([
      {
        user_id: uid,
        full_name: fullName,
        id_document_type: idDocumentType,
        id_document_url: idDocumentUrl,
        organization,
        level_requested: requestedLevel,
        status: 'pending',
      },
    ])
    .select()
    .single()
  if (error) throw new Error(error.message || 'Failed to submit KYC application')

  try {
    await logUserAction('KYC_SUBMITTED', 'kyc_application', uid, data.id, {})
  } catch (e) {
    console.warn('audit log failed (non-critical):', e)
  }
  return data
}

// ───────────────────────── admin ─────────────────────────

/**
 * All KYC applications (admin), optionally filtered by status.
 */
export async function getKycApplications(status = null) {
  const supabase = client()
  let query = supabase
    .from('kyc_applications')
    .select('*')
    .order('submitted_at', { ascending: false })
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw new Error(error.message || 'Failed to load KYC applications')
  if (!data || data.length === 0) return []

  // Attach applicant email/name
  const userIds = [...new Set(data.map((a) => a.user_id))]
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds)

  return data.map((a) => {
    const profile = (profiles || []).find((p) => p.id === a.user_id)
    return { ...a, applicant_email: profile?.email || '', applicant_name: profile?.full_name || a.full_name }
  })
}

/**
 * Approve or reject an application (admin only — enforced by the RPC).
 */
export async function reviewKycApplication(applicationId, approve, notes = '') {
  const supabase = client()
  const { data, error } = await supabase.rpc('review_kyc_application', {
    p_application_id: applicationId,
    p_approve: approve,
    p_notes: notes,
  })
  if (error) throw new Error(error.message || 'Failed to review KYC application')

  try {
    const uid = await getCurrentUserId()
    await logUserAction(approve ? 'KYC_APPROVED' : 'KYC_REJECTED', 'kyc_application', uid, applicationId, {})
  } catch (e) {
    console.warn('audit log failed (non-critical):', e)
  }
  return data
}
