<template>
  <div class="upgrade-view">
    <PageHeader title="Upgrade your plan">
      <template #description>
        You're on the <strong>{{ currentPlanName }}</strong> plan.
        Unlock advanced analytics and unlimited listings.
      </template>
    </PageHeader>

    <div class="container">

      <div v-if="reasonText" class="reason-banner">
        <span class="material-symbols-outlined" aria-hidden="true">lock</span>
        {{ reasonText }}
      </div>

      <div v-if="confirmState === 'success'" class="return-banner success">
        <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
        {{ confirmMessage }}
      </div>
      <div v-else-if="confirmState === 'pending'" class="return-banner pending">
        <span class="material-symbols-outlined spin" aria-hidden="true">progress_activity</span>
        {{ confirmMessage }}
      </div>
      <div v-else-if="confirmState === 'cancelled'" class="return-banner cancelled">
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        {{ confirmMessage }}
      </div>

      <div class="plans-grid">
        <!-- Free (current baseline) -->
        <div class="plan-card" :class="{ current: currentPlan === PLANS.FREE }">
          <h2 class="plan-name">Free</h2>
          <div class="plan-price">₱0<span>/mo</span></div>
          <ul class="plan-perks">
            <li>Browse & buy carbon credits</li>
            <li>Up to {{ FREE_LISTING_LIMIT }} active listings</li>
            <li>Basic buying analytics</li>
          </ul>
          <button class="plan-cta ghost" disabled>
            {{ currentPlan === PLANS.FREE ? 'Current plan' : 'Included' }}
          </button>
        </div>

        <!-- Paid plans -->
        <div
          v-for="p in PLAN_CATALOG"
          :key="p.key"
          class="plan-card paid"
          :class="{ current: currentPlan === p.key }"
        >
          <h2 class="plan-name">{{ p.name }}</h2>
          <div class="plan-price">
            ₱{{ p.priceMonthly.toLocaleString() }}<span>/mo</span>
          </div>
          <p class="plan-tagline">{{ p.tagline }}</p>
          <ul class="plan-perks">
            <li v-for="perk in p.perks" :key="perk">{{ perk }}</li>
          </ul>
          <button
            class="plan-cta"
            :disabled="currentPlan === p.key || loadingKey === p.key"
            @click="subscribe(p.key)"
          >
            <span v-if="currentPlan === p.key">Current plan</span>
            <span v-else-if="loadingKey === p.key">Redirecting…</span>
            <span v-else>Choose {{ p.name }}</span>
          </button>
        </div>
      </div>

      <p v-if="error" class="upgrade-error">{{ error }}</p>
      <p class="upgrade-note">
        Plans are valid for {{ PLAN_PERIOD_DAYS }} days per payment. Cancel anytime by
        simply not renewing.
      </p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { PLANS, FREE_LISTING_LIMIT, FEATURES, getPlanDisplayName } from '@/constants/plans'
import {
  PLAN_CATALOG,
  PLAN_PERIOD_DAYS,
  startSubscriptionCheckout,
} from '@/services/subscriptionService'

const route = useRoute()
const router = useRouter()
const store = useUserStore()
const loadingKey = ref('')
const error = ref('')

// Post-checkout return state ('success' | 'pending' | 'cancelled' | '').
const confirmState = ref('')
const confirmMessage = ref('')

const currentPlan = computed(() => store.plan)
const currentPlanName = computed(() => getPlanDisplayName(store.plan))

const reasonText = computed(() => {
  const f = route.query.feature
  if (f === FEATURES.ADVANCED_ANALYTICS) return 'Advanced analytics is a Pro feature.'
  if (f === FEATURES.UNLIMITED_LISTINGS) return 'You’ve reached the Free listing limit.'
  return ''
})

/**
 * Handle the return from the PayMongo subscription checkout. The plan is granted
 * server-side by the webhook (activate_subscription), which can lag the browser
 * redirect by a few seconds, so we refresh the profile and poll briefly until
 * the plan flips. Without this the page silently re-renders "Free" on success.
 */
async function handleCheckoutReturn() {
  if (route.query.cancelled === 'true') {
    confirmState.value = 'cancelled'
    confirmMessage.value = 'Checkout was cancelled — your plan was not changed.'
    clearQuery()
    return
  }
  if (route.query.status !== 'success') return

  confirmState.value = 'pending'
  confirmMessage.value = 'Payment received — confirming your upgrade…'

  // Poll up to ~24s (12 × 2s) for the webhook to activate the plan.
  for (let i = 0; i < 12; i++) {
    await store.fetchUserProfile()
    if (store.isPremium) {
      confirmState.value = 'success'
      confirmMessage.value = `You're now on the ${getPlanDisplayName(store.plan)} plan. Enjoy!`
      clearQuery()
      return
    }
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  // Paid, but the webhook hasn't landed yet (or didn't fire). Don't claim failure.
  confirmState.value = 'pending'
  confirmMessage.value =
    'Payment received. Your upgrade is taking a little longer than usual to confirm — ' +
    'refresh this page in a minute. If it still shows Free, the payment webhook may not be firing.'
  clearQuery()
}

/** Drop the status/cancelled query params so a refresh doesn't re-trigger. */
function clearQuery() {
  const q = { ...route.query }
  delete q.status
  delete q.cancelled
  router.replace({ query: q })
}

onMounted(handleCheckoutReturn)

async function subscribe(planKey) {
  error.value = ''
  loadingKey.value = planKey
  try {
    const result = await startSubscriptionCheckout(planKey)
    if (result?.checkout_url) {
      window.location.href = result.checkout_url
    } else {
      error.value = 'Could not start checkout. Please try again.'
      loadingKey.value = ''
    }
  } catch (err) {
    error.value = err?.message || 'Subscription checkout is unavailable right now.'
    loadingKey.value = ''
  }
}
</script>

<style scoped>
.upgrade-view {
  min-height: 100vh;
  padding: 0 0 4rem;
  background: var(--bg-secondary, #f8fdf8);
}
.container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 1.5rem 1rem 0;
}

.reason-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #ecfdf5;
  color: #047857;
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  font-size: 0.875rem;
  margin-bottom: 1.5rem;
}
.return-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  font-size: 0.9rem;
  margin-bottom: 1.5rem;
}
.return-banner.success {
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
}
.return-banner.pending {
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #fde68a;
}
.return-banner.cancelled {
  background: #f3f4f6;
  color: #4b5563;
  border: 1px solid #e5e7eb;
}
.return-banner .spin {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.plans-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1.25rem;
}
.plan-card {
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  padding: 1.5rem;
  background: #fff;
  display: flex;
  flex-direction: column;
}
.plan-card.paid {
  border-color: #069e2d;
}
.plan-card.current {
  outline: 2px solid #069e2d;
}
.plan-name {
  font-size: 1.2rem;
  margin: 0;
}
.plan-price {
  font-size: 2rem;
  font-weight: 700;
  margin: 0.5rem 0;
}
.plan-price span {
  font-size: 0.9rem;
  font-weight: 400;
  color: #9ca3af;
}
.plan-tagline {
  color: #6b7280;
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
}
.plan-perks {
  list-style: none;
  padding: 0;
  margin: 0 0 1.25rem;
  flex: 1;
}
.plan-perks li {
  position: relative;
  padding-left: 1.25rem;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: #374151;
}
.plan-perks li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: #069e2d;
  font-weight: 700;
}
.plan-cta {
  padding: 0.7rem 1rem;
  border: none;
  border-radius: 8px;
  background: #069e2d;
  color: #fff;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
}
.plan-cta.ghost {
  background: #f3f4f6;
  color: #6b7280;
}
.plan-cta:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}
.upgrade-error {
  color: #dc2626;
  margin-top: 1rem;
}
.upgrade-note {
  color: #9ca3af;
  font-size: 0.8rem;
  margin-top: 1.5rem;
}
</style>
