<script setup>
/**
 * "My orders" — every checkout the buyer has started, not just the ones that
 * completed. Receipts only cover successful purchases, so before this a pending
 * or failed payment was invisible to the person who made it.
 */
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import {
  getMyOrders,
  attachListingTitles,
  describeOrderStatus,
  isUnfinished,
} from '@/services/orderService'
import { getMarketplaceListings } from '@/services/marketplaceService'
import { createMarketplaceCheckout } from '@/services/paymongoService'
import { assertCanTrade } from '@/services/kycService'
import { formatDate } from '@/utils/formatDate'

const router = useRouter()

const orders = ref([])
const loading = ref(true)
const error = ref('')
const retryingId = ref('')
const retryError = ref('')

const filter = ref('all') // 'all' | 'unfinished' | 'completed'

const unfinishedCount = computed(() => orders.value.filter(isUnfinished).length)

const visibleOrders = computed(() => {
  if (filter.value === 'unfinished') return orders.value.filter(isUnfinished)
  if (filter.value === 'completed') return orders.value.filter((o) => o.status === 'paid')
  return orders.value
})

// Collapsed, the list shows the first few orders in a single horizontal
// scroller so a long history stays compact and fits the screen; "See more"
// expands to the full vertical list.
const COLLAPSED_COUNT = 4
const ordersExpanded = ref(false)
const shownOrders = computed(() =>
  ordersExpanded.value ? visibleOrders.value : visibleOrders.value.slice(0, COLLAPSED_COUNT),
)
const hasMore = computed(() => visibleOrders.value.length > COLLAPSED_COUNT)

function showMore() {
  ordersExpanded.value = true
}

function showLess() {
  ordersExpanded.value = false
}

// Switching the filter should start again from the collapsed view.
watch(filter, () => {
  ordersExpanded.value = false
})

function money(order) {
  const symbol = order.currency === 'PHP' ? '₱' : `${order.currency} `
  return `${symbol}${Number(order.amount || 0).toLocaleString()}`
}

/**
 * Restart an abandoned checkout. Creates a fresh PayMongo session rather than
 * reusing the old one — provider sessions expire, and the price/availability
 * must be re-resolved server-side anyway.
 */
async function retry(order) {
  if (!order.listing_id || retryingId.value) return
  retryError.value = ''
  retryingId.value = order.id

  try {
    await assertCanTrade()
    const result = await createMarketplaceCheckout({
      listingId: order.listing_id,
      quantity: Number(order.quantity) || 1,
    })
    const url = result?.checkoutUrl || result?.checkout_url
    if (!url) throw new Error('Could not restart checkout.')

    if (result.sessionId) localStorage.setItem('pending_purchase_session', result.sessionId)
    if (result.paymentIntentId) {
      localStorage.setItem('pending_purchase_intent', result.paymentIntentId)
    }
    window.location.href = url
  } catch (err) {
    console.error('Failed to retry order:', err)
    retryError.value = err?.message || 'Could not restart this checkout. Please try again.'
    retryingId.value = ''
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [rawOrders, listings] = await Promise.all([
      getMyOrders(50),
      getMarketplaceListings().catch(() => []),
    ])
    orders.value = attachListingTitles(rawOrders, listings)
    ordersExpanded.value = false
  } catch (err) {
    console.error('Failed to load orders:', err)
    error.value = 'We could not load your orders. Please try again.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="orders-view">
    <PageHeader
      title="My orders"
      description="Every checkout you've started, including ones that didn't go through."
    />

    <div class="container">

      <div v-if="loading" class="state-card">Loading your orders…</div>

      <div v-else-if="error" class="state-card error">
        <p>{{ error }}</p>
        <button class="btn" @click="load">Try again</button>
      </div>

      <div v-else-if="orders.length === 0" class="state-card">
        <p>You haven't started any purchases yet.</p>
        <router-link to="/marketplace" class="browse-link">Browse the marketplace →</router-link>
      </div>

      <template v-else>
        <p v-if="unfinishedCount > 0" class="unfinished-banner">
          <span class="material-symbols-outlined" aria-hidden="true">pending</span>
          You have {{ unfinishedCount }} unfinished checkout{{ unfinishedCount === 1 ? '' : 's' }}.
          Nothing has been charged for them.
        </p>

        <div class="filters" role="tablist">
          <button
            v-for="option in [
              { id: 'all', label: 'All' },
              { id: 'unfinished', label: 'Unfinished' },
              { id: 'completed', label: 'Completed' },
            ]"
            :key="option.id"
            role="tab"
            :aria-selected="filter === option.id"
            :class="['filter-tab', { active: filter === option.id }]"
            @click="filter = option.id"
          >
            {{ option.label }}
          </button>
        </div>

        <p v-if="retryError" class="retry-error">{{ retryError }}</p>

        <p v-if="visibleOrders.length === 0" class="state-card">
          No orders in this view.
        </p>

        <ul v-else class="order-list list-scroll-y">
          <li v-for="order in shownOrders" :key="order.id" class="order-card">
            <div class="order-main">
              <div class="order-head">
                <h2 class="order-title">{{ order.projectTitle }}</h2>
                <span class="status-pill" :class="describeOrderStatus(order.status).tone">
                  {{ describeOrderStatus(order.status).label }}
                </span>
              </div>

              <dl class="order-meta">
                <div>
                  <dt>Credits</dt>
                  <dd>{{ Number(order.quantity || 0).toLocaleString() }}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>{{ money(order) }}</dd>
                </div>
                <div>
                  <dt>Started</dt>
                  <dd>{{ formatDate(order.created_at, { month: 'short' }) }}</dd>
                </div>
              </dl>
            </div>

            <div class="order-actions">
              <router-link v-if="order.status === 'paid'" to="/receipts" class="btn btn-outline">
                View receipt
              </router-link>
              <button
                v-else-if="describeOrderStatus(order.status).canRetry && order.listing_id"
                class="btn btn-primary"
                :disabled="Boolean(retryingId)"
                @click="retry(order)"
              >
                {{ retryingId === order.id ? 'Starting…' : 'Complete payment' }}
              </button>
              <span v-else-if="order.status === 'pending'" class="pending-note">
                Confirming with the payment provider…
              </span>
              <button
                v-if="order.projectId"
                class="btn btn-ghost"
                @click="router.push(`/projects/${order.projectId}`)"
              >
                View project
              </button>
            </div>
          </li>
        </ul>

        <div v-if="visibleOrders.length > 0" class="list-footer">
          <span class="list-count">
            Showing {{ shownOrders.length }} of {{ visibleOrders.length }}
          </span>
          <div class="list-footer-actions">
            <button
              v-if="hasMore && !ordersExpanded"
              class="see-more-btn"
              @click="showMore"
            >
              See more
            </button>
            <button v-if="ordersExpanded" class="see-less-btn" @click="showLess">
              Show less
            </button>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.orders-view {
  min-height: 100vh;
  padding: 0 0 4rem;
  background: var(--bg-secondary, #f8fdf8);
}
.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem 1rem 0;
}

.state-card {
  padding: 2rem;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  color: #6b7280;
  text-align: center;
}
.state-card.error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}
.browse-link {
  display: inline-block;
  margin-top: 0.75rem;
  color: #058526;
  font-weight: 600;
  text-decoration: none;
}
.unfinished-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  padding: 0.65rem 0.9rem;
  color: #92400e;
  font-size: 0.875rem;
  margin: 0 0 1rem;
}
.filters {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 1.25rem;
}
.filter-tab {
  padding: 0.45rem 0.9rem;
  border: 1px solid #e5e7eb;
  background: #fff;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
}
.filter-tab.active {
  background: #058526;
  border-color: #058526;
  color: #fff;
}
.retry-error {
  color: #991b1b;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 0.6rem 0.85rem;
  font-size: 0.85rem;
  margin: 0 0 1rem;
}
.order-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

/* Compact vertically-scrollable area so a long history stays short and fits
   the screen; "See more" reveals the rest within the same scroll box. */
.order-list.list-scroll-y {
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 0.25rem;
  -webkit-overflow-scrolling: touch;
}
.order-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  padding: 1.1rem;
}
.order-main {
  flex: 1;
  min-width: 240px;
}
.order-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.7rem;
}
.order-title {
  margin: 0;
  font-size: 1rem;
  color: #0f172a;
}
.status-pill {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
}
.status-pill.pending {
  background: #fef3c7;
  color: #92400e;
}
.status-pill.good {
  background: #dcfce7;
  color: #166534;
}
.status-pill.bad {
  background: #fee2e2;
  color: #991b1b;
}
.status-pill.muted {
  background: #f1f5f9;
  color: #475569;
}
.order-meta {
  display: flex;
  gap: 1.75rem;
  flex-wrap: wrap;
  margin: 0;
}
.order-meta dt {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #94a3b8;
  margin-bottom: 0.1rem;
}
.order-meta dd {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
}
.order-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.pending-note {
  font-size: 0.8rem;
  color: #94a3b8;
}
.btn {
  padding: 0.5rem 0.95rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid transparent;
  text-decoration: none;
  display: inline-block;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-primary {
  background: #058526;
  color: #fff;
}
.btn-outline {
  background: #fff;
  border-color: #d1d5db;
  color: #374151;
}
.btn-ghost {
  background: transparent;
  color: #6b7280;
}

/* Never let a long project title push the card past the screen edge. */
.order-title {
  overflow-wrap: anywhere;
}

/* See-more footer */
.list-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 1.1rem;
}
.list-count {
  font-size: 0.85rem;
  color: #6b7280;
}
.list-footer-actions {
  display: flex;
  gap: 0.5rem;
}
.see-more-btn {
  padding: 0.5rem 1.1rem;
  background: #058526;
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
}
.see-more-btn:hover {
  background: #04701f;
}
.see-less-btn {
  padding: 0.5rem 1.1rem;
  background: #fff;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
}
.see-less-btn:hover {
  background: #f3f4f6;
}
</style>
