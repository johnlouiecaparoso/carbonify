<template>
  <div class="checklist">
    <div class="checklist-head">
      <h4 class="checklist-title">
        <span class="material-symbols-outlined" aria-hidden="true">checklist</span>
        Validation Rubric
      </h4>
      <span class="progress-pill" :class="{ complete: progress.done === progress.total }">
        {{ progress.done }}/{{ progress.total }} required
      </span>
    </div>

    <div v-if="loading" class="checklist-state">Loading rubric…</div>

    <template v-else>
      <!-- Overall weighted score -->
      <div class="score-card" :style="{ background: bandMeta.bg, borderColor: bandMeta.color }">
        <div class="score-figure" :style="{ color: bandMeta.color }">
          {{ score.percent }}<span class="score-pct">%</span>
        </div>
        <div class="score-meta">
          <span class="score-band" :style="{ color: bandMeta.color }">{{ bandMeta.label }}</span>
          <span class="score-detail">
            Weighted score {{ score.earned }}/{{ score.possible }} ·
            {{ score.requiredPassed }}/{{ score.requiredTotal }} required passed
          </span>
        </div>
      </div>

      <div v-for="section in sections" :key="section.section" class="checklist-section">
        <h5 class="section-title">{{ section.section }}</h5>
        <div v-for="item in section.items" :key="item.key" class="check-item">
          <div class="check-label">
            <span class="item-text">
              {{ item.label }}
              <span v-if="item.required" class="req">required</span>
              <span class="weight" title="Weight in the overall score">×{{ item.weight }}</span>
            </span>
            <div class="level-group" role="radiogroup" :aria-label="item.label">
              <button
                v-for="lvl in levels"
                :key="lvl.value"
                type="button"
                class="level-btn"
                :class="{ active: scoreOf(item.key) === lvl.value }"
                :style="scoreOf(item.key) === lvl.value ? { background: lvl.color, borderColor: lvl.color } : {}"
                @click="setScore(item.key, lvl.value)"
              >
                {{ lvl.label }}
              </button>
            </div>
          </div>
          <input
            class="note-input"
            type="text"
            placeholder="Note (optional)"
            :value="noteFor(item.key)"
            @input="setNote(item.key, $event)"
          />
        </div>
      </div>

      <div class="checklist-actions">
        <button class="save-btn" :disabled="saving" @click="save">
          {{ saving ? 'Saving…' : 'Save rubric' }}
        </button>
        <span v-if="msg" class="msg" :class="msg.type">{{ msg.text }}</span>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import {
  CHECKLIST_SECTIONS,
  RUBRIC_LEVELS,
  PASS_SCORE,
  BAND_META,
  requiredProgress,
  rubricScore,
  itemScore,
} from '@/constants/verificationChecklist'
import { getAssessment, saveAssessment } from '@/services/verificationService'

const props = defineProps({
  projectId: { type: String, required: true },
})

const emit = defineEmits(['progress'])

const sections = CHECKLIST_SECTIONS
const levels = RUBRIC_LEVELS
const checklist = ref({})
const loading = ref(true)
const saving = ref(false)
const msg = ref(null)

const progress = computed(() => requiredProgress(checklist.value))
const score = computed(() => rubricScore(checklist.value))
const bandMeta = computed(() => BAND_META[score.value.band] || BAND_META.none)

// Surface rubric completion to the parent (ProjectApprovalPanel) so it can warn
// before a project is validated with required items still unassessed.
const status = computed(() => ({
  requiredDone: progress.value.done,
  requiredTotal: progress.value.total,
  percent: score.value.percent,
  band: score.value.band,
  complete: progress.value.total > 0 && progress.value.done === progress.value.total,
}))
watch(status, (v) => emit('progress', v), { immediate: true, deep: true })

function scoreOf(key) {
  return itemScore(checklist.value, key)
}
function noteFor(key) {
  return checklist.value?.[key]?.note || ''
}
function ensure(key) {
  if (!checklist.value[key]) checklist.value[key] = { checked: false, note: '', score: 0 }
}
function setScore(key, value) {
  ensure(key)
  // Toggle off if the same level is clicked again.
  const next = checklist.value[key].score === value ? 0 : value
  checklist.value[key].score = next
  // Keep `checked` in sync so pass/fail helpers and older readers still work.
  checklist.value[key].checked = next >= PASS_SCORE
}
function setNote(key, e) {
  ensure(key)
  checklist.value[key].note = e.target.value
}

async function load() {
  loading.value = true
  msg.value = null
  checklist.value = await getAssessment(props.projectId)
  loading.value = false
}

async function save() {
  saving.value = true
  msg.value = null
  try {
    await saveAssessment(props.projectId, checklist.value)
    msg.value = { type: 'ok', text: 'Rubric saved.' }
  } catch (err) {
    msg.value = { type: 'error', text: err.message }
  } finally {
    saving.value = false
  }
}

onMounted(load)
watch(() => props.projectId, load)
</script>

<style scoped>
.checklist {
  margin-top: 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 1rem;
  background: #fcfcfd;
}
.checklist-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.checklist-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0;
  font-size: 0.95rem;
}
.progress-pill {
  font-size: 0.72rem;
  font-weight: 700;
  background: #fef3c7;
  color: #92400e;
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
}
.progress-pill.complete {
  background: #ecfdf5;
  color: #047857;
}
.checklist-state {
  color: #9ca3af;
  font-size: 0.85rem;
}
.score-card {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  border: 1px solid;
  border-radius: 10px;
  padding: 0.7rem 0.9rem;
  margin-bottom: 1rem;
}
.score-figure {
  font-size: 1.8rem;
  font-weight: 800;
  line-height: 1;
}
.score-pct {
  font-size: 0.9rem;
  font-weight: 700;
  margin-left: 1px;
}
.score-meta {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.score-band {
  font-size: 0.85rem;
  font-weight: 700;
}
.score-detail {
  font-size: 0.74rem;
  color: #6b7280;
}
.checklist-section {
  margin-bottom: 0.9rem;
}
.section-title {
  margin: 0 0 0.4rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #6b7280;
}
.check-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem 0;
  flex-wrap: wrap;
  border-top: 1px solid #f3f4f6;
}
.check-label {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.875rem;
  flex: 1;
  min-width: 240px;
}
.item-text {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.req {
  font-size: 0.65rem;
  font-weight: 700;
  color: #b45309;
  background: #fef3c7;
  border-radius: 999px;
  padding: 0.02rem 0.4rem;
}
.weight {
  font-size: 0.65rem;
  font-weight: 700;
  color: #4b5563;
  background: #f3f4f6;
  border-radius: 999px;
  padding: 0.02rem 0.4rem;
}
.level-group {
  display: inline-flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}
.level-btn {
  padding: 0.25rem 0.6rem;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  color: #4b5563;
  font: inherit;
  font-size: 0.74rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s,
    border-color 0.12s;
}
.level-btn.active {
  color: #fff;
}
.note-input {
  flex: 1;
  min-width: 160px;
  padding: 0.35rem 0.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  font: inherit;
  font-size: 0.8rem;
}
.checklist-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
}
.save-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 8px;
  background: #058526;
  color: #fff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.msg {
  font-size: 0.8rem;
}
.msg.ok {
  color: #047857;
}
.msg.error {
  color: #dc2626;
}
</style>
