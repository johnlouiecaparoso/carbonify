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
import { ref, computed } from 'vue'
import { getMyKycLevel, kycLevelLabel } from '@/services/kycService'
import { getMinKycLevelToTrade } from '@/services/settingsService'
import { useUserStore } from '@/store/userStore'

const kycLevel = ref(0)
const minLevel = ref(1)
const loading = ref(false)
const loaded = ref(false)
let inFlight = null

async function fetchEligibility() {
  const [levelRes, minRes] = await Promise.allSettled([getMyKycLevel(), getMinKycLevelToTrade()])
  if (levelRes.status === 'fulfilled') kycLevel.value = Number(levelRes.value) || 0
  if (minRes.status === 'fulfilled') minLevel.value = Number(minRes.value) || 1
  loaded.value = true
}

export function useTradeEligibility() {
  const userStore = useUserStore()

  /**
   * Resolve eligibility once per session. Concurrent callers share the same
   * promise so N listing cards don't trigger N round-trips.
   */
  async function ensureLoaded(force = false) {
    if (!userStore.isAuthenticated) {
      loaded.value = true
      return
    }
    if (loaded.value && !force) return
    if (inFlight) return inFlight

    loading.value = true
    inFlight = fetchEligibility().finally(() => {
      loading.value = false
      inFlight = null
    })
    return inFlight
  }

  /** Re-read after the user submits or completes KYC. */
  function refresh() {
    return ensureLoaded(true)
  }

  // Unauthenticated users aren't "blocked by KYC" — they're blocked by being
  // signed out, which is a different message and a different CTA.
  const canTrade = computed(
    () => !userStore.isAuthenticated || Number(kycLevel.value) >= Number(minLevel.value),
  )

  const needsKyc = computed(() => userStore.isAuthenticated && !canTrade.value)

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
