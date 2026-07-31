/**
 * Signs the user out and returns them to the login page.
 *
 * Extracted from the header so the sidebar's logout button behaves identically
 * — two copies of a sign-out path is how you end up with one of them leaving
 * a stale session behind.
 *
 * Order matters. userStore.logout() clears auth storage synchronously before
 * its first await, so the session is unusable from the moment the click lands
 * even if the network call is slow or fails. It is deliberately not awaited for
 * the same reason. The redirect is a full page load rather than a router push,
 * which guarantees every store, cache and in-flight subscription is discarded.
 *
 * This used to call localStorage.clear() and sessionStorage.clear() first — a
 * total wipe that also took the user's theme, language, accessibility settings
 * and sidebar width with it, so signing out silently reset the app's
 * appearance. The store clears auth keys precisely (see isAuthStorageKey), and
 * that is the only thing signing out should discard.
 *
 * @param {{ logout: () => Promise<unknown> }} userStore
 */
export function performLogout(userStore) {
  userStore.logout().catch((error) => {
    console.error('User store logout error:', error)
  })

  // The delay gives the store's own cleanup a moment to run before the page is
  // torn down; the redirect happens regardless of whether it finished.
  setTimeout(() => {
    try {
      window.location.replace('/login')
    } catch (error) {
      console.error('Redirect failed, trying alternative:', error)
      window.location.href = '/login'
    }
  }, 200)
}
