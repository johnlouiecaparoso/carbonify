<template>
  <div
    v-if="open"
    class="tour-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="tour-title"
    @click.self="dismiss"
  >
    <div class="tour-card">
      <div class="tour-progress" aria-hidden="true">
        <span
          v-for="(s, i) in steps"
          :key="i"
          class="tour-dot"
          :class="{ active: i === index, done: i < index }"
        ></span>
      </div>

      <h2 id="tour-title" class="tour-title">{{ current.title }}</h2>
      <p class="tour-body">{{ current.body }}</p>

      <div class="tour-actions">
        <button type="button" class="tour-skip" @click="dismiss">
          {{ isLast ? 'Close' : 'Skip' }}
        </button>
        <div class="tour-nav">
          <button v-if="index > 0" type="button" class="tour-back" @click="prev">Back</button>
          <button type="button" class="tour-next" @click="next">
            {{ isLast ? 'Done' : 'Next' }}
          </button>
        </div>
      </div>

      <p class="tour-step-count">{{ index + 1 }} / {{ steps.length }}</p>
    </div>
  </div>
</template>

<script setup>
/**
 * First-run guided walkthrough. Auto-opens once per user+role (tracked in
 * localStorage, versioned via TOUR_VERSION) and can be reopened by dispatching
 * a `carbonify:open-tour` window event — the sidebar's "Take a tour" does this.
 *
 * Deliberately self-contained and not element-anchored, so it never breaks when
 * a page's markup changes.
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useUserStore } from '@/store/userStore'
import { tourStepsForRole, TOUR_VERSION } from '@/constants/onboarding'

const userStore = useUserStore()

const open = ref(false)
const index = ref(0)

const role = computed(() => userStore.role || 'general_user')
const steps = computed(() => tourStepsForRole(role.value))
const current = computed(() => steps.value[index.value] || { title: '', body: '' })
const isLast = computed(() => index.value === steps.value.length - 1)

// Per-user, per-version key so a returning user isn't re-shown the same tour,
// but a genuinely new set of steps (bumped TOUR_VERSION) shows again.
const storageKey = computed(() => {
  const uid = userStore.session?.user?.id || 'anon'
  return `carbonify_tour_seen_v${TOUR_VERSION}_${uid}`
})

function hasSeen() {
  try {
    return localStorage.getItem(storageKey.value) === '1'
  } catch {
    return false
  }
}

function markSeen() {
  try {
    localStorage.setItem(storageKey.value, '1')
  } catch {
    /* private mode / storage disabled — the tour simply shows again next time */
  }
}

function start() {
  index.value = 0
  open.value = true
}

function next() {
  if (isLast.value) return dismiss()
  index.value += 1
}

function prev() {
  if (index.value > 0) index.value -= 1
}

function dismiss() {
  open.value = false
  markSeen()
}

function onKeydown(e) {
  if (!open.value) return
  if (e.key === 'Escape') dismiss()
  else if (e.key === 'ArrowRight') next()
  else if (e.key === 'ArrowLeft') prev()
}

// Auto-open on first visit once the user is authenticated with a resolved role.
function maybeAutoOpen() {
  if (userStore.isAuthenticated && !hasSeen()) start()
}

watch(
  () => userStore.isAuthenticated,
  (auth) => {
    if (auth) maybeAutoOpen()
  },
)

// Reopen on demand (sidebar "Take a tour").
function openFromEvent() {
  start()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('carbonify:open-tour', openFromEvent)
  maybeAutoOpen()
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('carbonify:open-tour', openFromEvent)
})
</script>

<style scoped>
.tour-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  z-index: 1200;
}

.tour-card {
  background: #fff;
  border-radius: 16px;
  padding: 1.75rem;
  width: 100%;
  max-width: 460px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.3);
}

.tour-progress {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 1.1rem;
}

.tour-dot {
  width: 100%;
  height: 4px;
  border-radius: 999px;
  background: #e5e7eb;
  transition: background 0.2s ease;
}
.tour-dot.active {
  background: var(--primary-color, #058526);
}
.tour-dot.done {
  background: var(--primary-hover, #04701f);
}

.tour-title {
  margin: 0 0 0.6rem;
  font-size: 1.35rem;
  font-weight: 700;
  color: #0f172a;
}

.tour-body {
  margin: 0 0 1.5rem;
  color: #334155;
  line-height: 1.6;
}

.tour-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.tour-nav {
  display: flex;
  gap: 0.5rem;
}

.tour-skip,
.tour-back {
  background: none;
  border: 1px solid #d1d5db;
  color: #374151;
  border-radius: 8px;
  padding: 0.55rem 1rem;
  font-weight: 600;
  cursor: pointer;
}
.tour-skip {
  border-color: transparent;
  color: #6b7280;
}

.tour-next {
  background: var(--primary-color, #058526);
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 0.55rem 1.25rem;
  font-weight: 600;
  cursor: pointer;
}
.tour-next:hover {
  background: var(--primary-hover, #04701f);
}

.tour-step-count {
  margin: 1rem 0 0;
  text-align: center;
  font-size: 0.78rem;
  color: #94a3b8;
}
</style>
