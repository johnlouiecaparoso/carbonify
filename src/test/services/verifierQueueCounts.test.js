import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({
  getSupabase: vi.fn(),
}))

import { getVerifierQueueCounts } from '@/services/verifierQueueCounts'
import { getSupabase } from '@/services/supabaseClient'

/**
 * The workbench tabs were static labels, so the verifier's first question —
 * "which queue has work in it?" — could only be answered by opening all three
 * dashboards, one at a time, since only one panel mounts at once.
 *
 * The badge is a hint, not a figure anyone acts on directly: the queue itself is
 * one click away and authoritative. So unlike the seller money pages, where an
 * unreadable number must never render as 0, here a failed count degrades to
 * zero rather than taking down the workbench.
 */

/** Records which table was counted with which filter, and replies per table. */
function supabaseCounting(replies) {
  const calls = []
  return {
    calls,
    client: {
      from(table) {
        const filters = {}
        const chain = {
          select: () => chain,
          in(col, vals) {
            filters[col] = vals
            return chain
          },
          eq(col, val) {
            filters[col] = val
            return chain
          },
          then(resolve) {
            calls.push({ table, filters })
            const r = replies[table]
            return Promise.resolve(
              r instanceof Error ? { count: null, error: { message: r.message } } : { count: r, error: null },
            ).then(resolve)
          },
        }
        return chain
      },
    },
  }
}

beforeEach(() => vi.clearAllMocks())

describe('getVerifierQueueCounts', () => {
  it('counts each queue', async () => {
    const { client } = supabaseCounting({
      projects: 4,
      monitoring_reports: 2,
      role_applications: 7,
    })
    getSupabase.mockReturnValue(client)

    await expect(getVerifierQueueCounts()).resolves.toEqual({
      projects: 4,
      mrv: 2,
      applications: 7,
    })
  })

  it('filters each queue the way that queue own list does', async () => {
    // A badge that counts something different from the list it labels is worse
    // than no badge, so these must track ProjectApprovalPanel, getReviewQueue
    // and DeveloperApplicationsDashboard respectively.
    const { client, calls } = supabaseCounting({
      projects: 0,
      monitoring_reports: 0,
      role_applications: 0,
    })
    getSupabase.mockReturnValue(client)
    await getVerifierQueueCounts()

    const byTable = Object.fromEntries(calls.map((c) => [c.table, c.filters]))
    expect(byTable.projects.status).toEqual(['pending', 'submitted'])
    expect(byTable.monitoring_reports.status).toEqual(['submitted', 'under_review'])
    expect(byTable.role_applications.status).toBe('pending')
    expect(byTable.role_applications.role_requested).toBe('project_developer')
  })

  it('degrades one failing count to zero without losing the others', async () => {
    const { client } = supabaseCounting({
      projects: 3,
      monitoring_reports: new Error('permission denied'),
      role_applications: 1,
    })
    getSupabase.mockReturnValue(client)

    await expect(getVerifierQueueCounts()).resolves.toEqual({
      projects: 3,
      mrv: 0,
      applications: 1,
    })
  })

  it('returns zeroes when there is no supabase client', async () => {
    getSupabase.mockReturnValue(null)
    await expect(getVerifierQueueCounts()).resolves.toEqual({
      projects: 0,
      mrv: 0,
      applications: 0,
    })
  })

  it('coerces a null count to zero rather than NaN', async () => {
    const { client } = supabaseCounting({
      projects: null,
      monitoring_reports: null,
      role_applications: null,
    })
    getSupabase.mockReturnValue(client)
    await expect(getVerifierQueueCounts()).resolves.toEqual({
      projects: 0,
      mrv: 0,
      applications: 0,
    })
  })
})
