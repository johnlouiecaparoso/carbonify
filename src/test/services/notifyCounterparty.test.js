import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

vi.mock('@/services/supabaseClient', () => ({ getSupabase: vi.fn() }))

import { getSupabase } from '@/services/supabaseClient'
import { notifyCounterparty } from '@/services/notificationService'

/**
 * DEFERRED_BACKLOG #36 — the client half.
 *
 * `system_notifications`' INSERT policy is `with check (auth.uid() is not null)`
 * — confirmed against live on 2026-08-02. That is "any signed-in user, for ANY
 * recipient", and the client inserted those rows directly with a caller-supplied
 * `user_id`. Anyone with an account could plant a message in anyone else's bell.
 *
 * The fix is not "validate harder in the browser". It is to stop the browser
 * naming the recipient at all: `notify_counterparty` derives it from a row the
 * caller is provably a party to. These tests cover the call shape and, more
 * importantly, the RATCHET — that no service quietly goes back to inserting for
 * somebody else.
 */

describe('notifyCounterparty — the caller names a subject, never a recipient', () => {
  beforeEach(() => {
    vi.mocked(getSupabase).mockReset()
  })

  it('passes the subject and audience, and no recipient id anywhere', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null })
    vi.mocked(getSupabase).mockReturnValue({ rpc })

    const created = await notifyCounterparty('farmer_delivery', 'd-1', 'both_parties', {
      type: 'feedstock_payment_resolved',
      title: 'Payment record updated',
      message: 'Carbonify reviewed the payment record.',
      link: '/farmer',
      metadata: { delivery_id: 'd-1' },
    })

    expect(created).toBe(2)
    const [fn, args] = rpc.mock.calls[0]
    expect(fn).toBe('notify_counterparty')
    expect(args.p_subject_type).toBe('farmer_delivery')
    expect(args.p_subject_id).toBe('d-1')
    expect(args.p_audience).toBe('both_parties')

    // The point of the whole change: there is no parameter through which a
    // caller could name who gets the notification.
    expect(Object.keys(args)).not.toContain('p_user_id')
    expect(Object.keys(args)).not.toContain('p_recipients')
    expect(JSON.stringify(args)).not.toMatch(/user_id"\s*:\s*"/)
  })

  it('degrades to 0 — not an exception — while the migration is unapplied', async () => {
    // Lets the frontend ship ahead of 20260802000300, the same "inert rather
    // than broken" shape the counterparty-name RPC used.
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function public.notify_counterparty' },
    })
    vi.mocked(getSupabase).mockReturnValue({ rpc })

    await expect(notifyCounterparty('biomass_rfq', 'r-1', 'counterparty', {
      title: 'x',
      message: 'y',
    })).resolves.toBe(0)
  })

  it('returns 0 rather than throwing when the RPC errors', async () => {
    // A notification must never fail the action that earned it.
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })
    vi.mocked(getSupabase).mockReturnValue({ rpc })

    await expect(notifyCounterparty('biomass_rfq', 'r-1', 'counterparty', {
      title: 'x',
      message: 'y',
    })).resolves.toBe(0)
  })

  it('does not call the database with an empty title or message', async () => {
    const rpc = vi.fn()
    vi.mocked(getSupabase).mockReturnValue({ rpc })

    expect(await notifyCounterparty('biomass_rfq', 'r-1', 'counterparty', { title: '  ' })).toBe(0)
    expect(await notifyCounterparty('biomass_rfq', null, 'counterparty', { title: 'a', message: 'b' })).toBe(0)
    expect(rpc).not.toHaveBeenCalled()
  })
})

/**
 * The ratchet. A direct `createNotificationsForUsers` / `ForRoles` call is only
 * legitimate when the recipient IS the caller — those survive the tightened
 * INSERT policy (`auth.uid() = user_id`). Anything cross-user must go through
 * the RPC, or it will simply stop arriving once 20260802000400 is applied, and
 * it will stop *silently*, because every one of these calls is wrapped in a
 * non-fatal catch.
 */
describe('no service may insert a notification for somebody else', () => {
  const SELF_ONLY = [
    'mrvReminderService.js', // [uid]    — own overdue monitoring reports
    'savedSearchService.js', // [userId] — own saved-search matches
    'watchlistService.js', // [uid]    — own watchlist price drops
  ]

  function serviceFiles() {
    const out = []
    ;(function walk(dir) {
      for (const entry of readdirSync(dir)) {
        const p = join(dir, entry)
        if (statSync(p).isDirectory()) walk(p)
        else if (p.endsWith('.js')) out.push(p)
      }
    })('src/services')
    return out
  }

  it('only the three self-notification services call the raw insert helpers', () => {
    const offenders = []
    for (const file of serviceFiles()) {
      if (file.endsWith('notificationService.js')) continue // defines them
      const src = readFileSync(file, 'utf8')
      if (/createNotificationsFor(Users|Roles)\s*\(/.test(src)) {
        const base = file.split(/[\\/]/).pop()
        if (!SELF_ONLY.includes(base)) offenders.push(base)
      }
    }

    // If this fails: use `notifyCounterparty(subjectType, subjectId, audience,
    // payload)` instead. The raw helpers may only address the caller.
    expect(offenders).toEqual([])
  })

  it('finds the three legitimate ones, so it cannot pass vacuously', () => {
    const found = serviceFiles()
      .filter((f) => !f.endsWith('notificationService.js'))
      .filter((f) => /createNotificationsFor(Users|Roles)\s*\(/.test(readFileSync(f, 'utf8')))
      .map((f) => f.split(/[\\/]/).pop())
      .sort()

    expect(found).toEqual([...SELF_ONLY].sort())
  })

  it('the ported services really do call notifyCounterparty', () => {
    // Asserting the absence of the old call is only half of it — deleting the
    // notification entirely would also satisfy that. This is the 2026-08-01
    // lesson: assert the new path is CALLED, not merely that the old one is gone.
    for (const base of ['farmerService.js', 'biomassService.js', 'adminFeedstockService.js']) {
      const src = readFileSync(join('src/services', base), 'utf8')
      expect(src, base).toMatch(/notifyCounterparty\(/)
    }
  })
})
