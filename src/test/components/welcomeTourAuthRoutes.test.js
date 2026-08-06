import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { useUserStore } from '@/store/userStore'

/**
 * The welcome tour must not auto-open on the routes where a session exists but
 * the account has not arrived anywhere yet.
 *
 * WHY THIS IS A TEST AND NOT A COMMENT
 * submitRoleApplication signs an applicant up to create their account, writes
 * the application, and signs them straight back out. For that window
 * `isAuthenticated` is true and a user id exists — so the tour opened over the
 * /apply form, showing the GENERAL USER steps to somebody who had just applied
 * to be a Project Developer or Verifier.
 *
 * The pop was the smaller half. maybeAutoOpen() calls markSeen() on OPEN, so the
 * flag was burned during the apply flow: once the application was approved, the
 * developer or verifier tour they should then have received would never
 * auto-open again. A tour that shows at the wrong moment is annoying; one that
 * marks itself seen at the wrong moment is gone.
 *
 * Suppression must be "not yet", never "no" — the second case below is the one
 * that would regress if someone moved the route check after autoOpenResolved.
 */

const APPLICANT = 'aaaaaaaa-1111-1111-1111-111111111111'

// Mutated in place, never replaced — vue-router hands out one reactive route
// object and updates its fields on navigation. Swapping the object instead
// would leave the component watching a detached copy and silently pass.
const currentRoute = reactive({ name: 'role-application' })

vi.mock('vue-router', () => ({
  useRoute: () => currentRoute,
}))

const hasSeenTour = vi.fn()
const markTourSeen = vi.fn()

vi.mock('@/services/onboardingService', () => ({
  hasSeenTour: (...args) => hasSeenTour(...args),
  markTourSeen: (...args) => markTourSeen(...args),
}))

// Imported after the mocks so the component picks them up.
const WelcomeTour = (await import('@/components/onboarding/WelcomeTour.vue')).default

async function signIn(userId, role = 'general_user') {
  const store = useUserStore()
  store.session = userId ? { user: { id: userId } } : null
  store.role = role
  await nextTick()
}

/** Let the async maybeAutoOpen() settle. */
async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('WelcomeTour does not auto-open during the auth flow', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    currentRoute.name = 'role-application'
    hasSeenTour.mockReset().mockResolvedValue(false)
    markTourSeen.mockReset()
  })

  it('stays closed on /apply while the applicant is briefly signed in', async () => {
    const wrapper = mount(WelcomeTour)
    await signIn(APPLICANT)
    await settle()

    expect(wrapper.find('.tour-overlay').exists()).toBe(false)
  })

  it('does not burn the seen-flag on /apply', async () => {
    mount(WelcomeTour)
    await signIn(APPLICANT)
    await settle()

    // This is the assertion that matters. If markTourSeen ran here, the tour for
    // the role they applied for would never auto-open after approval.
    expect(markTourSeen).not.toHaveBeenCalled()
  })

  it('opens once the applicant reaches a real destination', async () => {
    const wrapper = mount(WelcomeTour)
    await signIn(APPLICANT)
    await settle()
    expect(wrapper.find('.tour-overlay').exists()).toBe(false)

    // Suppression was "not yet", so navigating away must still open it.
    currentRoute.name = 'home'
    await settle()

    expect(wrapper.find('.tour-overlay').exists()).toBe(true)
    expect(markTourSeen).toHaveBeenCalledWith(APPLICANT)
  })

  it('still respects an account that has already seen the tour', async () => {
    hasSeenTour.mockResolvedValue(true)
    currentRoute.name = 'home'

    const wrapper = mount(WelcomeTour)
    await signIn(APPLICANT)
    await settle()

    expect(wrapper.find('.tour-overlay').exists()).toBe(false)
    expect(markTourSeen).not.toHaveBeenCalled()
  })

  it('suppresses on /login and /register for the same reason', async () => {
    for (const name of ['login', 'register']) {
      setActivePinia(createPinia())
      markTourSeen.mockReset()
      currentRoute.name = name

      const wrapper = mount(WelcomeTour)
      await signIn(APPLICANT)
      await settle()

      expect(wrapper.find('.tour-overlay').exists(), `${name} opened the tour`).toBe(false)
      expect(markTourSeen, `${name} burned the flag`).not.toHaveBeenCalled()
    }
  })
})
