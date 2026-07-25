<template>
  <div class="certificate-view-page">
    <!-- Page Header -->
    <div class="page-header">
      <div class="container">
        <div class="header-content">
          <div class="header-text">
            <h1 class="page-title">My Certificates</h1>
            <p class="page-description">View and download your carbon credit certificates</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="certificate-content">
      <div class="container">
        <!-- Loading State -->
        <div v-if="loading" class="loading-state">
          <div class="loading-spinner"></div>
          <p>Loading your certificates...</p>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="error-state">
          <div class="error-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M12 3.25 3.75 19.5h16.5L12 3.25Z" stroke-linejoin="round" />
              <path d="M12 9v4.5" stroke-linecap="round" />
              <circle cx="12" cy="17" r="0.75" fill="currentColor" stroke="none" />
            </svg>
          </div>
          <h3>Unable to load certificates</h3>
          <p>{{ error }}</p>
          <button class="btn btn-primary" @click="loadCertificates">Try Again</button>
        </div>

        <!-- Certificates Content -->
        <div v-else>
          <!-- Empty State -->
          <div v-if="certificates.length === 0" class="empty-state">
            <div class="empty-icon" aria-hidden="true">
              <span class="material-symbols-outlined">contract</span>
            </div>
            <h3>No certificates yet</h3>
            <p>Purchase carbon credits to receive certificates</p>
            <button class="btn btn-primary" @click="$router.push('/marketplace')">
              Browse Marketplace
            </button>
          </div>

          <!-- Certificates List + Detail View -->
          <div v-else class="certificates-layout">
            <div class="certificate-list">
              <button
                v-for="certificate in certificates"
                :key="certificate.id"
                class="certificate-list-item"
                :class="{ active: certificate.id === selectedCertificate?.id }"
                @click="handleCertificateSelect(certificate)"
              >
                <span class="certificate-list-title">
                  {{ certificate.project_title || certificate.certificate_data?.project_title || 'Untitled Certificate' }}
                </span>
                <span class="certificate-list-meta">
                  Cert #{{ certificate.certificate_number || certificate.id }}
                </span>
              </button>
            </div>

            <div v-if="!isMobile" class="certificate-detail-area">
              <div v-if="selectedCertificate" class="certificate-card">
                <div class="certificate-header">
                  <div class="certificate-icon" aria-hidden="true">
                    <span class="material-symbols-outlined">award_star</span>
                  </div>
                  <div class="certificate-info">
                    <h3 class="certificate-title">{{ selectedCertificate.project_title }}</h3>
                    <p class="certificate-location">
                      <span class="material-symbols-outlined" aria-hidden="true">location_on</span>
                      <span>{{ selectedCertificate.project_location }}</span>
                    </p>
                    <span class="certificate-number">Cert #{{ selectedCertificate.certificate_number }}</span>
                  </div>
                </div>

                <div class="certificate-details">
                  <div class="detail-row highlight-row">
                    <span class="detail-label">Beneficiary:</span>
                    <span class="detail-value highlight-value">{{
                      selectedCertificate.beneficiary_name ||
                        selectedCertificate.certificate_data?.beneficiary_name ||
                        'Not specified'
                    }}</span>
                  </div>

                  <div
                    v-if="selectedCertificate.project_description || selectedCertificate.certificate_data?.project_description"
                    class="detail-row"
                  >
                    <span class="detail-label">Project Description:</span>
                    <span class="detail-value description-value">{{
                      selectedCertificate.project_description ||
                      selectedCertificate.certificate_data?.project_description
                    }}</span>
                  </div>

                  <div class="detail-row highlight-row">
                    <span class="detail-label">Tonnes of CO₂ Retired:</span>
                    <span class="detail-value highlight-value">{{
                      (selectedCertificate.tonnes_co2 ||
                       selectedCertificate.certificate_data?.tonnes_co2 ||
                       selectedCertificate.credits_quantity || 0).toLocaleString()
                    }} tonnes CO₂</span>
                  </div>

                  <div
                    v-if="selectedCertificate.purpose || selectedCertificate.certificate_data?.purpose"
                    class="detail-row"
                  >
                    <span class="detail-label">{{
                      selectedCertificate.certificate_type === 'retirement' ? 'Purpose of Retirement:' : 'Purpose:'
                    }}</span>
                    <span class="detail-value">{{
                      selectedCertificate.purpose || selectedCertificate.certificate_data?.purpose
                    }}</span>
                  </div>

                  <div class="detail-row">
                    <span class="detail-label">Transaction ID:</span>
                    <span class="detail-value transaction-id">{{
                      selectedCertificate.transaction_id_ref ||
                      selectedCertificate.certificate_data?.transaction_id_ref ||
                      selectedCertificate.transaction_id ||
                      'N/A'
                    }}</span>
                  </div>

                  <div
                    v-if="
                      selectedCertificate.wallet_address ||
                      selectedCertificate.certificate_data?.wallet_address ||
                      selectedCertificate.payment_reference ||
                      selectedCertificate.certificate_data?.payment_reference
                    "
                    class="detail-row verification-row"
                  >
                    <span class="detail-label">✓ Onchain Verification:</span>
                    <span class="detail-value verification-value">
                      {{ selectedCertificate.wallet_address || selectedCertificate.certificate_data?.wallet_address ? 'Verified via wallet' : 'Verified via payment reference' }}
                    </span>
                  </div>

                  <div class="detail-row highlight-row">
                    <span class="detail-label">Purchase Date & Time:</span>
                    <span class="detail-value highlight-value">{{
                      formatDate(
                        selectedCertificate.purchase_date ||
                          selectedCertificate.purchase_datetime ||
                          selectedCertificate.certificate_data?.purchase_date ||
                          selectedCertificate.certificate_data?.purchase_datetime ||
                          selectedCertificate.timestamp ||
                          selectedCertificate.issued_at,
                      )
                    }}</span>
                  </div>

                  <div class="detail-row">
                    <span class="detail-label">Certificate Issued:</span>
                    <span class="detail-value">
                      {{ formatDate(selectedCertificate.issued_at || selectedCertificate.timestamp) }}
                    </span>
                  </div>

                  <div
                    v-if="selectedCertificate.wallet_address || selectedCertificate.certificate_data?.wallet_address"
                    class="detail-row"
                  >
                    <span class="detail-label">Wallet Address:</span>
                    <span class="detail-value wallet-address">{{
                      selectedCertificate.wallet_address || selectedCertificate.certificate_data?.wallet_address
                    }}</span>
                  </div>

                  <div
                    v-if="selectedCertificate.credit_serial || selectedCertificate.certificate_data?.credit_serial"
                    class="detail-row"
                  >
                    <span class="detail-label">Carbon Unit Serial:</span>
                    <span class="detail-value transaction-id">{{
                      selectedCertificate.credit_serial || selectedCertificate.certificate_data?.credit_serial
                    }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Category:</span>
                    <span class="detail-value">{{ selectedCertificate.project_category }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Credits:</span>
                    <span class="detail-value">{{
                      selectedCertificate.credits_quantity.toLocaleString()
                    }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Vintage Year:</span>
                    <span class="detail-value">{{ selectedCertificate.vintage_year }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Standard:</span>
                    <span class="detail-value">{{ selectedCertificate.verification_standard }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value" :class="selectedCertificate.status">
                      {{ selectedCertificate.status === 'active' ? 'Active' : 'Inactive' }}
                    </span>
                  </div>
                </div>

                <div class="certificate-actions">
                  <button class="btn btn-primary btn-sm" @click="downloadReceiptForCertificate(selectedCertificate)">
                    Download Receipt
                  </button>
                  <button class="btn btn-outline btn-sm" @click="downloadCertificate(selectedCertificate)">
                    Download PDF
                  </button>
                  <button class="btn btn-outline btn-sm" @click="openVerification(selectedCertificate)">
                    Verify
                  </button>
                  <button class="btn btn-outline btn-sm" @click="shareCertificate(selectedCertificate)">
                    {{ sharedCertificate === selectedCertificate.certificate_number ? 'Link copied' : 'Share proof' }}
                  </button>
                </div>
              </div>

              <div v-else class="certificate-placeholder">
                <div class="placeholder-icon" aria-hidden="true">
                  <span class="material-symbols-outlined">description</span>
                </div>
                <h3>Select a certificate</h3>
                <p>Choose a certificate from the list to view details.</p>
              </div>
            </div>
          </div>

          <div
            v-if="isMobile && mobileDetailOpen && selectedCertificate"
            class="mobile-certificate-overlay"
            @click.self="closeMobileDetail"
          >
            <div class="mobile-certificate-panel">
              <div class="mobile-detail-header">
                <h3>Certificate Details</h3>
                <button type="button" class="mobile-close-btn" @click="closeMobileDetail">
                  <span class="material-symbols-outlined" aria-hidden="true">close</span>
                </button>
              </div>

              <div class="certificate-card mobile-certificate-card">
                <div class="certificate-header">
                  <div class="certificate-icon" aria-hidden="true">
                    <span class="material-symbols-outlined">award_star</span>
                  </div>
                  <div class="certificate-info">
                    <h3 class="certificate-title">{{ selectedCertificate.project_title }}</h3>
                    <p class="certificate-location">
                      <span class="material-symbols-outlined" aria-hidden="true">location_on</span>
                      <span>{{ selectedCertificate.project_location }}</span>
                    </p>
                    <span class="certificate-number">Cert #{{ selectedCertificate.certificate_number }}</span>
                  </div>
                </div>

                <div class="certificate-details">
                  <div class="detail-row highlight-row">
                    <span class="detail-label">Beneficiary:</span>
                    <span class="detail-value highlight-value">{{
                      selectedCertificate.beneficiary_name ||
                        selectedCertificate.certificate_data?.beneficiary_name ||
                        'Not specified'
                    }}</span>
                  </div>

                  <div
                    v-if="selectedCertificate.project_description || selectedCertificate.certificate_data?.project_description"
                    class="detail-row"
                  >
                    <span class="detail-label">Project Description:</span>
                    <span class="detail-value description-value">{{
                      selectedCertificate.project_description ||
                      selectedCertificate.certificate_data?.project_description
                    }}</span>
                  </div>

                  <div class="detail-row highlight-row">
                    <span class="detail-label">Tonnes of CO₂ Retired:</span>
                    <span class="detail-value highlight-value">{{
                      (selectedCertificate.tonnes_co2 ||
                       selectedCertificate.certificate_data?.tonnes_co2 ||
                       selectedCertificate.credits_quantity || 0).toLocaleString()
                    }} tonnes CO₂</span>
                  </div>

                  <div
                    v-if="selectedCertificate.purpose || selectedCertificate.certificate_data?.purpose"
                    class="detail-row"
                  >
                    <span class="detail-label">{{
                      selectedCertificate.certificate_type === 'retirement' ? 'Purpose of Retirement:' : 'Purpose:'
                    }}</span>
                    <span class="detail-value">{{
                      selectedCertificate.purpose || selectedCertificate.certificate_data?.purpose
                    }}</span>
                  </div>

                  <div class="detail-row">
                    <span class="detail-label">Transaction ID:</span>
                    <span class="detail-value transaction-id">{{
                      selectedCertificate.transaction_id_ref ||
                      selectedCertificate.certificate_data?.transaction_id_ref ||
                      selectedCertificate.transaction_id ||
                      'N/A'
                    }}</span>
                  </div>

                  <div
                    v-if="
                      selectedCertificate.wallet_address ||
                      selectedCertificate.certificate_data?.wallet_address ||
                      selectedCertificate.payment_reference ||
                      selectedCertificate.certificate_data?.payment_reference
                    "
                    class="detail-row verification-row"
                  >
                    <span class="detail-label">✓ Onchain Verification:</span>
                    <span class="detail-value verification-value">
                      {{ selectedCertificate.wallet_address || selectedCertificate.certificate_data?.wallet_address ? 'Verified via wallet' : 'Verified via payment reference' }}
                    </span>
                  </div>

                  <div class="detail-row highlight-row">
                    <span class="detail-label">Purchase Date & Time:</span>
                    <span class="detail-value highlight-value">{{
                      formatDate(
                        selectedCertificate.purchase_date ||
                          selectedCertificate.purchase_datetime ||
                          selectedCertificate.certificate_data?.purchase_date ||
                          selectedCertificate.certificate_data?.purchase_datetime ||
                          selectedCertificate.timestamp ||
                          selectedCertificate.issued_at,
                      )
                    }}</span>
                  </div>

                  <div class="detail-row">
                    <span class="detail-label">Certificate Issued:</span>
                    <span class="detail-value">
                      {{ formatDate(selectedCertificate.issued_at || selectedCertificate.timestamp) }}
                    </span>
                  </div>

                  <div
                    v-if="selectedCertificate.wallet_address || selectedCertificate.certificate_data?.wallet_address"
                    class="detail-row"
                  >
                    <span class="detail-label">Wallet Address:</span>
                    <span class="detail-value wallet-address">{{
                      selectedCertificate.wallet_address || selectedCertificate.certificate_data?.wallet_address
                    }}</span>
                  </div>

                  <div
                    v-if="selectedCertificate.credit_serial || selectedCertificate.certificate_data?.credit_serial"
                    class="detail-row"
                  >
                    <span class="detail-label">Carbon Unit Serial:</span>
                    <span class="detail-value transaction-id">{{
                      selectedCertificate.credit_serial || selectedCertificate.certificate_data?.credit_serial
                    }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Category:</span>
                    <span class="detail-value">{{ selectedCertificate.project_category }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Credits:</span>
                    <span class="detail-value">{{
                      selectedCertificate.credits_quantity.toLocaleString()
                    }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Vintage Year:</span>
                    <span class="detail-value">{{ selectedCertificate.vintage_year }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Standard:</span>
                    <span class="detail-value">{{ selectedCertificate.verification_standard }}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Status:</span>
                    <span class="detail-value" :class="selectedCertificate.status">
                      {{ selectedCertificate.status === 'active' ? 'Active' : 'Inactive' }}
                    </span>
                  </div>
                </div>

                <div class="certificate-actions">
                  <button class="btn btn-primary btn-sm" @click="downloadReceiptForCertificate(selectedCertificate)">
                    Download Receipt
                  </button>
                  <button class="btn btn-outline btn-sm" @click="downloadCertificate(selectedCertificate)">
                    Download PDF
                  </button>
                  <button class="btn btn-outline btn-sm" @click="openVerification(selectedCertificate)">
                    Verify
                  </button>
                  <button class="btn btn-outline btn-sm" @click="shareCertificate(selectedCertificate)">
                    {{ sharedCertificate === selectedCertificate.certificate_number ? 'Link copied' : 'Share proof' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { getUserCertificates } from '@/services/certificateService'
import { getUserReceipts, downloadReceipt as downloadReceiptFile } from '@/services/receiptService'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

// Data
const certificates = ref([])
const loading = ref(false)
const error = ref('')
const selectedCertificate = ref(null)
/** Certificate number whose link was just copied — drives the button's confirmation. */
const sharedCertificate = ref('')
const isMobile = ref(typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
const mobileDetailOpen = ref(false)

function updateMobileState() {
  if (typeof window === 'undefined') return
  isMobile.value = window.innerWidth <= 768
  if (!isMobile.value) {
    mobileDetailOpen.value = false
  }
}

// Methods
async function loadCertificates() {
  if (!userStore.session?.user?.id) {
    error.value = 'Please log in to view your certificates'
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
    const data = await Promise.race([
      getUserCertificates(userStore.session.user.id),
      timeoutPromise,
    ])
    certificates.value = data || []
    console.log('Certificates loaded:', certificates.value.length)

    const certParam = route.query.cert ? String(route.query.cert) : null
    if (certParam && certificates.value.length > 0) {
      const matchedCertificate =
        certificates.value.find(
          (cert) =>
            String(cert.certificate_number) === certParam || String(cert.id) === certParam,
        ) || null
      if (matchedCertificate) {
        openCertificateDetail(matchedCertificate, false)
      }
    } else if (!selectedCertificate.value && certificates.value.length > 0) {
      openCertificateDetail(certificates.value[0], false)
    }
    
    // If no certificates found, try generating missing ones for existing purchases
    if (certificates.value.length === 0) {
      console.log('No certificates found, checking for missing entries...')
      try {
        const { generateMissingCertificates } = await import('@/services/certificateService')
        // Add timeout for certificate generation
        const genTimeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Certificate generation timeout')), 30000)
        )
        const result = await Promise.race([
          generateMissingCertificates(userStore.session.user.id),
          genTimeoutPromise,
        ])
        if (result.generated > 0) {
          console.log(`Generated ${result.generated} missing certificates, reloading...`)
          // Reload certificates after generation with timeout
          const reloadTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Reload timeout')), 30000)
          )
          const reloadedData = await Promise.race([
            getUserCertificates(userStore.session.user.id),
            reloadTimeoutPromise,
          ])
          certificates.value = reloadedData || []
          console.log('Certificates reloaded after generation:', certificates.value.length)
          if (certificates.value.length > 0) {
            openCertificateDetail(certificates.value[0], false)
          }
        }
      } catch (genErr) {
        console.warn('Could not generate missing certificates:', genErr)
        // Don't fail the whole load if generation fails
      }
    }
  } catch (err) {
    console.error('Error loading certificates:', err)
    if (err.message?.includes('timeout')) {
      error.value = 'Request timed out. Please check your connection and try again.'
    } else {
      error.value = 'Failed to load certificates. Please try again.'
    }
    certificates.value = []
  } finally {
    loading.value = false
  }
}

function openCertificateDetail(certificate, shouldUpdateRoute = true) {
  selectedCertificate.value = certificate

  if (!shouldUpdateRoute) return

  const certIdentifier = certificate.certificate_number || certificate.id
  const updatedQuery = { ...route.query }

  if (certIdentifier) {
    updatedQuery.cert = certIdentifier
  } else {
    delete updatedQuery.cert
  }

  router.replace({
    query: updatedQuery,
  })
}

function handleCertificateSelect(certificate) {
  openCertificateDetail(certificate)
  if (isMobile.value) {
    mobileDetailOpen.value = true
  }
}

function closeMobileDetail() {
  mobileDetailOpen.value = false
}

async function downloadReceiptForCertificate(certificate) {
  try {
    const userId = userStore.session?.user?.id
    if (!userId) {
      throw new Error('Please log in to download your receipt.')
    }

    const receipts = await getUserReceipts(userId)
    const transactionId = certificate?.transaction_id || certificate?.transaction_id_ref

    const matchedReceipt = (receipts || []).find((receipt) => {
      if (!transactionId) return false
      return String(receipt.transaction_id) === String(transactionId)
    })

    if (!matchedReceipt?.id) {
      await router.push('/receipts')
      alert('Receipt was not found for this certificate. Please check your Receipts page.')
      return
    }

    await downloadReceiptFile(matchedReceipt.id)
    alert('Receipt downloaded successfully!')
  } catch (err) {
    console.error('Error downloading receipt:', err)
    alert(err.message || 'Failed to download receipt. Please try again.')
  }
}

function openVerification(certificate) {
  const number = certificate?.certificate_number
  if (!number) {
    alert('This certificate does not have a verification number yet.')
    return
  }
  // Open the public verification page in a new tab
  const url = router.resolve(`/verify/${encodeURIComponent(number)}`).href
  window.open(url, '_blank', 'noopener')
}

/** Absolute, publicly-resolvable URL for a certificate's verification page. */
function verificationUrl(number) {
  const path = router.resolve(`/verify/${encodeURIComponent(number)}`).href
  return new URL(path, window.location.origin).toString()
}

/**
 * Share the public proof of an offset. This is the one artifact an ESG buyer
 * actually wants to show other people, and until now the verification URL was
 * built internally but never handed to them.
 *
 * Uses the native share sheet where available (mobile), otherwise copies the
 * link — both end with the buyer holding a shareable URL.
 */
async function shareCertificate(certificate) {
  const number = certificate?.certificate_number
  if (!number) {
    alert('This certificate does not have a verification number yet.')
    return
  }

  const url = verificationUrl(number)
  const shareData = {
    title: 'Verified carbon offset',
    text: `Carbon credit retirement certificate ${number}, verifiable on Carbonify.`,
    url,
  }

  try {
    if (navigator.share) {
      await navigator.share(shareData)
      return
    }
    await navigator.clipboard.writeText(url)
    sharedCertificate.value = number
    setTimeout(() => {
      if (sharedCertificate.value === number) sharedCertificate.value = ''
    }, 3000)
  } catch (err) {
    // AbortError = the user dismissed the share sheet; not a failure.
    if (err?.name === 'AbortError') return
    console.error('Failed to share certificate:', err)
    window.prompt('Copy this verification link:', url)
  }
}

async function downloadCertificate(certificate) {
  try {
    console.log('Starting certificate download:', certificate.certificate_number)
    
    if (!certificate || !certificate.certificate_number) {
      throw new Error('Invalid certificate data')
    }
    
    // Try to load transaction data for the certificate
    let transaction = null
    try {
      const supabase = (await import('@/services/supabaseClient')).getSupabase()
      if (certificate.transaction_id) {
        const { data } = await supabase
          .from('credit_transactions')
          .select('*')
          .eq('id', certificate.transaction_id)
          .single()
        transaction = data
        console.log('Transaction data loaded for certificate')
      }
    } catch (err) {
      console.warn('Could not load transaction data (non-critical):', err)
    }

    // Use PDF generation service if available, otherwise fallback
    try {
      console.log('Attempting PDF generation...')
      const { generateCertificatePDF } = await import('@/services/certificatePdfService')
      const filename = await generateCertificatePDF(certificate, transaction)
      console.log('Certificate PDF downloaded:', filename)
      alert('Certificate downloaded successfully!')
    } catch (pdfError) {
      console.error('PDF generation error:', pdfError)
      console.log('Falling back to text certificate...')
      
      // Fallback: Create a comprehensive text-based certificate
      const beneficiaryName = certificate.beneficiary_name || 
                             certificate.certificate_data?.beneficiary_name || 
                             'Unknown'
      const projectDescription = certificate.project_description || 
                                 certificate.certificate_data?.project_description || 
                                 ''
      const tonnesCO2 = certificate.tonnes_co2 || 
                       certificate.certificate_data?.tonnes_co2 || 
                       certificate.credits_quantity || 0
      const purpose = certificate.purpose || 
                     certificate.certificate_data?.purpose || 
                     (certificate.certificate_type === 'retirement' ? 'Carbon Offset' : 'Carbon Credit Purchase')
      const transactionId = certificate.transaction_id_ref || 
                           certificate.certificate_data?.transaction_id_ref || 
                           certificate.transaction_id || 
                           'N/A'
      const walletAddress = certificate.wallet_address || 
                           certificate.certificate_data?.wallet_address || 
                           'Not linked to a wallet'
      const purchaseDateTime = certificate.purchase_date || 
                               certificate.purchase_datetime || 
                               certificate.certificate_data?.purchase_date || 
                               certificate.certificate_data?.purchase_datetime || 
                               certificate.timestamp || 
                               certificate.issued_at
      
      const certText = `
═══════════════════════════════════════════════════════════
        CERTIFICATE OF CARBON CREDIT
═══════════════════════════════════════════════════════════

Certificate Number: ${certificate.certificate_number}
Issued Date: ${formatDate(certificate.issued_at || certificate.timestamp)}

This certifies that:

BENEFICIARY: ${beneficiaryName}

PROJECT INFORMATION:
───────────────────────────────────────────────────────────
Project Name: ${certificate.project_title || 'Unknown Project'}
Project Description: ${projectDescription || 'N/A'}
Category: ${certificate.project_category || 'Unknown'}
Location: ${certificate.project_location || 'Unknown'}
Vintage Year: ${certificate.vintage_year || 'N/A'}
Verification Standard: ${certificate.verification_standard || 'Unknown'}

CARBON CREDITS:
───────────────────────────────────────────────────────────
Tonnes of CO₂ Retired: ${tonnesCO2.toLocaleString()} tonnes CO₂
Credits Quantity: ${certificate.credits_quantity || 0}

PURPOSE:
───────────────────────────────────────────────────────────
${purpose}

TRANSACTION & VERIFICATION:
───────────────────────────────────────────────────────────
Transaction ID: ${transactionId}
Wallet Address: ${walletAddress}

PURCHASE INFORMATION:
───────────────────────────────────────────────────────────
Purchase Date & Time: ${formatDate(purchaseDateTime)}
Certificate Issued: ${formatDate(certificate.issued_at || certificate.timestamp)}

═══════════════════════════════════════════════════════════
This certificate is issued by Carbonify and verifies the 
ownership/retirement of carbon credits.

For verification, visit: https://carbonify.com/verify
═══════════════════════════════════════════════════════════
      `.trim()
      
      const blob = new Blob([certText], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `certificate-${certificate.certificate_number}.txt`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      console.log('Text certificate downloaded as fallback')
      alert('Certificate downloaded as text file (PDF generation unavailable)')
    }
  } catch (err) {
    console.error('Error downloading certificate:', err)
    alert(`Failed to download certificate: ${err.message || 'Unknown error'}. Please try again.`)
  }
}

watch(
  certificates,
  (newCertificates) => {
    if (newCertificates.length === 0) {
      selectedCertificate.value = null
      return
    }

    if (
      selectedCertificate.value &&
      !newCertificates.some((cert) => cert.id === selectedCertificate.value.id)
    ) {
      selectedCertificate.value = null
    }
  },
  { immediate: false },
)

watch(
  () => route.query.cert,
  (newCert) => {
    const certParam = newCert ? String(newCert) : null

    if (!certParam) {
      if (!selectedCertificate.value && certificates.value.length > 0) {
        selectedCertificate.value = certificates.value[0]
      }
      return
    }

    if (
      selectedCertificate.value &&
      (String(selectedCertificate.value.certificate_number) === certParam ||
        String(selectedCertificate.value.id) === certParam)
    ) {
      return
    }

    const matchedCertificate =
      certificates.value.find(
        (cert) =>
          String(cert.certificate_number) === certParam || String(cert.id) === certParam,
      ) || null

    if (matchedCertificate) {
      openCertificateDetail(matchedCertificate, false)
    }
  },
)

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Lifecycle
onMounted(() => {
  updateMobileState()
  if (typeof window !== 'undefined') {
    window.addEventListener('resize', updateMobileState)
  }
  loadCertificates()
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('resize', updateMobileState)
  }
})
</script>

<style scoped>
.certificate-view-page {
  min-height: 100vh;
  background: var(--bg-primary, #ffffff);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

/* Page Header */
.page-header {
  background: var(--primary-color, #058526);
  padding: 1.25rem 0;
  border-bottom: none;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: center;
}

.header-text {
  text-align: center;
  width: 100%;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.5rem 0;
}

.page-description {
  color: #fff;
  margin: 0;
}

/* Main Content */
.certificate-content {
  padding: 2rem 0;
}

/* Loading State */
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
  width: 3.25rem;
  height: 3.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid rgba(220, 38, 38, 0.25);
  color: #dc2626;
  margin: 0 auto 1rem;
}

.error-icon svg {
  width: 1.9rem;
  height: 1.9rem;
}

/* Empty State */
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
}

.empty-icon {
  width: 3.5rem;
  height: 3.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 1rem;
  background: rgba(15, 23, 42, 0.12);
  color: #0f172a;
  margin-bottom: 1rem;
}

.empty-icon .material-symbols-outlined {
  font-size: 2.2rem;
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

/* Certificates Layout */
.certificates-layout {
  display: grid;
  grid-template-columns: minmax(220px, 320px) 1fr;
  gap: 1.5rem;
  align-items: flex-start;
}

.certificate-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  background: var(--bg-secondary, #f8fdf8);
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.75rem;
  padding: 1rem;
  max-height: 70vh;
  overflow-y: auto;
}

.certificate-list-item {
  display: flex;
  align-items: center;
  padding: 0.75rem 0.875rem;
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--border-light, #e8f5e8);
  border-radius: 0.5rem;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: left;
}

.certificate-list-item:hover {
  border-color: var(--primary-color, #058526);
  color: var(--primary-color, #058526);
  transform: translateX(4px);
}

.certificate-list-item.active {
  background: var(--primary-light, #e8f5e8);
  border-color: var(--primary-color, #058526);
  color: var(--primary-color, #058526);
  box-shadow: 0 2px 8px rgba(5, 133, 38, 0.15);
}

.certificate-list-title {
  flex: 1;
  font-size: 0.95rem;
}

.certificate-list-meta {
  margin-top: 0.3rem;
  color: var(--text-muted, #64748b);
  font-size: 0.78rem;
  font-weight: 500;
}

.certificate-detail-area {
  min-height: 400px;
}

.certificate-card {
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.75rem;
  padding: 1.5rem;
  transition: all 0.2s;
}

.certificate-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  transform: translateY(-2px);
}

.certificate-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: var(--bg-secondary, #f8fdf8);
  border: 1px dashed var(--border-color, #d1e7dd);
  border-radius: 0.75rem;
  padding: 2rem;
  min-height: 360px;
  text-align: center;
  color: var(--text-muted, #64748b);
}

.placeholder-icon {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.08);
  color: #0f172a;
  margin-bottom: 0.75rem;
}

.placeholder-icon .material-symbols-outlined {
  font-size: 2rem;
}

.certificate-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border-light, #e8f5e8);
}

.certificate-icon {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.75rem;
  background: rgba(15, 23, 42, 0.12);
  color: #0f172a;
}

.certificate-icon .material-symbols-outlined {
  font-size: 1.9rem;
}

.certificate-info {
  flex: 1;
}

.certificate-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
  margin: 0 0 0.25rem 0;
}

.certificate-location {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  color: #6b7280;
  font-size: 0.95rem;
  margin: 0.25rem 0;
}

.certificate-location .material-symbols-outlined {
  font-size: 1.05rem;
}

.certificate-number {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background: var(--primary-light, #e8f5e8);
  color: var(--primary-color, #058526);
  border-radius: 0.375rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.certificate-details {
  margin-bottom: 1rem;
}

.detail-row {
  display: flex;
  justify-content: space-between;
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
  word-break: break-word;
}

.detail-value.active {
  color: var(--success-color, #058526);
}

.detail-row.highlight-row {
  background: var(--primary-light, #e8f5e8);
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin: 0.5rem 0;
}

.detail-value.highlight-value {
  color: var(--primary-color, #058526);
  font-weight: 600;
  font-size: 0.9375rem;
}

.detail-value.description-value {
  font-style: italic;
  color: var(--text-muted, #64748b);
  line-height: 1.5;
}

.detail-value.transaction-id {
  font-family: 'Courier New', monospace;
  font-size: 0.8125rem;
  color: var(--text-primary, #1a1a1a);
}

.detail-row.verification-row {
  background: var(--success-light, #d1fae5);
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin: 0.5rem 0;
}

.detail-value.verification-value {
  color: var(--success-color, #058526);
  font-weight: 600;
}

.detail-value.wallet-address {
  font-family: 'Courier New', monospace;
  font-size: 0.8125rem;
  word-break: break-all;
}

.certificate-actions {
  display: flex;
  gap: 0.5rem;
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

/* Responsive */
@media (max-width: 768px) {
  .container {
    padding: 0 1rem;
  }

  .certificates-layout {
    grid-template-columns: 1fr;
  }

  .certificate-list {
    max-height: none;
  }

  .certificate-list-item {
    transform: none !important;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.15rem;
  }

  .certificate-detail-area {
    display: none;
  }
}

.mobile-certificate-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.mobile-certificate-panel {
  width: 100%;
  max-width: 640px;
  background: #ffffff;
  border-top-left-radius: 16px;
  border-top-right-radius: 16px;
  max-height: 88vh;
  overflow-y: auto;
  padding: 0.85rem;
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.2);
}

.mobile-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  padding: 0.35rem 0.25rem;
}

.mobile-detail-header h3 {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary, #1a1a1a);
}

.mobile-close-btn {
  border: none;
  background: transparent;
  color: var(--text-primary, #1a1a1a);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.mobile-close-btn .material-symbols-outlined {
  font-size: 1.3rem;
}

.mobile-certificate-card {
  margin-bottom: 0.5rem;
}
</style>
