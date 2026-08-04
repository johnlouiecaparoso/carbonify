import { describe, it, expect, beforeEach } from 'vitest'
import {
  CART_CHECKOUT_ACTIVE,
  CART_PENDING_LISTING,
  CART_PENDING_SESSION,
  cartCheckoutState,
  clearCartCheckoutFlags,
} from '@/constants/cart'

/**
 * The cart walks PayMongo one listing at a time. Before each redirect CartView
 * records that a sequence is running; on the way back PaymentCallbackView uses
 * that record to remove the item just paid for.
 *
 * The record is authority to DELETE SOMETHING FROM A BUYER'S BASKET, and it was
 * granted on the strength of a flag that nothing ever cleared. Abandoning at
 * PayMongo — closing the tab, a declined card, a phone call — leaves the flag
 * set: CartView's catch only fires when the redirect never happened, and the
 * callback only cleans up after a payment that succeeded.
 *
 * So the next successful payment of any kind inherited the abandoned sequence.
 * Pay for something directly from the marketplace and the callback removed the
 * abandoned cart listing and announced "Item purchased" over it.
 *
 * These tests are written against the storage keys rather than the view,
 * because that is where the decision is now made and the reason it went
 * unnoticed is that reaching it before meant mounting a view that redirects to
 * a payment provider.
 */

const SESSION = 'cs_the_one_the_cart_started'

/** Put storage in the state CartView leaves behind when it redirects. */
function cartCheckoutStarted(sessionId = SESSION, listingId = 'listing-1') {
  localStorage.setItem(CART_CHECKOUT_ACTIVE, '1')
  localStorage.setItem(CART_PENDING_LISTING, listingId)
  localStorage.setItem(CART_PENDING_SESSION, sessionId)
}

describe('a cart checkout only claims the payment it actually started', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('claims its own settled session', () => {
    cartCheckoutStarted()
    expect(cartCheckoutState(SESSION)).toBe('match')
  })

  it('does NOT claim a different payment — the defect this closes', () => {
    // The buyer abandoned a cart checkout, then bought something straight from
    // the marketplace. That purchase must not touch the basket.
    cartCheckoutStarted(SESSION, 'listing-abandoned')

    expect(cartCheckoutState('cs_a_completely_different_purchase')).toBe('stale')
  })

  it('reports inactive when no cart sequence is running', () => {
    expect(cartCheckoutState(SESSION)).toBe('inactive')
  })

  it('treats an unbound sequence as stale rather than as a match', () => {
    // Flags written by a checkout that returned no session id, or left over
    // from before the binding existed. There is nothing proving this payment
    // is the cart's, and leaving a paid item in the basket is the safe
    // direction — deleting an unpaid one is not.
    localStorage.setItem(CART_CHECKOUT_ACTIVE, '1')
    localStorage.setItem(CART_PENDING_LISTING, 'listing-1')
    localStorage.setItem(CART_PENDING_SESSION, '')

    expect(cartCheckoutState(SESSION)).toBe('stale')
  })

  it('does not match when the callback has no session id of its own', () => {
    cartCheckoutStarted()
    expect(cartCheckoutState(null)).toBe('stale')
    expect(cartCheckoutState(undefined)).toBe('stale')
    expect(cartCheckoutState('')).toBe('stale')
  })

  it('an abandoned sequence stops being able to mislead once cleared', () => {
    cartCheckoutStarted()
    expect(cartCheckoutState('cs_other')).toBe('stale')

    clearCartCheckoutFlags()

    expect(cartCheckoutState('cs_other')).toBe('inactive')
    expect(localStorage.getItem(CART_CHECKOUT_ACTIVE)).toBeNull()
    expect(localStorage.getItem(CART_PENDING_LISTING)).toBeNull()
    expect(localStorage.getItem(CART_PENDING_SESSION)).toBeNull()
  })

  it('clears all three keys, not the two that used to be cleared by hand', () => {
    cartCheckoutStarted()
    clearCartCheckoutFlags()

    // Naming each one: the failure mode being guarded against is a fourth key
    // being added later and only two of them being cleared, which is how this
    // family of defect has arrived five times in this repo.
    for (const key of [CART_CHECKOUT_ACTIVE, CART_PENDING_LISTING, CART_PENDING_SESSION]) {
      expect(localStorage.getItem(key)).toBeNull()
    }
  })
})
