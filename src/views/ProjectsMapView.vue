<template>
  <div class="map-page">
    <div class="page-header">
      <div class="container">
        <h1 class="page-title">Project Map</h1>
        <p class="page-description">Explore verified carbon projects across the Philippines.</p>
      </div>
    </div>

    <div class="map-content">
      <div class="container">
        <div v-if="loading" class="state">Loading projects…</div>
        <div v-else-if="error" class="state error">{{ error }}</div>
        <div v-else>
          <p class="map-summary">
            Showing <strong>{{ plotted }}</strong> project{{ plotted === 1 ? '' : 's' }} with map
            coordinates.
            <span v-if="missing > 0" class="muted">({{ missing }} without coordinates not shown)</span>
          </p>
          <div ref="mapEl" class="map"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getMarketplaceListings } from '@/services/marketplaceService'

const mapEl = ref(null)
const loading = ref(true)
const error = ref('')
const plotted = ref(0)
const missing = ref(0)
let map = null

// Pull project fields regardless of how the listing is shaped.
function projectFrom(listing) {
  return listing.project_credits?.projects || listing.projects || listing.project || listing
}

function parseCoords(value) {
  if (!value || typeof value !== 'string') return null
  const parts = value.split(',').map((p) => parseFloat(p.trim()))
  if (parts.length !== 2 || parts.some((n) => isNaN(n))) return null
  const [lat, lng] = parts
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function priceOf(listing) {
  const p = projectFrom(listing)
  return listing.price_per_credit || p.credit_price || listing.project_credits?.price_per_credit || null
}

onMounted(async () => {
  let listings = []
  try {
    listings = await getMarketplaceListings()
  } catch (err) {
    console.error('Map load error:', err)
    error.value = 'Failed to load the project map.'
    loading.value = false
    return
  }

  // The map container lives in the v-else branch, so it is only in the DOM once
  // loading is false. Reveal it first, then wait a tick before initializing
  // Leaflet — otherwise mapEl is null and L.map() throws.
  loading.value = false
  await nextTick()

  if (!mapEl.value) {
    error.value = 'Failed to load the project map.'
    return
  }

  try {
    // Center on the Philippines. Tiles: OpenStreetMap — free, no API key.
    map = L.map(mapEl.value).setView([12.8797, 121.774], 6)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors',
    }).addTo(map)

    const bounds = []
    let shown = 0
    let noCoords = 0

    for (const listing of listings || []) {
      const project = projectFrom(listing)
      const coords = parseCoords(project.geo_coordinates)
      if (!coords) {
        noCoords++
        continue
      }
      shown++
      bounds.push([coords.lat, coords.lng])

      const price = priceOf(listing)
      const title = project.title || project.project_title || 'Project'
      const popup = `
        <strong>${escapeHtml(title)}</strong><br/>
        ${escapeHtml(project.category || '')}<br/>
        <span style="color:#6b7280">${escapeHtml(project.location || '')}</span><br/>
        ${price ? `<span style="color:#058526;font-weight:600">₱${Number(price).toLocaleString()}/credit</span><br/>` : ''}
        <a href="/marketplace" style="color:#058526">View in marketplace →</a>
      `
      L.circleMarker([coords.lat, coords.lng], {
        radius: 9,
        color: '#058526',
        fillColor: '#058526',
        fillOpacity: 0.8,
        weight: 2,
      })
        .addTo(map)
        .bindPopup(popup)
    }

    plotted.value = shown
    missing.value = noCoords

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
    }
  } catch (err) {
    console.error('Map render error:', err)
    error.value = 'Failed to load the project map.'
  }
})

onBeforeUnmount(() => {
  if (map) {
    map.remove()
    map = null
  }
})

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
</script>

<style scoped>
.map-page {
  min-height: 100vh;
  background: var(--bg-primary, #fff);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.page-header {
  background: var(--primary-color, #058526);
  padding: 1.25rem 0;
}

.page-title {
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.5rem;
}

.page-description {
  /* No opacity. White at 95% over --primary-color composites to #f3f9f4 and
     measures 4.48:1, just under the 4.5:1 AA floor. */
  color: #fff;
  margin: 0;
}

.map-content {
  padding: 2rem 0;
}

.map-summary {
  margin: 0 0 1rem;
  color: var(--text-muted, #4b5563);
}

.muted {
  color: var(--text-muted, #9ca3af);
  font-size: 0.85rem;
}

.map {
  width: 100%;
  height: 560px;
  border-radius: 0.75rem;
  border: 1px solid var(--border-color, #d1e7dd);
  overflow: hidden;
  /* Contain Leaflet's high internal z-indexes (tiles ~200, controls ~800) in
     their own stacking context so the map never paints over the sticky site
     header (z-index 50) while scrolling. */
  position: relative;
  z-index: 0;
  isolation: isolate;
}

/* Belt-and-braces: keep every Leaflet layer/control inside the map box. */
.map :deep(.leaflet-pane),
.map :deep(.leaflet-top),
.map :deep(.leaflet-bottom) {
  z-index: 1;
}

.state {
  text-align: center;
  padding: 3rem;
  color: var(--text-muted, #6b7280);
}

.state.error {
  color: #dc2626;
}

@media (max-width: 768px) {
  .container {
    padding: 0 1rem;
  }
  .map {
    height: 420px;
  }
}
</style>
