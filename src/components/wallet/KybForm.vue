<script setup>
import { ref } from 'vue'
import { submitKyb } from '@/services/kybService'

const emit = defineEmits(['success', 'cancel'])

const BUSINESS_TYPES = [
  { value: 'sole_prop', label: 'Sole Proprietorship' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'cooperative', label: 'Cooperative' },
]

const form = ref({
  businessName: '',
  businessType: '',
  registrationNumber: '',
  taxId: '',
  businessAddress: '',
  authorizedRepresentative: '',
  registrationDocumentUrl: '',
  taxDocumentUrl: '',
})
const submitting = ref(false)
const error = ref('')

async function handleSubmit() {
  error.value = ''
  if (!form.value.businessName.trim()) {
    error.value = 'Business name is required.'
    return
  }
  submitting.value = true
  try {
    await submitKyb({ ...form.value })
    emit('success')
  } catch (err) {
    error.value = err.message || 'Failed to submit. Please try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="kyb-form" @submit.prevent="handleSubmit">
    <h2>Verify your business</h2>
    <p class="intro">
      Business verification (KYB) is required before you can withdraw earnings. An admin
      reviews your submission. Fields other than business name are optional but speed up review.
    </p>

    <div v-if="error" class="error">{{ error }}</div>

    <label class="field">
      <span>Business name <span class="req">*</span></span>
      <input v-model="form.businessName" type="text" required placeholder="Registered business name" />
    </label>

    <label class="field">
      <span>Business type</span>
      <select v-model="form.businessType">
        <option value="">Select…</option>
        <option v-for="t in BUSINESS_TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
      </select>
    </label>

    <div class="row">
      <label class="field">
        <span>Registration no. (SEC / DTI / CDA)</span>
        <input v-model="form.registrationNumber" type="text" placeholder="e.g. CS201900000" />
      </label>
      <label class="field">
        <span>Tax ID (BIR TIN)</span>
        <input v-model="form.taxId" type="text" placeholder="000-000-000-000" />
      </label>
    </div>

    <label class="field">
      <span>Business address</span>
      <input v-model="form.businessAddress" type="text" placeholder="Street, city, province" />
    </label>

    <label class="field">
      <span>Authorized representative</span>
      <input v-model="form.authorizedRepresentative" type="text" placeholder="Full name" />
    </label>

    <div class="row">
      <label class="field">
        <span>Registration document URL</span>
        <input v-model="form.registrationDocumentUrl" type="url" placeholder="https://…" />
      </label>
      <label class="field">
        <span>Tax document URL</span>
        <input v-model="form.taxDocumentUrl" type="url" placeholder="https://…" />
      </label>
    </div>

    <div class="actions">
      <button type="button" class="btn ghost" :disabled="submitting" @click="emit('cancel')">
        Cancel
      </button>
      <button type="submit" class="btn primary" :disabled="submitting">
        {{ submitting ? 'Submitting…' : 'Submit for review' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.kyb-form h2 {
  margin: 0 0 6px;
  font-size: 1.3rem;
}
.intro {
  color: #6b7280;
  font-size: 0.9rem;
  margin: 0 0 16px;
}
.error {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
  padding: 10px 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 0.9rem;
}
.field {
  display: block;
  margin-bottom: 12px;
}
.field > span {
  display: block;
  font-size: 0.82rem;
  color: #374151;
  font-weight: 600;
  margin-bottom: 4px;
}
.req {
  color: #ef4444;
}
.field input,
.field select {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.92rem;
}
.field input:focus,
.field select:focus {
  outline: none;
  border-color: #058526;
  box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
}
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 16px;
}
.btn {
  border: none;
  border-radius: 8px;
  padding: 9px 18px;
  cursor: pointer;
  font-weight: 600;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.primary {
  background: #058526;
  color: #fff;
}
.btn.ghost {
  background: #fff;
  border: 1px solid #d1d5db;
  color: #374151;
}
@media (max-width: 560px) {
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
