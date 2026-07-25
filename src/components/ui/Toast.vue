<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  type: { type: String, default: 'info' }, // success, error, warning, info
  message: { type: String, required: true },
  duration: { type: Number, default: 5000 },
  closable: { type: Boolean, default: true },
})

const emit = defineEmits(['close'])

const isVisible = ref(false)
const timeoutId = ref(null)

onMounted(() => {
  isVisible.value = true

  if (props.duration > 0) {
    timeoutId.value = setTimeout(() => {
      close()
    }, props.duration)
  }
})

onUnmounted(() => {
  if (timeoutId.value) {
    clearTimeout(timeoutId.value)
  }
})

function close() {
  isVisible.value = false
  setTimeout(() => {
    emit('close')
  }, 300)
}

function getIcon() {
  const icons = {
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info',
  }
  return icons[props.type] || icons.info
}

function getTitle() {
  const titles = {
    success: 'Success',
    error: 'Error',
    warning: 'Warning',
    info: 'Info',
  }
  return titles[props.type] || titles.info
}
</script>

<template>
  <Transition name="toast-slide">
    <div v-if="isVisible" :class="['toast', `toast--${type}`]">
      <div class="toast-content">
        <div class="toast-icon">
          <span class="material-symbols-outlined" aria-hidden="true">{{ getIcon() }}</span>
        </div>
        <div class="toast-message">
          <h4 class="toast-title">{{ getTitle() }}</h4>
          <p>{{ message }}</p>
        </div>
        <button v-if="closable" @click="close" class="toast-close" aria-label="Close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.toast {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  max-width: 400px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  overflow: hidden;
}

.toast--success {
  border-left: 4px solid var(--success-color, #069e2d);
}

.toast--error {
  border-left: 4px solid #ef4444;
}

.toast--warning {
  border-left: 4px solid #f59e0b;
}

.toast--info {
  border-left: 4px solid #3b82f6;
}

.toast-content {
  display: flex;
  align-items: flex-start;
  padding: 1rem;
  gap: 0.75rem;
}

.toast-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
  margin-top: 0.125rem;
}

.toast-message {
  flex: 1;
}

.toast-title {
  font-size: 0.875rem;
  font-weight: 600;
  margin: 0 0 0.25rem 0;
  color: #374151;
}

.toast-message p {
  font-size: 0.875rem;
  margin: 0;
  color: #6b7280;
  line-height: 1.4;
}

.toast-close {
  background: none;
  border: none;
  font-size: 1.125rem;
  color: #9ca3af;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 4px;
  flex-shrink: 0;
  transition: color 0.2s;
}

.toast-close:hover {
  color: #374151;
}

/* Animations */
.toast-slide-enter-active,
.toast-slide-leave-active {
  transition: all 0.3s ease;
}

.toast-slide-enter-from {
  transform: translateY(100%);
  opacity: 0;
}

.toast-slide-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

@media (max-width: 640px) {
  .toast {
    bottom: 0.5rem;
    right: 0.5rem;
    left: 0.5rem;
    max-width: none;
  }
}
</style>
