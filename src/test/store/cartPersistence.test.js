import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCartStore } from '@/store/cartStore'
import { useUserStore } from '@/store/userStore'

/**
 * The cart had NO tests at all, and could not have had useful ones: every
 * behaviour that matters here round-trips through `localStorage`, which
 * `src/test/setup.js` stubbed with `vi.fn()`s that stored nothing until
 * 2026-08-02. `load()` would always have read back `undefined` → `[]`, so a
 * persistence test would have asserted the empty case forever.
 *
 * It is worth testing because the cart is not decoration: `CartView` walks it
 * sequentially through PayMongo, and `PaymentCallbackView` removes the paid
 * item from it after each redirect. A cart that silently fails to reload is a
 * buyer who pays for one item and loses the rest of the basket.
 *
 * A fresh Pinia per test re-runs the store's `load()`, which is what makes
 * "reload the page" expressible here.
 */

const STORAGE_KEY = 'ecolink_cart'

const LISTING = {
  listing_id: 'listing-1',
  project_id: 'project-1',
  project_title: 'Mangrove Restoration',
  price_per_credit: 250,
  currency: 'PHP',
  available_quantity: 10,
}

/** Simulate a page reload: same storage, brand-new store instance. */
function reload() {
  setActivePinia(createPinia())
  return useCartStore()
}

describe('the cart survives a reload', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('round-trips through storage', () => {
    useCartStore().addItem(LISTING, 3)

    const after = reload()
    expect(after.items).toHaveLength(1)
    expect(after.items[0].listingId).toBe('listing-1')
    expect(after.items[0].quantity).toBe(3)
    expect(after.items[0].pricePerCredit).toBe(250)
  })

  it('keeps the money arithmetic across the reload', () => {
    const cart = useCartStore()
    cart.addItem(LISTING, 2)
    cart.addItem({ ...LISTING, listing_id: 'listing-2', price_per_credit: 80 }, 5)
    expect(cart.subtotal).toBe(2 * 250 + 5 * 80)

    expect(reload().subtotal).toBe(900)
  })

  it('a removal is persisted, not just applied in memory', () => {
    const cart = useCartStore()
    cart.addItem(LISTING, 1)
    cart.addItem({ ...LISTING, listing_id: 'listing-2' }, 1)
    cart.removeItem('listing-1')

    // This is the PaymentCallbackView path: pay for one item, come back from
    // the redirect, and the paid item must not still be in the basket.
    const after = reload()
    expect(after.items.map((i) => i.listingId)).toEqual(['listing-2'])
  })

  it('clear() empties the stored cart too', () => {
    useCartStore().addItem(LISTING, 1)
    useCartStore().clear()
    expect(reload().items).toEqual([])
  })
})

describe('the cart refuses to break on bad stored data', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('a corrupt entry loads as an empty cart rather than throwing', () => {
    // A throw here happens at store construction, which is during component
    // setup — it would blank the page rather than the cart.
    localStorage.setItem(STORAGE_KEY, '{not json')
    expect(() => reload()).not.toThrow()
    expect(reload().items).toEqual([])
  })

  it('an absent key is an empty cart, not a crash', () => {
    localStorage.removeItem(STORAGE_KEY)
    expect(reload().items).toEqual([])
  })
})

describe('quantities are clamped to what is actually for sale', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('adding more than is available clamps to the listing’s stock', () => {
    const cart = useCartStore()
    cart.addItem(LISTING, 999)
    expect(cart.items[0].quantity).toBe(10)
  })

  it('bumping an existing line clamps too', () => {
    const cart = useCartStore()
    cart.addItem(LISTING, 8)
    cart.addItem(LISTING, 8)
    expect(cart.items[0].quantity).toBe(10)
    expect(cart.distinctCount).toBe(1)
  })

  it('setQuantity cannot go below 1 or above stock', () => {
    const cart = useCartStore()
    cart.addItem(LISTING, 1)

    cart.setQuantity('listing-1', 0)
    expect(cart.items[0].quantity).toBe(1)

    cart.setQuantity('listing-1', 500)
    expect(cart.items[0].quantity).toBe(10)
  })
})

describe('signing out does not empty the cart — deliberate, and recorded here', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('the cart key does not match isAuthStorageKey, so it survives sign-out', () => {
    useCartStore().addItem(LISTING, 2)
    localStorage.setItem('sb-abcdefgh-auth-token', 'secret')

    useUserStore().clearLocalStorage()

    expect(localStorage.getItem('sb-abcdefgh-auth-token')).toBeNull()
    expect(reload().items).toHaveLength(1)
  })

  // NOTE: that behaviour is the correct fix for the old `localStorage.clear()`
  // (which wiped theme, language and accessibility settings on every sign-out),
  // but it does leave one open question: on a SHARED device the next person to
  // sign in inherits the previous person's basket. It holds public listing data
  // and no payment detail, and checkout is authorised server-side against the
  // signed-in buyer, so it is a privacy wrinkle rather than a money defect —
  // recorded in DEFERRED_BACKLOG rather than changed unilaterally, because
  // "clear the cart on sign-out" is a product decision.
})
