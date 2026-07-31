import { describe, it, expect } from 'vitest'

/**
 * Segregation of duties is enforced in the database (20260722000900), so these
 * assert the RULE, not a JS implementation of it — they encode the decision
 * table the migration implements so that changing it silently breaks a test.
 *
 * The line drawn: an admin may not grant THEMSELVES privilege or money.
 * Everything else they do to their own row is untouched.
 */

/** Mirrors the guard in admin_set_user_profile. */
function selfProfileEditAllowed({ isSelf, currentKyc, newKyc, currentRole, newRole }) {
  if (!isSelf) return true
  // Only an actual CHANGE is refused: the admin UI submits the whole form every
  // time, so an unchanged value arriving alongside a name edit must pass.
  if (newKyc != null && newKyc !== currentKyc) return false
  if (newRole && newRole.toLowerCase() !== String(currentRole || '').toLowerCase()) return false
  return true
}

/** Mirrors the guard in admin_set_kyb_verified. */
const kybChangeAllowed = ({ isSelf, verified }) => !(isSelf && verified)

/** Mirrors the guard in admin_refund_transaction. */
const refundAllowed = ({ adminId, buyerId, sellerId }) =>
  adminId !== buyerId && adminId !== sellerId

describe('admin self-dealing: profile edits', () => {
  const base = { isSelf: true, currentKyc: 1, currentRole: 'admin' }

  it('refuses raising your own KYC level', () => {
    // The exploit this closes: set your own kyc_level to 3, skipping review and
    // unlocking the highest velocity tier.
    expect(selfProfileEditAllowed({ ...base, newKyc: 3 })).toBe(false)
  })

  it('refuses lowering your own KYC level too', () => {
    expect(selfProfileEditAllowed({ ...base, newKyc: 0 })).toBe(false)
  })

  it('allows an unchanged KYC level to ride along with a name edit', () => {
    // The admin UI always submits the whole form; rejecting this would block a
    // harmless self edit and read as a bug.
    expect(selfProfileEditAllowed({ ...base, newKyc: 1 })).toBe(true)
  })

  it('refuses changing your own role', () => {
    expect(selfProfileEditAllowed({ ...base, newRole: 'verifier' })).toBe(false)
  })

  it('allows your own unchanged role to ride along, case-insensitively', () => {
    expect(selfProfileEditAllowed({ ...base, newRole: 'admin' })).toBe(true)
    expect(selfProfileEditAllowed({ ...base, newRole: 'ADMIN' })).toBe(true)
  })

  it('leaves edits to OTHER users entirely alone', () => {
    expect(
      selfProfileEditAllowed({ isSelf: false, currentKyc: 0, newKyc: 3, currentRole: 'general_user', newRole: 'admin' }),
    ).toBe(true)
  })
})

describe('admin self-dealing: KYB', () => {
  it('refuses self-verification — KYB gates seller payouts', () => {
    expect(kybChangeAllowed({ isSelf: true, verified: true })).toBe(false)
  })

  it('allows REMOVING your own KYB, which is self-restricting', () => {
    expect(kybChangeAllowed({ isSelf: true, verified: false })).toBe(true)
  })

  it('allows verifying another user', () => {
    expect(kybChangeAllowed({ isSelf: false, verified: true })).toBe(true)
  })
})

describe('admin self-dealing: refunds', () => {
  it('refuses refunding a transaction you bought', () => {
    expect(refundAllowed({ adminId: 'a1', buyerId: 'a1', sellerId: 's1' })).toBe(false)
  })

  it('refuses refunding a transaction you sold', () => {
    expect(refundAllowed({ adminId: 'a1', buyerId: 'b1', sellerId: 'a1' })).toBe(false)
  })

  it('allows refunding an unrelated transaction', () => {
    expect(refundAllowed({ adminId: 'a1', buyerId: 'b1', sellerId: 's1' })).toBe(true)
  })
})

describe('role validation', () => {
  const KNOWN = [
    'general_user', 'buyer_investor', 'project_developer',
    'farmer', 'lgu_user', 'verifier', 'admin',
  ]
  const isKnownRole = (r) => KNOWN.includes(String(r || '').trim().toLowerCase())

  it('accepts every role the app actually uses', () => {
    for (const role of KNOWN) expect(isKnownRole(role)).toBe(true)
  })

  it('rejects an unknown role rather than storing it', () => {
    // An unrecognised role silently breaks every role check in the app, and the
    // column has no CHECK constraint behind it.
    expect(isKnownRole('superuser')).toBe(false)
    expect(isKnownRole('')).toBe(false)
    expect(isKnownRole(null)).toBe(false)
  })
})
