<template>
  <div class="collapsible">
    <div
      ref="viewportRef"
      class="collapsible__viewport"
      :class="{ 'is-collapsed': isCollapsed }"
      :style="isCollapsed && maxHeight ? { maxHeight: `${maxHeight}px` } : null"
    >
      <slot />
    </div>

    <div v-if="canCollapse" class="collapsible__footer">
      <button type="button" class="collapsible__toggle" @click="toggle">
        {{ expanded ? 'Show less' : `See more (${hiddenCount.toLocaleString()} more)` }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

/**
 * Collapses a long list or table to its first `visible` rows in a vertically
 * scrollable box, with a "See more" toggle underneath.
 *
 * The height is measured from the rendered rows rather than assumed, so a row
 * that wraps to two lines still leaves exactly `visible` rows on screen.
 *
 * The viewport owns BOTH scroll axes on purpose. Wrapping a container that
 * already has `overflow-x: auto` would make that inner element the scrolling
 * ancestor for `position: sticky`, and the sticky table header would stop
 * pinning — so use this component *in place of* an existing scroll wrapper,
 * not around one.
 */
const props = defineProps({
  /** Total number of rows; below `visible` nothing is collapsed. */
  count: { type: Number, required: true },
  /** Rows left on screen while collapsed. */
  visible: { type: Number, default: 4 },
  /** How to find a row inside the slot. */
  rowSelector: { type: String, default: 'tbody > tr' },
})

const expanded = ref(false)
const maxHeight = ref(0)
const viewportRef = ref(null)

const canCollapse = computed(() => props.count > props.visible)
const isCollapsed = computed(() => canCollapse.value && !expanded.value)
const hiddenCount = computed(() => Math.max(props.count - props.visible, 0))

function measure() {
  const viewport = viewportRef.value
  if (!viewport || !canCollapse.value) return
  const rows = viewport.querySelectorAll(props.rowSelector)
  if (rows.length <= props.visible) return
  const lastVisible = rows[props.visible - 1]
  if (!lastVisible) return
  // Everything above the last visible row counts — a table header, list
  // padding, whatever the caller put in the slot. Adding scrollTop keeps the
  // measurement correct when the box is already scrolled.
  const height =
    lastVisible.getBoundingClientRect().bottom -
    viewport.getBoundingClientRect().top +
    viewport.scrollTop
  if (height > 0) maxHeight.value = Math.round(height)
}

function toggle() {
  expanded.value = !expanded.value
  if (!expanded.value) viewportRef.value?.scrollTo({ top: 0 })
}

// Rows can change height after mount (fonts, async cell content, filters).
let observer = null
onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(() => measure())
    if (viewportRef.value) observer.observe(viewportRef.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())

watch(
  () => [props.count, props.visible],
  async () => {
    expanded.value = false
    await nextTick()
    measure()
  },
)
</script>

<style scoped>
.collapsible__viewport {
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

.collapsible__viewport.is-collapsed {
  /* Hint that there is more below the fold. */
  scrollbar-gutter: stable;
}

/* Keep a table's own header visible while its rows scroll under it. The
   background is required, not cosmetic: a transparent sticky cell lets the
   rows scroll straight through the header text. Override per table with
   `--collapsible-head-bg`. */
.collapsible__viewport :deep(thead th) {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--collapsible-head-bg, #f8fafc);
  box-shadow: inset 0 -1px 0 var(--border-color, #e5e7eb);
}

.collapsible__footer {
  display: flex;
  justify-content: center;
  margin-top: 0.6rem;
}

.collapsible__toggle {
  padding: 0.45rem 1.1rem;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 8px;
  background: var(--bg-secondary, #f8fdf8);
  color: var(--primary-color, #069e2d);
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}

.collapsible__toggle:hover {
  background: var(--primary-light, #e8f5e8);
}
</style>
