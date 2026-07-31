import { getSupabase } from '@/services/supabaseClient'
import { POLICY_VERSION, POLICY_DOCUMENTS } from '@/constants/policy'

/**
 * Recording that a user accepted the Terms, Privacy Policy and Carbon Credits
 * Policy.
 *
 * ── The one design decision worth knowing ──
 * `hasAcceptedCurrentPolicy()` FAILS OPEN. If the table is missing, RLS blocks
 * the read, or the network is down, it resolves `true` — the user is let in.
 *
 * That is deliberate, and it is the opposite of what this codebase does almost
 * everywhere else. The reasoning:
 *
 *   - The gate is client-side. A determined user can bypass it with devtools
 *     regardless, so failing closed buys no real enforcement — it only buys
 *     downtime.
 *   - `policy_acceptances` ships in a migration the owner applies by hand. This
 *     project has already had three "built ≠ live" defects in a single day. If
 *     an unapplied migration locked every user out of the platform — including
 *     the admin who would have to fix it — that is an outage caused by a
 *     consent form.
 *   - It matches the precedent in App.vue: a missing `is_active` column must
 *     read as ACTIVE, or an un-migrated database shows every user a suspension
 *     banner.
 *
 * The trade-off, stated plainly: **until the migration is applied, the gate
 * does nothing.** It will not warn anyone. Verify with the §VERIFY block in
 * `supabase/migrations/20260731000100_policy_acceptances.sql`.
 *
 * A user DECLINING is a different case entirely and is fully enforced — the
 * gate signs them out.
 */

const TABLE = 'policy_acceptances'

/**
 * Has the signed-in user accepted the CURRENT policy version?
 *
 * @returns {Promise<{accepted: boolean, indeterminate: boolean}>}
 *   `indeterminate` is true when we could not tell. Callers should treat that
 *   as accepted (see above) but must not record it as consent.
 */
export async function hasAcceptedCurrentPolicy(userId) {
  const supabase = getSupabase()
  if (!supabase || !userId) {
    return { accepted: true, indeterminate: true }
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('id, policy_version, accepted_at')
    .eq('user_id', userId)
    .eq('policy_version', POLICY_VERSION)
    .limit(1)

  if (error) {
    // Loud, because a silent failure here means nobody is being asked to
    // consent and no one finds out. This is the log line that tells you the
    // migration was never applied.
    console.error(
      `[policy] Could not read ${TABLE} — the consent gate is INERT and every user is being let through without accepting. Has migration 20260731000100 been applied?`,
      error.message,
    )
    return { accepted: true, indeterminate: true }
  }

  return { accepted: (data?.length ?? 0) > 0, indeterminate: false }
}

/**
 * Record the acceptance. Throws on failure — unlike the read, this one must
 * not fail quietly: a user who ticked the box and was let in without a record
 * is the case that leaves us with no evidence at all.
 */
export async function acceptCurrentPolicy(userId) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')
  if (!userId) throw new Error('A signed-in user is required to record acceptance')

  const { error } = await supabase.from(TABLE).insert({
    user_id: userId,
    policy_version: POLICY_VERSION,
    documents: POLICY_DOCUMENTS.map((d) => d.id),
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 500) : null,
  })

  if (error) {
    // 23505 = unique violation: they already accepted this version, probably in
    // another tab. That is success, not failure.
    if (error.code === '23505') return { alreadyAccepted: true }
    throw new Error(error.message || 'Could not record your acceptance. Please try again.')
  }

  return { alreadyAccepted: false }
}

/** Admin/support: every acceptance a user has ever given, newest first. */
export async function getAcceptanceHistory(userId) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')

  const { data, error } = await supabase
    .from(TABLE)
    .select('policy_version, documents, accepted_at')
    .eq('user_id', userId)
    .order('accepted_at', { ascending: false })

  if (error) throw new Error(error.message || 'Could not load acceptance history')
  return data || []
}
