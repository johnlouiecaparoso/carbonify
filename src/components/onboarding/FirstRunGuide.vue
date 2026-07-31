<script setup>
/**
 * The "what do I do now?" panel a brand-new account sees on its dashboard.
 *
 * WelcomeTour already existed and is good, but it is a MODAL: it opens once,
 * and the moment it is dismissed the only way back is knowing that "Take a
 * tour" sits at the bottom of the sidebar. A new user who closed it — or who
 * signed in on a second device, since the seen-flag is localStorage — is left
 * on a dashboard of empty widgets with no visible next step.
 *
 * This panel stays on the page instead, until the account has actually been
 * used or the user dismisses it deliberately. It answers three questions the
 * tour does not:
 *   - what should I do first, given MY role
 *   - what are the other roles, in plain language
 *   - how do I become one, and what happens to my account if I apply
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { firstStepsForRole, ROLE_EXPLAINERS } from '@/constants/onboarding'

const props = defineProps({
  /** Display name for the greeting. */
  name: { type: String, default: '' },
  /** Canonical role of the signed-in user. */
  role: { type: String, default: 'general_user' },
  /** Stable per-user key so a dismissal does not follow a different account. */
  userId: { type: String, default: '' },
})

const router = useRouter()
const steps = computed(() => firstStepsForRole(props.role))

// Roles other than the one they already have.
const otherRoles = computed(() => ROLE_EXPLAINERS.filter((r) => r.role !== props.role))

const storageKey = computed(() => `carbonify_first_run_done_${props.userId || 'anon'}`)

function alreadyDismissed() {
  try {
    return localStorage.getItem(storageKey.value) === '1'
  } catch {
    // Private mode / storage disabled: showing the guide again is the harmless
    // failure, so fail towards visible.
    return false
  }
}

const dismissed = ref(alreadyDismissed())
const showRoles = ref(false)

function dismiss() {
  dismissed.value = true
  try {
    localStorage.setItem(storageKey.value, '1')
  } catch {
    /* nothing to persist to — the panel still closes for this session */
  }
}

function go(to) {
  if (to) router.push(to)
}

function openTour() {
  // WelcomeTour is mounted at the app root and listens for this.
  window.dispatchEvent(new Event('carbonify:open-tour'))
}
</script>

<template>
  <section v-if="!dismissed" class="first-run" aria-labelledby="first-run-title">
    <header class="fr-head">
      <div class="fr-headings">
        <h2 id="first-run-title" class="fr-title">
          <span class="material-symbols-outlined" aria-hidden="true">waving_hand</span>
          Welcome to Carbonify{{ name ? `, ${name}` : '' }}
        </h2>
        <p class="fr-sub">
          Your account is ready. Here is what to do first — this panel disappears once you
          dismiss it.
        </p>
      </div>
      <button type="button" class="fr-dismiss" @click="dismiss">
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
        <span class="sr-only">Dismiss the getting started guide</span>
      </button>
    </header>

    <ol class="fr-steps">
      <li v-for="(step, i) in steps" :key="step.title" class="fr-step">
        <span class="fr-num" aria-hidden="true">{{ i + 1 }}</span>
        <div class="fr-step-body">
          <h3 class="fr-step-title">{{ step.title }}</h3>
          <p class="fr-step-text">{{ step.body }}</p>
          <button v-if="step.to" type="button" class="fr-step-cta" @click="go(step.to)">
            {{ step.cta }}
            <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
          </button>
        </div>
      </li>
    </ol>

    <div class="fr-actions">
      <button type="button" class="fr-tour" @click="openTour">
        <span class="material-symbols-outlined" aria-hidden="true">tour</span>
        Take the full guided tour
      </button>
      <button type="button" class="fr-toggle" :aria-expanded="showRoles" @click="showRoles = !showRoles">
        <span class="material-symbols-outlined" aria-hidden="true">
          {{ showRoles ? 'expand_less' : 'expand_more' }}
        </span>
        {{ showRoles ? 'Hide the other roles' : 'What are the other roles on Carbonify?' }}
      </button>
    </div>

    <div v-if="showRoles" class="fr-roles">
      <p class="fr-roles-intro">
        Carbonify has several kinds of account. You can apply to change yours — but read the
        note at the bottom first, because applying affects how you sign in.
      </p>

      <article v-for="r in otherRoles" :key="r.role" class="fr-role">
        <h3 class="fr-role-title">
          <span class="material-symbols-outlined" aria-hidden="true">{{ r.icon }}</span>
          {{ r.label }}
        </h3>
        <p class="fr-role-summary">{{ r.summary }}</p>
        <p class="fr-role-detail">{{ r.detail }}</p>

        <button v-if="r.applyTo" type="button" class="fr-role-cta" @click="go(r.applyTo)">
          {{ r.applyCta }}
          <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
        </button>
        <p v-else class="fr-role-contact">{{ r.contact }}</p>
      </article>

      <!-- The single most important thing to say before someone applies, and
           the thing they would otherwise discover by being locked out. -->
      <p class="fr-warning">
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        <span>
          <strong>Before you apply:</strong> while a farmer, project developer or verifier
          application is awaiting a decision, you cannot sign in — the account is held until
          staff approve or decline it. If you still need access meanwhile, finish what you were
          doing first, then apply.
        </span>
      </p>
    </div>
  </section>
</template>

<style scoped>
.first-run {
  border: 1px solid var(--primary-color, #058526);
  border-radius: 14px;
  background: #f4fbf5;
  padding: 20px;
  margin-bottom: 24px;
}
.fr-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.fr-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 4px;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--primary-dark, #045c1a);
}
.fr-sub {
  margin: 0;
  color: #4b5563;
  font-size: 0.9rem;
}
.fr-dismiss {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #6b7280;
  padding: 4px;
  border-radius: 6px;
  line-height: 0;
}
.fr-dismiss:hover {
  background: rgba(0, 0, 0, 0.06);
}
.fr-steps {
  list-style: none;
  margin: 18px 0 0;
  padding: 0;
  display: grid;
  gap: 12px;
}
.fr-step {
  display: flex;
  gap: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px;
}
.fr-num {
  flex: 0 0 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--primary-color, #058526);
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fr-step-body {
  min-width: 0;
}
.fr-step-title {
  margin: 0 0 4px;
  font-size: 0.98rem;
  font-weight: 650;
  color: #111827;
}
.fr-step-text {
  margin: 0;
  font-size: 0.875rem;
  color: #4b5563;
  line-height: 1.5;
}
.fr-step-cta,
.fr-role-cta {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 1px solid var(--primary-color, #058526);
  color: var(--primary-color, #058526);
  border-radius: 8px;
  padding: 6px 12px;
  font-weight: 600;
  font-size: 0.82rem;
  cursor: pointer;
}
.fr-step-cta:hover,
.fr-role-cta:hover {
  background: var(--primary-color, #058526);
  color: #fff;
}
.fr-step-cta .material-symbols-outlined,
.fr-role-cta .material-symbols-outlined,
.fr-title .material-symbols-outlined {
  font-size: 18px;
}
.fr-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 16px;
}
.fr-tour,
.fr-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  padding: 9px 14px;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  min-height: 42px;
}
.fr-tour {
  background: var(--primary-color, #058526);
  border: 1px solid var(--primary-color, #058526);
  color: #fff;
}
.fr-toggle {
  background: #fff;
  border: 1px solid #d1d5db;
  color: #374151;
}
.fr-roles {
  margin-top: 16px;
  border-top: 1px solid #d7e8da;
  padding-top: 16px;
  display: grid;
  gap: 12px;
}
.fr-roles-intro {
  margin: 0;
  font-size: 0.875rem;
  color: #4b5563;
}
.fr-role {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px;
}
.fr-role-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 6px;
  font-size: 0.98rem;
  font-weight: 650;
  color: #111827;
}
.fr-role-title .material-symbols-outlined {
  font-size: 20px;
  color: var(--primary-color, #058526);
}
.fr-role-summary {
  margin: 0 0 6px;
  font-size: 0.875rem;
  color: #374151;
  line-height: 1.5;
}
.fr-role-detail {
  margin: 0;
  font-size: 0.84rem;
  color: #6b7280;
  line-height: 1.5;
}
.fr-role-contact {
  margin: 10px 0 0;
  font-size: 0.82rem;
  color: #6b7280;
  font-style: italic;
}
.fr-warning {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  background: #fffbeb;
  border: 1px solid #f59e0b;
  border-radius: 10px;
  padding: 12px 14px;
  margin: 0;
  font-size: 0.85rem;
  color: #78350f;
  line-height: 1.5;
}
.fr-warning .material-symbols-outlined {
  font-size: 20px;
  flex: 0 0 auto;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 640px) {
  .first-run {
    padding: 16px;
  }
  .fr-actions {
    flex-direction: column;
  }
  .fr-tour,
  .fr-toggle {
    width: 100%;
    justify-content: center;
  }
}
</style>
