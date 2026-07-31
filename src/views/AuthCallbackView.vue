<template>
  <div class="callback-page">
    <div class="callback-card">
      <div v-if="!error" class="spinner" aria-hidden="true"></div>
      <h1 class="callback-title">{{ error ? 'Sign-in failed' : 'Signing you in…' }}</h1>
      <p class="callback-text">{{ error || 'Finishing authentication, please wait.' }}</p>
      <router-link v-if="error" to="/login" class="callback-link">Back to login</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { getSession, ensureUserProfile } from '@/services/authService'
import { isMfaRequired } from '@/services/mfaService'
import { getRoleDefaultRoute } from '@/utils/getRoleDefaultRoute'

const router = useRouter()
const route = useRoute()
const store = useUserStore()
const error = ref('')

// Supabase (detectSessionInUrl) processes the OAuth redirect hash asynchronously.
// Poll briefly for the session before giving up.
async function waitForSession(attempts = 10, delayMs = 300) {
  for (let i = 0; i < attempts; i++) {
    const session = await getSession()
    if (session) return session
    await new Promise((r) => setTimeout(r, delayMs))
  }
  return null
}

onMounted(async () => {
  try {
    const session = await waitForSession()
    if (!session) {
      error.value = 'We could not complete sign-in. The link may have expired — please try again.'
      return
    }

    store.session = session
    // OAuth/phone users may not have a profile row yet.
    await ensureUserProfile()
    await store.fetchUserProfile()

    // Step up to 2FA if the account requires it.
    const { required, factorId } = await isMfaRequired()
    if (required && factorId) {
      router.replace({ name: 'mfa-challenge' })
      return
    }

    const returnTo = route.query.returnTo
    router.replace(
      returnTo
        ? decodeURIComponent(String(returnTo))
        : getRoleDefaultRoute(store.role || store.profile?.role),
    )
  } catch (err) {
    console.error('Auth callback error:', err)
    error.value = err?.message || 'Authentication failed. Please try again.'
  }
})
</script>

<style scoped>
.callback-page {
  min-height: 70vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}
.callback-card {
  text-align: center;
  max-width: 420px;
}
.callback-title {
  font-size: 1.4rem;
  margin: 1rem 0 0.5rem;
}
.callback-text {
  color: #6b7280;
}
.callback-link {
  display: inline-block;
  margin-top: 1rem;
  color: #058526;
  font-weight: 600;
  text-decoration: none;
}
.spinner {
  width: 40px;
  height: 40px;
  margin: 0 auto;
  border: 3px solid #d1fae5;
  border-top-color: #058526;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
