import { createClient } from '@supabase/supabase-js'

// Singleton pattern to prevent multiple instances
let supabase = null
// `isInitializing` was removed 2026-08-01. It existed so getSupabase() could
// tell "not built yet" from "being built", which only mattered while building
// was asynchronous. It is now synchronous, so the flag had no reader left.
// The in-flight initialization. Concurrent callers await THIS rather than being
// handed `null`: init is async, so the old "already in progress → return null"
// branch meant whoever asked during that window got no client and had to treat
// it as "Supabase unavailable". For anything that fails open on a missing
// client — the policy consent gate especially — that turned a startup race into
// a feature silently not running.
let initPromise = null

export async function initSupabase() {
  // Return existing instance if already initialized
  if (supabase) {
    return supabase
  }

  // Already starting up: wait for that attempt instead of starting a second one.
  if (initPromise) {
    return initPromise
  }

  initPromise = doInitSupabase()
  try {
    return await initPromise
  } finally {
    initPromise = null
  }
}

/**
 * Build the client. SYNCHRONOUS on purpose — see `getSupabase()`.
 *
 * `createClient()` does no I/O, so there was never a reason for obtaining a
 * client to be an async operation. The only await in the old path was the
 * legacy-session migration below, which now runs as a background side effect.
 *
 * @throws when the environment is genuinely misconfigured.
 */
function buildClient() {
  const url = import.meta.env.VITE_SUPABASE_URL
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!url || url === 'your_supabase_project_url_here' || !url.startsWith('http')) {
    throw new Error('Invalid Supabase URL. Please set VITE_SUPABASE_URL to a valid URL (e.g., https://your-project.supabase.co)')
  }
  if (!key || key === 'your_supabase_anon_key_here') {
    throw new Error('Invalid Supabase key. Please set VITE_SUPABASE_ANON_KEY to your actual anon key')
  }

  // DO NOT clear localStorage here - Supabase manages its own session storage.
  const client = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: window.localStorage,
      // Default Supabase storage key format: sb-<project-ref>-auth-token
    },
  })

  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
      console.log('Auth state changed:', event)
    }
  })

  return client
}

/**
 * Migrate a session stored under the pre-2026 custom key.
 *
 * Deliberately NOT awaited by `getSupabase()`. This is the only asynchronous
 * step in start-up, and making every caller wait for it — or handing them
 * `null` while it ran — is what produced the nullable-client race that ~125
 * hand-written guards across the services exist to absorb.
 *
 * Nobody is harmed by it finishing late: it only upgrades where a session is
 * stored. A user whose session is still in the old format sees the normal
 * signed-out state for the moment it takes, exactly as they would have anyway.
 */
async function migrateLegacySession(client) {
  const oldSessionKey = 'ecolink-supabase-auth-token'
  let existingSession = null
  try {
    const oldSessionData = localStorage.getItem(oldSessionKey)
    if (!oldSessionData) return
    existingSession = JSON.parse(oldSessionData)
  } catch {
    return
  }

  if (!existingSession?.access_token) return

  try {
    const { data, error } = await client.auth.setSession({
      access_token: existingSession.access_token,
      refresh_token: existingSession.refresh_token,
    })
    if (!error && data.session) {
      localStorage.removeItem(oldSessionKey)
    } else {
      console.warn('⚠️ Could not restore session from old format:', error)
    }
  } catch (migrationError) {
    console.warn('Error migrating session:', migrationError)
  }
}

async function doInitSupabase() {
  try {
    supabase = buildClient()
    // Fire-and-forget: see migrateLegacySession's note on why this is not awaited.
    migrateLegacySession(supabase)
    console.log('✅ Supabase client initialized successfully')
    return supabase
  } catch (error) {
    // Only log error once per session to reduce console noise
    if (!window._supabaseErrorLogged) {
      if (error.message?.includes('Required env var')) {
        console.warn('⚠️ Supabase not configured: Missing environment variables')
        console.warn('💡 Create a .env file in the project root with:')
        console.warn('   VITE_SUPABASE_URL=https://your-project-id.supabase.co')
        console.warn('   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key')
        console.warn('💡 App will continue in limited mode without database functionality')
      } else if (error.message?.includes('Invalid Supabase URL') || error.message?.includes('Invalid supabaseUrl')) {
        console.warn('⚠️ Supabase URL is invalid or still has placeholder value')
        console.warn('💡 Update your .env file with a valid Supabase URL:')
        console.warn('   VITE_SUPABASE_URL=https://your-project-id.supabase.co')
        console.warn('   Get your URL from: https://app.supabase.com -> Your Project -> Settings -> API')
      } else if (error.message?.includes('Invalid Supabase key')) {
        console.warn('⚠️ Supabase key is invalid or still has placeholder value')
        console.warn('💡 Update your .env file with your actual Supabase anon key')
        console.warn('   Get your key from: https://app.supabase.com -> Your Project -> Settings -> API')
      } else {
        console.error('Failed to initialize Supabase client:', error)
      }
      window._supabaseErrorLogged = true
    }
    supabase = null
    return null
  }
}

/**
 * The client, or `null` only when the environment is genuinely misconfigured.
 *
 * ── WHY THIS CHANGED (2026-08-01) ──
 * This used to kick off an async init and return whatever `supabase` happened to
 * be — `null` while that was in flight. So the answer to "is Supabase available?"
 * depended on **when you asked**, and roughly 125 hand-written guards across the
 * services exist to absorb that (94 `throw`, 31 `return []`).
 *
 * Those two shapes are the problem, not the guard count: the same transient
 * race surfaced as a hard error in one service and as an empty list in the next
 * — and an empty list renders as a fact about the user. That is the defect class
 * this repo has been chasing all week, with a startup race as its source.
 *
 * `createClient()` performs no I/O, so a client can simply be built on demand.
 * The only asynchronous step was the legacy-session migration, which is now a
 * background side effect. **A null return therefore now means one thing:
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing or invalid.** It is a
 * real, persistent state a guard should handle, not a timing artefact.
 *
 * The existing guards are consequently left in place and are now correct. Ripping
 * out 125 call sites across ~60 files to save a branch that can still legitimately
 * fire would be churn with a real regression budget and no user-visible gain.
 */
export function getSupabase() {
  if (supabase) return supabase

  try {
    supabase = buildClient()
    migrateLegacySession(supabase)
    return supabase
  } catch (error) {
    // Same one-shot diagnostics as initSupabase; misconfiguration is a
    // deployment problem, and repeating it once per call helps nobody.
    if (!window._supabaseErrorLogged) {
      console.error('Failed to initialize Supabase client:', error)
      window._supabaseErrorLogged = true
    }
    return null
  }
}

// Async version for cases where you need to wait for initialization
export async function getSupabaseAsync() {
  if (!supabase) {
    return await initSupabase()
  }
  return supabase
}

// Reset function for testing
export function resetSupabase() {
  supabase = null
}
