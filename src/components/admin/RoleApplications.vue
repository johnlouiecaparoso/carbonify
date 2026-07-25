<script setup>
import { computed, onMounted, ref, toRefs } from 'vue'
import {
  ROLE_APPLICATION_ERRORS,
  ROLE_APPLICATION_ROLES,
  ROLE_APPLICATION_STATUS,
  fetchRoleApplications,
  getRoleApplicationStatusLabel,
  updateRoleApplicationStatus,
} from '@/services/roleApplicationService'
import { useUserStore } from '@/store/userStore'
import { logUserAction } from '@/services/auditService'
import PageHeader from '@/components/layout/PageHeader.vue'

const props = defineProps({
  embedded: {
    type: Boolean,
    default: false,
  },
  showHeader: {
    type: Boolean,
    default: true,
  },
  roleFilter: {
    type: String,
    default: '',
  },
})

const { embedded, showHeader, roleFilter } = toRefs(props)

const userStore = useUserStore()

const loading = ref(true)
const errorMessage = ref('')
const applications = ref([])
const searchTerm = ref('')
const statusFilter = ref(ROLE_APPLICATION_STATUS.PENDING)
const selectedApplication = ref(null)
const decisionNotes = ref('')
const decisionReason = ref('')
const actionLoading = ref(false)
const feedbackMessage = ref('')
const roleAssignmentWarning = ref('')

const statusOptions = [
  { value: 'all', label: 'All statuses' },
  { value: ROLE_APPLICATION_STATUS.PENDING, label: 'Pending' },
  { value: ROLE_APPLICATION_STATUS.UNDER_REVIEW, label: 'Under Review' },
  { value: ROLE_APPLICATION_STATUS.APPROVED, label: 'Approved' },
  { value: ROLE_APPLICATION_STATUS.REJECTED, label: 'Rejected' },
]

const pendingCount = computed(
  () => applications.value.filter((app) => app.status === ROLE_APPLICATION_STATUS.PENDING).length,
)

const verifierCount = computed(
  () =>
    applications.value.filter(
      (app) =>
        app.role_requested === ROLE_APPLICATION_ROLES.VERIFIER &&
        app.status === ROLE_APPLICATION_STATUS.PENDING,
    ).length,
)

const developerCount = computed(
  () =>
    applications.value.filter(
      (app) =>
        app.role_requested === ROLE_APPLICATION_ROLES.PROJECT_DEVELOPER &&
        app.status === ROLE_APPLICATION_STATUS.PENDING,
    ).length,
)

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleString()
  } catch {
    return value
  }
}

function statusClass(status) {
  switch (status) {
    case ROLE_APPLICATION_STATUS.APPROVED:
      return 'status status--approved'
    case ROLE_APPLICATION_STATUS.REJECTED:
      return 'status status--rejected'
    case ROLE_APPLICATION_STATUS.UNDER_REVIEW:
      return 'status status--review'
    case ROLE_APPLICATION_STATUS.PENDING:
    default:
      return 'status status--pending'
  }
}

async function loadApplications() {
  loading.value = true
  errorMessage.value = ''
  try {
    const data = await fetchRoleApplications({
      status: statusFilter.value,
      search: searchTerm.value,
      roleRequested: roleFilter.value || undefined,
    })
    applications.value = data
  } catch (error) {
    console.error('Failed to load role applications:', error)
    if (error.code === ROLE_APPLICATION_ERRORS.SUPABASE_NOT_INITIALIZED) {
      errorMessage.value =
        'Supabase is not connected. Configure credentials to fetch role applications.'
    } else {
      errorMessage.value = error.message || 'Unable to load applications.'
    }
    applications.value = []
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  loadApplications()
}

function handleStatusChange(event) {
  statusFilter.value = event.target.value
  loadApplications()
}

function openApplication(application) {
  selectedApplication.value = application
  decisionNotes.value = application.admin_notes || ''
  decisionReason.value = application.decision_reason || ''
  feedbackMessage.value = ''
  roleAssignmentWarning.value = ''
}

function closeApplication() {
  selectedApplication.value = null
  decisionNotes.value = ''
  decisionReason.value = ''
  feedbackMessage.value = ''
  roleAssignmentWarning.value = ''
}

async function updateStatus(newStatus, options = {}) {
  if (!selectedApplication.value) return

  feedbackMessage.value = ''
  roleAssignmentWarning.value = ''

  const previousStatus = selectedApplication.value.status
  const applicationId = selectedApplication.value.id
  const applicantName = selectedApplication.value.applicant_full_name

  if (newStatus === ROLE_APPLICATION_STATUS.REJECTED) {
    if (!decisionReason.value || decisionReason.value.trim().length < 5) {
      feedbackMessage.value = 'Please provide a short explanation for rejecting this application.'
      return
    }
  }

  actionLoading.value = true
  try {
    const result = await updateRoleApplicationStatus(selectedApplication.value.id, newStatus, {
      adminId: userStore.session?.user?.id,
      notes: decisionNotes.value,
      decisionReason: decisionReason.value,
      assignRole: options.assignRole,
    })

    selectedApplication.value = result.application
    feedbackMessage.value =
      newStatus === ROLE_APPLICATION_STATUS.APPROVED
        ? 'Application approved.'
        : newStatus === ROLE_APPLICATION_STATUS.REJECTED
          ? 'Application rejected.'
          : 'Application status updated.'

    if (result.notificationInfo) {
      if (result.notificationInfo.sent) {
        feedbackMessage.value =
          newStatus === ROLE_APPLICATION_STATUS.APPROVED
            ? result.notificationInfo.hasAccount
              ? 'Application approved. The applicant has been notified.'
              : 'Application approved. An invitation email with sign-up instructions was sent to the applicant.'
            : feedbackMessage.value
      } else if (newStatus === ROLE_APPLICATION_STATUS.APPROVED) {
        feedbackMessage.value = 'Application approved, but the notification email could not be sent.'
      }
    }

    if (result.roleUpdateError) {
      roleAssignmentWarning.value =
        'Application approved, but automatic role assignment failed. Please assign the role manually in User Management.'
    } else if (result.roleUpdated) {
      roleAssignmentWarning.value = ''
    }

    await loadApplications()

    const actionMap = {
      [ROLE_APPLICATION_STATUS.APPROVED]: 'role_application_approved',
      [ROLE_APPLICATION_STATUS.REJECTED]: 'role_application_rejected',
      [ROLE_APPLICATION_STATUS.UNDER_REVIEW]: 'role_application_under_review',
      [ROLE_APPLICATION_STATUS.PENDING]: 'role_application_pending',
    }

    const auditAction = actionMap[newStatus] || 'role_application_updated'

    try {
      await logUserAction(
        auditAction,
        'role_application',
        userStore.session?.user?.id,
        applicationId,
        {
          applicant_name: applicantName,
          previous_status: previousStatus,
          new_status: newStatus,
          notes: decisionNotes.value || null,
          decision_reason: decisionReason.value || null,
        },
      )
    } catch (auditError) {
      console.warn('Audit log failed for role application update:', auditError)
    }
  } catch (error) {
    console.error('Failed to update application status:', error)
    feedbackMessage.value = error.message || 'Unable to update status. Please try again.'
  } finally {
    actionLoading.value = false
  }
}

function markUnderReview() {
  updateStatus(ROLE_APPLICATION_STATUS.UNDER_REVIEW)
}

function approveApplication() {
  updateStatus(ROLE_APPLICATION_STATUS.APPROVED, { assignRole: true })
}

function rejectApplication() {
  updateStatus(ROLE_APPLICATION_STATUS.REJECTED, { assignRole: false })
}

function getRoleLabel(role) {
  switch (role) {
    case ROLE_APPLICATION_ROLES.PROJECT_DEVELOPER:
      return 'Project Developer'
    case ROLE_APPLICATION_ROLES.VERIFIER:
      return 'Verifier'
    case ROLE_APPLICATION_ROLES.FARMER:
      return 'Farmer'
    default:
      return role
  }
}

function getProjectDeveloperProfile(application) {
  if (!application || application.role_requested !== ROLE_APPLICATION_ROLES.PROJECT_DEVELOPER) {
    return null
  }

  const profile = application.metadata?.additional?.project_developer_profile
  if (profile && typeof profile === 'object') {
    return profile
  }

  return null
}

function getVerifierProfile(application) {
  if (!application || application.role_requested !== ROLE_APPLICATION_ROLES.VERIFIER) {
    return null
  }

  const profile = application.metadata?.additional?.verifier_profile
  if (profile && typeof profile === 'object') {
    return profile
  }

  return null
}

onMounted(() => {
  loadApplications()
})
</script>

<template>
  <div class="role-applications" :class="{ 'role-applications--embedded': embedded }">
    <PageHeader
      v-if="showHeader"
      title="Role Applications"
      description="Review developer and verifier requests before granting access."
    >
      <template #actions>
        <div class="header-stats">
          <div class="stat">
            <span class="stat__label">Pending</span>
            <span class="stat__value">{{ pendingCount }}</span>
          </div>
          <div class="stat">
            <span class="stat__label">Pending Developers</span>
            <span class="stat__value">{{ developerCount }}</span>
          </div>
          <div class="stat">
            <span class="stat__label">Pending Verifiers</span>
            <span class="stat__value">{{ verifierCount }}</span>
          </div>
        </div>
      </template>
    </PageHeader>

    <div class="page-body">
    <section class="filters-bar">
      <input
        v-model="searchTerm"
        class="search-input"
        type="search"
        placeholder="Search by name, email, or company"
        @keyup.enter="handleSearch"
      />
      <select id="statusFilter" class="filter-select" :value="statusFilter" @change="handleStatusChange">
        <option v-for="option in statusOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </option>
      </select>
      <button class="filter-button filter-button--outline" type="button" @click="handleSearch">Search</button>
      <button class="filter-button" type="button" @click="loadApplications">Refresh</button>
    </section>

    <section class="table-section">
      <div v-if="loading" class="table-placeholder">Loading applications…</div>
      <div v-else-if="errorMessage" class="table-alert">{{ errorMessage }}</div>
      <div v-else-if="!applications.length" class="table-placeholder">No applications found.</div>
      <div v-else class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Submitted</th>
              <th>Applicant</th>
              <th>Email</th>
              <th>Role</th>
              <th>Company</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="application in applications" :key="application.id">
              <td>{{ formatDate(application.created_at) }}</td>
              <td>
                <div class="cell-main">
                  <span class="cell-main__title">{{ application.applicant_full_name }}</span>
                  <span v-if="application.website" class="cell-main__subtitle">{{ application.website }}</span>
                </div>
              </td>
              <td>{{ application.email }}</td>
              <td>{{ getRoleLabel(application.role_requested) }}</td>
              <td>{{ application.company || '—' }}</td>
              <td>
                <span :class="statusClass(application.status)">
                  {{ getRoleApplicationStatusLabel(application.status) }}
                </span>
              </td>
              <td>
                <button class="table-action" type="button" @click="openApplication(application)">
                  View
                </button>
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
            <h2>{{ selectedApplication.applicant_full_name }}</h2>
            <p>
              {{ getRoleLabel(selectedApplication.role_requested) }} · Submitted
              {{ formatDate(selectedApplication.created_at) }}
            </p>
          </div>
          <button class="drawer__close" type="button" @click="closeApplication">×</button>
        </header>

        <section class="drawer__content">
          <div class="drawer__section">
            <h3>Contact</h3>
            <ul class="details">
              <li><span>Email:</span> <a :href="`mailto:${selectedApplication.email}`">{{ selectedApplication.email }}</a></li>
              <li v-if="selectedApplication.company"><span>Company:</span> {{ selectedApplication.company }}</li>
              <li v-if="selectedApplication.website">
                <span>Website:</span>
                <a :href="selectedApplication.website" target="_blank" rel="noopener noreferrer">
                  {{ selectedApplication.website }}
                </a>
              </li>
            </ul>
          </div>

          <div
            v-if="getProjectDeveloperProfile(selectedApplication)"
            class="drawer__section"
          >
            <h3>Project Developer Application Details</h3>
            <ul class="details">
              <li><span>Company Name:</span> {{ getProjectDeveloperProfile(selectedApplication).company_name || '—' }}</li>
              <li><span>Business Registration Number:</span> {{ getProjectDeveloperProfile(selectedApplication).business_registration_number || '—' }}</li>
              <li><span>Country:</span> {{ getProjectDeveloperProfile(selectedApplication).country || '—' }}</li>
              <li><span>Address:</span> {{ getProjectDeveloperProfile(selectedApplication).address || '—' }}</li>
              <li><span>Contact Person Name:</span> {{ getProjectDeveloperProfile(selectedApplication).contact_person?.name || '—' }}</li>
              <li><span>Contact Person Email:</span> {{ getProjectDeveloperProfile(selectedApplication).contact_person?.email || '—' }}</li>
              <li><span>Contact Person Phone:</span> {{ getProjectDeveloperProfile(selectedApplication).contact_person?.phone || '—' }}</li>
              <li><span>Certificate of Registration:</span> {{ getProjectDeveloperProfile(selectedApplication).legal_documents?.certificate_of_registration || '—' }}</li>
              <li><span>Articles / Business Permit:</span> {{ getProjectDeveloperProfile(selectedApplication).legal_documents?.articles_of_incorporation_or_business_permit || '—' }}</li>
              <li><span>TIN:</span> {{ getProjectDeveloperProfile(selectedApplication).legal_documents?.tin || '—' }}</li>
              <li><span>Proof of Legal Existence:</span> {{ getProjectDeveloperProfile(selectedApplication).legal_documents?.proof_of_legal_existence || '—' }}</li>
              <li><span>Company Background:</span> {{ getProjectDeveloperProfile(selectedApplication).business_profile?.company_background || '—' }}</li>
              <li><span>Years of Operation:</span> {{ getProjectDeveloperProfile(selectedApplication).business_profile?.years_of_operation || '—' }}</li>
              <li><span>Past/Ongoing Environmental Projects:</span> {{ getProjectDeveloperProfile(selectedApplication).business_profile?.past_or_ongoing_environmental_projects || '—' }}</li>
              <li><span>Portfolio:</span> {{ getProjectDeveloperProfile(selectedApplication).business_profile?.portfolio || '—' }}</li>
            </ul>
          </div>

          <div v-if="getVerifierProfile(selectedApplication)" class="drawer__section">
            <h3>Verifier Application Details</h3>
            <ul class="details">
              <li><span>Organization / Firm:</span> {{ getVerifierProfile(selectedApplication).organization || '—' }}</li>
              <li><span>Accreditation Body:</span> {{ getVerifierProfile(selectedApplication).accreditation_body || '—' }}</li>
              <li><span>Accreditation Number:</span> {{ getVerifierProfile(selectedApplication).accreditation_number || '—' }}</li>
              <li><span>Years of Verification Experience:</span> {{ getVerifierProfile(selectedApplication).years_of_verification_experience || '—' }}</li>
              <li><span>Verification Specializations:</span> {{ getVerifierProfile(selectedApplication).verification_specializations || '—' }}</li>
              <li><span>Past/Ongoing Verification Projects:</span> {{ getVerifierProfile(selectedApplication).past_or_ongoing_verification_projects || '—' }}</li>
              <li><span>Contact Phone:</span> {{ getVerifierProfile(selectedApplication).contact_phone || '—' }}</li>
            </ul>
          </div>

          <div class="drawer__section">
            <h3>Experience</h3>
            <p class="drawer__text">
              {{ selectedApplication.experience_summary || 'Not provided.' }}
            </p>
          </div>

          <div class="drawer__section">
            <h3>Motivation</h3>
            <p class="drawer__text">
              {{ selectedApplication.motivation || 'Not provided.' }}
            </p>
          </div>

          <div class="drawer__section" v-if="selectedApplication.supporting_documents">
            <h3>Supporting Links</h3>
            <p class="drawer__text">
              {{ selectedApplication.supporting_documents }}
            </p>
          </div>

          <div class="drawer__section">
            <h3>Admin Notes</h3>
            <textarea
              v-model="decisionNotes"
              class="drawer__textarea"
              placeholder="Internal notes for the Carbonify admin team."
            ></textarea>
          </div>

          <div class="drawer__section">
            <h3>Decision Reason</h3>
            <textarea
              v-model="decisionReason"
              class="drawer__textarea"
              placeholder="Explain your decision for audit purposes."
            ></textarea>
          </div>

          <div v-if="feedbackMessage" class="drawer__alert">
            {{ feedbackMessage }}
          </div>
          <div v-if="roleAssignmentWarning" class="drawer__alert drawer__alert--warn">
            {{ roleAssignmentWarning }}
          </div>
        </section>

        <footer class="drawer__actions">
          <button
            class="btn btn--ghost"
            type="button"
            :disabled="actionLoading"
            @click="markUnderReview"
          >
            Mark Under Review
          </button>
          <button
            class="btn btn--secondary"
            type="button"
            :disabled="actionLoading"
            @click="rejectApplication"
          >
            Reject
          </button>
          <button
            class="btn btn--primary"
            type="button"
            :disabled="actionLoading"
            @click="approveApplication"
          >
            <span v-if="actionLoading" class="btn__spinner" aria-hidden="true"></span>
            Approve &amp; Assign Role
          </button>
        </footer>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.role-applications {
  min-height: 100vh;
  background: var(--bg-secondary, #f5fbf7);
}

.page-body {
  padding: 2rem 1.5rem 4rem;
}

.role-applications--embedded {
  min-height: auto;
  background: transparent;
}

/* Embedded (inside the Admin Dashboard) renders no PageHeader and no padding —
   the dashboard card already provides the frame. */
.role-applications--embedded .page-body {
  padding: 0;
}

.role-applications--embedded .filters-bar,
.role-applications--embedded .table-section {
  box-shadow: none;
}

.role-applications--embedded .filters-bar {
  margin-bottom: 1.5rem;
}

.header-stats {
  display: flex;
  gap: 1rem;
}

.stat {
  background: #fff;
  border-radius: 16px;
  padding: 1rem 1.25rem;
  min-width: 150px;
  box-shadow: 0 12px 20px rgba(6, 158, 45, 0.12);
  border: 1px solid rgba(6, 158, 45, 0.1);
}

.stat__label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-muted, #4b5d52);
}

.stat__value {
  display: block;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--primary-color, #069e2d);
}

.filters-bar {
  background: #fff;
  border-radius: 20px;
  border: 1px solid rgba(6, 158, 45, 0.12);
  box-shadow: 0 10px 20px rgba(6, 158, 45, 0.1);
  padding: 1.5rem;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.search-input,
.filter-select {
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
  background: #fff;
}

.search-input {
  flex: 2;
  min-width: 240px;
}

.filter-select {
  min-width: 180px;
}

.filter-button {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  border: none;
  background: var(--primary-color, #069e2d);
  color: white;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s ease;
  box-shadow: 0 4px 12px rgba(6, 158, 45, 0.16);
}

.filter-button:hover {
  background: var(--primary-hover, #058e3f);
}

.filter-button--outline {
  background: #f8f9fa;
  color: var(--primary-color, #069e2d);
  border: 1px solid var(--primary-color, #069e2d);
  box-shadow: none;
}

.filter-button--outline:hover {
  background: rgba(6, 158, 45, 0.12);
}

.table-section {
  background: #fff;
  border-radius: 20px;
  border: 1px solid rgba(6, 158, 45, 0.12);
  box-shadow: 0 12px 24px rgba(6, 158, 45, 0.12);
  padding: 1.5rem;
}

.table-wrapper {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

thead {
  background: rgba(6, 158, 45, 0.08);
}

th,
td {
  text-align: left;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid rgba(6, 158, 45, 0.12);
}

th {
  font-weight: 700;
  color: var(--text-primary, #102616);
  font-size: 0.9rem;
}

tbody tr:hover {
  background: rgba(6, 158, 45, 0.04);
}

.cell-main {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.cell-main__title {
  font-weight: 600;
  color: var(--text-primary, #102616);
}

.cell-main__subtitle {
  font-size: 0.85rem;
  color: var(--text-muted, #4b5d52);
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.status--pending {
  background: rgba(255, 193, 7, 0.15);
  color: #a36b00;
}

.status--review {
  background: rgba(59, 130, 246, 0.15);
  color: #1e3a8a;
}

.status--approved {
  background: rgba(16, 185, 129, 0.18);
  color: #0f5132;
}

.status--rejected {
  background: rgba(248, 113, 113, 0.18);
  color: #991b1b;
}

.table-placeholder,
.table-alert {
  padding: 2rem;
  text-align: center;
  color: var(--text-muted, #4b5d52);
  font-weight: 600;
}

.table-alert {
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.24);
  border-radius: 12px;
}

.table-action {
  padding: 0.5rem 1rem;
  border-radius: 999px;
  border: 1px solid rgba(6, 158, 45, 0.25);
  background: transparent;
  cursor: pointer;
  font-weight: 600;
  transition: background 0.2s ease, transform 0.2s ease;
}

.table-action:hover {
  background: rgba(6, 158, 45, 0.08);
  transform: translateY(-1px);
}

.drawer {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: flex-end;
  z-index: 1000;
}

.drawer__overlay {
  flex: 1;
  background: rgba(16, 24, 16, 0.25);
}

.drawer__panel {
  width: 420px;
  max-width: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  box-shadow: -12px 0 30px rgba(16, 24, 16, 0.15);
}

.drawer__header {
  padding: 1.5rem;
  border-bottom: 1px solid rgba(6, 158, 45, 0.12);
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}

.drawer__header h2 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 700;
}

.drawer__header p {
  margin: 0.35rem 0 0;
  color: var(--text-muted, #4b5d52);
  font-size: 0.9rem;
}

.drawer__close {
  background: none;
  border: none;
  font-size: 1.75rem;
  cursor: pointer;
  line-height: 1;
}

.drawer__content {
  padding: 1.5rem;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.drawer__section h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
  font-weight: 700;
}

.details {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: var(--text-primary, #102616);
}

.details span {
  font-weight: 600;
  margin-right: 0.5rem;
}

.drawer__text {
  margin: 0;
  line-height: 1.6;
  color: var(--text-muted, #3d4a40);
  white-space: pre-line;
}

.drawer__textarea {
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(6, 158, 45, 0.2);
  padding: 0.75rem 1rem;
  min-height: 120px;
  resize: vertical;
  background: #f9fffb;
}

.drawer__textarea:focus {
  outline: none;
  border-color: var(--primary-color, #069e2d);
  box-shadow: 0 0 0 3px rgba(6, 158, 45, 0.18);
}

.drawer__alert {
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.25);
  color: #065f46;
  font-weight: 600;
}

.drawer__alert--warn {
  background: rgba(255, 193, 7, 0.15);
  border-color: rgba(255, 193, 7, 0.3);
  color: #8a6d1f;
}

.drawer__actions {
  padding: 1.5rem;
  border-top: 1px solid rgba(6, 158, 45, 0.12);
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 999px;
  padding: 0.75rem 1.5rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.btn--primary {
  background: linear-gradient(135deg, var(--primary-color, #069e2d) 0%, #058e3f 100%);
  color: #fff;
  box-shadow: 0 12px 18px rgba(6, 158, 45, 0.2);
}

.btn--secondary {
  background: rgba(248, 113, 113, 0.15);
  color: #7f1d1d;
}

.btn--ghost {
  background: rgba(6, 158, 45, 0.1);
  color: var(--primary-color, #069e2d);
}

.btn--primary:hover,
.btn--secondary:hover,
.btn--ghost:hover {
  transform: translateY(-2px);
}

.btn:disabled {
  opacity: 0.75;
  cursor: wait;
  transform: none;
}

.btn__spinner {
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.6);
  border-top-color: rgba(255, 255, 255, 1);
  animation: spin 0.8s linear infinite;
}

.btn--ghost,
.btn--secondary {
  border: none;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1024px) {
  .header-stats {
    flex-wrap: wrap;
  }
}

@media (max-width: 768px) {
  .filters-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .search-input,
  .filter-select {
    width: 100%;
  }

  .filter-button,
  .filter-button--outline {
    width: 100%;
  }

  .drawer__panel {
    width: 100%;
  }
}

@media (max-width: 540px) {
  .table-section {
    padding: 1rem;
  }

  th,
  td {
    padding: 0.75rem;
  }

  .filters-bar {
    gap: 0.75rem;
  }
}
</style>
