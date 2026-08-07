import { describe, it, expect } from 'vitest'
import { totalOutstanding, payableFromWallet } from '@/services/projectFeeService'

/**
 * Fee arithmetic and the pay/refuse decision.
 *
 * These are the two places where getting it wrong is expensive in opposite
 * directions: over-counting invents a debt the developer does not owe, and
 * enabling a button the server will refuse produces a failed payment attempt
 * against real money.
 */

describe('totalOutstanding', () => {
  it('counts only due invoices', () => {
    const invoices = [
      { status: 'due', amount: 500 },
      { status: 'paid', amount: 900 },
      { status: 'waived', amount: 700 },
      { status: 'void', amount: 300 },
    ]
    expect(totalOutstanding(invoices)).toBe(500)
  })

  it('treats waived as collected-decision, not as owed', () => {
    // A waiver is a decision NOT to collect. Summing it would report a debt
    // that nobody owes and that no payment will ever clear.
    expect(totalOutstanding([{ status: 'waived', amount: 1000 }])).toBe(0)
  })

  it('sums several due invoices and rounds to centavos', () => {
    const invoices = [
      { status: 'due', amount: 100.005 },
      { status: 'due', amount: 200.004 },
    ]
    expect(totalOutstanding(invoices)).toBe(300.01)
  })

  it('ignores unparseable amounts rather than producing NaN', () => {
    const invoices = [
      { status: 'due', amount: 'not a number' },
      { status: 'due', amount: 250 },
    ]
    expect(totalOutstanding(invoices)).toBe(250)
  })

  it('returns 0 for empty and non-array input', () => {
    expect(totalOutstanding([])).toBe(0)
    expect(totalOutstanding(null)).toBe(0)
    expect(totalOutstanding(undefined)).toBe(0)
  })
})

describe('payableFromWallet', () => {
  const due = { status: 'due', amount: 500 }

  it('allows payment when the balance covers the fee', () => {
    expect(payableFromWallet(due, 500)).toEqual({ payable: true, reason: '' })
    expect(payableFromWallet(due, 1000).payable).toBe(true)
  })

  it('refuses when the balance is short, and says so', () => {
    const verdict = payableFromWallet(due, 499.99)
    expect(verdict.payable).toBe(false)
    expect(verdict.reason).toMatch(/balance/i)
  })

  it('refuses an invoice that is no longer due, naming its state', () => {
    for (const status of ['paid', 'waived', 'void']) {
      const verdict = payableFromWallet({ status, amount: 500 }, 10000)
      expect(verdict.payable).toBe(false)
      expect(verdict.reason).toContain(status)
    }
  })

  it('refuses an invoice with no usable amount', () => {
    expect(payableFromWallet({ status: 'due', amount: 0 }, 1000).payable).toBe(false)
    expect(payableFromWallet({ status: 'due', amount: -5 }, 1000).payable).toBe(false)
    expect(payableFromWallet({ status: 'due', amount: null }, 1000).payable).toBe(false)
  })

  it('refuses when the balance is unknown rather than assuming zero is fine', () => {
    // An unreadable wallet must not enable a payment the server would reject.
    expect(payableFromWallet(due, NaN).payable).toBe(false)
    expect(payableFromWallet(due, null).payable).toBe(false)
    expect(payableFromWallet(due, undefined).payable).toBe(false)
  })

  it('always returns a reason when it refuses', () => {
    const refusals = [
      payableFromWallet(null, 100),
      payableFromWallet({ status: 'paid', amount: 5 }, 100),
      payableFromWallet({ status: 'due', amount: 0 }, 100),
      payableFromWallet(due, 1),
    ]
    for (const verdict of refusals) {
      expect(verdict.payable).toBe(false)
      expect(verdict.reason.length).toBeGreaterThan(0)
    }
  })
})
