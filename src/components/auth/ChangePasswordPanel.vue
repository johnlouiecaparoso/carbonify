<template>
  <div class="security-item column">
    <div class="security-info">
      <span class="security-label">Password</span>
      <span class="security-description">Change the password you use to sign in.</span>
    </div>

    <div v-if="!open" class="action">
      <button class="security-button" @click="open = true">Change Password</button>
    </div>

    <form v-else class="change-form" @submit.prevent="submit">
      <input v-model="password" type="password" class="sec-input" placeholder="New password (min 8 chars)" />
      <input v-model="confirm" type="password" class="sec-input" placeholder="Confirm new password" />
      <p v-if="message" class="sec-message" :class="{ error: isError }">{{ message }}</p>
      <div class="form-actions">
        <button type="button" class="btn-ghost" @click="cancel">Cancel</button>
        <button type="submit" class="security-button" :disabled="loading">
          {{ loading ? 'Saving…' : 'Update Password' }}
        </button>
      </div>
    </form>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { updatePassword } from '@/services/passwordService'

const open = ref(false)
const password = ref('')
const confirm = ref('')
const loading = ref(false)
const message = ref('')
const isError = ref(false)

function cancel() {
  open.value = false
  password.value = ''
  confirm.value = ''
  message.value = ''
}

async function submit() {
  message.value = ''
  isError.value = false
  if (password.value.length < 8) {
    message.value = 'Password must be at least 8 characters.'
    isError.value = true
    return
  }
  if (password.value !== confirm.value) {
    message.value = 'Passwords do not match.'
    isError.value = true
    return
  }
  loading.value = true
  try {
    await updatePassword(password.value)
    message.value = 'Password updated successfully.'
    password.value = ''
    confirm.value = ''
  } catch (err) {
    message.value = err.message || 'Failed to update password.'
    isError.value = true
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.security-item.column {
  flex-direction: column;
  align-items: stretch;
  gap: 0.75rem;
}

.change-form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.sec-input {
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 8px;
  font-size: 0.9rem;
}

.sec-input:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
}

.sec-message {
  font-size: 0.85rem;
  color: var(--primary-color, #058526);
  margin: 0;
}

.sec-message.error {
  color: #dc2626;
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  justify-content: flex-end;
}

.security-button {
  padding: 0.5rem 1rem;
  border: none;
  background: var(--primary-color, #058526);
  color: #fff;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.security-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-ghost {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color, #d1e7dd);
  background: transparent;
  border-radius: 8px;
  cursor: pointer;
}
</style>
