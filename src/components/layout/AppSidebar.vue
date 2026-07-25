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
import { getRoleDisplayName } from '@/constants/roles'
import { getUserInitials } from '@/services/profileService'
import { performLogout } from '@/utils/logout'

const route = useRoute()
const userStore = useUserStore()
const cartStore = useCartStore()
// The collapse control lives in the header, next to the logo, so there is one
// menu button rather than one in the header and another down here.
const { drawerOpen, collapsed, closeDrawer } = useSidebar()

const navEl = ref(null)
const previouslyFocused = ref(null)

const sections = computed(() => buildSidebar(userStore, { cartCount: cartStore.count }))

// Account block, rendered only in the mobile drawer (see the media query): the
// mobile header has no room for an avatar, so without this there is no way to
// reach profile settings or sign out on a phone. On desktop the avatar dropdown
// owns these and this block is hidden.
const accountItems = computed(() => buildAccountMenu(userStore))

const displayName = computed(() => userStore.profile?.full_name || 'User')
const roleName = computed(() => getRoleDisplayName(userStore.role))
const initials = computed(() =>
  getUserInitials(userStore.profile?.full_name || userStore.session?.user?.email || 'User'),
)

function handleLogout() {
  closeDrawer()
  performLogout(userStore)
}

/**
 * Every nav path that could claim the "current" highlight. Used to resolve
 * overlaps: /biomass/sell is beneath /biomass, and /admin/users beneath /admin,
 * so a naive prefix match lights the parent AND the child. Only the most
 * specific (longest) matching path should win.
 */
const navPaths = computed(() => [
  ...sections.value.flatMap((section) => section.items.map((item) => item.path)),
  ...accountItems.value.map((item) => item.path),
  '/about',
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

      <!-- Mobile only — see .account-block in the styles below. Guarded on
           auth so the component is safe to mount anywhere: without this a
           signed-out visitor gets an About link and a Logout button. -->
      <div v-if="userStore.isAuthenticated" class="account-block">
        <div class="account-identity">
          <span class="account-avatar">{{ initials }}</span>
          <span class="account-meta">
            <span class="account-name">{{ displayName }}</span>
            <span class="account-role">{{ roleName }}</span>
          </span>
        </div>

        <ul class="nav-list">
          <li v-for="item in accountItems" :key="item.path">
            <router-link
              :to="item.path"
              class="nav-item"
              :class="{ current: isCurrent(item.path) }"
              :aria-current="isCurrent(item.path) ? 'page' : undefined"
            >
              <span class="material-symbols-outlined nav-icon" aria-hidden="true">
                {{ item.icon }}
              </span>
              <span class="nav-label">{{ item.label }}</span>
            </router-link>
          </li>
          <li>
            <router-link to="/about" class="nav-item" :class="{ current: isCurrent('/about') }">
              <span class="material-symbols-outlined nav-icon" aria-hidden="true">info</span>
              <span class="nav-label">About</span>
            </router-link>
          </li>
          <li>
            <button class="nav-item nav-item--logout" type="button" @click="handleLogout">
              <span class="material-symbols-outlined nav-icon" aria-hidden="true">logout</span>
              <span class="nav-label">Logout</span>
            </button>
          </li>
        </ul>
      </div>
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

/* Desktop hides the account block entirely — the avatar dropdown owns it there,
   and two logout buttons on one screen is a question the user shouldn't have
   to answer. */
.account-block {
  display: none;
}

.nav-item--logout {
  width: 100%;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  font-family: inherit;
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

  .account-block {
    display: block;
    margin-top: 1.25rem;
    padding-top: 0.75rem;
    border-top: 1px solid var(--border-light);
  }

  .account-identity {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.35rem 0.65rem 0.7rem;
  }

  .account-avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: var(--primary-color);
    color: var(--text-light);
    font-weight: 700;
    font-size: 0.85rem;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .account-meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .account-name {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-role {
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-secondary);
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
