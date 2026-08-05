<template>
  <div class="mrv-page">
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">Monitoring Reports (MRV)</h1>
        <p class="page-description">
          Submit periodic monitoring data for your validated projects. Verified reports
          issue carbon credits.
        </p>
      </div>
    </div>

    <div class="mrv-content">
      <div class="container">
        <!-- Reporting reminders -->
        <div v-if="reminders.length" class="reminders-card">
          <div class="reminders-head">
            <span class="material-symbols-outlined" aria-hidden="true">notifications_active</span>
            <h3>Monitoring due</h3>
          </div>
          <ul class="reminders-list">
            <li v-for="rem in reminders" :key="rem.projectId" class="reminder-item" :class="rem.status">
              <div class="reminder-text">
                <span class="reminder-title">{{ rem.title }}</span>
                <span class="reminder-when">
                  <template v-if="rem.status === 'overdue'">
                    Overdue by {{ Math.abs(rem.daysUntil) }} day{{ Math.abs(rem.daysUntil) === 1 ? '' : 's' }}
                  </template>
                  <template v-else>
                    Due in {{ rem.daysUntil }} day{{ rem.daysUntil === 1 ? '' : 's' }} ({{ formatDate(rem.dueDate) }})
                  </template>
                  <template v-if="!rem.hasEverReported"> · no report filed yet</template>
                </span>
              </div>
              <button class="btn btn-primary btn-sm" :disabled="creating" @click="startReportFor(rem.projectId)">
                Start report
              </button>
            </li>
          </ul>
        </div>

        <!-- Project selector -->
        <div class="selector-card">
          <label for="project" class="form-label">Validated Project</label>
          <select id="project" v-model="selectedProjectId" class="form-select" @change="onProjectChange">
            <option value="" disabled>Select a validated project</option>
            <!-- Title only. Appending "— <category>" made the widest option far
                 wider than the control, and a native select's popup is sized to
                 its longest option — so the open list overhung the box. The
                 category for the chosen project is shown under the control
                 instead, where it is actually readable. -->
            <option v-for="p in projects" :key="p.id" :value="p.id">
              {{ p.title }}
            </option>
          </select>
          <p v-if="selectedProjectCategory" class="empty-hint">
            Category: {{ selectedProjectCategory }}
          </p>
          <p v-if="!loadingProjects && projects.length === 0" class="empty-hint">
            You have no validated projects yet. Projects must be validated before you can
            submit monitoring reports.
          </p>
        </div>

        <div v-if="selectedProjectId" class="mrv-layout">
          <!-- Reports list -->
          <div class="reports-list">
            <div class="reports-list-header">
              <h3>Reports</h3>
              <button class="btn btn-primary btn-sm" @click="startNewReport" :disabled="creating">
                {{ creating ? 'Creating…' : '+ New' }}
              </button>
            </div>
            <div v-if="reports.length === 0" class="empty-hint">No reports yet.</div>
            <button
              v-for="r in reports"
              :key="r.id"
              class="report-item"
              :class="{ active: currentReport && r.id === currentReport.id }"
              @click="openReport(r.id)"
            >
              <span class="report-period">{{ r.period_type }} · {{ formatDate(r.created_at) }}</span>
              <span class="status-badge" :class="statusMeta(r.status).color">
                {{ statusMeta(r.status).label }}
              </span>
              <span class="report-vers">{{ Number(r.proposed_vers || 0).toLocaleString() }} tCO₂e</span>
            </button>
          </div>

          <!-- Editor -->
          <div class="report-editor">
            <div v-if="!currentReport" class="placeholder">
              <span class="material-symbols-outlined">monitoring</span>
              <p>Select a report or create a new one.</p>
            </div>

            <div v-else>
              <div class="editor-head">
                <h3>Report Details</h3>
                <span class="status-badge" :class="statusMeta(currentReport.status).color">
                  {{ statusMeta(currentReport.status).label }}
                </span>
              </div>

              <fieldset :disabled="!isEditable" class="editor-body">
                <div class="form-grid">
                  <div class="form-group">
                    <label class="form-label" for="mrv-period-type">Period Type</label>
                    <select id="mrv-period-type" v-model="form.periodType" class="form-select">
                      <option v-for="pt in periodTypes" :key="pt.value" :value="pt.value">{{ pt.label }}</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="mrv-period-start">Period Start</label>
                    <input id="mrv-period-start" type="date" v-model="form.periodStart" class="form-input" />
                  </div>
                  <div class="form-group">
                    <label class="form-label" for="mrv-period-end">Period End</label>
                    <input id="mrv-period-end" type="date" v-model="form.periodEnd" class="form-input" />
                  </div>
                </div>

                <!-- Activity data -->
                <h4 class="section-title">Activity Data</h4>
                <p v-if="metrics.length === 0" class="empty-hint">
                  No metrics defined for this project type.
                </p>
                <div v-for="m in metrics" :key="m.metric_key" class="form-group">
                  <label class="form-label" :for="`mrv-activity-${m.metric_key}`">{{ m.label }} ({{ m.unit }})</label>
                  <input
                    :id="`mrv-activity-${m.metric_key}`"
                    type="number"
                    min="0"
                    step="any"
                    v-model="form.activity[m.metric_key]"
                    class="form-input"
                    :placeholder="`Enter ${m.label.toLowerCase()} in ${m.unit}`"
                  />
                </div>

                <!-- Evidence -->
                <h4 class="section-title" id="mrv-evidence-label">Evidence (photos / logs)</h4>
                <div class="evidence-grid">
                  <div v-for="ev in currentReport.evidence" :key="ev.id" class="evidence-item">
                    <img v-if="isImage(ev.file_type)" :src="ev.file_url" alt="evidence" loading="lazy" />
                    <span v-else class="material-symbols-outlined file-icon">description</span>
                    <span class="evidence-caption">{{ ev.caption || 'Evidence' }}</span>
                    <button v-if="isEditable" class="evidence-remove" @click="removeEvidence(ev.id)">×</button>
                  </div>
                </div>
                <div v-if="isEditable" class="evidence-upload">
                  <input
                    ref="fileInput"
                    type="file"
                    accept="image/*,.pdf"
                    aria-labelledby="mrv-evidence-label"
                    @change="onEvidenceSelected"
                  />
                  <span class="upload-hint">JPEG/PNG/PDF up to 2MB</span>
                </div>

                <!-- Notes -->
                <h4 class="section-title" id="mrv-notes-label">Notes</h4>
                <textarea
                  v-model="form.notes"
                  class="form-textarea"
                  rows="3"
                  aria-labelledby="mrv-notes-label"
                  placeholder="Any context for the verifier…"
                ></textarea>
              </fieldset>

              <!-- Proposed VERs -->
              <div class="vers-box">
                <span>Proposed Emission Reductions</span>
                <strong>{{ Number(currentReport.proposed_vers || 0).toLocaleString() }} tCO₂e</strong>
              </div>
              <p class="vers-hint">
                Calculated by the platform from your activity data using the project's
                methodology. The verifier confirms the final amount.
              </p>

              <!-- Review feedback (if reviewed) -->
              <div v-if="currentReport.review_notes" class="review-notes">
                <strong>Verifier notes:</strong> {{ currentReport.review_notes }}
              </div>

              <!-- Actions -->
              <div v-if="isEditable" class="editor-actions">
                <button class="btn btn-outline" @click="saveAndCalculate" :disabled="saving">
                  {{ saving ? 'Saving…' : 'Save & Calculate' }}
                </button>
                <button class="btn btn-primary" @click="submit" :disabled="saving">
                  Submit for Verification
                </button>
              </div>
              <p v-else class="locked-hint">
                This report is {{ statusMeta(currentReport.status).label.toLowerCase() }} and can no longer be edited.
              </p>

              <p v-if="message" class="editor-message" :class="{ error: isError }">{{ message }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useUserStore } from '@/store/userStore'
import { getMetricsForType, PERIOD_TYPES, REPORT_STATUS_META, MAX_EVIDENCE_BYTES } from '@/constants/mrv'
import {
  getMonitorableProjects,
  getReportsByProject,
  getReport,
  createReport,
  updateReportMeta,
  saveActivityData,
  addEvidence,
  deleteEvidence,
  calculateVers,
  submitReport,
} from '@/services/monitoringService'
import { computeMrvReminders, syncMrvReminderNotifications } from '@/services/mrvReminderService'

const userStore = useUserStore()
const periodTypes = PERIOD_TYPES

const reminders = ref([])
const projects = ref([])
const loadingProjects = ref(false)
const selectedProjectId = ref('')
const reports = ref([])
const currentReport = ref(null)
const creating = ref(false)
const saving = ref(false)
const message = ref('')
const isError = ref(false)
const fileInput = ref(null)

const form = ref({
  periodType: 'yearly',
  periodStart: '',
  periodEnd: '',
  notes: '',
  activity: {},
})

const selectedProject = computed(() => projects.value.find((p) => p.id === selectedProjectId.value) || null)
const metrics = computed(() => getMetricsForType(selectedProject.value?.category))
// Shown under the selector, so the option labels can stay short enough that the
// dropdown popup matches the width of the control.
const selectedProjectCategory = computed(() => selectedProject.value?.category || '')
const isEditable = computed(
  () => currentReport.value && ['draft', 'needs_revision'].includes(currentReport.value.status),
)

function statusMeta(status) {
  return REPORT_STATUS_META[status] || { label: status, color: 'gray' }
}

function isImage(type) {
  return (type || '').startsWith('image/')
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function setMessage(text, error = false) {
  message.value = text
  isError.value = error
}

async function loadProjects() {
  loadingProjects.value = true
  try {
    projects.value = await getMonitorableProjects(userStore.session?.user?.id)
  } catch (err) {
    setMessage(err.message || 'Failed to load projects', true)
  } finally {
    loadingProjects.value = false
  }
}

async function loadReports() {
  if (!selectedProjectId.value) return
  reports.value = await getReportsByProject(selectedProjectId.value)
}

async function loadReminders() {
  try {
    const uid = userStore.session?.user?.id
    reminders.value = await computeMrvReminders(uid)
    // Raise deduped bell notifications for anything overdue (best-effort).
    syncMrvReminderNotifications(uid).catch(() => {})
  } catch {
    reminders.value = []
  }
}

async function startReportFor(projectId) {
  selectedProjectId.value = projectId
  currentReport.value = null
  await loadReports()
  await startNewReport()
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function onProjectChange() {
  currentReport.value = null
  setMessage('')
  await loadReports()
}

async function startNewReport() {
  if (!selectedProjectId.value) return
  creating.value = true
  setMessage('')
  try {
    const report = await createReport(
      { projectId: selectedProjectId.value, periodType: 'yearly' },
      userStore.session?.user?.id,
    )
    await loadReports()
    await openReport(report.id)
  } catch (err) {
    setMessage(err.message || 'Failed to create report', true)
  } finally {
    creating.value = false
  }
}

async function openReport(reportId) {
  setMessage('')
  try {
    const report = await getReport(reportId)
    currentReport.value = report
    form.value = {
      periodType: report.period_type || 'yearly',
      periodStart: report.period_start || '',
      periodEnd: report.period_end || '',
      notes: report.notes || '',
      activity: Object.fromEntries((report.activity || []).map((a) => [a.metric_key, a.value])),
    }
  } catch (err) {
    setMessage(err.message || 'Failed to open report', true)
  }
}

function activityItems() {
  return metrics.value.map((m) => ({
    metric_key: m.metric_key,
    value: form.value.activity[m.metric_key],
    unit: m.unit,
  }))
}

async function persist() {
  await updateReportMeta(currentReport.value.id, {
    periodType: form.value.periodType,
    periodStart: form.value.periodStart || null,
    periodEnd: form.value.periodEnd || null,
    notes: form.value.notes,
  })
  await saveActivityData(currentReport.value.id, activityItems())
}

async function saveAndCalculate() {
  if (!currentReport.value) return
  saving.value = true
  setMessage('')
  try {
    await persist()
    const vers = await calculateVers(currentReport.value.id)
    currentReport.value.proposed_vers = vers
    await loadReports()
    setMessage(`Saved. Proposed reductions: ${Number(vers).toLocaleString()} tCO₂e.`)
  } catch (err) {
    setMessage(err.message || 'Failed to save', true)
  } finally {
    saving.value = false
  }
}

async function submit() {
  if (!currentReport.value) return
  if (!confirm('Submit this report for verification? You will not be able to edit it afterwards.')) return
  saving.value = true
  setMessage('')
  try {
    await persist()
    const updated = await submitReport(currentReport.value.id)
    await openReport(updated.id)
    await loadReports()
    setMessage('Report submitted for verification.')
  } catch (err) {
    setMessage(err.message || 'Failed to submit', true)
  } finally {
    saving.value = false
  }
}

function onEvidenceSelected(event) {
  const file = event.target.files?.[0]
  if (!file) return
  if (file.size > MAX_EVIDENCE_BYTES) {
    setMessage('File too large (max 2MB).', true)
    if (fileInput.value) fileInput.value.value = ''
    return
  }
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      await addEvidence(currentReport.value.id, {
        file_url: reader.result,
        file_type: file.type,
        caption: file.name,
      })
      currentReport.value = await getReport(currentReport.value.id)
      setMessage('Evidence added.')
    } catch (err) {
      setMessage(err.message || 'Failed to add evidence', true)
    } finally {
      if (fileInput.value) fileInput.value.value = ''
    }
  }
  reader.readAsDataURL(file)
}

async function removeEvidence(evidenceId) {
  try {
    await deleteEvidence(evidenceId)
    currentReport.value = await getReport(currentReport.value.id)
  } catch (err) {
    setMessage(err.message || 'Failed to remove evidence', true)
  }
}

loadProjects()
loadReminders()
</script>

<style scoped>
.mrv-page {
  min-height: 100vh;
  background: var(--bg-primary, #ffffff);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.page-header {
  background: var(--primary-color, #058526);
  padding: 1.25rem 0;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.5rem 0;
}

.page-description {
  /* No opacity — 95% white on --primary-color is 4.48:1, under the AA floor. */
  color: #fff;
  margin: 0;
}

.mrv-content {
  padding: 2rem 0;
}

.selector-card,
.reports-list,
.report-editor {
  background: var(--bg-primary, #ffffff);
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.75rem;
  padding: 1.25rem;
}

.selector-card {
  margin-bottom: 1.5rem;
}

.reminders-card {
  background: #fff;
  border: 1px solid #fed7aa;
  border-left: 4px solid #f59e0b;
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
}

.reminders-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.reminders-head h3 {
  margin: 0;
  font-size: 1.05rem;
}

.reminders-head .material-symbols-outlined {
  color: #d97706;
}

.reminders-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.reminder-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.6rem 0.75rem;
  border-radius: 0.5rem;
  background: #fffbeb;
}

.reminder-item.overdue {
  background: #fef2f2;
}

.reminder-text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.reminder-title {
  font-weight: 600;
  font-size: 0.9rem;
}

.reminder-when {
  font-size: 0.78rem;
  color: #6b7280;
}

.reminder-item.overdue .reminder-when {
  color: #b91c1c;
}

.form-label {
  display: block;
  font-weight: 600;
  color: var(--text-primary, #1a1a1a);
  margin-bottom: 0.4rem;
  font-size: 0.9rem;
}

.form-select,
.form-input,
.form-textarea {
  width: 100%;
  padding: 10px 14px;
  border: 2px solid var(--border-color, #d1e7dd);
  border-radius: 0.5rem;
  font-size: 15px;
  background: #fff;
  color: var(--text-primary, #1a202c);
}

.form-select:focus,
.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
  box-shadow: 0 0 0 3px var(--primary-light, rgba(5, 133, 38, 0.1));
}

.mrv-layout {
  display: grid;
  grid-template-columns: minmax(240px, 320px) 1fr;
  gap: 1.5rem;
  align-items: flex-start;
}

.reports-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.reports-list-header h3 {
  margin: 0;
  font-size: 1.1rem;
}

.report-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 100%;
  text-align: left;
  padding: 0.75rem;
  border: 1px solid var(--border-light, #e8f5e8);
  border-radius: 0.5rem;
  background: #fff;
  cursor: pointer;
  margin-bottom: 0.5rem;
}

.report-item:hover {
  border-color: var(--primary-color, #058526);
}

.report-item.active {
  background: var(--primary-light, #e8f5e8);
  border-color: var(--primary-color, #058526);
}

.report-period {
  font-weight: 600;
  font-size: 0.85rem;
  text-transform: capitalize;
}

.report-vers {
  font-size: 0.78rem;
  color: var(--text-muted, #64748b);
}

.status-badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  width: fit-content;
}

.status-badge.gray { background: #e5e7eb; color: #374151; }
.status-badge.yellow { background: #fef3c7; color: #92400e; }
.status-badge.blue { background: #dbeafe; color: #1e40af; }
.status-badge.green { background: #d1fae5; color: #065f46; }
.status-badge.red { background: #fee2e2; color: #991b1b; }

.editor-head,
.editor-body {
  margin-bottom: 1rem;
}

.editor-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.editor-head h3 {
  margin: 0;
}

.editor-body {
  border: none;
  padding: 0;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.section-title {
  margin: 1.25rem 0 0.5rem;
  font-size: 1rem;
  color: var(--text-primary, #1a1a1a);
  border-bottom: 1px solid var(--border-light, #e8f5e8);
  padding-bottom: 0.35rem;
}

.evidence-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.evidence-item {
  position: relative;
  width: 110px;
  border: 1px solid var(--border-light, #e8f5e8);
  border-radius: 0.5rem;
  padding: 0.4rem;
  text-align: center;
}

.evidence-item img {
  width: 100%;
  height: 70px;
  object-fit: cover;
  border-radius: 0.35rem;
}

.file-icon {
  font-size: 2.5rem;
  color: var(--text-muted, #64748b);
}

.evidence-caption {
  display: block;
  font-size: 0.7rem;
  color: var(--text-muted, #64748b);
  margin-top: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.evidence-remove {
  position: absolute;
  top: -8px;
  right: -8px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: none;
  background: #dc2626;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.evidence-upload {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.upload-hint {
  font-size: 0.75rem;
  color: var(--text-muted, #64748b);
}

.vers-box {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--primary-light, #e8f5e8);
  padding: 0.85rem 1rem;
  border-radius: 0.5rem;
  margin-top: 1rem;
}

.vers-box strong {
  color: var(--primary-color, #058526);
  font-size: 1.2rem;
}

.vers-hint {
  font-size: 0.75rem;
  color: var(--text-muted, #64748b);
  margin: 0.4rem 0 0;
}

.review-notes {
  margin-top: 1rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  font-size: 0.85rem;
}

.editor-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1.25rem;
}

.locked-hint {
  margin-top: 1rem;
  color: var(--text-muted, #64748b);
  font-size: 0.85rem;
}

.editor-message {
  margin-top: 0.75rem;
  color: var(--primary-color, #058526);
  font-weight: 500;
}

.editor-message.error {
  color: #dc2626;
}

.placeholder {
  text-align: center;
  color: var(--text-muted, #64748b);
  padding: 3rem 1rem;
}

.placeholder .material-symbols-outlined {
  font-size: 3rem;
  color: var(--primary-color, #058526);
}

.empty-hint {
  color: var(--text-muted, #64748b);
  font-size: 0.85rem;
}

.btn {
  padding: 0.55rem 1.1rem;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.btn-sm {
  padding: 0.35rem 0.7rem;
  font-size: 0.85rem;
}

.btn-primary {
  background: var(--primary-color, #058526);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover, #04701f);
}

.btn-outline {
  background: transparent;
  border: 1px solid var(--border-color, #d1e7dd);
  color: var(--text-primary, #1a1a1a);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .container { padding: 0 1rem; }
  .mrv-layout { grid-template-columns: 1fr; }
  .form-grid { grid-template-columns: 1fr; }
}
</style>
