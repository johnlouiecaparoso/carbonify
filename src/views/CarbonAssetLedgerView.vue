<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { getMyAssetLedger } from '@/services/assetLedgerService'
import { exportImpactDisclosureCsv } from '@/services/developerImpactService'
import CollapsibleList from '@/components/ui/CollapsibleList.vue'
import { peso, num } from '@/utils/format'

const loading = ref(true)
const loadError = ref('')
const rows = ref([])
const totals = ref(null)
const exportError = ref('')

// Which ledger rows have been opened on a phone. Above 640px the class is inert
// — the table is a table and every column is already on screen.
const expandedRows = ref(new Set())
function toggleRow(projectId) {
  const next = new Set(expandedRows.value)
  if (next.has(projectId)) next.delete(projectId)
  else next.add(projectId)
  expandedRows.value = next
}

function statusLabel(s) {
  return String(s || '').replace(/_/g, ' ')
}
function shortDate(d) {
  return d
    ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
    : '—'
}

/** Only projects that actually have buyers appear in the buyer-history section. */
const projectsWithBuyers = computed(() => rows.value.filter((r) => r.buyers?.length))

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    const ledger = await getMyAssetLedger()
    rows.value = ledger.rows
    totals.value = ledger.totals
  } catch (err) {
    console.error('Failed to load asset ledger:', err)
    loadError.value =
      err?.message || 'We could not load your carbon assets right now. Please try again.'
  } finally {
    loading.value = false
  }
}

/**
 * The impact disclosure — tCO2e split by who may claim it, as distinct from the
 * financial export on the Earnings page.
 *
 * Wrapped rather than bound straight to `@click` like the earnings exports: a
 * throw here would otherwise reach nothing and look exactly like the silent
 * download failure `utils/download.js` was written to end.
 */
function downloadImpactDisclosure() {
  exportError.value = ''
  try {
    exportImpactDisclosureCsv({ rows: rows.value, totals: totals.value })
  } catch (err) {
    console.error('Failed to export impact disclosure:', err)
    exportError.value = err?.message || 'We could not build your disclosure. Please try again.'
  }
}

onMounted(load)
</script>

<template>
  <div class="asset-ledger">
    <PageHeader
      title="Carbon Asset Management"
      description="Track every credit across its lifecycle — issued, sold, retired, and on hand — per project."
    />

    <div class="page-body">

    <div v-if="loading" class="muted">Loading…</div>

    <div v-else-if="loadError" class="notice error">
      <span class="material-symbols-outlined" aria-hidden="true">error</span>
      <div class="notice-body">
        <strong>Couldn't load your carbon assets.</strong>
        {{ loadError }}
        <div><button class="retry-btn" @click="load">Try again</button></div>
      </div>
    </div>

    <template v-else-if="totals && totals.projects">
      <!-- Portfolio-wide summary cards -->
      <section class="cards">
        <div class="card">
          <div class="card-label">Credits issued</div>
          <div class="card-value">{{ num(totals.issued) }}</div>
          <div class="muted small">across {{ num(totals.projects) }} project(s)</div>
        </div>
        <div class="card">
          <div class="card-label">Available inventory</div>
          <div class="card-value">{{ num(totals.inventory) }}</div>
          <div class="muted small">{{ peso(totals.inventoryValue) }} at listed price</div>
        </div>
        <div class="card">
          <div class="card-label">Credits sold</div>
          <div class="card-value">{{ num(totals.sold) }}</div>
          <div class="muted small">
            {{ peso(totals.soldValue) }} gross · {{ num(totals.buyers) }} buyer(s)
          </div>
        </div>
        <div class="card">
          <div class="card-label">Credits retired</div>
          <div class="card-value">{{ num(totals.retired) }}</div>
          <div class="muted small">{{ num(totals.pending) }} pending issuance</div>
        </div>
      </section>

      <!-- Impact disclosure — the climate counterpart to the financial export
           on the Earnings page. Placed under the totals because those four
           cards are the numbers it splits by claim entitlement. -->
      <section class="panel disclosure-panel">
        <div class="panel-head">
          <div>
            <h2>Impact disclosure</h2>
            <p class="muted small">
              tCO<sub>2</sub>e per project, separated into what buyers have retired, what is sold
              but not yet retired, and what remains yours to claim. For sustainability reports and
              investor diligence.
            </p>
          </div>
          <button type="button" class="export-btn" @click="downloadImpactDisclosure">
            <span class="material-symbols-outlined" aria-hidden="true">download</span>
            Export CSV
          </button>
        </div>
        <p v-if="exportError" class="notice error small" role="alert">{{ exportError }}</p>
      </section>

      <!-- Per-project asset ledger -->
      <section class="panel">
        <h2>Assets by project</h2>
        <!-- Vertically scrollable with a "See more" underneath, so the panel's
             height stops growing with the portfolio. -->
        <CollapsibleList :count="rows.length" :visible="5" row-selector="tbody > tr">
          <!-- data-label on every cell drives the under-640px card layout
               (src/styles/responsive-table.css); ten columns is the worst
               horizontal scroll in the app. `collapse-rows` takes that further
               on a phone: each card shows the project name until opened. -->
          <table class="data-table stack-on-mobile collapse-rows">
            <thead>
              <tr>
                <th>Project</th>
                <th>Status</th>
                <th class="num">Estimated</th>
                <th class="num">Issued</th>
                <th class="num">Pending</th>
                <th class="num">Sold</th>
                <th class="num">Retired</th>
                <th class="num">Available</th>
                <th class="num">Inventory value</th>
                <th class="num">Sold value</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in rows"
                :key="row.projectId"
                :class="{ 'is-open': expandedRows.has(row.projectId) }"
              >
                <td data-label="Project">
                  <router-link :to="`/projects/${row.projectId}`" class="proj-link">
                    {{ row.projectTitle }}
                  </router-link>
                  <button
                    type="button"
                    class="row-toggle"
                    :aria-expanded="expandedRows.has(row.projectId)"
                    @click="toggleRow(row.projectId)"
                  >
                    {{ expandedRows.has(row.projectId) ? 'Less' : 'More info' }}
                  </button>
                </td>
                <td data-label="Status"><span class="badge" :class="row.status">{{ statusLabel(row.status) }}</span></td>
                <td class="num" data-label="Estimated">{{ num(row.estimated) }}</td>
                <td class="num" data-label="Issued">{{ num(row.issued) }}</td>
                <td class="num" data-label="Pending">{{ num(row.pending) }}</td>
                <td class="num" data-label="Sold">{{ num(row.sold) }}</td>
                <td class="num" data-label="Retired">{{ num(row.retired) }}</td>
                <td class="num" data-label="Available">{{ num(row.inventory) }}</td>
                <td class="num" data-label="Inventory value">{{ peso(row.inventoryValue) }}</td>
                <td class="num" data-label="Sold value">{{ peso(row.soldValue) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2"><strong>Total</strong></td>
                <td class="num" data-label="Estimated"><strong>{{ num(totals.estimated) }}</strong></td>
                <td class="num" data-label="Issued"><strong>{{ num(totals.issued) }}</strong></td>
                <td class="num" data-label="Pending"><strong>{{ num(totals.pending) }}</strong></td>
                <td class="num" data-label="Sold"><strong>{{ num(totals.sold) }}</strong></td>
                <td class="num" data-label="Retired"><strong>{{ num(totals.retired) }}</strong></td>
                <td class="num" data-label="Available"><strong>{{ num(totals.inventory) }}</strong></td>
                <td class="num" data-label="Inventory value"><strong>{{ peso(totals.inventoryValue) }}</strong></td>
                <td class="num" data-label="Sold value"><strong>{{ peso(totals.soldValue) }}</strong></td>
              </tr>
            </tfoot>
          </table>
        </CollapsibleList>
        <p class="muted small legend">
          <strong>Issued</strong> = credits in your sellable pool ·
          <strong>Pending</strong> = verified reductions awaiting issuance ·
          <strong>Available</strong> = unsold inventory remaining.
        </p>
      </section>

      <!-- Buyer history — who bought, how much, and when (per project) -->
      <section class="panel">
        <h2>Buyer history</h2>
        <p class="muted small sub">
          Your counterparties per project, largest first. Repeat purchases by the same buyer are
          grouped into one row.
        </p>

        <div v-if="!projectsWithBuyers.length" class="empty-inline">
          <span class="material-symbols-outlined" aria-hidden="true">group</span>
          <p class="muted">No credits sold yet — buyers will appear here after your first sale.</p>
        </div>

        <div v-for="row in projectsWithBuyers" :key="row.projectId" class="buyer-block">
          <div class="buyer-head">
            <router-link :to="`/projects/${row.projectId}`" class="proj-link">
              {{ row.projectTitle }}
            </router-link>
            <span class="muted small">{{ num(row.buyerCount) }} buyer(s) · {{ num(row.sold) }} credits</span>
          </div>
          <div class="table-scroll">
            <table class="data-table stack-on-mobile">
              <thead>
                <tr>
                  <th>Buyer</th>
                  <th class="num">Credits</th>
                  <th class="num">Value</th>
                  <th class="num">Purchases</th>
                  <th class="num">Last purchase</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="buyer in row.buyers" :key="buyer.buyerId || 'unknown'">
                  <td data-label="Buyer">
                    {{ buyer.name }}
                    <span v-if="!buyer.buyerId" class="muted small">(unattributed)</span>
                  </td>
                  <td class="num" data-label="Credits">{{ num(buyer.quantity) }}</td>
                  <td class="num" data-label="Value">{{ peso(buyer.value) }}</td>
                  <td class="num" data-label="Purchases">{{ num(buyer.purchases) }}</td>
                  <td class="num" data-label="Last purchase">{{ shortDate(buyer.lastPurchaseAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </template>

    <!-- Empty state: developer has no projects yet -->
    <div v-else class="empty">
      <span class="material-symbols-outlined empty-icon" aria-hidden="true">account_balance_wallet</span>
      <h2>No carbon assets yet</h2>
      <p class="muted">
        Once you submit a project and it's validated, its issued credits, sales, and retirements
        will roll up here.
      </p>
      <router-link to="/submit-project" class="btn-primary">Submit a project</router-link>
    </div>
    </div>
  </div>
</template>

<style scoped>
.asset-ledger {
  min-height: 100vh;
  background: var(--bg-secondary, #f8fdf8);
}
.page-body {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px 16px;
}
.sub { margin: -6px 0 14px; }
.buyer-block { margin-bottom: 22px; }
.buyer-block:last-child { margin-bottom: 0; }
.buyer-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.empty-inline { text-align: center; padding: 28px 16px; color: #6b7280; }
.empty-inline .material-symbols-outlined { font-size: 34px; color: #058526; }
.empty-inline p { margin: 8px 0 0; }
.muted {
  color: #6b7280;
}
.small {
  font-size: 0.8rem;
}
.notice {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px 16px;
  border-radius: 10px;
  margin-bottom: 20px;
}
.notice.error {
  background: #fee2e2;
  color: #991b1b;
}
.retry-btn {
  margin-top: 8px;
  padding: 6px 14px;
  border: 1px solid currentColor;
  background: transparent;
  color: inherit;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}
.retry-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 18px;
}
.card-label {
  color: #6b7280;
  font-size: 0.85rem;
}
.card-value {
  font-size: 1.5rem;
  font-weight: 700;
  margin: 6px 0 6px;
}
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 18px;
  margin-bottom: 20px;
}
.panel h2 {
  margin: 0 0 12px;
  font-size: 1.1rem;
}
/* Header row for a panel whose action sits opposite its title. Wraps rather
   than shrinking the button, so the label stays readable at 320px. */
.panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.panel-head h2 {
  margin-bottom: 4px;
}
.panel-head p {
  margin: 0;
  max-width: 60ch;
}
.disclosure-panel .notice {
  margin-top: 12px;
}
/* Matches the earnings-page export control — same affordance, same page family. */
.export-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.export-btn:hover {
  border-color: #9ca3af;
  background: #f9fafb;
}
.export-btn:focus-visible {
  outline: 2px solid #058526;
  outline-offset: 2px;
}
.export-btn .material-symbols-outlined {
  font-size: 1.05rem;
}
.table-scroll {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table th,
.data-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid #f1f5f9;
  font-size: 0.9rem;
  white-space: nowrap;
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
.proj-link {
  color: #058526;
  font-weight: 600;
  text-decoration: none;
}
.proj-link:hover {
  text-decoration: underline;
}
.badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: capitalize;
  background: #e5e7eb;
  color: #374151;
}
.badge.validated,
.badge.approved {
  background: #d1fae5;
  color: #065f46;
}
.badge.submitted,
.badge.in_review,
.badge.under_review {
  background: #dbeafe;
  color: #1e40af;
}
.badge.needs_revision {
  background: #fef3c7;
  color: #92400e;
}
.badge.rejected {
  background: #fee2e2;
  color: #991b1b;
}
.legend {
  margin: 12px 0 0;
}
.btn-primary {
  background: #058526;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 18px;
  cursor: pointer;
  font-weight: 600;
  text-decoration: none;
  display: inline-block;
}
.empty {
  text-align: center;
  padding: 48px 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
}
.empty-icon {
  font-size: 48px;
  color: #058526;
}
.empty h2 {
  margin: 12px 0 6px;
  font-size: 1.2rem;
}
.empty p {
  max-width: 420px;
  margin: 0 auto 18px;
}
@media (max-width: 640px) {
  .asset-ledger {
    padding: 16px 12px;
  }
  .cards {
    grid-template-columns: 1fr;
  }
}
</style>
