<template>
  <div class="watchlist-view">
    <div class="container">
      <h1 class="page-title">Saved</h1>
      <p class="page-description">Listings you've saved to follow.</p>

      <div v-if="loading" class="state-card">Loading your saved listings…</div>
      <div v-else-if="error" class="state-card error">{{ error }}</div>
      <div v-else-if="items.length === 0" class="state-card">
        <p>You haven't saved any listings yet.</p>
        <router-link to="/marketplace" class="browse-link">Browse the marketplace →</router-link>
      </div>

      <div v-else class="watch-grid">
        <article v-for="item in items" :key="item.listing_id" class="watch-card">
          <div class="watch-card__media">
            <img v-if="item.listing?.project_image" :src="item.listing.project_image" :alt="item.title" />
            <div v-else class="media-fallback"><span class="material-symbols-outlined">eco</span></div>
            <button class="remove-btn" title="Remove from saved" @click="remove(item)">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>

          <div class="watch-card__body">
            <h3 class="watch-title">{{ item.title }}</h3>

            <template v-if="item.listing">
              <p class="watch-meta">{{ item.listing.location || '—' }}</p>
              <div class="watch-pricing">
                <span class="price">{{ formatCurrency(item.listing.price_per_credit, item.listing.currency) }}</span>
                <span class="qty">{{ formatNumber(item.listing.available_quantity) }} left</span>
              </div>

              <!-- Movement since the buyer saved it — the reason to keep a watchlist -->
              <p v-if="item.change" class="watch-change" :class="item.change.direction">
                {{ item.change.direction === 'down' ? '▼' : '▲' }}
                {{ Math.abs(item.change.percent) }}% since you saved it
                <span class="watch-change-base">
                  (was {{ formatCurrency(item.price_at_save, item.listing.currency) }})
                </span>
              </p>
              <p v-else-if="!item.price_at_save" class="watch-nobase">
                Saved before price tracking — re-save to watch for drops.
              </p>

              <label class="alert-toggle">
                <input
                  type="checkbox"
                  :checked="item.notify_on_drop !== false"
                  :disabled="!item.price_at_save || togglingId === item.listing_id"
                  @change="toggleAlert(item, $event.target.checked)"
                />
                <span>Alert me if the price drops</span>
              </label>

              <div class="watch-actions">
                <router-link :to="`/projects/${item.project_id}`" class="ghost-btn">Details</router-link>
                <router-link to="/marketplace" class="primary-btn">Buy on marketplace</router-link>
              </div>
            </template>

            <template v-else>
              <p class="watch-unavailable">This listing is no longer available.</p>
              <div class="watch-actions">
                <router-link v-if="item.project_id" :to="`/projects/${item.project_id}`" class="ghost-btn">
                  View project
                </router-link>
                <button class="ghost-btn" @click="remove(item)">Remove</button>
              </div>
            </template>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import {
  getMyWatchlist,
  removeFromWatchlist,
  setWatchlistAlert,
} from '@/services/watchlistService'
import { getMarketplaceListings } from '@/services/marketplaceService'

const loading = ref(true)
const error = ref('')
const items = ref([])
const togglingId = ref('')

/**
 * Price movement since the buyer saved the listing. Null when there's no
 * baseline (saved before price tracking) or nothing has moved.
 */
function priceChange(savedPrice, currentPrice) {
  const base = Number(savedPrice)
  const now = Number(currentPrice)
  if (!(base > 0) || !(now > 0) || base === now) return null
  const percent = Math.round(((now - base) / base) * 100)
  if (percent === 0) return null
  return { percent, direction: percent < 0 ? 'down' : 'up' }
}

async function toggleAlert(item, enabled) {
  togglingId.value = item.listing_id
  try {
    await setWatchlistAlert(item.listing_id, enabled)
    item.notify_on_drop = enabled
  } catch (err) {
    console.error('Failed to update alert preference:', err)
  } finally {
    togglingId.value = ''
  }
}

function formatCurrency(value, currency = 'PHP') {
  const sym = currency === 'PHP' ? '₱' : `${currency} `
  return `${sym}${Number(value || 0).toLocaleString()}`
}
function formatNumber(value) {
  return Number(value || 0).toLocaleString()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [rows, listings] = await Promise.all([getMyWatchlist(), getMarketplaceListings()])
    const byId = new Map((listings || []).map((l) => [l.listing_id, l]))
    items.value = rows.map((r) => {
      const listing = byId.get(r.listing_id) || null
      return {
        ...r,
        listing,
        title: listing?.project_title || 'Saved listing',
        change: listing ? priceChange(r.price_at_save, listing.price_per_credit) : null,
      }
    })
  } catch (err) {
    console.error('Failed to load watchlist:', err)
    error.value = 'Failed to load your watchlist.'
  } finally {
    loading.value = false
  }
}

async function remove(item) {
  try {
    await removeFromWatchlist(item.listing_id)
    items.value = items.value.filter((i) => i.listing_id !== item.listing_id)
  } catch (err) {
    console.error('Failed to remove from watchlist:', err)
  }
}

onMounted(load)
</script>

<style scoped>
.watchlist-view {
  padding: 2rem 0 4rem;
}
.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 1rem;
}
.page-title {
  font-size: 1.8rem;
  margin: 0 0 0.4rem;
}
.page-description {
  color: #6b7280;
  margin: 0 0 1.5rem;
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
  color: #069e2d;
  font-weight: 600;
  text-decoration: none;
}
.watch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 1.25rem;
}
.watch-card {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  overflow: hidden;
  background: #fff;
  display: flex;
  flex-direction: column;
}
.watch-card__media {
  position: relative;
  height: 150px;
  background: #f3f4f6;
}
.watch-card__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.media-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #9ca3af;
}
.media-fallback .material-symbols-outlined {
  font-size: 2.5rem;
}
.remove-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  border: none;
  background: rgba(255, 255, 255, 0.9);
  border-radius: 999px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
}
.remove-btn:hover {
  color: #ef4444;
}
.watch-card__body {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  flex: 1;
}
.watch-title {
  font-size: 1.05rem;
  margin: 0 0 0.3rem;
}
.watch-meta {
  color: #6b7280;
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
}
.watch-pricing {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 1rem;
}
.price {
  font-weight: 700;
  font-size: 1.1rem;
}
.qty {
  color: #6b7280;
  font-size: 0.8rem;
}
.watch-change {
  font-size: 0.8rem;
  font-weight: 600;
  margin: 0 0 0.5rem;
}
.watch-change.down {
  color: #059669;
}
.watch-change.up {
  color: #dc2626;
}
.watch-change-base {
  font-weight: 400;
  color: #9ca3af;
}
.watch-nobase {
  font-size: 0.75rem;
  color: #9ca3af;
  margin: 0 0 0.5rem;
}
.alert-toggle {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.78rem;
  color: #6b7280;
  margin-bottom: 0.85rem;
  cursor: pointer;
}
.alert-toggle input:disabled + span {
  opacity: 0.5;
}
.watch-unavailable {
  color: #9ca3af;
  font-size: 0.85rem;
  margin: 0 0 1rem;
}
.watch-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: auto;
}
.ghost-btn,
.primary-btn {
  padding: 0.5rem 0.8rem;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
}
.primary-btn {
  background: #069e2d;
  border-color: #069e2d;
  color: #fff;
}
</style>
