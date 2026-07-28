<template>
  <div class="developer-projects-page">
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">Project Workspace</h1>
        <p class="page-description">
          Your projects, credits, and reporting deadlines in one place.
        </p>
      </div>
    </div>

    <div class="page-content">
      <div class="container">
        <!-- Action failures (delete/resubmit/listing) get their own dismissible
             banner. They must never replace the project list the way a load
             failure does — a failed delete used to blank the whole page. -->
        <div v-if="actionError" class="banner banner--error" role="alert">
          <span class="material-symbols-outlined" aria-hidden="true">error</span>
          <p>{{ actionError }}</p>
          <button
            class="banner__dismiss"
            type="button"
            aria-label="Dismiss"
            @click="actionError = ''"
          >
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>

        <!-- MRV deadlines surfaced where developers actually land. Previously
             these only ever rendered on /monitoring — the page they were
             reminding you to open. -->
        <router-link
          v-if="!loading && reminders.length"
          to="/monitoring"
          class="banner banner--warn banner--link"
        >
          <span class="material-symbols-outlined" aria-hidden="true">event_busy</span>
          <p>
            <strong>{{ reminderHeadline }}</strong>
            {{ reminderDetail }}
          </p>
          <span class="material-symbols-outlined banner__chevron" aria-hidden="true"
            >chevron_right</span
          >
        </router-link>

        <!-- Portfolio summary. The per-status counts that used to live here are
             already on the filter tabs below, so these tiles carry what the tabs
             cannot: credits, inventory, money, and deadlines. -->
        <section v-if="showSummary" class="summary-grid" aria-label="Portfolio summary">
          <router-link to="/developer/ledger" class="summary-card">
            <p class="summary-label">Credits issued</p>
            <p class="summary-value">{{ num(ledgerTotals.issued) }}</p>
            <p class="summary-hint">across {{ num(ledgerTotals.projects) }} project(s)</p>
          </router-link>

          <router-link to="/developer/ledger" class="summary-card">
            <p class="summary-label">Available to sell</p>
            <p class="summary-value">{{ num(ledgerTotals.inventory) }}</p>
            <p class="summary-hint">{{ peso(ledgerTotals.inventoryValue) }} at listed price</p>
          </router-link>

          <router-link to="/sales" class="summary-card">
            <p class="summary-label">Available to withdraw</p>
            <p class="summary-value">{{ peso(balance.available) }}</p>
            <p class="summary-hint">{{ peso(balance.held) }} held in escrow</p>
          </router-link>

          <router-link to="/monitoring" class="summary-card" :class="{ urgent: overdueCount > 0 }">
            <p class="summary-label">Monitoring due</p>
            <p class="summary-value">{{ num(reminders.length) }}</p>
            <p class="summary-hint">{{ mrvHint }}</p>
          </router-link>
        </section>

        <div class="toolbar">
          <div class="status-tabs">
            <button
              v-for="tab in tabs"
              :key="tab.value"
              class="status-tab"
              :class="{ active: activeFilter === tab.value }"
              @click="activeFilter = tab.value"
              type="button"
            >
              {{ tab.label }} ({{ tab.count }})
            </button>
          </div>

          <button class="submit-btn" type="button" @click="goToSubmitProject">
            Submit New Project
          </button>
        </div>

        <div v-if="loading" class="state-card">Loading your projects...</div>
        <div v-else-if="loadError" class="state-card error">
          {{ loadError }}
          <div><button class="retry-btn" type="button" @click="reload">Try again</button></div>
        </div>
        <!-- First-run: developer has no projects at all -->
        <div v-else-if="stats.total === 0" class="empty-hero">
          <span class="material-symbols-outlined empty-hero__icon" aria-hidden="true">forest</span>
          <h2 class="empty-hero__title">Submit your first carbon project</h2>
          <p class="empty-hero__text">
            List your project, attach the required documents, and a verifier will review it. Once
            validated, your credits go on sale in the marketplace.
          </p>
          <button class="submit-btn" type="button" @click="goToSubmitProject">
            Submit your first project
          </button>
        </div>
        <!-- Have projects, but none match the active filter -->
        <div v-else-if="filteredProjects.length === 0" class="state-card">
          No projects found for this status.
        </div>

        <!-- Grouped by what the developer has to do about each project, with
             every project collapsed to a single row until asked for. -->
        <div v-else class="project-groups">
          <section v-for="group in projectGroups" :key="group.key" class="project-group">
            <button
              v-if="group.showHeader"
              class="group-header"
              type="button"
              :aria-expanded="!collapsedGroups.has(group.key)"
              @click="toggleGroup(group.key)"
            >
              <span
                class="material-symbols-outlined group-caret"
                :class="{ open: !collapsedGroups.has(group.key) }"
                aria-hidden="true"
                >chevron_right</span
              >
              <span class="group-title">{{ group.title }}</span>
              <span class="group-count">{{ group.items.length }}</span>
              <span class="group-hint">{{ group.hint }}</span>
            </button>

            <ul v-if="!collapsedGroups.has(group.key)" class="project-list">
              <li v-for="project in group.items" :key="project.id" class="project-row">
                <!-- Collapsed summary. Everything below it is the card that used
                     to render unconditionally for every project. -->
                <button
                  class="row-summary"
                  type="button"
                  :aria-expanded="isExpanded(project)"
                  @click="toggleProject(project)"
                >
                  <span
                    class="material-symbols-outlined row-caret"
                    :class="{ open: isExpanded(project) }"
                    aria-hidden="true"
                    >chevron_right</span
                  >
                  <span class="row-body">
                    <span class="row-title">{{ project.title }}</span>
                    <span class="row-meta">
                      {{ project.category || 'Uncategorized' }} •
                      {{ project.location || 'No location' }}
                    </span>
                  </span>
                  <span v-if="rowSignal(project)" class="row-signal">{{ rowSignal(project) }}</span>
                  <span class="status-badge" :class="statusClass(project.status)">
                    {{ statusLabel(project.status) }}
                  </span>
                </button>

                <article v-if="isExpanded(project)" class="project-card">
                  <!-- The tracker was previously given no issuance/trading signal,
                       so it froze at "Verification" forever. Feed it the real
                       ledger and listing state. -->
                  <ProjectProgressTracker
                    :project="project"
                    :credits-issued="hasIssuedCredits(project.id)"
                    :listed="hasActiveListing(project.id)"
                  />

                  <p class="project-description">
                    {{ project.description || 'No description provided.' }}
                  </p>

                  <!-- Credits, once a project is live. Previously a developer had to
                       leave the dashboard entirely to learn any of this. -->
                  <dl v-if="ledgerFor(project.id)" class="credit-strip">
                    <div>
                      <dt>Issued</dt>
                      <dd>{{ num(ledgerFor(project.id).issued) }}</dd>
                    </div>
                    <div>
                      <dt>Available</dt>
                      <dd>{{ num(ledgerFor(project.id).inventory) }}</dd>
                    </div>
                    <div>
                      <dt>Sold</dt>
                      <dd>{{ num(ledgerFor(project.id).sold) }}</dd>
                    </div>
                    <div>
                      <dt>Earned</dt>
                      <dd>{{ peso(ledgerFor(project.id).soldValue) }}</dd>
                    </div>
                    <div v-if="listingFor(project.id)">
                      <dt>Listed at</dt>
                      <dd>
                        {{ peso(listingFor(project.id).pricePerCredit) }}
                        <span class="listing-pill" :class="listingFor(project.id).status">{{
                          listingFor(project.id).status === 'active' ? 'On sale' : 'Paused'
                        }}</span>
                      </dd>
                    </div>
                  </dl>

                  <div class="project-dates">
                    <span>Submitted: {{ formatDate(project.created_at) }}</span>
                    <span v-if="project.verified_at"
                      >Reviewed: {{ formatDate(project.verified_at) }}</span
                    >
                  </div>

                  <div v-if="project.status === 'rejected'" class="notes-box rejected-note">
                    <h4>Rejection Reason</h4>
                    <p>
                      {{
                        project.verification_notes || 'No rejection note was provided by verifier.'
                      }}
                    </p>
                  </div>

                  <div
                    v-else-if="project.status === 'needs_revision'"
                    class="notes-box revision-note"
                  >
                    <h4>Revisions Requested</h4>
                    <p>
                      {{
                        project.verification_notes ||
                        'The verifier asked for changes — see the conversation below.'
                      }}
                    </p>
                    <div class="revision-actions">
                      <button class="resubmit-btn" type="button" @click="goToEdit(project)">
                        Edit details
                      </button>
                      <button
                        class="resubmit-btn primary"
                        type="button"
                        :disabled="resubmittingId === project.id"
                        @click="resubmit(project)"
                      >
                        {{
                          resubmittingId === project.id ? 'Resubmitting…' : 'Resubmit for review'
                        }}
                      </button>
                      <button
                        class="resubmit-btn danger"
                        type="button"
                        :disabled="deletingId === project.id"
                        @click="removeProject(project)"
                      >
                        {{ deletingId === project.id ? 'Deleting…' : 'Delete' }}
                      </button>
                    </div>
                  </div>

                  <div
                    v-else-if="
                      ['approved', 'validated'].includes(project.status) &&
                      project.verification_notes
                    "
                    class="notes-box approved-note"
                  >
                    <h4>Verifier Notes</h4>
                    <p>{{ project.verification_notes }}</p>
                  </div>

                  <!-- A draft has not been submitted to anyone yet, so it gets its own
                       explanation and the action that moves it into the queue. -->
                  <div v-if="project.status === 'draft'" class="notes-box draft-note">
                    <h4>Not submitted yet</h4>
                    <p>
                      This draft is visible only to you. Submitting it sends it to a verifier for
                      review — all required documents must be attached first.
                    </p>
                    <div class="revision-actions">
                      <button class="resubmit-btn" type="button" @click="goToEdit(project)">
                        Continue editing
                      </button>
                      <button
                        class="resubmit-btn primary"
                        type="button"
                        :disabled="submittingId === project.id"
                        @click="submitDraft(project)"
                      >
                        {{ submittingId === project.id ? 'Submitting…' : 'Submit for review' }}
                      </button>
                      <button
                        class="resubmit-btn danger"
                        type="button"
                        :disabled="deletingId === project.id"
                        @click="removeProject(project)"
                      >
                        {{ deletingId === project.id ? 'Deleting…' : 'Delete' }}
                      </button>
                    </div>
                  </div>

                  <!-- Edit / delete for submissions still pending review (draft and
                       needs_revision cards have their own action rows above). -->
                  <div
                    v-if="
                      canManage(project) && !['needs_revision', 'draft'].includes(project.status)
                    "
                    class="project-actions"
                  >
                    <button class="action-link" type="button" @click="goToEdit(project)">
                      Edit
                    </button>
                    <button
                      class="action-link danger"
                      type="button"
                      :disabled="deletingId === project.id"
                      @click="removeProject(project)"
                    >
                      {{ deletingId === project.id ? 'Deleting…' : 'Delete' }}
                    </button>
                  </div>

                  <!-- A live project used to be a dead end: no way to price it, report
                       on it, or even see its public page from here. -->
                  <div v-if="isLive(project)" class="project-actions">
                    <button
                      v-if="listingFor(project.id)"
                      class="action-link"
                      type="button"
                      @click="manageListing(project)"
                    >
                      Manage listing
                    </button>
                    <router-link class="action-link" to="/monitoring">
                      Submit monitoring report
                    </router-link>
                    <router-link class="action-link" :to="`/projects/${project.id}`">
                      View public page
                    </router-link>
                  </div>

                  <!-- Conversation with the verifier. This used to render expanded on
                       every card, so a developer with a dozen projects paid a dozen
                       round trips on load and scrolled past a dozen open threads.
                       Note the v-if is load-bearing: <details> hides its content but
                       still mounts it, so collapsing alone would not stop the query. -->
                  <!-- :open restores the thread when a collapsed card is reopened.
                       Without it the v-if below would remount the thread hidden
                       inside a closed <details> and refetch for nothing. -->
                  <details
                    class="thread-toggle"
                    :open="openThreads.has(project.id)"
                    @toggle="onThreadToggle(project.id, $event)"
                  >
                    <summary>Conversation with the verifier</summary>
                    <ProjectCommentThread
                      v-if="openThreads.has(project.id)"
                      :project-id="project.id"
                      :allow-internal="false"
                    />
                  </details>
                </article>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>

    <ListingManagerModal
      v-if="listingUnderEdit"
      :listing="listingUnderEdit"
      @close="listingUnderEdit = null"
      @saved="onListingSaved"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { projectService } from '@/services/projectService'
import { projectApprovalService } from '@/services/projectApprovalService'
import { getMyAssetLedger } from '@/services/assetLedgerService'
import { getMyListings, indexListingsByProject } from '@/services/sellerListingService'
import { getSellerBalance } from '@/services/payoutService'
import { computeMrvReminders, syncMrvReminderNotifications } from '@/services/mrvReminderService'
import ProjectProgressTracker from '@/components/ProjectProgressTracker.vue'
import ProjectCommentThread from '@/components/project/ProjectCommentThread.vue'
import ListingManagerModal from '@/components/developer/ListingManagerModal.vue'
import { groupDeveloperProjects, ACTION_STATUSES } from '@/utils/groupDeveloperProjects'
import { peso, num } from '@/utils/format'

const router = useRouter()

const loading = ref(true)
// Two error channels on purpose: `loadError` means "there is nothing to show"
// and replaces the list; `actionError` is a failed action on a list that is
// still perfectly valid, so it must sit above the list, not instead of it.
const loadError = ref('')
const actionError = ref('')
const projects = ref([])
const activeFilter = ref('all')
const resubmittingId = ref(null)
const submittingId = ref(null)
const deletingId = ref(null)

// Best-effort context. Any of these may fail without breaking the page.
const ledgerRows = ref([])
const ledgerTotals = ref({ projects: 0, issued: 0, inventory: 0, inventoryValue: 0 })
const listingsByProject = ref({})
const balance = ref({ available: 0, held: 0, currency: 'PHP' })
const reminders = ref([])
const listingUnderEdit = ref(null)
// Project ids whose comment thread has been opened at least once. Threads mount
// (and fetch) lazily; once opened they stay mounted so reopening is instant.
const openThreads = ref(new Set())

function onThreadToggle(projectId, event) {
  if (!event?.target?.open || openThreads.value.has(projectId)) return
  openThreads.value = new Set(openThreads.value).add(projectId)
}

const has = (project, ...statuses) => statuses.includes(project.status)

// Statuses where the owner may still edit/delete their submission. Mirrors the
// projects RLS policies and OWNER_EDITABLE_STATUSES in projectService.
const OWNER_EDITABLE_STATUSES = ['draft', 'pending', 'submitted', 'needs_revision']
const canManage = (project) => OWNER_EDITABLE_STATUSES.includes(project.status)
const isLive = (project) => has(project, 'approved', 'validated')


const ledgerByProject = computed(() =>
  Object.fromEntries(ledgerRows.value.map((row) => [row.projectId, row])),
)
// Only worth showing once something has actually been issued — an all-zero strip
// on a pending submission is noise.
const ledgerFor = (projectId) => {
  const row = ledgerByProject.value[projectId]
  return row && (row.issued > 0 || row.sold > 0) ? row : null
}
const listingFor = (projectId) => listingsByProject.value[projectId] || null
const hasIssuedCredits = (projectId) => (ledgerByProject.value[projectId]?.issued || 0) > 0
const hasActiveListing = (projectId) => listingFor(projectId)?.status === 'active'

const overdueCount = computed(() => reminders.value.filter((r) => r.status === 'overdue').length)
const showSummary = computed(() => !loading.value && !loadError.value && projects.value.length > 0)

const mrvHint = computed(() => {
  if (!reminders.value.length) return 'Nothing due in the next 30 days'
  if (overdueCount.value) return `${num(overdueCount.value)} overdue`
  return 'Due soon'
})
const reminderHeadline = computed(() =>
  overdueCount.value
    ? `${num(overdueCount.value)} monitoring report(s) overdue.`
    : `${num(reminders.value.length)} monitoring report(s) due soon.`,
)
const reminderDetail = computed(() => {
  const next = reminders.value[0]
  if (!next) return ''
  return next.status === 'overdue'
    ? `"${next.title}" is ${Math.abs(next.daysUntil)} day(s) past due.`
    : `"${next.title}" is due in ${next.daysUntil} day(s).`
})

const stats = computed(() => ({
  total: projects.value.length,
  draft: projects.value.filter((p) => has(p, 'draft')).length,
  pending: projects.value.filter((p) => has(p, 'pending', 'submitted', 'in_review', 'under_review'))
    .length,
  needsRevision: projects.value.filter((p) => has(p, 'needs_revision')).length,
  approved: projects.value.filter((p) => has(p, 'approved', 'validated')).length,
  rejected: projects.value.filter((p) => has(p, 'rejected')).length,
}))

const tabs = computed(() => {
  const list = [
    { value: 'all', label: 'All', count: stats.value.total },
    // Written by ProjectForm's "Save as draft", which parks a submission
    // outside the review queue. Without this tab the counts would not sum to All.
    { value: 'draft', label: 'Draft', count: stats.value.draft },
    { value: 'pending', label: 'Pending', count: stats.value.pending },
    { value: 'needs_revision', label: 'Needs Revision', count: stats.value.needsRevision },
    { value: 'approved', label: 'Approved', count: stats.value.approved },
    { value: 'rejected', label: 'Rejected', count: stats.value.rejected },
  ]
  // Keep the toolbar clean: hide a bucket nobody is in (except All).
  return list.filter((tab) => tab.value === 'all' || tab.count > 0)
})

// Map legacy and canonical status values onto the tab buckets.
const TAB_STATUSES = {
  draft: ['draft'],
  pending: ['pending', 'submitted', 'in_review', 'under_review'],
  needs_revision: ['needs_revision'],
  approved: ['approved', 'validated'],
  rejected: ['rejected'],
}

const filteredProjects = computed(() => {
  if (activeFilter.value === 'all') return projects.value
  const allowed = TAB_STATUSES[activeFilter.value] || [activeFilter.value]
  return projects.value.filter((project) => allowed.includes(project.status))
})

/* ── Grouping + progressive disclosure ─────────────────────────────────────
 *
 * A fully expanded project card runs to roughly 600px — progress tracker,
 * description, credit strip, dates, notes, two action rows and a comment
 * thread. Rendered flat, a developer with ten projects scrolled through six
 * thousand pixels to find one of them, and the four summary tiles at the top
 * were off screen the moment they started looking.
 *
 * So: projects collapse to a one-line row, and the rows are grouped by what
 * the developer has to do about them (see groupDeveloperProjects) rather than
 * by raw status. Expanding a row renders the card exactly as before.
 */

// Closed work is reference material, not the working set.
const collapsedGroups = ref(new Set(['closed']))
// id → explicit user choice. Absent means "whatever the default rule says", so
// a project that starts needing action doesn't spring shut once it's approved.
const projectOverrides = ref({})

const projectGroups = computed(() => {
  // A status tab is already one bucket. Grouping it again would wrap the list
  // in a header that just repeats the tab the developer clicked.
  if (activeFilter.value !== 'all') {
    return [{ key: activeFilter.value, showHeader: false, items: filteredProjects.value }]
  }
  return groupDeveloperProjects(projects.value)
})

function toggleGroup(key) {
  const next = new Set(collapsedGroups.value)
  if (!next.delete(key)) next.add(key)
  collapsedGroups.value = next
}

/**
 * Expanded by default only where collapsing would hide something the developer
 * has to act on, or where there is nothing to scroll past anyway.
 */
function isExpanded(project) {
  const override = projectOverrides.value[project.id]
  if (typeof override === 'boolean') return override
  return projects.value.length === 1 || ACTION_STATUSES.includes(project.status)
}

function toggleProject(project) {
  projectOverrides.value = { ...projectOverrides.value, [project.id]: !isExpanded(project) }
}

/**
 * The one fact worth reading without expanding the card — chosen per group,
 * because "what do I need to know about this project" differs completely
 * between something awaiting your edit and something already selling credits.
 */
function rowSignal(project) {
  if (project.status === 'draft') return 'Not submitted yet'
  if (project.status === 'needs_revision') return 'Verifier asked for changes'
  if (TAB_STATUSES.pending.includes(project.status)) {
    return `Submitted ${formatDay(project.created_at)}`
  }
  if (isLive(project)) {
    const ledger = ledgerFor(project.id)
    if (ledger) return `${num(ledger.issued)} issued · ${num(ledger.inventory)} available`
    return hasActiveListing(project.id) ? 'Listed for sale' : 'No credits issued yet'
  }
  if (project.status === 'rejected') return `Reviewed ${formatDay(project.verified_at)}`
  return ''
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

/** Date only — a collapsed row has no room for a timestamp. */
function formatDay(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function statusLabel(status) {
  const labels = {
    draft: 'Draft',
    pending: 'Pending',
    submitted: 'Pending',
    in_review: 'Under Review',
    under_review: 'Under Review',
    needs_revision: 'Needs Revision',
    approved: 'Approved',
    validated: 'Approved',
    rejected: 'Rejected',
  }
  return labels[status] || status || 'Unknown'
}

// Statuses that have a `.status-badge.<name>` rule in this file's styles.
const BADGE_STYLES = ['draft', 'pending', 'needs_revision', 'approved', 'rejected']

function statusClass(status) {
  // Collapse canonical aliases onto the existing badge styles.
  if (['submitted', 'in_review', 'under_review'].includes(status)) return 'pending'
  if (status === 'validated') return 'approved'
  // Anything unmapped falls back to a real style rather than a class with no
  // rule behind it, which rendered as an unstyled, invisible badge.
  return BADGE_STYLES.includes(status) ? status : 'unknown'
}

function goToSubmitProject() {
  router.push('/submit-project')
}

function goToEdit(project) {
  // Best-effort: open the submission form for this project. The form reads an
  // optional id query when editing an existing draft.
  router.push({ path: '/submit-project', query: { id: project.id } })
}

function manageListing(project) {
  const listing = listingFor(project.id)
  if (listing) listingUnderEdit.value = listing
}

async function onListingSaved() {
  listingUnderEdit.value = null
  // Price/inventory feed both the tiles and the per-card strip, so refresh the
  // context — but not the project list, which hasn't changed.
  await loadContext()
}

async function removeProject(project) {
  if (deletingId.value) return
  const confirmed = window.confirm(
    `Delete "${project.title}"? This permanently removes the submission and cannot be undone.`,
  )
  if (!confirmed) return

  deletingId.value = project.id
  actionError.value = ''
  try {
    await projectService.deleteProject(project.id)
    projects.value = projects.value.filter((p) => p.id !== project.id)
  } catch (error) {
    console.error('Delete failed:', error)
    actionError.value = error.message || 'Failed to delete project.'
  } finally {
    deletingId.value = null
  }
}

async function submitDraft(project) {
  if (submittingId.value) return
  submittingId.value = project.id
  actionError.value = ''
  try {
    await projectApprovalService.submitDraftForReview(project.id)
    await loadProjects()
  } catch (error) {
    console.error('Draft submission failed:', error)
    // The missing-documents message names exactly what to attach, so surface it
    // verbatim rather than a generic failure.
    actionError.value = error.message || 'Failed to submit this draft for review.'
  } finally {
    submittingId.value = null
  }
}

async function resubmit(project) {
  resubmittingId.value = project.id
  // A stale error from an earlier failure used to survive a successful resubmit.
  actionError.value = ''
  try {
    await projectApprovalService.resubmitProject(project.id)
    await loadProjects()
  } catch (error) {
    console.error('Resubmit failed:', error)
    actionError.value = error.message || 'Failed to resubmit project.'
  } finally {
    resubmittingId.value = null
  }
}

async function loadProjects() {
  loading.value = true
  loadError.value = ''

  try {
    const data = await projectService.getUserProjects()
    projects.value = (data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  } catch (error) {
    console.error('Error loading developer projects:', error)
    loadError.value = error.message || 'Failed to load project submissions.'
    projects.value = []
  } finally {
    loading.value = false
  }
}

/**
 * Ledger, listings, balance and MRV deadlines. Every one of these is
 * supplementary: a failure hides a tile, it never blocks the project list, so
 * they settle independently.
 */
async function loadContext() {
  const [ledger, listings, sellerBalance, mrv] = await Promise.allSettled([
    getMyAssetLedger(),
    getMyListings(),
    getSellerBalance(),
    computeMrvReminders(),
  ])

  if (ledger.status === 'fulfilled') {
    ledgerRows.value = ledger.value.rows || []
    ledgerTotals.value = ledger.value.totals || ledgerTotals.value
  }
  if (listings.status === 'fulfilled') {
    listingsByProject.value = indexListingsByProject(listings.value)
  }
  if (sellerBalance.status === 'fulfilled') {
    balance.value = sellerBalance.value
  }
  if (mrv.status === 'fulfilled') {
    reminders.value = mrv.value || []
  }
}

async function reload() {
  await loadProjects()
  await loadContext()
}

onMounted(async () => {
  await loadProjects()
  await loadContext()
  // Raise the deduped bell notification for anything overdue. This used to run
  // only inside /monitoring, so a developer who never opened that page was
  // never told they were late for it.
  syncMrvReminderNotifications().catch(() => {})
})
</script>

<style scoped>
.developer-projects-page {
  min-height: 100vh;
  background: var(--bg-primary, #ffffff);
}

.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 2rem;
}

.page-header {
  padding: 1.25rem 0;
  /* Plain brand green. This page used to reach for --primary-dark here because
     the old #069e2d gave white description text only 3.5:1; the ramp was
     darkened app-wide on 2026-07-26 (--primary-color is now 4.78:1), so the
     one-view override is no longer needed. See tokens.css. */
  background: var(--primary-color, #058526);
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.5rem;
}

.page-description {
  color: #fff;
  margin: 0;
}

.page-content {
  padding: 2rem 0 3rem;
}

/* Banners ---------------------------------------------------------------- */
.banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  border-radius: 12px;
  padding: 0.85rem 1rem;
  margin-bottom: 1rem;
  text-decoration: none;
}

.banner p {
  margin: 0;
  flex: 1;
  font-size: 0.92rem;
}

.banner--error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
}

.banner--warn {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}

.banner--link:hover {
  border-color: #f59e0b;
}

.banner__dismiss {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  display: flex;
  padding: 0.15rem;
  border-radius: 6px;
}

.banner__dismiss:hover {
  background: rgba(185, 28, 28, 0.1);
}

.banner__chevron {
  opacity: 0.7;
}

/* Summary tiles ---------------------------------------------------------- */
.summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.summary-card {
  display: block;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
  text-decoration: none;
  transition:
    border-color 0.15s ease,
    transform 0.15s ease;
}

.summary-card:hover {
  border-color: var(--primary-color, #058526);
  transform: translateY(-1px);
}

.summary-card.urgent {
  border-color: #fbbf24;
  background: #fffbeb;
}

.summary-label {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
}

.summary-value {
  margin: 0.25rem 0 0;
  font-size: 1.8rem;
  font-weight: 700;
  color: #0f172a;
}

.summary-hint {
  margin: 0.2rem 0 0;
  /* #64748b clears 4.5:1 on white; the lighter #94a3b8 slate this started as
     measures 2.6:1 and fails AA at this size. */
  color: #64748b;
  font-size: 0.78rem;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.status-tabs {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.status-tab {
  border: 1px solid #cbd5e1;
  background: #fff;
  padding: 0.55rem 0.95rem;
  border-radius: 999px;
  cursor: pointer;
  color: #334155;
}

.status-tab.active {
  border-color: var(--primary-color, #058526);
  color: var(--primary-color, #058526);
  background: #ecfdf5;
}

.submit-btn {
  border: none;
  background: var(--primary-color, #058526);
  color: #fff;
  padding: 0.65rem 1rem;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
}

.state-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
  color: #334155;
}

.state-card.error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #b91c1c;
}

.retry-btn {
  margin-top: 0.75rem;
  border: 1px solid currentColor;
  background: none;
  color: inherit;
  padding: 0.4rem 0.9rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}

/* Grouped project list ---------------------------------------------------- */
.project-groups {
  display: grid;
  gap: 1.75rem;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.4rem 0;
  margin-bottom: 0.6rem;
  background: none;
  border: none;
  border-bottom: 1px solid #e2e8f0;
  cursor: pointer;
  text-align: left;
}

.group-caret,
.row-caret {
  font-size: 1.25rem;
  color: #64748b;
  flex-shrink: 0;
  transition: transform 0.15s ease;
}

.group-caret.open,
.row-caret.open {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  .group-caret,
  .row-caret {
    transition: none;
  }
}

.group-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}

.group-count {
  min-width: 1.5rem;
  padding: 0.05rem 0.45rem;
  border-radius: 999px;
  background: #f1f5f9;
  color: #334155;
  font-size: 0.75rem;
  font-weight: 700;
  text-align: center;
}

.group-hint {
  color: #64748b;
  font-size: 0.8rem;
  /* Explanatory only — the count and title already carry the meaning, so this
     is the first thing to go when the row runs out of room. */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-list {
  display: grid;
  gap: 0.5rem;
  list-style: none;
  margin: 0;
  padding: 0;
}

.project-row {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
}

/* The collapsed row: one line per project, so ten projects fit on a screen
   instead of one. */
.row-summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.85rem 1rem;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
}

.row-summary:hover {
  background: #f8fafc;
}

.row-summary:focus-visible {
  outline: 2px solid var(--primary-color, #058526);
  outline-offset: -2px;
}

.row-body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.row-title {
  font-size: 1rem;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-meta {
  margin-top: 0.1rem;
  color: #64748b;
  font-size: 0.8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-signal {
  color: #334155;
  font-size: 0.82rem;
  white-space: nowrap;
  flex-shrink: 0;
}

.project-card {
  background: #fff;
  border-top: 1px solid #e2e8f0;
  padding: 1.2rem;
}

@media (max-width: 640px) {
  /* Two columns of nowrap text cannot share a phone-width row; the signal is
     the one that repeats information the expanded card also carries. */
  .row-signal,
  .group-hint {
    display: none;
  }
}

.project-description {
  margin: 0.9rem 0;
  color: #334155;
}

/* Per-project credit summary -------------------------------------------- */
.credit-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
  margin: 0 0 0.9rem;
  padding: 0.75rem 0.9rem;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 10px;
}

.credit-strip div {
  min-width: 0;
}

.credit-strip dt {
  margin: 0;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  /* Small uppercase text needs the full 4.5:1, not a decorative grey. */
  color: #64748b;
}

.credit-strip dd {
  margin: 0.15rem 0 0;
  font-size: 0.98rem;
  font-weight: 600;
  color: #0f172a;
}

.listing-pill {
  display: inline-block;
  margin-left: 0.4rem;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  vertical-align: middle;
}

.listing-pill.active {
  background: #dcfce7;
  color: #166534;
}

.listing-pill.paused {
  background: #e2e8f0;
  color: #475569;
}

.project-dates {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  color: #64748b;
  font-size: 0.85rem;
}

.status-badge {
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.3rem 0.65rem;
  white-space: nowrap;
  height: fit-content;
}

.status-badge.pending {
  background: #fef3c7;
  color: #92400e;
}

.status-badge.approved {
  background: #dcfce7;
  color: #166534;
}

.status-badge.rejected {
  background: #fee2e2;
  color: #991b1b;
}

.status-badge.needs_revision {
  background: #fef3c7;
  color: #92400e;
}

.status-badge.draft {
  background: #f1f5f9;
  color: #475569;
}

/* Fallback for any status the map doesn't know — previously this class had no
   rule at all, so an unmapped status rendered as an unstyled badge. */
.status-badge.unknown {
  background: #f1f5f9;
  color: #475569;
}

.empty-hero {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 16px;
  padding: 2.5rem 1.5rem;
  text-align: center;
  max-width: 560px;
  margin: 1.5rem auto;
}
.empty-hero__icon {
  font-size: 3rem;
  color: var(--primary-color, #058526);
}
.empty-hero__title {
  margin: 0.75rem 0 0.5rem;
  font-size: 1.35rem;
  color: var(--text-primary, #111827);
}
.empty-hero__text {
  margin: 0 auto 1.25rem;
  max-width: 420px;
  color: var(--text-secondary, #4a5568);
  line-height: 1.6;
}

.notes-box {
  margin-top: 1rem;
  border-radius: 10px;
  padding: 0.9rem;
}

.notes-box h4 {
  margin: 0 0 0.4rem;
  font-size: 0.95rem;
}

.notes-box p {
  margin: 0;
}

.rejected-note {
  background: #fff1f2;
  border: 1px solid #fecdd3;
}

.approved-note {
  background: #ecfdf5;
  border: 1px solid #bbf7d0;
}

.revision-note {
  background: #fffbeb;
  border: 1px solid #fde68a;
}

/* Neutral, not a warning: an unfinished draft is a normal state, not a problem. */
.draft-note {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.revision-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
  flex-wrap: wrap;
}

.resubmit-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}

.resubmit-btn.primary {
  background: #058526;
  border-color: #058526;
  color: #fff;
}

.resubmit-btn.danger {
  border-color: #dc2626;
  color: #dc2626;
}

.resubmit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.project-actions {
  display: flex;
  gap: 1rem;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f1f5f9;
  flex-wrap: wrap;
}

.action-link {
  background: none;
  border: none;
  padding: 0;
  font-weight: 600;
  font-size: 0.85rem;
  color: #058526;
  cursor: pointer;
  text-decoration: none;
}

.action-link.danger {
  color: #dc2626;
}

.action-link:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Verifier conversation, collapsed ---------------------------------------- */
.thread-toggle {
  margin-top: 0.9rem;
  border-top: 1px solid #f1f5f9;
  padding-top: 0.75rem;
}

.thread-toggle > summary {
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
  color: #475569;
  list-style: none;
}

.thread-toggle > summary::-webkit-details-marker {
  display: none;
}

.thread-toggle > summary::before {
  content: '▸';
  display: inline-block;
  margin-right: 0.4rem;
  transition: transform 0.15s ease;
}

.thread-toggle[open] > summary::before {
  transform: rotate(90deg);
}

@media (max-width: 640px) {
  .container {
    padding: 0 1rem;
  }
  .credit-strip {
    gap: 1rem;
  }
}
</style>
