<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { registerWithEmail, signInWithGoogle } from '@/services/authService'
import UiButton from '@/components/ui/Button.vue'
import UiInput from '@/components/ui/Input.vue'

const router = useRouter()
const googleLoading = ref(false)
const name = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const loading = ref(false)
const errorMessage = ref('')
const nameError = ref('')
const emailError = ref('')
const passwordError = ref('')
const confirmError = ref('')
// Removed showPassword and showConfirm as UiInput handles password visibility internally

async function signUpGoogle() {
  errorMessage.value = ''
  googleLoading.value = true
  try {
    await signInWithGoogle()
  } catch (err) {
    errorMessage.value = err?.message || 'Could not start Google sign-up.'
    googleLoading.value = false
  }
}

async function handleSubmit() {
  errorMessage.value = ''
  nameError.value = ''
  emailError.value = ''
  passwordError.value = ''
  confirmError.value = ''

  // Basic validation
  if (!name.value || name.value.trim().length < 2) {
    nameError.value = 'Enter your full name'
  }

  // Require email
  if (!email.value) {
    emailError.value = 'Email is required'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    emailError.value = 'Enter a valid email address'
  }

  if (password.value.length < 8) {
    passwordError.value = 'Password must be at least 8 characters'
  }
  if (password.value !== confirmPassword.value) {
    confirmError.value = 'Passwords do not match'
  }

  if (nameError.value || emailError.value || passwordError.value || confirmError.value) {
    return
  }

  loading.value = true
  try {
    // Register with email
    const result = await registerWithEmail({
      name: name.value.trim(),
      email: email.value,
      password: password.value,
    })

    // This used to redirect to "Account created. Sign in to continue."
    // unconditionally, without looking at the result. Two cases were wrong:
    // an address that was already registered, and a project that requires
    // email confirmation — where signing in is exactly what does NOT work yet.
    if (result?.alreadyRegistered) {
      emailError.value =
        'That email already has an account. Sign in instead, or reset your password.'
      return
    }

    router.replace({
      path: '/login',
      query: result?.needsEmailConfirmation ? { confirm: '1' } : { registered: '1' },
    })
  } catch (err) {
    console.error('Registration failed:', err)
    errorMessage.value = err?.message || 'Unable to register. Please try again.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="register-form-container">
    <div class="register-header">
      <h2 class="register-title">Create your account</h2>
      <p class="register-subtitle">Get started with Carbonify in minutes.</p>
    </div>
    <form class="form-grid" @submit.prevent="handleSubmit">
      <!-- Full Name Input -->
      <div class="form-field">
        <label for="name" class="form-label">
          <span class="material-symbols-outlined label-icon" aria-hidden="true"
            >account_circle</span
          >
          Full name
        </label>
        <UiInput
          id="name"
          type="text"
          placeholder="Full Name"
          v-model="name"
          :error="nameError"
          @input="nameError = ''"
          required
        />
      </div>

      <!-- Email Input -->
      <div class="form-field">
        <label for="email" class="form-label">
          <span class="material-symbols-outlined label-icon" aria-hidden="true">mail</span>
          Email Address
        </label>
        <UiInput
          id="email"
          type="email"
          autocomplete="email"
          placeholder="Email"
          v-model="email"
          :error="emailError"
          @input="emailError = ''"
          required
        />
      </div>

      <!-- Password Input -->
      <div class="form-field">
        <label for="password" class="form-label">
          <span class="material-symbols-outlined label-icon" aria-hidden="true">lock</span>
          Password
        </label>
        <UiInput
          id="password"
          type="password"
          autocomplete="new-password"
          placeholder="Create a strong password"
          v-model="password"
          :error="passwordError"
          @input="passwordError = ''"
          required
        />
      </div>

      <!-- Confirm Password Input -->
      <div class="form-field">
        <label for="confirm" class="form-label">
          <span class="material-symbols-outlined label-icon" aria-hidden="true">lock_reset</span>
          Confirm password
        </label>
        <UiInput
          id="confirm"
          type="password"
          autocomplete="new-password"
          placeholder="Re-enter password"
          v-model="confirmPassword"
          :error="confirmError"
          @input="confirmError = ''"
          required
        />
      </div>

      <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>

      <UiButton type="submit" :loading="loading" block class="create-account-button">
        <span class="material-symbols-outlined" aria-hidden="true">person_add</span>
        <span>Create Account</span>
      </UiButton>
    </form>

    <div class="auth-divider"><span>or</span></div>

    <button type="button" class="social-button" :disabled="googleLoading" @click="signUpGoogle">
      <img
        src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
        alt=""
        class="social-icon"
      />
      <span>{{ googleLoading ? 'Redirecting…' : 'Sign up with Google' }}</span>
    </button>

    <div class="role-apply-box">
      <p class="role-apply-title">Farming or developing carbon projects?</p>
      <p class="role-apply-text">
        The account above lets you buy and retire credits right away. A farmer needs only a name and
        location; developers are asked for business registration. Both are reviewed before approval.
      </p>
      <div class="role-apply-links">
        <router-link to="/register/farmer">Register as a Farmer →</router-link>
        <router-link to="/apply?role=project-developer">Apply as a Project Developer →</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Enhanced Register Form - Properly centered and sized */
.register-form-container {
  width: 100%;
  margin: 0;
  padding: 0;
  background: transparent;
  position: relative;
}

/* Register Header - Centered and properly spaced */
.register-header {
  margin-bottom: 1.5rem;
  padding-bottom: 0;
  border-bottom: none;
}

.register-title {
  font-size: 1.875rem;
  font-weight: 700;
  color: #1f2937;
  margin: 0 0 0.5rem;
  letter-spacing: -0.025em;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.register-subtitle {
  color: #6b7280;
  font-size: 0.875rem;
  margin: 0;
  font-weight: 400;
  line-height: 1.5;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

/* Form Grid - Optimized spacing and centering */
.form-grid {
  position: relative;
  z-index: 1;
  display: grid;
  gap: 1.25rem;
  width: 100%;
  padding: 0;
  margin: 0;
  box-sizing: border-box;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b7280;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.label-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-right: 0.5rem;
  color: #6b7280;
  font-size: 1.25rem;
}

/* Specific styling for UiInput components */
.form-grid :deep(.enhanced-input) {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.form-grid :deep(.enhanced-input__label) {
  display: none;
}

.form-grid :deep(.enhanced-input__field) {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  border: 1px solid #d1fae5;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  color: #1f2937;
  background: #ffffff;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.form-grid :deep(.enhanced-input__field:focus) {
  border-color: var(--primary-color, #058526);
  outline: none;
  box-shadow: 0 0 0 3px rgba(5, 133, 38, 0.1);
}

.form-grid :deep(.enhanced-input__field::placeholder) {
  color: #9ca3af;
  font-weight: 400;
  font-style: italic;
}

.create-account-button {
  margin-top: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-weight: 600;
}

.create-account-button .material-symbols-outlined {
  font-size: 1.35rem;
}

.create-account-button :deep(.ui-btn) {
  background: var(--primary-color, #058526);
  color: #ffffff;
  border-radius: 8px;
  padding: 0.75rem 1.5rem;
  font-weight: 600;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: none;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.create-account-button :deep(.ui-btn:hover) {
  background: var(--primary-hover, #04701f);
}

.error-message {
  color: #b00020;
  font-weight: 600;
  font-size: 0.875rem;
  padding: 0.75rem;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 8px;
  text-align: center;
}

button[disabled] {
  opacity: 0.8;
  cursor: not-allowed;
}

/* Responsive Design for Register Form */
@media (max-width: 768px) {
  .register-title {
    font-size: 1.5rem;
  }

  .register-subtitle {
    font-size: 0.875rem;
  }

  .form-grid {
    gap: 1.25rem;
  }
}

@media (max-width: 480px) {
  .register-title {
    font-size: 1.375rem;
  }

  .register-subtitle {
    font-size: 0.8rem;
  }

  .form-grid {
    gap: 1rem;
  }
}

.auth-divider {
  display: flex;
  align-items: center;
  text-align: center;
  color: #9ca3af;
  font-size: 0.8rem;
  margin: 1.25rem 0;
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  border-bottom: 1px solid #e5e7eb;
}

.auth-divider span {
  padding: 0 0.75rem;
}

.social-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.7rem 1rem;
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  cursor: pointer;
  transition:
    background 0.15s ease,
    border-color 0.15s ease;
}

.social-button:hover:not(:disabled) {
  background: #f9fafb;
  border-color: #9ca3af;
}

.social-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.social-icon {
  width: 18px;
  height: 18px;
}

.role-apply-box {
  margin-top: 1.25rem;
  padding: 0.9rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #f9fafb;
}
.role-apply-title {
  margin: 0 0 0.25rem;
  font-size: 0.85rem;
  font-weight: 700;
  color: #374151;
}
.role-apply-text {
  margin: 0 0 0.6rem;
  font-size: 0.78rem;
  color: #6b7280;
  line-height: 1.45;
}
.role-apply-links {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.role-apply-links a {
  color: #058526;
  font-weight: 600;
  font-size: 0.82rem;
  text-decoration: none;
}
</style>
