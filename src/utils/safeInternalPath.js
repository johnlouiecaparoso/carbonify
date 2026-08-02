/**
 * Constrain a navigation target to somewhere inside this app.
 *
 * WHY THIS EXISTS
 * `system_notifications.link` is stored data, and the table's INSERT policy is
 * `with check (auth.uid() is not null)` — any signed-in user may write a row
 * addressed to any other `user_id`. `createNotificationsForUsers()` inserts
 * those rows straight from the client, so `link` is attacker-controllable in
 * practice, not merely in theory.
 *
 * The bell then did `window.location.assign(notification.link)`, which happily
 * accepts an ABSOLUTE URL. That is an in-product phishing vector aimed at any
 * user, including staff: plant *"Payout on hold — reconfirm your bank details"*
 * in an admin's feed, pointing anywhere you like.
 *
 * Closing the RLS hole is the real fix and needs a migration plus moving the
 * cross-user notification writes behind a SECURITY DEFINER RPC — that is
 * DEFERRED_BACKLOG #36. This is the defence-in-depth half, and it is worth
 * having on its own: a link out of the app should never be reachable from a row
 * in the database, whatever wrote it.
 *
 * WHAT COUNTS AS SAFE
 * Only a root-relative path: one leading `/`, no scheme, no host. Everything
 * else collapses to the fallback rather than throwing, because a bad link is
 * not a reason to break the bell.
 *
 * Rejected, and each for a reason a browser gave us:
 *   `https://evil.test/x`   absolute, off-site
 *   `//evil.test/x`         protocol-relative — same thing with the scheme implied
 *   `/\evil.test`           browsers normalise the backslash, so this is `//evil.test`
 *   `javascript:alert(1)`   script execution
 *   `data:` / `blob:`       document-spoofing schemes
 *   `x/y`                   relative: resolves against wherever you happen to be
 */

const FALLBACK = '/'

/**
 * TWO RULES, AND THEY ARE THE ONLY TWO THAT DO ANY WORK.
 *
 * The first draft of this function also scanned for control characters and for
 * a `scheme:` prefix. Mutation-testing each branch showed both were
 * unreachable: anything that survives to them already begins with a single
 * `/`, so `javascript:`, `data:`, `https://` and a tab-obfuscated scheme are
 * all rejected by the leading-slash rule before a scheme check could see them,
 * and `'/x'.split(/[/?#]/)[0]` is always the empty string. They were deleted
 * rather than kept as "belt and braces" — a guard that cannot fire is the
 * dead-code-that-looks-like-safety pattern this codebase keeps finding, and it
 * invites the next reader to trust a check that does nothing.
 *
 * The tests still assert every one of those inputs is refused, because what
 * matters is the outcome, not which line produces it.
 */
export function safeInternalPath(value, fallback = FALLBACK) {
  if (typeof value !== 'string') return fallback

  const raw = value.trim()
  if (!raw) return fallback

  // 1. Root-relative only. This is what rejects every absolute URL and every
  //    scheme, because none of them start with '/'. A leading '//' is
  //    protocol-relative — `//evil.test` is an off-site URL with the scheme
  //    left implied — so it is not internal either.
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback

  // 2. No backslashes. Browsers normalise '\' to '/', so '/\evil.test' becomes
  //    '//evil.test' and slips past rule 1 as written.
  if (raw.includes('\\')) return fallback

  return raw
}

export default safeInternalPath
