<script setup>
/**
 * Tells a buyer *before* they start a purchase that identity verification is
 * required, with a direct link to the KYC page. Renders nothing when the user
 * can already trade, so it's safe to drop at the top of any buy surface.
 */
import { onMounted } from 'vue'
import { useTradeEligibility } from '@/composables/useTradeEligibility'

defineProps({
  /** Tightens the copy for the surface it sits on (e.g. "checkout"). */
  context: { type: String, default: '' },
})

const { needsKyc, currentLevelLabel, requiredLevelLabel, minLevel, ensureLoaded } =
  useTradeEligibility()

onMounted(ensureLoaded)
</script>

<template>
  <section v-if="needsKyc" class="kyc-gate" role="status">
    <span class="kyc-gate__icon material-symbols-outlined" aria-hidden="true">verified_user</span>
    <div class="kyc-gate__body">
      <strong class="kyc-gate__title">
        Verify your identity {{ context ? `to complete ${context}` : 'before buying credits' }}
      </strong>
      <p class="kyc-gate__text">
        Your account is <em>{{ currentLevelLabel }}</em
        >. Purchases require level {{ minLevel }} ({{ requiredLevelLabel }}) or higher. Verification
        usually takes one business day.
      </p>
    </div>
    <router-link to="/kyc" class="kyc-gate__cta">Verify identity</router-link>
  </section>
</template>

<style scoped>
.kyc-gate {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 12px;
  color: #78350f;
}
.kyc-gate__icon {
  font-size: 1.75rem;
  flex-shrink: 0;
}
.kyc-gate__body {
  flex: 1;
  min-width: 240px;
}
.kyc-gate__title {
  display: block;
  font-size: 0.975rem;
}
.kyc-gate__text {
  margin: 0.2rem 0 0;
  font-size: 0.875rem;
  opacity: 0.9;
}
.kyc-gate__cta {
  padding: 0.6rem 1rem;
  background: #b45309;
  color: #fff;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.9rem;
  text-decoration: none;
  white-space: nowrap;
}
.kyc-gate__cta:hover {
  background: #92400e;
}
</style>
