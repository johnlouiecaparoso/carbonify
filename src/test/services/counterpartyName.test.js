import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { getCounterpartyName } from '@/services/receiptService'
import { getSupabase } from '@/services/supabaseClient'

/**
 * DEFERRED_BACKLOG #3 — a receipt could not name the other party.
 *
 * The `buyer:`/`seller:` profile embeds resolve structurally (20260718001100)
 * and then return NOTHING, because `profiles` SELECT is hardened against role /
 * kyc_level escalation (20260703000300). RLS filters rows rather than erroring,
 * so the receipt rendered a blank counterparty with nothing in the console —
 * the same "RLS does not error" trap that made the consent gate ask forever.
 *
 * Migration 20260801000100 adds a SECURITY DEFINER function returning a NAME
 * ONLY, and only to a party of that exact transaction. `profiles` RLS is not
 * touched.
 *
 * The distinction these tests pin is the one the whole repo keeps getting wrong:
 *
 *   zero rows  -> "you are not a party to this"  -> null, quietly
 *   an error   -> "the RPC is missing/failed"    -> null, but LOGGED
 *
 * Both degrade to null on purpose: a receipt that refused to render because it
 * could not name the counterparty would be worse than one that omits the name.
 */

function clientReturning(result) {
  return { rpc: vi.fn().mockResolvedValue(result) }
}

describe('the receipt actually calls it', () => {
  it('generateReceipt uses getCounterpartyName', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../services/receiptService.js'),
      'utf8',
    )

    // It was written, exported, tested — and imported by NOTHING, so Vite
    // tree-shook it straight out of the bundle. The migration and the service
    // both existed while the capability could not run: this session's own
    // "built != live" pattern, produced by the person fixing it.
    //
    // Asserting the export exists would have passed the whole time. This asserts
    // it is CALLED, which is the difference.
    expect(source).toMatch(/const counterparty = await getCounterpartyName\(/)
  })
})

describe('getCounterpartyName', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReset()
  })

  it('returns the counterparty when the caller is party to the transaction', async () => {
    vi.mocked(getSupabase).mockReturnValue(
      clientReturning({
        data: [{ counterparty_id: 'u2', counterparty_name: 'Maria Santos', counterparty_role: 'seller' }],
        error: null,
      }),
    )

    await expect(getCounterpartyName('txn-1')).resolves.toEqual({
      id: 'u2',
      name: 'Maria Santos',
      role: 'seller',
    })
  })

  it('passes the transaction id and NEVER a user id', async () => {
    const client = clientReturning({ data: [], error: null })
    vi.mocked(getSupabase).mockReturnValue(client)

    await getCounterpartyName('txn-1')

    // Identity comes from auth.uid() inside the function. If the client ever
    // starts supplying a user id, the function has become a directory lookup —
    // the exact mistake the payment path made and had to fix (P3).
    expect(client.rpc).toHaveBeenCalledWith('get_transaction_counterparty_name', {
      p_transaction_id: 'txn-1',
    })
    const [, args] = client.rpc.mock.calls[0]
    expect(Object.keys(args)).toEqual(['p_transaction_id'])
  })

  it('returns null for zero rows — the caller is not a party', async () => {
    vi.mocked(getSupabase).mockReturnValue(clientReturning({ data: [], error: null }))

    await expect(getCounterpartyName('someone-elses-txn')).resolves.toBeNull()
  })

  it('returns null and warns when the RPC is missing (migration unapplied)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(getSupabase).mockReturnValue(
      clientReturning({ data: null, error: { message: 'function does not exist', code: 'PGRST202' } }),
    )

    await expect(getCounterpartyName('txn-1')).resolves.toBeNull()

    // The failure must be DISTINGUISHABLE from "not a party". This is the whole
    // difference between this and the consent-gate bug.
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('returns null without calling the RPC when there is no client', async () => {
    vi.mocked(getSupabase).mockReturnValue(null)

    await expect(getCounterpartyName('txn-1')).resolves.toBeNull()
  })
})
