<template>
  <section v-if="visible" class="onboarding">
    <div class="container">
      <div class="onboarding-card">
        <button class="dismiss" aria-label="Dismiss" @click="dismiss">
          <span class="material-symbols-outlined">close</span>
        </button>

        <h2 class="onboarding-title">
          <span class="material-symbols-outlined">rocket_launch</span>
          {{ title }}
        </h2>
        <p class="onboarding-subtitle">{{ subtitle }}</p>

        <ol class="steps">
          <li v-for="(step, i) in steps" :key="i" class="step">
            <span class="step-num">{{ i + 1 }}</span>
            <div class="step-body">
              <span class="step-text">{{ step.text }}</span>
              <router-link v-if="step.to" :to="step.to" class="step-link">{{ step.linkLabel }}</router-link>
            </div>
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useUserStore } from '@/store/userStore'

const store = useUserStore()

/**
 * Keyed by ACCOUNT, not by device (2026-08-04).
 *
 * It was a flat `carbonify_onboarding_dismissed`, so the first person to
 * dismiss this on a device dismissed it for every account that ever signed in
 * afterwards — permanently, since nothing resets it. The guide below is chosen
 * BY ROLE, so the practical effect was that an admin dismissing it meant the
 * farmer, LGU or buyer who used that machine next was never shown their own
 * quick-start. On the shared devices a pilot runs on — a co-op office, an LGU
 * desk — that silently suppresses onboarding for exactly the people it exists
 * for, and it does so on the homepage, the first screen after sign-in.
 *
 * `FirstRunGuide.vue` is this component's sibling and has always keyed by user
 * id, with a docblock explaining why: *"Stable per-user key so a dismissal does
 * not follow a different account."* The correct pattern was already in the
 * repo, one branch over. That is this codebase's signature defect, and this is
 * the seventh instance.
 */
const LEGACY_KEY = 'carbonify_onboarding_dismissed'
const storageKey = computed(
  () => `carbonify_onboarding_dismissed_${store.session?.user?.id || 'anon'}`,
)

function readDismissed() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(storageKey.value) === 'true'
  } catch {
    // Private mode / storage disabled. Showing the guide again is the harmless
    // failure, so fail towards visible — the same direction FirstRunGuide takes.
    return false
  }
}

// Dropped rather than migrated, for the same reason as the cart's legacy key
// (backlog #35): its value records that SOMEBODY dismissed this here, and
// carrying that forward to the next person to sign in is the defect being
// fixed. The cost is one extra dismissal for a user who had already dismissed.
try {
  if (typeof window !== 'undefined') window.localStorage.removeItem(LEGACY_KEY)
} catch {
  /* non-critical */
}

const dismissed = ref(readDismissed())

// The session is restored asynchronously, so at setup the key is usually the
// `anon` one even for a user who is signed in. Without this re-read a returning
// user is shown the guide they already dismissed, and dismissing it writes to
// the anon bucket — the same fix SmartSearch's history needed.
watch(storageKey, () => {
  dismissed.value = readDismissed()
})

const visible = computed(() => store.isAuthenticated && !dismissed.value)

const guides = {
  project_developer: {
    title: 'Quick start for Project Developers',
    subtitle: 'Take your climate project from submission to tradeable carbon credits.',
    steps: [
      { text: 'Submit your project with all required documents.', to: '/submit-project', linkLabel: 'Submit a project' },
      { text: 'Track validation status as a verifier reviews it.', to: '/developer/projects', linkLabel: 'My projects' },
      { text: 'Once validated, file periodic MRV monitoring reports.', to: '/monitoring', linkLabel: 'Monitoring (MRV)' },
      { text: 'Credits are issued automatically when a verifier approves your reductions, then listed on the marketplace.' },
    ],
  },
  verifier: {
    title: 'Quick start for Verifiers',
    subtitle: 'Review submissions and verify emission reductions.',
    steps: [
      { text: 'Review project submissions and validate or request revisions.', to: '/verifier', linkLabel: 'Verifier panel' },
      { text: 'Review MRV monitoring reports and approve Verified Emission Reductions to issue credits.', to: '/verifier', linkLabel: 'MRV review' },
    ],
  },
  admin: {
    title: 'Quick start for Administrators',
    subtitle: 'Oversee the platform.',
    steps: [
      { text: 'Manage users and roles.', to: '/admin/users', linkLabel: 'User management' },
      { text: 'Review identity (KYC) applications.', to: '/admin/kyc', linkLabel: 'KYC review' },
      { text: 'Monitor system activity.', to: '/admin/audit-logs', linkLabel: 'Audit logs' },
    ],
  },
  buyer: {
    title: 'Welcome to Carbonify',
    subtitle: 'Start offsetting with verified Philippine carbon credits.',
    steps: [
      { text: 'Complete identity verification (KYC) to enable trading.', to: '/kyc', linkLabel: 'Verify identity' },
      { text: 'Browse verified projects on the marketplace or map.', to: '/marketplace', linkLabel: 'Marketplace' },
      { text: 'Purchase credits and download your certificate.', to: '/certificates', linkLabel: 'My certificates' },
      { text: 'Retire credits when you want to claim the offset for ESG reporting.', to: '/wallet', linkLabel: 'Wallet' },
    ],
  },
}

const guide = computed(() => {
  if (store.isAdmin) return guides.admin
  if (store.isVerifier) return guides.verifier
  if (store.isProjectDeveloper) return guides.project_developer
  return guides.buyer
})

const title = computed(() => guide.value.title)
const subtitle = computed(() => guide.value.subtitle)
const steps = computed(() => guide.value.steps)

function dismiss() {
  dismissed.value = true
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey.value, 'true')
  } catch {
    /* storage unavailable — the panel still closes for this session */
  }
}
</script>

<style scoped>
.onboarding {
  padding: 1.5rem 0 0;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.onboarding-card {
  position: relative;
  background: var(--bg-secondary, #f8fdf8);
  border: 1px solid var(--border-color, #d1e7dd);
  border-left: 4px solid var(--primary-color, #058526);
  border-radius: 0.75rem;
  padding: 1.5rem 1.75rem;
}

.dismiss {
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  background: none;
  border: none;
  color: var(--text-muted, #6b7280);
  cursor: pointer;
  display: inline-flex;
}

.dismiss:hover {
  color: var(--text-primary, #111827);
}

.onboarding-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary, #1a202c);
  margin: 0 0 0.25rem;
}

.onboarding-title .material-symbols-outlined {
  color: var(--primary-color, #058526);
}

.onboarding-subtitle {
  color: var(--text-muted, #6b7280);
  margin: 0 0 1rem;
  font-size: 0.9rem;
}

.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
}

.step-num {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--primary-color, #058526);
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.step-body {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
}

.step-text {
  color: var(--text-primary, #374151);
  font-size: 0.9rem;
}

.step-link {
  color: var(--primary-color, #058526);
  font-weight: 600;
  font-size: 0.85rem;
  text-decoration: none;
}

.step-link:hover {
  text-decoration: underline;
}

@media (max-width: 768px) {
  .container {
    padding: 0 1rem;
  }
}
</style>
