<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { getSupabase } from '@/services/supabaseClient'
import {
  getMyOfftakes,
  createOfftake,
  updateOfftake,
  deleteOfftake,
  summarizeOfftakes,
  validateOfftakeInput,
  agreementValue,
  OFFTAKE_STATUSES,
  OFFTAKE_STATUS_LABELS,
  CONTRACTED_STATUSES,
} from '@/services/offtakeService'

/**
 * Developer-facing offtake (ERPA) manager.
 *
 * Only `signed`/`active` agreements count as contracted revenue in the Investor
 * Portal — the status selector says so inline, because the difference between a
 * draft and a signed agreement is the difference between a pitch and a contract.
 */

const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const agreements = ref([])
const projects = ref([])
const busyId = ref(null)

const showForm = ref(false)
const form = ref(emptyForm())
const formErrors = ref([])
const saving = ref(false)

function emptyForm() {
  return {
    project_id: '',
    counterparty_name: '',
    volume_credits: '',
    price_per_credit: '',
    start_date: '',
    end_date: '',
    signed_on: '',
    status: 'draft',
    notes: '',
  }
}

function peso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function num(n) {
  return Number(n || 0).toLocaleString('en-PH')
}
function shortDate(d) {
  return d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}
function projectTitle(id) {
  return projects.value.find((p) => p.id === id)?.title || 'Unknown project'
}
function isContracted(status) {
  return CONTRACTED_STATUSES.includes(status)
}

const summary = computed(() => summarizeOfftakes(agreements.value))
const formValue = computed(() => agreementValue(form.value))

/** Per-project over-commitment: contracted volume beyond estimated issuance. */
const overCommitted = computed(() => {
  const out = []
  for (const p of projects.value) {
    const forProject = agreements.value.filter((a) => a.project_id === p.id)
    const { contractedVolume } = summarizeOfftakes(forProject)
    const estimated = Number(p.estimated_credits) || 0
    if (estimated > 0 && contractedVolume > estimated) {
      out.push({ title: p.title, contractedVolume, estimated })
    }
  }
  return out
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const supabase = getSupabase()
    if (!supabase) throw new Error('Supabase client not available')
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')

    const [{ data: projectRows, error: projErr }, offtakes] = await Promise.all([
      supabase
        .from('projects')
        .select('id, title, estimated_credits, credit_price, status')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      getMyOfftakes(),
    ])
    if (projErr) throw new Error(projErr.message)
    projects.value = projectRows || []
    agreements.value = offtakes
  } catch (err) {
    console.error('Failed to load offtake agreements:', err)
    loadError.value = err?.message || 'We could not load your agreements right now.'
  } finally {
    loading.value = false
  }
}

async function save() {
  formErrors.value = validateOfftakeInput(form.value)
  if (formErrors.value.length) return
  saving.value = true
  actionError.value = ''
  try {
    const created = await createOfftake(form.value)
    agreements.value.unshift(created)
    form.value = emptyForm()
    showForm.value = false
  } catch (err) {
    actionError.value = err?.message || 'Could not record the agreement.'
  } finally {
    saving.value = false
  }
}

async function changeStatus(agreement, status) {
  busyId.value = agreement.id
  actionError.value = ''
  try {
    const updated = await updateOfftake(agreement.id, { status })
    const i = agreements.value.findIndex((a) => a.id === updated.id)
    if (i !== -1) agreements.value[i] = updated
  } catch (err) {
    actionError.value = err?.message || 'Could not update the agreement.'
  } finally {
    busyId.value = null
  }
}

async function remove(agreement) {
  busyId.value = agreement.id
  actionError.value = ''
  try {
    await deleteOfftake(agreement.id)
    agreements.value = agreements.value.filter((a) => a.id !== agreement.id)
  } catch (err) {
    actionError.value = err?.message || 'Could not delete the agreement.'
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="offtakes">
    <PageHeader title="Offtake Agreements">
      <template #description>
        Record the ERPAs that commit a buyer to your credits. Signed and active agreements are shown
        to investors as <strong>contracted revenue</strong> — everything else stays speculative.
      </template>
    </PageHeader>

    <div class="page-body">

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="loadError" class="notice error">
      {{ loadError }}
      <div><button class="retry-btn" @click="load">Try again</button></div>
    </div>

    <template v-else>
      <p v-if="actionError" class="notice error sm">{{ actionError }}</p>

      <!-- Over-commitment warning: a real integrity signal, not a rounding artefact -->
      <div v-if="overCommitted.length" class="notice warn">
        <span class="material-symbols-outlined" aria-hidden="true">warning</span>
        <div>
          <strong>You have contracted more credits than you expect to issue.</strong>
          <ul class="over-list">
            <li v-for="o in overCommitted" :key="o.title">
              {{ o.title }} — {{ num(o.contractedVolume) }} contracted vs
              {{ num(o.estimated) }} estimated
            </li>
          </ul>
          Investors see this as an over-commitment flag. Revise a volume, or update the project's
          estimated credits.
        </div>
      </div>

      <section class="stats">
        <div class="stat">
          <span class="stat-label">Contracted revenue</span>
          <span class="stat-value">{{ peso(summary.contractedRevenue) }}</span>
          <span class="stat-sub">{{ summary.agreementCount }} signed/active</span>
        </div>
        <div class="stat">
          <span class="stat-label">Contracted volume</span>
          <span class="stat-value">{{ num(summary.contractedVolume) }}</span>
          <span class="stat-sub">credits committed</span>
        </div>
        <div class="stat">
          <span class="stat-label">In negotiation</span>
          <span class="stat-value pending">{{ num(summary.pipelineVolume) }}</span>
          <span class="stat-sub">credits not yet contracted</span>
        </div>
        <div class="stat">
          <span class="stat-label">Agreements</span>
          <span class="stat-value">{{ num(agreements.length) }}</span>
          <span class="stat-sub">all statuses</span>
        </div>
      </section>

      <div class="section-head">
        <h2>Your agreements</h2>
        <button v-if="!showForm && projects.length" class="btn-primary sm" @click="showForm = true">
          Add agreement
        </button>
      </div>

      <div v-if="!projects.length" class="notice info sm">
        You have no projects yet. An offtake agreement is attached to a project —
        <router-link to="/submit-project">submit one</router-link> first.
      </div>

      <!-- New agreement -->
      <div v-if="showForm" class="card form-card">
        <div class="grid-2">
          <div class="form-row">
            <label for="o-project">Project</label>
            <select id="o-project" v-model="form.project_id">
              <option value="">Select a project…</option>
              <option v-for="p in projects" :key="p.id" :value="p.id">{{ p.title }}</option>
            </select>
          </div>
          <div class="form-row">
            <label for="o-cp">Counterparty</label>
            <input id="o-cp" v-model="form.counterparty_name" type="text" placeholder="e.g. Japan Energy Capital" />
          </div>
          <div class="form-row">
            <label for="o-vol">Contracted volume (credits)</label>
            <input id="o-vol" v-model.number="form.volume_credits" type="number" min="0" step="any" />
          </div>
          <div class="form-row">
            <label for="o-price">Price per credit</label>
            <input id="o-price" v-model.number="form.price_per_credit" type="number" min="0" step="any" />
          </div>
          <div class="form-row">
            <label for="o-start">Term starts</label>
            <input id="o-start" v-model="form.start_date" type="date" />
          </div>
          <div class="form-row">
            <label for="o-end">Term ends</label>
            <input id="o-end" v-model="form.end_date" type="date" />
          </div>
          <div class="form-row">
            <label for="o-signed">Signed on <span class="opt">(optional)</span></label>
            <input id="o-signed" v-model="form.signed_on" type="date" />
          </div>
          <div class="form-row">
            <label for="o-status">Status</label>
            <select id="o-status" v-model="form.status">
              <option v-for="s in OFFTAKE_STATUSES" :key="s" :value="s">
                {{ OFFTAKE_STATUS_LABELS[s] }}{{ isContracted(s) ? ' — counts as contracted' : '' }}
              </option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <label for="o-notes">Notes <span class="opt">(optional)</span></label>
          <textarea id="o-notes" v-model="form.notes" rows="2" placeholder="Delivery schedule, vintage, conditions precedent…"></textarea>
        </div>

        <div v-if="formValue" class="estimate">
          Contract value: <strong>{{ peso(formValue) }}</strong>
          <span v-if="!isContracted(form.status)" class="muted">
            — not counted as contracted revenue until it's signed or active.
          </span>
        </div>

        <ul v-if="formErrors.length" class="err-list">
          <li v-for="e in formErrors" :key="e">{{ e }}</li>
        </ul>

        <div class="modal-actions">
          <button class="btn-ghost" @click="showForm = false">Cancel</button>
          <button class="btn-primary" :disabled="saving" @click="save">
            {{ saving ? 'Saving…' : 'Record agreement' }}
          </button>
        </div>
      </div>

      <div v-if="!agreements.length && !showForm" class="empty">
        <span class="material-symbols-outlined empty-icon" aria-hidden="true">handshake</span>
        <p class="muted">
          No agreements yet. Without one, investors see your projected revenue as entirely
          speculative — priced at your listed credit price rather than a contract.
        </p>
        <button v-if="projects.length" class="btn-primary" @click="showForm = true">Add agreement</button>
      </div>

      <div v-for="a in agreements" :key="a.id" class="card">
        <div class="card-head">
          <div>
            <h3>{{ a.counterparty_name }}</h3>
            <div class="meta">
              {{ projectTitle(a.project_id) }} · {{ num(a.volume_credits) }} credits at
              {{ peso(a.price_per_credit) }}
            </div>
          </div>
          <span class="badge" :class="a.status">{{ OFFTAKE_STATUS_LABELS[a.status] || a.status }}</span>
        </div>
        <div class="detail">
          <strong>{{ peso(agreementValue(a)) }}</strong> contract value
          <span v-if="a.start_date || a.end_date">
            · {{ shortDate(a.start_date) }} → {{ shortDate(a.end_date) }}
          </span>
          <span v-if="a.signed_on"> · signed {{ shortDate(a.signed_on) }}</span>
        </div>
        <p v-if="a.notes" class="note">"{{ a.notes }}"</p>
        <p v-if="!isContracted(a.status)" class="muted small hint">
          Not counted as contracted revenue — investors see this volume as speculative.
        </p>

        <div class="actions">
          <button
            v-if="a.status === 'draft' || a.status === 'negotiating'"
            class="btn-ghost sm"
            :disabled="busyId === a.id"
            @click="changeStatus(a, 'signed')"
          >
            Mark signed
          </button>
          <button
            v-if="a.status === 'signed'"
            class="btn-ghost sm"
            :disabled="busyId === a.id"
            @click="changeStatus(a, 'active')"
          >
            Mark active
          </button>
          <button
            v-if="isContracted(a.status)"
            class="btn-ghost sm"
            :disabled="busyId === a.id"
            @click="changeStatus(a, 'completed')"
          >
            Mark completed
          </button>
          <button
            v-if="a.status !== 'terminated'"
            class="btn-ghost sm"
            :disabled="busyId === a.id"
            @click="changeStatus(a, 'terminated')"
          >
            Terminate
          </button>
          <button class="btn-ghost sm danger" :disabled="busyId === a.id" @click="remove(a)">Delete</button>
        </div>
      </div>
    </template>
    </div>
  </div>
</template>

<style scoped>
.offtakes { min-height: 100vh; background: var(--bg-secondary, #f8fdf8); }
.page-body { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
.page-head h1 { margin: 0; font-size: 1.6rem; }
.page-head p { color: #6b7280; margin: 4px 0 20px; }
.muted { color: #6b7280; }
.small { font-size: 0.8rem; }
.opt { font-weight: 400; color: #9ca3af; }
.hint { margin: 8px 0 0; }

.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
.stat { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 0.78rem; color: #6b7280; font-weight: 600; }
.stat-value { font-size: 1.35rem; font-weight: 700; color: #065f46; }
.stat-value.pending { color: #92400e; }
.stat-sub { font-size: 0.75rem; color: #9ca3af; }

.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.section-head h2 { margin: 0; font-size: 1.1rem; }

.notice { padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; display: flex; gap: 12px; align-items: flex-start; }
.notice.error { background: #fee2e2; color: #991b1b; display: block; }
.notice.warn { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; }
.notice.info { background: #eff6ff; color: #1e40af; display: block; }
.notice.sm { padding: 8px 12px; font-size: 0.85rem; }
.over-list { margin: 6px 0; padding-left: 18px; }
.retry-btn { margin-top: 8px; padding: 6px 14px; border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 8px; font-weight: 600; cursor: pointer; }

.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
.card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.card-head h3 { margin: 0 0 4px; font-size: 1.05rem; }
.meta { color: #6b7280; font-size: 0.82rem; }
.detail { color: #4b5563; font-size: 0.85rem; margin-top: 8px; }
.note { color: #4b5563; font-size: 0.87rem; font-style: italic; margin: 8px 0 0; }
.actions { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; }

.form-card { margin-bottom: 20px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
.form-row { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 0.85rem; font-weight: 600; color: #374151; }
.form-row input, .form-row select, .form-row textarea { padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.9rem; font-family: inherit; }
.estimate { margin-top: 12px; font-size: 0.85rem; color: #065f46; }
.err-list { margin: 10px 0 0; padding-left: 18px; color: #991b1b; font-size: 0.85rem; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

.badge { padding: 3px 10px; border-radius: 999px; font-size: 0.75rem; background: #e5e7eb; color: #374151; height: fit-content; }
.badge.signed, .badge.active { background: #d1fae5; color: #065f46; }
.badge.negotiating { background: #fef3c7; color: #92400e; }
.badge.draft { background: #e0e7ff; color: #3730a3; }
.badge.terminated { background: #fee2e2; color: #991b1b; }
.badge.completed { background: #f3f4f6; color: #6b7280; }

.btn-primary { background: #058526; color: #fff; border: none; border-radius: 8px; padding: 9px 16px; cursor: pointer; font-weight: 600; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary.sm { padding: 7px 12px; font-size: 0.85rem; }
.btn-ghost { background: #fff; color: #374151; border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 16px; cursor: pointer; font-weight: 600; }
.btn-ghost.sm { padding: 7px 12px; font-size: 0.85rem; }
.btn-ghost.danger { color: #991b1b; border-color: #fecaca; }

.empty { text-align: center; padding: 48px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
.empty-icon { font-size: 48px; color: #058526; }
.empty p { margin: 12px auto 18px; max-width: 420px; }

@media (max-width: 640px) {
  .stats { grid-template-columns: 1fr 1fr; }
  .grid-2 { grid-template-columns: 1fr; }
}
</style>
