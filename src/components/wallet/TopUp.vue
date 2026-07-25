<script setup>
import { ref } from 'vue'
import { useUserStore } from '@/store/userStore'
import { initiateTopUp } from '@/services/walletService'
import UiInput from '@/components/ui/Input.vue'
import UiButton from '@/components/ui/Button.vue'

const emit = defineEmits(['success', 'cancel'])
const userStore = useUserStore()

const formData = ref({
  amount: '',
  paymentMethod: 'gcash',
})

const errors = ref({})
const loading = ref(false)

const paymentMethods = [
  { value: 'gcash', label: 'GCash', icon: 'smartphone' },
  { value: 'maya', label: 'Maya', icon: 'credit_card' },
  { value: 'bpi', label: 'BPI', icon: 'account_balance' },
  { value: 'bdo', label: 'BDO', icon: 'account_balance' },
]

const quickAmounts = [100, 500, 1000, 2000, 5000]

function validateForm() {
  errors.value = {}

  const amount = parseFloat(formData.value.amount)

  if (!formData.value.amount || isNaN(amount)) {
    errors.value.amount = 'Please enter a valid amount'
  } else if (amount < 10) {
    errors.value.amount = 'Minimum top-up amount is ₱10'
  } else if (amount > 50000) {
    errors.value.amount = 'Maximum top-up amount is ₱50,000'
  }

  return Object.keys(errors.value).length === 0
}

async function handleSubmit() {
  if (!validateForm()) return

  loading.value = true
  try {
    const amount = parseFloat(formData.value.amount)
    const result = await initiateTopUp(amount, formData.value.paymentMethod) // userId will be set in service
    
    // If PayMongo checkout is created, redirect user
    if (result.redirect && result.checkoutUrl) {
      // Store session and user data for callback
      localStorage.setItem('wallet_topup_session', result.sessionId)
      localStorage.setItem('wallet_topup_amount', amount.toString())
      if (userStore.session?.user?.id) {
        localStorage.setItem('wallet_topup_user_id', userStore.session.user.id)
      }
      
      // Redirect to PayMongo checkout
      window.location.href = result.checkoutUrl
      return // Stop here, user will be redirected
    }
    
    emit('success', { amount, paymentMethod: formData.value.paymentMethod })

    // Reset form
    formData.value = {
      amount: '',
      paymentMethod: 'gcash',
    }
  } catch (error) {
    console.error('Top-up error:', error)
    errors.value.general = error.message || 'Failed to initiate top-up'
  } finally {
    loading.value = false
  }
}

function setQuickAmount(amount) {
  formData.value.amount = amount.toString()
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <div class="topup-form">
    <div class="form-header">
      <h2 class="form-title">Top Up Wallet</h2>
      <p class="form-description">Add funds to your Carbonify wallet</p>
    </div>

    <form @submit.prevent="handleSubmit" class="form-grid">
      <!-- Quick Amount Buttons -->
      <div class="quick-amounts">
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
        </div>
      </div>

      <!-- Amount Input -->
      <UiInput
        id="amount"
        label="Amount *"
        type="number"
        placeholder="0.00"
        v-model="formData.amount"
        :error="errors.amount"
        step="0.01"
        min="10"
        max="50000"
        required
      />

      <!-- Payment Method -->
      <div class="input">
        <label class="input-label">Payment Method *</label>
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

      <!-- General Error -->
      <div v-if="errors.general" class="error-message general-error">
        {{ errors.general }}
      </div>

      <!-- Form Actions -->
      <div class="form-actions">
        <UiButton type="button" variant="ghost" @click="handleCancel" :disabled="loading">
          Cancel
        </UiButton>
        <UiButton type="submit" variant="primary" :disabled="loading">
          <span v-if="!loading">Top Up ₱{{ formData.amount || '0' }}</span>
          <span v-else>Processing...</span>
        </UiButton>
      </div>
    </form>

    <!-- Payment Info -->
    <div class="payment-info">
      <h4>Payment Information</h4>
      <ul>
        <li>Minimum top-up: ₱10</li>
        <li>Maximum top-up: ₱50,000</li>
        <li>Processing time: 1-3 minutes</li>
        <li>No fees for top-ups</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.topup-form {
  max-width: 500px;
  margin: 0 auto;
  background: #ffffff;
  padding: 32px;
  position: relative;
  z-index: 1002;
}

.form-header {
  margin-bottom: 32px;
  text-align: center;
  background: #f8fafc;
  padding: 24px;
  border-radius: 12px;
  border: 2px solid #e5e7eb;
  position: relative;
  z-index: 1003;
}

.form-title {
  margin: 0 0 8px 0;
  font-size: 28px;
  font-weight: 700;
  color: #1f2937;
}

.form-description {
  margin: 0;
  color: #6b7280;
  font-size: 16px;
  font-weight: 500;
}

.form-grid {
  display: grid;
  gap: 24px;
  background: #ffffff;
  padding: 24px;
  border-radius: 12px;
  border: 2px solid #e5e7eb;
  position: relative;
  z-index: 1003;
}

.quick-amounts {
  display: grid;
  gap: 12px;
  background: #f8fafc;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.input-label {
  font-weight: 600;
  font-size: 14px;
  color: var(--carbonify-text);
}

.amount-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 8px;
}

.amount-btn {
  padding: 12px 8px;
  border: 1px solid var(--carbonify-border);
  border-radius: 8px;
  background: var(--carbonify-surface);
  color: var(--carbonify-text);
  font-weight: 600;
  cursor: pointer;
  transition: all 120ms ease;
}

.amount-btn:hover {
  border-color: var(--carbonify-primary-500);
  background: var(--carbonify-primary-50);
}

.amount-btn.active {
  border-color: var(--carbonify-primary-500);
  background: var(--carbonify-primary-500);
  color: white;
}

.payment-methods {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 12px;
  background: #f8fafc;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
}

.payment-method {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--carbonify-border);
  border-radius: 8px;
  background: var(--carbonify-surface);
  cursor: pointer;
  transition: all 120ms ease;
}

.payment-method:hover {
  border-color: var(--carbonify-primary-500);
}

.payment-method.active {
  border-color: var(--carbonify-primary-500);
  background: var(--carbonify-primary-50);
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
  gap: 16px;
  justify-content: flex-end;
  margin-top: 32px;
  padding: 24px;
  background: #f8fafc;
  border-radius: 12px;
  border: 2px solid #e5e7eb;
  position: relative;
  z-index: 1003;
}

.payment-info {
  margin-top: 32px;
  padding: 24px;
  background: #f0f9ff;
  border-radius: 12px;
  border: 2px solid #0ea5e9;
  position: relative;
  z-index: 1003;
}

.payment-info h4 {
  margin: 0 0 12px 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--carbonify-primary-700);
}

.payment-info ul {
  margin: 0;
  padding-left: 20px;
  color: var(--carbonify-primary-600);
  font-size: 14px;
}

.payment-info li {
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
