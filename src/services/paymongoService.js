/**
 * PayMongo Service - Real Payment Integration
 * Integrates with PayMongo payment gateway for GCash, Maya, and Cards
 *
 * Production-safe behavior:
 * - Uses Supabase Edge Function `paymongo-checkout` to talk to PayMongo from the server.
 * - Falls back to direct PayMongo API calls only as a last resort (e.g. local dev without Supabase).
 *
 * This avoids CORS issues and keeps the secret key off the frontend.
 */

import { getEnv } from '@/utils/env'
import { getSupabaseAsync } from '@/services/supabaseClient'

const PAYMONGO_CONFIG = {
  apiBaseUrl: 'https://api.paymongo.com/v1',
  publicKey: null,
  secretKey: null,
  isConfigured: false,
}

/**
 * Initialize PayMongo service.
 * Configured when public key is set; checkout uses Supabase Edge Function (secret key lives there).
 */
export function initPayMongo() {
  try {
    PAYMONGO_CONFIG.publicKey = getEnv('VITE_PAYMONGO_PUBLIC_KEY', { optional: true })
    // SECURITY: the PayMongo SECRET key must never be read into the browser bundle.
    // It lives only in Supabase Edge Function secrets. secretKey stays null here, so
    // all checkout/verify goes through the Edge Function (never a browser-direct call).
    PAYMONGO_CONFIG.secretKey = null
    // Use real PayMongo (Edge Function) when public key is set; no need for secret in frontend
    PAYMONGO_CONFIG.isConfigured = !!PAYMONGO_CONFIG.publicKey

    if (PAYMONGO_CONFIG.isConfigured) {
      console.log('✅ PayMongo service initialized (checkout via Edge Function)')
      return true
    } else {
      console.warn('⚠️ PayMongo keys not configured, using mock mode')
      return false
    }
  } catch (error) {
    console.warn('⚠️ PayMongo initialization failed:', error)
    return false
  }
}

/**
 * Create a PayMongo Checkout Session
 * This returns a checkout URL that you redirect users to
 *
 * @param {Object} sessionData - Checkout session details
 * @param {number} sessionData.amount - Amount in PHP (e.g., 100.00)
 * @param {string} sessionData.description - Payment description
 * @param {Object} sessionData.metadata - Additional metadata
 * @param {Array<string>} sessionData.paymentMethodTypes - Payment methods to enable
 * @returns {Promise<Object>} Checkout session with URL
 */
export async function createCheckoutSession(sessionData) {
  try {
    const {
      amount,
      description,
      metadata,
      billing,
    } = sessionData

    // Validate amount
    if (!amount || amount <= 0) {
      throw new Error('Invalid amount')
    }

    // If not configured, use mock mode
    if (!PAYMONGO_CONFIG.isConfigured) {
      console.warn('⚠️ PayMongo not configured, using mock checkout')
      return {
        success: true,
        sessionId: `mock_session_${Date.now()}`,
        checkoutUrl: `${window.location.origin}/payment/complete?mock=true&amount=${amount}`,
        amount: amount,
        currency: 'PHP',
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      }
    }

    console.log('🔗 Creating PayMongo checkout session...')

    // Extract quantity and price per credit from metadata if available
    // metadata is already destructured from sessionData above
    const purchaseMetadata = metadata || {}
    const quantity = purchaseMetadata.quantity || 1
    const pricePerCredit = purchaseMetadata.price_per_credit || amount
    const projectTitle = purchaseMetadata.project_title || 'Carbon Credits'

    // Create detailed description with quantity and price info
    const detailedDescription =
      purchaseMetadata.quantity && purchaseMetadata.price_per_credit
        ? `${quantity} credit${quantity > 1 ? 's' : ''} @ ₱${pricePerCredit.toFixed(2)} each from ${projectTitle}`
        : description || 'Carbonify Credit Purchase'

    // Create line items - show actual quantity and per-credit price if available
    const lineItems =
      purchaseMetadata.quantity && purchaseMetadata.price_per_credit
        ? [
            {
              name: `${projectTitle} - Carbon Credits`,
              quantity: quantity,
              amount: Math.round(pricePerCredit * 100), // Price per credit in centavos
              currency: 'PHP',
            },
          ]
        : [
            {
              name: description || 'Carbonify Carbon Credits',
              quantity: 1,
              amount: Math.round(amount * 100), // Total amount in centavos
              currency: 'PHP',
            },
          ]

    const checkoutData = {
      data: {
        attributes: {
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          description: detailedDescription,
          line_items: lineItems,
          payment_method_types: ['card', 'gcash', 'paymaya'],
          success_url: `${window.location.origin}/payment/callback`,
          cancel_url: `${window.location.origin}/marketplace?cancelled=true`,
        },
      },
    }

    if (billing && (billing.name || billing.email || billing.phone)) {
      checkoutData.data.attributes.billing = {
        ...(billing.name ? { name: billing.name } : {}),
        ...(billing.email ? { email: billing.email } : {}),
        ...(billing.phone ? { phone: billing.phone } : {}),
      }
    }

    console.log('📋 PayMongo checkout details:', {
      description: detailedDescription,
      quantity: quantity,
      price_per_credit: pricePerCredit,
      total_amount: amount,
      billing: checkoutData.data.attributes.billing || null,
      line_items: lineItems,
    })

    // Prefer calling Supabase Edge Function to avoid CORS and keep secrets server-side
    let result
    try {
      const supabase = await getSupabaseAsync()
      if (supabase) {
        const { data, error } = await supabase.functions.invoke('paymongo-checkout', {
          body: checkoutData,
        })

        if (error) {
          console.error('❌ Supabase paymongo-checkout error:', error)
          throw new Error(error.message || 'Failed to create checkout session via Supabase')
        }

        result = data
      } else {
        throw new Error('Supabase client not available for paymongo-checkout')
      }
    } catch (edgeError) {
      console.error('❌ Supabase paymongo-checkout failed:', edgeError)
      // Do not call PayMongo from the browser – it is blocked by CORS. The checkout
      // must go through the Supabase Edge Function. Common cause: function deployed
      // with JWT verification on, so the OPTIONS preflight gets 401.
      throw new Error(
        'Checkout is unavailable. Please deploy the paymongo-checkout Edge Function with JWT verification disabled (see supabase/config.toml or use: supabase functions deploy paymongo-checkout --no-verify-jwt) and set PAYMONGO_SECRET_KEY in Supabase.',
      )
    }

    console.log('✅ Checkout session created:', result.data.id)
    console.log('✅ Full session response:', JSON.stringify(result, null, 2))
    console.log('✅ Checkout URL:', result.data.attributes.checkout_url)

    return {
      success: true,
      sessionId: result.data.id,
      checkoutUrl: result.data.attributes.checkout_url,
      amount: amount,
      currency: 'PHP',
      expiresAt: result.data.attributes.expires_at,
    }
  } catch (error) {
    console.error('❌ Error creating checkout session:', error)
    throw error
  }
}

/**
 * Server-authoritative marketplace checkout (Phase 1.2).
 *
 * The client sends ONLY the listing id + quantity; the Edge Function recomputes
 * the price from credit_listings and records a payment_intent. No client-supplied
 * amount is involved, which closes the "pay any price" hole in the legacy
 * createCheckoutSession path.
 *
 * @param {{ listingId: string, quantity: number, billing?: object }} args
 * @returns {Promise<{ success: boolean, sessionId: string, checkoutUrl: string, amount: number, currency: string, paymentIntentId: string }>}
 */
export async function createMarketplaceCheckout({ listingId, quantity, billing } = {}) {
  if (!listingId || !quantity || quantity <= 0) {
    throw new Error('listingId and a positive quantity are required')
  }

  const supabase = await getSupabaseAsync()
  if (!supabase) {
    throw new Error('Supabase client not available for checkout')
  }

  let userId = null
  try {
    const { data: userData } = await supabase.auth.getUser()
    userId = userData?.user?.id ?? null
  } catch {
    // Unauthenticated callers are rejected server-side; leave userId null.
  }

  const { data: result, error } = await supabase.functions.invoke('paymongo-checkout', {
    body: {
      action: 'create_marketplace_checkout',
      listing_id: listingId,
      quantity,
      user_id: userId,
      origin: window.location.origin,
      billing,
    },
  })

  if (error) {
    throw new Error(error.message || 'Failed to create marketplace checkout')
  }
  if (result?.error) {
    throw new Error(result.error)
  }
  return result
}

/**
 * Server-recorded wallet top-up checkout (Phase 1 P5).
 *
 * Records a payment_intent (purpose 'wallet_topup') server-side; the webhook
 * credits the balance. The client no longer writes wallet_accounts /
 * wallet_transactions for a top-up.
 *
 * @param {{ amount: number, billing?: object }} args
 * @returns {Promise<{ success: boolean, sessionId: string, checkoutUrl: string, amount: number, currency: string, paymentIntentId: string }>}
 */
export async function createWalletTopupCheckout({ amount, billing } = {}) {
  if (!amount || amount <= 0) {
    throw new Error('A positive amount is required')
  }

  const supabase = await getSupabaseAsync()
  if (!supabase) {
    throw new Error('Supabase client not available for checkout')
  }

  let userId = null
  try {
    const { data: userData } = await supabase.auth.getUser()
    userId = userData?.user?.id ?? null
  } catch {
    // Unauthenticated callers are rejected server-side; leave userId null.
  }

  const { data: result, error } = await supabase.functions.invoke('paymongo-checkout', {
    body: {
      action: 'create_wallet_topup_checkout',
      amount,
      user_id: userId,
      origin: window.location.origin,
      billing,
    },
  })

  if (error) {
    throw new Error(error.message || 'Failed to create wallet top-up checkout')
  }
  if (result?.error) {
    throw new Error(result.error)
  }
  return result
}

/**
 * Process a successful payment callback
 * This is called when user returns from PayMongo checkout
 *
 * @param {string} sessionId - Checkout session ID
 * @param {Object} options - Additional options
 * @param {boolean} options.isMock - Whether this is a mock payment
 * @param {number} options.mockAmount - Amount for mock payment (from URL query)
 * @returns {Promise<Object>} Payment result
 */
export async function processPaymentCallback(sessionId, options = {}) {
  try {
    console.log('🔍 Processing payment callback for session:', sessionId, options)

    // If mock mode
    if (sessionId.startsWith('mock_') || options.isMock) {
      const mockAmount = options.mockAmount || 0
      console.log('🎭 Processing mock payment:', { sessionId, amount: mockAmount })
      return {
        success: true,
        payment: {
          id: sessionId,
          amount: mockAmount,
          currency: 'PHP',
          status: 'paid',
          payment_method: 'mock',
        },
        session: { id: sessionId },
        paymentMethod: 'mock',
      }
    }

    // If not configured, mock it
    if (!PAYMONGO_CONFIG.isConfigured) {
      console.warn('⚠️ PayMongo not configured, using mock payment callback')
      return {
        success: true,
        payment: {
          id: sessionId,
          amount: 0,
          currency: 'PHP',
          status: 'paid',
        },
        session: { id: sessionId },
      }
    }

    // Prefer Edge Function for verification (secret key stays in Supabase, not frontend)
    if (!PAYMONGO_CONFIG.secretKey) {
      const supabase = await getSupabaseAsync()
      if (supabase) {
        const { data: verifyResult, error: verifyError } = await supabase.functions.invoke(
          'paymongo-checkout',
          { body: { action: 'verify', sessionId } },
        )
        if (verifyError) {
          console.error('❌ Edge Function verify error:', verifyError)
          throw new Error(verifyError.message || 'Payment verification failed')
        }
        if (verifyResult && typeof verifyResult.success === 'boolean') {
          console.log('✅ Payment verified via Edge Function')
          return verifyResult
        }
      }
      throw new Error('PayMongo secret key not configured. Set PAYMONGO_SECRET_KEY in Supabase Edge Function secrets.')
    }

    // Fallback: verify from browser when secret key is in env (e.g. legacy dev).
    //
    // This path is unreachable in production and deliberately so: it only runs
    // when PAYMONGO_CONFIG.secretKey is present in the BROWSER bundle, which
    // would mean a PayMongo secret key had been shipped to every visitor. The
    // enforcing CSP in vercel.json omits api.paymongo.com from connect-src, so
    // if that ever happens these two fetches are blocked rather than quietly
    // working — a loud failure is the right outcome for a leaked secret key.
    const sessionResponse = await fetch(
      `${PAYMONGO_CONFIG.apiBaseUrl}/checkout_sessions/${sessionId}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${btoa(PAYMONGO_CONFIG.secretKey + ':')}`,
        },
      },
    )

    if (!sessionResponse.ok) {
      throw new Error('Failed to retrieve checkout session')
    }

    const sessionData = await sessionResponse.json()

    console.log('✅ Session data retrieved:', JSON.stringify(sessionData, null, 2))
    console.log('✅ Payments array:', sessionData.data.attributes.payments)

    // payments is an array of payment objects, get the first one's id
    const paymentId =
      sessionData.data.attributes.payments?.[0]?.id || sessionData.data.attributes.payments?.[0]

    console.log('✅ Extracted payment ID:', paymentId, 'Type:', typeof paymentId)

    if (!paymentId) {
      console.error('❌ No payment found in session data')
      throw new Error('No payment found in session')
    }

    // Retrieve payment details
    const paymentResponse = await fetch(`${PAYMONGO_CONFIG.apiBaseUrl}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${btoa(PAYMONGO_CONFIG.secretKey + ':')}`,
      },
    })

    if (!paymentResponse.ok) {
      throw new Error('Failed to retrieve payment')
    }

    const paymentData = await paymentResponse.json()

    // Extract the actual payment method used from PayMongo
    // PayMongo stores payment method in payment_data.attributes.source.type or payment_data.attributes.payment_method.type
    let actualPaymentMethod = 'unknown'

    // Check payment_method attribute first (newer API)
    if (paymentData.data?.attributes?.payment_method?.type) {
      actualPaymentMethod = paymentData.data.attributes.payment_method.type
    }
    // Check source attribute (older API)
    else if (paymentData.data?.attributes?.source?.type) {
      actualPaymentMethod = paymentData.data.attributes.source.type
    }
    // Check payment_method_details
    else if (paymentData.data?.attributes?.payment_method_details?.type) {
      actualPaymentMethod = paymentData.data.attributes.payment_method_details.type
    }

    // Normalize payment method names
    // PayMongo uses: 'card', 'gcash', 'paymaya', 'grab_pay', etc.
    // Map to our standard names
    const paymentMethodMap = {
      card: 'card',
      credit_card: 'card',
      debit_card: 'card',
      gcash: 'gcash',
      paymaya: 'maya',
      grab_pay: 'grab_pay',
    }

    actualPaymentMethod = paymentMethodMap[actualPaymentMethod] || actualPaymentMethod

    console.log('💳 Detected payment method from PayMongo:', {
      raw:
        paymentData.data?.attributes?.payment_method?.type ||
        paymentData.data?.attributes?.source?.type,
      normalized: actualPaymentMethod,
      full_payment_data: paymentData.data?.attributes,
    })

    const payment = {
      id: paymentData.data.id,
      amount: paymentData.data.attributes.amount / 100,
      currency: paymentData.data.attributes.currency,
      status: paymentData.data.attributes.status,
      description: paymentData.data.attributes.description,
      fee: paymentData.data.attributes.fee / 100,
      payment_method: actualPaymentMethod, // Include detected payment method
    }

    console.log('✅ Payment retrieved:', payment)

    return {
      success: payment.status === 'paid',
      payment: payment,
      session: sessionData.data,
      paymentMethod: actualPaymentMethod, // Also return separately for easy access
    }
  } catch (error) {
    console.error('❌ Error processing payment callback:', error)
    throw error
  }
}

/**
 * Get PayMongo public key for frontend
 */
export function getPayMongoPublicKey() {
  return PAYMONGO_CONFIG.publicKey
}

/**
 * Check if PayMongo is configured
 */
export function isPayMongoConfigured() {
  return PAYMONGO_CONFIG.isConfigured
}

/**
 * Format amount for display
 */
export function formatAmount(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount)
}

// Initialize on module load
initPayMongo()
