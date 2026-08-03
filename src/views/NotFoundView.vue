<script setup>
/**
 * What you get when a URL does not match any route.
 *
 * Until this existed there was no catch-all, so vue-router matched nothing and
 * rendered nothing: typing a plausible-but-wrong address — /developer instead
 * of /developer/projects, /settings instead of /preferences — produced the
 * header, the footer, and a white gap between them. Nothing said the page was
 * missing, so it read as the app being broken rather than the address being
 * wrong.
 *
 * Guessing the address is a reasonable thing to do, so this page tries to make
 * the guess work. It matches what was typed against the destinations THIS user
 * can actually reach (constants/navigation.js — the same list that builds their
 * sidebar) and offers the closest ones. A role never sees a suggestion it would
 * be bounced off.
 */
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { buildSidebar, buildGuestNav, homeDestination } from '@/constants/navigation'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const attemptedPath = computed(() => route.fullPath)

/** Every destination this user is offered anywhere, flattened and de-duped. */
const reachable = computed(() => {
  // The store satisfies the shape constants/navigation.js reads (isAdmin,
  // isFarmer, …) and AppSidebar already passes it straight through; doing the
  // same here keeps one definition of "what this role can see".
  const groups = userStore.isAuthenticated
    ? buildSidebar(userStore)
    : [{ items: buildGuestNav() }]
  const seen = new Set()
  const out = []
  for (const g of groups) {
    for (const item of g.items || []) {
      if (!item?.path || seen.has(item.path)) continue
      seen.add(item.path)
      out.push(item)
    }
  }
  return out
})

/**
 * The words in the address that carry meaning. `/admin/kyc-review?tab=2` →
 * ['admin', 'kyc', 'review'].
 */
const typedWords = computed(() =>
  route.path
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean),
)

/**
 * Score a destination against what was typed. Whole-word hits in the path count
 * for more than in the label, and a prefix ("dev" for "developer") counts for
 * something — typing a shortened form is the common case.
 */
function score(destination) {
  const pathWords = destination.path.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  const labelWords = destination.label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

  let total = 0
  for (const typed of typedWords.value) {
    if (pathWords.includes(typed)) total += 10
    else if (labelWords.includes(typed)) total += 7
    else if (pathWords.some((w) => w.startsWith(typed) || typed.startsWith(w))) total += 4
    else if (labelWords.some((w) => w.startsWith(typed) || typed.startsWith(w))) total += 3
  }
  return total
}

const suggestions = computed(() =>
  reachable.value
    .map((d) => ({ ...d, score: score(d) }))
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5),
)

const home = computed(() => homeDestination(userStore))

function goBack() {
  // `history.length > 1` is not reliable in an SPA, but a failed back() just
  // leaves you here, which is where you already are.
  if (window.history.length > 1) router.back()
  else router.push(home.value.path)
}
</script>

<template>
  <div class="notfound">
    <div class="notfound__inner">
      <span class="material-symbols-outlined notfound__glyph" aria-hidden="true">
        travel_explore
      </span>

      <p class="notfound__eyebrow">404 — page not found</p>
      <h1 class="notfound__title">There's nothing at that address</h1>
      <p class="notfound__path">
        You asked for <code>{{ attemptedPath }}</code>
      </p>

      <div v-if="suggestions.length" class="notfound__block">
        <h2 class="notfound__subtitle">Did you mean one of these?</h2>
        <ul class="notfound__list">
          <li v-for="item in suggestions" :key="item.path">
            <router-link :to="item.path" class="notfound__suggestion">
              <span class="material-symbols-outlined" aria-hidden="true">
                {{ item.icon || 'arrow_forward' }}
              </span>
              <span class="notfound__suggestion-text">
                <strong>{{ item.label }}</strong>
                <small>{{ item.path }}</small>
              </span>
            </router-link>
          </li>
        </ul>
      </div>

      <p v-else class="notfound__block notfound__hint">
        Nothing here matches that. Your own pages are all listed in the menu —
        open it from the button at the top left.
      </p>

      <div class="notfound__actions">
        <router-link :to="home.path" class="notfound__btn notfound__btn--primary">
          Go to {{ home.label }}
        </router-link>
        <button type="button" class="notfound__btn" @click="goBack">Go back</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.notfound {
  min-height: 60vh;
  background: var(--bg-secondary, #f8fdf8);
  padding: 2.5rem 1rem 3rem;
}

.notfound__inner {
  max-width: 620px;
  margin: 0 auto;
  text-align: left;
}

.notfound__glyph {
  font-size: 2.5rem;
  color: var(--primary-color, #058526);
}

.notfound__eyebrow {
  margin: 0.5rem 0 0.25rem;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted, #64748b);
}

.notfound__title {
  margin: 0 0 0.5rem;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary, #1a1a1a);
}

.notfound__path {
  margin: 0;
  font-size: 0.9rem;
  color: var(--text-secondary, #4a5568);
  overflow-wrap: anywhere;
}

.notfound__path code {
  font-family: ui-monospace, monospace;
  background: #fff;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 6px;
  padding: 0.1rem 0.35rem;
}

.notfound__block {
  margin-top: 1.75rem;
}

.notfound__subtitle {
  margin: 0 0 0.6rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-secondary, #4a5568);
}

.notfound__hint {
  font-size: 0.9rem;
  color: var(--text-secondary, #4a5568);
}

.notfound__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.notfound__suggestion {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.65rem 0.8rem;
  background: #fff;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 10px;
  text-decoration: none;
  color: var(--text-primary, #1a1a1a);
}

.notfound__suggestion:hover {
  border-color: var(--primary-color, #058526);
  background: var(--primary-light, #e8f5e8);
}

.notfound__suggestion .material-symbols-outlined {
  font-size: 1.25rem;
  color: var(--primary-color, #058526);
  flex: 0 0 auto;
}

.notfound__suggestion-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.notfound__suggestion-text small {
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  color: var(--text-muted, #64748b);
}

.notfound__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 1.75rem;
}

.notfound__btn {
  padding: 0.6rem 1.1rem;
  border: 1px solid var(--border-color, #d1e7dd);
  border-radius: 8px;
  background: #fff;
  color: var(--text-primary, #1a1a1a);
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  text-decoration: none;
  cursor: pointer;
}

.notfound__btn--primary {
  background: var(--primary-color, #058526);
  border-color: var(--primary-color, #058526);
  color: #fff;
}

.notfound__btn--primary:hover {
  background: var(--primary-hover, #04701f);
}
</style>
