<template>
  <div class="receipt-view-page">
    <div class="page-header">
      <div class="container">
        <div class="header-content">
          <div class="header-text">
            <h1 class="page-title">My Receipts</h1>
            <p class="page-description">
              View and download purchase receipts for your carbon credit transactions
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="receipt-content">
      <div class="container">
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading your receipts...</p>
        </div>

        <div v-else-if="error" class="error-state">
          <div class="error-icon">Receipt unavailable</div>
          <h3>Unable to load receipts</h3>
          <p>{{ error }}</p>
          <button class="btn btn-primary" @click="loadReceipts">Try Again</button>
        </div>

        <div v-else>
          <div v-if="selectedReceipt" class="receipt-modal-backdrop" @click.self="closeReceiptDetails">
            <div class="receipt-modal">
              <div class="receipt-modal-header">
                <div>
                  <h2>{{ getProjectTitle(selectedReceipt) || 'Purchase Receipt' }}</h2>
                  <p>Receipt #{{ selectedReceipt.receipt_number || selectedReceipt.id }}</p>
                </div>
                <button class="btn btn-ghost btn-sm" @click="closeReceiptDetails">Close</button>
              </div>

              <div class="receipt-modal-grid">
                <div class="detail-card">
                  <h3>Purchase</h3>
                  <div class="detail-row">
                    <span class="detail-label">Issued</span>
                    <span class="detail-value">{{
                      formatDateTime(selectedReceipt.issued_at || selectedReceipt.created_at)
                    }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Transaction ID</span>
                    <span class="detail-value detail-break">{{
                      selectedReceipt.transaction_id || selectedReceipt.id
                    }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Credits</span>
                    <span class="detail-value">{{
                      formatNumber(getCreditsPurchased(selectedReceipt))
                    }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Total</span>
                    <span class="detail-value">{{
                      formatCurrency(getTotalAmount(selectedReceipt), getCurrency(selectedReceipt))
                    }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Payment Method</span>
                    <span class="detail-value">{{
                      getPaymentMethod(selectedReceipt) || 'N/A'
                    }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Status</span>
                    <span class="detail-value" :class="getStatus(selectedReceipt)">{{
                      getStatusLabel(selectedReceipt)
                    }}</span>
                  </div>
                </div>

                <div class="detail-card">
                  <h3>Project</h3>
                  <div class="detail-row">
                    <span class="detail-label">Title</span>
                    <span class="detail-value">{{
                      getProjectTitle(selectedReceipt) || 'Purchase Receipt'
                    }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Location</span>
                    <span class="detail-value">{{
                      getProjectLocation(selectedReceipt) || 'N/A'
                    }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Buyer</span>
                    <span class="detail-value">{{ getBuyerName(selectedReceipt) }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Seller</span>
                    <span class="detail-value">{{ getSellerName(selectedReceipt) }}</span>
                  </div>
                </div>
              </div>

              <div v-if="getProjectDescription(selectedReceipt)" class="detail-card">
                <h3>Description</h3>
                <p class="receipt-description">{{ getProjectDescription(selectedReceipt) }}</p>
              </div>

              <div class="receipt-actions receipt-actions-modal">
                <button class="btn btn-primary btn-sm" @click="downloadReceipt(selectedReceipt)">
                  Download PDF
                </button>
                <button class="btn btn-outline btn-sm" @click="closeReceiptDetails">
                  Close
                </button>
              </div>
            </div>
          </div>

          <div v-if="receipts.length === 0" class="empty-state">
            <div class="empty-icon">No receipts</div>
            <h3>No receipts yet</h3>
            <p>Purchase carbon credits to receive receipts</p>
            <button class="btn btn-primary" @click="$router.push('/marketplace')">
              Browse Marketplace
            </button>
          </div>

          <div v-else class="receipts-list list-scroll-y">
            <div
              v-for="receipt in shownReceipts"
              :key="receipt.id"
              class="receipt-card"
              :class="{ 'is-open': expandedReceipts.has(receipt.id) }"
            >
              <div class="receipt-header">
                <div class="receipt-icon">Receipt</div>
                <div class="receipt-info">
                  <h3 class="receipt-title">
                    {{ getProjectTitle(receipt) || 'Purchase Receipt' }}
                  </h3>
                  <p class="receipt-number">Receipt #{{ receipt.receipt_number || receipt.id }}</p>
                  <span class="receipt-date">{{
                    formatDate(receipt.issued_at || receipt.created_at)
                  }}</span>
                </div>
              </div>

              <!-- Phone only (hidden by CSS above 768px). A receipt card is six
                   label/value rows plus four buttons; at phone width a handful
                   of purchases became a page you scroll for a long time to get
                   past. Name and receipt number identify it; the rest opens on
                   request. -->
              <button
                type="button"
                class="details-toggle"
                :aria-expanded="expandedReceipts.has(receipt.id)"
                @click="toggleReceiptDetails(receipt.id)"
              >
                {{ expandedReceipts.has(receipt.id) ? 'Hide information' : 'See more information' }}
              </button>

              <div class="receipt-details">
                <div class="detail-row">
                  <span class="detail-label">Transaction ID:</span>
                  <span class="detail-value">#{{ receipt.transaction_id || receipt.id }}</span>
                </div>
                <div v-if="getProjectLocation(receipt)" class="detail-row">
                  <span class="detail-label">Project Location:</span>
                  <span class="detail-value">{{ getProjectLocation(receipt) }}</span>
                </div>
                <div v-if="getCreditsPurchased(receipt)" class="detail-row">
                  <span class="detail-label">Credits Purchased:</span>
                  <span class="detail-value">{{ formatNumber(getCreditsPurchased(receipt)) }}</span>
                </div>
                <div v-if="getTotalAmount(receipt)" class="detail-row">
                  <span class="detail-label">Total Amount:</span>
                  <span class="detail-value">{{
                    formatCurrency(getTotalAmount(receipt), getCurrency(receipt))
                  }}</span>
                </div>
                <div v-if="getPaymentMethod(receipt)" class="detail-row">
                  <span class="detail-label">Payment Method:</span>
                  <span class="detail-value">{{ getPaymentMethod(receipt) }}</span>
                </div>
                <div v-if="getStatus(receipt)" class="detail-row">
                  <span class="detail-label">Status:</span>
                  <span class="detail-value" :class="getStatus(receipt)">
                    {{ getStatusLabel(receipt) }}
                  </span>
                </div>
              </div>

              <div class="receipt-actions">
                <button class="btn btn-primary btn-sm" @click="downloadReceipt(receipt)">
                  Download PDF
                </button>
                <button
                  class="btn btn-outline btn-sm"
                  :disabled="invoicingId === (receipt.transaction_id || receipt.id)"
                  @click="downloadInvoice(receipt)"
                >
                  {{ invoicingId === (receipt.transaction_id || receipt.id) ? 'Preparing…' : 'VAT Invoice' }}
                </button>
                <button class="btn btn-outline btn-sm" @click="viewReceiptDetails(receipt)">
                  View Details
                </button>
                <button class="btn btn-ghost btn-sm" @click="reportProblem(receipt)">
                  Report a problem
                </button>
              </div>
            </div>
          </div>

          <div v-if="receipts.length > 0" class="list-footer">
            <span class="list-count">
              Showing {{ shownReceipts.length }} of {{ receipts.length }}
            </span>
            <div class="list-footer-actions">
              <button
                v-if="hasMore && !receiptsExpanded"
                class="see-more-btn"
                @click="showMore"
              >
                See more
              </button>
              <button v-if="receiptsExpanded" class="see-less-btn" @click="showLess">
                Show less
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Buyer-raised dispute on a specific purchase -->
    <DisputeModal
      v-if="disputeReceipt"
      :transaction-id="String(disputeReceipt.transaction_id || disputeReceipt.id || '')"
      :project-title="getProjectTitle(disputeReceipt) || 'Purchase'"
      :amount-label="formatCurrency(getTotalAmount(disputeReceipt), getCurrency(disputeReceipt))"
      @close="disputeReceipt = null"
      @opened="handleDisputeOpened"
    />

    <div v-if="disputeConfirmation" class="dispute-toast" role="status">
      <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
      <span>{{ disputeConfirmation }}</span>
      <router-link to="/disputes" class="dispute-toast__link">Track it</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { getUserReceipts, downloadReceipt as downloadReceiptFile } from '@/services/receiptService'
import { downloadVatInvoice } from '@/services/vatInvoiceService'
import DisputeModal from '@/components/account/DisputeModal.vue'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const receipts = ref([])
const loading = ref(false)
const error = ref('')

// Collapsed, the list shows the first few receipts in a single horizontal
// scroller so a long history stays compact and fits the screen; "See more"
// expands to the full vertical list.
const COLLAPSED_COUNT = 4
const receiptsExpanded = ref(false)
const shownReceipts = computed(() =>
  receiptsExpanded.value ? receipts.value : receipts.value.slice(0, COLLAPSED_COUNT),
)
const hasMore = computed(() => receipts.value.length > COLLAPSED_COUNT)

// Which cards have had "See more information" opened. Only consulted on phone
// widths — above 768px the details are always shown and the toggle is hidden.
const expandedReceipts = ref(new Set())
function toggleReceiptDetails(id) {
  const next = new Set(expandedReceipts.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedReceipts.value = next
}

function showMore() {
  receiptsExpanded.value = true
}

function showLess() {
  receiptsExpanded.value = false
}
const selectedReceipt = ref(null)
const invoicingId = ref(null)
const disputeReceipt = ref(null)
const disputeConfirmation = ref('')

function reportProblem(receipt) {
  disputeConfirmation.value = ''
  disputeReceipt.value = receipt
}

function handleDisputeOpened() {
  disputeReceipt.value = null
  disputeConfirmation.value = 'Report submitted — our team will review it.'
  setTimeout(() => {
    disputeConfirmation.value = ''
  }, 8000)
}

async function downloadInvoice(receipt) {
  const txId = receipt.transaction_id || receipt.id
  if (!txId || invoicingId.value) return
  invoicingId.value = txId
  try {
    await downloadVatInvoice(txId)
  } catch (err) {
    console.error('Error generating VAT invoice:', err)
    alert(err.message || 'Failed to generate the VAT invoice. Please try again.')
  } finally {
    invoicingId.value = null
  }
}

async function loadReceipts() {
  if (!userStore.session?.user?.id) {
    error.value = 'Please log in to view your receipts'
    return
  }

  loading.value = true
  error.value = ''

  try {
    const data = await getUserReceipts(userStore.session.user.id)
    receipts.value = data || []
    receiptsExpanded.value = false
    syncSelectedReceiptFromRoute()
  } catch (err) {
    console.error('Error loading receipts:', err)
    error.value = 'Failed to load receipts. Please try again.'
  } finally {
    loading.value = false
  }
}

async function downloadReceipt(receipt) {
  try {
    await downloadReceiptFile(receipt.id)
    alert(`Receipt ${receipt.receipt_number || receipt.id} downloaded successfully.`)
  } catch (err) {
    console.error('Error downloading receipt:', err)
    alert(err.message || 'Failed to download receipt. Please try again.')
  }
}

function viewReceiptDetails(receipt) {
  selectedReceipt.value = receipt
  router.replace({
    query: {
      ...route.query,
      receipt: receipt.id,
    },
  })
}

function closeReceiptDetails() {
  selectedReceipt.value = null
  const updatedQuery = { ...route.query }
  delete updatedQuery.receipt
  router.replace({ query: updatedQuery })
}

function syncSelectedReceiptFromRoute() {
  const receiptId = route.query.receipt
  if (!receiptId) {
    selectedReceipt.value = null
    return
  }

  selectedReceipt.value =
    receipts.value.find((receipt) => String(receipt.id) === String(receiptId)) || null
}

function getReceiptData(receipt) {
  if (!receipt?.receipt_data) return {}

  try {
    return typeof receipt.receipt_data === 'string'
      ? JSON.parse(receipt.receipt_data)
      : receipt.receipt_data
  } catch (parseError) {
    console.warn('Failed to parse receipt details:', parseError)
    return {}
  }
}

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function formatDateTime(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatCurrency(amount, currency = 'PHP') {
  const parsedAmount = parseCurrencyAmount(amount)
  if (parsedAmount === null) return 'N/A'
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
  }).format(parsedAmount)
}

function formatNumber(value) {
  const parsedNumber = parseCurrencyAmount(value)
  if (parsedNumber === null) return 'N/A'
  return parsedNumber.toLocaleString('en-US')
}

function parseCurrencyAmount(value) {
  if (value === null || value === undefined || value === '') return null

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const numericValue = String(value)
    .replace(/[^0-9.-]/g, '')
    .replace(/(\..*)\./g, '$1')

  if (!numericValue || numericValue === '-' || numericValue === '.' || numericValue === '-.') {
    return null
  }

  const parsed = Number(numericValue)
  return Number.isFinite(parsed) ? parsed : null
}

function getProjectTitle(receipt) {
  return (
    receipt.project_title ||
    getReceiptData(receipt)?.project?.title ||
    receipt.credit_transactions?.project_credits?.projects?.title ||
    null
  )
}

function getProjectLocation(receipt) {
  return (
    receipt.project_location ||
    getReceiptData(receipt)?.project?.location ||
    receipt.credit_transactions?.project_credits?.projects?.location ||
    null
  )
}

function getProjectDescription(receipt) {
  return (
    getReceiptData(receipt)?.project?.description ||
    receipt.credit_transactions?.project_credits?.projects?.description ||
    null
  )
}

function getCreditsPurchased(receipt) {
  return parseCurrencyAmount(
    receipt.credits_purchased ||
    getReceiptData(receipt)?.purchase?.creditsPurchased ||
    receipt.credit_transactions?.quantity ||
    null,
  )
}

function getTotalAmount(receipt) {
  return parseCurrencyAmount(
    receipt.total_amount ||
    getReceiptData(receipt)?.purchase?.totalAmount ||
    receipt.credit_transactions?.total_amount ||
    null,
  )
}

function getCurrency(receipt) {
  return (
    receipt.currency ||
    getReceiptData(receipt)?.purchase?.currency ||
    receipt.credit_transactions?.currency ||
    'PHP'
  )
}

function getPaymentMethod(receipt) {
  return (
    receipt.payment_method ||
    getReceiptData(receipt)?.purchase?.paymentMethod ||
    receipt.credit_transactions?.payment_method ||
    null
  )
}

function getStatus(receipt) {
  return (
    receipt.status ||
    getReceiptData(receipt)?.purchase?.status ||
    receipt.credit_transactions?.status ||
    null
  )
}

function getStatusLabel(receipt) {
  const status = getStatus(receipt)
  if (!status) return 'N/A'
  return status === 'completed' ? 'Completed' : status
}

function getBuyerName(receipt) {
  const receiptData = getReceiptData(receipt)
  return receiptData?.buyer?.name || receiptData?.buyer?.email || 'Buyer'
}

function getSellerName(receipt) {
  const receiptData = getReceiptData(receipt)
  return receiptData?.seller?.name || receiptData?.seller?.email || 'Seller'
}

onMounted(() => {
  loadReceipts()
})
</script>

<style scoped>
.receipt-view-page {
  min-height: 100vh;
  background: var(--bg-primary, #ffffff);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.page-header {
  background: var(--primary-color, #058526);
  padding: 1.25rem 0;
  border-bottom: none;
}

/* Left-aligned, matching the certificate page and every other banner. The two
   of them were the only centred headers in the app. */
.header-content {
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.header-text {
  text-align: left;
  width: 100%;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.35rem 0;
}

.page-description {
  color: #fff;
  font-size: 0.95rem;
  margin: 0;
}

/* Desktop shows every row; the toggle only exists for phone widths. */
.details-toggle {
  display: none;
}

.receipt-content {
  padding: 2rem 0;
}

.loading-state,
.error-state {
  text-align: center;
  padding: 4rem 2rem;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid var(--border-color, #d1e7dd);
  border-top-color: var(--primary-color, #058526);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.error-icon {
  font-size: 1rem;
  margin-bottom: 1rem;
  color: var(--text-muted, #64748b);
}

.empty-state {
  text-align: center;
  padding: 4rem 2rem;
}

.empty-icon {
  font-size: 1rem;
  margin-bottom: 1rem;
  color: var(--text-muted, #64748b);
}

.empty-state h3 {
  font-size: 1.5rem;
  color: var(--text-primary, #1a1a1a);
  margin: 0 0 0.5rem 0;
}

.empty-state p {
  color: var(--text-muted, #64748b);
  margin: 0 0 2rem 0;
}

.receipts-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

/* Compact vertically-scrollable area so a long history stays short and fits
   the screen; "See more" reveals the rest within the same scroll box. */
.receipts-list.list-scroll-y {
  max-height: 60vh;
  overflow-y: auto;
  padding-right: 0.25rem;
  -webkit-overflow-scrolling: touch;
}

/* See-more footer */
.list-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 1.5rem;
}
.list-count {
  font-size: 0.85rem;
  color: var(--text-muted, #64748b);
}
.list-footer-actions {
  display: flex;
  gap: 0.5rem;
}
.see-more-btn {
  padding: 0.5rem 1.1rem;
  background: var(--primary-color, #058526);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
}
.see-more-btn:hover {
  background: var(--primary-hover, #04701f);
}
.see-less-btn {
  padding: 0.5rem 1.1rem;
  background: #fff;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
}
.see-less-btn:hover {
  background: #f3f4f6;
}

.receipt-card {
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.75rem;
  padding: 1.5rem;
  transition: all 0.2s;
}

.receipt-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.receipt-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-light, #e8f5e8);
}

.receipt-icon {
  min-width: 4.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--primary-color, #058526);
}

.receipt-info {
  flex: 1;
}

.receipt-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
  margin: 0 0 0.25rem 0;
}

.receipt-number {
  display: block;
  color: var(--text-muted, #64748b);
  font-size: 0.875rem;
  margin: 0 0 0.25rem 0;
}

.receipt-date {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: var(--bg-secondary, #f8fdf8);
  color: var(--text-muted, #64748b);
  border-radius: 0.375rem;
  font-size: 0.75rem;
}

.receipt-details {
  margin-bottom: 1rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border-light, #e8f5e8);
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  color: var(--text-muted, #64748b);
  font-size: 0.875rem;
}

.detail-value {
  color: var(--text-primary, #1a1a1a);
  font-weight: 500;
  font-size: 0.875rem;
  text-align: right;
  min-width: 0;
  overflow-wrap: anywhere;
}

.detail-value.completed {
  color: var(--success-color, #058526);
}

.detail-break {
  word-break: break-all;
}

.receipt-actions {
  display: flex;
  gap: 0.5rem;
}

.receipt-actions-modal {
  justify-content: flex-end;
  margin-top: 1rem;
}

.receipt-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  z-index: 50;
}

.receipt-modal {
  width: min(900px, 100%);
  max-height: calc(100vh - 3rem);
  overflow-y: auto;
  background: #fff;
  border-radius: 1rem;
  padding: 1.5rem;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
}

.receipt-modal-header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.receipt-modal-header h2 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--text-primary, #1a1a1a);
}

.receipt-modal-header p {
  margin: 0.35rem 0 0;
  color: var(--text-muted, #64748b);
}

.receipt-modal-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.detail-card {
  background: var(--bg-secondary, #f8fdf8);
  border: 1px solid var(--border-light, #e8f5e8);
  border-radius: 0.75rem;
  padding: 1rem;
}

.detail-card h3 {
  margin: 0 0 0.75rem;
  color: var(--text-primary, #1a1a1a);
}

.receipt-description {
  margin: 0;
  color: var(--text-primary, #1a1a1a);
  line-height: 1.6;
}

.btn {
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-primary {
  background: var(--primary-color, #058526);
  color: white;
}

.btn-primary:hover {
  background: var(--primary-hover, #04701f);
}

.btn-outline {
  background: transparent;
  border: 1px solid var(--border-color, #d1e7dd);
  color: var(--text-primary, #1a1a1a);
}

.btn-outline:hover {
  background: var(--bg-secondary, #f8fdf8);
}

.btn-ghost {
  background: transparent;
  color: var(--text-muted, #64748b);
  border: none;
}

.btn-ghost:hover {
  color: var(--text-primary, #1a1a1a);
}

.btn-sm {
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
}

.dispute-toast {
  position: fixed;
  left: 50%;
  bottom: 1.5rem;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: #064e3b;
  color: #fff;
  padding: 0.75rem 1.1rem;
  border-radius: 999px;
  font-size: 0.875rem;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 1100;
}

.dispute-toast__link {
  color: #a7f3d0;
  font-weight: 700;
  text-decoration: underline;
}

@media (max-width: 768px) {
  .container {
    padding: 0 1rem;
  }

  .receipt-modal {
    padding: 1rem;
  }

  .receipt-modal-grid {
    grid-template-columns: 1fr;
  }

  .receipt-modal-header,
  .receipt-actions,
  .detail-row {
    flex-direction: column;
  }

  .detail-value {
    text-align: left;
  }

  /* Name + receipt number is the whole card until asked otherwise. */
  .details-toggle {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0;
    border: none;
    background: none;
    color: var(--primary-color, #058526);
    font-family: inherit;
    font-size: 0.78rem;
    font-weight: 700;
    cursor: pointer;
  }

  .receipt-card .receipt-details {
    display: none;
  }

  .receipt-card.is-open .receipt-details {
    display: block;
    margin-top: 0.5rem;
  }

  .receipt-card {
    padding: 0.85rem;
  }

  .receipt-title {
    font-size: 0.95rem;
  }

  /* Four buttons in a column is most of a phone screen; two per row is not. */
  .receipt-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.4rem;
  }

  .receipt-actions .btn {
    width: 100%;
    padding: 0.4rem 0.4rem;
    font-size: 0.78rem;
  }
}
</style>
