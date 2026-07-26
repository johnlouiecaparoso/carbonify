/**
 * Analytics tracking utilities
 */

class AnalyticsTracker {
  constructor() {
    this.isEnabled = import.meta.env.PROD
    this.userId = null
    this.sessionId = this.generateSessionId()
    this.events = []
    this.pageViews = []
    this.userActions = []
    this.performanceMetrics = []
  }

  /**
   * Initialize analytics
   */
  initialize(config = {}) {
    this.config = {
      // No placeholder default. This used to fall back to the literal string
      // 'GA-XXXXXXXXX', which is truthy — so setupGoogleAnalytics() below saw a
      // "configured" tracker and, on every production page load, injected a
      // gtag script tag for a measurement ID that does not exist.
      trackingId: config.trackingId || import.meta.env.VITE_GA_TRACKING_ID || '',
      apiEndpoint: config.apiEndpoint || '/api/analytics',
      batchSize: config.batchSize || 10,
      flushInterval: config.flushInterval || 30000, // 30 seconds
      ...config,
    }

    if (this.isEnabled) {
      this.setupGoogleAnalytics()
      this.setupPerformanceTracking()
      this.setupErrorTracking()
      this.startFlushInterval()
    }
  }

  /**
   * Setup Google Analytics
   */
  setupGoogleAnalytics() {
    // A measurement ID that is absent or still a placeholder means analytics is
    // not set up; loading gtag for it only produces a blocked request and a CSP
    // violation. Google's own IDs are G-XXXX (GA4) or UA-XXXX (legacy).
    const id = this.config.trackingId
    const configured = id && !/^(GA-X+|G-X+|UA-X+)$/i.test(id)

    if (configured && typeof window !== 'undefined') {
      // Load Google Analytics script
      const script = document.createElement('script')
      script.async = true
      script.src = `https://www.googletagmanager.com/gtag/js?id=${this.config.trackingId}`
      document.head.appendChild(script)

      // Initialize gtag
      window.dataLayer = window.dataLayer || []
      function gtag() {
        window.dataLayer.push(arguments)
      }
      window.gtag = gtag
      gtag('js', new Date())
      gtag('config', this.config.trackingId, {
        page_title: document.title,
        page_location: window.location.href,
      })
    }
  }

  /**
   * Track page view
   */
  trackPageView(pageName, pagePath = null) {
    const pageData = {
      page_name: pageName,
      page_path: pagePath || window.location.pathname,
      page_url: window.location.href,
      page_title: document.title,
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      user_id: this.userId,
    }

    this.pageViews.push(pageData)

    if (this.isEnabled && window.gtag) {
      gtag('config', this.config.trackingId, {
        page_title: pageData.page_title,
        page_location: pageData.page_url,
      })
    }

    this.trackEvent('page_view', pageData)
  }

  /**
   * Track custom event
   */
  trackEvent(eventName, parameters = {}) {
    const eventData = {
      event_name: eventName,
      parameters: {
        ...parameters,
        timestamp: new Date().toISOString(),
        session_id: this.sessionId,
        user_id: this.userId,
        page_url: window.location.href,
      },
    }

    this.events.push(eventData)

    if (this.isEnabled && window.gtag) {
      gtag('event', eventName, parameters)
    }

    // Send to custom analytics endpoint
    this.sendToCustomEndpoint('event', eventData)
  }

  /**
   * Track user action
   */
  trackUserAction(action, element = null, value = null) {
    const actionData = {
      action_type: action,
      element: element
        ? {
            tag: element.tagName,
            id: element.id,
            class: element.className,
            text: element.textContent?.substring(0, 100),
          }
        : null,
      value: value,
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      user_id: this.userId,
      page_url: window.location.href,
    }

    this.userActions.push(actionData)
    this.trackEvent('user_action', actionData)
  }

  /**
   * Track performance metrics
   */
  trackPerformance(metricName, value, unit = 'ms') {
    const metricData = {
      metric_name: metricName,
      value: value,
      unit: unit,
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      user_id: this.userId,
    }

    this.performanceMetrics.push(metricData)

    if (this.isEnabled && window.gtag) {
      gtag('event', 'performance_metric', {
        metric_name: metricName,
        metric_value: value,
        metric_unit: unit,
      })
    }
  }

  /**
   * Track e-commerce events
   */
  trackPurchase(transactionId, value, currency = 'USD', items = []) {
    const purchaseData = {
      transaction_id: transactionId,
      value: value,
      currency: currency,
      items: items,
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      user_id: this.userId,
    }

    this.trackEvent('purchase', purchaseData)

    if (this.isEnabled && window.gtag) {
      gtag('event', 'purchase', {
        transaction_id: transactionId,
        value: value,
        currency: currency,
        items: items,
      })
    }
  }

  /**
   * Track search events
   */
  trackSearch(searchTerm, resultsCount = null, filters = {}) {
    this.trackEvent('search', {
      search_term: searchTerm,
      results_count: resultsCount,
      filters: filters,
    })
  }

  /**
   * Track error events
   */
  trackError(error, context = {}) {
    const errorData = {
      error_message: error.message,
      error_stack: error.stack,
      error_type: error.name,
      context: context,
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      user_id: this.userId,
      page_url: window.location.href,
    }

    this.trackEvent('error', errorData)
  }

  /**
   * Set user ID
   */
  setUserId(userId) {
    this.userId = userId

    if (this.isEnabled && window.gtag) {
      gtag('config', this.config.trackingId, {
        user_id: userId,
      })
    }
  }

  /**
   * Set user properties
   */
  setUserProperties(properties) {
    if (this.isEnabled && window.gtag) {
      gtag('config', this.config.trackingId, {
        custom_map: properties,
      })
    }
  }

  /**
   * Setup performance tracking
   */
  setupPerformanceTracking() {
    if (typeof window === 'undefined') return

    // Track page load performance
    window.addEventListener('load', () => {
      const navigation = performance.getEntriesByType('navigation')[0]

      if (navigation) {
        this.trackPerformance('page_load_time', navigation.loadEventEnd - navigation.fetchStart)
        this.trackPerformance(
          'dom_content_loaded',
          navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        )
        this.trackPerformance('first_paint', navigation.responseEnd - navigation.fetchStart)
      }

      // Track Core Web Vitals
      this.trackCoreWebVitals()
    })

    // Track API performance
    this.trackApiPerformance()
  }

  /**
   * Track Core Web Vitals
   */
  trackCoreWebVitals() {
    // First Contentful Paint
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.trackPerformance('first_contentful_paint', entry.startTime)
          }
        }
      })
      observer.observe({ entryTypes: ['paint'] })
    }

    // Largest Contentful Paint
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        this.trackPerformance('largest_contentful_paint', lastEntry.startTime)
      })
      observer.observe({ entryTypes: ['largest-contentful-paint'] })
    }

    // First Input Delay
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          this.trackPerformance('first_input_delay', entry.processingStart - entry.startTime)
        }
      })
      observer.observe({ entryTypes: ['first-input'] })
    }
  }

  /**
   * Track API performance
   */
  trackApiPerformance() {
    const originalFetch = window.fetch
    const self = this

    window.fetch = function (...args) {
      const startTime = performance.now()
      const url = args[0]

      return originalFetch
        .apply(this, args)
        .then((response) => {
          const endTime = performance.now()
          self.trackPerformance(`api_${url}`, endTime - startTime)
          return response
        })
        .catch((error) => {
          const endTime = performance.now()
          self.trackPerformance(`api_error_${url}`, endTime - startTime)
          self.trackError(error, { url, method: 'fetch' })
          throw error
        })
    }
  }

  /**
   * Setup error tracking
   */
  setupErrorTracking() {
    if (typeof window === 'undefined') return

    // Track JavaScript errors
    window.addEventListener('error', (event) => {
      this.trackError(event.error, {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      })
    })

    // Track unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.trackError(new Error(event.reason), {
        type: 'unhandled_promise_rejection',
      })
    })
  }

  /**
   * Send data to custom analytics endpoint
   * Skips when endpoint is relative (e.g. /api/analytics) and no backend exists (e.g. Vercel static deploy)
   */
  async sendToCustomEndpoint(type, data) {
    if (!this.config.apiEndpoint) return
    if (this.config.apiEndpoint.startsWith('/') && typeof window !== 'undefined') return

    try {
      await fetch(this.config.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: type,
          data: data,
          timestamp: new Date().toISOString(),
        }),
      })
    } catch (error) {
      console.error('Analytics tracking error:', error)
    }
  }

  /**
   * Flush events to server
   */
  async flushEvents() {
    if (this.events.length === 0) return
    if (this.config.apiEndpoint.startsWith('/') && typeof window !== 'undefined') return

    const eventsToSend = this.events.splice(0, this.config.batchSize)

    try {
      await fetch(this.config.apiEndpoint + '/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          events: eventsToSend,
          session_id: this.sessionId,
          user_id: this.userId,
        }),
      })
    } catch (error) {
      console.error('Analytics flush error:', error)
      // Re-add events to queue if flush failed
      this.events.unshift(...eventsToSend)
    }
  }

  /**
   * Start flush interval
   */
  startFlushInterval() {
    setInterval(() => {
      this.flushEvents()
    }, this.config.flushInterval)
  }

  /**
   * Generate session ID
   */
  generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
  }

  /**
   * Get analytics data
   */
  getAnalyticsData() {
    return {
      events: this.events,
      pageViews: this.pageViews,
      userActions: this.userActions,
      performanceMetrics: this.performanceMetrics,
      sessionId: this.sessionId,
      userId: this.userId,
    }
  }

  /**
   * Clear analytics data
   */
  clearData() {
    this.events = []
    this.pageViews = []
    this.userActions = []
    this.performanceMetrics = []
  }
}

// Create singleton instance
export const analytics = new AnalyticsTracker()

// Auto-initialize in production
if (import.meta.env.PROD && typeof window !== 'undefined') {
  analytics.initialize()
}

// Export individual tracking functions for convenience
export const trackPageView = (pageName, pagePath) => analytics.trackPageView(pageName, pagePath)
export const trackEvent = (eventName, parameters) => analytics.trackEvent(eventName, parameters)
export const trackUserAction = (action, element, value) =>
  analytics.trackUserAction(action, element, value)
export const trackPerformance = (metricName, value, unit) =>
  analytics.trackPerformance(metricName, value, unit)
export const trackPurchase = (transactionId, value, currency, items) =>
  analytics.trackPurchase(transactionId, value, currency, items)
export const trackSearch = (searchTerm, resultsCount, filters) =>
  analytics.trackSearch(searchTerm, resultsCount, filters)
export const trackError = (error, context) => analytics.trackError(error, context)
export const setUserId = (userId) => analytics.setUserId(userId)
export const setUserProperties = (properties) => analytics.setUserProperties(properties)
