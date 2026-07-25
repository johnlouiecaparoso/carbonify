<template>
  <div class="buy-credits-page">
    <!-- Page Header -->
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">Buy Carbon Credits</h1>
        <p class="page-description">
          Purchase verified carbon credits to offset your emissions and support environmental
          projects
        </p>
      </div>
    </div>

    <!-- Main Content -->
    <div class="buy-content">
      <div class="container">
        <div class="content-layout">
          <!-- Credits Marketplace -->
          <div class="marketplace-section">
            <div class="section-header">
              <h2 class="section-title">Available Credits</h2>
              <div class="filters">
                <select v-model="selectedCategory" class="filter-select">
                  <option value="">All Categories</option>
                  <option value="forestry">Forestry</option>
                  <option value="renewable">Renewable Energy</option>
                  <option value="blue-carbon">Blue Carbon</option>
                  <option value="agriculture">Agriculture</option>
                </select>
                <select v-model="sortBy" class="filter-select">
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                  <option value="newest">Newest First</option>
                  <option value="popular">Most Popular</option>
                </select>
              </div>
            </div>

            <!-- Loading State -->
            <div v-if="loading" class="loading-state">
              <div class="loading-spinner"></div>
              <p>Loading available credits...</p>
            </div>

            <!-- Error State -->
            <div v-else-if="error" class="error-state">
              <div class="error-icon"><span class="material-symbols-outlined">warning</span></div>
              <h3>Unable to load credits</h3>
              <p>{{ error }}</p>
              <button @click="loadCredits" class="retry-button">Try Again</button>
            </div>

            <!-- Empty State -->
            <div v-else-if="credits.length === 0" class="empty-state">
              <div class="empty-icon"><span class="material-symbols-outlined">eco</span></div>
              <h3>No credits available</h3>
              <p>Check back later for new carbon credit listings</p>
            </div>

            <!-- Credits Grid -->
            <div v-else class="credits-grid">
              <div
                v-for="credit in filteredCredits"
                :key="credit.id"
                class="credit-card"
                @click="selectCredit(credit)"
              >
                <div class="credit-image">
                  <div class="image-placeholder">
                    {{ credit.category.charAt(0).toUpperCase() }}
                  </div>
                </div>
                <div class="credit-content">
                  <h3 class="credit-title">{{ credit.title }}</h3>
                  <p class="credit-location">{{ credit.location }}</p>
                  <p class="credit-description">{{ credit.description }}</p>
                  <div class="credit-meta">
                    <span class="credit-category">{{ credit.category }}</span>
                    <span class="credit-credits">{{ credit.availableCredits }} credits</span>
                  </div>
                  <div class="credit-price">
                    <span class="price-label">Price per credit:</span>
                    <span class="price-value">${{ credit.pricePerCredit }}</span>
                  </div>
                </div>
                <div class="credit-actions">
                  <button class="buy-button" @click.stop="buyCredits(credit)">Buy Credits</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Purchase Summary -->
          <div class="summary-sidebar">
            <div class="summary-card">
              <h3 class="summary-title">Purchase Summary</h3>
              <div v-if="selectedCredit" class="selected-credit">
                <h4>{{ selectedCredit.title }}</h4>
                <p>{{ selectedCredit.location }}</p>
                <div class="purchase-form">
                  <label class="form-label">Quantity</label>
                  <input
                    v-model.number="purchaseQuantity"
                    type="number"
                    min="1"
                    :max="selectedCredit.availableCredits"
                    class="quantity-input"
                  />
                  <div class="price-breakdown">
                    <div class="price-line">
                      <span>Credits ({{ purchaseQuantity }})</span>
                      <span
                        >${{ (selectedCredit.pricePerCredit * purchaseQuantity).toFixed(2) }}</span
                      >
                    </div>
                    <div class="price-line">
                      <span>Processing Fee</span>
                      <span>${{ processingFee.toFixed(2) }}</span>
                    </div>
                    <div class="price-line total">
                      <span>Total</span>
                      <span>${{ totalPrice.toFixed(2) }}</span>
                    </div>
                  </div>

                  <!-- Payment Method Selection -->
                  <div class="payment-method-selection">
                    <label class="form-label">Payment Method</label>
                    <div class="payment-methods">
                      <div
                        v-for="method in paymentMethods"
                        :key="method.value"
                        :class="['payment-method-card', { active: selectedPaymentMethod === method.value }]"
                        @click="selectedPaymentMethod = method.value"
                      >
                        <div class="payment-method-icon material-symbols-outlined">{{ method.icon }}</div>
                        <div class="payment-method-info">
                          <div class="payment-method-name">{{ method.label }}</div>
                          <div v-if="method.value === 'wallet'" class="wallet-balance">
                            Balance: ${{ walletBalance.toFixed(2) }}
                          </div>
                          <div v-else class="payment-method-desc">{{ method.description }}</div>
                        </div>
                        <div v-if="method.value === 'wallet' && walletBalance < totalPrice" class="insufficient-balance">
                          Insufficient funds
                        </div>
                      </div>
                    </div>
                    <div v-if="selectedPaymentMethod === 'wallet' && walletBalance < totalPrice" class="error-message">
                      <span class="material-symbols-outlined inline-ico" aria-hidden="true">warning</span>
                      Your wallet balance (₱{{ walletBalance.toFixed(2) }}) is insufficient for this purchase (₱{{ totalPrice.toFixed(2) }})
                    </div>
                  </div>

                  <button
                    class="purchase-button"
                    :disabled="selectedPaymentMethod === 'wallet' && walletBalance < totalPrice"
                    @click="processPurchase"
                  >
                    Complete Purchase
                  </button>
                </div>
              </div>
              <div v-else class="no-selection">
                <p>Select a credit project to see purchase details</p>
              </div>
            </div>

            <!-- Payment Methods -->
            <div class="payment-methods-card">
              <h3 class="payment-title">Payment Methods</h3>
              <div class="payment-options">
                <div class="payment-option">
                  <div class="payment-icon material-symbols-outlined">smartphone</div>
                  <div class="payment-info">
                    <h4>GCash</h4>
                    <p>2% processing fee</p>
                  </div>
                </div>
                <div class="payment-option">
                  <div class="payment-icon material-symbols-outlined">account_balance</div>
                  <div class="payment-info">
                    <h4>Maya</h4>
                    <p>2.5% processing fee</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Help Section -->
            <div class="help-card">
              <h3 class="help-title">Need Help?</h3>
              <p class="help-text">
                Contact our support team for assistance with purchasing credits or payment issues.
              </p>
              <button class="help-button">Contact Support</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useUserStore } from '@/store/userStore'

const userStore = useUserStore()

// Data
const credits = ref([])
const selectedCredit = ref(null)
const purchaseQuantity = ref(1)
const selectedCategory = ref('')
const sortBy = ref('price-low')
const loading = ref(false)
const error = ref('')
const selectedPaymentMethod = ref('wallet') // Default to wallet
const walletBalance = ref(0)

// Payment methods
const paymentMethods = [
  {
    value: 'wallet',
    label: 'Wallet Balance',
    icon: 'account_balance_wallet',
    description: 'Pay from your wallet',
  },
  {
    value: 'gcash',
    label: 'GCash',
    icon: 'smartphone',
    description: 'Pay via GCash (PayMongo)',
  },
  {
    value: 'maya',
    label: 'Maya',
    icon: 'account_balance',
    description: 'Pay via Maya (PayMongo)',
  },
]

// Computed properties
const filteredCredits = computed(() => {
  let filtered = [...credits.value]

  // Filter by category
  if (selectedCategory.value) {
    filtered = filtered.filter(
      (credit) => credit.category.toLowerCase() === selectedCategory.value.toLowerCase(),
    )
  }

  // Sort
  switch (sortBy.value) {
    case 'price-low':
      filtered.sort((a, b) => a.pricePerCredit - b.pricePerCredit)
      break
    case 'price-high':
      filtered.sort((a, b) => b.pricePerCredit - a.pricePerCredit)
      break
    case 'newest':
      filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      break
    case 'popular':
      filtered.sort((a, b) => b.purchases - a.purchases)
      break
  }

  return filtered
})

const processingFee = computed(() => {
  if (!selectedCredit.value) return 0
  const subtotal = selectedCredit.value.pricePerCredit * purchaseQuantity.value
  return subtotal * 0.02 // 2% processing fee
})

const totalPrice = computed(() => {
  if (!selectedCredit.value) return 0
  const subtotal = selectedCredit.value.pricePerCredit * purchaseQuantity.value
  return subtotal + processingFee.value
})

// Methods
const loadCredits = async () => {
  loading.value = true
  error.value = ''

  try {
    // Import real marketplace service
    const { getMarketplaceListings } = await import('@/services/marketplaceService')

    // Fetch real data from Supabase
    const listings = await getMarketplaceListings()

    // Transform data for UI
    credits.value = listings.map((listing) => ({
      id: listing.id,
      title: listing.project_title,
      location: listing.location,
      description: listing.project_description,
      category: listing.category,
      pricePerCredit: listing.price_per_credit,
      availableCredits: listing.quantity,
      createdAt: listing.created_at,
      purchases: 0, // This would come from analytics
    }))
  } catch (err) {
    error.value = 'Failed to load credits. Please try again.'
    console.error('Error loading credits:', err)
  } finally {
    loading.value = false
  }
}

const selectCredit = async (credit) => {
  selectedCredit.value = credit
  purchaseQuantity.value = 1
  
  // Load wallet balance when credit is selected
  if (userStore.isAuthenticated) {
    try {
      const { getWalletBalance } = await import('@/services/walletService')
      const balance = await getWalletBalance()
      walletBalance.value = balance.current_balance || 0
    } catch (err) {
      console.error('Failed to load wallet balance:', err)
      walletBalance.value = 0
    }
  }
}

const buyCredits = (credit) => {
  selectCredit(credit)
  // Scroll to summary section
  document.querySelector('.summary-sidebar')?.scrollIntoView({ behavior: 'smooth' })
}

const processPurchase = async () => {
  if (!selectedCredit.value || !userStore.isAuthenticated) {
    alert('Please log in to purchase credits')
    return
  }

  try {
    // Import real purchase service
    const { purchaseCredits } = await import('@/services/marketplaceService')

    // Create purchase data
    const purchaseData = {
      quantity: purchaseQuantity.value,
      paymentMethod: selectedPaymentMethod.value, // Use selected payment method
      paymentData: {
        userId: userStore.session.user.id,
        amount: totalPrice.value,
        currency: 'PHP',
        description: `Purchase of ${purchaseQuantity.value} credits for ${selectedCredit.value.title}`,
        gcashNumber: '09171234567', // This would come from user input
      },
    }

    // Process real purchase
    const result = await purchaseCredits(selectedCredit.value.id, purchaseData)

    if (result.success) {
      alert(
        `Purchase Successful!\n\n` +
          `Credits: ${purchaseQuantity.value}\n` +
          `Project: ${selectedCredit.value.title}\n` +
          `Total: $${totalPrice.value.toFixed(2)}\n\n` +
          `Your carbon credits have been added to your portfolio!`,
      )

      // Reset selection
      selectedCredit.value = null
      purchaseQuantity.value = 1

      // Reload credits to update availability
      await loadCredits()
    } else {
      throw new Error(result.error || 'Purchase failed')
    }
  } catch (err) {
    console.error('Purchase error:', err)
    alert(`Purchase failed: ${err.message || 'Please try again.'}`)
  }
}

// Lifecycle
onMounted(async () => {
  loadCredits()
  
  // Load wallet balance if authenticated
  if (userStore.isAuthenticated) {
    try {
      const { getWalletBalance } = await import('@/services/walletService')
      const balance = await getWalletBalance()
      walletBalance.value = balance.current_balance || 0
    } catch (err) {
      console.error('Failed to load wallet balance:', err)
      walletBalance.value = 0
    }
  }

  // Check if we came from marketplace with a pre-selected project
  const urlParams = new URLSearchParams(window.location.search)
  const projectId = urlParams.get('project')
  const listingId = urlParams.get('listing')
  const title = urlParams.get('title')
  const price = urlParams.get('price')
  const currency = urlParams.get('currency')

  if (projectId && title && price) {
    // Pre-select the project from marketplace
    const preSelectedCredit = {
      id: listingId || projectId,
      title: title,
      pricePerCredit: parseFloat(price),
      currency: currency || 'PHP',
      availableCredits: 1000, // Default value
      category: 'Pre-selected',
      location: 'From Marketplace',
      description: `Pre-selected project: ${title}`,
      createdAt: new Date().toISOString(),
      purchases: 0,
    }

    // Add to credits list and select it
    credits.value.unshift(preSelectedCredit)
    selectCredit(preSelectedCredit)

    // Scroll to summary section
    setTimeout(() => {
      document.querySelector('.summary-sidebar')?.scrollIntoView({ behavior: 'smooth' })
    }, 500)
  }
})
</script>

<style scoped>
.buy-credits-page {
  min-height: 100vh;
  background: var(--bg-primary, #ffffff);
}

.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 2rem;
}

/* Page Header */
.page-header {
  padding: 1.25rem 0;
  border-bottom: none;
  background: var(--primary-color, #058526);
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
  line-height: 1.6;
}

/* Main Content */
.buy-content {
  padding: 2rem 0;
}

.content-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 2rem;
}

/* Marketplace Section */
.marketplace-section {
  background: var(--bg-primary, #ffffff);
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.section-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  margin: 0;
}

.filters {
  display: flex;
  gap: 1rem;
}

.filter-select {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 0.5rem;
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #1a202c);
  font-size: 0.875rem;
}

/* Credits Grid */
.credits-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
}

.credit-card {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 0.75rem;
  overflow: hidden;
  background: var(--bg-primary, #ffffff);
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.credit-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  border-color: var(--primary-color, #058526);
}

.credit-image {
  height: 120px;
  background: linear-gradient(135deg, var(--primary-color, #058526), var(--primary-hover, #04701f));
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-placeholder {
  width: 60px;
  height: 60px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: bold;
  color: white;
}

.credit-content {
  padding: 1rem;
}

.credit-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  margin: 0 0 0.25rem 0;
}

.credit-location {
  font-size: 0.875rem;
  color: var(--text-muted, #64748b);
  margin: 0 0 0.5rem 0;
}

.credit-description {
  font-size: 0.875rem;
  color: var(--text-secondary, #4a5568);
  margin: 0 0 1rem 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.credit-meta {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.credit-category {
  background: var(--primary-light, rgba(5, 133, 38, 0.1));
  color: var(--primary-color, #058526);
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
}

.credit-credits {
  font-size: 0.875rem;
  color: var(--text-secondary, #4a5568);
  font-weight: 500;
}

.credit-price {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.price-label {
  font-size: 0.875rem;
  color: var(--text-muted, #64748b);
}

.price-value {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--primary-color, #058526);
}

.credit-actions {
  padding: 0 1rem 1rem 1rem;
}

.buy-button {
  width: 100%;
  background: var(--primary-color, #058526);
  color: white;
  border: none;
  border-radius: 0.5rem;
  padding: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.buy-button:hover {
  background: var(--primary-hover, #04701f);
  transform: translateY(-1px);
}

/* Summary Sidebar */
.summary-sidebar {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.summary-card,
.payment-methods-card,
.help-card {
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.summary-title,
.payment-title,
.help-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  margin: 0 0 1rem 0;
}

.selected-credit h4 {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  margin: 0 0 0.25rem 0;
}

.selected-credit p {
  font-size: 0.875rem;
  color: var(--text-muted, #64748b);
  margin: 0 0 1rem 0;
}

.purchase-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.form-label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-primary, #1a202c);
}

.quantity-input {
  padding: 0.75rem;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 0.5rem;
  background: var(--bg-primary, #ffffff);
  color: var(--text-primary, #1a202c);
  font-size: 1rem;
}

.price-breakdown {
  border-top: 1px solid var(--border-color, #e2e8f0);
  padding-top: 1rem;
}

.price-line {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.price-line.total {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text-primary, #1a202c);
  border-top: 1px solid var(--border-color, #e2e8f0);
  padding-top: 0.5rem;
  margin-top: 0.5rem;
}

.purchase-button {
  background: var(--primary-color, #058526);
  color: white;
  border: none;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.purchase-button:hover {
  background: var(--primary-hover, #04701f);
  transform: translateY(-1px);
}

.purchase-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.no-selection {
  text-align: center;
  color: var(--text-muted, #64748b);
  padding: 2rem 0;
}

/* Payment Method Selection */
.payment-method-selection {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.payment-methods {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.payment-method-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 2px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-primary, #ffffff);
}

.payment-method-card:hover {
  border-color: var(--primary-color, #058526);
  background: var(--bg-secondary, #f8fdf8);
}

.payment-method-card.active {
  border-color: var(--primary-color, #058526);
  background: var(--primary-light, rgba(5, 133, 38, 0.1));
}

.payment-method-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.payment-method-info {
  flex: 1;
}

.payment-method-name {
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  margin-bottom: 0.25rem;
}

.payment-method-desc {
  font-size: 0.875rem;
  color: var(--text-muted, #64748b);
}

.wallet-balance {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary-color, #058526);
}

.insufficient-balance {
  font-size: 0.75rem;
  color: #dc2626;
  font-weight: 500;
}

.error-message {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: rgba(220, 38, 38, 0.1);
  border: 1px solid #dc2626;
  border-radius: 6px;
  color: #dc2626;
  font-size: 0.875rem;
}

/* Payment Methods */
.payment-options {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.payment-option {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-secondary, #f8fdf8);
  border-radius: 0.5rem;
  border: 1px solid var(--border-color, #e2e8f0);
}

.payment-icon {
  font-size: 1.5rem;
}

.inline-ico {
  font-size: 1.1em;
  vertical-align: middle;
  margin-right: 0.25rem;
}

.payment-info h4 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  margin: 0 0 0.25rem 0;
}

.payment-info p {
  font-size: 0.875rem;
  color: var(--text-muted, #64748b);
  margin: 0;
}

/* Help Section */
.help-text {
  color: var(--text-secondary, #4a5568);
  margin-bottom: 1rem;
  line-height: 1.5;
}

.help-button {
  background: var(--primary-color, #058526);
  color: white;
  border: none;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.help-button:hover {
  background: var(--primary-hover, #04701f);
  transform: translateY(-1px);
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
  font-size: 3rem;
  margin-bottom: 1rem;
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

.retry-button {
  background: var(--primary-color, #058526);
  color: white;
  border: none;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.retry-button:hover {
  background: var(--primary-hover, #04701f);
}

/* Responsive Design */
@media (max-width: 1024px) {
  .content-layout {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}

@media (max-width: 768px) {
  .container {
    padding: 0 1rem;
  }





  .buy-content {
    padding: 1.5rem 0;
  }

  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .filters {
    width: 100%;
    flex-direction: column;
  }

  .filter-select {
    width: 100%;
  }

  .credits-grid {
    grid-template-columns: 1fr;
  }
}
</style>
