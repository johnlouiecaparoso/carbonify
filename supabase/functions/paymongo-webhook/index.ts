/**
 * PayMongo Webhook Handler
 * 
 * This Edge Function receives webhooks from PayMongo when payments are completed.
 * It verifies the payment and updates wallet balances securely on the server-side.
 * 
 * Setup:
 * 1. Deploy this function: supabase functions deploy paymongo-webhook
 * 2. Get the function URL: https://YOUR_PROJECT.supabase.co/functions/v1/paymongo-webhook
 * 3. Configure in PayMongo Dashboard: Settings > Webhooks > Add webhook
 * 4. Webhook URL: https://YOUR_PROJECT.supabase.co/functions/v1/paymongo-webhook
 * 5. Events to subscribe: checkout.payment.paid
 * 
 * Security:
 * - Verifies webhook signature from PayMongo
 * - Only processes 'checkout.payment.paid' events
 * - Uses atomic database operations
 * - Idempotent (won't process same payment twice)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PAYMONGO_SECRET_KEY = Deno.env.get('PAYMONGO_SECRET_KEY') || ''
const PAYMONGO_WEBHOOK_SECRET = Deno.env.get('PAYMONGO_WEBHOOK_SECRET') || ''
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

// Allow unsigned webhooks ONLY when explicitly opted in (local dev). Default
// is fail-closed: no secret + no opt-in => reject.
const ALLOW_UNSIGNED_WEBHOOKS = Deno.env.get('ALLOW_UNSIGNED_WEBHOOKS') === 'true'
// Reject events whose signed timestamp is older/newer than this (replay guard).
const SIGNATURE_TOLERANCE_SECONDS = 300

interface SignatureCheck {
  ok: boolean
  reason?: string
}

/** Lowercase hex HMAC-SHA256 digest. */
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Constant-time string compare. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

/**
 * Verify a PayMongo webhook signature with replay protection.
 *
 * Header format: `t=<unix_seconds>,te=<test_sig>,li=<live_sig>`.
 * Signed message is `${t}.${rawBody}`, HMAC-SHA256 with the webhook secret,
 * hex-encoded. We compare against li (live) then te (test).
 */
async function verifyWebhookSignature(
  payload: string,
  signatureHeader: string,
  secret: string,
  nowSeconds: number,
): Promise<SignatureCheck> {
  if (!secret) {
    if (ALLOW_UNSIGNED_WEBHOOKS) {
      console.warn('PAYMONGO_WEBHOOK_SECRET not set; ALLOW_UNSIGNED_WEBHOOKS=true - accepting unsigned (DEV ONLY)')
      return { ok: true }
    }
    return { ok: false, reason: 'PAYMONGO_WEBHOOK_SECRET not configured' }
  }
  if (!signatureHeader) {
    return { ok: false, reason: 'missing signature header' }
  }

  const parts: Record<string, string> = {}
  for (const kv of signatureHeader.split(',')) {
    const [k, v] = kv.split('=').map((s) => s.trim())
    if (k && v) parts[k] = v
  }

  const timestamp = parts.t
  const provided = parts.li || parts.te
  if (!timestamp || !provided) {
    return { ok: false, reason: 'malformed signature header' }
  }

  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(nowSeconds - ts) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'timestamp outside tolerance (possible replay)' }
  }

  const expected = await hmacSha256Hex(secret, `${timestamp}.${payload}`)
  return timingSafeEqual(expected, provided)
    ? { ok: true }
    : { ok: false, reason: 'signature mismatch' }
}

/**
 * The method the customer actually paid with, normalised to the vocabulary the
 * rest of the system uses ('card' | 'gcash' | 'maya' | 'grab_pay').
 *
 * PayMongo puts this in a different place depending on the resource shape, so
 * every known location is tried before giving up. Returns null when none of
 * them carry it — the settlement RPC then falls back to the intent's `provider`
 * and applies the conservative card hold window, which is the pre-existing
 * behaviour.
 *
 * This exists because `payment_intents.provider` is the GATEWAY and is always
 * 'paymongo'. Settling on it made the escrow method-gate dead code (every sale,
 * including GCash and Maya, took the 7-day card hold) and wrote 'paymongo' into
 * credit_transactions.payment_method for every online purchase.
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

function resolvePaymentMethod(payment: any): string | null {
  const attrs = payment?.attributes ?? payment ?? {}
  const raw =
    attrs.payment_method_used ??
    attrs.payment_method_type ??
    attrs.payment_method?.type ??
    attrs.source?.type ??
    attrs.payment_method_details?.type ??
    null
  if (!raw || typeof raw !== 'string') return null
  const key = raw.trim().toLowerCase()
  // Pass an unrecognised value through rather than dropping it: an unknown
  // method is still better evidence than 'paymongo', and the RPC's escrow gate
  // treats anything it does not recognise as a card (the safe default).
  return PAYMENT_METHOD_ALIASES[key] ?? key
}

/** Mark a recorded webhook event as fully processed (best-effort). */
async function markEventProcessed(supabase: any, eventId: string) {
  try {
    await supabase
      .from('webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('provider', 'paymongo')
      .eq('event_id', eventId)
  } catch (err) {
    console.warn('Failed to mark webhook event processed:', (err as Error)?.message)
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Phase 3 — supplier fulfillment saga (TS port of src/services/credits/
// fulfillmentSaga.js; keep the two in sync). Runs only for 'supplier'-sourced
// purchases, AFTER process_marketplace_purchase has committed. On supplier
// failure it calls the idempotent refund_purchase RPC to compensate.
// No real vendor SDK exists yet, so it uses a deterministic mock supplier
// (CREDIT_SUPPLIER defaults to 'mock').
// ───────────────────────────────────────────────────────────────────────────
// Must match MAX_ATTEMPTS in src/services/credits/fulfillmentSaga.js. The two
// copies drifted on exactly this constant: the JS one has always capped retries,
// the port never did.
const MAX_FULFILLMENT_ATTEMPTS = 3

let _mockOrderSeq = 0
function mockPlaceOrder(referenceId: string, quantity: number) {
  if (!(quantity > 0)) throw new Error('placeOrder requires a positive quantity')
  const n = ++_mockOrderSeq
  return { orderId: `mock_order_${n}_${referenceId}`, registrySerial: `ECO-MOCK-REG-${n}` }
}
function mockRetire(orderId: string, registrySerial: string) {
  return { registrySerial, retirementReceiptUrl: `https://mock.local/registry/retire/${orderId}` }
}

async function runFulfillment(
  supabase: any,
  opts: { transactionId: string; quantity: number; certificateId: string | null },
): Promise<{ status: string; error?: string }> {
  const { transactionId, quantity, certificateId } = opts
  const supplierId = (Deno.env.get('CREDIT_SUPPLIER') || 'mock').trim()

  // 1) Ensure a supplier_orders row (idempotent on transaction_id).
  await supabase.from('supplier_orders').upsert(
    { transaction_id: transactionId, certificate_id: certificateId, quantity, supplier_id: supplierId, status: 'pending' },
    { onConflict: 'transaction_id', ignoreDuplicates: true },
  )
  const { data: order, error: orderError } = await supabase
    .from('supplier_orders')
    .select('*')
    .eq('transaction_id', transactionId)
    .single()

  // A failed LOOKUP is not an absent order. This used to destructure `data`
  // only, so a transient read error left `order` undefined — and the placeOrder
  // branch below begins `if (!order || ...)`, so the saga would place a SECOND
  // supplier order for a transaction that already had one. That defeats the
  // `transaction_id UNIQUE` key and the whole idempotency design, which exist
  // precisely because PayMongo retries webhooks.
  //
  // Bail instead. The webhook is retried, and a resumed run reads the existing
  // row and continues from its real state.
  if (orderError) {
    return { status: 'failed', error: `supplier_orders lookup failed: ${orderError.message}` }
  }

  if (order && (order.status === 'retired' || order.status === 'refunded')) {
    return { status: order.status }
  }

  // Stop after MAX_ATTEMPTS. Without this the live saga retried a failing
  // supplier without limit on every webhook redelivery, incrementing `attempts`
  // forever with nothing to stop it. The JS copy has had this cap since it was
  // written; the port never received it.
  if ((order?.attempts ?? 0) >= MAX_FULFILLMENT_ATTEMPTS) {
    return { status: 'failed', error: 'max fulfillment attempts exceeded' }
  }

  const patch = async (p: Record<string, unknown>) =>
    supabase
      .from('supplier_orders')
      .update({ ...p, updated_at: new Date().toISOString() })
      .eq('transaction_id', transactionId)

  const compensate = async (reason: string) => {
    await patch({ status: 'failed', last_error: reason })
    const { error } = await supabase.rpc('refund_purchase', {
      p_transaction_id: transactionId,
      p_reason: `Auto-refund (supplier fulfillment): ${reason}`,
    })
    if (error) return { status: 'failed', error: reason }
    await patch({ status: 'refunded' })
    return { status: 'refunded', error: reason }
  }

  // 2) placeOrder
  let registrySerial = order?.registry_serial as string | null
  let supplierOrderId = order?.supplier_order_id as string | null
  if (!order || order.status === 'pending' || order.status === 'failed') {
    try {
      const placed = mockPlaceOrder(transactionId, quantity)
      registrySerial = placed.registrySerial
      supplierOrderId = placed.orderId
      await patch({
        status: 'ordered',
        supplier_order_id: supplierOrderId,
        registry_serial: registrySerial,
        attempts: (order?.attempts ?? 0) + 1,
      })
    } catch (err) {
      return compensate((err as Error)?.message || 'placeOrder failed')
    }
  }

  // 3) retire
  let retirementReceiptUrl: string | null = null
  try {
    const retired = mockRetire(supplierOrderId as string, registrySerial as string)
    retirementReceiptUrl = retired.retirementReceiptUrl
    await patch({ status: 'retired', retirement_receipt_url: retirementReceiptUrl })
  } catch (err) {
    return compensate((err as Error)?.message || 'retire failed')
  }

  // 4) Persist registry info onto the certificate (non-critical).
  if (certificateId) {
    try {
      await supabase
        .from('certificates')
        .update({ registry_serial: registrySerial, registry_receipt_url: retirementReceiptUrl })
        .eq('id', certificateId)
    } catch (err) {
      console.warn('attachRegistryInfo failed (non-critical):', (err as Error)?.message)
    }
  }

  return { status: 'retired' }
}

// Fetch the quantity + listing source for a settled transaction, and any
// certificate already generated for it.
async function loadFulfillmentContext(supabase: any, transactionId: string) {
  const { data: txn } = await supabase
    .from('credit_transactions')
    .select('id, quantity, listing_id')
    .eq('id', transactionId)
    .single()
  if (!txn) return null

  let source = 'local'
  if (txn.listing_id) {
    const { data: listing } = await supabase
      .from('credit_listings')
      .select('source')
      .eq('id', txn.listing_id)
      .single()
    source = listing?.source || 'local'
  }

  let certificateId: string | null = null
  try {
    const { data: certs } = await supabase
      .from('certificates')
      .select('id')
      .eq('transaction_id', transactionId)
      .limit(1)
    certificateId = certs?.[0]?.id ?? null
  } catch (err) {
    console.warn('certificate lookup failed (non-critical):', (err as Error)?.message)
  }

  return { quantity: Number(txn.quantity) || 0, source, certificateId }
}

serve(async (req) => {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Hoisted so the catch block can record the failure against the event row for
  // DB-visible diagnosis (otherwise a thrown handler leaves webhook_events at
  // 'received' with error=null and PayMongo just retries silently).
  let dbClient: any = null
  let currentEventId: string | null = null

  try {
    // PayMongo sends the signature in the `paymongo-signature` header.
    const signature =
      req.headers.get('paymongo-signature') || req.headers.get('x-paymongo-signature') || ''
    const payload = await req.text()
    const webhookData = JSON.parse(payload)

    console.log('ðŸ“¥ Webhook received:', {
      type: webhookData.type,
      event: webhookData.data?.attributes?.type ?? webhookData.data?.attributes?.event,
    })

    // Verify webhook signature (HMAC-SHA256) with replay protection.
    const nowSeconds = Math.floor(Date.now() / 1000)
    const sigCheck = await verifyWebhookSignature(payload, signature, PAYMONGO_WEBHOOK_SECRET, nowSeconds)
    if (!sigCheck.ok) {
      console.error('âŒ Invalid webhook signature')
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // PayMongo nests the event name at data.attributes.type (e.g.
    // 'checkout_session.payment.paid'); some older docs call it
    // 'checkout.payment.paid'. Accept the known paid-event names so a webhook
    // registered either way still settles; anything else is acknowledged + ignored.
    const eventType = webhookData.data?.attributes?.type ?? webhookData.data?.attributes?.event
    if (![
      'checkout_session.payment.paid',
      'checkout.payment.paid',
      'payment.paid',
    ].includes(eventType)) {
      console.log('â„¹ï¸ Ignoring event type:', eventType)
      return new Response(JSON.stringify({ message: 'Event ignored' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // The event resource is the checkout_session; the settled payment lives in
    // its `payments` array. Fall back to the resource itself if PayMongo ever
    // delivers a bare payment object.
    const resource = webhookData.data?.attributes?.data
    const resourceAttrs = resource?.attributes ?? {}
    const payment = resourceAttrs.payments?.[0] ?? resource
    const sessionId = resource?.id // cs_... checkout session id (used as payment_reference)
    const paymentId = payment?.id ?? sessionId // pay_... provider payment reference
    // Metadata (incl. payment_intent_id) is set on the checkout session at creation.
    const metadata = resourceAttrs.metadata ?? payment?.attributes?.metadata ?? {}

    if (!paymentId) {
      throw new Error('Missing payment id in webhook payload')
    }

    // Initialize Supabase client with service role (bypasses RLS)
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    dbClient = supabase

    // Event-level idempotency. Record the event keyed by (provider, event_id).
    // A unique-violation means we've seen it before: short-circuit ONLY if the
    // prior attempt actually finished (status 'processed'); otherwise fall
    // through and (re)process — PayMongo retries unacknowledged events.
    const eventId = webhookData.data?.id || paymentId
    currentEventId = eventId
    const { error: dedupError } = await supabase.from('webhook_events').insert({
      provider: 'paymongo',
      event_id: eventId,
      event_type: eventType,
      payload: webhookData,
      status: 'received',
    })
    if (dedupError) {
      if (dedupError.code === '23505') {
        const { data: prior } = await supabase
          .from('webhook_events')
          .select('status')
          .eq('provider', 'paymongo')
          .eq('event_id', eventId)
          .single()
        if (prior?.status === 'processed') {
          console.log('Duplicate webhook event ignored:', eventId)
          return new Response(
            JSON.stringify({ success: true, message: 'Already processed (duplicate event)' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
      } else {
        // Table missing / other error: log and continue. Per-handler idempotency
        // (below) still prevents double-crediting until the migration is applied.
        console.warn('webhook_events insert failed (continuing):', dedupError.message)
      }
    }

    // The only supported settlement path is a recorded payment_intent (set on
    // the checkout session at creation). Legacy metadata-driven paths
    // (transaction_id / method-based wallet top-up) have been removed.
    const paymentIntentId = metadata.payment_intent_id

    // Server-authoritative marketplace purchase (Phase 1.2/1.5): the checkout
    // recorded a payment_intent; settle it atomically (decrement + ownership +
    // ledger) via the RPC. This is the source of truth, not the callback page.
    if (paymentIntentId) {
      // Subscription intents activate a plan instead of settling a purchase.
      // The plan + user come from the stored intent (authoritative), not the
      // webhook metadata.
      const { data: intentRow } = await supabase
        .from('payment_intents')
        .select('purpose, user_id, status, metadata, amount')
        .eq('id', paymentIntentId)
        .single()

      // Wallet top-up (Phase 1 P5): credit the balance server-side (source of
      // truth), record a completed wallet_transactions row keyed on the checkout
      // session id (so the callback's waitForWebhookTransaction finds it).
      if (intentRow?.purpose === 'wallet_topup') {
        // Idempotency claim. update_wallet_balance_atomic('add') is NOT idempotent,
        // and an in-memory status read is not a guard: PayMongo delivers both
        // checkout_session.payment.paid AND payment.paid (distinct event ids, so
        // both clear event-level dedup), and may retry concurrently — all reading
        // the intent as still unpaid. Claim the credit by atomically flipping the
        // intent to 'paid' ONLY if it isn't already, and credit only if THIS call
        // won the transition. Concurrent updates serialize on the row lock: the
        // loser matches 0 rows and short-circuits.
        const { data: claimed, error: claimErr } = await supabase
          .from('payment_intents')
          .update({
            status: 'paid',
            provider_payment_id: paymentId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', paymentIntentId)
          .neq('status', 'paid')
          .select('id')
        if (claimErr) {
          // Leave the event unprocessed so PayMongo retries.
          throw new Error(`wallet top-up claim failed: ${claimErr.message}`)
        }
        if (!claimed || claimed.length === 0) {
          await markEventProcessed(supabase, eventId)
          return new Response(
            JSON.stringify({ success: true, message: 'Top-up already credited' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const topupAmount = Number(intentRow.amount)
        const { error: balErr } = await supabase.rpc('update_wallet_balance_atomic', {
          p_user_id: intentRow.user_id,
          p_amount: topupAmount,
          p_operation: 'add',
        })
        if (balErr) {
          // Crediting failed after we claimed: release the claim so PayMongo
          // retries this delivery, otherwise the paid top-up would never credit.
          await supabase
            .from('payment_intents')
            .update({ status: intentRow.status, updated_at: new Date().toISOString() })
            .eq('id', paymentIntentId)
          throw new Error(`wallet top-up failed: ${balErr.message}`)
        }

        try {
          const { data: wallet } = await supabase
            .from('wallet_accounts')
            .select('id')
            .eq('user_id', intentRow.user_id)
            .single()
          if (wallet) {
            const { data: existingWt } = await supabase
              .from('wallet_transactions')
              .select('id')
              .eq('external_reference', sessionId)
              .maybeSingle()
            if (!existingWt) {
              await supabase.from('wallet_transactions').insert({
                account_id: wallet.id,
                user_id: intentRow.user_id,
                type: 'deposit',
                amount: topupAmount,
                status: 'completed',
                payment_method: 'paymongo',
                description: 'Wallet top-up via PayMongo',
                reference_id: `pm_${paymentId}`,
                external_reference: sessionId,
              })
            }
          }
        } catch (err) {
          console.warn('wallet_transactions record failed (non-critical):', (err as Error)?.message)
        }

        // Intent was already flipped to 'paid' by the idempotency claim above.
        await markEventProcessed(supabase, eventId)
        return new Response(
          JSON.stringify({ success: true, message: 'Wallet topped up', amount: topupAmount }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (intentRow?.purpose === 'subscription') {
        // Idempotency claim — the same pattern as the wallet top-up above, and
        // for the same reason. activate_subscription() is ADDITIVE: it extends
        // from greatest(now(), plan_expires_at), so running it twice for one
        // payment grants two periods. Reading intentRow.status and then acting
        // is not a guard — PayMongo delivers both checkout_session.payment.paid
        // AND payment.paid with distinct event ids, so both clear event-level
        // dedup and can race, each seeing the intent as still unpaid. Claim by
        // atomically flipping to 'paid' only if it isn't already; the loser
        // matches 0 rows and short-circuits.
        const { data: claimed, error: claimErr } = await supabase
          .from('payment_intents')
          .update({
            status: 'paid',
            provider_payment_id: paymentId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', paymentIntentId)
          .neq('status', 'paid')
          .select('id')
        if (claimErr) {
          // Leave the event unprocessed so PayMongo retries.
          throw new Error(`subscription claim failed: ${claimErr.message}`)
        }
        if (!claimed || claimed.length === 0) {
          await markEventProcessed(supabase, eventId)
          return new Response(
            JSON.stringify({ success: true, message: 'Subscription already active' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const planKey = intentRow.metadata?.plan
        const { data: newExpiry, error: subErr } = await supabase.rpc('activate_subscription', {
          p_user_id: intentRow.user_id,
          p_plan: planKey,
        })
        if (subErr) {
          // Activation failed after we claimed: release the claim so PayMongo's
          // retry can grant it, otherwise a paid plan would never activate.
          await supabase
            .from('payment_intents')
            .update({ status: intentRow.status, updated_at: new Date().toISOString() })
            .eq('id', paymentIntentId)
          throw new Error(`activate_subscription failed: ${subErr.message}`)
        }

        await markEventProcessed(supabase, eventId)
        return new Response(
          JSON.stringify({ success: true, message: 'Subscription activated', plan: planKey, expiresAt: newExpiry }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      if (intentRow?.purpose === 'project_fee') {
        // Same claim pattern, one layer of belt-and-braces lighter than it looks:
        // mark_project_fee_paid is itself idempotent (it refuses any invoice that
        // is not 'due'), so a duplicate delivery could not double-book revenue
        // even without this. The claim is still worth having because it keeps the
        // INTENT's status honest — without it the loser of a race would fall
        // through and be reported as unsettled.
        const { data: claimed, error: claimErr } = await supabase
          .from('payment_intents')
          .update({
            status: 'paid',
            provider_payment_id: paymentId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', paymentIntentId)
          .neq('status', 'paid')
          .select('id')
        if (claimErr) {
          throw new Error(`project fee claim failed: ${claimErr.message}`)
        }
        if (!claimed || claimed.length === 0) {
          await markEventProcessed(supabase, eventId)
          return new Response(
            JSON.stringify({ success: true, message: 'Fee already settled' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }

        const invoiceId = intentRow.metadata?.invoice_id
        if (!invoiceId) {
          // The intent was created without the one field that says what it pays
          // for. Releasing the claim would only produce an identical retry, so
          // fail loudly instead of looping: this is a bug in checkout, not a
          // transient fault.
          throw new Error(`project_fee intent ${paymentIntentId} has no invoice_id in metadata`)
        }

        const { error: feeErr } = await supabase.rpc('mark_project_fee_paid', {
          p_invoice_id: invoiceId,
          p_intent_id: paymentIntentId,
        })
        if (feeErr) {
          // Booking failed after we claimed: release so PayMongo retries,
          // otherwise a paid fee would never reach the ledger.
          await supabase
            .from('payment_intents')
            .update({ status: intentRow.status, updated_at: new Date().toISOString() })
            .eq('id', paymentIntentId)
          throw new Error(`mark_project_fee_paid failed: ${feeErr.message}`)
        }

        await markEventProcessed(supabase, eventId)
        return new Response(
          JSON.stringify({ success: true, message: 'Project fee settled', invoiceId }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      // Record the real payment method on the intent BEFORE settling. The RPC
      // reads it for the escrow hold window and writes it to
      // credit_transactions.payment_method. Best-effort on purpose: a failure
      // here must not block a paid purchase from settling, and the RPC falls
      // back to `provider` (the conservative card window) when it is absent.
      //
      // Two lookups, because the method can arrive at either level: the payment
      // resource carries it as `source.type`, while the checkout SESSION carries
      // it as `payment_method_used`. `payment` falls back to the bare resource
      // when there is no `payments` array, in which case both lookups read the
      // same object and the second is a no-op.
      const resolvedMethod =
        resolvePaymentMethod(payment) ?? resolvePaymentMethod(resourceAttrs)
      if (resolvedMethod) {
        const { error: methodErr } = await supabase
          .from('payment_intents')
          .update({ payment_method: resolvedMethod })
          .eq('id', paymentIntentId)
        if (methodErr) {
          console.warn('could not record payment method (continuing):', methodErr.message)
        }
      }

      const { data: txnId, error: rpcError } = await supabase.rpc('process_marketplace_purchase', {
        p_payment_intent_id: paymentIntentId,
        p_provider_payment_id: paymentId,
      })
      if (rpcError) {
        // Leave the event unprocessed so PayMongo retries.
        throw new Error(`process_marketplace_purchase failed: ${rpcError.message}`)
      }

      // Phase 3 — fulfill 'supplier'-sourced credits via the external registry.
      // Local credits need no external retirement. Saga failure is already
      // compensated by refund_purchase, so we still mark the event processed
      // (the purchase itself succeeded); leaving it unprocessed would thrash.
      let fulfillment = 'skipped'
      try {
        const ctx = txnId ? await loadFulfillmentContext(supabase, txnId) : null
        if (ctx && ctx.source === 'supplier') {
          const result = await runFulfillment(supabase, {
            transactionId: txnId,
            quantity: ctx.quantity,
            certificateId: ctx.certificateId,
          })
          fulfillment = result.status
        }
      } catch (err) {
        console.error('Fulfillment saga error (non-blocking):', (err as Error)?.message)
        fulfillment = 'error'
      }

      await markEventProcessed(supabase, eventId)
      return new Response(
        JSON.stringify({ success: true, message: 'Purchase settled', transactionId: txnId, fulfillment }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    // No payment_intent_id on the event → nothing actionable. Legacy
    // metadata-driven settlement paths (method-based wallet top-up,
    // transaction_id purchase) have been removed. Acknowledge + mark processed.
    {
      console.warn('âš ï¸ Unknown payment type or missing metadata')
      // Terminal: acknowledged (200 → no PayMongo retry) but no actionable
      // metadata, so nothing settles. Mark it processed so it doesn't linger at
      // 'received' and trip reconcile_financials()'s webhook_stuck check.
      await markEventProcessed(supabase, eventId)
      return new Response(JSON.stringify({
        success: false,
        message: 'Unknown payment type',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  } catch (error) {
    console.error('âŒ Webhook processing error:', error)
    const message = (error as Error)?.message || 'Webhook processing failed'
    // Persist the failure against the event row so it's diagnosable from SQL
    // (status stays 'received' so PayMongo keeps retrying and reconcile still
    // flags it as stuck). Best-effort — never mask the original error.
    if (dbClient && currentEventId) {
      try {
        await dbClient
          .from('webhook_events')
          .update({ error: message })
          .eq('provider', 'paymongo')
          .eq('event_id', currentEventId)
      } catch (persistErr) {
        console.warn('Failed to record webhook error:', (persistErr as Error)?.message)
      }
    }
    return new Response(JSON.stringify({
      error: message,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
