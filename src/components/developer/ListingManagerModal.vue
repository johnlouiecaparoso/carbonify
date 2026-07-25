<template>
  <div class="modal-overlay" role="dialog" aria-modal="true" :aria-label="`Manage listing for ${listing.projectTitle}`" @click.self="close">
    <div class="modal">
      <header class="modal-head">
        <div>
          <h2>Manage listing</h2>
          <p class="modal-sub">{{ listing.projectTitle }}</p>
        </div>
        <button class="icon-btn" type="button" aria-label="Close" @click="close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </header>

      <form class="modal-body" @submit.prevent="save">
        <label class="field">
          <span class="field-label">Price per credit</span>
          <div class="input-wrap">
            <span class="prefix">₱</span>
            <input
              v-model="price"
              type="number"
              step="0.01"
              min="0.01"
              class="input"
              :disabled="saving"
              required
            />
          </div>
          <span class="field-hint">
            Buyers are charged this price. Checkout always recalculates from it, so a
            change applies to the next purchase immediately.
          </span>
        </label>

        <label class="field">
          <span class="field-label">Quantity for sale</span>
          <input
            v-model="quantity"
            type="number"
            step="1"
            min="0"
            :max="listing.creditsAvailable"
            class="input"
            :disabled="saving"
            required
          />
          <span class="field-hint">
            You hold {{ num(listing.creditsAvailable) }} credit(s). Listing fewer holds the
            rest back from sale; you cannot list more than you hold.
          </span>
        </label>

        <fieldset class="field">
          <legend class="field-label">Listing status</legend>
          <div class="radio-row">
            <label class="radio">
              <input v-model="status" type="radio" value="active" :disabled="saving" />
              <span>
                <strong>On sale</strong>
                <small>Visible in the marketplace</small>
              </span>
            </label>
            <label class="radio">
              <input v-model="status" type="radio" value="paused" :disabled="saving" />
              <span>
                <strong>Paused</strong>
                <small>Hidden from buyers; credits stay yours</small>
              </span>
            </label>
          </div>
        </fieldset>

        <p v-if="error" class="form-error" role="alert">{{ error }}</p>

        <footer class="modal-foot">
          <button class="btn ghost" type="button" :disabled="saving" @click="close">Cancel</button>
          <button class="btn primary" type="submit" :disabled="saving || !dirty">
            {{ saving ? 'Saving…' : 'Save changes' }}
          </button>
        </footer>
      </form>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { updateMyListing, validateListingEdit } from '@/services/sellerListingService'

const props = defineProps({
  /** A normalized row from sellerListingService.getMyListings(). */
  listing: { type: Object, required: true },
})

const emit = defineEmits(['close', 'saved'])

const price = ref(String(props.listing.pricePerCredit ?? ''))
const quantity = ref(String(props.listing.quantity ?? ''))
const status = ref(props.listing.status === 'paused' ? 'paused' : 'active')
const saving = ref(false)
const error = ref('')

const num = (n) => Number(n || 0).toLocaleString('en-PH')

const dirty = computed(
  () =>
    Number(price.value) !== Number(props.listing.pricePerCredit) ||
    Number(quantity.value) !== Number(props.listing.quantity) ||
    status.value !== props.listing.status,
)

function close() {
  if (saving.value) return
  emit('close')
}

async function save() {
  error.value = ''

  // Mirror of the RPC's rules, purely so an obvious mistake doesn't cost a round
  // trip. update_my_listing re-checks all of it and stays authoritative.
  const check = validateListingEdit({
    pricePerCredit: price.value,
    quantity: quantity.value,
    status: status.value,
    creditsAvailable: props.listing.creditsAvailable,
  })
  if (!check.valid) {
    error.value = check.error
    return
  }

  saving.value = true
  try {
    await updateMyListing(props.listing.id, {
      pricePerCredit: Number(price.value),
      quantity: Number(quantity.value),
      status: status.value,
    })
    emit('saved')
  } catch (err) {
    console.error('Listing update failed:', err)
    error.value = err?.message || 'Could not update your listing. Please try again.'
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 1000;
}

.modal {
  background: #fff;
  border-radius: 16px;
  width: 100%;
  max-width: 480px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
}

.modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.25rem 0.75rem;
  border-bottom: 1px solid #f1f5f9;
}

.modal-head h2 {
  margin: 0;
  font-size: 1.15rem;
  color: #0f172a;
}

.modal-sub {
  margin: 0.2rem 0 0;
  color: #64748b;
  font-size: 0.88rem;
}

.icon-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #64748b;
  display: flex;
  padding: 0.2rem;
  border-radius: 6px;
}

.icon-btn:hover {
  background: #f1f5f9;
}

.modal-body {
  padding: 1.25rem;
  display: grid;
  gap: 1.25rem;
}

.field {
  display: grid;
  gap: 0.35rem;
  border: none;
  padding: 0;
  margin: 0;
}

.field-label {
  font-weight: 600;
  font-size: 0.88rem;
  color: #334155;
  padding: 0;
}

.field-hint {
  font-size: 0.78rem;
  /* These hints carry the rules (pool ceiling, when a price takes effect), so
     they have to be readable text, not decorative grey — #64748b clears 4.5:1. */
  color: #64748b;
  line-height: 1.45;
}

.input {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
  font-size: 0.95rem;
  color: #0f172a;
}

.input:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
  box-shadow: 0 0 0 3px rgba(5, 133, 38, 0.12);
}

.input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.input-wrap .prefix {
  position: absolute;
  left: 0.75rem;
  color: #64748b;
  font-size: 0.95rem;
}

.input-wrap .input {
  padding-left: 1.7rem;
}

.radio-row {
  display: grid;
  gap: 0.5rem;
}

.radio {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  cursor: pointer;
}

.radio:has(input:checked) {
  border-color: var(--primary-color, #058526);
  background: #f0fdf4;
}

.radio span {
  display: grid;
  gap: 0.1rem;
}

.radio strong {
  font-size: 0.9rem;
  color: #0f172a;
  font-weight: 600;
}

.radio small {
  font-size: 0.76rem;
  color: #64748b;
}

.form-error {
  margin: 0;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  border-radius: 10px;
  padding: 0.6rem 0.75rem;
  font-size: 0.85rem;
}

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  padding-top: 0.25rem;
}

.btn {
  padding: 0.6rem 1.1rem;
  border-radius: 10px;
  font-weight: 600;
  font-size: 0.88rem;
  cursor: pointer;
  border: 1px solid transparent;
}

.btn.ghost {
  background: #fff;
  border-color: #cbd5e1;
  color: #334155;
}

.btn.primary {
  background: var(--primary-color, #058526);
  color: #fff;
}

.btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
</style>
