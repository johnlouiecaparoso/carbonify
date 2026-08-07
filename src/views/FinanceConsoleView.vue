<template>
  <div class="finance-page">
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">Finance Console</h1>
        <p class="page-description">Platform sales, fees, payouts, and book reconciliation.</p>
      </div>
    </div>

    <div class="container content">
      <div v-if="error" class="state error">{{ error }}</div>

      <!-- Summary cards -->
      <div class="cards">
        <div class="card">
          <span class="card-label">Gross Sales</span>
          <span class="card-value">{{ peso(summary.gross_sales) }}</span>
        </div>
        <div class="card">
          <span class="card-label">Platform Revenue</span>
          <span class="card-value">{{ peso(summary.platform_revenue) }}</span>
        </div>
        <div class="card">
          <span class="card-label">Fees Collected</span>
          <span class="card-value">{{ peso(summary.total_fees) }}</span>
        </div>
        <div class="card">
          <span class="card-label">Transactions</span>
          <span class="card-value">{{ summary.transaction_count.toLocaleString() }}</span>
        </div>
        <div class="card">
          <span class="card-label">Pending Payouts</span>
          <span class="card-value">{{ peso(summary.pending_payouts) }}</span>
        </div>
        <div class="card">
          <span class="card-label">Settled Payouts</span>
          <span class="card-value">{{ peso(summary.settled_payouts) }}</span>
        </div>
      </div>

      <!-- Reconciliation -->
      <section class="panel">
        <div class="panel-head">
          <h2>Book Reconciliation</h2>
          <!-- Grouped so `space-between` distributes heading-vs-actions rather
               than heading-vs-Refresh-vs-Export, which is what spread the two
               buttons to opposite ends of a phone-width row. -->
          <div class="panel-head__actions">
            <button class="btn" :disabled="loading" @click="refresh">
              {{ loading ? 'Refreshing…' : 'Refresh' }}
            </button>
            <button
              class="btn"
              :disabled="loading || !transactions.length"
              :title="`Export ${transactions.length} transaction(s) as CSV`"
              @click="exportCsv"
            >
              Export CSV
            </button>
          </div>
        </div>
        <div v-if="drift.length === 0" class="recon-ok">
          <span class="material-symbols-outlined inline-ico" aria-hidden="true">check_circle</span> Books balanced — no drift detected.
        </div>
        <div v-else class="recon-bad">
          <p><span class="material-symbols-outlined inline-ico" aria-hidden="true">warning</span> {{ drift.length }} issue{{ drift.length === 1 ? '' : 's' }} detected:</p>
          <CollapsibleList :count="drift.length" row-selector="li">
            <ul>
              <li v-for="(d, i) in drift" :key="i">
                <strong>{{ d.issue_type }}</strong>
                <span class="muted"> · {{ d.ref_id }}</span> — {{ d.detail }}
              </li>
            </ul>
          </CollapsibleList>
        </div>
      </section>

      <!-- Transactions -->
      <section class="panel">
        <div class="panel-head">
          <h2>Recent Transactions</h2>
        </div>
        <div v-if="loading && !transactions.length" class="state">Loading…</div>
        <div v-else-if="!transactions.length" class="state">No transactions yet.</div>
        <CollapsibleList v-else :count="transactions.length">
          <table class="tx-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Buyer</th>
                <th>Seller</th>
                <th class="num">Qty</th>
                <th class="num">Amount</th>
                <th class="num">Fee</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in transactions" :key="tx.id">
                <td>{{ formatDate(tx.created_at) }}</td>
                <td>{{ tx.buyer_name }}</td>
                <td>{{ tx.seller_name }}</td>
                <td class="num">{{ Number(tx.quantity).toLocaleString() }}</td>
                <td class="num">{{ peso(tx.total_amount) }}</td>
                <td class="num">{{ peso(tx.transaction_fee) }}</td>
                <td>
                  <span class="status" :class="tx.status">{{ tx.status }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </CollapsibleList>
      </section>

      <!-- Project fees — the onboarding / verification revenue stream. -->
      <section class="panel">
        <div class="panel-head">
          <h2>Project Fees</h2>
          <span class="panel-note">
            Outstanding {{ peso(feesOutstanding) }} across {{ feeDueCount }} invoice(s)
          </span>
        </div>
        <div v-if="feeError" class="state">{{ feeError }}</div>
        <div v-else-if="loading && !feeInvoices.length" class="state">Loading…</div>
        <div v-else-if="!feeInvoices.length" class="state">
          No fee invoices yet. Fees are raised at validation and report approval, and only when a
          non-zero amount is configured in System Configuration.
        </div>
        <CollapsibleList v-else :count="feeInvoices.length">
          <table class="tx-table">
            <thead>
              <tr>
                <th>Raised</th>
                <th>Fee</th>
                <th>Status</th>
                <th class="num">Amount</th>
                <th class="num">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="inv in feeInvoices" :key="inv.id">
                <td>{{ formatDate(inv.created_at) }}</td>
                <td>{{ FEE_TYPE_LABELS[inv.fee_type] || inv.fee_type }}</td>
                <td>
                  <span class="status" :class="inv.status">{{ inv.status }}</span>
                </td>
                <td class="num">{{ peso(inv.amount) }}</td>
                <td class="num">
                  <button
                    v-if="inv.status === 'due'"
                    class="btn-link"
                    type="button"
                    :disabled="waivingId === inv.id"
                    @click="onWaive(inv)"
                  >
                    Waive
                  </button>
                  <span v-else>—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </CollapsibleList>
      </section>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import CollapsibleList from '@/components/ui/CollapsibleList.vue'
import {
  getFinanceSummary,
  getRecentTransactions,
  getReconciliation,
} from '@/services/adminFinanceService'
import { exportTransactionsCsv } from '@/services/adminExportService'
import {
  listAllFeeInvoices,
  waiveFee,
  totalOutstanding,
  FEE_TYPE_LABELS,
} from '@/services/projectFeeService'
import { peso } from '@/utils/format'

const loading = ref(false)
const error = ref('')
const summary = ref({
  gross_sales: 0,
  total_fees: 0,
  transaction_count: 0,
  platform_revenue: 0,
  pending_payouts: 0,
  settled_payouts: 0,
  drift_count: 0,
})
const transactions = ref([])
const drift = ref([])

const feeInvoices = ref([])
const feeError = ref('')
const waivingId = ref(null)
const feesOutstanding = computed(() => totalOutstanding(feeInvoices.value))
const feeDueCount = computed(() => feeInvoices.value.filter((i) => i.status === 'due').length)

async function onWaive(invoice) {
  const reason = window.prompt(
    `Waive the ${invoice.fee_type} fee of ${peso(invoice.amount)}?\nReason (recorded against the invoice):`,
  )
  if (reason === null) return // cancelled — an empty string is a valid "no reason given"

  waivingId.value = invoice.id
  feeError.value = ''
  try {
    await waiveFee(invoice.id, reason)
    feeInvoices.value = await listAllFeeInvoices()
  } catch (e) {
    feeError.value = e?.message || 'Failed to waive the fee.'
  } finally {
    waivingId.value = null
  }
}

function formatDate(value) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function exportCsv() {
  exportTransactionsCsv(transactions.value)
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    // allSettled, not all: getReconciliation() scans for ledger drift and is the
    // flakiest of the three. Failing it used to blank the whole console --
    // summary, transactions and all -- leaving the platform owner with no money
    // visibility at all rather than one empty panel.
    const [sRes, txRes, dRes, feeRes] = await Promise.allSettled([
      getFinanceSummary(),
      getRecentTransactions(50),
      getReconciliation(),
      listAllFeeInvoices(),
    ])

    if (sRes.status === 'fulfilled') summary.value = sRes.value
    if (txRes.status === 'fulfilled') transactions.value = txRes.value
    if (dRes.status === 'fulfilled') drift.value = dRes.value
    if (feeRes.status === 'fulfilled') {
      feeInvoices.value = feeRes.value
      feeError.value = ''
    } else {
      // Named rather than shown as an empty panel: "no fee invoices" and "the
      // fee read failed" are different facts about the platform's revenue.
      feeError.value = feeRes.reason?.message || 'Fee invoices could not be loaded.'
    }

    const failed = [
      sRes.status === 'rejected' && 'summary',
      txRes.status === 'rejected' && 'transactions',
      dRes.status === 'rejected' && 'reconciliation',
      feeRes.status === 'rejected' && 'project fees',
    ].filter(Boolean)

    // Name what is missing, so a partially-loaded console is never mistaken for
    // a complete one.
    if (failed.length) {
      error.value = `Could not load: ${failed.join(', ')}. The rest of this page is current.`
    }
  } catch (e) {
    error.value = e?.message || 'Failed to load finance data.'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<style scoped>
.finance-page {
  min-height: 100vh;
  background: var(--bg-primary, #f8fafc);
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
  margin: 0;
}
.content {
  padding: 1.5rem 1.5rem 3rem;
}
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.card-label {
  font-size: 0.8rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.card-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: #0f172a;
}
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.panel-head h2 {
  margin: 0;
  font-size: 1.15rem;
}
.panel-head__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.btn {
  padding: 0.5rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  font-weight: 600;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.recon-ok {
  color: #166534;
  background: #dcfce7;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 0.75rem 1rem;
  font-weight: 600;
}
.recon-bad {
  color: #991b1b;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  padding: 0.75rem 1rem;
}
.recon-bad ul {
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
}
.tx-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.tx-table th,
.tx-table td {
  padding: 0.6rem 0.5rem;
  border-bottom: 1px solid #f1f5f9;
  text-align: left;
}
.tx-table th.num,
.tx-table td.num {
  text-align: right;
}
.tx-table th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #6b7280;
}
.status {
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: capitalize;
  background: #f3f4f6;
  color: #374151;
}
.status.completed,
.status.paid {
  background: #dcfce7;
  color: #166534;
}
.status.due {
  background: #fef3c7;
  color: #92400e;
}
.status.waived,
.status.void {
  background: #e5e7eb;
  color: #4b5563;
}
.panel-note {
  font-size: 0.8rem;
  color: #6b7280;
}
.btn-link {
  border: none;
  background: none;
  padding: 0;
  color: #2563eb;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.btn-link:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.status.refunded,
.status.failed {
  background: #fee2e2;
  color: #991b1b;
}
.muted {
  color: #6b7280;
}
.state {
  padding: 1.5rem;
  text-align: center;
  color: #6b7280;
}
.state.error {
  color: #dc2626;
  background: #fef2f2;
  border: 1px solid #fecaca;
  border-radius: 8px;
  margin-bottom: 1rem;
}
@media (max-width: 640px) {
  .container {
    padding: 0 1rem;
  }
  .content {
    padding: 1rem 1rem 2.5rem;
  }

  .tx-table {
    font-size: 0.82rem;
    white-space: nowrap;
  }

  /* Heading on its own line, then Refresh and Export CSV as an equal-width
     pair. Previously they were two differently-sized buttons pushed to
     opposite edges by `space-between`, which is the misalignment reported on
     the finance console in mobile. */
  .panel-head__actions {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  .panel-head__actions .btn {
    width: 100%;
    padding: 0.5rem 0.5rem;
    font-size: 0.85rem;
  }
}

.inline-ico {
  font-size: 1.05em;
  vertical-align: -3px;
}
</style>
