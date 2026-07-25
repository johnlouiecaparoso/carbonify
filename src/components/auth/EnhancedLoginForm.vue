<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { loginWithEmail } from '@/services/authService'

const router = useRouter()
const store = useUserStore()
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')
const emailError = ref('')
const passwordError = ref('')
const showPassword = ref(false)

// Real-time validation
function validateEmail() {
  if (!email.value) {
    emailError.value = 'Email is required'
    return false
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    emailError.value = 'Enter a valid email address'
    return false
  }
  emailError.value = ''
  return true
}

function validatePassword() {
  if (!password.value) {
    passwordError.value = 'Password is required'
    return false
  }
  if (password.value.length < 6) {
    passwordError.value = 'Password must be at least 6 characters'
    return false
  }
  passwordError.value = ''
  return true
}

function validateForm() {
  const emailValid = validateEmail()
  const passwordValid = validatePassword()
  return emailValid && passwordValid
}

function togglePasswordVisibility() {
  showPassword.value = !showPassword.value
}

async function handleSubmit() {
  errorMessage.value = ''

  if (!validateForm()) {
    return
  }
  loading.value = true
  try {
    const { session } = await loginWithEmail({ email: email.value, password: password.value })
    // Set session immediately to avoid guard race conditions
    if (session) {
      store.session = session
    } else {
      await store.fetchSession()
    }
    // Redirect to homepage after successful login
    router.replace('/')
  } catch (err) {
    const msg = String(err?.message || '')
    if (/email_not_confirmed|confirm your email/i.test(msg)) {
      errorMessage.value = 'Please confirm your email before logging in.'
    } else if (/cannot sign in until it is approved|account is .* and cannot sign in/i.test(msg)) {
      errorMessage.value = msg
    } else if (/Invalid login credentials|invalid/i.test(msg)) {
      errorMessage.value = 'Email or password is incorrect.'
    } else if (/User not found|user not registered/i.test(msg)) {
      errorMessage.value = 'Account not found. Please register first.'
    } else {
      errorMessage.value = 'Unable to sign in. Please try again.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <form class="enhanced-form" @submit.prevent="handleSubmit">
    <!-- Email Field -->
    <div class="form-group">
      <label for="email" class="form-label">
        <svg class="label-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"
          ></path>
        </svg>
        Email Address
      </label>
      <div class="input-wrapper">
        <div class="email-input">
          <input
            id="email"
            type="email"
            placeholder="you@carbonify.io"
            v-model="email"
            :class="['form-input', { 'input-error': emailError }]"
            @blur="validateEmail"
            @input="emailError = ''"
            required
          />
        </div>
        <div v-if="emailError" class="error-message">{{ emailError }}</div>
      </div>
    </div>

    <!-- Password Field -->
    <div class="form-group">
      <label for="password" class="form-label">
        <svg class="label-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          ></path>
        </svg>
        Password
      </label>
      <div class="input-wrapper">
        <div class="password-input">
          <input
            id="password"
            :type="showPassword ? 'text' : 'password'"
            placeholder="Enter your password"
            v-model="password"
            :class="['form-input', { 'input-error': passwordError }]"
            @blur="validatePassword"
            @input="passwordError = ''"
            required
          />
          <button
            type="button"
            class="password-toggle"
            @click="togglePasswordVisibility"
            :aria-label="showPassword ? 'Hide password' : 'Show password'"
          >
            <svg v-if="showPassword" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
              ></path>
            </svg>
            <svg v-else fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              ></path>
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              ></path>
            </svg>
          </button>
        </div>
        <div v-if="passwordError" class="error-message">{{ passwordError }}</div>
      </div>
    </div>

    <!-- Error Message -->
    <div v-if="errorMessage" class="error-banner">
      <svg class="error-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
        ></path>
      </svg>
      {{ errorMessage }}
    </div>

    <!-- Submit Button -->
    <button type="submit" :disabled="loading" class="submit-button">
      <span v-if="loading" class="loading-spinner"></span>
      <svg v-else class="button-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1"
        ></path>
      </svg>
      {{ loading ? 'Signing In...' : 'Sign In' }}
    </button>
  </form>
</template>

<style scoped>
.enhanced-form {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
  font-size: 0.875rem;
  color: #374151;
  margin-bottom: 0.25rem;
}

.label-icon {
  width: 1rem;
  height: 1rem;
  color: #6b7280;
}

.input-wrapper {
  position: relative;
}

.form-input {
  width: 100%;
  padding: 0.875rem 1rem;
  border: 2px solid var(--border-green-light);
  border-radius: 12px;
  font-size: 1rem;
  color: var(--text-primary);
  background: var(--bg-primary);
  transition: all 0.2s ease;
  outline: none;
  box-shadow: var(--shadow-sm);
}

.form-input:focus {
  border-color: var(--primary-color);
  box-shadow: var(--shadow-green);
  transform: translateY(-1px);
  background: var(--bg-primary);
}

.form-input.input-error {
  border-color: #dc2626;
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
}

.form-input::placeholder {
  color: #9ca3af;
  font-weight: 400;
}

.email-input,
.password-input {
  position: relative;
  display: flex;
  align-items: center;
}

.password-toggle {
  position: absolute;
  right: 1rem;
  background: none;
  border: none;
  cursor: pointer;
  width: 1.25rem;
  height: 1.25rem;
  color: #6b7280;
  padding: 0.25rem;
  border-radius: 4px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.password-toggle:hover {
  color: #058526;
  background: rgba(5, 133, 38, 0.1);
}

.error-message {
  color: #dc2626;
  font-size: 0.875rem;
  font-weight: 500;
  margin-top: 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.error-banner {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #dc2626;
  padding: 0.875rem 1rem;
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.error-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}

.submit-button {
  width: 100%;
  padding: 1rem 1.5rem;
  background: linear-gradient(135deg, #058526 0%, #04701f 100%);
  color: white;
  border: none;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  box-shadow: 0 4px 12px rgba(5, 133, 38, 0.3);
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(5, 133, 38, 0.4);
}

.submit-button:active:not(:disabled) {
  transform: translateY(0);
}

.submit-button:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.loading-spinner {
  width: 1rem;
  height: 1rem;
  border: 2px solid transparent;
  border-top: 2px solid currentColor;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.button-icon {
  width: 1.125rem;
  height: 1.125rem;
}

/* Responsive Design */
@media (max-width: 768px) {
  .enhanced-form {
    gap: 1.25rem;
  }

  .form-input {
    padding: 0.875rem 1rem;
    font-size: 1rem; /* Keep 16px to prevent zoom on iOS */
    border-radius: 8px;
  }

  .submit-button {
    padding: 1rem 1.25rem;
    font-size: 1rem;
    border-radius: 8px;
    min-height: 48px; /* Better touch target */
  }

  .password-toggle {
    width: 2rem;
    height: 2rem;
    right: 0.5rem;
  }

  .form-label {
    font-size: 1rem;
  }
}

@media (max-width: 480px) {
  .enhanced-form {
    gap: 1rem;
  }

  .form-input {
    padding: 0.75rem 1rem;
    font-size: 16px; /* Prevent zoom on iOS */
  }

  .submit-button {
    padding: 0.875rem 1.25rem;
    font-size: 0.875rem;
  }
}
</style>
