/**
 * User roles and permissions constants
 */

export const ROLES = {
  ADMIN: 'admin',
  VERIFIER: 'verifier',
  PROJECT_DEVELOPER: 'project_developer',
  LGU_USER: 'lgu_user',
  BUYER_INVESTOR: 'buyer_investor',
  FARMER: 'farmer',
  GENERAL_USER: 'general_user',
}

export const PERMISSIONS = {
  // Project permissions
  CREATE_PROJECTS: 'create_projects',
  EDIT_OWN_PROJECTS: 'edit_own_projects',
  DELETE_OWN_PROJECTS: 'delete_own_projects',
  VIEW_OWN_PROJECTS: 'view_own_projects',
  VIEW_ALL_PROJECTS: 'view_all_projects',
  EDIT_ALL_PROJECTS: 'edit_all_projects',
  DELETE_ALL_PROJECTS: 'delete_all_projects',
  APPROVE_PROJECTS: 'approve_projects',
  REJECT_PROJECTS: 'reject_projects',
  EDIT_PROJECT_STATUS: 'edit_project_status',
  VIEW_PROJECT_DETAILS: 'view_project_details',
  ADD_VERIFICATION_NOTES: 'add_verification_notes',
  VIEW_VERIFICATION_HISTORY: 'view_verification_history',
  ACCESS_PROJECTS: 'view_all_projects', // Added missing permission for verifier panel

  // User management permissions
  VIEW_ALL_USERS: 'view_all_users',
  EDIT_USER_ROLES: 'edit_user_roles',
  VIEW_OWN_PROFILE: 'view_own_profile',
  EDIT_OWN_PROFILE: 'edit_own_profile',

  // Marketplace permissions
  VIEW_MARKETPLACE: 'view_marketplace',
  PURCHASE_CREDITS: 'purchase_credits',
  CREATE_CREDIT_LISTINGS: 'create_credit_listings',
  MANAGE_OWN_LISTINGS: 'manage_own_listings',
  MANAGE_MARKETPLACE: 'manage_marketplace',

  // Portfolio permissions
  VIEW_OWN_PORTFOLIO: 'view_own_portfolio',
  RETIRE_CREDITS: 'retire_credits',
  VIEW_CERTIFICATES: 'view_certificates',
  VIEW_RECEIPTS: 'view_receipts',

  // Wallet permissions
  MANAGE_WALLET: 'manage_wallet',
  VIEW_OWN_TRANSACTIONS: 'view_own_transactions',
  VIEW_ALL_TRANSACTIONS: 'view_all_transactions',

  // LGU / Community permissions
  UPLOAD_LGU_EMISSIONS: 'upload_lgu_emissions',
  VIEW_COMMUNITY_PROJECTS: 'view_community_projects',

  // Farmer permissions
  MANAGE_FARM_PARCELS: 'manage_farm_parcels',
  RECORD_DELIVERIES: 'record_deliveries',
  SELL_FEEDSTOCK: 'sell_feedstock',

  // System permissions
  VIEW_AUDIT_LOGS: 'view_audit_logs',
  MANAGE_SYSTEM_SETTINGS: 'manage_system_settings',
  VIEW_ANALYTICS: 'view_analytics',
}

export const ROLE_HIERARCHY = {
  [ROLES.ADMIN]: 5,
  [ROLES.VERIFIER]: 4,
  [ROLES.PROJECT_DEVELOPER]: 3,
  [ROLES.LGU_USER]: 3,
  [ROLES.BUYER_INVESTOR]: 2,
  [ROLES.FARMER]: 2,
  [ROLES.GENERAL_USER]: 1,
}

export const ROLE_COLORS = {
  [ROLES.ADMIN]: 'red',
  [ROLES.VERIFIER]: 'blue',
  [ROLES.PROJECT_DEVELOPER]: 'green',
  [ROLES.LGU_USER]: 'teal',
  [ROLES.BUYER_INVESTOR]: 'purple',
  [ROLES.FARMER]: 'amber',
  [ROLES.GENERAL_USER]: 'gray',
}

export const ROLE_ICONS = {
  [ROLES.ADMIN]: 'shield-check',
  [ROLES.VERIFIER]: 'check-circle',
  [ROLES.PROJECT_DEVELOPER]: 'leaf',
  [ROLES.LGU_USER]: 'map',
  [ROLES.BUYER_INVESTOR]: 'currency-dollar',
  [ROLES.FARMER]: 'agriculture',
  [ROLES.GENERAL_USER]: 'user',
}

/**
 * Aliases the database already accepts for each canonical role.
 *
 * This mirrors `public.canonicalize_notification_role()` (migration
 * 20260402000100), which `public.is_admin()` is built on. That means the
 * SERVER grants a `super_admin` every admin right via RLS. The client used to
 * compare roles with `===` against the canonical value, so a super_admin was
 * refused by the admin guard and redirected to `/admin` — the very route that
 * had just refused them — producing an infinite navigation redirect.
 *
 * Keep this table in sync with that migration. Deliberately NOT merged into
 * ROLES: these are values that may arrive from the database, not values an
 * admin may assign (see roleService.updateUserRole, which validates against
 * Object.values(ROLES)).
 */
const ROLE_ALIASES = {
  administrator: ROLES.ADMIN,
  super_admin: ROLES.ADMIN,
  superadmin: ROLES.ADMIN,
  verification: ROLES.VERIFIER,
  qa: ROLES.VERIFIER,
  projectdeveloper: ROLES.PROJECT_DEVELOPER,
  developer: ROLES.PROJECT_DEVELOPER,
  buyerinvestor: ROLES.BUYER_INVESTOR,
  investor: ROLES.BUYER_INVESTOR,
  generaluser: ROLES.GENERAL_USER,
  user: ROLES.GENERAL_USER,
  lgu: ROLES.LGU_USER,
}

/**
 * Reduce any role value the database might hold to its canonical form.
 *
 * Every role comparison in the app must go through this. Two code paths used to
 * normalize differently — the primary profile fetch lowercased and trimmed, the
 * retry path did neither — so a stored `'Admin'` worked on first load and
 * silently demoted the user to general_user after a timeout retry.
 *
 * @param {unknown} role
 * @returns {string} a canonical ROLES value, or GENERAL_USER when unrecognisable
 */
export function canonicalizeRole(role) {
  if (typeof role !== 'string') return ROLES.GENERAL_USER

  const normalized = role
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (!normalized) return ROLES.GENERAL_USER

  return ROLE_ALIASES[normalized] || normalized
}

/**
 * Get role display name
 * @param {string} role - Role key
 * @returns {string} Display name for the role
 */
export function getRoleDisplayName(role) {
  const displayNames = {
    [ROLES.ADMIN]: 'Administrator',
    [ROLES.VERIFIER]: 'Verifier',
    [ROLES.PROJECT_DEVELOPER]: 'Project Developer',
    [ROLES.LGU_USER]: 'LGU User',
    [ROLES.BUYER_INVESTOR]: 'Buyer/Investor',
    [ROLES.FARMER]: 'Farmer',
    [ROLES.GENERAL_USER]: 'General User',
  }

  return displayNames[canonicalizeRole(role)] || 'Unknown Role'
}
