import { defineStore } from 'pinia'
import { getSession, signOut } from '@/services/authService'
import { getProfile, updateProfile } from '@/services/profileService'
import { roleService } from '@/services/roleService'
import { logUserAction } from '@/services/auditService'
import { ROLES, canonicalizeRole } from '@/constants/roles'
import { PLANS, effectivePlan, planHasFeature } from '@/constants/plans'
import { getBlockingRoleApplicationForUser } from '@/services/roleApplicationService'

/**
 * True for storage keys that hold an auth session, and nothing else.
 *
 * The old test was `startsWith('sb-') || includes('supabase') || includes('auth')
 * || includes('user')`. Those last two are substring matches on words common
 * enough to catch unrelated keys — and clearLocalStorage runs on session
 * EXPIRY, not just logout, so an expiring session took the user's other saved
 * state with it. Supabase writes `sb-<project-ref>-auth-token`, so the prefix
 * alone is sufficient and precise.
 *
 * Exported for unit testing.
 */
export function isAuthStorageKey(key) {
  return typeof key === 'string' && (key.startsWith('sb-') || key.startsWith('supabase.'))
}

export const useUserStore = defineStore('user', {
  state: () => ({
    session: null,
    profile: null,
    loading: false,
    role: ROLES.GENERAL_USER,
    permissions: [],
    _profileFetchPromise: null,
    _profileFetchInProgress: false,
    _profileRetryInProgress: false,
    // True when the LAST profile fetch failed transiently (timeout / network /
    // unreadable row) rather than returning a definitive answer. Lets the UI
    // tell "we couldn't load your profile" apart from "you are a general_user",
    // and marks that the current role may be stale-but-last-known rather than
    // a silent downgrade.
    profileFetchFailed: false,
  }),
  getters: {
    isAuthenticated: (state) => !!state.session?.user,
    isAdmin: (state) => roleService.isAdmin(state.role),
    isGeneralUser: (state) => roleService.isGeneralUser(state.role),
    isProjectDeveloper: (state) => roleService.isProjectDeveloper(state.role),
    isVerifier: (state) => roleService.isVerifier(state.role),
    isBuyerInvestor: (state) => roleService.isBuyerInvestor(state.role),
    isLguUser: (state) => roleService.isLguUser(state.role),
    isFarmer: (state) => roleService.isFarmer(state.role),
    hasPermission: (state) => (permission) => roleService.hasPermission(state.role, permission),
    hasAnyPermission: (state) => (permissions) =>
      roleService.hasAnyPermission(state.role, permissions),
    hasAllPermissions: (state) => (permissions) =>
      roleService.hasAllPermissions(state.role, permissions),
    // No canAccessRoute getter: route access is decided by route meta in the
    // router guard, not by a second permission table that disagreed with it.
    // Subscription tier (orthogonal to role). Expiry-aware: a lapsed paid plan
    // resolves to FREE here, mirroring the server's effective-plan logic.
    plan: (state) => effectivePlan(state.profile),
    isPremium: (state) => effectivePlan(state.profile) !== PLANS.FREE,
    hasFeature: (state) => (feature) => planHasFeature(effectivePlan(state.profile), feature),
  },
  actions: {
    async fetchSession() {
      this.loading = true
      try {
        console.log('🔄 Fetching session...')

        // Single attempt - Supabase restore is quick
        const session = await getSession()

        // Check if session is valid and not expired
        if (session && session.user && session.expires_at) {
          const now = Math.floor(Date.now() / 1000)
          if (session.expires_at > now) {
            const blockingApplication = await getBlockingRoleApplicationForUser({
              userId: session.user.id,
              email: session.user.email,
            }).catch((approvalError) => {
              console.error('Error checking role approval during session restore:', approvalError)
              return null
            })

            if (blockingApplication) {
              console.warn('Blocked restored session for unapproved specialist account:', {
                userId: session.user.id,
                requestedRole: blockingApplication.role_requested,
                status: blockingApplication.status,
              })
              await signOut()
              this.session = null
              this.profile = null
              this.role = ROLES.GENERAL_USER
              this.permissions = []
              return
            }
            console.log('✅ Valid session found for user:', session.user.email)
            this.session = session
            // Fetch user profile and role when session is valid (don't await - let it load in background)
            this.fetchUserProfile().catch((err) => {
              console.error('Profile fetch failed:', err)
            })
          } else {
            console.log('⚠️ Session expired, clearing...')
            // Session expired, clear it and storage
            this.session = null
            this.clearUserData()
          }
        } else {
          // CRITICAL FIX: DO NOT clear localStorage here!
          // Supabase manages its own session storage - we should NOT delete it
          // Only clear in-memory session, but leave localStorage alone
          // This allows session to be restored on next page load if Supabase
          // hasn't finished initializing yet
          console.log(
            'ℹ️ No valid session found in store (localStorage may still have valid session)',
          )
          this.session = null
          // DO NOT call clearUserData() - it would delete valid Supabase tokens!
          // Only clear in-memory state
          this.profile = null
          this.role = ROLES.GENERAL_USER
          this.permissions = []
        }
      } catch (error) {
        console.error('Error fetching session:', error)
        // CRITICAL FIX: On error, don't clear localStorage either
        // Network errors shouldn't delete valid sessions
        this.session = null
        // Only clear in-memory state, preserve localStorage
        this.profile = null
        this.role = ROLES.GENERAL_USER
        this.permissions = []
      } finally {
        this.loading = false
      }
    },
    async fetchUserProfile() {
      if (!this.session?.user?.id) return

      // Prevent duplicate concurrent fetches
      if (this._profileFetchInProgress && this._profileFetchPromise) {
        console.log('🔄 Profile fetch already in progress, waiting for existing request...')
        try {
          await this._profileFetchPromise
          return // Profile already loaded by concurrent request
        } catch {
          // If the concurrent request failed, continue with new fetch
          console.warn('⚠️ Concurrent profile fetch failed, starting new fetch')
        }
      }

      // Mark as in progress and create promise
      this._profileFetchInProgress = true
      this._profileFetchPromise = this._performProfileFetch().finally(() => {
        this._profileFetchInProgress = false
        this._profileFetchPromise = null
      })

      try {
        await this._profileFetchPromise
      } catch {
        // Error already handled in _performProfileFetch
      }
    },

    async _performProfileFetch() {
      if (!this.session?.user?.id) return

      try {
        console.log('Fetching profile for user:', this.session.user.id)

        // IMPORTANT: Check if this is a test account first
        const isDevelopment = import.meta.env.DEV || import.meta.env.MODE === 'development'
        const testAccountIds = [
          '11111111-1111-1111-1111-111111111111', // admin
          '22222222-2222-2222-2222-222222222222', // verifier
          '33333333-3333-3333-3333-333333333333', // user
          '44444444-4444-4444-4444-444444444444', // developer
        ]
        const isTestAccount = isDevelopment && testAccountIds.includes(this.session.user.id)

        // For test accounts, use role already set in store (from login) and create mock profile
        if (isTestAccount) {
          if (import.meta.env.DEV) {
            console.log('[DEV] Test account detected - using role from store:', this.role)
          }

          // Import test accounts to get profile data
          const { TEST_ACCOUNTS } = await import('@/utils/testAccounts')

          // Find test account by ID
          const testAccount = Object.values(TEST_ACCOUNTS).find(
            (acc) => acc.mockSession?.user?.id === this.session.user.id,
          )

          // Create mock profile (don't try to fetch from Supabase)
          this.profile = {
            id: this.session.user.id,
            full_name: testAccount?.name || 'Test User',
            email: testAccount?.email || this.session.user.email,
            role: this.role || testAccount?.role || ROLES.GENERAL_USER,
            company: '',
            location: '',
            bio: '',
            kyc_level: 0,
            avatar_url: null,
            phone: '',
            website: '',
            notification_preferences: {
              emailNotifications: { enabled: true },
              projectUpdates: { enabled: true },
              marketAlerts: { enabled: false },
              newsletter: { enabled: true },
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }

          // Ensure role is set from test account if not already set
          if (!this.role && testAccount) {
            this.role = testAccount.role
          }

          this.role = canonicalizeRole(this.role)
          this.updatePermissions()

          if (import.meta.env.DEV) {
            console.log('✅ [DEV] Test account profile loaded:', {
              role: this.role,
              isAdmin: this.isAdmin,
              isVerifier: this.isVerifier,
              isProjectDeveloper: this.isProjectDeveloper,
            })
          }

          return
        }

        // For real users, fetch from Supabase. Guard a hung request with a 20s
        // timeout via Promise.race. (A previous AbortController here was built
        // and wired to a timeout but never passed to getProfile, so it cancelled
        // nothing — removed to avoid implying cancellation that never happened.)
        try {
          const profilePromise = getProfile(this.session.user.id)
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(new Error('Profile fetch timeout'))
            }, 20000)
          })

          const profile = await Promise.race([profilePromise, timeoutPromise])

          // A null profile is anomalous now that handle_new_auth_user creates a
          // row for every user inside the signup transaction: it means we could
          // not READ the row (RLS, or it isn't visible yet), not that the user
          // has no role. Downgrading to general_user here is exactly the silent
          // demotion that hid the original signup bug, so keep the last-known
          // role, flag the failure, and let the background retry recover it.
          if (!profile) {
            console.warn('⚠️ Profile not readable; keeping last-known role and retrying.')
            this.profileFetchFailed = true
            this._retryProfileFetch(3, 2000)
            return
          }

          this.profile = profile
          // canonicalizeRole, not an inline lowercase/trim: the retry path below
          // used to normalize differently, so a stored 'Admin' worked here and
          // demoted the user to general_user after a timeout retry.
          const normalizedRole = canonicalizeRole(profile.role)

          this.role = normalizedRole
          this.updatePermissions()
          this.profileFetchFailed = false

          // Debug logging
          if (import.meta.env.DEV) {
            console.log('✅ User profile loaded successfully:', {
              profileId: profile.id,
              roleFromProfile: profile.role,
              normalizedRole: normalizedRole,
              isAdmin: roleService.isAdmin(normalizedRole),
              isVerifier: roleService.isVerifier(normalizedRole),
              isProjectDeveloper: roleService.isProjectDeveloper(normalizedRole),
              ROLES_ADMIN: ROLES.ADMIN,
              ROLES_VERIFIER: ROLES.VERIFIER,
              ROLES_PROJECT_DEVELOPER: ROLES.PROJECT_DEVELOPER,
            })
          }
          return
        } catch (timeoutError) {
          // If it's a timeout, log it as a warning (not error) since we handle it gracefully
          if (timeoutError.message === 'Profile fetch timeout') {
            console.warn('⚠️ Profile fetch timed out after 20 seconds.')
            // A timeout is transient. Do NOT reset role to general_user: that
            // silently strips an already-loaded admin's permissions and UI until
            // a retry happens to land. Keep the last-known role, flag the
            // failure, and recover in the background.
            this.profileFetchFailed = true
            this._retryProfileFetch(3, 2000) // 3 retries, 2 second delay
            return
          }
          // Re-throw if it's not a timeout
          throw timeoutError
        }
      } catch (error) {
        // Handle RLS violations with specific messaging
        if (error.code === 'RLS_VIOLATION' || error.message?.includes('row-level security')) {
          console.warn('⚠️ Profile fetch blocked by RLS policy:', error.message)
          if (import.meta.env.DEV) {
            console.warn(
              '💡 To fix: Configure Supabase RLS policies to allow users to read/insert their own profiles.',
            )
          }
        } else if (error.message === 'Profile fetch timeout') {
          // Already handled in inner try-catch, just return
          return
        } else {
          // Only log as warning if it's not a timeout (already logged as warning above)
          console.warn('⚠️ Profile fetch error (non-critical):', error.message)
        }

        // Don't reset role to general_user: an error is not proof the user lacks
        // a role, and silently downgrading is the invisibility that masked the
        // original signup bug. Preserve the last-known role, flag the failure,
        // and recover via the background retry.
        this.profileFetchFailed = true

        // Try to fetch profile in background with retry logic (only if not timeout)
        if (error.message !== 'Profile fetch timeout') {
          this._retryProfileFetch(3, 2000) // 3 retries, 2 second delay
        }
      }
    },

    // Retry profile fetch with exponential backoff
    async _retryProfileFetch(maxRetries = 3, initialDelay = 2000) {
      if (!this.session?.user?.id) {
        return
      }

      // Guard against stacking multiple retry loops — but NOT against the primary
      // fetch. This is invoked from inside _performProfileFetch's failure
      // handlers, where _profileFetchInProgress is still true, so the old guard
      // keyed on that flag returned immediately every time and the retry never
      // actually ran. Use a dedicated retry flag instead.
      if (this._profileRetryInProgress) {
        return
      }
      this._profileRetryInProgress = true

      try {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          const delay = initialDelay * Math.pow(2, attempt - 1) // Exponential backoff: 2s, 4s, 8s

          try {
            await new Promise((resolve) => setTimeout(resolve, delay))

            console.log(`🔄 Retrying profile fetch (attempt ${attempt}/${maxRetries})...`)
            const profile = await getProfile(this.session.user.id)

            if (profile) {
              this.profile = profile
              // Same canonicalization as the primary path. These two disagreeing
              // is what let a retry silently downgrade an admin.
              this.role = canonicalizeRole(profile.role)
              this.updatePermissions()
              this.profileFetchFailed = false
              console.log(`✅ Profile loaded successfully after ${attempt} retry attempt(s)`)
              return
            }
          } catch {
            if (attempt === maxRetries) {
              console.warn(`⚠️ Profile fetch failed after ${maxRetries} retry attempts`)
              console.warn('💡 User will continue with the last-known role')
            } else {
              console.warn(`⚠️ Profile fetch retry ${attempt} failed, will retry in ${delay}ms...`)
            }
          }
        }
      } finally {
        this._profileRetryInProgress = false
      }
    },

    async updateUserProfile(profileData) {
      if (!this.session?.user?.id) {
        throw new Error('User not authenticated')
      }

      try {
        const updatedProfile = await updateProfile(this.session.user.id, profileData)
        this.profile = updatedProfile
        console.log('Profile updated in store:', updatedProfile)
        return updatedProfile
      } catch (error) {
        console.error('Failed to update profile in store:', error)
        throw error
      }
    },
    updatePermissions() {
      // Update permissions based on current role
      this.permissions = roleService.getRolePermissions(this.role) || []
    },
    async updateUserRole(newRole) {
      if (!this.session?.user?.id) return false

      try {
        const success = await roleService.updateUserRole(this.session.user.id, newRole)
        if (success) {
          this.role = newRole
          this.updatePermissions()
        }
        return success
      } catch (error) {
        console.error('Error updating user role:', error)
        return false
      }
    },
    clearUserData() {
      this.session = null
      this.profile = null
      this.role = ROLES.GENERAL_USER
      this.permissions = []
      // A deliberate sign-out/expiry is a definitive answer, not a transient
      // failure — clear the flag so a returning guest never sees the
      // "couldn't load your profile" banner from a previous session.
      this.profileFetchFailed = false
      this.clearLocalStorage()
    },
    clearLocalStorage() {
      try {
        if (typeof window === 'undefined') return

        for (const storage of [window.localStorage, window.sessionStorage]) {
          if (!storage) continue
          Object.keys(storage)
            .filter(isAuthStorageKey)
            .forEach((key) => storage.removeItem(key))
        }

        // Clear any cookies related to authentication
        if (document.cookie) {
          document.cookie.split(';').forEach((cookie) => {
            const eqPos = cookie.indexOf('=')
            const name = eqPos > -1 ? cookie.slice(0, eqPos).trim() : cookie.trim()
            if (name.includes('supabase') || name.includes('auth') || name.includes('session')) {
              document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
              document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`
            }
          })
        }
      } catch (e) {
        console.warn('Error clearing storage:', e)
        // Ignore storage errors but continue
      }
    },
    async logout() {
      const userId = this.session?.user?.id

      // Clear local state immediately (don't wait for async operations)
      this.clearUserData()
      this.session = null
      this.profile = null
      this.role = ROLES.GENERAL_USER
      this.permissions = []
      this.loading = false

      // Do background cleanup (fire and forget - non-blocking)
      Promise.resolve().then(async () => {
        try {
          // Log logout action (non-blocking)
          if (userId) {
            logUserAction('LOGOUT_SUCCESS', 'user', userId, null, {
              timestamp: new Date().toISOString(),
            }).catch((err) => {
              console.warn('Failed to log logout action:', err)
            })
          }

          // Sign out from Supabase (non-blocking)
          await signOut()
        } catch (error) {
          console.error('Background logout cleanup error:', error)
          // Ignore - we've already cleared local state
        }
      })
    },
  },
})
