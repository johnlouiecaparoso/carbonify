import { describe, it, expect } from 'vitest'
import { keyState, validateTenantInput, API_SCOPES } from '@/services/apiKeyService'

/**
 * White-label key state and tenant validation.
 *
 * `keyState` drives whether the Revoke button appears, so a wrong answer either
 * hides the control that stops a leaked credential, or offers to revoke a key
 * that is already dead.
 */

describe('keyState', () => {
  const now = new Date('2026-08-06T00:00:00Z')

  it('reports a live key as active', () => {
    expect(keyState({ revoked_at: null, expires_at: null }, now)).toBe('active')
  })

  it('reports a future expiry as active', () => {
    expect(keyState({ expires_at: '2026-12-01T00:00:00Z' }, now)).toBe('active')
  })

  it('reports a past expiry as expired', () => {
    expect(keyState({ expires_at: '2026-07-01T00:00:00Z' }, now)).toBe('expired')
  })

  it('reports a revoked key as revoked', () => {
    expect(keyState({ revoked_at: '2026-08-01T00:00:00Z' }, now)).toBe('revoked')
  })

  it('prefers revoked over expired when both are true', () => {
    // A key that was withdrawn and has since also passed its expiry was
    // withdrawn. Calling that "expired" describes a deliberate act as the clock
    // running out.
    const key = { revoked_at: '2026-07-15T00:00:00Z', expires_at: '2026-07-20T00:00:00Z' }
    expect(keyState(key, now)).toBe('revoked')
  })

  it('treats an unparseable expiry as active rather than silently dead', () => {
    expect(keyState({ expires_at: 'whenever' }, now)).toBe('active')
  })

  it('treats a missing key as revoked', () => {
    expect(keyState(null, now)).toBe('revoked')
  })
})

describe('validateTenantInput', () => {
  it('accepts a well-formed tenant', () => {
    expect(validateTenantInput({ slug: 'acme-energy', name: 'Acme Energy' })).toEqual([])
  })

  it('requires both a slug and a name', () => {
    expect(validateTenantInput({}).length).toBe(2)
    expect(validateTenantInput({ slug: 'acme-energy' })).toHaveLength(1)
    expect(validateTenantInput({ name: 'Acme' })).toHaveLength(1)
  })

  it('mirrors the database slug constraint', () => {
    // Same rule as the CHECK in 20260806000400. Duplicated here only to produce
    // a readable message; the database is still what enforces it.
    const rejected = ['-acme', 'acme-', 'AcmeEnergy', 'ac', 'acme energy', 'acme_energy']
    for (const slug of rejected) {
      expect(validateTenantInput({ slug, name: 'Acme' }).length).toBeGreaterThan(0)
    }

    const accepted = ['acme-energy', 'a1b', 'partner-2026', 'abc']
    for (const slug of accepted) {
      expect(validateTenantInput({ slug, name: 'Acme' })).toEqual([])
    }
  })

  it('rejects whitespace-only values', () => {
    expect(validateTenantInput({ slug: '   ', name: '   ' }).length).toBe(2)
  })
})

describe('API_SCOPES', () => {
  it('offers only scopes the database will accept', () => {
    // create_api_key raises on an unknown scope, so a checkbox the database
    // refuses would surface as a raw Postgres error at the moment of issue.
    const allowed = ['registry:read', 'mrv:read', 'certificates:read']
    expect(API_SCOPES.map((s) => s.value).sort()).toEqual([...allowed].sort())
  })

  it('is read-only — no scope grants a write', () => {
    for (const scope of API_SCOPES) {
      expect(scope.value.endsWith(':read')).toBe(true)
    }
  })
})
