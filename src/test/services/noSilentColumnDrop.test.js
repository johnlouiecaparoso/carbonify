import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * A failed project insert must FAIL. It must never be retried with fields
 * silently removed.
 *
 * ── WHAT WAS THERE ──
 * Both project write paths caught an insert error, checked whether its message
 * mentioned any of 16 optional columns, DELETED those fields from the payload,
 * and retried. The project was then created without them and nobody — not the
 * developer, not the verifier, not an admin — was told.
 *
 * Four of the 16 were `methodology`, `additionality_type`, `permanence_years`
 * and `reversal_risk`. Those are the fields that make a carbon credit
 * assessable at all. A project that looks complete and silently lacks them is
 * worse than a failed submit the developer can see and retry: the failure is
 * visible, the silent reshaping is not, and a verifier downstream has no way to
 * know the difference.
 *
 * It is the same family as every other defect this repo has found — a fallback
 * that converts an error into a plausible-looking result. `[]`-on-error said
 * "you own nothing"; this said "your project has no methodology".
 *
 * ── WHY IT COULD BE REMOVED ──
 * On evidence, not assumption. All 16 columns were probed against the live
 * schema on 2026-08-02 via PostgREST; every one returned `200`, against a
 * control column that returned `400 42703 column does not exist`. The retry
 * could never fire. DEFERRED_BACKLOG #15 said to delete these "once migrations
 * are authoritative" — this is that, measured rather than assumed.
 */

const SERVICES = resolve(dirname(fileURLToPath(import.meta.url)), '../../services')

const WRITE_PATHS = ['projectService.js', 'projectWorkflowService.js']

/** Fields whose silent absence makes a carbon project unassessable. */
const CREDIBILITY_FIELDS = [
  'methodology',
  'additionality_type',
  'permanence_years',
  'reversal_risk',
]

describe('project writes never drop columns silently', () => {
  it.each(WRITE_PATHS)('%s has no schema-drift retry', (file) => {
    const source = readFileSync(resolve(SERVICES, file), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

    // The retry was recognisable by these three: a list of droppable columns, a
    // `delete` from the payload, and a second insert.
    expect(code, `${file} still declares droppable columns`).not.toMatch(/driftCols/)
    expect(code, `${file} still retries the insert`).not.toMatch(/retryResult/)
  })

  it.each(WRITE_PATHS)('%s still SENDS the credibility fields', (file) => {
    const source = readFileSync(resolve(SERVICES, file), 'utf8')

    // The counter-assertion, and the reason this file is not just a "no retry"
    // check: removing the retry would be pointless if the fields themselves had
    // been dropped from the payload. Both halves have to hold.
    for (const field of CREDIBILITY_FIELDS) {
      expect(source, `${file} no longer sends ${field}`).toMatch(new RegExp(`\\b${field}\\b`))
    }
  })

  it.each(WRITE_PATHS)('%s throws on a failed insert', (file) => {
    const source = readFileSync(resolve(SERVICES, file), 'utf8')

    // A deployment problem must stop the write rather than quietly reshape it.
    expect(source).toMatch(/if \(error\) \{[\s\S]{0,120}throw new Error/)
  })
})
