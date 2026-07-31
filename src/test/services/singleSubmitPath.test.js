import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * DEFERRED_BACKLOG #33 — project submission had THREE write paths, tried in
 * sequence until one did not throw:
 *
 *   projectWorkflowService.submitProject
 *     -> catch -> projectService.createProject
 *          -> catch -> projectApprovalService.submitProject
 *
 * The evidence that settled it (2026-08-01):
 *
 *   · Path 2 was a near-verbatim copy of path 1 and validated identically, so
 *     when path 1 rejected an input path 2 rejected it the same way. It could
 *     only ever mask a transient blip.
 *   · Path 3 had NO numeric validation, so `estimated_credits: -5` — refused by
 *     both paths above — was accepted on the third attempt. The cascade defeated
 *     the validation, just at the third hop rather than the second.
 *   · Path 3 spread the raw form object into the insert instead of picking
 *     known columns, and hardcoded `status: 'pending'`. A DRAFT reaching it was
 *     silently promoted into the review queue, firing
 *     notify_project_submitted_trigger — a private draft became a submission,
 *     and reviewers were notified, because two other code paths had failed.
 *
 * A fallback that is more permissive than the thing it backs up is not
 * redundancy. It is the validation being optional.
 *
 * This asserts the WIRING, like `duplicateServiceReads.test.js`: the defect was
 * never inside any one service, it was in how the form chained them.
 */

const FORM = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../components/ProjectForm.vue'),
  'utf8',
)

/** Strip block and line comments so the historical note above does not match. */
function code(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const CODE = code(FORM)

describe('project submission has exactly one write path', () => {
  it('submits through projectWorkflowService', () => {
    expect(CODE).toMatch(/projectWorkflowService\.submitProject\(/)
  })

  it('does not fall back to projectService.createProject', () => {
    expect(CODE).not.toMatch(/projectService\.createProject\(/)
  })

  it('does not fall back to projectApprovalService.submitProject', () => {
    expect(CODE).not.toMatch(/projectApprovalService\.submitProject\(/)
    // And the import is gone, so it cannot quietly come back one line at a time.
    expect(CODE).not.toMatch(/from '@\/services\/projectApprovalService'/)
  })

  it('the surviving path still validates non-positive numbers', () => {
    const workflow = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../services/projectWorkflowService.js'),
      'utf8',
    )

    // This is the check path 3 lacked entirely. If it ever goes, the reason the
    // cascade was dangerous applies to the single path too.
    expect(workflow).toMatch(/estimatedCredits\s*<=\s*0/)
    expect(workflow).toMatch(/creditPrice\s*<=\s*0/)
  })

  it('the surviving path preserves draft status rather than forcing pending', () => {
    const workflow = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../../services/projectWorkflowService.js'),
      'utf8',
    )

    // Path 3 hardcoded 'pending'. A draft is the developer's private workspace
    // and must not enter the review queue or fire the notify trigger.
    expect(workflow).toMatch(/status:\s*projectData\.status === 'draft' \? 'draft' : 'pending'/)
  })
})
