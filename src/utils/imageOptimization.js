/**
 * Image optimization utilities
 */

// `setupLazyLoading()` was REMOVED 2026-08-01.
//
// It ran an IntersectionObserver over `img[data-src]` and swapped in the real
// src, adding a `.loaded` class on the way. Two problems, both silent:
//
//   · **No template in this project uses `data-src`.** The observer was handed
//     an empty NodeList on every page load, so it never swapped anything in.
//     Images that need deferring use the native `loading="lazy"` attribute
//     instead, which the browser handles without any of this.
//   · **`.loaded` is styled by nothing.** Searching the stylesheets for it
//     returns zero rules, so even had it fired, it changed no pixel.
//
// Same shape as the accessibility toggles fixed on 2026-07-31: machinery that
// runs, costs something, and cannot possibly have an effect.

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

  // The WebP-detection block that used to sit here added a `.webp` class to
  // <body> — styled by ZERO rules anywhere in the project. It ran a canvas
  // encode on every page load to set a flag nothing read. Removed 2026-08-01.

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
