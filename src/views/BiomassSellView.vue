<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import {
  getMyBiomassProducts,
  createBiomassProduct,
  setBiomassProductStatus,
  validateProductInput,
} from '@/services/biomassService'
import { getMyKyb } from '@/services/kybService'
import { useUserStore } from '@/store/userStore'
import { BIOMASS_PRODUCT_TYPES, BIOMASS_UNITS, biomassTypeLabel } from '@/constants/biomass'
import KybForm from '@/components/wallet/KybForm.vue'

const userStore = useUserStore()
const loading = ref(true)
const loadError = ref('')
const kyb = ref({ verified: false, application: null })
const products = ref([])
const showKyb = ref(false)

/**
 * Businesses list feedstock behind KYB; smallholder farmers list behind their
 * (admin-reviewed) farmer role instead. KYB gates payouts — real money leaving
 * the platform — and no platform money moves for feedstock, so requiring a
 * business registration from a smallholder is friction with no safety payoff.
 */
const canList = computed(() => kyb.value.verified || userStore.isFarmer)

const form = ref({
  product_type: '',
  title: '',
  description: '',
  unit: 'tonnes',
  price_per_unit: '',
  quantity_available: '',
  location: '',
  region: '',
})
const formErrors = ref([])
const saving = ref(false)
const saveError = ref('')

function peso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const [k, p] = await Promise.all([getMyKyb(), getMyBiomassProducts()])
    kyb.value = k
    products.value = p
  } catch (err) {
    console.error('Failed to load supplier data:', err)
    loadError.value = err?.message || 'We could not load your listings right now.'
  } finally {
    loading.value = false
  }
}

function resetForm() {
  form.value = {
    product_type: '',
    title: '',
    description: '',
    unit: 'tonnes',
    price_per_unit: '',
    quantity_available: '',
    location: '',
    region: '',
  }
  formErrors.value = []
  saveError.value = ''
}

async function submit() {
  formErrors.value = validateProductInput(form.value)
  if (formErrors.value.length) return
  saving.value = true
  saveError.value = ''
  try {
    const created = await createBiomassProduct(form.value)
    products.value.unshift(created)
    resetForm()
  } catch (err) {
    saveError.value = err?.message || 'Could not list your product.'
  } finally {
    saving.value = false
  }
}

async function toggleStatus(p) {
  const next = p.status === 'active' ? 'inactive' : 'active'
  try {
    const updated = await setBiomassProductStatus(p.id, next)
    const i = products.value.findIndex((x) => x.id === p.id)
    if (i !== -1) products.value[i] = updated
  } catch (err) {
    saveError.value = err?.message || 'Could not update the listing.'
  }
}

function onKybSuccess() {
  showKyb.value = false
  load()
}

onMounted(load)
</script>

<template>
  <div class="sell">
    <PageHeader
      title="Sell Feedstock"
      description="List your biomass so buyers can request quotes. Businesses need verification (KYB) before listing; approved farmers can list right away."
    />

    <div class="page-body">

    <div v-if="loading" class="muted">Loading…</div>
    <div v-else-if="loadError" class="notice error">
      {{ loadError }}<div><button class="retry-btn" @click="load">Try again</button></div>
    </div>

    <template v-else>
      <!-- KYB gate -->
      <div v-if="!canList" class="notice warn">
        <span class="material-symbols-outlined" aria-hidden="true">verified_user</span>
        <div class="notice-body">
          <strong>Business verification required.</strong>
          Verify your business (KYB) before you can list feedstock for sale.
          <template v-if="kyb.application?.status === 'pending'"> Your submission is <strong>pending review</strong>.</template>
          <template v-else-if="kyb.application?.status === 'rejected'">
            Your last submission was <strong>rejected</strong>.
            <template v-if="kyb.application.review_notes"> Note: {{ kyb.application.review_notes }}.</template>
          </template>
          <div v-if="kyb.application?.status !== 'pending'" class="notice-action">
            <button class="btn-primary sm" @click="showKyb = true">
              {{ kyb.application?.status === 'rejected' ? 'Resubmit verification' : 'Verify your business' }}
            </button>
          </div>
        </div>
      </div>

      <!-- List a product -->
      <section v-if="canList" class="panel">
        <h2>List a feedstock product</h2>
        <div class="form-grid">
          <div class="fg">
            <label for="sell-type">Product type</label>
            <select id="sell-type" v-model="form.product_type">
              <option value="">Select…</option>
              <option v-for="t in BIOMASS_PRODUCT_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </div>
          <div class="fg">
            <label for="sell-title">Title</label>
            <input id="sell-title" v-model="form.title" type="text" placeholder="e.g. Dried rice husk, low moisture" />
          </div>
          <div class="fg span2">
            <label for="sell-desc">Description <span class="opt">(optional)</span></label>
            <textarea id="sell-desc" v-model="form.description" rows="2" placeholder="Moisture, packaging, availability cadence…"></textarea>
          </div>
          <div class="fg">
            <label for="sell-unit">Unit</label>
            <select id="sell-unit" v-model="form.unit">
              <option v-for="u in BIOMASS_UNITS" :key="u" :value="u">{{ u }}</option>
            </select>
          </div>
          <div class="fg">
            <label for="sell-price">Price per {{ form.unit }} <span class="opt">(optional — blank = quote only)</span></label>
            <input id="sell-price" v-model.number="form.price_per_unit" type="number" min="0" step="any" placeholder="e.g. 1500" />
          </div>
          <div class="fg">
            <label for="sell-qty">Quantity available <span class="opt">(optional)</span></label>
            <input id="sell-qty" v-model.number="form.quantity_available" type="number" min="0" step="any" placeholder="e.g. 500" />
          </div>
          <div class="fg">
            <label for="sell-location">Location <span class="opt">(optional)</span></label>
            <input id="sell-location" v-model="form.location" type="text" placeholder="City / municipality" />
          </div>
          <div class="fg">
            <label for="sell-region">Region <span class="opt">(optional)</span></label>
            <input id="sell-region" v-model="form.region" type="text" placeholder="e.g. Central Luzon" />
          </div>
        </div>

        <ul v-if="formErrors.length" class="err-list">
          <li v-for="e in formErrors" :key="e">{{ e }}</li>
        </ul>
        <p v-if="saveError" class="notice error sm">{{ saveError }}</p>

        <div class="form-actions">
          <button class="btn-primary" :disabled="saving" @click="submit">
            {{ saving ? 'Listing…' : 'List product' }}
          </button>
        </div>
      </section>

      <!-- My listings -->
      <section class="panel">
        <h2>My listings</h2>
        <div v-if="products.length" class="table-scroll">
          <table class="data-table">
            <thead>
              <tr><th>Type</th><th>Title</th><th class="num">Price</th><th class="num">Available</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="p in products" :key="p.id">
                <td>{{ biomassTypeLabel(p.product_type) }}</td>
                <td>{{ p.title }}</td>
                <td class="num">{{ p.price_per_unit != null ? peso(p.price_per_unit) + '/' + p.unit : '—' }}</td>
                <td class="num">{{ p.quantity_available != null ? Number(p.quantity_available).toLocaleString('en-PH') + ' ' + p.unit : '—' }}</td>
                <td><span class="badge" :class="p.status">{{ p.status }}</span></td>
                <td>
                  <button class="link-btn" @click="toggleStatus(p)">
                    {{ p.status === 'active' ? 'Deactivate' : 'Activate' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="muted">You haven't listed any feedstock yet.</p>
      </section>
    </template>

    <!-- KYB modal -->
    <div v-if="showKyb" class="modal-overlay" @click.self="showKyb = false">
      <div class="modal">
        <KybForm @success="onKybSuccess" @cancel="showKyb = false" />
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.sell { min-height: 100vh; background: var(--bg-secondary, #f8fdf8); }
.page-body { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
.page-head h1 { margin: 0; font-size: 1.6rem; }
.page-head p { color: #6b7280; margin: 4px 0 20px; }
.muted { color: #6b7280; }
.notice { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-radius: 10px; margin-bottom: 20px; }
.notice.warn { background: #fef3c7; color: #92400e; }
.notice.error { background: #fee2e2; color: #991b1b; }
.notice.sm { padding: 8px 12px; font-size: 0.85rem; }
.notice-body { display: flex; flex-direction: column; gap: 4px; }
.notice-action { margin-top: 8px; }
.retry-btn { margin-top: 8px; padding: 6px 14px; border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 8px; font-weight: 600; cursor: pointer; }
.panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; margin-bottom: 20px; }
.panel h2 { margin: 0 0 14px; font-size: 1.1rem; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.fg { display: flex; flex-direction: column; gap: 6px; }
.fg.span2 { grid-column: 1 / -1; }
.fg label { font-size: 0.85rem; font-weight: 600; color: #374151; }
.fg .opt { font-weight: 400; color: #9ca3af; }
.fg input, .fg select, .fg textarea { padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.9rem; font-family: inherit; }
.err-list { margin: 14px 0 0; padding-left: 18px; color: #991b1b; font-size: 0.85rem; }
.form-actions { margin-top: 16px; }
.btn-primary { background: #058526; color: #fff; border: none; border-radius: 8px; padding: 9px 18px; cursor: pointer; font-weight: 600; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary.sm { padding: 6px 12px; font-size: 0.85rem; }
.table-scroll { width: 100%; overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; white-space: nowrap; }
.data-table th.num, .data-table td.num { text-align: right; }
.badge { padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; text-transform: capitalize; background: #e5e7eb; color: #374151; }
.badge.active { background: #d1fae5; color: #065f46; }
.badge.inactive { background: #e5e7eb; color: #6b7280; }
.badge.sold_out { background: #fef3c7; color: #92400e; }
.link-btn { background: none; border: none; color: #058526; font-weight: 600; cursor: pointer; font-size: 0.85rem; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 16px; padding: 24px; max-width: 540px; width: 100%; max-height: 90vh; overflow-y: auto; }
@media (max-width: 640px) {
  .form-grid { grid-template-columns: 1fr; }
}
</style>
