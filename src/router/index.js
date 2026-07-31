import { createRouter, createWebHistory } from 'vue-router'
import { useUserStore } from '@/store/userStore'
import { ROLES, canonicalizeRole } from '@/constants/roles'
import { getRoleDefaultRoute } from '@/utils/getRoleDefaultRoute'
import {
  createProjectDeveloperGuard,
  createAdminGuard,
  createVerifierGuard,
  createLguGuard,
  createFarmerGuard,
} from '@/middleware/roleGuard'
import { FEATURES } from '@/constants/plans'

// Lazy load components for better performance
const HomepageView = () => import(/* webpackChunkName: "homepage" */ '@/views/HomepageView.vue')
const LoginView = () => import(/* webpackChunkName: "auth" */ '@/views/LoginView.vue')
const RegisterView = () => import(/* webpackChunkName: "auth" */ '@/views/RegisterView.vue')
const WalletView = () => import(/* webpackChunkName: "user" */ '@/views/WalletView.vue')
const ProfileView = () => import(/* webpackChunkName: "user" */ '@/views/ProfileView.vue')

const UserPreferencesView = () =>
  import(/* webpackChunkName: "user" */ '@/views/UserPreferencesView.vue')

/**
 * Roles that never buy credits. Blocked from the whole buying path — browsing a
 * cart, holding a portfolio, saving listings, checking out.
 *
 * Project developers sell credits rather than buy them, so they sit here too;
 * their money pages are /sales and /developer/ledger.
 *
 * Farmers sit here for the same reason (backlog #31, decided 2026-07-30: a
 * farmer is a seller, not a buyer — they supply feedstock, they do not trade
 * credits). Every other layer already said so: `isBuyerRole()` in
 * constants/navigation.js excludes farmers, their sidebar is Feedstock +
 * Insights with none of these routes in it, and they get no wallet entry in the
 * account menu. Only this guard disagreed, so a farmer could still reach
 * checkout by typing the URL while nothing ever offered it — the contradiction
 * #31 was actually about. Their money pages are /farmer and /sales.
 */
const FINANCE_RESTRICTED_ROLES = [
  ROLES.ADMIN,
  ROLES.VERIFIER,
  ROLES.PROJECT_DEVELOPER,
  ROLES.FARMER,
]

/**
 * Roles with no identity-verification path of their own. Everyone else — buyers,
 * farmers, LGU users, developers — needs KYC to move money, so /kyc stays open
 * to them.
 */
const NON_TRANSACTING_ROLES = [ROLES.ADMIN, ROLES.VERIFIER]

/**
 * Roles that have nothing to sell, and so have no earnings to see. Project
 * developers sell credits and farmers sell feedstock; everyone else is blocked
 * from /sales.
 */
const NON_SELLING_ROLES = [
  ROLES.ADMIN,
  ROLES.VERIFIER,
  ROLES.GENERAL_USER,
  ROLES.BUYER_INVESTOR,
  ROLES.LGU_USER,
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    // Public Routes
    { path: '/home', name: 'home', meta: { public: true }, component: HomepageView },
    { path: '/', redirect: '/home' },
    {
      path: '/about',
      name: 'about',
      meta: { public: true },
      component: () => import('@/views/AboutView.vue'),
    },
    { path: '/login', name: 'login', meta: { public: true }, component: LoginView },
    { path: '/register', name: 'register', meta: { public: true }, component: RegisterView },
    {
      path: '/forgot-password',
      name: 'forgot-password',
      meta: { public: true },
      component: () => import('@/views/ForgotPasswordView.vue'),
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      meta: { public: true },
      component: () => import('@/views/ResetPasswordView.vue'),
    },
    {
      // MFA step-up page (requires a session at aal1; reached via the guard)
      path: '/mfa-challenge',
      name: 'mfa-challenge',
      component: () => import('@/views/MfaChallengeView.vue'),
      meta: { requiresAuth: true },
    },
    {
      // OAuth / phone sign-in lands here to finalize the session.
      path: '/auth/callback',
      name: 'auth-callback',
      meta: { public: true },
      component: () => import('@/views/AuthCallbackView.vue'),
    },
    {
      path: '/marketplace',
      name: 'marketplace',
      meta: { public: true },
      component: () => import('@/views/MarketplaceViewEnhanced.vue'),
    },
    {
      // Public biomass feedstock marketplace (browse + request-for-quotation).
      path: '/biomass',
      name: 'biomass-marketplace',
      meta: { public: true },
      component: () => import('@/views/BiomassMarketplaceView.vue'),
    },
    {
      // Investor Portal — pipeline + financial model + data room. Pro-gated.
      path: '/investor',
      name: 'investor-portal',
      component: () => import('@/views/InvestorPortalView.vue'),
      meta: { requiresAuth: true, requiresFeature: FEATURES.INVESTOR_PORTAL },
    },
    {
      path: '/biomass/sell',
      name: 'biomass-sell',
      component: () => import('@/views/BiomassSellView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/biomass/rfqs',
      name: 'biomass-rfqs',
      component: () => import('@/views/BiomassRfqsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      // Public carbon registry — anyone can browse/verify issued & retired credits.
      path: '/registry',
      name: 'registry',
      meta: { public: true },
      component: () => import('@/views/RegistryView.vue'),
    },
    {
      // Public market dashboard — anonymous market snapshot (supply, price, impact).
      path: '/market',
      name: 'market-dashboard',
      meta: { public: true },
      component: () => import('@/views/MarketDashboardView.vue'),
    },
    {
      path: '/map',
      name: 'projects-map',
      component: () => import('@/views/ProjectsMapView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/apply',
      name: 'role-application',
      meta: { public: true },
      component: () => import('@/views/RoleApplicationView.vue'),
    },
    {
      // A memorable URL to hand a farmer or cooperative on a leaflet or over the
      // phone. "/apply?role=farmer" is not something you can say out loud.
      path: '/register/farmer',
      name: 'register-farmer',
      redirect: () => ({ path: '/apply', query: { role: 'farmer' } }),
    },
    {
      path: '/retire',
      name: 'retire',
      component: () => import('@/views/RetireView.vue'),
      meta: { requiresAuth: true },
    },
    {
      // Public certificate verification (QR codes resolve here)
      path: '/verify/:certificateNumber?',
      name: 'certificate-verify',
      meta: { public: true },
      component: () => import('@/views/CertificateVerifyView.vue'),
    },
    {
      // Buyer / general-user workspace. Every other role has a dashboard to land
      // on; before this, buyers landed on the public marketing homepage. Roles
      // that never buy are bounced to their own default route by the guard.
      path: '/dashboard',
      name: 'buyer-dashboard',
      component: () => import('@/views/BuyerDashboardView.vue'),
      meta: { requiresAuth: true, disallowedRoles: FINANCE_RESTRICTED_ROLES },
    },
    {
      path: '/profile',
      name: 'profile',
      component: ProfileView,
      meta: { requiresAuth: true },
    },
    {
      path: '/wallet',
      name: 'wallet',
      component: WalletView,
      meta: { requiresAuth: true, disallowedRoles: FINANCE_RESTRICTED_ROLES },
    },
    // Project and Credit Routes
    {
      path: '/submit-project',
      name: 'submit-project',
      component: () => import('@/views/SubmitProjectView.vue'),
      meta: {
        requiresAuth: true,
        requiresProjectDeveloper: true,
      },
    },
    {
      path: '/developer/projects',
      name: 'developer-projects-dashboard',
      component: () => import('@/views/DeveloperProjectsDashboardView.vue'),
      meta: {
        requiresAuth: true,
        requiresProjectDeveloper: true,
      },
    },
    {
      path: '/developer/ledger',
      name: 'developer-asset-ledger',
      component: () => import('@/views/CarbonAssetLedgerView.vue'),
      meta: {
        requiresAuth: true,
        requiresProjectDeveloper: true,
      },
    },
    {
      path: '/developer/mrv-dashboard',
      name: 'developer-mrv-dashboard',
      component: () => import('@/views/MrvDashboardView.vue'),
      meta: {
        requiresAuth: true,
        requiresProjectDeveloper: true,
      },
    },
    {
      path: '/monitoring',
      name: 'monitoring-reports',
      component: () => import('@/views/MonitoringReportView.vue'),
      meta: {
        requiresAuth: true,
        requiresProjectDeveloper: true,
      },
    },
    {
      path: '/lgu',
      name: 'lgu-dashboard',
      component: () => import('@/views/LguDashboardView.vue'),
      meta: {
        requiresAuth: true,
        requiresLgu: true,
      },
    },
    {
      path: '/developer/data-room',
      name: 'data-room-activity',
      component: () => import('@/views/DataRoomActivityView.vue'),
      meta: {
        requiresAuth: true,
        requiresProjectDeveloper: true,
      },
    },
    {
      path: '/developer/offtakes',
      name: 'offtake-agreements',
      component: () => import('@/views/OfftakeAgreementsView.vue'),
      meta: {
        requiresAuth: true,
        requiresProjectDeveloper: true,
      },
    },
    {
      path: '/assistant',
      name: 'ai-assistant',
      component: () => import('@/views/AiAssistantView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/farmer',
      name: 'farmer-portal',
      component: () => import('@/views/FarmerPortalView.vue'),
      meta: {
        requiresAuth: true,
        requiresFarmer: true,
      },
    },
    {
      path: '/credit-portfolio',
      name: 'credit-portfolio',
      component: () => import('@/views/CreditPortfolioView.vue'),
      meta: { requiresAuth: true, disallowedRoles: FINANCE_RESTRICTED_ROLES },
    },
    {
      path: '/watchlist',
      name: 'watchlist',
      component: () => import('@/views/WatchlistView.vue'),
      meta: { requiresAuth: true, disallowedRoles: FINANCE_RESTRICTED_ROLES },
    },
    {
      path: '/cart',
      name: 'cart',
      component: () => import('@/views/CartView.vue'),
      // Checkout is buying. Admins/verifiers/developers used to reach this
      // route freely — only the header's cart icon was hidden from them.
      meta: { requiresAuth: true, disallowedRoles: FINANCE_RESTRICTED_ROLES },
    },
    {
      path: '/kyc',
      name: 'kyc',
      component: () => import('@/views/KycView.vue'),
      // Developers and farmers need KYC to get paid; only admins and
      // verifiers have no identity-verification path of their own.
      meta: { requiresAuth: true, disallowedRoles: NON_TRANSACTING_ROLES },
    },
    {
      path: '/upgrade',
      name: 'upgrade',
      component: () => import('@/views/UpgradeView.vue'),
      meta: { requiresAuth: true },
    },
    // Redirect old project list route; full detail page for a single project.
    { path: '/projects', redirect: '/marketplace' },
    {
      path: '/projects/:id',
      name: 'project-detail',
      meta: { public: true },
      component: () => import('@/views/ProjectDetailView.vue'),
      props: true,
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/components/admin/AdminDashboard.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true,
      },
    },
    {
      path: '/admin/users',
      name: 'admin-users',
      component: () => import('@/components/admin/UserManagement.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true,
      },
    },
    {
      path: '/admin/role-applications',
      name: 'admin-role-applications',
      component: () => import('@/components/admin/RoleApplications.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true,
      },
    },
    {
      path: '/admin/database',
      name: 'admin-database',
      component: () => import('@/components/admin/DatabaseManagement.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true,
      },
    },
    {
      path: '/admin/kyc',
      name: 'admin-kyc',
      component: () => import('@/components/admin/KycReviewPanel.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true,
      },
    },
    {
      path: '/admin/config',
      name: 'admin-config',
      component: () => import('@/views/SystemConfigView.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true,
      },
    },
    {
      path: '/admin/kyb',
      name: 'admin-kyb',
      component: () => import('@/views/AdminKybReviewView.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true,
      },
    },
    {
      path: '/admin/refunds',
      name: 'admin-refunds',
      component: () => import('@/views/AdminRefundsView.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true,
      },
    },
    { path: '/admin/tables', redirect: '/admin/database' },
    {
      path: '/admin/finance',
      name: 'admin-finance',
      component: () => import('@/views/FinanceConsoleView.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true,
      },
    },
    {
      path: '/admin/audit-logs',
      name: 'admin-audit-logs',
      component: () => import('@/components/admin/AuditLogsView.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true,
      },
    },
    {
      path: '/admin/privacy',
      name: 'admin-privacy-requests',
      component: () => import('@/views/AdminPrivacyRequestsView.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true,
      },
    },
    {
      path: '/admin/aml',
      name: 'admin-aml',
      component: () => import('@/views/AdminAmlView.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true,
      },
    },
    {
      // The feedstock side of the marketplace had no admin surface at all
      // (backlog #29), so a farmer's non-payment dispute escalated to nobody.
      path: '/admin/feedstock',
      name: 'admin-feedstock',
      component: () => import('@/views/AdminFeedstockView.vue'),
      meta: {
        requiresAuth: true,
        requiresAdmin: true,
      },
    },
    {
      path: '/verifier',
      name: 'verifier',
      component: () => import('@/views/VerifierPanel.vue'),
      meta: { requiresAuth: true, requiresVerifier: true },
    },
    {
      path: '/analytics',
      name: 'analytics',
      component: () => import('@/views/AnalyticsView.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/sales',
      name: 'seller-earnings',
      component: () => import('@/views/SellerEarningsView.vue'),
      // Seller earnings belong to whoever sells. Any signed-in buyer could
      // open this page before.
      meta: { requiresAuth: true, disallowedRoles: NON_SELLING_ROLES },
    },

    // Certificate and Receipt Routes
    {
      path: '/certificates',
      name: 'certificates',
      component: () => import('@/views/CertificateView.vue'),
      meta: { requiresAuth: true, disallowedRoles: FINANCE_RESTRICTED_ROLES },
    },
    {
      path: '/carbon-calculator',
      name: 'carbon-calculator',
      component: () => import('@/views/CarbonCalculatorView.vue'),
      meta: { requiresAuth: true, disallowedRoles: FINANCE_RESTRICTED_ROLES },
    },
    {
      path: '/receipts',
      name: 'receipts',
      component: () => import('@/views/ReceiptView.vue'),
      meta: { requiresAuth: true, disallowedRoles: FINANCE_RESTRICTED_ROLES },
    },
    {
      // Every checkout the buyer started, including pending/failed ones that
      // never produced a receipt.
      path: '/orders',
      name: 'orders',
      component: () => import('@/views/OrdersView.vue'),
      meta: { requiresAuth: true, disallowedRoles: FINANCE_RESTRICTED_ROLES },
    },
    {
      // Buyer-facing side of the dispute flow (admins resolve them at
      // /admin/refunds). Raised from a receipt via DisputeModal.
      path: '/disputes',
      name: 'my-disputes',
      component: () => import('@/views/MyDisputesView.vue'),
      meta: { requiresAuth: true, disallowedRoles: FINANCE_RESTRICTED_ROLES },
    },

    // Payment Callback (PayMongo redirects here after payment)
    {
      path: '/payment/callback',
      name: 'payment-callback',
      component: () => import('@/views/PaymentCallbackView.vue'),
      meta: { requiresAuth: true },
    },
    // Mock / legacy completion URL (same handler; session id from localStorage)
    {
      path: '/payment/complete',
      name: 'payment-complete',
      component: () => import('@/views/PaymentCallbackView.vue'),
      meta: { requiresAuth: true },
    },

    {
      // Theme, accessibility, language and display settings. App.vue applies
      // these on mount, so this is the only screen that can change what the app
      // looks like; it is reached from the account menu (constants/navigation).
      path: '/preferences',
      name: 'preferences',
      component: UserPreferencesView,
      meta: { requiresAuth: true },
    },
  ],
})

/**
 * Every access check that applies to a signed-in user: MFA step-up, the
 * role-specific guards, the `disallowedRoles` block list and the plan gate.
 * Returns a redirect location, or `undefined` to allow the navigation.
 *
 * This lives in a function because it has to run on BOTH paths into an
 * authenticated navigation. It used to be inline in the `isAuthenticated`
 * branch only — so the second path, which restores a session straight from
 * Supabase when the store has not hydrated, called `next()` having checked
 * nothing. Any signed-in account could open /admin, /verifier or the whole
 * buying path by hitting the URL while the store was cold (a hard refresh, or
 * `fetchSession()` throwing, which is caught and ignored above). The route
 * metadata was right the whole time; only one of the two branches consulted it.
 */
async function enforceAuthenticatedAccess(to, from, userStore) {
  // Strict 2FA enforcement: if the user has MFA enrolled but their session is
  // still at aal1, force them to the step-up page before any protected route.
  if (to.name !== 'mfa-challenge') {
    try {
      const { isMfaRequired } = await import('@/services/mfaService')
      const { required } = await isMfaRequired()
      if (required) {
        console.log('🔐 MFA step-up required, redirecting to challenge')
        return { name: 'mfa-challenge', query: { returnTo: to.fullPath } }
      }
    } catch (mfaErr) {
      // Fail open on transient errors so users are never locked out.
      console.warn('MFA enforcement check failed (allowing):', mfaErr?.message)
    }
  }

  // IMPORTANT: Ensure profile is loaded before checking role-specific routes
  // This prevents navigation issues where role isn't loaded yet
  if (
    to.meta.requiresProjectDeveloper ||
    to.meta.requiresAdmin ||
    to.meta.requiresVerifier ||
    to.meta.requiresLgu ||
    to.meta.requiresFarmer ||
    to.meta.requiresFeature
  ) {
    if (!userStore.profile || !userStore.role || userStore.role === 'general_user') {
      console.log('⏳ Profile/role not loaded yet, fetching before route check...')
      try {
        await userStore.fetchUserProfile()
      } catch (error) {
        console.error('Error fetching profile in router guard:', error)
      }
    }
  }

  // Role-specific route requirements. Each guard returns a redirect or undefined.
  const ROLE_GATES = [
    { meta: 'requiresProjectDeveloper', guard: createProjectDeveloperGuard, label: 'Project Developer' },
    { meta: 'requiresLgu', guard: createLguGuard, label: 'LGU' },
    { meta: 'requiresFarmer', guard: createFarmerGuard, label: 'Farmer' },
    { meta: 'requiresAdmin', guard: createAdminGuard, label: 'Admin' },
    { meta: 'requiresVerifier', guard: createVerifierGuard, label: 'Verifier' },
  ]

  for (const { meta, guard, label } of ROLE_GATES) {
    if (!to.meta[meta]) continue
    const guardResult = await guard(userStore)(to, from)
    if (guardResult) {
      console.log(`❌ ${label} access required, redirecting...`)
      return guardResult
    }
  }

  const disallowedRoles = Array.isArray(to.meta.disallowedRoles) ? to.meta.disallowedRoles : []
  if (disallowedRoles.length > 0) {
    // canonicalizeRole, not a local lowercase/trim: an alias like 'super_admin'
    // has to resolve to 'admin' here or it slips past every block list.
    const normalizedRole = canonicalizeRole(userStore.role || userStore.profile?.role)
    if (disallowedRoles.includes(normalizedRole)) {
      console.warn('❌ Route blocked for role:', {
        route: to.path,
        role: normalizedRole,
        disallowedRoles,
      })
      return getRoleDefaultRoute(normalizedRole || ROLES.GENERAL_USER)
    }
  }

  // Subscription / premium gating (orthogonal to roles). Client-side UX gate
  // only — premium actions are also enforced server-side.
  if (to.meta.requiresFeature && !userStore.hasFeature(to.meta.requiresFeature)) {
    console.log('🔒 Feature not in plan, redirecting to upgrade:', to.meta.requiresFeature)
    return { name: 'upgrade', query: { feature: to.meta.requiresFeature } }
  }

  return undefined
}

// Router guard for authentication
router.beforeEach(async (to, from, next) => {
  console.log('🔍 Router guard checking:', to.name, 'from:', from.name)

  // Public routes declare themselves with `meta: { public: true }`.
  //
  // This used to be a hand-maintained array of route names living down here,
  // far from the route table. It had drifted: 'marketplace' and 'project-detail'
  // were missing, so the public marketplace — linked from the signed-out header
  // — bounced every anonymous visitor to /login, and every shared project link
  // was dead. It also listed 'homepage', a name no route has ever had.
  //
  // Keeping the flag on the route means adding a public route and forgetting to
  // allowlist it is no longer possible.
  if (to.meta.public) {
    console.log('✅ Public route, allowing access')
    next()
    return
  }

  // Get user store
  const userStore = useUserStore()
  console.log('📊 User store initial state:', {
    loading: userStore.loading,
    authenticated: userStore.isAuthenticated,
    hasSession: !!userStore.session,
  })

  // If store is loading or session is null, fetch session
  // This handles the case where page refresh happens before App.vue onMounted runs
  if (userStore.loading || !userStore.session) {
    console.log('⏳ Initializing session...')

    // Ensure we fetch the session - this handles page refresh scenarios
    if (!userStore.loading) {
      // Only start fetch if not already loading to avoid duplicate calls
      try {
        await userStore.fetchSession()
      } catch (error) {
        console.error('Error fetching session in router guard:', error)
      }
    } else {
      // Wait for existing fetch to complete
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Auth check timeout')), 3000),
      )

      try {
        await Promise.race([
          new Promise((resolve) => {
            const checkLoading = () => {
              if (!userStore.loading) {
                console.log('✅ Loading completed')
                resolve()
              } else {
                setTimeout(checkLoading, 100) // Check less frequently
              }
            }
            checkLoading()
          }),
          timeout,
        ])
      } catch {
        console.warn('⚠️ Auth check timeout, checking Supabase directly...')

        // Last resort: check Supabase directly if store check times out
        try {
          const { getSession } = await import('@/services/authService')
          const session = await getSession()

          if (session?.user) {
            // Update store with session found in Supabase
            userStore.session = session
            console.log('✅ Session restored from Supabase storage')
            // Also fetch profile to get role
            await userStore.fetchUserProfile()
          }
        } catch (directCheckError) {
          console.error('Direct Supabase check failed:', directCheckError)
        }
      }
    }
  }

  // Final state check after waiting/fetching
  console.log('🔍 Final auth check:', {
    loading: userStore.loading,
    authenticated: userStore.isAuthenticated,
    hasSession: !!userStore.session,
    userEmail: userStore.session?.user?.email,
  })

  // Check if user is authenticated
  if (userStore.isAuthenticated) {
    console.log('✅ User authenticated, running access checks')

    // Allow homepage access for authenticated users (no redirect)
    next(await enforceAuthenticatedAccess(to, from, userStore))
  } else {
    // Final check: Try Supabase directly before redirecting to login
    // This handles cases where store hasn't loaded yet but session exists in localStorage
    try {
      const { getSupabase } = await import('@/services/supabaseClient')
      const supabase = getSupabase()
      if (supabase) {
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession()

        if (session?.user && !error) {
          console.log('✅ Found session in Supabase, restoring...')
          userStore.session = session
          await userStore.fetchUserProfile()

          // Run the SAME access checks as the branch above. This used to be a
          // bare `next()`: a restored session was treated as proof of
          // authorisation, not just authentication, so every role gate and
          // block list was skipped on this path.
          //
          // A `to.name === 'homepage'` branch used to sit here, sending a
          // restored session to its role's default route. No route has ever
          // been named 'homepage' (the marketing page is 'home'), so it never
          // ran — and 'home' is public, so it returns long before reaching
          // this block anyway.
          next(await enforceAuthenticatedAccess(to, from, userStore))
          return
        }
      }
    } catch (supabaseError) {
      console.warn('⚠️ Could not check Supabase session:', supabaseError)
    }

    // Only redirect to login if we're sure there's no session. login/register
    // are public and returned above; the check stays as a belt-and-braces guard
    // against ever redirecting the login page to itself.
    if (to.name !== 'login' && to.name !== 'register') {
      // Add returnTo query param to redirect back after login
      const returnTo = encodeURIComponent(to.fullPath)
      console.log('❌ User not authenticated, redirecting to login')
      next({ name: 'login', query: { returnTo } })
    } else {
      next()
    }
  }
})

export default router
