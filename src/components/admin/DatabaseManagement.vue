<template>
  <div class="database-management">
    <!-- Page Header -->
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">Database Management</h1>
        <p class="page-description">Manage database tables, data, and relationships</p>
      </div>
    </div>

    <div class="db-content">
      <div class="container">
        <!-- Database Tables List -->
        <div class="tables-section">
          <h2>Database Tables</h2>
          <div class="tables-grid">
            <div
              v-for="table in tables"
              :key="table.name"
              class="table-card"
              @click="selectTable(table)"
            >
              <h3>{{ table.name }}</h3>
              <p>{{ table.description }}</p>
              <div class="table-stats">
                <span>Rows: {{ table.rowCount || 'N/A' }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Table Data Viewer -->
        <div v-if="selectedTable" class="table-viewer">
          <div class="viewer-header">
            <h3>{{ selectedTable.name }}</h3>
            <button @click="selectedTable = null" class="close-btn">×</button>
          </div>
          <div v-if="tableDataLoading" class="loading-state">Loading data...</div>
          <div v-else-if="tableDataError" class="error-state">{{ tableDataError }}</div>
          <div v-else class="table-data">
            <div class="data-controls">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="Search..."
                class="search-input"
              />
              <button @click="refreshTableData" class="refresh-btn">Refresh</button>
            </div>
            <div class="data-table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th v-for="column in tableColumns" :key="column">{{ column }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, idx) in filteredTableData" :key="idx">
                    <td v-for="column in tableColumns" :key="column">
                      {{ formatCellValue(row[column]) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { getSupabase } from '@/services/supabaseClient'

const tables = ref([
  { name: 'profiles', description: 'User profiles and account information', rowCount: null },
  { name: 'projects', description: 'Environmental projects', rowCount: null },
  {
    name: 'project_credits',
    description: 'Carbon credits associated with projects',
    rowCount: null,
  },
  { name: 'credit_listings', description: 'Credits available for purchase', rowCount: null },
  {
    name: 'credit_transactions',
    description: 'Credit purchase and sale transactions',
    rowCount: null,
  },
  { name: 'credit_ownership', description: 'User credit ownership records', rowCount: null },
  { name: 'wallet_accounts', description: 'User wallet accounts', rowCount: null },
  { name: 'wallet_transactions', description: 'Wallet transaction history', rowCount: null },
  { name: 'certificates', description: 'Carbon credit certificates', rowCount: null },
  { name: 'receipts', description: 'Transaction receipts', rowCount: null },
])

const selectedTable = ref(null)
const tableData = ref([])
const tableColumns = ref([])
const tableDataLoading = ref(false)
const tableDataError = ref('')
const searchQuery = ref('')

const filteredTableData = computed(() => {
  if (!searchQuery.value) return tableData.value

  const query = searchQuery.value.toLowerCase()
  return tableData.value.filter((row) => {
    return Object.values(row).some((val) => String(val).toLowerCase().includes(query))
  })
})

function formatCellValue(value) {
  if (value === null || value === undefined) return 'N/A'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

async function selectTable(table) {
  selectedTable.value = table
  await loadTableData(table.name)
}

async function loadTableData(tableName) {
  try {
    tableDataLoading.value = true
    tableDataError.value = ''
    const supabase = getSupabase()

    const { data, error } = await supabase.from(tableName).select('*').limit(100)

    if (error) throw error

    tableData.value = data || []
    if (tableData.value.length > 0) {
      tableColumns.value = Object.keys(tableData.value[0])
    }
  } catch (err) {
    console.error('Error loading table data:', err)
    tableDataError.value = `Failed to load data: ${err.message}`
  } finally {
    tableDataLoading.value = false
  }
}

async function refreshTableData() {
  if (selectedTable.value) {
    await loadTableData(selectedTable.value.name)
  }
}

async function loadTableCounts() {
  const supabase = getSupabase()
  for (const table of tables.value) {
    try {
      const { count } = await supabase.from(table.name).select('*', { count: 'exact', head: true })
      table.rowCount = count || 0
    } catch (err) {
      console.warn(`Could not get count for ${table.name}:`, err)
    }
  }
}

onMounted(() => {
  loadTableCounts()
})
</script>

<style scoped>
.database-management {
  min-height: 100vh;
  background: var(--bg-secondary, #f8fdf8);
}

.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 2rem;
}

.page-header {
  padding: 1.25rem 0;
  border-bottom: none;
  background: var(--primary-color, #069e2d);
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

.db-content {
  padding: 2rem 0;
}

.tables-section h2 {
  margin-bottom: 1.5rem;
  color: #333;
}

.tables-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.table-card {
  background: white;
  padding: 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.table-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
}

.table-card h3 {
  margin: 0 0 0.5rem 0;
  color: var(--primary-color, #069e2d);
}

.table-card p {
  margin: 0 0 1rem 0;
  color: #666;
  font-size: 0.9rem;
}

.table-stats {
  font-size: 0.875rem;
  color: #999;
}

.table-viewer {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.viewer-header h3 {
  margin: 0;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #999;
  line-height: 1;
}

.data-controls {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.search-input {
  flex: 1;
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.refresh-btn {
  padding: 0.75rem 1.5rem;
  background: var(--primary-color, #069e2d);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
}

.data-table-wrapper {
  overflow-x: auto;
  max-height: 600px;
  overflow-y: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th,
td {
  padding: 0.75rem;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
  font-size: 0.875rem;
}

th {
  background: #f8f9fa;
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 10;
}

.loading-state,
.error-state {
  text-align: center;
  padding: 2rem;
}
</style>
