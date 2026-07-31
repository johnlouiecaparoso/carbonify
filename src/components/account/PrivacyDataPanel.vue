<template>
  <div class="privacy-panel">
    <!-- Export my data -->
    <div class="privacy-item">
      <div class="privacy-info">
        <span class="privacy-label">Download my data</span>
        <span class="privacy-description">
          Get a copy of the personal data Carbonify holds for your account — your
          profile, transactions, holdings, certificates, and activity — as a JSON file.
        </span>
      </div>
      <div class="action">
        <button class="privacy-button" :disabled="exporting" @click="onExport">
          {{ exporting ? 'Preparing…' : 'Download my data' }}
        </button>
      </div>
      <p v-if="exportMessage" class="privacy-message" :class="{ error: exportError }">
        {{ exportMessage }}
      </p>
    </div>

    <!-- Delete my account -->
    <div class="privacy-item danger">
      <div class="privacy-info">
        <span class="privacy-label">Delete my account</span>
        <span class="privacy-description">
          Request permanent deletion of your account and personal data. Our team
          processes deletion requests and may retain limited records where the law
          requires (e.g. completed financial transactions). This cannot be undone.
        </span>
      </div>

      <div v-if="pendingDeletion" class="pending-banner">
        <span>
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size: 1.1em; vertical-align: middle;">hourglass_top</span>
          A deletion request is pending (submitted {{ formatDate(pendingDeletion.created_at) }}).
        </span>
        <button class="btn-ghost" :disabled="cancelling" @click="onCancelDeletion">
          {{ cancelling ? 'Cancelling…' : 'Cancel request' }}
        </button>
      </div>

      <div v-else-if="!confirming" class="action">
        <button class="privacy-button danger-button" @click="confirming = true">
          Request account deletion
        </button>
      </div>

      <form v-else class="delete-form" @submit.prevent="onRequestDeletion">
        <label class="form-label">Reason (optional)</label>
        <textarea
          v-model="reason"
          class="sec-input"
          rows="2"
          placeholder="Tell us why you're leaving (optional)"
        ></textarea>

        <label class="form-label">
          Type <strong>{{ confirmWord }}</strong> to confirm
        </label>
        <input v-model="confirmText" type="text" class="sec-input" :placeholder="confirmWord" />

        <div class="form-actions">
          <button type="button" class="btn-ghost" @click="resetDeleteForm">Cancel</button>
          <button
            type="submit"
            class="privacy-button danger-button"
            :disabled="submitting || confirmText.trim().toUpperCase() !== confirmWord"
          >
            {{ submitting ? 'Submitting…' : 'Confirm deletion request' }}
          </button>
        </div>
      </form>

      <p v-if="deleteMessage" class="privacy-message" :class="{ error: deleteError }">
        {{ deleteMessage }}
      </p>
    </div>

    <p v-if="requestsError" class="privacy-message error">{{ requestsError }}</p>

    <!-- Request history -->
    <div v-if="requests.length" class="privacy-history">
      <h4 class="history-title">Request history</h4>
      <ul class="history-list">
        <li v-for="req in requests" :key="req.id" class="history-row">
          <span class="history-type">{{ typeLabel(req.request_type) }}</span>
          <span class="history-date">{{ formatDate(req.created_at) }}</span>
          <span class="history-status" :class="`status-${req.status}`">{{ req.status }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  downloadMyData,
  requestAccountDeletion,
  getMyDataRequests,
  cancelDeletionRequest,
} from '@/services/dataPrivacyService'

const confirmWord = 'DELETE'

const exporting = ref(false)
const exportMessage = ref('')
const exportError = ref(false)

const confirming = ref(false)
const reason = ref('')
const confirmText = ref('')
const submitting = ref(false)
const deleteMessage = ref('')
const deleteError = ref(false)
const cancelling = ref(false)

const requests = ref([])
const requestsError = ref('')

const pendingDeletion = computed(() =>
  requests.value.find(
    (r) => r.request_type === 'deletion' && (r.status === 'pending' || r.status === 'in_progress'),
  ),
)

function formatDate(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return value
  }
}

function typeLabel(type) {
  return type === 'deletion' ? 'Account deletion' : 'Data export'
}

async function loadRequests() {
  // Handled here rather than thrown on: this runs from onMounted and from
  // inside three action handlers, whose catch blocks would otherwise report a
  // failed refresh as a failed export/deletion.
  //
  // The stake is `pendingDeletion` below. If a failed read left `requests`
  // empty, the panel showed no pending request and offered account deletion
  // again to someone who had already asked for it.
  try {
    requestsError.value = ''
    requests.value = await getMyDataRequests()
  } catch (err) {
    console.error('Failed to load data requests:', err)
    requests.value = []
    requestsError.value =
      'We could not load your existing requests. If you have already asked for an export or deletion, do not submit it again — reload the page first.'
  }
}

async function onExport() {
  exporting.value = true
  exportMessage.value = ''
  exportError.value = false
  try {
    const payload = await downloadMyData()
    const count = payload?.export_metadata?.total_records ?? 0
    exportMessage.value = `Your data export downloaded (${count} record${count === 1 ? '' : 's'}).`
    await loadRequests()
  } catch (e) {
    exportError.value = true
    exportMessage.value = e?.message || 'Could not generate your export. Please try again.'
  } finally {
    exporting.value = false
  }
}

function resetDeleteForm() {
  confirming.value = false
  reason.value = ''
  confirmText.value = ''
}

async function onRequestDeletion() {
  if (confirmText.value.trim().toUpperCase() !== confirmWord) return
  submitting.value = true
  deleteMessage.value = ''
  deleteError.value = false
  try {
    await requestAccountDeletion(reason.value.trim() || null)
    deleteMessage.value =
      'Your account deletion request has been submitted. Our team will process it shortly.'
    resetDeleteForm()
    await loadRequests()
  } catch (e) {
    deleteError.value = true
    deleteMessage.value = e?.message || 'Could not submit your request. Please try again.'
  } finally {
    submitting.value = false
  }
}

async function onCancelDeletion() {
  if (!pendingDeletion.value) return
  cancelling.value = true
  deleteMessage.value = ''
  deleteError.value = false
  try {
    await cancelDeletionRequest(pendingDeletion.value.id)
    deleteMessage.value = 'Your deletion request has been cancelled.'
    await loadRequests()
  } catch (e) {
    deleteError.value = true
    deleteMessage.value = e?.message || 'Could not cancel the request. Please try again.'
  } finally {
    cancelling.value = false
  }
}

onMounted(loadRequests)
</script>

<style scoped>
.privacy-panel {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.privacy-item {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.25rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
}

.privacy-item.danger {
  border-color: #fecaca;
  background: #fef2f2;
}

.privacy-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.privacy-label {
  font-weight: 600;
  color: #111827;
}

.privacy-description {
  font-size: 0.875rem;
  color: #6b7280;
  line-height: 1.5;
}

.action {
  display: flex;
}

.privacy-button {
  padding: 0.6rem 1rem;
  border: none;
  border-radius: 8px;
  background: #16a34a;
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  transition: background 0.2s;
}

.privacy-button:hover:not(:disabled) {
  background: #15803d;
}

.privacy-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.danger-button {
  background: #dc2626;
}

.danger-button:hover:not(:disabled) {
  background: #b91c1c;
}

.btn-ghost {
  padding: 0.6rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: transparent;
  color: #374151;
  font-weight: 500;
  font-size: 0.875rem;
  cursor: pointer;
}

.btn-ghost:hover {
  background: #f3f4f6;
}

.delete-form {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #374151;
}

.sec-input {
  padding: 0.6rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
}

.sec-input:focus {
  outline: none;
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
}

.form-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.25rem;
}

.pending-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.75rem 1rem;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  font-size: 0.875rem;
  color: #9a3412;
}

.privacy-message {
  font-size: 0.8125rem;
  color: #16a34a;
  margin: 0;
}

.privacy-message.error {
  color: #dc2626;
}

.privacy-history {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.history-title {
  font-size: 1rem;
  font-weight: 600;
  color: #111827;
  margin: 0;
}

.history-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.history-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 1rem;
  align-items: center;
  padding: 0.5rem 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font-size: 0.875rem;
}

.history-type {
  font-weight: 500;
  color: #374151;
}

.history-date {
  color: #6b7280;
}

.history-status {
  text-transform: capitalize;
  font-weight: 500;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  font-size: 0.75rem;
  background: #f3f4f6;
  color: #374151;
}

.status-completed {
  background: #dcfce7;
  color: #166534;
}

.status-pending,
.status-in_progress {
  background: #fef3c7;
  color: #92400e;
}

.status-cancelled,
.status-rejected {
  background: #fee2e2;
  color: #991b1b;
}
</style>
