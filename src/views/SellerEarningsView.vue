<script setup>
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import {
  getSellerBalance,
  getMySales,
  getMySalesByProject,
  getMyPayouts,
  getMyEscrowHolds,
  nextEscrowRelease,
} from '@/services/payoutService'
import { getMyKyb } from '@/services/kybService'
import { exportSalesCsv, exportSalesByProjectCsv } from '@/services/sellerExportService'
import { peso, shortDate } from '@/utils/format'
import Withdraw from '@/components/wallet/Withdraw.vue'
import KybForm from '@/components/wallet/KybForm.vue'

const loading = ref(true)
const loadError = ref('')
const balance = ref({ available: 0, held: 0, currency: 'PHP' })
const sales = ref([])
const salesByProject = ref([])
const payouts = ref([])
const kyb = ref({ verified: false, application: null })
const escrowHolds = ref([])
const sectionErrors = ref({ sales: false, byProject: false, payouts: false })
const kybUnknown = ref(false)
const showWithdraw = ref(false)
const showKyb = ref(false)

const nextRelease = computed(() => nextEscrowRelease(escrowHolds.value))

const completedSales = computed(() => sales.value.filter((s) => s.status === 'completed'))

const totalEarned = computed(() =>
  completedSales.value.reduce((sum, s) => sum + Number(s.total_amount || 0), 0),
)
// Gross is what the buyer paid; net is what reaches this seller's balance. The
// page showed only gross, so a seller could not reconcile "I sold PHP 10,000"
// against a smaller available balance — the fee was recorded per transaction
// but never queried or displayed.
const totalFees = computed(() =>
  completedSales.value.reduce((sum, s) => sum + Number(s.transaction_fee || 0), 0),
)
const totalNet = computed(() => totalEarned.value - totalFees.value)
const creditsSold = computed(() =>
  completedSales.value.reduce((sum, s) => sum + Number(s.quantity || 0), 0),
)


async function load() {
  loading.value = true
  loadError.value = ''

  // allSettled, not all: this is the page a seller comes to in order to see
  // their money and withdraw it. Under Promise.all a failure in any ONE of the
  // five — the per-project rollup, the payout history, the KYB lookup — threw
  // away the balance too and left the whole page on an error card. The same
  // reasoning is spelled out in BuyerDashboardView.
  const [b, s, sp, p, k, e] = await Promise.allSettled([
    getSellerBalance(),
    getMySales(),
    getMySalesByProject(),
    getMyPayouts(),
    getMyKyb(),
    getMyEscrowHolds(),
  ])

  if (b.status === 'fulfilled') balance.value = b.value
  if (s.status === 'fulfilled') sales.value = s.value || []
  if (sp.status === 'fulfilled') salesByProject.value = sp.value || []
  if (p.status === 'fulfilled') payouts.value = p.value || []
  if (k.status === 'fulfilled') kyb.value = k.value
  if (e.status === 'fulfilled') escrowHolds.value = e.value || []

  // Per-section, because "No sales yet" and "we could not load your sales" are
  // completely different statements to make to someone about their own money,
  // and an empty list cannot tell them apart.
  sectionErrors.value = {
    sales: s.status === 'rejected',
    byProject: sp.status === 'rejected',
    payouts: p.status === 'rejected',
  }
  // Unknown is its own state, distinct from "not verified". Withdraw stays
  // disabled either way — the server is the real gate, and refusing on unknown
  // is the safe direction — but we do not accuse a verified seller of being
  // unverified because a lookup failed.
  kybUnknown.value = k.status === 'rejected'
  for (const [label, r] of [['sales', s], ['earnings by project', sp], ['withdrawals', p], ['escrow', e], ['KYB', k]]) {
    if (r.status === 'rejected') console.error(`Failed to load ${label}:`, r.reason)
  }

  // Only the balance is load-bearing enough to replace the page: without it we
  // cannot honestly show what is withdrawable, and the withdraw action would be
  // operating on a zero we invented.
  if (b.status === 'rejected') {
    console.error('Failed to load seller balance:', b.reason)
    loadError.value =
      b.reason?.message || 'We could not load your earnings right now. Please try again.'
  }

  loading.value = false
}

function onWithdrawSuccess() {
  showWithdraw.value = false
  load()
}

function onKybSuccess() {
  showKyb.value = false
  load()
}

onMounted(load)
</script>

<template>
  <div class="seller-earnings">
    <PageHeader
      title="Seller Earnings"
      description="Your sales, balance, and withdrawals."
    />

    <div class="page-body">

    <div v-if="loading" class="muted">Loading…</div>

    <div v-else-if="loadError" class="notice error">
      <span class="material-symbols-outlined" aria-hidden="true">error</span>
      <div class="notice-body">
        <strong>Couldn't load your earnings.</strong>
        {{ loadError }}
        <div><button class="retry-btn" @click="load">Try again</button></div>
      </div>
    </div>

    <template v-else>
      <!-- KYB status could not be read — say so, rather than asserting a status -->
      <div v-if="kybUnknown" class="notice warn">
        <span class="material-symbols-outlined" aria-hidden="true">help</span>
        <div class="notice-body">
          <strong>We couldn't check your business verification.</strong>
          Withdrawals stay disabled until we can confirm it. This is a problem on our side, not a
          decision about your account.
          <div class="notice-action"><button class="btn-primary sm" @click="load">Try again</button></div>
        </div>
      </div>

      <!-- KYB gate notice -->
      <div v-else-if="!kyb.verified" class="notice warn">
        <span class="material-symbols-outlined" aria-hidden="true">verified_user</span>
        <div class="notice-body">
          <strong>Business verification required.</strong>
          You must complete KYB before withdrawing earnings.
          <template v-if="kyb.application?.status === 'pending'">
            Your submission is <strong>pending review</strong>.
          </template>
          <template v-else-if="kyb.application?.status === 'rejected'">
            Your last submission was <strong>rejected</strong>.
            <template v-if="kyb.application.review_notes"> Note: {{ kyb.application.review_notes }}.</template>
          </template>
          <div v-if="kyb.application?.status !== 'pending'" class="notice-action">
            <button class="btn-primary sm" @click="showKyb = true">
              {{ kyb.application?.status === 'rejected' ? 'Resubmit verification' : 'Verify your business' }}
            </button>
          </div>
        </div>
      </div>

      <!-- Balance cards -->
      <section class="cards">
        <div class="card">
          <div class="card-label">Available to withdraw</div>
          <div class="card-value">{{ peso(balance.available) }}</div>
          <button
            class="btn-primary"
            :disabled="!kyb.verified || kybUnknown || balance.available <= 0"
            @click="showWithdraw = true"
          >
            Withdraw
          </button>
        </div>
        <div class="card">
          <div class="card-label">Held in escrow</div>
          <div class="card-value">{{ peso(balance.held) }}</div>
          <!-- "Released after the hold period" was all this said. The date has
               always been on escrow_holds.hold_until, and sellers have always
               been able to read their own rows; nothing queried it. -->
          <div v-if="nextRelease" class="muted small">
            Next {{ peso(nextRelease.amount) }} releases {{ shortDate(nextRelease.holdUntil) }}
          </div>
          <div v-else class="muted small">Released after the hold period</div>
        </div>
        <div class="card">
          <div class="card-label">Net earned</div>
          <div class="card-value">{{ peso(totalNet) }}</div>
          <!-- Both figures, because the gap between them is the question a
               seller asks first. "Total earned" alone read as gross and did not
               reconcile against the balance beside it. -->
          <div class="muted small">
            {{ peso(totalEarned) }} gross
            <template v-if="totalFees > 0">less {{ peso(totalFees) }} in fees</template>
            · {{ creditsSold }} credits sold
          </div>
        </div>
      </section>

      <!-- KYB submission modal -->
      <div v-if="showKyb" class="modal-overlay" v-modal-a11y="() => (showKyb = false)" @click.self="showKyb = false">
        <div class="modal">
          <KybForm @success="onKybSuccess" @cancel="showKyb = false" />
        </div>
      </div>

      <!-- Withdraw modal -->
      <div v-if="showWithdraw" class="modal-overlay" v-modal-a11y="() => (showWithdraw = false)" @click.self="showWithdraw = false">
        <div class="modal">
          <Withdraw @success="onWithdrawSuccess" @cancel="showWithdraw = false" />
        </div>
      </div>

      <!-- Earnings by project -->
      <section class="panel">
        <div class="panel-head">
          <h2>Earnings by project</h2>
          <button
            v-if="salesByProject.length"
            class="export-btn"
            @click="exportSalesByProjectCsv(salesByProject)"
          >
            <span class="material-symbols-outlined" aria-hidden="true">download</span>
            Export CSV
          </button>
        </div>
        <div v-if="salesByProject.length" class="table-scroll">
          <!-- data-label drives the under-640px card layout; see
               src/styles/responsive-table.css -->
          <table class="data-table stack-on-mobile">
            <thead>
              <tr>
                <th>Project</th>
                <th>Sales</th>
                <th>Credits sold</th>
                <th>Gross earned</th>
                <th>Net earned</th>
                <th>Last sale</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in salesByProject" :key="row.projectId">
                <td data-label="Project">{{ row.projectTitle }}</td>
                <td data-label="Sales">{{ row.salesCount }}</td>
                <td data-label="Credits sold">{{ row.creditsSold }}</td>
                <td data-label="Gross earned">{{ peso(row.grossEarnings) }}</td>
                <td data-label="Net earned" class="net-cell">{{ peso(row.netEarnings) }}</td>
                <td data-label="Last sale">{{ shortDate(row.lastSaleDate) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else-if="sectionErrors.byProject" class="load-fail">
          Couldn't load your earnings by project. <button class="link-retry" @click="load">Retry</button>
        </p>
        <p v-else class="muted">No completed sales yet.</p>
      </section>

      <!-- Recent sales -->
      <section class="panel">
        <div class="panel-head">
          <h2>Recent sales</h2>
          <button
            v-if="sales.length"
            class="export-btn"
            @click="exportSalesCsv(sales)"
          >
            <span class="material-symbols-outlined" aria-hidden="true">download</span>
            Export CSV
          </button>
        </div>
        <div v-if="sales.length" class="table-scroll">
          <table class="data-table stack-on-mobile">
            <thead>
              <tr>
                <th>Date</th>
                <th>Credits</th>
                <th>Unit</th>
                <th>Gross</th>
                <th>Platform fee</th>
                <th>Net to you</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in sales" :key="s.id">
                <td data-label="Date">{{ shortDate(s.created_at) }}</td>
                <td data-label="Credits">{{ s.quantity }}</td>
                <td data-label="Unit">{{ peso(s.price_per_credit) }}</td>
                <td data-label="Gross">{{ peso(s.total_amount) }}</td>
                <td data-label="Platform fee" class="muted">
                  {{ Number(s.transaction_fee) > 0 ? '−' + peso(s.transaction_fee) : '—' }}
                </td>
                <td data-label="Net to you" class="net-cell">{{ peso(s.net_amount) }}</td>
                <td data-label="Status"><span class="badge" :class="s.status">{{ s.status }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else-if="sectionErrors.sales" class="load-fail">
          Couldn't load your sales — this is not the same as having none.
          <button class="link-retry" @click="load">Retry</button>
        </p>
        <p v-else class="muted">No sales yet.</p>
      </section>

      <!-- Payout history -->
      <section class="panel">
        <h2>Withdrawals</h2>
        <div v-if="payouts.length" class="table-scroll">
          <table class="data-table stack-on-mobile">
            <thead>
              <tr><th>Date</th><th>Amount</th><th>Status</th><th>Note</th></tr>
            </thead>
            <tbody>
              <tr v-for="p in payouts" :key="p.id">
                <td data-label="Date">{{ shortDate(p.created_at) }}</td>
                <td data-label="Amount">{{ peso(p.amount) }}</td>
                <td data-label="Status"><span class="badge" :class="p.status">{{ p.status }}</span></td>
                <td class="muted small" data-label="Note">{{ p.failure_reason || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else-if="sectionErrors.payouts" class="load-fail">
          Couldn't load your withdrawals. <button class="link-retry" @click="load">Retry</button>
        </p>
        <p v-else class="muted">No withdrawals yet.</p>
      </section>
    </template>
    </div>
  </div>
</template>

<style scoped>
.seller-earnings {
  min-height: 100vh;
  background: var(--bg-secondary, #f8fdf8);
}
.page-body {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px;
}
/* Net is the number a seller actually acts on, so it carries the weight the
   gross column used to have all to itself. */
.net-cell {
  font-weight: 600;
  color: #0f172a;
}
.load-fail {
  color: #991b1b;
  font-size: 0.9rem;
}
.link-retry {
  background: none;
  border: none;
  padding: 0;
  color: #991b1b;
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  /* Carries the spacing the h2 used to own, so the heading and the button sit
     on one baseline. Needs .panel in the selector to outrank `.panel h2`, which
     is declared later in this block. */
  margin-bottom: 12px;
}
.panel .panel-head h2 {
  margin: 0;
}
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
.notice.warn {
  background: #fef3c7;
  color: #92400e;
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
  margin: 6px 0 12px;
}
.btn-primary {
  background: #058526;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 16px;
  cursor: pointer;
  font-weight: 600;
}
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary.sm {
  padding: 6px 12px;
  font-size: 0.85rem;
}
.notice-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.notice-action {
  margin-top: 8px;
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
.badge {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: capitalize;
  background: #e5e7eb;
}
.badge.completed,
.badge.settled {
  background: #d1fae5;
  color: #065f46;
}
.badge.failed,
.badge.refunded {
  background: #fee2e2;
  color: #991b1b;
}
.badge.requested,
.badge.processing {
  background: #dbeafe;
  color: #1e40af;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.modal {
  background: #fff;
  border-radius: 16px;
  padding: 24px;
  max-width: 540px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
}
@media (max-width: 640px) {
  .seller-earnings {
    padding: 16px 12px;
  }
  .cards {
    grid-template-columns: 1fr;
  }
  .modal {
    padding: 18px;
  }
}
</style>
