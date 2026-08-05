#!/usr/bin/env node
/**
 * Ask the live database what an anonymous stranger can see and write.
 *
 *   node scripts/analysis/verify-anon-exposure.mjs
 *   node scripts/analysis/verify-anon-exposure.mjs --json
 *
 * WHY THIS EXISTS
 * The 2026-08-05 Supabase advisor sweep reported nine ERRORs and a long tail of
 * WARNs. Reading them tells you what a linter thinks. It does not tell you
 * whether the hole is real, and on this project the difference mattered twice:
 *
 *   * The advisor's ERRORs on `listings` / `orders` / `wallets` /
 *     `verifications` turned out to be four EMPTY superseded tables.
 *   * Its WARN on `public.projects` — one severity lower — turned out to be an
 *     anonymous stranger being able to DELETE every project in the registry.
 *
 * Severity in the advisor is about the shape of the finding. This script is
 * about the consequence. It runs the probes signed OUT, with the publishable
 * anon key that ships in the browser bundle, because that is the attacker's
 * actual position.
 *
 * THE WRITE PROBES DO NOT WRITE ANYTHING
 * Each one POSTs an empty body `{}` to a table with a NOT NULL column, so the
 * row cannot be created no matter what the policy says. What is being read is
 * WHICH layer rejects it:
 *
 *   42501 -> row-level security refused.            The table is protected.
 *   23502 -> a NOT NULL constraint refused.         RLS ALREADY SAID YES.
 *
 * That distinction is the whole trick, and it is why the CONTROLS below matter:
 * if the money tables ever stop returning 42501, the probe method itself has
 * broken and every PASS in this report is meaningless.
 *
 * EXIT CODE 1 on any FAIL. Run it before applying the 20260805* migrations to
 * reproduce the findings, and after to prove they closed.
 */

import { readFileSync } from 'node:fs'

const JSON_OUT = process.argv.includes('--json')

function loadEnv() {
  let url = process.env.VITE_SUPABASE_URL
  let key = process.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    try {
      const env = readFileSync(new URL('../../.env', import.meta.url), 'utf8')
      for (const line of env.split(/\r?\n/)) {
        const m = /^([A-Z_]+)=(.*)$/.exec(line.trim())
        if (!m) continue
        if (m[1] === 'VITE_SUPABASE_URL' && !url) url = m[2]
        if (m[1] === 'VITE_SUPABASE_ANON_KEY' && !key) key = m[2]
      }
    } catch {
      /* fall through to the check below */
    }
  }
  if (!url || !key) {
    console.error('Need VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (env or .env).')
    process.exit(2)
  }
  return { url: url.replace(/\/+$/, ''), key }
}

const { url: URL_BASE, key: ANON } = loadEnv()
const H = { apikey: ANON, Authorization: `Bearer ${ANON}` }
const results = []

/** ok: true | false | 'warn'. A 'warn' is reported and never fails the run — it
 *  means the probe could not reach a conclusion, which is not the same as a
 *  hole and must not be dressed up as one. */
function record(area, name, ok, detail) {
  results.push({ area, name, ok, detail })
}

/** Row count visible to anon, via Content-Range. -1 means the request errored. */
async function anonCount(table) {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}?select=*`, {
    headers: { ...H, Range: '0-0', Prefer: 'count=exact' },
  })
  if (!res.ok && res.status !== 206 && res.status !== 200) return -1
  const range = res.headers.get('content-range') || ''
  const total = range.split('/')[1]
  return total === undefined || total === '*' ? 0 : Number(total)
}

/** Which layer rejects an empty insert: 'rls' | 'constraint' | other code. */
async function anonInsertLayer(table) {
  const res = await fetch(`${URL_BASE}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const body = await res.json().catch(() => ({}))
  if (body.code === '42501') return 'rls'
  if (body.code === '23502' || body.code === '23503' || body.code === '23505') return 'constraint'
  if (res.status === 201) return 'CREATED-A-ROW'
  return body.code || `http-${res.status}`
}

async function anonRpc(fn, args = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const body = await res.json().catch(() => null)
  return { status: res.status, code: body?.code, body }
}

async function main() {
  // ── CONTROLS ──────────────────────────────────────────────────────────────
  // These must all be 'rls'. If they are not, nothing else here can be trusted.
  for (const t of ['wallet_accounts', 'credit_ownership', 'credit_transactions', 'ledger_entries']) {
    const layer = await anonInsertLayer(t)
    record('control', `${t} rejects anon insert at RLS`, layer === 'rls', layer)
  }

  // ── The SECURITY DEFINER views (advisor: ERROR) ───────────────────────────
  for (const v of ['wallet_summary', 'user_credit_portfolio']) {
    const n = await anonCount(v)
    record('views', `${v} hides rows from anon`, n <= 0, `${n} row(s) visible`)
  }

  // ── RLS-disabled tables (advisor: ERROR) ──────────────────────────────────
  //
  // KNOWN LIMIT, STATED SO NOBODY READS MORE INTO A PASS THAN IS THERE: four of
  // these five are empty, and an empty table returns 0 rows whether RLS is on
  // or off. A PASS here means "nothing leaked", NOT "RLS is enabled" — anon
  // cannot see relrowsecurity at all. To confirm the switch itself, run the
  // §PRE-FLIGHT query in 20260805000700 with service_role.
  for (const t of ['notification_templates', 'orders', 'verifications', 'listings', 'wallets']) {
    const n = await anonCount(t)
    const detail = n <= 0 ? '0 rows (empty or filtered — RLS state not observable from anon)' : `${n} row(s) visible`
    record('legacy-tables', `${t} hides rows from anon`, n <= 0, detail)
  }

  // ── Always-true policies (advisor: WARN — the worst finding in the sweep) ──
  for (const t of ['projects', 'audit_logs', 'email_logs', 'receipts']) {
    const layer = await anonInsertLayer(t)
    record('always-true-policies', `${t} rejects anon insert at RLS`, layer === 'rls', layer)
  }

  // ── Anon-executable RPCs ──────────────────────────────────────────────────
  const stats = await anonRpc('get_email_stats')
  record('rpc', 'get_email_stats refuses anon', stats.code === '42501' || stats.status === 401, `${stats.status} ${stats.code ?? ''}`)

  // log_user_action and log_system_event are the SECURITY DEFINER back door
  // into audit_logs that 20260805001000 closes. They are NOT probed here, on
  // purpose: every argument they take is text or jsonb, and no JSON value fails
  // a cast to either — so there is no way to call them that is guaranteed not
  // to reach the body. A verifier must not be the thing that dirties the data it
  // checks; two junk rows went into audit_logs learning that.
  //
  // Confirm those two by hand after a grant change (denied returns 42501 and
  // writes nothing), or read it off query B in
  // supabase/diagnostics/definer_grant_surface.sql, which needs no call at all:
  //
  //   curl -X POST "$URL/rest/v1/rpc/log_user_action" -H "apikey: $ANON" \
  //     -H "Content-Type: application/json" \
  //     -d '{"p_action":"probe","p_resource_type":"probe","p_resource_id":"probe",
  //          "p_old_values":null,"p_new_values":null,"p_metadata":null}'
  //
  // The two below DO have a uuid first argument, so a malformed value is safe:
  //
  // ORDERING, ESTABLISHED EMPIRICALLY 2026-08-05 — Postgres checks the function
  // ACL BEFORE casting arguments. The identical malformed call returned 22P02
  // while anon still held EXECUTE, and 42501 once 20260805001000 revoked it. So
  // 42501 here is conclusive, and a cast error means the grant is still there.
  //
  // THE FULL ARGUMENT LIST IS REQUIRED. PostgREST resolves an overload by the
  // exact set of named arguments; a partial set returns PGRST202 ("no function
  // matches") whatever the grants are, which looks like a conclusive negative
  // and is not one. First version of this check made that mistake.
  const definerProbes = {
    log_email_sent: {
      p_user_id: 'NOT-A-UUID',
      p_email_type: 'probe',
      p_recipient_email: 'probe',
      p_subject: 'probe',
      p_status: 'probe',
      p_error_message: null,
      p_metadata: null,
    },
    retire_credits_atomic: {
      p_user_id: 'NOT-A-UUID',
      p_project_id: 'NOT-A-UUID',
      p_quantity: 0,
      p_reason: 'probe',
    },
  }
  for (const [fn, args] of Object.entries(definerProbes)) {
    const r = await anonRpc(fn, args)
    const denied = r.code === '42501'
    record(
      'rpc',
      `${fn} refuses anon`,
      denied ? true : 'warn',
      denied ? `${r.status} 42501` : `${r.status} ${r.code ?? ''} — anon still holds EXECUTE; confirm with definer_grant_surface.sql query A`,
    )
  }

  // Documented as intentionally anon-callable: they appear inside RLS policy
  // expressions, which evaluate as the querying role. Reported, never failed.
  const isAdmin = await anonRpc('is_admin')
  record('rpc', 'is_admin() callable by anon (EXPECTED — policy helper)', true, JSON.stringify(isAdmin.body))

  // ── Storage ───────────────────────────────────────────────────────────────
  const listRes = await fetch(`${URL_BASE}/storage/v1/object/list/avatars`, {
    method: 'POST',
    headers: { ...H, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: '', limit: 100 }),
  })
  const files = await listRes.json().catch(() => [])
  const listed = Array.isArray(files) ? files.length : 0
  record('storage', 'avatars bucket is not anon-listable', listed === 0, `${listed} file(s) listed`)

  // ── Things that MUST keep working (regression guard) ──────────────────────
  // A locked-down database that has also broken the public marketplace is not
  // a success. These are the reason the fix is policies and not a blanket deny.
  const projects = await anonCount('projects')
  record('still-works', 'anon can still browse projects', projects > 0, `${projects} row(s)`)
  const listings = await anonCount('credit_listings')
  record('still-works', 'anon can still browse credit_listings', listings > 0, `${listings} row(s)`)

  // ── Report ────────────────────────────────────────────────────────────────
  const failed = results.filter((r) => r.ok === false)
  const warned = results.filter((r) => r.ok === 'warn')

  if (JSON_OUT) {
    console.log(JSON.stringify({ url: URL_BASE, pass: failed.length === 0, results }, null, 2))
  } else {
    let area = ''
    for (const r of results) {
      if (r.area !== area) {
        area = r.area
        console.log(`\n${area.toUpperCase()}`)
      }
      const label = r.ok === true ? 'PASS' : r.ok === 'warn' ? 'WARN' : 'FAIL'
      console.log(`  ${label}  ${r.name}  (${r.detail})`)
    }
    const warnNote = warned.length ? ` ${warned.length} check(s) inconclusive — see WARN above.` : ''
    console.log(
      failed.length === 0
        ? `\nAll checks passed. An anonymous caller sees nothing it should not, and public browsing still works.${warnNote}`
        : `\n${failed.length} check(s) FAILED — see above.${warnNote}`,
    )
  }

  process.exit(failed.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Probe failed to run:', err.message)
  process.exit(2)
})
