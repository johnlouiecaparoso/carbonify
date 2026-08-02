import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import AppSidebar from '@/components/layout/AppSidebar.vue'
import { useUserStore } from '@/store/userStore'
import { useSidebar } from '@/composables/useSidebar'
import { buildSidebar } from '@/constants/navigation'

/**
 * The sidebar is now the only navigation a signed-in user has. If it fails to
 * render a group, every page in that group becomes unreachable — so these tests
 * mount the real component for each role and check the links are actually in
 * the DOM, rather than trusting that the builders alone are correct.
 */

const ROLES = {
  buyer: 'general_user',
  investor: 'buyer_investor',
  admin: 'admin',
  verifier: 'verifier',
  developer: 'project_developer',
  lgu: 'lgu_user',
  farmer: 'farmer',
}

let currentPath = '/dashboard'

// Stubbing router-link rather than installing a real router keeps these tests
// about the sidebar. `to` is rendered as href so assertions can read it back.
const RouterLinkStub = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

vi.mock('vue-router', () => ({
  useRoute: () => ({
    get path() {
      return currentPath
    },
    get fullPath() {
      return currentPath
    },
  }),
}))

function mountSidebar() {
  return mount(AppSidebar, {
    global: {
      stubs: { RouterLink: RouterLinkStub },
    },
  })
}

function signIn(role) {
  const store = useUserStore()
  store.session = { user: { id: 'u1', email: 'dev@carbonify.test' } }
  store.profile = { full_name: 'Ada Reyes' }
  store.role = role
  return store
}

function hrefsOf(wrapper) {
  return wrapper.findAll('.nav-item').map((el) => el.attributes('href'))
}

describe('AppSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    currentPath = '/dashboard'
    const { closeDrawer } = useSidebar()
    closeDrawer()
  })

  it('renders nothing for a signed-out visitor', () => {
    const wrapper = mountSidebar()
    expect(wrapper.findAll('.nav-item')).toHaveLength(0)
  })

  for (const [key, role] of Object.entries(ROLES)) {
    it(`renders every declared destination for ${key}`, () => {
      const store = signIn(role)
      const wrapper = mountSidebar()

      const expected = buildSidebar(store).flatMap((section) =>
        section.items.map((item) => item.path),
      )
      const rendered = hrefsOf(wrapper)

      expect(expected.length).toBeGreaterThan(0)
      for (const path of expected) {
        expect(rendered).toContain(path)
      }
    })

    it(`renders a heading for every titled group for ${key}`, () => {
      const store = signIn(role)
      const wrapper = mountSidebar()

      const titles = buildSidebar(store)
        .map((section) => section.title)
        .filter(Boolean)
      const rendered = wrapper.findAll('.nav-section-title').map((el) => el.text())

      expect(rendered).toEqual(titles)
    })
  }

  it('marks the current route, and only the current route', () => {
    signIn(ROLES.buyer)
    currentPath = '/orders'
    const wrapper = mountSidebar()

    const current = wrapper.findAll('.nav-item.current')
    expect(current).toHaveLength(1)
    expect(current[0].attributes('href')).toBe('/orders')
    expect(current[0].attributes('aria-current')).toBe('page')
  })

  it('keeps a parent lit while on one of its child routes', () => {
    signIn(ROLES.developer)
    currentPath = '/developer/ledger/42'
    const wrapper = mountSidebar()

    const current = wrapper.findAll('.nav-item.current').map((el) => el.attributes('href'))
    expect(current).toContain('/developer/ledger')
  })

  it('lights only the most specific item when paths overlap (/biomass/sell vs /biomass)', () => {
    // /biomass/sell sits beneath /biomass but is its own nav item, so a naive
    // prefix match lit both and made "Sell feedstock" look like "Biomass".
    signIn(ROLES.buyer)
    currentPath = '/biomass/sell'
    const wrapper = mountSidebar()

    const current = wrapper.findAll('.nav-item.current').map((el) => el.attributes('href'))
    expect(current).toEqual(['/biomass/sell'])
  })

  it('does not light every link when sitting on the root path', () => {
    // '/' is a prefix of every path, so a naive startsWith check lights the
    // whole sidebar at once.
    signIn(ROLES.buyer)
    currentPath = '/'
    const wrapper = mountSidebar()

    expect(wrapper.findAll('.nav-item.current')).toHaveLength(0)
  })

  it('carries no account block — the header avatar menu owns those links now', () => {
    // This used to assert the opposite. The block existed only because the
    // MOBILE header had no avatar menu, so profile/preferences/KYC/wallet/
    // about/tour/guide/logout were reachable on a phone only by scrolling to
    // the bottom of this drawer. The header is a single row at every width now
    // and carries the avatar dropdown beside the cart, so keeping this here
    // would be a second copy of that menu — and the reason the drawer was long
    // enough that signing out meant scrolling past every feature.
    signIn(ROLES.buyer)
    const wrapper = mountSidebar()

    expect(wrapper.find('.account-block').exists()).toBe(false)
    expect(wrapper.find('.account-name').exists()).toBe(false)
    expect(wrapper.find('.nav-item--logout').exists()).toBe(false)
  })

  it('does not light a product link while sitting on an account page', () => {
    // Account paths are still fed to the highlight resolver even though they
    // are not rendered here: without them, /profile would fall through to
    // whichever product path happened to be the longest prefix match.
    signIn(ROLES.buyer)
    currentPath = '/profile'
    const wrapper = mountSidebar()

    expect(wrapper.findAll('.nav-item.current')).toHaveLength(0)
  })

  it('reflects the drawer and collapsed state as classes', async () => {
    signIn(ROLES.buyer)
    const { openDrawer, toggleCollapsed, collapsed } = useSidebar()
    const wrapper = mountSidebar()

    expect(wrapper.find('.sidebar').classes()).not.toContain('sidebar--open')
    expect(wrapper.find('.sidebar-scrim').exists()).toBe(false)

    openDrawer()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sidebar').classes()).toContain('sidebar--open')
    expect(wrapper.find('.sidebar-scrim').exists()).toBe(true)

    const wasCollapsed = collapsed.value
    toggleCollapsed()
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sidebar').classes().includes('sidebar--collapsed')).toBe(!wasCollapsed)

    // Leave global state as found — these refs are module-scoped.
    toggleCollapsed()
  })

  it('closes the drawer when the scrim is clicked', async () => {
    signIn(ROLES.buyer)
    const { openDrawer, drawerOpen } = useSidebar()
    const wrapper = mountSidebar()

    openDrawer()
    await wrapper.vm.$nextTick()
    await wrapper.find('.sidebar-scrim').trigger('click')

    expect(drawerOpen.value).toBe(false)
  })

  it('gives the collapsed rail a tooltip for every link, since labels are hidden', async () => {
    signIn(ROLES.buyer)
    const { toggleCollapsed, collapsed } = useSidebar()
    if (!collapsed.value) toggleCollapsed()

    const wrapper = mountSidebar()
    await wrapper.vm.$nextTick()

    for (const link of wrapper.findAll('.nav-section .nav-item')) {
      expect(link.attributes('title')).toBeTruthy()
    }

    toggleCollapsed()
  })
})
