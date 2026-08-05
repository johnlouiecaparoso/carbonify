<template>
  <div class="audit-logs">
    <!-- Page Header -->
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">Audit Logs</h1>
        <p class="page-description">View system activity and user actions</p>
      </div>
    </div>

    <div class="logs-content">
      <div class="container">
        <!-- Filters -->
        <div class="filters-bar">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search logs..."
            class="search-input"
          />
          <!-- The first option doubles as the visible label ("All Actions"), so
               sighted users get one for free. A screen reader announces only
               the selected value, which leaves the control itself unnamed. -->
          <select v-model="actionFilter" class="filter-select" aria-label="Filter by action">
            <option value="">All Actions</option>
            <option value="login">Login</option>
            <option value="logout">Logout</option>
            <option value="create">Create</option>
            <option value="update">Update</option>
            <option value="delete">Delete</option>
            <option value="approve">Approve</option>
            <option value="reject">Reject</option>
          </select>
          <select v-model="userFilter" class="filter-select" aria-label="Filter by user">
            <option value="">All Users</option>
            <option v-for="user in uniqueUsers" :key="user.id" :value="user.id">
              {{ user.name }}
            </option>
          </select>
          <button @click="refreshLogs" class="refresh-btn">Refresh</button>
          <!-- Exports what is on screen, filters included: an investigation
               usually wants the narrowed set, not the whole table. -->
          <button
            class="refresh-btn"
            :disabled="!filteredLogs.length"
            :title="`Export ${filteredLogs.length} row(s) as CSV`"
            @click="exportCsv"
          >
            Export CSV
          </button>
        </div>

        <!-- Logs Table -->
        <div v-if="loading" class="loading-state">Loading audit logs...</div>
        <div v-else-if="error" class="error-state">{{ error }}</div>
        <div v-else class="logs-table">
          <CollapsibleList :count="visibleLogs.length">
            <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="log in visibleLogs" :key="log.id">
                <td>{{ formatDate(log.created_at) }}</td>
                <td>{{ log.user_name || 'System' }}</td>
                <td>
                  <span class="action-badge" :class="`action-${log.action || log.action_type}`">
                    {{ log.action || log.action_type || 'N/A' }}
                  </span>
                </td>
                <td>{{ log.resource_type || 'N/A' }}</td>
                <td class="details-cell">
                  <span :title="formatDetails(log.metadata)">{{ formatDetails(log.metadata) }}</span>
                </td>
              </tr>
            </tbody>
            </table>
          </CollapsibleList>

          <div v-if="logs.length === 0" class="empty-state">No audit logs found.</div>
          <div v-else-if="filteredLogs.length === 0" class="empty-state">
            No logs match the current filters.
          </div>

          <!-- Rows load PAGE_SIZE at a time so a 500-row result set doesn't
               render as one enormous page. This footer loads MORE rows into the
               list; the "See more" toggle above expands the box around the rows
               already loaded. -->
          <div v-else class="table-footer">
            <span class="row-count">
              Showing {{ visibleLogs.length }} of {{ filteredLogs.length }}
            </span>
            <div class="footer-actions">
              <button v-if="hasMore" class="see-more-btn" @click="showMore">
                Load {{ Math.min(PAGE_SIZE, filteredLogs.length - visibleLogs.length) }} more
              </button>
              <button
                v-if="visibleCount > PAGE_SIZE"
                class="see-less-btn"
                @click="showLess"
              >
                Show less
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import CollapsibleList from '@/components/ui/CollapsibleList.vue'
import { searchAuditLogs } from '@/services/auditService'
import { exportAuditLogsCsv } from '@/services/adminExportService'

const logs = ref([])
const loading = ref(true)
const error = ref('')
const searchQuery = ref('')
const actionFilter = ref('')
const userFilter = ref('')

// Progressive reveal: render a page at a time instead of all 500 rows at once.
const PAGE_SIZE = 25
const visibleCount = ref(PAGE_SIZE)

const uniqueUsers = computed(() => {
  const userMap = new Map()
  logs.value.forEach((log) => {
    if (log.user_id && log.user_name) {
      if (!userMap.has(log.user_id)) {
        userMap.set(log.user_id, { id: log.user_id, name: log.user_name })
      }
    }
  })
  return Array.from(userMap.values())
})

function exportCsv() {
  exportAuditLogsCsv(filteredLogs.value)
}

const filteredLogs = computed(() => {
  let filtered = logs.value

  // Filter by search query
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(
      (log) =>
        log.user_name?.toLowerCase().includes(query) ||
        log.action_type?.toLowerCase().includes(query) ||
        log.resource_type?.toLowerCase().includes(query) ||
        JSON.stringify(log.metadata)?.toLowerCase().includes(query),
    )
  }

              // Filter by action
  if (actionFilter.value) {
    filtered = filtered.filter((log) => (log.action || log.action_type) === actionFilter.value)
  }

  // Filter by user
  if (userFilter.value) {
    filtered = filtered.filter((log) => log.user_id === userFilter.value)
  }

  return filtered
})

const visibleLogs = computed(() => filteredLogs.value.slice(0, visibleCount.value))
const hasMore = computed(() => visibleCount.value < filteredLogs.value.length)

function showMore() {
  visibleCount.value += PAGE_SIZE
}

function showLess() {
  visibleCount.value = PAGE_SIZE
}

// A new filter should start from the top, not deep in a previously expanded list.
watch([searchQuery, actionFilter, userFilter], () => {
  visibleCount.value = PAGE_SIZE
})

function formatDate(dateString) {
  if (!dateString) return 'N/A'
  const date = new Date(dateString)
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDetails(details) {
  if (!details) return 'N/A'
  if (typeof details === 'string') return details
  return JSON.stringify(details)
}

async function loadLogs() {
  try {
    loading.value = true
    error.value = ''
    const result = await searchAuditLogs({}, 500)
    logs.value = result || []
    visibleCount.value = PAGE_SIZE
  } catch (err) {
    console.error('Error loading audit logs:', err)
    error.value = 'Failed to load audit logs. Please try again.'
    logs.value = []
  } finally {
    loading.value = false
  }
}

async function refreshLogs() {
  await loadLogs()
}

onMounted(() => {
  loadLogs()
})
</script>

<style scoped>
.audit-logs {
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
  background: var(--primary-color, #058526);
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

.logs-content {
  padding: 2rem 0;
}

.filters-bar {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
  flex-wrap: wrap;
}

.search-input,
.filter-select {
  padding: 0.75rem;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 1rem;
}

.search-input {
  flex: 2;
  min-width: min(200px, 100%);
}

/* The user filter lists full names, so its popup is as wide as the longest
   account in the table; a 150px control guaranteed the open list overhung the
   closed box. 220px covers the realistic names and lines the two up. */
.filter-select {
  min-width: min(220px, 100%);
}

.refresh-btn {
  padding: 0.75rem 1.5rem;
  background: var(--primary-color, #058526);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
}

.logs-table {
  background: white;
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

table {
  width: 100%;
  border-collapse: collapse;
  min-width: 720px;
}

thead {
  background: #f8f9fa;
}

th,
td {
  padding: 1rem;
  text-align: left;
  border-bottom: 1px solid #e2e8f0;
}

th {
  font-weight: 600;
  color: #333;
}

.details-cell {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 500;
}

.action-create {
  background: #dcfce7;
  color: #16a34a;
}

.action-update {
  background: #dbeafe;
  color: #2563eb;
}

.action-delete {
  background: #fee2e2;
  color: #dc2626;
}

.action-approve {
  background: #dcfce7;
  color: #16a34a;
}

.action-reject {
  background: #fee2e2;
  color: #dc2626;
}

.action-login,
.action-logout {
  background: #f3f4f6;
  color: #6b7280;
}

.loading-state,
.error-state,
.empty-state {
  text-align: center;
  padding: 2rem;
}

/* See-more footer -------------------------------------------------------- */
.table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 0.9rem 1rem;
  border-top: 1px solid #eef2f1;
  background: #fafcfa;
}

.row-count {
  font-size: 0.85rem;
  color: #6b7280;
}

.footer-actions {
  display: flex;
  gap: 0.5rem;
}

.see-more-btn {
  padding: 0.5rem 1.1rem;
  background: var(--primary-color, #058526);
  color: #fff;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
}

.see-less-btn {
  padding: 0.5rem 1.1rem;
  background: #fff;
  color: #374151;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 0.85rem;
}

.see-more-btn:hover {
  background: var(--primary-hover, #059669);
}

.see-less-btn:hover {
  background: #f3f4f6;
}

@media (max-width: 768px) {
  .filters-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .search-input,
  .filter-select,
  .refresh-btn {
    width: 100%;
    min-width: 0;
  }

  .logs-table {
    border-radius: 12px;
  }
}
</style>
