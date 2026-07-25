<template>
  <button
    type="button"
    class="watch-btn"
    :class="{ watched }"
    :aria-pressed="watched"
    :title="watched ? 'Remove from saved' : 'Save'"
    @click.stop.prevent="$emit('toggle')"
  >
    <span class="material-symbols-outlined heart" aria-hidden="true">
      {{ watched ? 'favorite' : 'favorite_border' }}
    </span>
    <span v-if="showLabel" class="watch-label">{{ watched ? 'Saved' : 'Save' }}</span>
  </button>
</template>

<script setup>
/**
 * Presentational watchlist toggle (heart). State is owned by the parent, which
 * handles the toggle event (add/remove via watchlistService) so a list view can
 * track many buttons against one loaded set.
 */
defineProps({
  watched: { type: Boolean, default: false },
  showLabel: { type: Boolean, default: false },
})
defineEmits(['toggle'])
</script>

<style scoped>
.watch-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  border: 1px solid #e5e7eb;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 999px;
  padding: 0.35rem 0.6rem;
  cursor: pointer;
  color: #6b7280;
  transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
}
.watch-btn:hover {
  border-color: #fca5a5;
  color: #ef4444;
}
.watch-btn.watched {
  color: #ef4444;
  border-color: #fecaca;
  background: #fef2f2;
}
.heart {
  font-size: 1.1rem;
}
.watch-label {
  font-size: 0.8rem;
  font-weight: 600;
}
</style>
