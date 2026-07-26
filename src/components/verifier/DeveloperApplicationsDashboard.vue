<script setup>
import { onMounted, ref } from 'vue'
import {
  ROLE_APPLICATION_ROLES,
  ROLE_APPLICATION_STATUS,
  ROLE_APPLICATION_ERRORS,
  fetchRoleApplications,
  getRoleApplicationStatusLabel,
  updateRoleApplicationStatus,
} from '@/services/roleApplicationService'
import { useUserStore } from '@/store/userStore'

const userStore = useUserStore()

const loading = ref(true)
const actionLoading = ref(false)
const errorMessage = ref('')
const feedbackMessage = ref('')
const applications = ref([])
const selectedApplication = ref(null)
const decisionNotes = ref('')
const statusFilter = ref(ROLE_APPLICATION_STATUS.PENDING)
const decisionCard = ref(null)

const statusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: ROLE_APPLICATION_STATUS.PENDING, label: 'Pending' },
  { value: ROLE_APPLICATION_STATUS.UNDER_REVIEW, label: 'Under Review' },
  { value: ROLE_APPLICATION_STATUS.APPROVED, label: 'Approved' },
  { value: ROLE_APPLICATION_STATUS.REJECTED, label: 'Rejected' },
]

/**
 * Outstanding applications, independent of the current filter.
 *
 * This used to count PENDING rows inside `applications`, which the server has
 * already filtered by `statusFilter` — so switching the filter to Approved or
 * Rejected made the header read "Pending: 0" no matter how big the real backlog
 * was. It is a workload indicator, so it has to be counted separately.
 */
const pendingCount = ref(0)

async function refreshPendingCount() {
  try {
    const pending = await fetchRoleApplications({
      status: ROLE_APPLICATION_STATUS.PENDING,
      roleRequested: ROLE_APPLICATION_ROLES.PROJECT_DEVELOPER,
    })
    pendingCount.value = pending.length
  } catch {
    // A backlog badge is never worth breaking the page over.
  }
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function statusClass(status) {
  return `status status--${status || 'pending'}`
}

function projectDeveloperProfile(application) {
  return application?.metadata?.additional?.project_developer_profile || null
}

async function loadApplications() {
  loading.value = true
  errorMessage.value = ''

  try {
    applications.value = await fetchRoleApplications({
      status: statusFilter.value,
      roleRequested: ROLE_APPLICATION_ROLES.PROJECT_DEVELOPER,
    })
  } catch (error) {
    console.error('Failed to load project developer applications:', error)
    if (error.code === ROLE_APPLICATION_ERRORS.SUPABASE_NOT_INITIALIZED) {
      errorMessage.value = 'Supabase is not connected. Configure credentials first.'
    } else {
      errorMessage.value = error.message || 'Unable to load applications.'
    }
    applications.value = []
  } finally {
    loading.value = false
  }
}

function openApplication(application) {
  selectedApplication.value = application
  decisionNotes.value = application.admin_notes || application.decision_reason || ''
  feedbackMessage.value = ''
}

function closeApplication() {
  selectedApplication.value = null
  decisionNotes.value = ''
  feedbackMessage.value = ''
}

function clearDecisionCard() {
  decisionCard.value = null
}

function buildDecisionCard(application, status) {
  const roleLabel =
    application?.role_requested === ROLE_APPLICATION_ROLES.PROJECT_DEVELOPER
      ? 'Project Developer account'
      : 'Applicant account'

  if (status === ROLE_APPLICATION_STATUS.APPROVED) {
    return {
      tone: 'approved',
      title: 'Account Approved',
      message: `${application?.applicant_full_name || 'The applicant'} has been approved as a ${roleLabel}.`,
    }
  }

  if (status === ROLE_APPLICATION_STATUS.REJECTED) {
    return {
      tone: 'rejected',
      title: 'Account Rejected',
      message: `${application?.applicant_full_name || 'The applicant'} has been rejected for the ${roleLabel} request.`,
    }
  }

  return {
    tone: 'review',
    title: 'Application Updated',
    message: `${application?.applicant_full_name || 'The applicant'} has been marked under review.`,
  }
}

async function updateStatus(newStatus) {
  if (!selectedApplication.value) return

  if (newStatus === ROLE_APPLICATION_STATUS.REJECTED) {
    if (!decisionNotes.value || decisionNotes.value.trim().length < 5) {
      feedbackMessage.value = 'Please provide a reason before rejecting.'
      return
    }
  }

  actionLoading.value = true
  feedbackMessage.value = ''

  try {
    const result = await updateRoleApplicationStatus(selectedApplication.value.id, newStatus, {
      adminId: userStore.session?.user?.id,
      notes: decisionNotes.value,
      decisionReason: decisionNotes.value,
      assignRole: newStatus === ROLE_APPLICATION_STATUS.APPROVED,
    })

    selectedApplication.value = result.application

    if (newStatus === ROLE_APPLICATION_STATUS.APPROVED) {
      feedbackMessage.value = 'Application approved.'
    } else if (newStatus === ROLE_APPLICATION_STATUS.REJECTED) {
      feedbackMessage.value = 'Application rejected.'
    } else {
      feedbackMessage.value = 'Application marked under review.'
    }

    decisionCard.value = buildDecisionCard(result.application, newStatus)
  } catch (error) {
    console.error('Failed to update application status:', error)
    feedbackMessage.value = error.message || 'Unable to update application status.'
    actionLoading.value = false
    return
  }

  // Refreshing the list is NOT part of the decision, and must not be reported as
  // if it were. This used to sit inside the try above, so a failed refresh —
  // after the role had already been assigned — overwrote "Application approved."
  // with "Unable to update application status." The verifier would then retry a
  // decision that had in fact committed.
  try {
    await Promise.all([loadApplications(), refreshPendingCount()])
  } catch (refreshError) {
    console.error('Decision saved, but refreshing the queue failed:', refreshError)
    feedbackMessage.value += ' (The list below may be out of date — refresh to update it.)'
  } finally {
    actionLoading.value = false
  }
}

onMounted(() => {
  loadApplications()
  refreshPendingCount()
})
</script>

<template>
  <div class="developer-applications-dashboard">
    <header class="dashboard-header">
      <div>
        <h2>Project Developer Applicants</h2>
        <p>Review and verify applicants applying as Project Developer.</p>
      </div>
      <div class="header-stats">
        <span class="header-stat">Pending: {{ pendingCount }}</span>
      </div>
    </header>

    <section class="filters">
      <select v-model="statusFilter" class="filter-select" @change="loadApplications">
        <option v-for="option in statusOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <button class="refresh-btn" type="button" @click="loadApplications">Refresh</button>
    </section>

    <section class="content-card">
      <div v-if="decisionCard" :class="['decision-card', `decision-card--${decisionCard.tone}`]">
        <div>
          <strong>{{ decisionCard.title }}</strong>
          <p>{{ decisionCard.message }}</p>
        </div>
        <button class="decision-card__close" type="button" @click="clearDecisionCard">×</button>
      </div>

      <div v-if="loading" class="placeholder">Loading applications…</div>
      <div v-else-if="errorMessage" class="placeholder error">{{ errorMessage }}</div>
      <div v-else-if="!applications.length" class="placeholder">No applications found.</div>
      <div v-else class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Submitted</th>
              <th>Applicant</th>
              <th>Email</th>
              <th>Company</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="application in applications" :key="application.id">
              <td>{{ formatDate(application.created_at) }}</td>
              <td>{{ application.applicant_full_name }}</td>
              <td>{{ application.email }}</td>
              <td>{{ application.company || '—' }}</td>
              <td>
                <span :class="statusClass(application.status)">
                  {{ getRoleApplicationStatusLabel(application.status) }}
                </span>
              </td>
              <td>
                <button class="view-btn" type="button" @click="openApplication(application)">View</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="selectedApplication" class="drawer">
      <div class="drawer__overlay" @click="closeApplication"></div>
      <div class="drawer__panel">
        <header class="drawer__header">
          <div>
            <h3>{{ selectedApplication.applicant_full_name }}</h3>
            <p>Submitted {{ formatDate(selectedApplication.created_at) }}</p>
          </div>
          <button class="drawer__close" type="button" @click="closeApplication">×</button>
        </header>

        <section class="drawer__content">
          <div class="drawer__section">
            <h4>Contact</h4>
            <ul class="details">
              <li><span>Email:</span> {{ selectedApplication.email }}</li>
              <li><span>Company:</span> {{ selectedApplication.company || '—' }}</li>
              <li><span>Website:</span> {{ selectedApplication.website || '—' }}</li>
            </ul>
          </div>

          <div v-if="projectDeveloperProfile(selectedApplication)" class="drawer__section">
            <h4>Project Developer Details</h4>
            <ul class="details">
              <li><span>Business Registration:</span> {{ projectDeveloperProfile(selectedApplication).business_registration_number || '—' }}</li>
              <li><span>Country:</span> {{ projectDeveloperProfile(selectedApplication).country || '—' }}</li>
              <li><span>Address:</span> {{ projectDeveloperProfile(selectedApplication).address || '—' }}</li>
              <li><span>Contact Person:</span> {{ projectDeveloperProfile(selectedApplication).contact_person?.name || '—' }}</li>
              <li><span>Contact Email:</span> {{ projectDeveloperProfile(selectedApplication).contact_person?.email || '—' }}</li>
              <li><span>Contact Phone:</span> {{ projectDeveloperProfile(selectedApplication).contact_person?.phone || '—' }}</li>
              <li><span>TIN:</span> {{ projectDeveloperProfile(selectedApplication).legal_documents?.tin || '—' }}</li>
              <li><span>Company Background:</span> {{ projectDeveloperProfile(selectedApplication).business_profile?.company_background || '—' }}</li>
              <li><span>Years of Operation:</span> {{ projectDeveloperProfile(selectedApplication).business_profile?.years_of_operation || '—' }}</li>
              <li><span>Portfolio:</span> {{ projectDeveloperProfile(selectedApplication).business_profile?.portfolio || '—' }}</li>
            </ul>
          </div>

          <div class="drawer__section">
            <h4>Verifier Notes</h4>
            <textarea
              v-model="decisionNotes"
              class="textarea"
              placeholder="Use this single field for internal notes or the rejection reason."
            ></textarea>
          </div>

          <div v-if="feedbackMessage" class="feedback">{{ feedbackMessage }}</div>
        </section>

        <footer class="drawer__actions">
          <button class="btn ghost" type="button" :disabled="actionLoading" @click="updateStatus(ROLE_APPLICATION_STATUS.UNDER_REVIEW)">
            Mark Under Review
          </button>
          <button class="btn reject" type="button" :disabled="actionLoading" @click="updateStatus(ROLE_APPLICATION_STATUS.REJECTED)">
            Reject
          </button>
          <button class="btn approve" type="button" :disabled="actionLoading" @click="updateStatus(ROLE_APPLICATION_STATUS.APPROVED)">
            Approve & Assign Role
          </button>
        </footer>
      </div>
    </div>
  </div>
</template>

<style scoped>
.developer-applications-dashboard {
  background: #fff;
  border-radius: 14px;
  border: 1px solid #e2e8f0;
  padding: 1.25rem;
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: start;
  margin-bottom: 1rem;
}

.dashboard-header h2 {
  margin: 0;
  color: #0f172a;
}

.dashboard-header p {
  margin: 0.4rem 0 0;
  color: #64748b;
}

.header-stat {
  display: inline-block;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 0.4rem 0.7rem;
  font-weight: 600;
  color: #0f172a;
}

.filters {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.filter-select,
.refresh-btn {
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 0.55rem 0.8rem;
  background: #fff;
}

.refresh-btn {
  cursor: pointer;
}

.content-card {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  overflow: hidden;
}

.decision-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem 1.2rem;
  border-bottom: 1px solid #e2e8f0;
}

.decision-card strong {
  display: block;
  margin-bottom: 0.25rem;
}

.decision-card p {
  margin: 0;
  color: inherit;
}

.decision-card--approved {
  background: #ecfdf3;
  color: #166534;
}

.decision-card--rejected {
  background: #fef2f2;
  color: #991b1b;
}

.decision-card--review {
  background: #eff6ff;
  color: #1d4ed8;
}

.decision-card__close {
  border: none;
  background: transparent;
  color: inherit;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
}

.placeholder {
  padding: 1.2rem;
  color: #475569;
}

.placeholder.error {
  color: #b91c1c;
  background: #fef2f2;
}

.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
  padding: 0.8rem;
}

th {
  font-size: 0.85rem;
  color: #64748b;
}

.status {
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.25rem 0.55rem;
}

.status--pending {
  background: #fef3c7;
  color: #92400e;
}

.status--under_review {
  background: #e0f2fe;
  color: #075985;
}

.status--approved {
  background: #dcfce7;
  color: #166534;
}

.status--rejected {
  background: #fee2e2;
  color: #991b1b;
}

.view-btn {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
}

.drawer {
  position: fixed;
  inset: 0;
  z-index: 80;
}

.drawer__overlay {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
}

.drawer__panel {
  position: absolute;
  right: 0;
  top: 0;
  height: 100%;
  width: min(720px, 100%);
  background: #fff;
  display: flex;
  flex-direction: column;
}

.drawer__header,
.drawer__actions {
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e2e8f0;
}

.drawer__header {
  display: flex;
  justify-content: space-between;
  align-items: start;
  gap: 1rem;
}

.drawer__header h3 {
  margin: 0;
}

.drawer__header p {
  margin: 0.35rem 0 0;
  color: #64748b;
}

.drawer__close {
  border: none;
  background: transparent;
  font-size: 1.5rem;
  cursor: pointer;
}

.drawer__content {
  padding: 1rem 1.25rem;
  overflow: auto;
  display: grid;
  gap: 1rem;
}

.drawer__section h4 {
  margin: 0 0 0.5rem;
}

.details {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.4rem;
}

.details li {
  color: #334155;
}

.details span {
  color: #64748b;
  font-weight: 600;
  margin-right: 0.35rem;
}

.textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 0.65rem;
  min-height: 90px;
  resize: vertical;
}

.feedback {
  border-radius: 10px;
  border: 1px solid #bfdbfe;
  background: #eff6ff;
  color: #1d4ed8;
  padding: 0.7rem;
}

.drawer__actions {
  display: flex;
  gap: 0.65rem;
  justify-content: flex-end;
  border-bottom: none;
  border-top: 1px solid #e2e8f0;
}

.btn {
  border-radius: 10px;
  border: 1px solid transparent;
  padding: 0.5rem 0.85rem;
  cursor: pointer;
  font-weight: 600;
}

.btn.ghost {
  border-color: #cbd5e1;
  background: #fff;
}

.btn.reject {
  background: #fee2e2;
  color: #991b1b;
}

.btn.approve {
  background: #16a34a;
  color: #fff;
}
</style>
