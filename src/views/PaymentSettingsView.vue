<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/store/userStore'
// import { paymentService } from '@/services/paymentService'
// Mock payment service for development
const paymentService = {
  getUserTransactions: async (userId) => {
    console.log('Mock getUserTransactions called for user:', userId)
    return []
  },
}
import PageLayout from '@/components/layout/PageLayout.vue'
import UiButton from '@/components/ui/Button.vue'

const userStore = useUserStore()

// State
const loading = ref(false)
const error = ref('')
const paymentHistory = ref([])
const paymentStats = ref(null)

// Load payment data
async function loadPaymentData() {
  try {
    loading.value = true
    error.value = ''

    const [history, stats] = await Promise.all([
      paymentService.getUserTransactions(userStore.user?.id),
      Promise.resolve({ totalSpent: 0, totalTransactions: 0 }), // Mock stats for now
    ])

    paymentHistory.value = history
    paymentStats.value = stats
  } catch (err) {
    console.error('Error loading payment data:', err)
    error.value = 'Failed to load payment data'
  } finally {
    loading.value = false
  }
}

// Format currency
function formatCurrency(amount, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: currency,
  }).format(amount)
}

// Format date
function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Get status color
function getStatusColor(status) {
  const colors = {
    succeeded: 'var(--carbonify-success)',
    failed: 'var(--carbonify-error)',
    pending: 'var(--carbonify-warning)',
    processing: 'var(--carbonify-primary)',
    cancelled: 'var(--carbonify-muted)',
    refunded: 'var(--carbonify-muted)',
  }
  return colors[status] || 'var(--carbonify-muted)'
}

// Format payment method for display
function formatPaymentMethod(method) {
  if (!method) return 'UNKNOWN'
  
  const methodMap = {
    'card': 'CREDIT/DEBIT CARD',
    'credit_card': 'CREDIT CARD',
    'debit_card': 'DEBIT CARD',
    'gcash': 'GCASH',
    'maya': 'MAYA',
    'paymaya': 'MAYA',
    'wallet': 'WALLET',
    'grab_pay': 'GRAB PAY',
  }
  
  return methodMap[method.toLowerCase()] || method.toUpperCase()
}

onMounted(() => {
  loadPaymentData()
})
</script>

<template>
  <PageLayout>
    <div class="payment-settings">
      <div class="page-header">
        <div class="header-content">
          <button class="btn btn-ghost back-btn" @click="$router.push('/profile')">
            <span class="back-icon">←</span>
            Back to Profile
          </button>
          <div class="header-info">
            <h1 class="page-title">Payment Settings</h1>
            <p class="page-description">Manage your payment history and preferences</p>
          </div>
        </div>
      </div>

      <div class="payment-content">
        <!-- Loading State -->
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading payment data...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="error-state">
          <div class="error-icon">⚠️</div>
          <h3>Failed to Load Payment Data</h3>
          <p>{{ error }}</p>
          <UiButton @click="loadPaymentData">Retry</UiButton>
        </div>

        <!-- Payment Data -->
        <div v-else class="payment-data">
          <!-- Payment Statistics -->
          <div v-if="paymentStats" class="stats-section">
            <h2>Payment Overview</h2>
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-value">{{ paymentStats.totalPayments }}</div>
                <div class="stat-label">Total Payments</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">{{ formatCurrency(paymentStats.totalAmount) }}</div>
                <div class="stat-label">Total Spent</div>
              </div>
              <div class="stat-card">
                <div class="stat-value">{{ paymentStats.successRate }}%</div>
                <div class="stat-label">Success Rate</div>
              </div>
            </div>
          </div>

          <!-- Payment History -->
          <div class="history-section">
            <h2>Payment History</h2>

            <div v-if="paymentHistory.length === 0" class="empty-state">
              <div class="empty-icon">💳</div>
              <h3>No Payment History</h3>
              <p>You haven't made any payments yet. Start by purchasing carbon credits!</p>
              <UiButton variant="primary" @click="$router.push('/marketplace')">
                Browse Marketplace
              </UiButton>
            </div>

            <div v-else class="payment-list">
              <div v-for="payment in paymentHistory" :key="payment.id" class="payment-item">
                <div class="payment-info">
                  <div class="payment-amount">
                    {{ formatCurrency(payment.amount, payment.currency) }}
                  </div>
                  <div class="payment-details">
                    <div class="payment-method">
                      {{ payment.provider ? payment.provider.toUpperCase() : 'PAYMONGO' }} •
                      {{ formatPaymentMethod(payment.payment_method) }}
                    </div>
                    <div class="payment-date">
                      {{ formatDate(payment.created_at) }}
                    </div>
                  </div>
                </div>

                <div class="payment-status">
                  <span class="status-badge" :style="{ color: getStatusColor(payment.status) }">
                    {{ payment.status.toUpperCase() }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Payment Methods -->
          <div class="methods-section">
            <h2>Supported Payment Methods</h2>
            <div class="methods-grid">
              <div class="method-card">
                <div class="method-icon">🏦</div>
                <h3>PayMongo</h3>
                <p>GCash, GrabPay, PayMaya, Credit/Debit Cards</p>
                <div class="method-features">
                  <span class="feature">Instant</span>
                  <span class="feature">Secure</span>
                </div>
              </div>

              <div class="method-card">
                <div class="method-icon">💳</div>
                <h3>Stripe</h3>
                <p>Credit/Debit Cards, Bank Transfers</p>
                <div class="method-features">
                  <span class="feature">Global</span>
                  <span class="feature">Reliable</span>
                </div>
              </div>

              <div class="method-card">
                <div class="method-icon">🅿️</div>
                <h3>PayPal</h3>
                <p>PayPal Account, Credit/Debit Cards</p>
                <div class="method-features">
                  <span class="feature">Trusted</span>
                  <span class="feature">Easy</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </PageLayout>
</template>

<style scoped>
.payment-settings {
  min-height: 100vh;
  background: var(--carbonify-bg);
}

.page-header {
  background: var(--carbonify-surface);
  border-bottom: 1px solid var(--carbonify-border);
  padding: 1.25rem 0;
}

.header-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: none;
  border: 1px solid var(--carbonify-border);
  border-radius: 6px;
  color: var(--carbonify-text);
  text-decoration: none;
  font-size: 0.9rem;
  transition: all 0.2s;
}

.back-btn:hover {
  background: var(--carbonify-bg);
  border-color: var(--carbonify-primary);
}

.back-icon {
  font-size: 1.2rem;
}

.header-info {
  flex: 1;
}

.page-title {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--carbonify-text);
}

.page-description {
  margin: 0;
  color: var(--carbonify-muted);
  font-size: 0.95rem;
}

.payment-content {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

/* Loading and Error States */
.loading-state,
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.loading-spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--carbonify-border);
  border-top: 3px solid var(--carbonify-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.error-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

/* Payment Data */
.payment-data {
  display: flex;
  flex-direction: column;
  gap: 2rem;
}

/* Statistics */
.stats-section h2 {
  margin: 0 0 1.5rem 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--carbonify-text);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
}

.stat-card {
  background: var(--carbonify-surface);
  border: 1px solid var(--carbonify-border);
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
}

.stat-value {
  font-size: 2rem;
  font-weight: 700;
  color: var(--carbonify-primary);
  margin-bottom: 0.5rem;
}

.stat-label {
  color: var(--carbonify-muted);
  font-size: 0.9rem;
  font-weight: 500;
}

/* Payment History */
.history-section h2 {
  margin: 0 0 1.5rem 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--carbonify-text);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  background: var(--carbonify-surface);
  border: 1px solid var(--carbonify-border);
  border-radius: 12px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
}

.empty-state h3 {
  margin: 0 0 0.5rem 0;
  color: var(--carbonify-text);
  font-size: 1.25rem;
}

.empty-state p {
  margin: 0 0 1.5rem 0;
  color: var(--carbonify-muted);
}

.payment-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.payment-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem;
  background: var(--carbonify-surface);
  border: 1px solid var(--carbonify-border);
  border-radius: 12px;
  transition: all 0.2s;
}

.payment-item:hover {
  border-color: var(--carbonify-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.payment-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.payment-amount {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--carbonify-text);
}

.payment-details {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.payment-method {
  color: var(--carbonify-muted);
  font-size: 0.9rem;
}

.payment-date {
  color: var(--carbonify-muted);
  font-size: 0.8rem;
}

.payment-status {
  display: flex;
  align-items: center;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* Payment Methods */
.methods-section h2 {
  margin: 0 0 1.5rem 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--carbonify-text);
}

.methods-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1.5rem;
}

.method-card {
  background: var(--carbonify-surface);
  border: 1px solid var(--carbonify-border);
  border-radius: 12px;
  padding: 1.5rem;
  text-align: center;
  transition: all 0.2s;
}

.method-card:hover {
  border-color: var(--carbonify-primary);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.method-icon {
  font-size: 2rem;
  margin-bottom: 1rem;
}

.method-card h3 {
  margin: 0 0 0.5rem 0;
  color: var(--carbonify-text);
  font-size: 1.1rem;
  font-weight: 600;
}

.method-card p {
  margin: 0 0 1rem 0;
  color: var(--carbonify-muted);
  font-size: 0.9rem;
}

.method-features {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
}

.feature {
  padding: 0.25rem 0.75rem;
  background: var(--carbonify-primary-50);
  color: var(--carbonify-primary);
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
}

/* Responsive Design */
@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
    padding: 0 1rem;
  }

  .payment-content {
    padding: 1rem;
  }

  .payment-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 1rem;
  }

  .payment-status {
    align-self: flex-end;
  }
}
</style>
