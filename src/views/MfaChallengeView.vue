<template>
  <div class="mfa-page">
    <div class="mfa-card">
      <h1 class="mfa-title">Two-Factor Authentication</h1>

      <div v-if="checking" class="state">Checking…</div>

      <form v-else class="mfa-form" @submit.prevent="verify">
        <p class="mfa-subtitle">
          Enter the 6-digit code from your authenticator app to continue.
        </p>

        <input
          v-model="code"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          class="mfa-input"
          placeholder="000000"
        />

        <p v-if="error" class="error-text">{{ error }}</p>

        <button type="submit" class="btn btn-primary block" :disabled="loading">
          {{ loading ? 'Verifying…' : 'Verify' }}
        </button>

        <button type="button" class="link-button" @click="signOutAndExit">Sign out</button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { isMfaRequired, challengeAndVerify } from '@/services/mfaService'
import { signOut } from '@/services/authService'
import { getRoleDefaultRoute } from '@/utils/getRoleDefaultRoute'

const router = useRouter()
const route = useRoute()
const store = useUserStore()

const checking = ref(true)
const factorId = ref(null)
const code = ref('')
const loading = ref(false)
const error = ref('')

function destination() {
  const returnTo = route.query.returnTo
  if (returnTo) return decodeURIComponent(String(returnTo))
  return getRoleDefaultRoute(store.role || store.profile?.role)
}

onMounted(async () => {
  try {
    const { required, factorId: id } = await isMfaRequired()
    if (!required) {
      // Already stepped up (aal2) or no factor — nothing to do here.
      router.replace(destination())
      return
    }
    factorId.value = id
  } catch (err) {
    console.warn('MFA challenge check failed:', err?.message)
    router.replace(destination())
    return
  } finally {
    checking.value = false
  }
})

async function verify() {
  error.value = ''
  if (!code.value || code.value.trim().length < 6) {
    error.value = 'Enter the 6-digit code from your authenticator app.'
    return
  }
  loading.value = true
  try {
    await challengeAndVerify(factorId.value, code.value.trim())
    router.replace(destination())
  } catch (err) {
    error.value = err?.message || 'Invalid code. Please try again.'
  } finally {
    loading.value = false
  }
}

async function signOutAndExit() {
  try {
    await signOut()
  } catch {
    /* ignore */
  }
  store.session = null
  router.replace('/login')
}
</script>

<style scoped>
.mfa-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary, #f8fdf8);
  padding: 2rem 1rem;
}

.mfa-card {
  width: 100%;
  max-width: 400px;
  background: #fff;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 1rem;
  padding: 2rem;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}

.mfa-title {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--text-primary, #1a202c);
  margin: 0 0 1rem;
  text-align: center;
}

.mfa-subtitle {
  color: var(--text-muted, #6b7280);
  font-size: 0.9rem;
  margin: 0 0 1rem;
  text-align: center;
}

.mfa-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-color, #d1fae5);
  border-radius: 8px;
  font-size: 1.4rem;
  letter-spacing: 0.4rem;
  text-align: center;
  font-family: 'Courier New', monospace;
  margin-bottom: 0.75rem;
}

.mfa-input:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
  box-shadow: 0 0 0 3px rgba(5, 133, 38, 0.1);
}

.error-text {
  color: #b00020;
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
  text-align: center;
}

.btn {
  padding: 0.7rem 1.25rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  border: none;
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
  color: var(--text-muted, #6b7280);
  padding: 1.5rem;
}

.link-button {
  display: block;
  width: 100%;
  margin-top: 1rem;
  background: none;
  border: none;
  color: #6b7280;
  font-size: 0.85rem;
  cursor: pointer;
  text-align: center;
}

.link-button:hover {
  color: #374151;
  text-decoration: underline;
}
</style>
