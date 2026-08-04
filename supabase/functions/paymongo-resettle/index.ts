// Supabase Edge Function: paymongo-resettle (P1 — heal orphaned paid intents)
//
// Companion to paymongo-reconcile. Where reconcile only REPORTS discrepancies,
// this SETTLES the 'provider_paid_local_unsettled' ones: a payment PayMongo
// confirmed as paid but whose payment_intent is still 'pending' locally (a
// missed/failed webhook). It re-verifies each intent against PayMongo first and
// settles ONLY genuinely-paid ones, through the exact same idempotent RPCs the
// webhook uses — so it can't create money out of an unpaid intent and is safe to
// re-run.
//
// Not public. Secret-gated via RECONCILE_WORKER_SECRET (falls back to
// PAYOUT_WORKER_SECRET), sent as `x-worker-secret`.
//
// Input:  { intent_ids: string[] }              — heal specific intents, OR
//         { lookback_days?: number, limit?: number } — auto-heal all stuck ones.
// Output: { success, healed, results: [{ intent_id, purpose, outcome, detail }] }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PAYMONGO_SECRET_KEY = Deno.env.get('PAYMONGO_SECRET_KEY') || ''
const PAYMONGO_API_URL = 'https://api.paymongo.com/v1'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const RECONCILE_WORKER_SECRET =
  Deno.env.get('RECONCILE_WORKER_SECRET') || Deno.env.get('PAYOUT_WORKER_SECRET') || ''

const authHeader = () => ({
  Authorization: `Basic ${btoa(PAYMONGO_SECRET_KEY + ':')}`,
  'Content-Type': 'application/json',
})

interface ProviderSettlement {
  paid: boolean
  amount: number | null // currency units
  paymentId: string | null
  paymentMethod: string | null // 'card' | 'gcash' | 'maya' | 'grab_pay'
  error?: string
}

/**
 * Normalise PayMongo's payment method to the vocabulary the rest of the system
 * uses. Kept in step with resolvePaymentMethod() in paymongo-webhook — a healed
 * intent must settle with the same escrow window as one settled by the webhook,
 * or the hold a seller gets depends on which path happened to fulfil it.
 */
const PAYMENT_METHOD_ALIASES: Record<string, string> = {
  card: 'card',
  credit_card: 'card',
  debit_card: 'card',
  gcash: 'gcash',
  paymaya: 'maya',
  maya: 'maya',
  grab_pay: 'grab_pay',
}

function resolvePaymentMethod(attrs: any): string | null {
  const raw =
    attrs?.payment_method_used ??
    attrs?.payment_method_type ??
    attrs?.payment_method?.type ??
    attrs?.source?.type ??
    attrs?.payment_method_details?.type ??
    null
  if (!raw || typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase()
  return PAYMENT_METHOD_ALIASES[key] ?? key
}

/** Ask PayMongo whether a checkout session is paid, and get its payment id. */
async function getProviderSettlement(sessionId: string): Promise<ProviderSettlement> {
  const res = await fetch(`${PAYMONGO_API_URL}/checkout_sessions/${sessionId}`, {
    method: 'GET',
    headers: authHeader(),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return { paid: false, amount: null, paymentId: null, paymentMethod: null, error: err?.errors?.[0]?.detail || `session lookup ${res.status}` }
  }
  const data = await res.json()
  const sessionAttrs = data?.data?.attributes ?? {}
  // The method can arrive at either level: the payment resource carries it as
  // `source.type`, the checkout session as `payment_method_used`. Read the
  // session once here so a payment resource that omits it still settles with
  // the right escrow window rather than silently falling back to the card hold.
  const sessionMethod = resolvePaymentMethod(sessionAttrs)
  const payments = sessionAttrs.payments ?? []
  if (!Array.isArray(payments) || payments.length === 0) {
    return { paid: false, amount: null, paymentId: null, paymentMethod: null }
  }
  for (const p of payments) {
    let attrs = p?.attributes
    const paymentId = typeof p?.id === 'string' ? p.id : null
    if (!attrs && paymentId) {
      const pr = await fetch(`${PAYMONGO_API_URL}/payments/${paymentId}`, { method: 'GET', headers: authHeader() })
      if (pr.ok) attrs = (await pr.json())?.data?.attributes
    }
    if (attrs?.status === 'paid') {
      return {
        paid: true,
        amount: (Number(attrs.amount) || 0) / 100,
        paymentId,
        paymentMethod: resolvePaymentMethod(attrs) ?? sessionMethod,
      }
    }
  }
  return { paid: false, amount: null, paymentId: null, paymentMethod: null }
}

/** Settle one already-loaded, PayMongo-confirmed-paid intent by its purpose. */
async function settleIntent(
  supabase: any,
  intent: any,
  paymentId: string | null,
  paymentMethod: string | null = null,
): Promise<{ outcome: string; detail?: string; transactionId?: string }> {
  const purpose = intent.purpose

  if (purpose === 'marketplace_purchase') {
    // Record the real method before settling, exactly as the webhook does: the
    // RPC reads it for the escrow hold window and for
    // credit_transactions.payment_method. Best-effort — it must never stop a
    // confirmed-paid intent from being healed, and the RPC falls back to the
    // intent's `provider` (the conservative card window) when it is absent.
    if (paymentMethod) {
      const { error: methodErr } = await supabase
        .from('payment_intents')
        .update({ payment_method: paymentMethod })
        .eq('id', intent.id)
      if (methodErr) {
        console.warn('could not record payment method (continuing):', methodErr.message)
      }
    }

    // process_marketplace_purchase is idempotent (returns the existing txn if the
    // intent is already paid) and marks the intent paid itself.
    const { data: txnId, error } = await supabase.rpc('process_marketplace_purchase', {
      p_payment_intent_id: intent.id,
      p_provider_payment_id: paymentId,
    })
    if (error) return { outcome: 'error', detail: error.message }
    return { outcome: 'settled', transactionId: txnId }
  }

  if (purpose === 'subscription') {
    const planKey = intent.metadata?.plan
    if (!planKey) return { outcome: 'error', detail: 'subscription intent missing plan' }
    const { error } = await supabase.rpc('activate_subscription', {
      p_user_id: intent.user_id,
      p_plan: planKey,
    })
    if (error) return { outcome: 'error', detail: error.message }
    await supabase
      .from('payment_intents')
      .update({ status: 'paid', provider_payment_id: paymentId, updated_at: new Date().toISOString() })
      .eq('id', intent.id)
    return { outcome: 'settled', detail: `plan ${planKey}` }
  }

  if (purpose === 'wallet_topup') {
    // Guard against double-credit: if a wallet_transactions row already exists for
    // this session, treat as already settled.
    const { data: existingWt } = await supabase
      .from('wallet_transactions')
      .select('id')
      .eq('external_reference', intent.provider_session_id)
      .maybeSingle()
    if (existingWt) {
      await supabase.from('payment_intents').update({ status: 'paid', updated_at: new Date().toISOString() }).eq('id', intent.id)
      return { outcome: 'already_paid', detail: 'wallet already credited' }
    }
    const amount = Number(intent.amount)
    const { error: balErr } = await supabase.rpc('update_wallet_balance_atomic', {
      p_user_id: intent.user_id,
      p_amount: amount,
      p_operation: 'add',
    })
    if (balErr) return { outcome: 'error', detail: balErr.message }
    try {
      const { data: wallet } = await supabase
        .from('wallet_accounts')
        .select('id')
        .eq('user_id', intent.user_id)
        .single()
      if (wallet) {
        await supabase.from('wallet_transactions').insert({
          account_id: wallet.id,
          user_id: intent.user_id,
          type: 'deposit',
          amount,
          status: 'completed',
          payment_method: 'paymongo',
          description: 'Wallet top-up via PayMongo (resettled)',
          reference_id: `pm_${paymentId}`,
          external_reference: intent.provider_session_id,
        })
      }
    } catch (_e) {
      // non-critical audit row
    }
    await supabase
      .from('payment_intents')
      .update({ status: 'paid', provider_payment_id: paymentId, updated_at: new Date().toISOString() })
      .eq('id', intent.id)
    return { outcome: 'settled', detail: `credited ${amount}` }
  }

  return { outcome: 'error', detail: `unsupported purpose: ${purpose}` }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }
  if (!RECONCILE_WORKER_SECRET || req.headers.get('x-worker-secret') !== RECONCILE_WORKER_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }
  if (!PAYMONGO_SECRET_KEY) {
    return new Response(JSON.stringify({ error: 'PAYMONGO_SECRET_KEY not set' }), { status: 500 })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Resolve the target intents: explicit ids, or auto-discover stuck ones.
    let query = supabase
      .from('payment_intents')
      .select('id, status, amount, currency, purpose, user_id, metadata, provider_session_id')
      .not('provider_session_id', 'is', null)
      .neq('status', 'paid')

    if (Array.isArray(body.intent_ids) && body.intent_ids.length > 0) {
      query = query.in('id', body.intent_ids.slice(0, 200))
    } else {
      const lookbackDays = Math.min(Math.max(Number(body.lookback_days) || 30, 1), 90)
      const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 500)
      const sinceIso = new Date(Date.now() - lookbackDays * 86400_000).toISOString()
      query = query.gte('created_at', sinceIso).order('created_at', { ascending: false }).limit(limit)
    }

    const { data: intents, error: intentErr } = await query
    if (intentErr) throw new Error(`payment_intents query failed: ${intentErr.message}`)

    const results: any[] = []
    let healed = 0

    for (const intent of intents || []) {
      const provider = await getProviderSettlement(intent.provider_session_id)
      if (provider.error) {
        results.push({ intent_id: intent.id, purpose: intent.purpose, outcome: 'provider_lookup_failed', detail: provider.error })
        continue
      }
      if (!provider.paid) {
        // Never settle an intent PayMongo does not actually show as paid.
        results.push({ intent_id: intent.id, purpose: intent.purpose, outcome: 'skipped_unpaid' })
        continue
      }
      const r = await settleIntent(supabase, intent, provider.paymentId, provider.paymentMethod)
      if (r.outcome === 'settled') healed++
      results.push({ intent_id: intent.id, purpose: intent.purpose, ...r })
    }

    return new Response(
      JSON.stringify({ success: true, considered: (intents || []).length, healed, results }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error)?.message || 'Resettle failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }
})
