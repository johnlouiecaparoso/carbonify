/**
 * App settings service — reads/writes the admin-managed `app_settings` store and
 * the admin-editable `methodology_factors` (emission factors).
 *
 * Writes are gated server-side by RLS (is_admin()); a non-admin write simply
 * fails. Reads are open. Values are stored as JSONB, so we marshal scalars in
 * and out here.
 */
import { getSupabase } from '@/services/supabaseClient'
import { getCurrentUserId } from '@/utils/authHelper'

/** Fetch all settings as a plain { key: value } map. */
export async function getAllSettings() {
  const supabase = getSupabase()
  if (!supabase) return {}
  const { data, error } = await supabase.from('app_settings').select('key, value, description')
  if (error) {
    console.warn('Failed to load app settings:', error.message)
    return {}
  }
  const map = {}
  for (const row of data || []) map[row.key] = row.value
  return map
}

/** Fetch a single setting value (JSON-decoded), or the provided fallback. */
export async function getSetting(key, fallback = null) {
  const supabase = getSupabase()
  if (!supabase) return fallback
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle()
  if (error || !data) return fallback
  return data.value
}

/**
 * Upsert a setting. Admin-only (enforced by RLS). `value` is stored as JSONB —
 * pass a number/string/array/object directly.
 */
export async function updateSetting(key, value) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const updatedBy = await getCurrentUserId()
  const { error } = await supabase.from('app_settings').upsert(
    { key, value, updated_by: updatedBy, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) {
    throw new Error(
      error.code === '42501' || /policy/i.test(error.message)
        ? 'Only administrators can change system settings.'
        : error.message || 'Failed to save setting',
    )
  }
  return true
}

// ── Typed convenience accessors ───────────────────────────────────────────

export async function getPlatformFeePercent() {
  return Number(await getSetting('platform_fee_percent', 0)) || 0
}

export async function getMinKycLevelToTrade() {
  return Number(await getSetting('min_kyc_level_to_trade', 1)) || 1
}

// ── Project & verification fees ────────────────────────────────────────────
// Flat PHP amounts, admin-configurable in System Configuration. 0 = no fee.
// These are disclosure/config today; collection wiring (PayMongo) is a
// follow-up gated on production keys — see docs/GAP_ANALYSIS.md.

export const FEE_KEYS = {
  onboarding: 'project_onboarding_fee',
  verification: 'verification_fee',
}

/** Flat fee (PHP) charged to onboard a new project. 0 = free. */
export async function getProjectOnboardingFee() {
  return Number(await getSetting(FEE_KEYS.onboarding, 0)) || 0
}

/** Flat fee (PHP) for verification / certification support. 0 = free. */
export async function getVerificationFee() {
  return Number(await getSetting(FEE_KEYS.verification, 0)) || 0
}

/** Both project-lifecycle fees in one round-trip, from the settings map. */
export async function getProjectFees() {
  const all = await getAllSettings()
  return {
    onboardingFee: Number(all[FEE_KEYS.onboarding] ?? 0) || 0,
    verificationFee: Number(all[FEE_KEYS.verification] ?? 0) || 0,
  }
}

// ── Emission factors (methodology_factors) ────────────────────────────────

/** List emission factors, grouped-friendly (ordered by project type then label). */
export async function listMethodologyFactors() {
  const supabase = getSupabase()
  if (!supabase) return []
  const { data, error } = await supabase
    .from('methodology_factors')
    .select('id, project_type, metric_key, label, unit, factor, description')
    .order('project_type', { ascending: true })
    .order('label', { ascending: true })
  if (error) {
    console.warn('Failed to load methodology factors:', error.message)
    return []
  }
  return data || []
}

/**
 * Update one emission factor's numeric value (and optionally label/description).
 * Admin-only via RLS. The MRV server-side calculations read this table, so a
 * change here affects future credit issuance.
 */
export async function updateMethodologyFactor(id, patch) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  const payload = {}
  if (patch.factor !== undefined) payload.factor = Number(patch.factor)
  if (patch.label !== undefined) payload.label = patch.label
  if (patch.description !== undefined) payload.description = patch.description
  if (Number.isNaN(payload.factor)) throw new Error('Factor must be a number')

  const { error } = await supabase.from('methodology_factors').update(payload).eq('id', id)
  if (error) {
    throw new Error(
      error.code === '42501' || /policy/i.test(error.message)
        ? 'Only administrators can edit emission factors.'
        : error.message || 'Failed to update factor',
    )
  }
  return true
}
