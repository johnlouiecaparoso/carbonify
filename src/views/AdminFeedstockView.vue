<template>
  <div class="feedstock-admin">
    <PageHeader
      title="Feedstock Oversight"
      description="Farmer deliveries, payment records, and the disputes staff need to resolve."
    >
      <template #actions>
        <button class="btn-ghost" :disabled="loading" @click="load">Refresh</button>
      </template>
    </PageHeader>

    <div class="page-body">
      <!-- Say what this console is and is not. An admin arriving here from the
           finance console will reasonably expect the same powers, and does not
           have them: Carbonify holds no feedstock money to move. -->
      <div class="notice info">
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        <div>
          <strong>Carbonify does not hold or transfer feedstock payments.</strong>
          Buyers and farmers settle directly — cash, GCash, bank transfer — and the platform records
          that they did. This console is read-only oversight plus one action: recording what you
          established happened. There is no payout to release and no refund to issue here.
        </div>
      </div>

      <div v-if="loadError" class="notice error">
        <span class="material-symbols-outlined" aria-hidden="true">error</span>
        <div>
          {{ loadError }}
          <button class="link-retry" @click="load">Try again</button>
        </div>
      </div>

      <section class="cards">
        <div class="card" :class="{ alert: summary.disputedOpen > 0 }">
          <div class="card-label">Open disputes</div>
          <div class="card-value">{{ summary.disputedOpen }}</div>
          <div class="card-sub">A farmer says they were not paid</div>
        </div>
        <div class="card" :class="{ urgent: summary.awaitingAck > 0 }">
          <div class="card-label">Awaiting farmer confirmation</div>
          <div class="card-value">{{ summary.awaitingAck }}</div>
          <div class="card-sub">Buyer claims paid, farmer has not answered</div>
        </div>
        <div class="card">
          <div class="card-label">Confirmed, unpaid</div>
          <div class="card-value">{{ peso(summary.unpaidValue) }}</div>
          <div class="card-sub">Owed by buyers, not held by Carbonify</div>
        </div>
        <div class="card">
          <div class="card-label">Recorded as paid</div>
          <div class="card-value">{{ peso(summary.recordedPaidValue) }}</div>
          <div class="card-sub">{{ summary.deliveryCount }} deliveries · {{ summary.rfqCount }} RFQs</div>
        </div>
      </section>

      <section class="list-section">
        <div class="section-head">
          <h2>Deliveries</h2>
          <div class="filters">
            <button
              v-for="f in FEEDSTOCK_FILTERS"
              :key="f.value"
              type="button"
              :class="['filter-btn', { active: filter === f.value }]"
              @click="setFilter(f.value)"
            >
              {{ f.label }}
            </button>
          </div>
        </div>

        <p v-if="actionError" class="notice error sm">{{ actionError }}</p>

        <div v-if="loading" class="muted">Loading…</div>

        <div v-else-if="!deliveries.length" class="empty">
          <span class="material-symbols-outlined empty-icon" aria-hidden="true">agriculture</span>
          <p class="muted">{{ emptyMessage }}</p>
        </div>

        <!-- No inner overflow wrapper: CollapsibleList owns both scroll axes,
             and nesting one would become the sticky header's scrolling ancestor
             and unpin it. `rowSelector` counts delivery rows only, so the
             interleaved note rows don't halve what "6 rows" means. -->
        <CollapsibleList
          v-else
          :count="deliveries.length"
          :visible="6"
          row-selector="tbody > tr.delivery-row"
        >
          <table>
              <thead>
                <tr>
                  <th>Delivered</th>
                  <th>Farmer</th>
                  <th>Buyer</th>
                  <th class="num">Quantity</th>
                  <th class="num">Value</th>
                  <th>Payment record</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <template v-for="d in deliveries" :key="d.id">
                  <tr class="delivery-row" :class="{ flagged: paymentState(d).tone === 'bad' }">
                    <td>{{ shortDate(d.delivered_on) }}</td>
                    <td>{{ d.farmer_name }}</td>
                    <td>{{ d.buyer_name }}</td>
                    <td class="num">{{ num(d.quantity) }} {{ d.unit }}</td>
                    <td class="num">{{ d.total_amount == null ? '—' : peso(d.total_amount) }}</td>
                    <td>
                      <span class="pill" :class="paymentState(d).tone">{{ paymentState(d).label }}</span>
                    </td>
                    <td class="num">
                      <button
                        v-if="canResolve(d)"
                        class="btn-ghost sm"
                        @click="openResolve(d)"
                      >
                        Record outcome
                      </button>
                    </td>
                  </tr>
                  <!-- The farmer's own words are the substance of a dispute. An
                       admin should not have to open a modal to read them. -->
                  <tr v-if="d.farmer_payment_ack_note || d.payment_resolution" class="detail-row">
                    <td colspan="7">
                      <div v-if="d.farmer_payment_ack_note" class="detail-note">
                        <strong>Farmer:</strong> "{{ d.farmer_payment_ack_note }}"
                        <span class="muted"> · {{ shortDate(d.farmer_payment_ack_at) }}</span>
                      </div>
                      <div v-if="d.payment_resolution" class="detail-note resolved">
                        <strong>{{ resolutionLabel(d.payment_resolution) }}</strong>
                        — {{ d.payment_resolution_note }}
                        <span class="muted">
                          · {{ d.resolved_by_name || 'staff' }}, {{ shortDate(d.payment_resolved_at) }}
                        </span>
                      </div>
                      <div v-if="d.payment_reference" class="detail-note muted">
                        Buyer's payment reference: {{ d.payment_reference }}
                      </div>
                    </td>
                  </tr>
                </template>
              </tbody>
          </table>
        </CollapsibleList>
      </section>
    </div>

    <!-- Record-outcome modal -->
    <div
      v-if="resolving"
      class="modal-overlay"
      v-modal-a11y="() => (resolving = null)"
      @click.self="resolving = null"
    >
      <div class="modal">
        <h2>Record what you established</h2>
        <p class="muted small">
          {{ num(resolving.quantity) }} {{ resolving.unit }} from {{ resolving.farmer_name }} to
          {{ resolving.buyer_name }}, delivered {{ shortDate(resolving.delivered_on) }}
        </p>

        <div class="notice info sm">
          This records an off-platform outcome. It moves no money — Carbonify never held this
          payment. Choosing <strong>Payment was NOT made</strong> reverses the buyer's claim so the
          delivery reads as unpaid again.
        </div>

        <div class="form-row">
          <label for="res-outcome">Outcome</label>
          <select id="res-outcome" v-model="resolveForm.resolution">
            <option v-for="o in RESOLUTION_OPTIONS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
          <span class="hint">{{ resolutionHint }}</span>
        </div>

        <div class="form-row">
          <label for="res-note">What did you establish?</label>
          <textarea
            id="res-note"
            v-model="resolveForm.note"
            rows="4"
            placeholder="e.g. Buyer produced a GCash reference dated 14 July; farmer confirmed by phone that it arrived under a different name."
          ></textarea>
        </div>

        <p v-if="actionError" class="notice error sm">{{ actionError }}</p>
        <div class="modal-actions">
          <button class="btn-ghost" @click="resolving = null">Cancel</button>
          <button class="btn-primary" :disabled="!resolveForm.note.trim() || saving" @click="submitResolution">
            {{ saving ? 'Saving…' : 'Record outcome' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import CollapsibleList from '@/components/ui/CollapsibleList.vue'
import {
  getFeedstockSummary,
  getFeedstockDeliveries,
  resolveDeliveryPayment,
  paymentState,
  FEEDSTOCK_FILTERS,
  RESOLUTION_OPTIONS,
} from '@/services/adminFeedstockService'
import { peso, num, shortDate } from '@/utils/format'

const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const saving = ref(false)
const filter = ref('disputed')
const deliveries = ref([])
const summary = ref({
  deliveryCount: 0,
  pendingCount: 0,
  confirmedCount: 0,
  disputedOpen: 0,
  disputedTotal: 0,
  awaitingAck: 0,
  recordedPaidValue: 0,
  unpaidValue: 0,
  rfqOpenCount: 0,
  rfqCount: 0,
})

const resolving = ref(null)
const resolveForm = ref({ resolution: 'paid_confirmed', note: '' })

const resolutionHint = computed(
  () => RESOLUTION_OPTIONS.find((o) => o.value === resolveForm.value.resolution)?.hint || '',
)

const emptyMessage = computed(() => {
  if (filter.value === 'disputed') return 'No open disputes. Nothing needs your attention here.'
  if (filter.value === 'awaiting_ack') return 'Every recorded payment has been answered by its farmer.'
  if (filter.value === 'unpaid') return 'No confirmed delivery is waiting on a payment record.'
  return 'No feedstock deliveries have been logged yet.'
})

function resolutionLabel(code) {
  return RESOLUTION_OPTIONS.find((o) => o.value === code)?.label || 'Resolved'
}

/**
 * Only offer the action where it means something: a disagreement, or a payment
 * the farmer has been sitting on. Offering it on an agreed record invites staff
 * to overwrite a settled fact both parties already accepted.
 */
function canResolve(d) {
  const state = paymentState(d).key
  return state === 'disputed' || state === 'reopened' || state === 'claimed' || state === 'unpaid'
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    // Loaded together so the cards can never disagree with the list below them.
    const [s, rows] = await Promise.all([
      getFeedstockSummary(),
      getFeedstockDeliveries(filter.value),
    ])
    summary.value = s
    deliveries.value = rows
  } catch (err) {
    loadError.value =
      err?.message || 'We could not load feedstock oversight. This is a problem on our side.'
    deliveries.value = []
  } finally {
    loading.value = false
  }
}

async function setFilter(value) {
  filter.value = value
  await load()
}

function openResolve(d) {
  resolving.value = d
  // Default to the outcome that matches what is on the record, so the common
  // case is one click and the destructive one is deliberate.
  resolveForm.value = {
    resolution: d.payment_status === 'paid' ? 'unpaid_confirmed' : 'paid_confirmed',
    note: '',
  }
  actionError.value = ''
}

async function submitResolution() {
  saving.value = true
  actionError.value = ''
  try {
    await resolveDeliveryPayment(resolving.value, resolveForm.value.resolution, resolveForm.value.note)
    resolving.value = null
    await load()
  } catch (err) {
    actionError.value = err?.message || 'Could not record the outcome.'
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.feedstock-admin { min-height: 100vh; background: var(--bg-secondary, #f8fdf8); }
.page-body { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
.muted { color: var(--text-muted, #64748b); }
.small { font-size: 0.8rem; }

.notice { padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; display: flex; gap: 12px; align-items: flex-start; }
.notice.info { background: #eff6ff; color: #1e40af; }
.notice.error { background: #fee2e2; color: #991b1b; }
.notice.sm { padding: 8px 12px; font-size: 0.85rem; }
.link-retry { background: none; border: none; padding: 0 0 0 6px; color: inherit; font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }

.cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 16px; }
.card.alert { border-color: #fecaca; background: #fef2f2; }
.card.urgent { border-color: #fde68a; background: #fffbeb; }
.card-label { font-size: 0.78rem; color: var(--text-muted, #64748b); font-weight: 600; }
.card-value { font-size: 1.35rem; font-weight: 700; color: #065f46; margin-top: 2px; }
.card-sub { font-size: 0.75rem; color: var(--text-muted, #64748b); margin-top: 2px; }

.section-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.section-head h2 { margin: 0; font-size: 1.1rem; }
.filters { display: flex; gap: 6px; flex-wrap: wrap; }
.filter-btn { background: #fff; border: 1px solid #d1d5db; border-radius: 999px; padding: 6px 14px; font-size: 0.85rem; font-weight: 600; color: #374151; cursor: pointer; height: 42px; }
.filter-btn.active { background: var(--primary-color, #058526); border-color: var(--primary-color, #058526); color: #fff; }

table { width: 100%; border-collapse: collapse; background: #fff; font-size: 0.9rem; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #f1f5f9; }
th { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.03em; color: var(--text-muted, #64748b); background: #fff; }
.num { text-align: right; }
tr.flagged td { background: #fef2f2; }
.detail-row td { padding-top: 0; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; }
.detail-note { margin-top: 2px; }
.detail-note.resolved { color: #065f46; }

.pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 600; white-space: nowrap; }
.pill.ok { background: #d1fae5; color: #065f46; }
.pill.warn { background: #fef3c7; color: #92400e; }
.pill.bad { background: #fee2e2; color: #991b1b; }
.pill.muted { background: #f3f4f6; color: #4b5563; }

.empty { text-align: center; padding: 40px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
.empty-icon { font-size: 40px; color: #d1d5db; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 14px; padding: 22px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; }
.modal h2 { margin: 0 0 4px; font-size: 1.15rem; }
.form-row { display: flex; flex-direction: column; gap: 6px; margin-top: 14px; }
.form-row label { font-weight: 600; font-size: 0.88rem; }
.form-row select, .form-row textarea { border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 12px; font: inherit; font-size: 15px; }
.form-row select { height: 42px; }
.form-row textarea { resize: vertical; }
.hint { font-size: 0.8rem; color: var(--text-muted, #64748b); }
.modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }

.btn-primary { background: var(--primary-color, #058526); color: #fff; border: none; border-radius: 8px; padding: 9px 16px; cursor: pointer; font-weight: 600; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-ghost { background: #fff; color: #374151; border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 16px; cursor: pointer; font-weight: 600; }
.btn-ghost.sm { padding: 6px 12px; font-size: 0.85rem; }

@media (max-width: 900px) {
  .cards { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 520px) {
  .cards { grid-template-columns: 1fr; }
}
</style>
