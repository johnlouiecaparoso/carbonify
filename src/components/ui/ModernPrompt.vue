<script setup>
import { ref, watch, onMounted } from 'vue'
import UiButton from './Button.vue'

const props = defineProps({
  isOpen: { type: Boolean, default: false },
  type: { type: String, default: 'confirm' }, // 'confirm', 'success', 'error', 'warning', 'info'
  title: { type: String, required: true },
  message: { type: String, required: true },
  confirmText: { type: String, default: 'Confirm' },
  cancelText: { type: String, default: 'Cancel' },
  showCancel: { type: Boolean, default: true },
  closeOnOverlay: { type: Boolean, default: true },
})

const emit = defineEmits(['confirm', 'cancel', 'close'])

const isVisible = ref(false)

watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    isVisible.value = true
  }
})

function handleConfirm() {
  emit('confirm')
  close()
}

function handleCancel() {
  emit('cancel')
  close()
}

function close() {
  isVisible.value = false
  setTimeout(() => {
    emit('close')
  }, 300)
}

function handleOverlayClick(e) {
  if (props.closeOnOverlay && e.target === e.currentTarget) {
    close()
  }
}

function handleKeydown(e) {
  if (e.key === 'Escape') {
    close()
  }
}

onMounted(() => {
  if (props.isOpen) {
    isVisible.value = true
  }
})

function getIcon() {
  const icons = {
    confirm: 'help',
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info',
  }
  return icons[props.type] || icons.confirm
}

function getIconColor() {
  const colors = {
    confirm: '#f59e0b',
    success: '#069e2d',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#3b82f6',
  }
  return colors[props.type] || colors.confirm
}

function formatMessage(message) {
  if (!message) return ''

  // Security: HTML-escape the raw message FIRST so any user-controlled text
  // (names, project titles, dispute reasons, server error strings) cannot inject
  // markup/script. Only the tags we add below (<br>/<li>/<ul>/<strong>) are HTML.
  let formatted = String(message)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  // Convert line breaks to <br> tags
  formatted = formatted.replace(/\n/g, '<br>')
  
  // Convert bullet points (• or -) to styled list items
  formatted = formatted.replace(/^([•\-*]\s+)(.+)$/gm, '<li class="message-item">$2</li>')
  
  // Wrap consecutive list items in <ul>
  formatted = formatted.replace(/(<li class="message-item">.*?<\/li>(?:\s*<li class="message-item">.*?<\/li>)*)/g, '<ul class="message-list">$1</ul>')
  
  // Handle bold text (already escaped)
  formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  
  return formatted
}
</script>

<template>
  <Teleport to="body">
    <Transition name="prompt-fade">
      <div
        v-if="isVisible"
        class="prompt-overlay"
        @click="handleOverlayClick"
        @keydown="handleKeydown"
        tabindex="-1"
      >
        <div class="prompt-card" @click.stop>
          <div class="prompt-icon-wrapper" :style="{ backgroundColor: getIconColor() + '15' }">
            <span class="prompt-icon material-symbols-outlined" :style="{ color: getIconColor() }" aria-hidden="true">{{ getIcon() }}</span>
          </div>
          
          <div class="prompt-content">
            <h3 class="prompt-title">{{ title }}</h3>
            <div class="prompt-message" v-html="formatMessage(message)"></div>
          </div>

          <div class="prompt-actions">
            <UiButton
              v-if="showCancel"
              variant="outline"
              @click="handleCancel"
              class="prompt-button prompt-button-cancel"
            >
              {{ cancelText }}
            </UiButton>
            <UiButton
              :variant="type === 'error' ? 'danger' : 'primary'"
              @click="handleConfirm"
              class="prompt-button prompt-button-confirm"
              :style="{ backgroundColor: getIconColor(), borderColor: getIconColor() }"
            >
              {{ confirmText }}
            </UiButton>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.prompt-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 1rem;
  animation: overlayFadeIn 0.2s ease;
}

.prompt-card {
  background: white;
  border-radius: 16px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  max-width: 440px;
  width: 100%;
  padding: 2rem;
  position: relative;
  animation: cardSlideIn 0.3s ease;
  transform-origin: center;
}

.prompt-icon-wrapper {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1.5rem;
}

.prompt-icon {
  font-size: 2rem;
  line-height: 1;
}

.prompt-content {
  text-align: center;
  margin-bottom: 2rem;
}

.prompt-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: #111827;
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
}

.prompt-message {
  font-size: 1rem;
  color: #6b7280;
  margin: 0;
  line-height: 1.6;
  text-align: left;
}

.prompt-message :deep(.message-list) {
  list-style: none;
  padding: 0;
  margin: 0.75rem 0;
}

.prompt-message :deep(.message-item) {
  padding: 0.5rem 0 0.5rem 1.5rem;
  position: relative;
  color: #4b5563;
}

.prompt-message :deep(.message-item:before) {
  content: '•';
  position: absolute;
  left: 0;
  color: var(--success-color, #069e2d);
  font-weight: bold;
  font-size: 1.2rem;
}

.prompt-message :deep(strong) {
  color: #111827;
  font-weight: 600;
}

.prompt-message :deep(br) {
  line-height: 1.8;
}

.prompt-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: center;
  flex-wrap: wrap;
}

.prompt-button {
  min-width: 120px;
  padding: 0.75rem 1.5rem;
  font-weight: 500;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.prompt-button-confirm {
  color: white;
}

.prompt-button-confirm:hover {
  opacity: 0.9;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.prompt-button-cancel:hover {
  background-color: #f3f4f6;
}

@keyframes overlayFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes cardSlideIn {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.prompt-fade-enter-active {
  transition: opacity 0.3s ease;
}

.prompt-fade-leave-active {
  transition: opacity 0.2s ease;
}

.prompt-fade-enter-from,
.prompt-fade-leave-to {
  opacity: 0;
}

/* Responsive */
@media (max-width: 640px) {
  .prompt-card {
    padding: 1.5rem;
    margin: 1rem;
  }

  .prompt-icon-wrapper {
    width: 56px;
    height: 56px;
    margin-bottom: 1.25rem;
  }

  .prompt-icon {
    font-size: 1.75rem;
  }

  .prompt-title {
    font-size: 1.25rem;
  }

  .prompt-message {
    font-size: 0.9375rem;
  }

  .prompt-actions {
    flex-direction: column;
  }

  .prompt-button {
    width: 100%;
  }
}
</style>

