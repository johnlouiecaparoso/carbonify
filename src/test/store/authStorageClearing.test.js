import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserStore, isAuthStorageKey } from '@/store/userStore'

/**
 * What signing out actually REMOVES — as opposed to what the predicate says.
 *
 * `authStorageKeys.test.js` already pins `isAuthStorageKey`, and it was correct
 * the whole time. Nothing asserted that anything USES it correctly. That is the
 * same gap as `routeAccess.test.js` (asserted the route metadata; nothing
 * asserted the guard read it) and the RetireView portfolio import (the function
 * was fixed; the view called the other copy).
 *
 * It could not have been closed before 2026-08-02, and the reason is worth
 * recording. `src/test/setup.js` replaced `localStorage` with
 * `{ getItem: vi.fn(), setItem: vi.fn(), … }`. `clearLocalStorage()` iterates
 * **`Object.keys(storage)`**, and on that stub `Object.keys` returns the METHOD
 * NAMES — `['getItem','setItem','removeItem','clear']` — none of which match
 * `isAuthStorageKey`. So the loop ran, matched nothing, removed nothing, and
 * threw nothing. A test written against it would have passed no matter what the
 * function did, including doing the exact opposite.
 *
 * Real Storage exposes its entries as own enumerable properties, which is what
 * makes `Object.keys(storage)` the list of stored keys and what makes this file
 * possible at all.
 *
 * Why it matters beyond tidiness: `clearLocalStorage()` runs on session EXPIRY,
 * not only on an explicit sign-out. Over-matching silently destroys a user's
 * theme, language, accessibility settings and cart while they are still sitting
 * on the page; under-matching leaves a session token on a shared machine.
 */

const AUTH_KEYS = [
  'sb-abcdefgh-auth-token',
  'sb-localhost-auth-token-code-verifier',
  'supabase.auth.token',
]

// Every one of these was destroyed by the pre-2026-07 substring rules
// (`key.includes('auth')` / `key.includes('user')`), and the cart is the one
// with money attached.
const APP_KEYS = {
  theme: 'dark',
  language: 'en',
  preferences: '{"display":{"animations":true}}',
  'carbonify.sidebar.collapsed': 'true',
  'user-preferences': '{}',
  'authoring-draft': 'a half-written project',
  lastUserVisit: '2026-08-02',
  cart: '[{"listingId":"l1","quantity":3}]',
}

function seed(storage) {
  for (const k of AUTH_KEYS) storage.setItem(k, 'secret-token-value')
  for (const [k, v] of Object.entries(APP_KEYS)) storage.setItem(k, v)
}

describe('clearLocalStorage removes the session and nothing else', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('the test environment provides real Storage — otherwise this file proves nothing', () => {
    // Guard against a future setup.js re-stubbing the global and quietly
    // turning every assertion below into a no-op. This is the exact failure
    // this file exists because of, so it is asserted rather than assumed.
    localStorage.setItem('probe', 'value')
    expect(localStorage.getItem('probe')).toBe('value')
    expect(Object.keys(localStorage)).toContain('probe')
    expect(Object.keys(localStorage)).not.toContain('getItem')
  })

  it('deletes the Supabase auth keys from localStorage', () => {
    seed(localStorage)
    useUserStore().clearLocalStorage()

    for (const k of AUTH_KEYS) {
      expect(localStorage.getItem(k), `${k} survived sign-out`).toBeNull()
    }
  })

  it('deletes them from sessionStorage too', () => {
    // The loop covers both stores. sessionStorage was never stubbed, so these
    // two halves of one loop behaved differently under test for months.
    seed(sessionStorage)
    useUserStore().clearLocalStorage()

    for (const k of AUTH_KEYS) {
      expect(sessionStorage.getItem(k), `${k} survived in sessionStorage`).toBeNull()
    }
  })

  it('leaves the user’s own settings and their cart alone', () => {
    seed(localStorage)
    useUserStore().clearLocalStorage()

    for (const [k, v] of Object.entries(APP_KEYS)) {
      expect(localStorage.getItem(k), `${k} was destroyed by sign-out`).toBe(v)
    }
  })

  it('clearUserData() — the session-expiry path — clears storage as well', () => {
    // Expiry does not go through logout(). If this stopped calling
    // clearLocalStorage, a stale token would outlive the session that owned it
    // and nothing else in the suite would notice.
    seed(localStorage)
    const store = useUserStore()
    store.clearUserData()

    expect(localStorage.getItem('sb-abcdefgh-auth-token')).toBeNull()
    expect(localStorage.getItem('theme')).toBe('dark')
    expect(store.session).toBeNull()
  })

  it('is a no-op when there is nothing of ours to remove', () => {
    localStorage.setItem('theme', 'dark')
    expect(() => useUserStore().clearLocalStorage()).not.toThrow()
    expect(localStorage.getItem('theme')).toBe('dark')
  })

  it('the predicate and the clearing agree — every seeded auth key matches', () => {
    // Non-vacuity: if AUTH_KEYS drifted to a shape the predicate does not
    // match, the deletion tests above would pass by never having anything to
    // delete.
    for (const k of AUTH_KEYS) expect(isAuthStorageKey(k), k).toBe(true)
    for (const k of Object.keys(APP_KEYS)) expect(isAuthStorageKey(k), k).toBe(false)
  })
})
