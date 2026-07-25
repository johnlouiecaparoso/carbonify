<script setup>
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { ROLES } from '@/constants/roles'
import {
  loginWithEmail,
  signOut,
  signInWithGoogle,
  sendPhoneOtp,
  verifyPhoneOtp,
} from '@/services/authService'
import { isMfaRequired, challengeAndVerify } from '@/services/mfaService'
import { getRoleDefaultRoute } from '@/utils/getRoleDefaultRoute'
import { getTestAccountByEmail } from '@/utils/testAccounts'
import UiInput from '@/components/ui/Input.vue'
import UiButton from '@/components/ui/Button.vue'

const router = useRouter()
const route = useRoute()
const store = useUserStore()
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMessage = ref('')
const emailError = ref('')
const passwordError = ref('')

// MFA step-up state
const mfaRequired = ref(false)
const mfaFactorId = ref(null)
const mfaCode = ref('')
const mfaError = ref('')
const mfaLoading = ref(false)

// Social / phone auth state
const googleLoading = ref(false)
const phoneMode = ref(false)
const phone = ref('')
const otpSent = ref(false)
const otpCode = ref('')
const phoneLoading = ref(false)
const phoneError = ref('')

async function loginGoogle() {
  errorMessage.value = ''
  googleLoading.value = true
  try {
    await signInWithGoogle() // redirects to Google, then /auth/callback
  } catch (err) {
    errorMessage.value = err?.message || 'Could not start Google sign-in.'
    googleLoading.value = false
  }
}

function togglePhoneMode() {
  phoneMode.value = !phoneMode.value
  phoneError.value = ''
  errorMessage.value = ''
  otpSent.value = false
  otpCode.value = ''
}

async function sendOtp() {
  phoneError.value = ''
  if (!/^\+\d{8,15}$/.test(phone.value.trim())) {
    phoneError.value = 'Enter your number in international format, e.g. +639171234567.'
    return
  }
  phoneLoading.value = true
  try {
    await sendPhoneOtp(phone.value.trim())
    otpSent.value = true
  } catch (err) {
    phoneError.value =
      err?.message || 'Could not send the code. SMS sign-in may not be enabled yet.'
  } finally {
    phoneLoading.value = false
  }
}

async function verifyOtp() {
  phoneError.value = ''
  if (!otpCode.value || otpCode.value.trim().length < 6) {
    phoneError.value = 'Enter the 6-digit code we texted you.'
    return
  }
  phoneLoading.value = true
  try {
    const result = await verifyPhoneOtp(phone.value.trim(), otpCode.value.trim())
    if (result?.session) store.session = result.session
    else await store.fetchSession()
    await finishLogin()
  } catch (err) {
    phoneError.value = err?.message || 'Invalid or expired code.'
  } finally {
    phoneLoading.value = false
  }
}

async function finishLogin() {
  // Fetch user profile to get role for redirect
  await store.fetchUserProfile()
  if (!store.role || store.role === ROLES.GENERAL_USER) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  const returnTo = route.query.returnTo
  if (returnTo) {
    router.replace(decodeURIComponent(returnTo))
  } else {
    // Land on the role's own workspace (buyers included) rather than the
    // public marketing homepage.
    router.replace(getRoleDefaultRoute(store.role || store.profile?.role))
  }
}

async function verifyMfa() {
  mfaError.value = ''
  if (!mfaCode.value || mfaCode.value.trim().length < 6) {
    mfaError.value = 'Enter the 6-digit code from your authenticator app.'
    return
  }
  mfaLoading.value = true
  try {
    await challengeAndVerify(mfaFactorId.value, mfaCode.value.trim())
    await finishLogin()
  } catch (err) {
    mfaError.value = err?.message || 'Invalid code. Please try again.'
  } finally {
    mfaLoading.value = false
  }
}

async function cancelMfa() {
  try {
    await signOut()
  } catch {
    /* ignore */
  }
  store.session = null
  mfaRequired.value = false
  mfaFactorId.value = null
  mfaCode.value = ''
  mfaError.value = ''
}

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
  // No minimum length on SIGN-IN. Registration requires 8 characters, but this
  // form used to demand 6 — a rule that can only ever reject a correct password
  // belonging to an older account. Whether the password is right is the
  // server's call.
  passwordError.value = ''
  return true
}

function validateForm() {
  // Both, deliberately not `a() && b()`. Short-circuiting meant a user who got
  // both fields wrong fixed the password, submitted, and only then discovered
  // the email was wrong too.
  const passwordOk = validatePassword()
  const emailOk = validateEmail()
  return passwordOk && emailOk
}

async function handleSubmit() {
  errorMessage.value = ''
  emailError.value = ''

  if (!validateForm()) {
    return
  }
  loading.value = true
  try {
    let session

    // TEST ACCOUNTS DISABLED IN PRODUCTION
    // Only enable test accounts in development mode
    const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development'

    if (isDevelopment) {
      // Check if this is a test account (development only)
      const testAccount = getTestAccountByEmail(email.value)
      if (testAccount && password.value === testAccount.password) {
        // Use test account mock session (development only)
        store.session = testAccount.mockSession
        store.role = testAccount.role
        console.log(`[DEV] Logged in as test ${testAccount.role}:`, testAccount.name)

        // Redirect based on priority: returnTo, else the role's own workspace.
        const returnTo = route.query.returnTo
        if (returnTo) {
          router.replace(decodeURIComponent(returnTo))
        } else {
          const target = getRoleDefaultRoute(testAccount.role)
          console.log(`[DEV] Test login as ${testAccount.role}, redirecting to ${target}`)
          router.replace(target)
        }
        return
      }
    }

    // Try real email authentication (production)
    const result = await loginWithEmail({ email: email.value, password: password.value })
    session = result.session

    // Set session immediately to avoid guard race conditions
    if (session) {
      store.session = session
    } else {
      await store.fetchSession()
    }

    // If the user has 2FA enabled, the session is still at aal1 — require a
    // TOTP code before continuing (step up to aal2).
    const { required, factorId } = await isMfaRequired()
    if (required && factorId) {
      mfaFactorId.value = factorId
      mfaRequired.value = true
      loading.value = false
      return
    }

    await finishLogin()
  } catch (err) {
    const msg = String(err?.message || '')
    // Pending-approval is matched on err.code, not on the sentence. The regex
    // that used to do this had to stay word-for-word in sync with the message
    // thrown in authService — a rewording there would have shown this user the
    // generic "Unable to sign in" instead of the reason.
    if (err?.code === 'ROLE_APPLICATION_PENDING') {
      errorMessage.value = msg
    } else if (/email[_\s]not[_\s]confirmed|confirm your email|email not confirmed/i.test(msg)) {
      errorMessage.value =
        'Your email address has not been confirmed yet. Please check your inbox for the confirmation link, or ask an admin to verify your account.'
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
  <div class="login-form-container">
    <div class="login-header">
      <h2 class="login-title">Welcome back</h2>
      <p class="login-subtitle">Sign in to access your Carbonify dashboard.</p>
    </div>
    <!-- MFA step (shown after password if 2FA is enabled) -->
    <form v-if="mfaRequired" class="form-grid" @submit.prevent="verifyMfa">
      <div class="form-field">
        <label for="mfaCode" class="form-label">
          <span class="material-symbols-outlined label-icon" aria-hidden="true">password</span>
          Authentication code
        </label>
        <UiInput
          id="mfaCode"
          type="text"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="6-digit code"
          v-model="mfaCode"
        />
        <p class="mfa-hint">Enter the 6-digit code from your authenticator app.</p>
      </div>

      <div v-if="mfaError" class="error-message">{{ mfaError }}</div>

      <UiButton type="submit" :loading="mfaLoading" block class="sign-in-button">
        <span class="material-symbols-outlined" aria-hidden="true">verified_user</span>
        <span>Verify</span>
      </UiButton>
      <button type="button" class="link-button" @click="cancelMfa">Cancel</button>
    </form>

    <form v-else class="form-grid" @submit.prevent="handleSubmit">
      <!-- Email Input -->
      <div class="form-field">
        <label for="email" class="form-label">
          <span class="material-symbols-outlined label-icon" aria-hidden="true">mail</span>
          Email Address
        </label>
        <UiInput
          id="email"
          type="email"
          autocomplete="username"
          placeholder="Email"
          v-model="email"
          :error="emailError"
          @blur="validateEmail"
          @input="emailError = ''"
        />
      </div>

      <div class="form-field">
        <label for="password" class="form-label">
          <span class="material-symbols-outlined label-icon" aria-hidden="true">lock</span>
          Password
        </label>
        <UiInput
          id="password"
          type="password"
          autocomplete="current-password"
          placeholder="Enter your password"
          v-model="password"
          :error="passwordError"
          @blur="validatePassword"
          @input="passwordError = ''"
        />
      </div>

      <div class="forgot-password-row">
        <router-link to="/forgot-password" class="forgot-link">Forgot your password?</router-link>
      </div>

      <div v-if="errorMessage" class="error-message">{{ errorMessage }}</div>

      <UiButton type="submit" :loading="loading" block class="sign-in-button">
        <span class="material-symbols-outlined" aria-hidden="true">login</span>
        <span>Sign In</span>
      </UiButton>
    </form>

    <!-- Alternative sign-in methods (hidden during MFA step) -->
    <template v-if="!mfaRequired">
      <div class="auth-divider"><span>or</span></div>

      <button type="button" class="social-button" :disabled="googleLoading" @click="loginGoogle">
        <img
          src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
          alt=""
          class="social-icon"
        />
        <span>{{ googleLoading ? 'Redirecting…' : 'Continue with Google' }}</span>
      </button>

      <button type="button" class="social-button" @click="togglePhoneMode">
        <span class="material-symbols-outlined" aria-hidden="true">smartphone</span>
        <span>{{ phoneMode ? 'Use email instead' : 'Sign in with phone' }}</span>
      </button>

      <!-- Phone OTP flow -->
      <form
        v-if="phoneMode"
        class="form-grid phone-form"
        @submit.prevent="otpSent ? verifyOtp() : sendOtp()"
      >
        <div class="form-field">
          <label for="phone" class="form-label">
            <span class="material-symbols-outlined label-icon" aria-hidden="true">call</span>
            Phone number
          </label>
          <UiInput
            id="phone"
            type="tel"
            placeholder="+639171234567"
            v-model="phone"
            :disabled="otpSent"
          />
        </div>

        <div v-if="otpSent" class="form-field">
          <label for="otpCode" class="form-label">
            <span class="material-symbols-outlined label-icon" aria-hidden="true">password</span>
            Verification code
          </label>
          <UiInput
            id="otpCode"
            type="text"
            inputmode="numeric"
            autocomplete="one-time-code"
            placeholder="6-digit code"
            v-model="otpCode"
          />
        </div>

        <div v-if="phoneError" class="error-message">{{ phoneError }}</div>

        <UiButton type="submit" :loading="phoneLoading" block class="sign-in-button">
          <span>{{ otpSent ? 'Verify & sign in' : 'Send code' }}</span>
        </UiButton>
        <button v-if="otpSent" type="button" class="link-button" @click="otpSent = false">
          Use a different number
        </button>
      </form>
    </template>
  </div>
</template>

<style scoped>
/* Enhanced Login Form - Properly centered and sized */
.login-form-container {
  width: 100%;
  margin: 0;
  padding: 0;
  background: transparent;
  position: relative;
}

/* Login Header - Centered and properly spaced */
.login-header {
  margin-bottom: 1.5rem;
  padding-bottom: 0;
  border-bottom: none;
}

.login-title {
  font-size: 1.875rem;
  font-weight: 700;
  color: #1f2937;
  margin: 0 0 0.5rem;
  letter-spacing: -0.025em;
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
}

.login-subtitle {
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
}

.form-grid :deep(.enhanced-input__field:focus) {
  border-color: var(--primary-color, #058526);
  outline: none;
  box-shadow: 0 0 0 3px rgba(5, 133, 38, 0.1);
}

.form-grid :deep(.enhanced-input__field::placeholder) {
  color: #9ca3af;
  font-weight: 400;
}

.sign-in-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-weight: 600;
}

.sign-in-button .material-symbols-outlined {
  font-size: 1.35rem;
}

.sign-in-button :deep(.ui-btn) {
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

.sign-in-button :deep(.ui-btn:hover) {
  background: var(--primary-hover, #04701f);
}

.button-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
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

.forgot-password-row {
  display: flex;
  justify-content: flex-end;
  margin-top: -0.5rem;
}

.forgot-link {
  font-size: 0.8rem;
  color: var(--primary-color, #058526);
  text-decoration: none;
  font-weight: 500;
}

.forgot-link:hover {
  text-decoration: underline;
}

.mfa-hint {
  font-size: 0.78rem;
  color: #6b7280;
  margin: 0.4rem 0 0;
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
  margin-bottom: 0.6rem;
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

.phone-form {
  margin-top: 0.75rem;
}

.link-button {
  background: none;
  border: none;
  color: #6b7280;
  font-size: 0.85rem;
  cursor: pointer;
  text-align: center;
  width: 100%;
}

.link-button:hover {
  color: #374151;
  text-decoration: underline;
}

button[disabled] {
  opacity: 0.8;
  cursor: not-allowed;
}

/* Responsive Design for Login Form */
@media (max-width: 768px) {
  .login-title {
    font-size: 1.5rem;
  }

  .login-subtitle {
    font-size: 0.875rem;
  }

  .form-grid {
    gap: 1.25rem;
  }
}

@media (max-width: 480px) {
  .login-title {
    font-size: 1.375rem;
  }

  .login-subtitle {
    font-size: 0.8rem;
  }

  .form-grid {
    gap: 1rem;
  }
}
</style>
