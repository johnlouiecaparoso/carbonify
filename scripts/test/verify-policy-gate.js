#!/usr/bin/env node

/**
 * Why does the consent gate keep coming back?
 *
 * The gate shows whenever `policy_acceptances` has no row for
 * (auth.uid(), POLICY_VERSION). If it reappears on every sign-in, exactly one
 * of three things is true, and only a real authenticated round-trip tells them
 * apart — the unit tests mock Supabase, so they cannot:
 *
 *   1. The INSERT is failing        → you would see an error on ACCEPT below.
 *   2. The INSERT lands but the read cannot see it (RLS / identity mismatch)
 *                                   → ACCEPT ok, but READ AFTER still empty.
 *   3. Nothing is wrong; nobody has ever ticked the box
 *                                   → both steps succeed, gate stops appearing.
 *
 * This runs the exact two calls `src/services/policyService.js` makes, as a
 * real signed-in user, and prints the raw PostgREST error rather than the
 * friendly string the UI shows.
 *
 * Usage:
 *   node scripts/test/verify-policy-gate.js <email> <password>
 *   node scripts/test/verify-policy-gate.js <email> <password> --write
 *
 * Read-only by default: it reports what the READ returns and stops. Pass
 * --write to also attempt the acceptance INSERT, which writes a real row for
 * that account — use a test account, not your own.
 *
 * Credentials are arguments, never stored in this file.
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const [, , email, password, ...flags] = process.argv
const write = flags.includes('--write')

function loadEnv() {
  return Object.fromEntries(
    readFileSync(new URL('../../.env', import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => {
        const [k, ...v] = l.split('=')
        return [k.trim(), v.join('=').trim()]
      }),
  )
}

async function main() {
  const env = loadEnv()

  // Read from the same constant the app does, so a version bump can never make
  // this script agree with a gate that disagrees with it.
  const POLICY_VERSION = readFileSync(
    new URL('../../src/constants/policy.js', import.meta.url),
    'utf8',
  ).match(/POLICY_VERSION = '([^']+)'/)?.[1]

  const url = env.VITE_SUPABASE_URL
  const supabase = createClient(url, env.VITE_SUPABASE_ANON_KEY, {
    // No session persistence and no token refresh timer: this is a one-shot
    // script, and a background refresh keeps the process alive after it prints.
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`project        ${url}`)
  console.log(`POLICY_VERSION ${POLICY_VERSION}\n`)

  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (authError) {
    console.error(`SIGN-IN  FAILED  ${authError.message}`)
    console.error('\nThat account does not exist in this project, or the password is wrong.')
    console.error('Use an account you can actually sign into the app with.')
    return 1
  }

  const userId = auth.user.id
  console.log(`SIGN-IN  ok      auth.uid() = ${userId}`)

  async function read(label) {
    const { data, error } = await supabase
      .from('policy_acceptances')
      .select('id, policy_version, accepted_at')
      .eq('user_id', userId)
      .eq('policy_version', POLICY_VERSION)
      .limit(1)

    if (error) {
      // This is the branch the service treats as "let them in" — it should be
      // loud here, because in the app it is silent.
      console.log(`READ ${label}  ERROR   ${error.code} ${error.message}`)
      console.log('         → the gate FAILS OPEN on this: no consent is collected at all.')
      return null
    }

    const rows = data?.length ?? 0
    console.log(`READ ${label}  ok      ${rows} row(s) → gate ${rows > 0 ? 'HIDDEN' : 'SHOWS'}`)
    return rows
  }

  const before = await read('BEFORE')

  if (!write) {
    console.log('\n(read-only; pass --write to attempt the acceptance INSERT)')
  } else if (before > 0) {
    console.log('\nAlready accepted — nothing to write. The gate should not be appearing for')
    console.log('this account. If it is, the bug is in App.vue, not in the data.')
  } else {
    const { error } = await supabase.from('policy_acceptances').insert({
      user_id: userId,
      policy_version: POLICY_VERSION,
      documents: ['terms', 'privacy', 'carbon'],
      user_agent: 'verify-policy-gate.js',
    })

    if (error) {
      console.log(`ACCEPT   FAILED  ${error.code} ${error.message}`)
      if (error.details) console.log(`         details: ${error.details}`)
      if (error.code === '42501') {
        console.log('         → RLS rejected the write: the request had no user identity')
        console.log('           (auth.uid() was null), or user_id did not match it.')
      }
      console.log('\nCAUSE 1: the write is failing. Nothing is ever recorded, so the gate')
      console.log('returns on every sign-in for every role.')
    } else {
      console.log('ACCEPT   ok      row written')
      const after = await read('AFTER ')
      console.log(
        after > 0
          ? '\nCAUSE 3: the write and read both work. The gate was reappearing because\nnobody had completed it — it stops now for this account.'
          : '\nCAUSE 2: the row was written but the read cannot see it. The write and the\nread disagree about identity or version — that is the loop you are in.',
      )
    }
  }

  await supabase.auth.signOut()
  return 0
}

if (!email || !password) {
  console.error('Usage: node scripts/test/verify-policy-gate.js <email> <password> [--write]')
  // `process.exitCode` rather than `process.exit()`: forcing exit while the
  // Supabase client still holds open handles trips a libuv assertion on
  // Windows, which looks like a crash and buries the actual result.
  process.exitCode = 1
} else {
  process.exitCode = await main()
}
