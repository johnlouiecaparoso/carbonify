<script setup>
/**
 * Buyer's view of the problems they've reported. Pairs with DisputeModal (which
 * opens them) and the admin refund console (which resolves them).
 */
import { ref, computed, onMounted } from 'vue'
import PageHeader from '@/components/layout/PageHeader.vue'
import { getMyDisputes } from '@/services/disputeService'
import { formatDate } from '@/utils/formatDate'

const disputes = ref([])
const loading = ref(true)
const error = ref('')

const openCount = computed(() => disputes.value.filter((d) => d.status === 'open').length)

/** Status → what the buyer should understand from it. */
const STATUS_COPY = {
  open: { label: 'Under review', tone: 'pending' },
  resolved_refunded: { label: 'Refunded', tone: 'good' },
  resolved_rejected: { label: 'Not refunded', tone: 'bad' },
}

function statusFor(dispute) {
  return STATUS_COPY[dispute.status] || { label: dispute.status || 'Unknown', tone: 'pending' }
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    disputes.value = await getMyDisputes(50)
  } catch (err) {
    console.error('Failed to load disputes:', err)
    error.value = 'We could not load your reports. Please try again.'
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="disputes-view">
    <PageHeader
      title="Reported problems"
      description="Issues you've raised on your purchases, and where each one stands."
    />

    <div class="container">

      <div v-if="loading" class="state-card">Loading your reports…</div>

      <div v-else-if="error" class="state-card error">
        <p>{{ error }}</p>
        <button class="btn" @click="load">Try again</button>
      </div>

      <div v-else-if="disputes.length === 0" class="state-card">
        <p>You haven't reported any problems.</p>
        <router-link to="/receipts" class="browse-link">
          Go to your receipts to report an issue →
        </router-link>
      </div>

      <template v-else>
        <p v-if="openCount > 0" class="open-summary">
          {{ openCount }} report{{ openCount === 1 ? '' : 's' }} awaiting review.
        </p>

        <ul class="dispute-list">
          <li v-for="dispute in disputes" :key="dispute.id" class="dispute-card">
            <div class="dispute-card__head">
              <span class="status-pill" :class="statusFor(dispute).tone">
                {{ statusFor(dispute).label }}
              </span>
              <span class="dispute-date">Reported {{ formatDate(dispute.created_at) }}</span>
            </div>

            <p class="dispute-reason">{{ dispute.reason }}</p>

            <dl class="dispute-meta">
              <div>
                <dt>Transaction</dt>
                <dd class="mono">{{ dispute.transaction_id }}</dd>
              </div>
              <div v-if="dispute.resolved_at">
                <dt>Resolved</dt>
                <dd>{{ formatDate(dispute.resolved_at) }}</dd>
              </div>
            </dl>

            <p v-if="dispute.resolution_notes" class="resolution-note">
              <strong>Our response:</strong> {{ dispute.resolution_notes }}
            </p>
          </li>
        </ul>
      </template>
    </div>
  </div>
</template>

<style scoped>
.disputes-view {
  min-height: 100vh;
  padding: 0 0 4rem;
  background: var(--bg-secondary, #f8fdf8);
}
.container {
  max-width: 900px;
  margin: 0 auto;
  padding: 1.5rem 1rem 0;
}

.state-card {
  padding: 2rem;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #f9fafb;
  color: #6b7280;
  text-align: center;
}
.state-card.error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}
.btn {
  margin-top: 0.75rem;
  padding: 0.55rem 1.1rem;
  background: #058526;
  color: #fff;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
}
.browse-link {
  display: inline-block;
  margin-top: 0.75rem;
  color: #058526;
  font-weight: 600;
  text-decoration: none;
}
.open-summary {
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fcd34d;
  border-radius: 8px;
  padding: 0.6rem 0.9rem;
  font-size: 0.875rem;
  margin: 0 0 1rem;
}
.dispute-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.dispute-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fff;
  padding: 1.15rem;
}
.dispute-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.7rem;
}
.status-pill {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
}
.status-pill.pending {
  background: #fef3c7;
  color: #92400e;
}
.status-pill.good {
  background: #dcfce7;
  color: #166534;
}
.status-pill.bad {
  background: #fee2e2;
  color: #991b1b;
}
.dispute-date {
  font-size: 0.8rem;
  color: #94a3b8;
}
.dispute-reason {
  margin: 0 0 0.9rem;
  color: #0f172a;
  font-size: 0.95rem;
}
.dispute-meta {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
  margin: 0;
}
.dispute-meta dt {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #94a3b8;
  margin-bottom: 0.15rem;
}
.dispute-meta dd {
  margin: 0;
  font-size: 0.825rem;
  color: #374151;
}
.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.75rem !important;
  word-break: break-all;
}
.resolution-note {
  margin: 0.9rem 0 0;
  padding: 0.7rem 0.85rem;
  background: #f9fafb;
  border-radius: 8px;
  font-size: 0.85rem;
  color: #374151;
}
</style>
