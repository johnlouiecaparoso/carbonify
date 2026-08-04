import { describe, it, expect, beforeAll, vi } from 'vitest'

// Avoid pulling in real service side effects; PayMongoProvider only needs these
// modules to exist for its other methods, not for signature verification.
vi.mock('@/services/paymongoService', () => ({
  createCheckoutSession: vi.fn(),
  processPaymentCallback: vi.fn(),
  isPayMongoConfigured: () => false,
}))
vi.mock('@/services/paymentGatewayService', () => ({
  processRefund: vi.fn(),
  getSupportedPaymentMethods: () => [],
}))

import { PayMongoProvider, SIGNATURE_TOLERANCE_SECONDS } from '@/services/payments/PayMongoProvider'

const SECRET = 'whsec_test_123'
const PAYLOAD = JSON.stringify({ data: { id: 'evt_1' } })

/**
 * A fixed "now" for the signing tests. Every case below states the clock
 * explicitly instead of using the real one.
 *
 * ⚠️ **Until 2026-08-04 these tests signed with `t = '1700000000'` — 14 November
 * 2023 — and passed.** They were not *simulating* a replay; they were performing
 * one, and the implementation accepted it, because it read `t`, used it to
 * rebuild the signed message, and never compared it to the clock. A signature
 * older than two years verified true. That is the missing replay check,
 * demonstrated by the suite that was supposed to cover this.
 */
const NOW = 1700000000

/** Same algorithm the edge function uses: HMAC-SHA256 hex of `${t}.${payload}`. */
async function sign(secret, message) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

describe('PayMongoProvider.verifyWebhookSignature', () => {
  let provider
  beforeAll(() => {
    provider = new PayMongoProvider()
  })

  /** Sign `payload` at time `t` and verify it with the clock at `nowSeconds`. */
  async function verifyAt({ t = NOW, nowSeconds = NOW, secret = SECRET, signWith = SECRET, payload = PAYLOAD, signedPayload = payload, field = 'li' }) {
    const sig = await sign(signWith, `${t}.${signedPayload}`)
    return provider.verifyWebhookSignature({
      payload,
      signature: `t=${t},${field}=${sig}`,
      secret,
      nowSeconds,
    })
  }

  it('accepts a correctly-signed live (li) signature', async () => {
    expect(await verifyAt({})).toBe(true)
  })

  it('accepts a correctly-signed test (te) signature when li is absent', async () => {
    expect(await verifyAt({ field: 'te' })).toBe(true)
  })

  it('prefers li over te when both are present', async () => {
    // The live function reads `parts.li || parts.te`. If te were preferred, a
    // caller holding only a test secret could satisfy a live webhook.
    const t = NOW
    const good = await sign(SECRET, `${t}.${PAYLOAD}`)
    const bad = await sign('whsec_wrong', `${t}.${PAYLOAD}`)
    expect(
      await provider.verifyWebhookSignature({
        payload: PAYLOAD,
        signature: `t=${t},te=${bad},li=${good}`,
        secret: SECRET,
        nowSeconds: t,
      }),
    ).toBe(true)
    expect(
      await provider.verifyWebhookSignature({
        payload: PAYLOAD,
        signature: `t=${t},te=${good},li=${bad}`,
        secret: SECRET,
        nowSeconds: t,
      }),
    ).toBe(false)
  })

  it('rejects a tampered payload', async () => {
    const tampered = JSON.stringify({ data: { id: 'evt_EVIL' } })
    expect(await verifyAt({ payload: tampered, signedPayload: PAYLOAD })).toBe(false)
  })

  it('rejects a wrong secret', async () => {
    expect(await verifyAt({ signWith: 'whsec_wrong' })).toBe(false)
  })

  it('rejects a malformed or empty header / missing secret', async () => {
    const base = { payload: PAYLOAD, secret: SECRET, nowSeconds: NOW }
    expect(await provider.verifyWebhookSignature({ ...base, signature: 'garbage' })).toBe(false)
    expect(await provider.verifyWebhookSignature({ ...base, signature: '' })).toBe(false)

    const sig = await sign(SECRET, `${NOW}.${PAYLOAD}`)
    expect(
      await provider.verifyWebhookSignature({
        payload: PAYLOAD,
        signature: `t=${NOW},li=${sig}`,
        secret: '',
        nowSeconds: NOW,
      }),
    ).toBe(false)
  })

  describe('replay protection', () => {
    it('rejects a valid signature that is older than the tolerance', async () => {
      // The attack this stops: a webhook is captured once — from a proxy log, a
      // browser history entry, a leaked request dump — and re-sent later. The
      // signature is genuine and stays genuine forever; only the clock makes it
      // stale. Without this check the same `checkout_session.payment.paid`
      // could be delivered again and again.
      const t = NOW
      const later = NOW + SIGNATURE_TOLERANCE_SECONDS + 1
      expect(await verifyAt({ t, nowSeconds: later })).toBe(false)
    })

    it('rejects a signature timestamped too far in the FUTURE', async () => {
      // Symmetric on purpose (`Math.abs`). A one-sided check would let a
      // forged-clock signature sit valid for as long as the attacker chose.
      const t = NOW + SIGNATURE_TOLERANCE_SECONDS + 1
      expect(await verifyAt({ t, nowSeconds: NOW })).toBe(false)
    })

    it('accepts a signature at the edge of the window, in both directions', async () => {
      // A boundary that rejects what it should accept is its own outage: real
      // webhooks arrive with genuine network delay.
      expect(await verifyAt({ t: NOW, nowSeconds: NOW + SIGNATURE_TOLERANCE_SECONDS })).toBe(true)
      expect(await verifyAt({ t: NOW, nowSeconds: NOW - SIGNATURE_TOLERANCE_SECONDS })).toBe(true)
    })

    it('rejects a non-numeric timestamp rather than treating it as 0', async () => {
      // `Number('abc')` is NaN, and every comparison with NaN is false — so a
      // `>` test alone would fall through to "in tolerance". The guard is
      // `!Number.isFinite(ts)`, checked explicitly.
      const sig = await sign(SECRET, `abc.${PAYLOAD}`)
      expect(
        await provider.verifyWebhookSignature({
          payload: PAYLOAD,
          signature: `t=abc,li=${sig}`,
          secret: SECRET,
          nowSeconds: NOW,
        }),
      ).toBe(false)
    })

    it('uses the real clock when nowSeconds is not supplied', async () => {
      // The injectable clock must not become a way to bypass the window: a
      // caller that passes nothing gets Date.now(), so a 2023 timestamp fails.
      const nowReal = Math.floor(Date.now() / 1000)
      const fresh = await sign(SECRET, `${nowReal}.${PAYLOAD}`)
      const stale = await sign(SECRET, `1700000000.${PAYLOAD}`)

      expect(
        await provider.verifyWebhookSignature({
          payload: PAYLOAD,
          signature: `t=${nowReal},li=${fresh}`,
          secret: SECRET,
        }),
      ).toBe(true)
      expect(
        await provider.verifyWebhookSignature({
          payload: PAYLOAD,
          signature: `t=1700000000,li=${stale}`,
          secret: SECRET,
        }),
      ).toBe(false)
    })
  })
})
