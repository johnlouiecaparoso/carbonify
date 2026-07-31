import { ref, readonly } from 'vue'

/**
 * Sidebar open/collapsed state, shared between the header's menu button and the
 * sidebar itself.
 *
 * Module-level refs rather than a Pinia store: this is view state with no
 * server round trip, no actions worth devtools-tracing, and two consumers.
 *
 * Two independent pieces of state, because they answer different questions:
 *   drawerOpen — is the off-canvas sidebar showing? (mobile only)
 *   collapsed  — is the desktop sidebar an icon-only rail?
 */

const STORAGE_KEY = 'carbonify.sidebar.collapsed'

function readCollapsed() {
  // localStorage throws in private-mode Safari and is absent during SSR/tests.
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const drawerOpen = ref(false)
const collapsed = ref(readCollapsed())

export function useSidebar() {
  function openDrawer() {
    drawerOpen.value = true
  }

  function closeDrawer() {
    drawerOpen.value = false
  }

  function toggleDrawer() {
    drawerOpen.value = !drawerOpen.value
  }

  function toggleCollapsed() {
    collapsed.value = !collapsed.value
    try {
      window.localStorage.setItem(STORAGE_KEY, String(collapsed.value))
    } catch {
      // A sidebar that won't remember its width is not worth breaking navigation over.
    }
  }

  return {
    drawerOpen: readonly(drawerOpen),
    collapsed: readonly(collapsed),
    openDrawer,
    closeDrawer,
    toggleDrawer,
    toggleCollapsed,
  }
}
