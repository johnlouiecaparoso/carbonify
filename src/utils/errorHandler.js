/**
 * Centralized error handling utilities
 */

export class AppError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', statusCode = 500, details = null) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
    this.timestamp = new Date().toISOString()
  }
}

export const ERROR_CODES = {
  // Authentication errors
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  EMAIL_NOT_CONFIRMED: 'EMAIL_NOT_CONFIRMED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',

  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  SERVER_ERROR: 'SERVER_ERROR',

  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  REQUIRED_FIELD: 'REQUIRED_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',

  // Business logic errors
  INSUFFICIENT_CREDITS: 'INSUFFICIENT_CREDITS',
  PROJECT_NOT_FOUND: 'PROJECT_NOT_FOUND',
  PAYMENT_FAILED: 'PAYMENT_FAILED',

  // System errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
}

export const ERROR_MESSAGES = {
  [ERROR_CODES.AUTH_REQUIRED]: 'Please log in to continue',
  [ERROR_CODES.INVALID_CREDENTIALS]: 'Invalid email or password',
  [ERROR_CODES.EMAIL_NOT_CONFIRMED]: 'Please check your email and confirm your account',
  [ERROR_CODES.SESSION_EXPIRED]: 'Your session has expired. Please log in again',
  [ERROR_CODES.NETWORK_ERROR]: 'Network connection failed. Please check your internet connection',
  [ERROR_CODES.TIMEOUT_ERROR]: 'Request timed out. Please try again',
  [ERROR_CODES.SERVER_ERROR]: 'Server error occurred. Please try again later',
  [ERROR_CODES.VALIDATION_ERROR]: 'Please check your input and try again',
  [ERROR_CODES.REQUIRED_FIELD]: 'This field is required',
  [ERROR_CODES.INVALID_FORMAT]: 'Invalid format provided',
  [ERROR_CODES.INSUFFICIENT_CREDITS]: 'Insufficient credits for this transaction',
  [ERROR_CODES.PROJECT_NOT_FOUND]: 'Project not found',
  [ERROR_CODES.PAYMENT_FAILED]: 'Payment processing failed. Please try again',
  [ERROR_CODES.UNKNOWN_ERROR]: 'An unexpected error occurred',
  [ERROR_CODES.DATABASE_ERROR]: 'Database connection failed',
}

/**
 * Get user-friendly error message
 */
export function getErrorMessage(error) {
  if (error instanceof AppError) {
    return ERROR_MESSAGES[error.code] || error.message
  }

  if (error?.code && ERROR_MESSAGES[error.code]) {
    return ERROR_MESSAGES[error.code]
  }

  // Handle common error patterns
  if (error?.message) {
    const message = error.message.toLowerCase()

    if (message.includes('network') || message.includes('fetch')) {
      return ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR]
    }

    if (message.includes('timeout')) {
      return ERROR_MESSAGES[ERROR_CODES.TIMEOUT_ERROR]
    }

    if (message.includes('unauthorized') || message.includes('401')) {
      return ERROR_MESSAGES[ERROR_CODES.AUTH_REQUIRED]
    }

    if (message.includes('forbidden') || message.includes('403')) {
      return ERROR_MESSAGES[ERROR_CODES.AUTH_REQUIRED]
    }

    if (message.includes('not found') || message.includes('404')) {
      return ERROR_MESSAGES[ERROR_CODES.PROJECT_NOT_FOUND]
    }

    if (message.includes('server') || message.includes('500')) {
      return ERROR_MESSAGES[ERROR_CODES.SERVER_ERROR]
    }
  }

  return ERROR_MESSAGES[ERROR_CODES.UNKNOWN_ERROR]
}

/**
 * Log error for debugging
 */
export function logError(error, context = '') {
  console.error(`[${context}] Error:`, {
    message: error.message,
    code: error.code,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  })
}

/**
 * Handle API errors
 */
export function handleApiError(error, context = '') {
  logError(error, context)

  if (error.response?.status === 401) {
    throw new AppError(ERROR_MESSAGES[ERROR_CODES.AUTH_REQUIRED], ERROR_CODES.AUTH_REQUIRED, 401)
  }

  if (error.response?.status === 403) {
    throw new AppError(ERROR_MESSAGES[ERROR_CODES.AUTH_REQUIRED], ERROR_CODES.AUTH_REQUIRED, 403)
  }

  if (error.response?.status >= 500) {
    throw new AppError(
      ERROR_MESSAGES[ERROR_CODES.SERVER_ERROR],
      ERROR_CODES.SERVER_ERROR,
      error.response.status,
    )
  }

  if (error.code === 'NETWORK_ERROR' || !navigator.onLine) {
    throw new AppError(ERROR_MESSAGES[ERROR_CODES.NETWORK_ERROR], ERROR_CODES.NETWORK_ERROR, 0)
  }

  throw error
}

