import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * The fulfillment saga exists TWICE and the comment says "keep the two in sync".
 *
 * - `src/services/credits/fulfillmentSaga.js` — imported by NOTHING except its
 *   own unit test.
 * - the TS port inside `supabase/functions/paymongo-webhook/index.ts` — the one
 *   that actually settles money.
 *
 * So `fulfillmentSaga.test.js` is green about code that does not run, while the
 * code that moves money had no test at all. That is DEFERRED_BACKLOG #21's
 * "~40 tests overstate money-path coverage" in its sharpest form, and on
 * 2026-08-01 it had already produced two real divergences:
 *
 *   1. **No retry cap in the live copy.** The JS saga stops after
 *      MAX_ATTEMPTS = 3. The port had no such check, so a failing supplier was
 *      re-attempted on every webhook redelivery, forever.
 *   2. **The live copy ignored its own lookup error.** It destructured `data`
 *      only, so a transient `supplier_orders` read failure left `order`
 *      undefined — and the placeOrder branch begins `if (!order || …)`, so the
 *      saga placed a SECOND supplier order for a transaction that already had
 *      one. That defeats the `transaction_id UNIQUE` key and the entire
 *      idempotency design, which exist because PayMongo retries webhooks.
 *
 * "Kept in sync by hand" is not a mechanism, it is a hope. This test is the
 * mechanism: it cannot prove the two behave identically — only a Deno test
 * against the real function could — but it does assert that the invariants which
 * ALREADY drifted are present in both. A drift that has happened once is the
 * likeliest thing to happen again.
 *
 * If the two are ever unified, delete this file rather than maintaining it.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const JS = readFileSync(resolve(HERE, '../../services/credits/fulfillmentSaga.js'), 'utf8')
const TS = readFileSync(
  resolve(HERE, '../../../supabase/functions/paymongo-webhook/index.ts'),
  'utf8',
)

describe('fulfillment saga — the live copy carries the same guards as the tested one', () => {
  it('both cap retries at the same number of attempts', () => {
    const jsCap = JS.match(/MAX_ATTEMPTS\s*=\s*(\d+)/)
    const tsCap = TS.match(/MAX_FULFILLMENT_ATTEMPTS\s*=\s*(\d+)/)

    expect(jsCap, 'JS saga lost its MAX_ATTEMPTS constant').not.toBeNull()
    expect(tsCap, 'webhook saga has no attempts cap — a failing supplier retries forever').not.toBeNull()
    expect(tsCap[1]).toBe(jsCap[1])
  })

  it('both actually USE the cap, not merely declare it', () => {
    // Declaring a constant nobody reads is the placebo pattern this repo has
    // shipped four times. A cap that is never compared against is not a cap.
    expect(JS).toMatch(/attempts\s*\?\?\s*0\)\s*>=\s*MAX_ATTEMPTS/)
    expect(TS).toMatch(/attempts\s*\?\?\s*0\)\s*>=\s*MAX_FULFILLMENT_ATTEMPTS/)
  })

  it('both treat a failed supplier_orders lookup as an error, not as "no order"', () => {
    // The JS copy throws; the port must at least capture the error rather than
    // destructuring `data` alone and falling into the placeOrder branch.
    expect(JS).toMatch(/supplier_orders lookup failed/)
    expect(TS).toMatch(/error:\s*orderError/)
    expect(TS).toMatch(/supplier_orders lookup failed/)
  })

  it('both compensate through the same idempotent refund RPC', () => {
    // The compensation path is the one that touches real money. If these ever
    // differ, one copy is reversing a purchase the other is not.
    expect(JS).toMatch(/rpc\('refund_purchase'/)
    expect(TS).toMatch(/rpc\('refund_purchase'/)
    expect(JS).toMatch(/Auto-refund \(supplier fulfillment\)/)
    expect(TS).toMatch(/Auto-refund \(supplier fulfillment\)/)
  })

  it('both treat retired and refunded as terminal, so a webhook retry is a no-op', () => {
    expect(JS).toMatch(/status === 'retired' \|\| order\.status === 'refunded'/)
    expect(TS).toMatch(/status === 'retired' \|\| order\.status === 'refunded'/)
  })
})
