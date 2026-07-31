import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'

/**
 * Guards the bug class that produced the 2026-08-01 RetireView defect, and that
 * DEFERRED_BACKLOG #11 calls the "dual-source" half.
 *
 * WHAT HAPPENED
 * `getUserCreditPortfolio` existed twice — once in `creditOwnershipService` and
 * once in `marketplaceService` — reading the same `credit_ownership` rows. The
 * 2026-07-30 pass fixed the first to rethrow instead of returning `[]`, and its
 * own comment recorded that "every caller already handles a rejection:
 * CreditPortfolioView and RetireView catch and show an error banner".
 *
 * RetireView did not call it. It imported the OTHER copy, which still swallowed
 * the error and returned `[]` — so on the retirement screen a database outage
 * rendered as "you own no credits to retire", and the error banner sitting in
 * that view's catch block was dead code that could never run.
 *
 * WHY THIS TEST IS SHAPED THIS WAY
 * `creditOwnershipErrors.test.js` already asserts the surviving copy rejects.
 * That assertion was true the whole time and caught nothing, because the defect
 * was never in the function — it was in *which function the view imported*.
 * The same lesson as `routerGuardBypass.test.js`: an assertion about the parts
 * is not an assertion about the behaviour. So this asserts the WIRING.
 *
 * Two exported reads with one name is the precondition for the whole class:
 * it makes "is this the fixed one?" unanswerable at the import site.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const SERVICES_DIR = resolve(HERE, '../../services')
const SRC_DIR = resolve(HERE, '../..')

/**
 * Names deliberately duplicated across services. Each entry is a claim that the
 * copies are independent by design, not a fix that reached one and not the
 * other — add to this list only with that reasoning written down.
 */
const ALLOWED_DUPLICATES = new Set([
  // Two export surfaces (admin vs seller) that deliberately produce differently
  // scoped filenames. Neither reads the database; there is no error path to
  // diverge.
  'exportFilename',
])

function serviceFiles() {
  return readdirSync(SERVICES_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.js'))
    .map((e) => e.name)
}

/** Top-level `export function` / `export async function` names in one file. */
function exportedFunctionNames(source) {
  const names = new Set()
  const re = /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/gm
  let match
  while ((match = re.exec(source)) !== null) names.add(match[1])
  return names
}

describe('no two services export the same read under one name', () => {
  it('every duplicated export name is on the allowlist, with a reason', () => {
    const byName = new Map()

    for (const file of serviceFiles()) {
      const source = readFileSync(join(SERVICES_DIR, file), 'utf8')
      for (const name of exportedFunctionNames(source)) {
        if (!byName.has(name)) byName.set(name, [])
        byName.get(name).push(file)
      }
    }

    const collisions = [...byName.entries()]
      .filter(([name, files]) => files.length > 1 && !ALLOWED_DUPLICATES.has(name))
      .map(([name, files]) => `${name} exported by ${files.join(' and ')}`)

    // A collision is not automatically a bug — but it is always a place where a
    // fix can land on one copy and be believed to cover both.
    expect(collisions).toEqual([])
  })
})

describe('RetireView reads the portfolio from the service that rethrows', () => {
  const RETIRE_VIEW = readFileSync(resolve(SRC_DIR, 'views/RetireView.vue'), 'utf8')

  it('imports the portfolio read from creditOwnershipService', () => {
    expect(RETIRE_VIEW).toMatch(/from '@\/services\/creditOwnershipService'/)
    expect(RETIRE_VIEW).toMatch(/creditOwnershipService\.getUserCreditPortfolio\(/)
  })

  it('does not import a portfolio read from marketplaceService', () => {
    const marketplaceImport = RETIRE_VIEW.match(
      /import\s*\{([^}]*)\}\s*from\s*'@\/services\/marketplaceService'/,
    )
    expect(marketplaceImport, 'RetireView no longer imports marketplaceService').not.toBeNull()
    expect(marketplaceImport[1]).not.toMatch(/getUserCreditPortfolio/)
  })

  it('marketplaceService no longer exports a second portfolio read', () => {
    const source = readFileSync(resolve(SERVICES_DIR, 'marketplaceService.js'), 'utf8')
    expect(exportedFunctionNames(source).has('getUserCreditPortfolio')).toBe(false)
  })
})
