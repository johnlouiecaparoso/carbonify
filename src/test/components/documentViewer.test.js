import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// The panel calls load() during setup. Give it one pending application so the
// review workflow actually renders.
vi.mock('@/services/kycService', () => ({
  getKycApplications: vi.fn(async () => [
    {
      id: 'kyc-1',
      user_id: 'user-1',
      full_name: 'Louie Caparoso',
      applicant_email: 'louie@example.com',
      id_document_type: 'Philippine National ID (PhilSys)',
      id_document_url: 'data:image/png;base64,AAAA',
      organization: 'CSU',
      level_requested: 1,
      status: 'pending',
      submitted_at: '2026-07-31T00:00:00Z',
    },
  ]),
  reviewKycApplication: vi.fn(async () => ({})),
}))

import DocumentViewerModal from '@/components/admin/DocumentViewerModal.vue'
import KycReviewPanel from '@/components/admin/KycReviewPanel.vue'

/**
 * THE BUG THIS PINS
 *
 * `KycView.onFileSelected` uploads the ID with `FileReader.readAsDataURL`, so
 * `kyc_applications.id_document_url` holds a **`data:` URI** — the file itself,
 * base64-encoded, in a database column.
 *
 * The review panel put that value straight into `<a href target="_blank">`.
 * Every modern browser BLOCKS top-level navigation to a `data:` URI (Chrome and
 * Firefox since 2017, as an anti-phishing measure). The tab opened, the
 * navigation was refused, and the admin got a blank white page with nothing in
 * the console to explain it — so an ID document could not be reviewed at all.
 *
 * The block applies to NAVIGATION only. The same data URI renders fine as the
 * `src` of an `<img>`, which is why viewing it in-place works.
 *
 * The regression these tests exist to catch is someone "simplifying" the
 * viewer back into an anchor.
 */

// The panel and viewer both use the app-level v-modal-a11y directive.
const global = { directives: { 'modal-a11y': {} } }

const PNG_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('DocumentViewerModal', () => {
  it('renders a data: image as an <img>, not a link', async () => {
    const wrapper = mount(DocumentViewerModal, {
      props: { src: PNG_DATA_URI, applicant: 'Louie C', docType: 'Passport' },
      global,
    })

    const img = wrapper.find('img.doc-image')
    expect(img.exists()).toBe(true)
    expect(img.attributes('src')).toBe(PNG_DATA_URI)

    // The specific regression: an anchor pointing at a data: URI is the broken
    // shape, and it must not come back.
    const dataHrefAnchors = wrapper
      .findAll('a')
      .filter((a) => (a.attributes('href') || '').startsWith('data:'))
    expect(dataHrefAnchors).toHaveLength(0)
  })

  it('shows who submitted it and what they claimed it is', async () => {
    // A reviewer comparing a photo to a name needs both on screen.
    const wrapper = mount(DocumentViewerModal, {
      props: { src: PNG_DATA_URI, applicant: 'Louie C', docType: 'Passport' },
      global,
    })
    expect(wrapper.text()).toContain('Louie C')
    expect(wrapper.text()).toContain('Passport')
  })

  it('renders a PDF in an iframe rather than an image', () => {
    const wrapper = mount(DocumentViewerModal, {
      props: { src: 'data:application/pdf;base64,JVBERi0xLjQK' },
      global,
    })
    expect(wrapper.find('iframe.doc-frame').exists()).toBe(true)
    expect(wrapper.find('img.doc-image').exists()).toBe(false)
  })

  it('treats an http(s) URL as viewable too', () => {
    const wrapper = mount(DocumentViewerModal, {
      props: { src: 'https://example.com/id.png' },
      global,
    })
    expect(wrapper.find('img.doc-image').exists()).toBe(true)
  })

  it('explains itself when the row holds a bare storage path', () => {
    // Older rows may store a path. Rendering nothing would look like the same
    // white screen this fix removed, so it says what is wrong instead.
    const wrapper = mount(DocumentViewerModal, {
      props: { src: 'kyc/user-1/passport.png' },
      global,
    })
    expect(wrapper.find('img.doc-image').exists()).toBe(false)
    expect(wrapper.text().toLowerCase()).toContain('file path')
  })

  it('says so plainly when nothing was attached', () => {
    const wrapper = mount(DocumentViewerModal, { props: { src: '' }, global })
    expect(wrapper.text().toLowerCase()).toContain('no document')
  })

  it('emits close from the close button, so the reviewer stays in the queue', async () => {
    const wrapper = mount(DocumentViewerModal, { props: { src: PNG_DATA_URI }, global })
    await wrapper.find('.doc-close').trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  it('resets zoom and rotation when a different document is opened', async () => {
    // Otherwise the previous reviewer's zoom carries onto the next applicant's ID.
    const wrapper = mount(DocumentViewerModal, { props: { src: PNG_DATA_URI }, global })

    await wrapper.find('[title="Zoom in"]').trigger('click')
    expect(wrapper.find('.doc-image').attributes('style')).toContain('scale(1.25)')

    await wrapper.setProps({ src: 'data:image/png;base64,AAAA' })
    expect(wrapper.find('.doc-image').attributes('style')).toContain('scale(1)')
  })
})

describe('KycReviewPanel — the link that was broken', () => {
  it('opens the document in-tab instead of navigating to a data: URI', () => {
    const wrapper = mount(KycReviewPanel, { global })

    // The panel must not contain an anchor that targets a new tab for the
    // document. That construction is the bug.
    const html = wrapper.html()
    expect(html).not.toContain('target="_blank"')
  })
})

describe('KycReviewPanel — the layout that was confusing', () => {
  /**
   * `.app-card` was `display: flex` with three children (identity, AML row,
   * actions), so they laid out as three COLUMNS: the screening button sat
   * marooned in the middle with no explanation, and the notes input was
   * squeezed until its own placeholder was cut off mid-word. Nothing said what
   * to do first.
   *
   * The AML row was added later as a third sibling without the container being
   * updated — the same shape as the router bug earlier this week: a correct
   * structure that a later addition quietly invalidated.
   */
  async function mountWithPendingApp() {
    const wrapper = mount(KycReviewPanel, { global })
    await flushPromises()
    return wrapper
  }

  it('presents the review as three numbered steps, in order', async () => {
    const wrapper = await mountWithPendingApp()

    const steps = wrapper.findAll('.step-title').map((s) => s.text())
    expect(steps).toHaveLength(3)
    expect(steps[0]).toMatch(/1.*ID document/i)
    expect(steps[1]).toMatch(/2.*watchlist/i)
    expect(steps[2]).toMatch(/3.*decision/i)
  })

  it('gives the notes field a real label instead of a truncated placeholder', async () => {
    const wrapper = await mountWithPendingApp()

    // The old placeholder carried the "required to reject" rule and was cut off
    // mid-word by the squeezed column, so the rule was invisible.
    const label = wrapper.find('.notes-label')
    expect(label.exists()).toBe(true)
    expect(label.text().toLowerCase()).toContain('required to reject')
    expect(wrapper.find('textarea.notes-input').exists()).toBe(true)
  })

  it('says the applicant has not been screened yet, rather than showing nothing', async () => {
    const wrapper = await mountWithPendingApp()
    expect(wrapper.text().toLowerCase()).toContain('not screened yet')
  })

  it('drops the three-column classes entirely', async () => {
    // If any of these return, the row layout has probably returned with them.
    const html = (await mountWithPendingApp()).html()
    for (const dead of ['app-main', 'app-actions', 'aml-row']) {
      expect(html.includes(dead), `${dead} belonged to the broken row layout`).toBe(false)
    }
  })
})
