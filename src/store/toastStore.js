import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * App-wide floating notifications.
 *
 * WHY A STORE AND NOT THE EXISTING <Toast>
 * `components/ui/Toast.vue` is a fine toast, but every view that wants one has
 * to declare its own `toast` ref, its own `v-if`, and its own show/hide
 * plumbing — so the ones that never bothered simply gave no feedback at all.
 * Adding something to the cart or saving a project changed a small badge in the
 * header and nothing else, which on a phone is invisible: the header is above
 * the fold you are looking at.
 *
 * A store plus one host at the app root means an action anywhere — including
 * inside `cartStore.addItem`, which has no template of its own — can raise a
 * notification, and it looks identical in every role.
 *
 * `errorStore` is deliberately left alone. That one is for failures that need
 * acknowledging; this is for confirmations that should disappear on their own.
 */

let nextId = 1

export const useToastStore = defineStore('toast', () => {
  const toasts = ref([])

  function dismiss(id) {
    const t = toasts.value.find((x) => x.id === id)
    if (t?.timer) clearTimeout(t.timer)
    toasts.value = toasts.value.filter((x) => x.id !== id)
  }

  /**
   * Raise a floating notification.
   *
   * @param {object} opts
   * @param {string} opts.message   what happened, in the user's words
   * @param {string} [opts.type]    'success' | 'info' | 'warning' | 'error'
   * @param {string} [opts.icon]    Material Symbols glyph; defaults per type
   * @param {{label: string, to: string}} [opts.action] optional follow-up link
   * @param {number} [opts.duration] ms before auto-dismiss; 0 to keep it up
   * @returns {number} the toast id, for manual dismissal
   */
  function push({ message, type = 'success', icon = '', action = null, duration = 3200 }) {
    if (!message) return 0
    const id = nextId++

    // Repeating an action (adding a second item, saving a second project) should
    // replace the previous confirmation rather than stack another identical card
    // on top of it — otherwise a few quick taps bury the page.
    const duplicate = toasts.value.find((t) => t.message === message)
    if (duplicate) dismiss(duplicate.id)

    const toast = { id, message, type, icon, action, timer: null }
    toasts.value.push(toast)

    if (duration > 0) {
      toast.timer = setTimeout(() => dismiss(id), duration)
    }
    return id
  }

  function clear() {
    for (const t of toasts.value) if (t.timer) clearTimeout(t.timer)
    toasts.value = []
  }

  return { toasts, push, dismiss, clear }
})
