/**
 * Report-a-problem categories and the guidance shown with each one.
 *
 * The `guide` lines are the whole point of the feature. A free-text box gets
 * "it doesn't work", which costs a round trip before anyone can even reproduce
 * the problem. Telling someone what to include, per category, at the moment
 * they are writing, is the cheapest possible fix for that — and it is the
 * "please put a form so the users who report a problem have a guide" ask.
 *
 * Kept as data, not markup, so the same list drives the form, the admin queue
 * and anything later that needs to name a category.
 */

export const SUPPORT_CATEGORIES = [
  {
    value: 'payment',
    label: 'Payment or billing',
    hint: 'Charges, refunds, receipts, wallet top-ups or payouts.',
    guide: [
      'The amount you were charged, and what you expected to be charged.',
      'The date and time of the payment.',
      'Your receipt or transaction number, if you have one.',
      'Which payment method you used (card, GCash, wallet).',
    ],
  },
  {
    value: 'credits',
    label: 'Credits, retirement or certificates',
    hint: 'Missing credits, a retirement that did not complete, a wrong certificate.',
    guide: [
      'The project name and how many credits are involved.',
      'The certificate number, if one was issued.',
      'What you expected to see, and what you actually saw.',
    ],
  },
  {
    value: 'project',
    label: 'A project or its documents',
    hint: 'Submission, validation, MRV reports or evidence files.',
    guide: [
      'The project name or ID.',
      'Which stage it is stuck at (submitted, in review, needs revision).',
      'Any error message shown on screen, copied exactly.',
    ],
  },
  {
    value: 'account',
    label: 'Account, KYC or access',
    hint: 'Sign-in, verification, roles, or a feature you cannot reach.',
    guide: [
      'What you were trying to do.',
      'What the app told you instead — the exact wording helps.',
      'How long it has been this way.',
    ],
  },
  {
    value: 'bug',
    label: 'Something is broken or looks wrong',
    hint: 'A page that will not load, a button that does nothing, a broken layout.',
    guide: [
      'What you clicked, and what happened.',
      'What you expected to happen instead.',
      'Whether it happens every time or only sometimes.',
      'Your device and browser, if you know them.',
    ],
  },
  {
    value: 'other',
    label: 'Something else',
    hint: 'Anything that does not fit the categories above.',
    guide: [
      'What happened, in your own words.',
      'When it happened.',
      'Anything you already tried.',
    ],
  },
]

/** Labels for the admin queue, keyed by the stored value. */
export const SUPPORT_CATEGORY_LABELS = Object.freeze(
  Object.fromEntries(SUPPORT_CATEGORIES.map((c) => [c.value, c.label])),
)

/** The window event any view can dispatch to open the global report dialog. */
export const OPEN_REPORT_EVENT = 'carbonify:report-problem'

/**
 * Open the global "Report a problem" dialog from anywhere.
 * @param {{category?: string, subject?: string, transactionId?: string}} [prefill]
 */
export function openReportProblem(prefill = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_REPORT_EVENT, { detail: prefill }))
}
