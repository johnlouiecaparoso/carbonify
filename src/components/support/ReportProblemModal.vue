<script setup>
/**
 * The app-wide "Report a problem" dialog.
 *
 * Mounted once at the app root and opened from anywhere via
 * `openReportProblem()` (see constants/support.js) — the header avatar menu
 * does it, and any view can. Before this, the only report button in the whole
 * product sat on a receipt card, so a verifier, an LGU officer, a farmer or a
 * developer had no way to tell anyone that something was wrong.
 *
 * It is a two-step form on purpose. Step one is the category, and choosing one
 * is what unlocks step two's guidance: a short checklist of what to include for
 * *that* kind of problem. A single free-text box reliably produces "it doesn't
 * work", which costs a round trip before anyone can reproduce anything.
 *
 * Context the user should not have to supply — the page they were on, their
 * role, their browser — is captured automatically.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { useToastStore } from '@/store/toastStore'
import { fileSupportReport } from '@/services/supportReportService'
import { SUPPORT_CATEGORIES, OPEN_REPORT_EVENT } from '@/constants/support'

const route = useRoute()
const userStore = useUserStore()
const toastStore = useToastStore()

const open = ref(false)
const step = ref(1)
const category = ref('')
const subject = ref('')
const details = ref('')
const transactionId = ref('')
// The path is captured when the dialog OPENS, not when it submits — by the time
// someone has finished typing they may well have navigated, and the page they
// were on when it broke is the useful one.
const capturedPath = ref('')
const submitting = ref(false)
const errorMessage = ref('')
const filedId = ref('')

const selected = computed(() => SUPPORT_CATEGORIES.find((c) => c.value === category.value) || null)

function reset() {
  step.value = 1
  category.value = ''
  subject.value = ''
  details.value = ''
  transactionId.value = ''
  errorMessage.value = ''
  filedId.value = ''
  submitting.value = false
}

function openDialog(event) {
  reset()
  const prefill = event?.detail || {}
  if (prefill.category) {
    category.value = prefill.category
    step.value = 2
  }
  if (prefill.subject) subject.value = prefill.subject
  if (prefill.transactionId) transactionId.value = String(prefill.transactionId)
  capturedPath.value = route.fullPath
  open.value = true
}

function close() {
  open.value = false
}

function chooseCategory(value) {
  category.value = value
  step.value = 2
}

async function submit() {
  errorMessage.value = ''
  submitting.value = true
  try {
    filedId.value = await fileSupportReport({
      category: category.value,
      subject: subject.value,
      details: details.value,
      pagePath: capturedPath.value,
      reporterRole: userStore.role || '',
      transactionId: transactionId.value,
    })
    step.value = 3
    toastStore.push({ message: 'Problem reported — thank you.', icon: 'support_agent' })
  } catch (err) {
    // Surfaced, never swallowed: see supportReportService's header.
    errorMessage.value = err?.message || 'Could not file your report. Please try again.'
  } finally {
    submitting.value = false
  }
}

function onKeydown(event) {
  if (event.key === 'Escape' && open.value) close()
}

onMounted(() => {
  window.addEventListener(OPEN_REPORT_EVENT, openDialog)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener(OPEN_REPORT_EVENT, openDialog)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div v-if="open" class="rp-backdrop" @click.self="close">
    <div
      class="rp-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rp-title"
      v-modal-a11y
    >
      <div class="rp-head">
        <div>
          <h2 id="rp-title">Report a problem</h2>
          <p class="rp-sub">
            <template v-if="step === 1">What is the problem about?</template>
            <template v-else-if="step === 2">Tell us what happened.</template>
            <template v-else>Report filed.</template>
          </p>
        </div>
        <button class="rp-close" type="button" aria-label="Close" @click="close">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </div>

      <!-- Step 1: category -->
      <div v-if="step === 1" class="rp-body">
        <button
          v-for="c in SUPPORT_CATEGORIES"
          :key="c.value"
          type="button"
          class="rp-category"
          @click="chooseCategory(c.value)"
        >
          <span class="rp-category-label">{{ c.label }}</span>
          <span class="rp-category-hint">{{ c.hint }}</span>
        </button>
      </div>

      <!-- Step 2: the guided form -->
      <div v-else-if="step === 2" class="rp-body">
        <button type="button" class="rp-back" @click="step = 1">
          <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
          {{ selected?.label }}
        </button>

        <!-- The guide. This is the reason the form has two steps: the checklist
             is specific to the category, so it can only be shown after one is
             chosen — and it is shown WHILE they write, not before. -->
        <div v-if="selected" class="rp-guide">
          <p class="rp-guide-title">Please include, if you can:</p>
          <ul>
            <li v-for="line in selected.guide" :key="line">{{ line }}</li>
          </ul>
        </div>

        <label class="rp-label" for="rp-subject">Short title</label>
        <input
          id="rp-subject"
          v-model="subject"
          type="text"
          class="rp-input"
          maxlength="200"
          placeholder="e.g. Charged twice for the same purchase"
        />

        <label class="rp-label" for="rp-details">What happened?</label>
        <textarea
          id="rp-details"
          v-model="details"
          class="rp-input"
          rows="6"
          maxlength="5000"
          placeholder="Describe the problem in your own words."
        ></textarea>
        <p class="rp-count">{{ details.length }} / 5000</p>

        <p class="rp-context">
          We will also send the page you were on
          <code>{{ capturedPath || '—' }}</code>
          and your browser details, so you do not have to describe them.
        </p>

        <p v-if="errorMessage" class="rp-error" role="alert">{{ errorMessage }}</p>

        <div class="rp-actions">
          <button type="button" class="rp-btn ghost" :disabled="submitting" @click="close">
            Cancel
          </button>
          <button
            type="button"
            class="rp-btn primary"
            :disabled="submitting || !subject.trim() || !details.trim()"
            @click="submit"
          >
            {{ submitting ? 'Sending…' : 'Send report' }}
          </button>
        </div>
      </div>

      <!-- Step 3: confirmation -->
      <div v-else class="rp-body rp-done">
        <span class="material-symbols-outlined rp-done-ico" aria-hidden="true">task_alt</span>
        <p class="rp-done-title">Thank you — we have your report.</p>
        <p class="rp-done-body">
          Reference <code>{{ String(filedId).slice(0, 8) }}</code
          >. Our team reviews reports and will follow up if we need more from you.
        </p>
        <div class="rp-actions">
          <button type="button" class="rp-btn primary" @click="close">Done</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1500;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}

.rp-modal {
  width: min(560px, 100%);
  max-height: 90vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 14px;
  padding: 1.25rem;
}

.rp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.rp-head h2 {
  margin: 0;
  font-size: 1.15rem;
  color: #0f172a;
}

.rp-sub {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: #64748b;
}

.rp-close {
  display: flex;
  border: none;
  background: none;
  color: #6b7280;
  cursor: pointer;
}

.rp-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.rp-category {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #fff;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
}
.rp-category:hover {
  border-color: var(--primary-color, #058526);
  background: var(--primary-lightest, #f8fdf8);
}

.rp-category-label {
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
}

.rp-category-hint {
  font-size: 0.79rem;
  color: #64748b;
  line-height: 1.4;
}

.rp-back {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: var(--primary-color, #058526);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}
.rp-back .material-symbols-outlined {
  font-size: 1rem;
}

.rp-guide {
  border: 1px solid var(--border-color, #d1e7dd);
  background: var(--bg-secondary, #f8fdf8);
  border-radius: 10px;
  padding: 0.7rem 0.85rem;
}

.rp-guide-title {
  margin: 0 0 0.35rem;
  font-size: 0.79rem;
  font-weight: 700;
  color: var(--primary-dark, #045c1a);
}

.rp-guide ul {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.8rem;
  line-height: 1.55;
  color: #374151;
}

.rp-label {
  margin-top: 0.35rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: #374151;
}

.rp-input {
  width: 100%;
  padding: 0.55rem 0.7rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-family: inherit;
  font-size: 0.88rem;
  color: #111827;
  background: #fff;
}
.rp-input:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
  box-shadow: 0 0 0 3px rgba(5, 133, 38, 0.12);
}

.rp-count {
  margin: 0;
  text-align: right;
  font-size: 0.72rem;
  color: #9ca3af;
}

.rp-context {
  margin: 0.25rem 0 0;
  font-size: 0.76rem;
  color: #6b7280;
  line-height: 1.5;
}
.rp-context code {
  background: #f3f4f6;
  border-radius: 4px;
  padding: 0 0.25rem;
}

.rp-error {
  margin: 0.5rem 0 0;
  padding: 0.55rem 0.7rem;
  border: 1px solid #fecaca;
  border-radius: 8px;
  background: #fef2f2;
  color: #991b1b;
  font-size: 0.82rem;
}

.rp-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1rem;
}

.rp-btn {
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  border: 1px solid transparent;
  font-family: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.rp-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.rp-btn.primary {
  background: var(--primary-color, #058526);
  color: #fff;
}
.rp-btn.primary:hover:not(:disabled) {
  background: var(--primary-hover, #04701f);
}
.rp-btn.ghost {
  background: #fff;
  border-color: #d1d5db;
  color: #374151;
}

.rp-done {
  align-items: center;
  text-align: center;
  padding: 1rem 0;
}

.rp-done-ico {
  font-size: 2.5rem;
  color: var(--primary-color, #058526);
}

.rp-done-title {
  margin: 0.5rem 0 0.2rem;
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
}

.rp-done-body {
  margin: 0;
  font-size: 0.85rem;
  color: #64748b;
  line-height: 1.55;
}

.rp-done .rp-actions {
  justify-content: center;
}

@media (max-width: 640px) {
  .rp-modal {
    padding: 1rem;
    max-height: 92vh;
  }

  .rp-actions {
    flex-direction: column-reverse;
  }

  .rp-btn {
    width: 100%;
  }
}
</style>
