/**
 * Get the default route for a user based on their role.
 *
 * This is where a denied guard sends someone, so it MUST agree with the guards
 * about what each role is. It used to keep its own list of aliases ('super_admin'
 * → /admin) while roleService compared with ===, so a super_admin was sent to
 * /admin, refused, and sent to /admin again — an infinite navigation redirect.
 * Both now canonicalize through the same function.
 *
 * @param {string} role - User role
 * @returns {string} Default route path
 */
import { ROLES, canonicalizeRole } from '@/constants/roles'

export function getRoleDefaultRoute(role) {
  switch (canonicalizeRole(role)) {
    case ROLES.ADMIN:
      return '/admin'
    case ROLES.VERIFIER:
      return '/verifier'
    case ROLES.PROJECT_DEVELOPER:
      return '/developer/projects'
    case ROLES.LGU_USER:
      return '/lgu'
    case ROLES.FARMER:
      return '/farmer'
    case ROLES.BUYER_INVESTOR:
    case ROLES.GENERAL_USER:
    default:
      // Buyers get a workspace like every other role, not the public homepage.
      return '/dashboard'
  }
}
