# Carbonify — Testing Plan (road to real users)

> **Created:** 2026-07-20 · Companion to [SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md) (the beta
> execution steps) and [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) (the launch gate). This document is the
> **what-to-test map**: the layers of testing Carbonify needs before and during launch, what already
> exists, and what to add.

## The complete list — every test type in the system

> **Added 2026-08-01, extended 2026-08-02.** The detail was already here, spread across §1.1–§1.9 and
> §2. This is the same content as one list, because "what kinds of testing does this system have?" had
> no single answer to point at. **Each row links to its section; the section stays authoritative.**
>
> **23 types across 4 tiers.** Rows `8b`–`8f` were added on 2026-08-01/02 and are worth reading as a
> group: they are all assertions about **wiring and shape** rather than behaviour, because every
> defect they pin was invisible to behavioural tests. A service can be correct while the view imports
> the *other* copy; a module can parse and still fail to load; a fallback can be written, exported and
> unit-tested while nothing calls it. Those are not behaviour bugs, so no behavioural test reaches
> them.

### Tier 1 — Automated, on every change

| # | Type | Status | What it covers |
|---|---|---|---|
| 1 | **Regression gate** ([§1.1](#11-regression-gate-run-on-every-change-)) | 🔴 mandatory | build green · eslint 0 · vitest green · `reconcile_financials()` = 0 after any money change |
| 2 | **Unit (Vitest)** | ✅ **1086 / 90 files** | Pure logic: fees, VAT, reconciliation, VER calculation, EXIF/evidence integrity, LGU jurisdiction, AML screening, segregation of duties |
| 3 | **Component** | ✅ | Vue components in isolation, incl. `modalA11y` (15 dialogs) and `tokenContrast` (fails the suite on a contrast regression) |
| 4 | **End-to-end (Playwright)** ([§1.3](#13-end-to-end-playwright-on-a-seeded-backend-)) | 🟡 **46/47** | 8 specs. **Not required in CI, not seeded** — the job is `continue-on-error`, which is how 6 failures sat unseen |
| 5 | **Responsive / layout** | ✅ **37/37 public + 22/22 authenticated** | Real element geometry at 320/390/768/1024/1440 + tap targets + the 16px input floor. The authenticated half (added 2026-08-01) found **three layout bugs at 320px** on its first honest run. ⚠️ It measures the authenticated **shell**; tables render empty under the DEV mock session |
| 6 | **Guard behaviour** | ✅ | `routerGuardBypass.test.js` drives the real router with a cold store. **Configuration is not enforcement** — see the note below |
| 7 | **Backend configuration** ([§1.9](#19-backend-configuration-tests--)) | ✅ | *Is the deployment configured so the beta can happen at all?* Found two auth settings set against the pilot |
| 8 | **Consent lifecycle** | ✅ **8 tests** | `policyShownOnce.test.js` — the box appears once, on first sign-in, for every role, and what does/does not bring it back |
| 8b | **Service wiring / duplicate reads** 🆕 | ✅ **6 tests** | [`duplicateServiceReads.test.js`](../src/test/services/duplicateServiceReads.test.js) — asserts **which service a view imports**, not what the service does. Added after a fix landed on one of two same-named copies of `getUserCreditPortfolio` while its own comment claimed it covered the view that imported the other. Carries a **ratchet baseline** of 9 known collisions (see [DEFERRED_BACKLOG #33](DEFERRED_BACKLOG.md)) that may shrink but never grow |
| 8d | **Module evaluation** 🆕 | ✅ **121 tests** | [`modulesEvaluate.test.js`](../src/test/services/modulesEvaluate.test.js) — imports every service / util / store / composable / constant module and asserts it EVALUATES, not merely parses. Added 2026-08-02 after removing two dead methods took down the verifier's sign-in: a stale `.bind()` re-export throws at module load, and **build, lint and 957 unit tests all passed while it was broken**. Also asserts it found >40 modules, so it cannot pass vacuously |
| 8e | **Structural guards** 🆕 | ✅ **19 tests** | Assertions about *wiring and shape*, not behaviour, for defects no behavioural test can reach: [`boundExportsResolve`](../src/test/services/boundExportsResolve.test.js) (a `.bind()` naming a missing method), [`noSilentColumnDrop`](../src/test/services/noSilentColumnDrop.test.js) (a failed insert retried with credibility fields deleted), [`fulfillmentSagaParity`](../src/test/services/fulfillmentSagaParity.test.js) (the money-path saga exists twice and the tested copy is not the live one), [`singleSubmitPath`](../src/test/services/singleSubmitPath.test.js) (project submission has exactly one write path), [`noPlaceboClasses`](../src/test/styles/noPlaceboClasses.test.js) (a class added from JS that no rule styles) |
| 8f | **Client lifecycle** 🆕 | ✅ **5 tests** | [`supabaseClientSync.test.js`](../src/test/services/supabaseClientSync.test.js) — `getSupabase()` is synchronous and race-free, so a `null` means "misconfigured" rather than "you asked too early". The startup race was the source of the `[]`-vs-`throw` split across ~125 guards |
| 8c | **Empty-vs-error reads** 🆕 | ✅ **21 tests** | [`emptyOnErrorReads.test.js`](../src/test/services/emptyOnErrorReads.test.js) (14), [`retirementHistoryErrors.test.js`](../src/test/services/retirementHistoryErrors.test.js) (4), [`walletTransactionErrors.test.js`](../src/test/services/walletTransactionErrors.test.js) (3),
[`counterpartyName.test.js`](../src/test/services/counterpartyName.test.js) (6 — separates "you are not a party" from "the RPC is missing"). The repo's most persistent bug class: a failed read returning `[]` and rendering as a **fact about the user**. Each file also asserts the genuinely-empty case still resolves, so none can degrade into a blanket throw |

### Tier 2 — Database & money (owner-run)

| # | Type | Status | What it covers |
|---|---|---|---|
| 9 | **Negative RLS / privilege suite** ([§1.2](#12-integration-tests--rpc--rls-on-a-real-postgres-)) | ✅ **5 PASS · 3 UNPROVEN · 0 FAIL** | *Performs* the attacks, not reads the policies. Re-run against a victim **with data** during the pilot |
| 10 | **Integration (positive RPC path)** ([§1.2](#12-integration-tests--rpc--rls-on-a-real-postgres-)) | 🟡 **written 2026-08-01, owner-run** | [`rpc_positive_suite.sql`](../supabase/diagnostics/rpc_positive_suite.sql). Transaction ending in `ROLLBACK`; vacuous probes report `UNPROVEN`. Needs the live DB |
| 11 | **Payment & reconciliation** ([§1.4](#14-payment--reconciliation-testing-money-specific-)) | 🔴 | All 6 flows on test keys + **failure injection**: double-fired webhook, expired intent, forced error healing via `paymongo-resettle` |
| 12 | **Escrow behaviour** (`ESC-01…06`) | 🔴 **never run — the current gate.** ⚠️ **Blocked on `20260804000300`**: the method-gate read `payment_intents.provider` (always `'paymongo'`), so the GCash branch never executed and **ESC-02 could not have passed** | Escrow is live and the Terms promise sellers a hold window nobody has watched behave |
| 13 | **Diagnostics / operational health** | ✅ **7 files** | `pilot_preflight` · `escrow_verification` · `feedstock_verification` · `daily_beta_health` · `money_table_rls_audit` · `policy_consent_verification` · 🆕 `access_posture_audit` (2026-08-04 — RLS **read** posture + profiles column grants; covers the blind spots `money_table_rls_audit` has by construction) |

### Tier 3 — Human (the closed beta)

| # | Type | Status | What it covers |
|---|---|---|---|
| 14 | **User Acceptance Testing** | 🟠 ready to hand out | **98 tests, 13 blocks** — see the table in §2 |
| 15 | **Closed beta / pilot** ([§2](#2-beta-test-plan-the-invited-pilot)) | 🟠 next step | 8–15 invited users, all seven roles, test keys, 2–4 weeks |

### Tier 4 — Specialist & external

| # | Type | Status | What it covers |
|---|---|---|---|
| 16 | **Independent penetration test** ([§1.5](#15-security-testing-)) | 🔴 **the last P0** | External firm. Auth, RBAC, payment flow, RLS. Weeks of lead time — blocks live payment keys |
| 17 | **Accessibility** ([§1.8](#18-accessibility-)) | 🟡 partial | ✅ contrast · ✅ dialog keyboard access · ✅ preference toggles made real. ⬜ `for`/`id` on MRV/LGU forms, focus outside dialogs, screen-reader pass |
| 18 | **Load / performance** ([§1.7](#17-load--performance-testing--before-scaling-not-before-soft-launch)) | ❌ not done | *Before scaling, not before soft launch* |

### UAT blocks at a glance — 98 tests

| Block | # | Who | Block | # | Who |
|---|---|---|---|---|---|
| `OWN` | 10 | Owner pre-flight | `LGU` | 7 | LGU |
| `ESC` | 6 | 🔴 Money safety | `VER` | 6 | Verifier |
| `BUY` | 13 | Buyer | `FEED` | 6 | Admin feedstock *(never tested)* |
| `DEV` | 11 | Project developer | `KEY` | 6 | Keyboard & clarity |
| `FARM` | 11 | Farmer | `PUB` | 6 | Public, no login |
| `ADMIN` | 8 | Admin | `PRIV` | 4 | Privacy rights *(never tested)* |
| | | | `INV` | 4 | Investor |

### Two things this list should not let you misread

> ⚠️ **A green suite is not evidence on the money path.** ~40 tests **overstate** it (#21): the
> `services/credits|payments|payouts` provider layer is imported **only by tests**.
> `paymongoWebhookSignature.test.js` verifies signatures against `PayMongoProvider`, while the code
> that actually guards live money is inside `supabase/functions/paymongo-webhook`.

> ⚠️ **An assertion about configuration is not an assertion about enforcement.**
> `routeAccess.test.js` asserted that `/admin` *carries* `requiresAdmin` and stayed green for months
> while a whole branch of the router guard never *read* it. Tests 6, 7 and 8 above all exist because
> of that shape. When adding a test, ask which of the two it is.

**Where the gaps actually are:** ① positive-path integration tests (none) · ② e2e not required in CI
and not seeded · ③ authenticated pages unmeasured for layout · ④ load testing · ⑤ the pentest.

---

## Where testing stands today

| Layer | State |
|---|---|
| Unit tests | ✅ **1308 passing across 116 files** (Vitest) — re-measured 2026-08-06, not carried forward. *(This row read "920 across 79 files, re-run 2026-08-01" until then — 383 tests and five days of drift, on the page that owns what is tested. A count is a claim like any other.)* Pure math: fees, VAT, reconciliation logic, farmer/investor/MRV aggregation. The 2026-07-22 role audit added ~200, covering the VER calculation breakdown, EXIF/evidence integrity, LGU jurisdiction matching, AML name screening, admin segregation of duties and the verification timeline. |
| **Migration replay guards** | ✅ **new layer 2026-08-05 (evening)** — [`migrationReplayGuard.test.js`](../src/test/services/migrationReplayGuard.test.js), 7 tests. `create or replace` overwrites rather than merges, so pasting a superseded migration into the SQL editor silently reverts every fix since — which **happened twice on 2026-08-05**, to the escrow method-gate and then to `reconcile_financials()`. The existing `migrationSupersession.test.js` was working correctly and could never have helped: it asserts the warning is *written*, and the failure mode is a written warning not being *read*. The 16 money-path migrations now carry an **executable** guard that raises before any statement below it. This suite asserts the guard exists, precedes the first DDL, names the real recovery file, and — the assertion that matters — that **its marker can actually fire**: present in the newest definition and absent from every earlier one, because a guard whose marker also appears in the old file passes review and never once aborts. Mutation-checked in two directions. ✅ **Proven on live**: the owner pasted the file that caused the morning's revert and the database refused it |
| Live-DB security verification | ✅ done 2026-07-20 — RLS lockdown + money-table policies verified; `reconcile_financials()` = 0. |
| Integration tests (RPC/RLS on a real DB) | 🟡 **the negative half is now written** — [`rls_negative_suite.sql`](../supabase/diagnostics/rls_negative_suite.sql) impersonates a real authenticated user and *attempts* 8 attacks. Owner-run (needs the live DB); not yet executed. The positive RPC half is still unautomated. |
| End-to-end (Playwright) | 🟡 **46/47 passing** (2026-07-29) and still not required in CI. Was **38/44 with 6 silent failures** — see the box below. The one red (`pilot-readiness`) was correct and is **resolved on the backend 2026-07-31**. |
| Responsive layout | ✅ **new 2026-07-31** — [`responsive.spec.js`](../src/test/e2e/responsive.spec.js), **37/37**, measuring real element geometry at 320/390/768/1024/1440 plus tap-target height and the 16px input floor. Found a `/home` overflow (a stats row 697px wide on a 390px screen) that reading the CSS had not. **Public routes only** — authenticated pages are the widest layouts and remain unmeasured. |
| Manual role click-through | 🟡 partially done live; formalized in the runbook §3. |
| Security / penetration test | ❌ not done — the last P0 before live payment keys. |
| Load / performance | ❌ not done. |
| Accessibility | 🟡 partial (`for`/`id` pass started 2026-07-07; colour contrast closed 2026-07-26 with a token test; **modal keyboard access closed 2026-07-28** — Escape / focus trap / `role="dialog"` on all 15 dialogs, 9 tests; **the preference toggles were made real 2026-07-31** — high contrast, larger text, reduced motion, focus outline and colour-blind cues had been adding classes no stylesheet answered). Remaining: the `for`/`id` pass on MRV/assessment/LGU forms, and focus states outside dialogs. |

**The gap is not unit coverage — it's everything that unit tests can't prove:** RLS policies, RPC grants,
real payment settlement, and real human usage. The plan below is ordered by that gap.

> ### 🆕 2026-07-29 — the e2e suite had been red for an unknown length of time
>
> First full Playwright run in this doc's history: **6 of 44 failing**. Nothing surfaced them, because
> the `e2e` job in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) is
> `continue-on-error: true` — it reports green whatever happens. "Present but not required in CI" was
> understating it: the suite was **present, not required, and failing**.
>
> **Five were stale tests, not product bugs** — and the staleness is the interesting part, because each
> one asserted against markup that never existed:
>
> - Three auth tests waited on a `.error` element. Field errors render as `.enhanced-input__error`
>   (via `UiInput`'s `error` prop) and form errors as `.error-message`. There has never been a bare
>   `.error`.
> - One asserted `/projects` redirects to `/login` when signed out. It is not a protected route at all —
>   it is a **public alias that redirects to `/marketplace`** (`src/router/index.js`). The suite was
>   reporting an auth-guard failure in a place the guard is never consulted.
> - One drove `.sort-select`; the control is `select[aria-label="Sort listings"]`.
>
> One of the three auth tests was worse than stale — *"should show validation errors for short
> password"* asserted a **deliberately removed** rule. Sign-in used to demand 6 characters, which can
> only ever reject a *correct* password on an older account. It is now rewritten to assert the absence
> of that error, so the fix cannot be silently undone.
>
> **The sixth failure was real, and it was not a frontend bug at all** — see §1.9.

---

## 1. The test layers, in priority order

### 1.1 Regression gate (run on every change) 🔴
The non-negotiable check after any code or DB change:
- `npm run build` green · `npx eslint` 0 · `npx vitest run` all green.
- After any money/DB change: **`select * from reconcile_financials();` returns 0 rows.**
- Re-run the affected role's click-through (runbook §3).

### 1.2 Integration tests — RPC + RLS on a real Postgres 🔴
The highest-value thing to *add*, because it's where drift and privilege bugs hide.

> 🆕 **The negative half is now written: [`rls_negative_suite.sql`](../supabase/diagnostics/rls_negative_suite.sql).**
> It `set role authenticated` with a real user's JWT claims and then **performs the attacks** below —
> minting into `project_credits`, repricing another seller's listing, forging a `credit_retirements`
> row, topping up its own wallet, self-promoting to admin, and reading three tables belonging to
> another user. Every probe runs in a subtransaction that is rolled back unconditionally, so it writes
> nothing even when it finds a hole, and is safe against live.
>
> This is deliberately **not** what `money_table_rls_audit.sql` does. That file reads `pg_policies` and
> proves the posture is *declared* correctly; a policy can be declared and still not bite (USING vs
> WITH CHECK, a permissive legacy policy OR-ing the lockdown open, a GRANT that outranks it). Only an
> attempted write settles it.
>
> **Every probe that could pass vacuously reports `UNPROVEN` instead of `PASS`** — if no credit pools
> exist, "the mint was blocked" proves nothing. That is the `escrow_verification.sql` row-3 bug from
> 2026-07-29 designed out from the start rather than patched later.
>
> **Owner-run, and not yet run** — it needs the live DB. It is now a pre-flight step in
> [YOUR_ACTION_ITEMS.md](YOUR_ACTION_ITEMS.md).

- Stand up a disposable Supabase/Postgres (branch DB or local `supabase start`).
- Test each SECURITY DEFINER RPC end to end: `process_marketplace_purchase`, `process_wallet_purchase`,
  `retire_credits_atomic`, `record_farmer_delivery`, `confirm_farmer_delivery`, `offtake_summary`,
  `log_data_room_access`, payout processing.
- **Negative RLS tests** (the important half): as a normal user, attempt to
  UPDATE `project_credits.credits_available`, rewrite another seller's `credit_listings.price`, INSERT a
  `credit_retirements` row, read another user's compliance docs / wallet — each **must fail**. These
  encode the holes migration 000800 closed so they can never silently reopen.

### 1.3 End-to-end (Playwright) on a seeded backend 🟠
Automate the runbook §3 click-throughs so they run in CI:
- Auth: register (buyer/user), login, role guards redirect correctly per role.
- Full spine: developer submits → verifier validates → MRV → issue → buyer buys (test card) → retire →
  certificate verifies.
- Farmer: parcel → delivery → buyer confirm → carbon tab.
- Investor: pipeline + IRR + data-room open logged.
- Make e2e **required in CI** against a seeded DB (currently P2 in the roadmap).

### 1.4 Payment & reconciliation testing (money-specific) 🔴
- All 6 flows on PayMongo **test keys**: card, wallet top-up, wallet buy, cart, retire, subscription.
- After each: certificate + receipt generated, `reconcile_financials()` = 0.
- Failure injection: cancel a payment, double-fire a webhook (idempotency), expire an intent, force a
  webhook error and confirm it's captured in `webhook_events.error` and heals via `paymongo-resettle`.

### 1.5 Security testing 🔴
- **RLS/privilege suite** (1.2's negative tests) as the repeatable in-house security check.
- **Independent penetration test** — external, the last P0 before live keys ($4k–15k; see
  [SYSTEM_COST_MODEL.md](SYSTEM_COST_MODEL.md)).
- Auth hardening checks: email confirmation on, MFA, rate limits, no client secret key, signed webhooks
  only (`ALLOW_UNSIGNED_WEBHOOKS` unset).

### 1.6 User Acceptance / Beta testing 🟠
The invited pilot — its own section below (§2). The two artefacts it runs on:
[UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) (the tests, per role) and
[TEST_REPORT_FORM.md](TEST_REPORT_FORM.md) (what comes back).

> **This layer is not a weaker version of the ones above it — it is the only one that can see a whole
> bug class.** Every `[]`-on-error defect found on this project rendered as a friendly empty state:
> an ESG report stating zero offsets, a verified seller told they were unverified, a farmer told no
> buyer had accepted anything. Each is a *correct-looking* screen, so no assertion above catches it.
> Only a human who knows what they actually own does. That is why the form leads with it (`§C1`).

### 1.7 Load / performance testing 🟡 (before scaling, not before soft launch)
- Marketplace list, registry, and `public_market_stats` under concurrent reads.
- Checkout under concurrent buyers on the same listing (double-claim guard holds).
- Establish a baseline before the stated 1,000-user / ₱2M-GMV milestone.

### 1.8 Accessibility 🟡
- ✅ **Colour contrast** — closed 2026-07-26; `tokenContrast.test.js` fails the suite on a regression.
- ✅ **Dialog keyboard access** — closed 2026-07-28; `v-modal-a11y` on all 15 hand-rolled dialogs,
  guarded by `src/test/directives/modalA11y.test.js`. Wallet top-up and withdraw were reachable but
  **not dismissable** by keyboard before this.
- ✅ **Automated WCAG 2.1 A+AA, public routes** — closed 2026-08-04;
  [`accessibility.spec.js`](../src/test/e2e/accessibility.spec.js), 18 tests, axe-core 4.10.3.
- ✅ **Automated WCAG 2.1 A+AA, AUTHENTICATED routes** — 🆕 **closed 2026-08-05**;
  [`accessibility-authenticated.spec.js`](../src/test/e2e/accessibility-authenticated.spec.js),
  6 tests covering ~40 page-audits (four roles × the ten routes each role's own nav offers, discovered
  rather than hard-coded). **The green above was a statement about the marketing pages**: the
  dashboard, cart, wallet, seller earnings and admin consoles had never been scanned.
  **What it found on its first honest run, all now fixed:**
  - the **notification bell had no accessible name** on every authenticated page, for every role —
    it announced as "button", or with unread items as "button, 3";
  - the **account menu was a `<div>` with a click handler**, so the only route to account settings and
    sign-out was not focusable and could not be opened by keyboard at all. **axe cannot detect this**
    and structurally never will — a div with a listener is indistinguishable from decoration to a
    static rule. It was caught by a hand-written assertion that the control *opens*, which is
    `routerGuardBypass.test.js`'s lesson reached from the a11y side;
  - **four contrast failures that each spanned many pages at once**, every one of them a *translucent*
    value over the brand green: `rgba(255,255,255,.16)` on `PageHeader`'s slotted action buttons
    (a `:deep()` rule, so it outranked each view's own and applied the failure everywhere),
    `opacity:.95` on `.page-description` in four views, and a stray unscoped `.user-avatar` rule
    leaking `#4caf50` over the header avatar at **2.77:1**;
  - the **welcome tour dropped focus on close** — a keyboard user dismissing it landed in the footer,
    past the skip link, the header and the whole sidebar;
  - four `<select>` filters with no accessible name, and the Leaflet attribution links distinguished
    by colour alone.

  > **Two of its own findings were about the test, not the app, and both are worth carrying.**
  > The first version reported phantom contrast failures — six different greens that turned out to be
  > **CSS transition frames**, sampled mid-animation and converging on the settled token. The second
  > reported "something is intercepting in-app navigation" for whole roles: the first-run tour opens
  > **asynchronously**, so dismissing it before it appeared missed it and the `aria-modal` overlay then
  > ate every click. *A sweep blocked that way still audits the landing page* — so it clears a
  > `measured > 0` guard while covering one route in ten, which is why the guard is now
  > `> 1` when the nav offered routes.

- ⬜ Finish the `for`/`id` pass on MRV/assessment/LGU forms; focus states outside dialogs; a screen
  reader pass over the money path. **Automated rules cover roughly a third of WCAG**, and the DEV mock
  session means every table renders empty — so data-dense layouts are still unaudited.

### 1.9 Backend-configuration tests 🆕 🔴
A layer this plan did not previously have. Every other test asks *does the code behave?*; this one asks
*is the deployment configured such that the beta can happen at all?* — a question no unit, e2e or SQL
check was covering.

[`pilot-readiness.spec.js`](../src/test/e2e/pilot-readiness.spec.js) reads GoTrue's public
`/auth/v1/settings` (read-only, needs only the anon key, **creates no account**) and asserts the
backend accepts signups.

**It found both auth settings set against the pilot, and both documented backwards** — `disable_signup`
was `true` and `mailer_autoconfirm` was `false`. ✅ **Both corrected 2026-07-31**: now `false` and
`true` respectively, so the spec passes and registration works. Detail:
[YOUR_ACTION_ITEMS.md](YOUR_ACTION_ITEMS.md) Step 2.

> **Why it reads a settings endpoint instead of registering.** The old `auth.spec.js` registration test
> proved signups work by *signing up*, against whatever backend the build pointed at — which is the
> live project. Every run left a junk account on live: exactly the "leftover test data" §3 below says
> to purge before inviting anyone. It also buried the backend's answer in `console.log` noise, which is
> why *"Signups not allowed for this instance"* sat unread in a failing test.

---

## 2. Beta test plan (the invited pilot)

**Goal:** prove Carbonify survives real human behaviour on test money before spending on a pentest or
legal entity. Execution steps live in [SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md); this is the shape.

**Type:** closed beta, invite-only, **PayMongo test keys** (no real money).

**Participants (aim ~8–15), covering every role at least once:**
- 2–3 buyers/users · 1–2 project developers · 1 verifier (you provision) · 1–2 farmers ·
  1 LGU user (you provision) · 1 investor. Admin = you.

**Duration:** 2–4 weeks, enough for the full spine (submit → validate → MRV → issue → trade → retire) to
run at least a few times with different people.

**What to measure:**
- Task completion per role (could they finish without hand-holding?).
- `reconcile_financials()` = 0 every day (the headline health metric).
- Webhook health, payment success %, any RLS/permission surprises.
- Bugs, confusions, and drop-off points — captured in a simple shared sheet or issue tracker.

**Entry criteria (all true before inviting anyone):** runbook §1 pre-flight all green — reconcile 0,
security verified (done), webhook healthy, the **7 required** edge functions deployed (`public-registry`
is deliberately excluded — [SOFT_LAUNCH_RUNBOOK](SOFT_LAUNCH_RUNBOOK.md) §1c), PayMongo in test mode.
Tick-box equivalent: `OWN-01…10` in [UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) Part 1.

**Exit criteria (ready to move toward real money):**
- Every money flow ran multiple times, reconcile 0 each time.
- No privilege/RLS regression surfaced.
- The role click-throughs pass clean on the latest build.
- Feedback triaged; launch-blocking bugs fixed.

**Feedback loop:** [TEST_REPORT_FORM.md](TEST_REPORT_FORM.md) + a bug channel; triage weekly; fix and
redeploy; re-run the affected click-through. Treat **"couldn't try"** rows as a separate queue from
failures — they usually mean something is *blocked* (a missing role, an undeployed piece) rather than
broken, and are the fastest thing to clear.

---

## 3. Test-data & environment strategy

**Decision needed before the beta:** the current live project (`fmngptolarydbgrtltnd`) has been used for
development and holds test data (test accounts, test projects, the ₱1 purchases we cleaned up today).
Options:
1. **Beta on a cleaned version of this DB** — purge dev test rows to a known baseline (we started this:
   reconcile is now 0). Simplest; watch for leftover test projects/listings.
2. **Beta on a fresh project** — cleanest separation, but you re-apply all migrations and re-seed
   reference data (tax settings, emission factors, admin account).

Recommendation: for a *closed* beta, option 1 is fine now that reconcile is clean — just also remove or
clearly label leftover test projects/listings so pilot users aren't confused by them. Keep production
(real money) for a separate, clean project later.

---

## 4. Quick command reference

```bash
npm run build            # production build must be green
npx eslint src           # lint must be 0
npx vitest run           # all unit tests
npx vitest run src/test/services/farmer.test.js   # a single suite
npx playwright test      # e2e (once seeded backend is wired)
```
```sql
select * from reconcile_financials();   -- books health: expect 0 rows
```
