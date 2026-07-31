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

/**
 * Collisions that EXIST TODAY and are recorded as debt, not blessed.
 *
 * This is a ratchet, asserted exactly: a new collision fails the suite, and
 * removing one of these fails it too until the entry is deleted here. That is
 * deliberate — an allowlist silently absorbs progress, and this list is meant
 * to shrink.
 *
 * All nine come from three project services that overlap heavily
 * (`projectService`, `projectWorkflowService`, `projectApprovalService`), and
 * `ProjectForm.vue` imports all three. The sharp end is its submit handler,
 * which cascades `projectWorkflowService.submitProject` ->
 * `projectService.createProject` -> `projectApprovalService.submitProject`,
 * taking whichever does not throw. Three write paths into one table, chosen by
 * failure — so which one ran is not knowable from the code, and a fix to one is
 * invisible to the other two. Untangling that needs a decision about which
 * service owns project writes; see DEFERRED_BACKLOG #33.
 */
const KNOWN_COLLISIONS = [
  'approveProject exported by projectApprovalService.js and projectWorkflowService.js',
  'calculateBasePrice exported by projectApprovalService.js and projectWorkflowService.js',
  'calculateCreditsAmount exported by projectApprovalService.js and projectWorkflowService.js',
  'getAllProjects exported by projectApprovalService.js and projectService.js',
  'getPendingProjects exported by projectApprovalService.js and projectWorkflowService.js',
  'getProjectStats exported by projectService.js and projectWorkflowService.js',
  'getUserProjects exported by projectService.js and projectWorkflowService.js',
  'submitProject exported by projectApprovalService.js and projectWorkflowService.js',
  'updateProjectStatus exported by projectApprovalService.js and projectService.js',
]

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

/**
 * Class methods on an exported service singleton, e.g. `creditOwnershipService`.
 *
 * The first version of this file matched only `export function`, so it would
 * have passed clean over #11's own collision — `getUserTransactionHistory` is a
 * bare export in `transactionHistoryService` and a CLASS METHOD in
 * `creditOwnershipService`. A guard written against one of the two syntaxes
 * catches half the class, which is the same partial-coverage mistake it exists
 * to prevent. Matched at two-space indentation to stay inside the class body
 * and off nested object literals.
 */
function serviceMethodNames(source) {
  const names = new Set()
  const re = /^ {2}(?:async\s+)?([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{/gm
  let match
  while ((match = re.exec(source)) !== null) {
    if (match[1] !== 'constructor' && match[1] !== 'if' && match[1] !== 'for') {
      names.add(match[1])
    }
  }
  return names
}

/** Every callable this service module offers under a name, by either syntax. */
function publicNames(source) {
  return new Set([...exportedFunctionNames(source), ...serviceMethodNames(source)])
}

describe('no two services export the same read under one name', () => {
  it('every duplicated export name is on the allowlist, with a reason', () => {
    const byName = new Map()

    for (const file of serviceFiles()) {
      const source = readFileSync(join(SERVICES_DIR, file), 'utf8')
      for (const name of publicNames(source)) {
        if (!byName.has(name)) byName.set(name, [])
        byName.get(name).push(file)
      }
    }

    const collisions = [...byName.entries()]
      .filter(([name, files]) => files.length > 1 && !ALLOWED_DUPLICATES.has(name))
      .map(([name, files]) => `${name} exported by ${files.join(' and ')}`)
      .sort()

    // A collision is not automatically a bug — but it is always a place where a
    // fix can land on one copy and be believed to cover both. Asserted against
    // the recorded baseline so the count can only go down.
    expect(collisions).toEqual(KNOWN_COLLISIONS)
  })

  it('the two credit-history reads no longer share a name (#11 dual-source)', () => {
    const ownership = readFileSync(resolve(SERVICES_DIR, 'creditOwnershipService.js'), 'utf8')
    const history = readFileSync(resolve(SERVICES_DIR, 'transactionHistoryService.js'), 'utf8')

    // creditOwnershipService keeps the name; transactionHistoryService's copy —
    // a different shape, from different tables — is now
    // getPurchaseAndRetirementHistory.
    expect(publicNames(ownership).has('getUserTransactionHistory')).toBe(true)
    expect(publicNames(history).has('getUserTransactionHistory')).toBe(false)
    expect(publicNames(history).has('getPurchaseAndRetirementHistory')).toBe(true)
  })

  it('the ESG history reads credit_transactions, not the table nothing writes', () => {
    const source = readFileSync(resolve(SERVICES_DIR, 'creditOwnershipService.js'), 'utf8')

    // `credit_purchases` is written by no migration, edge function or client
    // path in this repo. Reading it made the ESG report print
    // "Credits purchased (lifetime): 0" for every buyer.
    expect(source).not.toMatch(/\.from\(\s*'credit_purchases'\s*\)/)
    expect(source).toMatch(/\.from\(\s*'credit_transactions'\s*\)/)
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
