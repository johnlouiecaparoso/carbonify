<script setup>
import { computed, onMounted, ref } from 'vue'
// Footer legal modal — one of: 'terms' | 'privacy' | 'carbon' | null.
// Content mirrors docs/POLICY_AND_USER_AGREEMENT.md, the build-accurate source
// of truth. Keep them in sync (see that doc's §5 internal note).
const activePolicy = ref(null)
const policyTabs = [
  { id: 'terms', label: 'Terms & Conditions' },
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'carbon', label: 'Carbon Credits Policy' },
]
import { useRoute } from 'vue-router'
import Header from '@/components/layout/Header.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import ErrorBoundary from '@/components/ErrorBoundary.vue'
import WelcomeTour from '@/components/onboarding/WelcomeTour.vue'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useUserStore } from '@/store/userStore'
// import { useErrorStore } from '@/store/errorStore' // Temporarily disabled
import { getSupabase } from '@/services/supabaseClient'

const route = useRoute()

// Track if app has been initially loaded to prevent showing loading screen on tab switches
const isInitialized = ref(false)

// The store was previously only instantiated inside functions here; the
// suspension banner needs it at setup scope. Safe: main.js calls app.use(pinia)
// before app.mount, so Pinia is active by the time this setup runs, and the
// later useUserStore() calls return this same instance.
const userStore = useUserStore()

// Suspension state. `is_active === false` only — a missing column (an
// un-migrated database) must read as ACTIVE, or every user would see the
// banner.
const isSuspended = computed(() => userStore.profile?.is_active === false)
const suspensionReason = computed(() => userStore.profile?.suspension_reason || '')

// A transient profile-fetch failure (timeout / network / unreadable row) no
// longer silently downgrades the user to general_user — the store keeps the
// last-known role and retries in the background. Surface that state so the user
// understands why some options may be missing rather than assuming their
// account was demoted. Only shown to a signed-in user.
const profileUnavailable = computed(
  () => userStore.isAuthenticated && userStore.profileFetchFailed,
)

const showHeader = computed(() => {
  // Don't show header on auth pages
  return !['login', 'register', 'role-application'].includes(route.name)
})

// The sidebar is the signed-in navigation. Guests keep the header nav and the
// full-width marketing layout, and auth pages stay chrome-free.
const showSidebar = computed(() => showHeader.value && userStore.isAuthenticated)

const isAppReady = computed(() => {
  const userStore = useUserStore()
  // Only show loading screen during initial load, not on subsequent session checks
  return isInitialized.value || !userStore.loading
})

// Initialize stores and auth inside onMounted to avoid Pinia issues
onMounted(async () => {
  try {
    console.log('🚀 Initializing Carbonify app...')

    // Initialize stores after component is mounted
    const preferencesStore = usePreferencesStore()
    const userStore = useUserStore()
    // const errorStore = useErrorStore() // Temporarily disabled

    // Apply initial theme
    preferencesStore.applyTheme()
    preferencesStore.applyAccessibilitySettings()

    // Initialize auth after stores are ready with timeout
    const supabase = getSupabase()
    if (supabase) {
      console.log('🔐 Setting up auth state listener...')

      // Keep session in sync with auth state changes (email confirm, sign in/out in other tabs)
      supabase.auth.onAuthStateChange(async (event, session) => {
        try {
          console.log('🔄 Auth state change:', event, session ? 'has session' : 'no session')

          if (event === 'SIGNED_OUT') {
            userStore.session = null
            userStore.profile = null
            userStore.role = 'general_user'
            userStore.permissions = []
            userStore.loading = false
            return
          }

          // If we have a session from the event, use it directly instead of fetching
          if (session && session.user) {
            console.log('✅ Using session from auth state change event')
            userStore.session = session
            userStore.loading = false
            // Fetch profile in background (don't await)
            userStore.fetchUserProfile().catch((err) => {
              console.error('Profile fetch failed:', err)
            })
            return
          }

          // If no session in event, try to fetch it (but don't clear on timeout)
          // Add timeout to prevent hanging (increased to 15 seconds for slower connections)
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Auth state change timeout')), 15000),
          )

          // Don't show loading screen when refreshing session in background
          await Promise.race([userStore.fetchSession(false), timeoutPromise])
        } catch (error) {
          console.error('Error in auth state change:', error)
          // IMPORTANT: Don't clear session on timeout - session might still be valid
          // Only clear if we explicitly got a sign out event or no session
          // Check if we still have a valid session in storage before clearing
          try {
            const {
              data: { session: storedSession },
            } = await supabase.auth.getSession()
            if (storedSession && storedSession.user) {
              console.log('✅ Session still valid in storage, keeping it')
              userStore.session = storedSession
              userStore.loading = false
              return
            }
          } catch (checkError) {
            console.error('Error checking stored session:', checkError)
          }

          // Only clear if we really don't have a session
          if (event === 'SIGNED_OUT' || !session) {
            console.log('⚠️ Sign out event or no session, clearing...')
            userStore.session = null
            userStore.loading = false
          } else {
            console.log('⚠️ Timeout but session might still be valid, keeping current session')
            userStore.loading = false
          }
        }
      })

      // Initial session fetch with timeout - only if session not already loaded
      // Router guard may have already fetched it, so check first
      if (!userStore.session && !userStore.loading) {
        try {
          console.log('📡 Fetching initial session in App.vue...')
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Initial session fetch timeout')), 10000),
          )

          await Promise.race([userStore.fetchSession(), timeoutPromise])
          console.log('✅ Initial session fetch completed')

          // If we have a valid session, log it for debugging
          if (userStore.isAuthenticated) {
            console.log('✅ User is authenticated:', userStore.session.user.email)
            console.log(
              '✅ Session expires at:',
              new Date(userStore.session.expires_at * 1000).toLocaleString(),
            )
          } else {
            console.log('ℹ️ No active session found')
          }
        } catch (error) {
          console.error('Initial session fetch failed:', error)
          // Continue without session - app should still work
          userStore.loading = false
        }
      } else {
        // Session already loaded (by router guard) or currently loading
        console.log(
          userStore.session
            ? '✅ Session already loaded from router guard'
            : '⏳ Session fetch already in progress',
        )
      }
    } else {
      // Supabase errors are already logged in supabaseClient
      // Only show this if it's a different issue
      userStore.loading = false
    }

    // Mark app as initialized so loading screen won't show on tab switches
    isInitialized.value = true
    console.log('✅ App initialization completed')
  } catch (error) {
    console.error('❌ Failed to initialize app:', error)
    // Ensure loading state is cleared even on error
    const userStore = useUserStore()
    userStore.loading = false
    // Still mark as initialized to prevent stuck loading screen
    isInitialized.value = true
  }
})
</script>

<template>
  <ErrorBoundary>
    <!-- Loading Screen -->
    <div v-if="!isAppReady" class="loading-screen">
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <h2>Loading Carbonify...</h2>
        <p>Please wait while we initialize your session</p>
      </div>
    </div>

    <!-- Main App -->
    <div v-else>
      <Header v-if="showHeader" />

      <!-- App shell. Signed-in users navigate from the sidebar; signed-out
           visitors get the full-width marketing layout with the header nav. -->
      <div class="app-body">
        <AppSidebar v-if="showSidebar" />

        <div class="app-main">
          <!-- A suspended account is blocked at the database, so without this
               the user would only discover their state as an unexplained
               failure part way through a purchase. It says what still works,
               because the things that still work are the ones they may
               urgently need. -->
          <div v-if="isSuspended" class="suspension-banner" role="alert">
            <span class="material-symbols-outlined" aria-hidden="true">block</span>
            <div>
              <strong>Your account is suspended.</strong>
              You cannot buy, sell, retire credits or submit projects.
              <template v-if="suspensionReason"> Reason: {{ suspensionReason }}.</template>
              You can still view your receipts and certificates, and export your data. Contact
              support if you believe this is an error.
            </div>
          </div>

          <!-- Shown when the latest profile load failed transiently. The store
               preserves the last-known role and retries in the background, so
               this is informational, not a block: it explains a possibly-stale
               view rather than announcing a downgrade that no longer happens. -->
          <div v-if="profileUnavailable" class="profile-stale-banner" role="status">
            <span class="material-symbols-outlined" aria-hidden="true">sync_problem</span>
            <div>
              <strong>We couldn't load your latest profile.</strong>
              You're still signed in and we're retrying automatically. Some options may be
              temporarily limited until it loads — refresh if this persists.
            </div>
          </div>

          <router-view />
        </div>
      </div>

      <!-- First-run guided walkthrough; self-gates on auth + first visit. -->
      <WelcomeTour v-if="isAppReady" />

      <!-- Footer -->
      <footer v-if="showHeader" class="app-footer">
        <div class="footer-container">
          <p class="footer-copy">
            &copy; {{ new Date().getFullYear() }} Carbonify. All rights reserved.
          </p>
          <div class="footer-links">
            <button type="button" class="footer-link" @click="activePolicy = 'terms'">
              Terms &amp; Conditions
            </button>
            <span class="footer-sep">·</span>
            <button type="button" class="footer-link" @click="activePolicy = 'privacy'">
              Privacy Policy
            </button>
            <span class="footer-sep">·</span>
            <button type="button" class="footer-link" @click="activePolicy = 'carbon'">
              Carbon Credits Policy
            </button>
          </div>
        </div>
      </footer>

      <!-- Legal / Policy Modal — split into Terms, Privacy, and Carbon Credits.
           Content mirrors docs/POLICY_AND_USER_AGREEMENT.md. -->
      <div v-if="activePolicy" class="policy-modal-overlay" @click.self="activePolicy = null">
        <div class="policy-modal">
          <div class="policy-modal-top">
            <h2>
              {{
                activePolicy === 'terms'
                  ? 'Terms & Conditions'
                  : activePolicy === 'privacy'
                    ? 'Privacy Policy'
                    : 'Carbon Credits Policy'
              }}
            </h2>
            <button type="button" class="policy-close-btn" @click="activePolicy = null">
              <span class="material-symbols-outlined">close</span>
            </button>
          </div>

          <!-- Tab switcher between the three documents -->
          <div class="policy-tabs">
            <button
              v-for="tab in policyTabs"
              :key="tab.id"
              type="button"
              :class="['policy-tab', { active: activePolicy === tab.id }]"
              @click="activePolicy = tab.id"
            >
              {{ tab.label }}
            </button>
          </div>

          <div class="policy-modal-body">
            <!-- Shared beta status notice. Controls over any conflicting term below while the
                 closed beta runs. MUST stay in sync with docs/POLICY_AND_USER_AGREEMENT.md §0. -->
            <div class="policy-notice">
              <strong
                ><span
                  class="material-symbols-outlined"
                  aria-hidden="true"
                  style="font-size: 1.1em; vertical-align: middle"
                  >warning</span
                >
                Platform status — please read.</strong
              >
              Carbonify is operating a <strong>closed commercial beta</strong>. The platform is
              feature-complete and its money path is server-authoritative, RLS-locked and
              reconciled, but two limits apply during the beta and you must read them before you
              transact. <strong>First:</strong> credits are issued by Carbonify's own MRV and
              verification workflow using published, IPCC-style emission factors. They are
              <strong>not yet</strong> registered with or retired against an external registry
              (Verra/VCS, Gold Standard, CAR, ACR), so they <strong>must not</strong> be used for
              regulatory compliance, official offset claims, statutory ESG disclosure, or resale as
              registry-backed instruments. <strong>Second:</strong> payments run against PayMongo in
              <strong>test mode</strong> — no real funds are captured or settled until we announce
              live status. Carbonify is not a licensed financial institution, payment service
              provider, e-money issuer, or investment adviser, and nothing here is financial,
              investment, tax, or legal advice. While the beta is running, this notice controls over
              any conflicting term below.
            </div>

            <!-- ── TERMS & CONDITIONS ── -->
            <template v-if="activePolicy === 'terms'">
              <section class="policy-section">
                <h3>1. Acceptance</h3>
                <p>
                  By creating an account or using Carbonify, you agree to these Terms, the Privacy
                  Policy, and the Carbon Credits Policy. If you do not agree, do not use the
                  platform.
                </p>
              </section>
              <section class="policy-section">
                <h3>2. Eligibility &amp; Accounts</h3>
                <ul>
                  <li>You must be of legal age and capacity in your jurisdiction.</li>
                  <li>
                    Provide accurate registration, KYC, and (for sellers) KYB information, and keep
                    it current.
                  </li>
                  <li>
                    You are responsible for safeguarding your credentials. Two-factor authentication
                    (TOTP) is supported and is <strong>required at step-up</strong> for sensitive
                    actions.
                  </li>
                  <li>
                    One person or entity per account unless expressly permitted. Misuse may result
                    in suspension.
                  </li>
                  <li>
                    <strong>Email confirmation:</strong> during the beta, email verification may be
                    disabled — you are responsible for registering an address you control. Account
                    recovery and notices route through that address.
                  </li>
                </ul>
              </section>
              <section class="policy-section">
                <h3>3. Roles &amp; Permitted Use</h3>
                <p>
                  Carbonify supports seven roles — general user, buyer/investor, project developer,
                  verifier, LGU user, farmer, and administrator. You may use only the functions
                  granted to your role; this is enforced by route guards <em>and</em> by database
                  Row-Level Security, not by the interface alone. Developer, verifier, and farmer
                  applications are subject to review and approval, and remain restricted until
                  approved.
                </p>
              </section>
              <section class="policy-section">
                <h3>4. Marketplace &amp; Transactions</h3>
                <ul>
                  <li>Credits must be verified and issued in-platform before listing.</li>
                  <li>
                    The purchase amount is computed server-side from the listing price — you confirm
                    quantity, not price. The browser never dictates the amount charged.
                  </li>
                  <li>
                    <strong>A seller may not buy their own listing.</strong> Wash trading is blocked
                    in the settlement process itself, not just discouraged.
                  </li>
                  <li>
                    <strong>All sales are final once payment is confirmed</strong>, except as
                    provided in the Refunds &amp; Disputes section.
                  </li>
                  <li>Market manipulation and collusive pricing are prohibited.</li>
                </ul>
              </section>
              <section class="policy-section">
                <h3>5. Seller Payouts</h3>
                <p>
                  Seller earnings are released through a tracked payout process (requested →
                  processing → settled/failed). A <strong>hold period applies by payment method</strong>:
                  proceeds from <strong>card</strong> purchases are held in escrow for a configurable
                  window (currently 7 days) so a fraudulent or disputed card payment can be reversed
                  before funds leave the platform, while <strong>GCash, Maya and wallet</strong>
                  purchases — which cannot be charged back — are released immediately. Your Seller
                  Earnings page shows <strong>Held</strong> and <strong>Available</strong> separately.
                  Funds are not released while a dispute on the transaction is open.
                  <strong>Payouts require completed KYB.</strong> You are responsible for the taxes
                  applicable to your earnings.
                </p>
              </section>
              <section class="policy-section">
                <h3>6. Refunds &amp; Disputes</h3>
                <p>
                  Refunds are issued only for <strong>verified technical errors</strong>, within any
                  stated window. Refunds and disputes are handled via compensating ledger entries —
                  original records are never altered, so the audit trail stays intact. You can raise
                  a dispute from your order history; administrators resolve it through a tracked
                  workflow, and a refund on a still-held sale reverses the escrow hold rather than
                  clawing back settled funds.
                </p>
              </section>
              <section class="policy-section">
                <h3>7. Prohibited Conduct</h3>
                <p>
                  No fraud, money laundering, double-counting or double-claiming of credits,
                  circumvention of KYC/KYB, scraping or abuse, reverse engineering of security
                  controls, or uploading false project evidence.
                </p>
              </section>
              <section class="policy-section">
                <h3>8. Suspension &amp; Termination</h3>
                <p>
                  We may suspend or terminate accounts for breach, suspected fraud, or legal
                  requirement. Records are retained for audit and compliance.
                </p>
              </section>
              <section class="policy-section">
                <h3>9. Liability &amp; Warranty</h3>
                <p>
                  Carbonify is provided
                  <strong>"as is" and "as available," without warranties</strong>. To the maximum
                  extent permitted by law, Carbonify and its operators are not liable for indirect
                  or consequential losses, nor for losses arising from the beta limitations
                  disclosed in the platform status notice above — specifically that credits are not
                  yet registry-backed and that payments run in test mode.
                </p>
              </section>
              <section class="policy-section">
                <h3>10. Changes</h3>
                <p>
                  We may update these Terms; material changes will be notified in-app and/or by
                  email. Continued use after the effective date constitutes acceptance.
                </p>
              </section>
            </template>

            <!-- ── PRIVACY POLICY ── -->
            <template v-else-if="activePolicy === 'privacy'">
              <section class="policy-section">
                <h3>1. Data We Collect</h3>
                <ul>
                  <li>
                    <strong>Account &amp; profile:</strong> name, email, role, organization details.
                  </li>
                  <li>
                    <strong>Identity verification:</strong> KYC (and KYB for sellers) documents and
                    status.
                  </li>
                  <li>
                    <strong>Transactional:</strong> purchases, listings, wallet/payout activity,
                    certificates, audit-log events.
                  </li>
                  <li>
                    <strong>Project &amp; MRV:</strong> submissions, uploaded documents, monitoring
                    reports and evidence.
                  </li>
                  <li>
                    <strong>Technical:</strong> authentication/session data, basic usage and
                    device/log data.
                  </li>
                </ul>
              </section>
              <section class="policy-section">
                <h3>2. How We Use It</h3>
                <p>
                  To operate accounts and roles, process verification and transactions, issue and
                  verify certificates, maintain an audit trail, secure the platform, and meet legal
                  and regulatory obligations.
                </p>
              </section>
              <section class="policy-section">
                <h3>3. Storage &amp; Security</h3>
                <p>
                  Data is stored in <strong>Supabase (PostgreSQL)</strong> protected by Row-Level
                  Security, with MFA, role-based access control, and audit logging. KYC/KYB
                  documents are held in restricted storage. Data in transit is protected with TLS.
                </p>
              </section>
              <section class="policy-section">
                <h3>4. Sharing</h3>
                <p>
                  We <strong>do not sell</strong> personal data. We share only with service
                  providers necessary to operate the platform (e.g., the payment gateway) or where
                  required by law.
                </p>
              </section>
              <section class="policy-section">
                <h3>5. Your Rights (Data Privacy Act of 2012 / RA 10173)</h3>
                <p>
                  You may request access to, correction of, or deletion of your personal data, and
                  may withdraw consent, subject to legal retention requirements.
                  <strong>Self-service data export and account deletion are available</strong> from
                  your account settings, and requests are tracked in an administrative queue. A
                  formally appointed Data Protection Officer and NPC registration are part of our
                  compliance track and are <strong>not yet in place</strong>; in the meantime,
                  privacy requests can also be sent to <strong>support@carbonify.com</strong>.
                </p>
              </section>
              <section class="policy-section">
                <h3>6. Retention</h3>
                <p>
                  Financial, audit, and compliance records are retained for the period required by
                  applicable law; other data is retained while your account is active.
                </p>
              </section>
            </template>

            <!-- ── CARBON CREDITS POLICY ── -->
            <template v-else>
              <section class="policy-section">
                <h3>1. Definition</h3>
                <p>
                  On Carbonify, <strong>1 credit = 1 metric tonne CO₂e</strong> reduced or removed.
                </p>
              </section>
              <section class="policy-section">
                <h3>2. Current Nature of Credits — important</h3>
                <p>
                  Credits are presently
                  <strong
                    >generated and tracked within Carbonify's own MRV and issuance system</strong
                  >
                  using simplified, IPCC-style emission factors. They are
                  <strong>not</strong> currently registered with or retired against an external
                  registry (Verra/VCS, Gold Standard, CAR, ACR), are <strong>not</strong> validated
                  by an accredited third-party validation/verification body (Carbonify uses an
                  internal verifier role), and are <strong>not</strong> based on accredited,
                  peer-reviewed methodologies.
                  <strong
                    >Carbonify credits are therefore not, at this stage, recognized real-world
                    carbon offsets and must not be represented as such.</strong
                  >
                </p>
              </section>
              <section class="policy-section">
                <h3>3. Issuance &amp; Integrity</h3>
                <ul>
                  <li>
                    Credits are minted <strong>only on verifier approval</strong> of a monitoring
                    report.
                  </li>
                  <li>
                    Each unit carries a
                    <strong
                      >unique serial number, a QR code, and a SHA-256 tamper-evident
                      signature</strong
                    >, verifiable on a public certificate page.
                  </li>
                  <li>
                    <strong>Retirement is permanent</strong> — retired credits cannot be traded,
                    resold, or reused; anti-double-counting is enforced.
                  </li>
                </ul>
              </section>
              <section class="policy-section">
                <h3>4. Developer Obligations</h3>
                <p>
                  Developers must use the platform's approved project types and methodologies,
                  submit required documents, and provide periodic monitoring. Non-compliance may
                  result in delisting.
                </p>
              </section>
              <section class="policy-section">
                <h3>5. Fees</h3>
                <p>
                  Platform fees are displayed at checkout.
                  <strong>The platform fee is currently 0</strong> while the fee model is finalized;
                  this may change with notice.
                </p>
              </section>
            </template>
          </div>

          <div class="policy-modal-footer">
            <p class="policy-footer-info">
              Last updated: June 2026 · support@carbonify.com · Working draft, pending legal &amp;
              DPO review.
            </p>
            <button class="policy-accept-btn" @click="activePolicy = null">
              I Understand &amp; Accept
            </button>
          </div>
        </div>
      </div>

      <!-- Global Toast Notifications -->
      <div id="toast-container" class="toast-container"></div>
    </div>
  </ErrorBoundary>
</template>

<style>
/* Loading Screen Styles */
.loading-screen {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #f0f9f0 0%, #e8f5e8 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.loading-content {
  text-align: center;
  color: #374151;
}

.loading-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid #e5e7eb;
  border-top: 4px solid var(--primary-color, #058526);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

.loading-content h2 {
  margin: 0 0 0.5rem 0;
  font-size: 1.5rem;
  font-weight: 600;
  color: #1f2937;
}

.loading-content p {
  margin: 0;
  color: #6b7280;
  font-size: 0.875rem;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

/* Design tokens (:root) now live in src/styles/tokens.css, imported by
   main.js. They were here, inside a component, while src/styles/ held a
   never-imported decoy stylesheet. */

html,
body,
#app {
  height: 100%;
}

body {
  margin: 0;
  font-family: var(--font-family);
  font-size: var(--font-size-base);
  line-height: 1.5;
  font-optical-sizing: auto;
  font-variation-settings: 'wdth' 100;
  color: var(--text-primary);
  background: linear-gradient(135deg, var(--bg-primary) 0%, var(--bg-secondary) 100%);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.auth-layout {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  background: linear-gradient(135deg, var(--primary-light) 0%, var(--bg-primary) 50%, #f0f8f0 100%);
}

/* Mobile auth layout */
@media (max-width: 768px) {
  .auth-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
}

.auth-hero {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-2xl);
  background: linear-gradient(
    135deg,
    var(--primary-color) 0%,
    var(--primary-hover) 50%,
    var(--primary-dark) 100%
  );
  color: white;
  position: relative;
  overflow: hidden;
}

/* Mobile auth hero */
@media (max-width: 768px) {
  .auth-hero {
    padding: var(--spacing-lg);
    min-height: 200px;
  }
}

.auth-hero::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grain" width="100" height="100" patternUnits="userSpaceOnUse"><circle cx="25" cy="25" r="1" fill="white" opacity="0.1"/><circle cx="75" cy="75" r="1" fill="white" opacity="0.1"/><circle cx="50" cy="10" r="0.5" fill="white" opacity="0.1"/><circle cx="10" cy="60" r="0.5" fill="white" opacity="0.1"/><circle cx="90" cy="40" r="0.5" fill="white" opacity="0.1"/></pattern></defs><rect width="100" height="100" fill="url(%23grain)"/></svg>');
  opacity: 0.3;
}

.hero-card {
  max-width: 32rem;
  position: relative;
}

/* Mobile hero card */
@media (max-width: 768px) {
  .hero-card {
    max-width: 100%;
    text-align: center;
  }
}

/* Auth panel mobile styles */
@media (max-width: 768px) {
  .auth-panel {
    padding: var(--spacing-md);
  }

  .panel-card {
    padding: var(--spacing-lg);
    margin: 0;
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  .panel-header {
    text-align: center;
    margin-bottom: var(--spacing-lg);
  }

  .panel-title {
    font-size: var(--font-size-2xl);
    margin-bottom: var(--spacing-sm);
  }

  .panel-desc {
    font-size: var(--font-size-base);
  }
}

/* Global mobile utility classes */
.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-lg);
}

@media (max-width: 768px) {
  .container {
    padding: 0 var(--spacing-md);
  }
}

@media (max-width: 480px) {
  .container {
    padding: 0 var(--spacing-sm);
  }
}

/* Mobile-first responsive text */
.text-responsive {
  font-size: clamp(0.875rem, 2.5vw, 1.125rem);
}

.title-responsive {
  font-size: clamp(1.5rem, 5vw, 2.5rem);
}

/* Touch-friendly buttons */
.btn-touch {
  min-height: 44px;
  min-width: 44px;
  padding: 0.75rem 1rem;
}

@media (max-width: 768px) {
  .btn-touch {
    min-height: 48px;
    padding: 0.875rem 1.25rem;
  }
}

/* Hide on mobile */
.hide-mobile {
  display: block;
}

@media (max-width: 768px) {
  .hide-mobile {
    display: none;
  }
}

/* Show only on mobile */
.show-mobile {
  display: none;
}

@media (max-width: 768px) {
  .show-mobile {
    display: block;
  }
}

.brand {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 2rem;
}

.brand-badge {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.1));
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: var(--shadow-lg);
}

/* Auth Logo Styles */
.auth-logo {
  position: relative;
  width: 2rem;
  height: 1.5rem;
}

.auth-logo-cloud {
  position: relative;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, rgba(144, 238, 144, 0.8) 0%, rgba(34, 139, 34, 0.8) 100%);
  border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.auth-logo-buildings {
  position: absolute;
  bottom: 0.15rem;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 0.1rem;
}

.auth-building {
  background: rgba(0, 100, 0, 0.8);
  border-radius: 0.08rem 0.08rem 0 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.08rem 0.04rem 0.04rem 0.04rem;
  gap: 0.04rem;
}

.auth-building-left {
  width: 0.3rem;
  height: 0.6rem;
}

.auth-building-right {
  width: 0.25rem;
  height: 0.45rem;
}

.auth-window {
  width: 0.06rem;
  height: 0.06rem;
  background: rgba(144, 238, 144, 0.8);
  border-radius: 0.015rem;
}

.auth-logo-leaf {
  position: absolute;
  bottom: -0.08rem;
  left: 0.08rem;
  width: 0.25rem;
  height: 0.3rem;
  background: linear-gradient(45deg, rgba(144, 238, 144, 0.8) 0%, rgba(34, 139, 34, 0.8) 100%);
  border-radius: 0 100% 0 100%;
  transform: rotate(-45deg);
}

.auth-logo-leaf::before {
  content: '';
  position: absolute;
  top: 0.2rem;
  left: 0.08rem;
  width: 0.04rem;
  height: 0.12rem;
  background: rgba(34, 139, 34, 0.8);
  border-radius: 0.02rem;
}

.auth-sparkles {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.auth-sparkle {
  position: absolute;
  background: rgba(144, 238, 144, 0.6);
  border-radius: 50%;
  animation: authSparkle 2s ease-in-out infinite;
}

.auth-sparkle-1 {
  width: 0.06rem;
  height: 0.06rem;
  top: 0.15rem;
  right: 0.25rem;
  animation-delay: 0s;
}

.auth-sparkle-2 {
  width: 0.05rem;
  height: 0.05rem;
  top: 0.3rem;
  left: 0.15rem;
  animation-delay: 0.5s;
}

.auth-sparkle-3 {
  width: 0.04rem;
  height: 0.04rem;
  top: 0.08rem;
  left: 0.3rem;
  animation-delay: 1s;
}

.auth-sparkle-4 {
  width: 0.05rem;
  height: 0.05rem;
  top: 0.35rem;
  right: 0.08rem;
  animation-delay: 1.5s;
}

@keyframes authSparkle {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.2);
  }
}

.brand-initials {
  font-weight: 700;
  font-size: var(--font-size-lg);
  letter-spacing: 0.05em;
}

.brand-title {
  margin: 0;
  font-size: var(--font-size-4xl);
  line-height: 1.1;
  font-weight: 800;
  letter-spacing: -0.025em;
}

.brand-subtitle {
  margin: 0.75rem 0 0 0;
  font-size: var(--font-size-lg);
  opacity: 0.9;
  font-weight: 400;
  line-height: 1.5;
}

.auth-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-2xl) var(--spacing-xl);
  background: var(--bg-primary);
}

.panel-card {
  width: 100%;
  max-width: 28rem;
  background: var(--bg-primary);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  border: 1px solid var(--border-color);
  overflow: hidden;
  backdrop-filter: blur(10px);
}

.panel-header {
  padding: var(--spacing-xl) var(--spacing-xl) 0 var(--spacing-xl);
  text-align: center;
}

.panel-title {
  margin: 0 0 var(--spacing-sm) 0;
  font-size: var(--font-size-3xl);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.025em;
}

.panel-desc {
  margin: 0 0 var(--spacing-lg) 0;
  color: var(--text-muted);
  font-size: var(--font-size-base);
  line-height: 1.5;
}

.panel-body {
  padding: 0 var(--spacing-xl) var(--spacing-xl) var(--spacing-xl);
}

.form-grid {
  display: grid;
  gap: var(--spacing-lg);
}

.input {
  display: grid;
  gap: var(--spacing-sm);
}

.input label {
  font-weight: 600;
  font-size: var(--font-size-sm);
  color: var(--text-primary);
  letter-spacing: 0.025em;
}

.input input,
.input select,
.input textarea {
  width: 100%;
  padding: 0.875rem var(--spacing-md);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  background: var(--bg-muted);
  outline: none;
  font-size: var(--font-size-base);
  color: var(--text-primary);
  transition: var(--transition);
  box-shadow: var(--shadow-sm);
}

.input input:focus,
.input select:focus,
.input textarea:focus {
  border-color: var(--primary-color);
  box-shadow:
    0 0 0 3px rgba(5, 133, 38, 0.1),
    var(--shadow-md);
  background: var(--bg-primary);
}

.input input::placeholder,
.input textarea::placeholder {
  color: var(--text-muted);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-sm);
  padding: 0.875rem var(--spacing-lg);
  border: 0;
  border-radius: var(--radius-lg);
  cursor: pointer;
  font-weight: 600;
  font-size: var(--font-size-base);
  text-decoration: none;
  transition: var(--transition);
  position: relative;
  overflow: hidden;
}

.btn:active {
  transform: translateY(1px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-primary {
  background: var(--primary-color);
  color: white;
  box-shadow: var(--shadow-md);
  border: 1px solid var(--primary-color);
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
  box-shadow: var(--shadow-lg);
  transform: translateY(-1px);
}

.btn-ghost {
  background: transparent;
  color: var(--primary-color);
  border: 1px solid var(--border-color);
}

.btn-ghost:hover:not(:disabled) {
  background: var(--primary-light);
  border-color: var(--primary-color);
  color: var(--primary-hover);
}

.muted-link {
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 600;
  font-size: var(--font-size-sm);
  transition: var(--transition);
}

.muted-link:hover {
  color: var(--primary-hover);
  text-decoration: underline;
}

/* Responsive Design */
@media (max-width: 1024px) {
  .auth-layout {
    grid-template-columns: 1fr;
  }

  .auth-hero {
    min-height: 20rem;
    padding: var(--spacing-xl);
  }

  .hero-card {
    max-width: 100%;
  }

  .brand-title {
    font-size: var(--font-size-3xl);
  }

  .brand-subtitle {
    font-size: var(--font-size-base);
  }
}

@media (max-width: 640px) {
  .auth-hero {
    padding: var(--spacing-lg);
    min-height: 16rem;
  }

  .auth-panel {
    padding: var(--spacing-lg) var(--spacing-md);
  }

  .panel-card {
    max-width: 100%;
  }

  .panel-header {
    padding: var(--spacing-lg) var(--spacing-lg) 0 var(--spacing-lg);
  }

  .panel-body {
    padding: 0 var(--spacing-lg) var(--spacing-lg) var(--spacing-lg);
  }

  .brand {
    flex-direction: column;
    text-align: center;
    gap: 0.75rem;
  }

  .brand-title {
    font-size: var(--font-size-2xl);
  }

  .panel-title {
    font-size: var(--font-size-2xl);
  }
}

/* Toast Container */
.toast-container {
  position: fixed;
  top: 1rem;
  right: 1rem;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 350px;
}

/* ── Footer ── */
/* App shell ---------------------------------------------------------------
   The sidebar is a flex sibling of the page content rather than a fixed
   overlay, so page content is never hidden underneath it and every view keeps
   working with its own container width. */
.app-body {
  display: flex;
  align-items: flex-start;
}

.app-main {
  /* min-width:0 is load-bearing: without it a flex child refuses to shrink
     below its content, and any wide table or chart pushes the whole page into
     a horizontal scroll instead of scrolling inside its own container. */
  flex: 1;
  min-width: 0;
}

.app-footer {
  background: var(--bg-secondary, #f8fdf8);
  border-top: 1px solid var(--border-color, #d1e7dd);
  padding: 1.25rem 1.5rem;
  text-align: center;
}

.footer-container {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.footer-copy {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--text-muted, #64748b);
}

.footer-links {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
  justify-content: center;
}

.footer-link {
  background: none;
  border: none;
  color: var(--primary-color, #058526);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0.15rem 0.25rem;
  border-radius: 0.25rem;
  transition: all 0.2s;
}

.footer-link:hover {
  color: var(--primary-dark, #045c1a);
  text-decoration: underline;
}

.footer-sep {
  color: var(--text-muted, #64748b);
  font-size: 0.75rem;
}

/* ── Policy Modal ── */
.policy-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
  animation: policyFadeIn 0.25s ease;
}

@keyframes policyFadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.policy-modal {
  width: min(720px, 100%);
  max-height: calc(100vh - 3rem);
  background: #fff;
  border-radius: 1rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  animation: policySlideUp 0.3s ease;
  overflow: hidden;
}

@keyframes policySlideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.policy-modal-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border-color, #d1e7dd);
  flex-shrink: 0;
}

.policy-modal-top h2 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 700;
  color: var(--text-primary, #1a1a1a);
}

.policy-close-btn {
  background: var(--bg-secondary, #f8fdf8);
  border: 1px solid var(--border-color, #d1e7dd);
  color: var(--text-muted, #64748b);
  width: 2rem;
  height: 2rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
}

.policy-close-btn:hover {
  background: var(--error-light, #f8d7da);
  color: var(--error-color, #dc3545);
  border-color: var(--error-color, #dc3545);
}

.policy-close-btn .material-symbols-outlined {
  font-size: 1.1rem;
}

.policy-tabs {
  display: flex;
  gap: 0.25rem;
  padding: 0 1.5rem;
  border-bottom: 1px solid #e5e7eb;
  flex-wrap: wrap;
}

.policy-tab {
  border: none;
  background: transparent;
  padding: 0.6rem 0.85rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition:
    color 0.15s ease,
    border-color 0.15s ease;
}

.policy-tab:hover {
  color: var(--primary-color, #058526);
}

.policy-tab.active {
  color: var(--primary-color, #058526);
  border-bottom-color: var(--primary-color, #058526);
}

.policy-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
}

.policy-notice {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  border-radius: 10px;
  padding: 0.85rem 1rem;
  font-size: 0.8rem;
  line-height: 1.55;
  margin-bottom: 1.25rem;
}

.policy-section {
  margin-bottom: 1rem;
  padding-bottom: 0.875rem;
  border-bottom: 1px solid var(--border-light, #e8f5e8);
}

.policy-section:last-of-type {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

.policy-section h3 {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--primary-color, #058526);
  margin: 0 0 0.3rem;
}

.policy-section p {
  color: var(--text-secondary, #4a5568);
  line-height: 1.55;
  margin: 0;
  font-size: 0.8125rem;
}

.policy-section ul {
  margin: 0.35rem 0 0;
  padding-left: 1.25rem;
  list-style: disc;
}

.policy-section ul li {
  color: var(--text-secondary, #4a5568);
  font-size: 0.8125rem;
  line-height: 1.5;
  margin-bottom: 0.2rem;
}

/* Green footer */
.policy-modal-footer {
  padding: 1rem 1.5rem;
  background: var(--primary-color, #058526);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  border-radius: 0 0 1rem 1rem;
}

.policy-footer-info {
  margin: 0;
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.8);
}

.policy-accept-btn {
  padding: 0.6rem 1.75rem;
  background: #fff;
  color: var(--primary-color, #058526);
  border: none;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.policy-accept-btn:hover {
  background: var(--primary-light, #e8f5e8);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

@media (max-width: 768px) {
  .policy-modal {
    border-radius: 0.75rem;
    max-height: calc(100vh - 2rem);
  }
  .policy-modal-top h2 {
    font-size: 1rem;
  }
  .policy-modal-body {
    padding: 1rem;
  }
  .policy-modal-footer {
    flex-direction: column;
    gap: 0.75rem;
    text-align: center;
    border-radius: 0 0 0.75rem 0.75rem;
  }
}

.suspension-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  max-width: 1280px;
  margin: 1rem auto 0;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 0.88rem;
  line-height: 1.5;
}

.suspension-banner .material-symbols-outlined {
  font-size: 1.2rem;
  flex: 0 0 auto;
}

@media (max-width: 1320px) {
  .suspension-banner {
    margin: 1rem 1rem 0;
  }
}

.profile-stale-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  max-width: 1280px;
  margin: 1rem auto 0;
  padding: 0.75rem 1rem;
  border-radius: 10px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: 0.88rem;
  line-height: 1.5;
}

.profile-stale-banner .material-symbols-outlined {
  font-size: 1.2rem;
  flex: 0 0 auto;
}

@media (max-width: 1320px) {
  .profile-stale-banner {
    margin: 1rem 1rem 0;
  }
}
</style>
