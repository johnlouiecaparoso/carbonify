<script setup>
import { computed } from 'vue'

const props = defineProps({
  value: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  size: { type: String, default: 'md' }, // sm, md, lg
  variant: { type: String, default: 'primary' }, // primary, success, warning, error
  animated: { type: Boolean, default: false },
  striped: { type: Boolean, default: false },
})

const percentage = computed(() => {
  const val = Math.min(Math.max(props.value, 0), props.max)
  return (val / props.max) * 100
})

const classes = computed(() => [
  'progress-bar',
  `progress-bar--${props.size}`,
  `progress-bar--${props.variant}`,
  props.animated && 'progress-bar--animated',
  props.striped && 'progress-bar--striped',
])
</script>

<template>
  <div class="progress-container">
    <div :class="classes">
      <div
        class="progress-fill"
        :style="{ width: `${percentage}%` }"
        :aria-valuenow="value"
        :aria-valuemin="0"
        :aria-valuemax="max"
        role="progressbar"
      >
        <span v-if="size === 'lg'" class="progress-text"> {{ Math.round(percentage) }}% </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.progress-container {
  width: 100%;
}

.progress-bar {
  width: 100%;
  height: 0.5rem;
  background: #e5e7eb;
  border-radius: 0.375rem;
  overflow: hidden;
  position: relative;
}

.progress-bar--sm {
  height: 0.25rem;
}

.progress-bar--md {
  height: 0.5rem;
}

.progress-bar--lg {
  height: 1rem;
}

.progress-fill {
  height: 100%;
  background: #3b82f6;
  border-radius: inherit;
  transition: width 0.3s ease;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.progress-bar--primary .progress-fill {
  background: #3b82f6;
}

.progress-bar--success .progress-fill {
  background: var(--success-color, #058526);
}

.progress-bar--warning .progress-fill {
  background: #f59e0b;
}

.progress-bar--error .progress-fill {
  background: #ef4444;
}

.progress-bar--animated .progress-fill {
  animation: progress-shimmer 2s ease-in-out infinite;
}

.progress-bar--striped .progress-fill {
  background-image: linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.15) 25%,
    transparent 25%,
    transparent 50%,
    rgba(255, 255, 255, 0.15) 50%,
    rgba(255, 255, 255, 0.15) 75%,
    transparent 75%,
    transparent
  );
  background-size: 1rem 1rem;
}

.progress-text {
  color: white;
  font-size: 0.75rem;
  font-weight: 600;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

@keyframes progress-shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}
</style>
