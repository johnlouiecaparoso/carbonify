import { describe, it, expect } from 'vitest'
import { friendlyAuthError } from '@/services/authService'

/**
 * GoTrue writes its errors for the developer holding the dashboard, not for
 * the person staring at the form.
 *
 * The one that prompted this: **"Signups not allowed for this instance"**,
 * rendered verbatim on the registration page. It is a *server configuration*
 * state — the user did nothing wrong and can do nothing about it — but as raw
 * text it reads like a rejection of them, and it is indistinguishable from a
 * bad password to anyone who has not read the runbook.
 */

describe('friendlyAuthError', () => {
  it('explains that signups are off without blaming the user', () => {
    const out = friendlyAuthError('Signups not allowed for this instance')

    expect(out).not.toBe('Signups not allowed for this instance')
    expect(out.toLowerCase()).toContain('server setting')
    // The user must be told it is not their details, or they will retype them.
    expect(out.toLowerCase()).toContain('not a problem with your details')
  })

  it('tells an unconfirmed user where to look, including spam', () => {
    // With no verified sender domain the confirmation mail comes from
    // Supabase's shared SMTP and is very often spam-filed.
    const out = friendlyAuthError('Email not confirmed')
    expect(out.toLowerCase()).toContain('spam')
  })

  it('does not leak "invalid login credentials" as-is', () => {
    const out = friendlyAuthError('Invalid login credentials')
    expect(out.toLowerCase()).toContain('do not match')
  })

  it('names the rate limit as the site\'s, not the user\'s fault', () => {
    const out = friendlyAuthError('email rate limit exceeded')
    expect(out.toLowerCase()).toContain('wait')
  })

  it('passes an unrecognised message through unchanged', () => {
    // Inventing friendlier text for an error we have not seen would hide the
    // one detail that identifies it.
    const weird = 'ECONNRESET while contacting the auth server'
    expect(friendlyAuthError(weird)).toBe(weird)
  })

  it('never returns undefined for empty input', () => {
    expect(friendlyAuthError(undefined)).toBe('')
    expect(friendlyAuthError(null)).toBe('')
  })
})
