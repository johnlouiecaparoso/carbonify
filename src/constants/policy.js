/**
 * The version of the legal documents users are asked to accept.
 *
 * Bump this when the Terms, Privacy Policy or Carbon Credits Policy change in a
 * way that a user should be told about. Everyone is then asked to accept again,
 * and their previous acceptance stays on record rather than being overwritten —
 * that is the whole reason `policy_acceptances` stores a version instead of a
 * boolean.
 *
 * Keep it in step with the documents in `src/App.vue` and
 * `docs/POLICY_AND_USER_AGREEMENT.md`, which move in lockstep by design.
 *
 * A date is used rather than a number so the record says *when* the terms a
 * user agreed to were written, without anyone having to look it up.
 */
export const POLICY_VERSION = '2026-07-31'

/** The three documents covered by a single acceptance. */
export const POLICY_DOCUMENTS = [
  { id: 'terms', label: 'Terms & Conditions' },
  { id: 'privacy', label: 'Privacy Policy' },
  { id: 'carbon', label: 'Carbon Credits Policy' },
]

/** Window event App.vue listens for to open a specific document. */
export const OPEN_POLICY_EVENT = 'carbonify:open-policy'
