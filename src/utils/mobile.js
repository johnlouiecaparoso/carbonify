/**
 * Mobile utilities for touch interactions and responsive behavior
 */

/**
 * Touch gesture utilities
 */
export const touchGestures = {
  /**
   * Detect swipe direction
   */
  detectSwipe(element, options = {}) {
    const { threshold = 50, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown } = options

    let startX = 0
    let startY = 0
    let endX = 0
    let endY = 0

    element.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    })

    element.addEventListener('touchend', (e) => {
      endX = e.changedTouches[0].clientX
      endY = e.changedTouches[0].clientY

      const deltaX = endX - startX
      const deltaY = endY - startY

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (Math.abs(deltaX) > threshold) {
          if (deltaX > 0 && onSwipeRight) {
            onSwipeRight()
          } else if (deltaX < 0 && onSwipeLeft) {
            onSwipeLeft()
          }
        }
      } else {
        // Vertical swipe
        if (Math.abs(deltaY) > threshold) {
          if (deltaY > 0 && onSwipeDown) {
            onSwipeDown()
          } else if (deltaY < 0 && onSwipeUp) {
            onSwipeUp()
          }
        }
      }
    })
  },

  /**
   * Detect pinch gesture
   */
  detectPinch(element, options = {}) {
    const { onPinchStart, onPinchMove, onPinchEnd } = options

    let initialDistance = 0
    let currentDistance = 0

    element.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        initialDistance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2),
        )
        if (onPinchStart) onPinchStart(initialDistance)
      }
    })

    element.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0]
        const touch2 = e.touches[1]
        currentDistance = Math.sqrt(
          Math.pow(touch2.clientX - touch1.clientX, 2) +
            Math.pow(touch2.clientY - touch1.clientY, 2),
        )
        if (onPinchMove) onPinchMove(currentDistance, initialDistance)
      }
    })

    element.addEventListener('touchend', (e) => {
      if (e.touches.length < 2 && onPinchEnd) {
        onPinchEnd(currentDistance, initialDistance)
      }
    })
  },

  /**
   * Detect double tap
   */
  detectDoubleTap(element, callback) {
    let lastTap = 0
    const doubleTapDelay = 300

    element.addEventListener('touchend', (e) => {
      const currentTime = new Date().getTime()
      const tapLength = currentTime - lastTap

      if (tapLength < doubleTapDelay && tapLength > 0) {
        callback(e)
      }
      lastTap = currentTime
    })
  },
}

/**
 * Mobile viewport utilities
 */
export const viewport = {
  /**
   * Get viewport dimensions
   */
  getDimensions() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    }
  },

  /**
   * Check if device is mobile
   */
  isMobile() {
    return window.innerWidth <= 768
  },

  /**
   * Check if device is tablet
   */
  isTablet() {
    return window.innerWidth > 768 && window.innerWidth <= 1024
  },

  /**
   * Check if device is desktop
   */
  isDesktop() {
    return window.innerWidth > 1024
  },

  /**
   * Check if device supports touch
   */
  isTouchDevice() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0
  },

  /**
   * Get device orientation
   */
  getOrientation() {
    return window.innerHeight > window.innerWidth ? 'portrait' : 'landscape'
  },

  /**
   * Listen for orientation changes
   */
  onOrientationChange(callback) {
    window.addEventListener('orientationchange', () => {
      setTimeout(callback, 100) // Small delay to ensure dimensions are updated
    })
  },
}

/**
 * Mobile-specific CSS utilities
 */
export const mobileCSS = {
  /**
   * Add mobile-specific styles
   */
  addMobileStyles() {
    const style = document.createElement('style')
    style.textContent = `
      /* Mobile-specific styles */
      @media (max-width: 768px) {
        /* Prevent zoom on input focus */
        input, select, textarea {
          font-size: 16px !important;
        }

        /* Improve touch targets */
        button, a, input, select, textarea {
          min-height: 44px;
          min-width: 44px;
        }

        /* Better scrolling */
        body {
          -webkit-overflow-scrolling: touch;
        }

        /* Prevent horizontal scroll */
        body {
          overflow-x: hidden;
        }

        /* Improve text selection */
        ::selection {
          background: rgba(59, 130, 246, 0.3);
        }
      }

      /* Touch device styles */
      @media (hover: none) and (pointer: coarse) {
        /* Remove hover effects on touch devices */
        button:hover, a:hover {
          transform: none !important;
        }

        /* Add touch feedback */
        button:active, a:active {
          transform: scale(0.95);
          transition: transform 0.1s;
        }
      }

      /* High DPI displays */
      @media (-webkit-min-device-pixel-ratio: 2), (min-resolution: 192dpi) {
        /* Optimize for retina displays */
        img {
          image-rendering: -webkit-optimize-contrast;
        }
      }
    `
    document.head.appendChild(style)
  },

  /**
   * Add safe area support for notched devices
   */
  addSafeAreaSupport() {
    const style = document.createElement('style')
    style.textContent = `
      /* Safe area support for notched devices */
      .safe-area-top {
        padding-top: env(safe-area-inset-top);
      }

      .safe-area-bottom {
        padding-bottom: env(safe-area-inset-bottom);
      }

      .safe-area-left {
        padding-left: env(safe-area-inset-left);
      }

      .safe-area-right {
        padding-right: env(safe-area-inset-right);
      }

      .safe-area-all {
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);
      }
    `
    document.head.appendChild(style)
  },
}

/**
 * Mobile performance utilities
 */
export const mobilePerformance = {
  /**
   * Optimize images for mobile
   */
  optimizeImages() {
    const images = document.querySelectorAll('img')
    images.forEach((img) => {
      // Add loading="lazy" for better performance
      if (!img.hasAttribute('loading')) {
        img.setAttribute('loading', 'lazy')
      }

      // Add sizes attribute for responsive images
      if (!img.hasAttribute('sizes')) {
        img.setAttribute('sizes', '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw')
      }
    })
  },

  /**
   * Preload critical resources
   */
  preloadCriticalResources() {
    // Only preload resources that actually exist
    const criticalResources = [
      // Add only existing resources here
      // '/fonts/main.woff2', // Remove if doesn't exist
      // '/css/critical.css', // Remove if doesn't exist
    ]

    criticalResources.forEach((resource) => {
      const link = document.createElement('link')
      link.rel = 'preload'
      link.href = resource
      link.as = resource.endsWith('.woff2') ? 'font' : 'style'
      if (resource.endsWith('.woff2')) {
        link.crossOrigin = 'anonymous'
      }
      document.head.appendChild(link)
    })
  },

  // Service worker registration used to live here too. It is now owned solely
  // by setupServiceWorkerCache() in utils/cache.js — see main.js.
}

/**
 * Initialize mobile enhancements.
 *
 * Called exactly once, from main.js. It used to ALSO auto-bind itself to
 * DOMContentLoaded at module scope — and because a module script evaluates
 * before that event fires, both ran. None of the functions below guard against
 * re-entry, so every mobile visitor got two copies of the injected <style>
 * blocks and two of the injected nav.
 *
 * The injected nav is gone entirely. It hardcoded its own link list (Home,
 * Marketplace, Wallet, Certificates, Carbon Calculator, Profile) as raw <a
 * href> full page loads, bypassing constants/navigation.js — the documented
 * single source of truth — and showing buying routes to admins, verifiers and
 * developers, whom FINANCE_RESTRICTED_ROLES bounces off those very pages. It
 * could not even be opened: the element sat at translateY(-100%) and its only
 * toggle button was inside it, off-screen. But transform does not remove
 * anything from the tab order or the accessibility tree, so keyboard and
 * screen-reader users on mobile still walked through twelve phantom links.
 * The real mobile navigation is the hamburger in components/layout/Header.vue.
 */
export function initializeMobile() {
  // Add mobile-specific styles
  mobileCSS.addMobileStyles()
  mobileCSS.addSafeAreaSupport()

  // Optimize performance
  mobilePerformance.optimizeImages()
  mobilePerformance.preloadCriticalResources()
}
