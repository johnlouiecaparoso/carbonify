import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The supersession BANNER is a comment, and a comment cannot stop a replay.
 *
 * migrationSupersession.test.js asserts that every superseded migration warns
 * about itself. That invariant held on 2026-08-05 and the revert happened
 * anyway — twice, from two different files — because the warning travels inside
 * the text you select-all and paste into the SQL editor. It is in the copy, not
 * in the way.
 *
 *   - `20260725000200` reverted the escrow method-gate (`process_marketplace_purchase`).
 *   - `20260606000500` reverted check #6 of `reconcile_financials`, the report the
 *     whole pilot's daily money check depends on — and a reverted copy returns
 *     "clean" precisely because the check that would have spoken is the part
 *     that was removed.
 *
 * So the money-path files now carry an EXECUTABLE guard: a `do $$` block that
 * raises before any statement below it, when the newer definition is already
 * live. This file asserts the guard exists, is positioned where it can help,
 * names the real recovery file, and — the part that matters most — that the
 * marker it tests for is one that CAN fire.
 *
 * That last check exists because this project has already shipped a ratchet
 * whose assertion was weaker than its intent: `securityDefinerGrants` asked
 * whether *a* revoke existed while its own failure message said `from public,
 * anon`. A guard whose marker is present in the old file too would pass every
 * review and never once abort.
 */

const DIR = 'supabase/migrations'
const SUPERSEDED = 'SUPERSEDED — DO NOT RE-RUN'
const GUARD = 'REPLAY GUARD (executable)'

/**
 * fn -> the string proving the CURRENT definition is live, and the file to
 * re-apply if it is not. Kept here as well as in the SQL so a drift between the
 * two is a test failure rather than a guard that quietly stops working.
 */
const MONEY = {
  process_marketplace_purchase: {
    marker: 'v_intent.payment_method',
    recovery: '20260804000300_settlement_records_real_payment_method.sql',
  },
  process_wallet_purchase: {
    marker: 'assert_can_trade(v_buyer)',
    recovery: '20260804000100_wallet_purchase_trade_gate.sql',
  },
  retire_credits_atomic: {
    marker: 'credit_retirements',
    recovery: '20260718000000_retire_credits_atomic_with_record.sql',
  },
  reconcile_financials: {
    marker: 'transaction_unaccounted',
    recovery: '20260703000600_reconcile_widen_unaccounted.sql',
  },
  request_payout: {
    marker: 'assert_not_suspended',
    recovery: '20260804000400_payout_suspension_and_idempotency_scope.sql',
  },
  mark_payout_processing: {
    marker: 'v_updated = 1',
    recovery: '20260718000300_payout_processing_returns_claim.sql',
  },
  admin_refund_transaction: {
    marker: 'refund a transaction you are a party to',
    recovery: '20260722000900_admin_segregation_of_duties.sql',
  },
  assert_can_trade: {
    marker: 'assert_not_suspended',
    recovery: '20260722000800_account_suspension.sql',
  },
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()

const read = (f) => readFileSync(join(DIR, f), 'utf8')

/**
 * The file text with the guard block removed.
 *
 * The guard embeds its own marker as a SQL literal (`like '%v_updated = 1%'`),
 * so a naive scan of a guarded file finds the marker in every file that has a
 * guard — which is the opposite of what the marker check is asking. The live
 * guard reads `pg_get_functiondef`, and a `do $$` block is part of no function
 * definition, so the distinction matters here and only here. This test wrote
 * that false positive on its first run and is keeping the fix visible.
 */
function withoutGuard(sql) {
  const start = sql.indexOf(`-- ── ${GUARD}`)
  if (start === -1) return sql
  const endTag = '$carbonify_replay_guard$;'
  const end = sql.indexOf(endTag, start)
  return end === -1 ? sql : sql.slice(0, start) + sql.slice(end + endTag.length)
}

const definesFn = (sql, fn) =>
  new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${fn}\\s*\\(`, 'i').test(sql)

/** Files that define `fn`, in apply order. */
const definersOf = (fn) => files.filter((f) => definesFn(read(f), fn))

/** [{ file, fns }] — every superseded file that redefines a money function. */
function guardedTargets() {
  const out = []
  for (const file of files) {
    const sql = read(file)
    if (!sql.includes(SUPERSEDED)) continue
    const fns = Object.keys(MONEY).filter(
      (fn) => definesFn(sql, fn) && MONEY[fn].recovery !== file,
    )
    if (fns.length) out.push({ file, fns })
  }
  return out
}

describe('a superseded money migration refuses to run, instead of warning about itself', () => {
  it('finds a real corpus, so this cannot pass vacuously', () => {
    // Measured 2026-08-05: 16 files. The floor asserts the finder still works,
    // not the exact number — a new money migration legitimately moves it.
    expect(files.length).toBeGreaterThan(50)
    expect(guardedTargets().length).toBeGreaterThanOrEqual(12)
  })

  it('every money function names a recovery file that exists and defines it', () => {
    for (const [fn, { recovery }] of Object.entries(MONEY)) {
      expect(files, `${fn}: recovery file ${recovery} is not in ${DIR}`).toContain(recovery)
      expect(definesFn(read(recovery), fn), `${recovery} must define ${fn}`).toBe(true)
      // The recovery file must be the LAST definer, or re-applying it would
      // itself revert something newer — the exact trap being closed here.
      const definers = definersOf(fn)
      expect(definers[definers.length - 1], `${fn}: ${recovery} is not the newest definition`).toBe(
        recovery,
      )
    }
  })

  it('THE MARKER CAN ACTUALLY FIRE — present in the newest definition, absent from every earlier one', () => {
    // Without this, a guard is decoration: if the marker also appears in the old
    // file, the newest definition is indistinguishable from the one about to
    // overwrite it, and the guard passes on the very replay it exists to stop.
    const broken = []
    for (const [fn, { marker, recovery }] of Object.entries(MONEY)) {
      if (!withoutGuard(read(recovery)).includes(marker)) {
        broken.push(`${fn}: marker "${marker}" is NOT in ${recovery} — the guard can never fire`)
      }
      for (const older of definersOf(fn).filter((f) => f !== recovery)) {
        if (withoutGuard(read(older)).includes(marker)) {
          broken.push(
            `${fn}: marker "${marker}" also appears in the older ${older} — a fresh in-order ` +
              'apply would trip this guard, and a replay would not',
          )
        }
      }
    }
    expect(broken).toEqual([])
  })

  it('every superseded money migration carries the guard', () => {
    const missing = guardedTargets()
      .filter(({ file }) => !read(file).includes(GUARD))
      .map(({ file, fns }) => `${file} (${fns.join(', ')})`)
    expect(
      missing,
      'these files redefine a money function that a LATER migration redefines, and would ' +
        'revert it silently if pasted into the SQL editor. Add the executable guard block.',
    ).toEqual([])
  })

  it('the guard runs BEFORE any statement it is meant to prevent', () => {
    // A guard below the DDL aborts a transaction that has already done the
    // damage — and in an editor that does not wrap the script, does not even
    // do that.
    const late = []
    for (const { file } of guardedTargets()) {
      const sql = read(file)
      const guardAt = sql.indexOf(GUARD)
      const firstStatement = sql.search(/^\s*(create|alter|drop|grant|revoke|insert|update|delete)\b/im)
      if (guardAt === -1 || firstStatement === -1) continue
      if (guardAt > firstStatement) late.push(file)
    }
    expect(late, 'the guard must precede the first SQL statement in the file').toEqual([])
  })

  it('the guard checks the marker and names the recovery file for every function it covers', () => {
    const wrong = []
    for (const { file, fns } of guardedTargets()) {
      const sql = read(file)
      if (!sql.includes(GUARD)) continue
      for (const fn of fns) {
        const { marker, recovery } = MONEY[fn]
        if (!sql.includes(`like '%${marker}%'`)) {
          wrong.push(`${file}: guard does not test the ${fn} marker "${marker}"`)
        }
        if (!sql.includes(recovery)) {
          wrong.push(`${file}: guard does not name ${fn}'s recovery file ${recovery}`)
        }
        if (!sql.includes(`p.proname = '${fn}'`)) {
          wrong.push(`${file}: guard does not look up ${fn} by name`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  it('the guard leaves a deliberate replay possible, and says how', () => {
    for (const { file } of guardedTargets()) {
      const sql = read(file)
      expect(sql, `${file}: no override escape hatch`).toContain(
        "current_setting('carbonify.allow_superseded_replay', true)",
      )
      expect(sql, `${file}: the error must state that nothing was changed`).toContain(
        'Nothing has been changed',
      )
    }
  })
})
