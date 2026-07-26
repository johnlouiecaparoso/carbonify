<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import {
  getMyParcels,
  createParcel,
  setParcelStatus,
  deleteParcel,
  getMyAcceptedRfqs,
  getMyDeliveries,
  recordDelivery,
  uploadDeliveryProof,
  estimateDeliveryTotal,
  aggregateFarmerDeliveries,
  aggregateParcels,
  getMyCarbonParticipation,
  unattributableDeliveries,
  aggregateParcelPerformance,
} from '@/services/farmerService'
import { FARM_CROP_TYPES, PARCEL_STATUSES, cropTypeLabel } from '@/constants/farmer'
import { biomassTypeLabel } from '@/constants/biomass'

const loading = ref(true)
const loadError = ref('')
const tab = ref('parcels') // 'parcels' | 'deliveries' | 'carbon'
const parcels = ref([])
const deliveries = ref([])
const acceptedRfqs = ref([])
const carbon = ref([])
const busyId = ref(null)
const actionError = ref('')
const sectionErrors = ref({ parcels: false, deliveries: false, rfqs: false })

// Parcel form (inline)
const showParcelForm = ref(false)
const parcelForm = ref(emptyParcel())
const savingParcel = ref(false)

// Delivery modal
const deliveryRfq = ref(null)
const deliveryForm = ref(emptyDelivery())
const savingDelivery = ref(false)
const uploadingProof = ref(false)

function emptyParcel() {
  return {
    name: '',
    crop_type: '',
    area_hectares: '',
    expected_yield_tonnes: '',
    location: '',
    region: '',
    latitude: '',
    longitude: '',
    planted_on: '',
    notes: '',
    status: 'active',
  }
}

function emptyDelivery() {
  return {
    quantity: '',
    unit: '',
    delivered_on: '',
    parcel_id: '',
    price_per_unit: '',
    proof_docs: [],
    note: '',
  }
}

const summary = computed(() => aggregateFarmerDeliveries(deliveries.value))
const parcelStats = computed(() => aggregateParcels(parcels.value))
const totalAttributed = computed(() =>
  Math.round(carbon.value.reduce((s, c) => s + (Number(c.attributedTco2e) || 0), 0) * 1000) / 1000,
)
const excluded = computed(() => unattributableDeliveries(deliveries.value))

const anySectionFailed = computed(() => Object.values(sectionErrors.value).some(Boolean))

/** "deliveries", "parcels and deliveries", … — named so the warning is specific. */
const failedSectionLabel = computed(() => {
  const parts = []
  if (sectionErrors.value.parcels) parts.push('parcels')
  if (sectionErrors.value.deliveries) parts.push('deliveries')
  if (sectionErrors.value.rfqs) parts.push('accepted quotes')
  if (parts.length <= 1) return parts[0] || 'farm data'
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
})

/** parcelId → { performance, deliveredTrailingYear, … } for the parcel cards. */
const performanceByParcel = computed(() => {
  const rows = aggregateParcelPerformance(parcels.value, deliveries.value)
  return Object.fromEntries(rows.map((r) => [r.parcelId, r]))
})

/** Under 80% of expectation is worth flagging; over 100% is worth celebrating. */
function performanceTone(perf) {
  if (perf == null) return ''
  if (perf >= 1) return 'good'
  if (perf < 0.8) return 'low'
  return 'ok'
}

function peso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function qty(n) {
  return Number(n || 0).toLocaleString('en-PH')
}
function shortDate(d) {
  return d
    ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'
}
function rfqLabel(rfq) {
  return `${biomassTypeLabel(rfq.product_type)}${rfq.product_title ? ' · ' + rfq.product_title : ''}`
}

const deliveryEstimate = computed(() =>
  estimateDeliveryTotal(
    deliveryForm.value.price_per_unit || deliveryRfq.value?.quoted_price_per_unit,
    deliveryForm.value.quantity,
  ),
)

async function load() {
  loading.value = true
  loadError.value = ''

  // allSettled, not all: these are four independent parts of one farm. A
  // farmer on a rural connection should not lose their parcels because the
  // deliveries query timed out, and — more importantly — an empty list must not
  // be presented as a fact about their farm. Every read below now throws on
  // failure instead of returning [], so a rejection here is a real failure and
  // an empty array is a real emptiness.
  const [p, d, r, c] = await Promise.allSettled([
    getMyParcels(),
    getMyDeliveries(),
    getMyAcceptedRfqs(),
    getMyCarbonParticipation(),
  ])

  if (p.status === 'fulfilled') parcels.value = p.value || []
  if (d.status === 'fulfilled') deliveries.value = d.value || []
  if (r.status === 'fulfilled') acceptedRfqs.value = r.value || []
  // Carbon participation degrades to [] inside the service by design (it is
  // gated on migration #31), so it never rejects and needs no branch here.
  if (c.status === 'fulfilled') carbon.value = c.value || []

  sectionErrors.value = {
    parcels: p.status === 'rejected',
    deliveries: d.status === 'rejected',
    rfqs: r.status === 'rejected',
  }
  for (const [label, res] of [['parcels', p], ['deliveries', d], ['accepted quotes', r]]) {
    if (res.status === 'rejected') console.error(`Failed to load ${label}:`, res.reason)
  }

  // Only a total failure replaces the page; anything partial is reported in the
  // section it belongs to, so the rest of the farm stays usable.
  if (p.status === 'rejected' && d.status === 'rejected' && r.status === 'rejected') {
    loadError.value =
      p.reason?.message || 'We could not load your farm data right now.'
  }

  loading.value = false
}

async function saveParcel() {
  savingParcel.value = true
  actionError.value = ''
  try {
    const created = await createParcel(parcelForm.value)
    parcels.value.unshift(created)
    parcelForm.value = emptyParcel()
    showParcelForm.value = false
  } catch (err) {
    actionError.value = err?.message || 'Could not register the parcel.'
  } finally {
    savingParcel.value = false
  }
}

async function changeParcelStatus(parcel, status) {
  busyId.value = parcel.id
  actionError.value = ''
  try {
    const updated = await setParcelStatus(parcel.id, status)
    const i = parcels.value.findIndex((p) => p.id === updated.id)
    if (i !== -1) parcels.value[i] = updated
  } catch (err) {
    actionError.value = err?.message || 'Could not update the parcel.'
  } finally {
    busyId.value = null
  }
}

async function removeParcel(parcel) {
  // Deleting a parcel was a single click with no confirmation — on the portal
  // whose users are least likely to expect an irreversible action to be one tap
  // away, while the developer dashboard confirms before deleting a project.
  //
  // farmer_deliveries.parcel_id is ON DELETE SET NULL, so the delivery and
  // earnings records survive; what is lost for good is the link between them
  // and the land they came from, and aggregateParcelPerformance skips any
  // delivery without a parcel_id. So the yield history for this parcel
  // disappears. Say that, with the count, rather than just "are you sure?".
  const linked = deliveries.value.filter((d) => d.parcel_id === parcel.id).length
  const consequence = linked
    ? `\n\n${linked} recorded ${linked === 1 ? 'delivery stays' : 'deliveries stay'} in your history, but ${linked === 1 ? 'it' : 'they'} will no longer count towards this parcel's yield performance.`
    : ''

  if (!window.confirm(`Delete the parcel "${parcel.name}"? This cannot be undone.${consequence}`)) {
    return
  }

  busyId.value = parcel.id
  actionError.value = ''
  try {
    await deleteParcel(parcel.id)
    parcels.value = parcels.value.filter((p) => p.id !== parcel.id)
  } catch (err) {
    actionError.value = err?.message || 'Could not delete the parcel.'
  } finally {
    busyId.value = null
  }
}

function openDelivery(rfq) {
  deliveryRfq.value = rfq
  deliveryForm.value = emptyDelivery()
  deliveryForm.value.unit = rfq.unit || 'tonnes'
  deliveryForm.value.quantity = rfq.quantity ?? ''
  actionError.value = ''
}

async function attachProof(event) {
  const file = event.target?.files?.[0]
  if (!file) return
  uploadingProof.value = true
  actionError.value = ''
  try {
    const doc = await uploadDeliveryProof(file)
    deliveryForm.value.proof_docs.push(doc)
  } catch (err) {
    actionError.value = err?.message || 'Could not upload that file.'
  } finally {
    uploadingProof.value = false
    if (event.target) event.target.value = ''
  }
}

async function submitDelivery() {
  savingDelivery.value = true
  actionError.value = ''
  try {
    const created = await recordDelivery({
      rfq: deliveryRfq.value,
      quantity: deliveryForm.value.quantity,
      unit: deliveryForm.value.unit,
      delivered_on: deliveryForm.value.delivered_on || null,
      parcel_id: deliveryForm.value.parcel_id || null,
      price_per_unit: deliveryForm.value.price_per_unit,
      proof_docs: deliveryForm.value.proof_docs,
      note: deliveryForm.value.note,
    })
    deliveries.value.unshift(created)
    deliveryRfq.value = null
    tab.value = 'deliveries'
  } catch (err) {
    actionError.value = err?.message || 'Could not record the delivery.'
  } finally {
    savingDelivery.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="farmer">
    <PageHeader
      title="Farmer Portal"
      description="Register your plantation parcels, log feedstock deliveries against accepted quotes, and track what you've been paid."
    />

    <div class="page-body">

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="loadError" class="notice error">
      {{ loadError }}
      <div><button class="retry-btn" @click="load">Try again</button></div>
    </div>

    <template v-else>
      <!-- The stat strip is computed from whatever loaded, so a failed section
           renders as PHP 0.00 and 0 ha — the most confident-looking numbers on
           the page, and wrong. The per-section notices further down explain
           each failure in place, but a farmer reads these figures first, so the
           warning has to be here too. -->
      <div v-if="anySectionFailed" class="notice warn" role="alert">
        <span class="material-symbols-outlined" aria-hidden="true">warning</span>
        <div>
          <strong>These totals are incomplete.</strong>
          We couldn't load your {{ failedSectionLabel }}, so the figures below are lower than your
          real ones — they are not what you have earned or delivered.
          <button class="link-retry" @click="load">Try again</button>
        </div>
      </div>

      <!-- Headline numbers -->
      <div class="stats">
        <div class="stat">
          <span class="stat-label">Paid to date</span>
          <span class="stat-value">{{ peso(summary.totalEarned) }}</span>
          <span class="stat-sub">{{ summary.paidCount }} settled</span>
        </div>
        <div class="stat">
          <!-- "Owed by buyers", not "Awaiting payment": nothing is queued to
               pay out here. Carbonify holds no money for the farmer and settles
               nothing — the buyer pays them directly (backlog #26). -->
          <span class="stat-label">Owed by buyers</span>
          <span class="stat-value owed">{{ peso(summary.amountOwed) }}</span>
          <span class="stat-sub">{{ summary.confirmedCount - summary.paidCount }} confirmed, unpaid</span>
        </div>
        <div class="stat">
          <span class="stat-label">Delivered</span>
          <span class="stat-value">{{ qty(summary.quantityDelivered) }}</span>
          <span class="stat-sub">{{ summary.pendingCount }} awaiting confirmation</span>
        </div>
        <div class="stat">
          <span class="stat-label">Land under crop</span>
          <span class="stat-value">{{ qty(parcelStats.totalHectares) }} ha</span>
          <span class="stat-sub">{{ parcelStats.activeCount }} active parcels</span>
        </div>
        <div v-if="carbon.length" class="stat">
          <span class="stat-label">Carbon contribution</span>
          <span class="stat-value">{{ qty(totalAttributed) }}</span>
          <span class="stat-sub">tCO₂e, estimated</span>
        </div>
      </div>

      <div class="tabs">
        <button :class="{ active: tab === 'parcels' }" @click="tab = 'parcels'">
          My parcels <span class="count">{{ parcels.length }}</span>
        </button>
        <button :class="{ active: tab === 'deliveries' }" @click="tab = 'deliveries'">
          Deliveries <span class="count">{{ deliveries.length }}</span>
        </button>
        <button :class="{ active: tab === 'carbon' }" @click="tab = 'carbon'">
          Carbon <span class="count">{{ carbon.length }}</span>
        </button>
      </div>

      <p v-if="actionError" class="notice error sm">{{ actionError }}</p>

      <!-- Parcels -->
      <section v-if="tab === 'parcels'">
        <div class="section-head">
          <h2>Plantation parcels</h2>
          <button v-if="!showParcelForm" class="btn-primary sm" @click="showParcelForm = true">
            Add parcel
          </button>
        </div>

        <div v-if="showParcelForm" class="card form-card">
          <div class="grid-2">
            <div class="form-row">
              <label for="p-name">Parcel name</label>
              <input id="p-name" v-model="parcelForm.name" type="text" placeholder="e.g. Lot 3, Barangay Malaya" />
            </div>
            <div class="form-row">
              <label for="p-crop">Crop type</label>
              <select id="p-crop" v-model="parcelForm.crop_type">
                <option value="">Select a crop…</option>
                <option v-for="c in FARM_CROP_TYPES" :key="c.value" :value="c.value">{{ c.label }}</option>
              </select>
            </div>
            <div class="form-row">
              <label for="p-area">Area (hectares)</label>
              <input id="p-area" v-model.number="parcelForm.area_hectares" type="number" min="0" step="any" />
            </div>
            <div class="form-row">
              <label for="p-yield">Expected yield (tonnes/yr)</label>
              <input id="p-yield" v-model.number="parcelForm.expected_yield_tonnes" type="number" min="0" step="any" />
            </div>
            <div class="form-row">
              <label for="p-loc">Location</label>
              <input id="p-loc" v-model="parcelForm.location" type="text" placeholder="Barangay, municipality" />
            </div>
            <div class="form-row">
              <label for="p-region">Region</label>
              <input id="p-region" v-model="parcelForm.region" type="text" placeholder="e.g. Region IV-A" />
            </div>
            <div class="form-row">
              <label for="p-lat">Latitude <span class="opt">(optional)</span></label>
              <input id="p-lat" v-model.number="parcelForm.latitude" type="number" step="any" />
            </div>
            <div class="form-row">
              <label for="p-lng">Longitude <span class="opt">(optional)</span></label>
              <input id="p-lng" v-model.number="parcelForm.longitude" type="number" step="any" />
            </div>
            <div class="form-row">
              <label for="p-planted">Planted on <span class="opt">(optional)</span></label>
              <input id="p-planted" v-model="parcelForm.planted_on" type="date" />
            </div>
            <div class="form-row">
              <label for="p-status">Status</label>
              <select id="p-status" v-model="parcelForm.status">
                <option v-for="s in PARCEL_STATUSES" :key="s" :value="s">{{ s }}</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <label for="p-notes">Notes <span class="opt">(optional)</span></label>
            <textarea id="p-notes" v-model="parcelForm.notes" rows="2" placeholder="Soil, irrigation, harvest window…"></textarea>
          </div>
          <div class="modal-actions">
            <button class="btn-ghost" @click="showParcelForm = false">Cancel</button>
            <button class="btn-primary" :disabled="savingParcel" @click="saveParcel">
              {{ savingParcel ? 'Saving…' : 'Register parcel' }}
            </button>
          </div>
        </div>

        <div v-if="sectionErrors.parcels" class="notice error sm">
          We couldn't load your parcels — this is not the same as having none, so please don't
          re-register land you already have.
          <button class="link-retry" @click="load">Try again</button>
        </div>

        <div v-else-if="!parcels.length && !showParcelForm" class="empty">
          <span class="material-symbols-outlined empty-icon" aria-hidden="true">agriculture</span>
          <p class="muted">No parcels registered yet. Add your first plantation parcel to get started.</p>
          <button class="btn-primary" @click="showParcelForm = true">Add parcel</button>
        </div>

        <div v-for="parcel in parcels" :key="parcel.id" class="card">
          <div class="card-head">
            <div>
              <h3>{{ parcel.name }}</h3>
              <div class="meta">
                {{ cropTypeLabel(parcel.crop_type) }}
                <span v-if="parcel.area_hectares"> · {{ qty(parcel.area_hectares) }} ha</span>
                <span v-if="parcel.location"> · {{ parcel.location }}</span>
              </div>
            </div>
            <span class="badge" :class="parcel.status">{{ parcel.status }}</span>
          </div>
          <div class="detail">
            <span v-if="parcel.expected_yield_tonnes">
              Expected yield {{ qty(parcel.expected_yield_tonnes) }} t/yr
            </span>
            <span v-if="parcel.planted_on"> · planted {{ shortDate(parcel.planted_on) }}</span>
          </div>

          <!-- Actual vs expected, over the trailing 12 months -->
          <div v-if="performanceByParcel[parcel.id]?.deliveryCount" class="perf">
            <div class="perf-head">
              <span class="perf-label">Last 12 months</span>
              <span class="perf-value" :class="performanceTone(performanceByParcel[parcel.id].performance)">
                {{ qty(performanceByParcel[parcel.id].deliveredTrailingYear) }} t
                <template v-if="performanceByParcel[parcel.id].performance != null">
                  · {{ (performanceByParcel[parcel.id].performance * 100).toFixed(0) }}% of expected
                </template>
              </span>
            </div>
            <div v-if="performanceByParcel[parcel.id].expectedAnnual" class="bar">
              <div
                class="bar-fill"
                :class="performanceTone(performanceByParcel[parcel.id].performance)"
                :style="{ width: Math.min(100, performanceByParcel[parcel.id].performance * 100) + '%' }"
              ></div>
            </div>
            <div class="muted small">
              {{ qty(performanceByParcel[parcel.id].deliveredLifetime) }} t delivered in total
              across {{ performanceByParcel[parcel.id].deliveryCount }} delivery(ies)<span
                v-if="performanceByParcel[parcel.id].lastDeliveredOn"
              >
                · last {{ shortDate(performanceByParcel[parcel.id].lastDeliveredOn) }}</span
              >
            </div>
          </div>

          <p v-if="parcel.notes" class="note">"{{ parcel.notes }}"</p>
          <div class="actions">
            <button
              v-if="parcel.status !== 'active'"
              class="btn-ghost sm"
              :disabled="busyId === parcel.id"
              @click="changeParcelStatus(parcel, 'active')"
            >
              Mark active
            </button>
            <button
              v-if="parcel.status === 'active'"
              class="btn-ghost sm"
              :disabled="busyId === parcel.id"
              @click="changeParcelStatus(parcel, 'fallow')"
            >
              Mark fallow
            </button>
            <button class="btn-ghost sm danger" :disabled="busyId === parcel.id" @click="removeParcel(parcel)">
              Delete
            </button>
          </div>
        </div>
      </section>

      <!-- Deliveries -->
      <section v-else-if="tab === 'deliveries'">
        <div class="section-head">
          <h2>Deliveries</h2>
        </div>

        <!-- Accepted quotes ready to deliver against -->
        <div v-if="acceptedRfqs.length" class="card ready">
          <h3 class="ready-title">Accepted quotes — ready to deliver</h3>
          <div v-for="rfq in acceptedRfqs" :key="rfq.id" class="ready-row">
            <div>
              <strong>{{ rfqLabel(rfq) }}</strong>
              <div class="meta">
                {{ qty(rfq.quantity) }} {{ rfq.unit }} at {{ peso(rfq.quoted_price_per_unit) }}/{{ rfq.unit }}
                <span v-if="rfq.needed_by"> · needed by {{ shortDate(rfq.needed_by) }}</span>
              </div>
            </div>
            <button class="btn-primary sm" @click="openDelivery(rfq)">Log delivery</button>
          </div>
        </div>
        <div v-else-if="sectionErrors.rfqs" class="notice error sm">
          We couldn't load your accepted quotes, so logging a delivery is unavailable right now. If a
          buyer has accepted a quote, it is still there — this is a problem on our side.
          <button class="link-retry" @click="load">Try again</button>
        </div>
        <div v-else class="notice info sm">
          You have no accepted quotes yet. Deliveries are logged against an accepted quote —
          <router-link to="/biomass/sell">list your feedstock</router-link> so buyers can request one.
        </div>

        <div v-if="sectionErrors.deliveries" class="notice error sm">
          We couldn't load your deliveries, so the totals above are incomplete — they are not your
          real earnings.
          <button class="link-retry" @click="load">Try again</button>
        </div>

        <div v-else-if="!deliveries.length" class="empty">
          <span class="material-symbols-outlined empty-icon" aria-hidden="true">local_shipping</span>
          <p class="muted">No deliveries logged yet.</p>
        </div>

        <div v-for="d in deliveries" :key="d.id" class="card">
          <div class="card-head">
            <div>
              <h3>{{ qty(d.quantity) }} {{ d.unit }}</h3>
              <div class="meta">Delivered {{ shortDate(d.delivered_on) }}</div>
            </div>
            <div class="badges">
              <span class="badge" :class="d.status">{{ d.status }}</span>
              <span v-if="d.status === 'confirmed'" class="badge" :class="d.payment_status">
                {{ d.payment_status }}
              </span>
            </div>
          </div>
          <div class="detail">
            <span v-if="d.total_amount != null">Value {{ peso(d.total_amount) }}</span>
            <span v-if="d.price_per_unit != null"> · {{ peso(d.price_per_unit) }}/{{ d.unit }}</span>
            <span v-if="d.proof_docs?.length"> · {{ d.proof_docs.length }} proof file(s)</span>
          </div>
          <p v-if="d.note" class="note">"{{ d.note }}"</p>
          <div v-if="d.status === 'rejected' && d.decision_note" class="notice error sm inline">
            Buyer rejected: {{ d.decision_note }}
          </div>
          <!-- "Paid" here is the BUYER's assertion, not a settled platform
               payment: mark_farmer_delivery_paid only sets a flag and stores a
               reference — no money moves through Carbonify (backlog #26). Saying
               so plainly is the difference between a record and a receipt, and
               the farmer is the one who bears the cost of confusing them. -->
          <div v-else-if="d.payment_status === 'paid'" class="notice ok sm inline">
            <div>
              Buyer recorded payment {{ shortDate(d.paid_at) }}<span v-if="d.payment_reference"> · ref {{ d.payment_reference }}</span>
            </div>
            <div class="paid-caveat">
              Payment is made directly by the buyer, not through Carbonify — check that you actually
              received it.
            </div>
          </div>
        </div>
      </section>

      <!-- Carbon participation -->
      <section v-else>
        <div class="section-head">
          <h2>Your carbon contribution</h2>
        </div>

        <div class="notice info">
          <span class="material-symbols-outlined" aria-hidden="true">info</span>
          <div>
            <strong>This is an estimate, not carbon credits you own.</strong>
            You supplied part of the biomass a project used, so part of the carbon that project
            <em>verified</em> is attributed to you — in proportion to the tonnes you delivered. You
            cannot sell or retire it; the project developer holds the credits.
          </div>
        </div>

        <div v-if="!carbon.length" class="empty">
          <span class="material-symbols-outlined empty-icon" aria-hidden="true">eco</span>
          <p class="muted">
            No carbon attributed yet. It appears once a buyer confirms a delivery, names the project
            it fed, and that project has verified emission reductions.
          </p>
        </div>

        <div v-for="c in carbon" :key="c.projectId" class="card">
          <div class="card-head">
            <div>
              <h3>{{ c.projectTitle }}</h3>
              <div class="meta">
                You delivered {{ qty(c.farmerTonnes) }} of {{ qty(c.projectTonnes) }} tonnes
                ({{ (c.share * 100).toFixed(1) }}% of this project's feedstock)
              </div>
            </div>
            <span class="carbon-badge">{{ qty(c.attributedTco2e) }} tCO₂e</span>
          </div>
          <div class="bar" role="img" :aria-label="`${(c.share * 100).toFixed(1)} percent of this project's feedstock`">
            <div class="bar-fill" :style="{ width: Math.min(100, c.share * 100) + '%' }"></div>
          </div>
          <div class="detail">
            Project has verified {{ qty(c.projectVerifiedTco2e) }} tCO₂e in total.
            <span v-if="!c.projectVerifiedTco2e">
              Nothing verified yet — your share is recorded and will convert once it is.
            </span>
          </div>
        </div>

        <div v-if="excluded.nonMassUnits || excluded.unattributedProject" class="notice warn">
          <span class="material-symbols-outlined" aria-hidden="true">warning</span>
          <div>
            <strong>Some deliveries couldn't be counted.</strong>
            <ul class="excl-list">
              <li v-if="excluded.nonMassUnits">
                {{ excluded.nonMassUnits }} delivery(ies) measured in sacks, bales or m³. Their weight
                depends on the feedstock, so we can't convert them to tonnes without guessing — and a
                guess would change every other farmer's share too.
              </li>
              <li v-if="excluded.unattributedProject">
                {{ excluded.unattributedProject }} delivery(ies) where the buyer didn't say which
                project the feedstock fed. Ask them to name it.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </template>

    <!-- Log-delivery modal -->
    <div v-if="deliveryRfq" class="modal-overlay" @click.self="deliveryRfq = null">
      <div class="modal">
        <h2>Log a delivery</h2>
        <p class="muted small">
          {{ rfqLabel(deliveryRfq) }} · quote {{ peso(deliveryRfq.quoted_price_per_unit) }}/{{ deliveryRfq.unit }}
        </p>

        <div class="form-row">
          <label for="d-qty">Quantity delivered ({{ deliveryForm.unit }})</label>
          <input id="d-qty" v-model.number="deliveryForm.quantity" type="number" min="0" step="any" />
        </div>
        <div class="form-row">
          <label for="d-date">Delivered on</label>
          <input id="d-date" v-model="deliveryForm.delivered_on" type="date" />
        </div>
        <div class="form-row">
          <label for="d-parcel">From parcel <span class="opt">(optional)</span></label>
          <select id="d-parcel" v-model="deliveryForm.parcel_id">
            <option value="">Not specified</option>
            <option v-for="p in parcels" :key="p.id" :value="p.id">
              {{ p.name }} — {{ cropTypeLabel(p.crop_type) }}
            </option>
          </select>
        </div>
        <div class="form-row">
          <label for="d-price">Price per {{ deliveryForm.unit }} <span class="opt">(defaults to the quoted price)</span></label>
          <input
            id="d-price"
            v-model.number="deliveryForm.price_per_unit"
            type="number"
            min="0"
            step="any"
            :placeholder="String(deliveryRfq.quoted_price_per_unit ?? '')"
          />
        </div>
        <div v-if="deliveryEstimate" class="estimate">
          Delivery value: <strong>{{ peso(deliveryEstimate) }}</strong>
        </div>

        <div class="form-row">
          <label for="d-proof">Proof of delivery <span class="opt">(photo or receipt)</span></label>
          <input id="d-proof" type="file" accept="image/*,application/pdf" :disabled="uploadingProof" @change="attachProof" />
          <span v-if="uploadingProof" class="muted small">Uploading…</span>
          <ul v-if="deliveryForm.proof_docs.length" class="proof-list">
            <li v-for="doc in deliveryForm.proof_docs" :key="doc.path">{{ doc.name }}</li>
          </ul>
        </div>

        <div class="form-row">
          <label for="d-note">Note <span class="opt">(optional)</span></label>
          <textarea id="d-note" v-model="deliveryForm.note" rows="2" placeholder="Truck plate, weighbridge ticket, moisture…"></textarea>
        </div>

        <p v-if="actionError" class="notice error sm">{{ actionError }}</p>
        <div class="modal-actions">
          <button class="btn-ghost" @click="deliveryRfq = null">Cancel</button>
          <button class="btn-primary" :disabled="savingDelivery || uploadingProof" @click="submitDelivery">
            {{ savingDelivery ? 'Saving…' : 'Log delivery' }}
          </button>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.farmer { min-height: 100vh; background: var(--bg-secondary, #f8fdf8); }
.page-body { max-width: 900px; margin: 0 auto; padding: 24px 16px; }
.muted { color: #6b7280; }
.small { font-size: 0.8rem; }
.opt { font-weight: 400; color: #9ca3af; }

.stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
.stat { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: 0.78rem; color: #6b7280; font-weight: 600; }
.stat-value { font-size: 1.35rem; font-weight: 700; color: #065f46; }
.stat-value.owed { color: #92400e; }
.stat-sub { font-size: 0.75rem; color: #9ca3af; }

.tabs { display: flex; gap: 6px; margin-bottom: 20px; border-bottom: 1px solid #e5e7eb; }
.tabs button { background: none; border: none; padding: 10px 16px; cursor: pointer; font-weight: 600; color: #6b7280; border-bottom: 2px solid transparent; margin-bottom: -1px; }
.tabs button.active { color: #058526; border-bottom-color: #058526; }
.count { background: #e5e7eb; color: #374151; border-radius: 999px; padding: 1px 8px; font-size: 0.75rem; margin-left: 4px; }

.section-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.section-head h2 { margin: 0; font-size: 1.1rem; }

.notice { padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; }
.notice.error { background: #fee2e2; color: #991b1b; }
/* Inherits the notice's colour so it reads as part of the sentence it ends. */
.link-retry {
  background: none;
  border: none;
  padding: 0 0 0 4px;
  color: inherit;
  font: inherit;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}
.link-retry:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
.notice.info { background: #eff6ff; color: #1e40af; display: flex; gap: 12px; align-items: flex-start; }
.notice.warn { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; display: flex; gap: 12px; align-items: flex-start; }
.excl-list { margin: 6px 0 0; padding-left: 18px; }
.carbon-badge { background: #d1fae5; color: #065f46; border-radius: 999px; padding: 4px 12px; font-weight: 700; font-size: 0.85rem; white-space: nowrap; height: fit-content; }
.bar { height: 8px; border-radius: 999px; background: #e5e7eb; overflow: hidden; margin: 12px 0 8px; }
.bar-fill { height: 100%; background: #058526; border-radius: 999px; }
.bar-fill.low { background: #d97706; }
.bar-fill.ok { background: #058526; }
.bar-fill.good { background: #047857; }
.perf { margin-top: 12px; padding-top: 10px; border-top: 1px solid #f3f4f6; }
.perf-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
.perf-label { font-size: 0.78rem; font-weight: 600; color: #6b7280; }
.perf-value { font-size: 0.85rem; font-weight: 600; color: #374151; }
.perf-value.low { color: #92400e; }
.perf-value.ok { color: #065f46; }
.perf-value.good { color: #047857; }
.notice.ok { background: #ecfdf5; color: #065f46; }
.paid-caveat { margin-top: 4px; font-size: 0.82rem; opacity: 0.85; }
.notice.sm { padding: 8px 12px; font-size: 0.85rem; }
.notice.inline { margin: 10px 0 0; }
.retry-btn { margin-top: 8px; padding: 6px 14px; border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 8px; font-weight: 600; cursor: pointer; }

.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
.card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.card-head h3 { margin: 0 0 4px; font-size: 1.05rem; }
.badges { display: flex; gap: 6px; }
.meta { color: #6b7280; font-size: 0.82rem; }
.detail { color: #6b7280; font-size: 0.82rem; margin-top: 8px; }
.note { color: #4b5563; font-size: 0.87rem; font-style: italic; margin: 8px 0 0; }
.actions { margin-top: 12px; display: flex; gap: 8px; }

.form-card { margin-bottom: 20px; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 14px; }
.form-row { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 0.85rem; font-weight: 600; color: #374151; }
.form-row input, .form-row select, .form-row textarea { padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.9rem; font-family: inherit; }
.estimate { margin-top: 8px; font-size: 0.85rem; color: #065f46; }
.proof-list { margin: 6px 0 0; padding-left: 18px; font-size: 0.82rem; color: #4b5563; }

.ready { background: #f0fdf4; border-color: #bbf7d0; }
.ready-title { margin: 0 0 10px; font-size: 0.92rem; color: #065f46; }
.ready-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid #bbf7d0; }
.ready-row:first-of-type { border-top: none; }

.badge { padding: 3px 10px; border-radius: 999px; font-size: 0.75rem; text-transform: capitalize; background: #e5e7eb; color: #374151; height: fit-content; }
.badge.active, .badge.confirmed { background: #d1fae5; color: #065f46; }
.badge.pending, .badge.fallow { background: #fef3c7; color: #92400e; }
.badge.rejected { background: #fee2e2; color: #991b1b; }
.badge.retired { background: #f3f4f6; color: #6b7280; }
.badge.paid { background: #d1fae5; color: #065f46; }
.badge.unpaid { background: #fef3c7; color: #92400e; }

.btn-primary { background: #058526; color: #fff; border: none; border-radius: 8px; padding: 9px 16px; cursor: pointer; font-weight: 600; text-decoration: none; display: inline-block; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary.sm { padding: 7px 12px; font-size: 0.85rem; }
.btn-ghost { background: #fff; color: #374151; border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 16px; cursor: pointer; font-weight: 600; }
.btn-ghost.sm { padding: 7px 12px; font-size: 0.85rem; }
.btn-ghost.danger { color: #991b1b; border-color: #fecaca; }

.empty { text-align: center; padding: 48px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
.empty-icon { font-size: 48px; color: #058526; }
.empty p { margin: 12px auto 18px; max-width: 380px; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 16px; padding: 24px; max-width: 480px; width: 100%; max-height: 90vh; overflow-y: auto; }
.modal h2 { margin: 0 0 4px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }

@media (max-width: 640px) {
  .stats { grid-template-columns: 1fr 1fr; }
  .grid-2 { grid-template-columns: 1fr; }
  .ready-row { flex-direction: column; align-items: flex-start; }
}
</style>
