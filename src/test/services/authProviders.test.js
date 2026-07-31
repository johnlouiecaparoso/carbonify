import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useAuthProviders, resetAuthProvidersCache } from '@/composables/useAuthProviders'

/**
 * Guard for DEFERRED_BACKLOG #32.
 *
 * The sign-in and sign-up forms rendered "Continue with Google" and a phone/OTP
 * mode unconditionally, while the live project has `external.google` and
 * `external.phone` set to `false`. The first screen a pilot user saw offered two
 * paths that error on click.
 *
 * The forms now ask GoTrue which providers are actually enabled, so the answer
 * cannot drift from the deployment the way the documented one did. These tests
 * pin the FAIL-CLOSED direction: anything other than an explicit `true` hides
 * the button, because email + password always works and a hidden provider never
 * blocks a sign-in, whereas a dead one always breaks it.
 */

/** Resolve the composable's in-flight probe before asserting. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

function mockSettings(body, { ok = true } = {}) {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  })
}

describe('useAuthProviders', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    resetAuthProvidersCache()
    vi.stubEnv('VITE_SUPABASE_URL', 'https://project.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key')
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.unstubAllEnvs()
  })

  it('hides both providers when the backend has them disabled (the live state)', async () => {
    mockSettings({ external: { google: false, phone: false, email: true } })

    const { googleEnabled, phoneEnabled, loaded } = useAuthProviders()
    await flush()

    expect(loaded.value).toBe(true)
    expect(googleEnabled.value).toBe(false)
    expect(phoneEnabled.value).toBe(false)
  })

  it('shows a provider once it is enabled — no redeploy needed', async () => {
    mockSettings({ external: { google: true, phone: false } })

    const { googleEnabled, phoneEnabled } = useAuthProviders()
    await flush()

    expect(googleEnabled.value).toBe(true)
    expect(phoneEnabled.value).toBe(false)
  })

  it('fails closed when the settings probe errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network down'))

    const { googleEnabled, phoneEnabled, loaded } = useAuthProviders()
    await flush()

    expect(loaded.value).toBe(true)
    expect(googleEnabled.value).toBe(false)
    expect(phoneEnabled.value).toBe(false)
  })

  it('fails closed on a non-OK response', async () => {
    mockSettings({}, { ok: false })

    const { googleEnabled } = useAuthProviders()
    await flush()

    expect(googleEnabled.value).toBe(false)
  })

  it('probes the backend once and shares the result across forms', async () => {
    mockSettings({ external: { google: true, phone: true } })

    // Both the login form and the register form mount on the same page load.
    const login = useAuthProviders()
    const register = useAuthProviders()
    await flush()

    expect(globalThis.fetch).toHaveBeenCalledTimes(1)
    expect(login.googleEnabled.value).toBe(true)
    expect(register.googleEnabled.value).toBe(true)
  })
})
