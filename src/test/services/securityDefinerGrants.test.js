import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * DEFERRED_BACKLOG #12, as a ratchet rather than a one-off migration.
 *
 * Postgres grants EXECUTE to PUBLIC on every new function. A SECURITY DEFINER
 * function that is only ever `grant execute … to authenticated` is therefore
 * also callable by `anon`, because nothing removed the default. The backlog
 * called this "~10 RPCs"; scanning `supabase/migrations/` found **39** with no
 * revoke, 15 of them trigger functions.
 *
 * Closing it once is not the point — it drifted back for months precisely
 * because nothing checked. This asserts the invariant instead: every
 * client-callable SECURITY DEFINER function must be covered by a revoke, either
 * written out in its own migration or listed in the grant-hygiene migration.
 * A new one added without either fails the suite.
 *
 * Trigger functions are excluded deliberately and structurally, matching the
 * migration: they take no arguments, PostgREST will not expose a `trigger`
 * return type, and a direct call raises. The PUBLIC grant on them is not a
 * reachable surface.
 */

const DIR = 'supabase/migrations'
const HYGIENE = '20260802000100_grant_hygiene_security_definer.sql'

/**
 * Functions that MUST stay callable by `anon`, with the reason.
 *
 * An allowlist rather than a silent exemption: revoking one of these would be a
 * regression wearing the costume of a security fix, which is the failure the
 * `/registry` and `/verify` assertion further down already guards against.
 *
 * Both price-history RPCs are rendered by `ProjectDetailView` on
 * `/projects/:id`, and that route carries `meta: { public: true }` — a
 * signed-out visitor comparing a price is the intended audience. The data is
 * volume-weighted daily buckets aggregated over settled trades, with no
 * counterparty in it.
 *
 * Adding a name here should require the same argument.
 */
const ANON_BY_DESIGN = new Set(['public_price_history', 'project_price_history'])

function migrationFiles() {
  return readdirSync(DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
}

/** Strip line comments so a name mentioned in prose is not read as SQL. */
function sqlOf(file) {
  return readFileSync(join(DIR, file), 'utf8').replace(/^\s*--.*$/gm, '')
}

/** Every SECURITY DEFINER function, split by whether it returns `trigger`. */
function securityDefinerFunctions() {
  const callable = new Set()
  const triggers = new Set()
  const re =
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns\s+([a-z ]+)([\s\S]*?)(?:\$\$|\bas\b\s*\$)/gi

  for (const f of migrationFiles()) {
    const sql = sqlOf(f)
    let m
    while ((m = re.exec(sql))) {
      const [, name, , rets, tail] = m
      if (!/security\s+definer/i.test(tail)) continue
      if (/^trigger\b/i.test(rets.trim())) triggers.add(name.toLowerCase())
      else callable.add(name.toLowerCase())
    }
  }
  // A function can be redefined from trigger to callable or vice versa; the
  // callable classification wins, because that is the reachable one.
  for (const n of callable) triggers.delete(n)
  return { callable, triggers }
}

/** Names with an explicit `revoke … on function <name>(` in any migration. */
function explicitlyRevoked() {
  const found = new Set()
  for (const f of migrationFiles()) {
    const re = /revoke\s+[\s\S]*?on\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\(/gi
    let m
    while ((m = re.exec(sqlOf(f)))) found.add(m[1].toLowerCase())
  }
  return found
}

/**
 * Names revoked specifically FROM ANON, which is the only revoke that bites.
 *
 * Measured on live 2026-08-05: `revoke all on function … from public` left
 * `anon` able to execute three functions whose headers said it could not.
 * Supabase's default privileges GRANT EXECUTE to `anon` explicitly on functions
 * created in `public`, and revoking the implicit PUBLIC grant does nothing to an
 * explicit per-role one. Anon-probing returned `200` for all three against a
 * `401 42501` control.
 *
 * The check above could not see it: it asked whether SOME revoke existed, and
 * one did. The comment beside its own failure message has said
 * `from public, anon` since it was written — the intent was right and the
 * assertion was weaker than the intent, which is how three migrations passed a
 * green ratchet while the hole was open on production.
 *
 * Matches `from public, anon`, `from anon`, and a separate anon-only revoke
 * statement in any migration.
 */
function revokedFromAnon() {
  const found = new Set()
  for (const f of migrationFiles()) {
    const re =
      /revoke\s+[\s\S]*?on\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\([^)]*\)\s*from\s+([a-z_,\s]+);/gi
    let m
    while ((m = re.exec(sqlOf(f)))) {
      if (/\banon\b/i.test(m[2])) found.add(m[1].toLowerCase())
    }
  }
  return found
}

/**
 * Functions the hygiene migration revokes from anon in bulk.
 *
 * It builds `revoke … from anon` with `execute format(...)` over an array, so
 * the per-function names are in the array rather than in a literal revoke
 * statement and the regex above cannot see them.
 */
function bulkRevokedFromAnon() {
  const sql = sqlOf(HYGIENE)
  return /from\s+anon/i.test(sql) ? coveredByHygieneMigration() : new Set()
}

/** Names listed in the grant-hygiene migration's target array. */
function coveredByHygieneMigration() {
  const sql = sqlOf(HYGIENE)
  const found = new Set()
  const re = /\[\s*'([a-z0-9_]+)'\s*,\s*'([a-z_, ]*)'\s*\]/gi
  let m
  while ((m = re.exec(sql))) found.add(m[1].toLowerCase())
  return found
}

describe('#12 — no SECURITY DEFINER function may keep the implicit PUBLIC grant', () => {
  it('finds a real corpus, so this cannot pass vacuously', () => {
    const { callable, triggers } = securityDefinerFunctions()
    // Measured at 89 total on 2026-08-02. The floor is deliberately well below
    // that: this asserts the parser still works, not the exact count.
    expect(callable.size).toBeGreaterThan(40)
    expect(triggers.size).toBeGreaterThan(5)
    expect(explicitlyRevoked().size).toBeGreaterThan(20)
    expect(coveredByHygieneMigration().size).toBe(24)
  })

  it('every client-callable SECURITY DEFINER function is covered by a revoke', () => {
    const { callable } = securityDefinerFunctions()
    const covered = new Set([...explicitlyRevoked(), ...coveredByHygieneMigration()])
    const uncovered = [...callable].filter((n) => !covered.has(n)).sort()

    // If this fails, a migration added a SECURITY DEFINER function and granted
    // EXECUTE without first revoking PUBLIC — so `anon` can call it. Either add
    // `revoke all on function public.x(args) from public, anon;` beside the
    // grant, or add the name to the grant-hygiene migration's array.
    expect(uncovered).toEqual([])
  })

  it('every client-callable SECURITY DEFINER function is revoked FROM ANON, not just from PUBLIC', () => {
    // The check above is not sufficient and production proved it. Supabase's
    // default privileges grant EXECUTE to `anon` EXPLICITLY on functions created
    // in `public`; `revoke … from public` removes only the implicit PUBLIC
    // grant and leaves that one standing. Three functions were live and
    // anon-callable on 2026-08-05 while this file was green, because it asked
    // whether a revoke existed rather than whether it named anon.
    //
    // Anon-probed to confirm before this assertion was written:
    //   get_my_buyer_names -> 200 (executable), review_kyc_application -> 401
    //   42501 (blocked). Same database, same method, different result.
    const { callable } = securityDefinerFunctions()
    const covered = new Set([...revokedFromAnon(), ...bulkRevokedFromAnon(), ...ANON_BY_DESIGN])
    const publicOnly = [...callable].filter((n) => !covered.has(n)).sort()

    expect(
      publicOnly,
      'these are revoked from PUBLIC but not from anon, so anon can still ' +
        'execute them — add `from public, anon` to the revoke',
    ).toEqual([])
  })

  it('the hygiene migration keeps anon on the public-by-design reads', () => {
    // A revoke that closed /registry or /verify to signed-out visitors would be
    // a regression wearing the costume of a security fix. These four are the
    // reason the migration carries a per-function role list at all.
    const sql = sqlOf(HYGIENE)
    for (const name of [
      'search_public_registry',
      'public_registry_stats',
      'public_market_stats',
      'verify_certificate_public',
    ]) {
      const row = new RegExp(`\\['${name}',\\s*'([a-z_, ]*)'\\]`, 'i').exec(sql.replace(/\s+/g, ' '))
      expect(row, `${name} must be listed in the hygiene migration`).toBeTruthy()
      expect(row[1]).toContain('anon')
    }
  })

  it('the admin RPCs are NOT granted to anon', () => {
    const sql = sqlOf(HYGIENE).replace(/\s+/g, ' ')
    for (const name of [
      'review_kyc_application',
      'review_kyb_application',
      'resolve_dispute',
      'submit_data_subject_request',
    ]) {
      const row = new RegExp(`\\['${name}',\\s*'([a-z_, ]*)'\\]`, 'i').exec(sql)
      expect(row, `${name} must be listed in the hygiene migration`).toBeTruthy()
      expect(row[1]).not.toContain('anon')
    }
  })

  it('the migration never touches a trigger function', () => {
    // The exclusion is structural in the migration (`prorettype <> trigger`),
    // but the name list must not contradict it.
    const { triggers } = securityDefinerFunctions()
    const listed = coveredByHygieneMigration()
    const overlap = [...listed].filter((n) => triggers.has(n))
    expect(overlap).toEqual([])
  })
})
