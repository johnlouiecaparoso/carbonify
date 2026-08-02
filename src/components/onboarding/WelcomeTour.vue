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
 * First-run guided walkthrough. Auto-opens ONCE per account — the first time
 * that account signs in — and can be reopened on demand by dispatching a
 * `carbonify:open-tour` window event (the sidebar's "Take a tour" does this).
 *
 * "Once per account" is the whole point, and it is why the seen-flag is not
 * read from localStorage here any more. See services/onboardingService.js: the
 * flag now lives on the profile, with localStorage as a cache in front of it.
 * The old key fell back to the literal 'anon' when the session had not resolved
 * yet, so a tour dismissed during a slow profile load was recorded against
 * nobody and reappeared on the next load.
 *
 * Deliberately self-contained and not element-anchored, so it never breaks when
 * a page's markup changes.
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useUserStore } from '@/store/userStore'
import { tourStepsForRole } from '@/constants/onboarding'
import { hasSeenTour, markTourSeen } from '@/services/onboardingService'

const userStore = useUserStore()

const open = ref(false)
const index = ref(0)
// Set once the auto-open decision has been made for this session, so a second
// trigger (mount + the auth watcher both firing) cannot re-ask or re-open.
const autoOpenResolved = ref(false)

const role = computed(() => userStore.role || 'general_user')
const steps = computed(() => tourStepsForRole(role.value))
const current = computed(() => steps.value[index.value] || { title: '', body: '' })
const isLast = computed(() => index.value === steps.value.length - 1)

const userId = computed(() => userStore.session?.user?.id || '')

function markSeen() {
  // Fire-and-forget: the service never throws, and closing the tour must not
  // wait on a network round trip.
  markTourSeen(userId.value)
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

/**
 * Auto-open on the account's first sign-in only.
 *
 * Gated on a resolved user id, not just `isAuthenticated`: the two are not the
 * same instant, and acting on the earlier one is what used to record the
 * dismissal against 'anon'.
 */
async function maybeAutoOpen() {
  if (autoOpenResolved.value) return
  if (!userStore.isAuthenticated || !userId.value) return

  // Claim the decision before awaiting, so mount and the watcher firing in the
  // same tick cannot both open the tour.
  autoOpenResolved.value = true

  if (await hasSeenTour(userId.value)) return
  start()
  // Recorded on OPEN, not on close. "Show it once" has to survive the user
  // closing the tab, reloading, or navigating away mid-tour — none of which
  // reach dismiss(). They can always reopen it from "Take a tour".
  markSeen()
}

// The id arrives after `isAuthenticated` flips, so watch the id.
watch(userId, (id) => {
  if (id) maybeAutoOpen()
})

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
