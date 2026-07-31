<template>
  <div class="progress-tracker" :class="{ rejected: isRejected }">
    <div v-for="(stage, index) in stages" :key="stage.key" class="track-step">
      <div
        class="step-dot"
        :class="{
          done: index < activeIndex,
          active: index === activeIndex && !isRejected,
          failed: isRejected && index === activeIndex,
        }"
      >
        <span v-if="index < activeIndex" class="material-symbols-outlined">check</span>
        <span v-else-if="isRejected && index === activeIndex" class="material-symbols-outlined">close</span>
        <span v-else>{{ index + 1 }}</span>
      </div>
      <span class="step-label">{{ stage.label }}</span>
      <span v-if="index < stages.length - 1" class="step-line" :class="{ done: index < activeIndex }"></span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  project: { type: Object, required: true },
  // Optional flags from the MRV/issuance side (default false)
  creditsIssued: { type: Boolean, default: false },
  listed: { type: Boolean, default: false },
})

const stages = [
  { key: 'registration', label: 'Registration' },
  { key: 'validation', label: 'Validation' },
  { key: 'verification', label: 'Verification (MRV)' },
  { key: 'issuance', label: 'Issuance' },
  { key: 'trading', label: 'Trading' },
]

function normalize(status) {
  const s = String(status || '').toLowerCase().trim()
  if (s === 'pending') return 'submitted'
  if (s === 'under_review') return 'in_review'
  if (s === 'approved') return 'validated'
  return s
}

const isRejected = computed(() => normalize(props.project.status) === 'rejected')

// The index of the current (active) stage.
const activeIndex = computed(() => {
  if (props.listed) return 4
  if (props.creditsIssued) return 3
  const s = normalize(props.project.status)
  switch (s) {
    case 'draft':
      return 0
    case 'submitted':
      return 1
    case 'in_review':
    case 'needs_revision':
    case 'rejected':
      return 1
    case 'validated':
      return 2 // validated → MRV/verification stage in progress
    default:
      return 0
  }
})
</script>

<style scoped>
.progress-tracker {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.25rem;
  margin: 0.75rem 0 1rem;
  padding: 0.75rem;
  background: var(--bg-secondary, #f8fdf8);
  border: 1px solid var(--border-light, #e8f5e8);
  border-radius: 0.5rem;
}

.track-step {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.step-dot {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e5e7eb;
  color: #6b7280;
  font-size: 0.78rem;
  font-weight: 700;
  z-index: 1;
}

.step-dot .material-symbols-outlined {
  font-size: 1rem;
}

.step-dot.done {
  background: var(--primary-color, #058526);
  color: #fff;
}

.step-dot.active {
  background: #fff;
  color: var(--primary-color, #058526);
  border: 2px solid var(--primary-color, #058526);
}

.step-dot.failed {
  background: #dc2626;
  color: #fff;
}

.step-label {
  font-size: 0.68rem;
  color: var(--text-muted, #6b7280);
  text-align: center;
  line-height: 1.2;
}

.step-line {
  position: absolute;
  top: 14px;
  left: 50%;
  width: 100%;
  height: 2px;
  background: #e5e7eb;
  z-index: 0;
}

.step-line.done {
  background: var(--primary-color, #058526);
}

@media (max-width: 600px) {
  .step-label {
    font-size: 0.6rem;
  }
}
</style>
