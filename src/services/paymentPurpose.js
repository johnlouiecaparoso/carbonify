/**
 * What kind of payment just settled?
 *
 * ## Why this exists (P5, completed 2026-08-04)
 *
 * Wallet top-ups were migrated onto `payment_intents` some time ago: the
 * checkout function creates the intent with `purpose: 'wallet_topup'`, the
 * webhook credits the balance from it, `paymongo-reconcile` sweeps every intent
 * regardless of purpose, and `paymongo-resettle` heals top-ups by name. All of
 * that is server-side and done.
 *
 * **The callback page never got the memo.** It still decided "was this a top-up?"
 * by comparing the settled session id against a `localStorage` key written
 * before the redirect — the last place in the money path where a *branch* was
 * chosen from browser storage rather than from the server. That is fragile in
 * exactly the ways browser storage always is:
 *
 *   - finish the payment in a different browser, or on a phone after starting on
 *     a desktop, and the key is not there;
 *   - private-mode session ends, storage cleared, "clear data on exit" enabled —
 *     same result;
 *   - shared device: the key belongs to whoever used the machine last.
 *
 * In every one of those cases the money is still credited — the webhook does not
 * care what the browser thinks — but the confirmation screen fails to recognise
 * the top-up and says nothing about it. *The balance is right and the receipt is
 * silent*, which is precisely the combination that generates a support ticket.
 *
 * The intent is the authority, and reading it also makes the shared-device case
 * structural rather than checked: `payment_intents` carries an owner-scoped RLS
 * policy, so another account's intent is not returned at all. A database that
 * cannot hand you someone else's row beats a string comparison against a key
 * that anyone on the device could have written.
 */

/** The `payment_intents.purpose` value for a wallet top-up. */
export const PURPOSE_WALLET_TOPUP = 'wallet_topup'

/**
 * Decide whether the settled payment was a wallet top-up.
 *
 * Pure on purpose: the same reasoning as `cartCheckoutState` in
 * `constants/cart.js`. The judgement lived inside `PaymentCallbackView.onMounted`,
 * where reaching it in a test means mounting a view that redirects to a payment
 * provider and polls Supabase — so it was never tested.
 *
 * @param {object}  args
 * @param {{purpose?: string}|null} args.intent
 *   The `payment_intents` row for this session, or null if it could not be read.
 * @param {string}  args.sessionId       the checkout session that just settled
 * @param {string|null} args.currentUserId
 * @param {string|null} args.storedSession  legacy `wallet_topup_session`
 * @param {string|null} args.storedOwner    legacy `wallet_topup_user_id`
 * @returns {boolean}
 */
export function resolveWalletTopUp({
  intent,
  sessionId,
  currentUserId,
  storedSession,
  storedOwner,
}) {
  // Server first, and it is the whole answer when present. A readable intent
  // that says 'marketplace_purchase' means this is NOT a top-up, even if a
  // stale localStorage key claims otherwise — the stale key is the bug.
  if (intent?.purpose) return intent.purpose === PURPOSE_WALLET_TOPUP

  // Fallback: the pre-P5 behaviour, for when the intent cannot be read (offline,
  // RLS edge, a row that predates this). Deliberately unchanged rather than
  // "improved", so a failed read degrades to what shipped before and never to
  // something new and untested.
  if (!storedSession || !sessionId || storedSession !== sessionId) return false

  // These keys are device-global, so on a shared machine they outlive the
  // account that wrote them. A pending top-up started by somebody else is not
  // this person's payment to report on.
  if (storedOwner && currentUserId && storedOwner !== currentUserId) return false

  return true
}
