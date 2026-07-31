import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Keep the store's collaborators inert; these tests exercise the profile-fetch
// state machine, not the network. roleService stays REAL so permission wiring
// is tested end to end.
vi.mock('@/services/authService', () => ({
  getSession: vi.fn(),
  signOut: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/services/profileService', () => ({
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
}))
vi.mock('@/services/auditService', () => ({ logUserAction: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/services/roleApplicationService', () => ({
  getBlockingRoleApplicationForUser: vi.fn().mockResolvedValue(null),
}))

import { useUserStore } from '@/store/userStore'
import { getProfile } from '@/services/profileService'
import { ROLES } from '@/constants/roles'

/**
 * The regression these lock in: a transient profile-fetch failure (timeout,
 * network blip, or a row that momentarily isn't readable) used to reset the
 * role to general_user, silently stripping an already-loaded admin's
 * permissions until a retry happened to land. Now that handle_new_auth_user
 * creates a profile row for every signup, a null/unreadable profile means
 * "couldn't read it", not "no role", so the store must keep the last-known
 * role and recover in the background.
 */
describe('userStore profile fetch', () => {
  let store

  beforeEach(() => {
    vi.clearAllMocks()
    store = useUserStore()
    // A real (non-test-account) session with a role already established, as if
    // the user had loaded successfully once before this fetch.
    store.session = { user: { id: 'real-user-1', email: 'admin@x.io' } }
    store.role = ROLES.ADMIN
    store.updatePermissions()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the last-known role when the profile comes back null', async () => {
    vi.useFakeTimers()
    getProfile.mockResolvedValue(null)

    await store._performProfileFetch()

    // The core assertion: NOT demoted to general_user.
    expect(store.role).toBe(ROLES.ADMIN)
    expect(store.isAdmin).toBe(true)
    expect(store.profileFetchFailed).toBe(true)
  })

  it('keeps the last-known role when the fetch times out', async () => {
    vi.useFakeTimers()
    // getProfile never resolves, so the 20s Promise.race timeout fires.
    getProfile.mockReturnValue(new Promise(() => {}))

    const pending = store._performProfileFetch()
    await vi.advanceTimersByTimeAsync(20000)
    await pending

    expect(store.role).toBe(ROLES.ADMIN)
    expect(store.profileFetchFailed).toBe(true)
  })

  it('adopts and canonicalizes the role on a successful fetch, clearing the flag', async () => {
    store.profileFetchFailed = true
    // A stored 'Admin' (mixed case) must canonicalize, not fall through to
    // general_user — the drift that let a retry downgrade an admin.
    getProfile.mockResolvedValue({ id: 'real-user-1', role: 'Admin', full_name: 'Ada' })

    await store._performProfileFetch()

    expect(store.role).toBe(ROLES.ADMIN)
    expect(store.isAdmin).toBe(true)
    expect(store.profile).toMatchObject({ full_name: 'Ada' })
    expect(store.profileFetchFailed).toBe(false)
  })

  it('actually runs the retry even while the primary fetch is still marked in progress', async () => {
    vi.useFakeTimers()
    // The old guard keyed on _profileFetchInProgress — still true when the retry
    // is kicked off from inside the primary fetch — so the retry never ran.
    store._profileFetchInProgress = true
    getProfile.mockResolvedValue({ id: 'real-user-1', role: 'admin', full_name: 'Ada' })

    const pending = store._retryProfileFetch(2, 1000)
    await vi.runAllTimersAsync()
    await pending

    expect(getProfile).toHaveBeenCalled()
    expect(store.role).toBe(ROLES.ADMIN)
    expect(store.profileFetchFailed).toBe(false)
  })

  it('recovers the role on a later retry attempt after early failures', async () => {
    vi.useFakeTimers()
    getProfile
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ id: 'real-user-1', role: 'admin' })

    const pending = store._retryProfileFetch(3, 1000)
    await vi.runAllTimersAsync()
    await pending

    expect(store.role).toBe(ROLES.ADMIN)
    expect(store.profileFetchFailed).toBe(false)
  })

  it('clears the failure flag on sign-out so a returning guest never sees it', () => {
    store.profileFetchFailed = true
    store.clearUserData()
    expect(store.profileFetchFailed).toBe(false)
    expect(store.role).toBe(ROLES.GENERAL_USER)
  })
})
