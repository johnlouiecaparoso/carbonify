<script setup>
/**
 * Buyer / general-user dashboard — the signed-in landing page for anyone whose
 * job on Carbonify is to *buy* credits (general_user, buyer_investor, lgu_user).
 *
 * Before this existed those roles landed on the public marketing homepage, so a
 * paying customer saw the same brochure as an anonymous visitor. Every widget
 * here is backed by a service that already existed — this view assembles them
 * into one place rather than introducing new data paths.
 */
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import FirstRunGuide from '@/components/onboarding/FirstRunGuide.vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { useCartStore } from '@/store/cartStore'
import { creditOwnershipService } from '@/services/creditOwnershipService'
import { peso, num } from '@/utils/format'
import { computePortfolioPnl } from '@/services/portfolioAnalytics'
import { generateCarbonImpactReport } from '@/services/receiptService'
import { getMarketStats } from '@/services/registryService'
import { getMyWatchlist, checkWatchlistPriceAlerts } from '@/services/watchlistService'
import { getMarketplaceListings } from '@/services/marketplaceService'
import { getUserNotifications, markNotificationAsRead } from '@/services/notificationService'
import { getMyOrders, attachListingTitles, isUnfinished } from '@/services/orderService'
import { useTradeEligibility } from '@/composables/useTradeEligibility'
import { formatDate } from '@/utils/formatDate'

const router = useRouter()
const userStore = useUserStore()
const cart = useCartStore()

const loading = ref(true)
const loadError = ref('')

const holdings = ref([])
const creditStats = ref({ total_owned: 0, total_retired: 0, total_credits: 0, projects_count: 0 })
const marketPrice = ref(0)
const impact = ref(null)
const watchlist = ref([])
const listings = ref([])
const notifications = ref([])
const unfinishedOrders = ref([])

// Shared with the marketplace and cart so all three agree on "can this user buy?".
const { needsKyc, currentLevelLabel, requiredLevelLabel, minLevel, ensureLoaded: ensureKycLoaded } =
  useTradeEligibility()

const userId = computed(() => userStore.session?.user?.id || null)
const firstName = computed(() => {
  const full = userStore.profile?.full_name || ''
  return full.trim().split(/\s+/)[0] || 'there'
})

/**
 * Is this account brand new?
 *
 * Deliberately measured from ACTIVITY rather than from a timestamp alone. An
 * account created three weeks ago that still has no holdings, no orders and no
 * watchlist has not started — and telling that person "welcome back" over an
 * empty dashboard is exactly the confusing state this is meant to fix. A
 * recent `created_at` is a supporting signal, not the whole test.
 *
 * Waits for `loading` to finish: mid-load every list is legitimately empty, so
 * deciding early would greet a returning user as new for a second and then
 * swap the heading under them.
 */
const hasActivity = computed(
  () =>
    holdings.value.length > 0 ||
    unfinishedOrders.value.length > 0 ||
    watchlist.value.length > 0 ||
    (creditStats.value?.total_credits || 0) > 0 ||
    (creditStats.value?.total_retired || 0) > 0,
)

const isNewAccount = computed(() => !loading.value && !hasActivity.value)

// ── Money / number formatting (₱ everywhere; this platform is PHP-denominated) ──

// ── Derived position ──
const pnl = computed(() => computePortfolioPnl(holdings.value, marketPrice.value))

const totalSpent = computed(() => impact.value?.summary?.totalAmountSpent || 0)
const co2Offset = computed(() => impact.value?.environmentalImpact?.co2OffsetTonnes || 0)
const treesEquivalent = computed(() => impact.value?.environmentalImpact?.equivalentTreesPlanted || 0)
const carsEquivalent = computed(() => impact.value?.environmentalImpact?.equivalentCarsOffRoad || 0)
const recentPurchases = computed(() => (impact.value?.recentPurchases || []).slice(0, 5))

const hasHoldings = computed(() => holdings.value.length > 0)

/** Retirement progress across everything the buyer has ever held. */
const retirementPercent = computed(() => {
  const owned = creditStats.value.total_owned || 0
  const retired = creditStats.value.total_retired || 0
  const denominator = owned + retired
  if (denominator <= 0) return 0
  return Math.min(100, Math.round((retired / denominator) * 100))
})

const unreadNotifications = computed(() => notifications.value.filter((n) => !n.is_read))

/**
 * Open a notification: mark it read, then follow its link.
 *
 * This panel used to render notifications as inert text next to an unread
 * count, so the dashboard could tell a buyer they had unread items and give
 * them no way to read one or clear the badge — only the header bell could do
 * that. Marked read optimistically so the badge responds immediately; a failed
 * write is rolled back rather than left lying about the state.
 */
async function openNotification(note) {
  const id = userId.value
  if (!note || !id) return

  const wasUnread = !note.is_read
  if (wasUnread) {
    notifications.value = notifications.value.map((n) =>
      n.id === note.id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n,
    )
    try {
      await markNotificationAsRead(note.id, id)
    } catch (err) {
      console.warn('Could not mark notification read:', err?.message)
      notifications.value = notifications.value.map((n) =>
        n.id === note.id ? { ...n, is_read: false, read_at: null } : n,
      )
    }
  }

  // router.push, not a location assign: this is the same SPA, and a full
  // reload here would throw away the dashboard we just spent six queries on.
  if (note.link) router.push(note.link)
}

/**
 * Watchlist rows only store listing ids, so join them against the (cached)
 * marketplace listings to get something worth showing. Rows whose listing has
 * since been delisted still render — flagged as unavailable rather than hidden,
 * so the buyer understands why it disappeared from the marketplace.
 */
const watchedListings = computed(() => {
  const byId = new Map(listings.value.map((l) => [l.listing_id, l]))
  return watchlist.value.slice(0, 4).map((row) => {
    const listing = byId.get(row.listing_id) || null
    return {
      id: row.listing_id,
      projectId: row.project_id,
      title: listing?.project_title || 'Saved listing',
      price: listing?.price_per_credit ?? null,
      available: Boolean(listing),
    }
  })
})

// ── Load ──
async function load() {
  if (!userId.value) {
    loading.value = false
    return
  }

  loading.value = true
  loadError.value = ''

  // allSettled, not all: a single failing widget (e.g. a missing notifications
  // table on an older env) must not blank the whole dashboard.
  const [
    holdingsRes,
    statsRes,
    marketRes,
    impactRes,
    watchRes,
    listingsRes,
    notifRes,
    ordersRes,
  ] = await Promise.allSettled([
    creditOwnershipService.getUserCreditPortfolio(userId.value),
    creditOwnershipService.getUserCreditStats(userId.value),
    getMarketStats(),
    generateCarbonImpactReport(userId.value),
    getMyWatchlist(),
    getMarketplaceListings(),
    getUserNotifications(userId.value, 5),
    getMyOrders(20),
  ])

  // KYC state is shared/cached across views, so it loads through the composable.
  await ensureKycLoaded()

  if (holdingsRes.status === 'fulfilled') holdings.value = holdingsRes.value || []
  if (statsRes.status === 'fulfilled') creditStats.value = statsRes.value
  if (marketRes.status === 'fulfilled') marketPrice.value = marketRes.value?.avg_price || 0
  if (impactRes.status === 'fulfilled') impact.value = impactRes.value
  if (watchRes.status === 'fulfilled') watchlist.value = watchRes.value || []
  if (listingsRes.status === 'fulfilled') listings.value = listingsRes.value || []
  if (notifRes.status === 'fulfilled') notifications.value = notifRes.value || []
  if (ordersRes.status === 'fulfilled') {
    unfinishedOrders.value = attachListingTitles(
      (ordersRes.value || []).filter(isUnfinished),
      listings.value,
    )
  }

  // The dashboard is now the buyer's landing page, so checking here means price
  // drops reach them on their next visit even if they never open the marketplace.
  if (listings.value.length) {
    checkWatchlistPriceAlerts(listings.value)
      .then((count) => {
        // Refresh the bell feed so a just-raised alert shows without a reload.
        if (count > 0) {
          getUserNotifications(userId.value, 5)
            .then((rows) => {
              notifications.value = rows || []
            })
            .catch(() => {})
        }
      })
      .catch((err) => console.warn('Price-drop alert check failed:', err?.message))
  }

  // Only the portfolio is load-bearing enough to show a page-level error for.
  if (holdingsRes.status === 'rejected' && statsRes.status === 'rejected') {
    loadError.value = 'We could not load your portfolio. Please try again.'
  }

  loading.value = false
}

onMounted(load)
</script>

<template>
  <div class="buyer-dashboard">
    <PageHeader
      :title="isNewAccount ? `Welcome to Carbonify, ${firstName}` : `Welcome back, ${firstName}`"
      :description="
        isNewAccount
          ? 'Your account is ready — here is how to get started.'
          : 'Your carbon portfolio, purchases and impact at a glance.'
      "
    >
      <template #actions>
        <button class="header-cta" @click="router.push('/marketplace')">
          <span class="material-symbols-outlined" aria-hidden="true">storefront</span>
          Browse marketplace
        </button>
      </template>
    </PageHeader>

    <div class="container">

      <!-- A permanent one-line pointer to the guide. Deliberately shown to
           EVERYONE, not just new accounts: the first-run panel below is
           dismissed once and never returns, and "how does this work again?"
           is a question people ask in week three, not week one. -->
      <router-link to="/guide" class="guide-notice">
        <span class="material-symbols-outlined" aria-hidden="true">menu_book</span>
        <span class="guide-notice-text">
          <strong>New to Carbonify?</strong> Read the user guide — how credits work, what your
          role can do, and what the other roles are for.
        </span>
        <span class="material-symbols-outlined guide-notice-arrow" aria-hidden="true"
          >arrow_forward</span
        >
      </router-link>

      <!-- First-run guide. Sits ABOVE the KYC banner deliberately: to someone
           who has never used the platform, "verify your identity" out of
           context reads as an obstacle rather than as step one of something. -->
      <FirstRunGuide
        v-if="isNewAccount"
        :name="firstName"
        :role="userStore.role || 'general_user'"
        :user-id="userId || ''"
      />

      <!-- KYC gate: shown BEFORE the buyer invests effort in a purchase, not
           after they've picked a quantity and payment method. -->
      <section v-if="!loading && needsKyc" class="banner banner-warning">
        <span class="material-symbols-outlined banner-icon" aria-hidden="true">verified_user</span>
        <div class="banner-body">
          <strong class="banner-title">Verify your identity to start buying</strong>
          <p class="banner-text">
            Your account is <em>{{ currentLevelLabel }}</em
            >. Carbon credit purchases require level {{ minLevel }} ({{ requiredLevelLabel }}) or
            higher. Verification usually takes one business day.
          </p>
        </div>
        <router-link to="/kyc" class="btn btn-warning">Verify identity</router-link>
      </section>

      <!-- Checkouts that were started but never completed. Nothing was charged,
           but the buyer had no way to see these existed at all before. -->
      <section v-if="!loading && unfinishedOrders.length > 0" class="banner banner-pending">
        <span class="material-symbols-outlined banner-icon" aria-hidden="true">pending_actions</span>
        <div class="banner-body">
          <strong class="banner-title">
            {{ unfinishedOrders.length }} unfinished checkout{{
              unfinishedOrders.length === 1 ? '' : 's'
            }}
          </strong>
          <p class="banner-text">
            {{ unfinishedOrders[0].projectTitle }}
            <template v-if="unfinishedOrders.length > 1">
              and {{ unfinishedOrders.length - 1 }} other{{
                unfinishedOrders.length > 2 ? 's' : ''
              }}
            </template>
            — nothing has been charged.
          </p>
        </div>
        <router-link to="/orders" class="btn btn-pending">Review orders</router-link>
      </section>

      <!-- Cart resume: a cart with nothing reminding you about it is a lost sale -->
      <section v-if="cart.count > 0" class="banner banner-info">
        <span class="material-symbols-outlined banner-icon" aria-hidden="true">shopping_cart</span>
        <div class="banner-body">
          <strong class="banner-title">You have {{ num(cart.count) }} credits waiting in your cart</strong>
          <p class="banner-text">Subtotal {{ peso(cart.subtotal) }} across {{ cart.distinctCount }} listing(s).</p>
        </div>
        <router-link to="/cart" class="btn btn-info">Finish checkout</router-link>
      </section>

      <!-- Loading: skeletons in the real layout rather than one centred spinner.
           The stat row and panel grid keep their final geometry, so nothing
           jumps when the data lands, and the page reads as "filling in" instead
           of "blank". aria-busy + the visually-hidden status line carry the same
           message to screen readers, which cannot see a shimmer. -->
      <div v-if="loading" class="skeleton-wrap" aria-busy="true">
        <p class="sr-only" role="status">Loading your dashboard…</p>

        <section class="stats-grid" aria-hidden="true">
          <article v-for="n in 4" :key="`s${n}`" class="stat-card skeleton-stat">
            <span class="skeleton skeleton-icon"></span>
            <div class="skeleton-stat-body">
              <span class="skeleton skeleton-line skeleton-line--value"></span>
              <span class="skeleton skeleton-line skeleton-line--label"></span>
            </div>
          </article>
        </section>

        <div class="dash-grid" aria-hidden="true">
          <section v-for="n in 4" :key="`p${n}`" class="panel">
            <div class="panel-head">
              <span class="skeleton skeleton-line skeleton-line--title"></span>
              <span class="skeleton skeleton-line skeleton-line--link"></span>
            </div>
            <div class="skeleton-rows">
              <span v-for="r in 3" :key="r" class="skeleton skeleton-row"></span>
            </div>
          </section>
        </div>
      </div>

      <div v-else-if="loadError" class="state-card error">
        <p>{{ loadError }}</p>
        <button class="btn btn-primary" @click="load">Try again</button>
      </div>

      <template v-else>
        <!-- Position -->
        <section class="stats-grid">
          <article class="stat-card">
            <span class="stat-icon material-symbols-outlined" aria-hidden="true">eco</span>
            <div>
              <h2 class="stat-value">{{ num(pnl.ownedCredits) }}</h2>
              <p class="stat-label">Credits held</p>
            </div>
          </article>

          <article class="stat-card">
            <span class="stat-icon material-symbols-outlined" aria-hidden="true">workspace_premium</span>
            <div>
              <h2 class="stat-value">{{ num(creditStats.total_retired) }}</h2>
              <p class="stat-label">Credits retired</p>
            </div>
          </article>

          <article class="stat-card">
            <span class="stat-icon material-symbols-outlined" aria-hidden="true">account_balance</span>
            <div>
              <h2 class="stat-value">{{ peso(pnl.marketValue) }}</h2>
              <p class="stat-label">Portfolio value</p>
              <p
                v-if="marketPrice > 0 && pnl.pricedCredits > 0"
                class="stat-delta"
                :class="pnl.unrealizedPnl >= 0 ? 'up' : 'down'"
              >
                {{ pnl.unrealizedPnl >= 0 ? '▲' : '▼' }} {{ peso(Math.abs(pnl.unrealizedPnl)) }}
                ({{ pnl.unrealizedPnlPct >= 0 ? '+' : '' }}{{ pnl.unrealizedPnlPct }}%)
              </p>
            </div>
          </article>

          <article class="stat-card">
            <span class="stat-icon material-symbols-outlined" aria-hidden="true">payments</span>
            <div>
              <h2 class="stat-value">{{ peso(totalSpent) }}</h2>
              <p class="stat-label">Total spent</p>
              <p class="stat-sub">{{ impact?.summary?.totalTransactions || 0 }} purchase(s)</p>
            </div>
          </article>
        </section>

        <!-- First-run: no holdings yet. Say what to do next instead of showing
             four zeroes and nothing else. -->
        <section v-if="!hasHoldings" class="empty-hero">
          <span class="material-symbols-outlined empty-icon" aria-hidden="true">forest</span>
          <h2>You haven't bought any credits yet</h2>
          <p>
            Browse verified Philippine projects, or work out how much you need to offset first.
          </p>
          <div class="empty-actions">
            <button class="btn btn-primary" @click="router.push('/marketplace')">
              Browse marketplace
            </button>
            <button class="btn btn-outline" @click="router.push('/carbon-calculator')">
              Calculate my footprint
            </button>
          </div>
        </section>

        <div class="dash-grid">
          <!-- Recent purchases -->
          <section class="panel">
            <div class="panel-head">
              <h2 class="panel-title">Recent purchases</h2>
              <router-link to="/receipts" class="panel-link">All receipts →</router-link>
            </div>

            <p v-if="recentPurchases.length === 0" class="panel-empty">
              Your completed purchases will appear here.
            </p>

            <ul v-else class="activity-list">
              <li v-for="(purchase, i) in recentPurchases" :key="i" class="activity-item">
                <span class="activity-icon material-symbols-outlined" aria-hidden="true">shopping_bag</span>
                <div class="activity-body">
                  <p class="activity-title">{{ purchase.project }}</p>
                  <p class="activity-meta">
                    {{ num(purchase.credits) }} credits · {{ formatDate(purchase.date, { month: 'short' }) }}
                  </p>
                </div>
                <span class="activity-amount">{{ peso(purchase.amount) }}</span>
              </li>
            </ul>
          </section>

          <!-- Impact -->
          <section class="panel">
            <div class="panel-head">
              <h2 class="panel-title">Your impact</h2>
              <router-link to="/credit-portfolio" class="panel-link">ESG report →</router-link>
            </div>

            <div class="impact-hero">
              <span class="impact-value">{{ num(co2Offset) }}</span>
              <span class="impact-unit">tCO₂e offset</span>
            </div>

            <ul class="impact-list">
              <li>
                <span class="material-symbols-outlined" aria-hidden="true">park</span>
                <span>≈ {{ num(treesEquivalent) }} trees planted</span>
              </li>
              <li>
                <span class="material-symbols-outlined" aria-hidden="true">directions_car</span>
                <span>≈ {{ num(carsEquivalent) }} cars off the road for a year</span>
              </li>
            </ul>

            <div class="progress-block">
              <div class="progress-head">
                <span>Retired</span>
                <span>{{ retirementPercent }}%</span>
              </div>
              <div class="progress-bar">
                <div class="progress-fill" :style="{ width: `${retirementPercent}%` }"></div>
              </div>
              <p class="progress-note">
                Retiring credits is what lets you claim the offset in ESG reporting.
              </p>
            </div>
          </section>

          <!-- Saved -->
          <section class="panel">
            <div class="panel-head">
              <h2 class="panel-title">Saved</h2>
              <router-link to="/watchlist" class="panel-link">View all →</router-link>
            </div>

            <p v-if="watchlist.length === 0" class="panel-empty">
              Save listings from the marketplace to track them here.
            </p>

            <ul v-else class="simple-list">
              <li v-for="item in watchedListings" :key="item.id" class="simple-item">
                <span class="material-symbols-outlined" aria-hidden="true">bookmark</span>
                <span class="simple-text">{{ item.title }}</span>
                <span v-if="item.available" class="watch-price">{{ peso(item.price) }}</span>
                <span v-else class="watch-gone">Delisted</span>
              </li>
            </ul>
          </section>

          <!-- Notifications -->
          <section class="panel">
            <div class="panel-head">
              <h2 class="panel-title">Notifications</h2>
              <span v-if="unreadNotifications.length" class="unread-pill">
                {{ unreadNotifications.length }} new
              </span>
            </div>

            <p v-if="notifications.length === 0" class="panel-empty">You're all caught up.</p>

            <ul v-else class="simple-list">
              <li v-for="note in notifications" :key="note.id">
                <button
                  type="button"
                  class="simple-item note-button"
                  :class="{ unread: !note.is_read }"
                  @click="openNotification(note)"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">notifications</span>
                  <div class="simple-text">
                    <p class="note-title">
                      {{ note.title }}
                      <span v-if="!note.is_read" class="sr-only">(unread)</span>
                    </p>
                    <p class="note-time">{{ formatDate(note.created_at, { month: 'short' }) }}</p>
                  </div>
                </button>
              </li>
            </ul>
          </section>
        </div>

      </template>
    </div>
  </div>
</template>

<style scoped>
.buyer-dashboard {
  padding: 0 0 4rem;
  background: #f8fafc;
  min-height: 100%;
}

.buyer-dashboard .container {
  padding-top: 2rem;
}

/* White CTA reads on the green header (a green .btn-primary would blend in). */
.header-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: #fff;
  color: var(--primary-color, #058526);
  border: none;
  border-radius: 8px;
  padding: 0.55rem 1.1rem;
  font-weight: 600;
  cursor: pointer;
}

.header-cta:hover {
  background: rgba(255, 255, 255, 0.9);
}
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  border-radius: 8px;
  border: 1px solid transparent;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
}
.btn-primary {
  background: #058526;
  color: #fff;
}
.btn-primary:hover {
  background: #058126;
}
.btn-outline {
  background: #fff;
  border-color: #d1d5db;
  color: #374151;
}
.btn-outline:hover {
  border-color: #9ca3af;
}
.btn-warning {
  background: #b45309;
  color: #fff;
}
.btn-warning:hover {
  background: #92400e;
}
.btn-info {
  background: #1d4ed8;
  color: #fff;
}
.btn-info:hover {
  background: #1e40af;
}

/* One-line pointer to the user guide (permanent, every role) */
.guide-notice {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 1rem;
  border: 1px solid #d7e8da;
  border-radius: 10px;
  background: #f4fbf5;
  margin-bottom: 1rem;
  text-decoration: none;
  color: #374151;
  font-size: 0.86rem;
  line-height: 1.45;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.guide-notice:hover {
  border-color: var(--primary-color, #058526);
  background: #ecf8ee;
}
.guide-notice > .material-symbols-outlined {
  font-size: 20px;
  color: var(--primary-color, #058526);
  flex: 0 0 auto;
}
.guide-notice-text {
  flex: 1 1 auto;
  min-width: 0;
}
.guide-notice-text strong {
  color: var(--primary-dark, #045c1a);
}
.guide-notice-arrow {
  color: var(--primary-color, #058526);
}
@media (max-width: 640px) {
  .guide-notice-arrow {
    display: none;
  }
}

/* Banners */
.banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.25rem;
  border-radius: 12px;
  border: 1px solid;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}
.banner-warning {
  background: #fffbeb;
  border-color: #fcd34d;
  color: #78350f;
}
.banner-info {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1e3a8a;
}
.banner-pending {
  background: #f5f3ff;
  border-color: #ddd6fe;
  color: #4c1d95;
}
.btn-pending {
  background: #6d28d9;
  color: #fff;
}
.btn-pending:hover {
  background: #5b21b6;
}
.banner-icon {
  font-size: 1.75rem;
  flex-shrink: 0;
}
.banner-body {
  flex: 1;
  min-width: 240px;
}
.banner-title {
  display: block;
  font-size: 0.975rem;
}
.banner-text {
  margin: 0.2rem 0 0;
  font-size: 0.875rem;
  opacity: 0.9;
}

/* States */
.state-card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 3rem 1.5rem;
  text-align: center;
  color: #64748b;
}
.state-card.error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}
/* Skeletons — same geometry as the real cards, so the layout never shifts. */
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
.skeleton {
  display: block;
  background: #e2e8f0;
  border-radius: 6px;
  position: relative;
  overflow: hidden;
}
.skeleton::after {
  content: '';
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.65), transparent);
  animation: shimmer 1.4s ease-in-out infinite;
}
@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}
/* A shimmer that never stops is a vestibular trigger; hold it still instead. */
@media (prefers-reduced-motion: reduce) {
  .skeleton::after {
    animation: none;
  }
}
.skeleton-stat {
  align-items: center;
}
.skeleton-icon {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.skeleton-stat-body {
  flex: 1;
}
.skeleton-line {
  height: 0.75rem;
}
.skeleton-line--value {
  width: 55%;
  height: 1.35rem;
  margin-bottom: 0.5rem;
}
.skeleton-line--label {
  width: 75%;
}
.skeleton-line--title {
  width: 8rem;
  height: 1rem;
}
.skeleton-line--link {
  width: 4.5rem;
}
.skeleton-rows {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.skeleton-row {
  height: 2.6rem;
  border-radius: 8px;
}

/* Stat tiles */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.stat-card {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
}
.stat-icon {
  font-size: 1.75rem;
  color: #058526;
  flex-shrink: 0;
}
.stat-value {
  font-size: 1.5rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  line-height: 1.2;
}
.stat-label {
  margin: 0.2rem 0 0;
  color: #64748b;
  font-size: 0.85rem;
}
.stat-sub {
  margin: 0.15rem 0 0;
  color: #94a3b8;
  font-size: 0.78rem;
}
.stat-delta {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
}
.stat-delta.up {
  color: #059669;
}
.stat-delta.down {
  color: #dc2626;
}

/* First-run hero */
.empty-hero {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 2.5rem 1.5rem;
  text-align: center;
  margin-bottom: 1.5rem;
}
.empty-icon {
  font-size: 2.75rem;
  color: #058526;
}
.empty-hero h2 {
  margin: 0.75rem 0 0.4rem;
  font-size: 1.25rem;
  color: #0f172a;
}
.empty-hero p {
  margin: 0 0 1.25rem;
  color: #64748b;
}
.empty-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}

/* Panel grid */
.dash-grid {
  display: grid;
  /* `min(320px, 100%)`, not a bare 320px. `minmax(320px, 1fr)` cannot shrink
     below its minimum, so on a 320px phone — where page padding leaves ~288px —
     each track stayed 320px wide and pushed the dashboard sideways. Measured at
     right: 336px on a 320px viewport by responsive-authenticated.spec.js, which
     is the first test ever to look at an authenticated page. */
  grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.panel {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.panel-title {
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}
.panel-link {
  font-size: 0.825rem;
  font-weight: 600;
  color: #058526;
  text-decoration: none;
}
.panel-empty {
  color: #94a3b8;
  font-size: 0.875rem;
  margin: 0;
  padding: 1rem 0;
}
.unread-pill {
  background: #dcfce7;
  color: #166534;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
}

/* Activity list */
.activity-list,
.simple-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.activity-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem;
  border-radius: 8px;
  background: #f8fafc;
}
.activity-icon {
  color: #058526;
  font-size: 1.25rem;
}
.activity-body {
  flex: 1;
  min-width: 0;
}
.activity-title {
  margin: 0;
  font-weight: 600;
  font-size: 0.875rem;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.activity-meta {
  margin: 0.1rem 0 0;
  font-size: 0.775rem;
  color: #64748b;
}
.activity-amount {
  font-weight: 700;
  font-size: 0.875rem;
  color: #0f172a;
}

.simple-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 0.6rem;
  border-radius: 8px;
  font-size: 0.875rem;
  color: #374151;
}
.simple-item.unread {
  background: #f0fdf4;
}
/* Notifications are actionable, so they are buttons; strip the UA chrome and
   let .simple-item own the appearance. */
.note-button {
  width: 100%;
  border: 1px solid transparent;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.note-button:hover {
  background: #f1f5f9;
}
.note-button.unread:hover {
  background: #dcfce7;
}
.note-button:focus-visible {
  outline: 2px solid #058526;
  outline-offset: 2px;
}
.simple-item .material-symbols-outlined {
  font-size: 1.15rem;
  color: #94a3b8;
}
.simple-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.note-title {
  margin: 0;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.note-time {
  margin: 0.1rem 0 0;
  font-size: 0.75rem;
  color: #94a3b8;
}
.watch-price {
  font-weight: 700;
  font-size: 0.825rem;
  color: #0f172a;
  flex-shrink: 0;
}
.watch-gone {
  font-size: 0.75rem;
  color: #9ca3af;
  flex-shrink: 0;
}

/* Impact */
.impact-hero {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.9rem;
}
.impact-value {
  font-size: 2rem;
  font-weight: 800;
  color: #058526;
  line-height: 1;
}
.impact-unit {
  color: #64748b;
  font-size: 0.875rem;
}
.impact-list {
  list-style: none;
  margin: 0 0 1.25rem;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.impact-list li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: #475569;
}
.impact-list .material-symbols-outlined {
  font-size: 1.15rem;
  color: #94a3b8;
}

/* Progress */
.progress-head {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 0.35rem;
}
.progress-bar {
  height: 8px;
  background: #e2e8f0;
  border-radius: 999px;
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  background: #058526;
  border-radius: 999px;
  transition: width 0.3s ease;
}
.progress-note {
  margin: 0.5rem 0 0;
  font-size: 0.775rem;
  color: #94a3b8;
}

@media (max-width: 640px) {
  .stat-value {
    font-size: 1.35rem;
  }
}
</style>
