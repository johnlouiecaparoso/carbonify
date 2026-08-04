import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { SIGNATURE_TOLERANCE_SECONDS } from '@/services/payments/PayMongoProvider'

/**
 * Webhook signature verification exists TWICE, and on 2026-08-04 the two had
 * drifted — in the opposite direction to the fulfillment saga.
 *
 * - `supabase/functions/paymongo-webhook/index.ts` — the copy that actually
 *   guards money. Rejects a signature whose `t` is more than 300s from now.
 * - `src/services/payments/PayMongoProvider.js` — imported by nothing except
 *   its own test. **Had no timestamp check at all**, so a captured webhook
 *   verified true forever.
 *
 * Its five signature tests all signed with `t = '1700000000'` (November 2023)
 * and passed, which is the missing check demonstrated rather than argued.
 *
 * **Why this matters beyond a dead file.** Backlog #21 asks whether to route
 * the money path *through* this provider layer or delete it. Adopting it as it
 * stood would have silently removed replay protection from the money path,
 * with all ~40 provider tests staying green. A decision cannot be made honestly
 * against a copy that is quietly weaker than the thing it would replace.
 *
 * This file cannot prove the two behave identically — only a Deno test against
 * the real function could. It asserts that the invariants which matter are
 * present in BOTH, and that the two tolerance values are the same number. A
 * drift that has already happened twice, in both directions, is the likeliest
 * thing to happen again.
 *
 * If the two are ever unified, delete this file rather than maintaining it.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const TS = readFileSync(
  resolve(HERE, '../../../supabase/functions/paymongo-webhook/index.ts'),
  'utf8',
)

describe('webhook signature — the live copy and the provider carry the same guards', () => {
  it('declares the same replay tolerance on both sides', () => {
    const match = TS.match(/SIGNATURE_TOLERANCE_SECONDS\s*=\s*(\d+)/)
    expect(match, 'live function no longer declares SIGNATURE_TOLERANCE_SECONDS').toBeTruthy()
    expect(Number(match[1])).toBe(SIGNATURE_TOLERANCE_SECONDS)
  })

  it('the live copy still enforces the window rather than merely declaring it', () => {
    // A constant nothing reads is the exact shape of `wallet_topup_user_id` —
    // a guard that exists only as decoration. Assert the comparison, not the
    // declaration.
    expect(TS).toMatch(/Math\.abs\(\s*nowSeconds\s*-\s*ts\s*\)\s*>\s*SIGNATURE_TOLERANCE_SECONDS/)
  })

  it('the live copy rejects a non-finite timestamp explicitly', () => {
    // Without this, `Number('abc')` is NaN and every `>` comparison is false,
    // so a malformed `t` falls through as "inside the window".
    expect(TS).toMatch(/!Number\.isFinite\(\s*ts\s*\)/)
  })

  it('the live copy prefers the live signature over the test one', () => {
    expect(TS).toMatch(/parts\.li\s*\|\|\s*parts\.te/)
  })

  it('the live copy signs `${timestamp}.${payload}`, not the payload alone', () => {
    // If the timestamp left the signed message, `t` could be rewritten freely
    // and the replay window would become decorative.
    expect(TS).toMatch(/hmacSha256Hex\(\s*secret\s*,\s*`\$\{timestamp\}\.\$\{payload\}`\s*\)/)
  })

  it('the live copy compares with a length-checked timing-safe equal', () => {
    expect(TS).toMatch(/function\s+timingSafeEqual/)
    expect(TS).toMatch(/if\s*\(\s*a\.length\s*!==\s*b\.length\s*\)\s*return\s+false/)
    expect(TS).toMatch(/timingSafeEqual\(\s*expected\s*,\s*provided\s*\)/)
  })

  it('the live copy fails CLOSED when the secret is unset', () => {
    // The one documented exception is ALLOW_UNSIGNED_WEBHOOKS, which must stay
    // opt-in. YOUR_ACTION_ITEMS records that it is unset on live — "unset, not
    // false" — and this asserts the code still treats an absent secret as a
    // rejection unless that flag is explicitly on.
    expect(TS).toMatch(/if\s*\(\s*!secret\s*\)/)
    expect(TS).toMatch(/ALLOW_UNSIGNED_WEBHOOKS/)
    expect(TS).toMatch(/reason:\s*'PAYMONGO_WEBHOOK_SECRET not configured'/)
  })

  it('ALLOW_UNSIGNED_WEBHOOKS is opt-in — it is never defaulted to true', () => {
    // A default of true would make every unsigned webhook acceptable in
    // production, which is the single worst configuration this file can have.
    const decl = TS.match(/ALLOW_UNSIGNED_WEBHOOKS\s*=\s*([^\n]+)/)
    expect(decl, 'ALLOW_UNSIGNED_WEBHOOKS declaration not found').toBeTruthy()
    expect(decl[1]).toMatch(/===\s*'true'/)
  })
})
