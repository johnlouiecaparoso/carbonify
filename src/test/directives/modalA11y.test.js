import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { modalA11y } from '@/directives/modalA11y'

/**
 * Guards DEFERRED_BACKLOG #10.
 *
 * The app carried 15 hand-rolled `.modal-overlay` dialogs and not one handled
 * Escape — including the wallet top-up and withdraw dialogs, so a keyboard user
 * could not dismiss a payment dialog. None trapped focus either, so Tab walked
 * out of the dialog onto the page behind it.
 */

// jsdom reports offsetParent as null for everything, which the directive uses
// to skip hidden nodes. Force it to behave like a laid-out document.
function makeVisible() {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() {
      return this.parentNode
    },
  })
}

const Harness = {
  directives: { 'modal-a11y': modalA11y },
  props: { open: Boolean, onClose: Function },
  template: `
    <div>
      <button id="outside">outside</button>
      <div v-if="open" class="modal-overlay" v-modal-a11y="onClose">
        <button id="first">first</button>
        <input id="middle" />
        <button id="last">last</button>
      </div>
    </div>
  `,
}

function press(key, opts = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...opts }))
}

describe('v-modal-a11y', () => {
  beforeEach(() => {
    makeVisible()
    document.body.style.overflow = ''
  })
  afterEach(() => {
    document.body.style.overflow = ''
  })

  it('closes the dialog on Escape — the defect this exists for', async () => {
    const onClose = vi.fn()
    const wrapper = mount(Harness, {
      props: { open: true, onClose },
      attachTo: document.body,
    })

    press('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)

    wrapper.unmount()
  })

  it('marks the overlay as a dialog for assistive tech', async () => {
    const wrapper = mount(Harness, {
      props: { open: true, onClose: () => {} },
      attachTo: document.body,
    })

    const overlay = wrapper.find('.modal-overlay')
    expect(overlay.attributes('role')).toBe('dialog')
    expect(overlay.attributes('aria-modal')).toBe('true')

    wrapper.unmount()
  })

  it('does not override a role the dialog already declares', async () => {
    const Declared = {
      directives: { 'modal-a11y': modalA11y },
      template: `<div class="modal-overlay" role="alertdialog" v-modal-a11y="() => {}"><button>x</button></div>`,
    }
    const wrapper = mount(Declared, { attachTo: document.body })

    expect(wrapper.attributes('role')).toBe('alertdialog')

    wrapper.unmount()
  })

  it('wraps Tab from the last focusable back to the first', async () => {
    const wrapper = mount(Harness, {
      props: { open: true, onClose: () => {} },
      attachTo: document.body,
    })

    document.getElementById('last').focus()
    press('Tab')
    expect(document.activeElement.id).toBe('first')

    wrapper.unmount()
  })

  it('wraps Shift+Tab from the first focusable back to the last', async () => {
    const wrapper = mount(Harness, {
      props: { open: true, onClose: () => {} },
      attachTo: document.body,
    })

    document.getElementById('first').focus()
    press('Tab', { shiftKey: true })
    expect(document.activeElement.id).toBe('last')

    wrapper.unmount()
  })

  it('pulls focus back when it has escaped to the page behind', async () => {
    const wrapper = mount(Harness, {
      props: { open: true, onClose: () => {} },
      attachTo: document.body,
    })

    document.getElementById('outside').focus()
    press('Tab')
    expect(document.activeElement.id).toBe('first')

    wrapper.unmount()
  })

  it('locks body scroll while open and restores it on close', async () => {
    const wrapper = mount(Harness, {
      props: { open: true, onClose: () => {} },
      attachTo: document.body,
    })
    expect(document.body.style.overflow).toBe('hidden')

    await wrapper.setProps({ open: false })
    expect(document.body.style.overflow).not.toBe('hidden')

    wrapper.unmount()
  })

  it('stops listening once the dialog is gone', async () => {
    const onClose = vi.fn()
    const wrapper = mount(Harness, {
      props: { open: true, onClose },
      attachTo: document.body,
    })

    await wrapper.setProps({ open: false })
    press('Escape')

    expect(onClose).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('Escape closes only the topmost of two stacked dialogs', async () => {
    const outer = vi.fn()
    const inner = vi.fn()

    const Stacked = {
      directives: { 'modal-a11y': modalA11y },
      props: { showInner: Boolean, onOuter: Function, onInner: Function },
      template: `
        <div>
          <div class="modal-overlay" v-modal-a11y="onOuter"><button>outer</button></div>
          <div v-if="showInner" class="modal-overlay" v-modal-a11y="onInner"><button>inner</button></div>
        </div>
      `,
    }

    const wrapper = mount(Stacked, {
      props: { showInner: true, onOuter: outer, onInner: inner },
      attachTo: document.body,
    })

    press('Escape')
    expect(inner).toHaveBeenCalledTimes(1)
    expect(outer).not.toHaveBeenCalled()

    wrapper.unmount()
  })
})
