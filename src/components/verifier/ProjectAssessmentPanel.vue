<template>
  <div class="assessment">
    <h4 class="assessment-title">
      <span class="material-symbols-outlined" aria-hidden="true">analytics</span>
      Risk & Feasibility Assessment
    </h4>
    <p class="assessment-sub">Optional scores shown to buyers to convey project quality.</p>

    <div class="assessment-grid">
      <div class="field">
        <label for="assess-feasibility">Feasibility (1–5)</label>
        <select id="assess-feasibility" v-model="feasibility" class="input">
          <option value="">—</option>
          <option v-for="n in 5" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>
      <div class="field">
        <label for="assess-social">Social impact (1–5)</label>
        <select id="assess-social" v-model="socialImpact" class="input">
          <option value="">—</option>
          <option v-for="n in 5" :key="n" :value="n">{{ n }}</option>
        </select>
      </div>
      <div class="field">
        <label for="assess-climate">Climate risk</label>
        <select id="assess-climate" v-model="climateRisk" class="input">
          <option value="">—</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
    </div>

    <p v-if="message" class="msg" :class="{ error: isError }">{{ message }}</p>
    <button class="save-btn" @click="save" :disabled="saving">
      {{ saving ? 'Saving…' : 'Save Assessment' }}
    </button>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { setProjectScores } from '@/services/projectService'

const props = defineProps({
  project: { type: Object, required: true },
})

const feasibility = ref('')
const socialImpact = ref('')
const climateRisk = ref('')
const saving = ref(false)
const message = ref('')
const isError = ref(false)

function syncFromProject(p) {
  feasibility.value = p?.feasibility_score ?? ''
  socialImpact.value = p?.social_impact_score ?? ''
  climateRisk.value = p?.climate_risk_rating ?? ''
  message.value = ''
}

watch(() => props.project?.id, () => syncFromProject(props.project), { immediate: true })

async function save() {
  saving.value = true
  message.value = ''
  isError.value = false
  try {
    await setProjectScores(props.project.id, {
      feasibility_score: feasibility.value,
      social_impact_score: socialImpact.value,
      climate_risk_rating: climateRisk.value,
    })
    message.value = 'Assessment saved.'
  } catch (err) {
    message.value = err.message || 'Failed to save assessment'
    isError.value = true
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.assessment {
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.6rem;
  padding: 1rem;
  margin: 1rem 0;
  background: var(--bg-secondary, #f8fdf8);
}

.assessment-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0 0 0.2rem;
  font-size: 0.95rem;
}

.assessment-sub {
  margin: 0 0 0.75rem;
  font-size: 0.8rem;
  color: var(--text-muted, #6b7280);
}

.assessment-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 0.75rem;
}

.field label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.input {
  width: 100%;
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.4rem;
  font-size: 0.85rem;
}

.msg {
  font-size: 0.82rem;
  color: var(--primary-color, #058526);
  margin: 0 0 0.5rem;
}

.msg.error {
  color: #dc2626;
}

.save-btn {
  padding: 0.45rem 1rem;
  border: none;
  background: var(--primary-color, #058526);
  color: #fff;
  border-radius: 0.4rem;
  font-weight: 600;
  cursor: pointer;
  font-size: 0.85rem;
}

.save-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 600px) {
  .assessment-grid {
    grid-template-columns: 1fr;
  }
}
</style>
