/**
 * Buyer trade eligibility (KYC) — one source of truth for "can this user buy?".
 *
 * Previously the KYC check lived only inside `marketplaceService.purchaseCredits`,
 * so it fired *after* the buyer had picked a quantity and a payment method and
 * clicked Buy — and the cart's PayMongo checkout path skipped it entirely, which
 * meant the two purchase paths enforced different rules.
 *
 * This composable lets the UI answer the question up front (banner, disabled
 * buttons, inline CTA) and lets both checkout paths gate on the same value.
 * It remains UX only: `assertCanTrade` in the service layer and the velocity cap
 * in the database are the real boundaries.
 *
 * The result is cached module-wide so a page with many listing cards resolves it
 * once rather than per card; `refresh()` re-reads it after a KYC submission.
 */
import { ref, computed, watch } from 'vue'
import { getMyKycLevel, kycLevelLabel } from '@/services/kycService'
import { getMinKycLevelToTrade } from '@/services/settingsService'
import { useUserStore } from '@/store/userStore'

const kycLevel = ref(0)
const minLevel = ref(1)
const loading = ref(false)
const loaded = ref(false)
/**
 * WHICH ACCOUNT the cached level describes — the fix for "I'm verified and it
 * still tells me to verify".
 *
 * The cache used to be keyed on nothing at all, just a `loaded` flag. The
 * marketplace is public, so on a cold load its KycGateBanner mounts and calls
 * ensureLoaded() BEFORE the session has been restored. That took the
 * signed-out branch, which set `loaded = true` and returned without fetching.
 * A moment later the session arrived, `isAuthenticated` flipped true, and
 * `needsKyc` computed from a kycLevel of 0 that had never been read from the
 * database — so a verified buyer was told they were Unverified. Nothing could
 * clear it either: every later ensureLoaded() saw `loaded` and returned early,
 * for the rest of the page's life.
 *
 * Keyed by user id, "signed out" is a distinct key (null) from "signed in as
 * X", so the arrival of a session invalidates the cache on its own.
 */
let loadedForUserId = null
let inFlight = null

async function fetchEligibility(userId) {
  const [levelRes, minRes] = await Promise.allSettled([
    getMyKycLevel(userId),
    getMinKycLevelToTrade(),
  ])
  if (levelRes.status === 'fulfilled') kycLevel.value = Number(levelRes.value) || 0
  if (minRes.status === 'fulfilled') minLevel.value = Number(minRes.value) || 1
  loadedForUserId = userId
  loaded.value = true
}

export function useTradeEligibility() {
  const userStore = useUserStore()

  const currentUserId = () => userStore.session?.user?.id || null

  /**
   * Resolve eligibility once per account. Concurrent callers share the same
   * promise so N listing cards don't trigger N round-trips.
   */
  async function ensureLoaded(force = false) {
    const userId = currentUserId()

    if (!userStore.isAuthenticated || !userId) {
      // Signed out. Reset rather than leave another account's level lying
      // around, and record the null key so signing in re-reads.
      kycLevel.value = 0
      loadedForUserId = null
      loaded.value = true
      return
    }

    if (loaded.value && loadedForUserId === userId && !force) return
    if (inFlight) return inFlight

    // Reading for a DIFFERENT account than the cached one: what is in kycLevel
    // right now belongs to somebody else (usually the signed-out default of 0).
    // Marking it unloaded keeps `needsKyc` false until the real answer lands,
    // rather than flashing "verify your identity" at a verified buyer.
    if (loadedForUserId !== userId) loaded.value = false

    loading.value = true
    inFlight = fetchEligibility(userId).finally(() => {
      loading.value = false
      inFlight = null
    })
    return inFlight
  }

  /** Re-read after the user submits or completes KYC. */
  function refresh() {
    return ensureLoaded(true)
  }

  // A session that arrives (or changes) after this component mounted has to
  // re-resolve on its own — callers invoke ensureLoaded() once, in onMounted,
  // and on the public marketplace that fires before the session is restored.
  watch(currentUserId, () => {
    ensureLoaded()
  })

  // Unauthenticated users aren't "blocked by KYC" — they're blocked by being
  // signed out, which is a different message and a different CTA.
  const canTrade = computed(
    () => !userStore.isAuthenticated || Number(kycLevel.value) >= Number(minLevel.value),
  )

  // `loaded` guards the banner against the gap between mount and the first
  // read landing: without it a verified buyer sees "verify your identity"
  // flash on every page load, which is the same complaint in miniature.
  const needsKyc = computed(() => userStore.isAuthenticated && loaded.value && !canTrade.value)

  const currentLevelLabel = computed(() => kycLevelLabel(kycLevel.value))
  const requiredLevelLabel = computed(() => kycLevelLabel(minLevel.value))

  return {
    loading,
    loaded,
    kycLevel,
    minLevel,
    canTrade,
    needsKyc,
    currentLevelLabel,
    requiredLevelLabel,
    ensureLoaded,
    refresh,
  }
}
