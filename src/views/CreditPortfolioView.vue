<template>
  <div class="credit-portfolio-page">
    <!-- Page Header -->
    <div class="page-header">
      <div class="container">
        <div class="header-content">
          <div class="header-text">
            <h1 class="page-title">Credit Portfolio</h1>
            <p class="page-description">
              Manage your carbon credit portfolio and track your environmental impact
            </p>
          </div>
          <div class="header-actions">
            <button
              class="btn btn-export"
              :disabled="exporting"
              title="Download your offset/ESG report as a PDF"
              @click="downloadEsg('pdf')"
            >
              {{ exporting === 'pdf' ? 'Preparing…' : 'ESG report (PDF)' }}
            </button>
            <button
              class="btn btn-export outline"
              :disabled="exporting"
              title="Download your offset/ESG report as a CSV"
              @click="downloadEsg('csv')"
            >
              {{ exporting === 'csv' ? 'Preparing…' : 'CSV' }}
            </button>
          </div>
        </div>
        <p v-if="exportMessage" class="export-message" :class="{ error: exportError }">
          {{ exportMessage }}
        </p>
      </div>
    </div>

    <!-- Main Content -->
    <div class="portfolio-content">
      <div class="container">
        <!-- Loading State -->
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading your credit portfolio...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="error-state">
          <div class="error-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 3.25 3.75 19.5h16.5L12 3.25Z" stroke-linejoin="round" />
              <path d="M12 9v4.5" stroke-linecap="round" />
              <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <h3>Unable to load portfolio</h3>
          <p>{{ error }}</p>
          <button class="btn btn-primary" @click="loadPortfolio">Try Again</button>
        </div>

        <!-- Portfolio Content -->
        <div v-else class="portfolio-grid">
          <!-- Portfolio Stats -->
          <div class="stats-section">
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M19 8.5c-1.5-3-4.5-5.5-8.5-5.5-4.4 0-8 3.4-8 7.8 0 4.3 3.3 7.7 7.5 7.7H11v2.1a.75.75 0 0 0 1.28.53l2.9-2.9a.75.75 0 0 0-.53-1.28H12c-2.6 0-4.75-2.07-4.75-4.75S9.4 7 12 7h6.5Z"
                    />
                  </svg>
                </div>
                <div class="stat-content">
                  <h3>{{ creditStats.total_owned.toLocaleString() }}</h3>
                  <p>Total Credits Owned</p>
                </div>
              </div>
              <div class="stat-card">
                <div class="stat-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M16.5 6.75A5.25 5.25 0 0 0 6.75 9h2.5m8 8.25A5.25 5.25 0 0 0 17.25 9h-2.5M9.25 16.5A5.25 5.25 0 0 0 17.25 9m-10.5 6.75-2-2m2 2 2-2m4.5-5.5 2-2m-2 2-2-2"
                    />
                  </svg>
                </div>
                <div class="stat-content">
                  <h3>{{ creditStats.total_retired.toLocaleString() }}</h3>
                  <p>Credits Retired</p>
                </div>
              </div>
              <div class="stat-card">
                <div class="stat-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="5" y="3.75" width="14" height="16.5" rx="2" />
                    <path d="M9 7.5h2m-2 4h2m-2 4h2m4-8h2m-2 4h2m-7 5.75v-4h4v4" />
                  </svg>
                </div>
                <div class="stat-content">
                  <h3>{{ creditStats.projects_count }}</h3>
                  <p>Projects Supported</p>
                </div>
              </div>
              <div class="stat-card">
                <div class="stat-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3.75" y="5.25" width="16.5" height="13.5" rx="3" />
                    <path
                      d="M7 9.5h5.25a2.25 2.25 0 1 1 0 4.5H7m6-6.5V8m0 8v-.5"
                      stroke-linecap="round"
                    />
                  </svg>
                </div>
                <div class="stat-content">
                  <h3>₱{{ portfolioValue.toLocaleString() }}</h3>
                  <p>Portfolio Value</p>
                  <p
                    v-if="marketPrice > 0 && pnl.pricedCredits > 0"
                    class="pnl"
                    :class="pnl.unrealizedPnl >= 0 ? 'up' : 'down'"
                  >
                    {{ pnl.unrealizedPnl >= 0 ? '▲' : '▼' }}
                    ₱{{ Math.abs(pnl.unrealizedPnl).toLocaleString() }}
                    ({{ pnl.unrealizedPnlPct >= 0 ? '+' : '' }}{{ pnl.unrealizedPnlPct }}%) vs market
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Credit Holdings -->
          <div class="holdings-section">
            <div class="section-header">
              <h2 class="section-title">Your Credit Holdings</h2>
              <div class="section-actions">
                <button class="btn btn-outline" @click="refreshPortfolio">
                  <span class="btn-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M3.75 9a8.25 8.25 0 0 1 14.28-4.987M20.25 15a8.25 8.25 0 0 1-14.28 4.987M3.75 9V5.25m0 3.75H7.5M20.25 15V18.75m0-3.75H16.5"
                      />
                    </svg>
                  </span>
                  Refresh
                </button>
              </div>
            </div>

            <!-- Empty State -->
            <div v-if="creditPortfolio.length === 0" class="empty-state">
              <div class="empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 3c-3.75 0-7 3.05-7 6.8 0 3.6 2.7 6.45 6.3 6.77v3.18a.75.75 0 0 0 1.28.53l2.65-2.65a.75.75 0 0 0-.53-1.28H12c-2.07 0-3.75-1.68-3.75-3.75S9.93 8.85 12 8.85h5.75C17.47 5.4 15.08 3 12 3Z"
                  />
                </svg>
              </div>
              <h3>No credits yet</h3>
              <p>Purchase credits from the marketplace to build your portfolio</p>
              <button class="btn btn-primary" @click="$router.push('/marketplace')">
                Browse Marketplace
              </button>
            </div>

            <!-- Credit Cards: a compact vertically-scrollable area. Collapsed it
                 shows the first few; "See more" reveals the rest, still scrolling
                 within the same capped height so the page never runs away. -->
            <div v-else class="credits-grid credits-scroll-y">
              <div
                v-for="credit in shownHoldings"
                :key="credit.id"
                class="credit-card"
                :class="{ retired: credit.ownership_status === 'retired' }"
              >
                <div class="credit-header">
                  <div class="credit-image">
                    <div class="image-placeholder">
                      {{ credit.project_category.charAt(0).toUpperCase() }}
                    </div>
                  </div>
                  <div class="credit-info">
                    <h3 class="credit-title">{{ credit.project_title }}</h3>
                    <p class="credit-location">
                      <span class="material-symbols-outlined" aria-hidden="true">location_on</span>
                      <span>{{ credit.project_location }}</span>
                    </p>
                    <span class="credit-category">{{ credit.project_category }}</span>
                  </div>
                </div>

                <div class="credit-details">
                  <div class="detail-row">
                    <span class="detail-label">Credits Owned:</span>
                    <span class="detail-value">{{ credit.quantity.toLocaleString() }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value" :class="credit.ownership_status">
                      {{ credit.ownership_status === 'retired' ? 'Retired' : 'Active' }}
                    </span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Purchase Date:</span>
                    <span class="detail-value">{{ formatDate(credit.created_at) }}</span>
                  </div>
                </div>

                <div class="credit-actions">
                  <button
                    v-if="credit.ownership_status !== 'retired' && credit.quantity > 0"
                    class="btn btn-sm btn-primary"
                    @click="router.push('/retire')"
                  >
                    Retire Credits
                  </button>
                  <button class="btn btn-sm btn-outline" @click="router.push('/wallet')">
                    Manage in Wallet
                  </button>
                </div>
              </div>
            </div>

            <div v-if="creditPortfolio.length > 0" class="holdings-footer">
              <span class="holdings-count">
                Showing {{ shownHoldings.length }} of {{ creditPortfolio.length }}
              </span>
              <div class="holdings-footer-actions">
                <button
                  v-if="hasMoreHoldings && !holdingsExpanded"
                  class="see-more-btn"
                  @click="showMoreHoldings"
                >
                  See more
                </button>
                <button
                  v-if="holdingsExpanded"
                  class="see-less-btn"
                  @click="showLessHoldings"
                >
                  Show less
                </button>
              </div>
            </div>
          </div>

          <!-- Portfolio Insights -->
          <div class="insights-section">
            <div class="insight-card">
              <div class="section-header">
                <h2 class="section-title">Category Allocation</h2>
              </div>
              <ul class="insight-list">
                <li v-if="categoryBreakdown.length === 0" class="insight-empty">
                  <span>No category data yet</span>
                </li>
                <li v-for="entry in categoryBreakdown" :key="entry.name" class="insight-list-item">
                  <span class="insight-label">{{ entry.name }}</span>
                  <span class="insight-value">
                    {{ entry.credits.toLocaleString() }} credits · {{ entry.percentageLabel }}
                  </span>
                </li>
              </ul>
            </div>

            <div class="insight-card">
              <div class="section-header">
                <h2 class="section-title">Geographic Spread</h2>
              </div>
              <ul class="insight-list">
                <li v-if="locationBreakdown.length === 0" class="insight-empty">
                  <span>No location data available</span>
                </li>
                <li v-for="entry in locationBreakdown" :key="entry.name" class="insight-list-item">
                  <span class="insight-label">{{ entry.name }}</span>
                  <span class="insight-value">
                    {{ entry.projects }} {{ entry.projects === 1 ? 'project' : 'projects' }}
                  </span>
                </li>
              </ul>
            </div>

            <div class="insight-card">
              <div class="section-header">
                <h2 class="section-title">Retirement Progress</h2>
              </div>
              <div class="retirement-progress">
                <div class="progress-number">
                  {{ creditStats.total_retired.toLocaleString() }} retired
                </div>
                <div class="progress-bar">
                  <div
                    class="progress-bar-fill"
                    :style="{ width: retirementProgress.percentLabel }"
                  ></div>
                </div>
                <p class="progress-description">
                  {{ retirementProgress.percentLabel }} of your credits have already been retired.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { creditOwnershipService } from '@/services/creditOwnershipService'
import { exportEsgReportCsv, exportEsgReportPdf } from '@/services/esgReportService'
import { getMarketStats } from '@/services/registryService'
import { computePortfolioPnl } from '@/services/portfolioAnalytics'

const router = useRouter()
const userStore = useUserStore()

// Data
const creditPortfolio = ref([])
const creditStats = ref({
  total_owned: 0,
  total_retired: 0,
  total_credits: 0,
  projects_count: 0,
})
const loading = ref(false)
const error = ref('')

// ESG / offset report export
const exporting = ref('') // '' | 'pdf' | 'csv'
const exportMessage = ref('')
const exportError = ref(false)

// A report is four Supabase reads plus, for PDF, a lazily-imported jsPDF chunk.
// Any one of those can stall on a bad connection, and an awaited request that
// never settles leaves the button reading "Preparing…" forever with nothing to
// click and nothing explaining why — the reported "it just loads, I can't
// export it". A bounded wait turns that into a stated failure the user can act
// on. Generous on purpose: this must only fire when something is genuinely
// wrong, never on a slow-but-working export.
const EXPORT_TIMEOUT_MS = 30_000

function withTimeout(promise, ms) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            'Your report is taking longer than expected. Check your connection and try again.',
          ),
        ),
      ms,
    )
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

async function downloadEsg(format) {
  const userId = userStore.session?.user?.id
  if (!userId) {
    exportError.value = true
    exportMessage.value = 'Please sign in to download your report.'
    return
  }
  if (exporting.value) return

  exporting.value = format
  exportMessage.value = 'Preparing your report…'
  exportError.value = false
  try {
    const data = await withTimeout(
      format === 'pdf' ? exportEsgReportPdf(userId) : exportEsgReportCsv(userId),
      EXPORT_TIMEOUT_MS,
    )
    const total = data?.totals?.totalCredits ?? 0
    exportMessage.value =
      total > 0
        ? `Your ESG/offset report downloaded (${total} credit${total === 1 ? '' : 's'} covered).`
        : 'Report downloaded — you have no credits to disclose yet.'
  } catch (e) {
    console.error('[ESG] export failed:', e)
    exportError.value = true
    exportMessage.value = e?.message || 'Could not generate your report. Please try again.'
  } finally {
    exporting.value = ''
  }
}

// Computed
// Current market price per credit (avg of active listings), loaded with the portfolio.
const marketPrice = ref(0)

// Real position: cost basis vs current market value + unrealized P&L.
const pnl = computed(() => computePortfolioPnl(creditPortfolio.value, marketPrice.value))

const portfolioValue = computed(() => pnl.value.marketValue)

const totalOwnedCredits = computed(() =>
  creditPortfolio.value.reduce((sum, record) => sum + (record.quantity || 0), 0),
)

// Holdings display: collapsed, it shows the first few cards in a single
// horizontal scroller so a large portfolio stays compact and fits the screen;
// "See more" expands to every card in the wrapping grid. The stats and
// breakdowns above always use the full creditPortfolio — only the rendered
// cards are limited.
const COLLAPSED_COUNT = 4
const holdingsExpanded = ref(false)
const shownHoldings = computed(() =>
  holdingsExpanded.value
    ? creditPortfolio.value
    : creditPortfolio.value.slice(0, COLLAPSED_COUNT),
)
const hasMoreHoldings = computed(() => creditPortfolio.value.length > COLLAPSED_COUNT)

function showMoreHoldings() {
  holdingsExpanded.value = true
}

function showLessHoldings() {
  holdingsExpanded.value = false
}

const categoryBreakdown = computed(() => {
  const totals = new Map()
  creditPortfolio.value.forEach((record) => {
    const name = record.project_category || 'Uncategorized'
    totals.set(name, (totals.get(name) || 0) + (record.quantity || 0))
  })

  const overall = totalOwnedCredits.value || 0

  return Array.from(totals.entries())
    .map(([name, credits]) => {
      const percent = overall > 0 ? Math.round((credits / overall) * 100) : 0
      return {
        name,
        credits,
        percentage: percent,
        percentageLabel: `${percent}%`,
      }
    })
    .sort((a, b) => b.credits - a.credits)
})

const locationBreakdown = computed(() => {
  const locations = new Map()
  creditPortfolio.value.forEach((record) => {
    const location = record.project_location || 'Unspecified'
    if (!locations.has(location)) {
      locations.set(location, { projects: 0, credits: 0 })
    }
    const entry = locations.get(location)
    entry.projects += 1
    entry.credits += record.quantity || 0
  })

  return Array.from(locations.entries())
    .map(([name, data]) => ({
      name,
      projects: data.projects,
      credits: data.credits,
    }))
    .sort((a, b) => b.credits - a.credits)
    .slice(0, 5)
})

const retirementProgress = computed(() => {
  const totalOwned = creditStats.value.total_owned || 0
  const totalRetired = creditStats.value.total_retired || 0
  const percent = totalOwned > 0 ? Math.min(100, Math.round((totalRetired / totalOwned) * 100)) : 0
  return {
    percent,
    percentLabel: `${percent}%`,
  }
})

// Methods
async function loadPortfolio() {
  if (!userStore.session?.user?.id) {
    error.value = 'Please log in to view your portfolio'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const [portfolio, stats, market] = await Promise.all([
      creditOwnershipService.getUserCreditPortfolio(userStore.session.user.id),
      creditOwnershipService.getUserCreditStats(userStore.session.user.id),
      getMarketStats().catch(() => null),
    ])

    creditPortfolio.value = portfolio || []
    holdingsExpanded.value = false
    marketPrice.value = Number(market?.avg_price) || 0
    creditStats.value = stats || {
      total_owned: 0,
      total_retired: 0,
      total_credits: 0,
      projects_count: 0,
    }

    if (import.meta.env.DEV) {
      console.log('Portfolio loaded successfully', {
        holdings: creditPortfolio.value.length,
        totalOwned: creditStats.value.total_owned,
      })
    }
  } catch (err) {
    console.error('Error loading portfolio:', err)
    error.value = 'Failed to load portfolio. Please try again.'
  } finally {
    loading.value = false
  }
}

async function refreshPortfolio() {
  await loadPortfolio()
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Lifecycle
onMounted(() => {
  loadPortfolio()
})
</script>

<style scoped>
.credit-portfolio-page {
  min-height: 100vh;
  background: var(--bg-secondary, #f8fdf8);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

/* Page Header */
.page-header {
  padding: 1.25rem 0;
  background: var(--primary-color, #058526);
  border-bottom: none;
  border-radius: 0 0 24px 24px;
  box-shadow: 0 24px 48px rgba(4, 119, 59, 0.2);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.header-actions {
  display: flex;
  gap: 0.6rem;
  flex-shrink: 0;
}

.btn-export {
  background: #ffffff;
  color: #045c1a;
  border: 2px solid #ffffff;
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.875rem;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  transition: transform 0.15s, box-shadow 0.15s, background 0.15s;
}

.btn-export:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.2);
}

.btn-export.outline {
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff;
}

.btn-export.outline:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.22);
}

.btn-export:disabled {
  opacity: 0.6;
  cursor: progress;
}

.export-message {
  color: #ecfdf5;
  font-size: 0.875rem;
  margin: 0.75rem 0 0;
}

.export-message.error {
  color: #fee2e2;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #ffffff;
  margin: 0 0 0.5rem 0;
}

.page-description {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.85);
  margin: 0;
}

/* Main Content */
.portfolio-content {
  padding: 2rem 0;
}

.portfolio-grid {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

/* Stats Section */
.stats-section {
  background: #ffffff;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 10px 30px rgba(15, 118, 110, 0.1);
  border: 1px solid rgba(15, 118, 110, 0.1);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.5rem;
  background: var(--bg-secondary, #f8fdf8);
  border-radius: 0.75rem;
  border: 1px solid var(--border-color, #e2e8f0);
}

.stat-icon {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.11);
  border-radius: 0.75rem;
  color: #0f172a;
}

.stat-icon svg {
  width: 1.75rem;
  height: 1.75rem;
}

.stat-content h3 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary, #1a202c);
  margin: 0 0 0.25rem 0;
}

.stat-content p {
  font-size: 0.875rem;
  color: var(--text-muted, #64748b);
  margin: 0;
}

.stat-content .pnl {
  margin-top: 0.2rem;
  font-size: 0.78rem;
  font-weight: 600;
}
.stat-content .pnl.up {
  color: #059669;
}
.stat-content .pnl.down {
  color: #dc2626;
}

/* Holdings Section */
.holdings-section {
  background: #ffffff;
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 10px 30px rgba(15, 118, 110, 0.1);
  border: 1px solid rgba(15, 118, 110, 0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.section-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  margin: 0;
}

.section-actions {
  display: flex;
  gap: 1rem;
}

/* Credits Grid */
.credits-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(350px, 100%), 1fr));
  gap: 1.5rem;
}

/* Compact vertically-scrollable area so the holdings stay short and fit the
   screen; the cards inside keep the normal grid layout. */
.credits-scroll-y {
  max-height: 60vh;
  overflow-y: auto;
  padding: 0.25rem;
  margin: -0.25rem;
  -webkit-overflow-scrolling: touch;
}

.credit-card {
  border: 1px solid rgba(15, 118, 110, 0.1);
  border-radius: 0.75rem;
  padding: 1.5rem;
  background: #ffffff;
  transition: all 0.2s ease;
}

.credit-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 18px 30px rgba(15, 118, 110, 0.12);
  border-color: rgba(5, 133, 38, 0.3);
}

.credit-card.retired {
  opacity: 0.75;
  background: rgba(5, 133, 38, 0.12);
}

.insights-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
  gap: 1.5rem;
}

.insight-card {
  background: #ffffff;
  border-radius: 1rem;
  padding: 2rem;
  border: 1px solid rgba(15, 118, 110, 0.1);
  box-shadow: 0 10px 30px rgba(15, 118, 110, 0.1);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.insight-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.insight-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.95rem;
  color: var(--text-primary, #1a202c);
}

.insight-label {
  font-weight: 600;
  color: #0f172a;
}

.insight-value {
  font-weight: 500;
  color: #0f172a;
  opacity: 0.85;
}

.insight-empty {
  padding: 1rem;
  text-align: center;
  color: var(--text-muted, #64748b);
  background: var(--bg-secondary, #f8fdf8);
  border-radius: 0.75rem;
}

.retirement-progress {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.progress-number {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary, #1a202c);
}

.progress-bar {
  width: 100%;
  height: 12px;
  border-radius: 999px;
  background: rgba(5, 133, 38, 0.15);
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #bbf7d0 0%, #22c55e 100%);
  border-radius: 999px;
  transition: width 0.4s ease;
}

.progress-description {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary, #4a5568);
}

.credit-header {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.credit-image {
  width: 60px;
  height: 60px;
  background: linear-gradient(135deg, var(--primary-color, #058526), var(--primary-hover, #04701f));
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-placeholder {
  color: white;
  font-size: 1.5rem;
  font-weight: bold;
}

/* Title, location and category are a stack, so lay them out as one.
   Previously each was its own display type — an <h3> block, an inline-flex <p>
   still carrying the UA's 1em top/bottom margin, and an inline <span> — so the
   three sat on inconsistent baselines with a full line of dead space between
   the name and the location. That is the "name, location and under of it is not
   aligned" report. `min-width: 0` lets a long title wrap instead of pushing the
   row wider than the card. */
.credit-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
}

.credit-info > p {
  margin: 0;
}

.credit-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  margin: 0 0 0.25rem 0;
  overflow-wrap: anywhere;
}

/* See-more footer for the holdings grid */
.holdings-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 1.5rem;
}
.holdings-count {
  font-size: 0.85rem;
  color: var(--text-muted, #64748b);
}
.holdings-footer-actions {
  display: flex;
  gap: 0.5rem;
}
.see-more-btn {
  padding: 0.5rem 1.1rem;
  background: var(--primary-color, #058526);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
}
.see-more-btn:hover {
  background: var(--primary-hover, #04701f);
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

.credit-location {
  display: inline-flex;
  align-items: flex-start;
  gap: 0.35rem;
  color: #6b7280;
  font-size: 0.9rem;
  line-height: 1.35;
  /* The pin must stay on the first line of a wrapping place name. */
  text-align: left;
}

.credit-location .material-symbols-outlined {
  font-size: 1.05rem;
}

.credit-category {
  background: var(--primary-light, rgba(5, 133, 38, 0.1));
  color: var(--primary-color, #058526);
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.credit-details {
  margin-bottom: 1rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.detail-label {
  font-size: 0.875rem;
  color: var(--text-muted, #64748b);
}

.detail-value {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary, #1a202c);
}

.detail-value.retired {
  color: var(--text-muted, #64748b);
}

.credit-actions {
  display: flex;
  gap: 0.5rem;
}

@media (max-width: 768px) {
  /* Wider, not taller. Two auto-width buttons in a narrow card wrapped onto
     separate rows and each still only occupied part of its line, so the pair
     cost two tall rows and looked ragged. A 1fr/1fr grid gives them the full
     card width and lets the vertical padding come down. */
  .credit-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .credit-actions .btn {
    width: 100%;
    padding: 0.4rem 0.5rem;
    font-size: 0.8rem;
    white-space: nowrap;
  }

  /* Only "Manage in Wallet" is rendered for a retired holding — let it span
     rather than sit as a lonely half-width button. */
  .credit-actions .btn:only-child {
    grid-column: 1 / -1;
  }

  .credit-card {
    padding: 1rem;
  }

  .credit-image {
    width: 44px;
    height: 44px;
  }

  .image-placeholder {
    font-size: 1.15rem;
  }

  .credit-title {
    font-size: 1rem;
  }
}

/* Transactions Section */
.transactions-section {
  background: var(--bg-primary, #ffffff);
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.wallet-activity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
  gap: 1.5rem;
}

.activity-card {
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 0.75rem;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.activity-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.activity-card-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
}

.transactions-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.purchase-history-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  list-style: none;
  padding: 0;
  margin: 0;
}

.transaction-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary, #f8fdf8);
  border-radius: 0.5rem;
  border: 1px solid var(--border-color, #e2e8f0);
}

.transaction-icon {
  font-size: 1.5rem;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary, #ffffff);
  border-radius: 50%;
}

.transaction-details {
  flex: 1;
}

.transaction-title {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary, #1a202c);
  margin: 0 0 0.25rem 0;
}

.transaction-date {
  font-size: 0.875rem;
  color: var(--text-muted, #64748b);
  margin: 0;
}

.transaction-amount {
  font-size: 1rem;
  font-weight: 600;
}

.transaction-amount.deposit {
  color: var(--success-color, #058526);
}

.transaction-amount.withdrawal {
  color: var(--error-color, #ef4444);
}

.purchase-history-item {
  padding: 1rem;
  background: var(--bg-secondary, #f8fdf8);
  border-radius: 0.75rem;
  border: 1px solid var(--border-color, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.purchase-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.purchase-project {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge-purchase {
  background: var(--primary-light, rgba(5, 133, 38, 0.1));
  color: var(--primary-color, #058526);
}

.purchase-title {
  font-weight: 600;
  color: var(--text-primary, #1a202c);
}

.purchase-date {
  font-size: 0.85rem;
  color: var(--text-muted, #64748b);
}

.purchase-details {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.purchase-credits {
  font-size: 0.9rem;
  color: var(--text-secondary, #4a5568);
}

.purchase-amount {
  font-weight: 600;
  color: var(--text-primary, #1a202c);
}

.purchase-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.purchase-payment {
  font-size: 0.8rem;
  text-transform: uppercase;
  color: var(--text-muted, #64748b);
  letter-spacing: 0.05em;
}

.empty-history {
  text-align: center;
  padding: 1rem;
  color: var(--text-muted, #64748b);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

/* Loading and Error States */
.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 3rem 1rem;
}

.loading-spinner {
  width: 2rem;
  height: 2rem;
  border: 3px solid var(--border-color, #e2e8f0);
  border-top: 3px solid var(--primary-color, #058526);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem auto;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.error-icon,
.empty-icon {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.12);
  color: #0f172a;
  margin-bottom: 1rem;
}

.empty-icon svg {
  width: 1.75rem;
  height: 1.75rem;
}

.btn-icon {
  display: inline-flex;
  margin-right: 0.5rem;
}

.btn-icon svg {
  width: 1.25rem;
  height: 1.25rem;
}

.error-icon {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(220, 38, 38, 0.25);
  color: #dc2626;
  margin: 0 auto 1rem;
}

.error-icon svg {
  width: 1.75rem;
  height: 1.75rem;
}

.error-state h3,
.empty-state h3 {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  margin: 0 0 0.5rem 0;
}

.error-state p,
.empty-state p {
  color: var(--text-muted, #64748b);
  margin: 0 0 1rem 0;
}

.empty-transactions {
  text-align: center;
  padding: 2rem;
  color: var(--text-muted, #64748b);
}

/* Responsive Design */
@media (max-width: 768px) {
  .container {
    padding: 0 1rem;
  }



  .header-content {
    flex-direction: column;
    align-items: flex-start;
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .credits-grid {
    grid-template-columns: 1fr;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .insights-section {
    grid-template-columns: 1fr;
  }
}
</style>
