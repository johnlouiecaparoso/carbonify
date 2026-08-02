/**
 * Browser file downloads — the single implementation.
 *
 * WHY THIS FILE EXISTS
 * Five services (ESG, admin export, LGU report, seller export, verification
 * report) each carried their own byte-identical `triggerDownload`, and three
 * more places (data-privacy export, certificate download, preferences export)
 * inlined the same seven lines. All eight ended with:
 *
 *     a.click()
 *     URL.revokeObjectURL(url)     // ← same tick
 *
 * `a.click()` only *schedules* the download; the browser reads the blob
 * afterwards, asynchronously. Revoking in the same tick can tear the object URL
 * down before that read happens, and the file then silently never arrives — no
 * error, no console warning, nothing for a user to report except "I clicked
 * export and nothing happened". It is timing-dependent, which is why it looks
 * intermittent and why it survived eight copies.
 *
 * Fixing one copy and leaving seven is how this codebase has been bitten
 * before, so there is now one copy to fix.
 *
 * The delay is generous rather than minimal: the only cost of holding an object
 * URL a little longer is a few bytes of memory until the page unloads, whereas
 * the cost of releasing it early is a download that does not happen.
 */

const REVOKE_DELAY_MS = 60_000

/**
 * Save a Blob to the user's downloads.
 *
 * @param {Blob} blob
 * @param {string} filename
 */
export function downloadBlob(blob, filename) {
  // Guard for the unit tests and any SSR-ish context: a service that builds a
  // report should be callable without a DOM.
  if (typeof document === 'undefined' || typeof URL?.createObjectURL !== 'function') return

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS)
}

/**
 * Save text as a file. Charset is explicit — Excel opens a CSV without a
 * declared charset in the system codepage and mangles any non-ASCII place name,
 * which in this app means most of them.
 *
 * @param {string} text
 * @param {string} filename
 * @param {string} [mime]
 */
export function downloadText(text, filename, mime = 'text/csv;charset=utf-8;') {
  downloadBlob(new Blob([text], { type: mime }), filename)
}
