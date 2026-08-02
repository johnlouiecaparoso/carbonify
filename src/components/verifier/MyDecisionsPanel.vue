<script setup>
/**
 * The verifier's own decision record.
 *
 * A verifier could read the timeline of whichever project was open in front of
 * them and nothing else. "What did you validate last quarter?" — the first
 * question an accreditation body asks — had no answer inside the product, even
 * though every decision was already written to `audit_logs` and already
 * readable by them under 20260722000300.
 *
 * Deliberately read-only and deliberately unfiltered by project: this is the
 * one screen in the panel that is about the PERSON rather than the queue.
 */
import { ref, computed, onMounted } from 'vue'
import {
  getMyVerificationDecisions,
  summariseDecisions,
} from '@/services/verificationService'
import { exportDecisionsCsv } from '@/services/verifierExportService'
import CollapsibleList from '@/components/ui/CollapsibleList.vue'

const decisions = ref([])
const loading = ref(true)
// Distinct from an empty list on purpose. A verifier looking at this screen may
// be doing so because someone asked them to account for their work, and "no
// decisions" must never be shown when the truth is "we could not read them".
const errorMessage = ref('')

const PERIODS = [
  { value: 'all', label: 'All time' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
]
const period = ref('all')

const KINDS = [
  { value: 'all', label: 'Everything' },
  { value: 'project_validated', label: 'Validated' },
  { value: 'project_rejected', label: 'Rejected' },
  { value: 'project_needs_revision', label: 'Revisions requested' },
  { value: 'report', label: 'MRV reports' },
]
const kind = ref('all')

function sinceIso() {
  if (period.value === 'all') return null
  const days = Number(period.value)
  return new Date(Date.now() - days * 86_400_000).toISOString()
}

const filtered = computed(() => {
  if (kind.value === 'all') return decisions.value
  if (kind.value === 'report') return decisions.value.filter((d) => d.kind === 'report')
  return decisions.value.filter((d) => d.action === kind.value)
})

const summary = computed(() => summariseDecisions(filtered.value))

function toneFor(action) {
  if (action === 'project_validated' || action === 'report_approved') return 'good'
  if (action === 'project_rejected' || action === 'report_rejected') return 'bad'
  return 'warn'
}

function formatWhen(value) {
  if (!value) return '—'
  return new Date(value).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDay(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    decisions.value = await getMyVerificationDecisions({ since: sinceIso() })
  } catch (err) {
    console.error('Failed to load decision history:', err)
    decisions.value = []
    errorMessage.value = err?.message || 'We could not load your decision history.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="decisions">
    <header class="decisions-head">
      <div>
        <h2>My decisions</h2>
        <p>
          Every project and MRV report you have personally validated, rejected or sent back —
          the record behind your name on this platform.
        </p>
      </div>
      <button
        class="export-btn"
        type="button"
        :disabled="loading || !filtered.length"
        @click="exportDecisionsCsv(filtered)"
      >
        <span class="material-symbols-outlined" aria-hidden="true">download</span>
        Export CSV
      </button>
    </header>

    <div class="filters">
      <label class="filter">
        <span>Period</span>
        <select v-model="period" @change="load">
          <option v-for="p in PERIODS" :key="p.value" :value="p.value">{{ p.label }}</option>
        </select>
      </label>
      <label class="filter">
        <span>Showing</span>
        <select v-model="kind">
          <option v-for="k in KINDS" :key="k.value" :value="k.value">{{ k.label }}</option>
        </select>
      </label>
    </div>

    <div class="cards">
      <div class="card">
        <span class="card-label">Decisions</span>
        <span class="card-value">{{ summary.total }}</span>
      </div>
      <div class="card">
        <span class="card-label">Validated</span>
        <span class="card-value good">{{ summary.validated }}</span>
      </div>
      <div class="card">
        <span class="card-label">Rejected</span>
        <span class="card-value bad">{{ summary.rejected }}</span>
      </div>
      <div class="card">
        <span class="card-label">Revisions</span>
        <span class="card-value warn">{{ summary.revisions }}</span>
      </div>
    </div>

    <p v-if="!loading && !errorMessage && summary.total" class="range">
      {{ formatDay(summary.firstAt) }} — {{ formatDay(summary.lastAt) }}
    </p>

    <div v-if="loading" class="state">Loading your decision history…</div>

    <div v-else-if="errorMessage" class="state error">
      <p>{{ errorMessage }}</p>
      <button class="retry" type="button" @click="load">Try again</button>
    </div>

    <div v-else-if="!filtered.length" class="state">
      No decisions in this view yet.
    </div>

    <CollapsibleList
      v-else
      :count="filtered.length"
      :visible="8"
      row-selector=".decision-row"
    >
      <ul class="decision-list">
        <li v-for="d in filtered" :key="d.id" class="decision-row">
          <span class="pill" :class="toneFor(d.action)">{{ d.label }}</span>
          <div class="decision-body">
            <router-link
              v-if="d.kind === 'project'"
              :to="`/projects/${d.resourceId}`"
              class="decision-title"
            >
              {{ d.projectTitle }}
            </router-link>
            <span v-else class="decision-title">
              {{ d.projectTitle || 'MRV report' }}
            </span>
            <span class="decision-when">{{ formatWhen(d.at) }}</span>
            <p v-if="d.note" class="decision-note">{{ d.note }}</p>
          </div>
        </li>
      </ul>
    </CollapsibleList>
  </section>
</template>

<style scoped>
.decisions {
  background: #fff;
  border: 1px solid var(--carbonify-border, #e5e7eb);
  border-radius: 16px;
  padding: 1.25rem;
}

.decisions-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
}

.decisions-head h2 {
  margin: 0 0 0.25rem;
  font-size: 1.15rem;
  color: #0f172a;
}

.decisions-head p {
  margin: 0;
  max-width: 60ch;
  font-size: 0.84rem;
  line-height: 1.5;
  color: #64748b;
}

.export-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex: 0 0 auto;
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--carbonify-border, #e5e7eb);
  border-radius: 8px;
  background: #fff;
  color: #334155;
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}
.export-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.export-btn .material-symbols-outlined {
  font-size: 1rem;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.filter {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.filter > span {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: #64748b;
}

/* Sized to the longest option so the popup opens at the control's width —
   see src/styles/form-controls.css. */
.filter select {
  height: 34px;
  min-width: 190px;
  padding: 0 0.5rem;
  border: 1px solid var(--carbonify-border, #e5e7eb);
  border-radius: 8px;
  background: #fff;
  font-family: inherit;
  font-size: 0.84rem;
  color: #0f172a;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.card {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--carbonify-border, #e5e7eb);
  border-radius: 12px;
  background: #f8fafc;
}

.card-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

.card-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: #0f172a;
}
.card-value.good {
  color: #047857;
}
.card-value.bad {
  color: #b91c1c;
}
.card-value.warn {
  color: #b45309;
}

.range {
  margin: 0 0 1rem;
  font-size: 0.78rem;
  color: #64748b;
}

.state {
  padding: 1.5rem;
  border: 1px dashed var(--carbonify-border, #e5e7eb);
  border-radius: 12px;
  text-align: center;
  color: #64748b;
  font-size: 0.88rem;
}
.state.error {
  border-style: solid;
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}

.retry {
  margin-top: 0.6rem;
  padding: 0.4rem 0.9rem;
  border: 1px solid #991b1b;
  border-radius: 8px;
  background: #fff;
  color: #991b1b;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
}

.decision-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.decision-row {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.7rem 0;
  border-top: 1px solid #f1f5f9;
}
.decision-row:first-child {
  border-top: none;
}

.pill {
  flex: 0 0 auto;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  background: #f1f5f9;
  color: #475569;
}
.pill.good {
  background: #dcfce7;
  color: #166534;
}
.pill.bad {
  background: #fee2e2;
  color: #991b1b;
}
.pill.warn {
  background: #fef3c7;
  color: #92400e;
}

.decision-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.decision-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
  text-decoration: none;
  overflow-wrap: anywhere;
}
a.decision-title:hover {
  color: var(--primary-color, #058526);
  text-decoration: underline;
}

.decision-when {
  font-size: 0.76rem;
  color: #64748b;
}

.decision-note {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #475569;
  overflow-wrap: anywhere;
}

@media (max-width: 640px) {
  .decisions {
    padding: 1rem;
  }

  .filter select {
    min-width: 0;
    width: 100%;
  }

  .filter {
    flex: 1 1 100%;
  }

  .export-btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
