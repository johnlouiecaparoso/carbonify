<template>
  <!-- Shared green page banner. Every signed-in dashboard/console uses this so
       the header is identical across roles instead of each view hand-rolling
       its own (which is how some pages ended up with no green header at all). -->
  <div class="page-header">
    <div class="container">
      <div class="page-header__row">
        <div class="page-header__text">
          <h1 class="page-title">
            <span
              v-if="icon"
              class="material-symbols-outlined page-title__icon"
              aria-hidden="true"
              >{{ icon }}</span
            >
            {{ title }}
          </h1>
          <p v-if="description || $slots.description" class="page-description">
            <slot name="description">{{ description }}</slot>
          </p>
        </div>
        <div v-if="$slots.actions" class="page-header__actions">
          <slot name="actions" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  // Optional Material Symbols glyph shown before the title.
  icon: { type: String, default: '' },
})
</script>

<style scoped>
.page-header {
  padding: 1.25rem 0;
  background: var(--primary-color, #058526);
}

.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 2rem;
}

.page-header__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}

.page-header__text {
  min-width: 0;
}

.page-title {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: #fff;
  margin: 0 0 0.5rem;
  line-height: 1.15;
}

.page-title__icon {
  font-size: 1.5rem;
}

.page-description {
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.92);
  margin: 0;
  max-width: 80ch;
  line-height: 1.5;
}

.page-header__actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* The actions slot usually holds a light button/pill; give slotted buttons a
   sensible default that reads on the green without each caller restyling. */
.page-header__actions :deep(button),
.page-header__actions :deep(.btn-ghost) {
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 8px;
  padding: 0.5rem 1rem;
  font-weight: 600;
  cursor: pointer;
}

.page-header__actions :deep(button:hover:not(:disabled)) {
  background: rgba(255, 255, 255, 0.26);
}

.page-header__actions :deep(button:disabled) {
  opacity: 0.6;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  /* Only the gutter changes on mobile. The type sizes above are already the
     post-shrink values, so re-declaring them here just restated the same
     numbers -- and in the views that hand-rolled this banner, that same block
     is where stale pre-shrink sizes survived and rendered the title LARGER on
     a phone than on a desktop. */
  .container {
    padding: 0 1rem;
  }

  /* `flex-shrink: 0` is right on a desktop row and wrong once the row wraps: a
     wide actions slot (the three stat cards on Role Applications) then refused
     to compress and shoved the title out of view. Once wrapped it owns the full
     width and can lay itself out, so callers can make it compact. */
  .page-header__actions {
    flex-shrink: 1;
    width: 100%;
    min-width: 0;
  }
}
</style>
