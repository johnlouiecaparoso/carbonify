<template>
  <div class="market-page">
    <div class="market-header">
      <div class="container">
        <h1 class="page-title">Carbon Market Dashboard</h1>
        <p class="page-subtitle">
          Live, public snapshot of the Carbonify market — supply, pricing, and climate impact. No login required.
        </p>
      </div>
    </div>

    <div class="container content">
      <div v-if="loading" class="state">Loading market figures…</div>
      <template v-else>
        <!-- Headline figures -->
        <div class="cards">
          <div class="card">
            <span class="card-label">Active listings</span>
            <span class="card-value">{{ fmt(stats.active_listings) }}</span>
            <span class="card-sub">{{ fmt(stats.listed_projects) }} projects</span>
          </div>
          <div class="card">
            <span class="card-label">Credits available</span>
            <span class="card-value">{{ fmt(stats.credits_available) }}</span>
            <span class="card-sub">tCO₂e for sale now</span>
          </div>
          <div class="card">
            <span class="card-label">Average price</span>
            <span class="card-value">{{ peso(stats.avg_price) }}</span>
            <span class="card-sub">range {{ peso(stats.min_price) }}–{{ peso(stats.max_price) }}</span>
          </div>
          <div class="card highlight">
            <span class="card-label">Credits retired</span>
            <span class="card-value">{{ fmt(stats.total_retired) }}</span>
            <span class="card-sub">tCO₂e permanently offset</span>
          </div>
        </div>

        <!-- Retired vs available split -->
        <div class="panel">
          <div class="panel-head">
            <h2>Impact to date</h2>
            <span class="muted">{{ retiredPct }}% of issued credits retired</span>
          </div>
          <div class="bar" role="img" :aria-label="`${retiredPct}% of issued credits retired`">
            <div class="bar-retired" :style="{ width: retiredPct + '%' }"></div>
          </div>
          <div class="legend">
            <span><i class="dot retired"></i> Retired {{ fmt(stats.total_retired) }}</span>
            <span><i class="dot issued"></i> Issued {{ fmt(stats.total_issued) }}</span>
          </div>
        </div>

        <div class="cta">
          <RouterLink class="btn" to="/marketplace">Browse the marketplace</RouterLink>
          <RouterLink class="btn ghost" to="/registry">Verify in the registry</RouterLink>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getMarketStats } from '@/services/registryService'
import { peso } from '@/utils/format'

const loading = ref(true)
const stats = ref({
  active_listings: 0,
  credits_available: 0,
  avg_price: 0,
  min_price: 0,
  max_price: 0,
  total_retired: 0,
  total_issued: 0,
  listed_projects: 0,
})

const retiredPct = computed(() => {
  const issued = Number(stats.value.total_issued) || 0
  const retired = Number(stats.value.total_retired) || 0
  if (issued <= 0) return 0
  return Math.min(100, Math.round((retired / issued) * 100))
})

function fmt(n) {
  return Number(n || 0).toLocaleString()
}

onMounted(async () => {
  try {
    stats.value = await getMarketStats()
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.market-page {
  min-height: 100vh;
  background: #f8fafc;
}
.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 1.5rem;
}
.market-header {
  background: var(--primary-color, #058526);
  padding: 1.25rem 0;
  color: #fff;
}
.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.35rem;
}
.page-subtitle {
  margin: 0;
  color: #ecfdf5;
  max-width: 640px;
}
.content {
  padding: 1.75rem 1.5rem 3rem;
}
.state {
  color: #6b7280;
  padding: 2rem 0;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.card.highlight {
  border-color: #a7f3d0;
  background: #ecfdf5;
}
.card-label {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #6b7280;
}
.card-value {
  font-size: 1.6rem;
  font-weight: 800;
  color: #0f172a;
}
.card-sub {
  font-size: 0.78rem;
  color: #6b7280;
}
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}
.panel-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.85rem;
}
.panel-head h2 {
  margin: 0;
  font-size: 1.15rem;
}
.muted {
  color: #6b7280;
  font-size: 0.85rem;
}
.bar {
  height: 14px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
}
.bar-retired {
  height: 100%;
  background: #059669;
  border-radius: 999px;
  transition: width 0.4s ease;
}
.legend {
  display: flex;
  gap: 1.25rem;
  margin-top: 0.6rem;
  font-size: 0.8rem;
  color: #4b5563;
}
.dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-right: 0.35rem;
}
.dot.retired {
  background: #059669;
}
.dot.issued {
  background: #cbd5e1;
}
.cta {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.btn {
  display: inline-block;
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  background: #058526;
  color: #fff;
  font-weight: 600;
  text-decoration: none;
}
.btn.ghost {
  background: #fff;
  color: #047857;
  border: 1px solid #a7f3d0;
}
@media (max-width: 640px) {
  .container {
    padding: 0 1rem;
  }

}
</style>
