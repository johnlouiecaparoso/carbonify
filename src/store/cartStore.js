import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useToastStore } from '@/store/toastStore'

/**
 * Shopping cart for marketplace listings. Device-local (localStorage) — carts
 * are transient and don't need server persistence. Items hold a snapshot of the
 * listing (title/price/image) so the cart renders without re-fetching, plus
 * maxQuantity so we can clamp against availability.
 *
 * Checkout reuses the existing server-authoritative per-item flow
 * (createMarketplaceCheckout); see CartView for the sequential walk-through.
 */
const STORAGE_KEY = 'ecolink_cart'

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export const useCartStore = defineStore('cart', () => {
  const items = ref(load())

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.value))
    } catch {
      /* storage full / unavailable — non-critical */
    }
  }

  const count = computed(() => items.value.reduce((n, i) => n + (Number(i.quantity) || 0), 0))
  const distinctCount = computed(() => items.value.length)
  const subtotal = computed(() =>
    items.value.reduce((sum, i) => sum + (Number(i.pricePerCredit) || 0) * (Number(i.quantity) || 0), 0),
  )
  const currency = computed(() => items.value[0]?.currency || 'PHP')

  function has(listingId) {
    return items.value.some((i) => i.listingId === listingId)
  }

  /** Add a listing (or bump its quantity), clamped to available stock. */
  function addItem(listing, qty = 1) {
    const listingId = listing.listing_id || listing.listingId
    if (!listingId) return
    const max = Number(listing.available_quantity ?? listing.maxQuantity ?? Infinity)
    const existing = items.value.find((i) => i.listingId === listingId)
    const title = listing.project_title || listing.title || 'Carbon credits'
    if (existing) {
      existing.quantity = Math.min(max, (Number(existing.quantity) || 0) + qty)
    } else {
      items.value.push({
        listingId,
        projectId: listing.project_id || listing.projectId || null,
        title,
        pricePerCredit: Number(listing.price_per_credit ?? listing.pricePerCredit) || 0,
        currency: listing.currency || 'PHP',
        image: listing.project_image || listing.image || null,
        maxQuantity: Number.isFinite(max) ? max : null,
        quantity: Math.min(Number.isFinite(max) ? max : qty, qty),
      })
    }
    persist()

    // Raised here rather than at each call site so every "add to cart" in the
    // app confirms itself the same way. Until now the only feedback was the
    // header cart badge, which on a phone is off-screen the moment you have
    // scrolled far enough to reach the button you just pressed.
    useToastStore().push({
      message: `Added to cart — ${title}`,
      icon: 'shopping_cart',
      action: { label: 'View cart', to: '/cart' },
    })
  }

  function setQuantity(listingId, qty) {
    const item = items.value.find((i) => i.listingId === listingId)
    if (!item) return
    const max = item.maxQuantity ?? Infinity
    item.quantity = Math.max(1, Math.min(max, Number(qty) || 1))
    persist()
  }

  function removeItem(listingId) {
    items.value = items.value.filter((i) => i.listingId !== listingId)
    persist()
  }

  function clear() {
    items.value = []
    persist()
  }

  return {
    items,
    count,
    distinctCount,
    subtotal,
    currency,
    has,
    addItem,
    setQuantity,
    removeItem,
    clear,
  }
})
