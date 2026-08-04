import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import OnboardingGuide from '@/components/OnboardingGuide.vue'
import { useUserStore } from '@/store/userStore'

/**
 * The homepage onboarding guide was dismissed per DEVICE, under a flat
 * `carbonify_onboarding_dismissed`. Nothing ever resets it, and sign-out clears
 * only `sb-*` / `supabase.*`, so the first person to close it closed it for
 * every account that ever signed in on that machine afterwards.
 *
 * The guide's content is chosen by role, which is what makes this more than
 * cosmetic: an admin dismissing it meant the farmer, LGU or buyer who used that
 * desk next was never shown their own quick-start — on the homepage, the first
 * screen after sign-in, during a pilot that runs on shared devices.
 *
 * Seventh instance of this repo's signature pattern. The sibling component,
 * `FirstRunGuide.vue`, has always keyed by user id and carries a docblock
 * saying why. The correct pattern was one branch over the whole time.
 */

const ALICE = 'aaaaaaaa-1111-1111-1111-111111111111'
const BOB = 'bbbbbbbb-2222-2222-2222-222222222222'

const LEGACY_KEY = 'carbonify_onboarding_dismissed'

function keyFor(owner) {
  return `carbonify_onboarding_dismissed_${owner}`
}

function mountGuide() {
  return mount(OnboardingGuide, {
    global: { stubs: { RouterLink: true } },
  })
}

async function signIn(userId, role = 'buyer') {
  const store = useUserStore()
  store.session = userId ? { user: { id: userId } } : null
  store.role = role
  await nextTick()
}

describe('onboarding dismissal belongs to an account, not to a device', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('does not hide the guide from the next person to sign in', async () => {
    // Alice dismisses it for real, by clicking, rather than the test writing
    // her key directly — seeding the key the fix produces would pass even with
    // the fix reverted, which is a test that can never go red for its own bug.
    await signIn(ALICE)
    const alice = mountGuide()
    await nextTick()
    expect(alice.find('.onboarding').exists()).toBe(true)

    await alice.find('.dismiss').trigger('click')
    expect(alice.find('.onboarding').exists()).toBe(false)
    alice.unmount()

    expect(localStorage.getItem(keyFor(ALICE))).toBe('true')

    // Alice signs out; Bob signs in on the same machine.
    setActivePinia(createPinia())
    await signIn(BOB)
    const bob = mountGuide()
    await nextTick()

    expect(bob.find('.onboarding').exists()).toBe(true)
    bob.unmount()
  })

  it('stays dismissed for the user who dismissed it', async () => {
    await signIn(ALICE)
    const first = mountGuide()
    await nextTick()
    await first.find('.dismiss').trigger('click')
    first.unmount()

    setActivePinia(createPinia())
    await signIn(ALICE)
    const second = mountGuide()
    await nextTick()

    expect(second.find('.onboarding').exists()).toBe(false)
    second.unmount()
  })

  it('re-reads when the session lands after mount', async () => {
    // The realistic ordering: the homepage renders before the session is
    // restored, so the component starts on the `anon` key. Without the re-read
    // a returning user is shown a guide they already dismissed, and dismissing
    // it again writes to the anon bucket rather than their own.
    localStorage.setItem(keyFor(ALICE), 'true')

    const wrapper = mountGuide()
    await nextTick()

    await signIn(ALICE)
    await nextTick()

    expect(wrapper.find('.onboarding').exists()).toBe(false)
    wrapper.unmount()
  })

  it('drops the pre-scoping key instead of adopting it', async () => {
    // Its value records only that SOMEBODY dismissed this here. Carrying that
    // forward to the next account to sign in would reproduce the exact defect
    // once, at deploy — the same call made for the cart's legacy key (#35).
    localStorage.setItem(LEGACY_KEY, 'true')

    await signIn(BOB)
    const wrapper = mountGuide()
    await nextTick()

    expect(wrapper.find('.onboarding').exists()).toBe(true)
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    wrapper.unmount()
  })

  it('shows the next user THEIR role’s guide, not the dismisser’s', async () => {
    // Why this is more than a cosmetic reset: the panel is role-specific, so
    // the account that inherited a dismissal lost onboarding written for them.
    await signIn(ALICE, 'admin')
    const admin = mountGuide()
    await nextTick()
    expect(admin.text()).toContain('Administrators')
    await admin.find('.dismiss').trigger('click')
    admin.unmount()

    setActivePinia(createPinia())
    await signIn(BOB, 'buyer')
    const buyer = mountGuide()
    await nextTick()

    expect(buyer.find('.onboarding').exists()).toBe(true)
    expect(buyer.text()).toContain('Welcome to Carbonify')
    buyer.unmount()
  })

  it('does not render for a signed-out visitor', async () => {
    const wrapper = mountGuide()
    await nextTick()

    expect(wrapper.find('.onboarding').exists()).toBe(false)
    wrapper.unmount()
  })
})
