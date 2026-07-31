import { describe, it, expect } from 'vitest'
import { GUIDE_SECTIONS, BETA_NOTICES, orderedSectionsForRole } from '@/constants/userGuide'
import { ROLES } from '@/constants/roles'
import router from '@/router'

/**
 * The guide TELLS USERS HOW THE PLATFORM BEHAVES, so a stale line here is a
 * support ticket rather than a typo. These tests pin the facts that are both
 * easy to get wrong and expensive to get wrong — every one of them is
 * something this project has already had to correct once:
 *
 *  - credits are minted on VER approval, not on validation (the 2026-07-26
 *    mint-on-VER cutover, which changed live behaviour);
 *  - the farmer is paid directly and Carbonify never holds that money (#26);
 *  - card sales are escrowed, e-wallet sales are not;
 *  - a pending role application blocks sign-in;
 *  - LGU is assigned, not applied for.
 */

const paths = new Set(router.getRoutes().map((r) => r.path))
const allText = GUIDE_SECTIONS.flatMap((s) => s.items.map((i) => `${i.q} ${i.a}`))
  .join(' ')
  .toLowerCase()

describe('guide structure', () => {
  it('has a /guide route to render it on', () => {
    expect(paths.has('/guide')).toBe(true)
  })

  it('gives every section an id, title, icon, intro and items', () => {
    for (const s of GUIDE_SECTIONS) {
      expect(s.id, 'section missing id').toBeTruthy()
      expect(s.title, `${s.id} missing title`).toBeTruthy()
      expect(s.icon, `${s.id} missing icon`).toBeTruthy()
      expect(s.intro, `${s.id} missing intro`).toBeTruthy()
      expect(s.items.length, `${s.id} has no items`).toBeGreaterThan(0)
      expect(Array.isArray(s.roles), `${s.id} missing roles`).toBe(true)
    }
  })

  it('uses unique section ids, because they become DOM ids', () => {
    const ids = GUIDE_SECTIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('only links to routes that exist', () => {
    // A dead link in the help page is worse than no link: it is help that
    // fails at the moment someone finally asked for it.
    for (const s of GUIDE_SECTIONS) {
      for (const item of s.items) {
        if (!item.to) continue
        const path = item.to.split('?')[0]
        expect(paths.has(path), `"${item.q}" links to ${path}, which is not a route`).toBe(true)
        expect(item.cta, `"${item.q}" links to ${path} with no button text`).toBeTruthy()
      }
    }
  })

  it('covers all six roles plus the cross-cutting basics', () => {
    const covered = new Set(GUIDE_SECTIONS.flatMap((s) => s.roles))
    for (const role of [
      ROLES.GENERAL_USER,
      ROLES.BUYER_INVESTOR,
      ROLES.PROJECT_DEVELOPER,
      ROLES.FARMER,
      ROLES.VERIFIER,
      ROLES.LGU_USER,
    ]) {
      expect(covered.has(role) || covered.has('*'), `no section for ${role}`).toBe(true)
    }
  })
})

describe('orderedSectionsForRole', () => {
  it('floats the role’s own sections to the top without hiding the rest', () => {
    const ordered = orderedSectionsForRole(ROLES.FARMER)
    expect(ordered.length).toBe(GUIDE_SECTIONS.length)
    expect(ordered[0].roles).toContain(ROLES.FARMER)
  })

  it('still returns every section for a role with no dedicated one', () => {
    expect(orderedSectionsForRole('admin').length).toBe(GUIDE_SECTIONS.length)
    expect(orderedSectionsForRole(undefined).length).toBe(GUIDE_SECTIONS.length)
  })
})

describe('the claims that must stay true', () => {
  it('says validation does not mint credits', () => {
    // Live behaviour changed on 2026-07-26. A guide that still implied
    // validation issues credits would generate false bug reports.
    expect(allText).toContain('does not create any credits')
    expect(allText).toContain('approves the report')
  })

  it('says the farmer is paid directly and Carbonify never holds the money', () => {
    expect(allText).toContain('directly')
    expect(allText).toContain('never holds')
    // And that the platform therefore cannot recover it.
    expect(allText).toContain('cannot recover')
  })

  it('distinguishes card escrow from e-wallet immediate release', () => {
    expect(allText).toContain('held for a short window')
    expect(allText).toContain('immediately')
  })

  it('warns that a pending application blocks sign-in', () => {
    expect(allText).toContain('cannot sign in')
  })

  it('says an LGU account is assigned, not applied for', () => {
    expect(allText).toContain('not open to application')
  })

  it('distinguishes KYC (buying) from KYB (withdrawing)', () => {
    expect(allText).toContain('kyc')
    expect(allText).toContain('kyb')
  })

  it('is honest that the cart charges per listing', () => {
    // Disclosed in the cart already; the guide must not contradict it.
    expect(allText).toContain('one at a time')
  })
})

describe('beta notices', () => {
  it('discloses test payments, non-registry credits and provisional invoices', () => {
    const text = BETA_NOTICES.map((n) => `${n.title} ${n.body}`).join(' ').toLowerCase()
    expect(text).toContain('test mode')
    expect(text).toContain('no real money')
    expect(text).toContain('not a verra or gold standard registry receipt')
    expect(text).toContain('provisional')
  })

  it('gives every notice a title and a body', () => {
    for (const n of BETA_NOTICES) {
      expect(n.title).toBeTruthy()
      expect(n.body).toBeTruthy()
    }
  })
})
