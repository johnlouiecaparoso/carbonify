import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { getBuyerProfiles } from '@/services/assetLedgerService'

/**
 * DEFERRED_BACKLOG #39 — a developer's asset ledger could not name its buyers.
 *
 * `getBuyerProfiles` read `profiles` directly for the buyer ids on the seller's
 * completed sales. On 2026-08-05 probes 9 and 10 of `rls_negative_suite.sql`
 * MEASURED what that returns for a signed-in non-admin: 0 of 6 foreign rows. So
 * every counterparty rendered as "Unknown buyer" — on the list the view's own
 * comment calls "the one an ERPA hangs on".
 *
 * The read had an error branch, and it could never fire: RLS FILTERS rows rather
 * than erroring, so `error` was null and `data` was `[]`. The handler covered the
 * failure that does not happen; the one that does was silent. Same shape as the
 * receipt counterparty (#3), whose fix migration `20260805000100` mirrors.
 *
 * What these tests pin is the distinction the repo keeps getting wrong:
 *
 *   zero rows  -> "none of these are your buyers"  -> {}, quietly
 *   an error   -> "the RPC is missing/failed"      -> {}, but LOGGED
 *
 * Both degrade to {} on purpose. `aggregateAssetLedger` already renders an
 * unnamed buyer as "Unknown buyer", so a ledger that refused to load because it
 * could not name someone would be strictly worse.
 */

const SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../services/assetLedgerService.js'),
  'utf8',
)

describe('the asset ledger resolves buyer names through the RPC, not the table', () => {
  it('calls get_my_buyer_names', () => {
    expect(SOURCE).toContain("supabase.rpc('get_my_buyer_names'")
  })

  it('passes the ids under the parameter name the migration declares', () => {
    // PostgREST resolves an RPC by name AND argument names, so a renamed
    // parameter returns PGRST202 — indistinguishable from the function being
    // absent. That misreading cost a full false negative on 2026-08-02, and the
    // rule it produced was: copy the signature out of the migration.
    expect(SOURCE).toContain('p_buyer_ids')
  })

  it('no longer reads the profiles table for buyer identities', () => {
    // The regression this exists to catch is someone "restoring" the direct read
    // because the RPC looks like indirection. It is not indirection: the direct
    // read returns nothing, measurably, and says so to no one.
    expect(SOURCE).not.toContain("from('profiles')")
  })

  it('does not ask the RPC for an email', () => {
    // The old display fallback was organization_name || full_name || email. The
    // RPC returns names only; reintroducing an email column here would widen a
    // money-surface read, which is the 2026-07-30 paymongo-checkout finding.
    expect(SOURCE).not.toMatch(/get_my_buyer_names[\s\S]{0,400}email/)
  })
})

describe('getBuyerProfiles behaviour', () => {
  let warn

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('maps rows to a display name keyed by buyer id', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: [
          { buyer_id: 'b1', display_name: 'Acme Offsets' },
          { buyer_id: 'b2', display_name: 'Ben Reyes' },
        ],
        error: null,
      }),
    }

    const out = await getBuyerProfiles(supabase, ['b1', 'b2'])

    expect(supabase.rpc).toHaveBeenCalledWith('get_my_buyer_names', {
      p_buyer_ids: ['b1', 'b2'],
    })
    expect(out).toEqual({
      b1: { full_name: 'Acme Offsets' },
      b2: { full_name: 'Ben Reyes' },
    })
  })

  it('returns {} WITHOUT logging when no id is one of the caller\'s buyers', async () => {
    const supabase = { rpc: vi.fn().mockResolvedValue({ data: [], error: null }) }

    expect(await getBuyerProfiles(supabase, ['someone-else'])).toEqual({})
    // Zero rows is the authorisation answer. Warning here would train people to
    // ignore the warning that matters.
    expect(warn).not.toHaveBeenCalled()
  })

  it('returns {} AND logs when the RPC errors — e.g. the migration is unapplied', async () => {
    const supabase = {
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'function public.get_my_buyer_names(uuid[]) does not exist' },
      }),
    }

    expect(await getBuyerProfiles(supabase, ['b1'])).toEqual({})
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0][0])).toContain('20260805000100')
  })

  it('does not call the RPC at all for an empty id list', async () => {
    const supabase = { rpc: vi.fn() }
    expect(await getBuyerProfiles(supabase, [])).toEqual({})
    expect(supabase.rpc).not.toHaveBeenCalled()
  })
})
