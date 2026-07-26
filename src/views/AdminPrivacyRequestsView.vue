<template>
  <div class="privacy-admin">
    <PageHeader
      title="Data Privacy Requests"
      description="Access, export and erasure requests raised by users under the Data Privacy Act."
    >
      <template #actions>
        <button class="btn-ghost" :disabled="loading" @click="load">Refresh</button>
      </template>
    </PageHeader>

    <div class="page-body">

    <!-- The erasure worker holds the service role and is secret-gated, so this
         console cannot delete an account itself. Saying so beats a button that
         does not do what it implies. -->
    <div class="notice">
      <span class="material-symbols-outlined" aria-hidden="true">info</span>
      <div>
        <strong>This console triages requests; it does not erase data.</strong>
        Erasure runs in the <code>account-deletion</code> worker, which holds the service
        role and is gated by a shared secret a browser must never carry. Mark a deletion
        <em>completed</em> only once that worker has run.
      </div>
    </div>

    <section class="cards">
      <div class="card">
        <div class="card-label">Awaiting triage</div>
        <div class="card-value">{{ summary.pending }}</div>
      </div>
      <div class="card">
        <div class="card-label">In progress</div>
        <div class="card-value">{{ summary.inProgress }}</div>
      </div>
      <div class="card">
        <div class="card-label">Open erasures</div>
        <div class="card-value">{{ summary.deletions }}</div>
      </div>
      <div class="card" :class="{ urgent: summary.overdue > 0 }">
        <div class="card-label">Open over 30 days</div>
        <div class="card-value">{{ summary.overdue }}</div>
      </div>
    </section>

    <div class="toolbar">
      <label v-for="opt in statusOptions" :key="opt.value" class="filter-chip">
        <input v-model="statusFilter" type="radio" :value="opt.value" @change="load" />
        <span>{{ opt.label }}</span>
      </label>
    </div>

    <div v-if="loading" class="state">Loading…</div>
    <div v-else-if="!requests.length" class="state">No requests in this view.</div>

    <div v-else class="table-scroll">
      <table class="data-table stack-on-mobile">
        <thead>
          <tr>
            <th>Requested</th>
            <th>Type</th>
            <th>Requester</th>
            <th>Status</th>
            <th>Reason / notes</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in requests" :key="r.id" :class="{ overdue: isOverdue(r) }">
            <td data-label="Requested">
              {{ shortDate(r.created_at) }}
              <div v-if="isOverdue(r)" class="age-flag">{{ ageDays(r) }} days open</div>
            </td>
            <td data-label="Type">
              <span class="pill" :class="r.request_type">{{ r.request_type }}</span>
            </td>
            <td data-label="Requester">
              {{ r.requester_name || 'Unknown user' }}
              <div class="muted small">{{ r.requester_email || r.user_id }}</div>
            </td>
            <td data-label="Status">
              <span class="pill" :class="r.status">{{ r.status.replace('_', ' ') }}</span>
              <div v-if="r.processed_at" class="muted small">{{ shortDate(r.processed_at) }}</div>
            </td>
            <td data-label="Reason / notes">
              <div v-if="r.reason" class="muted small"><strong>Said:</strong> {{ r.reason }}</div>
              <div v-if="r.notes" class="muted small"><strong>Notes:</strong> {{ r.notes }}</div>
              <span v-if="!r.reason && !r.notes" class="muted">—</span>
            </td>
            <td data-label="Action">
              <div v-if="isOpen(r)" class="row-actions">
                <input
                  v-model="noteDraft[r.id]"
                  class="note-input"
                  placeholder="Processing note"
                  :disabled="busyId === r.id"
                />
                <button
                  v-if="r.status === 'pending'"
                  class="act"
                  :disabled="busyId === r.id"
                  @click="act(r, 'in_progress')"
                >
                  Start
                </button>
                <button class="act primary" :disabled="busyId === r.id" @click="act(r, 'completed')">
                  Complete
                </button>
                <button class="act danger" :disabled="busyId === r.id" @click="act(r, 'rejected')">
                  Reject
                </button>
              </div>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="message" class="message" :class="{ error: isError }">{{ message }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import {
  listDataSubjectRequests,
  processDataSubjectRequest,
  summariseDataRequests,
  DSR_OPEN_STATUSES,
} from '@/services/dataPrivacyService'

const requests = ref([])
const loading = ref(false)
const busyId = ref(null)
const message = ref('')
const isError = ref(false)
const statusFilter = ref('open')
const noteDraft = ref({})

const statusOptions = [
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Withdrawn' },
  { value: 'all', label: 'All' },
]

const summary = computed(() => summariseDataRequests(requests.value))

const isOpen = (r) => DSR_OPEN_STATUSES.includes(r.status)

function ageDays(r) {
  if (!r?.created_at) return 0
  return Math.floor((Date.now() - new Date(r.created_at).getTime()) / 86400000)
}
function isOverdue(r) {
  return isOpen(r) && ageDays(r) > 30
}
function shortDate(value) {
  return value ? new Date(value).toLocaleString() : '—'
}

async function load() {
  loading.value = true
  message.value = ''
  try {
    requests.value = await listDataSubjectRequests({ status: statusFilter.value })
  } catch (err) {
    message.value = err?.message || 'Could not load requests.'
    isError.value = true
  } finally {
    loading.value = false
  }
}

async function act(request, status) {
  busyId.value = request.id
  message.value = ''
  isError.value = false
  try {
    await processDataSubjectRequest(request.id, status, noteDraft.value[request.id] || '')
    delete noteDraft.value[request.id]
    message.value = `Request marked ${status.replace('_', ' ')}.`
    await load()
  } catch (err) {
    // The RPC refuses a rejection with no reason, and refuses to reopen a
    // withdrawn or completed request — surface those verbatim.
    message.value = err?.message || 'Could not update the request.'
    isError.value = true
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.privacy-admin {
  min-height: 100vh;
  background: var(--bg-secondary, #f8fdf8);
}

.page-body {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 16px;
}


.btn-ghost {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 8px;
  padding: 0.45rem 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.notice {
  display: flex;
  gap: 0.6rem;
  align-items: flex-start;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  border-radius: 10px;
  padding: 0.75rem 0.9rem;
  margin-bottom: 1.25rem;
  font-size: 0.86rem;
  line-height: 1.5;
}
.notice code {
  background: rgba(30, 64, 175, 0.1);
  padding: 0 0.25rem;
  border-radius: 4px;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 1rem;
  margin-bottom: 1.25rem;
}
.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
}
.card.urgent {
  border-color: #fbbf24;
  background: #fffbeb;
}
.card-label {
  color: #64748b;
  font-size: 0.85rem;
}
.card-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: #0f172a;
  margin-top: 0.2rem;
}

.toolbar {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  padding: 0.35rem 0.8rem;
  font-size: 0.85rem;
  color: #334155;
  cursor: pointer;
}
.filter-chip:has(input:checked) {
  border-color: var(--primary-color, #058526);
  background: #ecfdf5;
  color: var(--primary-color, #058526);
  font-weight: 600;
}

.state {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
  color: #334155;
}

.table-scroll {
  width: 100%;
  overflow-x: auto;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.88rem;
  background: #fff;
}
.data-table th,
.data-table td {
  text-align: left;
  padding: 0.6rem 0.7rem;
  border-bottom: 1px solid #f1f5f9;
  vertical-align: top;
}
.data-table tr.overdue td {
  background: #fffbeb;
}

.age-flag {
  font-size: 0.72rem;
  font-weight: 700;
  color: #92400e;
}

.pill {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  background: #f1f5f9;
  color: #475569;
  text-transform: capitalize;
}
.pill.deletion,
.pill.rejected {
  background: #fee2e2;
  color: #991b1b;
}
.pill.completed {
  background: #dcfce7;
  color: #166534;
}
.pill.pending,
.pill.in_progress {
  background: #fef3c7;
  color: #92400e;
}

.muted {
  color: #64748b;
}
.small {
  font-size: 0.78rem;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  align-items: center;
}
.note-input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.3rem 0.5rem;
  font-size: 0.8rem;
  min-width: 150px;
}
.act {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 8px;
  padding: 0.3rem 0.65rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.act.primary {
  border-color: var(--primary-color, #058526);
  background: var(--primary-color, #058526);
  color: #fff;
}
.act.danger {
  border-color: #dc2626;
  color: #dc2626;
}
.act:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.message {
  margin-top: 1rem;
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  background: #ecfdf5;
  color: #166534;
  font-size: 0.86rem;
}
.message.error {
  background: #fef2f2;
  color: #b91c1c;
}

@media (max-width: 640px) {
  .cards {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
