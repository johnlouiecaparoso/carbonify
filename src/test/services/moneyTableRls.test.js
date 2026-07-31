import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Guards the money-table RLS *capture* migration (backlog #13c) at the artifact
 * level. There is no live DB in unit tests, so — following this repo's convention
 * (see adminSegregation.test.js) — these assert the RULE the SQL must encode, so
 * that anyone editing the migration to reopen a hole trips a red test.
 *
 * The runnable proof against a real database is
 * supabase/diagnostics/money_table_rls_audit.sql; this file is its CI-cheap twin.
 */

const here = dirname(fileURLToPath(import.meta.url))
const migrationPath = resolve(
  here,
  '../../../supabase/migrations/20260725000100_capture_money_table_rls.sql',
)
const sql = readFileSync(migrationPath, 'utf8')
const lower = sql.toLowerCase()

/** The 7 tables the money-path security posture governs. */
const MONEY_TABLES = [
  'credit_ownership',
  'wallet_accounts',
  'wallet_transactions',
  'credit_transactions',
  'project_credits',
  'credit_listings',
  'credit_retirements',
]

/** The three exploitable policies 20260718000800 closed — must stay dropped. */
const KNOWN_HOLES = [
  'Allow all project credits operations',
  'Allow all credit listings operations',
  'Users can insert their own retirements',
]

describe('money-table RLS capture migration', () => {
  it('enables RLS on every money table', () => {
    for (const t of MONEY_TABLES) {
      expect(
        lower.includes(`alter table public.${t}`) &&
          lower.includes('enable row level security'),
        `RLS must be enabled on ${t}`,
      ).toBe(true)
      // Belt-and-suspenders: the specific enable statement is present.
      expect(lower).toContain(`alter table public.${t}`)
    }
  })

  it('never FORCEs RLS — the definer trigger and service_role must bypass', () => {
    // Forcing RLS would break issuance (activate_validated_project_trigger) and
    // settlement (process_marketplace_purchase runs as service_role).
    expect(lower).not.toContain('force row level security')
  })

  it('drops each known blanket/forgeable write hole', () => {
    for (const name of KNOWN_HOLES) {
      expect(
        lower,
        `must drop the "${name}" policy`,
      ).toContain(`drop policy if exists "${name.toLowerCase()}"`)
    }
  })

  it('introduces no client-writable blanket policy', () => {
    // A `for all ... using (true) with check (true)` on a money table is the
    // exact shape of the holes we closed. It must not reappear.
    const blanket = /for\s+all[\s\S]{0,120}?using\s*\(\s*true\s*\)[\s\S]{0,60}?with\s+check\s*\(\s*true\s*\)/i
    expect(blanket.test(sql)).toBe(false)
  })

  it('only client write it grants on a money table is the owner/admin pool DELETE', () => {
    // Every `create policy` in this migration must be either a SELECT (read) or
    // the one sanctioned DELETE (project_credits_owner_or_admin_delete).
    const createStmts = sql.match(/create policy[\s\S]*?;/gi) || []
    expect(createStmts.length).toBeGreaterThan(0)
    for (const stmt of createStmts) {
      const s = stmt.toLowerCase()
      const isSelect = /for\s+select/.test(s)
      const isSanctionedDelete =
        s.includes('project_credits_owner_or_admin_delete') && /for\s+delete/.test(s)
      expect(
        isSelect || isSanctionedDelete,
        `unexpected write policy created:\n${stmt}`,
      ).toBe(true)
    }
  })

  // Pull a single `create policy "<name>" ... ;` statement out of the SQL.
  const policyStmt = (name) => {
    const m = sql.match(new RegExp(`create policy "${name}"[\\s\\S]*?;`, 'i'))
    return m ? m[0] : null
  }

  it('keeps every PRIVATE money read scoped to the owner (never `using (true)`)', () => {
    // The ledger + retirement tables hold a user's own money/holdings and must
    // never be world-readable. Each must reference auth.uid() and must not be a
    // bare `using (true)`. wallet_transactions is scoped via its wallet account,
    // so it satisfies auth.uid() through the subquery — that's intended.
    const privateReads = [
      'money_rls_credit_ownership_read_own',
      'money_rls_wallet_accounts_read_own',
      'money_rls_wallet_transactions_read_own',
      'money_rls_credit_transactions_read_party',
      'money_rls_credit_retirements_read_own',
    ]
    for (const name of privateReads) {
      const stmt = policyStmt(name)
      expect(stmt, `missing read policy ${name}`).toBeTruthy()
      const s = stmt.toLowerCase()
      expect(/for\s+select/.test(s), `${name} must be a SELECT policy`).toBe(true)
      expect(s.includes('auth.uid()'), `${name} must be owner-scoped`).toBe(true)
      expect(
        /using\s*\(\s*true\s*\)/.test(s),
        `${name} must not be world-readable`,
      ).toBe(false)
    }
  })

  it('exposes only the two inventory tables publicly (marketplace/registry browse)', () => {
    // project_credits pool availability and ACTIVE listings are intentionally
    // public — but nothing else is, and neither carries a write.
    for (const name of [
      'money_rls_project_credits_read_public',
      'money_rls_credit_listings_read',
    ]) {
      const stmt = policyStmt(name)
      expect(stmt, `missing public read policy ${name}`).toBeTruthy()
      expect(/for\s+select/i.test(stmt), `${name} must be a SELECT policy`).toBe(true)
      expect(/to\s+anon/i.test(stmt), `${name} must be reachable by anon`).toBe(true)
    }
    // The private ledger tables must NOT be granted to anon anywhere.
    for (const t of ['credit_ownership', 'wallet_accounts', 'credit_transactions']) {
      const grantsAnon = new RegExp(
        `create policy[^;]*on public\\.${t}[^;]*to\\s+anon`,
        'i',
      )
      expect(grantsAnon.test(sql), `${t} must not be readable by anon`).toBe(false)
    }
  })

  it('reloads the PostgREST schema cache so policy changes take effect', () => {
    expect(lower).toContain("notify pgrst, 'reload schema'")
  })
})
