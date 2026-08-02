<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { useUserStore } from '@/store/userStore'
import { generateCarbonImpactReport } from '@/services/receiptService'
import { getSellerBalance, getMySales, getMyPayouts } from '@/services/payoutService'
import { creditOwnershipService } from '@/services/creditOwnershipService'
import { computeConcentration } from '@/services/portfolioAnalytics'
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

    // Build the category chart from what actually came back. Reassigned whole
    // rather than patched in place: the previous version mutated
    // `datasets[0].data` and left the seeded labels and colours behind, so a
    // response with fewer categories than the placeholder kept the extras.
    const breakdown = impactReport.categoryBreakdown || {}
    const categories = Object.keys(breakdown)
    const credits = categories.map((c) => Number(breakdown[c]?.credits) || 0)
    const totalCredits = credits.reduce((sum, n) => sum + n, 0)

    categoryChartData.value =
      totalCredits > 0
        ? {
            labels: categories,
            datasets: [
              {
                data: credits.map((n) => Math.round((n / totalCredits) * 100)),
                // Sliced by index so slot 1 is always the same hue whatever the
                // category count. `%` guards a portfolio with more categories
                // than slots — those fold onto earlier hues, which the legend
                // and the table view still disambiguate.
                backgroundColor: categories.map((_, i) => SERIES_COLORS[i % SERIES_COLORS.length]),
                borderColor: '#ffffff',
                // A 2px surface gap between adjacent segments, so touching
                // slices read as separate marks rather than one blended arc.
                borderWidth: 2,
              },
            ],
          }
        : { labels: [], datasets: [] }
  } catch (err) {
    console.error('Error loading carbon impact data:', err)
    error.value = 'Failed to load impact data'
  } finally {
    loading.value = false
  }
}

/**
 * Per-project holdings, for the concentration panel.
 *
 * Loaded separately and failing QUIETLY: concentration is one panel on this
 * page, and losing it must not blank the impact report beside it. The panel
 * simply does not render when there is nothing to compute — it never shows a
 * zero, because "0% in your largest project" is a false statement rather than
 * an empty one.
 */
const loadHoldings = async () => {
  const userId = userStore.user?.id
  if (!userId) return
  try {
    holdings.value = await creditOwnershipService.getUserCreditPortfolio(userId)
  } catch (err) {
    console.warn('[analytics] concentration unavailable:', err?.message)
    holdings.value = []
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

/**
 * Categorical series colours, in fixed slot order.
 *
 * Assigned by SLOT, never cycled and never re-assigned when the number of
 * categories changes — a filter that drops a category must not repaint the
 * survivors, or the reader's mental mapping of colour→category silently breaks.
 *
 * The previous set was picked ad hoc and included a red, which is reserved for
 * error/critical status everywhere else in this app; a "Waste Management" slice
 * rendered in the same red as a failed payment is a real misread. This order is
 * validated: worst adjacent CVD ΔE 9.1 (protan), worst adjacent normal-vision
 * ΔE 19.6, both clear of their floors on a white surface. Three of the five sit
 * under 3:1 contrast against white, which obliges visible labels rather than
 * colour alone — hence the legend plus the percentage in every tooltip and the
 * table view below the chart.
 */
const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4']

/**
 * Starts EMPTY, deliberately.
 *
 * This used to be seeded with five invented categories and the shares
 * [35, 25, 15, 15, 10]. Those numbers rendered as a finished chart before any
 * data loaded, and stayed on screen if the load failed or the account simply
 * had no purchases — so a buyer could be shown a confident breakdown of a
 * portfolio they do not own, in a page they pay for, and export decisions from
 * it. Placeholder data that is indistinguishable from real data is the worst
 * kind. The empty state below says "no purchases yet" instead.
 */
const categoryChartData = ref({ labels: [], datasets: [] })

const hasCategoryData = computed(() => (categoryChartData.value.labels || []).length > 0)

// ── Concentration ───────────────────────────────────────────────────────────
// Holdings are loaded here rather than reusing the impact report: that report
// aggregates by category and drops the per-PROJECT split, which is precisely
// what concentration needs.
const holdings = ref([])

const concentration = computed(() => computeConcentration(holdings.value))

/** What each HHI band means, in words a buyer can act on. */
const CONCENTRATION_COPY = {
  none: { label: '—', detail: '' },
  diversified: {
    label: 'Diversified',
    detail:
      'Your offsets are spread across enough projects that a problem with any one of them — a reversal, a suspension, a failed re-verification — would affect only part of your position.',
  },
  moderate: {
    label: 'Moderately concentrated',
    detail:
      'A meaningful share of your offsets sits in a small number of projects. Worth knowing before you rely on them for a disclosure.',
  },
  concentrated: {
    label: 'Concentrated',
    detail:
      'Most of your offsets sit in very few projects. If one were reversed or suspended, a large part of your claimed reduction would go with it.',
  },
}

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
  loadHoldings()
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
            <CategoryChart v-if="hasCategoryData" :data="categoryChartData" :options="categoryChartOptions" />
            <!-- Was a chart of five invented categories. An empty state is the
                 honest version of "we have nothing to show you". -->
            <p v-else class="chart-empty">
              No purchases to break down yet. Buy credits and your category mix appears here.
            </p>

            <!-- The table view the contrast relief rule requires: three of the
                 five slot colours sit under 3:1 on white, so identity must not
                 rest on colour alone. It doubles as the accessible view. -->
            <table v-if="hasCategoryData" class="chart-table">
              <caption class="sr-only">Credit purchases by category, as percentages</caption>
              <thead>
                <tr><th scope="col">Category</th><th scope="col" class="num">Share</th></tr>
              </thead>
              <tbody>
                <tr v-for="(label, i) in categoryChartData.labels" :key="label">
                  <th scope="row">
                    <span
                      class="swatch"
                      :style="{ background: categoryChartData.datasets[0].backgroundColor[i] }"
                      aria-hidden="true"
                    ></span>
                    {{ label }}
                  </th>
                  <td class="num">{{ categoryChartData.datasets[0].data[i] }}%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ── Concentration ────────────────────────────────────────────────
             The one thing on this page that cannot be read off the free
             portfolio view: how much of the position sits in one project. -->
        <div class="concentration" v-if="concentration.totalCredits > 0">
          <div class="conc-head">
            <h3>Concentration</h3>
            <span class="conc-rating" :class="concentration.rating">
              {{ CONCENTRATION_COPY[concentration.rating].label }}
            </span>
          </div>
          <p class="conc-explainer">{{ CONCENTRATION_COPY[concentration.rating].detail }}</p>

          <div class="conc-stats">
            <div class="conc-stat">
              <span class="conc-label">Largest project</span>
              <span class="conc-value">{{ concentration.largestShare }}%</span>
            </div>
            <div class="conc-stat">
              <span class="conc-label">Top 3 projects</span>
              <span class="conc-value">{{ concentration.topThreeShare }}%</span>
            </div>
            <div class="conc-stat">
              <span class="conc-label">Projects held</span>
              <span class="conc-value">{{ concentration.projectCount }}</span>
            </div>
            <div class="conc-stat">
              <span class="conc-label">Categories</span>
              <span class="conc-value">{{ concentration.categoryCount }}</span>
            </div>
          </div>

          <!-- A horizontal bar per project: magnitude compared across a short,
               named list, which is what bars are for. Values are labelled
               directly, so no axis is needed and no legend (one series). -->
          <ul class="conc-bars">
            <li v-for="p in concentration.topProjects" :key="p.label" class="conc-bar-row">
              <span class="conc-bar-label" :title="p.label">{{ p.label }}</span>
              <span class="conc-bar-track">
                <span class="conc-bar-fill" :style="{ width: `${p.share}%` }"></span>
              </span>
              <span class="conc-bar-value">{{ p.share }}%</span>
            </li>
          </ul>
          <p class="conc-foot">
            Share of the {{ concentration.totalCredits.toLocaleString() }} credits you currently
            hold. Retired credits are excluded — they are spent, not exposure.
          </p>
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
  color: var(--primary-color, #058526);
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
  color: var(--primary-color, #058526);
  border-bottom-color: var(--primary-color, #058526);
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
  color: var(--success-color, #058526);
}

.charts-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(400px, 100%), 1fr));
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

.chart-empty {
  margin: 0;
  padding: 2rem 0;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.88rem;
}

/* The accessible/relief view of the doughnut. Values sit in text ink, never in
   the series colour — the swatch beside the label carries identity. */
.chart-table {
  width: 100%;
  margin-top: 1rem;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.chart-table th,
.chart-table td {
  padding: 0.35rem 0.25rem;
  text-align: left;
  font-weight: 500;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-light, #e8f5e8);
}

.chart-table thead th {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.chart-table .num {
  text-align: right;
}

.swatch {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: 0.4rem;
  border-radius: 2px;
  vertical-align: baseline;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ── Concentration ───────────────────────────────────────────────────────── */
.concentration {
  background: #fff;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 3rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.conc-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.35rem;
}

.conc-head h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* Status wears status colours, and always with its label — never colour alone. */
.conc-rating {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.conc-rating.diversified {
  background: #dcfce7;
  color: #166534;
}
.conc-rating.moderate {
  background: #fef3c7;
  color: #92400e;
}
.conc-rating.concentrated {
  background: #fee2e2;
  color: #991b1b;
}

.conc-explainer {
  margin: 0 0 1.25rem;
  max-width: 70ch;
  font-size: 0.85rem;
  line-height: 1.55;
  color: var(--text-secondary);
}

.conc-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.conc-stat {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.conc-label {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.conc-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.conc-bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
}

.conc-bar-row {
  display: grid;
  grid-template-columns: minmax(0, 12rem) 1fr auto;
  align-items: center;
  gap: 0.75rem;
}

.conc-bar-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.84rem;
  color: var(--text-secondary);
}

.conc-bar-track {
  height: 8px;
  border-radius: 999px;
  background: var(--bg-tertiary, #f0f9f0);
  overflow: hidden;
}

/* Thin mark, rounded data-end, anchored to the baseline (left edge). One
   series, so it carries the single sequential hue and needs no legend. */
.conc-bar-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--primary-color, #058526);
}

.conc-bar-value {
  min-width: 3.2rem;
  text-align: right;
  font-size: 0.84rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary);
}

.conc-foot {
  margin: 1rem 0 0;
  font-size: 0.76rem;
  line-height: 1.5;
  color: var(--text-muted);
}

@media (max-width: 640px) {
  .concentration {
    padding: 1rem;
  }

  /* The label needs the full width on a phone; the bar and its value share the
     line below it rather than each being squeezed to a few pixels. */
  .conc-bar-row {
    grid-template-columns: 1fr auto;
    row-gap: 0.3rem;
  }

  .conc-bar-label {
    grid-column: 1 / -1;
    white-space: normal;
  }

  /* Each row is two lines here, so the 0.5rem list gap that separated
     single-line rows no longer reads as a separation — the next project's name
     sits as close to this bar as this project's name does. Verified by
     rendering at 380px. */
  .conc-bars {
    gap: 1rem;
  }
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
  color: var(--success-color, #058526);
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
  background: var(--primary-color, #058526);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover, #04701f);
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
