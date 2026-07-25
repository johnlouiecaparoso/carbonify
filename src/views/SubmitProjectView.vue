<template>
  <div class="submit-project-page">
    <!-- Page Header -->
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">{{ isEdit ? 'Edit Project' : 'Submit a Project' }}</h1>
        <p class="page-description">
          {{ isEdit
            ? 'Update your project and resubmit it for verification.'
            : 'Submit your environmental project for verification and potential carbon credit generation' }}
        </p>
      </div>
    </div>

    <!-- Main Content -->
    <div class="submit-content">
      <div class="container">
        <!-- Success Card -->
        <div v-if="showSuccessCard" class="success-card-overlay">
          <div class="success-card">
            <div class="success-card-header">
              <div class="success-icon">✅</div>
              <h2 class="success-title">Project Submitted Successfully!</h2>
              <p class="success-subtitle">
                Your project <strong>"{{ submittedProject?.title }}"</strong> has been submitted for verification.
              </p>
            </div>

            <div class="success-card-body">
              <div class="next-steps">
                <h3 class="section-title">What happens next?</h3>
                <div class="steps-list">
                  <div class="step-item">
                    <div class="step-icon">1️⃣</div>
                    <div class="step-text">
                      <strong>Initial Screening</strong>
                      <span>Admin checks project completeness and MRV readiness</span>
                    </div>
                  </div>
                  <div class="step-item">
                    <div class="step-icon">2️⃣</div>
                    <div class="step-text">
                      <strong>MRV Review</strong>
                      <span>Verifier reviews monitoring data, baseline, and methodology</span>
                    </div>
                  </div>
                  <div class="step-item">
                    <div class="step-icon">3️⃣</div>
                    <div class="step-text">
                      <strong>Validation & Issuance</strong>
                      <span>Validated projects move to the active pool and can issue credits</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="action-buttons">
                <UiButton variant="primary" @click="goToMarketplace" class="action-btn">
                  <span class="material-symbols-outlined success-action-icon" aria-hidden="true">
                    storefront
                  </span>
                  <span>Browse Marketplace</span>
                </UiButton>
                <UiButton variant="outline" @click="goToDashboard" class="action-btn">
                  <span class="material-symbols-outlined success-action-icon" aria-hidden="true">
                    dashboard
                  </span>
                  <span>Go to Dashboard</span>
                </UiButton>
                <UiButton variant="outline" @click="submitAnother" class="action-btn">
                  <span class="material-symbols-outlined success-action-icon" aria-hidden="true">
                    add_circle
                  </span>
                  <span>Submit Another Project</span>
                </UiButton>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="content-layout">
          <!-- Project Form -->
          <div class="form-section">
            <div v-if="loadingProject" class="state-card">Loading project…</div>
            <div v-else-if="loadError" class="state-card error">{{ loadError }}</div>
            <ProjectForm
              v-else
              :mode="isEdit ? 'edit' : 'create'"
              :project="editProject"
              @success="handleProjectSuccess"
              @cancel="handleProjectCancel"
            />
          </div>

          <!-- Information Sidebar -->
          <div class="info-sidebar">
            <div class="info-card">
              <h3 class="info-title">Submission Guidelines</h3>
              <ul class="info-list">
                <li>Provide detailed project description</li>
                <li>Include measurable environmental impact</li>
                <li>Upload supporting documents</li>
                <li>Specify project location and timeline</li>
                <li>Estimate carbon credit potential</li>
              </ul>
            </div>

            <div class="info-card">
              <h3 class="info-title">MRV Process</h3>
              <div class="process-steps">
                <div class="step">
                  <div class="step-number">1</div>
                  <div class="step-content">
                    <h4>Monitoring</h4>
                    <p>Submit quarterly or yearly monitoring reports with photos and production logs</p>
                  </div>
                </div>
                <div class="step">
                  <div class="step-number">2</div>
                  <div class="step-content">
                    <h4>Reporting</h4>
                    <p>Platform calculates emission reductions from baseline and activity data</p>
                  </div>
                </div>
                <div class="step">
                  <div class="step-number">3</div>
                  <div class="step-content">
                    <h4>Verification & Issuance</h4>
                    <p>Independent verifier approves or rejects VERs before carbon credit issuance</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="info-card">
              <h3 class="info-title">Need Help?</h3>
              <p class="help-text">
                Contact our support team for assistance with project submission or verification
                requirements.
              </p>
              <a
                class="help-button"
                href="mailto:support@carbonify.com?subject=Project%20submission%20help"
              >
                Contact Support
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import ProjectForm from '@/components/ProjectForm.vue'
import UiButton from '@/components/ui/Button.vue'
import { projectService } from '@/services/projectService'

const router = useRouter()
const route = useRoute()
const showSuccessCard = ref(false)
const submittedProject = ref(null)

// Edit mode: /submit-project?id=<projectId> loads the project for editing
// (used by the developer "Edit details" action in the needs-revision loop).
const editId = computed(() => route.query.id || null)
const isEdit = computed(() => !!editId.value)
const editProject = ref(null)
const loadingProject = ref(false)
const loadError = ref('')

const handleProjectSuccess = (projectData) => {
  console.log('Project saved successfully:', projectData)
  // A draft has not entered the review queue, so the "what happens next" card
  // would be misleading — send them to the dashboard, where the draft is listed
  // with its Submit-for-review action.
  if (projectData?.status === 'draft') {
    router.push('/developer/projects')
    return
  }
  // Edits go straight back to the dashboard (the developer then resubmits there);
  // new submissions show the success card with next steps.
  if (isEdit.value) {
    router.push('/developer/projects')
    return
  }
  submittedProject.value = projectData
  showSuccessCard.value = true
}

const handleProjectCancel = () => {
  console.log('Project submission cancelled')
  // Navigate back to dashboard or homepage
  router.push('/')
}

const goToMarketplace = () => {
  showSuccessCard.value = false
  router.push('/marketplace')
}

const goToDashboard = () => {
  showSuccessCard.value = false
  router.push('/developer/projects')
}

const submitAnother = () => {
  showSuccessCard.value = false
  // Reset form by reloading the component
  window.location.reload()
}

onMounted(async () => {
  if (!isEdit.value) return
  loadingProject.value = true
  loadError.value = ''
  try {
    editProject.value = await projectService.getProject(editId.value)
    if (!editProject.value) loadError.value = 'Project not found or you do not have access to it.'
  } catch (err) {
    console.error('Failed to load project for editing:', err)
    loadError.value = err?.message || 'Failed to load the project for editing.'
  } finally {
    loadingProject.value = false
  }
})
</script>

<style scoped>
.submit-project-page {
  min-height: 100vh;
  background: var(--bg-primary, #ffffff);
}

.state-card {
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  color: #6b7280;
  text-align: center;
}

.state-card.error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}

.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 2rem;
}

/* Page Header */
.page-header {
  padding: 1.25rem 0;
  border-bottom: none;
  /* Matches the developer dashboard header. The old fallback (#10b981) was also
     a third green that appears nowhere in the palette. White-on-brand-green is
     3.5:1; --primary-dark is 5.7:1 and passes AA for the subtitle. */
  background: var(--primary-dark, #04773b);
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
  line-height: 1.6;
}

/* Main Content */
.submit-content {
  padding: 2rem 0;
}

.content-layout {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 2rem;
  align-items: start;
}

.form-section {
  background: var(--bg-primary, #ffffff);
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* Information Sidebar */
.info-sidebar {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.info-card {
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 0.75rem;
  padding: 1.5rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.info-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  margin-bottom: 1rem;
}

.info-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.info-list li {
  padding: 0.5rem 0;
  color: var(--text-secondary, #4a5568);
  position: relative;
  padding-left: 1.5rem;
}

.info-list li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: var(--primary-color, #069e2d);
  font-weight: bold;
}

/* Process Steps */
.process-steps {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.step {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.step-number {
  width: 2rem;
  height: 2rem;
  background: var(--primary-color, #069e2d);
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 0.875rem;
  flex-shrink: 0;
}

.step-content h4 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  margin: 0 0 0.25rem 0;
}

.step-content p {
  font-size: 0.875rem;
  color: var(--text-muted, #718096);
  margin: 0;
  line-height: 1.4;
}

/* Help Section */
.help-text {
  color: var(--text-secondary, #4a5568);
  margin-bottom: 1rem;
  line-height: 1.5;
}

.help-button {
  display: inline-block;
  text-align: center;
  text-decoration: none;
  background: var(--primary-color, #069e2d);
  color: white;
  border: none;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.help-button:hover {
  background: var(--primary-hover, #058e3f);
  transform: translateY(-1px);
}

/* Responsive Design */
@media (max-width: 1024px) {
  .content-layout {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}

@media (max-width: 768px) {
  .container {
    padding: 0 1rem;
  }

  .page-title {
    font-size: 1.5rem;
  }

  .page-description {
    font-size: 0.95rem;
  }

  .submit-content {
    padding: 1.5rem 0;
  }
}

/* Success Card Styles */
.success-card-overlay {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  min-height: auto;
  padding: 1rem 0;
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}

.success-card {
  background: white;
  border-radius: 0.75rem;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
  max-width: 550px;
  width: 100%;
  overflow: hidden;
  animation: cardSlideIn 0.4s ease-out;
  margin: 0 auto;
}

@keyframes cardSlideIn {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.success-card-header {
  background: linear-gradient(135deg, var(--primary-color, #069e2d) 0%, var(--primary-hover, #058e3f) 100%);
  padding: 1.5rem 1.5rem;
  text-align: center;
  color: white;
}

.success-icon {
  font-size: 2.5rem;
  margin-bottom: 0.75rem;
  animation: bounce 0.6s ease-out;
}

@keyframes bounce {
  0%, 100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-10px);
  }
}

.success-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.5rem 0;
  color: white;
  line-height: 1.3;
}

.success-subtitle {
  font-size: 1rem;
  margin: 0;
  opacity: 0.95;
  line-height: 1.5;
}

.success-subtitle strong {
  font-weight: 600;
}

.success-card-body {
  padding: 1.5rem;
}

.next-steps {
  margin-bottom: 1.5rem;
}

.section-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  margin: 0 0 1rem 0;
}

.steps-list {
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
}

.step-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--bg-secondary, #f8fdf8);
  border-radius: 0.5rem;
  border-left: 3px solid var(--primary-color, #069e2d);
  transition: all 0.2s ease;
}

.step-item:hover {
  background: var(--primary-light, #e8f5e8);
  transform: translateX(4px);
}

.step-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
  line-height: 1;
}

.step-text {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
}

.step-text strong {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--text-primary, #1a202c);
  line-height: 1.3;
}

.step-text span {
  font-size: 0.8125rem;
  color: var(--text-secondary, #4a5568);
  line-height: 1.4;
}

.action-buttons {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  margin-top: 1.5rem;
}

.action-btn {
  width: 100%;
  padding: 0.75rem 1.25rem;
  font-size: 0.9375rem;
  font-weight: 500;
  border-radius: 0.5rem;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.action-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.success-action-icon {
  font-size: 1.25rem;
}

/* Responsive Success Card */
@media (max-width: 768px) {
  .success-card-overlay {
    padding: 0.75rem;
    max-height: calc(100vh - 150px);
  }

  .success-card {
    max-width: 100%;
  }

  .success-card-header {
    padding: 1.25rem 1rem;
  }

  .success-icon {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }

  .success-title {
    font-size: 1.25rem;
  }

  .success-subtitle {
    font-size: 0.9375rem;
  }

  .success-card-body {
    padding: 1.25rem;
  }

  .section-title {
    font-size: 1rem;
    margin-bottom: 0.875rem;
  }

  .steps-list {
    gap: 0.75rem;
  }

  .step-item {
    padding: 0.625rem;
  }

  .step-icon {
    font-size: 1.125rem;
  }

  .step-text strong {
    font-size: 0.875rem;
  }

  .step-text span {
    font-size: 0.75rem;
  }

  .action-buttons {
    margin-top: 1.25rem;
    gap: 0.5rem;
  }

  .action-btn {
    padding: 0.625rem 1rem;
    font-size: 0.875rem;
  }
}
</style>
