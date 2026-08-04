// Supabase Edge Function: PayMongo Checkout Session
// This runs server-side to create PayMongo checkout sessions securely

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PAYMONGO_SECRET_KEY = Deno.env.get('PAYMONGO_SECRET_KEY') || ''
const PAYMONGO_API_URL = 'https://api.paymongo.com/v1'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''

/**
 * P3 — Derive the caller's user id from their verified Supabase JWT rather than
 * trusting a client-supplied `user_id` in the request body.
 *
 * `supabase.functions.invoke` forwards the signed-in user's access token in the
 * Authorization header. We validate it here (getUser verifies the JWT signature)
 * and use the resulting id as authoritative. Returns null for anonymous/invalid
 * callers; callers decide whether to reject or fall back.
 */
async function getVerifiedUserId(req: Request): Promise<string | null> {
  const header = req.headers.get('Authorization') || req.headers.get('authorization') || ''
  const token = header.replace(/^Bearer\s+/i, '').trim()
  // Ignore the anon/service key sent as a bearer by the SDK when no user session
  // exists — it is not a user token and getUser would (correctly) reject it.
  if (!token || token === SUPABASE_ANON_KEY || token === SUPABASE_SERVICE_ROLE_KEY) {
    return null
  }
  try {
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data, error } = await authClient.auth.getUser(token)
    if (error) return null
    return data?.user?.id ?? null
  } catch {
    return null
  }
}

/**
 * A9 — application-level rate limit. Calls the atomic check_rate_limit RPC
 * (service role) before an expensive action. Returns true when the caller may
 * proceed, false when it should be throttled (429). Fails OPEN on any limiter
 * error so a limiter outage never blocks a legitimate checkout.
 */
async function underRateLimit(key: string, max: number, windowSeconds: number): Promise<boolean> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    })
    if (error) {
      console.warn('rate limit check failed (allowing):', error.message)
      return true
    }
    return data !== false
  } catch (e) {
    console.warn('rate limit check threw (allowing):', (e as Error)?.message)
    return true
  }
}

// Per-user cap on checkout-session creation (each call hits PayMongo).
const CHECKOUT_RATE_MAX = 20
const CHECKOUT_RATE_WINDOW_SECONDS = 300

// CORS headers required when invoking from browser (localhost or production).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
}

const authHeader = () => ({
  Authorization: `Basic ${btoa(PAYMONGO_SECRET_KEY + ':')}`,
  'Content-Type': 'application/json',
})

/** Verify a checkout session and return payment details (for callback page; keeps secret server-side). */
async function verifyCheckoutSession(sessionId: string) {
  const sessionRes = await fetch(`${PAYMONGO_API_URL}/checkout_sessions/${sessionId}`, {
    method: 'GET',
    headers: authHeader(),
  })
  if (!sessionRes.ok) {
    const err = await sessionRes.json().catch(() => ({}))
    throw new Error(err.errors?.[0]?.detail || 'Failed to retrieve checkout session')
  }
  const sessionData = await sessionRes.json()
  const paymentId =
    sessionData.data?.attributes?.payments?.[0]?.id ?? sessionData.data?.attributes?.payments?.[0]
  if (!paymentId) throw new Error('No payment found in session')

  const paymentRes = await fetch(`${PAYMONGO_API_URL}/payments/${paymentId}`, {
    method: 'GET',
    headers: authHeader(),
  })
  if (!paymentRes.ok) throw new Error('Failed to retrieve payment')
  const paymentData = await paymentRes.json()

  const attrs = paymentData.data?.attributes ?? {}
  let actualPaymentMethod = attrs.payment_method?.type ?? attrs.source?.type ?? attrs.payment_method_details?.type ?? 'unknown'
  const map: Record<string, string> = { card: 'card', credit_card: 'card', debit_card: 'card', gcash: 'gcash', paymaya: 'maya', grab_pay: 'grab_pay' }
  actualPaymentMethod = map[actualPaymentMethod] ?? actualPaymentMethod

  const payment = {
    id: paymentData.data?.id,
    amount: (attrs.amount ?? 0) / 100,
    currency: attrs.currency ?? 'PHP',
    status: attrs.status,
    description: attrs.description,
    fee: (attrs.fee ?? 0) / 100,
    payment_method: actualPaymentMethod,
  }

  // Deliberately NOT returning the raw `sessionData.data` blob. It carries the
  // payer's billing name / email / phone and the full line items, and nothing
  // in the app ever read it (PaymentCallbackView uses `payment`, PayMongoProvider
  // uses `payment` + `paymentMethod`). Returning it only widened what a
  // successful call discloses.
  return {
    success: payment.status === 'paid',
    payment,
    session: { id: sessionData.data?.id },
    paymentMethod: actualPaymentMethod,
  }
}

/**
 * Does `userId` own the checkout session `sessionId`?
 *
 * Every checkout this function creates records a payment_intent and then writes
 * the provider session id onto it, so the intent is the authoritative link
 * between a session and the account that started it.
 */
async function callerOwnsSession(sessionId: string, userId: string): Promise<boolean> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
  const { data, error } = await supabase
    .from('payment_intents')
    .select('id')
    .eq('provider_session_id', sessionId)
    .eq('user_id', userId)
    .limit(1)
  // Fail CLOSED: a lookup error must not read as "authorized".
  if (error) {
    console.warn('session ownership lookup failed (denying):', error.message)
    return false
  }
  return (data?.length ?? 0) > 0
}

/**
 * Server-authoritative marketplace checkout (Phase 1.2).
 *
 * The client sends ONLY { listing_id, quantity, origin, user_id, billing }.
 * The amount is recomputed here from credit_listings.price_per_credit — a
 * client-supplied amount is never trusted. We record a payment_intent (the
 * authoritative amount) before creating the PayMongo session.
 *
 * NOTE (hardening, tracked): user_id should be derived from the verified JWT
 * rather than the request body. The critical fix here is server-side AMOUNT.
 */
async function createMarketplaceCheckout(body: any, verifiedUserId: string | null) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const listingId = body.listing_id
  const quantity = Number(body.quantity)
  // P2: identity comes ONLY from the verified JWT. A client-supplied user_id is
  // never trusted, so a caller can't attribute a paid purchase to another
  // account. The app always forwards the signed-in user's token via
  // supabase.functions.invoke, so legitimate checkout is unaffected.
  if (!verifiedUserId) throw new Error('Authentication required to check out')
  const userId = verifiedUserId
  const origin = typeof body.origin === 'string' ? body.origin.replace(/\/$/, '') : ''

  if (!listingId || !Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('listing_id and a positive quantity are required')
  }

  const { data: listing, error: listingErr } = await supabase
    .from('credit_listings')
    .select('id, price_per_credit, quantity, currency, status, seller_id')
    .eq('id', listingId)
    .single()

  if (listingErr || !listing) throw new Error('Listing not found')
  if (listing.status !== 'active') throw new Error('Listing is not active')
  if (quantity > Number(listing.quantity)) {
    throw new Error('Requested quantity exceeds availability')
  }

  const unitAmount = Number(listing.price_per_credit)
  if (!Number.isFinite(unitAmount) || unitAmount <= 0) {
    throw new Error('Listing has no valid price')
  }
  // Record the intent amount as EXACTLY what PayMongo will charge: per-unit
  // centavos (rounded once) times quantity. Computing it as round(unit*qty) instead
  // can differ by a centavo for sub-centavo prices, making paymongo-reconcile flag a
  // spurious amount_mismatch against a charge that was actually correct.
  const unitCentavos = Math.round(unitAmount * 100)
  const amount = (unitCentavos * quantity) / 100 // server-computed total, matches the charge
  const currency = listing.currency || 'PHP'

  // KYC gate — the card path previously had none, so an unverified buyer could
  // check out via the cart while the marketplace modal blocked them. Enforced
  // HERE (before a PayMongo session exists) for the same reason as the velocity
  // cap below: rejecting after payment would orphan the charge.
  const { error: kycErr } = await supabase.rpc('assert_can_trade', { p_user_id: userId })
  if (kycErr) {
    throw new Error(
      /identity verification required/i.test(kycErr.message || '')
        ? 'Identity verification is required before buying credits. Please complete KYC verification on your account.'
        : 'Purchase could not be authorized. Please try again later.',
    )
  }

  // Velocity cap (per KYC tier) — enforced HERE, before a PayMongo session
  // exists, so a rejection never happens after the customer has paid. The wallet
  // path enforces the same limit inside process_wallet_purchase.
  const { error: velocityErr } = await supabase.rpc('check_velocity_limit', {
    p_user_id: userId,
    p_amount: amount,
  })
  if (velocityErr) {
    throw new Error(
      /daily purchase limit/i.test(velocityErr.message || '')
        ? velocityErr.message
        : 'Purchase could not be authorized. Please try again later.',
    )
  }

  // Record the authoritative intent BEFORE creating the provider session.
  const { data: intent, error: intentErr } = await supabase
    .from('payment_intents')
    .insert({
      user_id: userId,
      purpose: 'marketplace_purchase',
      listing_id: listingId,
      quantity,
      unit_amount: unitAmount,
      amount,
      currency,
      provider: 'paymongo',
      status: 'created',
      metadata: { seller_id: listing.seller_id },
    })
    .select('id')
    .single()

  if (intentErr || !intent) {
    throw new Error(`Failed to create payment intent: ${intentErr?.message ?? 'unknown'}`)
  }

  const checkoutData = {
    data: {
      attributes: {
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        description: `Purchase of ${quantity} carbon credit(s)`,
        line_items: [
          {
            name: `Carbon Credits x${quantity}`,
            quantity,
            amount: unitCentavos, // per-unit centavos; PayMongo multiplies by quantity
            currency,
          },
        ],
        payment_method_types: ['card', 'gcash', 'paymaya'],
        success_url: `${origin}/payment/callback`,
        cancel_url: `${origin}/marketplace?cancelled=true`,
        metadata: {
          payment_intent_id: intent.id,
          listing_id: listingId,
          quantity: String(quantity),
        },
        ...(body.billing && (body.billing.name || body.billing.email || body.billing.phone)
          ? { billing: body.billing }
          : {}),
      },
    },
  }

  const res = await fetch(`${PAYMONGO_API_URL}/checkout_sessions`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(checkoutData),
  })
  const result = await res.json()
  if (!res.ok) {
    // Mark the intent failed so it isn't left dangling.
    await supabase.from('payment_intents').update({ status: 'failed' }).eq('id', intent.id)
    throw new Error(result.errors?.[0]?.detail || 'Failed to create checkout session')
  }

  const sessionId = result.data.id
  await supabase
    .from('payment_intents')
    .update({ provider_session_id: sessionId, status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', intent.id)

  return {
    success: true,
    sessionId,
    checkoutUrl: result.data.attributes.checkout_url,
    amount,
    currency,
    paymentIntentId: intent.id,
  }
}

/**
 * Server-authoritative subscription checkout (time-boxed plan model).
 *
 * The client sends ONLY { plan, user_id, origin }. The price comes from the
 * subscription_plans catalog — never the client. We record a payment_intent
 * (purpose 'subscription', plan in metadata) before creating the PayMongo
 * session; the webhook reads that intent and calls activate_subscription on
 * 'checkout.payment.paid'. The plan is granted only after confirmed payment.
 */
async function createSubscriptionCheckout(body: any, verifiedUserId: string | null) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  const planKey = String(body.plan || '')
  // P2: identity from the verified JWT only; the client body is never trusted.
  const origin = typeof body.origin === 'string' ? body.origin.replace(/\/$/, '') : ''

  if (!verifiedUserId) throw new Error('Authentication required to subscribe')
  const userId = verifiedUserId
  if (!['pro', 'business'].includes(planKey)) throw new Error('Unknown plan')

  // Authoritative price from the catalog.
  const { data: plan, error: planErr } = await supabase
    .from('subscription_plans')
    .select('key, name, price_minor, currency, period_days, active')
    .eq('key', planKey)
    .single()

  if (planErr || !plan) throw new Error('Plan not found')
  if (!plan.active) throw new Error('Plan is not available')

  const priceMinor = Number(plan.price_minor)
  if (!Number.isFinite(priceMinor) || priceMinor <= 0) {
    throw new Error('Plan has no valid price')
  }
  const amount = Math.round(priceMinor) / 100 // currency units for the intent
  const currency = plan.currency || 'PHP'

  // Record the authoritative intent BEFORE creating the provider session.
  const { data: intent, error: intentErr } = await supabase
    .from('payment_intents')
    .insert({
      user_id: userId,
      purpose: 'subscription',
      unit_amount: amount,
      amount,
      currency,
      provider: 'paymongo',
      status: 'created',
      metadata: { plan: planKey, period_days: plan.period_days },
    })
    .select('id')
    .single()

  if (intentErr || !intent) {
    throw new Error(`Failed to create payment intent: ${intentErr?.message ?? 'unknown'}`)
  }

  const checkoutData = {
    data: {
      attributes: {
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        description: `Carbonify ${plan.name} plan — ${plan.period_days} days`,
        line_items: [
          {
            name: `Carbonify ${plan.name} (${plan.period_days} days)`,
            quantity: 1,
            amount: Math.round(priceMinor), // centavos
            currency,
          },
        ],
        payment_method_types: ['card', 'gcash', 'paymaya'],
        success_url: `${origin}/upgrade?status=success`,
        cancel_url: `${origin}/upgrade?cancelled=true`,
        metadata: {
          payment_intent_id: intent.id,
          purpose: 'subscription',
          plan: planKey,
        },
      },
    },
  }

  const res = await fetch(`${PAYMONGO_API_URL}/checkout_sessions`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(checkoutData),
  })
  const result = await res.json()
  if (!res.ok) {
    await supabase.from('payment_intents').update({ status: 'failed' }).eq('id', intent.id)
    throw new Error(result.errors?.[0]?.detail || 'Failed to create checkout session')
  }

  const sessionId = result.data.id
  await supabase
    .from('payment_intents')
    .update({ provider_session_id: sessionId, status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', intent.id)

  return {
    success: true,
    sessionId,
    // snake_case to match the client (subscriptionService/UpgradeView); camelCase
    // kept for parity with the marketplace action.
    checkout_url: result.data.attributes.checkout_url,
    checkoutUrl: result.data.attributes.checkout_url,
    amount,
    currency,
    paymentIntentId: intent.id,
  }
}

/**
 * Server-recorded wallet top-up (Phase 1 P5).
 *
 * Unlike a marketplace purchase the amount is legitimately client-chosen (the
 * user's own deposit), but we still record a payment_intent (purpose
 * 'wallet_topup') up front so the webhook can credit the balance as the single
 * source of truth and everything reconciles consistently. The browser no longer
 * writes wallet_accounts / wallet_transactions for a top-up.
 */
async function createWalletTopupCheckout(body: any, verifiedUserId: string | null) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // P2: identity from the verified JWT only; the client body is never trusted.
  const origin = typeof body.origin === 'string' ? body.origin.replace(/\/$/, '') : ''
  const amount = Number(body.amount)

  if (!verifiedUserId) throw new Error('Authentication required to top up')
  const userId = verifiedUserId
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('A positive amount is required')

  // Suspension — but deliberately NOT the KYC trade gate. Adding money to your
  // own wallet is not trading, and a user completing KYC may legitimately fund
  // an account first; process_wallet_purchase is where the KYC threshold is
  // enforced. A SUSPENDED account is different: it must not be able to move
  // money onto the platform it is barred from transacting on, or the balance
  // just sits there needing a refund. Checked before the intent exists, so
  // nothing is charged.
  const { error: suspErr } = await supabase.rpc('assert_not_suspended', { p_user_id: userId })
  if (suspErr) {
    throw new Error(
      /suspended/i.test(suspErr.message || '')
        ? suspErr.message
        : 'Top-up could not be authorized. Please try again later.',
    )
  }

  const currency = 'PHP'

  const { data: intent, error: intentErr } = await supabase
    .from('payment_intents')
    .insert({
      user_id: userId,
      purpose: 'wallet_topup',
      unit_amount: amount,
      amount,
      currency,
      provider: 'paymongo',
      status: 'created',
      metadata: {},
    })
    .select('id')
    .single()

  if (intentErr || !intent) {
    throw new Error(`Failed to create payment intent: ${intentErr?.message ?? 'unknown'}`)
  }

  const checkoutData = {
    data: {
      attributes: {
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        description: 'Carbonify wallet top-up',
        line_items: [
          {
            name: 'Wallet top-up',
            quantity: 1,
            amount: Math.round(amount * 100), // centavos
            currency,
          },
        ],
        payment_method_types: ['card', 'gcash', 'paymaya'],
        success_url: `${origin}/payment/callback`,
        cancel_url: `${origin}/wallet?cancelled=true`,
        metadata: {
          payment_intent_id: intent.id,
          purpose: 'wallet_topup',
        },
        ...(body.billing && (body.billing.name || body.billing.email || body.billing.phone)
          ? { billing: body.billing }
          : {}),
      },
    },
  }

  const res = await fetch(`${PAYMONGO_API_URL}/checkout_sessions`, {
    method: 'POST',
    headers: authHeader(),
    body: JSON.stringify(checkoutData),
  })
  const result = await res.json()
  if (!res.ok) {
    await supabase.from('payment_intents').update({ status: 'failed' }).eq('id', intent.id)
    throw new Error(result.errors?.[0]?.detail || 'Failed to create checkout session')
  }

  const sessionId = result.data.id
  await supabase
    .from('payment_intents')
    .update({ provider_session_id: sessionId, status: 'pending', updated_at: new Date().toISOString() })
    .eq('id', intent.id)

  return {
    success: true,
    sessionId,
    checkoutUrl: result.data.attributes.checkout_url,
    amount,
    currency,
    paymentIntentId: intent.id,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }

  try {
    const body = await req.json()

    // Action: verify session (callback page – no secret in frontend).
    //
    // This branch used to run with NO authentication and NO rate limit: any
    // caller could POST an arbitrary `cs_...` id and get back the payment
    // amount, status and the whole session object. Checkout session ids are not
    // secrets — they travel in redirect URLs, browser history and referrers — so
    // it was an unauthenticated read of another payer's data, and an unmetered
    // proxy onto PayMongo's API using our secret key. It is now authenticated,
    // rate-limited, and scoped to sessions the caller actually started.
    if (body.action === 'verify' && body.sessionId) {
      if (!PAYMONGO_SECRET_KEY) {
        return new Response(JSON.stringify({ error: 'PAYMONGO_SECRET_KEY not set in Edge Function' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const verifiedUserId = await getVerifiedUserId(req)
      if (!verifiedUserId) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (!(await underRateLimit(`verify:${verifiedUserId}`, CHECKOUT_RATE_MAX, CHECKOUT_RATE_WINDOW_SECONDS))) {
        return new Response(
          JSON.stringify({ error: 'Too many verification attempts. Please wait a minute and try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      if (!(await callerOwnsSession(String(body.sessionId), verifiedUserId))) {
        // Same response for "no such session" and "someone else's session" — a
        // distinguishable 404 would turn this into a session-id oracle.
        return new Response(JSON.stringify({ error: 'Payment session not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      const result = await verifyCheckoutSession(body.sessionId)
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Server-authoritative marketplace checkout: amount computed from the
    // listing, not trusted from the client (Phase 1.2). Identity from JWT (P3).
    if (body.action === 'create_marketplace_checkout') {
      const verifiedUserId = await getVerifiedUserId(req)
      if (verifiedUserId && !(await underRateLimit(`checkout:${verifiedUserId}`, CHECKOUT_RATE_MAX, CHECKOUT_RATE_WINDOW_SECONDS))) {
        return new Response(
          JSON.stringify({ error: 'Too many checkout attempts. Please wait a minute and try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      const result = await createMarketplaceCheckout(body, verifiedUserId)
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Server-authoritative subscription checkout: price from subscription_plans,
    // never the client. Identity from JWT (P3).
    if (body.action === 'create_subscription_checkout') {
      const verifiedUserId = await getVerifiedUserId(req)
      if (verifiedUserId && !(await underRateLimit(`checkout:${verifiedUserId}`, CHECKOUT_RATE_MAX, CHECKOUT_RATE_WINDOW_SECONDS))) {
        return new Response(
          JSON.stringify({ error: 'Too many checkout attempts. Please wait a minute and try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      const result = await createSubscriptionCheckout(body, verifiedUserId)
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Wallet top-up recorded as a payment_intent (Phase 1 P5); the webhook
    // credits the balance. Identity from JWT (P3).
    if (body.action === 'create_wallet_topup_checkout') {
      const verifiedUserId = await getVerifiedUserId(req)
      if (verifiedUserId && !(await underRateLimit(`checkout:${verifiedUserId}`, CHECKOUT_RATE_MAX, CHECKOUT_RATE_WINDOW_SECONDS))) {
        return new Response(
          JSON.stringify({ error: 'Too many top-up attempts. Please wait a minute and try again.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      const result = await createWalletTopupCheckout(body, verifiedUserId)
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // No legacy raw-payload path. The old default branch created a PayMongo
    // session from a client-supplied `data` payload with a client-controlled
    // amount — removed as part of the pre-launch hardening. Every real flow uses
    // one of the server-authoritative actions above.
    throw new Error('Unknown or unsupported checkout action')
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
