/**
 * Single source of truth for the app's navigation.
 *
 * Before this file, the same page could be reached three ways under three
 * different names — the marketplace was "Marketplace" in the top nav and "Buy
 * credits" on the dashboard; the watchlist was "Saved" in the profile menu and
 * "Watchlist" on the dashboard panel. Every destination is now declared once,
 * here, and the three surfaces below compose those declarations:
 *
 *   buildGuestNav()    → the header's top nav. Signed-OUT visitors only.
 *   buildSidebar()     → the app sidebar. Every product feature a signed-in
 *                        role can reach, grouped.
 *   buildAccountMenu() → the avatar dropdown. Things about YOU, nothing else.
 *
 * The split is the point: if it's about your account it's under your face; if
 * it's part of the product it's in the sidebar. Nothing appears in both.
 *
 * buildWorkspace() is the role-specific middle of the sidebar, kept separate
 * because that is the part that differs per role and needs testing on its own.
 */

/**
 * Canonical destinations. A label may only be written here — never inline at a
 * call site — so a page cannot drift into having two names again.
 */
const D = {
  // Product surfaces
  home: { path: '/', label: 'Home' },
  dashboard: { path: '/dashboard', label: 'Dashboard', icon: 'space_dashboard' },
  marketplace: { path: '/marketplace', label: 'Marketplace', icon: 'storefront' },
  biomass: { path: '/biomass', label: 'Biomass', icon: 'compost' },
  registry: { path: '/registry', label: 'Registry', icon: 'inventory_2' },
  map: { path: '/map', label: 'Project Map', icon: 'map' },
  about: { path: '/about', label: 'About', icon: 'info' },

  // Buying
  cart: { path: '/cart', label: 'Cart', icon: 'shopping_cart' },
  watchlist: { path: '/watchlist', label: 'Saved', icon: 'bookmark' },
  calculator: { path: '/carbon-calculator', label: 'Carbon calculator', icon: 'calculate' },

  // Credits
  portfolio: { path: '/credit-portfolio', label: 'Portfolio', icon: 'account_tree' },
  retire: { path: '/retire', label: 'Retire credits', icon: 'eco' },
  certificates: { path: '/certificates', label: 'Certificates', icon: 'verified' },

  // Records
  orders: { path: '/orders', label: 'Orders', icon: 'shopping_bag' },
  receipts: { path: '/receipts', label: 'Receipts', icon: 'receipt_long' },
  disputes: { path: '/disputes', label: 'Reported problems', icon: 'gavel' },

  // Insights
  analytics: { path: '/analytics', label: 'Analytics', icon: 'monitoring' },
  marketPrices: { path: '/market', label: 'Market prices', icon: 'trending_up' },
  // Labelled preview because it is one: the Claude-backed edge function behind
  // /assistant is not built, and the page says so on arrival. The sidebar
  // renders labels only (never HINTS), so without this the only nav entry in
  // the app that leads nowhere looked exactly like the ones that don't.
  assistant: { path: '/assistant', label: 'AI Assistant (preview)', icon: 'smart_toy' },

  // Account
  profile: { path: '/profile', label: 'Profile & settings', icon: 'manage_accounts' },
  preferences: { path: '/preferences', label: 'Preferences', icon: 'display_settings' },
  kyc: { path: '/kyc', label: 'KYC verification', icon: 'verified_user' },
  wallet: { path: '/wallet', label: 'Wallet', icon: 'account_balance_wallet' },
  upgrade: { path: '/upgrade', label: 'Upgrade plan', icon: 'rocket_launch' },

  // Biomass trading
  sellFeedstock: { path: '/biomass/sell', label: 'Sell feedstock', icon: 'compost' },
  feedstockRfqs: { path: '/biomass/rfqs', label: 'Feedstock requests', icon: 'request_quote' },

  // Investor
  investor: { path: '/investor', label: 'Investor Portal', icon: 'trending_up' },

  // Project developer
  devProjects: { path: '/developer/projects', label: 'My Projects', icon: 'space_dashboard' },
  submitProject: { path: '/submit-project', label: 'Submit project', icon: 'add_circle' },
  devLedger: { path: '/developer/ledger', label: 'Carbon Assets', icon: 'account_balance_wallet' },
  devOfftakes: { path: '/developer/offtakes', label: 'Offtake agreements', icon: 'handshake' },
  devDataRoom: { path: '/developer/data-room', label: 'Data room activity', icon: 'visibility' },
  devFees: { path: '/developer/fees', label: 'Project fees', icon: 'receipt_long' },
  // Two distinct pages, deliberately named as a pair: the dashboard is where
  // you see what is due, the reports page is where you file it. /monitoring had
  // no sidebar entry at all and was reachable only by clicking through from a
  // dashboard card — which broke this file's own rule that the sidebar is the
  // complete list of what a role can reach.
  devMrv: { path: '/developer/mrv-dashboard', label: 'MRV dashboard', icon: 'query_stats' },
  devMonitoring: { path: '/monitoring', label: 'Monitoring reports', icon: 'edit_document' },
  sellerEarnings: { path: '/sales', label: 'Seller earnings', icon: 'payments' },

  // Verifier
  verifier: { path: '/verifier', label: 'Verifier Panel', icon: 'fact_check' },

  // LGU
  lgu: { path: '/lgu', label: 'LGU Tools', icon: 'apartment' },

  // Farmer
  farmer: { path: '/farmer', label: 'Farmer Portal', icon: 'agriculture' },

  // Admin
  admin: { path: '/admin', label: 'Admin Dashboard', icon: 'space_dashboard' },
  adminUsers: { path: '/admin/users', label: 'User management', icon: 'group' },
  adminFinance: { path: '/admin/finance', label: 'Finance console', icon: 'account_balance' },
  adminAudit: { path: '/admin/audit-logs', label: 'Audit logs', icon: 'assignment' },
  adminConfig: { path: '/admin/config', label: 'System configuration', icon: 'tune' },
  adminKyc: { path: '/admin/kyc', label: 'KYC review', icon: 'badge' },
  adminKyb: { path: '/admin/kyb', label: 'KYB review', icon: 'verified_user' },
  adminAml: { path: '/admin/aml', label: 'AML screening', icon: 'gpp_maybe' },
  adminPrivacy: { path: '/admin/privacy', label: 'Privacy requests', icon: 'privacy_tip' },
  adminRefunds: { path: '/admin/refunds', label: 'Refunds & disputes', icon: 'currency_exchange' },
  adminFeedstock: { path: '/admin/feedstock', label: 'Feedstock oversight', icon: 'agriculture' },
  adminRoles: { path: '/admin/role-applications', label: 'Role applications', icon: 'how_to_reg' },
  adminApiKeys: { path: '/admin/api-keys', label: 'White-label API', icon: 'key' },
}

/** Short blurbs, used only by the card layout of the workspace directory. */
const HINTS = {
  '/preferences': 'Theme, accessibility, language',
  '/marketplace': 'Browse and buy verified credits',
  '/cart': 'Finish a checkout you started',
  '/watchlist': 'Listings you saved to track',
  '/carbon-calculator': 'Work out how much to offset',
  '/credit-portfolio': 'Everything you own, plus ESG export',
  '/retire': 'Claim an offset permanently',
  '/certificates': 'Proof of retirement to share',
  '/orders': 'Track and complete purchases',
  '/receipts': 'Tax and accounting records',
  '/disputes': 'Problems you have reported',
  '/analytics': 'Trends across your activity',
  '/market': 'Live pricing across the market',
  '/assistant': 'Interface preview — not connected yet',
  '/biomass/rfqs': 'Buyers looking for feedstock',
  '/biomass/sell': 'List feedstock for sale',
  '/investor': 'Deal flow and project financing',
  '/developer/projects': 'Every project you have submitted',
  '/submit-project': 'Start a new carbon project',
  '/developer/ledger': 'Credits issued and inventory',
  '/developer/offtakes': 'Forward sale agreements',
  '/developer/data-room': 'Who viewed your documents',
  '/developer/fees': 'Onboarding and verification charges',
  '/developer/mrv-dashboard': 'What is due, and what you have filed',
  '/monitoring': 'File and revise monitoring reports',
  '/sales': 'Earnings, escrow and withdrawals',
  '/admin/users': 'Accounts, roles and permissions',
  '/admin/finance': 'Sales, fees, payouts, reconciliation',
  '/admin/audit-logs': 'System activity and user actions',
  '/admin/config': 'Fees, KYC tiers, emission factors',
  '/admin/api-keys': 'Partner tenants, keys and rate limits',
  '/admin/kyc': 'Approve identity verification',
  '/admin/kyb': 'Approve business verification',
  '/admin/aml': 'Sanctions and watchlist screening',
  '/admin/privacy': 'Data export and erasure requests',
  '/admin/refunds': 'Refund and dispute resolution',
  '/admin/feedstock': 'Farmer deliveries and payment disputes',
  '/admin/role-applications': 'Verifier and developer applicants',
}

function withHint(destination) {
  return { ...destination, hint: HINTS[destination.path] || '' }
}

function group(title, destinations) {
  return { title, items: destinations.map(withHint) }
}

/**
 * A "buyer" is anyone whose job here is to purchase credits. They're the only
 * roles that get /dashboard, a cart, and the buying-side workspace.
 */
export function isBuyerRole(user) {
  // LGU users count. They were excluded here while every other part of the app
  // treated them as buyers — the router lets them reach /cart, /wallet and the
  // whole checkout path, /kyc is open to them "to move money", and /analytics
  // shows them a Buying tab. This function decided their sidebar and their
  // wallet entry, so it was the single place making the contradiction visible.
  return !(user.isAdmin || user.isVerifier || user.isProjectDeveloper || user.isFarmer)
}

/** The route each role lands on — and the first item in its top nav. */
export function homeDestination(user) {
  if (!user.isAuthenticated) return D.home
  if (user.isAdmin) return D.admin
  if (user.isVerifier) return D.verifier
  if (user.isProjectDeveloper) return D.devProjects
  if (user.isLguUser) return D.lgu
  if (user.isFarmer) return D.farmer
  return D.dashboard
}

/**
 * Header nav for signed-out visitors. Signed-in users navigate from the
 * sidebar, so the header carries no links for them at all — a header nav plus
 * a sidebar is two menus competing to be the place you look.
 */
export function buildGuestNav() {
  return [D.home, D.marketplace, D.biomass, D.registry, D.about]
}

/**
 * The public surfaces every signed-in role can browse. Farmers sell feedstock
 * rather than trade credits, so biomass leads for them.
 */
function exploreGroup(user) {
  if (user.isFarmer) return group('Explore', [D.biomass, D.marketplace, D.registry, D.map])
  return group('Explore', [D.marketplace, D.biomass, D.registry, D.map])
}

/**
 * The full sidebar. The top is a fixed two-part block that is the same for
 * every role — the role's own landing page (Dashboard), then the shared
 * Explore group (marketplace, biomass, registry, map) — followed by the
 * role-specific workspace, which is the part that differs between roles. This
 * is the complete list of every product feature the role can reach, which is
 * exactly what makes it possible to say "if it's a feature, it's in the
 * sidebar" and have that be true.
 *
 * Keeping Dashboard + Explore pinned to the top in that order means the first
 * two things every user sees are in the same place regardless of role; only
 * what comes after changes. The landing page sits in a deliberately untitled
 * group — a lone "Dashboard" link under a heading reads as a category with one
 * thing in it.
 */
export function buildSidebar(user, { cartCount = 0 } = {}) {
  if (!user.isAuthenticated) return []

  return [
    { title: '', items: [withHint(homeDestination(user))] },
    exploreGroup(user),
    ...buildWorkspace(user, { cartCount }),
  ]
}

/**
 * Avatar dropdown — your account, and nothing else. Six items at most, so it
 * never needs to scroll. Product features that used to live here now live in
 * buildWorkspace(), rendered on the dashboard.
 */
export function buildAccountMenu(user) {
  if (!user.isAuthenticated) return []

  // Preferences applies to every role: App.vue applies the theme and the
  // accessibility settings (high contrast, large text) from preferencesStore on
  // mount, and /preferences is the only screen that can change them. The page
  // existed and worked but nothing linked to it, so those settings were
  // unreachable outside of typing the URL.
  const items = [D.profile, D.preferences]

  // Admins and verifiers don't buy, so identity/funding/plan don't apply.
  if (!(user.isAdmin || user.isVerifier)) {
    items.push(D.kyc)
    if (isBuyerRole(user)) items.push(D.wallet)
    items.push(D.upgrade)
  }

  return items.map(withHint)
}

/**
 * The role-specific middle of the sidebar — everything this role can do that
 * other roles cannot.
 *
 * Deliberately excludes the shared public surfaces (marketplace, biomass,
 * registry, map — see exploreGroup) and the role's own landing page, which the
 * sidebar already lists on top. A group that repeats what is directly above it
 * is how this app ended up with three names for one destination.
 */
export function buildWorkspace(user, { cartCount = 0 } = {}) {
  if (!user.isAuthenticated) return []

  const insights = group('Insights', [D.analytics, D.marketPrices, D.assistant])

  if (user.isAdmin) {
    return [
      group('Operations', [
        D.adminUsers,
        D.adminFinance,
        // Sits under Operations rather than Compliance: it is oversight of a
        // trade Carbonify records but does not settle, not a regulatory queue.
        D.adminFeedstock,
        D.adminAudit,
        D.adminConfig,
        D.adminApiKeys,
      ]),
      group('Compliance', [
        D.adminKyc,
        D.adminKyb,
        D.adminAml,
        D.adminPrivacy,
        D.adminRefunds,
        D.adminRoles,
      ]),
      insights,
    ]
  }

  // A verifier's actual work is the tabs inside /verifier, so there is nothing
  // to list beyond the cross-role insight pages.
  if (user.isVerifier) {
    return [insights]
  }

  if (user.isProjectDeveloper) {
    return [
      group('Projects', [D.submitProject, D.devLedger]),
      group('Monitoring', [D.devMrv, D.devMonitoring]),
      group('Commercial', [D.devOfftakes, D.devDataRoom, D.sellerEarnings, D.devFees]),
      group('Biomass', [D.sellFeedstock, D.feedstockRfqs]),
      insights,
    ]
  }

  if (user.isFarmer) {
    return [group('Feedstock', [D.sellFeedstock, D.feedstockRfqs]), insights]
  }

  const cart = cartCount > 0 ? { ...D.cart, label: `${D.cart.label} (${cartCount})` } : D.cart

  /**
   * An LGU buys — it just isn't ALL an LGU does, which is why /lgu stays its
   * landing page (see homeDestination) rather than the buyer dashboard.
   *
   * Everything below was already reachable by an LGU: none of these routes list
   * ROLES.LGU_USER in their disallowedRoles, /kyc is open to them precisely
   * because the router says LGU users "need KYC to move money", and /analytics —
   * which IS in their sidebar — shows a Buying tab with portfolio value and
   * monthly spend. The navigation was the only place that disagreed, so a
   * municipality that had just calculated its emissions with the MSW tool had no
   * offered route to offsetting them.
   *
   * Deliberately narrower than the general buyer's list: no Biomass group, since
   * an LGU is not a feedstock supplier, and no Investor group.
   */
  if (user.isLguUser) {
    return [
      group('Buying', [cart, D.watchlist, D.calculator]),
      group('Credits', [D.portfolio, D.retire, D.certificates]),
      group('Records', [D.orders, D.receipts, D.disputes]),
      insights,
    ]
  }

  // Buyers / general users.

  const sections = [
    group('Buying', [cart, D.watchlist, D.calculator]),
    group('Credits', [D.portfolio, D.retire, D.certificates]),
    group('Records', [D.orders, D.receipts, D.disputes]),
    insights,
    group('Biomass', [D.feedstockRfqs, D.sellFeedstock]),
  ]

  if (user.isBuyerInvestor) {
    sections.push(group('Investor', [D.investor]))
  }

  return sections
}

export { D as DESTINATIONS }
