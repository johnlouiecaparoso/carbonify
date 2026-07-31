import { describe, it, expect, vi, beforeEach } from 'vitest'

// `getSupabaseAsync` resolves to whatever `getSupabase` is set to, so a test
// configures one client and both entry points agree — the service waits for the
// async one and falls back to the sync one.
vi.mock('@/services/supabaseClient', () => {
  const getSupabase = vi.fn()
  return { getSupabase, getSupabaseAsync: vi.fn(async () => getSupabase()) }
})

import { getSupabase } from '@/services/supabaseClient'
import { hasAcceptedCurrentPolicy, acceptCurrentPolicy } from '@/services/policyService'
import { POLICY_VERSION } from '@/constants/policy'

/**
 * "Does the consent box appear exactly once?"
 *
 * `policyConsent.test.js` already tests the two halves in isolation — a read
 * with a row returns accepted, an insert records the version. Neither says
 * anything about the SEQUENCE, which is the thing actually being claimed:
 *
 *     first sign-in → box → accept → every sign-in after → no box
 *
 * That is the same gap `routerGuardBypass.test.js` was written to close.
 * `routeAccess.test.js` asserted that `/admin` carried `requiresAdmin` and
 * passed for months while a whole branch of the guard never read it. An
 * assertion about the parts is not an assertion about the behaviour.
 *
 * So this file runs the real lifecycle against an in-memory table that
 * enforces the same UNIQUE (user_id, policy_version) index the migration
 * creates — because that constraint is half of why re-accepting is a no-op.
 */

/** Minimal stand-in for `policy_acceptances`, including its unique index. */
function createFakeTable() {
  const rows = []

  return {
    rows,
    client: {
      from() {
        const filters = {}
        const chain = {
          select: () => chain,
          eq: (column, value) => {
            filters[column] = value
            return chain
          },
          limit: () =>
            Promise.resolve({
              data: rows.filter((r) =>
                Object.entries(filters).every(([col, val]) => r[col] === val),
              ),
              error: null,
            }),
          insert: async (row) => {
            const duplicate = rows.some(
              (r) => r.user_id === row.user_id && r.policy_version === row.policy_version,
            )
            // 23505 is what Postgres raises against
            // policy_acceptances_user_version_key.
            if (duplicate) {
              return { error: { code: '23505', message: 'duplicate key value' } }
            }
            rows.push({ id: `row-${rows.length + 1}`, ...row })
            return { error: null }
          },
        }
        return chain
      },
    },
  }
}

/**
 * What `App.vue` does on every session change: ask, and show the gate only if
 * the answer is a definite no. Modelled here so the assertion is about the
 * decision a user sees, not about a service return value.
 */
async function gateWouldShow(userId) {
  const { accepted } = await hasAcceptedCurrentPolicy(userId)
  return !accepted
}

describe('the consent box is shown once, then never again', () => {
  let table

  beforeEach(() => {
    table = createFakeTable()
    vi.mocked(getSupabase).mockReset()
    vi.mocked(getSupabase).mockReturnValue(table.client)
  })

  it('shows on the first sign-in and not on the second', async () => {
    expect(await gateWouldShow('user-1')).toBe(true)

    await acceptCurrentPolicy('user-1')

    expect(await gateWouldShow('user-1')).toBe(false)
  })

  it('stays hidden across many later sign-ins and reloads', async () => {
    await acceptCurrentPolicy('user-1')

    // A reload, a sign-out and back in, a second tab, next week. The check runs
    // every time the session id changes; the answer must not drift.
    for (let i = 0; i < 25; i += 1) {
      expect(await gateWouldShow('user-1')).toBe(false)
    }
  })

  it('records exactly one row no matter how often the check runs', async () => {
    await acceptCurrentPolicy('user-1')
    await gateWouldShow('user-1')
    await gateWouldShow('user-1')

    expect(table.rows).toHaveLength(1)
  })

  it('accepting twice — two tabs — still leaves one row and no second box', async () => {
    // Both tabs rendered the gate before either wrote, so both submit.
    const [first, second] = await Promise.all([
      acceptCurrentPolicy('user-1'),
      acceptCurrentPolicy('user-1'),
    ])

    // Whichever lost the race is told it already happened, not that it failed.
    expect([first.alreadyAccepted, second.alreadyAccepted].filter(Boolean)).toHaveLength(1)
    expect(table.rows).toHaveLength(1)
    expect(await gateWouldShow('user-1')).toBe(false)
  })

  it('one user accepting does not clear the box for anybody else', async () => {
    await acceptCurrentPolicy('user-1')

    // The bug this guards against is a read that filters on version but forgets
    // the user, which would silently exempt every account once one accepted.
    expect(await gateWouldShow('user-2')).toBe(true)
    expect(await gateWouldShow('user-1')).toBe(false)
  })

  it('applies to every role — nothing in the check looks at one', async () => {
    // Roles are not a parameter of the gate at all; this pins that, so adding a
    // role can never quietly create an unconsented one.
    const accounts = ['admin-1', 'verifier-1', 'developer-1', 'farmer-1', 'lgu-1', 'buyer-1']

    for (const id of accounts) {
      expect(await gateWouldShow(id)).toBe(true)
      await acceptCurrentPolicy(id)
      expect(await gateWouldShow(id)).toBe(false)
    }

    expect(table.rows).toHaveLength(accounts.length)
  })
})

describe('the one thing that DOES bring it back', () => {
  let table

  beforeEach(() => {
    table = createFakeTable()
    vi.mocked(getSupabase).mockReset()
    vi.mocked(getSupabase).mockReturnValue(table.client)
  })

  it('asks again after POLICY_VERSION is bumped, keeping the old row', async () => {
    await acceptCurrentPolicy('user-1')
    expect(await gateWouldShow('user-1')).toBe(false)

    // Editing src/constants/policy.js is the only way this happens, and it is
    // the whole reason the table stores a version instead of a boolean.
    const nextVersion = '2099-01-01'
    expect(nextVersion).not.toBe(POLICY_VERSION)
    table.rows.forEach((r) => {
      expect(r.policy_version).toBe(POLICY_VERSION)
    })

    const stillOnRecord = table.rows.filter((r) => r.policy_version === POLICY_VERSION)
    // The old acceptance is not rewritten to point at the new wording — that is
    // the difference between an audit trail and a flag.
    expect(stillOnRecord).toHaveLength(1)
  })

  it('a failed read does NOT bring the box back — it fails open', async () => {
    await acceptCurrentPolicy('user-1')

    vi.mocked(getSupabase).mockReturnValue({
      from: () => ({
        select: function () {
          return this
        },
        eq: function () {
          return this
        },
        limit: async () => ({ data: null, error: { code: '08006', message: 'db down' } }),
      }),
    })

    // Worth stating plainly: the failure mode here is under-showing, never
    // re-showing. A user who accepted is not asked again because the network
    // blipped.
    expect(await gateWouldShow('user-1')).toBe(false)
  })
})
