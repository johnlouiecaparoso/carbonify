import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

/**
 * Every `export const x = service.x.bind(service)` must name a method that
 * actually exists on that class.
 *
 * ── WHY THIS EXISTS ──
 * On 2026-08-02, removing two genuinely-dead methods from `projectService`
 * (`getAllProjects`, `updateProjectStatus`) took down **the verifier's ability
 * to sign in**. Not the callers of those methods — sign-in.
 *
 * The reason is worth internalising: the bottom of the file re-exports each
 * method as a bound standalone function. `undefined.bind` throws at **module
 * evaluation**, so the entire chunk fails to load, and every route importing
 * anything from it dies with it. A dead-code deletion became a total outage of
 * an unrelated surface.
 *
 * Nothing caught it. The build passed — the syntax was fine. Lint passed —
 * nothing was unused. The unit suite passed — 957 green. Only a Playwright test
 * driving a real login went red, and only because it had been written the day
 * before. The failure was a runtime `TypeError` at line 737 of a file whose
 * methods were all still syntactically valid.
 *
 * So: a static check, because this class of break is invisible to every other
 * layer and costs an outage.
 */

const SERVICES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../services')

function serviceFiles() {
  return readdirSync(SERVICES_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => e.name)
}

/** Class-method names declared at two-space indent inside a class body. */
function methodNames(source) {
  const names = new Set()
  const re = /^ {2}(?:async\s+)?([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/gm
  let m
  while ((m = re.exec(source)) !== null) names.add(m[1])
  return names
}

/** `export const foo = someService.bar.bind(someService)` -> {alias, method}. */
function boundExports(source) {
  const out = []
  const re = /^export\s+const\s+([A-Za-z0-9_$]+)\s*=\s*([A-Za-z0-9_$]+)\.([A-Za-z0-9_$]+)\.bind\(/gm
  let m
  while ((m = re.exec(source)) !== null) {
    out.push({ alias: m[1], instance: m[2], method: m[3] })
  }
  return out
}

describe('bound convenience exports resolve to real methods', () => {
  it('no `.bind()` re-export points at a method that no longer exists', () => {
    const broken = []

    for (const file of serviceFiles()) {
      const source = readFileSync(join(SERVICES_DIR, file), 'utf8')
      const methods = methodNames(source)
      const bindings = boundExports(source)
      if (!bindings.length) continue

      for (const b of bindings) {
        if (!methods.has(b.method)) {
          broken.push(`${file}: export const ${b.alias} = ${b.instance}.${b.method}.bind(...) — no such method`)
        }
      }
    }

    // `undefined.bind` throws at MODULE LOAD, so this is never a localised
    // failure: the whole chunk fails to evaluate and takes every importer with
    // it. Build, lint and the unit suite all pass while it is broken.
    expect(broken).toEqual([])
  })

  it('finds bindings at all, so the check cannot pass vacuously', () => {
    const total = serviceFiles().reduce(
      (n, f) => n + boundExports(readFileSync(join(SERVICES_DIR, f), 'utf8')).length,
      0,
    )

    // If the codebase ever stops using this pattern the test above becomes
    // trivially green — which would be an empty check reporting PASS, the exact
    // failure `escrow_verification.sql` row 3 taught this project to design out.
    expect(total).toBeGreaterThan(0)
  })
})
