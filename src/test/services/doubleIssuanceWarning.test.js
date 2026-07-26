import { describe, it, expect } from 'vitest'
import { alreadyIssuedOnValidation } from '@/services/monitoringService'

/**
 * Live runs both issuance triggers at once, which no single migration intended:
 *
 *   20260604010100  dropped trg_activate_validated_project, created
 *                   trg_mint_credits_on_ver_approval   (decoupled, mint-on-VER)
 *   20260626000500  re-created trg_activate_validated_project
 *   ...             nothing ever dropped trg_mint_credits_on_ver_approval
 *
 * So validating mints a pool and a listing, and approving a VER against that
 * same project mints again — the same tonne issued twice, which for a registry
 * is the cardinal error. Backlog #17 is still open on which model is canonical;
 * until it is settled the only safeguard was a reviewer remembering a line in a
 * document. This predicate puts the warning in front of them instead.
 *
 * It deliberately does NOT block: if mint-on-VER turns out to be the intended
 * model, blocking would strand every legitimate approval.
 */
describe('alreadyIssuedOnValidation', () => {
  it('flags a validated project, which has already minted a pool and a listing', () => {
    expect(alreadyIssuedOnValidation({ status: 'validated' })).toBe(true)
  })

  it('flags the approved alias, which the validation trigger also fires on', () => {
    // guard_project_self_validation treats 'validated' and 'approved' as the
    // same transition; this has to agree with it or the warning misses half the
    // cases the trigger acts on.
    expect(alreadyIssuedOnValidation({ status: 'approved' })).toBe(true)
  })

  it('is case-insensitive, since status casing has drifted on live before', () => {
    expect(alreadyIssuedOnValidation({ status: 'Validated' })).toBe(true)
    expect(alreadyIssuedOnValidation({ status: 'APPROVED' })).toBe(true)
  })

  it('does not flag a project that has not been validated', () => {
    for (const status of ['submitted', 'pending', 'in_review', 'under_review', 'needs_revision', 'rejected', 'draft']) {
      expect(alreadyIssuedOnValidation({ status }), `${status} wrongly flagged`).toBe(false)
    }
  })

  it('does not flag when the project or status is missing', () => {
    // A missing project must not produce a scary warning on every report; the
    // absence of evidence is not evidence of double issuance.
    expect(alreadyIssuedOnValidation(null)).toBe(false)
    expect(alreadyIssuedOnValidation(undefined)).toBe(false)
    expect(alreadyIssuedOnValidation({})).toBe(false)
    expect(alreadyIssuedOnValidation({ status: null })).toBe(false)
    expect(alreadyIssuedOnValidation({ status: '' })).toBe(false)
  })
})
