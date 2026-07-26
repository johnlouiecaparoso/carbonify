<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { getInvestmentPipeline, documentCount } from '@/services/investorService'
import { getProjectDocuments, logAccess, formatSize } from '@/services/dataRoomService'
import { FEATURES } from '@/constants/plans'
import FeatureGate from '@/components/ui/FeatureGate.vue'
import CategoryChart from '@/components/charts/CategoryChart.vue'
import {
  methodologyLabel,
  developmentStatusLabel,
  DEVELOPMENT_STATUSES,
} from '@/constants/projectRegistry'

const loading = ref(true)
const loadError = ref('')
const projects = ref([])
const summary = ref(null)
const categoryFilter = ref('')
const methodologyFilter = ref('')
const stageFilter = ref('')
const detail = ref(null) // selected project for the financial modal

// Data room
const dataRoom = ref(null) // selected project
const dataRoomDocs = ref([])
const dataRoomLoading = ref(false)
const dataRoomError = ref('')

async function openDataRoom(project) {
  dataRoom.value = project
  dataRoomDocs.value = []
  dataRoomError.value = ''
  dataRoomLoading.value = true
  try {
    dataRoomDocs.value = await getProjectDocuments(project)
  } catch (err) {
    dataRoomError.value = err?.message || 'We could not open this data room.'
  } finally {
    dataRoomLoading.value = false
  }
}

/**
 * Log the access, then open. Logging is best-effort and deliberately not awaited
 * as a gate: a failed audit write must never stop an investor from reading a
 * document they're entitled to read.
 */
function openDocument(doc) {
  if (!doc?.url) return
  logAccess(dataRoom.value?.id, doc.label || doc.name, 'view')
  window.open(doc.url, '_blank', 'noopener')
}

function peso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function num(n) {
  return Number(n || 0).toLocaleString('en-PH')
}
function pct(v) {
  return v == null ? '—' : `${(v * 100).toFixed(1)}%`
}

const categories = computed(() => summary.value?.byCategory.map((c) => c.category) || [])

// Only offer standards actually present in the pipeline — an empty filter option
// is a dead end. Legacy free-text values appear under their raw label.
const methodologies = computed(() => {
  const seen = new Map()
  for (const p of projects.value) {
    if (!p.methodology) continue
    if (!seen.has(p.methodology)) seen.set(p.methodology, methodologyLabel(p.methodology))
  }
  return Array.from(seen, ([value, label]) => ({ value, label })).sort((a, b) =>
    a.label.localeCompare(b.label),
  )
})

const stages = computed(() => {
  const present = new Set(projects.value.map((p) => p.development_status).filter(Boolean))
  return DEVELOPMENT_STATUSES.filter((d) => present.has(d.value))
})

const filtered = computed(() =>
  projects.value.filter(
    (p) =>
      (!categoryFilter.value || p.category === categoryFilter.value) &&
      (!methodologyFilter.value || p.methodology === methodologyFilter.value) &&
      (!stageFilter.value || p.development_status === stageFilter.value),
  ),
)

const chartData = computed(() => {
  const cats = summary.value?.byCategory || []
  const palette = ['#058526', '#0ea5e9', '#f59e0b', '#8b5cf6', '#ef4444', '#14b8a6', '#eab308']
  return {
    labels: cats.map((c) => c.category),
    datasets: [{ data: cats.map((c) => c.grossRevenue), backgroundColor: cats.map((_, i) => palette[i % palette.length]) }],
  }
})
const chartOptions = { plugins: { title: { display: true, text: 'Pipeline value by category' } } }
const hasChart = computed(() => (summary.value?.byCategory.length || 0) > 0)

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await getInvestmentPipeline()
    projects.value = res.projects
    summary.value = res.summary
  } catch (err) {
    console.error('Failed to load investor pipeline:', err)
    loadError.value = err?.message || 'We could not load the investment pipeline right now.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="investor">
    <PageHeader
      title="Investor Portal"
      description="The validated project pipeline — credit supply, projected value, financial returns, and funding needs."
    />

    <div class="page-body">

    <FeatureGate
      :feature="FEATURES.INVESTOR_PORTAL"
      title="Investor Portal is a Pro feature"
      message="Upgrade to Pro to access the project pipeline, financial models (IRR/NPV), and funding data."
    >
      <div v-if="loading" class="muted">Loading pipeline…</div>

      <div v-else-if="loadError" class="notice error">
        <span class="material-symbols-outlined" aria-hidden="true">error</span>
        <div class="notice-body">
          <strong>Couldn't load the pipeline.</strong>
          {{ loadError }}
          <div><button class="retry-btn" @click="load">Try again</button></div>
        </div>
      </div>

      <template v-else-if="summary && summary.projects">
        <!-- Summary cards -->
        <section class="cards">
          <div class="card">
            <div class="card-label">Pipeline projects</div>
            <div class="card-value">{{ num(summary.projects) }}</div>
            <div class="muted small">{{ num(summary.credits) }} credits available</div>
          </div>
          <div class="card">
            <div class="card-label">Projected value</div>
            <div class="card-value">{{ peso(summary.totalRevenue) }}</div>
            <div class="muted small">
              <template v-if="summary.contractedRevenue > 0">
                {{ peso(summary.contractedRevenue) }} contracted ({{ pct(summary.contractedShare) }})
              </template>
              <template v-else>none contracted — all at listed prices</template>
            </div>
          </div>
          <div class="card">
            <div class="card-label">Funding gap</div>
            <div class="card-value">{{ peso(summary.fundingGap) }}</div>
            <div class="muted small">of {{ peso(summary.fundingTarget) }} sought</div>
          </div>
          <div class="card">
            <div class="card-label">Avg. modelled IRR</div>
            <div class="card-value">{{ pct(summary.avgIrr) }}</div>
            <div class="muted small">{{ num(summary.withFinancials) }} project(s) with financials</div>
          </div>
        </section>

        <section v-if="hasChart" class="chart-wrap">
          <div class="chart-card">
            <CategoryChart :data="chartData" :options="chartOptions" />
          </div>
        </section>

        <!-- Pipeline table -->
        <section class="panel">
          <div class="panel-head">
            <h2>Project pipeline</h2>
            <div class="filters">
              <select v-model="categoryFilter" class="filter" aria-label="Filter by category">
                <option value="">All categories</option>
                <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
              </select>
              <select
                v-if="methodologies.length"
                v-model="methodologyFilter"
                class="filter"
                aria-label="Filter by standard"
              >
                <option value="">All standards</option>
                <option v-for="m in methodologies" :key="m.value" :value="m.value">{{ m.label }}</option>
              </select>
              <select v-if="stages.length" v-model="stageFilter" class="filter" aria-label="Filter by stage">
                <option value="">All stages</option>
                <option v-for="s in stages" :key="s.value" :value="s.value">{{ s.label }}</option>
              </select>
            </div>
          </div>
          <div class="table-scroll">
            <table class="data-table stack-on-mobile">
              <thead>
                <tr>
                  <th>Project</th>
                  <th class="num">Credits</th>
                  <th class="num">Price</th>
                  <th class="num">Projected value</th>
                  <th class="num">Contracted</th>
                  <th class="num">IRR</th>
                  <th class="num">Funding gap</th>
                  <th class="num">Docs</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="p in filtered" :key="p.id">
                  <td data-label="Project">
                    <router-link :to="`/projects/${p.id}`" class="proj-link">{{ p.title }}</router-link>
                    <div class="muted small">
                      {{ p.category }}<span v-if="p.location"> · {{ p.location }}</span>
                      <span v-if="p.methodology"> · {{ methodologyLabel(p.methodology) }}</span>
                    </div>
                    <span v-if="p.development_status" class="stage-pill">
                      {{ developmentStatusLabel(p.development_status) }}
                    </span>
                  </td>
                  <td class="num" data-label="Credits">{{ num(p.estimated_credits) }}</td>
                  <td class="num" data-label="Price">{{ p.credit_price ? peso(p.credit_price) : '—' }}</td>
                  <td class="num" data-label="Projected value">
                    {{ peso(p.financials.totalRevenue) }}
                    <div v-if="p.financials.revenueBasis === 'blended'" class="muted small">blended</div>
                  </td>
                  <td class="num" data-label="Contracted">
                    <template v-if="p.financials.agreementCount > 0">
                      <span class="contracted">{{ pct(p.financials.contractedShare) }}</span>
                      <div class="muted small">{{ peso(p.financials.contractedRevenue) }}</div>
                      <div v-if="p.financials.overCommitted" class="over-flag" title="Contracted volume exceeds estimated issuance">
                        over-committed
                      </div>
                    </template>
                    <span v-else class="muted" title="No offtake agreement — all revenue is speculative">—</span>
                  </td>
                  <td class="num" data-label="IRR">
                    <span v-if="p.financials.irr != null" class="irr">{{ pct(p.financials.irr) }}</span>
                    <span v-else class="muted">—</span>
                    <div v-if="p.financials.agreementCount > 0" class="muted small">
                      <template v-if="p.financials.irrContracted != null">
                        {{ pct(p.financials.irrContracted) }} contracted
                      </template>
                      <template v-else-if="p.financials.contractedCoversOpex === false">
                        <span class="warn-text">contracted &lt; opex</span>
                      </template>
                    </div>
                  </td>
                  <td class="num" data-label="Funding gap">{{ p.financials.fundingGap != null ? peso(p.financials.fundingGap) : '—' }}</td>
                  <td class="num" data-label="Docs">
                    <button
                      v-if="documentCount(p)"
                      class="link-btn"
                      @click="openDataRoom(p)"
                    >
                      {{ documentCount(p) }}
                    </button>
                    <span v-else class="muted">—</span>
                  </td>
                  <td class="num" data-label="Financials">
                    <button class="link-btn" @click="detail = p">Financials</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p class="muted small legend">
            IRR/NPV/payback are modelled from developer-provided CAPEX, OPEX and project lifetime;
            projects without those show “—”. <strong>Contracted</strong> is the share of projected
            value under a signed or active offtake agreement (ERPA) — the rest is speculative, valued
            at the developer's listed credit price. The second IRR is the downside case: contracted
            revenue only. Open a project to view its data room (documents).
          </p>
        </section>
      </template>

      <div v-else class="empty">
        <span class="material-symbols-outlined empty-icon" aria-hidden="true">insights</span>
        <h2>No validated projects yet</h2>
        <p class="muted">Once developers have validated projects, the investable pipeline appears here.</p>
        <router-link to="/marketplace" class="btn-primary">Browse the marketplace</router-link>
      </div>
    </FeatureGate>

    <!-- Data room -->
    <div v-if="dataRoom" class="modal-overlay" @click.self="dataRoom = null">
      <div class="modal">
        <h2>Data room</h2>
        <p class="muted small">{{ dataRoom.title }}</p>

        <div v-if="dataRoomLoading" class="muted">Opening…</div>
        <p v-else-if="dataRoomError" class="notice error sm">{{ dataRoomError }}</p>
        <p v-else-if="!dataRoomDocs.length" class="notice info sm">
          This project hasn't published any documents yet.
        </p>

        <ul v-else class="doc-list">
          <li v-for="doc in dataRoomDocs" :key="doc.path || doc.name" class="doc-row">
            <span class="material-symbols-outlined doc-icon" aria-hidden="true">description</span>
            <span class="doc-main">
              <span class="doc-name">{{ doc.label }}</span>
              <span class="muted small">
                {{ doc.name }}<span v-if="formatSize(doc.size)"> · {{ formatSize(doc.size) }}</span>
              </span>
            </span>
            <button v-if="doc.url" class="btn-primary sm" @click="openDocument(doc)">Open</button>
            <span v-else class="muted small">Unavailable</span>
          </li>
        </ul>

        <p class="muted small note-box">
          The developer can see that you opened these documents, and when. They cannot see anything
          else about you.
        </p>

        <div class="modal-actions">
          <button class="btn-ghost" @click="dataRoom = null">Close</button>
          <router-link :to="`/projects/${dataRoom.id}`" class="btn-primary">Full project page</router-link>
        </div>
      </div>
    </div>

    <!-- Financial detail modal -->
    <div v-if="detail" class="modal-overlay" @click.self="detail = null">
      <div class="modal">
        <h2>{{ detail.title }}</h2>
        <p class="muted small">{{ detail.category }}<span v-if="detail.location"> · {{ detail.location }}</span></p>

        <div class="fin-grid">
          <div class="fin"><span class="fin-l">Projected value</span><span class="fin-v">{{ peso(detail.financials.totalRevenue) }}</span></div>
          <div class="fin"><span class="fin-l">Estimated credits</span><span class="fin-v">{{ num(detail.estimated_credits) }}</span></div>
          <div class="fin"><span class="fin-l">Credit price</span><span class="fin-v">{{ detail.credit_price ? peso(detail.credit_price) : '—' }}</span></div>
          <div class="fin"><span class="fin-l">Capacity</span><span class="fin-v">{{ detail.capacity != null ? num(detail.capacity) + ' ' + (detail.capacity_unit || '') : '—' }}</span></div>
        </div>

        <!-- Contracted vs speculative: what an ERPA actually secures -->
        <h3>Revenue certainty</h3>
        <template v-if="detail.financials.agreementCount > 0">
          <div class="fin-grid">
            <div class="fin highlight">
              <span class="fin-l">Contracted</span>
              <span class="fin-v">{{ peso(detail.financials.contractedRevenue) }}</span>
            </div>
            <div class="fin">
              <span class="fin-l">Speculative</span>
              <span class="fin-v">{{ peso(detail.financials.speculativeRevenue) }}</span>
            </div>
            <div class="fin">
              <span class="fin-l">Contracted volume</span>
              <span class="fin-v">{{ num(detail.financials.contractedVolume) }} credits</span>
            </div>
            <div class="fin">
              <span class="fin-l">Under agreement</span>
              <span class="fin-v">{{ pct(detail.financials.contractedShare) }}</span>
            </div>
          </div>
          <div class="bar" role="img" :aria-label="`${pct(detail.financials.contractedShare)} of projected value is contracted`">
            <div class="bar-fill" :style="{ width: (detail.financials.contractedShare * 100) + '%' }"></div>
          </div>
          <p class="muted small">
            {{ detail.financials.agreementCount }} signed/active offtake agreement(s). Counterparties
            and negotiated prices are confidential to the developer.
          </p>
          <p v-if="detail.financials.overCommitted" class="notice warn sm">
            <strong>Over-committed.</strong> Contracted volume exceeds this project's estimated
            issuance, so some contracted credits may not be deliverable.
          </p>
        </template>
        <p v-else class="notice info sm">
          <strong>No offtake agreement.</strong> All projected revenue is speculative — every credit
          is valued at the developer's listed price, not a contracted one.
        </p>

        <template v-if="detail.financials.hasFinancials">
          <h3>Financial model</h3>
          <div class="fin-grid">
            <div class="fin"><span class="fin-l">CAPEX</span><span class="fin-v">{{ peso(detail.financials.capex) }}</span></div>
            <div class="fin"><span class="fin-l">OPEX / yr</span><span class="fin-v">{{ peso(detail.financials.opex) }}</span></div>
            <div class="fin"><span class="fin-l">Lifetime</span><span class="fin-v">{{ num(detail.financials.lifetimeYears) }} yrs</span></div>
            <div class="fin"><span class="fin-l">Annual net</span><span class="fin-v">{{ peso(detail.financials.annualNet) }}</span></div>
            <div class="fin highlight"><span class="fin-l">IRR</span><span class="fin-v">{{ pct(detail.financials.irr) }}</span></div>
            <div class="fin highlight"><span class="fin-l">NPV (10%)</span><span class="fin-v">{{ peso(detail.financials.npv) }}</span></div>
            <div class="fin"><span class="fin-l">Payback</span><span class="fin-v">{{ detail.financials.paybackYears != null ? num(detail.financials.paybackYears) + ' yrs' : '—' }}</span></div>
          </div>

          <!-- Downside case: only the contracted revenue materialises -->
          <template v-if="detail.financials.agreementCount > 0">
            <h3>Downside — contracted revenue only</h3>
            <div v-if="detail.financials.irrContracted != null" class="fin-grid">
              <div class="fin highlight">
                <span class="fin-l">IRR (contracted)</span>
                <span class="fin-v">{{ pct(detail.financials.irrContracted) }}</span>
              </div>
              <div class="fin">
                <span class="fin-l">NPV (contracted)</span>
                <span class="fin-v">{{ peso(detail.financials.npvContracted) }}</span>
              </div>
            </div>
            <p v-else-if="detail.financials.contractedCoversOpex === false" class="notice warn sm">
              <strong>Contracted revenue doesn't cover OPEX.</strong> At
              {{ peso(detail.financials.contractedAnnualNet) }} annual net, the project loses money
              every year on contracted volume alone, so no return can be computed for the downside
              case. It depends on selling speculative credits.
            </p>
            <p class="muted small">
              Assumes not one speculative credit sells. Compare against the headline IRR above.
            </p>
          </template>
        </template>
        <p v-else class="notice info sm">
          The developer hasn't provided CAPEX / OPEX / lifetime for this project, so a full return
          model (IRR/NPV/payback) isn't available yet.
        </p>

        <div v-if="detail.financials.fundingTarget != null" class="funding">
          <strong>Funding:</strong> {{ peso(detail.financials.fundingRaised || 0) }} raised of
          {{ peso(detail.financials.fundingTarget) }} — gap {{ peso(detail.financials.fundingGap) }}.
        </div>

        <div class="modal-actions">
          <router-link :to="`/projects/${detail.id}`" class="btn-ghost">Open project & data room</router-link>
          <button class="btn-primary" @click="detail = null">Close</button>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<style scoped>
.investor { min-height: 100vh; background: var(--bg-secondary, #f8fdf8); }
.page-body { max-width: 1100px; margin: 0 auto; padding: 24px 16px; }
.muted { color: #6b7280; }
.small { font-size: 0.8rem; }
.notice { display: flex; gap: 12px; align-items: flex-start; padding: 12px 16px; border-radius: 10px; margin-bottom: 20px; }
.notice.error { background: #fee2e2; color: #991b1b; }
.notice.info { background: #eff6ff; color: #1e40af; }
.notice.warn { background: #fffbeb; color: #92400e; border: 1px solid #fde68a; display: block; }
.notice.sm { padding: 8px 12px; font-size: 0.85rem; margin: 12px 0 0; }
.notice-body { display: flex; flex-direction: column; gap: 4px; }
.retry-btn { margin-top: 8px; padding: 6px 14px; border: 1px solid currentColor; background: transparent; color: inherit; border-radius: 8px; font-weight: 600; cursor: pointer; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
.card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; }
.card-label { color: #6b7280; font-size: 0.85rem; }
.card-value { font-size: 1.5rem; font-weight: 700; margin: 6px 0; }
.chart-wrap { margin-bottom: 24px; }
.chart-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; max-width: 520px; }
.panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px; margin-bottom: 20px; }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
.panel-head h2 { margin: 0; font-size: 1.1rem; }
.filter { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 0.9rem; }
.table-scroll { width: 100%; overflow-x: auto; }
.data-table { width: 100%; border-collapse: collapse; }
.data-table th, .data-table td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #f1f5f9; font-size: 0.9rem; white-space: nowrap; }
.data-table th.num, .data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.proj-link { color: #058526; font-weight: 600; text-decoration: none; }
.proj-link:hover { text-decoration: underline; }
.irr { color: #065f46; font-weight: 600; }
.contracted { color: #065f46; font-weight: 600; }
.filters { display: flex; gap: 8px; flex-wrap: wrap; }
.doc-list { list-style: none; margin: 14px 0 0; padding: 0; }
.doc-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; border-top: 1px solid #e5e7eb; }
.doc-row:first-child { border-top: none; }
.doc-icon { color: #058526; }
.doc-main { flex: 1; display: flex; flex-direction: column; }
.doc-name { font-weight: 600; font-size: 0.9rem; }
.note-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px; margin-top: 14px; }
.btn-ghost { background: #fff; color: #374151; border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 16px; cursor: pointer; font-weight: 600; }
.btn-primary.sm { padding: 6px 12px; font-size: 0.82rem; }
.stage-pill {
  display: inline-block;
  margin-top: 4px;
  padding: 1px 8px;
  border-radius: 999px;
  background: #eef2ff;
  color: #3730a3;
  font-size: 0.7rem;
  font-weight: 600;
}
.warn-text { color: #92400e; font-weight: 600; }
.over-flag {
  display: inline-block;
  margin-top: 2px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
.bar { height: 8px; border-radius: 999px; background: #e5e7eb; overflow: hidden; margin: 10px 0 6px; }
.bar-fill { height: 100%; background: #058526; border-radius: 999px; }
.link-btn { background: none; border: none; color: #058526; font-weight: 600; cursor: pointer; font-size: 0.85rem; }
.legend { margin: 12px 0 0; }
.btn-primary { background: #058526; color: #fff; border: none; border-radius: 8px; padding: 10px 18px; cursor: pointer; font-weight: 600; text-decoration: none; display: inline-block; }
.btn-ghost { background: #fff; color: #374151; border: 1px solid #d1d5db; border-radius: 8px; padding: 9px 16px; cursor: pointer; font-weight: 600; text-decoration: none; }
.empty { text-align: center; padding: 48px 16px; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; }
.empty-icon { font-size: 48px; color: #058526; }
.empty h2 { margin: 12px 0 6px; }
.empty p { max-width: 420px; margin: 0 auto 18px; }
.modal-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 16px; }
.modal { background: #fff; border-radius: 16px; padding: 24px; max-width: 520px; width: 100%; max-height: 90vh; overflow-y: auto; }
.modal h2 { margin: 0 0 2px; }
.modal h3 { margin: 18px 0 10px; font-size: 1rem; }
.fin-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.fin { display: flex; flex-direction: column; gap: 2px; background: #f9fafb; border: 1px solid #f1f5f9; border-radius: 8px; padding: 10px; }
.fin.highlight { background: #ecfdf5; border-color: #bbf7d0; }
.fin-l { font-size: 0.75rem; color: #6b7280; }
.fin-v { font-size: 1.05rem; font-weight: 700; color: #111827; }
.funding { margin-top: 14px; padding: 10px 12px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; font-size: 0.88rem; color: #92400e; }
.modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
@media (max-width: 640px) {
  .cards { grid-template-columns: 1fr; }
  .fin-grid { grid-template-columns: 1fr; }
}
</style>
