<template>
  <div class="boundary-picker">
    <div class="picker-toolbar">
      <div class="mode-group" role="group" aria-label="Map tool">
        <button
          type="button"
          class="mode-btn"
          :class="{ active: mode === 'point' }"
          @click="setMode('point')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">location_on</span>
          Set point
        </button>
        <button
          type="button"
          class="mode-btn"
          :class="{ active: mode === 'area' }"
          @click="setMode('area')"
        >
          <span class="material-symbols-outlined" aria-hidden="true">polyline</span>
          Draw area
        </button>
      </div>
      <div class="action-group">
        <button type="button" class="link-btn" :disabled="!vertices.length" @click="undoVertex">
          Undo point
        </button>
        <button type="button" class="link-btn danger" :disabled="!vertices.length" @click="clearArea">
          Clear area
        </button>
      </div>
    </div>

    <p class="picker-hint">
      <template v-if="mode === 'point'">
        Click the map to drop the project location pin.
      </template>
      <template v-else>
        Click to add boundary corners ({{ vertices.length }} placed). Add at least 3 to form an area.
      </template>
    </p>

    <div ref="mapEl" class="picker-map"></div>

    <div class="picker-readout">
      <span v-if="point" class="readout-chip">
        <span class="material-symbols-outlined" aria-hidden="true">my_location</span>
        {{ point.lat.toFixed(5) }}, {{ point.lng.toFixed(5) }}
      </span>
      <span v-if="vertices.length >= 3" class="readout-chip ok">
        <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
        Boundary set ({{ vertices.length }} corners)
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const props = defineProps({
  // "lat,lng" string (kept compatible with the existing geo_coordinates field).
  modelValue: { type: String, default: '' },
  // GeoJSON Feature/Geometry for the boundary polygon, or null.
  boundary: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'update:boundary'])

const PH_CENTER = { lat: 12.8797, lng: 121.774 }

const mapEl = ref(null)
const mode = ref('point')
const point = ref(parsePoint(props.modelValue))
const vertices = ref(verticesFromBoundary(props.boundary))

let map = null
let pointLayer = null
let areaLayer = null
const vertexLayers = []

function parsePoint(str) {
  if (!str || typeof str !== 'string') return null
  const [lat, lng] = str.split(',').map((p) => parseFloat(p.trim()))
  if ([lat, lng].some((n) => isNaN(n))) return null
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat, lng }
}

function verticesFromBoundary(b) {
  try {
    const geom = b?.geometry || b
    const ring = geom?.coordinates?.[0]
    if (!Array.isArray(ring)) return []
    // GeoJSON is [lng, lat]; drop the closing duplicate vertex.
    const pts = ring.map(([lng, lat]) => ({ lat, lng }))
    if (pts.length > 1) {
      const first = pts[0]
      const last = pts[pts.length - 1]
      if (first.lat === last.lat && first.lng === last.lng) pts.pop()
    }
    return pts
  } catch {
    return []
  }
}

function setMode(m) {
  mode.value = m
}

function emitPoint() {
  emit('update:modelValue', point.value ? `${point.value.lat.toFixed(6)},${point.value.lng.toFixed(6)}` : '')
}

function emitBoundary() {
  if (vertices.value.length < 3) {
    emit('update:boundary', null)
    return
  }
  const ring = vertices.value.map((v) => [v.lng, v.lat])
  ring.push(ring[0]) // close the ring
  emit('update:boundary', {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  })
}

function drawPoint() {
  if (pointLayer) {
    map.removeLayer(pointLayer)
    pointLayer = null
  }
  if (!point.value) return
  pointLayer = L.circleMarker([point.value.lat, point.value.lng], {
    radius: 9,
    color: '#058526',
    fillColor: '#058526',
    fillOpacity: 0.85,
    weight: 2,
  }).addTo(map)
}

function drawArea() {
  vertexLayers.forEach((l) => map.removeLayer(l))
  vertexLayers.length = 0
  if (areaLayer) {
    map.removeLayer(areaLayer)
    areaLayer = null
  }
  if (!vertices.value.length) return

  const latlngs = vertices.value.map((v) => [v.lat, v.lng])
  areaLayer =
    vertices.value.length >= 3
      ? L.polygon(latlngs, { color: '#058526', weight: 2, fillOpacity: 0.12 })
      : L.polyline(latlngs, { color: '#058526', weight: 2, dashArray: '4 4' })
  areaLayer.addTo(map)

  vertices.value.forEach((v) => {
    const m = L.circleMarker([v.lat, v.lng], {
      radius: 5,
      color: '#047857',
      fillColor: '#fff',
      fillOpacity: 1,
      weight: 2,
    }).addTo(map)
    vertexLayers.push(m)
  })
}

function onMapClick(e) {
  const { lat, lng } = e.latlng
  if (mode.value === 'point') {
    point.value = { lat, lng }
    drawPoint()
    emitPoint()
  } else {
    vertices.value = [...vertices.value, { lat, lng }]
    drawArea()
    emitBoundary()
  }
}

function undoVertex() {
  if (!vertices.value.length) return
  vertices.value = vertices.value.slice(0, -1)
  drawArea()
  emitBoundary()
}

function clearArea() {
  vertices.value = []
  drawArea()
  emitBoundary()
}

onMounted(() => {
  const center = point.value || PH_CENTER
  map = L.map(mapEl.value).setView([center.lat, center.lng], point.value ? 11 : 5)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors',
  }).addTo(map)
  map.on('click', onMapClick)
  drawPoint()
  drawArea()
  if (vertices.value.length >= 3 && areaLayer) {
    map.fitBounds(areaLayer.getBounds(), { padding: [25, 25], maxZoom: 13 })
  }
  // Map containers can mount at zero size inside collapsed/animated sections.
  setTimeout(() => map && map.invalidateSize(), 50)
})

onBeforeUnmount(() => {
  if (map) {
    map.off('click', onMapClick)
    map.remove()
    map = null
  }
})

// Keep the marker in sync if the parent edits the text field directly.
watch(
  () => props.modelValue,
  (val) => {
    const next = parsePoint(val)
    const same = next && point.value && next.lat === point.value.lat && next.lng === point.value.lng
    if (same) return
    point.value = next
    if (map) drawPoint()
  },
)
</script>

<style scoped>
.boundary-picker {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0.75rem;
  background: #fff;
}
.picker-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.5rem;
}
.mode-group {
  display: inline-flex;
  gap: 0.4rem;
}
.mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.7rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  background: #fff;
  color: #4b5563;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.mode-btn .material-symbols-outlined {
  font-size: 1.05rem;
}
.mode-btn.active {
  background: #058526;
  border-color: #058526;
  color: #fff;
}
.action-group {
  display: inline-flex;
  gap: 0.75rem;
}
.link-btn {
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  color: #2563eb;
  cursor: pointer;
}
.link-btn.danger {
  color: #dc2626;
}
.link-btn:disabled {
  color: #9ca3af;
  cursor: not-allowed;
}
.picker-hint {
  margin: 0 0 0.5rem;
  font-size: 0.78rem;
  color: #6b7280;
}
.picker-map {
  width: 100%;
  height: 280px;
  border-radius: 8px;
  z-index: 0;
}
.picker-readout {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.5rem;
}
.readout-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.74rem;
  font-weight: 600;
  color: #4b5563;
  background: #f3f4f6;
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
}
.readout-chip .material-symbols-outlined {
  font-size: 0.95rem;
}
.readout-chip.ok {
  color: #047857;
  background: #ecfdf5;
}

/* Leaflet renders its attribution as a sentence with the "Leaflet" and
   OpenStreetMap links distinguished by colour alone — WCAG 1.4.1, because a
   colour-blind or greyscale reader cannot tell they are links. The control is
   injected by the library into this component's DOM, so it needs `:deep()`;
   underlining is the fix rather than removing the attribution, which OSM's
   licence requires us to keep. */
.boundary-picker :deep(.leaflet-control-attribution a) {
  text-decoration: underline;
}
</style>
