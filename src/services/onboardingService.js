/**
 * Where "has this account seen the welcome tour?" is answered.
 *
 * The flag lives in TWO places on purpose:
 *
 *   1. `profiles.onboarding_tour_version` — the truth. Per account, so signing
 *      in on a phone after seeing the tour on a laptop does not replay it.
 *   2. localStorage — a cache, so the very first paint does not have to wait on
 *      a round trip before deciding whether to open a modal.
 *
 * Reads consult the cache first and the profile second; a profile that says
 * "seen" back-fills the cache. Writes go to both and never throw: failing to
 * record that a tour was dismissed must not break dismissing it.
 *
 * FAILS OPEN toward *not* showing the tour when the answer is unknown but the
 * cache says seen, and toward showing it when nothing is known at all. Being
 * shown a tour you have already seen is a small annoyance; being shown one on
 * every single page load is the bug this replaces.
 *
 * See supabase/migrations/20260802000500_profile_onboarding_tour.sql — if that
 * has not been applied, every profile read here fails and the whole thing
 * degrades to exactly the localStorage-only behaviour it started with.
 */
import { getSupabase, getSupabaseAsync } from '@/services/supabaseClient'
import { TOUR_VERSION } from '@/constants/onboarding'

const COLUMN = 'onboarding_tour_version'

/** Per-user, per-version cache key. Never called without a real user id. */
function cacheKey(userId) {
  return `carbonify_tour_seen_v${TOUR_VERSION}_${userId}`
}

function readCache(userId) {
  try {
    return localStorage.getItem(cacheKey(userId)) === '1'
  } catch {
    // Private mode / storage disabled. Not an error — just no cache.
    return false
  }
}

function writeCache(userId) {
  try {
    localStorage.setItem(cacheKey(userId), '1')
  } catch {
    /* nothing to persist to; the profile write below is the real record */
  }
}

/**
 * Has this account already been shown the current tour?
 *
 * @param {string} userId
 * @returns {Promise<boolean>} true when the tour should NOT be auto-opened.
 */
export async function hasSeenTour(userId) {
  // No id means the session has not resolved. Callers must not treat that as
  // "new user" — that is precisely the race that wrote a `..._anon` flag and
  // then re-showed the tour once the real id arrived.
  if (!userId) return true

  if (readCache(userId)) return true

  const supabase = (await getSupabaseAsync()) || getSupabase()
  if (!supabase) return false

  const { data, error } = await supabase
    .from('profiles')
    .select(COLUMN)
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    // Most likely the migration is not applied (42703 undefined_column). Say so
    // once, quietly — this is a degraded mode, not a failure the user can act
    // on, and it must not be noisy on every sign-in.
    if (error.code === '42703') {
      console.warn(
        `[onboarding] profiles.${COLUMN} is missing, so the tour "show once" flag is ` +
          'per-browser only. Apply migration 20260802000500.',
      )
    } else {
      console.warn('[onboarding] could not read the tour flag:', error.message)
    }
    return false
  }

  const seenVersion = Number(data?.[COLUMN] ?? 0)
  const seen = seenVersion >= TOUR_VERSION
  // Back-fill the cache so a second device only pays for this read once.
  if (seen) writeCache(userId)
  return seen
}

/**
 * Record that this account has completed or skipped the current tour.
 * Never throws — see the file header.
 *
 * @param {string} userId
 */
export async function markTourSeen(userId) {
  if (!userId) return
  writeCache(userId)

  const supabase = getSupabase()
  if (!supabase) return

  try {
    const { error } = await supabase
      .from('profiles')
      .update({ [COLUMN]: TOUR_VERSION })
      .eq('id', userId)
    if (error && error.code !== '42703') {
      console.warn('[onboarding] could not persist the tour flag:', error.message)
    }
  } catch (err) {
    console.warn('[onboarding] could not persist the tour flag:', err?.message || err)
  }
}
