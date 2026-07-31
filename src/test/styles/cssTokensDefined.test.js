import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, relative } from 'node:path'

/**
 * Guards against referencing a CSS custom property that is defined NOWHERE.
 *
 * Found 2026-07-29 from a screenshot: the project-submission form rendered
 * "Host_entity is required" in BLACK. `.field-error` was `color:
 * var(--carbonify-error)` — and the entire `--carbonify-*` family had never
 * been defined in any stylesheet. There were 99 references to it.
 *
 * The failure mode is the reason this needs a test rather than review. A
 * `var()` with no fallback and no definition makes the declaration
 * "invalid at computed-value time": the property falls back to `unset`, so
 * `color` (inherited) silently becomes the parent's black, and shorthand
 * `border: 1px solid var(--undefined)` drops the border entirely. Nothing
 * errors — not the build, not the console, not lint. The broken value had been
 * shipping in dist/ and the only symptom was a required-field warning that did
 * not look like a warning.
 *
 * A reference WITH a fallback — `var(--maybe-undefined, #e5e7eb)` — is fine and
 * deliberately not flagged: the fallback is what renders.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') walk(full, out)
    } else if (/\.(vue|css)$/.test(entry)) {
      out.push(full)
    }
  }
  return out
}

const FILES = walk(SRC).map((path) => ({ path, text: readFileSync(path, 'utf8') }))

/** Every `--name:` declaration anywhere in the app is a definition. */
const DEFINED = new Set()
for (const { text } of FILES) {
  for (const [, name] of text.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) DEFINED.add(name)
}

/** `var(--name)` with NO fallback — the only form that can resolve to nothing. */
const REFERENCED = []
for (const { path, text } of FILES) {
  for (const [, name] of text.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*\)/g)) {
    REFERENCED.push({ name, file: relative(SRC, path) })
  }
}

describe('CSS custom properties', () => {
  it('has definitions to scan (the walker actually found files)', () => {
    // Without this, an empty scan would report a vacuous pass — the same
    // false-PASS shape as escrow_verification row 3.
    expect(FILES.length).toBeGreaterThan(50)
    expect(DEFINED.size).toBeGreaterThan(20)
    expect(REFERENCED.length).toBeGreaterThan(20)
  })

  it('never references an undefined token without a fallback', () => {
    const undefinedRefs = REFERENCED.filter((r) => !DEFINED.has(r.name))

    // Group by token so the message names the token once with its sites.
    const byToken = new Map()
    for (const { name, file } of undefinedRefs) {
      if (!byToken.has(name)) byToken.set(name, new Set())
      byToken.get(name).add(file)
    }

    const report = [...byToken.entries()]
      .map(([name, files]) => `  ${name} — ${[...files].join(', ')}`)
      .join('\n')

    expect(
      report,
      `These var() references resolve to nothing and render as unset ` +
        `(inherited colour / dropped border), not as an error:\n${report}\n\n` +
        `Fix: point at a real token from src/styles/tokens.css, or add a fallback.`,
    ).toBe('')
  })
})
