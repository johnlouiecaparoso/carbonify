<template>
  <div class="lgu-page">
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">LGU Tools</h1>
        <p class="page-description">
          Municipal solid waste emissions, diversion tracking, city ESG, and project
          endorsements.
        </p>
      </div>
    </div>

    <div class="lgu-content">
      <div class="container">
        <div class="tabs">
          <button
            v-for="t in tabs"
            :key="t.id"
            class="tab"
            :class="{ active: activeTab === t.id }"
            @click="activeTab = t.id"
          >
            {{ t.label }}
          </button>
        </div>

        <!-- Jurisdiction. Project lists are scoped to it, so an LGU that has not
             set one is told its lists are unscoped rather than being left to
             assume a filter is applied. -->
        <div v-if="jurisdictionLoaded && jurisdictionLabel" class="jurisdiction-bar">
          <span class="material-symbols-outlined" aria-hidden="true">location_city</span>
          <span>Jurisdiction: <strong>{{ jurisdictionLabel }}</strong></span>
          <router-link to="/profile" class="jurisdiction-link">Change</router-link>
        </div>
        <!-- Unreadable is not the same as unset: telling an LGU that HAS a
             municipality to go and set one sends them to a profile page that
             already has it filled in. -->
        <div v-else-if="jurisdictionLoaded && jurisdictionUnknown" class="jurisdiction-bar warn">
          <span class="material-symbols-outlined" aria-hidden="true">help</span>
          <span>
            <strong>We couldn't read your jurisdiction.</strong>
            Lists below are unscoped as a result, and endorsing a project outside your municipality
            will be refused. This is a problem on our side, not a missing setting.
          </span>
          <button class="jurisdiction-link" @click="loadJurisdiction">Try again</button>
        </div>
        <div v-else-if="jurisdictionLoaded" class="jurisdiction-bar warn">
          <span class="material-symbols-outlined" aria-hidden="true">warning</span>
          <span>
            <strong>No jurisdiction set.</strong>
            Projects and endorsements are showing for every municipality. Set yours so this
            dashboard shows only the projects you are responsible for.
          </span>
          <router-link to="/profile" class="jurisdiction-link">Set it</router-link>
        </div>

        <!-- MSW Calculator -->
        <section v-if="activeTab === 'calculator'" class="panel">
          <h2>Municipal Solid Waste Emissions Calculator</h2>
          <p class="panel-sub">
            Estimate landfill methane emissions and the impact of diverting waste from
            disposal.
          </p>

          <div class="form-grid">
            <div class="form-group">
              <label class="form-label" for="lgu-municipality">Municipality / City</label>
              <input id="lgu-municipality" v-model="calc.municipality" class="form-input" placeholder="e.g., Cabanatuan City" />
            </div>
            <div class="form-group">
              <label class="form-label" for="lgu-period">Reporting period</label>
              <input id="lgu-period" v-model="calc.periodLabel" class="form-input" placeholder="e.g., 2026 or 2026 Q1" />
            </div>
            <div class="form-group">
              <label class="form-label" for="lgu-population">Population (optional)</label>
              <input id="lgu-population" v-model.number="calc.population" type="number" min="0" class="form-input" @input="suggestWaste" />
            </div>
            <div class="form-group">
              <label class="form-label" for="lgu-generated">Waste generated (tonnes/period)</label>
              <input id="lgu-generated" v-model.number="calc.wasteGenerated" type="number" min="0" step="any" class="form-input" />
              <span v-if="suggested" class="hint">Estimated from population: {{ suggested }} t/yr</span>
            </div>
            <div class="form-group">
              <label class="form-label" for="lgu-diverted">Waste diverted (tonnes)</label>
              <input id="lgu-diverted" v-model.number="calc.wasteDiverted" type="number" min="0" step="any" class="form-input" />
            </div>
          </div>

          <div class="results">
            <div class="result-card">
              <span class="result-label">Baseline emissions</span>
              <strong>{{ fmt(result.baseline) }} t CO₂e</strong>
            </div>
            <div class="result-card highlight">
              <span class="result-label">Avoided by diversion</span>
              <strong>{{ fmt(result.avoided) }} t CO₂e</strong>
            </div>
            <div class="result-card">
              <span class="result-label">Net emissions</span>
              <strong>{{ fmt(result.net) }} t CO₂e</strong>
            </div>
            <div class="result-card">
              <span class="result-label">Diversion rate</span>
              <strong>{{ result.diversionRate.toFixed(1) }}%</strong>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="lgu-notes">Notes (optional)</label>
            <textarea id="lgu-notes" v-model="calc.notes" class="form-textarea" rows="2"></textarea>
          </div>

          <!-- Supporting evidence. These figures become City ESG claims and get
               exported for a council or DENR/CCC, so the hauler logs and MRF
               records behind them belong on the record. -->
          <div class="form-group">
            <label class="form-label" for="lgu-evidence">Supporting documents (optional)</label>
            <input
              id="lgu-evidence"
              ref="docInput"
              type="file"
              class="form-input"
              accept="application/pdf,image/*,.csv,.xlsx"
              multiple
              @change="onDocsSelected"
            />
            <span class="hint">
              Hauler logs, MRF records, weighbridge tickets — anything that backs these
              tonnages. Max 2MB each.
            </span>
            <p v-if="docError" class="message error">{{ docError }}</p>
            <ul v-if="pendingDocs.length" class="doc-list">
              <li v-for="(d, i) in pendingDocs" :key="i">
                <span class="material-symbols-outlined" aria-hidden="true">description</span>
                <span class="doc-name">{{ d.name }}</span>
                <span class="doc-size">{{ (d.size / 1024).toFixed(0) }} KB</span>
                <button type="button" class="link-danger" @click="removePendingDoc(i)">Remove</button>
              </li>
            </ul>
          </div>

          <p v-if="message" class="message" :class="{ error: isError }">{{ message }}</p>
          <button class="btn btn-primary" @click="saveRecord" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save Record' }}
          </button>
        </section>

        <!-- Land-use carbon modeling -->
        <section v-else-if="activeTab === 'landuse'" class="panel">
          <h2>Land-Use Carbon Modeling</h2>
          <p class="panel-sub">
            Estimate annual CO₂e sequestration from restoration and land-use across your
            jurisdiction. Planning estimates only — actual credits are issued through the MRV
            pipeline, never these round factors.
          </p>

          <div class="landuse-parcels">
            <div v-for="(p, i) in landParcels" :key="p.id" class="landuse-row">
              <div class="form-group">
                <label class="form-label" :for="`lu-type-${i}`">Land-use type</label>
                <select :id="`lu-type-${i}`" v-model="p.type" class="form-input">
                  <option v-for="t in LAND_USE_TYPES" :key="t.value" :value="t.value">
                    {{ t.label }} ({{ t.seqPerHa }} t/ha/yr)
                  </option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" :for="`lu-ha-${i}`">Area (hectares)</label>
                <input
                  :id="`lu-ha-${i}`"
                  v-model.number="p.hectares"
                  type="number"
                  min="0"
                  step="any"
                  class="form-input"
                />
              </div>
              <button
                v-if="landParcels.length > 1"
                type="button"
                class="link-danger lu-remove"
                @click="removeParcel(i)"
              >
                Remove
              </button>
            </div>
          </div>

          <div class="landuse-controls">
            <div class="form-group lu-years">
              <label class="form-label" for="lu-years">Horizon (years)</label>
              <input id="lu-years" v-model.number="landYears" type="number" min="1" step="1" class="form-input" />
            </div>
            <button type="button" class="btn btn-outline" @click="addParcel">+ Add parcel</button>
          </div>

          <div class="results">
            <div class="result-card">
              <span class="result-label">Total area</span>
              <strong>{{ fmt(landResult.hectares) }} ha</strong>
            </div>
            <div class="result-card highlight">
              <span class="result-label">Annual sequestration</span>
              <strong>{{ fmt(landResult.annual) }} t CO₂e/yr</strong>
            </div>
            <div class="result-card">
              <span class="result-label">Over {{ landResult.years }} year(s)</span>
              <strong>{{ fmt(landResult.total) }} t CO₂e</strong>
            </div>
          </div>

          <p class="hint">
            Factors are Tier-1 approximations (IPCC / tropical &amp; PH literature) for planning
            only, not for credit issuance.
          </p>
        </section>

        <!-- Records & diversion -->
        <section v-else-if="activeTab === 'records'" class="panel">
          <h2>Records & Waste Diversion</h2>
          <div v-if="loadingRecords" class="muted">Loading…</div>
          <div v-else-if="recordsError" class="load-error">
            {{ recordsError }} <button class="link-btn" @click="loadRecords">Retry</button>
          </div>
          <div v-else-if="records.length === 0" class="muted">No records yet. Use the calculator to add one.</div>
          <div v-else class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Municipality</th>
                <th>Generated (t)</th>
                <th>Diverted (t)</th>
                <th>Diversion %</th>
                <th>Net t CO₂e</th>
                <th>Evidence</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in records" :key="r.id">
                <td>{{ r.period_label || '—' }}</td>
                <td>{{ r.municipality || '—' }}</td>
                <td>{{ fmt(r.waste_generated_tonnes) }}</td>
                <td>{{ fmt(r.waste_diverted_tonnes) }}</td>
                <td>{{ diversionPct(r) }}%</td>
                <td>{{ fmt(r.net_emissions_tco2e) }}</td>
                <td>
                  <template v-if="r.documents?.length">
                    <a
                      v-for="(d, i) in r.documents"
                      :key="i"
                      :href="d.url"
                      target="_blank"
                      rel="noopener"
                      class="doc-chip"
                      :title="d.name"
                    >
                      <span class="material-symbols-outlined" aria-hidden="true">attach_file</span>
                      {{ d.name }}
                    </a>
                  </template>
                  <span v-else class="muted">—</span>
                </td>
                <td><button class="link-danger" @click="removeRecord(r.id)">Delete</button></td>
              </tr>
            </tbody>
          </table>
          </div>
        </section>

        <!-- City ESG -->
        <section v-else-if="activeTab === 'esg'" class="panel">
          <div class="esg-header">
            <div>
              <h2>City ESG Summary</h2>
              <p class="panel-sub">Aggregated environmental performance across all saved records.</p>
            </div>
            <div class="esg-export" v-if="esg.recordCount > 0">
              <button class="btn btn-sm btn-outline" @click="exportCsv">Export CSV</button>
              <button class="btn btn-sm btn-primary" :disabled="exporting" @click="exportPdf">
                {{ exporting ? 'Generating…' : 'Export PDF' }}
              </button>
            </div>
          </div>
          <div class="esg-grid">
            <div class="esg-card">
              <span>Total waste generated</span>
              <strong>{{ fmt(esg.generated) }} t</strong>
            </div>
            <div class="esg-card">
              <span>Total waste diverted</span>
              <strong>{{ fmt(esg.diverted) }} t</strong>
            </div>
            <div class="esg-card highlight">
              <span>Overall diversion rate</span>
              <strong>{{ esg.diversionRate.toFixed(1) }}%</strong>
            </div>
            <div class="esg-card highlight">
              <span>Total emissions avoided</span>
              <strong>{{ fmt(esg.avoided) }} t CO₂e</strong>
            </div>
            <div class="esg-card">
              <span>Net emissions</span>
              <strong>{{ fmt(esg.net) }} t CO₂e</strong>
            </div>
            <div class="esg-card">
              <span>Records</span>
              <strong>{{ esg.recordCount }}</strong>
            </div>
          </div>

          <div v-if="esg.recordCount > 0" class="esg-trend">
            <h3 class="trend-title">Emissions Trend by Period</h3>
            <PortfolioChart :data="trendChartData" :options="trendChartOptions" />
          </div>
          <p v-else class="muted">Save emissions records to see the city ESG summary and trend.</p>
        </section>

        <!-- Projects in my area — role-needs #4. Endorsement only ever listed
             VALIDATED projects, so an LGU could not see what was happening in
             its own municipality until after the fact. -->
        <section v-else-if="activeTab === 'projects'" class="panel">
          <h2>Projects in My Area</h2>
          <p class="panel-sub">
            Every carbon project registered in your municipality, at any stage of review.
          </p>

          <div v-if="loadingArea" class="muted">Loading…</div>
          <div v-else-if="areaError" class="load-error">
            {{ areaError }} <button class="link-btn" @click="loadAreaProjects">Retry</button>
          </div>
          <div v-else-if="!areaProjects.length" class="muted">
            No projects registered in your area yet.
          </div>

          <template v-else>
            <div class="esg-grid">
              <div class="esg-card">
                <span>Projects</span>
                <strong>{{ areaSummary.total }}</strong>
              </div>
              <div class="esg-card">
                <span>In review</span>
                <strong>{{ areaSummary.inReview }}</strong>
              </div>
              <div class="esg-card highlight">
                <span>Validated</span>
                <strong>{{ areaSummary.validated }}</strong>
              </div>
              <div class="esg-card highlight">
                <span>Endorsed by you</span>
                <strong>{{ areaSummary.endorsedByMe }}</strong>
              </div>
              <div class="esg-card">
                <span>Estimated credits</span>
                <strong>{{ fmt(areaSummary.estimatedCredits) }}</strong>
              </div>
            </div>

            <div class="table-scroll">
              <table class="data-table stack-on-mobile">
                <thead>
                  <tr>
                    <th>Project</th>
                    <th>Category</th>
                    <th>Barangay</th>
                    <th>Status</th>
                    <th class="num">Est. credits</th>
                    <th>Your endorsement</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in areaProjects" :key="p.id">
                    <td data-label="Project">
                      <router-link :to="`/projects/${p.id}`" class="proj-link">{{ p.title }}</router-link>
                    </td>
                    <td data-label="Category">{{ p.category || '—' }}</td>
                    <td data-label="Barangay">{{ p.barangay || '—' }}</td>
                    <td data-label="Status">
                      <span class="status-pill" :class="p.status">{{ statusLabel(p.status) }}</span>
                    </td>
                    <td class="num" data-label="Est. credits">{{ fmt(p.estimated_credits) }}</td>
                    <td data-label="Your endorsement">
                      <span v-if="p.my_endorsement" class="status-pill" :class="p.my_endorsement.decision">
                        {{ p.my_endorsement.decision }}
                      </span>
                      <span v-else class="muted">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </section>

        <!-- Endorsements -->
        <section v-else-if="activeTab === 'endorsements'" class="panel">
          <h2>Project Host Endorsements</h2>
          <p class="panel-sub">Endorse validated community projects in your jurisdiction.</p>
          <div v-if="loadingProjects" class="muted">Loading projects…</div>
          <div v-else-if="projectsError" class="load-error">
            {{ projectsError }} <button class="link-btn" @click="loadProjects">Retry</button>
          </div>
          <div v-else-if="communityProjects.length === 0" class="muted">No validated projects to review.</div>
          <template v-else>
            <p v-if="endorseMessage" class="message" :class="{ error: endorseError }">{{ endorseMessage }}</p>
            <div class="endorse-list">
              <div v-for="p in communityProjects" :key="p.id" class="endorse-card">
                <div class="endorse-info">
                  <span class="endorse-title">{{ p.title }}</span>
                  <span class="endorse-meta">{{ p.category }} · {{ p.location }}</span>
                  <span class="endorse-count">{{ p.endorsement_count }} endorsement(s)</span>
                  <router-link :to="`/projects/${p.id}`" class="endorse-view">
                    Review project details →
                  </router-link>
                </div>
                <div class="endorse-decide">
                  <textarea
                    v-model="endorseNotes[p.id]"
                    class="endorse-notes"
                    rows="2"
                    placeholder="Optional note / rationale for this decision"
                  ></textarea>
                  <div class="endorse-actions">
                    <span v-if="p.my_endorsement" class="my-decision" :class="p.my_endorsement.decision">
                      You {{ p.my_endorsement.decision }}
                    </span>
                    <button class="btn btn-sm btn-primary" @click="decide(p, 'endorsed')" :disabled="busyId === p.id">
                      Endorse
                    </button>
                    <button class="btn btn-sm btn-outline" @click="decide(p, 'declined')" :disabled="busyId === p.id">
                      Decline
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </section>

        <!-- Endorsement record — decisions already made -->
        <section v-else-if="activeTab === 'record'" class="panel">
          <h2>Endorsement Record</h2>
          <p class="panel-sub">
            Every project this office has endorsed or declined. An endorsement is one of the nine
            documents a carbon project submits, so this is the list your council or an auditor will
            ask you for.
          </p>

          <div v-if="loadingHistory" class="muted">Loading your endorsement record…</div>

          <div v-else-if="historyError" class="load-error">
            {{ historyError }}
            <button class="link-btn" @click="loadEndorsementHistory">Retry</button>
          </div>

          <div v-else-if="!endorsementHistory.length" class="muted">
            This office has not endorsed or declined any project yet. Decisions you make under
            <strong>Endorsements</strong> appear here.
          </div>

          <template v-else>
            <div class="record-cards">
              <div class="record-card">
                <span class="record-label">Decisions</span>
                <span class="record-value">{{ endorsementSummary.total }}</span>
              </div>
              <div class="record-card">
                <span class="record-label">Endorsed</span>
                <span class="record-value good">{{ endorsementSummary.endorsed }}</span>
              </div>
              <div class="record-card">
                <span class="record-label">Declined</span>
                <span class="record-value bad">{{ endorsementSummary.declined }}</span>
              </div>
              <div class="record-card">
                <span class="record-label">Later revised</span>
                <span class="record-value warn">{{ endorsementSummary.revised }}</span>
              </div>
            </div>

            <p class="record-range">
              {{ formatDecisionDate(endorsementSummary.firstAt) }} —
              {{ formatDecisionDate(endorsementSummary.lastAt) }}
            </p>

            <CollapsibleList
              :count="endorsementHistory.length"
              :visible="6"
              row-selector=".record-row"
            >
              <ul class="record-list">
                <li v-for="e in endorsementHistory" :key="e.id" class="record-row">
                  <span class="record-pill" :class="e.decision">{{ e.decision }}</span>
                  <div class="record-body">
                    <router-link :to="`/projects/${e.projectId}`" class="record-title">
                      {{ e.projectTitle }}
                    </router-link>
                    <span class="record-meta">
                      <template v-if="e.projectCategory">{{ e.projectCategory }} · </template>
                      <template v-if="e.projectLocation">{{ e.projectLocation }} · </template>
                      {{ formatDecisionDate(e.decidedAt) }}
                      <!-- A reversed endorsement is the most consequential thing
                           that can happen to one; showing only one timestamp
                           would hide it. -->
                      <template v-if="e.revised">
                        · revised {{ formatDecisionDate(e.updatedAt) }}
                      </template>
                    </span>
                    <p v-if="e.notes" class="record-note">{{ e.notes }}</p>
                  </div>
                </li>
              </ul>
            </CollapsibleList>
          </template>
        </section>
      </div>
    </div>

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
import { ref, reactive, computed, watch } from 'vue'
import { useUserStore } from '@/store/userStore'
import {
  computeWasteEmissions,
  estimateWasteFromPopulation,
  LAND_USE_TYPES,
  computeLandUseSequestration,
} from '@/constants/lgu'
import {
  saveEmissionsRecord,
  getMyEmissionsRecords,
  deleteEmissionsRecord,
  buildEsgSummary,
  MAX_LGU_DOC_BYTES,
} from '@/services/lguService'
import {
  emissionsTrendChartData,
  exportLguEsgCsv,
  exportLguEsgPdf,
} from '@/services/lguReportService'
import {
  getCommunityProjects,
  endorseProject,
  getMyJurisdiction,
  getJurisdictionProjects,
  summariseJurisdictionProjects,
  getMyEndorsementHistory,
  summariseEndorsements,
} from '@/services/endorsementService'
import CollapsibleList from '@/components/ui/CollapsibleList.vue'
import { useModernPrompt } from '@/composables/useModernPrompt'
import ModernPrompt from '@/components/ui/ModernPrompt.vue'
import PortfolioChart from '@/components/charts/PortfolioChart.vue'

const userStore = useUserStore()

const tabs = [
  { id: 'calculator', label: 'MSW Calculator' },
  { id: 'landuse', label: 'Land Use' },
  { id: 'records', label: 'Records & Diversion' },
  { id: 'esg', label: 'City ESG' },
  { id: 'projects', label: 'Projects in My Area' },
  { id: 'endorsements', label: 'Endorsements' },
  // Separate from the tab above on purpose. "Endorsements" is a queue — projects
  // awaiting a decision. This is the record of decisions already made, which is
  // what a council, an auditor or an incoming officer asks for. Merging them
  // would bury the record under the work.
  { id: 'record', label: 'Endorsement Record' },
]
const activeTab = ref('calculator')

// ── Land-use carbon modeling (planning estimates) ──────────────────────────
// Each parcel carries its own id: keying the v-for by array index makes Vue
// reuse the removed row's inputs for the parcel that shifts up into its slot.
let parcelSeq = 0
function newParcel() {
  parcelSeq += 1
  return { id: parcelSeq, type: 'reforestation', hectares: 0 }
}
const landParcels = ref([newParcel()])
const landYears = ref(10)
const landResult = computed(() => computeLandUseSequestration(landParcels.value, landYears.value))
function addParcel() {
  landParcels.value.push(newParcel())
}
function removeParcel(i) {
  landParcels.value.splice(i, 1)
}

// The LGU's declared jurisdiction. Everything project-related is scoped to it;
// when it is unset the lists are unscoped and the banner says so rather than
// implying a filter that is not being applied.
const jurisdiction = ref(null)
const jurisdictionLoaded = ref(false)

// Three states, not two: declared, genuinely undeclared, and unreadable. The
// first two drive whether project lists are scoped; the third must not be
// silently folded into "undeclared", which would unscope the lists and offer
// endorsements the database will refuse.
const jurisdictionUnknown = ref(false)

async function loadJurisdiction() {
  try {
    jurisdiction.value = await getMyJurisdiction()
    jurisdictionUnknown.value = false
  } catch (err) {
    console.error('Could not read jurisdiction:', err)
    jurisdiction.value = null
    jurisdictionUnknown.value = true
  } finally {
    jurisdictionLoaded.value = true
  }
}

const jurisdictionLabel = computed(() =>
  jurisdiction.value
    ? [jurisdiction.value.municipality, jurisdiction.value.province].filter(Boolean).join(', ')
    : null,
)

const calc = reactive({
  municipality: '',
  periodLabel: '',
  population: null,
  wasteGenerated: null,
  wasteDiverted: null,
  notes: '',
})
const saving = ref(false)
const message = ref('')
const isError = ref(false)
const suggested = ref('')

// Supporting documents staged for the next saved record.
const pendingDocs = ref([])
const docError = ref('')
const docInput = ref(null)

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`))
    reader.readAsDataURL(file)
  })
}

async function onDocsSelected(event) {
  docError.value = ''
  const files = Array.from(event.target.files || [])
  for (const file of files) {
    if (file.size > MAX_LGU_DOC_BYTES) {
      docError.value = `"${file.name}" is larger than 2MB and was skipped.`
      continue
    }
    try {
      pendingDocs.value.push({
        name: file.name,
        type: file.type,
        size: file.size,
        url: await readAsDataUrl(file),
        uploaded_at: new Date().toISOString(),
      })
    } catch (err) {
      docError.value = err.message
    }
  }
  // Let the same file be re-picked after removing it.
  if (docInput.value) docInput.value.value = ''
}

function removePendingDoc(index) {
  pendingDocs.value.splice(index, 1)
}

const result = computed(() => computeWasteEmissions(calc.wasteGenerated, calc.wasteDiverted))

const records = ref([])
const loadingRecords = ref(false)
const esg = computed(() => buildEsgSummary(records.value))
const exporting = ref(false)

const trendChartData = computed(() => emissionsTrendChartData(records.value))
const trendChartOptions = {
  plugins: { title: { display: false } },
  scales: {
    y: {
      beginAtZero: true,
      ticks: { callback: (value) => `${Number(value).toLocaleString()} t` },
    },
  },
}

function reportMeta() {
  // Prefer the municipality from the most recent record; fall back to the form.
  return { municipality: records.value[0]?.municipality || calc.municipality || 'LGU' }
}

function exportCsv() {
  exportLguEsgCsv(records.value, reportMeta())
}

async function exportPdf() {
  exporting.value = true
  try {
    await exportLguEsgPdf(records.value, reportMeta())
  } catch (err) {
    console.error('LGU ESG PDF export failed:', err)
  } finally {
    exporting.value = false
  }
}

const {
  promptState,
  confirm: confirmPrompt,
  error: showErrorPrompt,
  handleConfirm,
  handleCancel,
  handleClose,
} = useModernPrompt()

// Every project in this jurisdiction, at any stage — the "track community
// projects" capability endorsement alone never gave, since it only ever listed
// validated ones.
const areaProjects = ref([])
const loadingArea = ref(false)
const areaError = ref('')
const areaLoaded = ref(false)
const areaSummary = computed(() => summariseJurisdictionProjects(areaProjects.value))

async function loadAreaProjects() {
  loadingArea.value = true
  areaError.value = ''
  try {
    areaProjects.value = await getJurisdictionProjects()
  } catch (err) {
    areaError.value = err?.message || 'Could not load projects in your area.'
  } finally {
    loadingArea.value = false
    areaLoaded.value = true
  }
}

const communityProjects = ref([])
const loadingProjects = ref(false)
// Tracks "have we fetched", separate from "did we get rows". Keying the lazy
// load off list length re-queried on every tab switch whenever the result was
// legitimately empty.
const projectsLoaded = ref(false)
const recordsLoaded = ref(false)
const busyId = ref(null)
const endorseMessage = ref('')
const endorseError = ref(false)
const recordsError = ref('')
const projectsError = ref('')
const endorseNotes = ref({})

function fmt(n) {
  return (Number(n) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })
}
const STATUS_LABELS = {
  pending: 'Awaiting review',
  submitted: 'Awaiting review',
  in_review: 'Under review',
  under_review: 'Under review',
  needs_revision: 'Needs revision',
  validated: 'Validated',
  approved: 'Validated',
  rejected: 'Rejected',
}
function statusLabel(status) {
  return STATUS_LABELS[status] || status || 'Unknown'
}

function diversionPct(r) {
  const g = Number(r.waste_generated_tonnes) || 0
  const d = Number(r.waste_diverted_tonnes) || 0
  return g > 0 ? ((d / g) * 100).toFixed(1) : '0.0'
}
function suggestWaste() {
  suggested.value = calc.population ? estimateWasteFromPopulation(calc.population).toFixed(1) : ''
}

async function saveRecord() {
  message.value = ''
  isError.value = false
  if (!calc.wasteGenerated || calc.wasteGenerated <= 0) {
    message.value = 'Enter the waste generated (tonnes).'
    isError.value = true
    return
  }
  if (Number(calc.wasteDiverted) < 0) {
    message.value = 'Diverted waste cannot be negative.'
    isError.value = true
    return
  }
  if (Number(calc.wasteDiverted) > Number(calc.wasteGenerated)) {
    message.value = 'Diverted waste cannot exceed the waste generated. Please check your figures.'
    isError.value = true
    return
  }
  saving.value = true
  try {
    await saveEmissionsRecord({
      municipality: calc.municipality,
      periodLabel: calc.periodLabel,
      population: calc.population,
      wasteGenerated: calc.wasteGenerated,
      wasteDiverted: calc.wasteDiverted,
      notes: calc.notes,
      documents: pendingDocs.value,
    })
    message.value = pendingDocs.value.length
      ? `Record saved with ${pendingDocs.value.length} attachment(s).`
      : 'Record saved.'
    pendingDocs.value = []
    docError.value = ''
    await loadRecords()
  } catch (err) {
    message.value = err.message || 'Failed to save record'
    isError.value = true
  } finally {
    saving.value = false
  }
}

async function loadRecords() {
  loadingRecords.value = true
  recordsError.value = ''
  try {
    records.value = await getMyEmissionsRecords(userStore.session?.user?.id)
  } catch (err) {
    console.warn('Failed to load records:', err?.message)
    recordsError.value = err?.message || 'Could not load your records. Please try again.'
  } finally {
    loadingRecords.value = false
    recordsLoaded.value = true
  }
}

async function removeRecord(id) {
  const ok = await confirmPrompt({
    title: 'Delete this record?',
    message: 'The emissions figures for this period will be removed from your ESG totals.',
    confirmText: 'Delete',
  })
  if (!ok) return
  try {
    await deleteEmissionsRecord(id)
    await loadRecords()
  } catch (err) {
    // This was the last native alert() left in the app.
    await showErrorPrompt({
      title: 'Delete failed',
      message: err.message || 'Failed to delete record.',
    })
  }
}

async function loadProjects() {
  loadingProjects.value = true
  projectsError.value = ''
  try {
    communityProjects.value = await getCommunityProjects()
  } catch (err) {
    console.warn('Failed to load projects:', err?.message)
    projectsError.value = err?.message || 'Could not load projects. Please try again.'
  } finally {
    loadingProjects.value = false
    projectsLoaded.value = true
  }
}

async function decide(project, decision) {
  busyId.value = project.id
  endorseMessage.value = ''
  endorseError.value = false
  try {
    await endorseProject(project.id, decision, (endorseNotes.value[project.id] || '').trim())
    endorseMessage.value = `Project ${decision}.`
    delete endorseNotes.value[project.id]
    await loadProjects()
  } catch (err) {
    endorseMessage.value = err.message || 'Failed to record endorsement'
    endorseError.value = true
  } finally {
    busyId.value = null
  }
}

// ── Endorsement record ─────────────────────────────────────────────────────
// Every decision this LGU has already made. Read-only, and deliberately NOT
// scoped to the current jurisdiction: an officer whose municipality was later
// changed still endorsed what they endorsed, and hiding those rows would edit
// history rather than describe it.
const endorsementHistory = ref([])
const historyLoaded = ref(false)
const loadingHistory = ref(false)
// Distinct from an empty list: "this body has endorsed nothing" is a claim
// about a public record, and a failed read is not evidence for it.
const historyError = ref('')

const endorsementSummary = computed(() => summariseEndorsements(endorsementHistory.value))

async function loadEndorsementHistory() {
  loadingHistory.value = true
  historyError.value = ''
  try {
    endorsementHistory.value = await getMyEndorsementHistory()
    historyLoaded.value = true
  } catch (err) {
    console.error('Failed to load endorsement history:', err)
    endorsementHistory.value = []
    historyError.value = err?.message || 'We could not load your endorsement record.'
  } finally {
    loadingHistory.value = false
  }
}

function formatDecisionDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

// Lazy-load data when switching to a tab that needs it
watch(activeTab, (tab) => {
  if ((tab === 'records' || tab === 'esg') && !recordsLoaded.value) loadRecords()
  if (tab === 'endorsements' && !projectsLoaded.value) loadProjects()
  if (tab === 'projects' && !areaLoaded.value) loadAreaProjects()
  if (tab === 'record' && !historyLoaded.value) loadEndorsementHistory()
})

loadJurisdiction()
loadRecords()
</script>

<style scoped>
.lgu-page {
  min-height: 100vh;
  background: var(--bg-primary, #fff);
}

.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 0 2rem;
}

.page-header {
  background: var(--primary-color, #058526);
  color: #fff;
  padding: 1.25rem 0;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.5rem;
}

.page-description {
  margin: 0;
  opacity: 0.95;
}

.lgu-content {
  padding: 2rem 0;
}

.tabs {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.tab {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border-color, #d1e7dd);
  background: #fff;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
}

.tab.active {
  background: var(--primary-color, #058526);
  color: #fff;
  border-color: var(--primary-color, #058526);
}

.panel {
  background: #fff;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.75rem;
  padding: 1.5rem;
}

/* Jurisdiction banner ----------------------------------------------------- */
.jurisdiction-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 1rem;
  padding: 0.6rem 0.85rem;
  border-radius: 0.6rem;
  background: #f0f9f0;
  border: 1px solid var(--border-color, #d1e7dd);
  font-size: 0.88rem;
  color: #334155;
}

.jurisdiction-bar.warn {
  background: #fffbeb;
  border-color: #fde68a;
  color: #92400e;
}

.jurisdiction-bar .material-symbols-outlined {
  font-size: 1.1rem;
  flex: 0 0 auto;
}

/* Used as both a router-link and a plain button (retry), so the button's UA
   chrome is stripped to keep the two visually identical. */
.jurisdiction-link {
  margin-left: auto;
  font-weight: 600;
  color: inherit;
  text-decoration: underline;
  white-space: nowrap;
  background: none;
  border: none;
  padding: 0;
  font-size: inherit;
  font-family: inherit;
  cursor: pointer;
}

/* Supporting documents ---------------------------------------------------- */
.doc-list {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}

.doc-list li {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: #334155;
}

.doc-list .material-symbols-outlined {
  font-size: 1rem;
  color: #64748b;
}

.doc-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 22ch;
}

.doc-size {
  color: #64748b;
  font-size: 0.75rem;
  margin-left: auto;
}

.doc-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  margin: 0 0.25rem 0.2rem 0;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: #eef2f7;
  color: #334155;
  font-size: 0.72rem;
  text-decoration: none;
  max-width: 14ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.doc-chip .material-symbols-outlined {
  font-size: 0.8rem;
}

/* Project tracker --------------------------------------------------------- */
.status-pill {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  background: #f1f5f9;
  color: #475569;
  white-space: nowrap;
}

.status-pill.validated,
.status-pill.approved,
.status-pill.endorsed {
  background: #dcfce7;
  color: #166534;
}

.status-pill.rejected,
.status-pill.declined {
  background: #fee2e2;
  color: #991b1b;
}

.status-pill.needs_revision,
.status-pill.pending,
.status-pill.submitted {
  background: #fef3c7;
  color: #92400e;
}

.proj-link {
  color: var(--primary-color, #058526);
  font-weight: 600;
  text-decoration: none;
}

.data-table th.num,
.data-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.panel h2 {
  margin: 0 0 0.25rem;
  font-size: 1.3rem;
}

.panel-sub {
  color: var(--text-muted, #6b7280);
  margin: 0 0 1.25rem;
  font-size: 0.9rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin-bottom: 1.25rem;
}

/* Land-use modeling */
.landuse-parcels {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.landuse-row {
  display: grid;
  grid-template-columns: 2fr 1fr auto;
  gap: 1rem;
  align-items: end;
}
/* The grid gap spaces these fields; the global .form-group margin would add a
   second, invisible gutter under every row. */
.landuse-row .form-group,
.landuse-controls .form-group {
  margin-bottom: 0;
}
.lu-remove {
  height: 40px;
  white-space: nowrap;
}
.landuse-controls {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  flex-wrap: wrap;
  margin: 1rem 0 1.25rem;
}
.lu-years {
  width: 160px;
  flex-shrink: 0;
}
/* Bottom-aligned with the Horizon input next to it. */
.landuse-controls .btn {
  height: 40px;
  padding-top: 0;
  padding-bottom: 0;
}
@media (max-width: 640px) {
  .landuse-row {
    grid-template-columns: 1fr;
  }
  .lu-years {
    width: 100%;
  }
  .landuse-controls .btn {
    width: 100%;
  }
}

.form-group {
  margin-bottom: 1rem;
}

/* Grid already spaces fields via `gap`; drop the extra per-field margin so
   rows aren't doubly spaced. */
.form-grid .form-group {
  margin-bottom: 0;
}

.form-label {
  display: block;
  font-weight: 600;
  font-size: 0.85rem;
  margin-bottom: 0.4rem;
}

.form-input,
.form-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 0.6rem 0.85rem;
  border: 2px solid var(--border-color, #d1e7dd);
  border-radius: 0.5rem;
  font-size: 0.9rem;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: var(--primary-color, #058526);
}

.hint {
  font-size: 0.75rem;
  color: var(--text-muted, #6b7280);
}

/* Equal-width tiles on one grid, identical to .esg-grid. As a flex row with
   `space-between` the cards sized to their own text, so "Total area" and
   "Annual sequestration" rendered at different widths and drifted apart. */
.results {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.esg-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.esg-export {
  display: flex;
  gap: 0.5rem;
}

.esg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.esg-trend {
  margin-top: 1rem;
}

.trend-title {
  font-size: 1rem;
  margin: 0 0 0.75rem;
}

.result-card,
.esg-card {
  background: var(--bg-secondary, #f8fdf8);
  border: 1px solid var(--border-light, #e8f5e8);
  border-radius: 0.5rem;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.result-card.highlight,
.esg-card.highlight {
  background: var(--primary-light, #e8f5e8);
}

.result-label,
.esg-card span {
  font-size: 0.78rem;
  color: var(--text-muted, #6b7280);
}

.result-card strong,
.esg-card strong {
  font-size: 1.15rem;
  color: var(--primary-color, #058526);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.data-table th,
.data-table td {
  text-align: left;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--border-light, #e8f5e8);
}

.link-danger {
  background: none;
  border: none;
  color: #dc2626;
  cursor: pointer;
  font-size: 0.8rem;
}

.muted {
  color: var(--text-muted, #6b7280);
  font-size: 0.9rem;
}

.endorse-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.endorse-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  border: 1px solid var(--border-light, #e8f5e8);
  border-radius: 0.5rem;
  padding: 0.85rem 1rem;
}

.endorse-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.endorse-title {
  font-weight: 600;
}

.endorse-meta {
  font-size: 0.8rem;
  color: var(--text-muted, #6b7280);
}

.endorse-count {
  font-size: 0.75rem;
  color: var(--primary-color, #058526);
}

.endorse-view {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--primary-color, #058526);
  text-decoration: none;
  margin-top: 0.15rem;
}

.endorse-view:hover {
  text-decoration: underline;
}

.endorse-decide {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  align-items: flex-end;
  min-width: 240px;
}

.endorse-notes {
  width: 100%;
  resize: vertical;
  padding: 0.5rem 0.6rem;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 0.5rem;
  font: inherit;
  font-size: 0.82rem;
  box-sizing: border-box;
}

.endorse-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.table-scroll {
  width: 100%;
  overflow-x: auto;
}

.load-error {
  color: #991b1b;
  background: #fee2e2;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  font-size: 0.88rem;
}

.link-btn {
  background: none;
  border: none;
  color: #991b1b;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

/* ── Endorsement record ──────────────────────────────────────────────────── */
.record-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.record-card {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.7rem 0.85rem;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 12px;
  background: #f8fafc;
}

.record-label {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}

.record-value {
  font-size: 1.4rem;
  font-weight: 700;
  color: #0f172a;
}
.record-value.good {
  color: #047857;
}
.record-value.bad {
  color: #b91c1c;
}
.record-value.warn {
  color: #b45309;
}

.record-range {
  margin: 0 0 1rem;
  font-size: 0.78rem;
  color: #64748b;
}

.record-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.record-row {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  padding: 0.7rem 0;
  border-top: 1px solid #f1f5f9;
}
.record-row:first-child {
  border-top: none;
}

.record-pill {
  flex: 0 0 auto;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  background: #f1f5f9;
  color: #475569;
}
.record-pill.endorsed {
  background: #dcfce7;
  color: #166534;
}
.record-pill.declined {
  background: #fee2e2;
  color: #991b1b;
}

.record-body {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.record-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: #0f172a;
  text-decoration: none;
  overflow-wrap: anywhere;
}
.record-title:hover {
  color: var(--primary-color, #058526);
  text-decoration: underline;
}

.record-meta {
  font-size: 0.76rem;
  color: #64748b;
}

.record-note {
  margin: 0.2rem 0 0;
  font-size: 0.8rem;
  line-height: 1.45;
  color: #475569;
  overflow-wrap: anywhere;
}

.my-decision {
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: capitalize;
}

.my-decision.endorsed {
  color: #065f46;
}

.my-decision.declined {
  color: #991b1b;
}

.message {
  margin: 0.75rem 0;
  color: var(--primary-color, #058526);
  font-weight: 500;
}

.message.error {
  color: #dc2626;
}

.btn {
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
}

.btn-sm {
  padding: 0.4rem 0.8rem;
  font-size: 0.82rem;
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

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .container { padding: 0 1rem; }
  .endorse-card { flex-direction: column; align-items: flex-start; }
  .endorse-decide { align-items: stretch; min-width: 0; width: 100%; }
}
</style>
