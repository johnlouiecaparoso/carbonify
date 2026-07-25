<template>
  <div class="marketplace">
    <!-- Header Section -->
    <div class="marketplace-header">
      <div class="container">
        <h1 class="page-title">Carbon Credit Marketplace</h1>
        <p class="page-description">
          Discover and purchase verified carbon credits from projects worldwide
        </p>

        <!-- Search and Action Controls -->
        <div class="search-controls">
          <div class="search-input-wrap">
            <span class="material-symbols-outlined search-icon" aria-hidden="true">search</span>
            <input
              v-model="searchQuery"
              type="search"
              class="search-input"
              placeholder="Search projects"
              aria-label="Search projects"
            />
          </div>
          <select v-model="selectedCategory" class="filter-select" aria-label="Filter by category">
            <option value="">All Categories</option>
            <option v-for="category in categoryOptions" :key="category" :value="category">
              {{ category }}
            </option>
          </select>
          <select v-model="selectedSource" class="filter-select" aria-label="Filter by credit source">
            <option value="all">All Sources</option>
            <option value="local">Local</option>
            <option value="supplier">Registry</option>
          </select>
          <select v-model="selectedSdg" class="filter-select" aria-label="Filter by Sustainable Development Goal">
            <option value="">All SDGs</option>
            <option v-for="tag in SDG_TAGS" :key="tag" :value="tag">{{ tag }}</option>
          </select>
          <select
            v-model="availabilityFilter"
            class="filter-select"
            aria-label="Filter by availability"
          >
            <option value="all">All Availability</option>
            <option value="available">Available</option>
            <option value="unavailable">Not Available</option>
          </select>
          <select v-model="sortBy" class="filter-select" aria-label="Sort listings">
            <option value="name">Name (A-Z)</option>
            <option value="price-low">Cheapest to Expensive</option>
            <option value="price-high">Expensive to Cheapest</option>
          </select>
          <button
            type="button"
            class="save-search-button"
            :disabled="savingSearch"
            title="Save this search and get a bell alert when a new matching listing appears"
            @click="handleSaveSearch"
          >
            <span class="material-symbols-outlined" aria-hidden="true">bookmark_add</span>
            <span>{{ savingSearch ? 'Saving…' : 'Save search' }}</span>
          </button>
          <button
            v-if="userStore.isProjectDeveloper"
            @click="navigateToSubmitProject"
            class="submit-project-button"
          >
            <span class="material-symbols-outlined" aria-hidden="true">note_add</span>
            <span>Submit Project</span>
          </button>
        </div>

        <!-- Saved searches / price alerts -->
        <div v-if="savedSearches.length" class="saved-searches">
          <span class="saved-searches-label">
            <span class="material-symbols-outlined" aria-hidden="true">notifications_active</span>
            Saved searches
          </span>
          <span v-for="s in savedSearches" :key="s.id" class="saved-chip">
            <button type="button" class="saved-chip-apply" @click="applySavedSearch(s)">
              {{ s.label }}
            </button>
            <button
              type="button"
              class="saved-chip-remove"
              aria-label="Delete saved search"
              @click="handleDeleteSavedSearch(s.id)"
            >
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </span>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="marketplace-content">
      <div class="container">
        <!-- KYC gate surfaced before the buyer invests effort in a purchase -->
        <KycGateBanner />

        <!-- Carried over from the carbon calculator -->
        <div v-if="offsetTarget > 0" class="offset-target-banner">
          <span class="material-symbols-outlined" aria-hidden="true">calculate</span>
          <span>
            Offsetting <strong>{{ formatNumber(offsetTarget) }} tCO₂e</strong> — purchase quantities
            are pre-filled to match. Split across projects if one listing isn't enough.
          </span>
        </div>

        <div class="content-layout">
          <!-- Projects Content -->
          <div class="projects-content">
            <!-- Results Header -->
            <div class="results-header">
              <div class="results-info">
                <span class="results-count">
                  Showing {{ filteredListings.length }} credit listings
                </span>
              </div>
              <div class="view-controls">
                <button
                  @click="viewMode = 'grid'"
                  :class="{ active: viewMode === 'grid' }"
                  class="view-toggle"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">grid_view</span>
                  <span class="view-toggle-label">Grid</span>
                </button>
                <button
                  @click="viewMode = 'list'"
                  :class="{ active: viewMode === 'list' }"
                  class="view-toggle"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">view_list</span>
                  <span class="view-toggle-label">List</span>
                </button>
              </div>
            </div>

            <!-- Loading State -->
            <div v-if="loading" class="loading-state">
              <div class="loading-spinner"></div>
              <p>Loading marketplace listings...</p>
              <div class="loading-skeleton">
                <div class="skeleton-card" v-for="n in 6" :key="n">
                  <div class="skeleton-image"></div>
                  <div class="skeleton-content">
                    <div class="skeleton-title"></div>
                    <div class="skeleton-text"></div>
                    <div class="skeleton-text short"></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Error State -->
            <div v-else-if="errorMessage" class="error-state">
              <div class="error-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M12 3.25 3.75 19.5h16.5L12 3.25Z" stroke-linejoin="round" />
                  <path d="M12 9v4.5" stroke-linecap="round" />
                  <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <h3>Error Loading Marketplace</h3>
              <p>{{ errorMessage }}</p>
              <button @click="loadMarketplaceData" class="retry-button">Try Again</button>
            </div>

            <!-- Projects Grid/List -->
            <div v-else-if="filteredListings.length > 0" class="projects-container">
              <!-- Grid View -->
              <div v-if="viewMode === 'grid'" class="projects-grid">
                <div
                  v-for="listing in paginatedListings"
                  :key="listing.listing_id"
                  class="project-grid-card"
                  :class="{ 'is-sold-out': isSoldOut(listing) }"
                  @click="viewProject(listing)"
                >
                  <div v-if="isSoldOut(listing)" class="sold-out-badge">Not available</div>
                  <WatchButton
                    class="grid-watch"
                    :watched="isWatched(listing)"
                    @toggle="toggleWatch(listing)"
                  />
                  <div class="project-grid-image">
                    <img
                      v-if="listing.project_image"
                      :src="listing.project_image"
                      :alt="listing.project_title"
                    />
                    <img
                      v-else
                      :src="`https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=250&fit=crop&${listing.listing_id}`"
                      :alt="listing.project_title"
                    />
                  </div>
                  <div class="project-grid-content">
                    <div class="project-grid-titlerow">
                      <h3 class="project-grid-title">{{ listing.project_title }}</h3>
                      <span class="source-badge" :class="listing.source === 'supplier' ? 'supplier' : 'local'">
                        {{ listing.source === 'supplier' ? 'Registry' : 'Local' }}
                      </span>
                    </div>
                    <p class="project-grid-description">{{ listing.project_description }}</p>
                    <router-link
                      :to="`/projects/${listing.project_id}`"
                      class="details-link"
                      @click.stop
                    >
                      View project details →
                    </router-link>
                    <div class="project-grid-meta">
                      <span class="material-symbols-outlined location-icon" aria-hidden="true"
                        >location_on</span
                      >
                      <span>{{ listing.location }}</span>
                    </div>
                    <div
                      v-if="listing.feasibility_score || listing.social_impact_score || listing.climate_risk_rating"
                      class="project-grid-scores"
                    >
                      <span v-if="listing.feasibility_score" class="score-badge feasibility">
                        Feasibility {{ listing.feasibility_score }}/5
                      </span>
                      <span v-if="listing.social_impact_score" class="score-badge impact">
                        Impact {{ listing.social_impact_score }}/5
                      </span>
                      <span
                        v-if="listing.climate_risk_rating"
                        class="score-badge risk"
                        :class="listing.climate_risk_rating"
                      >
                        {{ listing.climate_risk_rating }} risk
                      </span>
                    </div>
                    <div class="project-grid-pricing">
                      <div class="price">
                        {{ formatCurrency(listing.price_per_credit, listing.currency) }}
                      </div>
                      <div class="quantity">
                        <span v-if="isSoldOut(listing)" class="sold-out-label"
                          >All credits have been bought</span
                        >
                        <span v-else>{{ formatNumber(listing.available_quantity) }} credits left</span>
                      </div>
                    </div>
                    <div class="project-grid-actions" @click.stop>
                      <UiButton
                        v-if="isSoldOut(listing)"
                        variant="secondary"
                        size="sm"
                        disabled
                        class="sold-out-button"
                      >
                        Not available
                      </UiButton>
                      <UiButton
                        v-else
                        variant="primary"
                        size="sm"
                        @click.stop="openPurchaseModal(listing)"
                      >
                        Purchase
                      </UiButton>
                      <UiButton
                        v-if="!isSoldOut(listing)"
                        variant="outline"
                        size="sm"
                        :title="inCart(listing) ? 'In cart' : 'Add to cart'"
                        @click.stop="addListingToCart(listing)"
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">
                          {{ inCart(listing) ? 'shopping_cart_checkout' : 'add_shopping_cart' }}
                        </span>
                      </UiButton>
                      <UiButton
                        v-if="isUserAdmin"
                        variant="danger"
                        size="sm"
                        @click.stop.prevent="adminDeleteListing(listing)"
                        @mousedown.stop
                        style="
                          margin-left: 0.5rem;
                          z-index: 10;
                          position: relative;
                          cursor: pointer;
                        "
                        :title="`Delete project: ${listing.project_title}`"
                      >
                        <span class="material-symbols-outlined" aria-hidden="true"
                          >delete_forever</span
                        >
                        <span>Delete</span>
                      </UiButton>
                    </div>
                  </div>
                </div>
              </div>

              <!-- List View -->
              <div v-else class="projects-list">
                <div
                  v-for="listing in paginatedListings"
                  :key="listing.listing_id"
                  class="project-list-item"
                  :class="{ 'is-sold-out': isSoldOut(listing) }"
                  @click="viewProject(listing)"
                >
                  <div v-if="isSoldOut(listing)" class="sold-out-badge list-badge">Not available</div>
                  <div class="project-image">
                    <img
                      v-if="listing.project_image"
                      :src="listing.project_image"
                      :alt="listing.project_title"
                    />
                    <img
                      v-else
                      :src="`https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=400&h=250&fit=crop&${listing.listing_id}`"
                      :alt="listing.project_title"
                    />
                  </div>
                  <div class="project-info">
                    <h3 class="project-title">{{ listing.project_title }}</h3>
                    <p class="project-description">{{ listing.project_description }}</p>
                    <div class="project-meta">
                      <div class="meta-item">
                        <span class="material-symbols-outlined" aria-hidden="true"
                          >location_on</span
                        >
                        <span class="meta-text">{{ listing.location }}</span>
                      </div>
                      <div class="meta-item">
                        <span class="material-symbols-outlined" aria-hidden="true">category</span>
                        <span class="meta-text">{{ listing.category }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="project-pricing">
                    <div class="price">
                      {{ formatCurrency(listing.price_per_credit, listing.currency) }}
                    </div>
                    <div class="quantity">
                      <span v-if="isSoldOut(listing)" class="sold-out-label"
                        >All credits have been bought</span
                      >
                      <span v-else>{{ formatNumber(listing.available_quantity) }} credits left</span>
                    </div>
                    <div class="project-actions-buttons" @click.stop>
                      <WatchButton
                        :watched="isWatched(listing)"
                        @toggle="toggleWatch(listing)"
                      />
                      <UiButton
                        v-if="isSoldOut(listing)"
                        variant="secondary"
                        size="sm"
                        disabled
                        class="sold-out-button"
                      >
                        Not available
                      </UiButton>
                      <UiButton
                        v-else
                        variant="primary"
                        size="sm"
                        @click.stop="openPurchaseModal(listing)"
                      >
                        Purchase
                      </UiButton>
                      <UiButton
                        v-if="!isSoldOut(listing)"
                        variant="outline"
                        size="sm"
                        :title="inCart(listing) ? 'In cart' : 'Add to cart'"
                        @click.stop="addListingToCart(listing)"
                      >
                        <span class="material-symbols-outlined" aria-hidden="true">
                          {{ inCart(listing) ? 'shopping_cart_checkout' : 'add_shopping_cart' }}
                        </span>
                      </UiButton>
                      <UiButton
                        v-if="isUserAdmin"
                        variant="danger"
                        size="sm"
                        @click.stop.prevent="adminDeleteListing(listing)"
                        @mousedown.stop
                        style="
                          margin-left: 0.5rem;
                          z-index: 10;
                          position: relative;
                          cursor: pointer;
                        "
                        :title="`Delete project: ${listing.project_title}`"
                      >
                        <span class="material-symbols-outlined" aria-hidden="true"
                          >delete_forever</span
                        >
                        <span>Delete</span>
                      </UiButton>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Pagination -->
              <Pagination
                v-if="totalPages > 1"
                :current-page="currentPage"
                :total-pages="totalPages"
                :total-items="filteredListings.length"
                :items-per-page="itemsPerPage"
                @update:current-page="currentPage = $event"
              />
            </div>

            <!-- Empty State -->
            <div v-else class="empty-state">
              <div class="empty-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M12 3.25 3.75 19.5h16.5L12 3.25Z" stroke-linejoin="round" />
                  <path d="M12 9v4.5" stroke-linecap="round" />
                  <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
                </svg>
              </div>
              <h3>No projects found</h3>
              <p>Try adjusting your search criteria or filters</p>
              <button @click="clearFilters" class="clear-filters-button">Clear Filters</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Purchase Modal -->
    <AccessibleModal
      v-if="showPurchaseModal"
      :is-open="showPurchaseModal"
      title="Purchase Carbon Credits"
      :description="`Purchase credits from ${selectedListing?.project_title}`"
      @close="closePurchaseModal"
    >
      <div class="purchase-modal-content">
        <div class="project-summary">
          <h4>{{ selectedListing?.project_title }}</h4>
          <p>{{ selectedListing?.project_description }}</p>
          <div class="project-details">
            <div class="modal-meta">
              <div class="meta-item">
                <span class="material-symbols-outlined" aria-hidden="true">location_on</span>
                <span>{{ selectedListing?.location }}</span>
              </div>
              <div class="meta-item">
                <span class="material-symbols-outlined" aria-hidden="true">label</span>
                <span>{{ selectedListing?.category }}</span>
              </div>
              <div class="meta-item">
                <span class="material-symbols-outlined" aria-hidden="true">verified</span>
                <span class="source-badge" :class="selectedListing?.source === 'supplier' ? 'supplier' : 'local'">
                  {{ selectedListing?.source === 'supplier' ? 'Registry-backed' : 'Local credit' }}
                </span>
              </div>
            </div>
          </div>
        </div>

          <div v-if="isSoldOut(selectedListing)" class="sold-out-modal-message">
            <span class="material-symbols-outlined" aria-hidden="true">info</span>
            <p>All credits for this project have been bought. This listing is no longer available for purchase.</p>
          </div>
          <div v-else class="purchase-form">
          <div class="form-group">
            <label for="quantity">Quantity (credits)</label>
            <input
              id="quantity"
              v-model.number="purchaseQuantity"
              type="number"
              min="1"
              :max="maxPurchaseQuantity"
              class="form-input"
            />
            <small class="input-help">
              Available: {{ formatNumber(selectedListing?.available_quantity || 0) }} credits
              <span v-if="selectedListing?.estimated_credits">
                (Developer limit: {{ formatNumber(selectedListing.estimated_credits) }})
              </span>
            </small>
            <div v-if="purchaseQuantity > maxPurchaseQuantity" class="error-message warning-inline">
              <span class="material-symbols-outlined" aria-hidden="true">error</span>
              <span>
                Cannot purchase more than {{ formatNumber(maxPurchaseQuantity) }} credits.
                Available: {{ formatNumber(selectedListing?.available_quantity || 0) }} credits
              </span>
            </div>
          </div>

          <div class="purchase-summary">
            <div class="summary-row">
              <span>Price per credit:</span>
              <span>{{
                formatCurrency(selectedListing?.price_per_credit, selectedListing?.currency)
              }}</span>
            </div>
            <div class="summary-row">
              <span>Quantity:</span>
              <span>{{ purchaseQuantity }}</span>
            </div>
            <div class="summary-row total">
              <span>Total:</span>
              <span>{{ formatCurrency(totalPrice, selectedListing?.currency) }}</span>
            </div>
          </div>

          <!-- Payment Method Selection -->
          <div class="form-group">
            <label for="paymentMethod">Payment Method</label>
            <div class="payment-methods">
              <div
                v-for="method in paymentMethods"
                :key="method.value"
                :class="['payment-method-card', { active: selectedPaymentMethod === method.value }]"
                @click="selectedPaymentMethod = method.value"
              >
                <div class="payment-method-icon" aria-hidden="true">
                  <span class="material-symbols-outlined">{{ method.icon }}</span>
                </div>
                <div class="payment-method-info">
                  <div class="payment-method-name">{{ method.label }}</div>
                  <div v-if="method.value === 'wallet'" class="wallet-balance">
                    Balance: {{ formatCurrency(walletBalance, 'PHP') }}
                  </div>
                  <div v-else class="payment-method-desc">{{ method.description }}</div>
                </div>
                <div
                  v-if="method.value === 'wallet' && walletBalance < totalPrice"
                  class="insufficient-balance"
                >
                  Insufficient funds
                </div>
              </div>
            </div>
            <div
              v-if="selectedPaymentMethod === 'wallet' && walletBalance < totalPrice"
              class="error-message warning-inline"
            >
              <span class="material-symbols-outlined" aria-hidden="true">error</span>
              <span>
                Your wallet balance ({{ formatCurrency(walletBalance, 'PHP') }}) is insufficient for
                this purchase ({{ formatCurrency(totalPrice, selectedListing?.currency) }})
              </span>
            </div>
          </div>

          <div class="purchase-actions">
            <UiButton variant="outline" @click="closePurchaseModal"> Cancel </UiButton>
            <UiButton
              variant="primary"
              :loading="purchaseLoading"
              :disabled="isSoldOut(selectedListing) || (selectedPaymentMethod === 'wallet' && walletBalance < totalPrice)"
              @click="handlePurchase"
            >
              Complete Purchase
            </UiButton>
          </div>
        </div>
      </div>
    </AccessibleModal>

    <!-- Modern Prompt Modal -->
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

<script setup>
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { getMarketplaceListings, getMarketplaceStats } from '@/services/marketplaceService'
import { SDG_TAGS } from '@/constants/sdgs'
import { projectService } from '@/services/projectService'
import {
  getMyWatchlistIds,
  addToWatchlist,
  removeFromWatchlist,
  checkWatchlistPriceAlerts,
} from '@/services/watchlistService'
import WatchButton from '@/components/ui/WatchButton.vue'
import {
  listMySavedSearches,
  saveSearch,
  deleteSavedSearch,
  checkSavedSearchAlerts,
  describeCriteria,
} from '@/services/savedSearchService'
import { useCartStore } from '@/store/cartStore'
import { useModernPrompt } from '@/composables/useModernPrompt'
import UiButton from '@/components/ui/Button.vue'
import Pagination from '@/components/ui/Pagination.vue'
import AccessibleModal from '@/components/ui/AccessibleModal.vue'
import ModernPrompt from '@/components/ui/ModernPrompt.vue'
import KycGateBanner from '@/components/ui/KycGateBanner.vue'
import { useTradeEligibility } from '@/composables/useTradeEligibility'

const {
  promptState,
  confirm,
  success,
  error: showErrorPrompt,
  warning,
  handleConfirm,
  handleCancel,
  handleClose,
} = useModernPrompt()

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

/**
 * Credits the buyer needs, handed over by the carbon calculator via ?credits=.
 * Used to pre-fill the purchase quantity and to show a reminder banner, so the
 * "know your footprint → offset it" path doesn't lose the number in transit.
 */
const offsetTarget = computed(() => {
  const raw = Number(route.query.credits)
  return Number.isFinite(raw) && raw > 0 ? Math.ceil(raw) : 0
})

// KYC eligibility, resolved once for the page (see useTradeEligibility).
const { needsKyc, requiredLevelLabel, currentLevelLabel, ensureLoaded: ensureKycLoaded } =
  useTradeEligibility()

/**
 * Stop an unverified buyer at the door with an actionable prompt, instead of
 * letting them configure a whole purchase and hit a raw error string on submit.
 * Returns true if the caller should abort.
 */
async function blockedByKyc() {
  await ensureKycLoaded()
  if (!needsKyc.value) return false

  const goToKyc = await confirm({
    title: 'Identity verification required',
    message:
      `Your account is ${currentLevelLabel.value}. Buying carbon credits requires ` +
      `${requiredLevelLabel.value} verification or higher. It usually takes one business day.`,
    confirmText: 'Verify identity',
    cancelText: 'Not now',
  })
  if (goToKyc) router.push('/kyc')
  return true
}

// Computed property to ensure admin check is reactive
const isUserAdmin = computed(() => {
  const adminStatus = userStore.isAdmin
  console.log('🔍 [Marketplace] Admin check computed:', {
    isAdmin: adminStatus,
    role: userStore.role,
    profile: userStore.profile,
    session: !!userStore.session,
  })
  return adminStatus
})

const cart = useCartStore()

// State
const listings = ref([])
const watchedIds = ref(new Set())
const loading = ref(false)
const errorMessage = ref('')
const marketplaceStats = ref({
  totalListings: 0,
  totalCredits: 0,
  averagePrice: 0,
})
const searchQuery = ref('')
const selectedCategory = ref('')
const selectedSource = ref('all')
const selectedSdg = ref('')
const selectedCountry = ref('')
const priceRange = ref({ min: '', max: '' })
const sortBy = ref('name')
const availabilityFilter = ref('all')
const viewMode = ref('grid') // 'grid' or 'list'

// Saved searches / price alerts
const savedSearches = ref([])
const savingSearch = ref(false)
const currentPage = ref(1)
const itemsPerPage = ref(12)
const marketplaceRefreshTimer = ref(null)

// Purchase modal state
const showPurchaseModal = ref(false)
const selectedListing = ref(null)
const purchaseQuantity = ref(1)
const purchaseLoading = ref(false)
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
    value: 'card',
    label: 'Credit/Debit Card',
    icon: 'credit_card',
    description: 'Pay using your bank card',
  },
  {
    value: 'gcash',
    label: 'GCash',
    icon: 'payments',
    description: 'Pay via GCash mobile wallet',
  },
]

const categoryOptions = computed(() => {
  const categories = new Set(
    (listings.value || [])
      .map((listing) => listing.category)
      .filter((category) => typeof category === 'string' && category.trim().length > 0),
  )
  return Array.from(categories).sort((a, b) => a.localeCompare(b))
})

// Computed properties
const filteredListings = computed(() => {
  let filtered = [...listings.value]

  // Apply search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(
      (listing) =>
        listing.project_title.toLowerCase().includes(query) ||
        listing.project_description.toLowerCase().includes(query) ||
        listing.location.toLowerCase().includes(query),
    )
  }

  // Apply category filter
  if (selectedCategory.value) {
    filtered = filtered.filter((listing) => listing.category === selectedCategory.value)
  }

  // Apply credit-source filter (local vs registry/supplier)
  if (selectedSource.value && selectedSource.value !== 'all') {
    filtered = filtered.filter((listing) => (listing.source || 'local') === selectedSource.value)
  }

  // Apply SDG filter (listing tagged with the selected Sustainable Development Goal)
  if (selectedSdg.value) {
    filtered = filtered.filter((listing) =>
      Array.isArray(listing.co_benefits) && listing.co_benefits.includes(selectedSdg.value),
    )
  }

  // Apply availability filter
  if (availabilityFilter.value === 'available') {
    filtered = filtered.filter((listing) => !isSoldOut(listing))
  } else if (availabilityFilter.value === 'unavailable') {
    filtered = filtered.filter((listing) => isSoldOut(listing))
  }

  // Apply country filter
  if (selectedCountry.value) {
    filtered = filtered.filter((listing) =>
      listing.location.toLowerCase().includes(selectedCountry.value.toLowerCase()),
    )
  }

  // Apply price range filter
  if (priceRange.value.min) {
    filtered = filtered.filter(
      (listing) => listing.price_per_credit >= parseFloat(priceRange.value.min),
    )
  }
  if (priceRange.value.max) {
    filtered = filtered.filter(
      (listing) => listing.price_per_credit <= parseFloat(priceRange.value.max),
    )
  }

  // Sort by availability first for "all": available on top, unavailable at bottom
  if (availabilityFilter.value === 'all') {
    filtered.sort((a, b) => Number(isSoldOut(a)) - Number(isSoldOut(b)))
  }

  // Apply sorting
  switch (sortBy.value) {
    case 'price-low':
      filtered.sort((a, b) => a.price_per_credit - b.price_per_credit)
      break
    case 'price-high':
      filtered.sort((a, b) => b.price_per_credit - a.price_per_credit)
      break
    case 'tonnes':
      filtered.sort((a, b) => b.available_quantity - a.available_quantity)
      break
    case 'year':
      filtered.sort((a, b) => b.vintage_year - a.vintage_year)
      break
    default:
      filtered.sort((a, b) => a.project_title.localeCompare(b.project_title))
  }

  return filtered
})

const totalPages = computed(() => Math.ceil(filteredListings.value.length / itemsPerPage.value))

const paginatedListings = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  const end = start + itemsPerPage.value
  return filteredListings.value.slice(start, end)
})

const totalPrice = computed(() => {
  if (!selectedListing.value || !purchaseQuantity.value) return 0
  return selectedListing.value.price_per_credit * purchaseQuantity.value
})

// Maximum quantity that can be purchased (respects developer limit)
const maxPurchaseQuantity = computed(() => {
  if (!selectedListing.value) return 0

  // Use available_quantity which already respects developer limit
  return selectedListing.value.available_quantity || 0
})

// Watch purchase quantity to enforce max limit
watch(purchaseQuantity, (newQuantity) => {
  if (newQuantity && selectedListing.value && newQuantity > maxPurchaseQuantity.value) {
    purchaseQuantity.value = maxPurchaseQuantity.value
    // Note: We don't show a prompt here to avoid issues with watch callbacks
    // The input field's max attribute will prevent entering values above the limit
  }
})

// Monotonic request id. Two loads can overlap (the 15s poll vs a manual refresh
// vs a purchase completion); without this the SLOWER response wins and overwrites
// the fresher data. Each call claims an id and only commits if it is still the
// latest when it resolves.
let loadSeq = 0

/**
 * @param {boolean} background - the 15s poll. A background refresh must be
 *   *silent*: no skeleton, no clearing the grid, and no blanking the list on a
 *   transient error. Doing any of those threw away the user's scroll position
 *   every 15 seconds.
 * @param {boolean} forceRefresh - bypass the listings cache. Defaults to
 *   `background`, but a foreground reload after a purchase also needs it, or the
 *   grid re-renders the pre-purchase availability straight from cache.
 */
async function loadMarketplaceData(background = false, forceRefresh = background) {
  const seq = ++loadSeq
  const isBackground = background

  if (!isBackground) {
    loading.value = true
    errorMessage.value = ''
    // Clear stale data only on a foreground load, where a skeleton covers the gap.
    listings.value = []
  }

  // Load listings and stats in parallel; use 90s timeout (Supabase can be slow on first load / weak networks)
  const timeoutMs = 90000
  const withTimeout = (p, label) =>
    Promise.race([
      p,
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs / 1000}s`)),
          timeoutMs,
        ),
      ),
    ])

  try {
    const [listingsData, statsData] = await Promise.all([
      withTimeout(getMarketplaceListings({ forceRefresh }), 'Listings'),
      withTimeout(getMarketplaceStats(), 'Stats'),
    ])

    // A newer load started while this one was in flight — discard this result
    // rather than overwrite fresher data with staler data.
    if (seq !== loadSeq) return

    listings.value = Array.isArray(listingsData) ? listingsData : []
    marketplaceStats.value = statsData || {
      totalListings: 0,
      totalCreditsAvailable: 0,
      totalMarketValue: 0,
      recentTransactions: 0,
    }

    // Fire saved-search price alerts against the freshly-loaded listings
    // (best-effort; never blocks the render). Skipped on the silent 15s
    // auto-refresh — the last_seen_at high-water mark already dedupes, and we
    // don't need to poll saved searches every cycle.
    if (!isBackground && userStore.session?.user?.id && listings.value.length) {
      checkSavedSearchAlerts(listings.value).catch((err) =>
        console.warn('Saved-search alert check failed:', err?.message),
      )
      // Same deal for watched listings whose price has fallen since they saved it.
      checkWatchlistPriceAlerts(listings.value).catch((err) =>
        console.warn('Price-drop alert check failed:', err?.message),
      )
    }
  } catch (err) {
    console.error('Error loading marketplace data:', err)
    if (seq !== loadSeq) return

    // A failed BACKGROUND poll must not destroy a perfectly good grid the user is
    // reading. Log it and leave the last good data on screen.
    if (isBackground) return

    if (err.message?.includes('timed out')) {
      errorMessage.value =
        'Request took too long. Please check your connection and try "Try Again" below.'
    } else {
      errorMessage.value = err.message || 'Failed to load marketplace data. Please try again.'
    }
    listings.value = []
    marketplaceStats.value = {
      totalListings: 0,
      totalCreditsAvailable: 0,
      totalMarketValue: 0,
      recentTransactions: 0,
    }
  } finally {
    if (!isBackground && seq === loadSeq) loading.value = false
  }
}

// The current filter state, in the saved-search criteria shape.
const currentCriteria = computed(() => ({
  search: searchQuery.value || '',
  category: selectedCategory.value || '',
  source: selectedSource.value || 'all',
  sdgs: selectedSdg.value ? [selectedSdg.value] : [],
  country: selectedCountry.value || '',
  minPrice: priceRange.value?.min || '',
  maxPrice: priceRange.value?.max || '',
}))

async function loadSavedSearches() {
  if (!userStore.session?.user?.id) return
  savedSearches.value = await listMySavedSearches()
}

async function handleSaveSearch() {
  if (!userStore.session?.user?.id) {
    warning('Sign in required', 'Please sign in to save a search and get price alerts.')
    return
  }
  savingSearch.value = true
  try {
    await saveSearch({ label: describeCriteria(currentCriteria.value), criteria: currentCriteria.value })
    await loadSavedSearches()
    success('Search saved', "You'll get a bell alert when a new matching listing appears.")
  } catch (err) {
    showErrorPrompt('Could not save search', err.message || 'Please try again.')
  } finally {
    savingSearch.value = false
  }
}

async function handleDeleteSavedSearch(id) {
  try {
    await deleteSavedSearch(id)
    savedSearches.value = savedSearches.value.filter((s) => s.id !== id)
  } catch (err) {
    showErrorPrompt('Could not delete', err.message || 'Please try again.')
  }
}

function applySavedSearch(saved) {
  const c = saved?.criteria || {}
  searchQuery.value = c.search || ''
  selectedCategory.value = c.category || ''
  selectedSource.value = c.source || 'all'
  selectedSdg.value = Array.isArray(c.sdgs) && c.sdgs.length ? c.sdgs[0] : ''
  selectedCountry.value = c.country || ''
  priceRange.value = { min: c.minPrice || '', max: c.maxPrice || '' }
  currentPage.value = 1
}

function handleSearchReset() {
  searchQuery.value = ''
  selectedCategory.value = ''
  selectedSource.value = 'all'
  selectedSdg.value = ''
  selectedCountry.value = ''
  priceRange.value = { min: '', max: '' }
  availabilityFilter.value = 'all'
  sortBy.value = 'name'
  currentPage.value = 1
}

function clearFilters() {
  handleSearchReset()
}

function viewProject(listing) {
  console.log('Viewing project:', listing)
  // Open purchase modal instead of navigating
  openPurchaseModal(listing)
}

function isSoldOut(listing) {
  return !listing || (listing.available_quantity !== undefined && listing.available_quantity <= 0)
}

function openPurchaseModal(listing) {
  console.log('Opening purchase modal for:', listing.project_title)
  showPurchaseModalFor(listing)
}

function navigateToSubmitProject() {
  console.log('Navigating to submit project')
  router.push('/submit-project')
}

async function showPurchaseModalFor(listing) {
  console.log('🔐 Checking authentication before opening modal:', {
    isAuthenticated: userStore.isAuthenticated,
    hasSession: !!userStore.session,
    userEmail: userStore.session?.user?.email,
  })

  // Require login only when listing has credits to purchase
  if (!isSoldOut(listing) && !userStore.isAuthenticated) {
    await warning({
      title: 'Sign in to continue',
      message: 'Please log in to purchase credits.',
      confirmText: 'Go to login',
      showCancel: false,
    })
    router.push({ name: 'login', query: { returnTo: '/marketplace' } })
    return
  }

  // Verified identity is required to buy — say so now, not after checkout config.
  if (!isSoldOut(listing) && (await blockedByKyc())) return

  selectedListing.value = listing
  // Pre-fill from ?credits= when the buyer arrived from the carbon calculator,
  // clamped to what this listing actually has.
  purchaseQuantity.value = offsetTarget.value
    ? Math.max(1, Math.min(offsetTarget.value, listing.available_quantity || 1))
    : 1
  showPurchaseModal.value = true

  // Load wallet balance
  try {
    const { getWalletBalance } = await import('@/services/walletService')
    const balance = await getWalletBalance()
    walletBalance.value = balance.current_balance || 0
  } catch (err) {
    console.error('Failed to load wallet balance:', err)
    walletBalance.value = 0
  }
}

function closePurchaseModal() {
  showPurchaseModal.value = false
  selectedListing.value = null
  purchaseQuantity.value = 1
}

async function handlePurchase() {
  if (!selectedListing.value || !purchaseQuantity.value) {
    await warning({
      title: 'Invalid Quantity',
      message: 'Please enter a valid quantity to purchase.',
      confirmText: 'OK',
      showCancel: false,
    })
    return
  }

  // Validate quantity doesn't exceed available credits
  if (purchaseQuantity.value > maxPurchaseQuantity.value) {
    await warning({
      title: 'Insufficient Credits',
      message: `Cannot purchase more than ${formatNumber(maxPurchaseQuantity.value)} credits. Only ${formatNumber(selectedListing.value.available_quantity)} credits available.`,
      confirmText: 'OK',
      showCancel: false,
    })
    return
  }

  // Check if user is authenticated
  if (!userStore.isAuthenticated) {
    await warning({
      title: 'Authentication Required',
      message: 'Please log in to purchase credits.',
      confirmText: 'Go to Login',
      showCancel: false,
    })
    router.push({ name: 'login', query: { returnTo: '/marketplace' } })
    return
  }

  purchaseLoading.value = true
  try {
    console.log('🛒 Starting purchase process:', {
      listingId: selectedListing.value.listing_id,
      quantity: purchaseQuantity.value,
      paymentMethod: selectedPaymentMethod.value,
      listingTitle: selectedListing.value.project_title,
    })

    // Import the purchase function
    const { purchaseCredits } = await import('@/services/marketplaceService')

    // Validate payment method is selected
    if (!selectedPaymentMethod.value) {
      throw new Error('Please select a payment method')
    }

    // Create purchase data
    const purchaseData = {
      quantity: purchaseQuantity.value,
      paymentMethod: selectedPaymentMethod.value, // Use selected payment method
      paymentData: null,
    }

    console.log('📦 Purchase data prepared:', purchaseData)

    // Process the purchase with timeout protection
    const purchaseTimeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Purchase request timed out after 60 seconds')), 60000),
    )

    const result = await Promise.race([
      purchaseCredits(selectedListing.value.listing_id, purchaseData),
      purchaseTimeout,
    ])

    console.log('✅ Purchase result received:', result)

    // Handle redirect for PayMongo checkout
    if (result.redirect && result.checkoutUrl) {
      console.log('🔗 Redirecting to PayMongo checkout:', result.checkoutUrl)
      // Store the pending purchase. The intent id lets the callback page find
      // the webhook-settled transaction (server-authoritative path).
      localStorage.setItem('pending_purchase_session', result.sessionId)
      if (result.paymentIntentId) {
        localStorage.setItem('pending_purchase_intent', result.paymentIntentId)
      }

      // Redirect to PayMongo checkout immediately
      window.location.href = result.checkoutUrl
      return // Stop here, user will be redirected
    }

    // If we get here without redirect, check if checkoutUrl exists anyway (fallback)
    if (result.checkoutUrl && !result.redirect) {
      console.log(
        '⚠️ Found checkoutUrl but redirect flag not set, redirecting anyway:',
        result.checkoutUrl,
      )
      localStorage.setItem('pending_purchase_session', result.sessionId || '')
      if (result.paymentIntentId) {
        localStorage.setItem('pending_purchase_intent', result.paymentIntentId)
      }
      window.location.href = result.checkoutUrl
      return
    }

    // Show success message for immediate completion (demo mode or wallet payment)
    const totalAmount = result.transaction.total_amount
    const currency = result.transaction.currency

    // Refresh wallet balance if wallet payment was used
    if (selectedPaymentMethod.value === 'wallet') {
      try {
        const { getWalletBalance } = await import('@/services/walletService')
        const balance = await getWalletBalance()
        walletBalance.value = balance.current_balance || 0
      } catch (err) {
        console.error('Failed to refresh wallet balance:', err)
      }
    }

    await success({
      title: 'Purchase Successful!',
      message: `You purchased ${purchaseQuantity.value} credits from "${selectedListing.value.project_title}" for ${formatCurrency(totalAmount, currency)}. Your carbon credits have been added to your portfolio!`,
      confirmText: 'OK',
    })

    closePurchaseModal()

    // Force reload marketplace so sold-out / remaining stock is correct (bypass cache)
    const { invalidateMarketplaceCache } = await import('@/services/marketplaceService')
    invalidateMarketplaceCache()
    await loadMarketplaceData(false, true)
  } catch (err) {
    console.error('❌ Purchase failed:', err)
    console.error('❌ Purchase error details:', {
      message: err.message,
      stack: err.stack,
      listingId: selectedListing.value?.listing_id,
      quantity: purchaseQuantity.value,
      paymentMethod: selectedPaymentMethod.value,
    })

    // Show user-friendly error message
    let errorMessage = 'Please try again.'
    if (err.message?.includes('timeout')) {
      errorMessage = 'Request timed out. Please check your connection and try again.'
    } else if (err.message?.includes('authenticated') || err.message?.includes('User not')) {
      errorMessage = 'Please log in to complete your purchase.'
      router.push({ name: 'login', query: { returnTo: '/marketplace' } })
    } else if (err.message?.includes('Insufficient')) {
      errorMessage = err.message
    } else if (err.message) {
      errorMessage = err.message
    }

    await showErrorPrompt({
      title: 'Purchase Failed',
      message: errorMessage,
      confirmText: 'OK',
    })
  } finally {
    purchaseLoading.value = false
  }
}

function formatCurrency(amount, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: currency,
  }).format(amount)
}

function formatNumber(number) {
  return new Intl.NumberFormat('en-US').format(number)
}

// Admin delete function - deletes the project (which will cascade to listings)
async function adminDeleteListing(listing) {
  // Immediate console log to verify function is called
  console.log('Admin delete flow triggered')
  console.log('Admin delete button clicked for listing:', listing)
  console.log('🔍 User store isAdmin:', userStore.isAdmin)
  console.log('🔍 User role:', userStore.role)
  console.log('🔍 User store object:', userStore)

  // Check if user is admin
  if (!userStore.isAdmin) {
    console.warn('WARNING: Non-admin user attempted to delete project')
    await showErrorPrompt({
      title: 'Access Denied',
      message: 'Only administrators can delete projects from the marketplace.',
      confirmText: 'OK',
    })
    return
  }

  // Get project ID from listing - check multiple possible fields
  const projectId = listing.project_id || listing.id || listing.projectId
  console.log('🔍 Project ID extracted:', projectId)
  console.log('🔍 Full listing object:', listing)

  if (!projectId) {
    console.error('❌ No project ID found in listing:', listing)
    await showErrorPrompt({
      title: 'Delete Failed',
      message: 'Could not identify the project to delete. Please check console for details.',
      confirmText: 'OK',
    })
    return
  }

  const confirmed = await confirm({
    type: 'warning',
    title: 'Delete Project?',
    message: `WARNING: Are you sure you want to permanently delete "${listing.project_title}" from the marketplace?\n\nThis action cannot be undone and will:\n- Remove the project from the system\n- Delete all associated credits and listings\n- Delete all related data\n\nThis is a permanent action!`,
    confirmText: 'Delete Permanently',
    cancelText: 'Cancel',
  })

  if (!confirmed) {
    return
  }

  try {
    console.log('Admin deleting project from marketplace:', projectId)

    // Use admin delete function which handles all related data deletion
    const result = await projectService.adminDeleteProject(projectId)

    if (!result) {
      throw new Error('Delete operation returned false')
    }

    console.log('✅ Project deleted successfully from marketplace:', projectId)

    // Reload marketplace data
    await loadMarketplaceData(false, true)

    await success({
      title: 'Project Deleted!',
      message: `"${listing.project_title}" has been permanently deleted from the marketplace and system.`,
      confirmText: 'OK',
    })
  } catch (err) {
    console.error('❌ Error deleting project from marketplace:', err)
    await showErrorPrompt({
      title: 'Delete Failed',
      message:
        err.message || 'Failed to delete project. Please check console for details and try again.',
      confirmText: 'OK',
    })
  }
}

// Lifecycle
// ── Watchlist ──────────────────────────────────────────────────────────────
async function loadWatchlist() {
  if (!userStore.isAuthenticated) {
    watchedIds.value = new Set()
    return
  }
  try {
    watchedIds.value = await getMyWatchlistIds()
  } catch (err) {
    console.warn('Failed to load watchlist:', err?.message)
  }
}

function isWatched(listing) {
  return watchedIds.value.has(listing.listing_id)
}

function addListingToCart(listing) {
  cart.addItem(listing, 1)
}
function inCart(listing) {
  return cart.has(listing.listing_id)
}

async function toggleWatch(listing) {
  if (!userStore.isAuthenticated) {
    router.push({ name: 'login', query: { returnTo: '/marketplace' } })
    return
  }
  const id = listing.listing_id
  const next = new Set(watchedIds.value)
  try {
    if (next.has(id)) {
      next.delete(id)
      watchedIds.value = next // optimistic
      await removeFromWatchlist(id)
    } else {
      next.add(id)
      watchedIds.value = next
      // Record today's price as the baseline for future price-drop alerts.
      await addToWatchlist({
        listingId: id,
        projectId: listing.project_id,
        pricePerCredit: listing.price_per_credit,
      })
    }
  } catch (err) {
    console.error('Watchlist toggle failed:', err?.message)
    await loadWatchlist() // resync on failure
  }
}

onMounted(() => {
  // Debug: Log admin status when component mounts
  console.log('🔍 [Marketplace] Component mounted - Admin status:', {
    isAdmin: userStore.isAdmin,
    role: userStore.role,
    profile: userStore.profile?.role,
    session: !!userStore.session,
    userStore: userStore,
  })

  loadMarketplaceData()
  loadWatchlist()
  loadSavedSearches()

  marketplaceRefreshTimer.value = setInterval(() => {
    loadMarketplaceData(true)
  }, 15000)
})

onUnmounted(() => {
  if (marketplaceRefreshTimer.value) {
    clearInterval(marketplaceRefreshTimer.value)
    marketplaceRefreshTimer.value = null
  }
})
</script>

<style scoped>
/* Enhanced Marketplace Styles */
.marketplace {
  min-height: 100vh;
  background: var(--bg-secondary);
}

.marketplace-header {
  background: linear-gradient(135deg, var(--primary-color) 0%, var(--primary-hover) 100%);
  color: white;
  padding: 1.5rem 0;
  text-align: center;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.4rem 0;
}

.page-description {
  font-size: 0.95rem;
  opacity: 0.9;
  margin: 0 0 1.25rem 0;
}

.search-controls {
  display: flex;
  justify-content: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.search-input-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
  min-width: 240px;
}

.search-icon {
  position: absolute;
  left: 0.65rem;
  color: rgba(255, 255, 255, 0.85);
  font-size: 1.15rem;
}

.search-input {
  width: 100%;
  min-width: 240px;
  height: 42px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  padding: 0.6rem 0.75rem 0.6rem 2.25rem;
}

.search-input::placeholder {
  color: rgba(255, 255, 255, 0.8);
}

.search-input:focus {
  outline: none;
  background: rgba(255, 255, 255, 0.28);
}

.filter-select {
  height: 42px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.2);
  color: white;
  padding: 0 0.75rem;
  min-width: 180px;
}

.filter-select option {
  color: #111827;
}

.submit-project-button {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.submit-project-button .material-symbols-outlined {
  font-size: 1.25rem;
}

.save-search-button {
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: white;
  padding: 0.75rem 1.25rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.save-search-button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.28);
}

.save-search-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.save-search-button .material-symbols-outlined {
  font-size: 1.25rem;
}

.saved-searches {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
}

.saved-searches-label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.85rem;
  font-weight: 600;
}

.saved-searches-label .material-symbols-outlined {
  font-size: 1.1rem;
}

.saved-chip {
  display: inline-flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  overflow: hidden;
}

.saved-chip-apply {
  background: transparent;
  border: none;
  color: white;
  padding: 0.35rem 0.5rem 0.35rem 0.85rem;
  cursor: pointer;
  font-size: 0.8rem;
  white-space: nowrap;
}

.saved-chip-remove {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.5rem;
}

.saved-chip-remove:hover {
  color: white;
}

.saved-chip-remove .material-symbols-outlined {
  font-size: 1rem;
}

.marketplace-content {
  padding: 2rem 0;
}

.offset-target-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem 1.1rem;
  margin-bottom: 1.25rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  color: #166534;
  font-size: 0.9rem;
}

.offset-target-banner .material-symbols-outlined {
  font-size: 1.4rem;
  flex-shrink: 0;
}

.projects-content {
  width: 100%;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding: 1rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.results-count {
  font-weight: 500;
  color: var(--text-secondary);
}

.view-controls {
  display: flex;
  gap: 0.5rem;
}

.view-toggle {
  padding: 0.5rem 1rem;
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 999px;
  background: white;
  color: var(--text-primary);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.view-toggle .material-symbols-outlined {
  font-size: 1.2rem;
}

.view-toggle-label {
  display: inline-flex;
}

.view-toggle:hover {
  background: var(--bg-muted);
}

.view-toggle.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.projects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.grid-watch {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  z-index: 5;
}

.project-grid-card {
  position: relative;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
}

.project-grid-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.project-grid-card.is-sold-out .project-grid-image {
  opacity: 0.85;
}

.sold-out-badge {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  z-index: 2;
  background: #b91c1c;
  color: white;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.sold-out-badge.list-badge {
  top: 50%;
  left: 1rem;
  transform: translateY(-50%);
}

.sold-out-label {
  color: #b91c1c;
  font-weight: 600;
  font-size: 0.875rem;
}

.sold-out-button {
  cursor: not-allowed;
}

.sold-out-modal-message {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  color: #991b1b;
  margin-top: 1rem;
}

.sold-out-modal-message .material-symbols-outlined {
  flex-shrink: 0;
  font-size: 1.5rem;
}

.sold-out-modal-message p {
  margin: 0;
  font-size: 0.9375rem;
  line-height: 1.5;
}

.project-grid-image {
  width: 100%;
  height: 200px;
  overflow: hidden;
  background: #f3f4f6;
}

.project-grid-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.project-grid-content {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
}

.project-grid-titlerow {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.project-grid-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
  line-height: 1.4;
}

.source-badge {
  flex-shrink: 0;
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
}

.source-badge.local {
  background: #eef2ff;
  color: #4338ca;
}

.source-badge.supplier {
  background: #ecfdf5;
  color: #047857;
}

.details-link {
  display: inline-block;
  margin-top: 0.35rem;
  color: #069e2d;
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
}

.details-link:hover {
  text-decoration: underline;
}

.project-grid-description {
  color: #6b7280;
  font-size: 0.875rem;
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.project-grid-meta {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.875rem;
  color: #6b7280;
}

.project-grid-pricing {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
}

.project-grid-pricing .price {
  font-size: 1.25rem;
  font-weight: 700;
  color: #059669;
}

.project-grid-pricing .quantity {
  font-size: 0.875rem;
  color: #6b7280;
}

.project-grid-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  align-items: center;
}

.project-actions-buttons {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-top: 0.5rem;
}

.projects-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 2rem;
}

.project-list-item {
  position: relative;
  display: flex;
  background: white;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: all 0.2s;
  gap: 1.5rem;
}

.project-list-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.project-image {
  width: 120px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.project-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.project-info {
  flex: 1;
}

.project-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
}

.project-description {
  color: var(--text-secondary);
  font-size: 0.875rem;
  margin: 0 0 1rem 0;
  line-height: 1.5;
}

.project-meta {
  display: flex;
  gap: 1rem;
  margin-top: 0.75rem;
  color: #6b7280;
  font-size: 0.95rem;
}

.project-meta .meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.project-meta .material-symbols-outlined {
  font-size: 1rem;
  color: #f97316;
}

.project-meta .meta-text {
  display: inline-flex;
  align-items: center;
  font-size: 0.95rem;
  color: #6b7280;
}

.project-pricing {
  text-align: right;
  flex-shrink: 0;
}

.price {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--primary-color);
  margin-bottom: 0.25rem;
}

.quantity {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 1rem;
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
  border: 2px solid var(--border-color);
  border-top: 2px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
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
  margin-bottom: 1rem;
}

.error-icon {
  background: rgba(220, 38, 38, 0.12);
  color: #b91c1c;
}

.empty-icon {
  background: rgba(15, 23, 42, 0.12);
  color: var(--text-muted);
}

.error-icon svg,
.empty-icon svg {
  width: 1.8rem;
  height: 1.8rem;
}

.retry-button,
.clear-filters-button {
  background: var(--primary-color);
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.2s;
}

.retry-button:hover,
.clear-filters-button:hover {
  background: var(--primary-hover);
}

/* Purchase Modal */
.purchase-modal-content {
  padding: 1rem;
}

.project-summary {
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-color);
}

.project-summary h4 {
  margin: 0 0 0.5rem 0;
  color: var(--text-primary);
}

.project-summary p {
  color: var(--text-secondary);
  margin: 0 0 1rem 0;
  line-height: 1.5;
}

.project-details {
  display: flex;
  gap: 1rem;
  font-size: 0.875rem;
  color: var(--text-muted);
}

.purchase-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 500;
  color: var(--text-primary);
}

.form-input {
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 1rem;
}

.purchase-summary {
  background: var(--bg-muted);
  padding: 1rem;
  border-radius: 6px;
}

.summary-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.summary-row.total {
  font-weight: 600;
  font-size: 1.125rem;
  color: var(--primary-color);
  border-top: 1px solid var(--border-color);
  padding-top: 0.5rem;
  margin-top: 0.5rem;
}

.purchase-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

/* Payment Method Selection */
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
  border: 2px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  background: var(--bg-primary);
}

.payment-method-card:hover {
  border-color: var(--primary-color);
  background: var(--bg-muted);
}

.payment-method-card.active {
  border-color: var(--primary-color);
  background: var(--primary-light, rgba(6, 158, 45, 0.1));
}

.payment-method-icon {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(16, 185, 129, 0.12);
  color: var(--primary-color, #069e2d);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.8rem;
}

.payment-method-icon .material-symbols-outlined {
  font-size: 1.6rem;
}

.payment-method-info {
  flex: 1;
}

.payment-method-name {
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}

.payment-method-desc {
  font-size: 0.875rem;
  color: var(--text-muted);
}

.wallet-balance {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--primary-color);
}

.insufficient-balance {
  font-size: 0.75rem;
  color: var(--error-color, #dc2626);
  font-weight: 500;
}

.error-message {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: var(--error-light, rgba(220, 38, 38, 0.1));
  border: 1px solid var(--error-color, #dc2626);
  border-radius: 6px;
  color: var(--error-color, #dc2626);
  font-size: 0.875rem;
}

.warning-inline {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.warning-inline .material-symbols-outlined {
  font-size: 1.2rem;
}

/* Responsive Design */
@media (max-width: 768px) {
  .marketplace-header {
    padding: 2rem 0;
  }

  .page-title {
    font-size: 2rem;
  }

  .page-description {
    font-size: 1rem;
    margin: 0 0 1.5rem 0;
  }

  .advanced-search-toggle {
    padding: 0.625rem 1.25rem;
    font-size: 0.875rem;
  }

  .advanced-search-toggle .material-symbols-outlined,
  .submit-project-button .material-symbols-outlined {
    font-size: 1.1rem;
  }

  .search-controls {
    flex-direction: column;
    align-items: center;
    gap: 0.65rem;
  }

  .search-input-wrap,
  .filter-select {
    width: 100%;
    max-width: 270px;
    min-width: 270px;
  }

  .search-input {
    min-width: 0;
  }

  .submit-project-button {
    width: 100%;
    max-width: 270px;
    justify-content: center;
  }

  .marketplace-content {
    padding: 1rem 0;
  }

  .results-header {
    flex-direction: column;
    gap: 1rem;
    align-items: stretch;
    margin-bottom: 1rem;
    padding: 0.75rem;
  }

  .view-controls {
    justify-content: center;
  }

  .view-toggle {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
  }

  .projects-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .project-list-item {
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }

  .project-image {
    width: 100%;
    height: 200px;
  }

  .project-pricing {
    text-align: left;
  }

  .project-meta {
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Purchase modal mobile */
  .purchase-modal-content {
    padding: 0.5rem;
  }

  .project-details {
    flex-direction: column;
    gap: 0.5rem;
  }

  .purchase-actions {
    flex-direction: column;
    gap: 0.75rem;
  }

  .purchase-actions .ui-btn {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .marketplace-header {
    padding: 1.5rem 0;
  }

  .page-title {
    font-size: 1.75rem;
  }

  .container {
    padding: 0 1rem;
  }

  .search-input-wrap,
  .filter-select,
  .submit-project-button {
    max-width: 100%;
    min-width: 0;
  }

  .projects-grid {
    gap: 0.75rem;
  }

  .project-list-item {
    padding: 0.75rem;
  }

  .form-input {
    font-size: 16px; /* Prevent zoom on iOS */
  }
}

.location-icon,
.category-icon {
  font-size: 1rem;
  color: #f97316;
}

.project-meta {
  display: flex;
  gap: 1rem;
  margin-top: 0.75rem;
  color: #6b7280;
  font-size: 0.95rem;
}

.project-meta .material-symbols-outlined {
  font-size: 1rem;
}

.modal-meta .meta-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  color: #4b5563;
}

.modal-meta .meta-item .material-symbols-outlined {
  font-size: 1.05rem;
}
</style>

<style scoped>
.project-grid-scores {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin: 0.4rem 0;
}

.score-badge {
  font-size: 0.68rem;
  font-weight: 600;
  padding: 0.12rem 0.5rem;
  border-radius: 999px;
  text-transform: capitalize;
}

.score-badge.feasibility {
  background: #e0f2fe;
  color: #075985;
}

.score-badge.impact {
  background: #ede9fe;
  color: #5b21b6;
}

.score-badge.risk.low {
  background: #d1fae5;
  color: #065f46;
}

.score-badge.risk.medium {
  background: #fef3c7;
  color: #92400e;
}

.score-badge.risk.high {
  background: #fee2e2;
  color: #991b1b;
}
</style>
