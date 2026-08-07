<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import PageHeader from '@/components/layout/PageHeader.vue'
import { peso, shortDate } from '@/utils/format'
import { getWalletBalance } from '@/services/walletService'
import {
  listMyFeeInvoices,
  fetchProjectTitles,
  payFeeFromWallet,
  startFeeCheckout,
  totalOutstanding,
  payableFromWallet,
  FEE_TYPE_LABELS,
  FEE_STATUS_LABELS,
} from '@/services/projectFeeService'

/**
 * Developer-facing fee statement.
 *
 * Onboarding and verification fees are invoiced at *validation* and *report
 * approval* — never at submission — so everything listed here is a charge for a
 * decision the platform has already delivered. Nothing on this page can create
 * an invoice or alter an amount; the raising function is revoked from
 * `authenticated` in the database.
 */

const route = useRoute()

const loading = ref(true)
const loadError = ref('')
const actionError = ref('')
const invoices = ref([])
const titles = ref({})
const balance = ref(0)
const balanceError = ref('')
const busyId = ref(null)

// Set by the PayMongo redirect. The invoice is marked paid by the WEBHOOK, not
// by this page — a success banner here reports that the payment provider
// accepted the payment, which is not the same claim as "the fee is settled".
const justReturned = computed(() => route.query.status === 'success')
const wasCancelled = computed(() => route.query.cancelled === 'true')

const outstanding = computed(() => totalOutstanding(invoices.value))
const dueInvoices = computed(() => invoices.value.filter((i) => i.status === 'due'))
const settledInvoices = computed(() => invoices.value.filter((i) => i.status !== 'due'))

function projectTitle(id) {
  return titles.value[id] || 'Untitled project'
}

function walletVerdict(invoice) {
  return payableFromWallet(invoice, balance.value)
}

async function load() {
  loading.value = true
  loadError.value = ''
  try {
    invoices.value = await listMyFeeInvoices()
    titles.value = await fetchProjectTitles(invoices.value)
  } catch (err) {
    // Never fall back to an empty list: "you owe nothing" is a claim about this
    // user's account, and a failed read is not evidence for it.
    loadError.value = err?.message || 'Failed to load your fees.'
  } finally {
    loading.value = false
  }

  // The balance is a convenience for the wallet button. Its failure disables
  // that button with a stated reason; it does not hide the invoices.
  try {
    const wallet = await getWalletBalance()
    balance.value = Number(wallet?.current_balance) || 0
    balanceError.value = ''
  } catch (err) {
    balance.value = 0
    balanceError.value = err?.message || 'Wallet balance unavailable.'
  }
}

async function onPayFromWallet(invoice) {
  actionError.value = ''
  busyId.value = invoice.id
  try {
    await payFeeFromWallet(invoice.id)
    await load()
  } catch (err) {
    actionError.value = err?.message || 'Payment failed.'
  } finally {
    busyId.value = null
  }
}

async function onPayByCard(invoice) {
  actionError.value = ''
  busyId.value = invoice.id
  try {
    const result = await startFeeCheckout(invoice.id)
    const url = result?.checkout_url || result?.checkoutUrl
    if (!url) throw new Error('The payment provider did not return a checkout link.')
    window.location.href = url
  } catch (err) {
    actionError.value = err?.message || 'Could not start the checkout.'
    busyId.value = null
  }
}

onMounted(load)
</script>

<template>
  <div class="fees-page">
    <PageHeader
      title="Project fees"
      subtitle="Onboarding and verification charges on your projects"
    />

    <div class="fees-body">
      <div v-if="justReturned" class="banner banner-info">
        Your payment was submitted. The fee is marked paid once the payment provider confirms it —
        this usually takes a few seconds. Reload if it still shows as due.
      </div>
      <div v-if="wasCancelled" class="banner banner-warn">
        Checkout was cancelled. Nothing has been charged.
      </div>

      <div v-if="loading" class="state">Loading your fees…</div>

      <div v-else-if="loadError" class="banner banner-error">
        <strong>Your fees could not be loaded.</strong>
        <p>{{ loadError }}</p>
        <button class="btn" type="button" @click="load">Try again</button>
      </div>

      <template v-else>
        <div class="summary">
          <div class="summary-tile">
            <span class="tile-label">Outstanding</span>
            <span class="tile-value">{{ peso(outstanding) }}</span>
          </div>
          <div class="summary-tile">
            <span class="tile-label">Wallet balance</span>
            <span class="tile-value">{{ balanceError ? '—' : peso(balance) }}</span>
            <span v-if="balanceError" class="tile-note">{{ balanceError }}</span>
          </div>
        </div>

        <div v-if="actionError" class="banner banner-error">{{ actionError }}</div>

        <section class="section">
          <h2>Due</h2>
          <p v-if="dueInvoices.length === 0" class="state">
            No fees are outstanding. Fees are raised when a project is validated or a monitoring
            report is approved.
          </p>
          <table v-else class="fees-table">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Fee</th>
                <th scope="col">Raised</th>
                <th scope="col" class="right">Amount</th>
                <th scope="col" class="right">Pay</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="invoice in dueInvoices" :key="invoice.id">
                <td>{{ projectTitle(invoice.project_id) }}</td>
                <td>{{ FEE_TYPE_LABELS[invoice.fee_type] || invoice.fee_type }}</td>
                <td>{{ shortDate(invoice.created_at) }}</td>
                <td class="right">{{ peso(invoice.amount) }}</td>
                <td class="right actions">
                  <button
                    class="btn btn-primary"
                    type="button"
                    :disabled="busyId === invoice.id || !walletVerdict(invoice).payable"
                    :title="walletVerdict(invoice).reason"
                    @click="onPayFromWallet(invoice)"
                  >
                    Wallet
                  </button>
                  <button
                    class="btn"
                    type="button"
                    :disabled="busyId === invoice.id"
                    @click="onPayByCard(invoice)"
                  >
                    Card / GCash
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="dueInvoices.length" class="hint">
            A due fee does not suspend your project, its listings, or credit issuance.
          </p>
        </section>

        <section v-if="settledInvoices.length" class="section">
          <h2>History</h2>
          <table class="fees-table">
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col">Fee</th>
                <th scope="col">Status</th>
                <th scope="col">Settled</th>
                <th scope="col" class="right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="invoice in settledInvoices" :key="invoice.id">
                <td>{{ projectTitle(invoice.project_id) }}</td>
                <td>{{ FEE_TYPE_LABELS[invoice.fee_type] || invoice.fee_type }}</td>
                <td>
                  {{ FEE_STATUS_LABELS[invoice.status] || invoice.status }}
                  <span v-if="invoice.waived_reason" class="tile-note">
                    — {{ invoice.waived_reason }}
                  </span>
                </td>
                <td>{{ invoice.paid_at ? shortDate(invoice.paid_at) : '—' }}</td>
                <td class="right">{{ peso(invoice.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.fees-page {
  min-height: 100vh;
  background: var(--bg-primary, #ffffff);
}
.fees-body {
  max-width: 1000px;
  margin: 0 auto;
  padding: 1.5rem 1rem 4rem;
}
.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.summary-tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 1rem 1.25rem;
  border: 1px solid var(--border-color, #e5e7eb);
  border-radius: 10px;
  min-width: 200px;
}
.tile-label {
  font-size: 0.8rem;
  color: var(--text-secondary, #6b7280);
}
.tile-value {
  font-size: 1.5rem;
  font-weight: 700;
}
.tile-note {
  font-size: 0.75rem;
  color: var(--text-secondary, #6b7280);
}
.section {
  margin-bottom: 2rem;
}
.section h2 {
  font-size: 1.1rem;
  margin-bottom: 0.75rem;
}
.fees-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.fees-table th,
.fees-table td {
  padding: 0.6rem 0.5rem;
  border-bottom: 1px solid var(--border-color, #e5e7eb);
  text-align: left;
}
.fees-table th {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-secondary, #6b7280);
}
.right {
  text-align: right;
}
.actions {
  display: flex;
  gap: 0.4rem;
  justify-content: flex-end;
}
.btn {
  padding: 0.4rem 0.75rem;
  border: 1px solid var(--border-color, #d1d5db);
  border-radius: 6px;
  background: var(--bg-primary, #fff);
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-primary {
  background: var(--color-primary, #16a34a);
  border-color: var(--color-primary, #16a34a);
  color: #fff;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.banner {
  padding: 0.85rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}
.banner-info {
  background: #eff6ff;
  color: #1e3a8a;
}
.banner-warn {
  background: #fffbeb;
  color: #92400e;
}
.banner-error {
  background: #fef2f2;
  color: #991b1b;
}
.state {
  color: var(--text-secondary, #6b7280);
  padding: 1rem 0;
}
.hint {
  margin-top: 0.6rem;
  font-size: 0.8rem;
  color: var(--text-secondary, #6b7280);
}
</style>
