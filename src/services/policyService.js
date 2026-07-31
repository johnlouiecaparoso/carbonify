import { getSupabase, getSupabaseAsync } from '@/services/supabaseClient'
import { POLICY_VERSION, POLICY_DOCUMENTS } from '@/constants/policy'

/**
 * Recording that a user accepted the Terms, Privacy Policy and Carbon Credits
 * Policy.
 *
 * ── The one design decision worth knowing ──
 * `hasAcceptedCurrentPolicy()` FAILS OPEN. If the table is missing, the read
 * errors, or the network is down, it resolves `true` — the user is let in.
 *
 * Note what is NOT in that list: RLS. An RLS-filtered read is not an error —
 * PostgREST returns `200 []` with `error: null`, which is byte-identical to
 * "this user has not accepted". So RLS failures fail CLOSED here, not open,
 * and the only defence is to be sure we are asking as the right user. That is
 * what `authenticatedUserId()` below exists for.
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
 * The user id Supabase itself considers signed in — which is not always the one
 * the app thinks is signed in.
 *
 * In development `LoginForm.handleSubmit` assigns `testAccount.mockSession` to
 * the store for the four test accounts (admin, verifier, general user, project
 * developer), an object fabricated in `src/utils/testAccounts.js` carrying an
 * `access_token` of, literally, 'admin-test-token'. Those accounts do not exist
 * in Supabase auth at all. The Supabase client never sees that session, so
 * every PostgREST request still goes out as `anon` and `auth.uid()` is null.
 *
 * What that does to this gate, before this check existed:
 *   - the read matched no rows under RLS and returned `[]` with no error, so
 *     the user read as "has not accepted" — at every sign-in;
 *   - the write was rejected outright (42501), so accepting could never
 *     succeed and `policy_acceptances` stayed empty forever.
 *
 * An unsatisfiable consent prompt is worse than no prompt: it trains people to
 * dismiss it. So when the session is not one Supabase will honour, the gate is
 * skipped — consent that cannot be recorded is not worth collecting.
 *
 * @returns {Promise<string|null|undefined>} the authenticated id, `null` when
 *   nobody is signed in, or `undefined` when the client cannot be asked (only
 *   unit-test fakes) — which callers treat as "carry on", not as a mock.
 */
async function authenticatedUserId(supabase) {
  if (typeof supabase.auth?.getSession !== 'function') return undefined
  try {
    // Local read of the stored session; it awaits the client's own hydration,
    // so this is not racing page load. No network call.
    const { data } = await supabase.auth.getSession()
    return data?.session?.user?.id ?? null
  } catch {
    return undefined
  }
}

/**
 * Has the signed-in user accepted the CURRENT policy version?
 *
 * @returns {Promise<{accepted: boolean, indeterminate: boolean}>}
 *   `indeterminate` is true when we could not tell. Callers should treat that
 *   as accepted (see above) but must not record it as consent.
 */
export async function hasAcceptedCurrentPolicy(userId) {
  // WAIT for the client rather than sampling it. The router guard hydrates the
  // session before App.vue mounts, so this check can fire in the same tick as
  // the very first `getSupabase()` call — which returns null while the client
  // initializes. Sampling it there produced an indeterminate result that was
  // never retried (the watcher only re-fires when the user id changes), so on
  // an unlucky page load the gate simply never appeared. Whether a consent
  // form shows must not depend on a startup race.
  const supabase = (await getSupabaseAsync()) || getSupabase()
  if (!supabase || !userId) {
    return { accepted: true, indeterminate: true }
  }

  // Asking as the wrong user reads as "never accepted" rather than failing, so
  // this has to be checked before the query, not after it.
  const authUserId = await authenticatedUserId(supabase)
  if (authUserId !== undefined && authUserId !== userId) {
    console.warn(
      `[policy] Skipping the consent gate: the app thinks ${userId} is signed in, but ` +
        `Supabase reports ${authUserId ?? 'nobody'}. Acceptance cannot be recorded for a ` +
        'session Supabase does not hold — this is normally a DEV test-account login.',
    )
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

  // The gate should never reach here with a mock session — but if it does, say
  // so plainly. The raw failure is a bare '42501 new row violates row-level
  // security policy', which sends you looking at the migration instead of at
  // the session.
  const authUserId = await authenticatedUserId(supabase)
  if (authUserId !== undefined && authUserId !== userId) {
    throw new Error(
      'Your session is not one Supabase recognises, so your acceptance cannot be recorded. ' +
        'Please sign out and sign in again with a real account.',
    )
  }

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
