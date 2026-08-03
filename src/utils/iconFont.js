/**
 * Decides when it is safe to show Material Symbols glyphs — see the header of
 * styles/icons.css for why "safe" is a question at all. Short version: the icon
 * font renders by ligature, so an unavailable font does not blank the icons, it
 * prints their names ("notifications", "shopping_cart") across the UI.
 *
 * Everything here is one class on <html>:
 *   present  → the font is loaded and glyphs render
 *   absent   → the ligature text is hidden, and we are still trying
 *
 * THE REPORTED CASE this is written for: open the site on a phone, leave it
 * (back out, switch apps), come back later. The tab has been frozen or
 * discarded and is restored — sometimes from the back/forward cache, sometimes
 * re-executed from scratch on whatever network state the phone woke up with. If
 * the font request loses that race the page comes back with words where the
 * icons were, and nothing ever retries. So this listens for the moments a page
 * comes BACK — pageshow, visibilitychange, online — and re-checks each time.
 */

const FONT_FAMILY = '"Material Symbols Outlined"'
// Any size resolves the same face; 24px is the family's natural size.
const PROBE_FONT = `24px ${FONT_FAMILY}`
// A real ligature name, and a long one — the width difference it produces
// between "rendered as a glyph" and "rendered as a word" is the whole test.
const PROBE_TEXT = 'settings'
const READY_CLASS = 'icons-ready'

let watching = false

function markReady() {
  document.documentElement.classList.add(READY_CLASS)
}

function isReady() {
  return document.documentElement.classList.contains(READY_CLASS)
}

/**
 * Does the ligature actually render as a glyph?
 *
 * MEASUREMENT, not `document.fonts.check()`, and the difference matters. Per
 * the CSS Font Loading spec, check() first collects the font faces matching the
 * family — and **if that set is empty it returns true**. An empty set is
 * precisely the worst case here: the Google stylesheet never loaded, so no
 * @font-face for "Material Symbols Outlined" exists, so check() reports the
 * font "available" while every icon on the page renders as its own name. The
 * one state this file exists to catch is the one check() is blind to.
 *
 * So render the probe instead. Eight characters of "settings" in a fallback
 * font are wide; the same eight characters shaped by Material Symbols collapse
 * into ONE glyph roughly one character wide. Nothing else produces that.
 */
function ligatureRenders() {
  const probe = document.createElement('span')
  probe.textContent = PROBE_TEXT
  // Off-screen and hidden, but still laid out — offsetWidth needs layout, which
  // `visibility: hidden` preserves and `display: none` would not.
  probe.style.cssText =
    'position:absolute;left:-9999px;top:-9999px;visibility:hidden;' +
    'white-space:nowrap;font-size:48px;line-height:1;letter-spacing:normal;' +
    "font-feature-settings:'liga';-webkit-font-feature-settings:'liga';"

  probe.style.fontFamily = 'monospace'
  document.body.appendChild(probe)
  const fallbackWidth = probe.offsetWidth

  probe.style.fontFamily = `${FONT_FAMILY}, monospace`
  const iconWidth = probe.offsetWidth
  probe.remove()

  if (!fallbackWidth || !iconWidth) return false
  // One glyph vs eight characters. Half is a wide margin around a ~1:8 ratio.
  return iconWidth < fallbackWidth * 0.5
}

/** Has the icon font arrived? Asks for it if nothing has yet, then measures. */
async function fontHasArrived() {
  if (!document.body) return false
  if (ligatureRenders()) return true
  try {
    // Requesting it is what starts the fetch on a page that has not painted an
    // icon yet; the measurement afterwards is still the authority.
    await document.fonts.load(PROBE_FONT, PROBE_TEXT)
  } catch {
    /* family undeclared — the measurement below will say so */
  }
  return ligatureRenders()
}

async function recheck() {
  if (isReady()) return
  if (await fontHasArrived()) markReady()
}

/**
 * Resolve the icon font's availability and keep watching for it.
 *
 * Safe to call more than once; the listeners are installed only on the first
 * call. Never throws — an icon is not worth breaking a page load over.
 */
export function initIconFont() {
  // No CSS Font Loading API (very old browser): we cannot tell loaded from
  // missing, and a permanently blank UI is far worse than the risk this guards
  // against. Show the icons and let the browser do whatever it does.
  if (typeof document === 'undefined' || !document.fonts) {
    markReady()
    return
  }

  recheck()

  // `document.fonts.ready` settles once the document's initial font loads have
  // finished — the normal, happy path, and usually the first thing to fire.
  document.fonts.ready.then(recheck).catch(() => {})

  if (watching) return
  watching = true

  // The back/forward cache restores a page without re-running any of the above;
  // `persisted` marks exactly that restore.
  window.addEventListener('pageshow', () => recheck())
  // Returning to a backgrounded tab, which is the reported sequence.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') recheck()
  })
  // Came back on a connection that can finally fetch the font.
  window.addEventListener('online', () => recheck())

  // `document.fonts.ready` resolves once per document, so a font that arrives
  // later — a retried request, a service-worker cache hit on a second attempt —
  // needs its own poll. Six chances over ~15s, then we stop; by then the
  // event listeners above are the only thing worth waiting on.
  let attempts = 0
  const timer = setInterval(() => {
    attempts += 1
    if (isReady() || attempts >= 6) {
      clearInterval(timer)
      return
    }
    recheck()
  }, 2500)
}
