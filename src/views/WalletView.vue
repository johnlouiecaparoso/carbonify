<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/store/userStore'
import { getWalletBalance, getTransactions } from '@/services/walletService'
import TopUp from '@/components/wallet/TopUp.vue'
import Withdraw from '@/components/wallet/Withdraw.vue'

const store = useUserStore()

const walletBalance = ref({ current_balance: 0, currency: 'PHP' })
const transactions = ref([])
const loading = ref(false)
const showTopUp = ref(false)
const showWithdraw = ref(false)
const error = ref('')

const isDev = import.meta.env.DEV

async function loadWalletData() {
  if (!store.session?.user?.id) {
    console.log('No user session, skipping wallet data load')
    return
  }

  loading.value = true
  try {
    const startTime = isDev ? performance.now() : 0

    const results = await Promise.allSettled([
      getWalletBalance(store.session.user.id),
      getTransactions(store.session.user.id),
    ])

    const [balanceResult, transactionsResult] = results
    let failures = 0

    if (balanceResult.status === 'fulfilled') {
      walletBalance.value = balanceResult.value
    } else {
      failures += 1
      console.warn('Warning: Failed to load wallet balance:', balanceResult.reason)
      walletBalance.value = { current_balance: 0, currency: 'PHP' }
    }

    if (transactionsResult.status === 'fulfilled') {
      transactions.value = transactionsResult.value
    } else {
      failures += 1
      console.warn('Warning: Failed to load wallet transactions:', transactionsResult.reason)
      transactions.value = []
    }

    if (failures === results.length) {
      error.value = 'Failed to load wallet data. Please try refreshing the page.'
    } else if (failures > 0) {
      error.value = 'Wallet data loaded with partial information.'
    } else {
      error.value = ''
    }

    if (isDev) {
      const duration = performance.now() - startTime
      console.log(`Wallet data loaded successfully in ${duration.toFixed(0)}ms`)
    }
  } catch (err) {
    console.error('Error loading wallet data:', err)
    error.value = 'Failed to load wallet data. Please try refreshing the page.'
  } finally {
    loading.value = false
  }
}

function showTopUpModal() {
  showTopUp.value = true
}

function showWithdrawModal() {
  showWithdraw.value = true
}

function onTopUpSuccess() {
  showTopUp.value = false
  loadWalletData() // Reload wallet data
}

function onWithdrawSuccess() {
  showWithdraw.value = false
  loadWalletData() // Reload wallet data
}

function onTopUpCancel() {
  showTopUp.value = false
}

function onWithdrawCancel() {
  showWithdraw.value = false
}

function formatAmount(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount)
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTransactionStatusColor(status) {
  switch (status) {
    case 'completed':
      return '#058526'
    case 'pending':
      return '#f59e0b'
    case 'failed':
      return '#ef4444'
    default:
      return '#6b7280'
  }
}

function getTransactionIconName(type) {
  switch (type) {
    case 'topup':
      return 'add_card'
    case 'withdrawal':
      return 'credit_card_off'
    case 'payment':
      return 'paid'
    default:
      return 'account_balance_wallet'
  }
}

onMounted(() => {
  loadWalletData()
})
</script>

<template>
  <div class="wallet-page">
    <header class="wallet-header">
      <div class="page-header">
        <div class="container">
          <h1 class="page-title">My Wallet</h1>
          <p class="page-description">Manage your Carbonify wallet and transactions</p>
        </div>
      </div>
    </header>

    <main class="wallet-content">
      <!-- Wallet Balance Card -->
      <div class="balance-card">
        <div class="balance-header">
          <h2 class="balance-title">Wallet Balance</h2>
          <div class="balance-currency">{{ walletBalance.currency }}</div>
        </div>
        <div class="balance-amount">{{ formatAmount(walletBalance.current_balance) }}</div>
        <div class="balance-actions">
          <button class="btn btn-primary" @click="showTopUpModal">+ Top Up</button>
          <button
            class="btn btn-ghost"
            @click="showWithdrawModal"
            :disabled="walletBalance.current_balance === 0"
          >
            - Withdraw
          </button>
        </div>
      </div>

      <!-- Error State -->
      <div v-if="error" class="error-card">
        <div class="error-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 3.25 3.75 19.5h16.5L12 3.25Z" stroke-linejoin="round" />
            <path d="M12 9v4.5" stroke-linecap="round" />
            <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <div class="error-message">{{ error }}</div>
        <button class="btn btn-primary" @click="loadWalletData">Retry</button>
      </div>

      <!-- Loading State -->
      <div v-else-if="loading" class="loading-card">
        <div class="loading-spinner"></div>
        <div class="loading-text">Loading wallet data...</div>
      </div>

      <!-- Transaction History -->
      <div v-else class="transactions-section">
        <div class="section-header">
          <h2 class="section-title">Transaction History</h2>
          <button class="btn btn-ghost" @click="loadWalletData">Refresh</button>
        </div>

        <div v-if="transactions.length === 0" class="empty-transactions">
          <div class="empty-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <rect x="4.5" y="3.75" width="15" height="16.5" rx="2" />
              <path d="M8 3.75v3h8v-3" stroke-linecap="round" />
              <path d="M8 12h8M8 16h5" stroke-linecap="round" />
            </svg>
          </div>
          <h3>No transactions yet</h3>
          <p>Your transaction history will appear here</p>
          <button class="btn btn-primary" @click="showTopUpModal">
            Make Your First Transaction
          </button>
        </div>

        <div v-else class="transactions-list">
          <div v-for="transaction in transactions" :key="transaction.id" class="transaction-item">
            <div class="transaction-icon" aria-hidden="true">
              <span class="material-symbols-outlined">
                {{ getTransactionIconName(transaction.type) }}
              </span>
            </div>
            <div class="transaction-details">
              <div class="transaction-description">{{ transaction.description }}</div>
              <div class="transaction-meta">
                <span class="transaction-date">{{ formatDate(transaction.created_at) }}</span>
                <span class="transaction-method">{{
                  transaction.payment_method?.toUpperCase()
                }}</span>
                <span
                  class="transaction-status"
                  :style="{ color: getTransactionStatusColor(transaction.status) }"
                >
                  {{ transaction.status }}
                </span>
              </div>
            </div>
            <div class="transaction-amount" :class="`amount-${transaction.type}`">
              {{ transaction.type === 'topup' ? '+' : '-' }}{{ formatAmount(transaction.amount) }}
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Top Up Modal -->
    <div v-if="showTopUp" class="modal-overlay" v-modal-a11y="onTopUpCancel" @click="onTopUpCancel">
      <div class="modal-content" @click.stop>
        <TopUp @success="onTopUpSuccess" @cancel="onTopUpCancel" />
      </div>
    </div>

    <!-- Withdraw Modal -->
    <div v-if="showWithdraw" class="modal-overlay" v-modal-a11y="onWithdrawCancel" @click="onWithdrawCancel">
      <div class="modal-content" @click.stop>
        <Withdraw @success="onWithdrawSuccess" @cancel="onWithdrawCancel" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.wallet-page {
  min-height: 100vh;
  background: var(--bg-secondary, #f8fdf8);
}

.wallet-header {
  padding: 0;
}

.page-header {
  padding: 1.25rem 0;
  background: var(--primary-color, #058526);
  border-bottom: none;
}

.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 2rem;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.5rem;
}

.page-description {
  font-size: 0.95rem;
  color: #fff;
}

.wallet-content {
  padding: 40px 24px;
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  gap: 24px;
}

/* Balance Card */
.balance-card {
  background: linear-gradient(135deg, var(--primary-color, #058526), var(--primary-dark, #045c1a));
  color: white;
  border-radius: var(--radius-lg, 0.75rem);
  padding: 32px;
  box-shadow: var(--shadow-green, 0 4px 12px rgba(5, 133, 38, 0.3));
}

.balance-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.balance-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: white;
}

.balance-currency {
  background: rgba(255, 255, 255, 0.2);
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 14px;
  font-weight: 600;
  color: white;
}

.balance-amount {
  font-size: 48px;
  font-weight: 800;
  margin-bottom: 24px;
  color: white;
}

.balance-actions {
  display: flex;
  gap: 12px;
}

/* Error and Loading States */
.error-card,
.loading-card {
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: var(--radius-xl, 0.75rem);
  padding: 40px;
  text-align: center;
  box-shadow: var(--shadow-md);
}

.error-icon {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid rgba(220, 38, 38, 0.25);
  color: #dc2626;
  margin: 0 auto 16px;
}

.error-icon svg {
  width: 1.9rem;
  height: 1.9rem;
}

.error-message {
  font-size: 16px;
  color: var(--text-primary, #1a1a1a);
  margin-bottom: 20px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid var(--border-color, #d1e7dd);
  border-top: 4px solid var(--primary-color, #058526);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.loading-text {
  color: var(--text-muted, #64748b);
  font-size: 16px;
}

/* Transactions Section */
.transactions-section {
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: var(--radius-xl, 0.75rem);
  padding: 24px;
  box-shadow: var(--shadow-md);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}


.section-title {
  margin: 0;
  font-size: 20px;
  font-weight: 700;
  color: var(--text-primary, #1a1a1a);
}

.empty-transactions {
  text-align: center;
  padding: 40px 20px;
}

.empty-icon {
  width: 3.25rem;
  height: 3.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.1);
  color: #0f172a;
  margin-bottom: 16px;
}

.empty-icon svg {
  width: 2rem;
  height: 2rem;
}

.empty-transactions h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary, #1a1a1a);
}

.empty-transactions p {
  margin: 0 0 20px 0;
  color: var(--text-muted, #64748b);
}

/* Transaction List */
.transactions-list {
  display: grid;
  gap: 12px;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 6px;
}

.transactions-list::-webkit-scrollbar {
  width: 8px;
}

.transactions-list::-webkit-scrollbar-track {
  background: #eef2f7;
  border-radius: 999px;
}

.transactions-list::-webkit-scrollbar-thumb {
  background: #c7d2e0;
  border-radius: 999px;
}

.transactions-list::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}

.transaction-item {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: var(--bg-secondary, #f8fdf8);
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 12px;
  transition: all 120ms ease;
}

.transaction-item:hover {
  background: var(--primary-lightest, #f8fdf8);
  border-color: var(--border-green-light, #d4edda);
}

.transaction-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary, #ffffff);
  border-radius: 50%;
}

.transaction-icon .material-symbols-outlined {
  font-size: 22px;
}

.transaction-details {
  flex: 1;
}

.transaction-description {
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
  margin-bottom: 4px;
}

.transaction-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted, #64748b);
}

.transaction-status {
  text-transform: capitalize;
  font-weight: 600;
}

.transaction-amount {
  font-weight: 700;
  font-size: 16px;
}

.amount-topup {
  color: var(--primary-hover, #04701f);
}

.amount-withdrawal {
  color: #dc2626;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: #ffffff;
  border: 2px solid #e5e7eb;
  border-radius: 16px;
  box-shadow:
    0 20px 25px -5px rgba(0, 0, 0, 0.1),
    0 10px 10px -5px rgba(0, 0, 0, 0.04);
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  padding: 0;
  position: relative;
  z-index: 1001;
}

/* Responsive Design */
@media (max-width: 768px) {
  .wallet-header {
    padding: 0;
  }

  .page-header {
    padding: 1.25rem 0;
  }





  .container {
    padding: 0 1rem;
  }

  .wallet-content {
    padding: 20px 16px;
  }

  .balance-card {
    padding: 24px 20px;
  }

  .balance-amount {
    font-size: 36px;
  }

  .balance-actions {
    flex-direction: column;
    gap: 8px;
  }

  .balance-actions .btn {
    width: 100%;
    padding: 12px;
    font-size: 16px;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .transaction-item {
    padding: 12px;
    gap: 12px;
  }

  .transaction-meta {
    flex-wrap: wrap;
    gap: 8px;
    font-size: 11px;
  }

  .modal-overlay {
    padding: 16px;
  }

  .modal-content {
    padding: 20px;
  }
}

@media (max-width: 480px) {
  .wallet-header {
    padding: 12px;
  }



  .wallet-content {
    padding: 16px 12px;
  }

  .balance-card {
    padding: 20px 16px;
  }

  .balance-amount {
    font-size: 28px;
  }

  .transaction-item {
    flex-direction: column;
    align-items: flex-start;
    text-align: left;
  }

  .transaction-amount {
    align-self: flex-end;
    font-size: 18px;
  }
}
</style>
