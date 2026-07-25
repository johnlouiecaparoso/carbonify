<template>
  <div class="detail-page">
    <div class="container">
      <router-link to="/marketplace" class="back-link">← Back to marketplace</router-link>

      <div v-if="loading" class="state">Loading project…</div>
      <div v-else-if="error" class="state error">{{ error }}</div>

      <template v-else-if="project">
        <!-- Hero image (optional) -->
        <div v-if="heroImage" class="hero">
          <img :src="heroImage" :alt="project.title" class="hero-img" />
        </div>

        <header class="detail-header">
          <div>
            <h1 class="title">{{ project.title }}</h1>
            <p class="subtitle">
              <span class="muted">{{ project.category || 'Uncategorized' }}</span>
              <span v-if="project.location"> · {{ project.location }}</span>
            </p>
          </div>
          <div class="header-badges">
            <span class="status-badge" :class="statusInfo.tone">{{ statusInfo.label }}</span>
            <span class="source-badge" :class="sourceClass">{{ sourceLabel }}</span>
          </div>
        </header>

        <p v-if="project.description" class="description">{{ project.description }}</p>

        <div class="grid">
          <!-- Left: details -->
          <div class="col">
            <!-- Verification / trust -->
            <section class="card trust-card">
              <h2>Verification</h2>
              <dl class="facts">
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span class="status-badge sm" :class="statusInfo.tone">{{ statusInfo.label }}</span>
                  </dd>
                </div>
                <div v-if="reviewedDate"><dt>Validated</dt><dd>{{ reviewedDate }}</dd></div>
                <div><dt>Standard</dt><dd>{{ methodologyLabel(project.methodology) || 'Carbonify Standard' }}</dd></div>
                <div><dt>Vintage</dt><dd>{{ project.vintage || '—' }}</dd></div>
                <div><dt>Credit source</dt><dd>{{ sourceLabel }}</dd></div>
                <div v-if="project.additionality_type">
                  <dt>Additionality</dt><dd>{{ additionalityLabel(project.additionality_type) }}</dd>
                </div>
                <div v-if="project.permanence_years">
                  <dt>Permanence</dt><dd>{{ formatPermanence(project.permanence_years) }}</dd>
                </div>
                <div v-if="project.reversal_risk">
                  <dt>Reversal risk</dt><dd>{{ reversalRiskLabel(project.reversal_risk) }}</dd>
                </div>
                <div v-if="project.revision_count">
                  <dt>Revisions</dt><dd>{{ project.revision_count }}</dd>
                </div>
              </dl>
              <div v-if="isValidated && project.verification_notes" class="verifier-note">
                <span class="note-label">Verifier notes</span>
                <p>{{ project.verification_notes }}</p>
              </div>
              <p v-else-if="!isValidated" class="muted trust-hint">
                This project has not yet been validated. Credits become available once a
                verifier validates the project.
              </p>
            </section>

            <section class="card">
              <h2>Project Details</h2>
              <dl class="facts">
                <div><dt>Methodology</dt><dd>{{ methodologyLabel(project.methodology) || '—' }}</dd></div>
                <div>
                  <dt>Development status</dt>
                  <dd>{{ developmentStatusLabel(project.development_status) || '—' }}</dd>
                </div>
                <div v-if="project.feedstock"><dt>Feedstock</dt><dd>{{ project.feedstock }}</dd></div>
                <div v-if="project.capacity != null && project.capacity !== ''">
                  <dt>Capacity</dt>
                  <dd>{{ formatNumber(project.capacity) }}{{ project.capacity_unit ? ' ' + project.capacity_unit : '' }}</dd>
                </div>
                <div><dt>Estimated credits</dt><dd>{{ formatNumber(project.estimated_credits) }}</dd></div>
                <div><dt>Feasibility score</dt><dd>{{ project.feasibility_score ?? '—' }}</dd></div>
                <div><dt>Social impact</dt><dd>{{ project.social_impact_score ?? '—' }}</dd></div>
                <div><dt>Climate risk</dt><dd>{{ project.climate_risk_rating || '—' }}</dd></div>
                <div v-if="project.carbon_yield_projection">
                  <dt>Carbon yield</dt><dd>{{ project.carbon_yield_projection }}</dd>
                </div>
              </dl>
            </section>

            <section v-if="project.expected_impact" class="card">
              <h2>Expected Impact</h2>
              <p class="body-text">{{ project.expected_impact }}</p>
            </section>

            <section class="card">
              <h2>Co-benefits & SDGs</h2>
              <div v-if="coBenefits.length" class="chips">
                <span v-for="(c, i) in coBenefits" :key="i" class="chip">{{ c }}</span>
              </div>
              <p v-else class="muted">No co-benefits recorded for this project.</p>
            </section>

            <section class="card">
              <h2>Documents</h2>
              <ul v-if="documents.length" class="docs">
                <li v-for="(doc, i) in documents" :key="i">
                  <a v-if="doc.url" :href="doc.url" target="_blank" rel="noopener noreferrer">
                    {{ doc.name || 'Document ' + (i + 1) }}
                  </a>
                  <span v-else class="muted" title="Sign in to view project documents">
                    🔒 {{ doc.name || 'Document ' + (i + 1) }} (sign in to view)
                  </span>
                  <span v-if="doc.type" class="muted"> · {{ doc.type }}</span>
                </li>
              </ul>
              <p v-else class="muted">No documents attached.</p>
            </section>
          </div>

          <!-- Right: developer, timeline, map, listings -->
          <div class="col">
            <section v-if="developer" class="card">
              <h2>Developer</h2>
              <p class="dev-name">{{ developer.full_name || 'Project developer' }}</p>
              <p v-if="developer.organization_name" class="muted">
                {{ developer.organization_name }}
                <span v-if="developer.organization_type"> · {{ developer.organization_type }}</span>
              </p>
            </section>

            <section v-if="hasTimeline" class="card">
              <h2>Timeline & Location</h2>
              <dl class="facts">
                <div v-if="project.start_date"><dt>Start</dt><dd>{{ formatDate(project.start_date) }}</dd></div>
                <div v-if="project.end_date"><dt>End</dt><dd>{{ formatDate(project.end_date) }}</dd></div>
                <div v-if="project.host_entity"><dt>Host entity</dt><dd>{{ project.host_entity }}</dd></div>
                <div v-if="project.municipality"><dt>Municipality</dt><dd>{{ project.municipality }}</dd></div>
                <div v-if="project.barangay"><dt>Barangay</dt><dd>{{ project.barangay }}</dd></div>
              </dl>
            </section>

            <section class="card">
              <h2>Location</h2>
              <div v-if="hasMap" ref="mapEl" class="map"></div>
              <p v-else class="muted">No map coordinates for this project.</p>
            </section>

            <section class="card">
              <h2>Available Listings</h2>
              <ul v-if="listings.length" class="listings">
                <li v-for="l in listings" :key="l.id">
                  <span class="lst-price">₱{{ Number(l.price_per_credit).toLocaleString() }}/credit</span>
                  <span class="muted"> · {{ l.quantity }} available</span>
                  <span class="source-badge sm" :class="badgeClass(l.source)">{{ l.source || 'local' }}</span>
                  <span
                    v-if="priceVerdict(l.price_per_credit).verdict !== 'unknown'"
                    class="price-verdict"
                    :class="priceVerdict(l.price_per_credit).verdict"
                  >
                    {{ verdictLabel(priceVerdict(l.price_per_credit)) }}
                  </span>
                </li>
              </ul>
              <p v-else class="muted">No active listings.</p>
              <router-link to="/marketplace" class="buy-link">Go to marketplace →</router-link>
            </section>

            <!-- What has actually traded, so a price can be judged rather than
                 just displayed. Hidden entirely when this project has no trades. -->
            <section v-if="priceSummary.hasData" class="card">
              <h2>Price history</h2>
              <p class="muted price-history-sub">
                Volume-weighted from settled trades, last 90 days.
              </p>

              <div class="price-stats">
                <div>
                  <span class="ph-label">Latest</span>
                  <span class="ph-value">₱{{ priceSummary.latest.toLocaleString() }}</span>
                </div>
                <div>
                  <span class="ph-label">90-day avg</span>
                  <span class="ph-value">₱{{ priceSummary.average.toLocaleString() }}</span>
                </div>
                <div>
                  <span class="ph-label">Range</span>
                  <span class="ph-value">
                    ₱{{ priceSummary.low.toLocaleString() }}–{{ priceSummary.high.toLocaleString() }}
                  </span>
                </div>
                <div>
                  <span class="ph-label">Trend</span>
                  <span
                    class="ph-value"
                    :class="priceSummary.changePercent >= 0 ? 'up' : 'down'"
                  >
                    {{ priceSummary.changePercent >= 0 ? '▲' : '▼' }}
                    {{ Math.abs(priceSummary.changePercent) }}%
                  </span>
                </div>
              </div>

              <!-- Sparkline: enough to read direction and volatility at a glance -->
              <svg
                v-if="sparkline.points"
                class="sparkline"
                :viewBox="`0 0 ${sparkline.width} ${sparkline.height}`"
                preserveAspectRatio="none"
                role="img"
                aria-label="Price trend over the last 90 days"
              >
                <polyline :points="sparkline.points" fill="none" stroke="#069e2d" stroke-width="2" />
              </svg>

              <p class="muted price-history-foot">
                {{ priceSummary.totalCredits.toLocaleString() }} credits traded across
                {{ priceHistory.length }} day{{ priceHistory.length === 1 ? '' : 's' }}.
              </p>
            </section>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getProject } from '@/services/projectService'
import { marketplaceIntegrationService } from '@/services/marketplaceIntegrationService'
import { getSupabase } from '@/services/supabaseClient'
import { resolveDocumentUrls } from '@/services/storageService'
import { methodologyLabel, developmentStatusLabel } from '@/constants/projectRegistry'
import {
  additionalityLabel,
  reversalRiskLabel,
  formatPermanence,
} from '@/services/projectCredibility'
import {
  getProjectPriceHistory,
  summarizePriceSeries,
  comparePriceToMarket,
} from '@/services/priceHistoryService'

const props = defineProps({ id: { type: String, required: true } })

const loading = ref(true)
const error = ref('')
const project = ref(null)
const listings = ref([])
const priceHistory = ref([])
const developer = ref(null)
const mapEl = ref(null)
let map = null

// Documents live in a private bucket; resolve each to a short-lived signed URL
// after the project loads. Anonymous viewers get null URLs (shown as locked).
const documents = ref([])

const priceSummary = computed(() => summarizePriceSeries(priceHistory.value))

/** Is this listing's ask cheap, fair, or expensive against what actually traded? */
function priceVerdict(price) {
  return comparePriceToMarket(price, priceHistory.value)
}

function verdictLabel({ verdict, deltaPercent }) {
  const magnitude = Math.abs(deltaPercent)
  if (verdict === 'below') return `${magnitude}% below avg`
  if (verdict === 'above') return `${magnitude}% above avg`
  return 'about average'
}

/**
 * Sparkline path over the daily VWAP series. Scaled to the observed min/max so
 * the shape shows real variation rather than a flat line near the axis; a
 * single-point series has no shape to draw, so it's skipped.
 */
const sparkline = computed(() => {
  const width = 240
  const height = 48
  const points = priceHistory.value.filter((p) => p.vwap > 0)
  if (points.length < 2) return { width, height, points: '' }

  const values = points.map((p) => p.vwap)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = width / (points.length - 1)

  const coords = points.map((p, i) => {
    const x = Math.round(i * stepX * 10) / 10
    // Invert: SVG y grows downward, price should grow upward.
    const y = Math.round((height - ((p.vwap - min) / span) * (height - 4) - 2) * 10) / 10
    return `${x},${y}`
  })

  return { width, height, points: coords.join(' ') }
})

const coBenefits = computed(() => {
  const cb = project.value?.co_benefits
  if (Array.isArray(cb)) return cb.map((c) => (typeof c === 'string' ? c : c?.label || c?.sdg)).filter(Boolean)
  return []
})

// A project is 'supplier'-sourced if any of its listings are.
const isSupplier = computed(() => listings.value.some((l) => l.source === 'supplier'))
const sourceLabel = computed(() => (isSupplier.value ? 'Registry-backed' : 'Local credit'))
const sourceClass = computed(() => (isSupplier.value ? 'supplier' : 'local'))
function badgeClass(source) {
  return source === 'supplier' ? 'supplier' : 'local'
}

// Validation status → buyer-facing label + colour tone.
const isValidated = computed(() =>
  ['validated', 'approved'].includes(String(project.value?.status || '').toLowerCase()),
)
const statusInfo = computed(() => {
  const status = String(project.value?.status || '').toLowerCase()
  switch (status) {
    case 'validated':
    case 'approved':
      return { label: 'Validated', tone: 'ok' }
    case 'needs_revision':
      return { label: 'Needs revision', tone: 'warn' }
    case 'rejected':
      return { label: 'Rejected', tone: 'bad' }
    case 'submitted':
    case 'pending':
    case 'in_review':
    case 'under_review':
      return { label: 'Under review', tone: 'info' }
    default:
      return { label: status ? status.replace(/_/g, ' ') : 'Unknown', tone: 'info' }
  }
})

function formatDate(value) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return value
  }
}
function formatNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n.toLocaleString() : '—'
}

const reviewedDate = computed(() =>
  isValidated.value && project.value?.verified_at ? formatDate(project.value.verified_at) : '',
)

const heroImage = computed(() => {
  const img = project.value?.project_image
  if (!img || typeof img !== 'string') return null
  // Stored as a base64 data URL on submit; pass through if it already is one.
  return img.startsWith('data:') || img.startsWith('http') ? img : `data:image/jpeg;base64,${img}`
})

const hasTimeline = computed(() => {
  const p = project.value || {}
  return !!(p.start_date || p.end_date || p.host_entity || p.municipality || p.barangay)
})

const coords = computed(() => {
  const v = project.value?.geo_coordinates
  if (!v || typeof v !== 'string') return null
  const [lat, lng] = v.split(',').map((p) => parseFloat(p.trim()))
  if ([lat, lng].some((n) => isNaN(n))) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
})
const hasMap = computed(() => !!coords.value || !!project.value?.boundary)

async function renderMap() {
  await nextTick()
  if (!mapEl.value || map) return
  const center = coords.value || { lat: 12.8797, lng: 121.774 }
  map = L.map(mapEl.value).setView([center.lat, center.lng], coords.value ? 11 : 6)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  }).addTo(map)

  if (coords.value) {
    L.circleMarker([coords.value.lat, coords.value.lng], {
      radius: 9,
      color: '#069e2d',
      fillColor: '#069e2d',
      fillOpacity: 0.8,
      weight: 2,
    }).addTo(map)
  }

  if (project.value?.boundary) {
    try {
      const layer = L.geoJSON(project.value.boundary, { style: { color: '#069e2d', weight: 2, fillOpacity: 0.1 } })
      layer.addTo(map)
      map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: 13 })
    } catch (err) {
      console.warn('Invalid project boundary GeoJSON:', err)
    }
  }
}

// Best-effort: fetch the developer's public profile fields. Silently omitted if
// RLS blocks the read (the card simply doesn't render).
async function loadDeveloper(userId) {
  if (!userId) return
  const supabase = getSupabase()
  if (!supabase) return
  try {
    const { data, error: profErr } = await supabase
      .from('profiles')
      .select('full_name, organization_name, organization_type')
      .eq('id', userId)
      .single()
    if (!profErr && data) developer.value = data
  } catch {
    // ignore — developer card is optional
  }
}

onMounted(async () => {
  try {
    project.value = await getProject(props.id, { includeAll: true })
    try {
      documents.value = await resolveDocumentUrls(project.value?.supporting_documents)
    } catch {
      documents.value = []
    }
    try {
      listings.value = (await marketplaceIntegrationService.getProjectListings(props.id)) || []
    } catch {
      listings.value = []
    }
    // Price history is a nice-to-have on this page; never let it fail the load.
    priceHistory.value = await getProjectPriceHistory(props.id, 90).catch(() => [])
    await loadDeveloper(project.value?.user_id)
    if (hasMap.value) await renderMap()
  } catch (err) {
    console.error('Project detail load error:', err)
    error.value = 'Failed to load this project.'
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})
</script>

<style scoped>
.detail-page {
  padding: 1.5rem 0 3rem;
  background: linear-gradient(180deg, var(--bg-secondary, #f8fdf8) 0%, var(--bg-primary, #fff) 260px);
  min-height: 100vh;
}
.container {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 1.25rem;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--primary-color, #069e2d);
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 600;
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--border-green-light, #d4edda);
  border-radius: 999px;
  background: #fff;
  transition: all 0.18s ease;
}
.back-link:hover {
  background: var(--bg-green-light, #e8f5e8);
  border-color: var(--primary-color, #069e2d);
  transform: translateX(-2px);
}
.hero {
  position: relative;
  margin: 1.25rem 0 0;
  border-radius: 1rem;
  overflow: hidden;
  max-height: 340px;
  box-shadow: 0 16px 40px rgba(6, 158, 45, 0.18), 0 4px 12px rgba(0, 0, 0, 0.06);
}
.hero::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 45%, rgba(4, 119, 59, 0.55) 100%);
  pointer-events: none;
}
.hero-img {
  width: 100%;
  height: 340px;
  object-fit: cover;
  display: block;
  transition: transform 0.4s ease;
}
.hero:hover .hero-img {
  transform: scale(1.03);
}
.detail-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin: 1.5rem 0 0.5rem;
}
.header-badges {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.4rem;
}
.title {
  margin: 0;
  font-size: 1.9rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary, #1a1a1a);
  line-height: 1.15;
}
.subtitle {
  margin: 0.4rem 0 0;
  font-size: 0.95rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.muted {
  color: #6b7280;
}
.description {
  color: #374151;
  line-height: 1.6;
  margin: 0.5rem 0 1.5rem;
}
.body-text {
  color: #374151;
  line-height: 1.6;
  margin: 0;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.card {
  background: #fff;
  border: 1px solid #e8edf1;
  border-radius: 0.9rem;
  padding: 1.4rem;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 28px rgba(6, 158, 45, 0.12);
  border-color: var(--border-green-light, #d4edda);
}
.card h2 {
  margin: 0 0 1rem;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary, #1a1a1a);
  padding-left: 0.7rem;
  border-left: 3px solid var(--primary-color, #069e2d);
  line-height: 1.2;
}
.trust-card {
  border-color: #a7f3d0;
  background: linear-gradient(135deg, #f6fef9 0%, #ecfdf5 100%);
}
.trust-card:hover {
  border-color: var(--primary-color, #069e2d);
}
.facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem 1rem;
  margin: 0;
}
.facts dt {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.facts dd {
  margin: 0;
  font-weight: 600;
}
.verifier-note {
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #d1fae5;
}
.note-label {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #047857;
  font-weight: 700;
}
.verifier-note p {
  margin: 0.35rem 0 0;
  color: #374151;
  line-height: 1.5;
}
.trust-hint {
  margin: 0.75rem 0 0;
  font-size: 0.875rem;
  line-height: 1.5;
}
.dev-name {
  margin: 0 0 0.25rem;
  font-weight: 700;
  font-size: 1rem;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.chip {
  background: #e8f5e8;
  color: #069e2d;
  border: 1px solid #c6ecc6;
  border-radius: 999px;
  padding: 0.3rem 0.8rem;
  font-size: 0.8rem;
  font-weight: 600;
  transition: all 0.15s ease;
}
.chip:hover {
  background: #069e2d;
  color: #fff;
  border-color: #069e2d;
}
.docs,
.listings {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.listings {
  list-style: none;
  padding-left: 0;
  gap: 0.55rem;
}
.listings li {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.3rem;
  padding: 0.7rem 0.85rem;
  background: var(--bg-secondary, #f8fdf8);
  border: 1px solid #e8edf1;
  border-radius: 0.6rem;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.listings li:hover {
  border-color: var(--border-green-light, #d4edda);
  background: #fff;
}
.lst-price {
  color: #069e2d;
  font-weight: 700;
}
.price-verdict {
  display: inline-block;
  margin-left: 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
}
.price-verdict.below {
  background: #dcfce7;
  color: #166534;
}
.price-verdict.fair {
  background: #f1f5f9;
  color: #475569;
}
.price-verdict.above {
  background: #fef3c7;
  color: #92400e;
}
.price-history-sub {
  margin-top: -0.35rem;
  font-size: 0.8rem;
}
.price-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 0.75rem;
  margin: 0.9rem 0;
}
.ph-label {
  display: block;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #94a3b8;
  margin-bottom: 0.1rem;
}
.ph-value {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}
.ph-value.up {
  color: #059669;
}
.ph-value.down {
  color: #dc2626;
}
.sparkline {
  width: 100%;
  height: 48px;
  display: block;
}
.price-history-foot {
  font-size: 0.75rem;
  margin-top: 0.5rem;
}
.map {
  height: 280px;
  border-radius: 0.6rem;
  border: 1px solid #e8edf1;
  overflow: hidden;
}
.status-badge {
  border-radius: 999px;
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}
.status-badge.sm {
  font-size: 0.7rem;
  padding: 0.15rem 0.55rem;
}
.status-badge.ok {
  background: #dcfce7;
  color: #166534;
}
.status-badge.info {
  background: #e0f2fe;
  color: #075985;
}
.status-badge.warn {
  background: #fef3c7;
  color: #92400e;
}
.status-badge.bad {
  background: #fee2e2;
  color: #991b1b;
}
.source-badge {
  border-radius: 999px;
  padding: 0.3rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}
.source-badge.sm {
  font-size: 0.7rem;
  padding: 0.15rem 0.5rem;
  margin-left: 0.4rem;
}
.source-badge.local {
  background: #eef2ff;
  color: #4338ca;
}
.source-badge.supplier {
  background: #ecfdf5;
  color: #047857;
}
.buy-link {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 1rem;
  padding: 0.6rem 1.1rem;
  background: linear-gradient(135deg, var(--primary-color, #069e2d) 0%, var(--primary-hover, #058e3f) 100%);
  color: #fff;
  font-weight: 600;
  font-size: 0.875rem;
  text-decoration: none;
  border-radius: 0.6rem;
  box-shadow: 0 4px 12px rgba(6, 158, 45, 0.25);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.buy-link:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(6, 158, 45, 0.32);
}
.state {
  padding: 3rem 0;
  text-align: center;
  color: #6b7280;
}
.state.error {
  color: #dc2626;
}
@media (max-width: 768px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
