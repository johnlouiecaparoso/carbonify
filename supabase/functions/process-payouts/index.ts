// Supabase Edge Function: process-payouts (Phase 2.4 worker)
//
// Picks up 'requested' payout_requests and disburses them via the payout
// provider, then transitions them settled/failed through the service-role RPCs.
// Intended to be invoked on a schedule (cron) or by an admin — NOT public.
// Gated by PAYOUT_WORKER_SECRET (sent as `x-worker-secret`).
//
// The disbursement here is the MOCK provider (settles unless the destination
// accountNumber is the 'FAIL' sentinel). When a real payouts partner is wired,
// replace disburse() with the provider call (tracked in DEFERRED_BACKLOG.md).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const PAYOUT_WORKER_SECRET = Deno.env.get('PAYOUT_WORKER_SECRET') || ''
const BATCH_SIZE = 25

interface PayoutRow {
  id: string
  amount: number
  currency: string
  destination: { method?: string; accountNumber?: string } | null
}

/** Mock disbursement: settle unless the destination uses the FAIL sentinel. */
function disburse(payout: PayoutRow): { ok: boolean; providerPayoutId: string; reason?: string } {
  const providerPayoutId = `mock_payout_${payout.id}`
  if (payout.destination?.accountNumber === 'FAIL') {
    return { ok: false, providerPayoutId, reason: 'simulated disbursement failure' }
  }
  return { ok: true, providerPayoutId }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  if (!PAYOUT_WORKER_SECRET || req.headers.get('x-worker-secret') !== PAYOUT_WORKER_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Escrow (backlog #14, Option B): release matured, dispute-free holds to
  // seller_payable BEFORE disbursing, so freshly-matured proceeds are withdrawable
  // in the same run. Best-effort — if release_matured_escrow() isn't deployed yet
  // (the escrow migration is staged, applied during the pilot), this is a no-op and
  // must never block payouts. Uses the same worker/service-role auth.
  let escrowReleased = 0
  try {
    const { data: released, error: releaseErr } = await supabase.rpc('release_matured_escrow')
    if (releaseErr) {
      console.error('release_matured_escrow failed (continuing):', releaseErr.message)
    } else {
      escrowReleased = Number(released) || 0
    }
  } catch (e) {
    console.error('release_matured_escrow threw (continuing):', (e as Error).message)
  }

  const { data: pending, error } = await supabase
    .from('payout_requests')
    .select('id, amount, currency, destination')
    .eq('status', 'requested')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const results: Array<{ id: string; status: string }> = []
  for (const payout of (pending ?? []) as PayoutRow[]) {
    // Claim it (requested -> processing). mark_payout_processing returns true only
    // if THIS call won the atomic transition. If two runs overlap (cron overlap),
    // both may SELECT the same 'requested' row, but only one claims it — the other
    // gets false and MUST skip, or the payout would be disbursed twice.
    const { data: claimed, error: claimErr } = await supabase.rpc('mark_payout_processing', {
      p_payout_id: payout.id,
    })
    if (claimErr || claimed !== true) {
      results.push({ id: payout.id, status: 'skipped_not_claimed' })
      continue
    }

    const outcome = disburse(payout)
    if (outcome.ok) {
      await supabase.rpc('mark_payout_settled', {
        p_payout_id: payout.id,
        p_provider_payout_id: outcome.providerPayoutId,
      })
      results.push({ id: payout.id, status: 'settled' })
    } else {
      await supabase.rpc('mark_payout_failed', { p_payout_id: payout.id, p_reason: outcome.reason })
      results.push({ id: payout.id, status: 'failed' })
    }
  }

  return new Response(JSON.stringify({ escrowReleased, processed: results.length, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
