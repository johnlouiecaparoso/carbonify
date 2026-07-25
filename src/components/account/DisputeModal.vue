<script setup>
/**
 * Buyer-facing "report a problem" dialog for a single purchase.
 *
 * The dispute backend (open_dispute / resolve_dispute RPCs, the admin refund
 * console) has existed since Phase 2.6, but nothing in the buyer UI could call
 * it — a customer spending real money had no in-app way to raise an issue.
 * This is that entry point.
 */
import { ref, watch } from 'vue'
import { openDispute } from '@/services/disputeService'

const props = defineProps({
  /** credit_transactions.id the dispute is raised against. */
  transactionId: { type: String, default: '' },
  /** Shown for context so the buyer knows which purchase they're disputing. */
  projectTitle: { type: String, default: '' },
  amountLabel: { type: String, default: '' },
})

const emit = defineEmits(['close', 'opened'])

/** Common cases first so most buyers never have to write prose. */
const REASONS = [
  'I did not receive the credits I paid for',
  'I was charged the wrong amount',
  'I was charged more than once',
  'The credits are not what the listing described',
  'I want to cancel this purchase',
  'Something else',
]

const selectedReason = ref(REASONS[0])
const details = ref('')
const submitting = ref(false)
const error = ref('')

// Reset whenever the modal is re-opened for a different transaction.
watch(
  () => props.transactionId,
  () => {
    selectedReason.value = REASONS[0]
    details.value = ''
    error.value = ''
    submitting.value = false
  },
)

async function submit() {
  error.value = ''
  if (!props.transactionId) {
    error.value = 'This purchase has no transaction reference to dispute.'
    return
  }
  // "Something else" carries no information on its own — require the detail.
  if (selectedReason.value === 'Something else' && !details.value.trim()) {
    error.value = 'Please describe the problem so we can investigate.'
    return
  }

  submitting.value = true
  try {
    const reason = details.value.trim()
      ? `${selectedReason.value} — ${details.value.trim()}`
      : selectedReason.value
    const id = await openDispute({ transactionId: props.transactionId, reason })
    emit('opened', id)
  } catch (err) {
    console.error('Failed to open dispute:', err)
    error.value = err?.message || 'Could not submit your report. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="dispute-backdrop" @click.self="emit('close')">
    <div class="dispute-modal" role="dialog" aria-modal="true" aria-labelledby="dispute-title">
      <div class="dispute-head">
        <h2 id="dispute-title">Report a problem</h2>
        <button class="close-btn" aria-label="Close" @click="emit('close')">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>

      <p v-if="projectTitle" class="dispute-context">
        {{ projectTitle }}<span v-if="amountLabel"> · {{ amountLabel }}</span>
      </p>

      <label class="field-label" for="dispute-reason">What went wrong?</label>
      <select id="dispute-reason" v-model="selectedReason" class="field-input">
        <option v-for="reason in REASONS" :key="reason" :value="reason">{{ reason }}</option>
      </select>

      <label class="field-label" for="dispute-details">
        Details
        <span class="field-optional">
          {{ selectedReason === 'Something else' ? '(required)' : '(optional)' }}
        </span>
      </label>
      <textarea
        id="dispute-details"
        v-model="details"
        class="field-input"
        rows="4"
        placeholder="Anything that helps us investigate — dates, amounts, what you expected."
      ></textarea>

      <p class="dispute-note">
        Our team reviews reports and will either refund the purchase or explain why not. You can
        track the status under Disputes in your account.
      </p>

      <p v-if="error" class="dispute-error">{{ error }}</p>

      <div class="dispute-actions">
        <button class="btn btn-outline" :disabled="submitting" @click="emit('close')">Cancel</button>
        <button class="btn btn-primary" :disabled="submitting" @click="submit">
          {{ submitting ? 'Submitting…' : 'Submit report' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dispute-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 1000;
}
.dispute-modal {
  background: #fff;
  border-radius: 14px;
  width: min(520px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  padding: 1.5rem;
}
.dispute-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.5rem;
}
.dispute-head h2 {
  margin: 0;
  font-size: 1.2rem;
  color: #0f172a;
}
.close-btn {
  border: none;
  background: none;
  cursor: pointer;
  color: #6b7280;
  display: flex;
}
.dispute-context {
  margin: 0 0 1.25rem;
  color: #64748b;
  font-size: 0.875rem;
}
.field-label {
  display: block;
  font-size: 0.825rem;
  font-weight: 600;
  color: #374151;
  margin: 0 0 0.35rem;
}
.field-optional {
  font-weight: 400;
  color: #9ca3af;
}
.field-input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.9rem;
  font-family: inherit;
  margin-bottom: 1rem;
  background: #fff;
  color: #111827;
}
.field-input:focus {
  outline: 2px solid #058526;
  outline-offset: -1px;
  border-color: #058526;
}
.dispute-note {
  font-size: 0.8rem;
  color: #6b7280;
  background: #f9fafb;
  border-radius: 8px;
  padding: 0.7rem 0.85rem;
  margin: 0 0 1rem;
}
.dispute-error {
  color: #991b1b;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 0.6rem 0.75rem;
  font-size: 0.85rem;
  margin: 0 0 1rem;
}
.dispute-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
}
.btn {
  padding: 0.6rem 1.1rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.875rem;
  cursor: pointer;
  border: 1px solid transparent;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.btn-primary {
  background: #058526;
  color: #fff;
}
.btn-outline {
  background: #fff;
  border-color: #d1d5db;
  color: #374151;
}
</style>
