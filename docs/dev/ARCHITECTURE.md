# Carbonify — System Architecture

> One-page map of how the app fits together: a Vue SPA, a Supabase backend, and PayMongo for money. For deep dives, follow the cross-links rather than re-reading this file.

Repo/internal name: **ecolink**. Product name: **Carbonify** — a Philippine carbon-credit registry + marketplace.

**See also:** [../SYSTEM_GUIDE.md](../SYSTEM_GUIDE.md) (product/feature walkthrough) · [../PAYMENTS_ARCHITECTURE.md](../PAYMENTS_ARCHITECTURE.md) (money internals) · [../MONEY_CUTOVER_STATUS.md](../MONEY_CUTOVER_STATUS.md) (cutover state) · [DATABASE_AND_RPCS.md](DATABASE_AND_RPCS.md) · [DEPLOYMENT.md](DEPLOYMENT.md)

---

## 1. High-level overview

Three tiers:

- **Frontend** — Vue 3 + Vite SPA (Pinia + Vue Router). Hosted on Vercel. Talks to Supabase directly (PostgREST + RPC + Auth + Storage) and invokes Edge Functions for anything money- or secret-sensitive.
- **Backend** — Supabase project: Postgres (with Row-Level Security), Auth (incl. MFA/TOTP), Storage, and Deno Edge Functions.
- **Payments** — PayMongo (checkout sessions + signed webhooks). Secret keys live only in Edge Functions, never in the browser.

```
Browser (Vue SPA, Vercel)
  |  supabase-js: PostgREST reads, RPC calls, Auth, Storage
  |  functions.invoke(): checkout / verify
  v
Supabase
  ├── Postgres + RLS  (financial tables are SERVER-WRITE-ONLY)
  ├── Auth (email/OAuth/phone + TOTP MFA)
  ├── Storage (evidence, certificates, KYC/KYB docs)
  └── Edge Functions ──HTTP──> PayMongo API
                    ^
PayMongo ──signed webhook──────┘  (source of truth for settlement)
```

The defining rule: **the client never writes money.** It states intent (`{listing_id, quantity}` or a top-up amount); the server computes amounts, and the signed PayMongo webhook settles via `SECURITY DEFINER` RPCs. Financial tables are readable but not client-writable (see §5 and [DATABASE_AND_RPCS.md](DATABASE_AND_RPCS.md)).

---

## 2. Frontend layers

Source under `src/`.

| Layer | Location | Responsibility |
|---|---|---|
| **Views** | `src/views/*.vue` | Route-level pages (Marketplace, Wallet, Cart, Registry, Admin console, Verifier panel, etc.). Lazy-loaded in the router. |
| **Components** | `src/components/` incl. `admin/`, `wallet/`, `auth/`, `layout/`, `ui/` | Reusable UI; `admin/` holds the admin dashboards, `ui/` the primitives. |
| **Directives** | `src/directives/*.js`, registered in `main.js` | `v-modal-a11y` gives a hand-rolled `.modal-overlay` dialog Escape-to-close, a focus trap and `role="dialog"` without changing its markup (backlog #10). Prefer it over restructuring a dialog that already renders its own header; `ui/AccessibleModal.vue` is for **new** dialogs wanting standard chrome. |
| **Formatters** | [`src/utils/format.js`](../../src/utils/format.js) | The single source for `peso` / `pesoCode` / `pesoWhole` / `num` / `round2` / `pct` / `shortDate` / `dateTime`. **Do not re-declare these in a view** — they were duplicated across 13 files and had drifted into three genuinely different behaviours (backlog #9). Add a variant here with a comment instead. |
| **Services** | `src/services/*.js` (one per domain) | The only place that talks to Supabase/PayMongo. Examples: `authService`, `marketplaceService`, `walletService`, `payoutService`, `certificateService`, `receiptService`, `kybService`, `kycService`, `disputeService`, `dataPrivacyService`, `subscriptionService`, `mfaService`, `supabaseClient` (singleton client factory `getSupabase()`). Subfolders `credits/`, `payments/`, `payouts/` hold the newer money logic (e.g. `credits/fulfillmentSaga.js`, mirrored in the webhook). |
| **Store** | `src/store/` (Pinia) | `userStore.js` — session, `profile`, `role`, and the `isAdmin/isVerifier/isProjectDeveloper/isLguUser`, `hasFeature()`, `canAccessRoute()` getters used by guards. Also `cartStore`, `preferencesStore`, `errorStore`. |
| **Router** | `src/router/index.js` | Route table + a global `beforeEach` auth/role/MFA/subscription guard. |
| **Guards** | `src/middleware/roleGuard.js` | Per-role guard factories (see §4). |
| **Constants** | `src/constants/` | `roles.js` (`ROLES`, `PERMISSIONS`, `ROLE_HIERARCHY`), `projectTypes.js`, `plans.js`, `mrv.js`, `lgu.js`, etc. |

Rule of thumb: **components/views never import `supabase` directly** — they call a service. Services own error handling and the shape returned to the UI.

### Shared UI conventions

Three things exist once and should not be hand-rolled per view. Each of these was a
consistency bug before it was a component.

| Use | Instead of |
|---|---|
| [`layout/PageHeader.vue`](../../src/components/layout/PageHeader.vue) — the green page banner (title / subtitle / icon / actions slot) | A per-view `.page-header`. ~30 views hand-rolled one; four different greens and two different paddings resulted. |
| [`ui/CollapsibleList.vue`](../../src/components/ui/CollapsibleList.vue) — collapse a long list/table to its first `visible` rows in a scrollable box with a **See more** toggle | Per-view slice/`showMore` state. Pass `count`, optionally `visible` (default 4) and `rowSelector` (default `tbody > tr`; card lists pass their own). |
| [`styles/tokens.css`](../../src/styles/tokens.css) — `--primary-color` (#069e2d) and friends | A literal hex. `#10b981` (Tailwind emerald) had spread to 28 places, including the nav logo, and reads as a visibly different green. |

Two `CollapsibleList` gotchas: it **replaces** an existing `overflow-x: auto` wrapper
rather than nesting inside one (an inner scroll container becomes the sticky ancestor
and kills the pinned table header), and sticky `th` needs an opaque background —
the component supplies one, overridable via `--collapsible-head-bg`.

Colour contrast on the green banner is a known, tracked gap — see
[DEFERRED_BACKLOG.md](../DEFERRED_BACKLOG.md) #19 before darkening any token.

---

## 3. Routing

Routes are declared in `src/router/index.js`, all lazy-loaded. Route `meta` flags drive access:

- `requiresAuth` — must have a session.
- `requiresAdmin` / `requiresVerifier` / `requiresProjectDeveloper` / `requiresLgu` — role gates.
- `requiresFeature` — subscription/plan gate (redirects to `/upgrade`).
- `disallowedRoles` — array of roles blocked from a route (used for the finance rule, below).

Public (no auth) routes include `/home`, `/about`, `/login`, `/register`, `/marketplace`, `/registry`, `/market`, `/apply`, `/verify/:certificateNumber?`, and the password-reset pages.

### Guard flow (`router.beforeEach`)

1. Allow known public routes immediately.
2. Ensure a session is loaded (fetch/restore from Supabase on refresh; falls back to `supabase.auth.getSession()`).
3. **MFA step-up:** if the user has TOTP enrolled but the session is only `aal1`, redirect to `/mfa-challenge` (via `mfaService.isMfaRequired()`). Fails **open** on transient errors so users aren't locked out.
4. Ensure `profile`/`role` is loaded before evaluating role gates.
5. Run the matching role guard(s) from `roleGuard.js`.
6. Apply `disallowedRoles`, then `requiresFeature` (plan) gating.

---

## 4. Role-based access

Roles (`src/constants/roles.js`): `admin`, `verifier`, `project_developer`, `lgu_user`, `buyer_investor`, `general_user`.

Guard factories in `src/middleware/roleGuard.js`, each returning a redirect (to the role's default route or `/login`) when denied, or `undefined` when allowed:

| Guard | Grants |
|---|---|
| `createAdminGuard` | `admin` only (checks both store role and `profile.role`). |
| `createVerifierGuard` | `verifier` only. |
| `createProjectDeveloperGuard` | `project_developer` only. |
| `createLguGuard` | `lgu_user` **or** `admin`. |
| `createPermissionGuard` | any of the given `PERMISSIONS` (via `userStore.hasAnyPermission`). |

Guards defensively re-fetch the profile if role is missing/`general_user` before deciding, and **fail open** on fetch errors (the route/RLS is the real backstop).

### Finance-restricted-roles rule

Staff roles must not act as buyers. The router defines:

```js
const FINANCE_RESTRICTED_ROLES = [ROLES.ADMIN, ROLES.VERIFIER, ROLES.PROJECT_DEVELOPER]
```

These are set as `disallowedRoles` on the consumer/finance routes: **`/wallet`, `/certificates`, `/carbon-calculator`, `/receipts`**. A restricted role hitting one is bounced to its role default route. This is a UX gate only — the server (RLS + RPC identity checks) is the real enforcement.

---

## 5. Backend

Supabase project. Details of every table/RPC live in [DATABASE_AND_RPCS.md](DATABASE_AND_RPCS.md); the summary:

**Postgres + RLS.** Deny-by-default RLS on sensitive tables. The **financial tables** — `credit_transactions`, `credit_ownership`, `wallet_accounts`, `wallet_transactions` — are **server-write-only**: SELECT (read-your-own) policies are kept, but all INSERT/UPDATE/DELETE policies were dropped (`supabase/cutover/lockdown_financial_writes.sql`, already applied to the live DB). Writes happen only through `SECURITY DEFINER` RPCs (which bypass RLS) or the service-role webhook. `ledger_entries` is append-only (UPDATE/DELETE blocked by trigger, even for the service role).

**Auth.** Email/password, OAuth, and phone sign-in (finalized at `/auth/callback`). TOTP **MFA** is enforced via the router step-up (`/mfa-challenge`) — a user with a factor enrolled cannot reach protected routes at `aal1`.

**Storage.** Buckets for project evidence, generated certificates, and KYC/KYB documents.

**Edge Functions** (`supabase/functions/`, Deno):

| Function | Job | Auth |
|---|---|---|
| `paymongo-checkout` | Server-authoritative checkout. Actions: `create_marketplace_checkout`, `create_subscription_checkout`, `create_wallet_topup_checkout`, and `verify` (reads a session for the callback page). Recomputes amounts server-side, records a `payment_intents` row, creates the PayMongo session. Identity from the verified JWT. | `--no-verify-jwt` (verifies the user token itself) |
| `paymongo-webhook` | **Source of truth for settlement.** Verifies the HMAC signature (+replay window), dedups by event, and settles via RPC by intent purpose. Runs the supplier fulfillment saga for supplier-sourced credits. | `--no-verify-jwt` (signature-verified) |
| `process-payouts` | Worker: picks up `requested` payouts and drives them settled/failed via RPCs (mock provider for now). | `x-worker-secret` |
| `send-approval-email` | Fixed-purpose notifier, **not** a mailer. Takes a message TYPE plus a row id and derives every recipient, subject and body server-side: `role_application_submitted` (→ reviewers), `role_application_decision` (→ applicant, reviewer-gated), `project_submitted` (→ reviewers). Never accepts caller-supplied `to`/`subject`/`html` — that was the H4 relay hole. | function default (JWT) |
| `account-deletion` | DPA erasure worker: deletes the auth user (cascades personal data) for pending `data_subject_requests`. | `x-worker-secret` |

---

## 6. End-to-end money flows

All amounts are server-computed. The webhook is idempotent and the single settlement authority. Full detail: [../PAYMENTS_ARCHITECTURE.md](../PAYMENTS_ARCHITECTURE.md).

### A. Card / e-wallet purchase (PayMongo)

1. Browser calls `functions.invoke('paymongo-checkout', { action: 'create_marketplace_checkout', listing_id, quantity, origin })`. **No amount is sent.**
2. `paymongo-checkout` derives the user from the JWT, loads the listing, checks it's `active` and has stock, and **recomputes** `amount = price_per_credit × quantity`.
3. It inserts a `payment_intents` row (`purpose='marketplace_purchase'`, authoritative amount, status `created`→`pending`), then creates a PayMongo **checkout session** carrying `metadata.payment_intent_id`.
4. Browser redirects to PayMongo's hosted checkout; user pays.
5. PayMongo POSTs `checkout_session.payment.paid` to **`paymongo-webhook`**. It verifies the signature, records the event (dedup), reads the intent by `payment_intent_id`.
6. For a marketplace intent it calls **`process_marketplace_purchase(intent_id, provider_payment_id)`** — one transaction that locks the listing + credit pool, decrements stock, writes `credit_transactions` + `credit_ownership`, posts **balanced double-entry ledger** legs (`paymongo_clearing` debit; seller net → `escrow_held`; platform fee → `platform_revenue`), opens an `escrow_holds` row, and flips the intent to `paid`.
7. If the listing's `source='supplier'`, the webhook runs the **fulfillment saga** (order + retire at the external registry; auto-`refund_purchase` on failure).
8. The certificate is generated for the buyer (certificate/receipt services); PayMongo redirects the browser to `/payment/callback`, which polls for the settled record.

### B. Wallet purchase (spend existing balance)

1. Browser calls RPC **`process_wallet_purchase(listing_id, quantity)`** (callable by `authenticated`; buyer = `auth.uid()`).
2. In one transaction it recomputes the amount from the listing, locks the listing + pool + the buyer's `wallet_accounts` row, checks balance, decrements stock, **debits the wallet**, writes a `wallet_transactions` (withdrawal) row, `credit_transactions` + `credit_ownership`, and posts ledger legs (`wallet_float` debit → `seller_payable` + `platform_revenue`). No PayMongo, no webhook.

### C. Wallet top-up (add funds)

1. Browser calls `functions.invoke('paymongo-checkout', { action: 'create_wallet_topup_checkout', amount, origin })`. Amount is legitimately user-chosen but still recorded as a `payment_intents` row (`purpose='wallet_topup'`).
2. PayMongo checkout → user pays → webhook receives `payment.paid`.
3. Webhook reads the intent, calls **`update_wallet_balance_atomic(user_id, amount, 'add')`** (service-role only), records a completed `wallet_transactions` deposit keyed to the checkout session id, and marks the intent `paid`. Top-ups intentionally write **no ledger entry** (reconciliation scopes ledger checks to marketplace intents).

> Subscriptions follow the same shape via `create_subscription_checkout` → webhook → `activate_subscription(user_id, plan)` (price from the `subscription_plans` catalog; plan columns on `profiles` are write-protected to the service role).

---

## 7. Reconciliation model

The system reconciles **against itself** via `reconcile_financials(p_stuck_minutes := 60)` (service-role only). It returns **one row per detected inconsistency; zero rows = healthy**. It checks:

1. Paid marketplace intents with no settling `credit_transactions`.
2. New-flow completed transactions with no ledger group.
3. Any ledger `entry_id` where debits ≠ credits (should be impossible).
4. `webhook_events` stuck unprocessed past the threshold.
5. Paid-intent amount ≠ settled ledger debit.

Balances are **never stored** — they're derived by summing `ledger_entries` (see the `ledger_account_balances` view). External reconciliation against PayMongo's settlement report is deferred (see `../DEFERRED_BACKLOG.md`). How to run it and interpret results: [DATABASE_AND_RPCS.md](DATABASE_AND_RPCS.md#reconciliation).
