<template>
  <div class="mrv-review">
    <div class="section-head">
      <h2>MRV Report Verification</h2>
      <button class="btn btn-outline btn-sm" @click="loadQueue" :disabled="loading">Refresh</button>
    </div>
    <p class="section-sub">
      Review monitoring reports and approve Verified Emission Reductions (VERs). Approving
      a report issues carbon credits to the project.
    </p>

    <div v-if="loading" class="state">Loading review queue…</div>
    <div v-else-if="error" class="state error">{{ error }}</div>
    <div v-else-if="queue.length === 0" class="state">No reports awaiting verification.</div>

    <div v-else class="review-layout">
      <!-- Queue -->
      <div class="queue">
        <button
          v-for="r in queue"
          :key="r.id"
          class="queue-item"
          :class="{ active: selected && selected.id === r.id }"
          @click="select(r.id)"
        >
          <span class="queue-title">{{ r.project?.title || 'Project' }}</span>
          <span class="queue-meta">{{ r.project?.category }} · {{ r.period_type }}</span>
          <span class="status-badge" :class="statusMeta(r.status).color">{{ statusMeta(r.status).label }}</span>
        </button>
      </div>

      <!-- Detail -->
      <div class="detail">
        <div v-if="!selected" class="placeholder">Select a report to review.</div>
        <div v-else>
          <h3>{{ selectedProjectTitle }}</h3>
          <div class="meta-row">
            <span>{{ selected.period_type }}</span>
            <span v-if="selected.period_start">· {{ selected.period_start }} → {{ selected.period_end || '—' }}</span>
          </div>

          <!-- Activity data AND the arithmetic applied to it. The reviewer is
               accountable for the issued number, so showing the total without
               the factor that produced it asked them to certify a figure they
               could not audit. Reproduces calculate_report_vers() exactly. -->
          <h4 class="block-title">Activity Data &amp; Calculation</h4>
          <table class="data-table stack-on-mobile" v-if="calculation.lines.length">
            <thead>
              <tr>
                <th>Metric</th>
                <th class="num">Value</th>
                <th>Unit</th>
                <th class="num">Factor</th>
                <th class="num">tCO₂e</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, i) in calculation.lines" :key="i" :class="{ unmatched: !line.matched }">
                <td data-label="Metric">
                  {{ line.label }}
                  <span v-if="!line.matched" class="no-factor" title="No emission factor is defined for this metric on this project type, so it contributes nothing to the total.">
                    no factor
                  </span>
                </td>
                <td class="num" data-label="Value">{{ Number(line.value).toLocaleString() }}</td>
                <td data-label="Unit">{{ line.unit || '—' }}</td>
                <td class="num" data-label="Factor">{{ line.matched ? `× ${line.factor}` : '—' }}</td>
                <td class="num" data-label="tCO2e">{{ line.matched ? line.subtotal.toLocaleString() : '0' }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4"><strong>Total</strong></td>
                <td class="num" data-label="tCO2e"><strong>{{ calculation.total.toLocaleString() }}</strong></td>
              </tr>
            </tfoot>
          </table>
          <p v-else class="muted">No activity data submitted.</p>

          <p v-if="calculation.unmatched" class="calc-warning">
            <span class="material-symbols-outlined" aria-hidden="true">warning</span>
            {{ calculation.unmatched }} metric(s) have no emission factor for
            "{{ selected.project?.category || 'this project type' }}" and contribute nothing to the
            total. Confirm the developer used the right metric before approving.
          </p>
          <p v-else-if="calculation.mismatch" class="calc-warning">
            <span class="material-symbols-outlined" aria-hidden="true">warning</span>
            This breakdown totals {{ calculation.total.toLocaleString() }} tCO₂e but the report
            stores {{ Number(selected.proposed_vers || 0).toLocaleString() }}. The factors may have
            changed since submission — re-check before approving.
          </p>

          <h4 class="block-title">Evidence</h4>
          <div v-if="selected.evidence?.length" class="evidence-grid">
            <!-- Each item carries its integrity flags: when and where the photo
                 was taken, and whether these exact bytes have been submitted
                 against another report. -->
            <div v-for="ev in selected.evidence" :key="ev.id" class="evidence-cell">
              <a :href="ev.file_url" target="_blank" rel="noopener" class="evidence-item">
                <img v-if="isImage(ev.file_type)" :src="ev.file_url" alt="evidence" />
                <span v-else class="material-symbols-outlined file-icon">description</span>
                <span class="evidence-caption">{{ ev.caption || 'Evidence' }}</span>
              </a>
              <ul class="integrity-flags">
                <li
                  v-for="(flag, i) in integrityFor(ev).flags"
                  :key="i"
                  :class="['integrity-flag', flag.level]"
                >
                  <span class="material-symbols-outlined" aria-hidden="true">
                    {{ flagIcon(flag.level) }}
                  </span>
                  {{ flag.text }}
                </li>
              </ul>
            </div>
          </div>
          <p v-else class="muted">No evidence attached.</p>

          <p v-if="suspiciousEvidenceCount" class="calc-warning">
            <span class="material-symbols-outlined" aria-hidden="true">gpp_maybe</span>
            {{ suspiciousEvidenceCount }} evidence item(s) need a closer look — a duplicate
            submission or a capture date outside this reporting period. Resolve before approving.
          </p>

          <div v-if="selected.notes" class="dev-notes">
            <strong>Developer notes:</strong> {{ selected.notes }}
          </div>

          <div class="vers-box">
            <span>Platform-calculated reductions</span>
            <strong>{{ Number(selected.proposed_vers || 0).toLocaleString() }} tCO₂e</strong>
          </div>

          <!-- Decision -->
          <div class="decision">
            <div class="form-group">
              <label class="form-label" for="mrv-approved-qty">Approved credits (tCO₂e)</label>
              <input id="mrv-approved-qty" type="number" min="0" step="any" v-model="approvedQuantity" class="form-input" />
              <span class="hint">Defaults to the platform calculation; adjust if your review differs.</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="mrv-vintage">Vintage year</label>
              <input id="mrv-vintage" type="number" v-model="vintageYear" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label" for="mrv-reduction-type">Reduction type</label>
              <select id="mrv-reduction-type" v-model="reductionType" class="form-input">
                <option value="">Not classified</option>
                <option v-for="r in REDUCTION_TYPES" :key="r.value" :value="r.value">
                  {{ r.label }} — {{ r.description }}
                </option>
              </select>
              <span class="hint">
                Pre-selected from the project type, but you are asserting it. Removals and avoidances
                are priced differently and are not interchangeable.
              </span>
            </div>
            <div class="form-group">
              <label class="form-label" for="mrv-notes">Notes</label>
              <textarea id="mrv-notes" v-model="notes" class="form-textarea" rows="2" placeholder="Verification notes / rejection reason"></textarea>
            </div>

            <div class="decision-actions">
              <button
                v-if="selected.status === 'submitted'"
                class="btn btn-outline"
                @click="doStartReview"
                :disabled="working"
              >
                Start Review
              </button>
              <button class="btn btn-danger" @click="doReject" :disabled="working">Reject</button>
              <button class="btn btn-primary" @click="doApprove" :disabled="working">
                {{ working ? 'Processing…' : 'Approve & Issue Credits' }}
              </button>
            </div>
            <p v-if="message" class="message" :class="{ error: isError }">{{ message }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Same confirmation component the project review panel uses. -->
    <ModernPrompt
      :is-open="promptState.isOpen"
      :type="promptState.type"
      :title="promptState.title"
      :message="promptState.message"
      :confirm-text="promptState.confirmText"
      :cancel-text="promptState.cancelText"
      :show-cancel="promptState.showCancel"
      @confirm="handleConfirm"
      @cancel="handleCancel"
      @close="handleClose"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { REPORT_STATUS_META, REDUCTION_TYPES, suggestedReductionType } from '@/constants/mrv'
import { useModernPrompt } from '@/composables/useModernPrompt'
import ModernPrompt from '@/components/ui/ModernPrompt.vue'
import {
  getReviewQueue,
  getReport,
  startReview,
  approveReport,
  rejectReport,
  getMethodologyFactors,
  buildVerCalculation,
  findDuplicateEvidence,
} from '@/services/monitoringService'
import { evidenceIntegrity } from '@/utils/imageEvidence'

const {
  promptState,
  confirm: confirmPrompt,
  handleConfirm,
  handleCancel,
  handleClose,
} = useModernPrompt()

const queue = ref([])
const loading = ref(false)
const error = ref('')
const selected = ref(null)
const working = ref(false)
const message = ref('')
const isError = ref(false)

const approvedQuantity = ref(0)
const vintageYear = ref(new Date().getFullYear())
const reductionType = ref('')
const notes = ref('')

const selectedProjectTitle = computed(() => {
  const match = queue.value.find((r) => r.id === selected.value?.id)
  return match?.project?.title || selected.value?.project?.title || 'Project'
})

// Emission factors for the selected report's project type.
const factors = ref([])

// evidence id → other reports carrying the identical file.
const duplicatesByEvidence = ref({})

function integrityFor(evidence) {
  return evidenceIntegrity(evidence, duplicatesByEvidence.value[evidence.id] || [], selected.value)
}

function flagIcon(level) {
  return { ok: 'check_circle', warn: 'info', alert: 'gpp_maybe', info: 'help' }[level] || 'info'
}

const suspiciousEvidenceCount = computed(
  () => (selected.value?.evidence || []).filter((ev) => integrityFor(ev).suspicious).length,
)

/** Look up duplicates for every hashed evidence item on the open report. */
async function loadEvidenceDuplicates(report) {
  const found = {}
  for (const ev of report?.evidence || []) {
    if (!ev.content_hash) continue
    const dupes = await findDuplicateEvidence(ev.content_hash, report.id)
    if (dupes.length) found[ev.id] = dupes
  }
  duplicatesByEvidence.value = found
}

/**
 * The platform's arithmetic, line by line. `mismatch` flags a breakdown that no
 * longer reproduces the stored proposed_vers — which happens when an admin
 * edits methodology_factors after a report was submitted.
 */
const calculation = computed(() => {
  const result = buildVerCalculation({
    activity: selected.value?.activity || [],
    factors: factors.value,
  })
  const stored = Number(selected.value?.proposed_vers || 0)
  return {
    ...result,
    mismatch: result.lines.length > 0 && Math.abs(result.total - stored) > 0.000001,
  }
})

function statusMeta(status) {
  return REPORT_STATUS_META[status] || { label: status, color: 'gray' }
}
function isImage(type) {
  return (type || '').startsWith('image/')
}
function setMessage(text, err = false) {
  message.value = text
  isError.value = err
}

async function loadQueue() {
  loading.value = true
  error.value = ''
  try {
    queue.value = await getReviewQueue()
  } catch (err) {
    error.value = err.message || 'Failed to load review queue'
  } finally {
    loading.value = false
  }
}

async function select(reportId) {
  setMessage('')
  try {
    selected.value = await getReport(reportId)
    approvedQuantity.value = Number(selected.value.proposed_vers || 0)
    // Default the vintage to the report's period/vintage when available so the
    // verifier isn't re-typing it for prior-year reports.
    vintageYear.value = Number(
      selected.value.vintage_year ||
        selected.value.vintage ||
        (selected.value.period_end ? new Date(selected.value.period_end).getFullYear() : 0) ||
        new Date().getFullYear(),
    )
    // A suggestion from the project category, not a classification — the verifier
    // confirms or overrides it before the credits are minted. getReport now
    // attaches the project, so this actually receives a category; it used to be
    // handed '' on every report because monitoring_reports has no category column.
    const category = selected.value.project?.category || ''
    reductionType.value = suggestedReductionType(category)
    // Same factors the server-side calculation joins against.
    factors.value = await getMethodologyFactors(category)
    duplicatesByEvidence.value = {}
    loadEvidenceDuplicates(selected.value).catch(() => {})
    notes.value = ''
  } catch (err) {
    setMessage(err.message || 'Failed to load report', true)
  }
}

async function doStartReview() {
  working.value = true
  try {
    await startReview(selected.value.id)
    await loadQueue()
    await select(selected.value.id)
    setMessage('Marked as under review.')
  } catch (err) {
    setMessage(err.message || 'Failed', true)
  } finally {
    working.value = false
  }
}

async function doApprove() {
  // Approving mints credits and lists them for sale. That deserves the same
  // styled, readable confirmation the project panel uses — this was a native
  // blocking confirm() on the highest-stakes action in the product.
  const ok = await confirmPrompt({
    title: 'Issue credits?',
    message: `Approve this report and issue ${Number(approvedQuantity.value || 0).toLocaleString()} tCO₂e to "${selectedProjectTitle.value}"? Credits are minted and listed on the marketplace. This cannot be undone.`,
    confirmText: 'Approve & issue',
  })
  if (!ok) return
  working.value = true
  setMessage('')
  try {
    await approveReport(selected.value.id, {
      approvedQuantity: approvedQuantity.value,
      vintageYear: vintageYear.value,
      projectId: selected.value.project_id,
      notes: notes.value,
      reductionType: reductionType.value,
    })
    setMessage('Approved. Credits issued and listed on the marketplace.')
    selected.value = null
    await loadQueue()
  } catch (err) {
    setMessage(err.message || 'Failed to approve', true)
  } finally {
    working.value = false
  }
}

async function doReject() {
  // Rejecting is destructive for the developer's report — require a reason and
  // an explicit confirm (mirrors the Approve guard).
  if (!notes.value || notes.value.trim().length < 5) {
    setMessage('Please add a brief reason (min 5 characters) before rejecting.', true)
    return
  }
  const ok = await confirmPrompt({
    title: 'Reject this report?',
    message: 'The developer will be notified with your reason and will need to resubmit.',
    confirmText: 'Reject report',
  })
  if (!ok) return
  working.value = true
  setMessage('')
  try {
    await rejectReport(selected.value.id, notes.value)
    setMessage('Report rejected.')
    selected.value = null
    await loadQueue()
  } catch (err) {
    setMessage(err.message || 'Failed to reject', true)
  } finally {
    working.value = false
  }
}

loadQueue()
</script>

<style scoped>
.mrv-review {
  background: #fff;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 12px;
  padding: 1.5rem;
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.section-head h2 {
  margin: 0;
  font-size: 1.4rem;
  color: var(--text-primary, #111827);
}

.section-sub {
  color: var(--text-muted, #6b7280);
  margin: 0.35rem 0 1.25rem;
  font-size: 0.9rem;
}

.state {
  padding: 1.5rem;
  text-align: center;
  color: var(--text-muted, #6b7280);
}

.state.error {
  color: #dc2626;
}

.review-layout {
  display: grid;
  grid-template-columns: minmax(220px, 300px) 1fr;
  gap: 1.5rem;
  align-items: flex-start;
}

.queue {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.queue-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-align: left;
  padding: 0.75rem;
  border: 1px solid var(--border-light, #e8f5e8);
  border-radius: 0.5rem;
  background: #fff;
  cursor: pointer;
}

.queue-item:hover {
  border-color: var(--primary-color, #058526);
}

.queue-item.active {
  background: var(--primary-light, #e8f5e8);
  border-color: var(--primary-color, #058526);
}

.queue-title {
  font-weight: 600;
  font-size: 0.9rem;
}

.queue-meta {
  font-size: 0.75rem;
  color: var(--text-muted, #6b7280);
  text-transform: capitalize;
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

.detail {
  border: 1px solid var(--border-light, #e8f5e8);
  border-radius: 0.75rem;
  padding: 1.25rem;
  min-height: 300px;
}

.detail h3 {
  margin: 0 0 0.25rem;
}

.meta-row {
  color: var(--text-muted, #6b7280);
  font-size: 0.85rem;
  text-transform: capitalize;
  margin-bottom: 0.5rem;
}

.block-title {
  margin: 1.1rem 0 0.5rem;
  font-size: 0.95rem;
  border-bottom: 1px solid var(--border-light, #e8f5e8);
  padding-bottom: 0.3rem;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.data-table th,
.data-table td {
  text-align: left;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid var(--border-light, #e8f5e8);
}

.data-table th.num,
.data-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.data-table tfoot td {
  border-top: 2px solid #e5e7eb;
  border-bottom: none;
}

/* A metric with no factor contributes nothing — say so rather than showing a
   silent zero the verifier has to notice on their own. */
.data-table tr.unmatched td {
  color: #92400e;
  background: #fffbeb;
}

.no-factor {
  display: inline-block;
  margin-left: 0.35rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.calc-warning {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  margin: 0.6rem 0 0;
  padding: 0.6rem 0.75rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 0.5rem;
  color: #92400e;
  font-size: 0.82rem;
  line-height: 1.45;
}

.calc-warning .material-symbols-outlined {
  font-size: 1.05rem;
  flex: 0 0 auto;
}

/* Evidence integrity ------------------------------------------------------ */
.evidence-cell {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.integrity-flags {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.15rem;
}

.integrity-flag {
  display: flex;
  align-items: flex-start;
  gap: 0.25rem;
  font-size: 0.7rem;
  line-height: 1.35;
  color: #64748b;
}

.integrity-flag .material-symbols-outlined {
  font-size: 0.85rem;
  flex: 0 0 auto;
}

.integrity-flag.ok {
  color: #166534;
}

/* A missing geotag is an absence to weigh, not an accusation — amber, not red. */
.integrity-flag.warn {
  color: #92400e;
}

.integrity-flag.alert {
  color: #b91c1c;
  font-weight: 600;
}

.muted {
  color: var(--text-muted, #6b7280);
  font-size: 0.85rem;
}

.evidence-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.evidence-item {
  width: 110px;
  border: 1px solid var(--border-light, #e8f5e8);
  border-radius: 0.5rem;
  padding: 0.4rem;
  text-align: center;
  text-decoration: none;
  color: inherit;
}

.evidence-item img {
  width: 100%;
  height: 70px;
  object-fit: cover;
  border-radius: 0.35rem;
}

.file-icon {
  font-size: 2.5rem;
  color: var(--text-muted, #6b7280);
}

.evidence-caption {
  display: block;
  font-size: 0.7rem;
  color: var(--text-muted, #6b7280);
  margin-top: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dev-notes {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #f8fafc;
  border-radius: 0.5rem;
  font-size: 0.85rem;
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

.decision {
  margin-top: 1.25rem;
  border-top: 1px solid var(--border-light, #e8f5e8);
  padding-top: 1rem;
}

.form-group {
  margin-bottom: 0.85rem;
}

.form-label {
  display: block;
  font-weight: 600;
  font-size: 0.85rem;
  margin-bottom: 0.3rem;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 9px 12px;
  border: 2px solid var(--border-color, #d1e7dd);
  border-radius: 0.5rem;
  font-size: 14px;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
}

.hint {
  font-size: 0.72rem;
  color: var(--text-muted, #6b7280);
}

.decision-actions {
  display: flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}

.message {
  margin-top: 0.6rem;
  color: var(--primary-color, #058526);
  font-weight: 500;
}

.message.error {
  color: #dc2626;
}

.placeholder {
  text-align: center;
  color: var(--text-muted, #6b7280);
  padding: 3rem 1rem;
}

.btn {
  padding: 0.55rem 1.1rem;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.btn-sm {
  padding: 0.35rem 0.7rem;
  font-size: 0.85rem;
}

.btn-primary {
  background: var(--primary-color, #058526);
  color: #fff;
}

.btn-outline {
  background: transparent;
  border: 1px solid var(--border-color, #d1e7dd);
  color: var(--text-primary, #111827);
}

.btn-danger {
  background: #fee2e2;
  color: #991b1b;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .review-layout {
    grid-template-columns: 1fr;
  }
}
</style>
