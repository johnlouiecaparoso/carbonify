<script setup>
/**
 * The one search control for Marketplace and Registry.
 *
 * WHAT IT REPLACES
 * Both pages had a wide search box followed by a row of five naked <select>s —
 * All Categories, All Sources, All SDGs, All Availability, Sort. On a desktop
 * that row is a wall of grey; on a phone it is five full-width dropdowns
 * stacked between the page title and the first result, so you scroll past the
 * filters to reach the thing you searched for.
 *
 * Here the bar is compact and the filters live behind a button *inside* it,
 * with a count so it is obvious when something is narrowing your results.
 * Focusing the input opens the same panel showing what you searched before and
 * what is worth searching for — a blank box is the least useful state a search
 * can be in, and it is the state it spends most of its life in.
 *
 * HISTORY is per-device (localStorage), keyed by `storageKey` so the
 * marketplace and the registry keep separate lists. It is deliberately not
 * server-side: a search term is a weak signal, and storing everyone's queries
 * against their account is a privacy cost this feature does not need to pay.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  /** The committed search term. */
  modelValue: { type: String, default: '' },
  /** Distinguishes this bar's history from other bars'. */
  storageKey: { type: String, required: true },
  placeholder: { type: String, default: 'Search' },
  /**
   * Things worth searching for — typically the project titles currently on the
   * page. Plain strings.
   */
  suggestions: { type: Array, default: () => [] },
  /** How many filters are currently non-default; drives the badge. */
  activeFilterCount: { type: Number, default: 0 },
})

/**
 * `update:modelValue` fires on every keystroke — pages that filter a list they
 * already hold want that. `search` fires only when a term is COMMITTED (Enter,
 * or picking a row), which is what a page that hits the server on every search
 * should listen to instead.
 */
const emit = defineEmits(['update:modelValue', 'search', 'clear-filters'])

const HISTORY_LIMIT = 6
const historyKey = computed(() => `carbonify_search_history_${props.storageKey}`)

const root = ref(null)
const inputEl = ref(null)
const draft = ref(props.modelValue)
const panel = ref('') // '' | 'suggest' | 'filters'
const history = ref([])

function loadHistory() {
  try {
    const raw = localStorage.getItem(historyKey.value)
    const parsed = raw ? JSON.parse(raw) : []
    history.value = Array.isArray(parsed) ? parsed.filter((t) => typeof t === 'string') : []
  } catch {
    history.value = []
  }
}

function saveHistory() {
  try {
    localStorage.setItem(historyKey.value, JSON.stringify(history.value))
  } catch {
    /* private mode / quota — history is a convenience, not a requirement */
  }
}

function remember(term) {
  const value = String(term || '').trim()
  if (!value) return
  history.value = [value, ...history.value.filter((t) => t !== value)].slice(0, HISTORY_LIMIT)
  saveHistory()
}

function forget(term) {
  history.value = history.value.filter((t) => t !== term)
  saveHistory()
}

function clearHistory() {
  history.value = []
  saveHistory()
}

/**
 * Suggestions worth showing: those matching what has been typed so far, minus
 * anything already offered as history (the same term twice in one panel reads
 * as a bug). Capped so the panel never becomes its own scrolling problem.
 */
const shownSuggestions = computed(() => {
  const q = draft.value.trim().toLowerCase()
  const seen = new Set(history.value.map((t) => t.toLowerCase()))
  return props.suggestions
    .filter((s) => typeof s === 'string' && s.trim())
    .filter((s) => !seen.has(s.toLowerCase()))
    .filter((s) => !q || s.toLowerCase().includes(q))
    .slice(0, 6)
})

const shownHistory = computed(() => {
  const q = draft.value.trim().toLowerCase()
  return history.value.filter((t) => !q || t.toLowerCase().includes(q))
})

// Typing filters the results live, as it always did — the panel is additive,
// not a gate. Only *committing* (Enter, or picking a suggestion) is recorded.
watch(draft, (value) => emit('update:modelValue', value))
watch(
  () => props.modelValue,
  (value) => {
    if (value !== draft.value) draft.value = value
  },
)

function openSuggest() {
  panel.value = 'suggest'
}

function toggleFilters() {
  panel.value = panel.value === 'filters' ? '' : 'filters'
}

function close() {
  panel.value = ''
}

function commit(term) {
  if (term !== undefined) draft.value = term
  remember(draft.value)
  close()
  emit('search', draft.value)
}

function clearQuery() {
  draft.value = ''
  inputEl.value?.focus()
}

function onDocumentClick(event) {
  if (root.value && !root.value.contains(event.target)) close()
}

function onKeydown(event) {
  if (event.key === 'Escape' && panel.value) {
    close()
    inputEl.value?.blur()
  }
}

onMounted(() => {
  loadHistory()
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div ref="root" class="smart-search">
    <div class="ss-bar" :class="{ 'ss-bar--open': !!panel }">
      <span class="material-symbols-outlined ss-icon" aria-hidden="true">search</span>
      <input
        ref="inputEl"
        v-model="draft"
        type="text"
        class="ss-input"
        :placeholder="placeholder"
        :aria-label="placeholder"
        :aria-expanded="panel === 'suggest'"
        aria-haspopup="listbox"
        @focus="openSuggest"
        @keyup.enter="commit()"
      />

      <button
        v-if="draft"
        type="button"
        class="ss-clear"
        aria-label="Clear search"
        @click="clearQuery"
      >
        <span class="material-symbols-outlined" aria-hidden="true">close</span>
      </button>

      <!-- The filters used to be five selects sitting beside this bar. -->
      <button
        type="button"
        class="ss-filter-btn"
        :class="{ active: panel === 'filters' || activeFilterCount > 0 }"
        :aria-expanded="panel === 'filters'"
        @click="toggleFilters"
      >
        <span class="material-symbols-outlined" aria-hidden="true">tune</span>
        <span class="ss-filter-label">Filters</span>
        <span v-if="activeFilterCount > 0" class="ss-filter-count">{{ activeFilterCount }}</span>
      </button>
    </div>

    <!-- Suggestions + history -->
    <div v-if="panel === 'suggest'" class="ss-panel">
      <div v-if="shownHistory.length" class="ss-group">
        <div class="ss-group-head">
          <span class="ss-group-title">Recent searches</span>
          <button type="button" class="ss-group-action" @click="clearHistory">Clear</button>
        </div>
        <div class="ss-row-list">
          <div v-for="term in shownHistory" :key="`h-${term}`" class="ss-row">
            <button type="button" class="ss-row-main" @click="commit(term)">
              <span class="material-symbols-outlined ss-row-ico" aria-hidden="true">history</span>
              <span class="ss-row-text">{{ term }}</span>
            </button>
            <button
              type="button"
              class="ss-row-remove"
              :aria-label="`Remove ${term} from recent searches`"
              @click="forget(term)"
            >
              <span class="material-symbols-outlined" aria-hidden="true">close</span>
            </button>
          </div>
        </div>
      </div>

      <div v-if="shownSuggestions.length" class="ss-group">
        <div class="ss-group-head">
          <span class="ss-group-title">Recommended</span>
        </div>
        <div class="ss-row-list">
          <div v-for="term in shownSuggestions" :key="`s-${term}`" class="ss-row">
            <button type="button" class="ss-row-main" @click="commit(term)">
              <span class="material-symbols-outlined ss-row-ico" aria-hidden="true">
                trending_up
              </span>
              <span class="ss-row-text">{{ term }}</span>
            </button>
          </div>
        </div>
      </div>

      <p v-if="!shownHistory.length && !shownSuggestions.length" class="ss-empty">
        Type to search, or press Enter to save this search for next time.
      </p>
    </div>

    <!-- Filters, moved in from the row that used to sit outside the bar -->
    <div v-else-if="panel === 'filters'" class="ss-panel ss-panel--filters">
      <div class="ss-filters-grid">
        <slot name="filters" />
      </div>
      <div class="ss-filters-foot">
        <button type="button" class="ss-group-action" @click="emit('clear-filters')">
          Reset filters
        </button>
        <button type="button" class="ss-apply" @click="close">Done</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.smart-search {
  position: relative;
  width: 100%;
  max-width: 640px;
  /* The marketplace banner is text-align:center, and this bar sits inside it.
     Without this the filter panel's field labels centred themselves over
     left-aligned selects — the "filters are not aligned" report. Anything the
     bar draws is left-aligned regardless of the page it is dropped into. */
  text-align: left;
}

.ss-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  /* Compact by design — this used to be a 3rem-tall bar spanning the header. */
  height: 38px;
  padding: 0 0.4rem 0 0.6rem;
  background: #fff;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}

.ss-bar--open {
  border-color: var(--primary-color, #058526);
  box-shadow: 0 0 0 3px rgba(5, 133, 38, 0.12);
}

.ss-icon {
  font-size: 1.05rem;
  color: var(--text-muted, #64748b);
  flex: 0 0 auto;
}

.ss-input {
  flex: 1 1 auto;
  /* Both minimums are load-bearing, not defaults. A global mobile stylesheet
     used to set `min-height: 44px; min-width: 44px` on every input and button
     in the app, which is taller than this 38px bar — the contents overflowed
     it top and bottom. That rule is gone, but the bar states its own floor so
     the next well-meant global cannot silently reshape it. */
  min-width: 0;
  min-height: 0;
  height: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 0.87rem;
  color: var(--text-primary, #1a1a1a);
}

.ss-clear,
.ss-row-remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-height: 0;
  min-width: 0;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted, #64748b);
  cursor: pointer;
}
.ss-clear {
  width: 24px;
  height: 24px;
}

.ss-clear .material-symbols-outlined,
.ss-row-remove .material-symbols-outlined {
  font-size: 1rem;
}
.ss-clear:hover,
.ss-row-remove:hover {
  color: var(--text-primary, #1a1a1a);
}

.ss-filter-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  flex: 0 0 auto;
  height: 28px;
  /* See .ss-input — this button is what actually burst out of the bar. */
  min-height: 0;
  min-width: 0;
  padding: 0 0.6rem;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 999px;
  background: var(--bg-secondary, #f8fdf8);
  color: var(--text-secondary, #4a5568);
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}

.ss-filter-btn .material-symbols-outlined {
  font-size: 1rem;
}

.ss-filter-btn.active {
  border-color: var(--primary-color, #058526);
  background: var(--primary-light, #e8f5e8);
  color: var(--primary-dark, #045c1a);
}

.ss-filter-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.05rem;
  height: 1.05rem;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: var(--primary-color, #058526);
  color: #fff;
  font-size: 0.66rem;
  line-height: 1;
}

.ss-panel {
  position: absolute;
  z-index: 40;
  top: calc(100% + 0.4rem);
  left: 0;
  right: 0;
  padding: 0.6rem;
  background: #fff;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 12px;
  box-shadow: 0 14px 34px rgba(15, 23, 42, 0.16);
  /* Its own scroller, so a long history can never lengthen the page. */
  max-height: min(60vh, 26rem);
  overflow-y: auto;
}

.ss-group + .ss-group {
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border-light, #e8f5e8);
}

.ss-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0 0.2rem 0.3rem;
}

.ss-group-title {
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-secondary, #4a5568);
}

.ss-group-action {
  border: none;
  background: none;
  padding: 0;
  color: var(--primary-color, #058526);
  font-family: inherit;
  font-size: 0.74rem;
  font-weight: 600;
  cursor: pointer;
}
.ss-group-action:hover {
  text-decoration: underline;
}

.ss-row-list {
  display: flex;
  flex-direction: column;
}

.ss-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 8px;
}
.ss-row:hover {
  background: var(--bg-secondary, #f8fdf8);
}

.ss-row-main {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.45rem;
  border: none;
  background: none;
  font-family: inherit;
  font-size: 0.84rem;
  color: var(--text-primary, #1a1a1a);
  text-align: left;
  cursor: pointer;
}

.ss-row-ico {
  font-size: 1rem;
  color: var(--text-muted, #64748b);
  flex: 0 0 auto;
}

.ss-row-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ss-row-remove {
  padding-right: 0.4rem;
}

.ss-empty {
  margin: 0;
  padding: 0.5rem 0.45rem;
  font-size: 0.8rem;
  color: var(--text-muted, #64748b);
}

.ss-filters-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
  gap: 0.6rem;
}

/* Slotted controls come from the host page, so style them from here rather
   than asking every caller to repeat the same six declarations. */
.ss-filters-grid :deep(label) {
  display: block;
  margin-bottom: 0.2rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-secondary, #4a5568);
}

.ss-filters-grid :deep(select) {
  width: 100%;
  height: 34px;
  padding: 0 0.5rem;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 8px;
  background: #fff;
  font-family: inherit;
  font-size: 0.82rem;
  color: var(--text-primary, #1a1a1a);
}

.ss-filters-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-top: 0.7rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--border-light, #e8f5e8);
}

.ss-apply {
  padding: 0.35rem 0.9rem;
  border: none;
  border-radius: 8px;
  background: var(--primary-color, #058526);
  color: #fff;
  font-family: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.ss-apply:hover {
  background: var(--primary-hover, #04701f);
}

@media (max-width: 640px) {
  .smart-search {
    max-width: none;
  }

  /* The word is what makes the button obvious on a desktop; on a phone the
     icon plus the count carries it and the bar needs the width back. */
  .ss-filter-label {
    display: none;
  }
}
</style>
