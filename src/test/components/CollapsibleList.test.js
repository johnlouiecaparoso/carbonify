import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CollapsibleList from '@/components/ui/CollapsibleList.vue'

const rows = (n) =>
  `<table><tbody>${Array.from({ length: n }, (_, i) => `<tr><td>row ${i}</td></tr>`).join('')}</tbody></table>`

function mountList(props, count = props.count) {
  return mount(CollapsibleList, {
    props,
    slots: { default: rows(count) },
    attachTo: document.body,
  })
}

describe('CollapsibleList', () => {
  it('renders its slot content untouched', () => {
    const wrapper = mountList({ count: 3 })
    expect(wrapper.findAll('tbody tr')).toHaveLength(3)
  })

  it('does not collapse when the list fits', () => {
    const wrapper = mountList({ count: 4 })
    expect(wrapper.find('.collapsible__toggle').exists()).toBe(false)
    expect(wrapper.find('.collapsible__viewport').classes()).not.toContain('is-collapsed')
  })

  it('collapses and reports how many rows are hidden', () => {
    const wrapper = mountList({ count: 10 })
    expect(wrapper.find('.collapsible__viewport').classes()).toContain('is-collapsed')
    expect(wrapper.find('.collapsible__toggle').text()).toBe('See more (6 more)')
  })

  it('honours a custom visible count', () => {
    const wrapper = mountList({ count: 10, visible: 2 })
    expect(wrapper.find('.collapsible__toggle').text()).toBe('See more (8 more)')
  })

  it('expands and re-collapses on toggle', async () => {
    const wrapper = mountList({ count: 10 })
    const toggle = wrapper.find('.collapsible__toggle')

    await toggle.trigger('click')
    expect(wrapper.find('.collapsible__viewport').classes()).not.toContain('is-collapsed')
    expect(wrapper.find('.collapsible__toggle').text()).toBe('Show less')

    await toggle.trigger('click')
    expect(wrapper.find('.collapsible__viewport').classes()).toContain('is-collapsed')
  })

  it('re-collapses when the underlying list changes', async () => {
    const wrapper = mountList({ count: 10 })
    await wrapper.find('.collapsible__toggle').trigger('click')
    expect(wrapper.find('.collapsible__viewport').classes()).not.toContain('is-collapsed')

    // e.g. a filter or a refresh replaced the rows
    await wrapper.setProps({ count: 20 })
    expect(wrapper.find('.collapsible__viewport').classes()).toContain('is-collapsed')
  })
})
