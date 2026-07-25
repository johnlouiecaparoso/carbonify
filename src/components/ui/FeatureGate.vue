<template>
  <!-- Entitled: render the gated content. -->
  <slot v-if="unlocked" />

  <!-- Locked: an inline upgrade prompt (override via the #locked slot). -->
  <div v-else class="feature-gate">
    <slot name="locked">
      <div class="lock-card">
        <span class="material-symbols-outlined lock-icon" aria-hidden="true">lock</span>
        <h3 class="lock-title">{{ title || 'Premium feature' }}</h3>
        <p class="lock-text">{{ message || 'Upgrade your plan to unlock this.' }}</p>
        <router-link :to="upgradeTo" class="lock-cta">Upgrade plan →</router-link>
      </div>
    </slot>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useUserStore } from '@/store/userStore'

/**
 * Gates its default slot behind a subscription feature.
 *  <FeatureGate :feature="FEATURES.ADVANCED_ANALYTICS"> ...premium UI... </FeatureGate>
 * Provide #locked to customise the blocked state.
 *
 * NOTE: this is UX only. Premium *actions* are also enforced server-side.
 */
const props = defineProps({
  feature: { type: String, required: true },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
})

const store = useUserStore()
const unlocked = computed(() => store.hasFeature(props.feature))
const upgradeTo = computed(() => ({ name: 'upgrade', query: { feature: props.feature } }))
</script>

<style scoped>
.feature-gate {
  width: 100%;
}
.lock-card {
  text-align: center;
  max-width: 440px;
  margin: 1.5rem auto;
  padding: 2rem 1.5rem;
  border: 1px dashed #d1d5db;
  border-radius: 12px;
  background: #f9fafb;
}
.lock-icon {
  font-size: 2.25rem;
  color: #058526;
}
.lock-title {
  margin: 0.5rem 0 0.25rem;
  font-size: 1.1rem;
}
.lock-text {
  color: #6b7280;
  font-size: 0.9rem;
  margin: 0 0 1rem;
}
.lock-cta {
  display: inline-block;
  padding: 0.55rem 1.1rem;
  background: #058526;
  color: #fff;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.875rem;
  text-decoration: none;
}
.lock-cta:hover {
  background: #058427;
}
</style>
