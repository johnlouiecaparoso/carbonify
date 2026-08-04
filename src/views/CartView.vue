<template>
  <div class="cart-view">
    <PageHeader title="Your Cart" description="Review your items and check out." />

    <div class="container">

      <!-- Same KYC gate the marketplace shows; the cart checkout path used to
           skip it entirely, so the two paths enforced different rules. -->
      <KycGateBanner v-if="cart.items.length > 0" context="checkout" />

      <!-- Sequential-checkout resume banner -->
      <div v-if="resuming && cart.items.length > 0" class="resume-banner">
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        Checkout continues one item at a time — {{ cart.items.length }} item(s) left to pay for.
      </div>

      <div v-if="cart.items.length === 0" class="state-card">
        <p>Your cart is empty.</p>
        <router-link to="/marketplace" class="browse-link">Browse the marketplace →</router-link>
      </div>

      <div v-else class="cart-layout">
        <ul class="cart-items">
          <li v-for="item in cart.items" :key="item.listingId" class="cart-item">
            <div class="cart-thumb">
              <img v-if="item.image" :src="item.image" :alt="item.title" />
              <div v-else class="thumb-fallback"><span class="material-symbols-outlined">eco</span></div>
            </div>
            <div class="cart-info">
              <h3 class="cart-item-title">{{ item.title }}</h3>
              <p class="cart-unit">{{ formatCurrency(item.pricePerCredit, item.currency) }} / credit</p>
            </div>
            <div class="cart-qty">
              <button class="step" :disabled="item.quantity <= 1" @click="cart.setQuantity(item.listingId, item.quantity - 1)">−</button>
              <input
                type="number"
                min="1"
                :max="item.maxQuantity || undefined"
                :value="item.quantity"
                @input="cart.setQuantity(item.listingId, $event.target.value)"
              />
              <button
                class="step"
                :disabled="item.maxQuantity && item.quantity >= item.maxQuantity"
                @click="cart.setQuantity(item.listingId, item.quantity + 1)"
              >+</button>
            </div>
            <div class="cart-line-total">{{ formatCurrency(item.pricePerCredit * item.quantity, item.currency) }}</div>
            <button class="cart-remove" title="Remove" @click="cart.removeItem(item.listingId)">
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </li>
        </ul>

        <aside class="cart-summary">
          <h3>Order Summary</h3>
          <div class="summary-row">
            <span>Items</span>
            <span>{{ cart.count }}</span>
          </div>
          <div class="summary-row total">
            <span>Subtotal</span>
            <span>{{ formatCurrency(cart.subtotal, cart.currency) }}</span>
          </div>
          <p class="summary-note">
            Items are paid for one at a time; you'll be returned here to continue after each payment.
          </p>
          <button
            class="checkout-btn"
            :disabled="checkingOut || needsKyc"
            :title="needsKyc ? 'Identity verification required before checkout' : ''"
            @click="startCheckout"
          >
            {{ checkingOut ? 'Redirecting…' : 'Proceed to checkout' }}
          </button>
          <router-link v-if="needsKyc" to="/kyc" class="kyc-link">
            Verify your identity to check out →
          </router-link>
          <button class="clear-btn" @click="cart.clear()">Clear cart</button>
          <p v-if="error" class="checkout-error">{{ error }}</p>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { useRouter } from 'vue-router'
import { useCartStore } from '@/store/cartStore'
import { useUserStore } from '@/store/userStore'
import { createMarketplaceCheckout } from '@/services/paymongoService'
import { assertCanTrade } from '@/services/kycService'
import {
  CART_CHECKOUT_ACTIVE,
  CART_PENDING_LISTING,
  CART_PENDING_SESSION,
  clearCartCheckoutFlags,
} from '@/constants/cart'
import KycGateBanner from '@/components/ui/KycGateBanner.vue'
import { useTradeEligibility } from '@/composables/useTradeEligibility'

const router = useRouter()
const cart = useCartStore()
const userStore = useUserStore()
const { needsKyc, ensureLoaded: ensureKycLoaded } = useTradeEligibility()
const checkingOut = ref(false)
const error = ref('')
const resuming = ref(false)

function formatCurrency(value, currency = 'PHP') {
  const sym = currency === 'PHP' ? '₱' : `${currency} `
  return `${sym}${Number(value || 0).toLocaleString()}`
}

async function startCheckout() {
  error.value = ''
  if (!userStore.isAuthenticated) {
    router.push({ name: 'login', query: { returnTo: '/cart' } })
    return
  }
  const next = cart.items[0]
  if (!next) return

  checkingOut.value = true
  try {
    // Enforce the same KYC rule the marketplace path enforces. Checked before a
    // PayMongo session exists so a rejection never strands a paid-for order.
    await assertCanTrade()

    const result = await createMarketplaceCheckout({
      listingId: next.listingId,
      quantity: next.quantity,
    })
    const url = result?.checkoutUrl || result?.checkout_url
    if (url) {
      // The callback page needs the session id to verify the payment, and the
      // intent id to find the webhook-settled transaction (so it can issue the
      // certificate/receipt for this cart item).
      if (result.sessionId) {
        localStorage.setItem('pending_purchase_session', result.sessionId)
      }
      if (result.paymentIntentId) {
        localStorage.setItem('pending_purchase_intent', result.paymentIntentId)
      }

      // Mark a sequential checkout in progress so the payment callback can
      // clear the paid item and bring the buyer back here for the next one.
      // Written only now that a session exists to bind them to: a flag set
      // before the call is a flag that outlives a checkout which never began.
      // See constants/cart.js for what the unbound pair did on abandonment.
      localStorage.setItem(CART_CHECKOUT_ACTIVE, '1')
      localStorage.setItem(CART_PENDING_LISTING, next.listingId)
      localStorage.setItem(CART_PENDING_SESSION, result.sessionId || '')

      window.location.href = url
    } else {
      throw new Error('Could not start checkout.')
    }
  } catch (err) {
    clearCartCheckoutFlags()
    error.value = err?.message || 'Checkout failed. Please try again.'
    checkingOut.value = false
  }
}

onMounted(() => {
  // Resolve KYC state up front so the checkout button reflects it immediately
  // rather than flipping to disabled after the buyer has already clicked.
  ensureKycLoaded()

  // Returning mid-sequence (callback cleared the paid item and sent us back).
  if (localStorage.getItem(CART_CHECKOUT_ACTIVE) === '1') {
    if (cart.items.length > 0) {
      resuming.value = true
    } else {
      clearCartCheckoutFlags()
    }
  }
})
</script>

<style scoped>
.cart-view {
  min-height: 100vh;
  padding: 0 0 4rem;
  background: var(--bg-secondary, #f8fdf8);
}
.container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 1.5rem 1rem 0;
}

.resume-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #eff6ff;
  color: #1d4ed8;
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  font-size: 0.875rem;
  margin-bottom: 1.25rem;
}
.state-card {
  padding: 2rem;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  color: #6b7280;
  text-align: center;
}
.browse-link {
  display: inline-block;
  margin-top: 0.75rem;
  color: #058526;
  font-weight: 600;
  text-decoration: none;
}
.cart-layout {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 1.5rem;
  align-items: start;
}
.cart-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.cart-item {
  display: grid;
  grid-template-columns: 64px 1fr auto auto auto;
  align-items: center;
  gap: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 0.75rem;
  background: #fff;
}
.cart-thumb {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  background: #f3f4f6;
}
.cart-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #9ca3af;
}
.cart-item-title {
  font-size: 1rem;
  margin: 0 0 0.2rem;
}
.cart-unit {
  color: #6b7280;
  font-size: 0.8rem;
  margin: 0;
}
.cart-qty {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.cart-qty .step {
  width: 28px;
  height: 28px;
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
}
.cart-qty .step:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.cart-qty input {
  width: 56px;
  text-align: center;
  padding: 0.35rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font: inherit;
}
.cart-line-total {
  font-weight: 700;
  min-width: 90px;
  text-align: right;
}
.cart-remove {
  border: none;
  background: none;
  color: #9ca3af;
  cursor: pointer;
}
.cart-remove:hover {
  color: #ef4444;
}
.cart-summary {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.25rem;
  background: #fff;
  position: sticky;
  top: 1rem;
}
.cart-summary h3 {
  margin: 0 0 1rem;
}
.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.9rem;
}
.summary-row.total {
  font-weight: 700;
  font-size: 1.05rem;
  border-top: 1px solid #eef0f2;
  padding-top: 0.5rem;
  margin-top: 0.5rem;
}
.summary-note {
  color: #9ca3af;
  font-size: 0.75rem;
  margin: 0.75rem 0;
}
.checkout-btn {
  width: 100%;
  padding: 0.75rem;
  border: none;
  border-radius: 8px;
  background: #058526;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
.checkout-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.kyc-link {
  display: block;
  margin-top: 0.6rem;
  text-align: center;
  font-size: 0.825rem;
  font-weight: 600;
  color: #b45309;
  text-decoration: none;
}
.kyc-link:hover {
  text-decoration: underline;
}
.clear-btn {
  width: 100%;
  margin-top: 0.5rem;
  padding: 0.6rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
  color: #6b7280;
  cursor: pointer;
}
.checkout-error {
  color: #dc2626;
  font-size: 0.85rem;
  margin-top: 0.75rem;
}
@media (max-width: 760px) {
  .cart-layout {
    grid-template-columns: 1fr;
  }

  /* Two rows, placed explicitly.
   *
   * The row had five children fed into three columns, so the browser
   * auto-placed them: thumbnail, title and stepper on line one, then the total
   * and the remove button orphaned on line two under the title. Nothing lined
   * up with anything, and the price — the number you are actually checking —
   * ended up in the middle of the card.
   *
   * Now:  [ thumb ][ name .......... ]
   *       [ price ][ − n + ][ × ]
   *
   * Every child is positioned by hand rather than left to auto-placement,
   * which is what let the previous layout drift as soon as one element wrapped. */
  .cart-item {
    grid-template-columns: 44px 1fr auto auto;
    column-gap: 0.6rem;
    row-gap: 0.6rem;
    padding: 0.7rem;
  }

  .cart-thumb {
    grid-column: 1;
    grid-row: 1;
    width: 44px;
    height: 44px;
  }

  .cart-info {
    grid-column: 2 / -1;
    grid-row: 1;
    min-width: 0;
  }

  .cart-item-title {
    font-size: 0.92rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  /* Bottom-left, and left-aligned — it is the anchor of the second row. */
  .cart-line-total {
    grid-column: 1 / 3;
    grid-row: 2;
    min-width: 0;
    text-align: left;
    align-self: center;
    font-size: 1rem;
  }

  .cart-qty {
    grid-column: 3;
    grid-row: 2;
  }

  .cart-remove {
    grid-column: 4;
    grid-row: 2;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* 32px, not 28px: these sit next to each other and are the two easiest
     controls in the app to mis-tap. The number field shrinks to pay for it. */
  .cart-qty .step {
    width: 32px;
    height: 32px;
  }

  /* Wide enough for five digits. At 44px a realistic bulk quantity (12,000
     credits) rendered as "120(" — the buyer could not read the number they were
     about to pay for. The total beside it carries `min-width: 0`, so this
     column takes the space it needs and the price ellipsises instead. */
  .cart-qty input {
    width: 54px;
    padding: 0.3rem 0.15rem;
    font-size: 0.85rem;
  }

  /* Drop the native number spinners on the phone layout. They consume ~15px
     inside the field — which is what still clipped "12000" to "1200" at 320px
     even after widening it — and they are redundant here: the − and + buttons
     either side of the field do the same job with a far bigger tap target. */
  .cart-qty input[type='number'] {
    appearance: textfield;
    -moz-appearance: textfield;
  }

  .cart-qty input[type='number']::-webkit-outer-spin-button,
  .cart-qty input[type='number']::-webkit-inner-spin-button {
    appearance: none;
    margin: 0;
  }
}
</style>
