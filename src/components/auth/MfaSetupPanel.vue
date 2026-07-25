<template>
  <div class="security-item column">
    <div class="security-info">
      <span class="security-label">
        Two-Factor Authentication
        <span v-if="enabled" class="enabled-pill">Enabled</span>
      </span>
      <span class="security-description">
        Add a time-based one-time code (TOTP) from an authenticator app as a second
        sign-in factor.
      </span>
    </div>

    <div v-if="loading" class="muted">Loading…</div>

    <!-- Enabled: offer disable -->
    <template v-else-if="enabled && !enrolling">
      <div class="action">
        <button class="btn-danger" @click="disable" :disabled="busy">
          {{ busy ? 'Disabling…' : 'Disable 2FA' }}
        </button>
      </div>
    </template>

    <!-- Not enabled, not yet enrolling -->
    <template v-else-if="!enrolling">
      <div class="action">
        <button class="security-button" @click="startEnroll" :disabled="busy">
          {{ busy ? 'Starting…' : 'Enable 2FA' }}
        </button>
      </div>
    </template>

    <!-- Enrollment in progress -->
    <template v-else>
      <div class="enroll-box">
        <p class="step-text">1. Scan this QR code with your authenticator app:</p>
        <div class="qr" v-html="qrCode"></div>
        <p class="step-text">Or enter this key manually:</p>
        <code class="secret">{{ secret }}</code>

        <p class="step-text">2. Enter the 6-digit code to confirm:</p>
        <input v-model="code" type="text" inputmode="numeric" class="sec-input" placeholder="6-digit code" />

        <p v-if="message" class="sec-message" :class="{ error: isError }">{{ message }}</p>
        <div class="form-actions">
          <button class="btn-ghost" @click="cancelEnroll">Cancel</button>
          <button class="security-button" @click="confirmEnroll" :disabled="busy">
            {{ busy ? 'Verifying…' : 'Verify & Enable' }}
          </button>
        </div>
      </div>
    </template>

    <p v-if="message && !enrolling" class="sec-message" :class="{ error: isError }">{{ message }}</p>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import {
  isMfaEnabled,
  getVerifiedTotpFactor,
  enroll,
  verifyEnrollment,
  unenroll,
} from '@/services/mfaService'

const loading = ref(true)
const enabled = ref(false)
const enrolling = ref(false)
const busy = ref(false)
const factorId = ref(null)
const qrCode = ref('')
const secret = ref('')
const code = ref('')
const message = ref('')
const isError = ref(false)

function setMessage(text, error = false) {
  message.value = text
  isError.value = error
}

async function refresh() {
  loading.value = true
  try {
    enabled.value = await isMfaEnabled()
  } catch (err) {
    console.warn('MFA status check failed:', err?.message)
  } finally {
    loading.value = false
  }
}

async function startEnroll() {
  busy.value = true
  setMessage('')
  try {
    const result = await enroll()
    factorId.value = result.factorId
    qrCode.value = result.qrCode
    secret.value = result.secret
    enrolling.value = true
  } catch (err) {
    setMessage(err.message || 'Failed to start enrollment', true)
  } finally {
    busy.value = false
  }
}

async function confirmEnroll() {
  setMessage('')
  if (!code.value || code.value.trim().length < 6) {
    setMessage('Enter the 6-digit code from your app.', true)
    return
  }
  busy.value = true
  try {
    await verifyEnrollment(factorId.value, code.value.trim())
    enrolling.value = false
    code.value = ''
    setMessage('Two-factor authentication enabled.')
    await refresh()
  } catch (err) {
    setMessage(err.message || 'Invalid code. Please try again.', true)
  } finally {
    busy.value = false
  }
}

async function cancelEnroll() {
  // Best-effort cleanup of the unverified factor
  try {
    if (factorId.value) await unenroll(factorId.value)
  } catch {
    /* ignore */
  }
  enrolling.value = false
  code.value = ''
  setMessage('')
}

async function disable() {
  if (!confirm('Disable two-factor authentication? Your account will be less secure.')) return
  busy.value = true
  setMessage('')
  try {
    const factor = await getVerifiedTotpFactor()
    if (factor) await unenroll(factor.id)
    setMessage('Two-factor authentication disabled.')
    await refresh()
  } catch (err) {
    setMessage(err.message || 'Failed to disable 2FA', true)
  } finally {
    busy.value = false
  }
}

onMounted(refresh)
</script>

<style scoped>
.security-item.column {
  flex-direction: column;
  align-items: stretch;
  gap: 0.75rem;
}

.enabled-pill {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0.1rem 0.5rem;
  background: #d1fae5;
  color: #065f46;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  vertical-align: middle;
}

.muted {
  color: var(--text-muted, #6b7280);
  font-size: 0.85rem;
}

.enroll-box {
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.step-text {
  font-size: 0.85rem;
  color: var(--text-primary, #1a202c);
  margin: 0.25rem 0 0;
}

.qr {
  width: 180px;
  height: 180px;
  align-self: center;
}

.qr :deep(svg) {
  width: 100%;
  height: 100%;
}

.secret {
  display: inline-block;
  background: #f1f5f9;
  padding: 0.4rem 0.6rem;
  border-radius: 6px;
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  word-break: break-all;
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

.btn-danger {
  padding: 0.5rem 1rem;
  border: none;
  background: #fee2e2;
  color: #991b1b;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}

.btn-danger:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
