<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { processPaymentCallback } from '@/services/paymongoService'
import { useModernPrompt } from '@/composables/useModernPrompt'
import ModernPrompt from '@/components/ui/ModernPrompt.vue'
import { useCartStore } from '@/store/cartStore'
import { CART_CHECKOUT_ACTIVE, CART_PENDING_LISTING } from '@/constants/cart'

const {
  promptState,
  success: showSuccess,
  handleConfirm,
  handleCancel,
  handleClose,
} = useModernPrompt()

const router = useRouter()
const route = useRoute()
const cart = useCartStore()

const loading = ref(true)
const success = ref(false)
const error = ref('')
const paymentDetails = ref(null)

/**
 * Server-authoritative settlement (Phase 1 P2 cutover).
 *
 * By the time PayMongo redirects the buyer back here, the `paymongo-webhook`
 * has (or shortly will have) settled the purchase atomically via
 * `process_marketplace_purchase` — decrementing the pool and writing
 * credit_transactions, credit_ownership and the double-entry ledger. The
 * browser therefore writes NO financial tables. All we do here is wait for that
 * server-created transaction (keyed by payment_reference = payment_intent id)
 * and then issue the certificate + receipt for it.
 *
 * @param {string} paymentIntentId
 */
async function settleServerPurchase(paymentIntentId) {
  try {
    const { getSupabase } = await import('@/services/supabaseClient')
    const supabase = getSupabase()
    if (!supabase) return

    // Poll briefly for the webhook-settled transaction.
    let txnId = null
    for (let attempt = 0; attempt < 10 && !txnId; attempt++) {
      const { data } = await supabase
        .from('credit_transactions')
        .select('id')
        .eq('payment_reference', paymentIntentId)
        .limit(1)
        .maybeSingle()
      if (data?.id) {
        txnId = data.id
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }

    if (!txnId) {
      // The webhook may still be in flight (or unreachable in local dev). Credits
      // and the ledger are the webhook's responsibility and will appear once it
      // lands; the certificate/receipt can be generated later from the
      // Certificates page. Nothing is written client-side.
      console.warn('⚠️ Purchase not yet settled by webhook; certificate deferred')
      return
    }

    // Receipt — idempotent (returns the existing one if already generated).
    try {
      const { generateReceipt } = await import('@/services/receiptService')
      await generateReceipt(txnId)
    } catch (receiptError) {
      console.warn('⚠️ Receipt generation failed (non-critical):', receiptError?.message)
    }

    // Certificate — generateCreditCertificate does not dedupe on its own, so
    // guard against a duplicate on reload.
    try {
      const { data: existingCert } = await supabase
        .from('certificates')
        .select('id')
        .eq('transaction_id', txnId)
        .limit(1)
        .maybeSingle()
      if (!existingCert) {
        const { generateCreditCertificate } = await import('@/services/certificateService')
        await generateCreditCertificate(txnId, 'purchase')
      }
    } catch (certError) {
      console.warn('⚠️ Certificate generation failed (non-critical):', certError?.message)
    }
  } catch (settleError) {
    console.warn('⚠️ settleServerPurchase skipped:', settleError?.message)
  }
}

onMounted(async () => {
  // Get session ID from URL or localStorage (PayMongo may not replace {CHECKOUT_SESSION_ID})
  console.log('🔍 Full route query:', route.query)
  console.log('🔍 Full route params:', route.params)

  // Check if this is a mock payment (from mock checkout URL)
  const isMockPayment = route.query.mock === 'true' || route.query.mock === true
  const mockAmount = route.query.amount ? parseFloat(route.query.amount) : null

  let sessionId =
    route.query.session_id ||
    route.query.checkout_session_id ||
    route.params.sessionId ||
    route.params.checkout_session_id

  // If URL doesn't have it or has placeholder, check localStorage
  if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}') {
    console.log('⚠️ Session ID not in URL, checking localStorage...')
    sessionId =
      localStorage.getItem('pending_purchase_session') ||
      localStorage.getItem('wallet_topup_session')
    if (sessionId) {
      console.log('✅ Found session ID in localStorage:', sessionId)
    }
  }

  // If mock payment but no sessionId, create a mock session ID
  if (isMockPayment && !sessionId) {
    sessionId = `mock_session_${Date.now()}`
    console.log('🎭 Creating mock session ID for demo:', sessionId)
    // Store it so the purchase completion can find it
    localStorage.setItem('pending_purchase_session', sessionId)
  }

  console.log('🔍 Final session ID:', sessionId)
  console.log('🎭 Is mock payment:', isMockPayment, 'Amount:', mockAmount)

  if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}') {
    error.value = 'No payment session found'
    loading.value = false
    return
  }

  try {
    // Process the payment callback
    const result = await processPaymentCallback(sessionId, { isMock: isMockPayment, mockAmount })

    if (result.success) {
      success.value = true
      paymentDetails.value = result.payment

      // Wallet top-up completion (legacy path; migrated to payment_intents in P5).
      const topUpSession = localStorage.getItem('wallet_topup_session')
      const wasTopUp = topUpSession && topUpSession === sessionId

      // Server-authoritative marketplace settlement. Skipped for top-ups (which
      // are not marketplace purchases). Runs before cart sequencing so the item
      // just paid for gets its certificate before we return to the cart.
      if (!wasTopUp) {
        const pendingIntent = localStorage.getItem('pending_purchase_intent')
        if (pendingIntent) {
          await settleServerPurchase(pendingIntent)
          localStorage.removeItem('pending_purchase_intent')
        }
      }

      // Sequential cart checkout: remove the item just paid for and, if more
      // remain, send the buyer back to the cart to continue.
      if (localStorage.getItem(CART_CHECKOUT_ACTIVE) === '1') {
        const pending = localStorage.getItem(CART_PENDING_LISTING)
        if (pending) cart.removeItem(pending)
        localStorage.removeItem(CART_PENDING_LISTING)
        if (cart.items.length > 0) {
          await showSuccess({
            title: 'Item purchased',
            message: `Payment received. ${cart.items.length} item(s) left in your cart.`,
            confirmText: 'Continue checkout',
          })
          router.push('/cart')
          return
        }
        localStorage.removeItem(CART_CHECKOUT_ACTIVE)
      }

      if (wasTopUp) {
        // Wallet top-up is credited server-side by the webhook (Phase 1 P5).
        // We only wait for it to land and surface status — no client-side wallet
        // write (financial tables are server-write-only after the cutover).
        try {
          console.log('💰 Waiting for wallet top-up to be credited by webhook:', sessionId)
          const { waitForWebhookTransaction } = await import('@/services/webhookService')
          const webhookStatus = await waitForWebhookTransaction(sessionId, 8, 1500)

          if (webhookStatus && webhookStatus.status === 'completed') {
            console.log('✅ Wallet top-up credited by webhook')
          } else {
            console.warn('⚠️ Top-up not yet credited by webhook; it will reflect shortly')
          }
        } catch (confirmError) {
          console.error('❌ Error confirming wallet top-up:', confirmError)
          error.value = `Top-up may be delayed: ${confirmError.message}`
        }
      }

      // Redirect to wallet after purchase or top-up.
      const redirectPath = '/wallet'

      // Add a flag to trigger refresh in RetireView
      if (!wasTopUp) {
        sessionStorage.setItem('refresh_retire_history', 'true')
      }

      // Clean up localStorage
      localStorage.removeItem('pending_purchase')
      localStorage.removeItem('pending_purchase_session')
      localStorage.removeItem('pending_purchase_intent')
      localStorage.removeItem('wallet_topup_session')
      localStorage.removeItem('wallet_topup_amount')
      localStorage.removeItem('wallet_topup_user_id')

      // Redirect to appropriate page after 3 seconds
      setTimeout(() => {
        router.push(redirectPath)
      }, 3000)
    } else {
      throw new Error('Payment not completed')
    }
  } catch (err) {
    console.error('Payment callback error:', err)
    error.value = err.message || 'Payment verification failed'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="payment-callback-page">
    <div class="container">
      <div v-if="loading" class="loading-container">
        <div class="spinner"></div>
        <h2>Processing payment...</h2>
        <p>Please wait while we verify your payment</p>
      </div>

      <div v-else-if="success" class="success-container">
        <div class="success-icon"><span class="material-symbols-outlined" aria-hidden="true">check_circle</span></div>
        <h2>Payment Successful!</h2>
        <p>Your payment has been confirmed</p>
        <div v-if="paymentDetails" class="payment-summary">
          <p><strong>Amount:</strong> ₱{{ paymentDetails.amount.toLocaleString() }}</p>
          <p><strong>Status:</strong> {{ paymentDetails.status }}</p>
        </div>
        <p class="redirect-message">Redirecting to retire dashboard...</p>
      </div>

      <div v-else class="error-container">
        <div class="error-icon"><span class="material-symbols-outlined" aria-hidden="true">cancel</span></div>
        <h2>Payment Verification Failed</h2>
        <p>{{ error }}</p>
        <button @click="router.push('/marketplace')" class="btn-primary">
          Return to Marketplace
        </button>
      </div>
    </div>
    <ModernPrompt
      :is-open="promptState.isOpen"
      :type="promptState.type"
      :title="promptState.title"
      :message="promptState.message"
      :confirm-text="promptState.confirmText"
      :cancel-text="promptState.cancelText"
      :show-cancel="promptState.showCancel"
      @confirm="handleConfirm"
      @cancel="handleCancel"
      @close="handleClose"
    />
  </div>
</template>

<style scoped>
.payment-callback-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
}

.container {
  max-width: 600px;
  padding: 2rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  text-align: center;
}

.loading-container,
.success-container,
.error-container {
  padding: 2rem;
}

.spinner {
  width: 50px;
  height: 50px;
  margin: 0 auto 1rem;
  border: 4px solid #f3f4f6;
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.success-icon,
.error-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
}

h2 {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 600;
}

p {
  margin: 0.5rem 0;
  color: #6b7280;
}

.payment-summary {
  background: #f9fafb;
  padding: 1rem;
  border-radius: 8px;
  margin: 1rem 0;
}

.redirect-message {
  font-style: italic;
  color: var(--primary-color);
}

.btn-primary {
  padding: 0.75rem 2rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  margin-top: 1rem;
}

.btn-primary:hover {
  background: var(--primary-hover);
}
</style>
