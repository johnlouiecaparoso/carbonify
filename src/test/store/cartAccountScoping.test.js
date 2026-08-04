import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCartStore } from '@/store/cartStore'
import { useUserStore } from '@/store/userStore'
import { nextTick } from 'vue'

/**
 * Backlog #35: the cart outlived the session.
 *
 * Sign-out clears only `sb-*` / `supabase.*` — deliberately precise, because
 * the previous `localStorage.clear()` also wiped theme, language and
 * accessibility settings on every sign-out. Correct, but it left the basket
 * behind under one device-global key, so the next person to sign in on a shared
 * machine inherited the previous person's cart.
 *
 * The fix keys the cart by account. The part worth testing hardest is the part
 * that made this a decision rather than an obvious change: browsing signed-out
 * and then signing in to pay is a normal flow, so the GUEST basket must survive
 * sign-in while account A's basket must not survive into account B.
 */

const LISTING = {
  listing_id: 'listing-1',
  project_title: 'Mangrove Restoration',
  price_per_credit: 250,
  currency: 'PHP',
  available_quantity: 10,
}

const ALICE = 'aaaaaaaa-1111-1111-1111-111111111111'
const BOB = 'bbbbbbbb-2222-2222-2222-222222222222'

function sessionFor(userId) {
  return { user: { id: userId, email: `${userId}@example.test` } }
}

/** A fresh Pinia re-runs the store's construction — i.e. a page reload. */
function freshStores() {
  setActivePinia(createPinia())
  return { cart: useCartStore(), user: useUserStore() }
}

/** Sign in/out and let the store's watcher re-point at the right bucket. */
async function signIn(user, userId) {
  user.session = userId ? sessionFor(userId) : null
  await nextTick()
}

describe('a cart belongs to an account, not to a device', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('does not hand one user’s basket to the next person to sign in', async () => {
    // Alice shops and signs out.
    const first = freshStores()
    await signIn(first.user, ALICE)
    first.cart.addItem(LISTING, 3)
    expect(first.cart.items).toHaveLength(1)
    await signIn(first.user, null)

    // Bob signs in on the same device — the defect was that he saw Alice's cart.
    const second = freshStores()
    await signIn(second.user, BOB)
    expect(second.cart.items).toEqual([])
  })

  it('gives Alice her own basket back when she returns', async () => {
    const first = freshStores()
    await signIn(first.user, ALICE)
    first.cart.addItem(LISTING, 3)
    await signIn(first.user, null)

    const second = freshStores()
    await signIn(second.user, BOB)
    second.cart.addItem({ ...LISTING, listing_id: 'listing-2' }, 1)
    await signIn(second.user, null)

    const third = freshStores()
    await signIn(third.user, ALICE)
    expect(third.cart.items.map((i) => i.listingId)).toEqual(['listing-1'])
    expect(third.cart.items[0].quantity).toBe(3)
  })

  it('carries a signed-out basket forward on sign-in', async () => {
    // The flow that made "just clear it on sign-out" the wrong answer: browse
    // the public marketplace, add to cart, then sign in to pay.
    const { cart, user } = freshStores()
    cart.addItem(LISTING, 2)
    expect(cart.items).toHaveLength(1)

    await signIn(user, ALICE)

    expect(cart.items).toHaveLength(1)
    expect(cart.items[0].quantity).toBe(2)
  })

  it('empties the guest bucket once it has been carried forward', async () => {
    const first = freshStores()
    first.cart.addItem(LISTING, 2)
    await signIn(first.user, ALICE)
    await signIn(first.user, null)

    // A second visitor browsing signed-out must not pick up what Alice merged.
    const second = freshStores()
    expect(second.cart.items).toEqual([])
  })

  it('merges rather than overwrites, and does not double a quantity', async () => {
    // Alice already has this listing in her account basket.
    const first = freshStores()
    await signIn(first.user, ALICE)
    first.cart.addItem(LISTING, 2)
    await signIn(first.user, null)

    // She browses signed out, adds the same listing plus another, then signs in.
    const second = freshStores()
    second.cart.addItem(LISTING, 5)
    second.cart.addItem({ ...LISTING, listing_id: 'listing-2' }, 1)
    await signIn(second.user, ALICE)

    const byId = Object.fromEntries(second.cart.items.map((i) => [i.listingId, i.quantity]))
    expect(byId['listing-1']).toBe(5) // the larger of 2 and 5, NOT 7
    expect(byId['listing-2']).toBe(1)
  })

  it('keeps the merged quantity within the listing’s stock', async () => {
    const first = freshStores()
    await signIn(first.user, ALICE)
    first.cart.addItem(LISTING, 10)
    await signIn(first.user, null)

    const second = freshStores()
    second.cart.addItem(LISTING, 10)
    await signIn(second.user, ALICE)

    expect(second.cart.items[0].quantity).toBe(10)
  })
})

describe('the cart survives bad stored data rather than blanking the page', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
  })

  it('valid JSON that is not an array loads as an empty cart', () => {
    // `JSON.parse` succeeding does not make it a cart. A stored object here
    // used to reach `items.value.reduce(...)` during store construction — which
    // is component setup, so it blanked the page rather than the cart.
    localStorage.setItem('ecolink_cart::guest', '{"not":"an array"}')
    expect(() => freshStores()).not.toThrow()
    expect(freshStores().cart.items).toEqual([])
  })

  it('a stored string loads as an empty cart', () => {
    localStorage.setItem('ecolink_cart::guest', '"just a string"')
    expect(() => freshStores()).not.toThrow()
    expect(freshStores().cart.items).toEqual([])
  })

  it('drops entries that carry no listing id', () => {
    localStorage.setItem(
      'ecolink_cart::guest',
      JSON.stringify([{ listingId: 'listing-1', quantity: 1 }, null, { quantity: 4 }]),
    )
    expect(freshStores().cart.items.map((i) => i.listingId)).toEqual(['listing-1'])
  })

  it('discards the pre-namespacing key instead of adopting it', () => {
    // Its contents belong to whoever last used the device. Adopting them for
    // the next person to sign in is the exact defect being closed here.
    localStorage.setItem('ecolink_cart', JSON.stringify([{ listingId: 'listing-1', quantity: 9 }]))

    const { cart } = freshStores()

    expect(cart.items).toEqual([])
    expect(localStorage.getItem('ecolink_cart')).toBeNull()
  })
})
