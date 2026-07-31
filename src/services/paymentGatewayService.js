/**
 * Payment Gateway Service for GCash and Maya integration
 * This is a foundational implementation that can be extended with real API keys
 */

// Payment gateway configuration
const PAYMENT_CONFIG = {
  gcash: {
    name: 'GCash',
    currency: 'PHP',
    minAmount: 1,
    maxAmount: 50000,
    fees: {
      percentage: 0.025, // 2.5%
      fixed: 0,
    },
  },
  maya: {
    name: 'Maya (PayMaya)',
    currency: 'PHP',
    minAmount: 1,
    maxAmount: 50000,
    fees: {
      percentage: 0.035, // 3.5%
      fixed: 0,
    },
  },
}

/**
 * Initialize payment gateway
 * In production, this would load real SDK configurations
 */
export function initializePaymentGateways() {
  console.log('🔧 Initializing payment gateways...')

  // In production, you would:
  // 1. Load GCash SDK
  // 2. Load Maya SDK
  // 3. Configure API keys from environment variables
  // 4. Set up webhook endpoints

  return {
    gcash: {
      initialized: true,
      sandbox: true,
      version: '1.0.0',
    },
    maya: {
      initialized: true,
      sandbox: true,
      version: '2.0.0',
    },
  }
}

/**
 * Create payment intent for GCash
 */
export async function createGCashPayment(paymentData) {
  const { amount, currency = 'PHP', description, metadata = {} } = paymentData

  // Validate amount
  if (amount < PAYMENT_CONFIG.gcash.minAmount || amount > PAYMENT_CONFIG.gcash.maxAmount) {
    throw new Error(
      `Amount must be between ₱${PAYMENT_CONFIG.gcash.minAmount} and ₱${PAYMENT_CONFIG.gcash.maxAmount}`,
    )
  }

  // Calculate fees
  const fees = calculateFees(amount, 'gcash')
  const totalAmount = amount + fees

  // In production, this would call the real GCash API
  const paymentIntent = {
    id: `gcash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    amount: amount,
    fees: fees,
    totalAmount: totalAmount,
    currency: currency,
    description: description,
    status: 'pending',
    paymentMethod: 'gcash',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
    metadata: metadata,
    // Mock payment URL - in production this would be from GCash
    paymentUrl: `https://sandbox.gcash.com/payment/${Date.now()}`,
    // Mock QR code data
    qrCode: generateMockQRCode('gcash', totalAmount),
  }

  console.log('💳 GCash payment intent created:', paymentIntent.id)
  return paymentIntent
}

/**
 * Create payment intent for Maya
 */
export async function createMayaPayment(paymentData) {
  const { amount, currency = 'PHP', description, metadata = {} } = paymentData

  // Validate amount
  if (amount < PAYMENT_CONFIG.maya.minAmount || amount > PAYMENT_CONFIG.maya.maxAmount) {
    throw new Error(
      `Amount must be between ₱${PAYMENT_CONFIG.maya.minAmount} and ₱${PAYMENT_CONFIG.maya.maxAmount}`,
    )
  }

  // Calculate fees
  const fees = calculateFees(amount, 'maya')
  const totalAmount = amount + fees

  // In production, this would call the real Maya API
  const paymentIntent = {
    id: `maya_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    amount: amount,
    fees: fees,
    totalAmount: totalAmount,
    currency: currency,
    description: description,
    status: 'pending',
    paymentMethod: 'maya',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes
    metadata: metadata,
    // Mock payment URL - in production this would be from Maya
    paymentUrl: `https://sandbox.maya.ph/payment/${Date.now()}`,
    // Mock QR code data
    qrCode: generateMockQRCode('maya', totalAmount),
  }

  console.log('💳 Maya payment intent created:', paymentIntent.id)
  return paymentIntent
}

/**
 * Check payment status
 */
export async function checkPaymentStatus(paymentId) {
  console.log('🔍 Checking payment status for:', paymentId)

  // In production, this would query the real payment gateway APIs
  // For demo purposes, we'll simulate different payment statuses

  const now = Date.now()
  const random = Math.random()

  // Simulate payment processing time and outcomes
  if (random < 0.7) {
    // 70% success rate
    return {
      id: paymentId,
      status: 'completed',
      completedAt: new Date(now).toISOString(),
      transactionId: `txn_${now}_${Math.random().toString(36).substr(2, 9)}`,
    }
  } else if (random < 0.9) {
    // 20% still pending
    return {
      id: paymentId,
      status: 'pending',
      message: 'Payment is being processed',
    }
  } else {
    // 10% failed
    return {
      id: paymentId,
      status: 'failed',
      failedAt: new Date(now).toISOString(),
      errorCode: 'INSUFFICIENT_FUNDS',
      errorMessage: 'Insufficient funds in wallet',
    }
  }
}

/**
 * Process refund
 */
export async function processRefund(paymentId, amount, reason) {
  console.log('💸 Processing refund for payment:', paymentId)

  // In production, this would call the payment gateway refund APIs
  const refund = {
    id: `refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    paymentId: paymentId,
    amount: amount,
    reason: reason,
    status: 'pending',
    createdAt: new Date().toISOString(),
    estimatedCompletion: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
  }

  // Simulate processing
  setTimeout(() => {
    refund.status = 'completed'
    refund.completedAt = new Date().toISOString()
    console.log('✅ Refund completed:', refund.id)
  }, 2000)

  return refund
}

/**
 * Get supported payment methods
 */
export function getSupportedPaymentMethods() {
  return [
    {
      id: 'gcash',
      name: 'GCash',
      description: 'Pay using your GCash wallet',
      icon: 'account_balance_wallet',
      currency: 'PHP',
      minAmount: PAYMENT_CONFIG.gcash.minAmount,
      maxAmount: PAYMENT_CONFIG.gcash.maxAmount,
      fees: PAYMENT_CONFIG.gcash.fees,
      processingTime: '1-3 minutes',
      available: true,
    },
    {
      id: 'maya',
      name: 'Maya',
      description: 'Pay using your Maya wallet',
      icon: 'payments',
      currency: 'PHP',
      minAmount: PAYMENT_CONFIG.maya.minAmount,
      maxAmount: PAYMENT_CONFIG.maya.maxAmount,
      fees: PAYMENT_CONFIG.maya.fees,
      processingTime: '1-5 minutes',
      available: true,
    },
  ]
}

/**
 * Calculate payment fees
 */
function calculateFees(amount, paymentMethod) {
  const config = PAYMENT_CONFIG[paymentMethod]
  if (!config) return 0

  const percentageFee = amount * config.fees.percentage
  const totalFees = percentageFee + config.fees.fixed

  return Math.round(totalFees * 100) / 100 // Round to 2 decimal places
}

/**
 * Generate mock QR code data
 */
function generateMockQRCode(paymentMethod, amount) {
  // In production, this would be actual QR code data from the payment gateway
  return {
    data: `${paymentMethod.toUpperCase()}:${amount}:${Date.now()}`,
    image: `data:image/svg+xml;base64,${btoa(`
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="200" fill="white"/>
        <text x="100" y="100" text-anchor="middle" fill="black" font-size="12">
          ${paymentMethod.toUpperCase()} QR
        </text>
        <text x="100" y="120" text-anchor="middle" fill="black" font-size="10">
          ₱${amount}
        </text>
        <text x="100" y="140" text-anchor="middle" fill="gray" font-size="8">
          Mock QR Code
        </text>
      </svg>
    `)}`,
  }
}

/**
 * Validate payment data
 */
export function validatePaymentData(paymentData) {
  const { amount, paymentMethod, description } = paymentData

  const errors = []

  if (!amount || amount <= 0) {
    errors.push('Amount must be greater than 0')
  }

  if (!paymentMethod || !PAYMENT_CONFIG[paymentMethod]) {
    errors.push('Invalid payment method')
  }

  if (!description || description.trim().length === 0) {
    errors.push('Description is required')
  }

  if (paymentMethod && PAYMENT_CONFIG[paymentMethod]) {
    const config = PAYMENT_CONFIG[paymentMethod]
    if (amount < config.minAmount) {
      errors.push(`Minimum amount for ${config.name} is ₱${config.minAmount}`)
    }
    if (amount > config.maxAmount) {
      errors.push(`Maximum amount for ${config.name} is ₱${config.maxAmount}`)
    }
  }

  return {
    isValid: errors.length === 0,
    errors: errors,
  }
}

/**
 * Format currency for display
 */
export function formatCurrency(amount, currency = 'PHP') {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: currency,
  }).format(amount)
}

// Initialize payment gateways on module load
initializePaymentGateways()
