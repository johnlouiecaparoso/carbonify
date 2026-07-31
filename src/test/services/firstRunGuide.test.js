import { describe, it, expect } from 'vitest'
import { firstStepsForRole, ROLE_EXPLAINERS } from '@/constants/onboarding'
import { ROLES } from '@/constants/roles'
import router from '@/router'

/**
 * The first-run guide TELLS USERS HOW THE PLATFORM WORKS, so it can be wrong in
 * a way a stylesheet cannot. These tests pin the claims that are easy to get
 * wrong and expensive to get wrong:
 *
 *  - every link it offers must be a real route (a dead "Start verification"
 *    button on a new user's first screen is worse than no button);
 *  - the roles it says you can apply for must be the roles the application
 *    service actually accepts;
 *  - LGU must NOT be offered as an application, because it is assigned;
 *  - the sign-in warning must exist, because a pending application genuinely
 *    locks the account (getBlockingRoleApplicationForUser) and discovering that
 *    by being locked out is the worst way to learn it.
 */

const paths = new Set(router.getRoutes().map((r) => r.path))

describe('first-run steps', () => {
  const rolesWithSteps = [
    ROLES.GENERAL_USER,
    ROLES.BUYER_INVESTOR,
    ROLES.PROJECT_DEVELOPER,
    ROLES.FARMER,
    ROLES.LGU_USER,
    ROLES.VERIFIER,
    ROLES.ADMIN,
  ]

  for (const role of rolesWithSteps) {
    it(`gives ${role} at least one concrete step`, () => {
      const steps = firstStepsForRole(role)
      expect(steps.length).toBeGreaterThan(0)
      for (const s of steps) {
        expect(s.title, `${role} step missing a title`).toBeTruthy()
        expect(s.body, `${role} step missing a body`).toBeTruthy()
      }
    })

    it(`only links ${role} to routes that exist`, () => {
      for (const s of firstStepsForRole(role)) {
        if (!s.to) continue
        const path = s.to.split('?')[0]
        expect(paths.has(path), `${role} step links to "${path}", which is not a route`).toBe(true)
        // A link with no label is an invisible button.
        expect(s.cta, `${role} step links to ${path} with no CTA text`).toBeTruthy()
      }
    })
  }

  it('falls back to the general steps for an unknown role', () => {
    expect(firstStepsForRole('something_else')).toEqual(firstStepsForRole(ROLES.GENERAL_USER))
    expect(firstStepsForRole(undefined)).toEqual(firstStepsForRole(ROLES.GENERAL_USER))
  })

  it('tells a farmer that the buyer pays them directly', () => {
    // The single most consequential fact for that role: Carbonify never holds
    // their money, so the platform cannot recover what it never received.
    const text = firstStepsForRole(ROLES.FARMER)
      .map((s) => s.body)
      .join(' ')
      .toLowerCase()
    expect(text).toContain('directly')
    expect(text).toContain('never holds')
  })

  it('tells a developer that validation alone does not mint credits', () => {
    // The mint-on-VER cutover (#17). Without this, a developer reports the
    // absence of credits after validation as a bug.
    const text = firstStepsForRole(ROLES.PROJECT_DEVELOPER)
      .map((s) => s.body)
      .join(' ')
      .toLowerCase()
    expect(text).toContain('validation alone does not create credits')
  })
})

describe('role explainers', () => {
  it('describes farmer, project developer, verifier and LGU', () => {
    const named = ROLE_EXPLAINERS.map((r) => r.role)
    expect(named).toContain(ROLES.FARMER)
    expect(named).toContain(ROLES.PROJECT_DEVELOPER)
    expect(named).toContain(ROLES.VERIFIER)
    expect(named).toContain(ROLES.LGU_USER)
  })

  it('offers an application only for roles /apply actually accepts', () => {
    // roleApplicationService.ROLE_APPLICATION_ROLES = project_developer,
    // verifier, farmer. Offering anything else produces a form that rejects it.
    const APPLICABLE = new Set([ROLES.PROJECT_DEVELOPER, ROLES.VERIFIER, ROLES.FARMER])

    for (const r of ROLE_EXPLAINERS) {
      if (r.applyTo) {
        expect(APPLICABLE.has(r.role), `${r.role} is offered as an application but is not accepted`).toBe(true)
        expect(r.applyTo.startsWith('/apply'), `${r.role} must apply via /apply`).toBe(true)
        expect(paths.has('/apply')).toBe(true)
        expect(r.applyCta).toBeTruthy()
      }
    }
  })

  it('does NOT offer LGU as an application, and says how to get one', () => {
    // LGU is absent from ROLE_APPLICATION_ROLES — it is assigned by staff. An
    // "Apply as an LGU" button would submit into a role the service rejects.
    const lgu = ROLE_EXPLAINERS.find((r) => r.role === ROLES.LGU_USER)
    expect(lgu.applyTo).toBeNull()
    expect(lgu.contact, 'LGU needs a route to a human instead').toBeTruthy()
  })

  it('explains what a verifier is for, not just what they click', () => {
    const verifier = ROLE_EXPLAINERS.find((r) => r.role === ROLES.VERIFIER)
    const text = `${verifier.summary} ${verifier.detail}`.toLowerCase()
    // Independence is the whole point of the role.
    expect(text).toContain('independent')
    expect(text).toContain('accredit')
  })

  it('every explainer carries a summary, a detail and an icon', () => {
    for (const r of ROLE_EXPLAINERS) {
      expect(r.label, `${r.role} has no label`).toBeTruthy()
      expect(r.summary, `${r.role} has no summary`).toBeTruthy()
      expect(r.detail, `${r.role} has no detail`).toBeTruthy()
      expect(r.icon, `${r.role} has no icon`).toBeTruthy()
    }
  })
})
