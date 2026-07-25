<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { useUserStore } from '@/store/userStore'
import { generateCarbonImpactReport } from '@/services/receiptService'
import { getSellerBalance, getMySales, getMyPayouts } from '@/services/payoutService'
import { formatDate } from '@/utils/formatDate'
import { FEATURES } from '@/constants/plans'
import PortfolioChart from '@/components/charts/PortfolioChart.vue'
import CategoryChart from '@/components/charts/CategoryChart.vue'
import FeatureGate from '@/components/ui/FeatureGate.vue'

// User store and state
const userStore = useUserStore()
const activeTab = ref('buying') // 'buying' | 'selling'
const loading = ref(false)
const error = ref('')
const carbonImpactData = ref(null)

// Selling state
const sellerBalance = ref({ available: 0, held: 0, currency: 'PHP' })
const sales = ref([])
const payouts = ref([])

const currency = (n, sym = '₱') => `${sym}${Number(n || 0).toLocaleString()}`

// Group {date, amount} rows into a monthly series (YYYY-MM) for a line chart.
function monthlySeries(rows, dateKey, amountKey) {
  const buckets = new Map()
  for (const r of rows || []) {
    const d = new Date(r[dateKey])
    if (isNaN(d)) continue
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    buckets.set(key, (buckets.get(key) || 0) + (Number(r[amountKey]) || 0))
  }
  const labels = [...buckets.keys()].sort()
  return { labels, data: labels.map((l) => buckets.get(l)) }
}

// ── Buying chart: real monthly spend from recent purchases ──
const portfolioChartData = computed(() => {
  const series = monthlySeries(carbonImpactData.value?.recentPurchases || [], 'date', 'amount')
  return {
    labels: series.labels,
    datasets: [
      {
        label: 'Spend (₱)',
        data: series.data,
        borderColor: 'rgb(16, 185, 129)',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  }
})

// ── Selling chart: real monthly sales revenue ──
const salesChartData = computed(() => {
  const completed = sales.value.filter((s) => s.status === 'completed')
  const series = monthlySeries(completed, 'created_at', 'total_amount')
  return {
    labels: series.labels,
    datasets: [
      {
        label: 'Sales revenue (₱)',
        data: series.data,
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  }
})

const sellingSummary = computed(() => {
  const completed = sales.value.filter((s) => s.status === 'completed')
  return {
    totalSales: completed.length,
    creditsSold: completed.reduce((a, s) => a + (Number(s.quantity) || 0), 0),
    revenue: completed.reduce((a, s) => a + (Number(s.total_amount) || 0), 0),
  }
})

const loadCarbonImpactData = async () => {
  if (!userStore.user?.id) return

  loading.value = true
  error.value = ''

  try {
    const impactReport = await generateCarbonImpactReport(userStore.user.id)
    carbonImpactData.value = impactReport

    // Update category chart data with real data
    if (impactReport.categoryBreakdown) {
      const categories = Object.keys(impactReport.categoryBreakdown)
      const categoryData = categories.map(
        (category) => impactReport.categoryBreakdown[category].credits,
      )
      const totalCredits = categoryData.reduce((sum, credits) => sum + credits, 0)

      categoryChartData.value.labels = categories
      categoryChartData.value.datasets[0].data = categoryData.map((credits) =>
        totalCredits > 0 ? Math.round((credits / totalCredits) * 100) : 0,
      )
    }
  } catch (err) {
    console.error('Error loading carbon impact data:', err)
    error.value = 'Failed to load impact data'
  } finally {
    loading.value = false
  }
}

const loadSellingData = async () => {
  loading.value = true
  error.value = ''
  try {
    const [balance, salesData, payoutData] = await Promise.all([
      getSellerBalance(),
      getMySales(100),
      getMyPayouts(20),
    ])
    sellerBalance.value = balance
    sales.value = salesData
    payouts.value = payoutData
  } catch (err) {
    console.error('Error loading selling data:', err)
    error.value = 'Failed to load selling data'
  } finally {
    loading.value = false
  }
}

const canSeeSelling = computed(() => userStore.hasFeature(FEATURES.ADVANCED_ANALYTICS))

function switchTab(tab) {
  if (activeTab.value === tab) return
  activeTab.value = tab
  // Only fetch selling data for entitled users; FeatureGate shows the upgrade
  // prompt otherwise.
  if (tab === 'selling' && canSeeSelling.value && sales.value.length === 0) loadSellingData()
}

const portfolioChartOptions = computed(() => ({
  plugins: { title: { display: true, text: 'Monthly Spend (recent)' } },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { callback: (value) => '₱' + Number(value).toLocaleString() },
    },
  },
}))

const salesChartOptions = computed(() => ({
  plugins: { title: { display: true, text: 'Monthly Sales Revenue' } },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { callback: (value) => '₱' + Number(value).toLocaleString() },
    },
  },
}))

const categoryChartData = ref({
  labels: ['Forestry', 'Renewable Energy', 'Blue Carbon', 'Energy Efficiency', 'Waste Management'],
  datasets: [
    {
      data: [35, 25, 15, 15, 10],
      backgroundColor: [
        'rgba(16, 185, 129, 0.8)',
        'rgba(59, 130, 246, 0.8)',
        'rgba(139, 92, 246, 0.8)',
        'rgba(245, 158, 11, 0.8)',
        'rgba(239, 68, 68, 0.8)',
      ],
      borderColor: [
        'rgba(16, 185, 129, 1)',
        'rgba(59, 130, 246, 1)',
        'rgba(139, 92, 246, 1)',
        'rgba(245, 158, 11, 1)',
        'rgba(239, 68, 68, 1)',
      ],
      borderWidth: 2,
    },
  ],
})

const categoryChartOptions = ref({
  plugins: {
    title: {
      display: true,
      text: 'Credit Purchases by Category (%)',
    },
    tooltip: {
      callbacks: {
        label: function (context) {
          return context.label + ': ' + context.parsed + '%'
        },
      },
    },
  },
})

// Load data on component mount
onMounted(() => {
  loadCarbonImpactData()
})
</script>

<template>
  <div class="analytics-view">
    <PageHeader
      title="Analytics Dashboard"
      description="Analyze your buying and selling in the carbon market."
    />
    <div class="container">

      <!-- Buying / Selling tabs -->
      <div class="tab-bar">
        <button class="tab" :class="{ active: activeTab === 'buying' }" @click="switchTab('buying')">
          <span class="material-symbols-outlined tab-ico" aria-hidden="true">shopping_cart</span> Buying
        </button>
        <button class="tab" :class="{ active: activeTab === 'selling' }" @click="switchTab('selling')">
          <span class="material-symbols-outlined tab-ico" aria-hidden="true">sell</span> Selling
          <span v-if="!canSeeSelling" class="material-symbols-outlined tab-lock" aria-hidden="true">lock</span>
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="loading" class="loading-state">
        <div class="loading-spinner"><span class="material-symbols-outlined">progress_activity</span></div>
        <p>Loading analytics data...</p>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="error-state">
        <div class="error-icon"><span class="material-symbols-outlined">error</span></div>
        <p>{{ error }}</p>
        <button class="btn btn-primary" @click="activeTab === 'selling' ? loadSellingData() : loadCarbonImpactData()">
          Retry
        </button>
      </div>

      <!-- ───────── BUYING TAB ───────── -->
      <template v-else-if="activeTab === 'buying'">
      <div v-if="!canSeeSelling" class="free-note">
        <span class="material-symbols-outlined" aria-hidden="true">lock_open</span>
        <span>
          Free plan: summary metrics only.
          <router-link to="/upgrade?feature=advanced_analytics">Upgrade to Pro</router-link>
          for trend charts, category breakdown, full history, and selling analytics.
        </span>
      </div>
      <div class="analytics-grid">
        <div class="analytics-card">
          <div class="card-header">
            <h3>Portfolio Value</h3>
            <span class="card-icon material-symbols-outlined">account_balance_wallet</span>
          </div>
          <div class="card-content">
            <div class="metric-value">
              {{ currency(carbonImpactData?.summary?.totalAmountSpent) }}
            </div>
            <div class="metric-change positive">
              {{ carbonImpactData?.summary?.totalTransactions || 0 }} transactions
            </div>
          </div>
        </div>

        <div class="analytics-card">
          <div class="card-header">
            <h3>Credits Purchased</h3>
            <span class="card-icon material-symbols-outlined">eco</span>
          </div>
          <div class="card-content">
            <div class="metric-value">
              {{ carbonImpactData?.summary?.totalCreditsPurchased?.toLocaleString() || '0' }}
            </div>
            <div class="metric-change positive">
              Avg: {{ currency(Math.round(carbonImpactData?.summary?.averagePricePerCredit || 0)) }}/credit
            </div>
          </div>
        </div>

        <div class="analytics-card">
          <div class="card-header">
            <h3>CO₂ Offset</h3>
            <span class="card-icon material-symbols-outlined">public</span>
          </div>
          <div class="card-content">
            <div class="metric-value">
              {{
                carbonImpactData?.environmentalImpact?.co2OffsetTonnes?.toLocaleString() || '0'
              }}
              tons
            </div>
            <div class="metric-change positive">
              Equivalent to
              {{ carbonImpactData?.environmentalImpact?.equivalentTreesPlanted || 0 }} trees
            </div>
          </div>
        </div>

        <div class="analytics-card">
          <div class="card-header">
            <h3>Projects Supported</h3>
            <span class="card-icon material-symbols-outlined">construction</span>
          </div>
          <div class="card-content">
            <div class="metric-value">
              {{ Object.keys(carbonImpactData?.categoryBreakdown || {}).length || 0 }}
            </div>
            <div class="metric-change positive">
              {{ carbonImpactData?.summary?.totalTransactions || 0 }} total purchases
            </div>
          </div>
        </div>
      </div>

      <!-- Free tier gets the summary cards above. Charts + recent activity are a
           Pro feature — free users see an upgrade prompt in their place. -->
      <FeatureGate
        :feature="FEATURES.ADVANCED_ANALYTICS"
        title="Detailed analytics is a Pro feature"
        message="You're seeing the free summary. Upgrade to Pro for trend charts, category breakdown, and your full purchase history."
      >
        <!-- Charts Section -->
        <div class="charts-section">
          <div class="chart-card">
            <h3>Portfolio Performance</h3>
            <PortfolioChart :data="portfolioChartData" :options="portfolioChartOptions" />
          </div>

          <div class="chart-card">
            <h3>Credit Purchases by Category</h3>
            <CategoryChart :data="categoryChartData" :options="categoryChartOptions" />
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="activity-section">
          <h3>Recent Purchases</h3>
          <div class="activity-list">
            <div v-if="carbonImpactData?.recentPurchases?.length === 0" class="empty-activity">
              <p>No recent purchases found.</p>
            </div>
            <div
              v-for="purchase in carbonImpactData?.recentPurchases || []"
              :key="purchase.date"
              class="activity-item"
            >
              <div class="activity-icon"><span class="material-symbols-outlined">shopping_cart</span></div>
              <div class="activity-content">
                <div class="activity-title">Purchased {{ purchase.credits }} credits</div>
                <div class="activity-description">
                  {{ purchase.project }} - {{ purchase.category }}
                </div>
                <div class="activity-time">{{ formatDate(purchase.date) }}</div>
              </div>
              <div class="activity-value">
                {{ purchase.currency }}{{ purchase.amount.toLocaleString() }}
              </div>
            </div>
          </div>
        </div>
      </FeatureGate>
      </template>

      <!-- ───────── SELLING TAB (Pro: advanced analytics) ───────── -->
      <template v-else-if="activeTab === 'selling'">
       <FeatureGate
         :feature="FEATURES.ADVANCED_ANALYTICS"
         title="Selling analytics is a Pro feature"
         message="Upgrade to Pro to see your sales revenue, escrow balance, and payout history."
       >
        <div class="analytics-grid">
          <div class="analytics-card">
            <div class="card-header"><h3>Available Balance</h3><span class="card-icon material-symbols-outlined">account_balance_wallet</span></div>
            <div class="card-content">
              <div class="metric-value">{{ currency(sellerBalance.available) }}</div>
              <div class="metric-change">Withdrawable now</div>
            </div>
          </div>
          <div class="analytics-card">
            <div class="card-header"><h3>In Escrow</h3><span class="card-icon material-symbols-outlined">lock</span></div>
            <div class="card-content">
              <div class="metric-value">{{ currency(sellerBalance.held) }}</div>
              <div class="metric-change">Held until release</div>
            </div>
          </div>
          <div class="analytics-card">
            <div class="card-header"><h3>Credits Sold</h3><span class="card-icon material-symbols-outlined">eco</span></div>
            <div class="card-content">
              <div class="metric-value">{{ sellingSummary.creditsSold.toLocaleString() }}</div>
              <div class="metric-change positive">{{ sellingSummary.totalSales }} completed sales</div>
            </div>
          </div>
          <div class="analytics-card">
            <div class="card-header"><h3>Total Revenue</h3><span class="card-icon material-symbols-outlined">trending_up</span></div>
            <div class="card-content">
              <div class="metric-value">{{ currency(sellingSummary.revenue) }}</div>
              <div class="metric-change positive">Gross, before fees</div>
            </div>
          </div>
        </div>

        <div class="charts-section">
          <div class="chart-card">
            <h3>Sales Over Time</h3>
            <PortfolioChart :data="salesChartData" :options="salesChartOptions" />
          </div>
        </div>

        <div class="activity-section">
          <h3>Recent Sales</h3>
          <div class="activity-list">
            <div v-if="sales.length === 0" class="empty-activity"><p>No sales yet.</p></div>
            <div v-for="sale in sales.slice(0, 10)" :key="sale.id" class="activity-item">
              <div class="activity-icon"><span class="material-symbols-outlined">toll</span></div>
              <div class="activity-content">
                <div class="activity-title">Sold {{ sale.quantity }} credits</div>
                <div class="activity-description">Status: {{ sale.status }}</div>
                <div class="activity-time">{{ formatDate(sale.created_at) }}</div>
              </div>
              <div class="activity-value">{{ currency(sale.total_amount, sale.currency === 'PHP' ? '₱' : sale.currency + ' ') }}</div>
            </div>
          </div>
        </div>

        <div class="activity-section" style="margin-top: 2rem">
          <h3>Payout History</h3>
          <div class="activity-list">
            <div v-if="payouts.length === 0" class="empty-activity"><p>No withdrawals yet.</p></div>
            <div v-for="p in payouts" :key="p.id" class="activity-item">
              <div class="activity-icon"><span class="material-symbols-outlined">account_balance</span></div>
              <div class="activity-content">
                <div class="activity-title">Withdrawal {{ currency(p.amount) }}</div>
                <div class="activity-description">
                  Status: {{ p.status }}<span v-if="p.failure_reason"> — {{ p.failure_reason }}</span>
                </div>
                <div class="activity-time">{{ formatDate(p.created_at) }}</div>
              </div>
            </div>
          </div>
        </div>
       </FeatureGate>
      </template>
    </div>
  </div>
</template>

<style scoped>
.analytics-view {
  padding: 0 0 2rem;
  min-height: 100vh;
  background: var(--bg-secondary);
}

.analytics-view .container {
  padding-top: 2rem;
}

.free-note {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1.5rem;
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  border-radius: 10px;
  font-size: 0.9rem;
  color: #065f46;
}
.free-note a {
  color: var(--primary-color, #069e2d);
  font-weight: 700;
}

.tab-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 2rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
}

.tab {
  padding: 0.65rem 1.25rem;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-secondary, #6b7280);
  cursor: pointer;
  margin-bottom: -1px;
}

.tab.active {
  color: var(--primary-color, #069e2d);
  border-bottom-color: var(--primary-color, #069e2d);
}

.tab-lock {
  font-size: 0.95rem;
  vertical-align: middle;
  margin-left: 0.2rem;
  color: #9ca3af;
}

.analytics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.analytics-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  transition: transform 0.2s;
}

.analytics-card:hover {
  transform: translateY(-2px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.card-header h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
}

.card-icon {
  font-size: 1.5rem;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.metric-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--primary-color);
}

.metric-change {
  font-size: 0.875rem;
  font-weight: 500;
}

.metric-change.positive {
  color: #10b981;
}

.charts-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 2rem;
  margin-bottom: 3rem;
}

.chart-card {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.chart-card h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 1.5rem 0;
}

.chart-card {
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border: 1px solid var(--border-color);
}

.chart-card h3 {
  margin: 0 0 1rem 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

.activity-section {
  background: white;
  border-radius: 12px;
  padding: 2rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.activity-section h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 1.5rem 0;
}

.activity-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.activity-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-muted);
  border-radius: 8px;
}

.activity-icon {
  font-size: 1.5rem;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 50%;
}

.activity-content {
  flex: 1;
}

.activity-title {
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.activity-description {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

.activity-time {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.activity-value {
  font-weight: 600;
  color: var(--text-primary);
}

.activity-value.positive {
  color: #10b981;
}

.empty-activity {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted);
}

.loading-state,
.error-state {
  text-align: center;
  padding: 4rem 2rem;
  color: var(--text-muted);
}

.loading-spinner,
.error-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

.tab-ico {
  font-size: 1.1rem;
  vertical-align: middle;
}

.loading-spinner .material-symbols-outlined {
  display: inline-block;
  animation: analytics-spin 1s linear infinite;
}

@keyframes analytics-spin {
  to {
    transform: rotate(360deg);
  }
}

.loading-state p,
.error-state p {
  margin-bottom: 2rem;
  font-size: 1.1rem;
}

.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  text-decoration: none;
}

.btn-primary {
  background: var(--primary-color, #069e2d);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover, #058e3f);
}

@media (max-width: 768px) {
  .analytics-grid {
    grid-template-columns: 1fr;
  }

  .charts-section {
    grid-template-columns: 1fr;
  }

  .activity-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.75rem;
  }
}
</style>
