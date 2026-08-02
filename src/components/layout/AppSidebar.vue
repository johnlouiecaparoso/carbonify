<script setup>
/**
 * The app's primary navigation for signed-in users.
 *
 * Every product feature a role can reach is in here, grouped — which is what
 * lets the rest of the app stop carrying navigation. The header keeps only
 * identity and alerts (cart, notifications, avatar), and dashboards no longer
 * repeat a directory of links.
 *
 * Three states:
 *   desktop expanded  — labelled groups, 16rem rail
 *   desktop collapsed — icons only, 4.5rem rail, labels via title/aria-label
 *   mobile            — off-canvas drawer over a scrim, opened from the header
 */
import { computed, ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { useCartStore } from '@/store/cartStore'
import { useSidebar } from '@/composables/useSidebar'
import { buildSidebar, buildAccountMenu } from '@/constants/navigation'

const route = useRoute()
const userStore = useUserStore()
const cartStore = useCartStore()
// The collapse control lives in the header, next to the logo, so there is one
// menu button rather than one in the header and another down here.
const { drawerOpen, collapsed, closeDrawer } = useSidebar()

const navEl = ref(null)
const previouslyFocused = ref(null)

const sections = computed(() => buildSidebar(userStore, { cartCount: cartStore.count }))

// Not rendered here any more — the header's avatar dropdown owns the account
// menu at every width. Still needed for `navPaths` below: standing on /profile
// must not leave a *product* link lit, so those paths have to be candidates
// when resolving which single item owns the highlight.
const accountItems = computed(() => buildAccountMenu(userStore))

/**
 * Every nav path that could claim the "current" highlight. Used to resolve
 * overlaps: /biomass/sell is beneath /biomass, and /admin/users beneath /admin,
 * so a naive prefix match lights the parent AND the child. Only the most
 * specific (longest) matching path should win.
 */
const navPaths = computed(() => [
  ...sections.value.flatMap((section) => section.items.map((item) => item.path)),
  ...accountItems.value.map((item) => item.path),
  // These two are rendered as literal links in the account block below rather
  // than coming from accountItems, so they have to be listed by hand. '/guide'
  // was missing: `activePath` could never resolve to a path it had never been
  // told about, so the User guide link was the one item in the drawer that
  // stayed unhighlighted while you were standing on it.
  '/about',
  '/guide',
])

/**
 * The single path that owns the current-route highlight: the longest nav path
 * the route sits on. A path matches when the route equals it or is nested
 * beneath it (/developer/projects stays lit on /developer/projects/42); '/' only
 * matches the route '/' exactly, since every path is "beneath" root.
 */
const activePath = computed(() => {
  const current = route.path
  let best = ''
  for (const path of navPaths.value) {
    const matches =
      path === '/' ? current === '/' : current === path || current.startsWith(`${path}/`)
    if (matches && path.length > best.length) best = path
  }
  return best
})

function isCurrent(path) {
  return activePath.value === path
}

// Navigating is the end of the drawer's job. Watching the route rather than
// binding @click on every link also covers programmatic navigation.
watch(
  () => route.fullPath,
  () => closeDrawer(),
)

function onKeydown(event) {
  if (event.key === 'Escape' && drawerOpen.value) {
    closeDrawer()
  }
}

/**
 * Focus moves into the drawer when it opens and back to whatever opened it when
 * it closes. Without this a keyboard user opens the drawer and stays parked on
 * the header button, tabbing through a menu they cannot see.
 */
watch(drawerOpen, async (open) => {
  if (open) {
    previouslyFocused.value = document.activeElement
    await nextTick()
    navEl.value?.querySelector('a, button')?.focus()
  } else if (previouslyFocused.value instanceof HTMLElement) {
    previouslyFocused.value.focus()
    previouslyFocused.value = null
  }
})

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <!-- Scrim sits below the drawer but above the page; clicking it is the
       expected way out of an off-canvas menu. -->
  <div v-if="drawerOpen" class="sidebar-scrim" @click="closeDrawer"></div>

  <aside
    class="sidebar"
    :class="{ 'sidebar--collapsed': collapsed, 'sidebar--open': drawerOpen }"
    aria-label="Main navigation"
  >
    <nav ref="navEl" class="sidebar-nav">
      <div v-for="(section, index) in sections" :key="section.title || index" class="nav-section">
        <!-- Hidden when collapsed rather than removed: the divider above each
             group is what keeps the icon rail readable. -->
        <p v-if="section.title" class="nav-section-title">{{ section.title }}</p>
        <div v-else-if="index > 0" class="nav-section-rule" role="presentation"></div>

        <ul class="nav-list">
          <li v-for="item in section.items" :key="item.path">
            <router-link
              :to="item.path"
              class="nav-item"
              :class="{ current: isCurrent(item.path) }"
              :aria-current="isCurrent(item.path) ? 'page' : undefined"
              :title="collapsed ? item.label : undefined"
            >
              <span class="material-symbols-outlined nav-icon" aria-hidden="true">
                {{ item.icon }}
              </span>
              <span class="nav-label">{{ item.label }}</span>
            </router-link>
          </li>
        </ul>
      </div>

      <!-- The account block that used to live here — identity, profile,
           preferences, KYC, wallet, About, Take a tour, User guide, Logout —
           has moved to the header's avatar dropdown, which is now present at
           every width. It was only ever rendered on mobile, to make up for a
           mobile header that had no avatar menu, and it made this drawer long
           enough that signing out meant scrolling past every feature. -->
    </nav>
  </aside>
</template>

<style scoped>
.sidebar {
  --sidebar-width: 16rem;
  --sidebar-width-collapsed: 4.5rem;

  position: sticky;
  /* Below the 5rem sticky header, so both stay put while the page scrolls. */
  top: 5rem;
  height: calc(100vh - 5rem);
  flex-shrink: 0;
  width: var(--sidebar-width);
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border-right: 1px solid var(--border-color);
  transition: width 0.18s ease;
}

.sidebar--collapsed {
  width: var(--sidebar-width-collapsed);
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1rem 0.6rem;
  scrollbar-width: thin;
  scrollbar-color: var(--border-green-light) transparent;
}

.sidebar-nav::-webkit-scrollbar {
  width: 6px;
}

.sidebar-nav::-webkit-scrollbar-thumb {
  background: var(--border-green-light);
  border-radius: 999px;
}

.nav-section + .nav-section {
  margin-top: 1.1rem;
}

.nav-section-title {
  margin: 0 0 0.35rem;
  padding: 0 0.65rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  /* --text-secondary, not --text-muted: muted grey fails 4.5:1 at this size. */
  color: var(--text-secondary);
  white-space: nowrap;
}

.nav-section-rule {
  height: 1px;
  margin: 0 0.65rem 0.6rem;
  background: var(--border-light);
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.1rem;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.55rem 0.65rem;
  border-radius: var(--radius-md);
  color: var(--text-primary);
  text-decoration: none;
  font-size: var(--font-size-sm);
  font-weight: 500;
  white-space: nowrap;
  transition:
    background 0.15s ease,
    color 0.15s ease;
}

.nav-item:hover {
  background: var(--bg-green-light);
  color: var(--primary-dark);
}

.nav-item:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: -2px;
}

.nav-item.current {
  background: var(--primary-color);
  color: var(--text-light);
  font-weight: 600;
}

.nav-item.current .nav-icon {
  color: var(--text-light);
}

.nav-icon {
  font-size: 1.25rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.nav-item:hover .nav-icon {
  color: var(--primary-color);
}

.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Collapsed rail: icons only, centred, labels gone. */
.sidebar--collapsed .nav-section-title,
.sidebar--collapsed .nav-label {
  display: none;
}

.sidebar--collapsed .nav-item {
  justify-content: center;
  padding-inline: 0;
}

.sidebar--collapsed .nav-section-rule {
  margin-inline: 0.4rem;
}

/* The account block is gone at every width now, not just on desktop.
   It existed because the mobile header had no avatar menu, so profile,
   preferences, KYC, wallet, the tour and the user guide were reachable on a
   phone only by scrolling to the very bottom of this drawer. The header is one
   row at all widths now and carries the avatar dropdown beside the cart, so
   this was a second copy of that menu — and the reason the mobile drawer was
   long enough to need scrolling past every feature to sign out. */
.account-block {
  display: none;
}

/* Two nav rows are <button>, not <a>: "Take a tour" and "Logout". A button
   carries a UA border and background, so without this it draws a boxed outline
   the links around it do not have — which is the "Take a tour is highlighted in
   a border" report. This used to be scoped to .nav-item--logout, so only the
   logout button was reset and the tour button kept its box. */
button.nav-item {
  width: 100%;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-sm);
}

.nav-item--logout:hover {
  background: #fef2f2;
  color: #dc2626;
}

.nav-item--logout:hover .nav-icon {
  color: #dc2626;
}

.sidebar-scrim {
  display: none;
}

@media (prefers-reduced-motion: reduce) {
  .sidebar {
    transition: none;
  }
}

/* ── Mobile: off-canvas drawer ─────────────────────────────────────────── */
@media (max-width: 1023px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    height: 100vh;
    /* Above the header (z-index 50) so the drawer is never clipped by it. */
    z-index: 60;
    width: min(17rem, 82vw);
    transform: translateX(-100%);
    transition: transform 0.2s ease;
    box-shadow: var(--shadow-lg);
  }

  /* An icon rail makes no sense for a drawer you had to open on purpose. */
  .sidebar--collapsed {
    width: min(17rem, 82vw);
  }

  .sidebar--collapsed .nav-section-title,
  .sidebar--collapsed .nav-label {
    display: revert;
  }

  .sidebar--collapsed .nav-item {
    justify-content: flex-start;
    padding-inline: 0.65rem;
  }

  .sidebar--open {
    transform: translateX(0);
  }

  .sidebar-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 55;
    background: rgba(15, 23, 42, 0.45);
  }

  @media (prefers-reduced-motion: reduce) {
    .sidebar {
      transition: none;
    }
  }
}
</style>
