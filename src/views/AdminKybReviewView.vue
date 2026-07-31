<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { listKybApplications, reviewKyb } from '@/services/kybService'

const loading = ref(true)
const loadError = ref('')
const applications = ref([])
const statusFilter = ref('pending')
const notesById = ref({})
const busyId = ref(null)
const toast = ref('')

const statusCounts = computed(() => {
  const counts = { pending: 0, approved: 0, rejected: 0 }
  for (const a of applications.value) {
    if (counts[a.status] != null) counts[a.status] += 1
  }
  return counts
})

const filtered = computed(() =>
  statusFilter.value === 'all'
    ? applications.value
    : applications.value.filter((a) => a.status === statusFilter.value),
)

function shortDate(d) {
  return d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    // Load all so the tab counts are accurate; filtering is client-side.
    applications.value = await listKybApplications()
  } catch (err) {
    // Without this, a failed read rendered as "No pending applications" — a
    // review queue that looks cleared while sellers wait on verification.
    console.error('Failed to load KYB applications:', err)
    applications.value = []
    loadError.value = 'We could not load the applications. This is a loading error, not an empty queue.'
  } finally {
    loading.value = false
  }
}

async function decide(app, approve) {
  busyId.value = app.id
  toast.value = ''
  try {
    await reviewKyb(app.id, approve, notesById.value[app.id] || '')
    toast.value = `${app.business_name} ${approve ? 'approved' : 'rejected'}.`
    await load()
  } catch (err) {
    toast.value = err.message || 'Action failed.'
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="kyb-review">
    <PageHeader
      title="KYB Review"
      description="Approve or reject seller business verifications. Approving unlocks withdrawals."
    />

    <div class="page-body">

    <div class="tabs">
      <button
        v-for="t in ['pending', 'approved', 'rejected', 'all']"
        :key="t"
        :class="['tab', { active: statusFilter === t }]"
        @click="statusFilter = t"
      >
        {{ t.charAt(0).toUpperCase() + t.slice(1) }}
        <span v-if="t !== 'all'" class="tab-count">{{ statusCounts[t] }}</span>
      </button>
    </div>

    <p v-if="toast" class="toast">{{ toast }}</p>

    <div v-if="loading" class="muted">Loading…</div>
    <p v-else-if="loadError" class="load-error">
      {{ loadError }}
      <button class="retry" @click="load">Try again</button>
    </p>
    <p v-else-if="!filtered.length" class="muted empty">No {{ statusFilter }} applications.</p>

    <div v-else class="cards">
      <article v-for="app in filtered" :key="app.id" class="card">
        <div class="card-head">
          <h2>{{ app.business_name }}</h2>
          <span class="badge" :class="app.status">{{ app.status }}</span>
        </div>
        <dl class="facts">
          <div><dt>Type</dt><dd>{{ app.business_type || '—' }}</dd></div>
          <div><dt>Registration</dt><dd>{{ app.registration_number || '—' }}</dd></div>
          <div><dt>Tax ID</dt><dd>{{ app.tax_id || '—' }}</dd></div>
          <div><dt>Representative</dt><dd>{{ app.authorized_representative || '—' }}</dd></div>
          <div><dt>Address</dt><dd>{{ app.business_address || '—' }}</dd></div>
          <div><dt>Submitted</dt><dd>{{ shortDate(app.submitted_at) }}</dd></div>
        </dl>

        <div v-if="app.registration_document_url || app.tax_document_url" class="docs">
          <a v-if="app.registration_document_url" :href="app.registration_document_url" target="_blank" rel="noopener">
            Registration doc
          </a>
          <a v-if="app.tax_document_url" :href="app.tax_document_url" target="_blank" rel="noopener">
            Tax doc
          </a>
        </div>

        <p v-if="app.status !== 'pending' && app.review_notes" class="review-notes">
          <strong>Notes:</strong> {{ app.review_notes }}
        </p>

        <div v-if="app.status === 'pending'" class="actions">
          <input
            v-model="notesById[app.id]"
            type="text"
            class="notes-input"
            placeholder="Review notes (optional, shown to seller)"
          />
          <div class="action-buttons">
            <button class="btn reject" :disabled="busyId === app.id" @click="decide(app, false)">
              Reject
            </button>
            <button class="btn approve" :disabled="busyId === app.id" @click="decide(app, true)">
              {{ busyId === app.id ? 'Working…' : 'Approve' }}
            </button>
          </div>
        </div>
      </article>
    </div>
    </div>
  </div>
</template>

<style scoped>
.kyb-review {
  min-height: 100vh;
  background: var(--bg-secondary, #f8fdf8);
}

.page-body {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px 16px;
}
.muted {
  color: #6b7280;
}
.empty {
  padding: 24px 0;
}
.load-error {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 14px;
  border: 1px solid var(--error-color, #b91c1c);
  border-radius: 8px;
  background: #fef2f2;
  color: var(--error-color, #b91c1c);
}
.retry {
  background: #fff;
  border: 1px solid currentColor;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
  font-weight: 600;
  color: inherit;
}
.tabs {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.tab {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
  font-weight: 600;
  color: #374151;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tab.active {
  background: var(--primary-color, #058526);
  border-color: var(--primary-color, #058526);
  color: #fff;
}
.tab-count {
  background: rgba(0, 0, 0, 0.08);
  border-radius: 999px;
  padding: 0 7px;
  font-size: 0.75rem;
}
.tab.active .tab-count {
  background: rgba(255, 255, 255, 0.25);
}
.toast {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 16px;
}
.cards {
  display: grid;
  gap: 16px;
}
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 18px;
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}
.card-head h2 {
  margin: 0;
  font-size: 1.15rem;
}
.badge {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: capitalize;
  background: #fef3c7;
  color: #92400e;
}
.badge.approved {
  background: #d1fae5;
  color: #065f46;
}
.badge.rejected {
  background: #fee2e2;
  color: #991b1b;
}
.facts {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px 20px;
  margin: 0 0 12px;
}
.facts dt {
  color: #6b7280;
  font-size: 0.78rem;
}
.facts dd {
  margin: 2px 0 0;
  font-size: 0.92rem;
  color: #111827;
}
.docs {
  display: flex;
  gap: 14px;
  margin-bottom: 12px;
}
.docs a {
  color: #059669;
  font-size: 0.88rem;
}
.review-notes {
  color: #374151;
  font-size: 0.9rem;
  background: #f9fafb;
  padding: 8px 12px;
  border-radius: 8px;
}
.actions {
  border-top: 1px solid #f1f5f9;
  padding-top: 12px;
}
.notes-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  margin-bottom: 10px;
  font-size: 0.9rem;
}
.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.btn {
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  cursor: pointer;
  font-weight: 600;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.approve {
  background: var(--success-color, #058526);
  color: #fff;
}
.btn.reject {
  background: #fff;
  border: 1px solid #ef4444;
  color: #ef4444;
}
</style>
