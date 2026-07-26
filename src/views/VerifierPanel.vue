<template>
  <div class="verifier-panel">
    <!-- Page Header -->
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">Verifier Panel</h1>
        <p class="page-description">
          Review and approve submitted environmental projects for carbon credit generation
        </p>
      </div>
    </div>

    <!-- Main Content -->
    <div class="verifier-content">
      <div class="container">
        <!-- Access Check -->
        <div v-if="!store.isAuthenticated" class="access-denied">
          <div class="access-denied-icon" aria-hidden="true">
            <span class="material-symbols-outlined">lock</span>
          </div>
          <h2>Authentication Required</h2>
          <p>You must be signed in to access the verifier panel.</p>
          <router-link to="/login" class="login-link">Go to Login</router-link>
        </div>

        <div v-else-if="!store.isVerifier" class="access-denied">
          <div class="access-denied-icon" aria-hidden="true">
            <span class="material-symbols-outlined">block</span>
          </div>
          <h2>Access Denied</h2>
          <p>Your account does not have verifier access.</p>
          <p class="hint-text">Please contact an administrator if you believe this is an error.</p>
        </div>

        <!-- Verifier Dashboard.
             These three used to render simultaneously — ~2,750 lines of
             component and three independent data loads on every visit, as one
             long scroll. They are separate jobs, so they are now separate tabs
             and each mounts only when opened. -->
        <div v-else class="verifier-dashboard">
          <div class="workbench-tabs" role="tablist" aria-label="Verifier workbench">
            <button
              v-for="tab in tabs"
              :key="tab.value"
              type="button"
              role="tab"
              :aria-selected="activeTab === tab.value"
              :class="['workbench-tab', { active: activeTab === tab.value }]"
              @click="activeTab = tab.value"
            >
              <span class="material-symbols-outlined" aria-hidden="true">{{ tab.icon }}</span>
              {{ tab.label }}
              <!-- Hidden at zero: a row of "0" badges is noise, and an empty
                   queue is already the least interesting thing on the page. -->
              <span v-if="tab.count > 0" class="tab-count" :aria-label="`${tab.count} awaiting review`">
                {{ tab.count }}
              </span>
            </button>
          </div>

          <!-- Deliberately NOT wrapped in <KeepAlive>. Two of these panels use
               useModernPrompt, whose promptState is a module-level singleton,
               and ModernPrompt teleports to body — so keeping both alive would
               put two dialogs in the document bound to the same state. Plain
               v-if means exactly one is mounted, which is also what makes
               re-entering a tab show a freshly loaded queue. -->
          <div class="approval-section">
            <ProjectApprovalPanel v-if="activeTab === 'projects'" />
            <MrvReviewDashboard v-else-if="activeTab === 'mrv'" />
            <DeveloperApplicationsDashboard v-else-if="activeTab === 'applications'" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useUserStore } from '@/store/userStore'
import ProjectApprovalPanel from '@/components/admin/ProjectApprovalPanel.vue'
import DeveloperApplicationsDashboard from '@/components/verifier/DeveloperApplicationsDashboard.vue'
import MrvReviewDashboard from '@/components/verifier/MrvReviewDashboard.vue'
import { getVerifierQueueCounts } from '@/services/verifierQueueCounts'

const store = useUserStore()

// Backlog per queue. Only one panel mounts at a time, so without these the
// verifier had to open all three dashboards to find out which had work —
// the role's first question was its most expensive one to answer.
const counts = ref({ projects: 0, mrv: 0, applications: 0 })

const tabs = computed(() => [
  { value: 'projects', label: 'Project Reviews', icon: 'fact_check', count: counts.value.projects },
  { value: 'mrv', label: 'MRV Reports', icon: 'query_stats', count: counts.value.mrv },
  {
    value: 'applications',
    label: 'Developer Applications',
    icon: 'how_to_reg',
    count: counts.value.applications,
  },
])

// Project validation is the queue a verifier opens the panel for.
const activeTab = ref('projects')

async function loadCounts() {
  counts.value = await getVerifierQueueCounts()
}

onMounted(() => {
  // Only for verifiers: the other branches of this view render an access notice
  // and must not fire three queries the viewer has no right to.
  if (store.isVerifier) loadCounts()
})
</script>

<style scoped>
.verifier-panel {
  min-height: 100vh;
  background: var(--bg-primary);
}

.page-header {
  background: var(--primary-color, #058526);
  color: white;
  padding: 1.25rem 0;
  border-bottom: none;
}

.container {
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  padding: 0 var(--spacing-lg);
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin-bottom: 0.5rem;
}

.page-description {
  font-size: 0.95rem;
  color: #fff;
}

.verifier-content {
  padding: 2rem 0;
  overflow-x: hidden;
}

.access-denied {
  background: white;
  border-radius: 12px;
  padding: 3rem;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.access-denied-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 4rem;
  height: 4rem;
  margin-bottom: 1rem;
  border-radius: 1.25rem;
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
}

.access-denied-icon .material-symbols-outlined {
  font-size: 2.5rem;
}

.access-denied h2 {
  font-size: 1.5rem;
  color: #111827;
  margin-bottom: 0.5rem;
}

.access-denied p {
  color: #6b7280;
  margin-bottom: 1rem;
}

.hint-text {
  font-size: 0.875rem;
  color: #9ca3af;
}

.login-link {
  display: inline-block;
  margin-top: 1rem;
  padding: 0.75rem 1.5rem;
  background: var(--primary-color, #058526);
  color: white;
  text-decoration: none;
  border-radius: 8px;
  font-weight: 500;
  transition: background 0.2s;
}

.login-link:hover {
  background: #059669;
}

.verifier-dashboard {
  display: block;
}

.approval-section {
  background: transparent;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
}

.workbench-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.workbench-tab {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 1.05rem;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #fff;
  color: #334155;
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
}

.tab-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.35rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  background: #e2e8f0;
  color: #334155;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1;
}

/* On the active tab the grey pill disappears into the fill, so invert it. */
.workbench-tab.active .tab-count {
  background: rgba(255, 255, 255, 0.9);
  color: #058526;
}

.workbench-tab .material-symbols-outlined {
  font-size: 1.1rem;
}

.workbench-tab.active {
  border-color: var(--primary-color, #058526);
  color: var(--primary-color, #058526);
  background: #ecfdf5;
}

@media (max-width: 640px) {
  .workbench-tab {
    flex: 1 1 auto;
    justify-content: center;
  }
}

@media (max-width: 768px) {




  .verifier-content {
    padding: 1rem 0;
  }

  .container {
    padding: 0 var(--spacing-md);
  }
}
</style>
