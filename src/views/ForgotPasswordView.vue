<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1 class="auth-title">Reset your password</h1>
      <p class="auth-subtitle">
        Enter the email associated with your account and we'll send you a link to reset
        your password.
      </p>

      <div v-if="sent" class="success-box">
        <span class="material-symbols-outlined">mark_email_read</span>
        <p>
          If an account exists for <strong>{{ email }}</strong>, a password reset link is on
          its way. Check your inbox (and spam folder).
        </p>
        <router-link to="/login" class="btn btn-primary">Back to login</router-link>
      </div>

      <form v-else class="auth-form" @submit.prevent="submit">
        <div class="form-field">
          <label for="email" class="form-label">Email address</label>
          <input id="email" v-model="email" type="email" class="form-input" placeholder="you@example.com" />
        </div>

        <p v-if="error" class="error-text">{{ error }}</p>

        <button type="submit" class="btn btn-primary block" :disabled="loading">
          {{ loading ? 'Sending…' : 'Send reset link' }}
        </button>

        <router-link to="/login" class="back-link">Back to login</router-link>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { requestPasswordReset } from '@/services/passwordService'

const email = ref('')
const loading = ref(false)
const error = ref('')
const sent = ref(false)

async function submit() {
  error.value = ''
  if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    error.value = 'Please enter a valid email address.'
    return
  }
  loading.value = true
  try {
    await requestPasswordReset(email.value)
    // Always show success (don't reveal whether the email exists)
    sent.value = true
  } catch (err) {
    // Even on error, avoid leaking account existence; show generic success
    console.warn('Password reset request error:', err?.message)
    sent.value = true
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary, #f8fdf8);
  padding: 2rem 1rem;
}

.auth-card {
  width: 100%;
  max-width: 420px;
  background: #fff;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.auth-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary, #1a202c);
  margin: 0 0 0.5rem;
}

.auth-subtitle {
  color: var(--text-muted, #6b7280);
  font-size: 0.9rem;
  margin: 0 0 1.5rem;
}

.form-field {
  margin-bottom: 1rem;
}

.form-label {
  display: block;
  font-weight: 600;
  font-size: 0.85rem;
  margin-bottom: 0.4rem;
}

.form-input {
  width: 100%;
  padding: 0.7rem 1rem;
  border: 1px solid var(--border-color, #d1fae5);
  border-radius: 8px;
  font-size: 0.9rem;
}

.form-input:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
  box-shadow: 0 0 0 3px rgba(5, 133, 38, 0.1);
}

.error-text {
  color: #b00020;
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
}

.btn {
  padding: 0.7rem 1.25rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.btn-primary {
  background: var(--primary-color, #058526);
  color: #fff;
}

.btn.block {
  width: 100%;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.back-link {
  display: block;
  text-align: center;
  margin-top: 1rem;
  color: var(--primary-color, #058526);
  font-size: 0.85rem;
  text-decoration: none;
}

.success-box {
  text-align: center;
}

.success-box .material-symbols-outlined {
  font-size: 3rem;
  color: var(--primary-color, #058526);
}

.success-box p {
  color: var(--text-muted, #4b5563);
  margin: 0.75rem 0 1.5rem;
}
</style>
