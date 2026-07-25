<template>
  <div class="retire-page">
    <!-- Page Header -->
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">Retire Carbon Credits</h1>
        <p class="page-description">Permanently retire your carbon credits to offset emissions</p>
      </div>
    </div>

    <!-- Main Content -->
    <div class="retire-content">
      <div class="container">
        <div class="content-layout">
          <!-- Left Column - Retire Form -->
          <div class="retire-form-section">
            <div class="retire-card">
              <h2 class="card-title">Retire Credits</h2>
              <p class="card-description">
                Retire your carbon credits to permanently offset emissions and receive a retirement
                certificate.
              </p>

              <!-- Error State -->
              <div v-if="error" class="error-message">
                {{ error }}
              </div>

              <!-- Loading State -->
              <div v-if="loading" class="loading-message">Loading your credits...</div>

              <!-- Empty State -->
              <div v-if="!loading && availableProjects.length === 0" class="empty-state">
                <p>No credits available for retirement. Purchase some credits first!</p>
              </div>

              <form v-else-if="!loading" class="retire-form" @submit.prevent="handleRetire">
                <div class="form-group">
                  <label class="form-label">Select Project</label>
                  <select v-model="selectedProject" class="form-select" required>
                    <option value="">Choose a project...</option>
                    <option
                      v-for="project in availableProjects"
                      :key="project.id"
                      :value="project.id"
                    >
                      {{ project.name }} - {{ project.credits }} credits available
                    </option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label">Credits to Retire</label>
                  <input
                    v-model.number="creditsToRetire"
                    type="number"
                    min="1"
                    :max="selectedProjectCredits"
                    class="form-input"
                    placeholder="Enter number of credits"
                    required
                  />
                  <div class="input-help">Available: {{ selectedProjectCredits }} credits</div>
                </div>

                <div class="form-group">
                  <label class="form-label">Retirement Purpose</label>
                  <select v-model="retirementPurpose" class="form-select" required>
                    <option value="">Select purpose...</option>
                    <option value="corporate">Corporate Carbon Neutrality</option>
                    <option value="event">Event Offset</option>
                    <option value="product">Product Carbon Footprint</option>
                    <option value="personal">Personal Carbon Footprint</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div class="form-group">
                  <label class="form-label">Retirement Statement (Optional)</label>
                  <textarea
                    v-model="retirementStatement"
                    class="form-textarea"
                    rows="3"
                    placeholder="Describe the purpose of this retirement..."
                  ></textarea>
                </div>

                <div class="retirement-summary">
                  <h3 class="summary-title">Retirement Summary</h3>
                  <div class="summary-item">
                    <span class="summary-label">Credits to Retire:</span>
                    <span class="summary-value">{{ creditsToRetire || 0 }}</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-label">Project:</span>
                    <span class="summary-value">{{ selectedProjectName || 'None selected' }}</span>
                  </div>
                  <div class="summary-item">
                    <span class="summary-label">Purpose:</span>
                    <span class="summary-value">{{ retirementPurpose || 'None selected' }}</span>
                  </div>
                </div>

                <button type="submit" class="retire-button" :disabled="!canRetire || loading">
                  <svg
                    v-if="!loading"
                    class="button-icon"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    ></path>
                  </svg>
                  {{ loading ? 'Retiring...' : `Retire ${creditsToRetire || 0} Credits` }}
                </button>
              </form>
            </div>
          </div>

          <!-- Right Column - Transaction History (Purchase & Retirement) -->
          <div class="transaction-history">
            <div class="history-card">
              <div class="card-header-with-action">
                <div>
                  <h2 class="card-title">Transaction History</h2>
                  <p class="card-subtitle">Proof of purchases and retirements</p>
                </div>
                <button 
                  v-if="purchaseHistory.length > 0 && purchaseHistory.some(p => !p.certificate)"
                  @click="generateMissingCertificates"
                  class="generate-cert-btn"
                  :disabled="generatingCerts"
                >
                  {{ generatingCerts ? 'Generating...' : 'Generate Missing Certificates' }}
                </button>
              </div>
              
              <!-- Tabs for Purchase/Retirement -->
              <div class="history-tabs">
                <button
                  :class="['tab-button', { active: activeTab === 'purchases' }]"
                  @click="activeTab = 'purchases'"
                >
                  Purchases ({{ purchaseTotal }})
                </button>
                <button
                  :class="['tab-button', { active: activeTab === 'retirements' }]"
                  @click="activeTab = 'retirements'"
                >
                  Retirements ({{ retirementHistory.length }})
                </button>
              </div>

              <!-- Purchase History -->
              <div v-if="activeTab === 'purchases'" class="history-list">
                <div v-if="purchaseHistory.length === 0" class="empty-history">
                  <p>No purchase history yet. Buy credits from the marketplace to see them here.</p>
                </div>
                <div
                  v-for="purchase in purchaseHistory"
                  :key="purchase.id"
                  class="history-item purchase-item"
                >
                  <div class="history-header">
                    <div class="history-project-info">
                      <span class="history-type-badge purchase-badge">Purchase</span>
                      <span class="history-project">{{ purchase.project_title }}</span>
                    </div>
                    <span class="history-date">{{ formatDate(purchase.date) }}</span>
                  </div>
                  <div class="history-details">
                    <div class="detail-group">
                      <span class="history-credits">{{ purchase.credits_quantity }} credits</span>
                      <span class="history-amount">{{ purchase.currency }} {{ purchase.total_amount.toLocaleString() }}</span>
                    </div>
                    <div class="detail-group">
                      <span class="history-payment">{{ purchase.payment_method.toUpperCase() }}</span>
                      <span v-if="purchase.certificate_number" class="cert-badge">
                        Cert: {{ purchase.certificate_number }}
                      </span>
                    </div>
                  </div>
                  <div class="history-actions">
                    <button
                      v-if="purchase.certificate"
                      @click="viewCertificate(purchase.certificate)"
                      class="action-btn view-cert-btn"
                    >
                      <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                      </svg>
                      View Certificate
                    </button>
                  </div>
                </div>

                <!-- Purchase pagination -->
                <div v-if="purchaseTotalPages > 1" class="pagination">
                  <button
                    class="page-btn"
                    :disabled="purchasePage <= 1 || loadingPurchases"
                    @click="goToPurchasePage(purchasePage - 1)"
                  >
                    Previous
                  </button>
                  <span class="page-info">Page {{ purchasePage }} of {{ purchaseTotalPages }}</span>
                  <button
                    class="page-btn"
                    :disabled="purchasePage >= purchaseTotalPages || loadingPurchases"
                    @click="goToPurchasePage(purchasePage + 1)"
                  >
                    Next
                  </button>
                </div>
              </div>

              <!-- Retirement History -->
              <div v-if="activeTab === 'retirements'" class="history-list">
                <div v-if="retirementHistory.length === 0" class="empty-history">
                  <p>No retirement history yet. Retire credits to see them here.</p>
                </div>
                <div
                  v-for="retirement in retirementHistory"
                  :key="retirement.id"
                  class="history-item retirement-item"
                >
                  <div class="history-header">
                    <div class="history-project-info">
                      <span class="history-type-badge retirement-badge">Retired</span>
                      <span class="history-project">{{ retirement.project_title }}</span>
                    </div>
                    <span class="history-date">{{ formatDate(retirement.date) }}</span>
                  </div>
                  <div class="history-details">
                    <span class="history-credits">{{ retirement.credits_quantity }} credits</span>
                    <span class="history-purpose">{{ retirement.purpose }}</span>
                  </div>
                  <div class="history-actions">
                    <button
                      v-if="retirement.certificate"
                      @click="viewCertificate(retirement.certificate)"
                      class="action-btn view-cert-btn"
                    >
                      <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                      </svg>
                      View Certificate
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Toast
      v-if="toast.show"
      :type="toast.type"
      :message="toast.message"
      @close="toast.show = false"
    />

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
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { getUserCreditPortfolio, retireCredits } from '@/services/marketplaceService'
import {
  getUserPurchaseHistoryPage,
  getUserRetirementHistory,
} from '@/services/transactionHistoryService'
import Toast from '@/components/ui/Toast.vue'
import { useModernPrompt } from '@/composables/useModernPrompt'
import ModernPrompt from '@/components/ui/ModernPrompt.vue'

const userStore = useUserStore()
const router = useRouter()

const {
  promptState,
  confirm: confirmPrompt,
  handleConfirm,
  handleCancel,
  handleClose,
} = useModernPrompt()

// Lightweight in-app toast (replaces blocking window.alert on retire).
const toast = ref({ show: false, type: 'success', message: '' })
function showToast(message, type = 'success') {
  toast.value = { show: true, type, message }
}

// Form data
const selectedProject = ref('')
const creditsToRetire = ref(1)
const retirementPurpose = ref('')
const retirementStatement = ref('')

// Data
const availableProjects = ref([])
const purchaseHistory = ref([])
const retirementHistory = ref([])
const activeTab = ref('purchases') // 'purchases' or 'retirements'
// Server-side pagination for the purchases tab.
const PURCHASE_PAGE_SIZE = 10
const purchasePage = ref(1)
const purchaseTotal = ref(0)
const loadingPurchases = ref(false)
const loading = ref(false)
const error = ref('')
const generatingCerts = ref(false)

// Computed properties
const selectedProjectCredits = computed(() => {
  const project = availableProjects.value.find((p) => p.id == selectedProject.value)
  return project ? project.quantity : 0
})

const selectedProjectName = computed(() => {
  const project = availableProjects.value.find((p) => p.id == selectedProject.value)
  return project ? project.project_title : ''
})

const canRetire = computed(() => {
  return (
    selectedProject.value &&
    creditsToRetire.value > 0 &&
    creditsToRetire.value <= selectedProjectCredits.value &&
    retirementPurpose.value
  )
})

const purchaseTotalPages = computed(() =>
  Math.max(1, Math.ceil(purchaseTotal.value / PURCHASE_PAGE_SIZE)),
)

// Load one page of purchases (server-side). Retirements load in full separately.
async function loadPurchasesPage(page = 1) {
  const userId = userStore.session?.user?.id || userStore.user?.id
  if (!userId) return
  loadingPurchases.value = true
  try {
    const { rows, total } = await getUserPurchaseHistoryPage({
      userId,
      limit: PURCHASE_PAGE_SIZE,
      offset: (page - 1) * PURCHASE_PAGE_SIZE,
    })
    purchaseHistory.value = rows
    purchaseTotal.value = total
    purchasePage.value = page
  } finally {
    loadingPurchases.value = false
  }
}

function goToPurchasePage(page) {
  const target = Math.min(Math.max(1, page), purchaseTotalPages.value)
  if (target !== purchasePage.value) loadPurchasesPage(target)
}

// Methods
const loadUserCredits = async () => {
  const userId = userStore.session?.user?.id || userStore.user?.id
  if (!userId) {
    loading.value = false
    return
  }

  loading.value = true
  error.value = ''

  // Add timeout protection to prevent infinite loading
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timeout after 30 seconds')), 30000)
  )

  try {
    const credits = await Promise.race([
      getUserCreditPortfolio(userId),
      timeoutPromise,
    ])

    // Transform the data to include project details (only show credits with quantity > 0).
    // getUserCreditPortfolio returns FLAT fields (project_id, project_title, ...) — not a
    // nested project_credits.projects object. The dropdown key stays the ownership-row id,
    // but we MUST carry the real project_id: retire_credits_atomic matches on it, so dropping
    // it (the old bug) made every retirement fail with "insufficient credits".
    availableProjects.value = credits
      .filter((credit) => credit.quantity > 0)
      .map((credit) => ({
        id: credit.id,
        project_id: credit.project_id,
        name: credit.project_title || 'Unknown Project',
        project_title: credit.project_title || 'Unknown Project',
        credits: credit.quantity,
        quantity: credit.quantity,
        category: credit.project_category || 'Unknown',
        location: credit.project_location || 'Unknown',
      }))

    // Load transaction history: purchases paginate server-side; retirements
    // load in full (typically far fewer rows).
    try {
      const userId = userStore.session?.user?.id || userStore.user?.id
      if (!userId) {
        console.warn('⚠️ No user ID available for loading transaction history')
        purchaseHistory.value = []
        retirementHistory.value = []
        return
      }

      // Add timeout protection for transaction history
      const historyTimeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Transaction history timeout')), 30000)
      )

      const retirements = await Promise.race([
        Promise.all([loadPurchasesPage(1), getUserRetirementHistory(userId)]),
        historyTimeoutPromise,
      ]).then(([, r]) => r)

      retirementHistory.value = retirements || []
    } catch (historyError) {
      console.error('❌ Error loading transaction history:', historyError)
      purchaseHistory.value = []
      retirementHistory.value = []
      error.value = 'Failed to load transaction history. Please refresh the page.'
    }
  } catch (err) {
    console.error('Error loading user credits:', err)
    if (err.message?.includes('timeout')) {
      error.value = 'Request timed out. Please check your connection and try again.'
    } else {
      error.value = 'Failed to load your credits. Please try again.'
    }
    availableProjects.value = []
    purchaseHistory.value = []
    retirementHistory.value = []
  } finally {
    loading.value = false
  }
}

const handleRetire = async () => {
  if (!canRetire.value) return

  // Retirement is permanent: retire_credits_atomic burns the balance and issues
  // a retirement certificate, and there is no un-retire. Every lesser
  // destructive action in this app confirms first; the one that irreversibly
  // consumes the asset did not.
  const confirmed = await confirmPrompt({
    title: 'Retire these credits permanently?',
    message:
      `You are retiring ${creditsToRetire.value} credit(s) from "${selectedProjectName.value}". ` +
      'Retired credits are burned, cannot be sold or transferred, and this cannot be undone. ' +
      'A retirement certificate will be issued in your name.',
    confirmText: 'Retire permanently',
  })
  if (!confirmed) return

  loading.value = true
  error.value = ''

  try {
    const selectedCredit = availableProjects.value.find((p) => p.id == selectedProject.value)

    if (!selectedCredit) {
      throw new Error('Selected project not found')
    }

    const creditsToRetireValue = creditsToRetire.value
    const projectName = selectedProjectName.value

    // Get user ID from store
    const userId = userStore.session?.user?.id || userStore.user?.id
    if (!userId) {
      throw new Error('User not authenticated')
    }

    // Get project ID from selected credit. NOTE: the portfolio item's `id` is the
    // credit_ownership row id; the actual project id is `project_id`. Passing the
    // wrong one makes retire_credits_atomic find no matching credits.
    const projectId = selectedCredit.project_id || selectedCredit.id
    if (!projectId) {
      throw new Error('Project ID not found')
    }

    // Call the retire service with correct parameters
    await retireCredits(
      userId,
      projectId,
      creditsToRetireValue,
      retirementPurpose.value + (retirementStatement.value ? ` - ${retirementStatement.value}` : '')
    )

    // Reset form
    selectedProject.value = ''
    creditsToRetire.value = 1
    retirementPurpose.value = ''
    retirementStatement.value = ''

    // Reload data
    await loadUserCredits()

    // Show success toast
    showToast(`Successfully retired ${creditsToRetireValue} credits from ${projectName}!`, 'success')
  } catch (err) {
    console.error('Error retiring credits:', err)
    error.value = err.message || 'Failed to retire credits. Please try again.'
    showToast(error.value, 'error')
  } finally {
    loading.value = false
  }
}

const formatDate = (dateString) => {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const viewCertificate = (certificate) => {
  // Navigate to certificate view or open certificate details
  if (!certificate) {
    console.error('❌ No certificate provided to viewCertificate')
    error.value = 'Certificate not available. It may still be generating.'
    return
  }
  
  const certId = certificate.certificate_number || certificate.id
  if (!certId) {
    console.error('❌ Certificate missing ID:', certificate)
    error.value = 'Certificate information is incomplete.'
    return
  }
  
  router.push({
    path: '/certificates',
    query: { cert: certId },
  })
}

const generateMissingCertificates = async () => {
  const userId = userStore.session?.user?.id || userStore.user?.id
  if (!userId) {
    error.value = 'User not authenticated'
    return
  }

  generatingCerts.value = true
  error.value = ''

  try {
    const { generateMissingCertificates: generateMissing } = await import('@/services/certificateService')
    const result = await generateMissing(userId)
    
    if (result.generated > 0) {
      console.log(`✅ Generated ${result.generated} missing certificates`)
      // Reload history to show new certificates
      await loadUserCredits()
      // This view already has a toast; these were the last two blocking
      // window.alert calls in it.
      showToast(`Generated ${result.generated} certificate(s).`, 'success')
    } else {
      showToast('All purchases already have certificates.', 'success')
    }
    
    if (result.errors && result.errors.length > 0) {
      console.warn('⚠️ Some certificates could not be generated:', result.errors)
    }
  } catch (err) {
    console.error('❌ Error generating missing certificates:', err)
    error.value = 'Failed to generate certificates. Please try again.'
  } finally {
    generatingCerts.value = false
  }
}

// Lifecycle
onMounted(() => {
  loadUserCredits()
  
  // Check if we need to refresh after purchase
  if (sessionStorage.getItem('refresh_retire_history')) {
    sessionStorage.removeItem('refresh_retire_history')
    // Refresh after a short delay to ensure database has updated
    setTimeout(() => {
      loadUserCredits()
    }, 1000)
  }
})
</script>

<style scoped>
.retire-page {
  min-height: 100vh;
  background: var(--bg-primary);
}

.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 var(--spacing-md);
}

/* Page Header */
.page-header {
  padding: 1.25rem 0;
  background: var(--primary-color, #058526);
  border-bottom: none;
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

/* Main Content */
.retire-content {
  padding: 2rem 0;
}

.content-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 2rem;
}

/* Retire Form Section */
.retire-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 2rem;
  box-shadow: var(--shadow-sm);
}

.card-header-with-action {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.card-title {
  font-size: var(--font-size-2xl);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.5rem;
}

.card-subtitle {
  color: var(--text-muted);
  margin: 0;
  line-height: 1.5;
}

.generate-cert-btn {
  padding: 0.5rem 1rem;
  background: var(--primary-color, #058526);
  color: white;
  border: none;
  border-radius: var(--radius-md, 0.5rem);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 0.875rem;
}

.generate-cert-btn:hover:not(:disabled) {
  background: var(--primary-hover, #059669);
  transform: translateY(-1px);
}

.generate-cert-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.card-description {
  color: var(--text-muted);
  margin-bottom: 2rem;
  line-height: 1.5;
}

.retire-form {
  display: grid;
  gap: 1.5rem;
}

.form-group {
  display: grid;
  gap: 0.5rem;
}

.form-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-primary);
}

.form-input,
.form-select,
.form-textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  font-size: var(--font-size-base);
  color: var(--text-primary);
  background: var(--bg-primary);
  outline: none;
  transition: var(--transition);
}

.form-input:focus,
.form-select:focus,
.form-textarea:focus {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(5, 133, 38, 0.1);
}

.input-help {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.retirement-summary {
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  padding: 1.5rem;
  margin: 1rem 0;
}

.summary-title {
  font-size: var(--font-size-lg);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 1rem;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.summary-label {
  color: var(--text-secondary);
}

.summary-value {
  font-weight: 500;
  color: var(--text-primary);
}

.retire-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
}

.retire-button:hover:not(:disabled) {
  background: var(--primary-hover);
  transform: translateY(-1px);
}

.retire-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.button-icon {
  width: 1.25rem;
  height: 1.25rem;
}

/* Transaction History */
.transaction-history {
  position: sticky;
  top: 2rem;
  height: fit-content;
  max-height: calc(100vh - 150px);
  overflow-y: auto;
}

.card-subtitle {
  color: var(--text-muted);
  font-size: var(--font-size-sm);
  margin-bottom: 1rem;
}

.history-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
  border-bottom: 2px solid var(--border-light, #e8f5e8);
}

.tab-button {
  flex: 1;
  padding: 0.75rem 1rem;
  background: transparent;
  border: none;
  border-bottom: 3px solid transparent;
  color: var(--text-muted);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  font-size: var(--font-size-sm);
}

.tab-button:hover {
  color: var(--primary-color);
  background: var(--bg-secondary);
}

.tab-button.active {
  color: var(--primary-color);
  border-bottom-color: var(--primary-color);
  font-weight: 600;
}

.empty-history {
  padding: 2rem;
  text-align: center;
  color: var(--text-muted);
  font-size: var(--font-size-sm);
}

.history-card {
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 1.5rem;
  box-shadow: var(--shadow-sm);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.history-item {
  padding: 1rem;
  background: var(--bg-secondary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  transition: all 0.2s;
}

.history-item:hover {
  border-color: var(--primary-color);
  box-shadow: 0 2px 8px rgba(5, 133, 38, 0.1);
}

.purchase-item {
  border-left: 4px solid var(--primary-color);
}

.retirement-item {
  border-left: 4px solid var(--success-color, #058526);
}

.history-project-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.history-type-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.purchase-badge {
  background: var(--primary-light, #e8f5e8);
  color: var(--primary-color, #058526);
}

.retirement-badge {
  background: #dcfce7;
  color: #059669;
}

.detail-group {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.history-amount {
  font-weight: 600;
  color: var(--primary-color);
}

.history-payment {
  font-size: 0.75rem;
  color: var(--text-muted);
  padding: 0.25rem 0.5rem;
  background: var(--bg-primary);
  border-radius: 0.25rem;
}

.cert-badge {
  font-size: 0.75rem;
  color: var(--primary-color);
  font-weight: 500;
}

.history-actions {
  margin-top: 0.75rem;
  display: flex;
  gap: 0.5rem;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--font-size-sm);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.action-btn:hover {
  background: var(--primary-hover);
  transform: translateY(-1px);
}

.action-btn .icon {
  width: 1rem;
  height: 1rem;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.history-project {
  font-weight: 500;
  color: var(--text-primary);
}

.history-date {
  font-size: var(--font-size-sm);
  color: var(--text-muted);
}

.history-details {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.history-credits {
  font-weight: 600;
  color: var(--primary-color);
}

.history-purpose {
  font-size: var(--font-size-sm);
  color: var(--text-secondary);
}

.certificate-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--primary-color);
  text-decoration: none;
  font-size: var(--font-size-sm);
  font-weight: 500;
  transition: var(--transition);
}

.certificate-link:hover {
  color: var(--primary-hover);
  text-decoration: underline;
}

.certificate-icon {
  width: 1rem;
  height: 1rem;
}

/* Responsive Design */
@media (max-width: 1024px) {
  .content-layout {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }

  .retirement-history {
    position: static;
  }
}

@media (max-width: 768px) {
  .retire-content {
    padding: 1.5rem 0;
  }

  /* .page-title is not restated here on purpose. It used to override to
     var(--font-size-3xl) (1.875rem), a pre-shrink leftover that rendered the
     title larger on a phone than the 1.5rem desktop rule. */

  .retire-card {
    padding: 1.5rem;
  }

  .history-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }

  .history-details {
    flex-direction: column;
    gap: 0.25rem;
  }
}

/* Error and Loading States */
.error-message {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  font-weight: 500;
}

.loading-message {
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  color: #0284c7;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1.5rem;
  text-align: center;
  font-weight: 500;
}

.empty-state {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #64748b;
  padding: 2rem;
  border-radius: 8px;
  text-align: center;
  margin-bottom: 1.5rem;
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1rem;
}

.page-btn {
  background: #fff;
  border: 1px solid #cbd5e1;
  color: #334155;
  padding: 0.4rem 0.9rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
}

.page-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.page-info {
  color: #64748b;
  font-size: 0.9rem;
}
</style>
