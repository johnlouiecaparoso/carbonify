import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Density guard for the role-application form (/apply), the page a project
 * developer, verifier or farmer fills in to join the platform.
 *
 * It was enormous: `row-gap: 2.75rem` between every pair of fields, 140px
 * textareas, 2.5rem card padding, 1rem input padding and a 4rem hero — so a
 * form of a dozen fields ran to several screens of scrolling.
 *
 * THE TRAP THIS FILE ACTUALLY EXISTS FOR
 * The @media blocks held the PRE-SHRINK values. Left alone, `padding: 3rem` at
 * ≤768px beats the new `2rem` desktop rule, and the form ends up MORE spacious
 * on a phone than on a laptop. That is not hypothetical — the 2026-07-26
 * header-shrink pass did exactly this, shipped, and had to come back for it
 * when marketplace banners turned out to be bigger at 390px than at 1440px.
 *
 * So this asserts the invariant rather than the numbers: whatever the values
 * are, the mobile override must never exceed its desktop counterpart.
 */

const css = readFileSync(
  resolve(process.cwd(), 'src/views/RoleApplicationView.vue'),
  'utf8',
).split('<style scoped>')[1]

/**
 * First value of `prop` in rem, from any rule whose selector list includes
 * `selector`.
 *
 * Scans EVERY matching rule rather than the first: `.form__textarea` appears
 * twice — once grouped with `.form__input` for the shared box styling, and
 * once alone for `min-height`. Taking only the first match returned null for
 * min-height and made the assertion look like a broken test rather than a
 * missing declaration.
 */
function rem(selector, prop, scope = css) {
  const name = selector.replace(/^\./, '')
  const ruleRe = /([^{}]+)\{([^}]*)\}/g
  let m
  while ((m = ruleRe.exec(scope)) !== null) {
    const selectors = m[1].split(',').map((s) => s.trim())
    if (!selectors.includes(`.${name}`)) continue
    const decl = new RegExp(`(?:^|;|\\s)${prop}\\s*:\\s*([^;]+)`).exec(m[2])
    if (!decl) continue
    const first = decl[1].trim().split(/\s+/)[0]
    if (first.endsWith('rem')) return parseFloat(first)
    if (first.endsWith('px')) return parseFloat(first) / 16
  }
  return null
}

/**
 * Body of the ≤768px block, with the block's OWN opening brace removed.
 *
 * Without that slice the scope begins ` {`, so the rule scanner's first match
 * swallows the first nested rule whole and reports it as absent — which made
 * the mobile-vs-desktop check below return early and pass while the very
 * regression it guards was present. A green check that never had the
 * opportunity to be red, exactly as this project's own diagnostics learned.
 */
const mobileBlock = css.split('@media (max-width: 768px)')[1] ?? ''
const mobile = mobileBlock.slice(mobileBlock.indexOf('{') + 1).split('@media')[0]

describe('role application form density', () => {
  it('does not put 44px between every pair of fields', () => {
    // row-gap 2.75rem was the single largest contributor to the page height.
    expect(rem('.form__grid', 'row-gap')).toBeLessThanOrEqual(1)
  })

  it('keeps inputs compact but still tappable', () => {
    expect(rem('.form__input', 'padding')).toBeLessThanOrEqual(0.6)
  })

  it('does not open a 140px textarea for a one-line answer', () => {
    expect(rem('.form__textarea', 'min-height')).toBeLessThanOrEqual(5)
  })

  it('keeps the card padding tight', () => {
    expect(rem('.application-form', 'padding')).toBeLessThanOrEqual(1.5)
  })

  it('does not spend 4rem of vertical space on a hero above a form', () => {
    expect(rem('.role-application__hero', 'padding')).toBeLessThanOrEqual(2)
  })
})

describe('the mobile override must never be larger than desktop', () => {
  // The regression that already happened once, on a different page.
  const pairs = [
    ['.role-application__hero', 'padding'],
    ['.role-application__content', 'padding'],
    ['.application-form', 'padding'],
  ]

  for (const [selector, prop] of pairs) {
    it(`${selector} { ${prop} } is not bigger at ≤768px than on desktop`, () => {
      const desktop = rem(selector, prop)
      const small = rem(selector, prop, mobile)

      expect(desktop, `no desktop ${prop} found for ${selector}`).not.toBeNull()
      if (small === null) return // no override at all is fine

      expect(
        small,
        `${selector} is ${small}rem on mobile but ${desktop}rem on desktop — the @media block was left behind by a density pass`,
      ).toBeLessThanOrEqual(desktop)
    })
  }

  it('raises input text to 16px on mobile so iOS does not zoom on focus', () => {
    // Below 16px, focusing a field zooms the viewport and throws the user off
    // their place — worst on a long form, which this is.
    expect(mobile).toMatch(/font-size:\s*16px/)
  })
})
