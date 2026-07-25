<script setup>
import { ref, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import {
  getMyBuyerRfqs,
  getMySellerRfqs,
  submitQuote,
  respondToQuote,
  closeRfq,
} from '@/services/biomassService'
import {
  getIncomingDeliveries,
  confirmDelivery,
  markDeliveryPaid,
} from '@/services/farmerService'
import { getSupabase } from '@/services/supabaseClient'
import { biomassTypeLabel } from '@/constants/biomass'

const loading = ref(true)
const loadError = ref('')
const tab = ref('buyer') // 'buyer' | 'seller' | 'deliveries'
const buyerRfqs = ref([])
const sellerRfqs = ref([])
const deliveries = ref([])
const busyId = ref(null)
const actionError = ref('')

// Quote modal (seller)
const quoteRfq = ref(null)
const quoteForm = ref({ price_per_unit: '', message: '' })

// Payment modal (buyer)
const payDelivery = ref(null)
const payReference = ref('')

// Confirm-receipt modal (buyer names the project the feedstock fed, so the
// farmer's carbon contribution can be attributed)
const confirmDeliveryRow = ref(null)
const confirmProjectId = ref('')
const myProjects = ref([])

function peso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function shortDate(d) {
  return d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}
function label(rfq) {
  return `${biomassTypeLabel(rfq.product_type)}${rfq.product_title ? ' · ' + rfq.product_title : ''}`
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [b, s, d, projects] = await Promise.all([
      getMyBuyerRfqs(),
      getMySellerRfqs(),
      getIncomingDeliveries(),
      getMyProjects(),
    ])
    buyerRfqs.value = b
    sellerRfqs.value = s
    deliveries.value = d
    myProjects.value = projects
  } catch (err) {
    console.error('Failed to load RFQs:', err)
    loadError.value = err?.message || 'We could not load your requests right now.'
  } finally {
    loading.value = false
  }
}

/** The signed-in buyer's own projects — offered when confirming a delivery. */
async function getMyProjects() {
  const supabase = getSupabase()
  if (!supabase) return []
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []
  const { data, error } = await supabase
    .from('projects')
    .select('id, title')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error) {
    console.warn('Could not load projects for delivery attribution:', error.message)
    return []
  }
  return data || []
}

function replaceRfq(list, updated) {
  const i = list.value.findIndex((r) => r.id === updated.id)
  if (i !== -1) list.value[i] = updated
}

function openQuote(rfq) {
  quoteRfq.value = rfq
  quoteForm.value = { price_per_unit: rfq.quoted_price_per_unit ?? '', message: rfq.quote_message ?? '' }
  actionError.value = ''
}

async function sendQuote() {
  busyId.value = quoteRfq.value.id
  actionError.value = ''
  try {
    const updated = await submitQuote(quoteRfq.value, quoteForm.value.price_per_unit, quoteForm.value.message)
    replaceRfq(sellerRfqs, updated)
    quoteRfq.value = null
  } catch (err) {
    actionError.value = err?.message || 'Could not submit the quote.'
  } finally {
    busyId.value = null
  }
}

async function respond(rfq, accept) {
  busyId.value = rfq.id
  actionError.value = ''
  try {
    const updated = await respondToQuote(rfq, accept)
    replaceRfq(buyerRfqs, updated)
  } catch (err) {
    actionError.value = err?.message || 'Could not send your response.'
  } finally {
    busyId.value = null
  }
}

async function cancel(rfq) {
  busyId.value = rfq.id
  actionError.value = ''
  try {
    const updated = await closeRfq(rfq.id)
    replaceRfq(buyerRfqs, updated)
  } catch (err) {
    actionError.value = err?.message || 'Could not close the request.'
  } finally {
    busyId.value = null
  }
}

function replaceDelivery(updated) {
  const i = deliveries.value.findIndex((d) => d.id === updated.id)
  if (i !== -1) deliveries.value[i] = updated
}

function openConfirm(delivery) {
  confirmDeliveryRow.value = delivery
  confirmProjectId.value = ''
  actionError.value = ''
}

/** Accept (with an optional project) or reject. */
async function reviewDelivery(delivery, accept, projectId = null) {
  busyId.value = delivery.id
  actionError.value = ''
  try {
    replaceDelivery(await confirmDelivery(delivery, accept, null, projectId))
    confirmDeliveryRow.value = null
  } catch (err) {
    actionError.value = err?.message || 'Could not update the delivery.'
  } finally {
    busyId.value = null
  }
}

function openPay(delivery) {
  payDelivery.value = delivery
  payReference.value = ''
  actionError.value = ''
}

async function confirmPayment() {
  busyId.value = payDelivery.value.id
  actionError.value = ''
  try {
    replaceDelivery(await markDeliveryPaid(payDelivery.value, payReference.value))
    payDelivery.value = null
  } catch (err) {
    actionError.value = err?.message || 'Could not mark the delivery paid.'
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="rfqs">
    <PageHeader
      title="Feedstock Requests"
      description="Track quote requests you've sent as a buyer and respond to ones you've received as a supplier."
    />

    <div class="page-body">

    <div class="tabs">
      <button :class="{ active: tab === 'buyer' }" @click="tab = 'buyer'">
        My requests <span class="count">{{ buyerRfqs.length }}</span>
      </button>
      <button :class="{ active: tab === 'seller' }" @click="tab = 'seller'">
        Received <span class="count">{{ sellerRfqs.length }}</span>
      </button>
      <button :class="{ active: tab === 'deliveries' }" @click="tab = 'deliveries'">
        Deliveries <span class="count">{{ deliveries.length }}</span>
      </button>
    </div>

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="loadError" class="notice error">
      {{ loadError }}<div><button class="retry-btn" @click="load">Try again</button></div>
    </div>

    <template v-else>
      <p v-if="actionError" class="notice error sm">{{ actionError }}</p>

      <!-- Buyer tab -->
      <section v-if="tab === 'buyer'">
        <div v-if="!buyerRfqs.length" class="empty">
          <span class="material-symbols-outlined empty-icon" aria-hidden="true">request_quote</span>
          <p class="muted">You haven't requested any feedstock quotes yet.</p>
          <router-link to="/biomass" class="btn-primary">Browse feedstock</router-link>
        </div>
        <div v-for="rfq in buyerRfqs" v-else :key="rfq.id" class="rfq-card">
          <div class="rfq-head">
            <div>
              <h3>{{ label(rfq) }}</h3>
              <div class="rfq-meta">{{ Number(rfq.quantity).toLocaleString('en-PH') }} {{ rfq.unit }} · requested {{ shortDate(rfq.created_at) }}</div>
            </div>
            <span class="badge" :class="rfq.status">{{ rfq.status }}</span>
          </div>
          <div v-if="rfq.delivery_location || rfq.needed_by" class="rfq-detail">
            <span v-if="rfq.delivery_location">Deliver to {{ rfq.delivery_location }}</span>
            <span v-if="rfq.needed_by"> · needed by {{ shortDate(rfq.needed_by) }}</span>
          </div>
          <p v-if="rfq.message" class="rfq-msg">"{{ rfq.message }}"</p>

          <div v-if="rfq.status === 'quoted'" class="quote-box">
            <div class="quote-price">Quoted: <strong>{{ peso(rfq.quoted_price_per_unit) }}/{{ rfq.unit }}</strong>
              <span class="quote-total">· est. {{ peso(rfq.quoted_total) }}</span>
            </div>
            <p v-if="rfq.quote_message" class="rfq-msg">Supplier: "{{ rfq.quote_message }}"</p>
            <div class="rfq-actions">
              <button class="btn-primary sm" :disabled="busyId === rfq.id" @click="respond(rfq, true)">Accept quote</button>
              <button class="btn-ghost sm" :disabled="busyId === rfq.id" @click="respond(rfq, false)">Decline</button>
            </div>
          </div>
          <div v-else-if="rfq.status === 'accepted'" class="quote-box ok">
            You accepted at <strong>{{ peso(rfq.quoted_price_per_unit) }}/{{ rfq.unit }}</strong> — arrange delivery with the supplier.
          </div>
          <div v-else-if="rfq.status === 'open'" class="rfq-actions">
            <button class="btn-ghost sm" :disabled="busyId === rfq.id" @click="cancel(rfq)">Cancel request</button>
          </div>
        </div>
      </section>

      <!-- Seller tab -->
      <section v-else-if="tab === 'seller'">
        <div v-if="!sellerRfqs.length" class="empty">
          <span class="material-symbols-outlined empty-icon" aria-hidden="true">inbox</span>
          <p class="muted">No incoming quote requests. List feedstock to start receiving them.</p>
          <router-link to="/biomass/sell" class="btn-primary">Sell feedstock</router-link>
        </div>
        <div v-for="rfq in sellerRfqs" v-else :key="rfq.id" class="rfq-card">
          <div class="rfq-head">
            <div>
              <h3>{{ label(rfq) }}</h3>
              <div class="rfq-meta">{{ Number(rfq.quantity).toLocaleString('en-PH') }} {{ rfq.unit }} · received {{ shortDate(rfq.created_at) }}</div>
            </div>
            <span class="badge" :class="rfq.status">{{ rfq.status }}</span>
          </div>
          <div v-if="rfq.delivery_location || rfq.needed_by" class="rfq-detail">
            <span v-if="rfq.delivery_location">Deliver to {{ rfq.delivery_location }}</span>
            <span v-if="rfq.needed_by"> · needed by {{ shortDate(rfq.needed_by) }}</span>
          </div>
          <p v-if="rfq.message" class="rfq-msg">"{{ rfq.message }}"</p>

          <div v-if="rfq.status === 'quoted'" class="quote-box">
            Quoted <strong>{{ peso(rfq.quoted_price_per_unit) }}/{{ rfq.unit }}</strong> · est. {{ peso(rfq.quoted_total) }}
            <button class="link-btn" :disabled="busyId === rfq.id" @click="openQuote(rfq)">Revise</button>
          </div>
          <div v-else-if="rfq.status === 'accepted'" class="quote-box ok">
            Buyer accepted your {{ peso(rfq.quoted_price_per_unit) }}/{{ rfq.unit }} quote — arrange delivery.
          </div>
          <div v-else-if="rfq.status === 'open'" class="rfq-actions">
            <button class="btn-primary sm" :disabled="busyId === rfq.id" @click="openQuote(rfq)">Send quote</button>
          </div>
        </div>
      </section>

      <!-- Deliveries tab (buyer confirms receipt, then records payment) -->
      <section v-else>
        <div v-if="!deliveries.length" class="empty">
          <span class="material-symbols-outlined empty-icon" aria-hidden="true">local_shipping</span>
          <p class="muted">
            No deliveries yet. Once you accept a quote, the supplier logs deliveries here for you to
            confirm.
          </p>
        </div>
        <div v-for="d in deliveries" v-else :key="d.id" class="rfq-card">
          <div class="rfq-head">
            <div>
              <h3>{{ Number(d.quantity).toLocaleString('en-PH') }} {{ d.unit }}</h3>
              <div class="rfq-meta">Delivered {{ shortDate(d.delivered_on) }}</div>
            </div>
            <div class="badges">
              <span class="badge" :class="d.status">{{ d.status }}</span>
              <span v-if="d.status === 'confirmed'" class="badge" :class="d.payment_status">
                {{ d.payment_status }}
              </span>
            </div>
          </div>
          <div class="rfq-detail">
            <span v-if="d.total_amount != null">Value {{ peso(d.total_amount) }}</span>
            <span v-if="d.price_per_unit != null"> · {{ peso(d.price_per_unit) }}/{{ d.unit }}</span>
            <span v-if="d.proof_docs?.length"> · {{ d.proof_docs.length }} proof file(s)</span>
          </div>
          <p v-if="d.note" class="rfq-msg">"{{ d.note }}"</p>

          <div v-if="d.status === 'pending'" class="rfq-actions">
            <button class="btn-primary sm" :disabled="busyId === d.id" @click="openConfirm(d)">
              Confirm receipt
            </button>
            <button class="btn-ghost sm" :disabled="busyId === d.id" @click="reviewDelivery(d, false)">
              Reject
            </button>
          </div>
          <div v-else-if="d.status === 'confirmed' && d.payment_status === 'unpaid'" class="quote-box">
            Confirmed — <strong>{{ peso(d.total_amount) }}</strong> owed to the supplier.
            <div class="rfq-actions">
              <button class="btn-primary sm" :disabled="busyId === d.id" @click="openPay(d)">
                Mark as paid
              </button>
            </div>
          </div>
          <div v-else-if="d.payment_status === 'paid'" class="quote-box ok">
            Paid {{ shortDate(d.paid_at) }}<span v-if="d.payment_reference"> · ref {{ d.payment_reference }}</span>
          </div>
        </div>
      </section>
    </template>

    <!-- Confirm-receipt modal -->
    <div v-if="confirmDeliveryRow" class="modal-overlay" @click.self="confirmDeliveryRow = null">
      <div class="modal">
        <h2>Confirm receipt</h2>
        <p class="muted small">
          {{ Number(confirmDeliveryRow.quantity).toLocaleString('en-PH') }} {{ confirmDeliveryRow.unit }}
          delivered {{ shortDate(confirmDeliveryRow.delivered_on) }}
        </p>

        <div v-if="myProjects.length" class="form-row">
          <label for="confirm-project">Which project did this feedstock feed?</label>
          <select id="confirm-project" v-model="confirmProjectId">
            <option value="">Not specified</option>
            <option v-for="p in myProjects" :key="p.id" :value="p.id">{{ p.title }}</option>
          </select>
          <span class="muted small">
            Naming the project lets the supplier see the carbon their feedstock contributed to. Leave
            it blank and the delivery simply won't be attributed.
          </span>
        </div>
        <p v-else class="muted small">
          You have no projects, so this delivery can't be attributed to one.
        </p>

        <p v-if="actionError" class="notice error sm">{{ actionError }}</p>
        <div class="modal-actions">
          <button class="btn-ghost" @click="confirmDeliveryRow = null">Cancel</button>
          <button
            class="btn-primary"
            :disabled="busyId === confirmDeliveryRow.id"
            @click="reviewDelivery(confirmDeliveryRow, true, confirmProjectId)"
          >
            {{ busyId === confirmDeliveryRow.id ? 'Confirming…' : 'Confirm receipt' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Mark-paid modal -->
    <div v-if="payDelivery" class="modal-overlay" @click.self="payDelivery = null">
      <div class="modal">
        <h2>Mark delivery as paid</h2>
        <p class="muted small">
          {{ Number(payDelivery.quantity).toLocaleString('en-PH') }} {{ payDelivery.unit }} ·
          {{ peso(payDelivery.total_amount) }}
        </p>
        <p class="muted small note-box">
          This records that you settled with the supplier outside Carbonify. It does not move money.
        </p>
        <div class="form-row">
          <label for="pay-ref">Payment reference <span class="opt">(optional)</span></label>
          <input id="pay-ref" v-model="payReference" type="text" placeholder="Bank transfer ref, GCash no., cheque…" />
        </div>
        <p v-if="actionError" class="notice error sm">{{ actionError }}</p>
        <div class="modal-actions">
          <button class="btn-ghost" @click="payDelivery = null">Cancel</button>
          <button class="btn-primary" :disabled="busyId === payDelivery.id" @click="confirmPayment">
            {{ busyId === payDelivery.id ? 'Saving…' : 'Mark as paid' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Quote modal -->
    <div v-if="quoteRfq" class="modal-overlay" @click.self="quoteRfq = null">
      <div class="modal">
        <h2>Quote this request</h2>
        <p class="muted small">{{ label(quoteRfq) }} · {{ Number(quoteRfq.quantity).toLocaleString('en-PH') }} {{ quoteRfq.unit }}</p>
        <div class="form-row">
          <label for="quote-price">Price per {{ quoteRfq.unit }}</label>
          <input id="quote-price" v-model.number="quoteForm.price_per_unit" type="number" min="0" step="any" placeholder="e.g. 1500" />
        </div>
        <div v-if="Number(quoteForm.price_per_unit) > 0" class="estimate">
          Total for {{ Number(quoteRfq.quantity).toLocaleString('en-PH') }} {{ quoteRfq.unit }}:
          <strong>{{ peso(Number(quoteForm.price_per_unit) * Number(quoteRfq.quantity)) }}</strong>
        </div>
        <div class="form-row">
          <label for="quote-message">Message <span class="opt">(optional)</span></label>
          <textarea id="quote-message" v-model="quoteForm.message" rows="3" placeholder="Delivery terms, lead time, packaging…"></textarea>
        </div>
        <p v-if="actionError" class="notice error sm">{{ actionError }}</p>
        <div class="modal-actions">
          <button class="btn-ghost" @click="quoteRfq = null">Cancel</button>
          <button class="btn-primary" :disabled="busyId === quoteRfq.id" @click="sendQuote">
            {{ busyId === quoteRfq.id ? 'Sending…' : 'Send quote' }}
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.rfqs { min-height: 100vh; background: var(--bg-secondary, #f8fdf8); }
.page-body { max-width: 820px; margin: 0 auto; padding: 24px 16px; }
.page-head h1 { margin: 0; font-size: 1.6rem; }
.page-head p { color: #6b7280; margin: 4px 0 20px; }
.muted { color: #6b7280; }
.small { font-size: 0.8rem; }
.tabs { display: flex; gap: 6px; margin-bottom: 20px; border-bottom: 1px solid #e5e7eb; }
.tabs button {
  background: none; border: none; padding: 10px 16px; cursor: pointer; font-weight: 600;
  color: #6b7280; border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.tabs button.active { color: #069e2d; border-bottom-color: #069e2d; }
.count { background: #e5e7eb; color: #374151; border-radius: 999px; padding: 1px 8px; font-size: 0.75rem; margin-left: 4px; }
.notice { padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; }
.notice.error { background: #fee2e2; color: #991b1b; }
.notice.sm { padding: 8px 12px; font-size: 0.85rem; }
.retry-btn { margin-top: 8px; padding: 6px 14px; border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 8px; font-weight: 600; cursor: pointer; }
.rfq-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
.rfq-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.rfq-head h3 { margin: 0 0 4px; font-size: 1.05rem; }
.rfq-meta { color: #6b7280; font-size: 0.82rem; }
.rfq-detail { color: #6b7280; font-size: 0.82rem; margin-top: 8px; }
.rfq-msg { color: #4b5563; font-size: 0.87rem; font-style: italic; margin: 8px 0 0; }
.quote-box { margin-top: 12px; padding: 12px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; font-size: 0.9rem; }
.quote-box.ok { background: #ecfdf5; }
.quote-price { font-size: 0.95rem; }
.quote-total { color: #6b7280; font-weight: 400; }
.rfq-actions { margin-top: 12px; display: flex; gap: 8px; }
.badge { padding: 3px 10px; border-radius: 999px; font-size: 0.75rem; text-transform: capitalize; background: #e5e7eb; color: #374151; height: fit-content; }
.badge.open { background: #dbeafe; color: #1e40af; }
.badge.quoted { background: #fef3c7; color: #92400e; }
.badge.accepted { background: #d1fae5; color: #065f46; }
.badge.declined, .badge.closed { background: #f3f4f6; color: #6b7280; }
.badge.pending, .badge.unpaid { background: #fef3c7; color: #92400e; }
.badge.confirmed, .badge.paid { background: #d1fae5; color: #065f46; }
.badge.rejected { background: #fee2e2; color: #991b1b; }
.badges { display: flex; gap: 6px; }
.note-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; margin-top: 10px; }
.btn-primary { background: #069e2d; color: #fff; border: none; border-radius: 8px; padding: 9px 16px; cursor: pointer; font-weight: 600; text-decoration: none; display: inline-block; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary.sm { padding: 7px 12px; font-size: 0.85rem; }
.btn-ghost { background: #fff; color: #374151; border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 16px; cursor: pointer; font-weight: 600; }
.btn-ghost.sm { padding: 7px 12px; font-size: 0.85rem; }
.link-btn { background: none; border: none; color: #069e2d; font-weight: 600; cursor: pointer; font-size: 0.85rem; margin-left: 8px; }
.empty { text-align: center; padding: 48px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
.empty-icon { font-size: 48px; color: #069e2d; }
.empty p { margin: 12px auto 18px; max-width: 380px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 16px; padding: 24px; max-width: 460px; width: 100%; max-height: 90vh; overflow-y: auto; }
.modal h2 { margin: 0 0 4px; }
.form-row { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 0.85rem; font-weight: 600; color: #374151; }
.form-row .opt { font-weight: 400; color: #9ca3af; }
.form-row input, .form-row select, .form-row textarea { padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.9rem; font-family: inherit; }
.estimate { margin-top: 8px; font-size: 0.85rem; color: #065f46; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
</style>
