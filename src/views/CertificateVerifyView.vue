<template>
  <div class="verify-page">
    <!-- Page Header -->
    <div class="page-header">
      <div class="container">
        <div class="header-content">
          <div class="header-text">
            <h1 class="page-title">Certificate Verification</h1>
            <p class="page-description">
              Confirm that an Carbonify carbon credit certificate is genuine
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="verify-content">
      <div class="container">
        <!-- Lookup form -->
        <form class="lookup-form" @submit.prevent="lookup">
          <label for="certNumber" class="lookup-label">Certificate Number</label>
          <div class="lookup-row">
            <input
              id="certNumber"
              v-model="certNumber"
              type="text"
              class="lookup-input"
              placeholder="e.g., CERT-1700000000000-ABC123XYZ"
            />
            <button type="submit" class="btn btn-primary" :disabled="loading">
              {{ loading ? 'Verifying…' : 'Verify' }}
            </button>
          </div>
        </form>

        <!-- Loading -->
        <div v-if="loading" class="state-card">
          <div class="loading-spinner"></div>
          <p>Verifying certificate…</p>
        </div>

        <!-- Error -->
        <div v-else-if="error" class="state-card error-card">
          <span class="material-symbols-outlined state-icon">error</span>
          <h3>Verification failed</h3>
          <p>{{ error }}</p>
        </div>

        <!-- Not found -->
        <div v-else-if="checked && !result?.found" class="state-card invalid-card">
          <span class="material-symbols-outlined state-icon">gpp_bad</span>
          <h3>No matching certificate</h3>
          <p>
            We couldn't find an active certificate with that number. Double-check the
            number or scan the QR code on the certificate.
          </p>
        </div>

        <!-- Found -->
        <div v-else-if="result?.found" class="result-card">
          <!-- Authenticity banner -->
          <div :class="['authenticity-banner', result.integrityValid ? 'valid' : 'warning']">
            <span class="material-symbols-outlined">
              {{ result.integrityValid ? 'verified' : 'warning' }}
            </span>
            <div>
              <strong>{{ result.integrityValid ? 'Authentic certificate' : 'Certificate found — integrity unconfirmed' }}</strong>
              <p>
                {{
                  result.integrityValid
                    ? 'This certificate exists in the Carbonify registry and its contents have not been altered.'
                    : 'This certificate exists in the registry, but a tamper-evident signature could not be confirmed.'
                }}
              </p>
            </div>
          </div>

          <div class="result-body">
            <div class="result-main">
              <div class="detail-row">
                <span class="detail-label">Certificate Number</span>
                <span class="detail-value mono">{{ cert.certificate_number }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Type</span>
                <span class="detail-value capitalize">{{ cert.certificate_type || 'purchase' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Beneficiary</span>
                <span class="detail-value">{{ cert.beneficiary_name || 'Not specified' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Project</span>
                <span class="detail-value">{{ cert.project_title || 'N/A' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Category</span>
                <span class="detail-value">{{ cert.project_category || 'N/A' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Location</span>
                <span class="detail-value">{{ cert.project_location || 'N/A' }}</span>
              </div>
              <div class="detail-row highlight-row">
                <span class="detail-label">Carbon Credits</span>
                <span class="detail-value highlight-value">
                  {{ Number(cert.credits_quantity || 0).toLocaleString() }} tonnes CO₂
                </span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Vintage Year</span>
                <span class="detail-value">{{ cert.vintage_year || 'N/A' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Standard</span>
                <span class="detail-value">{{ cert.verification_standard || 'Carbonify Standard' }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Issued</span>
                <span class="detail-value">{{ formatDate(cert.issued_at) }}</span>
              </div>
              <div v-if="cert.registry_serial" class="detail-row">
                <span class="detail-label">Registry Serial</span>
                <span class="detail-value mono">{{ cert.registry_serial }}</span>
              </div>
              <div v-if="cert.registry_receipt_url" class="detail-row">
                <span class="detail-label">Retirement Receipt</span>
                <span class="detail-value">
                  <a :href="cert.registry_receipt_url" target="_blank" rel="noopener noreferrer">View receipt ↗</a>
                </span>
              </div>
              <div v-if="cert.signature_hash" class="detail-row">
                <span class="detail-label">Digital Signature</span>
                <span class="detail-value mono signature">{{ cert.signature_hash }}</span>
              </div>
            </div>

            <div v-if="qrDataUrl" class="result-qr">
              <img :src="qrDataUrl" alt="Certificate QR code" />
              <span class="qr-caption">Scan to re-verify</span>
            </div>
          </div>
        </div>

        <!-- Intro (no lookup yet) -->
        <div v-else class="state-card intro-card">
          <span class="material-symbols-outlined state-icon">qr_code_scanner</span>
          <h3>Verify a certificate</h3>
          <p>
            Enter a certificate number above, or scan the QR code printed on an Carbonify
            certificate, to confirm its authenticity.
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { verifyCertificatePublic } from '@/services/certificateService'

const route = useRoute()
const router = useRouter()

const certNumber = ref('')
const loading = ref(false)
const error = ref('')
const checked = ref(false)
const result = ref(null)
const cert = ref({})
const qrDataUrl = ref(null)

async function generateQr(value) {
  qrDataUrl.value = null
  if (!value) return
  try {
    const QRCode = (await import('qrcode')).default
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://carbonify.com'
    qrDataUrl.value = await QRCode.toDataURL(`${origin}/verify/${value}`, { margin: 1, width: 220 })
  } catch (err) {
    console.warn('Could not generate QR code:', err?.message)
  }
}

async function runVerification(number) {
  const trimmed = (number || '').trim()
  if (!trimmed) return

  loading.value = true
  error.value = ''
  checked.value = true
  result.value = null
  cert.value = {}

  try {
    const res = await verifyCertificatePublic(trimmed)
    result.value = res
    if (res.found) {
      cert.value = res.certificate
      await generateQr(res.certificate.certificate_number)
    }
  } catch (err) {
    console.error('Verification error:', err)
    error.value = 'Unable to verify the certificate right now. Please try again later.'
  } finally {
    loading.value = false
  }
}

function lookup() {
  const trimmed = certNumber.value.trim()
  if (!trimmed) return
  // Keep the URL shareable
  if (route.params.certificateNumber !== trimmed) {
    router.push(`/verify/${encodeURIComponent(trimmed)}`)
  } else {
    runVerification(trimmed)
  }
}

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

// React to the route param (deep links / QR scans)
watch(
  () => route.params.certificateNumber,
  (value) => {
    if (value) {
      certNumber.value = String(value)
      runVerification(String(value))
    }
  },
)

onMounted(() => {
  if (route.params.certificateNumber) {
    certNumber.value = String(route.params.certificateNumber)
    runVerification(certNumber.value)
  }
})
</script>

<style scoped>
.verify-page {
  min-height: 100vh;
  background: var(--bg-primary, #ffffff);
}

.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 2rem;
}

.page-header {
  background: var(--primary-color, #10b981);
  padding: 1.25rem 0;
}

.header-content {
  display: flex;
  justify-content: center;
}

.header-text {
  text-align: center;
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
  opacity: 0.95;
}

.verify-content {
  padding: 2rem 0;
}

/* Lookup form */
.lookup-form {
  background: var(--bg-secondary, #f8fdf8);
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.75rem;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}

.lookup-label {
  display: block;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
  margin-bottom: 0.5rem;
}

.lookup-row {
  display: flex;
  gap: 0.75rem;
}

.lookup-input {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid var(--border-color, #d1e7dd);
  border-radius: 0.5rem;
  font-size: 16px;
  font-family: 'Courier New', monospace;
}

.lookup-input:focus {
  outline: none;
  border-color: var(--primary-color, #069e2d);
  box-shadow: 0 0 0 3px var(--primary-light, rgba(6, 158, 45, 0.1));
}

.btn {
  padding: 0.5rem 1.25rem;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  white-space: nowrap;
}

.btn-primary {
  background: var(--primary-color, #069e2d);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover, #058e3f);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* State cards */
.state-card {
  text-align: center;
  padding: 3rem 2rem;
  border-radius: 0.75rem;
  border: 1px solid var(--border-color, #d1e7dd);
  background: var(--bg-secondary, #f8fdf8);
}

.state-icon {
  font-size: 3rem;
  margin-bottom: 0.5rem;
}

.intro-card .state-icon {
  color: var(--primary-color, #069e2d);
}

.error-card,
.invalid-card {
  border-color: rgba(220, 38, 38, 0.3);
  background: rgba(220, 38, 38, 0.05);
}

.error-card .state-icon,
.invalid-card .state-icon {
  color: #dc2626;
}

.state-card h3 {
  margin: 0.5rem 0;
  color: var(--text-primary, #1a1a1a);
}

.state-card p {
  color: var(--text-muted, #718096);
  margin: 0 auto;
  max-width: 480px;
}

.loading-spinner {
  width: 44px;
  height: 44px;
  border: 4px solid var(--border-color, #d1e7dd);
  border-top-color: var(--primary-color, #069e2d);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Result */
.result-card {
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.75rem;
  overflow: hidden;
}

.authenticity-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  padding: 1.25rem;
  color: #fff;
}

.authenticity-banner .material-symbols-outlined {
  font-size: 2rem;
}

.authenticity-banner.valid {
  background: var(--primary-color, #069e2d);
}

.authenticity-banner.warning {
  background: #d97706;
}

.authenticity-banner strong {
  font-size: 1.05rem;
}

.authenticity-banner p {
  margin: 0.25rem 0 0 0;
  font-size: 0.9rem;
  opacity: 0.95;
}

.result-body {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 1.5rem;
  padding: 1.5rem;
}

.result-main {
  min-width: 0;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--border-light, #e8f5e8);
}

.detail-row:last-child {
  border-bottom: none;
}

.detail-label {
  color: var(--text-muted, #718096);
  font-size: 0.875rem;
}

.detail-value {
  color: var(--text-primary, #1a1a1a);
  font-weight: 500;
  font-size: 0.875rem;
  text-align: right;
  word-break: break-word;
}

.detail-value.mono {
  font-family: 'Courier New', monospace;
  font-size: 0.8125rem;
}

.detail-value.signature {
  font-size: 0.7rem;
  max-width: 320px;
}

.detail-value.capitalize {
  text-transform: capitalize;
}

.detail-row.highlight-row {
  background: var(--primary-light, #e8f5e8);
  border-radius: 0.5rem;
  padding: 0.75rem;
  border-bottom: none;
}

.detail-value.highlight-value {
  color: var(--primary-color, #069e2d);
  font-weight: 600;
}

.result-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.result-qr img {
  width: 160px;
  height: 160px;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.5rem;
}

.qr-caption {
  font-size: 0.75rem;
  color: var(--text-muted, #718096);
}

@media (max-width: 768px) {
  .container {
    padding: 0 1rem;
  }

  .lookup-row {
    flex-direction: column;
  }

  .result-body {
    grid-template-columns: 1fr;
  }

  .result-qr {
    order: -1;
  }
}
</style>
