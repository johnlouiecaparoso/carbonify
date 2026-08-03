import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

/**
 * "I verified my KYC to a level and it still tells me to verify."
 *
 * useTradeEligibility caches the user's KYC level module-wide so a marketplace
 * page with twenty listing cards resolves it once instead of twenty times. The
 * cache was keyed on nothing but a boolean `loaded` flag, and that is what made
 * a verified buyer look unverified:
 *
 *   1. /marketplace is PUBLIC, so KycGateBanner mounts and calls ensureLoaded()
 *      on a cold load — before the session has been restored.
 *   2. ensureLoaded() took its signed-out branch: set `loaded = true`, return,
 *      fetch nothing.
 *   3. The session arrived. `isAuthenticated` flipped true, and `needsKyc` was
 *      computed against a kycLevel of 0 that had never been read from anywhere.
 *   4. Nothing could repair it. Every later ensureLoaded() saw `loaded` and
 *      returned early, so the banner said "Your account is Unverified" for the
 *      life of the page.
 *
 * Keyed by user id, the arrival of a session is itself a cache miss. These
 * tests pin that: signed-out-then-signed-in must produce a real read, and the
 * banner must not accuse anyone while the answer is still in flight.
 */

const getMyKycLevel = vi.fn()
const getMinKycLevelToTrade = vi.fn()

vi.mock('@/services/kycService', () => ({
  getMyKycLevel: (...args) => getMyKycLevel(...args),
  kycLevelLabel: (n) => `Level ${n}`,
}))

vi.mock('@/services/settingsService', () => ({
  getMinKycLevelToTrade: (...args) => getMinKycLevelToTrade(...args),
}))

/** A store stand-in whose session can be swapped mid-test, as the real one is. */
function makeStore() {
  return {
    session: null,
    get isAuthenticated() {
      return !!this.session?.user
    },
    signIn(id) {
      this.session = { user: { id } }
    },
  }
}

let store
vi.mock('@/store/userStore', () => ({
  useUserStore: () => store,
}))

/** Fresh module state per test — the cache is module-level by design. */
async function loadComposable() {
  vi.resetModules()
  const mod = await import('@/composables/useTradeEligibility')
  return mod.useTradeEligibility()
}

describe('useTradeEligibility caching', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    store = makeStore()
    getMyKycLevel.mockReset().mockResolvedValue(2)
    getMinKycLevelToTrade.mockReset().mockResolvedValue(1)
  })

  it('reads the level once the session arrives, even though it resolved while signed out', async () => {
    const eligibility = await loadComposable()

    // Cold public page: no session yet.
    await eligibility.ensureLoaded()
    expect(getMyKycLevel).not.toHaveBeenCalled()

    // Session restores.
    store.signIn('user-1')
    await eligibility.ensureLoaded()

    expect(getMyKycLevel).toHaveBeenCalledTimes(1)
    expect(eligibility.kycLevel.value).toBe(2)
    expect(eligibility.canTrade.value).toBe(true)
    expect(eligibility.needsKyc.value).toBe(false)
  })

  it('does not re-read for the same account', async () => {
    const eligibility = await loadComposable()
    store.signIn('user-1')

    await eligibility.ensureLoaded()
    await eligibility.ensureLoaded()
    await eligibility.ensureLoaded()

    expect(getMyKycLevel).toHaveBeenCalledTimes(1)
  })

  it('re-reads when a different account signs in', async () => {
    const eligibility = await loadComposable()
    store.signIn('user-1')
    await eligibility.ensureLoaded()

    getMyKycLevel.mockResolvedValue(0)
    store.signIn('user-2')
    await eligibility.ensureLoaded()

    expect(getMyKycLevel).toHaveBeenCalledTimes(2)
    expect(eligibility.kycLevel.value).toBe(0)
    expect(eligibility.needsKyc.value).toBe(true)
  })

  it('refresh() re-reads the same account — an admin approval mid-session', async () => {
    const eligibility = await loadComposable()
    store.signIn('user-1')
    getMyKycLevel.mockResolvedValue(0)
    await eligibility.ensureLoaded()
    expect(eligibility.needsKyc.value).toBe(true)

    // Admin approves; the KYC page calls refresh().
    getMyKycLevel.mockResolvedValue(1)
    await eligibility.refresh()

    expect(eligibility.kycLevel.value).toBe(1)
    expect(eligibility.needsKyc.value).toBe(false)
  })

  it('never reports needsKyc before the first read has landed', async () => {
    const eligibility = await loadComposable()
    store.signIn('user-1')

    let release
    getMyKycLevel.mockReturnValue(new Promise((resolve) => (release = resolve)))

    const pending = eligibility.ensureLoaded()
    // Mid-flight: authenticated, level still at its 0 default. Reporting
    // needsKyc here is what flashes "verify your identity" at a verified buyer.
    expect(eligibility.needsKyc.value).toBe(false)

    release(2)
    await pending
    expect(eligibility.needsKyc.value).toBe(false)
  })
})
