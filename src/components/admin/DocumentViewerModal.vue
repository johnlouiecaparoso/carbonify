<script setup>
/**
 * In-tab viewer for a submitted ID document.
 *
 * ── Why the old link showed a white screen ──
 * KycView uploads the file with `FileReader.readAsDataURL`, so
 * `kyc_applications.id_document_url` holds a **`data:` URI**, not a link. The
 * review panel put that straight into `<a href target="_blank">` — and every
 * modern browser BLOCKS top-level navigation to a `data:` URI. Chrome and
 * Firefox have done so since 2017 as an anti-phishing measure. The tab opens,
 * the navigation is refused, and you get a blank page with nothing in the
 * console.
 *
 * The block is on *navigation only*. The same data URI renders perfectly as
 * the `src` of an `<img>` or `<iframe>`, which is what this does — so the
 * document appears in place, and closing it returns you to the queue with your
 * scroll position and filters intact.
 *
 * Handles the three shapes the column can hold: a data URI (what the current
 * upload produces), an http(s) URL, and a bare storage path (older rows).
 */
import { computed, ref, watch } from 'vue'

const props = defineProps({
  /** Raw value of `id_document_url`. */
  src: { type: String, default: '' },
  /** Who submitted it, for the header. */
  applicant: { type: String, default: '' },
  /** The declared document type, e.g. "Passport". */
  docType: { type: String, default: '' },
})

const emit = defineEmits(['close'])

const zoom = ref(1)
const rotation = ref(0)

// Reset the view whenever a different document is opened, so the previous
// reviewer's zoom does not carry over onto the next applicant's ID.
watch(
  () => props.src,
  () => {
    zoom.value = 1
    rotation.value = 0
  },
)

const kind = computed(() => {
  const s = props.src || ''
  if (!s) return 'none'
  if (s.startsWith('data:image/')) return 'image'
  if (s.startsWith('data:application/pdf')) return 'pdf'
  if (s.startsWith('data:')) return 'unknown-data'
  if (/^https?:\/\//i.test(s)) return /\.pdf($|\?)/i.test(s) ? 'pdf' : 'image'
  // A bare storage path. Nothing here can render it without a signed URL.
  return 'path'
})

const imageStyle = computed(() => ({
  transform: `scale(${zoom.value}) rotate(${rotation.value}deg)`,
}))

function zoomIn() {
  zoom.value = Math.min(zoom.value + 0.25, 4)
}
function zoomOut() {
  zoom.value = Math.max(zoom.value - 0.25, 0.5)
}
function rotate() {
  rotation.value = (rotation.value + 90) % 360
}
function reset() {
  zoom.value = 1
  rotation.value = 0
}

/**
 * Open in a new tab as an escape hatch — via a Blob URL, because navigating to
 * a data: URI is the thing that was broken in the first place.
 */
function openInNewTab() {
  try {
    if (props.src.startsWith('data:')) {
      const [meta, b64] = props.src.split(',')
      const mime = meta.match(/data:([^;]+)/)?.[1] || 'application/octet-stream'
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }))
      window.open(url, '_blank', 'noopener')
      // Revoked on a delay: revoking immediately can race the new tab's load.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } else {
      window.open(props.src, '_blank', 'noopener')
    }
  } catch (err) {
    console.error('Could not open the document in a new tab:', err)
  }
}
</script>

<template>
  <div
    class="modal-overlay doc-overlay"
    v-modal-a11y="() => emit('close')"
    @click.self="emit('close')"
  >
    <div class="doc-modal">
      <header class="doc-head">
        <div class="doc-titles">
          <h2 class="doc-title">ID document</h2>
          <p class="doc-sub">
            <span v-if="applicant">{{ applicant }}</span>
            <span v-if="applicant && docType"> · </span>
            <span v-if="docType">{{ docType }}</span>
          </p>
        </div>
        <button type="button" class="doc-close" @click="emit('close')">
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
          <span class="sr-only">Close document viewer</span>
        </button>
      </header>

      <div v-if="kind === 'image'" class="doc-toolbar">
        <button type="button" class="tool" title="Zoom out" @click="zoomOut">
          <span class="material-symbols-outlined" aria-hidden="true">zoom_out</span>
        </button>
        <span class="zoom-label">{{ Math.round(zoom * 100) }}%</span>
        <button type="button" class="tool" title="Zoom in" @click="zoomIn">
          <span class="material-symbols-outlined" aria-hidden="true">zoom_in</span>
        </button>
        <button type="button" class="tool" title="Rotate 90°" @click="rotate">
          <span class="material-symbols-outlined" aria-hidden="true">rotate_right</span>
        </button>
        <button type="button" class="tool" title="Reset view" @click="reset">
          <span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>
        </button>
        <button type="button" class="tool tool-wide" @click="openInNewTab">
          <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
          New tab
        </button>
      </div>

      <div class="doc-body" :class="{ 'is-image': kind === 'image' }">
        <img v-if="kind === 'image'" :src="src" :style="imageStyle" class="doc-image" alt="Submitted ID document" />

        <iframe v-else-if="kind === 'pdf'" :src="src" class="doc-frame" title="Submitted ID document"></iframe>

        <div v-else-if="kind === 'path'" class="doc-empty">
          <span class="material-symbols-outlined" aria-hidden="true">link_off</span>
          <p>
            This record stores a file path rather than the file itself, and it cannot be displayed
            without a signed link. Ask the applicant to re-upload the document.
          </p>
          <code class="doc-path">{{ src }}</code>
        </div>

        <div v-else-if="kind === 'unknown-data'" class="doc-empty">
          <span class="material-symbols-outlined" aria-hidden="true">description</span>
          <p>This file type cannot be previewed here.</p>
          <button type="button" class="tool tool-wide" @click="openInNewTab">
            <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
            Open in a new tab
          </button>
        </div>

        <div v-else class="doc-empty">
          <span class="material-symbols-outlined" aria-hidden="true">image_not_supported</span>
          <p>No document was attached to this application.</p>
        </div>
      </div>

      <footer class="doc-foot">
        <p class="doc-hint">
          Check the name and photo match the application, and that the document has not expired.
        </p>
        <button type="button" class="btn-done" @click="emit('close')">Close</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.doc-overlay {
  position: fixed;
  inset: 0;
  z-index: 1600;
  background: rgba(15, 23, 42, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}
.doc-modal {
  background: #fff;
  border-radius: 14px;
  width: min(920px, 100%);
  max-height: 92vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
}
.doc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid #e5e7eb;
}
.doc-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #111827;
}
.doc-sub {
  margin: 2px 0 0;
  font-size: 0.84rem;
  color: #6b7280;
}
.doc-close {
  background: transparent;
  border: none;
  cursor: pointer;
  color: #6b7280;
  padding: 4px;
  border-radius: 6px;
  line-height: 0;
}
.doc-close:hover {
  background: rgba(0, 0, 0, 0.06);
}
.doc-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 18px;
  border-bottom: 1px solid #f3f4f6;
  background: #f9fafb;
  flex-wrap: wrap;
}
.tool {
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 10px;
  cursor: pointer;
  color: #374151;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 36px;
  font-size: 0.82rem;
  font-weight: 600;
}
.tool:hover {
  background: #f3f4f6;
}
.tool .material-symbols-outlined {
  font-size: 19px;
}
.tool-wide {
  margin-left: auto;
}
.zoom-label {
  font-size: 0.8rem;
  color: #6b7280;
  min-width: 44px;
  text-align: center;
}
.doc-body {
  flex: 1 1 auto;
  overflow: auto;
  background: #111827;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  padding: 16px;
}
.doc-body.is-image {
  /* A dark, checkered field makes a white ID card's edges visible — which is
     part of judging whether a scan has been cropped or altered. */
  background-image: linear-gradient(45deg, #1f2937 25%, transparent 25%),
    linear-gradient(-45deg, #1f2937 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #1f2937 75%),
    linear-gradient(-45deg, transparent 75%, #1f2937 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
}
.doc-image {
  max-width: 100%;
  max-height: 70vh;
  transition: transform 0.15s ease;
  transform-origin: center;
}
.doc-frame {
  width: 100%;
  height: 70vh;
  border: none;
  background: #fff;
}
.doc-empty {
  color: #d1d5db;
  text-align: center;
  display: grid;
  gap: 10px;
  justify-items: center;
  padding: 32px 16px;
  max-width: 460px;
}
.doc-empty .material-symbols-outlined {
  font-size: 40px;
  color: #6b7280;
}
.doc-empty p {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.55;
}
.doc-path {
  font-size: 0.75rem;
  color: #9ca3af;
  word-break: break-all;
  background: rgba(255, 255, 255, 0.06);
  padding: 6px 8px;
  border-radius: 6px;
}
.doc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 18px;
  border-top: 1px solid #e5e7eb;
  flex-wrap: wrap;
}
.doc-hint {
  margin: 0;
  font-size: 0.8rem;
  color: #6b7280;
}
.btn-done {
  background: var(--primary-color, #058526);
  border: 1px solid var(--primary-color, #058526);
  color: #fff;
  border-radius: 8px;
  padding: 9px 18px;
  font-weight: 600;
  cursor: pointer;
  min-height: 42px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 640px) {
  .doc-modal {
    max-height: 96vh;
  }
  .tool-wide {
    margin-left: 0;
  }
  .doc-foot {
    flex-direction: column;
    align-items: stretch;
  }
  .btn-done {
    width: 100%;
  }
}
</style>
