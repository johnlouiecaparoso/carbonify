/**
 * Backlog counts for the three verifier workbench queues.
 *
 * The workbench tabs were static labels, so a verifier arriving at /verifier
 * could not tell which of the three queues had work in it without opening each
 * one — and only one panel mounts at a time, by design, so "open each one" means
 * three loads of three fairly heavy dashboards. The first question the role has
 * ("what needs me today?") took the most clicks to answer.
 *
 * Uses head-only exact counts: the tab badge needs a number, never the rows, and
 * these run on every visit to the panel.
 *
 * Statuses mirror each queue's own filter, deliberately duplicated here rather
 * than imported, because a badge that counts something different from the list
 * it labels is worse than no badge:
 *   - projects           ProjectApprovalPanel -> ['pending', 'submitted']
 *   - monitoring_reports getReviewQueue       -> ['submitted', 'under_review']
 *   - role_applications  DeveloperApplicationsDashboard -> 'pending', developer
 */

import { getSupabase } from '@/services/supabaseClient'
import { ROLE_APPLICATION_STATUS, ROLE_APPLICATION_ROLES } from '@/services/roleApplicationService'

const EMPTY = { projects: 0, mrv: 0, applications: 0 }

/** Exact row count for a filtered table, without transferring the rows. */
async function countRows(supabase, table, apply) {
  const query = supabase.from(table).select('id', { count: 'exact', head: true })
  const { count, error } = await apply(query)
  if (error) throw new Error(error.message || `Failed to count ${table}`)
  return Number(count) || 0
}

/**
 * @returns {Promise<{projects: number, mrv: number, applications: number}>}
 *   Zeroes for any queue whose count could not be read — see below.
 */
export async function getVerifierQueueCounts() {
  const supabase = getSupabase()
  if (!supabase) return { ...EMPTY }

  // allSettled and a zero fallback, which is the opposite of the rule applied to
  // the seller money pages (where an unreadable figure must never render as 0).
  // The difference is what the number claims: a badge is a hint about where to
  // look next, and the queue itself is one click away and authoritative. Failing
  // the whole workbench because a badge could not be computed would be the
  // bigger error.
  const [projects, mrv, applications] = await Promise.allSettled([
    countRows(supabase, 'projects', (q) => q.in('status', ['pending', 'submitted'])),
    countRows(supabase, 'monitoring_reports', (q) => q.in('status', ['submitted', 'under_review'])),
    countRows(supabase, 'role_applications', (q) =>
      q
        .eq('status', ROLE_APPLICATION_STATUS.PENDING)
        .eq('role_requested', ROLE_APPLICATION_ROLES.PROJECT_DEVELOPER),
    ),
  ])

  const value = (settled, label) => {
    if (settled.status === 'fulfilled') return settled.value
    console.warn(`Could not count the ${label} queue:`, settled.reason?.message)
    return 0
  }

  return {
    projects: value(projects, 'project review'),
    mrv: value(mrv, 'MRV report'),
    applications: value(applications, 'developer application'),
  }
}
