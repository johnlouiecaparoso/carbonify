import { describe, it, expect } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join, relative } from 'node:path'

/**
 * Every service, util and store module must EVALUATE, not merely parse.
 *
 * ── THE NEAR-MISS THIS GENERALISES ──
 * On 2026-08-02 two genuinely-dead methods were deleted from `projectService`,
 * and it took down the verifier's sign-in. The file re-exports each method as
 * `export const x = projectService.x.bind(projectService)`, and `undefined.bind`
 * throws at **module evaluation** — so the whole chunk failed to load and every
 * route importing anything from it died with it.
 *
 * What makes it worth a dedicated test is what did NOT catch it:
 *
 *   · `npm run build` passed — the syntax was valid.
 *   · `npm run lint:check` passed — nothing was unused.
 *   · the unit suite passed — 957 green, because no test imported that module.
 *
 * Only a Playwright spec driving a real login went red, and only because it had
 * been written the day before. Without it the break would have reached
 * production, where the symptom is a blank page rather than an error anyone can
 * read.
 *
 * `boundExportsResolve.test.js` catches that ONE syntax. This catches the actual
 * failure — a module that throws on import, for any reason at all: a stale
 * `.bind`, a top-level call on an undefined import, a circular import resolving
 * to undefined, a constant read from a module that no longer exports it.
 *
 * The cost is one import per module. The alternative is finding out in a browser.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(HERE, '../..')

/** Directories whose modules should be importable with no side effects. */
const ROOTS = ['services', 'utils', 'store', 'composables', 'constants']

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else if (entry.endsWith('.js')) acc.push(full)
  }
  return acc
}

const MODULES = ROOTS.flatMap((root) => {
  const dir = resolve(SRC, root)
  try {
    return walk(dir)
  } catch {
    return []
  }
}).map((f) => relative(SRC, f).split('\\').join('/'))

describe('every module evaluates on import', () => {
  it('found modules to check, so this cannot pass vacuously', () => {
    // A glob that silently matches nothing is a green test that proves nothing —
    // the escrow_verification.sql row-3 failure, in a test file.
    expect(MODULES.length).toBeGreaterThan(40)
  })

  it.each(MODULES)('%s imports without throwing', async (relPath) => {
    // `/* @vite-ignore */` is not needed under Vitest; the dynamic specifier is
    // resolved by the same alias config the app uses.
    await expect(import(/* @vite-ignore */ `../../${relPath}`)).resolves.toBeDefined()
  })
})
