<script setup>
import { ref, computed } from 'vue'
import { requestWithdrawal, getSellerBalance } from '@/services/payoutService'
import UiInput from '@/components/ui/Input.vue'
import UiButton from '@/components/ui/Button.vue'

const emit = defineEmits(['success', 'cancel'])

const formData = ref({
  amount: '',
  paymentMethod: 'gcash',
  accountName: '',
  accountNumber: '',
})

// Map the chosen method to a payout destination shape (bank methods carry a bankCode).
function buildDestination() {
  const m = formData.value.paymentMethod
  const base = {
    accountName: formData.value.accountName.trim(),
    accountNumber: formData.value.accountNumber.trim(),
  }
  if (m === 'gcash' || m === 'maya') {
    return { method: m, ...base }
  }
  // bpi / bdo -> bank transfer with the bank as bankCode
  return { method: 'bank', bankCode: m.toUpperCase(), ...base }
}

const errors = ref({})
const loading = ref(false)
const currentBalance = ref(0)
const balanceError = ref('')

const paymentMethods = [
  { value: 'gcash', label: 'GCash', icon: 'smartphone' },
  { value: 'maya', label: 'Maya', icon: 'credit_card' },
  { value: 'bpi', label: 'BPI', icon: 'account_balance' },
  { value: 'bdo', label: 'BDO', icon: 'account_balance' },
]

const quickAmounts = computed(() => {
  const balance = currentBalance.value
  return [
    Math.min(500, balance),
    Math.min(1000, balance),
    Math.min(2000, balance),
    Math.min(5000, balance),
    balance,
  ]
    .filter((amount) => amount > 0)
    .slice(0, 5)
})

function validateForm() {
  errors.value = {}

  const amount = parseFloat(formData.value.amount)

  if (!formData.value.amount || isNaN(amount)) {
    errors.value.amount = 'Please enter a valid amount'
  } else if (amount < 100) {
    errors.value.amount = 'Minimum withdrawal amount is ₱100'
  } else if (amount > currentBalance.value) {
    errors.value.amount = 'Insufficient balance'
  } else if (amount > 25000) {
    errors.value.amount = 'Maximum withdrawal amount is ₱25,000'
  }

  if (!formData.value.accountName.trim()) {
    errors.value.accountName = 'Account name is required'
  }
  if (!formData.value.accountNumber.trim()) {
    errors.value.accountNumber = 'Account number is required'
  }

  return Object.keys(errors.value).length === 0
}

async function handleSubmit() {
  if (!validateForm()) return

  loading.value = true
  try {
    const amount = parseFloat(formData.value.amount)
    const payoutId = await requestWithdrawal({ amount, destination: buildDestination() })
    emit('success', { amount, paymentMethod: formData.value.paymentMethod, payoutId })

    // Reset form
    formData.value = {
      amount: '',
      paymentMethod: 'gcash',
      accountName: '',
      accountNumber: '',
    }
  } catch (error) {
    console.error('Withdrawal error:', error)
    errors.value.general = error.message || 'Failed to initiate withdrawal'
  } finally {
    loading.value = false
  }
}

function setQuickAmount(amount) {
  formData.value.amount = amount.toString()
}

function setMaxAmount() {
  formData.value.amount = currentBalance.value.toString()
}

async function loadBalance() {
  balanceError.value = ''
  try {
    const balance = await getSellerBalance()
    currentBalance.value = balance.available || 0
  } catch (error) {
    // Say the balance is unknown rather than displaying PHP 0. A seller who
    // opened this modal from a page showing PHP 5,000 available, and is then
    // shown zero with the submit button greyed out, has been told their money
    // is gone. The submit stays disabled either way — the server is the real
    // gate — but the reason on screen has to be the true one.
    console.error('Error loading balance:', error)
    balanceError.value = error?.message || 'Could not load your available balance.'
  }
}

function handleCancel() {
  emit('cancel')
}

// Load balance on component mount
loadBalance()
</script>

<template>
  <div class="withdraw-form">
    <div class="form-header">
      <h2 class="form-title">Withdraw Funds</h2>
      <p class="form-description">Withdraw your available seller earnings</p>
    </div>

    <!-- Current Balance -->
    <div class="balance-display">
      <div class="balance-label">Available Balance</div>
      <div v-if="balanceError" class="balance-unknown">
        Unavailable — {{ balanceError }}
        <button type="button" class="balance-retry" @click="loadBalance">Retry</button>
      </div>
      <div v-else class="balance-amount">₱{{ currentBalance.toLocaleString() }}</div>
    </div>

    <form @submit.prevent="handleSubmit" class="form-grid">
      <!-- Quick Amount Buttons -->
      <div v-if="quickAmounts.length > 0" class="quick-amounts">
        <label class="input-label">Quick Amount</label>
        <div class="amount-buttons">
          <button
            v-for="amount in quickAmounts"
            :key="amount"
            type="button"
            class="amount-btn"
            @click="setQuickAmount(amount)"
            :class="{ active: formData.amount === amount.toString() }"
          >
            ₱{{ amount.toLocaleString() }}
          </button>
          <button
            type="button"
            class="amount-btn max-btn"
            @click="setMaxAmount"
            :class="{ active: formData.amount === currentBalance.toString() }"
          >
            All
          </button>
        </div>
      </div>

      <!-- Amount Input -->
      <UiInput
        id="amount"
        label="Withdrawal Amount *"
        type="number"
        placeholder="0.00"
        v-model="formData.amount"
        :error="errors.amount"
        step="0.01"
        :max="currentBalance"
        required
      />

      <!-- Payment Method -->
      <div class="input">
        <label class="input-label">Withdraw To *</label>
        <div class="payment-methods">
          <label
            v-for="method in paymentMethods"
            :key="method.value"
            class="payment-method"
            :class="{ active: formData.paymentMethod === method.value }"
          >
            <input
              type="radio"
              :value="method.value"
              v-model="formData.paymentMethod"
              class="payment-radio"
            />
            <span class="material-symbols-outlined method-icon" aria-hidden="true">
              {{ method.icon }}
            </span>
            <span class="method-name">{{ method.label }}</span>
          </label>
        </div>
      </div>

      <!-- Destination account details -->
      <UiInput
        id="accountName"
        label="Account Name *"
        type="text"
        placeholder="Registered account holder name"
        v-model="formData.accountName"
        :error="errors.accountName"
        required
      />
      <UiInput
        id="accountNumber"
        label="Account / Mobile Number *"
        type="text"
        placeholder="Account no. or e-wallet mobile number"
        v-model="formData.accountNumber"
        :error="errors.accountNumber"
        required
      />

      <!-- General Error -->
      <div v-if="errors.general" class="error-message general-error">
        {{ errors.general }}
      </div>

      <!-- Form Actions -->
      <div class="form-actions">
        <UiButton type="button" variant="ghost" @click="handleCancel" :disabled="loading">
          Cancel
        </UiButton>
        <UiButton type="submit" variant="primary" :disabled="loading || currentBalance === 0 || !!balanceError">
          <span v-if="!loading">Withdraw ₱{{ formData.amount || '0' }}</span>
          <span v-else>Processing...</span>
        </UiButton>
      </div>
    </form>

    <!-- Withdrawal Info -->
    <div class="withdrawal-info">
      <h4>Withdrawal Information</h4>
      <ul>
        <li>Minimum withdrawal: ₱100</li>
        <li>Maximum withdrawal: ₱25,000</li>
        <li>Processing time: 1-2 business days</li>
        <li>Withdrawal fee: ₱25 (deducted from amount)</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.withdraw-form {
  max-width: 500px;
  margin: 0 auto;
}

.form-header {
  margin-bottom: 24px;
  text-align: center;
}

.form-title {
  margin: 0 0 8px 0;
  font-size: 24px;
  font-weight: 700;
  color: var(--primary-dark, #045c1a);
}

.form-description {
  margin: 0;
  color: var(--text-muted, #64748b);
  font-size: 14px;
}

.balance-display {
  text-align: center;
  padding: 20px;
  background: var(--primary-lightest, #f8fdf8);
  border: 1px solid var(--border-green-light, #d4edda);
  border-radius: 12px;
  margin-bottom: 24px;
}

.balance-label {
  font-size: 14px;
  color: var(--primary-hover, #04701f);
  margin-bottom: 8px;
}

.balance-unknown {
  font-size: 0.9rem;
  font-weight: 600;
  color: #991b1b;
}
.balance-retry {
  background: none;
  border: none;
  padding: 0 0 0 6px;
  color: #991b1b;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.balance-amount {
  font-size: 32px;
  font-weight: 800;
  color: var(--primary-dark, #045c1a);
}

.form-grid {
  display: grid;
  gap: 20px;
}

.quick-amounts {
  display: grid;
  gap: 8px;
}

.input-label {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary, #1a1a1a);
}

.amount-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 8px;
}

.amount-btn {
  padding: 12px 8px;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 8px;
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #1a1a1a);
  font-weight: 600;
  cursor: pointer;
  transition: all 120ms ease;
}

.amount-btn:hover {
  border-color: var(--primary-color, #058526);
  background: var(--primary-lightest, #f8fdf8);
}

.amount-btn.active {
  border-color: var(--primary-color, #058526);
  background: var(--primary-color, #058526);
  color: white;
}

.max-btn {
  background: var(--primary-light, #e8f5e8);
  border-color: var(--border-green-light, #d4edda);
}

.payment-methods {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.payment-method {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 8px;
  background: var(--bg-primary, #ffffff);
  cursor: pointer;
  transition: all 120ms ease;
}

.payment-method:hover {
  border-color: var(--primary-color, #058526);
}

.payment-method.active {
  border-color: var(--primary-color, #058526);
  background: var(--primary-lightest, #f8fdf8);
}

.payment-radio {
  margin: 0;
}

.method-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(5, 133, 38, 0.12);
  color: var(--carbonify-primary-600, #047857);
  font-size: 22px;
}

.method-name {
  font-weight: 600;
  font-size: 14px;
}

.error-message {
  color: #dc2626;
  font-size: 12px;
  font-weight: 500;
}

.general-error {
  padding: 12px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  font-size: 14px;
}

.form-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 8px;
}

.withdrawal-info {
  margin-top: 24px;
  padding: 16px;
  background: #fef3c7;
  border-radius: 8px;
  border: 1px solid #fcd34d;
}

.withdrawal-info h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: #92400e;
}

.withdrawal-info ul {
  margin: 0;
  padding-left: 20px;
  color: #b45309;
  font-size: 14px;
}

.withdrawal-info li {
  margin-bottom: 4px;
}

button[disabled] {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 480px) {
  .amount-buttons {
    grid-template-columns: repeat(3, 1fr);
  }

  .payment-methods {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
