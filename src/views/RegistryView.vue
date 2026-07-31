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
      <div class="toolbar">
        <input
          v-model="search"
          class="search-input"
          type="search"
          placeholder="Search by project, certificate no., beneficiary, or location"
          @keyup.enter="runSearch"
        />
        <select v-model="category" class="filter-select" @change="runSearch">
          <option value="">All Categories</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
        <button class="btn" :disabled="loading" @click="runSearch">
          {{ loading ? 'Searching…' : 'Search' }}
        </button>
      </div>

      <div v-if="error" class="state error">{{ error }}</div>
      <div v-else-if="loading && !rows.length" class="state">Loading registry…</div>
      <div v-else-if="!rows.length" class="state">No certificates match your search.</div>

      <template v-else>
        <div
          ref="tableWrapRef"
          class="table-wrap"
          :class="{ collapsed: isCollapsed }"
          :style="isCollapsed && collapsedHeight ? { maxHeight: `${collapsedHeight}px` } : null"
        >
          <table class="reg-table">
            <thead ref="theadRef">
              <tr>
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
            </thead>
            <tbody ref="tbodyRef">
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
            </tbody>
          </table>
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
import { searchRegistry, getRegistryStats } from '@/services/registryService'
import { PROJECT_TYPES } from '@/constants/projectTypes'

const categories = PROJECT_TYPES.map((t) => t.value)

// Certificates shown before the list is collapsed behind "Show more".
const VISIBLE_ROWS = 4

const search = ref('')
const category = ref('')
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
    const { rows: r, pageSize: ps } = await searchRegistry({
      search: search.value.trim(),
      category: category.value,
      page: page.value,
    })
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
  color: #d1fae5;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.content {
  padding: 1.5rem;
}
.toolbar {
  display: flex;
  gap: 0.6rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}
.search-input {
  flex: 1;
  min-width: 240px;
  padding: 0.6rem 0.9rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.9rem;
}
.filter-select {
  padding: 0.6rem 0.9rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
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
</style>
