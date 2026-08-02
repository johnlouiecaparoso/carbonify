<script setup>
/**
 * Renders whatever `toastStore` is currently holding. Mounted once, at the app
 * root, so any action in any role can raise a floating notification without the
 * view it happened in owning any toast state.
 *
 * Bottom-anchored on purpose. The header is where the cart and bell badges
 * live, and on a phone that is off-screen the moment you scroll a listing —
 * which is exactly when someone taps "Add to cart" and sees nothing happen.
 */
import { useToastStore } from '@/store/toastStore'

const toastStore = useToastStore()

const GLYPHS = {
  success: 'check_circle',
  info: 'info',
  warning: 'warning',
  error: 'error',
}

function glyph(toast) {
  return toast.icon || GLYPHS[toast.type] || GLYPHS.info
}
</script>

<template>
  <!-- aria-live so the confirmation reaches a screen reader too; `polite`
       because none of these interrupt anything. -->
  <div class="toast-host" role="status" aria-live="polite">
    <TransitionGroup name="toast-pop">
      <div v-for="toast in toastStore.toasts" :key="toast.id" class="toast" :class="toast.type">
        <span class="material-symbols-outlined toast-ico" aria-hidden="true">
          {{ glyph(toast) }}
        </span>
        <span class="toast-text">{{ toast.message }}</span>
        <router-link
          v-if="toast.action"
          :to="toast.action.to"
          class="toast-action"
          @click="toastStore.dismiss(toast.id)"
        >
          {{ toast.action.label }}
        </router-link>
        <button
          type="button"
          class="toast-close"
          aria-label="Dismiss"
          @click="toastStore.dismiss(toast.id)"
        >
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  /* Above page chrome, below the policy gate (1900) and the tour (1200) — a
     confirmation must never cover a dialog that is waiting on the user. */
  z-index: 1100;
  right: 1rem;
  bottom: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  /* The host spans the corner but must not swallow clicks on the page behind
     it; the toasts themselves opt back in. */
  pointer-events: none;
}

.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  max-width: min(24rem, calc(100vw - 2rem));
  padding: 0.6rem 0.7rem 0.6rem 0.75rem;
  border-radius: 10px;
  background: #0f172a;
  color: #fff;
  font-size: 0.85rem;
  line-height: 1.35;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.28);
}

.toast.success .toast-ico {
  color: #4ade80;
}
.toast.info .toast-ico {
  color: #7dd3fc;
}
.toast.warning .toast-ico {
  color: #fcd34d;
}
.toast.error .toast-ico {
  color: #fca5a5;
}

.toast-ico {
  font-size: 1.15rem;
  flex: 0 0 auto;
}

.toast-text {
  flex: 1 1 auto;
  min-width: 0;
}

.toast-action {
  flex: 0 0 auto;
  color: #86efac;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}
.toast-action:hover {
  text-decoration: underline;
}

.toast-close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: none;
  background: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
}
.toast-close:hover {
  color: #fff;
}
.toast-close .material-symbols-outlined {
  font-size: 1rem;
}

.toast-pop-enter-active,
.toast-pop-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.toast-pop-enter-from,
.toast-pop-leave-to {
  opacity: 0;
  transform: translateY(0.5rem);
}

@media (prefers-reduced-motion: reduce) {
  .toast-pop-enter-active,
  .toast-pop-leave-active {
    transition: none;
  }
}

@media (max-width: 640px) {
  /* Full-width along the bottom edge: at phone width a corner card either
     overlaps the content it is describing or gets clipped. */
  .toast-host {
    left: 0.75rem;
    right: 0.75rem;
    bottom: 0.75rem;
  }

  .toast {
    max-width: none;
  }
}
</style>
