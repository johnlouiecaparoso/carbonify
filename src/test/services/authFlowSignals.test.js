import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/auditService', () => ({
  logUserAction: vi.fn().mockResolvedValue(undefined),
  logSystemEvent: vi.fn(),
}))
vi.mock('@/services/emailService', () => ({ sendWelcomeEmail: vi.fn() }))
vi.mock('@/services/notificationService', () => ({ notifyWelcomeUser: vi.fn() }))
vi.mock('@/services/profileService', () => ({
  createProfile: vi.fn().mockResolvedValue({ id: 'u1', full_name: 'Ada' }),
  getProfile: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/services/supabaseClient', () => ({ getSupabase: vi.fn() }))
vi.mock('@/services/roleApplicationService', () => ({
  getBlockingRoleApplicationForUser: vi.fn(),
  getRoleApplicationStatusLabel: (s) => (s === 'pending' ? 'Pending' : 'Rejected'),
}))

import { loginWithEmail, registerWithEmail } from '@/services/authService'
import { getSupabase } from '@/services/supabaseClient'
import { getBlockingRoleApplicationForUser } from '@/services/roleApplicationService'

/**
 * Covers the signals the auth layer reports back to the UI. Each was silently
 * wrong before:
 *
 *  - An unapproved specialist was blocked by throwing an Error and re-matching
 *    its own message with `.includes('cannot sign in until it is approved')`.
 *    Rewording the sentence would have let them straight in.
 *  - Registration returned Supabase's raw payload and the form redirected to
 *    "Account created. Sign in to continue." without looking at it — so an
 *    already-registered address and a pending email confirmation both reported
 *    plain success.
 */
describe('login: unapproved specialist accounts', () => {
  let supabase

  beforeEach(() => {
    vi.clearAllMocks()
    supabase = {
      auth: {
        signInWithPassword: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: 'u1' }, session: {} }, error: null }),
        signOut: vi.fn().mockResolvedValue({}),
      },
    }
    getSupabase.mockReturnValue(supabase)
  })

  it('blocks sign-in and signs the session back out', async () => {
    getBlockingRoleApplicationForUser.mockResolvedValue({
      role_requested: 'verifier',
      status: 'pending',
    })

    await expect(loginWithEmail({ email: 'v@x.io', password: 'pw' })).rejects.toMatchObject({
      code: 'ROLE_APPLICATION_PENDING',
    })
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('identifies the block by code, not by the wording of the message', async () => {
    // The UI branches on err.code. This test exists so that rewording the
    // message never silently changes who can sign in.
    getBlockingRoleApplicationForUser.mockResolvedValue({
      role_requested: 'project_developer',
      status: 'pending',
    })

    const err = await loginWithEmail({ email: 'd@x.io', password: 'pw' }).then(
      () => {
        throw new Error('login should have been blocked')
      },
      (caught) => caught,
    )

    expect(err.code).toBe('ROLE_APPLICATION_PENDING')
    expect(err.message).toMatch(/Project Developer/)
  })

  it('lets an approved account through', async () => {
    getBlockingRoleApplicationForUser.mockResolvedValue(null)

    const result = await loginWithEmail({ email: 'ok@x.io', password: 'pw' })
    expect(result.user.id).toBe('u1')
    expect(supabase.auth.signOut).not.toHaveBeenCalled()
  })

  it('fails open when the approval lookup itself errors', async () => {
    // Deliberate: a missing table or a network blip must not lock every user
    // out of the platform. RLS remains the real boundary.
    getBlockingRoleApplicationForUser.mockRejectedValue(new Error('relation does not exist'))

    const result = await loginWithEmail({ email: 'ok@x.io', password: 'pw' })
    expect(result.user.id).toBe('u1')
  })
})

describe('registration signals', () => {
  let supabase

  beforeEach(() => {
    vi.clearAllMocks()
    supabase = {
      auth: {
        signUp: vi.fn(),
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', email: 'a@x.io' } } }),
      },
    }
    getSupabase.mockReturnValue(supabase)
  })

  it('flags an address that already has an account', async () => {
    // Supabase does not error here — it returns a decoy user with no identities
    // so that signup cannot be used to enumerate accounts.
    supabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'decoy', identities: [] }, session: null },
      error: null,
    })

    const result = await registerWithEmail({ name: 'Ada', email: 'taken@x.io', password: 'pw' })
    expect(result.alreadyRegistered).toBe(true)
    expect(result.needsEmailConfirmation).toBe(false)
  })

  it('flags a signup that is waiting on an email confirmation', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'u1', identities: [{ id: 'i1' }] }, session: null },
      error: null,
    })

    const result = await registerWithEmail({ name: 'Ada', email: 'new@x.io', password: 'pw' })
    expect(result.needsEmailConfirmation).toBe(true)
    expect(result.alreadyRegistered).toBe(false)
  })

  it('reports a plain success when a session comes back immediately', async () => {
    supabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'u1', identities: [{ id: 'i1' }] }, session: { access_token: 't' } },
      error: null,
    })

    const result = await registerWithEmail({ name: 'Ada', email: 'new@x.io', password: 'pw' })
    expect(result.needsEmailConfirmation).toBe(false)
    expect(result.alreadyRegistered).toBe(false)
  })

  it('does not try to create a profile for a decoy user', async () => {
    const { createProfile } = await import('@/services/profileService')
    supabase.auth.signUp.mockResolvedValue({
      data: { user: { id: 'decoy', identities: [] }, session: null },
      error: null,
    })

    await registerWithEmail({ name: 'Ada', email: 'taken@x.io', password: 'pw' })
    expect(createProfile).not.toHaveBeenCalled()
  })
})
