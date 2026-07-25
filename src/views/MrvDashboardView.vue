<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { getMyMrvDashboard } from '@/services/mrvDashboardService'
import { REPORT_STATUS_META } from '@/constants/mrv'
import PortfolioChart from '@/components/charts/PortfolioChart.vue'
import CategoryChart from '@/components/charts/CategoryChart.vue'

const loading = ref(true)
const loadError = ref('')
const data = ref(null)

function num(n) {
  return Number(n || 0).toLocaleString('en-PH')
}
function tco2e(n) {
  return `${num(n)} tCO₂e`
}
/** kWh is unreadable past a few thousand; step up to MWh / GWh. */
function energy(kwh) {
  const v = Number(kwh) || 0
  if (v >= 1e6) return `${num(Math.round((v / 1e6) * 100) / 100)} GWh`
  if (v >= 1e3) return `${num(Math.round((v / 1e3) * 100) / 100)} MWh`
  return `${num(v)} kWh`
}
function shortDate(d) {
  return d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
}
function statusLabel(s) {
  return REPORT_STATUS_META[s]?.label || String(s || '—').replace(/_/g, ' ')
}
function complianceLabel(state, daysUntil) {
  if (state === 'overdue') return `Overdue by ${Math.abs(daysUntil)}d`
  if (state === 'due_soon') return `Due in ${daysUntil}d`
  return `On track (${daysUntil}d)`
}

const hasTrend = computed(() => (data.value?.trend?.labels?.length || 0) > 0)
// Only show the supply panel once a farmer has actually delivered — an all-zero
// panel would read as "we have no farmers" rather than "this isn't set up yet".
const hasSupply = computed(() => (data.value?.supply?.confirmedDeliveries || 0) > 0)
// Show the removed/avoided split only once something is classified — an all-zero
// split on a legacy dataset would read as "we removed nothing".
const hasTypeSplit = computed(() => {
  const t = data.value?.verifiedByType
  return !!t && (t.removal > 0 || t.avoidance > 0)
})
const hasStatusBreakdown = computed(() =>
  data.value ? Object.values(data.value.totals.byStatus).some((n) => n > 0) : false,
)

const trendData = computed(() => ({
  labels: data.value?.trend.labels || [],
  datasets: [
    {
      label: 'Proposed tCO₂e',
      data: data.value?.trend.proposed || [],
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      fill: true,
    },
    {
      label: 'Verified tCO₂e',
      data: data.value?.trend.verified || [],
      borderColor: '#069e2d',
      backgroundColor: 'rgba(6, 158, 45, 0.12)',
      fill: true,
    },
  ],
}))
const trendOptions = {
  plugins: { title: { display: true, text: 'Emission reductions over time' } },
}

const STATUS_COLORS = { draft: '#9ca3af', submitted: '#f59e0b', under_review: '#3b82f6', approved: '#069e2d', rejected: '#ef4444' }
const statusData = computed(() => {
  const by = data.value?.totals.byStatus || {}
  const keys = Object.keys(by).filter((k) => by[k] > 0)
  return {
    labels: keys.map((k) => REPORT_STATUS_META[k]?.label || k),
    datasets: [{ data: keys.map((k) => by[k]), backgroundColor: keys.map((k) => STATUS_COLORS[k]) }],
  }
})
const statusOptions = {
  plugins: { title: { display: true, text: 'Reports by status' } },
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    data.value = await getMyMrvDashboard()
  } catch (err) {
    console.error('Failed to load MRV dashboard:', err)
    loadError.value = err?.message || 'We could not load your MRV data right now.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="mrv-dash">
    <PageHeader title="MRV Dashboard">
      <template #description>
        Monitoring, reporting &amp; verification across your projects — emission reductions,
        activity, and reporting compliance.
      </template>
      <template #actions>
        <router-link to="/monitoring" class="btn-ghost">Open report editor</router-link>
      </template>
    </PageHeader>

    <div class="page-body">

    <div v-if="loading" class="muted">Loading…</div>

    <div v-else-if="loadError" class="notice error">
      <span class="material-symbols-outlined" aria-hidden="true">error</span>
      <div class="notice-body">
        <strong>Couldn't load your MRV data.</strong>
        {{ loadError }}
        <div><button class="retry-btn" @click="load">Try again</button></div>
      </div>
    </div>

    <template v-else-if="data && data.totals.projects">
      <!-- Summary cards -->
      <section class="cards">
        <div class="card">
          <div class="card-label">Verified reductions</div>
          <div class="card-value">{{ tco2e(data.totals.verifiedVers) }}</div>
          <div v-if="hasTypeSplit" class="split">
            <span class="split-item removal">
              <span class="dot"></span>{{ num(data.verifiedByType.removal) }} removed
            </span>
            <span class="split-item avoidance">
              <span class="dot"></span>{{ num(data.verifiedByType.avoidance) }} avoided
            </span>
            <span v-if="data.verifiedByType.unclassified" class="split-item unclassified">
              <span class="dot"></span>{{ num(data.verifiedByType.unclassified) }} unclassified
            </span>
          </div>
          <div class="muted small">{{ num(data.totals.pendingVers) }} tCO₂e pending issuance</div>
        </div>
        <div class="card">
          <div class="card-label">Proposed (in reports)</div>
          <div class="card-value">{{ tco2e(data.totals.proposedVers) }}</div>
          <div class="muted small">{{ num(data.totals.reportsTotal) }} report(s) filed</div>
        </div>
        <div v-if="data.totals.energyGeneratedKwh > 0" class="card">
          <div class="card-label">Energy generated</div>
          <div class="card-value">{{ energy(data.totals.energyGeneratedKwh) }}</div>
          <div class="muted small">from measured activity data</div>
        </div>
        <div class="card">
          <div class="card-label">Projects reporting</div>
          <div class="card-value">{{ num(data.totals.projectsReporting) }} / {{ num(data.totals.projects) }}</div>
          <div class="muted small">validated projects</div>
        </div>
        <div class="card" :class="{ alert: data.compliance.overdue > 0 }">
          <div class="card-label">Reporting compliance</div>
          <div class="card-value">{{ num(data.compliance.overdue) }} overdue</div>
          <div class="muted small">{{ num(data.compliance.due_soon) }} due soon · {{ num(data.compliance.on_track) }} on track</div>
        </div>
      </section>

      <!-- Farmer supply chain (expansion #6 feeding #4) -->
      <section v-if="hasSupply" class="panel">
        <h2>Farmer supply chain</h2>
        <p class="muted small sub">
          Confirmed feedstock deliveries from farmers. Pending and rejected deliveries are excluded.
        </p>
        <div class="metric-grid">
          <div class="metric">
            <div class="metric-value">{{ num(data.supply.farmersParticipating) }}</div>
            <div class="metric-label">Farmers participating</div>
          </div>
          <div class="metric">
            <div class="metric-value">
              {{ num(data.supply.biomassCollectedTonnes) }} <span class="metric-unit">t</span>
            </div>
            <div class="metric-label">Biomass collected</div>
          </div>
          <div class="metric">
            <div class="metric-value" v-if="data.supply.hectaresAvailable">
              {{ num(data.supply.plantationHectares) }} <span class="metric-unit">ha</span>
            </div>
            <div class="metric-value muted" v-else>—</div>
            <div class="metric-label">Plantation hectares</div>
          </div>
          <div class="metric">
            <div class="metric-value">{{ num(data.supply.confirmedDeliveries) }}</div>
            <div class="metric-label">Confirmed deliveries</div>
          </div>
        </div>
        <p v-if="data.supply.unconvertedDeliveries" class="muted small note">
          {{ num(data.supply.unconvertedDeliveries) }} delivery(ies) are measured in sacks, bales, or
          m³ and are excluded from the biomass tonnage — their mass depends on the feedstock's bulk
          density.
        </p>
        <p v-if="!data.supply.hectaresAvailable" class="muted small note">
          Plantation hectares are unavailable: the parcels supplying you aren't readable yet. Apply
          migration #26 (<code>20260712000000_parcel_supply_visibility.sql</code>) to enable it.
        </p>
      </section>

      <!-- Charts -->
      <section v-if="hasTrend || hasStatusBreakdown" class="charts">
        <div v-if="hasTrend" class="chart-card wide">
          <PortfolioChart :data="trendData" :options="trendOptions" />
        </div>
        <div v-if="hasStatusBreakdown" class="chart-card">
          <CategoryChart :data="statusData" :options="statusOptions" />
        </div>
      </section>

      <!-- Activity metrics -->
      <section v-if="data.metricTotals.length" class="panel">
        <h2>Measured activity (cumulative)</h2>
        <div class="metric-grid">
          <div v-for="m in data.metricTotals" :key="m.metric_key" class="metric">
            <div class="metric-value">{{ num(m.value) }} <span class="metric-unit">{{ m.unit }}</span></div>
            <div class="metric-label">{{ m.label }}</div>
          </div>
        </div>
      </section>

      <!-- Per-project compliance -->
      <section class="panel">
        <h2>Projects &amp; reporting status</h2>
        <div class="table-scroll">
          <!-- data-label drives the under-640px card layout; see
               src/styles/responsive-table.css -->
          <table class="data-table stack-on-mobile">
            <thead>
              <tr>
                <th>Project</th>
                <th class="num">Reports</th>
                <th>Latest report</th>
                <th>Last period</th>
                <th class="num">Verified</th>
                <th>Reporting</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in data.perProject" :key="p.projectId">
                <td data-label="Project">
                  <router-link :to="`/projects/${p.projectId}`" class="proj-link">{{ p.title }}</router-link>
                  <div v-if="p.category" class="muted small">{{ p.category }}</div>
                </td>
                <td class="num" data-label="Reports">{{ num(p.reportsCount) }}</td>
                <td data-label="Latest report">
                  <span v-if="p.latestStatus" class="badge" :class="p.latestStatus">{{ statusLabel(p.latestStatus) }}</span>
                  <span v-else class="muted small">None yet</span>
                </td>
                <td data-label="Last period">{{ shortDate(p.lastPeriodEnd) }}</td>
                <td class="num" data-label="Verified">{{ num(p.verifiedVers) }}</td>
                <td data-label="Reporting">
                  <span class="badge" :class="p.compliance.state">
                    {{ complianceLabel(p.compliance.state, p.compliance.daysUntil) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="muted small legend">
          Compliance is measured against the platform reporting cadence. Overdue projects also raise a bell reminder.
        </p>
      </section>
    </template>

    <!-- Empty state -->
    <div v-else class="empty">
      <span class="material-symbols-outlined empty-icon" aria-hidden="true">monitoring</span>
      <h2>No MRV data yet</h2>
      <p class="muted">
        Once you have a validated project and file monitoring reports, your verified reductions,
        activity, and reporting compliance will roll up here.
      </p>
      <router-link to="/monitoring" class="btn-primary">Go to reports</router-link>
    </div>
    </div>
  </div>
</template>

<style scoped>
.mrv-dash { min-height: 100vh; background: var(--bg-secondary, #f8fdf8); }
.page-body { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
.page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 20px; }
.page-head h1 { margin: 0; font-size: 1.6rem; }
.page-head p { color: #6b7280; margin: 4px 0 0; max-width: 640px; }
.muted { color: #6b7280; }
.small { font-size: 0.8rem; }
.notice { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-radius: 10px; margin-bottom: 20px; }
.notice.error { background: #fee2e2; color: #991b1b; }
.notice-body { display: flex; flex-direction: column; gap: 4px; }
.retry-btn { margin-top: 8px; padding: 6px 14px; border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 8px; font-weight: 600; cursor: pointer; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; }
.card.alert { border-color: #fca5a5; background: #fef2f2; }
.card-label { color: #6b7280; font-size: 0.85rem; }
.card-value { font-size: 1.5rem; font-weight: 700; margin: 6px 0; }
.split { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-bottom: 6px; }
.split-item { display: inline-flex; align-items: center; gap: 5px; font-size: 0.76rem; font-weight: 600; color: #4b5563; }
.split-item .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.split-item.removal .dot { background: #069e2d; }
.split-item.avoidance .dot { background: #2563eb; }
.split-item.unclassified .dot { background: #d1d5db; }
.split-item.unclassified { color: #9ca3af; }
.charts { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; margin-bottom: 24px; }
.chart-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; }
.panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; margin-bottom: 20px; }
.panel h2 { margin: 0 0 14px; font-size: 1.1rem; }
.metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; }
.metric { background: #f9fafb; border: 1px solid #f1f5f9; border-radius: 10px; padding: 14px; }
.metric-value { font-size: 1.25rem; font-weight: 700; color: #111827; }
.metric-unit { font-size: 0.85rem; font-weight: 500; color: #6b7280; }
.metric-label { color: #6b7280; font-size: 0.82rem; margin-top: 2px; }
.table-scroll { width: 100%; overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; white-space: nowrap; }
.data-table th.num, .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.proj-link { color: #069e2d; font-weight: 600; text-decoration: none; }
.proj-link:hover { text-decoration: underline; }
.badge { padding: 2px 8px; border-radius: 999px; font-size: 0.75rem; text-transform: capitalize; background: #e5e7eb; color: #374151; }
.badge.approved, .badge.on_track { background: #d1fae5; color: #065f46; }
.badge.submitted { background: #fef3c7; color: #92400e; }
.badge.under_review { background: #dbeafe; color: #1e40af; }
.badge.draft { background: #f3f4f6; color: #6b7280; }
.badge.rejected, .badge.overdue { background: #fee2e2; color: #991b1b; }
.badge.due_soon { background: #fef3c7; color: #92400e; }
.legend { margin: 12px 0 0; }
.btn-primary { background: #069e2d; color: #fff; border: none; border-radius: 8px; padding: 10px 18px; cursor: pointer; font-weight: 600; text-decoration: none; display: inline-block; }
.btn-ghost { background: #fff; color: #374151; border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 16px; cursor: pointer; font-weight: 600; text-decoration: none; white-space: nowrap; }
.empty { text-align: center; padding: 48px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
.empty-icon { font-size: 48px; color: #069e2d; }
.empty h2 { margin: 12px 0 6px; font-size: 1.2rem; }
.empty p { max-width: 460px; margin: 0 auto 18px; }
@media (max-width: 720px) {
  .charts { grid-template-columns: 1fr; }
  .page-head { flex-direction: column; }
}
</style>
