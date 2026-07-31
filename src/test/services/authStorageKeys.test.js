import { describe, it, expect } from 'vitest'
import { isAuthStorageKey } from '@/store/userStore'

/**
 * clearLocalStorage() runs on session EXPIRY, not only on logout, so whatever
 * it matches is deleted out from under a user who is still sitting on the page.
 *
 * The old predicate was:
 *   key.startsWith('sb-') || key.includes('supabase') ||
 *   key.includes('auth')  || key.includes('user')
 *
 * Those last two are substring matches on words common enough to hit unrelated
 * keys. Separately, performLogout() called localStorage.clear() outright, which
 * reset the user's theme, language, accessibility settings and sidebar width
 * every time they signed out.
 */
describe('isAuthStorageKey', () => {
  it('matches the keys Supabase actually writes', () => {
    expect(isAuthStorageKey('sb-abcdefgh-auth-token')).toBe(true)
    expect(isAuthStorageKey('sb-localhost-auth-token-code-verifier')).toBe(true)
    expect(isAuthStorageKey('supabase.auth.token')).toBe(true)
  })

  it('leaves the app’s own settings alone', () => {
    // Every one of these was destroyed by the old substring rules.
    for (const key of [
      'theme',
      'language',
      'preferences',
      'carbonify.sidebar.collapsed',
      'user-preferences',
      'authoring-draft',
      'lastUserVisit',
      'cart',
    ]) {
      expect(isAuthStorageKey(key), `${key} would be deleted`).toBe(false)
    }
  })

  it('does not match a key that merely mentions auth or user', () => {
    expect(isAuthStorageKey('my-auth-notes')).toBe(false)
    expect(isAuthStorageKey('user')).toBe(false)
    expect(isAuthStorageKey('supabase-ish')).toBe(false)
  })

  it('tolerates non-string keys', () => {
    for (const value of [null, undefined, 0, {}, []]) {
      expect(isAuthStorageKey(value)).toBe(false)
    }
  })
})
