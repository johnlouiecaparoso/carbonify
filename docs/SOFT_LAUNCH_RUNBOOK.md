# Carbonify — Soft-Launch Runbook (PayMongo test keys)

> **Created:** 2026-07-20 · **Goal:** put Carbonify in front of a small, invited pilot group on
> **PayMongo test keys** — real users, real workflows, **no real money** — to surface what real usage
> breaks before spending on a pentest or a legal entity.
>
> **Why this is safe to do now:** the financial-table RLS lockdown was verified directly against the
> live DB on 2026-07-20 (migration `20260718000800` applied; all money tables client-read-only or
> owner/staff-scoped; no blanket-write policy). See [HANDOFF.md](HANDOFF.md). This runbook does **not**
> clear you for real payment keys — that still needs an independent penetration test and the legal/PSP
> track (see [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md)).

---

## 0. What "soft launch" means here

| | Soft launch (this doc) | Real launch (later) |
|---|---|---|
| Payments | PayMongo **test** keys, test cards | Live PayMongo keys |
| Users | Small **invited** group you trust | Public signup |
| Money | None moves | Real money |
| Gates cleared | Security RLS ✅, money reconciles ✅ | + pentest, email confirmation, legal entity/PSP |

The point of the pilot is to **watch reconciliation stay at zero under real human behaviour** and to
catch UX/role bugs that unit tests can't.

---

## 1. Pre-flight checks (do all before inviting anyone)

Run each and confirm the expected result. The SQL runs in the Supabase **SQL Editor** (it executes with
elevated rights, so the `service_role`-only grant on the reconcile function is fine there).

> 💡 **Shortcut:** every SQL check below (1a, 1b) plus the money-table RLS audit, the escrow
> apply-status question and the `20260718*` apply-status question are bundled into one read-only
> script — [`supabase/diagnostics/pilot_preflight.sql`](../supabase/diagnostics/pilot_preflight.sql).
> Paste it into the SQL Editor and **read the §7 SUMMARY table at the very bottom** — the Supabase
> editor shows only the LAST statement's result, so the summary is placed last on purpose. Every row
> must say PASS. **1c–1h below are dashboard checks and still have to be done by hand.**
>
> Step-by-step owner instructions for all of this: **[YOUR_ACTION_ITEMS.md](YOUR_ACTION_ITEMS.md)**.

- [ ] **1a. Books reconcile to zero.**
  ```sql
  select * from reconcile_financials();
  ```
  **Expected: 0 rows.** Any row is a discrepancy — stop and investigate before launch.

- [ ] **1b. No stuck/orphaned payment intents.**
  ```sql
  select status, count(*) from webhook_events group by status order by 2 desc;
  select id, error, received_at from webhook_events
   where error is not null order by received_at desc limit 20;
  ```
  *(The column is `received_at`, not `created_at` — `webhook_events` has no `created_at`, so the
  earlier version of this snippet errored. Corrected 2026-07-26.)*
  **Expected:** events settle to a processed state; the `error` column is empty on recent rows. A
  populated `error` is a handler that threw — read it before launch.

- [ ] **1c. All 8 edge functions are deployed** (Supabase Dashboard → Edge Functions):
  `paymongo-checkout` · `paymongo-webhook` · `process-payouts` · `paymongo-reconcile` ·
  `paymongo-resettle` · `send-approval-email` · `account-deletion` · `public-registry`.

- [ ] **1d. PayMongo is in TEST mode.** Confirm the deployed `paymongo-checkout` / `paymongo-webhook`
  secrets hold **test** keys (`sk_test_…`), and the PayMongo webhook points at the live Supabase
  functions URL with event `checkout_session.payment.paid` **enabled** (it auto-disables after repeated
  failures — confirm it shows enabled).

- [ ] **1e. `ALLOW_UNSIGNED_WEBHOOKS` is unset** and `PAYMONGO_WEBHOOK_SECRET` is set — so the webhook
  only trusts signed PayMongo calls.

- [ ] **1f. Sentry is receiving events** (if a `VITE_SENTRY_DSN` is configured) — trigger any handled
  error and confirm it lands, so you have eyes on the pilot.

- [ ] **1g. Frontend deployed** from the current `feature-user-onboarding-ux` build; the header/login
  logo renders (the green-leaf badge), and `/` hero stats load real numbers, not `—`.

- [ ] 🔴 **1h. `process-payouts` is deployed, its secret is set, AND it is scheduled.** Added
  2026-07-29, when escrow went live. `process_marketplace_purchase` now holds card sellers' net in
  `escrow_held`, and `release_matured_escrow()` — called only from this worker — is the only thing that
  frees it. **Unscheduled means every card seller's money is held permanently, not late.**
  **It is not a one-click schedule:** the function 401s unless `PAYOUT_WORKER_SECRET` is set on it and
  sent as the `x-worker-secret` header, so a naive schedule fails silently every 15 minutes. Full
  procedure: [`supabase/cutover/schedule_payout_worker.sql`](../supabase/cutover/schedule_payout_worker.sql)
  and [YOUR_ACTION_ITEMS.md](YOUR_ACTION_ITEMS.md) Step 0. Prove it with
  [`escrow_verification.sql`](../supabase/diagnostics/escrow_verification.sql) row 3 — note that it
  reports **UNPROVEN**, not PASS, while `escrow_holds` is empty.

- [ ] **1i. Escrow behaviour verified**, not just applied — the four flows in
  [ESCROW_DECISION.md §6](ESCROW_DECISION.md), each followed by
  [`escrow_verification.sql`](../supabase/diagnostics/escrow_verification.sql). The Terms §1.5 already
  promise sellers this hold window.

- [ ] **1j. The farmer payment record verified** —
  [`feedstock_verification.sql`](../supabase/diagnostics/feedstock_verification.sql) after the
  click-through in [YOUR_ACTION_ITEMS.md](YOUR_ACTION_ITEMS.md) §1c. The Terms §1.14 promise farmers
  they can contest a payment record.

---

## 2. Known limitations — disclose these to every pilot user

Tell the pilot group plainly, so nobody mistakes the pilot for production:

- **Payments run in test mode — no real money moves.** Use the PayMongo test card `4343 4343 4343 4345`, any future expiry, any
  CVC. No real charge occurs.
- **Email confirmation is OFF.** Sign-ups aren't verified yet, so **only invite people you trust**, and
  don't put anything sensitive behind an account. (Turning this on is the next gate before public
  signup.)
- **VAT invoices are provisional** — not BIR-accredited until the legal entity is registered.
- **Credit fulfillment is internal only** — there is no live external-registry retirement yet; a retired
  credit produces a Carbonify certificate, not a Verra/Gold Standard registry receipt.

---

## 3. End-to-end click-through (run once per pilot, and after any deploy)

This walks the full product spine — **register → validate → MRV → issue → trade → retire** — plus the
expansion surfaces. Use separate accounts per role. Confirm `reconcile_financials()` = 0 rows **after
the money steps** (3f, 3g).

**Setup roles** (admin sets roles in User Management, or approves role applications):
- [ ] **3a. Developer** submits a project (fill Registry Details + Financials), uploads the required
  compliance documents, confirms they attach and the project reaches "pending".
- [ ] **3b. Verifier** opens the review queue, runs the scored rubric, **sets the price per credit**, and
  validates → the project reaches **validated** and becomes eligible for MRV. **It mints no credits and
  does NOT appear on the marketplace** — that is correct as of the 2026-07-26 mint-on-VER cutover
  (backlog #17). A pool or listing appearing here is a regression, not a pass.
- [ ] **3c. Developer** files a **monitoring report** (MRV); **verifier approves a VER**, picks
  **Removal vs Avoidance** → credits mint **and the project auto-lists on the marketplace** (the VER
  trigger creates the listing, or tops up its quantity if one already exists). Check the **MRV
  dashboard** rolls it up. **Steps 3d–3g depend on this** — before 3c there is nothing new to buy.
- [ ] **3d. Buyer** completes **KYC** (buy gate), browses `/marketplace`, adds to cart.
- [ ] **3e. Buyer** tops up the **wallet** (test card) → confirm balance updates.
- [ ] **3f. Buyer** buys credits — run **all money paths** at least once across the pilot:
  card purchase · wallet purchase · cart (2 items) · subscription (`/upgrade` → Pro).
  After each: **certificate + receipt generate**, and `reconcile_financials()` = **0 rows**.
- [ ] **3g. Buyer** **retires** credits → retirement certificate generates; `reconcile_financials()` = 0.
- [ ] **3h. Seller/Developer** submits **KYB**, requests a **payout**; **admin** approves via
  `/admin/kyb` + `/admin/refunds`; run `process-payouts`; `reconcile_financials()` = 0.
- [ ] **3i. Farmer** (admin-approved role) registers a parcel, logs a delivery against an accepted
  biomass RFQ; **buyer confirms receipt + names the project**; farmer's **Carbon tab** shows attributed
  tCO₂e (as an estimate).
- [ ] **3j. Investor** (`buyer_investor`, Pro) opens `/investor` → sees pipeline, IRR/NPV, and opens a
  data-room document; developer sees the access at `/developer/data-room`.
- [ ] **3k. Public** verifies a certificate via its QR/serial on the public verification page.

Any step that fails → log it, note which layer broke (UI / RPC / RLS / edge fn), fix, redeploy, re-run
the affected step.

---

## 4. Daily monitoring during the pilot

> 💡 **All of this is one script:**
> [`supabase/diagnostics/daily_beta_health.sql`](../supabase/diagnostics/daily_beta_health.sql). One
> paste, one table, eight rows, each with its own escalation level. It also covers two failure modes
> the list below does not: **stranded seller money** (the payout cron stopped — invisible from the app,
> nobody gets an error, a seller simply never gets paid) and **farmers reporting non-payment**.

- [ ] **Reconciliation:** `select * from reconcile_financials();` → **0 rows**. This is the single most
  important daily check. A non-zero result means money and ledger disagree — pause new activity.
- [ ] **Webhook health:** recent `webhook_events` all processed, `error` empty; PayMongo webhook still
  **enabled** in the PayMongo dashboard.
- [ ] **Errors:** Sentry issues triaged; watch for auth, checkout, and RPC-grant errors.
- [ ] **Settlement drift:** run `paymongo-reconcile` (system-vs-PayMongo) periodically; if it flags
  orphaned paid intents, run `paymongo-resettle` to heal them.

---

## 5. Abort / rollback criteria

Pause the pilot and investigate immediately if any of these occur:

- `reconcile_financials()` returns a non-zero row (books don't balance).
- A purchase settles but no certificate/receipt appears (webhook handler failing silently — check
  `webhook_events.error`).
- Any user can see another user's compliance documents, wallet, or another farmer's deliveries (RLS
  regression).
- The PayMongo webhook auto-disables (repeated handler failures) — recreate it, reset the secret, then
  fix the underlying handler error before resuming.

The RLS rollback SQL (only if a **legitimate** flow is blocked by the lockdown) is at the bottom of
`supabase/migrations/20260718000800_lock_credit_pool_and_listing_writes.sql`.

---

## 6. Exit criteria — when to graduate to real-money prep

Move off the pilot toward real launch once, across the pilot window:
- [ ] Every money path in §3f–3h has run multiple times with `reconcile_financials()` = 0 each time.
- [ ] No RLS/privilege regression surfaced.
- [ ] Webhook + reconciliation stayed healthy for the full window with no manual heals needed.
- [ ] The role click-through (§3) passes clean after the latest deploy.

Then start the real-money gate in [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md): **email confirmation on**,
**RLS posture captured into a versioned migration**, **independent penetration test**, and the
**legal entity / licensed PSP** track — before switching to live PayMongo keys.
