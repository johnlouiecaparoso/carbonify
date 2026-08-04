import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import SmartSearch from '@/components/ui/SmartSearch.vue'
import { useUserStore } from '@/store/userStore'

/**
 * Search history is device-local by design — the component's own docblock
 * explains that keeping search terms off the server is a privacy choice, and it
 * is the right one.
 *
 * It said nothing about who can read them locally. The key was
 * `carbonify_search_history_<surface>`, scoped to the marketplace or the
 * registry but not to an account, and sign-out clears only `sb-*` /
 * `supabase.*`. So on a shared device the next person to sign in had the
 * previous person's search terms shown to them in a dropdown, on focus, without
 * asking.
 *
 * The same defect as the cart (backlog #35) in its neighbouring branch — and
 * arguably worse, since a basket holds public listings while "what was this
 * buyer looking for" is commercially sensitive.
 */

const ALICE = 'aaaaaaaa-1111-1111-1111-111111111111'
const BOB = 'bbbbbbbb-2222-2222-2222-222222222222'

function keyFor(owner) {
  return `carbonify_search_history_marketplace_${owner}`
}

function mountSearch() {
  return mount(SmartSearch, {
    props: { storageKey: 'marketplace', modelValue: '' },
    global: { stubs: { teleport: true } },
  })
}

async function signIn(userId) {
  useUserStore().session = userId ? { user: { id: userId } } : null
  await nextTick()
}

describe('search history belongs to an account, not to a device', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('does not show one user’s searches to the next person to sign in', async () => {
    // Alice searches for real, through the component, rather than the test
    // writing her key directly: seeding storage with the key the fix produces
    // would make this pass even with the fix reverted, which is a test that can
    // never go red for the bug it names.
    await signIn(ALICE)
    const alice = mountSearch()
    await nextTick()
    alice.vm.remember('mangrove restoration')
    alice.vm.remember('bataan')
    alice.unmount()

    expect(localStorage.getItem(keyFor(ALICE))).toContain('bataan')

    // Alice signs out; Bob signs in on the same machine.
    setActivePinia(createPinia())
    await signIn(BOB)
    const bob = mountSearch()
    await nextTick()

    expect(bob.vm.history).toEqual([])
    bob.unmount()
  })

  it('gives a user their own history back', async () => {
    localStorage.setItem(keyFor(ALICE), JSON.stringify(['mangrove restoration']))

    await signIn(ALICE)
    const wrapper = mountSearch()
    await nextTick()

    expect(wrapper.vm.history).toEqual(['mangrove restoration'])
    wrapper.unmount()
  })

  it('re-reads when the session lands after mount', async () => {
    // The realistic ordering: the component mounts on the public marketplace
    // before the session is restored, so it starts on the guest key. Without a
    // reload it would read and WRITE the guest bucket for the life of the page
    // — the same leak with an extra step.
    localStorage.setItem(keyFor(ALICE), JSON.stringify(['bataan']))

    const wrapper = mountSearch()
    await nextTick()
    expect(wrapper.vm.history).toEqual([])

    await signIn(ALICE)
    await nextTick()

    expect(wrapper.vm.history).toEqual(['bataan'])
    wrapper.unmount()
  })

  it('keeps signed-out history in its own bucket', async () => {
    const wrapper = mountSearch()
    await nextTick()
    expect(wrapper.vm.history).toEqual([])

    // A guest bucket exists and is separate from any account's.
    localStorage.setItem(keyFor('guest'), JSON.stringify(['solar']))
    await signIn(ALICE)
    await nextTick()
    expect(wrapper.vm.history).toEqual([])

    await signIn(null)
    await nextTick()
    expect(wrapper.vm.history).toEqual(['solar'])
    wrapper.unmount()
  })

  it('still keeps the marketplace and registry lists apart', async () => {
    await signIn(ALICE)
    localStorage.setItem(keyFor(ALICE), JSON.stringify(['mangrove']))
    localStorage.setItem(
      `carbonify_search_history_registry_${ALICE}`,
      JSON.stringify(['certificate 12345']),
    )

    const wrapper = mountSearch()
    await nextTick()

    expect(wrapper.vm.history).toEqual(['mangrove'])
    wrapper.unmount()
  })
})
