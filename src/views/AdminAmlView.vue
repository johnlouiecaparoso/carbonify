<template>
  <div class="aml-admin">
    <PageHeader
      title="AML Screening"
      description="Sanctions and PEP screening, and the evidence trail behind it."
    >
      <template #actions>
        <button class="btn-ghost" :disabled="loading" @click="load">Refresh</button>
      </template>
    </PageHeader>

    <div class="page-body">
    <!-- Being straight about what this is. A local list is real screening, but
         it is not a commercial provider, and an operator should know which one
         they are relying on. -->
    <div class="notice">
      <span class="material-symbols-outlined" aria-hidden="true">info</span>
      <div>
        <strong>Screening runs against the local watchlist below.</strong>
        That is genuine screening and it produces a retained evidence trail, but it is
        not a substitute for a commercial provider — those maintain versioned global
        lists continuously and cover aliases, transliteration and adverse media far
        better. Every screening records its list source so provider results later join
        the same trail.
      </div>
    </div>

    <section class="cards">
      <div class="card" :class="{ urgent: summary.potential > 0 }">
        <div class="card-label">Awaiting review</div>
        <div class="card-value">{{ summary.potential }}</div>
      </div>
      <div class="card" :class="{ alert: summary.confirmed > 0 }">
        <div class="card-label">Confirmed matches</div>
        <div class="card-value">{{ summary.confirmed }}</div>
      </div>
      <div class="card">
        <div class="card-label">Cleared after review</div>
        <div class="card-value">{{ summary.cleared }}</div>
      </div>
      <div class="card">
        <div class="card-label">Watchlist entries</div>
        <div class="card-value">{{ watchlist.length }}</div>
      </div>
    </section>

    <div class="toolbar">
      <label v-for="opt in statusOptions" :key="opt.value" class="filter-chip">
        <input v-model="statusFilter" type="radio" :value="opt.value" @change="load" />
        <span>{{ opt.label }}</span>
      </label>
    </div>

    <div v-if="loading" class="state">Loading…</div>
    <div v-else-if="!screenings.length" class="state">No screenings in this view.</div>

    <div v-else class="table-scroll">
      <table class="data-table stack-on-mobile">
        <thead>
          <tr>
            <th>Screened</th>
            <th>Subject</th>
            <th>Name checked</th>
            <th>Result</th>
            <th>Matches</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="s in screenings" :key="s.id">
            <td data-label="Screened">{{ shortDate(s.screened_at) }}</td>
            <td data-label="Subject">
              {{ s.subject_name || 'Unknown' }}
              <div class="muted small">{{ s.subject_email || s.user_id }}</div>
            </td>
            <td data-label="Name checked">{{ s.screened_name }}</td>
            <td data-label="Result">
              <span class="pill" :class="s.status">{{ statusLabel(s.status) }}</span>
              <div v-if="s.review_notes" class="muted small">{{ s.review_notes }}</div>
            </td>
            <td data-label="Matches">
              <ul v-if="s.matches?.length" class="match-list">
                <li v-for="(m, i) in s.matches" :key="i">
                  <strong>{{ m.matched_name }}</strong>
                  <span class="muted small">
                    {{ m.entry_type }} · {{ m.list_source }}<span v-if="m.country"> · {{ m.country }}</span>
                    · {{ Math.round(m.score * 100) }}%
                  </span>
                </li>
              </ul>
              <span v-else class="muted">—</span>
            </td>
            <td data-label="Action">
              <div v-if="isOpen(s)" class="row-actions">
                <input
                  v-model="noteDraft[s.id]"
                  class="note-input"
                  placeholder="Decision notes (required)"
                  :disabled="busyId === s.id"
                />
                <button class="act danger" :disabled="busyId === s.id" @click="review(s, 'confirmed_match')">
                  Confirm
                </button>
                <button class="act" :disabled="busyId === s.id" @click="review(s, 'cleared_after_review')">
                  Clear
                </button>
              </div>
              <span v-else class="muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Watchlist -->
    <section class="panel">
      <h2>Local watchlist</h2>
      <form class="watch-form" @submit.prevent="addEntry">
        <input v-model="newEntry.fullName" class="note-input" placeholder="Full name" required />
        <input v-model="newEntry.aliasText" class="note-input" placeholder="Aliases (comma separated)" />
        <select v-model="newEntry.entryType" class="note-input">
          <option value="sanction">Sanction</option>
          <option value="pep">PEP</option>
          <option value="adverse_media">Adverse media</option>
        </select>
        <input v-model="newEntry.listSource" class="note-input" placeholder="List source" />
        <input v-model="newEntry.country" class="note-input country" placeholder="Country" />
        <button class="act primary" type="submit" :disabled="addingEntry">
          {{ addingEntry ? 'Adding…' : 'Add entry' }}
        </button>
      </form>

      <div v-if="watchlist.length" class="table-scroll">
        <table class="data-table stack-on-mobile">
          <thead>
            <tr>
              <th>Name</th>
              <th>Aliases</th>
              <th>Type</th>
              <th>Source</th>
              <th>Country</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="w in watchlist" :key="w.id">
              <td data-label="Name">{{ w.full_name }}</td>
              <td data-label="Aliases">{{ (w.aliases || []).join(', ') || '—' }}</td>
              <td data-label="Type"><span class="pill" :class="w.entry_type">{{ w.entry_type }}</span></td>
              <td data-label="Source">{{ w.list_source }}</td>
              <td data-label="Country">{{ w.country || '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="muted">
        The watchlist is empty, so every screening will come back clear. Add entries
        before relying on this.
      </p>
    </section>

    <p v-if="message" class="message" :class="{ error: isError }">{{ message }}</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import {
  listScreenings,
  reviewScreening,
  getWatchlist,
  addWatchlistEntry,
  summariseScreenings,
  AML_OPEN_STATUSES,
} from '@/services/amlService'

const screenings = ref([])
const watchlist = ref([])
const loading = ref(false)
const busyId = ref(null)
const addingEntry = ref(false)
const message = ref('')
const isError = ref(false)
const statusFilter = ref('open')
const noteDraft = ref({})

const newEntry = ref({
  fullName: '',
  aliasText: '',
  entryType: 'sanction',
  listSource: 'manual',
  country: '',
})

const statusOptions = [
  { value: 'open', label: 'Needs review' },
  { value: 'clear', label: 'Clear' },
  { value: 'cleared_after_review', label: 'Cleared' },
  { value: 'confirmed_match', label: 'Confirmed' },
  { value: 'all', label: 'All' },
]

const summary = computed(() => summariseScreenings(screenings.value))
const isOpen = (s) => AML_OPEN_STATUSES.includes(s.status)

const STATUS_LABELS = {
  clear: 'Clear',
  potential_match: 'Potential match',
  confirmed_match: 'Confirmed match',
  cleared_after_review: 'Cleared after review',
}
const statusLabel = (s) => STATUS_LABELS[s] || s
const shortDate = (v) => (v ? new Date(v).toLocaleString() : '—')

async function load() {
  loading.value = true
  message.value = ''
  try {
    // allSettled: an empty or unreadable watchlist must not hide the queue.
    const [screenRes, watchRes] = await Promise.allSettled([
      listScreenings({ status: statusFilter.value }),
      getWatchlist(),
    ])
    if (screenRes.status === 'fulfilled') screenings.value = screenRes.value
    if (watchRes.status === 'fulfilled') watchlist.value = watchRes.value

    // Say which half failed. Without this the screening queue renders empty on
    // a failed read and reads as "nobody is awaiting a decision" — the one
    // conclusion a compliance console must never draw from a broken query.
    const failed = [
      screenRes.status === 'rejected' && 'screenings',
      watchRes.status === 'rejected' && 'the watchlist',
    ].filter(Boolean)
    if (failed.length) {
      if (screenRes.status === 'rejected') screenings.value = []
      if (watchRes.status === 'rejected') watchlist.value = []
      message.value = `Could not load ${failed.join(' or ')}. This is a loading error — do not read it as an empty queue.`
      isError.value = true
    }
  } finally {
    loading.value = false
  }
}

async function review(screening, status) {
  busyId.value = screening.id
  message.value = ''
  isError.value = false
  try {
    await reviewScreening(screening.id, status, noteDraft.value[screening.id] || '')
    delete noteDraft.value[screening.id]
    message.value = 'Decision recorded.'
    await load()
  } catch (err) {
    // The RPC refuses a decision with no notes — surface that verbatim.
    message.value = err?.message || 'Could not record the decision.'
    isError.value = true
  } finally {
    busyId.value = null
  }
}

async function addEntry() {
  addingEntry.value = true
  message.value = ''
  isError.value = false
  try {
    await addWatchlistEntry({
      fullName: newEntry.value.fullName,
      aliases: newEntry.value.aliasText.split(',').map((a) => a.trim()).filter(Boolean),
      entryType: newEntry.value.entryType,
      listSource: newEntry.value.listSource || 'manual',
      country: newEntry.value.country || null,
    })
    newEntry.value = {
      fullName: '',
      aliasText: '',
      entryType: 'sanction',
      listSource: 'manual',
      country: '',
    }
    message.value = 'Watchlist entry added.'
    await load()
  } catch (err) {
    message.value = err?.message || 'Could not add the entry.'
    isError.value = true
  } finally {
    addingEntry.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.aml-admin {
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
.card.alert {
  border-color: #fecaca;
  background: #fef2f2;
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
/* The radio is the "circle box" in the status filters. At the OS default it was
   taller than the 0.85rem label beside it and sat off its centre line; 13px
   matches the cap height of the text so the pair reads as one control. */
.filter-chip input[type='radio'] {
  width: 13px;
  height: 13px;
  margin: 0;
}
.filter-chip:has(input:checked) {
  border-color: var(--primary-color, #058526);
  background: #ecfdf5;
  color: var(--primary-color, #058526);
  font-weight: 600;
}

.state,
.panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
  color: #334155;
}
.panel {
  margin-top: 1.5rem;
}
.panel h2 {
  margin: 0 0 0.75rem;
  font-size: 1.1rem;
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
.pill.clear,
.pill.cleared_after_review {
  background: #dcfce7;
  color: #166534;
}
.pill.potential_match,
.pill.pep {
  background: #fef3c7;
  color: #92400e;
}
.pill.confirmed_match,
.pill.sanction {
  background: #fee2e2;
  color: #991b1b;
}

.match-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.25rem;
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

/* The watchlist form was a wrapping flex row of five controls with different
   intrinsic heights — a text input, a native select and a button do not agree
   on a baseline — so nothing in it lined up and the wrap points were ragged.
   A grid gives every control the same column width and `stretch` gives them all
   the same height, which is what "align them" means here. */
.watch-form {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.5rem;
  align-items: stretch;
  margin-bottom: 1rem;
}
.note-input {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  padding: 0.35rem 0.55rem;
  font-size: 0.82rem;
  min-width: 150px;
}
/* Inside the grid the column already sets the width; a 150px floor would only
   stop the last column collapsing on a phone. */
.watch-form .note-input {
  min-width: 0;
  width: 100%;
  height: 34px;
}
.note-input.country {
  min-width: 90px;
}
.act {
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 8px;
  padding: 0.35rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.watch-form .act {
  height: 34px;
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
