import { describe, it, expect } from 'vitest'
import { safeInternalPath } from '@/utils/safeInternalPath'

/**
 * An open redirect reachable from a database row.
 *
 * `system_notifications.link` is rendered by the bell in
 * [Header.vue](../../components/layout/Header.vue), which navigated with
 * `window.location.assign(notification.link)` — and that accepts an absolute
 * URL. The table's INSERT policy is `with check (auth.uid() is not null)`, and
 * `createNotificationsForUsers()` inserts client-side with an arbitrary
 * `user_id`, so **any signed-in user can put a row in any other user's feed**,
 * including an admin's, with any title, message and link they like.
 *
 * "Payout on hold — reconfirm your bank details", pointing wherever they want,
 * arriving in the product's own notification bell. The stored data is trusted
 * by the thing that renders it, which is the same shape as every other defect
 * on this project: a value that reads as a fact because of where it appears.
 *
 * The RLS half is DEFERRED_BACKLOG #36 and needs a migration. This is the
 * defence-in-depth half, and it stands on its own: nothing stored in the
 * database should be able to navigate a user off the site.
 */

describe('safeInternalPath — the bell cannot be pointed off-site', () => {
  it('allows ordinary in-app destinations', () => {
    for (const path of [
      '/verifier',
      '/admin',
      '/projects/abc-123',
      '/orders?status=pending',
      '/guide#step-2',
      '/',
    ]) {
      expect(safeInternalPath(path), path).toBe(path)
    }
  })

  it('refuses absolute and protocol-relative URLs', () => {
    for (const link of [
      'https://evil.test/carbonify-login',
      'http://evil.test',
      '//evil.test/x',
      'HTTPS://EVIL.TEST',
    ]) {
      expect(safeInternalPath(link), link).toBe('/')
    }
  })

  it('refuses script and document-spoofing schemes', () => {
    for (const link of [
      'javascript:alert(document.cookie)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'blob:https://evil.test/uuid',
      'vbscript:msgbox(1)',
    ]) {
      expect(safeInternalPath(link), link).toBe('/')
    }
  })

  it('refuses the backslash trick browsers normalise into a host', () => {
    // Browsers treat `\` as `/`, so these resolve to //evil.test.
    for (const link of ['/\\evil.test', '\\\\evil.test', '/\\/evil.test']) {
      expect(safeInternalPath(link), link).toBe('/')
    }
  })

  it('refuses a scheme hidden behind a stripped control character', () => {
    // Browsers remove tab/newline/CR while parsing a URL, so this becomes
    // `javascript:alert(1)` after the check a naive prefix test would run.
    const withTab = 'java' + String.fromCharCode(9) + 'script:alert(1)'
    const withNewline = 'java' + String.fromCharCode(10) + 'script:alert(1)'
    expect(safeInternalPath(withTab)).toBe('/')
    expect(safeInternalPath(withNewline)).toBe('/')
  })

  it('refuses relative paths, which resolve against wherever you are', () => {
    for (const link of ['orders', './orders', '../admin', '']) {
      expect(safeInternalPath(link), JSON.stringify(link)).toBe('/')
    }
  })

  it('refuses non-strings rather than throwing inside the click handler', () => {
    for (const value of [null, undefined, 0, 42, {}, [], true]) {
      expect(safeInternalPath(value)).toBe('/')
    }
  })

  it('honours an explicit fallback', () => {
    expect(safeInternalPath('https://evil.test', '/dashboard')).toBe('/dashboard')
    expect(safeInternalPath('/inbox', '/dashboard')).toBe('/inbox')
  })

  it('the bell actually calls it — not just that it exists', async () => {
    // The 2026-08-01 counterparty lesson: a helper that nothing imports is not
    // a fix. Asserting the export would have passed while Header.vue still
    // assigned the raw link.
    const { readFileSync } = await import('node:fs')
    const src = readFileSync('src/components/layout/Header.vue', 'utf8')

    expect(src).toContain("from '@/utils/safeInternalPath'")
    expect(src).toMatch(/safeInternalPath\(\s*notification\.link/)
    // And the raw value must no longer reach the navigation.
    expect(src).not.toMatch(/const targetPath = notification\.link/)
  })
})
