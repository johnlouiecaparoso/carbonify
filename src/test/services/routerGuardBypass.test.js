import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Regression guard for the router's **second** authenticated path.
 *
 * `routeAccess.test.js` asserts the route METADATA — that /admin carries
 * `requiresAdmin`, that the buying path carries `disallowedRoles`. All of that
 * was correct. What nothing checked was whether the guard ever reads it.
 *
 * `router.beforeEach` has two ways to reach a signed-in navigation:
 *
 *   1. `userStore.isAuthenticated` is already true → role guards ran.
 *   2. the store is cold, so the guard asks Supabase directly, finds a session
 *      in localStorage, restores it — and used to call a bare `next()`.
 *
 * Path 2 treated a restored session as proof of AUTHORISATION rather than
 * authentication. Any signed-in account could open /admin, /verifier, or the
 * whole buying path by typing the URL whenever the store had not hydrated —
 * a hard refresh onto a deep link, or `fetchSession()` throwing, which the
 * guard catches and ignores. This is the project's recurring shape: the guard
 * was never missing from the codebase, only from one of two branches.
 *
 * These tests drive the real router with a cold store, so they fail if that
 * branch ever stops enforcing again.
 */

const SESSION = { user: { id: 'u-farmer', email: 'farmer@example.com' } }

/** A store that is cold on entry — exactly the state path 2 exists to handle. */
function coldStore(role) {
  return {
    loading: false,
    session: null,
    profile: null,
    role: null,
    get isAuthenticated() {
      return !!this.session?.user
    },
    get isAdmin() {
      return this.role === 'admin'
    },
    get isVerifier() {
      return this.role === 'verifier'
    },
    get isProjectDeveloper() {
      return this.role === 'project_developer'
    },
    get isLguUser() {
      return this.role === 'lgu_user'
    },
    get isFarmer() {
      return this.role === 'farmer'
    },
    get isBuyerInvestor() {
      return this.role === 'buyer_investor'
    },
    hasFeature: () => true,
    // The store never hydrates here: this is the failure path, where
    // fetchSession() resolved without a session (or threw and was swallowed).
    fetchSession: vi.fn(async () => {}),
    fetchUserProfile: vi.fn(async function () {
      this.profile = { id: SESSION.user.id, role }
      this.role = role
    }),
  }
}

let store

vi.mock('@/store/userStore', () => ({
  useUserStore: () => store,
}))

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: () => ({
    auth: {
      // The session that is sitting in localStorage — found on path 2.
      getSession: async () => ({ data: { session: SESSION }, error: null }),
    },
  }),
}))

vi.mock('@/services/mfaService', () => ({
  isMfaRequired: async () => ({ required: false }),
}))

vi.mock('@/services/authService', () => ({
  getSession: async () => SESSION,
}))

async function freshRouter() {
  vi.resetModules()
  const { default: router } = await import('@/router/index.js')
  await router.push('/home')
  await router.isReady()
  return router
}

describe('a restored session is authentication, not authorisation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not let a farmer into /admin when the store is cold', async () => {
    store = coldStore('farmer')
    const router = await freshRouter()

    await router.push('/admin').catch(() => {})

    expect(store.isAuthenticated, 'the session should still have been restored').toBe(true)
    expect(router.currentRoute.value.path).not.toBe('/admin')
  })

  it('does not let a farmer into /verifier when the store is cold', async () => {
    store = coldStore('farmer')
    const router = await freshRouter()

    await router.push('/verifier').catch(() => {})

    expect(router.currentRoute.value.path).not.toBe('/verifier')
  })

  it('enforces disallowedRoles on the restore path too', async () => {
    // /cart is metadata-blocked for farmers (#31). Path 1 honoured that list;
    // path 2 never read it.
    store = coldStore('farmer')
    const router = await freshRouter()

    await router.push('/cart').catch(() => {})

    expect(router.currentRoute.value.path).not.toBe('/cart')
  })

  it('still admits the role that IS allowed, so this is not a blanket block', async () => {
    // A guard that rejects everyone would pass the three tests above and be
    // useless. The positive case is the one that proves it discriminates.
    store = coldStore('admin')
    const router = await freshRouter()

    await router.push('/admin').catch(() => {})

    expect(router.currentRoute.value.path).toBe('/admin')
  })
})
