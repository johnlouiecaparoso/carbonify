# Testing

How to test Carbonify: unit tests, end-to-end tests, lint/build gates, and the money-path sandbox runbook.

Related: [CONTRIBUTING.md](./CONTRIBUTING.md) · [SECURITY.md](./SECURITY.md) · [SETUP.md](./SETUP.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [../MONEY_CUTOVER_STATUS.md](../MONEY_CUTOVER_STATUS.md) · [../YOUR_CUTOVER_STEPS.md](../YOUR_CUTOVER_STEPS.md)

---

## At a glance

| Layer | Tool | Command | Gate? |
| --- | --- | --- | --- |
| Unit | Vitest + MSW | `npm run test:run` | Yes — must be green |
| E2E | Playwright | `npm run test:e2e` | No — `continue-on-error` in CI |
| Lint | ESLint (flat config) | `npm run lint:check` | Yes — must be **0** |
| Build | Vite | `npm run build` | Yes — must pass |
| Money path | Manual sandbox | see runbook below | Release gate for money changes |

---

## Unit tests (Vitest)

Fast, isolated, no network. Config lives in `vitest.config.js`:

- `environment: 'happy-dom'`, `globals: true`
- `setupFiles: ['./src/test/setup.js']` — mocks the Supabase client, `@/utils/env`, `localStorage`, `fetch`, `IntersectionObserver`/`ResizeObserver`, and resets Pinia before each test
- e2e specs are excluded (`**/src/test/e2e/**`) so they don't run under Vitest
- MSW (`msw`) is available for HTTP mocking; `jsdom` is also installed as an alternate DOM
- Coverage (v8) has an 80% threshold on branches/functions/lines/statements

Current status: **1086 unit tests passing across 90 files** (2026-08-02).

> ⚠️ **Run with `--no-file-parallelism`.** The parallel happy-dom worker init flakes on Windows and
> reports "no tests" — an environment issue, not a real failure. It clears on re-run.
>
> *1086 includes the 121-case `modulesEvaluate` sweep (one assertion per module), so it is not
> directly comparable to earlier counts.*

### Run

```bash
npm run test        # watch mode (vitest)
npm run test:run    # single run (CI mode)
npm run test:ui     # Vitest UI
npm run test:coverage
```

### Where tests live

Under `src/test/`:

- `src/test/services/**` — service/business-logic tests
- `src/test/components/**` — component tests (`@vue/test-utils`)
- `src/test/setup.js` — global mocks + Pinia reset
- `src/test/e2e/**` — Playwright specs (NOT run by Vitest)

### What's covered

| Area | Test file(s) |
| --- | --- |
| Payment providers / abstraction | `services/paymentProvider.test.js`, `services/paymentService.test.js` |
| Payout providers / ledger side | `services/payoutProvider.test.js`, `services/payoutService.test.js` |
| PayMongo webhook HMAC signature | `services/paymongoWebhookSignature.test.js` |
| Supplier fulfillment saga | `services/creditSupplier.test.js`, `services/fulfillmentSaga.test.js`. ⚠️ **These test a copy that does not run** — `src/services/credits/fulfillmentSaga.js` is imported by nothing but its own test, while the code that settles money is the TS port inside `paymongo-webhook`. They had already drifted by 2026-08-02. `services/fulfillmentSagaParity.test.js` compares the two |
| Verification rubric | `services/verificationRubric.test.js` |
| VAT invoicing | `services/vatInvoice.test.js` |
| Subscription plans | `services/plans.test.js` |
| Certificate signing | `services/certificateSignature.test.js` |
| Auth | `services/authService.test.js` |
| Analytics / reporting | `services/marketStats.test.js`, `services/portfolioAnalytics.test.js`, `services/salesByProject.test.js`, `services/transactionHistoryPage.test.js`, `services/projectCredibility.test.js`, `services/esgReportService.test.js`, `services/creditOwnershipHistory.test.js`, `services/savedSearch.test.js` |
| Accessibility | `styles/tokenContrast.test.js` (palette clears WCAG AA), `directives/modalA11y.test.js` (Escape / focus trap / `role="dialog"` on hand-rolled dialogs) |
| UI primitive | `components/Button.test.js` |

> ⚠️ **`esgReportService.test.js` injects a fake ownership service**, so it does not exercise the code
> that builds the history it aggregates. That gap hid backlog #11 — the ESG report under-reported
> retired credits and the suite stayed green. `creditOwnershipHistory.test.js` covers the real
> function. **When a test injects a dependency, something else has to test the real one.**

Payment/ledger **math** (amounts, VAT, provider settlement, webhook signature verification) is the highest-value unit coverage — the server is authoritative for money, so these tests guard the logic that mirrors the server RPCs.

---

## End-to-end tests (Playwright)

Config: `playwright.config.js` (`testDir: ./src/test/e2e`, chromium only — other browsers are commented out). It boots the dev server via `webServer` (`npm run dev` on `http://localhost:5173`).

```bash
npm run test:e2e      # headless
npm run test:e2e:ui   # Playwright UI
npm run test:all      # test:run then test:e2e
```

Specs: `auth.spec.js`, `logout.spec.js`, `marketplace.spec.js`, `wallet.spec.js`, `simple.spec.js`.

### Why e2e is `continue-on-error` in CI

E2E needs a **live backend + real secrets** (Supabase project, PayMongo keys) that CI does not have, and flows depend on seeded accounts and network. So CI runs Playwright non-blocking (`continue-on-error`): failures are visible but do not fail the pipeline. The blocking CI gates are lint, unit tests, and build. Run e2e locally against a working backend when your change touches those flows.

---

## Lint + build as gates

Both are CI-enforced and must pass before a PR merges.

```bash
npm run lint:check   # eslint . — MUST report 0 problems
npm run build        # vite build — MUST succeed
```

- ESLint uses the flat config (`eslint.config.js`) with `@vue/eslint-config-prettier/skip-formatting`, so formatting is **not** linted. `src/_hidden/**` is intentionally ignored (parked code).
- **Do NOT run `npm run format` (Prettier).** It is known to break the build — it reformats multi-statement inline Vue handlers and drops semicolons, which the build then rejects. See [../DEFERRED_BACKLOG.md](../DEFERRED_BACKLOG.md) (item 5) and [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## Money-path SANDBOX runbook

Automated tests do **not** exercise real money settlement. Any change to payments, wallet, ledger, webhook, or RPCs must be verified manually in the PayMongo **sandbox** against a **deployed preview** (not `localhost` — the webhook must reach a public URL). The authoritative step-by-step is [../YOUR_CUTOVER_STEPS.md](../YOUR_CUTOVER_STEPS.md); status is tracked in [../MONEY_CUTOVER_STATUS.md](../MONEY_CUTOVER_STATUS.md).

**Test card:** `4343 4343 4343 4345`, any future expiry (e.g. `12/30`), any 3-digit CVC.

**The invariant:** after **every** money action, run this in the Supabase SQL Editor — it must return **0 rows**:

```sql
select * from reconcile_financials();
```

If it ever returns rows, **stop** — the money math is unbalanced. Do not continue.

### The 6 flows (A–F)

| # | Flow | What it exercises |
| --- | --- | --- |
| A | Buy with **card** | Marketplace → PayMongo → `/payment/callback`; webhook settles via `process_marketplace_purchase`; credits + certificate + receipt |
| B | Wallet **top-up** | `/wallet` top-up → PayMongo → webhook credits balance via `update_wallet_balance_atomic`; completed `wallet_transactions` row (`external_reference` = checkout session id) |
| C | Buy with **wallet** | Buy using the `wallet` method → `process_wallet_purchase` settles server-side; balance debited; certificate issued |
| D | **Cart** (2 items) | Sequential checkout; each item settles; one certificate per item |
| E | **Retire** credits | `retire_credits_atomic` retires across multiple ownership rows (oldest first); retirement certificate |
| F | **Subscription** | `/upgrade` → PayMongo → webhook runs `activate_subscription`; plan flips to Pro |

Each flow must leave `reconcile_financials()` at 0 rows. Financial tables are server-write-only (RLS lockdown) — all settlement runs through SECURITY DEFINER RPCs or the service-role webhook, never the browser.

---

## Pre-commit checklist

Run these before committing (and again before opening a PR):

```bash
npm run lint:check   # 0 problems
npm run test:run     # all green
npm run build        # succeeds
```

- [ ] `lint:check` reports **0**
- [ ] `test:run` is **green**
- [ ] `build` **passes**
- [ ] Did **not** run `npm run format`
- [ ] If money/payments/RPC/webhook touched: money-path sandbox flows re-verified against a deployed preview, `reconcile_financials()` = 0
