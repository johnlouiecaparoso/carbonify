import { ref } from 'vue'

/**
 * Which auth providers does the BACKEND actually accept?
 *
 * Backlog #32. The sign-in and sign-up forms rendered "Continue with Google"
 * and a phone/OTP mode unconditionally, while the live project has
 * `external.google` and `external.phone` set to `false`. A pilot user who picked
 * either got an error on the very first screen they saw.
 *
 * Rather than hard-code the answer (which just moves the drift somewhere else —
 * exactly how the docs came to assert the opposite of the live settings), ask
 * GoTrue. `/auth/v1/settings` is public, read-only, needs only the anon key and
 * creates nothing. The same endpoint `pilot-readiness.spec.js` asserts against.
 *
 * The result is self-correcting: enable Google in the dashboard and the button
 * appears with no redeploy; leave it disabled and nobody is offered a dead path.
 *
 * FAIL CLOSED. Providers stay hidden while loading and stay hidden if the probe
 * fails. Email + password is always available, so hiding a provider never blocks
 * a sign-in, whereas showing one that the backend rejects always breaks it.
 */

// Module-level cache: one probe per page load, shared by every form that asks.
let cachedSettings = null
let inFlight = null

async function fetchAuthSettings() {
  if (cachedSettings) return cachedSettings
  if (inFlight) return inFlight

  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) return null

  inFlight = (async () => {
    try {
      const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } })
      if (!res.ok) throw new Error(`auth settings returned ${res.status}`)
      cachedSettings = await res.json()
      return cachedSettings
    } catch (err) {
      // Not fatal: the caller keeps the providers hidden and email/password works.
      console.warn('Could not read auth provider settings; hiding social sign-in.', err?.message)
      return null
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

export function useAuthProviders() {
  const googleEnabled = ref(false)
  const phoneEnabled = ref(false)
  const loaded = ref(false)

  fetchAuthSettings().then((settings) => {
    googleEnabled.value = settings?.external?.google === true
    phoneEnabled.value = settings?.external?.phone === true
    loaded.value = true
  })

  return { googleEnabled, phoneEnabled, loaded }
}

/** Test seam — drops the cached probe so each test starts clean. */
export function resetAuthProvidersCache() {
  cachedSettings = null
  inFlight = null
}
