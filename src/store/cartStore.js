import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { useToastStore } from '@/store/toastStore'
import { useUserStore } from '@/store/userStore'

/**
 * Shopping cart for marketplace listings. Device-local (localStorage) — carts
 * are transient and don't need server persistence. Items hold a snapshot of the
 * listing (title/price/image) so the cart renders without re-fetching, plus
 * maxQuantity so we can clamp against availability.
 *
 * Checkout reuses the existing server-authoritative per-item flow
 * (createMarketplaceCheckout); see CartView for the sequential walk-through.
 *
 * ## The cart is keyed by ACCOUNT, not by device (backlog #35)
 *
 * It used to live under one device-global key. Sign-out clears only `sb-*` /
 * `supabase.*` (see `isAuthStorageKey` — deliberately precise, so signing out
 * no longer wipes theme and accessibility settings), so the basket outlived the
 * session and the next person to sign in on a shared machine inherited it.
 *
 * The backlog framed this as a choice between clearing on sign-out — which
 * loses a legitimate basket — and namespacing per user. Namespacing wins
 * outright once the guest bucket is handled properly: browsing signed-out and
 * then signing in to pay is a normal and important flow, so the GUEST cart
 * merges forward into the account at sign-in and is then emptied. A cart built
 * under account A stays under A's key and is invisible to B.
 */
const PREFIX = 'ecolink_cart'
const GUEST_KEY = `${PREFIX}::guest`

/**
 * The pre-namespacing key. It is removed rather than migrated: its contents
 * belong to whoever last used the device, and adopting them for the next person
 * to sign in is the exact defect this change closes. The cost is that a cart
 * open at deploy time is dropped once — device-local, public listing data,
 * rebuilt in two clicks.
 */
const LEGACY_KEY = PREFIX

function keyFor(userId) {
  return userId ? `${PREFIX}::${userId}` : GUEST_KEY
}

function read(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Valid JSON is not necessarily a cart. A stored object or string would
    // make every `.reduce` below throw during store construction — that is
    // during component setup, so it blanks the page rather than the cart.
    return Array.isArray(parsed) ? parsed.filter((i) => i && i.listingId) : []
  } catch {
    return []
  }
}

function write(key, items) {
  try {
    localStorage.setItem(key, JSON.stringify(items))
  } catch {
    /* storage full / unavailable — non-critical */
  }
}

function drop(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* non-critical */
  }
}

/**
 * Fold the signed-out basket into the account's own. Quantities take the larger
 * of the two rather than summing: the same listing added once as a guest and
 * again after signing in is one intent to buy, not two.
 */
function mergeCarts(target, incoming) {
  const merged = target.map((i) => ({ ...i }))
  for (const item of incoming) {
    const existing = merged.find((i) => i.listingId === item.listingId)
    if (existing) {
      const max = existing.maxQuantity ?? Infinity
      existing.quantity = Math.min(max, Math.max(existing.quantity || 0, item.quantity || 0))
    } else {
      merged.push({ ...item })
    }
  }
  return merged
}

export const useCartStore = defineStore('cart', () => {
  drop(LEGACY_KEY)

  const userStore = useUserStore()
  const userId = computed(() => userStore.session?.user?.id || null)

  const activeKey = ref(keyFor(userId.value))
  const items = ref(read(activeKey.value))

  function persist() {
    write(activeKey.value, items.value)
  }

  // Which bucket is "ours" is not knowable at construction time: the session is
  // restored asynchronously, and changes again on sign-in and sign-out.
  // Re-pointing here is what makes the namespacing hold for a session that
  // lands after the store was already created.
  watch(userId, (id, previous) => {
    if (id === previous) return
    const nextKey = keyFor(id)

    if (id && !previous) {
      // Signing in: carry the guest basket forward, then empty it so the next
      // signed-out visitor on this device does not inherit it either.
      const guest = read(GUEST_KEY)
      const mine = read(nextKey)
      const merged = guest.length ? mergeCarts(mine, guest) : mine
      drop(GUEST_KEY)
      activeKey.value = nextKey
      items.value = merged
      if (guest.length) persist()
      return
    }

    activeKey.value = nextKey
    items.value = read(nextKey)
  })

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
