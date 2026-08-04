import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * axe-core, read straight out of `node_modules` and injected into the page.
 *
 * Deliberately NOT `@axe-core/playwright`: axe-core is already a dependency
 * here, and the wrapper would be one more package to keep in step for the sake
 * of the twelve lines below. Injecting the source is also what makes the
 * version explicit — `axeVersion()` is asserted in the spec, so an upgrade that
 * changes which rules exist shows up as a test change rather than as a silent
 * shift in what "passes".
 */
const AXE_SOURCE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')

export function axeVersion() {
  return require('axe-core/package.json').version
}

/**
 * Run axe against the current page and return its violations.
 *
 * Scoped to WCAG 2.1 A and AA, which is the bar the Terms and the accessibility
 * statement commit to. `best-practice` rules are excluded on purpose: they are
 * opinions (e.g. "heading-order"), and mixing them with conformance failures is
 * how an a11y report becomes something a team learns to ignore.
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ disableRules?: string[], include?: string }} [options]
 */
export async function analyze(page, options = {}) {
  await page.evaluate(AXE_SOURCE)

  return page.evaluate(async ({ disableRules, include }) => {
    const rules = {}
    for (const id of disableRules || []) rules[id] = { enabled: false }

    const result = await window.axe.run(include || document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      rules,
      resultTypes: ['violations'],
    })

    // Only what a human needs to fix it: the rule, why it matters, and the
    // actual elements. The raw axe node objects are enormous and unreadable in
    // a test failure.
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      helpUrl: v.helpUrl,
      nodes: v.nodes.slice(0, 5).map((n) => ({
        target: n.target.join(' '),
        summary: n.failureSummary,
      })),
      count: v.nodes.length,
    }))
  }, { disableRules: options.disableRules, include: options.include })
}

/** Compact, readable failure text — one line per offending element. */
export function formatViolations(violations) {
  return violations
    .map(
      (v) =>
        `\n  [${v.impact}] ${v.id} — ${v.help} (${v.count} element${v.count === 1 ? '' : 's'})\n` +
        v.nodes.map((n) => `      ${n.target}`).join('\n'),
    )
    .join('')
}
