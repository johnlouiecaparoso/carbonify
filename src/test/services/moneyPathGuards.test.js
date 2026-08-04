import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Ratchets for the 2026-08-04 money-path defect pass. Each of these was a real
 * bug where a guard existed on one branch and not its sibling, or where a check
 * read the wrong column — the class of thing a green test suite happily allows
 * back in. There is no live DB in unit tests, so, following this repo's
 * convention (moneyTableRls.test.js, adminSegregation.test.js), these assert the
 * RULE the artifact must encode.
 */

const here = dirname(fileURLToPath(import.meta.url))
const repo = (p) => readFileSync(resolve(here, '../../../', p), 'utf8')

/**
 * Migrations in this repo carry long headers that QUOTE the code they replace,
 * so a naive search finds the old, wrong version in the prose and reports the
 * fix as missing (or, worse, an assertion that a bad pattern is absent fails on
 * the comment explaining why it was removed). Assert against executable SQL only.
 */
const code = (sql) =>
  sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')

const walletPurchaseSql = code(repo(
  'supabase/migrations/20260804000100_wallet_purchase_trade_gate.sql',
))
const settlementSql = code(repo(
  'supabase/migrations/20260804000300_settlement_records_real_payment_method.sql',
))
const payoutSql = code(repo(
  'supabase/migrations/20260804000400_payout_suspension_and_idempotency_scope.sql',
))
const profileGrantsSql = code(repo(
  'supabase/migrations/20260804000200_profiles_column_grants_denylist.sql',
))
const checkoutFn = repo('supabase/functions/paymongo-checkout/index.ts')
const webhookFn = repo('supabase/functions/paymongo-webhook/index.ts')
const resettleFn = repo('supabase/functions/paymongo-resettle/index.ts')
const marketplaceSvc = repo('src/services/marketplaceService.js')

describe('the trade gate covers BOTH purchase paths', () => {
  // The original defect: assert_can_trade had exactly one call site (the card
  // path), so KYC and account suspension were unenforced on wallet purchases —
  // and process_wallet_purchase is granted to `authenticated`, so the browser
  // check was bypassable by calling the RPC directly.
  it('the wallet purchase RPC calls assert_can_trade', () => {
    expect(walletPurchaseSql).toMatch(/perform\s+public\.assert_can_trade\(\s*v_buyer\s*\)/i)
  })

  it('gates before any wallet debit, not after', () => {
    const gateAt = walletPurchaseSql.search(/perform\s+public\.assert_can_trade/i)
    const debitAt = walletPurchaseSql.search(/update public\.wallet_accounts/i)
    expect(gateAt).toBeGreaterThan(-1)
    expect(debitAt).toBeGreaterThan(gateAt)
  })

  it('the card checkout path still calls assert_can_trade', () => {
    expect(checkoutFn).toMatch(/rpc\(\s*'assert_can_trade'/)
  })

  it('wallet top-up refuses a suspended account', () => {
    expect(checkoutFn).toMatch(/rpc\(\s*'assert_not_suspended'/)
  })

  it('the wallet RPC keeps its velocity cap and self-purchase guard', () => {
    expect(walletPurchaseSql).toMatch(/perform\s+public\.check_velocity_limit/i)
    expect(walletPurchaseSql).toMatch(/cannot buy your own listing/i)
  })
})

describe('escrow gates on the real payment method, not the gateway', () => {
  // payment_intents.provider is always the literal 'paymongo', so gating the
  // escrow hold window on it made the push-payment branch dead code: every
  // sale, GCash included, took the 7-day card hold.
  it('the settlement RPC no longer matches the method against `provider`', () => {
    expect(settlementSql).not.toMatch(/lower\(coalesce\(v_intent\.provider/i)
  })

  it('resolves the method from payment_method, falling back to provider', () => {
    expect(settlementSql).toMatch(/v_intent\.payment_method[\s\S]{0,80}v_intent\.provider/i)
    expect(settlementSql).toMatch(/v_method\s*~\s*'\(gcash\|maya\|paymaya\|grab\)'/i)
  })

  it('records the resolved method on the transaction', () => {
    // credit_transactions.payment_method used to be written as v_intent.provider,
    // so every online purchase read 'paymongo' and no export could tell a card
    // sale from a GCash one.
    expect(settlementSql).not.toMatch(/v_intent\.currency,\s*v_intent\.provider,/)
    expect(settlementSql).toMatch(/v_intent\.currency,\s*v_method,/)
  })

  it('adds the column the RPC reads', () => {
    expect(settlementSql).toMatch(
      /alter table public\.payment_intents\s+add column if not exists payment_method/i,
    )
  })

  it('both settlement paths supply the method', () => {
    // The webhook is the normal path; resettle heals orphaned paid intents. If
    // only one of them recorded the method, the hold a seller got would depend
    // on which path happened to fulfil the purchase.
    for (const fn of [webhookFn, resettleFn]) {
      expect(fn).toMatch(/resolvePaymentMethod/)
      expect(fn).toMatch(/payment_method:/)
    }
  })

  it('the two method resolvers agree on their aliases', () => {
    const aliasesOf = (src) => {
      const block = src.match(/PAYMENT_METHOD_ALIASES[^{]*\{([\s\S]*?)\}/)
      expect(block).toBeTruthy()
      return block[1].replace(/\s/g, '')
    }
    expect(aliasesOf(webhookFn)).toBe(aliasesOf(resettleFn))
  })

  // The lookup chain, not the whole file: a first draft of the test below
  // asserted `payment_method_used` appeared anywhere in the source, and the
  // mutation check caught it passing on the COMMENT that explains the field.
  const lookupChainOf = (src) => {
    const chain = src.match(/const raw =([\s\S]*?)null/)
    expect(chain).toBeTruthy()
    // The two resolvers differ only in optional chaining on the parameter.
    return chain[1].replace(/\s/g, '').replace(/attrs\?\./g, 'attrs.')
  }

  it('the two method resolvers read the same fields, in the same order', () => {
    // Same drift class as the alias table above, and with a worse failure mode:
    // a lookup present in one resolver and not the other means the escrow window
    // a seller gets depends on whether the webhook or the healer settled them.
    expect(lookupChainOf(webhookFn)).toBe(lookupChainOf(resettleFn))
  })

  it('both resolvers read the checkout SESSION field, not only the payment', () => {
    // PayMongo puts the method on the payment resource as `source.type` and on
    // the checkout session as `payment_method_used`. Reading only the payment
    // resource resolves to null whenever the session is the one carrying it —
    // and null falls back to `provider`, which is the exact dead-gate defect
    // 20260804000300 exists to fix, restored silently.
    for (const fn of [webhookFn, resettleFn]) {
      expect(lookupChainOf(fn)).toContain('payment_method_used')
    }
  })

  it('both settlement paths fall back to the session when the payment omits it', () => {
    expect(webhookFn).toMatch(
      /resolvePaymentMethod\(payment\)\s*\?\?\s*resolvePaymentMethod\(resourceAttrs\)/,
    )
    expect(resettleFn).toMatch(/resolvePaymentMethod\(attrs\)\s*\?\?\s*sessionMethod/)
  })
})

describe('the quoted price is the price that gets charged', () => {
  // Settlement recomputes from credit_listings.price_per_credit. Display used to
  // prefer projects.credit_price, which update_my_listing never updates — so
  // after a seller edited their price, buyers saw one number and paid another.
  it('marketplace listings quote the listing price first', () => {
    const block = marketplaceSvc.match(/const pricePerCredit\s*=([\s\S]*?)\n\n/)
    expect(block).toBeTruthy()
    const chain = block[1]
    expect(chain.indexOf('listing.price_per_credit')).toBeGreaterThan(-1)
    expect(chain.indexOf('listing.price_per_credit')).toBeLessThan(
      chain.indexOf('project.credit_price'),
    )
  })

  it('the purchase quote uses the listing price first', () => {
    expect(marketplaceSvc).toMatch(
      /const actualPricePerCredit\s*=\s*listing\.price_per_credit/,
    )
  })
})

describe('payouts', () => {
  it('refuse a suspended seller', () => {
    expect(payoutSql).toMatch(/perform\s+public\.assert_not_suspended\(\s*v_seller\s*\)/i)
  })

  it('check suspension before reserving anything on the ledger', () => {
    const gateAt = payoutSql.search(/perform\s+public\.assert_not_suspended/i)
    const reserveAt = payoutSql.search(/insert into public\.payout_requests/i)
    expect(gateAt).toBeGreaterThan(-1)
    expect(reserveAt).toBeGreaterThan(gateAt)
  })

  it('scope the idempotency key to the calling seller', () => {
    // Unscoped, a key collision returned ANOTHER seller's payout id and silently
    // dropped this seller's request.
    const lookup = payoutSql.match(
      /select id into v_existing[\s\S]*?;/i,
    )
    expect(lookup).toBeTruthy()
    expect(lookup[0]).toMatch(/seller_id\s*=\s*v_seller/i)
  })
})

describe('profiles column privileges', () => {
  // The superseded 20260703000300 used a two-name ALLOW-list and told you to
  // re-run it after adding columns — which re-granted UPDATE on kyb_verified
  // (self-approve KYB, then withdraw) and is_active (self-unsuspend).
  const PROTECTED = [
    'role',
    'kyc_level',
    'kyb_verified',
    'is_active',
    'suspended_at',
    'suspended_by',
    'suspension_reason',
    'plan',
    'plan_expires_at',
  ]

  it('protects every privileged column', () => {
    const block = profileGrantsSql.match(/v_protected text\[\]\s*:=\s*array\[([\s\S]*?)\]/)
    expect(block).toBeTruthy()
    for (const col of PROTECTED) {
      expect(block[1]).toContain(`'${col}'`)
    }
  })

  it('is a deny-list, so new columns stay owner-writable', () => {
    expect(profileGrantsSql).toMatch(/not \(column_name = any \(v_protected\)\)/i)
  })

  it('revokes before granting, so a prior over-grant is undone', () => {
    const revokeAt = profileGrantsSql.search(/revoke update on public\.profiles from authenticated/i)
    const grantAt = profileGrantsSql.search(/grant update \(%s\) on public\.profiles/i)
    expect(revokeAt).toBeGreaterThan(-1)
    expect(grantAt).toBeGreaterThan(revokeAt)
  })
})
