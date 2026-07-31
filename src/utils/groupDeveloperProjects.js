/**
 * Buckets a developer's projects for the project workspace list.
 *
 * The dashboard used to render every project as a fully expanded card — around
 * 600px each once the progress tracker, credit strip, notes, action rows and
 * comment thread were counted. Ten projects meant six thousand pixels of
 * scrolling, and the portfolio summary tiles were off screen the moment the
 * developer started looking for anything.
 *
 * Projects are grouped by what the developer has to *do* about them rather than
 * by raw status, because "draft" and "needs revision" are different statuses
 * with the same answer: nothing happens until you act.
 *
 * Lives outside the component so the grouping — in particular the guarantee
 * that a project cannot fall out of every bucket — is testable on its own.
 */

export const PROJECT_GROUPS = [
  {
    key: 'action',
    title: 'Needs your action',
    hint: 'Nothing moves until you do something',
    statuses: ['draft', 'needs_revision'],
  },
  {
    key: 'review',
    title: 'In review',
    hint: 'With a verifier — nothing for you to do',
    statuses: ['pending', 'submitted', 'in_review', 'under_review'],
  },
  {
    key: 'live',
    title: 'Live',
    hint: 'Approved, issuing and selling credits',
    statuses: ['approved', 'validated'],
  },
  {
    key: 'closed',
    title: 'Closed',
    hint: 'Rejected submissions',
    statuses: ['rejected'],
  },
]

/** Statuses whose whole point is that the developer must act on them. */
export const ACTION_STATUSES = PROJECT_GROUPS[0].statuses

const GROUPED_STATUSES = new Set(PROJECT_GROUPS.flatMap((group) => group.statuses))

/**
 * @param {Array<{status?: string}>} projects
 * @returns {Array<{key: string, title: string, hint: string, showHeader: true, items: Array}>}
 *   Non-empty groups in priority order.
 */
export function groupDeveloperProjects(projects = []) {
  const groups = PROJECT_GROUPS.map((group) => ({
    ...group,
    showHeader: true,
    items: projects.filter((project) => group.statuses.includes(project.status)),
  }))

  // A status outside every bucket still has to appear somewhere. Silently
  // dropping a project from its own owner's dashboard is the worst failure this
  // list can have, and the projects table's CHECK constraint has gained values
  // before — legacy rows with `submitted` and `under_review` are why the review
  // bucket lists four statuses.
  const ungrouped = projects.filter((project) => !GROUPED_STATUSES.has(project.status))
  if (ungrouped.length) {
    groups.push({ key: 'other', title: 'Other', hint: '', showHeader: true, items: ungrouped })
  }

  return groups.filter((group) => group.items.length > 0)
}
