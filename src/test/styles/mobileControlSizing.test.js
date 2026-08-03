import { describe, it, expect } from 'vitest'
import { mobileCSS } from '@/utils/mobile'

/**
 * `mobileCSS.addMobileStyles()` injects a <style> block at runtime. That block
 * is invisible to every other tool in the repo — it is not a .css file, so it
 * never turns up in a search of the stylesheets, and its rules land LAST in the
 * cascade with no scope attribute, so they beat component styles.
 *
 * It used to carry this:
 *
 *     button, a, input, select, textarea {
 *       min-height: 44px; min-width: 44px;
 *     }
 *
 * A minimum SIZE is not a minimum hit area. min-width/min-height override the
 * width/height a component asks for, so on a phone — and only on a phone —
 * every control in that list rendered at 44px regardless of its own design:
 *
 *   · checkboxes at 44x44 instead of the 15px set in styles/form-controls.css,
 *     reported independently as "the checkbox is too large" on Preferences and
 *     on Saved. Both were "fixed" in form-controls.css, which was never the
 *     file overriding them.
 *   · the 28px Filters button inside SmartSearch's 38px bar, which it then
 *     overflowed top and bottom — the "filter in the search bar is not
 *     aligned" report, on both the marketplace and the registry.
 *
 * The tests below pin the shape of the block rather than its exact text: no
 * blanket minimum on interactive elements, and the iOS anti-zoom font-size
 * rule (which is legitimate) must not reach checkboxes and radios.
 */

/** Capture what addMobileStyles() appends, without keeping it in the document. */
function injectedCss() {
  const before = new Set(document.head.querySelectorAll('style'))
  mobileCSS.addMobileStyles()
  const added = [...document.head.querySelectorAll('style')].filter((el) => !before.has(el))
  const css = added.map((el) => el.textContent).join('\n')
  added.forEach((el) => el.remove())
  return css
}

/**
 * Declaration blocks whose selector list matches a predicate.
 *
 * Comments are stripped FIRST, not per-selector: the file documents the removed
 * rule by quoting it, braces and all, and a scanner that reads braces before
 * comments finds that quotation and reports the very thing it is describing.
 */
function blocksFor(css, matchSelector) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = re.exec(withoutComments))) {
    const selector = m[1].trim()
    if (!selector || selector.startsWith('@')) continue
    if (matchSelector(selector)) out.push({ selector, body: m[2] })
  }
  return out
}

describe('the runtime-injected mobile stylesheet', () => {
  const css = injectedCss()

  it('is still being produced (these assertions are worthless if it is empty)', () => {
    expect(css.length).toBeGreaterThan(0)
    expect(css).toContain('@media (max-width: 768px)')
  })

  it('sets no blanket min-height/min-width on interactive elements', () => {
    const offenders = blocksFor(css, (selector) =>
      /(^|,)\s*(button|input|select|textarea|a)\s*(,|$)/.test(selector),
    ).filter(({ body }) => /min-(height|width)\s*:/.test(body))

    expect(
      offenders.map((o) => `${o.selector} {${o.body.trim()}}`),
      'a minimum size resizes the control; put the 44px hit area on the label row instead (.tap-target)',
    ).toEqual([])
  })

  it('does not force a font-size onto checkboxes and radios', () => {
    // The 16px is iOS anti-zoom and belongs on TEXT fields. Applied with
    // !important to a bare `input` it also outranked every checkbox rule.
    const fontRules = blocksFor(css, (s) => /input/.test(s)).filter(({ body }) =>
      /font-size\s*:/.test(body),
    )

    for (const rule of fontRules) {
      expect(
        rule.selector,
        'exclude [type=checkbox] and [type=radio] from the iOS anti-zoom font-size',
      ).toMatch(/\[type=['"]?checkbox/)
      expect(rule.selector).toMatch(/\[type=['"]?radio/)
    }
  })
})
