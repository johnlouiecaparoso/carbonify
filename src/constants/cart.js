/**
 * localStorage keys coordinating the cart's sequential checkout across the
 * PayMongo redirect. CartView sets them before redirecting; PaymentCallbackView
 * reads them on a successful payment to remove the paid item and resume.
 *
 * ## Why the session id is one of them
 *
 * Nothing clears these when a buyer ABANDONS at PayMongo — they close the tab,
 * the card is declined and they give up, the phone rings. CartView's `catch`
 * only fires if the redirect never happened, and PaymentCallbackView only
 * cleans up on a *successful* payment, so the pair survived indefinitely.
 *
 * The two flags alone say "a cart checkout is in progress" but not WHICH
 * payment it is waiting for, so the next successful payment of any kind
 * satisfied them. Buy something directly from the marketplace after abandoning
 * a cart checkout and the callback removed the abandoned listing from the cart
 * and announced it as purchased — a basket item silently lost, and the buyer
 * told they had bought it.
 *
 * CART_PENDING_SESSION binds the sequence to one checkout session, so the
 * callback can tell "this is the cart item that just settled" from "this is
 * some other payment, and those flags are stale".
 */
export const CART_CHECKOUT_ACTIVE = 'ecolink_cart_checkout_active'
export const CART_PENDING_LISTING = 'ecolink_cart_pending_listing'
export const CART_PENDING_SESSION = 'ecolink_cart_pending_session'

/**
 * Clear all three together. They are only ever meaningful as a set, and the
 * three sites that need to clear them (checkout failed to start, the cart item
 * settled, the flags turned out to be stale) previously cleared two keys each
 * by hand — the shape that has produced a fix-on-one-branch-not-its-sibling
 * defect five times in this repo.
 */
export function clearCartCheckoutFlags() {
  try {
    localStorage.removeItem(CART_CHECKOUT_ACTIVE)
    localStorage.removeItem(CART_PENDING_LISTING)
    localStorage.removeItem(CART_PENDING_SESSION)
  } catch {
    /* storage unavailable — non-critical */
  }
}

/**
 * What the stored flags mean for the payment that just settled.
 *
 * A pure function on purpose. The judgement it makes — "may I delete an item
 * from this buyer's basket?" — lived inline in `PaymentCallbackView.onMounted`,
 * where reaching it in a test means mounting a view that redirects, imports
 * PayMongo and polls Supabase. So it was never tested, and the missing case sat
 * there unnoticed.
 *
 * @param {string} settledSessionId the checkout session the callback verified
 * @returns {'inactive'|'match'|'stale'}
 *   `inactive` — no cart checkout is in progress; leave the basket alone.
 *   `match`    — this payment IS the cart's current item; remove it and resume.
 *   `stale`    — a cart checkout was abandoned and this is a different payment.
 */
export function cartCheckoutState(settledSessionId) {
  try {
    if (localStorage.getItem(CART_CHECKOUT_ACTIVE) !== '1') return 'inactive'
    const bound = localStorage.getItem(CART_PENDING_SESSION)
    // No bound session means the flags predate this binding, or were written by
    // a checkout that never returned a session id. Either way there is nothing
    // proving this payment is the cart's, and the safe direction is to leave a
    // paid item in the basket rather than delete an unpaid one.
    if (!bound || !settledSessionId) return 'stale'
    return bound === settledSessionId ? 'match' : 'stale'
  } catch {
    return 'inactive'
  }
}
