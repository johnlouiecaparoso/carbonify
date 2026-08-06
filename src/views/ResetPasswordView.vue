<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1 class="auth-title">Set a new password</h1>

      <div v-if="checking" class="state">Verifying your reset link…</div>

      <div v-else-if="!hasRecoverySession" class="state error-state">
        <span class="material-symbols-outlined">link_off</span>
        <p>
          This reset link is invalid or has expired. Please request a new one.
        </p>
        <router-link to="/forgot-password" class="btn btn-primary">Request new link</router-link>
      </div>

      <div v-else-if="done" class="state success-state">
        <span class="material-symbols-outlined">check_circle</span>
        <p>Your password has been updated.</p>
        <router-link to="/login" class="btn btn-primary">Go to login</router-link>
      </div>

      <form v-else class="auth-form" @submit.prevent="submit">
        <p class="auth-subtitle">Choose a strong password (at least 8 characters).</p>

        <div class="form-field">
          <label for="password" class="form-label">New password</label>
          <PasswordField
            id="password"
            v-model="password"
            input-class="form-input"
            autocomplete="new-password"
            placeholder="New password"
          />
        </div>

        <div class="form-field">
          <label for="confirm" class="form-label">Confirm password</label>
          <PasswordField
            id="confirm"
            v-model="confirm"
            input-class="form-input"
            autocomplete="new-password"
            placeholder="Re-enter password"
          />
        </div>

        <p v-if="error" class="error-text">{{ error }}</p>

        <button type="submit" class="btn btn-primary block" :disabled="loading">
          {{ loading ? 'Updating…' : 'Update password' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { getSupabase } from '@/services/supabaseClient'
import { updatePassword } from '@/services/passwordService'
import PasswordField from '@/components/ui/PasswordField.vue'

const checking = ref(true)
const hasRecoverySession = ref(false)
const password = ref('')
const confirm = ref('')
const loading = ref(false)
const error = ref('')
const done = ref(false)

onMounted(async () => {
  // detectSessionInUrl in the Supabase client turns the recovery link's tokens
  // into a session. Give it a moment, then confirm a session exists.
  const supabase = getSupabase()
  try {
    // Small delay so the URL hash can be processed on first paint
    await new Promise((r) => setTimeout(r, 400))
    const { data } = await supabase.auth.getSession()
    hasRecoverySession.value = !!data?.session
  } catch (err) {
    console.warn('Could not verify recovery session:', err?.message)
    hasRecoverySession.value = false
  } finally {
    checking.value = false
  }
})

async function submit() {
  error.value = ''
  if (password.value.length < 8) {
    error.value = 'Password must be at least 8 characters.'
    return
  }
  if (password.value !== confirm.value) {
    error.value = 'Passwords do not match.'
    return
  }
  loading.value = true
  try {
    await updatePassword(password.value)
    done.value = true
  } catch (err) {
    error.value = err.message || 'Failed to update password.'
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
  margin: 0 0 1rem;
}

.auth-subtitle {
  color: var(--text-muted, #6b7280);
  font-size: 0.9rem;
  margin: 0 0 1rem;
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

.state {
  text-align: center;
  color: var(--text-muted, #4b5563);
}

.state .material-symbols-outlined {
  font-size: 3rem;
}

.success-state .material-symbols-outlined {
  color: var(--primary-color, #058526);
}

.error-state .material-symbols-outlined {
  color: #dc2626;
}

.state p {
  margin: 0.75rem 0 1.5rem;
}
</style>
