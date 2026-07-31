// Supabase Edge Function: account-deletion (Phase 5 — DPA erasure worker)
//
// Processes pending 'deletion' rows in data_subject_requests: removes the auth
// user (which cascades the app rows keyed to profiles.id via ON DELETE CASCADE)
// and marks the request completed. Deleting an auth user requires the service
// role, so this cannot run in the browser — it runs here, gated by a shared
// secret, invoked by an admin or on a schedule (cron). NOT public.
//
// Gated by ACCOUNT_DELETION_SECRET (sent as `x-worker-secret`).
//
// NOTE: financial/ledger rows that must be retained for legal/accounting reasons
// are NOT keyed to profiles with a cascade (e.g. credit_transactions, ledger_
// entries reference ids as bare/SET NULL), so completed transactions survive as
// required while personal/profile data is erased.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const ACCOUNT_DELETION_SECRET = Deno.env.get('ACCOUNT_DELETION_SECRET') || ''
const BATCH_SIZE = 10

interface DeletionRow {
  id: string
  user_id: string
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  if (
    !ACCOUNT_DELETION_SECRET ||
    req.headers.get('x-worker-secret') !== ACCOUNT_DELETION_SECRET
  ) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // Optional: process a single request id, else drain the pending queue.
  let onlyId: string | null = null
  try {
    const body = await req.json()
    onlyId = body?.requestId ?? null
  } catch {
    // no body — process the queue
  }

  let query = supabase
    .from('data_subject_requests')
    .select('id, user_id')
    .eq('request_type', 'deletion')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)
  if (onlyId) query = query.eq('id', onlyId)

  const { data: pending, error } = await query
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  const results: Array<{ id: string; status: string; error?: string }> = []
  for (const row of (pending ?? []) as DeletionRow[]) {
    // Claim it (pending -> in_progress) ATOMICALLY. The `.eq('status','pending')`
    // is what makes this a claim rather than a note: two overlapping runs can
    // both SELECT the same pending row, and an unconditional update let both
    // proceed to deleteUser(). The second call then failed with "User not
    // found" and the error path below reset the row to 'pending' — so a
    // successfully erased account was recorded as an outstanding erasure
    // request, forever, and retried on every subsequent run.
    //
    // This mirrors what mark_payout_processing() does for payouts: only the
    // caller that won the transition may act.
    const { data: claimed, error: claimErr } = await supabase
      .from('data_subject_requests')
      .update({ status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
    if (claimErr || !claimed || claimed.length === 0) {
      results.push({ id: row.id, status: 'skipped_not_claimed' })
      continue
    }

    // Delete the auth user — cascades profile-keyed personal data.
    const { error: delErr } = await supabase.auth.admin.deleteUser(row.user_id)

    if (delErr) {
      await supabase
        .from('data_subject_requests')
        .update({
          status: 'pending',
          notes: `Erasure failed: ${delErr.message}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      results.push({ id: row.id, status: 'failed', error: delErr.message })
      continue
    }

    await supabase
      .from('data_subject_requests')
      .update({
        status: 'completed',
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        notes: 'Account and personal data erased.',
      })
      .eq('id', row.id)
    results.push({ id: row.id, status: 'completed' })
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
