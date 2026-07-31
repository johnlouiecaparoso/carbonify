<template>
  <div class="kyc-page">
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">Identity Verification (KYC)</h1>
        <p class="page-description">
          Verify your identity to buy and trade carbon credits on Carbonify.
        </p>
      </div>
    </div>

    <div class="kyc-content">
      <div class="container">
        <!-- Status banner -->
        <div class="status-card" :class="statusClass">
          <span class="material-symbols-outlined">{{ statusIcon }}</span>
          <div>
            <strong>{{ statusTitle }}</strong>
            <p>{{ statusMessageText }}</p>
          </div>
        </div>

        <!-- Submission form (only if not verified and no pending app) -->
        <form v-if="canSubmit" class="kyc-form" @submit.prevent="submit">
          <h3>Submit verification</h3>

          <div class="form-group">
            <label class="form-label">Full legal name *</label>
            <input v-model="form.fullName" class="form-input" placeholder="As shown on your ID" />
          </div>

          <div class="form-group">
            <label class="form-label">Organization (optional)</label>
            <input v-model="form.organization" class="form-input" placeholder="Company / cooperative / LGU" />
          </div>

          <div class="form-group">
            <label class="form-label">ID document type *</label>
            <select v-model="form.idDocumentType" class="form-select">
              <option value="" disabled>Select a document type</option>
              <option v-for="t in documentTypes" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">Upload ID document (optional)</label>
            <input ref="fileInput" type="file" accept="image/*,.pdf" @change="onFileSelected" />
            <span class="upload-hint">JPEG/PNG/PDF up to 2MB</span>
            <div v-if="form.idDocumentUrl" class="upload-ok">✓ Document attached</div>
          </div>

          <p v-if="message" class="form-message" :class="{ error: isError }">{{ message }}</p>

          <button type="submit" class="btn btn-primary" :disabled="submitting">
            {{ submitting ? 'Submitting…' : 'Submit for Verification' }}
          </button>
        </form>

        <!-- History -->
        <div v-if="applications.length" class="history">
          <h3>Your applications</h3>
          <div v-for="app in applications" :key="app.id" class="history-item">
            <div>
              <span class="history-name">{{ app.full_name || 'Application' }}</span>
              <span class="history-date">{{ formatDate(app.submitted_at) }}</span>
            </div>
            <span class="status-badge" :class="badgeClass(app.status)">{{ app.status }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useUserStore } from '@/store/userStore'
import {
  getMyKycLevel,
  getMyKycApplications,
  submitKycApplication,
  MIN_KYC_LEVEL_TO_TRADE,
} from '@/services/kycService'

const userStore = useUserStore()

const documentTypes = [
  'Philippine National ID (PhilSys)',
  'Passport',
  "Driver's License",
  "Voter's ID",
  'UMID',
  'Postal ID',
  'Business Registration (SEC/DTI)',
]

const level = ref(0)
const applications = ref([])
const submitting = ref(false)
const message = ref('')
const isError = ref(false)
const fileInput = ref(null)

const form = ref({
  fullName: '',
  organization: '',
  idDocumentType: '',
  idDocumentUrl: null,
  levelRequested: 1,
})

const latest = computed(() => applications.value[0] || null)
const isVerified = computed(() => level.value >= MIN_KYC_LEVEL_TO_TRADE)
const hasPending = computed(() => latest.value?.status === 'pending')
const canSubmit = computed(() => !isVerified.value && !hasPending.value)

const statusClass = computed(() => {
  if (isVerified.value) return 'verified'
  if (hasPending.value) return 'pending'
  if (latest.value?.status === 'rejected') return 'rejected'
  return 'unverified'
})
const statusIcon = computed(() => {
  if (isVerified.value) return 'verified_user'
  if (hasPending.value) return 'hourglass_top'
  if (latest.value?.status === 'rejected') return 'gpp_bad'
  return 'shield'
})
const statusTitle = computed(() => {
  if (isVerified.value) return `Verified (Level ${level.value})`
  if (hasPending.value) return 'Verification pending'
  if (latest.value?.status === 'rejected') return 'Verification rejected'
  return 'Not verified'
})
const statusMessageText = computed(() => {
  if (isVerified.value) return 'Your identity is verified. You can buy and trade carbon credits.'
  if (hasPending.value) return 'An administrator is reviewing your application. You will be able to trade once approved.'
  if (latest.value?.status === 'rejected') {
    return `Your application was rejected${latest.value.review_notes ? ': ' + latest.value.review_notes : ''}. You may submit again.`
  }
  return 'Submit your details below to start trading on the marketplace.'
})

function badgeClass(status) {
  return { pending: 'yellow', approved: 'green', rejected: 'red' }[status] || 'gray'
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function setMessage(text, error = false) {
  message.value = text
  isError.value = error
}

async function load() {
  try {
    level.value = await getMyKycLevel(userStore.session?.user?.id)
    applications.value = await getMyKycApplications(userStore.session?.user?.id)
  } catch (err) {
    setMessage(err.message || 'Failed to load KYC status', true)
  }
}

function onFileSelected(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (file.size > 2 * 1024 * 1024) {
    setMessage('File too large (max 2MB).', true)
    if (fileInput.value) fileInput.value.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    form.value.idDocumentUrl = reader.result
    setMessage('')
  }
  reader.readAsDataURL(file)
}

async function submit() {
  submitting.value = true
  setMessage('')
  try {
    await submitKycApplication({
      fullName: form.value.fullName,
      organization: form.value.organization,
      idDocumentType: form.value.idDocumentType,
      idDocumentUrl: form.value.idDocumentUrl,
      levelRequested: form.value.levelRequested,
    })
    setMessage('Application submitted. An administrator will review it shortly.')
    await load()
  } catch (err) {
    setMessage(err.message || 'Failed to submit', true)
  } finally {
    submitting.value = false
  }
}

load()
</script>

<style scoped>
.kyc-page {
  min-height: 100vh;
  background: var(--bg-primary, #ffffff);
}

.container {
  max-width: 720px;
  margin: 0 auto;
  padding: 0 2rem;
}

.page-header {
  background: var(--primary-color, #058526);
  padding: 1.25rem 0;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.5rem 0;
}

.page-description {
  color: #fff;
  opacity: 0.95;
  margin: 0;
}

.kyc-content {
  padding: 2rem 0;
}

.status-card {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  padding: 1.1rem;
  border-radius: 0.75rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--border-color, #d1e7dd);
}

.status-card .material-symbols-outlined {
  font-size: 2rem;
}

.status-card.verified {
  background: #d1fae5;
  border-color: #6ee7b7;
  color: #065f46;
}

.status-card.pending {
  background: #fef3c7;
  border-color: #fcd34d;
  color: #92400e;
}

.status-card.rejected {
  background: #fee2e2;
  border-color: #fca5a5;
  color: #991b1b;
}

.status-card.unverified {
  background: #f1f5f9;
  color: #334155;
}

.status-card p {
  margin: 0.25rem 0 0;
  font-size: 0.9rem;
}

.kyc-form,
.history {
  background: #fff;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.75rem;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.kyc-form h3,
.history h3 {
  margin: 0 0 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 0.4rem;
}

.form-input,
.form-select {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--border-color, #d1e7dd);
  border-radius: 0.5rem;
  font-size: 15px;
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
  box-shadow: 0 0 0 3px var(--primary-light, rgba(5, 133, 38, 0.1));
}

.upload-hint {
  display: block;
  font-size: 0.75rem;
  color: var(--text-muted, #64748b);
  margin-top: 0.25rem;
}

.upload-ok {
  color: var(--primary-color, #058526);
  font-size: 0.85rem;
  margin-top: 0.25rem;
}

.form-message {
  color: var(--primary-color, #058526);
  font-weight: 500;
  margin-bottom: 0.75rem;
}

.form-message.error {
  color: #dc2626;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--border-light, #e8f5e8);
}

.history-item:last-child {
  border-bottom: none;
}

.history-name {
  font-weight: 600;
  margin-right: 0.75rem;
}

.history-date {
  color: var(--text-muted, #64748b);
  font-size: 0.8rem;
}

.status-badge {
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: capitalize;
}

.status-badge.gray { background: #e5e7eb; color: #374151; }
.status-badge.yellow { background: #fef3c7; color: #92400e; }
.status-badge.green { background: #d1fae5; color: #065f46; }
.status-badge.red { background: #fee2e2; color: #991b1b; }

.btn {
  padding: 0.6rem 1.25rem;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.btn-primary {
  background: var(--primary-color, #058526);
  color: #fff;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .container {
    padding: 0 1rem;
  }
}
</style>
