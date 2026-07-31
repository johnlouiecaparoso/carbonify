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
          <!--
            Laid out as an ordered TOP-TO-BOTTOM workflow: who → evidence →
            decision. It used to be a `display: flex` row with three children
            (identity, AML, actions), so they rendered as three columns: the
            screening button floated in the middle with no explanation, the
            notes field was squeezed until its placeholder was cut off mid-word,
            and nothing indicated what to do first. Reviewing an identity is a
            sequence, so it now reads as one.
          -->
          <div v-for="app in apps" :key="app.id" class="app-card">
            <!-- ── Who ── -->
            <header class="app-head">
              <div class="app-head-main">
                <span class="app-name">{{ app.full_name || app.applicant_name || 'Applicant' }}</span>
                <span class="status-badge" :class="badgeClass(app.status)">{{ app.status }}</span>
              </div>
              <span class="app-level">Requesting level {{ app.level_requested }}</span>
            </header>

            <dl class="app-facts">
              <div class="fact">
                <dt>Email</dt>
                <dd>{{ app.applicant_email || '—' }}</dd>
              </div>
              <div class="fact">
                <dt>Document type</dt>
                <dd>{{ app.id_document_type || 'Not stated' }}</dd>
              </div>
              <div class="fact">
                <dt>Organization</dt>
                <dd>{{ app.organization || '—' }}</dd>
              </div>
              <div class="fact">
                <dt>Submitted</dt>
                <dd>{{ formatDate(app.submitted_at) }}</dd>
              </div>
            </dl>

            <div v-if="app.review_notes" class="review-notes">
              <strong>Previous notes:</strong> {{ app.review_notes }}
            </div>

            <!-- ── Evidence, then decision. Only for applications still open. ── -->
            <div v-if="app.status === 'pending'" class="steps">
              <!-- Step 1 -->
              <section class="step">
                <h3 class="step-title"><span class="step-num">1</span> Check the ID document</h3>
                <p class="step-hint">
                  Confirm the name and photo match the application above, and that the document has
                  not expired.
                </p>
                <button
                  v-if="app.id_document_url"
                  type="button"
                  class="doc-link"
                  @click="viewing = app"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">visibility</span>
                  View ID document
                </button>
                <p v-else class="step-warn">
                  <span class="material-symbols-outlined" aria-hidden="true">warning</span>
                  No document was uploaded. There is nothing to verify this identity against.
                </p>
              </section>

              <!-- Step 2. AML screening at the point of review. Approving an
                   identity without ever checking a sanctions list is the gap
                   this closes, and the recorded 'clear' is the evidence an
                   examiner asks for. -->
              <section class="step">
                <h3 class="step-title"><span class="step-num">2</span> Screen against the watchlist</h3>
                <p class="step-hint">
                  Records the check either way — a recorded “no match” is the evidence, not just a
                  hit.
                </p>
                <div class="step-row">
                  <button
                    class="btn btn-sm btn-outline"
                    :disabled="screeningId === app.id"
                    @click="runScreening(app)"
                  >
                    {{ screeningId === app.id ? 'Screening…' : 'Run AML screening' }}
                  </button>
                  <span
                    v-if="screeningResult[app.id]"
                    class="aml-result"
                    :class="screeningResult[app.id].status"
                  >
                    {{ amlLabel(screeningResult[app.id]) }}
                  </span>
                  <span v-else class="step-todo">Not screened yet</span>
                </div>
                <p
                  v-if="screeningResult[app.id]?.status === 'potential_match'"
                  class="step-warn"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">gpp_maybe</span>
                  <span>
                    Potential sanctions/PEP match — resolve this before approving.
                    <router-link to="/admin/aml" class="aml-link">Review in AML queue</router-link>
                  </span>
                </p>
              </section>

              <!-- Step 3 -->
              <section class="step">
                <h3 class="step-title"><span class="step-num">3</span> Record your decision</h3>
                <label class="notes-label" :for="`notes-${app.id}`">
                  Review notes
                  <span class="notes-req">— required to reject (at least 5 characters)</span>
                </label>
                <textarea
                  :id="`notes-${app.id}`"
                  v-model="notesById[app.id]"
                  class="notes-input"
                  rows="2"
                  placeholder="What did you check, and what did you find?"
                ></textarea>
                <div class="action-buttons">
                  <button
                    class="btn btn-danger btn-sm"
                    @click="review(app, false)"
                    :disabled="busyId === app.id"
                  >
                    Reject
                  </button>
                  <button
                    class="btn btn-primary btn-sm"
                    @click="review(app, true)"
                    :disabled="busyId === app.id"
                  >
                    {{ busyId === app.id ? 'Saving…' : 'Approve level ' + app.level_requested }}
                  </button>
                </div>
              </section>
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

/* A COLUMN, not a row. As a row its three children became three columns —
   that is why the screening button sat marooned in the middle and the notes
   field was crushed to the point of truncating its own placeholder. */
.app-card {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.75rem;
  padding: 1.1rem 1.25rem;
  background: #fff;
}

.app-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.app-head-main {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}

.app-name {
  font-weight: 700;
  font-size: 1.02rem;
}

.app-level {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-muted, #6b7280);
  white-space: nowrap;
}

/* Labelled facts beat a run-on "·" separated line: an admin is comparing these
   against a document, so each one needs to be findable at a glance. */
.app-facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.6rem 1rem;
  margin: 0;
  padding: 0.75rem 0.9rem;
  background: var(--bg-secondary, #f8fdf8);
  border-radius: 0.5rem;
}
.fact {
  min-width: 0;
}
.fact dt {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted, #6b7280);
  font-weight: 700;
  margin-bottom: 1px;
}
.fact dd {
  margin: 0;
  font-size: 0.86rem;
  color: #111827;
  word-break: break-word;
}

/* ── The three review steps ── */
.steps {
  display: grid;
  gap: 0.7rem;
}
.step {
  border: 1px solid #e5e7eb;
  border-radius: 0.6rem;
  padding: 0.8rem 0.9rem;
}
.step-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.2rem;
  font-size: 0.9rem;
  font-weight: 700;
  color: #111827;
}
.step-num {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  background: var(--primary-color, #058526);
  color: #fff;
  font-size: 0.74rem;
  font-weight: 700;
  flex: 0 0 auto;
}
.step-hint {
  margin: 0 0 0.6rem;
  font-size: 0.79rem;
  color: var(--text-muted, #6b7280);
  line-height: 1.5;
}
.step-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}
.step-todo {
  font-size: 0.79rem;
  color: #9ca3af;
  font-style: italic;
}
.step-warn {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  margin: 0.6rem 0 0;
  padding: 0.5rem 0.65rem;
  border-radius: 0.5rem;
  background: #fffbeb;
  border: 1px solid #f59e0b;
  color: #78350f;
  font-size: 0.8rem;
  line-height: 1.5;
}
.step-warn .material-symbols-outlined {
  font-size: 18px;
  flex: 0 0 auto;
}
.notes-label {
  display: block;
  font-size: 0.79rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.3rem;
}
.notes-req {
  font-weight: 400;
  color: var(--text-muted, #6b7280);
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

.notes-input {
  width: 100%;
  padding: 8px 10px;
  border: 2px solid var(--border-color, #d1e7dd);
  border-radius: 0.5rem;
  /* 16px on mobile stops iOS zooming the page on focus. */
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  min-height: 52px;
}
.notes-input:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
  margin-top: 0.6rem;
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
  /* `.app-card { flex-direction: column }` used to live here — it was the only
     place the card was readable, because the desktop rule made three columns.
     The card is a column at every width now, so this override is gone along
     with `.app-actions`, `.aml-row` and `.app-main`, which no longer exist. */
  .app-card { padding: 0.9rem; }
  .action-buttons { flex-direction: column-reverse; }
  .action-buttons .btn { width: 100%; }
  .notes-input { font-size: 16px; }
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
