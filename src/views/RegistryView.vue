<template>
  <div class="registry-page">
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">Public Carbon Registry</h1>
        <p class="page-description">
          Independently verify every credit issued and retired on Carbonify. No login required.
        </p>
        <div class="stats">
          <div class="stat">
            <span class="stat-value">{{ stats.certificate_count.toLocaleString() }}</span>
            <span class="stat-label">Certificates</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ stats.total_credits.toLocaleString() }}</span>
            <span class="stat-label">Credits (tCO₂e)</span>
          </div>
          <div class="stat">
            <span class="stat-value">{{ stats.project_count.toLocaleString() }}</span>
            <span class="stat-label">Projects</span>
          </div>
        </div>
      </div>
    </div>

    <div class="container content">
      <!-- Two registers, not two pages. A certificate answers "was this credit
           issued and retired?"; a project answers "under what methodology, at
           what stage, from what feedstock?". Both are the public record, so
           they share one URL and one search bar. -->
      <div class="tabs" role="tablist" aria-label="Registry view">
        <button
          id="tab-certificates"
          role="tab"
          class="tab"
          :class="{ active: tab === 'certificates' }"
          :aria-selected="tab === 'certificates'"
          aria-controls="panel-certificates"
          @click="switchTab('certificates')"
        >
          Certificates
        </button>
        <button
          id="tab-projects"
          role="tab"
          class="tab"
          :class="{ active: tab === 'projects' }"
          :aria-selected="tab === 'projects'"
          aria-controls="panel-projects"
          @click="switchTab('projects')"
        >
          Projects
        </button>
      </div>

      <!-- Same compact bar as the marketplace: recent searches and suggestions
           on focus, and the category filter inside it rather than beside it. -->
      <div class="toolbar">
        <SmartSearch
          v-model="search"
          :storage-key="tab === 'projects' ? 'registry-projects' : 'registry'"
          :placeholder="
            tab === 'projects'
              ? 'Search by project, location, or feedstock'
              : 'Search by project, certificate no., beneficiary, or location'
          "
          :suggestions="searchSuggestions"
          :active-filter-count="activeFilterCount"
          @search="runSearch"
          @clear-filters="resetFilters"
        >
          <template #filters>
            <div>
              <label for="reg-category">Category</label>
              <select id="reg-category" v-model="category" @change="runSearch">
                <option value="">All Categories</option>
                <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
              </select>
            </div>
            <div v-if="tab === 'projects'">
              <label for="reg-methodology">Methodology</label>
              <select id="reg-methodology" v-model="methodology" @change="runSearch">
                <option value="">All Methodologies</option>
                <optgroup v-for="g in methodologyOptions" :key="g.group" :label="g.group">
                  <option v-for="m in g.items" :key="m.value" :value="m.value">
                    {{ m.label }}
                  </option>
                </optgroup>
              </select>
            </div>
          </template>
        </SmartSearch>
        <button class="btn" :disabled="loading" @click="runSearch">
          {{ loading ? 'Searching…' : 'Search' }}
        </button>
      </div>

      <div v-if="error" class="state error">{{ error }}</div>
      <div v-else-if="loading && !rows.length" class="state">Loading registry…</div>
      <div v-else-if="!rows.length" class="state">{{ emptyMessage }}</div>

      <template v-else>
        <div
          :id="tab === 'projects' ? 'panel-projects' : 'panel-certificates'"
          role="tabpanel"
          :aria-labelledby="tab === 'projects' ? 'tab-projects' : 'tab-certificates'"
        >
          <div
            ref="tableWrapRef"
            class="table-wrap"
            :class="{ collapsed: isCollapsed }"
            :style="isCollapsed && collapsedHeight ? { maxHeight: `${collapsedHeight}px` } : null"
          >
            <!-- One table element for both registers so the "show more" height
                 measurement below has a single thead/tbody to measure. -->
            <table class="reg-table">
              <thead ref="theadRef">
                <tr v-if="tab === 'certificates'">
                  <th>Certificate</th>
                  <th>Project</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th class="num">Credits</th>
                  <th>Vintage</th>
                  <th>Beneficiary</th>
                  <th>Issued</th>
                  <th></th>
                </tr>
                <tr v-else>
                  <th>Project</th>
                  <th>Category</th>
                  <th>Location</th>
                  <th>Methodology</th>
                  <th>Stage</th>
                  <th>Feedstock</th>
                  <th class="num">Capacity</th>
                  <th class="num">Issued</th>
                  <th class="num">Available</th>
                  <th></th>
                </tr>
              </thead>
              <tbody ref="tbodyRef">
                <template v-if="tab === 'certificates'">
                  <tr v-for="row in rows" :key="row.certificate_number">
                    <td class="mono">{{ row.certificate_number }}</td>
                    <td>{{ row.project_title || '—' }}</td>
                    <td>{{ row.project_category || '—' }}</td>
                    <td>{{ row.project_location || '—' }}</td>
                    <td class="num">{{ Number(row.credits_quantity || 0).toLocaleString() }}</td>
                    <td>{{ row.vintage_year || '—' }}</td>
                    <td>{{ row.beneficiary_name || '—' }}</td>
                    <td>{{ formatDate(row.issued_at) }}</td>
                    <td>
                      <router-link
                        class="verify-link"
                        :to="`/verify/${encodeURIComponent(row.certificate_number)}`"
                      >
                        Verify →
                      </router-link>
                    </td>
                  </tr>
                </template>
                <template v-else>
                  <tr v-for="row in rows" :key="row.project_id">
                    <td>{{ row.title || '—' }}</td>
                    <td>{{ row.category || '—' }}</td>
                    <td>{{ row.location || row.municipality || '—' }}</td>
                    <!-- A project with no methodology recorded reads as
                         "Not stated", never as a standard it does not hold. -->
                    <td>{{ methodologyLabel(row.methodology) || 'Not stated' }}</td>
                    <td>{{ developmentStatusLabel(row.development_status) || 'Not stated' }}</td>
                    <td>{{ row.feedstock || '—' }}</td>
                    <td class="num">{{ formatCapacity(row) }}</td>
                    <td class="num">{{ Number(row.credits_issued || 0).toLocaleString() }}</td>
                    <td class="num">{{ Number(row.credits_available || 0).toLocaleString() }}</td>
                    <td>
                      <router-link class="verify-link" :to="`/projects/${row.project_id}`">
                        View →
                      </router-link>
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </div>

        <div v-if="rows.length > VISIBLE_ROWS" class="show-more">
          <button class="btn btn-more" @click="toggleExpanded">
            {{
              expanded
                ? 'Show less'
                : `Show more (${(rows.length - VISIBLE_ROWS).toLocaleString()} more)`
            }}
          </button>
        </div>
      </template>

      <div v-if="rows.length" class="pager">
        <button class="btn" :disabled="page === 0 || loading" @click="changePage(-1)">Previous</button>
        <span class="page-info">Page {{ page + 1 }}</span>
        <button class="btn" :disabled="rows.length < pageSize || loading" @click="changePage(1)">
          Next
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { searchRegistry, searchProjectRegistry, getRegistryStats } from '@/services/registryService'
import { PROJECT_TYPES } from '@/constants/projectTypes'
import {
  methodologyGroups,
  methodologyLabel,
  developmentStatusLabel,
} from '@/constants/projectRegistry'
import SmartSearch from '@/components/ui/SmartSearch.vue'

const categories = PROJECT_TYPES.map((t) => t.value)
const methodologyOptions = methodologyGroups()

// Rows shown before the list is collapsed behind "Show more".
const VISIBLE_ROWS = 4

// Which register is on screen: 'certificates' (was this credit issued and
// retired?) or 'projects' (under what methodology, at what stage?).
const tab = ref('certificates')

const search = ref('')
const category = ref('')
const methodology = ref('')
const page = ref(0)
const pageSize = ref(25)
const rows = ref([])
const stats = ref({ certificate_count: 0, total_credits: 0, project_count: 0 })
const loading = ref(false)
const error = ref('')

const expanded = ref(false)
const collapsedHeight = ref(0)
const tableWrapRef = ref(null)
const theadRef = ref(null)
const tbodyRef = ref(null)

const isCollapsed = computed(() => !expanded.value && rows.value.length > VISIBLE_ROWS)

const emptyMessage = computed(() =>
  tab.value === 'projects'
    ? 'No validated projects match your search.'
    : 'No certificates match your search.',
)

// The methodology filter only exists on the Projects tab, so it must not be
// counted on the other one — a filter badge for a control the user cannot see
// is a count they have no way to clear.
const activeFilterCount = computed(
  () => (category.value ? 1 : 0) + (tab.value === 'projects' && methodology.value ? 1 : 0),
)

/**
 * Suggestions for the search panel, drawn from the rows currently loaded, so
 * every one of them is known to match something. The two registers carry
 * different columns, hence the two field lists.
 */
const searchSuggestions = computed(() => {
  const out = []
  const seen = new Set()
  const add = (value) => {
    const v = String(value || '').trim()
    if (!v || v === '—' || seen.has(v.toLowerCase())) return
    seen.add(v.toLowerCase())
    out.push(v)
  }
  if (tab.value === 'projects') {
    for (const r of rows.value) add(r.title)
    for (const r of rows.value) add(r.feedstock)
    for (const r of rows.value) add(r.location || r.municipality)
  } else {
    for (const r of rows.value) add(r.project_title)
    for (const r of rows.value) add(r.beneficiary_name)
    for (const r of rows.value) add(r.project_location)
  }
  return out
})

function resetFilters() {
  category.value = ''
  methodology.value = ''
  runSearch()
}

/**
 * Switch register. The rows are cleared rather than left on screen, because the
 * two shapes share no columns — leaving them would render a certificate row
 * against project headers for as long as the fetch takes.
 */
function switchTab(next) {
  if (tab.value === next) return
  tab.value = next
  rows.value = []
  error.value = ''
  page.value = 0
  load()
}

/** Capacity with its unit, or an em dash. The unit is meaningless alone. */
function formatCapacity(row) {
  const value = Number(row?.capacity)
  if (!Number.isFinite(value) || row?.capacity == null || row?.capacity === '') return '—'
  return `${value.toLocaleString()}${row.capacity_unit ? ` ${row.capacity_unit}` : ''}`
}

// Height of the header + the first VISIBLE_ROWS rows, so exactly four
// certificates are visible and the rest scroll inside the box.
function measureCollapsedHeight() {
  const head = theadRef.value
  const body = tbodyRef.value
  if (!head || !body || !body.rows.length) return
  let height = head.offsetHeight
  for (let i = 0; i < Math.min(VISIBLE_ROWS, body.rows.length); i += 1) {
    height += body.rows[i].offsetHeight
  }
  collapsedHeight.value = height
}

function toggleExpanded() {
  expanded.value = !expanded.value
  if (!expanded.value) {
    tableWrapRef.value?.scrollTo({ top: 0 })
  }
}

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return value
  }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const query = {
      search: search.value.trim(),
      category: category.value,
      page: page.value,
    }
    const { rows: r, pageSize: ps } =
      tab.value === 'projects'
        ? await searchProjectRegistry({ ...query, methodology: methodology.value })
        : await searchRegistry(query)
    rows.value = r
    pageSize.value = ps
    expanded.value = false
    await nextTick()
    measureCollapsedHeight()
  } catch (e) {
    error.value = e?.message || 'Failed to load the registry.'
  } finally {
    loading.value = false
  }
}

function runSearch() {
  page.value = 0
  load()
}

function changePage(delta) {
  const next = page.value + delta
  if (next < 0) return
  page.value = next
  load()
}

onMounted(async () => {
  stats.value = await getRegistryStats()
  await load()
})
</script>

<style scoped>
.registry-page {
  min-height: 100vh;
  background: #f8fafc;
}
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}
.page-header {
  background: var(--primary-color, #058526);
  padding: 1.25rem 0;
}
.page-title {
  color: #fff;
  font-size: 1.5rem;
  font-weight: 700;
  margin: 0 0 0.25rem;
}
.page-description {
  color: #ecfdf5;
  margin: 0 0 1.25rem;
}
.stats {
  display: flex;
  gap: 2.5rem;
}
.stat {
  display: flex;
  flex-direction: column;
}
.stat-value {
  font-size: 1.75rem;
  font-weight: 700;
  color: #fff;
}
.stat-label {
  font-size: 0.8rem;
  /* #d1fae5 over the #058526 header is 4.21:1 at 12.8px — just under the 4.5:1
     AA floor, and these are the labels naming the registry's headline numbers.
     White is 4.78:1 on the same background; the uppercase letter-spacing below
     already marks it as a label, so the tint was not doing the work. */
  color: #ffffff;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.content {
  padding: 1.5rem;
}
.tabs {
  display: flex;
  gap: 0.25rem;
  margin-bottom: 1rem;
  border-bottom: 1px solid #e5e7eb;
}
.tab {
  padding: 0.6rem 1rem;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  font-size: 0.9rem;
  font-weight: 600;
  /* #6b7280 on #f8fafc is 4.83:1 — above the 4.5:1 AA floor for the inactive
     label, which still has to be readable to be worth clicking. */
  color: #6b7280;
  cursor: pointer;
}
.tab:hover {
  color: #047857;
}
.tab.active {
  color: #058526;
  border-bottom-color: #058526;
}
.tab:focus-visible {
  outline: 2px solid #058526;
  outline-offset: -2px;
}
.toolbar {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}
/* SmartSearch caps itself at 640px; here it should take the row. */
.toolbar > .smart-search {
  flex: 1 1 260px;
  max-width: none;
}
/* .search-input and .filter-select were removed with the old inline toolbar —
   the input and the category select are inside SmartSearch now. */
.toolbar .btn {
  height: 38px;
  padding-block: 0;
}
.btn {
  padding: 0.6rem 1.1rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  font-weight: 600;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.table-wrap {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: auto;
}
.table-wrap.collapsed {
  overflow-y: auto;
}
.reg-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.reg-table th,
.reg-table td {
  padding: 0.65rem 0.75rem;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
}
.reg-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f8fafc;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #6b7280;
  box-shadow: inset 0 -1px 0 #e5e7eb;
}
.reg-table th.num,
.reg-table td.num {
  text-align: right;
}
.mono {
  font-family: ui-monospace, monospace;
  font-size: 0.8rem;
}
.verify-link {
  color: #058526;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}
.show-more {
  display: flex;
  justify-content: center;
  margin-top: 0.75rem;
}
.btn-more {
  color: #058526;
  border-color: #bbf7d0;
  background: #f0fdf4;
}
.btn-more:hover {
  background: #dcfce7;
}
.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 1.25rem;
}
.page-info {
  color: #6b7280;
  font-size: 0.875rem;
}
.state {
  padding: 2rem;
  text-align: center;
  color: #6b7280;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}
.state.error {
  color: #dc2626;
  background: #fef2f2;
  border-color: #fecaca;
}
@media (max-width: 768px) {
  .reg-table {
    min-width: 720px;
  }
  .stats {
    gap: 1.5rem;
  }
}

/* Below this the bar and the button cannot share a row — the bar's 260px basis
   plus a ~90px button exceeds the gutter-less width — so the button wraps. Left
   at its natural width it looks stranded under the left end of the bar; full
   width it reads as the second half of one control. */
@media (max-width: 560px) {
  .toolbar > .btn {
    width: 100%;
  }
}
</style>
