<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import CollapsibleList from '@/components/ui/CollapsibleList.vue'
import {
  listRecentTransactions,
  listAllDisputes,
  adminRefundTransaction,
  resolveDispute,
} from '@/services/disputeService'

const loading = ref(true)
const loadError = ref('')
const activeTab = ref('transactions')
const transactions = ref([])
const disputes = ref([])
const busyId = ref(null)
const toast = ref('')

// Inline refund confirmation for a transaction.
const refundTarget = ref(null) // transaction id
const refundReason = ref('')

const openDisputes = computed(() => disputes.value.filter((d) => d.status === 'open'))
const resolvedDisputes = computed(() => disputes.value.filter((d) => d.status !== 'open'))

function peso(n) {
  return `₱${Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
function shortDate(d) {
  return d ? new Date(d).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—'
}
function disputeStatusLabel(s) {
  return { open: 'Open', resolved_refunded: 'Refunded', resolved_rejected: 'Rejected' }[s] || s
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    // Previously Promise.all with no catch: either query throwing left the page
    // silently empty, with no error and no indication anything had failed.
    const [txRes, dispRes] = await Promise.allSettled([
      listRecentTransactions(100),
      listAllDisputes(),
    ])
    if (txRes.status === 'fulfilled') transactions.value = txRes.value
    if (dispRes.status === 'fulfilled') disputes.value = dispRes.value

    const failed = [
      txRes.status === 'rejected' && 'transactions',
      dispRes.status === 'rejected' && 'disputes',
    ].filter(Boolean)
    if (failed.length) loadError.value = `Could not load: ${failed.join(', ')}.`
  } finally {
    loading.value = false
  }
}

function startRefund(txn) {
  refundTarget.value = txn.id
  refundReason.value = ''
  toast.value = ''
}
function cancelRefund() {
  refundTarget.value = null
  refundReason.value = ''
}

async function confirmRefund(txn) {
  busyId.value = txn.id
  try {
    await adminRefundTransaction(txn.id, refundReason.value)
    toast.value = `Refunded ${peso(txn.total_amount)} (${txn.buyer_name}). Re-check reconcile_financials().`
    cancelRefund()
    await load()
  } catch (err) {
    toast.value = err.message || 'Refund failed.'
  } finally {
    busyId.value = null
  }
}

async function resolve(dispute, refund) {
  busyId.value = dispute.id
  toast.value = ''
  try {
    await resolveDispute(dispute.id, refund, dispute._notes || '')
    toast.value = `Dispute ${refund ? 'refunded' : 'rejected'}.`
    await load()
  } catch (err) {
    toast.value = err.message || 'Resolve failed.'
  } finally {
    busyId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="refunds">
    <PageHeader title="Refunds &amp; Disputes">
      <template #description>
        Refund a transaction directly, or resolve a buyer-opened dispute. Refunds post
        compensating ledger entries — re-check <code>reconcile_financials()</code> after each.
      </template>
    </PageHeader>

    <div class="page-body">

    <div class="tabs">
      <button :class="['tab', { active: activeTab === 'transactions' }]" @click="activeTab = 'transactions'">
        Transactions
      </button>
      <button :class="['tab', { active: activeTab === 'disputes' }]" @click="activeTab = 'disputes'">
        Open disputes<span class="tab-count">{{ openDisputes.length }}</span>
      </button>
    </div>

    <p v-if="toast" class="toast">{{ toast }}</p>
    <div v-if="loadError" class="admin-load-error">{{ loadError }}</div>
    <div v-if="loading" class="muted">Loading…</div>

    <!-- Transactions -->
    <section v-else-if="activeTab === 'transactions'" class="panel">
      <CollapsibleList v-if="transactions.length" :count="transactions.length">
        <table class="data-table">
          <thead>
            <tr><th>Date</th><th>Buyer</th><th>Seller</th><th>Qty</th><th>Amount</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            <template v-for="t in transactions" :key="t.id">
              <tr>
                <td>{{ shortDate(t.created_at) }}</td>
                <td>{{ t.buyer_name }}</td>
                <td>{{ t.seller_name }}</td>
                <td>{{ t.quantity }}</td>
                <td>{{ peso(t.total_amount) }}</td>
                <td><span class="badge" :class="t.status">{{ t.status }}</span></td>
                <td class="right">
                  <button
                    v-if="t.status === 'completed' && refundTarget !== t.id"
                    class="btn refund"
                    @click="startRefund(t)"
                  >
                    Refund
                  </button>
                </td>
              </tr>
              <tr v-if="refundTarget === t.id" class="confirm-row">
                <td colspan="7">
                  <div class="confirm">
                    <span>Refund {{ peso(t.total_amount) }} to {{ t.buyer_name }}?</span>
                    <input v-model="refundReason" type="text" class="reason" placeholder="Reason (optional)" />
                    <div class="confirm-actions">
                      <button class="btn ghost" :disabled="busyId === t.id" @click="cancelRefund">Cancel</button>
                      <button class="btn refund" :disabled="busyId === t.id" @click="confirmRefund(t)">
                        {{ busyId === t.id ? 'Refunding…' : 'Confirm refund' }}
                      </button>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </CollapsibleList>
      <p v-else class="muted">No transactions.</p>
    </section>

    <!-- Disputes -->
    <section v-else class="panel">
      <CollapsibleList
        v-if="openDisputes.length"
        :count="openDisputes.length"
        :visible="2"
        row-selector=".dispute-card"
      >
      <div class="disputes">
        <article v-for="d in openDisputes" :key="d.id" class="dispute-card">
          <div class="dispute-head">
            <span class="badge open">Open</span>
            <span class="muted small">{{ shortDate(d.created_at) }}</span>
          </div>
          <p class="dispute-reason">{{ d.reason }}</p>
          <p class="muted small">Transaction: {{ d.transaction_id }}</p>
          <input v-model="d._notes" type="text" class="reason" placeholder="Resolution notes (optional)" />
          <div class="confirm-actions">
            <button class="btn ghost" :disabled="busyId === d.id" @click="resolve(d, false)">Reject</button>
            <button class="btn refund" :disabled="busyId === d.id" @click="resolve(d, true)">
              {{ busyId === d.id ? 'Working…' : 'Refund' }}
            </button>
          </div>
        </article>
      </div>
      </CollapsibleList>
      <p v-else class="muted">No open disputes.</p>

      <div v-if="resolvedDisputes.length" class="resolved">
        <h3>Resolved</h3>
        <CollapsibleList :count="resolvedDisputes.length" row-selector="li">
          <ul>
            <li v-for="d in resolvedDisputes" :key="d.id">
              <span class="badge" :class="d.status">{{ disputeStatusLabel(d.status) }}</span>
              {{ d.reason }} <span class="muted small">· {{ shortDate(d.resolved_at) }}</span>
            </li>
          </ul>
        </CollapsibleList>
      </div>
    </section>
    </div>
  </div>
</template>

<style scoped>
.refunds {
  min-height: 100vh;
  background: var(--bg-secondary, #f8fdf8);
}

.page-body {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px;
}
.page-head h1 {
  margin: 0;
  font-size: 1.6rem;
}
.page-head p {
  color: #6b7280;
  margin: 4px 0 20px;
  max-width: 640px;
}
code {
  background: #f1f5f9;
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 0.85em;
}
.muted {
  color: #6b7280;
}
.small {
  font-size: 0.8rem;
}
.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.tab {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
  font-weight: 600;
  color: #374151;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.tab.active {
  background: var(--primary-color, #058526);
  border-color: var(--primary-color, #058526);
  color: #fff;
}
.tab-count {
  background: rgba(0, 0, 0, 0.08);
  border-radius: 999px;
  padding: 0 7px;
  font-size: 0.75rem;
}
.tab.active .tab-count {
  background: rgba(255, 255, 255, 0.25);
}
.toast {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  padding: 10px 14px;
  border-radius: 8px;
  margin-bottom: 16px;
}
.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 18px;
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
.data-table .right {
  text-align: right;
}
.badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: capitalize;
  background: #e5e7eb;
}
.badge.completed {
  background: #d1fae5;
  color: #065f46;
}
.badge.refunded,
.badge.resolved_refunded {
  background: #fee2e2;
  color: #991b1b;
}
.badge.open {
  background: #fef3c7;
  color: #92400e;
}
.badge.resolved_rejected {
  background: #e5e7eb;
  color: #374151;
}
.confirm-row td {
  background: #fffbeb;
}
.confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.reason {
  flex: 1;
  min-width: 180px;
  padding: 7px 10px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 0.88rem;
}
.confirm-actions {
  display: flex;
  gap: 10px;
}
.btn {
  border: none;
  border-radius: 8px;
  padding: 7px 16px;
  cursor: pointer;
  font-weight: 600;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn.refund {
  background: #ef4444;
  color: #fff;
}
.btn.ghost {
  background: #fff;
  border: 1px solid #d1d5db;
  color: #374151;
}
.disputes {
  display: grid;
  gap: 14px;
}
.dispute-card {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 14px;
}
.dispute-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.dispute-reason {
  margin: 0 0 6px;
  color: #111827;
}
.dispute-card .reason {
  width: 100%;
  margin: 8px 0;
}
.resolved {
  margin-top: 20px;
  border-top: 1px solid #f1f5f9;
  padding-top: 12px;
}
.resolved h3 {
  font-size: 1rem;
  margin: 0 0 8px;
}
.resolved ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 6px;
}
.resolved li {
  font-size: 0.88rem;
  color: #374151;
}

.admin-load-error {
  margin-bottom: 1rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  font-size: 0.86rem;
}
</style>
