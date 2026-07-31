<template>
  <div class="kyc-review-page">
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">KYC Review</h1>
        <p class="page-description">Review and approve identity verification applications.</p>
      </div>
    </div>

    <div class="content">
      <div class="container">
        <div class="filters">
          <button
            v-for="f in filters"
            :key="f.value"
            class="filter-tab"
            :class="{ active: statusFilter === f.value }"
            @click="setFilter(f.value)"
          >
            {{ f.label }}
          </button>
          <button class="btn btn-outline btn-sm refresh" @click="load" :disabled="loading">Refresh</button>
        </div>

        <div v-if="loading" class="state">Loading…</div>
        <div v-else-if="error" class="state error">{{ error }}</div>
        <div v-else-if="apps.length === 0" class="state">No applications.</div>

        <div v-else class="app-list">
          <div v-for="app in apps" :key="app.id" class="app-card">
            <div class="app-main">
              <div class="app-head">
                <span class="app-name">{{ app.full_name || app.applicant_name || 'Applicant' }}</span>
                <span class="status-badge" :class="badgeClass(app.status)">{{ app.status }}</span>
              </div>
              <div class="app-meta">
                <span>{{ app.applicant_email }}</span>
                <span>· {{ app.id_document_type || 'No document type' }}</span>
                <span>· Level {{ app.level_requested }}</span>
                <span>· {{ formatDate(app.submitted_at) }}</span>
              </div>
              <div v-if="app.organization" class="app-org">Org: {{ app.organization }}</div>
              <!-- Was an <a href target="_blank">. `id_document_url` holds a
                   `data:` URI (KycView uploads via readAsDataURL), and browsers
                   BLOCK top-level navigation to data: URIs — hence the blank
                   tab. Rendered in-place instead, where data: URIs work fine. -->
              <button
                v-if="app.id_document_url"
                type="button"
                class="doc-link"
                @click="viewing = app"
              >
                <span class="material-symbols-outlined" aria-hidden="true">visibility</span>
                View ID document
              </button>
              <span v-else class="muted">No document uploaded</span>
              <div v-if="app.review_notes" class="review-notes">Notes: {{ app.review_notes }}</div>
            </div>

            <!-- AML screening at the point of review. Approving identity without
                 ever checking a sanctions list is the gap this closes, and the
                 recorded 'clear' is the evidence an examiner asks for. -->
            <div v-if="app.status === 'pending'" class="aml-row">
              <button
                class="btn btn-sm btn-outline"
                :disabled="screeningId === app.id"
                @click="runScreening(app)"
              >
                {{ screeningId === app.id ? 'Screening…' : 'Run AML screening' }}
              </button>
              <span v-if="screeningResult[app.id]" class="aml-result" :class="screeningResult[app.id].status">
                {{ amlLabel(screeningResult[app.id]) }}
              </span>
              <router-link v-if="screeningResult[app.id]?.status === 'potential_match'" to="/admin/aml" class="aml-link">
                Review in AML queue
              </router-link>
            </div>

            <div v-if="app.status === 'pending'" class="app-actions">
              <input
                v-model="notesById[app.id]"
                class="notes-input"
                placeholder="Review notes (optional for approve, required for reject)"
              />
              <div class="action-buttons">
                <button class="btn btn-danger btn-sm" @click="review(app, false)" :disabled="busyId === app.id">
                  Reject
                </button>
                <button class="btn btn-primary btn-sm" @click="review(app, true)" :disabled="busyId === app.id">
                  {{ busyId === app.id ? 'Saving…' : 'Approve' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <p v-if="message" class="message" :class="{ error: isError }">{{ message }}</p>
      </div>
    </div>

    <!-- In-tab document viewer. Closing it returns to the queue with scroll
         position and filters intact, which a new tab never did. -->
    <DocumentViewerModal
      v-if="viewing"
      :src="viewing.id_document_url"
      :applicant="viewing.full_name || viewing.applicant_name || ''"
      :doc-type="viewing.id_document_type || ''"
      @close="viewing = null"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { getKycApplications, reviewKycApplication } from '@/services/kycService'
import DocumentViewerModal from '@/components/admin/DocumentViewerModal.vue'

/** The application whose ID document is open in the viewer, or null. */
const viewing = ref(null)

const filters = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
]

const statusFilter = ref('pending')
const apps = ref([])
const loading = ref(false)
const error = ref('')
const message = ref('')
const isError = ref(false)
const busyId = ref(null)
const notesById = ref({})

function badgeClass(status) {
  return { pending: 'yellow', approved: 'green', rejected: 'red' }[status] || 'gray'
}
function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
function setMessage(text, err = false) {
  message.value = text
  isError.value = err
}

const screeningId = ref(null)
const screeningResult = ref({})

function amlLabel(result) {
  if (!result) return ''
  if (result.status === 'clear') return 'Screened — no match'
  if (result.status === 'potential_match') return `${result.match_count} potential match(es)`
  return result.status.replace(/_/g, ' ')
}

async function runScreening(app) {
  screeningId.value = app.id
  try {
    const { screenAndRecord } = await import('@/services/amlService')
    // Screen the name ON THE APPLICATION, not the profile: the application is
    // what is being verified, and the two can differ.
    const result = await screenAndRecord({
      userId: app.user_id,
      name: app.full_name || '',
      kycApplicationId: app.id,
    })
    screeningResult.value = { ...screeningResult.value, [app.id]: result }
    if (result.status === 'potential_match') {
      setMessage('Potential sanctions/PEP match — review before approving.', true)
    }
  } catch (err) {
    setMessage(err.message || 'Screening failed.', true)
  } finally {
    screeningId.value = null
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    apps.value = await getKycApplications(statusFilter.value || null)
  } catch (err) {
    error.value = err.message || 'Failed to load applications'
  } finally {
    loading.value = false
  }
}

function setFilter(value) {
  statusFilter.value = value
  load()
}

async function review(app, approve) {
  const notes = notesById.value[app.id] || ''
  if (!approve && notes.trim().length < 5) {
    setMessage('Please add a rejection reason (at least 5 characters).', true)
    return
  }
  busyId.value = app.id
  setMessage('')
  try {
    await reviewKycApplication(app.id, approve, notes)
    setMessage(approve ? 'Application approved.' : 'Application rejected.')
    await load()
  } catch (err) {
    setMessage(err.message || 'Failed to review application', true)
  } finally {
    busyId.value = null
  }
}

load()
</script>

<style scoped>
.kyc-review-page {
  min-height: 100vh;
  background: var(--bg-primary, #fff);
}

.container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 2rem;
}

.page-header {
  background: var(--primary-color, #058526);
  padding: 1.25rem 0;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.5rem;
}

.page-description {
  color: #fff;
  opacity: 0.95;
  margin: 0;
}

.content {
  padding: 2rem 0;
}

.filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  align-items: center;
  flex-wrap: wrap;
}

.filter-tab {
  padding: 0.4rem 0.9rem;
  border: 1px solid var(--border-color, #d1e7dd);
  background: #fff;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
}

.filter-tab.active {
  background: var(--primary-color, #058526);
  color: #fff;
  border-color: var(--primary-color, #058526);
}

.refresh {
  margin-left: auto;
}

.state {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted, #6b7280);
}

.state.error {
  color: #dc2626;
}

.app-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.app-card {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.75rem;
  padding: 1.1rem;
  background: #fff;
}

.app-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.35rem;
}

.app-name {
  font-weight: 700;
}

.app-meta {
  font-size: 0.82rem;
  color: var(--text-muted, #6b7280);
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.app-org {
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

/* Now a <button>, so it needs the browser's button chrome stripped and the
   affordances an <a> gave it for free. */
.doc-link {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-top: 0.5rem;
  padding: 6px 12px;
  background: #fff;
  border: 1px solid var(--primary-color, #058526);
  border-radius: 8px;
  color: var(--primary-color, #058526);
  font-weight: 600;
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  min-height: 36px;
}
.doc-link:hover {
  background: var(--primary-color, #058526);
  color: #fff;
}
.doc-link .material-symbols-outlined {
  font-size: 18px;
}

.muted {
  display: inline-block;
  margin-top: 0.5rem;
  color: var(--text-muted, #6b7280);
  font-size: 0.85rem;
}

.review-notes {
  margin-top: 0.5rem;
  font-size: 0.82rem;
  color: #92400e;
}

.app-actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 260px;
}

.notes-input {
  width: 100%;
  padding: 8px 10px;
  border: 2px solid var(--border-color, #d1e7dd);
  border-radius: 0.5rem;
  font-size: 13px;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.status-badge {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: capitalize;
}

.status-badge.gray { background: #e5e7eb; color: #374151; }
.status-badge.yellow { background: #fef3c7; color: #92400e; }
.status-badge.green { background: #d1fae5; color: #065f46; }
.status-badge.red { background: #fee2e2; color: #991b1b; }

.message {
  margin-top: 1rem;
  color: var(--primary-color, #058526);
  font-weight: 500;
}

.message.error {
  color: #dc2626;
}

.btn {
  padding: 0.55rem 1.1rem;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.btn-sm {
  padding: 0.4rem 0.8rem;
  font-size: 0.85rem;
}

.btn-primary {
  background: var(--primary-color, #058526);
  color: #fff;
}

.btn-outline {
  background: transparent;
  border: 1px solid var(--border-color, #d1e7dd);
  color: var(--text-primary, #111827);
}

.btn-danger {
  background: #fee2e2;
  color: #991b1b;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .container { padding: 0 1rem; }
  .app-card { flex-direction: column; }
  .app-actions { min-width: 0; }
}

.aml-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}
.aml-result {
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: #f1f5f9;
  color: #475569;
}
.aml-result.clear {
  background: #dcfce7;
  color: #166534;
}
.aml-result.potential_match {
  background: #fee2e2;
  color: #991b1b;
}
.aml-link {
  font-size: 0.8rem;
  font-weight: 600;
  color: #b91c1c;
}
</style>
