/**
 * `v-modal-a11y` — make a hand-rolled modal keyboard-accessible.
 *
 * Closes DEFERRED_BACKLOG #10. The app has 15 hand-rolled `.modal-overlay`
 * dialogs across 9 files and **not one of them handled Escape** — including the
 * wallet top-up and withdraw dialogs, i.e. a keyboard user could not dismiss a
 * payment dialog. None trapped focus either, so Tab walked out of the dialog and
 * onto the page behind it, and none announced themselves as a dialog.
 *
 * ## Why a directive rather than routing them through AccessibleModal.vue
 *
 * The backlog entry proposed the latter, but these overlays wrap arbitrary child
 * components — `<TopUp>`, `<Withdraw>`, `<ListingManagerModal>` — that render
 * their own header and actions. `AccessibleModal` supplies its own title bar and
 * close button, so adopting it would give each of those a second, duplicate
 * header, and the migration would be a visual rewrite of 15 dialogs rather than
 * an accessibility fix. This directive delivers the three behaviours that were
 * actually missing, as one attribute per dialog, with no markup change:
 *
 *   <div v-if="open" class="modal-overlay" v-modal-a11y="close"> … </div>
 *
 * The binding value is the close handler. `v-if` already mounts and unmounts the
 * overlay, so the directive's own lifecycle is the dialog's lifecycle.
 *
 * AccessibleModal.vue remains the right choice for NEW dialogs that want a
 * standard chrome; this is for the ones that already have their own.
 */

const FOCUSABLE =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Topmost-first stack, so Escape closes only the dialog on top. */
const stack = []

/** Query focusables live — a modal's content can change after it opens. */
function focusablesIn(el) {
  return Array.from(el.querySelectorAll(FOCUSABLE)).filter(
    (node) =>
      !node.disabled &&
      node.getAttribute('aria-hidden') !== 'true' &&
      node.offsetParent !== null,
  )
}

function onKeydown(event) {
  // Only the topmost dialog reacts, so Escape closes one layer at a time.
  const top = stack[stack.length - 1]
  if (!top) return

  if (event.key === 'Escape') {
    event.stopPropagation()
    top.close?.()
    return
  }

  if (event.key !== 'Tab') return

  const items = focusablesIn(top.el)

  // Focus is outside the dialog (or there is nothing to focus): pull it back
  // rather than letting Tab walk onto the page behind the overlay.
  if (items.length === 0 || !top.el.contains(document.activeElement)) {
    event.preventDefault()
    ;(items[0] || top.el).focus?.()
    return
  }

  const first = items[0]
  const last = items[items.length - 1]

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

export const modalA11y = {
  mounted(el, binding) {
    if (typeof document === 'undefined') return

    const entry = {
      el,
      close: typeof binding.value === 'function' ? binding.value : null,
      previousFocus: document.activeElement,
      previousOverflow: document.body.style.overflow,
    }
    stack.push(entry)
    el.__modalA11y = entry

    if (!el.hasAttribute('role')) el.setAttribute('role', 'dialog')
    if (!el.hasAttribute('aria-modal')) el.setAttribute('aria-modal', 'true')
    // The overlay must be focusable so focus has somewhere to land when the
    // dialog holds no focusable control yet.
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')

    if (stack.length === 1) {
      document.addEventListener('keydown', onKeydown, true)
      document.body.style.overflow = 'hidden'
    }

    // Defer: children mount after the directive on the parent.
    requestAnimationFrame(() => {
      const items = focusablesIn(el)
      ;(items[0] || el).focus?.()
    })
  },

  updated(el, binding) {
    const entry = el.__modalA11y
    if (entry && typeof binding.value === 'function') entry.close = binding.value
  },

  unmounted(el) {
    const entry = el.__modalA11y
    if (!entry) return

    const index = stack.indexOf(entry)
    if (index !== -1) stack.splice(index, 1)

    if (stack.length === 0) {
      document.removeEventListener('keydown', onKeydown, true)
      document.body.style.overflow = entry.previousOverflow || ''
    }

    entry.previousFocus?.focus?.()
    delete el.__modalA11y
  },
}

export default modalA11y
