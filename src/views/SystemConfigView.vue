<template>
  <div class="config-view">
    <PageHeader
      title="System Configuration"
      description="Manage platform-wide settings. Changes take effect on the next relevant action (e.g. the platform fee applies to new purchases)."
    />
    <div class="container">

      <div v-if="loadError" class="admin-load-error">{{ loadError }}</div>
      <div v-if="loading" class="state-card">Loading configuration…</div>

      <template v-else>
        <!-- Marketplace fee -->
        <section class="config-card">
          <h2 class="card-title">Marketplace</h2>
          <div class="field-row">
            <label for="fee">Platform fee (%)</label>
            <input id="fee" type="number" step="0.1" min="0" max="100" v-model.number="feePercent" />
            <button class="save-btn" :disabled="savingFee" @click="saveFee">
              {{ savingFee ? 'Saving…' : 'Save' }}
            </button>
          </div>
          <p class="field-hint">
            Charged on each purchase and booked to <code>platform_revenue</code>; the rest is the
            seller's net. 0 = no fee.
          </p>
          <p v-if="feeMsg" class="msg" :class="feeMsg.type">{{ feeMsg.text }}</p>
        </section>

        <!-- Project & verification fees -->
        <section class="config-card">
          <h2 class="card-title">Project & verification fees</h2>
          <div class="field-row">
            <label for="onboarding-fee">Project onboarding fee (₱)</label>
            <input
              id="onboarding-fee"
              type="number"
              step="1"
              min="0"
              v-model.number="onboardingFee"
            />
            <button class="save-btn" :disabled="savingFees" @click="saveFees">
              {{ savingFees ? 'Saving…' : 'Save' }}
            </button>
          </div>
          <p class="field-hint">
            Flat fee shown to a developer when they submit a project. 0 = free onboarding.
          </p>
          <div class="field-row">
            <label for="verification-fee">Verification / certification fee (₱)</label>
            <input
              id="verification-fee"
              type="number"
              step="1"
              min="0"
              v-model.number="verificationFee"
            />
            <button class="save-btn" :disabled="savingFees" @click="saveFees">
              {{ savingFees ? 'Saving…' : 'Save' }}
            </button>
          </div>
          <p class="field-hint">
            Flat fee for verification / certification support, disclosed on the project. 0 = free.
            Collection is a follow-up (see <code>docs/GAP_ANALYSIS.md</code>); today these are
            configuration + disclosure only.
          </p>
          <p v-if="feesMsg" class="msg" :class="feesMsg.type">{{ feesMsg.text }}</p>
        </section>

        <!-- Trading / KYC -->
        <section class="config-card">
          <h2 class="card-title">Trading & KYC</h2>
          <div class="field-row">
            <label for="kyc">Minimum KYC level to trade</label>
            <input id="kyc" type="number" step="1" min="0" v-model.number="minKyc" />
            <button class="save-btn" :disabled="savingKyc" @click="saveKyc">
              {{ savingKyc ? 'Saving…' : 'Save' }}
            </button>
          </div>
          <p class="field-hint">
            Users below this <code>kyc_level</code> can't buy or sell.
            Tiers: <span v-for="t in kycTiers" :key="t.level" class="tier-chip">{{ t.level }} · {{ t.label }}</span>
          </p>
          <p v-if="kycMsg" class="msg" :class="kycMsg.type">{{ kycMsg.text }}</p>
        </section>

        <!-- Emission factors -->
        <section class="config-card">
          <h2 class="card-title">Emission Factors</h2>
          <p class="field-hint">
            These drive server-side credit calculations. Editing a factor affects
            <strong>future</strong> issuance only.
          </p>
          <p v-if="factorMsg" class="msg" :class="factorMsg.type">{{ factorMsg.text }}</p>

          <div v-if="factors.length === 0" class="state-card">No emission factors found.</div>
          <CollapsibleList v-else :count="factors.length">
          <table class="factor-table">
            <thead>
              <tr>
                <th>Project type</th>
                <th>Metric</th>
                <th>Unit</th>
                <th>Factor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="f in factors" :key="f.id">
                <td>{{ f.project_type }}</td>
                <td>{{ f.label }}</td>
                <td>{{ f.unit }}</td>
                <td>
                  <input type="number" step="any" v-model.number="f.factor" class="factor-input" />
                </td>
                <td>
                  <button class="save-btn small" :disabled="savingFactorId === f.id" @click="saveFactor(f)">
                    {{ savingFactorId === f.id ? '…' : 'Save' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          </CollapsibleList>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import CollapsibleList from '@/components/ui/CollapsibleList.vue'
import {
  getAllSettings,
  updateSetting,
  listMethodologyFactors,
  updateMethodologyFactor,
  FEE_KEYS,
} from '@/services/settingsService'

const loading = ref(true)
const loadError = ref('')
const feePercent = ref(0)
const minKyc = ref(1)
const kycTiers = ref([])
const factors = ref([])
const onboardingFee = ref(0)
const verificationFee = ref(0)

const savingFee = ref(false)
const savingKyc = ref(false)
const savingFees = ref(false)
const savingFactorId = ref(null)
const feeMsg = ref(null)
const kycMsg = ref(null)
const feesMsg = ref(null)
const factorMsg = ref(null)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    // Settings and methodology factors are independent panels; a failure in one
    // used to leave the whole config page blank with no explanation.
    const [settingsRes, factorRes] = await Promise.allSettled([
      getAllSettings(),
      listMethodologyFactors(),
    ])

    if (settingsRes.status === 'fulfilled') {
      const settings = settingsRes.value
      feePercent.value = Number(settings.platform_fee_percent ?? 0)
      minKyc.value = Number(settings.min_kyc_level_to_trade ?? 1)
      kycTiers.value = Array.isArray(settings.kyc_tiers) ? settings.kyc_tiers : []
      onboardingFee.value = Number(settings[FEE_KEYS.onboarding] ?? 0)
      verificationFee.value = Number(settings[FEE_KEYS.verification] ?? 0)
    }
    if (factorRes.status === 'fulfilled') factors.value = factorRes.value

    const failed = [
      settingsRes.status === 'rejected' && 'platform settings',
      factorRes.status === 'rejected' && 'methodology factors',
    ].filter(Boolean)
    // Never let a blank field read as "the saved value is empty" -- saving over
    // that would silently reset live configuration.
    if (failed.length) {
      loadError.value = `Could not load: ${failed.join(', ')}. Do not save those sections until this resolves.`
    }
  } finally {
    loading.value = false
  }
}

async function saveFee() {
  feeMsg.value = null
  if (feePercent.value < 0 || feePercent.value > 100) {
    feeMsg.value = { type: 'error', text: 'Fee must be between 0 and 100%.' }
    return
  }
  savingFee.value = true
  try {
    await updateSetting('platform_fee_percent', Number(feePercent.value))
    feeMsg.value = { type: 'ok', text: 'Platform fee saved.' }
  } catch (err) {
    feeMsg.value = { type: 'error', text: err.message }
  } finally {
    savingFee.value = false
  }
}

async function saveFees() {
  feesMsg.value = null
  if (onboardingFee.value < 0 || verificationFee.value < 0) {
    feesMsg.value = { type: 'error', text: 'Fees cannot be negative.' }
    return
  }
  savingFees.value = true
  try {
    // Two independent settings; save both so either input's Save button persists
    // the whole section.
    await updateSetting(FEE_KEYS.onboarding, Number(onboardingFee.value) || 0)
    await updateSetting(FEE_KEYS.verification, Number(verificationFee.value) || 0)
    feesMsg.value = { type: 'ok', text: 'Fees saved.' }
  } catch (err) {
    feesMsg.value = { type: 'error', text: err.message }
  } finally {
    savingFees.value = false
  }
}

async function saveKyc() {
  kycMsg.value = null
  if (minKyc.value < 0) {
    kycMsg.value = { type: 'error', text: 'Level cannot be negative.' }
    return
  }
  savingKyc.value = true
  try {
    await updateSetting('min_kyc_level_to_trade', Number(minKyc.value))
    kycMsg.value = { type: 'ok', text: 'Minimum KYC level saved.' }
  } catch (err) {
    kycMsg.value = { type: 'error', text: err.message }
  } finally {
    savingKyc.value = false
  }
}

async function saveFactor(f) {
  factorMsg.value = null
  savingFactorId.value = f.id
  try {
    await updateMethodologyFactor(f.id, { factor: f.factor })
    factorMsg.value = { type: 'ok', text: `Updated "${f.label}".` }
  } catch (err) {
    factorMsg.value = { type: 'error', text: err.message }
  } finally {
    savingFactorId.value = null
  }
}

onMounted(load)
</script>

<style scoped>
.config-view {
  min-height: 100vh;
  padding: 0 0 4rem;
  background: var(--bg-secondary, #f8fdf8);
}
.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 2rem 1rem 0;
}
.config-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.5rem;
  margin-bottom: 1.25rem;
}
.card-title {
  font-size: 1.15rem;
  margin: 0 0 1rem;
}
.field-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.field-row label {
  font-weight: 600;
  min-width: 220px;
}
.field-row input {
  width: 120px;
  padding: 0.5rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font: inherit;
}
.field-hint {
  color: #6b7280;
  font-size: 0.85rem;
  margin: 0.75rem 0 0;
}
.field-hint code {
  background: #f3f4f6;
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
}
.tier-chip {
  display: inline-block;
  background: #ecfdf5;
  color: #047857;
  border-radius: 999px;
  padding: 0.05rem 0.5rem;
  margin-left: 0.35rem;
  font-size: 0.75rem;
}
.save-btn {
  padding: 0.5rem 1.1rem;
  border: none;
  border-radius: 8px;
  background: #058526;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.save-btn.small {
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
}
.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.factor-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 1rem;
  font-size: 0.875rem;
}
.factor-table th,
.factor-table td {
  text-align: left;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid #eef0f2;
}
.factor-input {
  width: 110px;
  padding: 0.35rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font: inherit;
}
.state-card {
  padding: 1.25rem;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  color: #6b7280;
  text-align: center;
}
.msg {
  margin: 0.75rem 0 0;
  font-size: 0.85rem;
}
.msg.ok {
  color: #047857;
}
.msg.error {
  color: #dc2626;
}
@media (max-width: 640px) {
  .config-view {
    padding: 1.25rem 0 3rem;
  }
  .config-card {
    padding: 1.1rem;
  }
  .field-row label {
    min-width: 0;
  }
  .factor-table {
    white-space: nowrap;
  }
}

.admin-load-error {
  margin-bottom: 1rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-size: 0.86rem;
}
</style>
