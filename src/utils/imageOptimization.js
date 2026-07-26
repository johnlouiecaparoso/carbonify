/**
 * Image optimization utilities
 */

/**
 * Lazy load images with intersection observer
 */
export function setupLazyLoading() {
  if (typeof window === 'undefined') return

  const imageObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target
          const src = img.dataset.src
          const srcset = img.dataset.srcset

          if (src) {
            img.src = src
            img.removeAttribute('data-src')
          }

          if (srcset) {
            img.srcset = srcset
            img.removeAttribute('data-srcset')
          }

          img.classList.remove('lazy')
          img.classList.add('loaded')
          observer.unobserve(img)
        }
      })
    },
    {
      rootMargin: '50px 0px',
      threshold: 0.01,
    },
  )

  // Observe all lazy images
  document.querySelectorAll('img[data-src]').forEach((img) => {
    imageObserver.observe(img)
  })

  return imageObserver
}

/**
 * Preload critical images
 */
export function preloadCriticalImages(imageUrls) {
  if (typeof window === 'undefined') return

  imageUrls.forEach((url) => {
    // Skip if already preloaded
    const existingPreload = document.querySelector(`link[rel="preload"][href="${url}"]`)
    if (existingPreload) return

    const link = document.createElement('link')
    link.rel = 'preload'
    link.as = 'image'
    link.href = url
    link.crossOrigin = 'anonymous' // For external images

    // Add error handling
    link.onerror = () => {
      console.warn(`Failed to preload image: ${url}`)
      link.remove()
    }

    document.head.appendChild(link)
  })
}

/**
 * Optimize image loading with progressive enhancement
 */
export function optimizeImageLoading() {
  if (typeof window === 'undefined') return

  // Check for WebP support
  const supportsWebP = () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0
  }

  // Add WebP class to body if supported
  if (supportsWebP()) {
    document.body.classList.add('webp')
  }

  // Setup lazy loading
  setupLazyLoading()

  // Only preload images if they're actually used on the current page
  // Check if there are any img elements that reference these Unsplash images
  const checkForUnsplashImages = () => {
    const images = document.querySelectorAll('img')
    const unsplashImages = []

    images.forEach((img) => {
      const src = img.src || img.dataset.src || ''
      if (src.includes('unsplash.com')) {
        unsplashImages.push(src)
      }
    })

    return unsplashImages
  }

  // Wait for DOM to be ready, then check for actual image usage
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const usedImages = checkForUnsplashImages()
      if (usedImages.length > 0) {
        preloadCriticalImages(usedImages)
      }
    })
  } else {
    const usedImages = checkForUnsplashImages()
    if (usedImages.length > 0) {
      preloadCriticalImages(usedImages)
    }
  }
}
