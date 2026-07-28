import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/supabaseClient', () => ({ getSupabase: vi.fn() }))
vi.mock('@/services/notificationService', () => ({
  createNotificationsForUsers: vi.fn(),
  createNotificationsForRoles: vi.fn(),
}))
vi.mock('@/services/storageService', () => ({ uploadProjectDocument: vi.fn() }))

import { acknowledgeDeliveryPayment, aggregateFarmerDeliveries } from '@/services/farmerService'
import { paymentState, resolveDeliveryPayment } from '@/services/adminFeedstockService'
import { getSupabase } from '@/services/supabaseClient'
import {
  createNotificationsForUsers,
  createNotificationsForRoles,
} from '@/services/notificationService'

/**
 * The feedstock payment record is TWO-SIDED (backlog #26, decided 2026-07-28).
 *
 * `payment_status` is the buyer's assertion that they settled off-platform.
 * Carbonify holds no feedstock money, so that assertion is the only thing the
 * platform ever had — and it was being rendered as settled fact, with the farmer
 * unable to agree or contradict it. These tests pin the two properties that
 * matter: a buyer's claim never reads as agreed, and the farmer can always say
 * they were not paid.
 */

const DELIVERY = {
  id: 'd-1',
  farmer_id: 'farmer-1',
  buyer_id: 'buyer-1',
  quantity: 12,
  unit: 'tonnes',
}

function clientReturning(row) {
  return { rpc: vi.fn().mockResolvedValue({ data: row, error: null }) }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('acknowledgeDeliveryPayment', () => {
  it('refuses a dispute with no reason, without calling the server', async () => {
    const client = clientReturning({})
    getSupabase.mockReturnValue(client)

    await expect(acknowledgeDeliveryPayment(DELIVERY, false, '   ')).rejects.toThrow(
      /describe what happened/i,
    )
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('records a confirmation and tells the buyer', async () => {
    const client = clientReturning({ ...DELIVERY, farmer_payment_ack: 'confirmed' })
    getSupabase.mockReturnValue(client)

    const out = await acknowledgeDeliveryPayment(DELIVERY, true)

    expect(client.rpc).toHaveBeenCalledWith('acknowledge_farmer_delivery_payment', {
      p_delivery_id: 'd-1',
      p_confirm: true,
      p_note: null,
    })
    expect(out.farmer_payment_ack).toBe('confirmed')
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ['buyer-1'],
      expect.objectContaining({ type: 'farmer_payment_confirmed' }),
    )
    // A confirmation is not staff business.
    expect(createNotificationsForRoles).not.toHaveBeenCalled()
  })

  it('escalates a dispute to admins as well as the buyer', async () => {
    const client = clientReturning({ ...DELIVERY, farmer_payment_ack: 'disputed' })
    getSupabase.mockReturnValue(client)

    await acknowledgeDeliveryPayment(DELIVERY, false, '  nothing arrived in my GCash  ')

    expect(client.rpc).toHaveBeenCalledWith('acknowledge_farmer_delivery_payment', {
      p_delivery_id: 'd-1',
      p_confirm: false,
      p_note: 'nothing arrived in my GCash',
    })
    // Without this, a dispute has nowhere to go: the farmer's only counterparty
    // is the person they are disputing with.
    expect(createNotificationsForRoles).toHaveBeenCalledWith(
      ['admin'],
      expect.objectContaining({ link: '/admin/feedstock' }),
    )
  })

  it('surfaces a server refusal rather than reporting success', async () => {
    getSupabase.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'Only the farmer who made this delivery can respond to its payment record' } }),
    })

    await expect(acknowledgeDeliveryPayment(DELIVERY, true)).rejects.toThrow(/Only the farmer/)
  })

  it('does not fail the acknowledgement when the notification fails', async () => {
    getSupabase.mockReturnValue(clientReturning({ ...DELIVERY, farmer_payment_ack: 'confirmed' }))
    createNotificationsForUsers.mockRejectedValueOnce(new Error('notify down'))

    await expect(acknowledgeDeliveryPayment(DELIVERY, true)).resolves.toBeTruthy()
  })
})

describe('aggregateFarmerDeliveries — the farmer has not agreed to every "paid"', () => {
  it('counts an unanswered buyer claim separately from the money', () => {
    const out = aggregateFarmerDeliveries([
      { status: 'confirmed', quantity: 5, total_amount: 1000, payment_status: 'paid' },
      {
        status: 'confirmed',
        quantity: 5,
        total_amount: 2000,
        payment_status: 'paid',
        farmer_payment_ack: 'confirmed',
      },
    ])

    expect(out.paidCount).toBe(2)
    expect(out.totalEarned).toBe(3000)
    // Only the first is still the buyer's word alone.
    expect(out.awaitingAck).toBe(1)
    expect(out.disputedCount).toBe(0)
  })

  it('counts a dispute on either side of the paid/unpaid split', () => {
    const out = aggregateFarmerDeliveries([
      // "You said you paid me and you did not."
      {
        status: 'confirmed',
        quantity: 1,
        total_amount: 100,
        payment_status: 'paid',
        farmer_payment_ack: 'disputed',
      },
      // "You confirmed my delivery and never paid at all."
      {
        status: 'confirmed',
        quantity: 1,
        total_amount: 200,
        payment_status: 'unpaid',
        farmer_payment_ack: 'disputed',
      },
    ])

    expect(out.disputedCount).toBe(2)
    expect(out.awaitingAck).toBe(0)
    expect(out.amountOwed).toBe(200)
  })

  it('ignores rejected and pending deliveries', () => {
    const out = aggregateFarmerDeliveries([
      { status: 'rejected', quantity: 9, total_amount: 900, farmer_payment_ack: 'disputed' },
      { status: 'pending', quantity: 3, total_amount: 300 },
    ])
    expect(out.disputedCount).toBe(0)
    expect(out.awaitingAck).toBe(0)
  })
})

describe('paymentState — a buyer claim must never read as agreed', () => {
  it('never returns the settled tone for a claim the farmer has not answered', () => {
    const s = paymentState({ status: 'confirmed', payment_status: 'paid', farmer_payment_ack: 'pending' })
    expect(s.key).toBe('claimed')
    expect(s.tone).not.toBe('ok')
  })

  it('reads agreement only when both sides say so', () => {
    expect(
      paymentState({ status: 'confirmed', payment_status: 'paid', farmer_payment_ack: 'confirmed' }),
    ).toMatchObject({ key: 'agreed', tone: 'ok' })
  })

  it('flags an open dispute', () => {
    expect(paymentState({ status: 'confirmed', farmer_payment_ack: 'disputed' })).toMatchObject({
      key: 'disputed',
      tone: 'bad',
    })
  })

  it('distinguishes a reopened dispute from a resolved one', () => {
    expect(
      paymentState({ farmer_payment_ack: 'disputed', payment_resolution: 'unpaid_confirmed' }),
    ).toMatchObject({ key: 'reopened', tone: 'bad' })

    expect(
      paymentState({ farmer_payment_ack: 'confirmed', payment_resolution: 'paid_confirmed' }),
    ).toMatchObject({ key: 'resolved' })
  })

  it('shows a confirmed-but-unpaid delivery as needing attention, not as nothing', () => {
    expect(paymentState({ status: 'confirmed', payment_status: 'unpaid' })).toMatchObject({
      key: 'unpaid',
      tone: 'warn',
    })
  })
})

describe('resolveDeliveryPayment', () => {
  it('refuses to close a record with no account of what was established', async () => {
    const client = clientReturning({})
    getSupabase.mockReturnValue(client)

    await expect(resolveDeliveryPayment(DELIVERY, 'paid_confirmed', '  ')).rejects.toThrow(
      /what was established/i,
    )
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('notifies BOTH parties — the outcome is a finding about both of them', async () => {
    getSupabase.mockReturnValue(clientReturning({ ...DELIVERY, payment_resolution: 'unpaid_confirmed' }))

    await resolveDeliveryPayment(DELIVERY, 'unpaid_confirmed', 'Buyer produced no reference.')

    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ['farmer-1', 'buyer-1'],
      expect.objectContaining({ type: 'feedstock_payment_resolved' }),
    )
  })

  it('reports an admin-only refusal in plain language', async () => {
    getSupabase.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'admin only' } }),
    })

    await expect(resolveDeliveryPayment(DELIVERY, 'other', 'note')).rejects.toThrow(
      'Admin access required.',
    )
  })
})
