import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))

import { listProjectComments } from '@/services/projectCommentService'
import { getSupabase } from '@/services/supabaseClient'

/**
 * DEFERRED_BACKLOG #39 — the project review thread could not name who was
 * speaking.
 *
 * `staff_profile_reads.sql` measured the profiles read posture per staff role on
 * 2026-08-05: admin FULL (6 of 6), verifier *** NONE *** (0 of 6), own-row
 * control passing for both. The admin consoles were never affected. The verifier
 * console was — and `ProjectCommentThread` is mounted inside
 * `ProjectApprovalPanel`, which is what `/verifier` renders.
 *
 * So every message from the other party read as the literal string 'User', on
 * the screen where a verifier asks a developer for evidence before approving
 * credits. Symmetric, because a general user also reads 0 of 6: each side saw
 * its own name and an anonymous counterparty.
 *
 * Silent, for the reason this repo keeps rediscovering: RLS FILTERS the embed
 * rather than erroring, so `error` is null, the throw never fires, and the
 * fallback string is indistinguishable from a deliberate default.
 *
 * Migration 20260805000200 adds a name-only RPC scoped to the thread. The embed
 * is kept as a fallback on purpose — these tests pin the PRECEDENCE, because
 * getting it backwards would silently restore the bug wherever the embed
 * happens to resolve.
 */

const ROWS = [
  { id: 'c1', author_id: 'dev1', body: 'Uploaded the revised MRV report.', profiles: null },
  { id: 'c2', author_id: 'ver1', body: 'Please attach the soil samples.', profiles: { full_name: 'Vera Cruz' } },
]

function clientWith({ comments = ROWS, commentsError = null, rpc }) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data: comments, error: commentsError }),
  }
  return { from: vi.fn(() => chain), rpc }
}

describe('the review thread names its speakers', () => {
  let warn

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
    vi.clearAllMocks()
  })

  it('resolves names the embed could not, and passes the project id the migration declares', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ author_id: 'dev1', display_name: 'Dana Reyes' }],
      error: null,
    })
    getSupabase.mockReturnValue(clientWith({ rpc }))

    const out = await listProjectComments('proj-1')

    // PostgREST resolves an RPC by name AND argument names; a renamed parameter
    // returns PGRST202, which is indistinguishable from the function being
    // absent. That misreading cost a false negative on 2026-08-02.
    expect(rpc).toHaveBeenCalledWith('get_project_comment_author_names', {
      p_project_id: 'proj-1',
    })
    expect(out[0].author_name).toBe('Dana Reyes')
  })

  it('prefers the RPC over the embed when both resolve', async () => {
    // Precedence matters: if the embed won, then wherever it happens to resolve
    // the RPC would be dead weight — and the bug would come back invisibly the
    // moment the policy changed underneath it.
    const rpc = vi.fn().mockResolvedValue({
      data: [{ author_id: 'ver1', display_name: 'Vera Cruz (verifier)' }],
      error: null,
    })
    getSupabase.mockReturnValue(clientWith({ rpc }))

    const out = await listProjectComments('proj-1')

    expect(out[1].author_name).toBe('Vera Cruz (verifier)')
  })

  it('falls back to the embed when the RPC returns no row for that author', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    getSupabase.mockReturnValue(clientWith({ rpc }))

    const out = await listProjectComments('proj-1')

    // c2's embed resolved; c1's did not. Nothing is lost relative to today.
    expect(out[1].author_name).toBe('Vera Cruz')
    expect(out[0].author_name).toBe('User')
  })

  it('still renders the thread, and LOGS, when the RPC is missing', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'function public.get_project_comment_author_names(uuid) does not exist' },
    })
    getSupabase.mockReturnValue(clientWith({ rpc }))

    const out = await listProjectComments('proj-1')

    // The thread must not disappear because a name could not be resolved.
    expect(out).toHaveLength(2)
    expect(out[1].author_name).toBe('Vera Cruz')
    expect(warn).toHaveBeenCalled()
    expect(String(warn.mock.calls[0][0])).toContain('20260805000200')
  })

  it('does not swallow a failed COMMENTS read — that one still throws', async () => {
    // Unchanged behaviour, asserted because it is the opposite decision to the
    // one above and the two sit three lines apart. An empty thread reads as
    // "nothing has been asked of you", which is how a requested revision goes
    // unanswered.
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    getSupabase.mockReturnValue(
      clientWith({ comments: null, commentsError: { message: 'boom' }, rpc }),
    )

    await expect(listProjectComments('proj-1')).rejects.toThrow('boom')
  })
})
