<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { getBiomassProducts, submitRfq, estimateRfqTotal } from '@/services/biomassService'
import { BIOMASS_PRODUCT_TYPES, BIOMASS_UNITS, biomassTypeLabel } from '@/constants/biomass'

const router = useRouter()
const userStore = useUserStore()

const loading = ref(true)
const loadError = ref('')
const products = ref([])
const typeFilter = ref('')
const search = ref('')

// RFQ modal state
const rfqProduct = ref(null)
const rfqForm = ref({ quantity: '', unit: 'tonnes', delivery_location: '', needed_by: '', message: '' })
const rfqSubmitting = ref(false)
const rfqError = ref('')
const rfqSuccess = ref(false)

function peso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return products.value.filter((p) => {
    if (typeFilter.value && p.product_type !== typeFilter.value) return false
    if (!q) return true
    return [p.title, p.description, p.location, p.region].some((f) =>
      String(f || '').toLowerCase().includes(q),
    )
  })
})

const rfqEstimate = computed(() => {
  if (!rfqProduct.value) return null
  return estimateRfqTotal(rfqProduct.value.price_per_unit, rfqForm.value.quantity)
})

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    products.value = await getBiomassProducts()
  } catch (err) {
    console.error('Failed to load biomass products:', err)
    loadError.value = err?.message || 'We could not load feedstock listings right now.'
  } finally {
    loading.value = false
  }
}

function openRfq(product) {
  if (!userStore.isAuthenticated) {
    router.push({ name: 'login', query: { redirect: '/biomass' } })
    return
  }
  rfqProduct.value = product
  rfqForm.value = { quantity: '', unit: product.unit || 'tonnes', delivery_location: '', needed_by: '', message: '' }
  rfqError.value = ''
  rfqSuccess.value = false
}

function closeRfq() {
  rfqProduct.value = null
}

async function sendRfq() {
  rfqSubmitting.value = true
  rfqError.value = ''
  try {
    await submitRfq({ product: rfqProduct.value, ...rfqForm.value })
    rfqSuccess.value = true
  } catch (err) {
    rfqError.value = err?.message || 'Could not submit your request.'
  } finally {
    rfqSubmitting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="biomass">
    <header class="hero">
      <div class="hero-inner">
        <h1>Biomass Marketplace</h1>
        <p>Source feedstock — rice husk, biochar, bagasse, Bana grass and more — direct from suppliers. Request a quote in a click.</p>
        <div class="hero-actions">
          <router-link to="/biomass/sell" class="btn-ghost">List your feedstock</router-link>
          <router-link v-if="userStore.isAuthenticated" to="/biomass/rfqs" class="btn-ghost">My requests</router-link>
        </div>
      </div>
    </header>

    <div class="body">
      <div class="filters">
        <label for="biomass-search" class="sr-only">Search feedstock</label>
        <input id="biomass-search" v-model="search" class="filter-input" type="search" placeholder="Search feedstock, location…" />
        <label for="biomass-type" class="sr-only">Filter by feedstock type</label>
        <select id="biomass-type" v-model="typeFilter" class="filter-input">
          <option value="">All types</option>
          <option v-for="t in BIOMASS_PRODUCT_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
        </select>
      </div>

      <div v-if="loading" class="muted">Loading feedstock listings…</div>
      <div v-else-if="loadError" class="notice error">{{ loadError }}<div><button class="retry-btn" @click="load">Try again</button></div></div>
      <div v-else-if="!filtered.length" class="empty">
        <span class="material-symbols-outlined empty-icon" aria-hidden="true">compost</span>
        <h2>No feedstock listed yet</h2>
        <p class="muted">Be the first — suppliers can list rice husk, biochar, bagasse and more.</p>
        <router-link to="/biomass/sell" class="btn-primary">List your feedstock</router-link>
      </div>

      <div v-else class="grid">
        <article v-for="p in filtered" :key="p.id" class="card">
          <div class="card-top">
            <span class="type-badge">{{ biomassTypeLabel(p.product_type) }}</span>
            <span v-if="p.quantity_available != null" class="qty">{{ Number(p.quantity_available).toLocaleString('en-PH') }} {{ p.unit }} avail.</span>
          </div>
          <h3 class="card-title">{{ p.title }}</h3>
          <p v-if="p.description" class="card-desc">{{ p.description }}</p>
          <div v-if="p.location || p.region" class="card-loc">
            <span class="material-symbols-outlined" aria-hidden="true">location_on</span>
            {{ [p.location, p.region].filter(Boolean).join(', ') }}
          </div>
          <div class="card-foot">
            <div class="price">
              <template v-if="p.price_per_unit != null">
                {{ peso(p.price_per_unit) }}<span class="per">/{{ p.unit }}</span>
              </template>
              <span v-else class="muted small">Request a quote</span>
            </div>
            <button class="btn-primary sm" @click="openRfq(p)">Request quote</button>
          </div>
        </article>
      </div>
    </div>

    <!-- RFQ modal -->
    <div v-if="rfqProduct" class="modal-overlay" @click.self="closeRfq">
      <div class="modal">
        <template v-if="rfqSuccess">
          <div class="success">
            <span class="material-symbols-outlined ok-icon" aria-hidden="true">check_circle</span>
            <h2>Request sent</h2>
            <p class="muted">The supplier has been notified and will respond with a quote. Track it under <router-link to="/biomass/rfqs">My requests</router-link>.</p>
            <button class="btn-primary" @click="closeRfq">Done</button>
          </div>
        </template>
        <template v-else>
          <h2>Request a quote</h2>
          <p class="muted small">{{ biomassTypeLabel(rfqProduct.product_type) }} · {{ rfqProduct.title }}</p>

          <div class="form-row">
            <label for="rfq-quantity">Quantity</label>
            <div class="qty-row">
              <input id="rfq-quantity" v-model.number="rfqForm.quantity" type="number" min="0" step="any" placeholder="e.g. 20" />
              <label for="rfq-unit" class="sr-only">Unit</label>
              <select id="rfq-unit" v-model="rfqForm.unit">
                <option v-for="u in BIOMASS_UNITS" :key="u" :value="u">{{ u }}</option>
              </select>
            </div>
          </div>
          <div v-if="rfqEstimate != null" class="estimate">Est. at listed price: <strong>{{ peso(rfqEstimate) }}</strong></div>

          <div class="form-row">
            <label for="rfq-location">Delivery location <span class="opt">(optional)</span></label>
            <input id="rfq-location" v-model="rfqForm.delivery_location" type="text" placeholder="Where should it be delivered?" />
          </div>
          <div class="form-row">
            <label for="rfq-needed-by">Needed by <span class="opt">(optional)</span></label>
            <input id="rfq-needed-by" v-model="rfqForm.needed_by" type="date" />
          </div>
          <div class="form-row">
            <label for="rfq-message">Message <span class="opt">(optional)</span></label>
            <textarea id="rfq-message" v-model="rfqForm.message" rows="3" placeholder="Specs, moisture, packaging, etc."></textarea>
          </div>

          <p v-if="rfqError" class="notice error sm">{{ rfqError }}</p>
          <div class="modal-actions">
            <button class="btn-ghost" @click="closeRfq">Cancel</button>
            <button class="btn-primary" :disabled="rfqSubmitting" @click="sendRfq">
              {{ rfqSubmitting ? 'Sending…' : 'Send request' }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.biomass { min-height: 100%; }
.hero {
  background: linear-gradient(135deg, #069e2d, #0b7a27);
  color: #fff;
}
.hero-inner { max-width: 1100px; margin: 0 auto; padding: 20px 16px; }
.hero-inner h1 { margin: 0; font-size: 1.5rem; }
.hero-inner p { margin: 8px 0 16px; max-width: 640px; opacity: 0.95; }
.hero-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.body { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
.filters { display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.filter-input {
  padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.9rem; background: #fff;
}
.filter-input[type='search'] { flex: 1; min-width: 200px; }
.muted { color: #6b7280; }
.small { font-size: 0.8rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.card {
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px;
  display: flex; flex-direction: column; transition: box-shadow 0.15s, transform 0.15s;
}
.card:hover { box-shadow: 0 6px 20px rgba(0, 0, 0, 0.08); transform: translateY(-2px); }
.card-top { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
.type-badge { background: #d1fae5; color: #065f46; font-size: 0.72rem; font-weight: 600; padding: 3px 9px; border-radius: 999px; }
.qty { font-size: 0.72rem; color: #6b7280; white-space: nowrap; }
.card-title { margin: 0 0 6px; font-size: 1.05rem; }
.card-desc { margin: 0 0 10px; color: #4b5563; font-size: 0.87rem; flex: 1; }
.card-loc { display: flex; align-items: center; gap: 4px; color: #6b7280; font-size: 0.8rem; margin-bottom: 12px; }
.card-loc .material-symbols-outlined { font-size: 16px; }
.card-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; }
.price { font-weight: 700; color: #111827; }
.price .per { font-weight: 400; color: #6b7280; font-size: 0.8rem; }
.btn-primary {
  background: #069e2d; color: #fff; border: none; border-radius: 8px; padding: 9px 16px;
  cursor: pointer; font-weight: 600; text-decoration: none; display: inline-block;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary.sm { padding: 7px 12px; font-size: 0.85rem; }
.btn-ghost {
  background: rgba(255, 255, 255, 0.15); color: inherit; border: 1px solid currentColor;
  border-radius: 8px; padding: 8px 14px; cursor: pointer; font-weight: 600; text-decoration: none;
}
.body .btn-ghost { color: #374151; }
.notice { padding: 12px 16px; border-radius: 10px; margin-bottom: 16px; }
.notice.error { background: #fee2e2; color: #991b1b; }
.notice.sm { padding: 8px 12px; font-size: 0.85rem; }
.retry-btn { margin-top: 8px; padding: 6px 14px; border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 8px; font-weight: 600; cursor: pointer; }
.empty { text-align: center; padding: 48px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
.empty-icon, .ok-icon { font-size: 48px; color: #069e2d; }
.empty h2 { margin: 12px 0 6px; }
.empty p { max-width: 420px; margin: 0 auto 18px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 16px; padding: 24px; max-width: 460px; width: 100%; max-height: 90vh; overflow-y: auto; }
.modal h2 { margin: 0 0 4px; }
.form-row { margin-top: 14px; display: flex; flex-direction: column; gap: 6px; }
.form-row label { font-size: 0.85rem; font-weight: 600; color: #374151; }
.form-row .opt { font-weight: 400; color: #9ca3af; }
.form-row input, .form-row select, .form-row textarea {
  padding: 9px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.9rem; font-family: inherit;
}
.qty-row { display: flex; gap: 8px; }
.qty-row input { flex: 1; }
.estimate { margin-top: 8px; font-size: 0.85rem; color: #065f46; }
.success { text-align: center; padding: 8px; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
.modal-actions .btn-ghost { color: #374151; }
@media (max-width: 640px) {
  .hero-inner h1 { font-size: 1.5rem; }
  .grid { grid-template-columns: 1fr; }
}
</style>
