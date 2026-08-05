import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Re-running an old migration silently reverts every fix made since.
 *
 * `create or replace function` does not merge, it overwrites. So a migration
 * that defines `process_marketplace_purchase` reverts it to *that file's*
 * version, discarding six later ones — with no error, no warning, and nothing
 * on screen. The database simply goes backwards.
 *
 * This is not hypothetical. It has been reached twice:
 *
 *   - `20260703000300` carries its own "never re-run" warning because its
 *     two-name exclusion list re-grants UPDATE on `kyb_verified` and
 *     `is_active`, letting users self-approve KYB. That warning was written by
 *     hand, for one file, after the fact.
 *   - On 2026-08-05 `20260725000200` was re-run against live. It defines
 *     `process_marketplace_purchase` with the escrow gate reading
 *     `v_intent.provider` — the exact bug `20260804000300` was written to fix,
 *     and the one that makes `ESC-02` fail while looking like an escrow defect.
 *     Nothing in the repo warned about it, because the hand-written approach
 *     only covers files somebody already got burned by.
 *
 * So the invariant is asserted instead of remembered: **every migration that
 * defines a function which a LATER migration redefines must carry a
 * supersession marker naming the file that supersedes it.**
 *
 * Applying migrations in order from empty is unaffected — the later file lands
 * last, which is the point. Running one on its own is what reverts.
 */

const DIR = 'supabase/migrations'
const MARKER = 'SUPERSEDED — DO NOT RE-RUN'

function migrationFiles() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/**
 * function name -> the migrations defining it, in filename (i.e. apply) order.
 *
 * Comments are NOT stripped: the marker block itself mentions function names in
 * prose, and stripping would also hide a `create or replace` that someone had
 * commented out — which is not a definition and must not count as one. The
 * regex requires the real statement, so prose cannot produce a false positive.
 */
function definitionsByFunction() {
  const map = new Map()
  for (const f of migrationFiles()) {
    const sql = readFileSync(join(DIR, f), 'utf8')
    for (const m of sql.matchAll(/create\s+or\s+replace\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi)) {
      const name = m[1].toLowerCase()
      if (!map.has(name)) map.set(name, [])
      if (!map.get(name).includes(f)) map.get(name).push(f)
    }
  }
  return map
}

/** [{ file, fn, supersededBy }] for every definition that a later file replaces. */
function supersededDefinitions() {
  const out = []
  for (const [fn, files] of definitionsByFunction()) {
    if (files.length < 2) continue
    const latest = files[files.length - 1]
    for (const file of files.slice(0, -1)) out.push({ file, fn, supersededBy: latest })
  }
  return out
}

describe('a superseded migration says so, so re-running it cannot silently revert a fix', () => {
  it('finds a real corpus, so this cannot pass vacuously', () => {
    const defs = definitionsByFunction()
    expect(migrationFiles().length).toBeGreaterThan(50)
    expect(defs.size).toBeGreaterThan(40)
    // Measured 2026-08-05: 19 functions defined more than once, across 27
    // files. The floor asserts the parser still works, not the exact count.
    expect(supersededDefinitions().length).toBeGreaterThan(10)
  })

  it('every superseded migration carries the marker', () => {
    const missing = [...new Set(
      supersededDefinitions()
        .filter(({ file }) => !readFileSync(join(DIR, file), 'utf8').includes(MARKER))
        .map(({ file }) => file),
    )].sort()

    expect(
      missing,
      'these migrations define a function that a LATER migration redefines, and do ' +
        'not warn about it. Re-running one reverts the newer version silently. Add ' +
        `the "${MARKER}" header block.`,
    ).toEqual([])
  })

  it('the marker names the migration that supersedes it', () => {
    // A bare "do not re-run" is not enough. Whoever reads it next needs to know
    // what to re-apply to get back, which on 2026-08-05 was the actual question:
    // 20260725000200 had been re-run and the recovery was 20260804000300.
    const wrong = supersededDefinitions()
      .filter(({ file, supersededBy }) => {
        const sql = readFileSync(join(DIR, file), 'utf8')
        return sql.includes(MARKER) && !sql.includes(supersededBy)
      })
      .map(({ file, fn, supersededBy }) => `${file} (${fn} -> ${supersededBy})`)
      .sort()

    expect(wrong, 'the marker must name the superseding migration by filename').toEqual([])
  })

  it('the money-path functions are covered — the ones where a revert costs money', () => {
    // Named explicitly rather than left to the general rule. These are the
    // functions where going backwards is not a regression but a financial
    // defect: settlement, wallet settlement, retirement and payouts.
    const defs = definitionsByFunction()
    for (const fn of [
      'process_marketplace_purchase',
      'process_wallet_purchase',
      'retire_credits_atomic',
      'request_payout',
    ]) {
      const files = defs.get(fn)
      expect(files, `${fn} must be defined somewhere`).toBeTruthy()
      expect(files.length, `${fn} should be redefined across migrations`).toBeGreaterThan(1)
      for (const file of files.slice(0, -1)) {
        expect(
          readFileSync(join(DIR, file), 'utf8'),
          `${file} defines ${fn} and is superseded, but carries no marker`,
        ).toContain(MARKER)
      }
    }
  })
})
