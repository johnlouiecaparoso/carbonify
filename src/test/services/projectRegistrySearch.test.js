import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))

import { searchProjectRegistry } from '@/services/registryService'
import { getSupabase } from '@/services/supabaseClient'

/**
 * The public PROJECT registry read.
 *
 * The certificate search next door has been live since 20260626000900 and this
 * is its companion. Two properties matter enough to pin:
 *
 *   1. A failed read THROWS. Its sibling `getMarketStats` deliberately returns
 *      zeroes, and that is right for a dashboard tile — but here `[]` renders as
 *      "no validated projects match your search", which is a claim about the
 *      platform's contents rather than about the request that failed. This
 *      repository has shipped that exact defect on eight surfaces; the registry
 *      is the one an outside auditor reads.
 *
 *   2. Blank filters go to the RPC as `null`, not as `''`. The SQL treats null
 *      and empty-string alike, so this is belt-and-braces — but the argument
 *      NAMES are load-bearing. PostgREST resolves an RPC by name *and* argument
 *      names, so a renamed parameter fails as PGRST202, which is the same code
 *      a missing function returns. That has already produced one confidently
 *      wrong status report on this project.
 */

function mockRpc(result) {
  const rpc = vi.fn().mockResolvedValue(result)
  getSupabase.mockReturnValue({ rpc })
  return rpc
}

describe('searchProjectRegistry', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls the RPC with the exact argument names the migration declares', async () => {
    const rpc = mockRpc({ data: [], error: null })

    await searchProjectRegistry({
      search: 'rice',
      category: 'biochar',
      methodology: 'verra_vcs',
      page: 2,
    })

    expect(rpc).toHaveBeenCalledWith('search_public_project_registry', {
      p_search: 'rice',
      p_category: 'biochar',
      p_methodology: 'verra_vcs',
      p_limit: 25,
      p_offset: 50,
    })
  })

  it('sends null rather than empty strings for unset filters', async () => {
    const rpc = mockRpc({ data: [], error: null })

    await searchProjectRegistry()

    expect(rpc).toHaveBeenCalledWith('search_public_project_registry', {
      p_search: null,
      p_category: null,
      p_methodology: null,
      p_limit: 25,
      p_offset: 0,
    })
  })

  it('never sends a negative offset', async () => {
    const rpc = mockRpc({ data: [], error: null })

    await searchProjectRegistry({ page: -5 })

    expect(rpc.mock.calls[0][1].p_offset).toBe(0)
  })

  it('returns the rows and the page size', async () => {
    mockRpc({
      data: [
        { project_id: 'p1', title: 'Rice husk biochar', methodology: 'verra_vcs' },
        { project_id: 'p2', title: 'Coconut shell', methodology: null },
      ],
      error: null,
    })

    const { rows, pageSize } = await searchProjectRegistry()

    expect(rows).toHaveLength(2)
    expect(rows[0].project_id).toBe('p1')
    expect(pageSize).toBe(25)
  })

  it('THROWS on a failed read rather than reporting an empty registry', async () => {
    mockRpc({ data: null, error: { message: 'permission denied for function' } })

    await expect(searchProjectRegistry()).rejects.toThrow('permission denied for function')
  })

  it('throws when the client is unavailable', async () => {
    getSupabase.mockReturnValue(null)

    await expect(searchProjectRegistry()).rejects.toThrow('Supabase client not available')
  })

  it('treats a null data payload as no rows, not as a failure', async () => {
    // PostgREST answers an empty result set with null rather than []. That is a
    // genuinely empty registry, which is different from a failed read and must
    // not be turned into one.
    mockRpc({ data: null, error: null })

    const { rows } = await searchProjectRegistry()
    expect(rows).toEqual([])
  })
})
