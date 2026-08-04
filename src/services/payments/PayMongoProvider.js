import { PaymentProvider, totalFromLineItems } from './PaymentProvider'
import {
  createCheckoutSession,
  processPaymentCallback,
  isPayMongoConfigured,
} from '@/services/paymongoService'
import { processRefund, getSupportedPaymentMethods } from '@/services/paymentGatewayService'

/**
 * How far a webhook signature's `t` may be from now before it is treated as a
 * replay. **Must equal `SIGNATURE_TOLERANCE_SECONDS` in
 * `supabase/functions/paymongo-webhook/index.ts`**, which is the copy that
 * actually guards money. `webhookSignatureParity.test.js` asserts the two
 * numbers match, because a tolerance that silently widened here would be
 * invisible: every signature test would still pass.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 300

/**
 * PayMongo-backed provider. Thin adapter over the existing paymongoService /
 * paymentGatewayService functions so the rest of Phase 1 can depend on the
 * PaymentProvider interface instead of those concrete modules.
 *
 * NOTE: createCheckout here still flows through the browser today. Phase 1.2
 * moves the authoritative amount computation into the Edge Function; this
 * adapter already totals from line items (not a passed-in amount) so callers
 * are interface-correct ahead of that move.
 */
export class PayMongoProvider extends PaymentProvider {
  get id() {
    return 'paymongo'
  }

  isConfigured() {
    try {
      return isPayMongoConfigured()
    } catch {
      return false
    }
  }

  async createCheckout({ lineItems = [], currency = 'PHP', billing, metadata = {} }) {
    if (!lineItems.length) {
      throw new Error('createCheckout requires at least one line item')
    }
    const amount = totalFromLineItems(lineItems)
    if (amount <= 0) {
      throw new Error('createCheckout computed a non-positive amount')
    }

    const first = lineItems[0]
    const result = await createCheckoutSession({
      amount,
      description: first?.name,
      billing,
      metadata: {
        ...metadata,
        quantity: metadata.quantity ?? first?.quantity,
        price_per_credit: metadata.price_per_credit ?? first?.unitAmount,
      },
    })

    return {
      sessionId: result.sessionId,
      checkoutUrl: result.checkoutUrl,
      amount: result.amount ?? amount,
      currency: result.currency ?? currency,
      expiresAt: result.expiresAt ?? null,
    }
  }

  async verifyPayment(sessionId) {
    const result = await processPaymentCallback(sessionId)
    const payment = result?.payment ?? {}
    const rawStatus = payment.status
    const status = rawStatus === 'paid' ? 'paid' : rawStatus === 'failed' ? 'failed' : 'pending'

    return {
      status,
      paymentId: payment.id ?? null,
      amount: Number(payment.amount) || 0,
      currency: payment.currency ?? 'PHP',
      fee: Number(payment.fee) || 0,
      paymentMethod: result?.paymentMethod ?? payment.payment_method ?? 'unknown',
    }
  }

  async refund({ paymentId, amount, reason }) {
    const refund = await processRefund(paymentId, amount, reason)
    return {
      refundId: refund.id,
      status: refund.status === 'completed' ? 'completed' : 'pending',
    }
  }

  /**
   * Verify a PayMongo webhook signature.
   * Header format: `t=<unix_ts>,te=<test_sig>,li=<live_sig>`; the signed message
   * is `${t}.${rawBody}`, HMAC-SHA256 with the webhook secret, hex-encoded.
   *
   * ## 2026-08-04 — this was MISSING replay protection, and its tests were green
   *
   * The live code that actually guards money —
   * `supabase/functions/paymongo-webhook/index.ts` — rejects a signature whose
   * `t` is more than {@link SIGNATURE_TOLERANCE_SECONDS} away from now. **This
   * copy did not check `t` at all.** It read the timestamp, used it to rebuild
   * the signed message, and never compared it to the clock. A webhook captured
   * once could therefore be replayed here **indefinitely** and verify true,
   * because a valid old signature stays valid forever if nothing looks at the
   * age.
   *
   * That matters beyond this file, and it is the reason it was fixed rather
   * than deleted along with the rest of the unused provider layer. Backlog #21
   * asks whether to *route the money path through this layer* or delete it. Had
   * it been adopted as it stood, the money path would have silently lost replay
   * protection — and the ~40 provider tests, including the five signature ones,
   * would all have stayed green, because none of them signed anything with an
   * old timestamp. **A decision cannot be made honestly against a copy that is
   * weaker than the thing it would replace.**
   *
   * Mirror image of the fulfillment saga's drift (see
   * `fulfillmentSagaParity.test.js`), where the *live* copy was the weaker one.
   * Two copies drifting in opposite directions is the same defect, and the same
   * reason "keep the two in sync" is a hope rather than a mechanism.
   *
   * @param {{ payload: string, signature: string, secret?: string,
   *           nowSeconds?: number }} args
   *   `nowSeconds` is injectable so the replay window is testable without
   *   waiting five minutes; it defaults to the real clock.
   * @returns {Promise<boolean>}
   */
  async verifyWebhookSignature({ payload, signature, secret, nowSeconds }) {
    if (!secret || !signature || !payload) return false
    const parts = Object.fromEntries(
      signature.split(',').map((kv) => kv.split('=').map((s) => s.trim())),
    )
    const timestamp = parts.t
    const provided = parts.li || parts.te
    if (!timestamp || !provided) return false

    // Replay window. Must stay in step with the edge function's
    // SIGNATURE_TOLERANCE_SECONDS — pinned by webhookSignatureParity.test.js.
    const ts = Number(timestamp)
    const now = Number.isFinite(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000)
    if (!Number.isFinite(ts) || Math.abs(now - ts) > SIGNATURE_TOLERANCE_SECONDS) return false

    const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`)
    return timingSafeEqual(expected, provided)
  }

  getSupportedMethods() {
    try {
      return getSupportedPaymentMethods().map((m) => ({ id: m.id, name: m.name }))
    } catch {
      return []
    }
  }
}

/** HMAC-SHA256 hex digest using Web Crypto (browser + Deno). */
async function hmacSha256Hex(secret, message) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sigBuffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time-ish string comparison to avoid timing leaks. */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}
