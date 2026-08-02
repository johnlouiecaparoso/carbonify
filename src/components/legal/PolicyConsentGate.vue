<script setup>
/**
 * The blocking consent gate.
 *
 * Shown once a user is signed in and has not accepted the current
 * POLICY_VERSION. It cannot be dismissed: no close button, no overlay click,
 * no Escape. The only two ways out are to accept, or to sign out.
 *
 * ── Why it does not contain the legal text ──
 * The three documents already exist in `App.vue`, rendered by the footer
 * modal. Copying ~330 lines of legal copy into a second component would mean
 * two versions of the Terms that drift the first time one is edited — and the
 * one a user consented to would be whichever component happened to render.
 * Instead the "read" buttons open the SAME modal, over this one (its overlay
 * is z-index 2000; this is 1900).
 *
 * ── Why one checkbox and not three ──
 * The acceptance is recorded as a single row covering all three documents,
 * because that is what is actually being agreed: the Terms themselves say
 * "by creating an account you agree to these Terms, the Privacy Policy, and
 * the Carbon Credits Policy". Three separate ticks would imply they can be
 * accepted independently, which is not on offer and would be a false choice.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { POLICY_DOCUMENTS, POLICY_VERSION, OPEN_POLICY_EVENT } from '@/constants/policy'
import { acceptCurrentPolicy } from '@/services/policyService'

const props = defineProps({
  userId: { type: String, required: true },
  /** Shown so the person knows which account they are accepting for. */
  email: { type: String, default: '' },
})

const emit = defineEmits(['accepted', 'declined'])

/**
 * ── Why the overlay alone was not "blocking" ──
 * A fixed overlay stops the mouse, not the keyboard. Tab moved focus straight
 * through to the header and sidebar behind it, and Enter then navigated — or
 * opened the mobile menu, whose overlay is `z-index: 9999 !important`
 * (Header.vue) and so renders ON TOP of this card at 1900. Raising this above
 * it is not the fix: the legal documents open at 2000 and must stay above this,
 * or the "Read" buttons open behind the thing asking you to read them.
 *
 * So focus is kept inside the card instead, and the page behind is frozen.
 */
const card = ref(null)
let previouslyFocused = null

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'

function focusables() {
  return Array.from(card.value?.querySelectorAll(FOCUSABLE) || [])
}

function onKeydown(event) {
  if (event.key !== 'Tab') return
  const items = focusables()
  if (!items.length) return

  const first = items[0]
  const last = items[items.length - 1]
  const active = document.activeElement

  // Wrap at both ends, and pull focus back if it has already escaped — which it
  // has whenever the legal-document modal above us closes and returns focus to
  // the body.
  if (!card.value?.contains(active)) {
    event.preventDefault()
    first.focus()
  } else if (event.shiftKey && active === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

onMounted(() => {
  previouslyFocused = document.activeElement
  document.addEventListener('keydown', onKeydown, true)
  // Without this the page behind scrolls under the overlay on mobile, which
  // reads as the gate being dismissible.
  document.body.style.overflow = 'hidden'
  focusables()[0]?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown, true)
  document.body.style.overflow = ''
  previouslyFocused?.focus?.()
})

const agreed = ref(false)
const submitting = ref(false)
const errorMessage = ref('')

/** Which documents the user has actually opened. */
const opened = ref(new Set())
const allOpened = computed(() => POLICY_DOCUMENTS.every((d) => opened.value.has(d.id)))

function openDocument(id) {
  opened.value = new Set(opened.value).add(id)
  window.dispatchEvent(new CustomEvent(OPEN_POLICY_EVENT, { detail: { doc: id } }))
}

async function accept() {
  if (!agreed.value || submitting.value) return
  submitting.value = true
  errorMessage.value = ''
  try {
    await acceptCurrentPolicy(props.userId)
    emit('accepted')
  } catch (err) {
    // Unlike the read, a failed WRITE must not let the user through: that is
    // exactly the case where we would have shown a consent form, let someone
    // in, and kept no record of it.
    console.error('Failed to record policy acceptance:', err)
    errorMessage.value =
      err?.message || 'We could not record your acceptance. Please check your connection and try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="consent-overlay" role="dialog" aria-modal="true" aria-labelledby="consent-title">
    <div ref="card" class="consent-card">
      <header class="consent-head">
        <span class="material-symbols-outlined consent-ico" aria-hidden="true">gavel</span>
        <div>
          <h2 id="consent-title" class="consent-title">Before you continue</h2>
          <p class="consent-sub">
            Please review and accept our policies to use Carbonify<span v-if="email">
              as <strong>{{ email }}</strong></span
            >.
          </p>
        </div>
      </header>

      <p class="consent-intro">
        These three documents together set out what Carbonify does, what it does not do, and how
        your data is handled. Two of the limits in them matter a great deal right now: credits are
        <strong>not yet registry-backed</strong>, and payments run in <strong>test mode</strong>.
        Please read them rather than scrolling past.
      </p>

      <ul class="doc-list">
        <li v-for="doc in POLICY_DOCUMENTS" :key="doc.id" class="doc-row">
          <span class="doc-name">
            <span
              class="material-symbols-outlined doc-check"
              :class="{ read: opened.has(doc.id) }"
              aria-hidden="true"
            >
              {{ opened.has(doc.id) ? 'check_circle' : 'radio_button_unchecked' }}
            </span>
            {{ doc.label }}
          </span>
          <button type="button" class="doc-open" @click="openDocument(doc.id)">
            {{ opened.has(doc.id) ? 'Read again' : 'Read' }}
          </button>
        </li>
      </ul>

      <p v-if="!allOpened" class="doc-hint">
        You can accept without opening each one, but we would rather you did.
      </p>

      <label class="agree">
        <input v-model="agreed" type="checkbox" class="agree-box" />
        <span>
          I have read and agree to the <strong>Terms &amp; Conditions</strong>, the
          <strong>Privacy Policy</strong> and the <strong>Carbon Credits Policy</strong>, and I
          understand that credits on Carbonify are not currently registry-backed and that payments
          are in test mode.
        </span>
      </label>

      <p v-if="errorMessage" class="consent-error" role="alert">{{ errorMessage }}</p>

      <div class="consent-actions">
        <button
          type="button"
          class="btn-accept"
          :disabled="!agreed || submitting"
          @click="accept"
        >
          {{ submitting ? 'Recording…' : 'I agree — continue' }}
        </button>
        <button type="button" class="btn-decline" :disabled="submitting" @click="emit('declined')">
          I do not agree — sign out
        </button>
      </div>

      <p class="consent-version">
        Policy version {{ POLICY_VERSION }}. Your acceptance is recorded against this version, and
        you will be asked again if these documents change.
      </p>
    </div>
  </div>
</template>

<style scoped>
.consent-overlay {
  position: fixed;
  inset: 0;
  /* Below the policy modal (2000) so the documents open ON TOP of this. */
  z-index: 1900;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  overflow-y: auto;
}
.consent-card {
  background: #fff;
  border-radius: 14px;
  max-width: 560px;
  width: 100%;
  padding: 24px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  max-height: 92vh;
  overflow-y: auto;
}
.consent-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.consent-ico {
  color: var(--primary-color, #058526);
  font-size: 28px;
  flex: 0 0 auto;
}
.consent-title {
  margin: 0 0 2px;
  font-size: 1.2rem;
  font-weight: 700;
  color: #111827;
}
.consent-sub {
  margin: 0;
  font-size: 0.86rem;
  color: #6b7280;
}
.consent-intro {
  margin: 16px 0 14px;
  font-size: 0.875rem;
  color: #4b5563;
  line-height: 1.6;
}
.doc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.doc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 10px 12px;
}
.doc-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.9rem;
  font-weight: 600;
  color: #111827;
  min-width: 0;
}
.doc-check {
  font-size: 19px;
  color: #9ca3af;
}
.doc-check.read {
  color: var(--primary-color, #058526);
}
.doc-open {
  flex: 0 0 auto;
  background: transparent;
  border: 1px solid var(--primary-color, #058526);
  color: var(--primary-color, #058526);
  border-radius: 8px;
  padding: 6px 14px;
  font-weight: 600;
  font-size: 0.8rem;
  cursor: pointer;
  min-height: 36px;
}
.doc-open:hover {
  background: var(--primary-color, #058526);
  color: #fff;
}
.doc-hint {
  margin: 8px 0 0;
  font-size: 0.78rem;
  color: #6b7280;
  font-style: italic;
}
.agree {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 16px 0 0;
  padding: 12px;
  border: 1px solid #d7e8da;
  background: #f4fbf5;
  border-radius: 10px;
  font-size: 0.84rem;
  color: #374151;
  line-height: 1.55;
  cursor: pointer;
}
/* 15px, not 18px: the label beside it is 0.84rem, and an 18px box next to
   13.4px text is the largest element in the row — which is what made this read
   as oversized on every role. `margin-top` keeps it on the first line's
   optical centre now that the box is smaller. */
.agree-box {
  margin-top: 3px;
  width: 15px;
  height: 15px;
  flex: 0 0 auto;
  accent-color: var(--primary-color, #058526);
  cursor: pointer;
}
.consent-error {
  margin: 12px 0 0;
  padding: 10px 12px;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #dc2626;
  color: #b91c1c;
  font-size: 0.84rem;
}
.consent-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}
.btn-accept,
.btn-decline {
  border-radius: 8px;
  padding: 12px 16px;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  min-height: 46px;
}
.btn-accept {
  background: var(--primary-color, #058526);
  border: 1px solid var(--primary-color, #058526);
  color: #fff;
}
.btn-accept:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-decline {
  background: #fff;
  border: 1px solid #d1d5db;
  color: #6b7280;
}
.btn-decline:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.consent-version {
  margin: 14px 0 0;
  font-size: 0.75rem;
  color: #9ca3af;
  text-align: center;
}

@media (max-width: 480px) {
  .consent-card {
    padding: 18px;
  }
  .doc-row {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
  }
  .doc-open {
    width: 100%;
  }
}
</style>
