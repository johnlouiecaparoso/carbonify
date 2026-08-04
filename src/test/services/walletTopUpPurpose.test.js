import { describe, it, expect } from 'vitest'
import { resolveWalletTopUp, PURPOSE_WALLET_TOPUP } from '@/services/paymentPurpose'

/**
 * P5 — wallet top-ups on `payment_intents` — was done server-side long ago: the
 * checkout function writes `purpose: 'wallet_topup'`, the webhook credits the
 * balance from it, `paymongo-reconcile` sweeps every intent regardless of
 * purpose, and `paymongo-resettle` heals top-ups by name.
 *
 * The callback page never got the memo. It decided "was this a top-up?" from a
 * `localStorage` key written before the redirect — the last branch in the money
 * path chosen from browser storage. Whenever the payment finished somewhere the
 * redirect had not started (another browser, another device, storage cleared),
 * the balance was still credited and the confirmation screen said nothing about
 * it. Right balance, silent receipt.
 *
 * The intent is now the authority; the keys remain only as a fallback for when
 * it cannot be read.
 */

const ME = 'aaaaaaaa-1111-1111-1111-111111111111'
const SOMEONE_ELSE = 'bbbbbbbb-2222-2222-2222-222222222222'
const SESSION = 'cs_abc123'

describe('resolveWalletTopUp — the server decides, storage only fills gaps', () => {
  describe('when the intent is readable', () => {
    it('recognises a top-up with no localStorage at all', () => {
      // The whole point: finish the payment in a different browser and it still
      // reads as a top-up.
      expect(
        resolveWalletTopUp({
          intent: { purpose: PURPOSE_WALLET_TOPUP },
          sessionId: SESSION,
          currentUserId: ME,
          storedSession: null,
          storedOwner: null,
        }),
      ).toBe(true)
    })

    it('is NOT a top-up when the intent says it was a purchase', () => {
      expect(
        resolveWalletTopUp({
          intent: { purpose: 'marketplace_purchase' },
          sessionId: SESSION,
          currentUserId: ME,
          storedSession: null,
          storedOwner: null,
        }),
      ).toBe(false)
    })

    it('overrides a stale localStorage key that claims otherwise', () => {
      // A top-up was started and abandoned, then a marketplace purchase was
      // completed. The stale key says "top-up"; the intent says "purchase". The
      // stale key is the bug, so the server wins.
      expect(
        resolveWalletTopUp({
          intent: { purpose: 'marketplace_purchase' },
          sessionId: SESSION,
          currentUserId: ME,
          storedSession: SESSION,
          storedOwner: ME,
        }),
      ).toBe(false)
    })

    it('does not need the owner keys to be right, because RLS already scoped the row', () => {
      // getIntentBySession filters on user_id AND payment_intents is owner-scoped
      // by RLS, so an intent that came back at all belongs to this user. A
      // leftover owner key from another account must not override that.
      expect(
        resolveWalletTopUp({
          intent: { purpose: PURPOSE_WALLET_TOPUP },
          sessionId: SESSION,
          currentUserId: ME,
          storedSession: SESSION,
          storedOwner: SOMEONE_ELSE,
        }),
      ).toBe(true)
    })
  })

  describe('fallback, when the intent cannot be read', () => {
    it('falls back to the matching stored session', () => {
      expect(
        resolveWalletTopUp({
          intent: null,
          sessionId: SESSION,
          currentUserId: ME,
          storedSession: SESSION,
          storedOwner: ME,
        }),
      ).toBe(true)
    })

    it('rejects a stored session for a DIFFERENT payment', () => {
      expect(
        resolveWalletTopUp({
          intent: null,
          sessionId: SESSION,
          currentUserId: ME,
          storedSession: 'cs_some_other_checkout',
          storedOwner: ME,
        }),
      ).toBe(false)
    })

    it('rejects a pending top-up started by another account on a shared device', () => {
      expect(
        resolveWalletTopUp({
          intent: null,
          sessionId: SESSION,
          currentUserId: ME,
          storedSession: SESSION,
          storedOwner: SOMEONE_ELSE,
        }),
      ).toBe(false)
    })

    it('returns false when there is nothing stored either', () => {
      expect(
        resolveWalletTopUp({
          intent: null,
          sessionId: SESSION,
          currentUserId: ME,
          storedSession: null,
          storedOwner: null,
        }),
      ).toBe(false)
    })

    it('treats an intent with no purpose as unreadable rather than as "not a top-up"', () => {
      // A row that came back without the column selected must not silently
      // answer the question — it has not been asked.
      expect(
        resolveWalletTopUp({
          intent: {},
          sessionId: SESSION,
          currentUserId: ME,
          storedSession: SESSION,
          storedOwner: ME,
        }),
      ).toBe(true)
    })
  })

  it('never reports a top-up when there is no session to match', () => {
    expect(
      resolveWalletTopUp({
        intent: null,
        sessionId: null,
        currentUserId: ME,
        storedSession: null,
        storedOwner: ME,
      }),
    ).toBe(false)
  })
})
