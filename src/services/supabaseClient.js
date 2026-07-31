import { createClient } from '@supabase/supabase-js'

// Singleton pattern to prevent multiple instances
let supabase = null
let isInitializing = false
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

async function doInitSupabase() {
  try {
    isInitializing = true
    // Use direct env access instead of requireEnv to prevent build-time failures
    // The validation below will catch missing/invalid values at runtime
    const url = import.meta.env.VITE_SUPABASE_URL
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY
    
    // Validate URL format and presence before creating client
    if (!url || url === 'your_supabase_project_url_here' || !url.startsWith('http')) {
      throw new Error('Invalid Supabase URL. Please set VITE_SUPABASE_URL to a valid URL (e.g., https://your-project.supabase.co)')
    }
    
    if (!key || key === 'your_supabase_anon_key_here') {
      throw new Error('Invalid Supabase key. Please set VITE_SUPABASE_ANON_KEY to your actual anon key')
    }

    // DO NOT clear localStorage here - Supabase manages its own session storage
    // Clearing it would delete valid auth tokens on every page refresh!
    // Supabase's createClient will automatically handle session persistence

    // Check for session in old custom key format (backward compatibility)
    const oldSessionKey = 'ecolink-supabase-auth-token'
    let existingSession = null

    try {
      const oldSessionData = localStorage.getItem(oldSessionKey)
      if (oldSessionData) {
        try {
          existingSession = JSON.parse(oldSessionData)
          console.log('📦 Found session in old format, will migrate to default format')
        } catch (e) {
          console.warn('Could not parse old session data:', e)
        }
      }
    } catch {
      // Ignore localStorage access errors
    }

    supabase = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        // Use default Supabase storage key format: sb-<project-ref>-auth-token
        // This is more reliable and standard
      },
    })

    // If we found a session in the old format, restore it to the new format
    if (existingSession && existingSession.access_token) {
      try {
        // Set the session using Supabase's method
        const { data, error } = await supabase.auth.setSession({
          access_token: existingSession.access_token,
          refresh_token: existingSession.refresh_token,
        })

        if (!error && data.session) {
          console.log('✅ Successfully migrated session from old format')
          // Clear old session key
          localStorage.removeItem(oldSessionKey)
        } else {
          console.warn('⚠️ Could not restore session from old format:', error)
        }
      } catch (migrationError) {
        console.warn('Error migrating session:', migrationError)
      }
    }

    // Add error handler for auth state changes
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        console.log('Auth state changed:', event)
      }
    })

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
  } finally {
    isInitializing = false
  }
}

export function getSupabase() {
  if (!supabase && !isInitializing) {
    // Start initialization but don't block
    // Errors are already handled in initSupabase, no need to log again
    initSupabase().catch(() => {
      // Error already logged in initSupabase
    })
  }
  // Return existing instance (might be null if still initializing)
  // Callers should check for null and retry if needed
  return supabase
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
  isInitializing = false
}
