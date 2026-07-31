import { describe, it, expect } from 'vitest'
import {
  auditLogsToRows,
  transactionsToRows,
  exportFilename,
} from '@/services/adminExportService'
import { summariseDataRequests, DSR_ADMIN_STATUSES } from '@/services/dataPrivacyService'

describe('exportFilename', () => {
  it('stamps the date so successive exports do not overwrite each other', () => {
    expect(exportFilename('audit-logs', new Date('2026-07-22T10:00:00Z'))).toBe(
      'carbonify-audit-logs-2026-07-22.csv',
    )
  })
})

describe('auditLogsToRows', () => {
  it('returns nothing for an empty log', () => {
    expect(auditLogsToRows([])).toEqual([])
    expect(auditLogsToRows()).toEqual([])
  })

  it('flattens a row into the export shape', () => {
    const [row] = auditLogsToRows([
      {
        created_at: '2026-07-22T10:00:00Z',
        action: 'project_validated',
        user_name: 'Ana Reyes',
        user_id: 'u1',
        resource_type: 'projects',
        resource_id: 'p1',
        metadata: { note: 'looks good' },
      },
    ])
    expect(row.timestamp).toBe('2026-07-22T10:00:00Z')
    expect(row.action).toBe('project_validated')
    expect(row.user).toBe('Ana Reyes')
  })

  it('serialises metadata rather than dropping it', () => {
    // Metadata is often the only record of WHAT changed, which is the point of
    // an audit export.
    const [row] = auditLogsToRows([{ metadata: { from: 'a', to: 'b' } }])
    expect(JSON.parse(row.metadata)).toEqual({ from: 'a', to: 'b' })
  })

  it('falls back to action_type when action is absent', () => {
    expect(auditLogsToRows([{ action_type: 'login' }])[0].action).toBe('login')
  })

  it('emits empty strings, never undefined, for missing fields', () => {
    const [row] = auditLogsToRows([{}])
    for (const value of Object.values(row)) {
      expect(value).toBe('')
    }
  })
})

describe('transactionsToRows', () => {
  it('uses the recorded net rather than deriving it', () => {
    // Deriving would let an export disagree with the ledger over rounding.
    const [row] = transactionsToRows([
      { total_amount: 100, platform_fee: 5, seller_net: 94.99 },
    ])
    expect(row.net).toBe(94.99)
  })

  it('derives net only when it is absent', () => {
    const [row] = transactionsToRows([{ total_amount: 100, platform_fee: 5 }])
    expect(row.net).toBe(95)
  })

  it('accepts either field name for gross and fee', () => {
    const [row] = transactionsToRows([{ amount: 250, fee: 10 }])
    expect(row.gross).toBe(250)
    expect(row.fee).toBe(10)
  })

  it('falls back to ids when names are unavailable', () => {
    const [row] = transactionsToRows([{ buyer_id: 'b1', seller_id: 's1' }])
    expect(row.buyer).toBe('b1')
    expect(row.seller).toBe('s1')
  })

  it('defaults missing money to 0, not undefined', () => {
    const [row] = transactionsToRows([{}])
    expect(row.gross).toBe(0)
    expect(row.fee).toBe(0)
    expect(row.net).toBe(0)
    expect(row.quantity).toBe(0)
  })
})

describe('summariseDataRequests', () => {
  const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString()

  it('is all zeroes for an empty queue', () => {
    expect(summariseDataRequests([])).toEqual({
      total: 0, pending: 0, inProgress: 0, deletions: 0, overdue: 0,
    })
    expect(summariseDataRequests().total).toBe(0)
  })

  it('counts pending and in-progress separately', () => {
    const s = summariseDataRequests([
      { status: 'pending', request_type: 'export' },
      { status: 'in_progress', request_type: 'export' },
      { status: 'completed', request_type: 'export' },
    ])
    expect(s.pending).toBe(1)
    expect(s.inProgress).toBe(1)
    expect(s.total).toBe(3)
  })

  it('counts only OPEN deletions, since a closed one needs no action', () => {
    const s = summariseDataRequests([
      { status: 'pending', request_type: 'deletion' },
      { status: 'in_progress', request_type: 'deletion' },
      { status: 'completed', request_type: 'deletion' },
      { status: 'cancelled', request_type: 'deletion' },
    ])
    expect(s.deletions).toBe(2)
  })

  it('flags open requests older than 30 days', () => {
    const s = summariseDataRequests([
      { status: 'pending', request_type: 'deletion', created_at: daysAgo(45) },
      { status: 'pending', request_type: 'deletion', created_at: daysAgo(5) },
    ])
    expect(s.overdue).toBe(1)
  })

  it('never flags a closed request as overdue, however old', () => {
    const s = summariseDataRequests([
      { status: 'completed', request_type: 'deletion', created_at: daysAgo(400) },
      { status: 'cancelled', request_type: 'export', created_at: daysAgo(400) },
    ])
    expect(s.overdue).toBe(0)
  })

  it('tolerates a missing created_at', () => {
    expect(() => summariseDataRequests([{ status: 'pending' }])).not.toThrow()
    expect(summariseDataRequests([{ status: 'pending' }]).overdue).toBe(0)
  })
})

describe('DSR_ADMIN_STATUSES', () => {
  it('excludes cancelled — withdrawing belongs to the data subject', () => {
    expect(DSR_ADMIN_STATUSES).toEqual(['in_progress', 'completed', 'rejected'])
    expect(DSR_ADMIN_STATUSES).not.toContain('cancelled')
    expect(DSR_ADMIN_STATUSES).not.toContain('pending')
  })
})
