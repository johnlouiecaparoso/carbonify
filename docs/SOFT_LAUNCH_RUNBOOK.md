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

> ## ✅ 1z. Run 2026-08-05 — 5 rows, both findings now closed
>
> - [x] **[`access_posture_audit.sql`](../supabase/diagnostics/access_posture_audit.sql)** — run
>   2026-08-05. Returned **5 rows**; `20260804000200` was applied and closes both. **Re-run it to
>   confirm 0 rows**, which is the pass condition and has not itself been re-measured since.
>
> | Finding | What it said | Read |
> |---|---|---|
> | **C ×2** | `plan`, `plan_expires_at` client-writable | 🟢 Better than feared — **not** `kyb_verified` / `is_active` / `role` / `kyc_level`, so `20260703000300` was applied once and never re-run and the later revokes held. The KYB-self-approval hole was **never open on live**, and `trg_protect_plan_columns` was reverting plan writes anyway |
> | **D ×3** | `municipality`, `province`, `onboarding_tour_version` not owner-writable | 🔴 **Live and broken.** `updateProfile` PATCHes the whole form at once, so **every profile save was failing `42501`**; the welcome tour replayed on every device forever. Nobody had reported either |
>
> It is first because it answers a question no other check on this page asks — *who can read this,
> and what can a client write to a profile?* — and, as finding D showed, it can surface a feature
> that has been broken in production for a month with no report attached to it.
>
> `pilot_preflight.sql` does not cover this, and neither does `money_table_rls_audit.sql`: the latter
> inspects only `INSERT/UPDATE/DELETE/ALL` policies, so an open **SELECT** policy passes it silently,
> and `certificates` and `profiles` were never in its table list at all. Both tables predate version
> control and carry **no tracked RLS policy** — their posture exists only on the live database, which
> is exactly the class of thing a pre-flight is for.
>
> - [x] ✅ **Production URL — `https://carbonify-gilt.vercel.app`.** ⚠️ **Not `carbonify13.vercel.app`**,
>   which returns `404 DEPLOYMENT_NOT_FOUND` since the GitHub repo was renamed. Vercel had created the
>   project as `carbonify-gilt` (it appends a random word when the name is taken). Verified
>   2026-08-05 across all 106 deployed chunks with
>   `node scripts/analysis/verify-deploy.mjs https://carbonify-gilt.vercel.app`.
> - [x] ✅ **The five `20260804*` migrations are applied** (2026-08-05, each *"Success. No rows
>   returned"*), `main` is pushed, and **all three** money edge functions are redeployed —
>   `paymongo-webhook`, `paymongo-resettle` and `paymongo-checkout`. `20260804000300` gates §3's
>   escrow checks and is in — **ESC-02 can pass as soon as there is a site to run it against.**

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

- [ ] **1c. The 7 required edge functions are deployed** (Supabase Dashboard → Edge Functions):
  `paymongo-checkout` · `paymongo-webhook` · `process-payouts` · `paymongo-reconcile` ·
  `paymongo-resettle` · `send-approval-email` · `account-deletion`.

  ⚠️ **This said 8 until 2026-08-05, and the eighth is `public-registry`, which is NOT deployed** —
  measured, with a control: a made-up function name returns the identical `404 NOT_FOUND`, while
  `process-payouts` returns `405`. **Do not deploy it to make this box tick.** Nothing in `src/`
  calls it; it is a white-label scaffold, and its own
  [README](../supabase/functions/public-registry/README.md) says API-key gating, rate limiting and
  response versioning are owner decisions *before* production. Deploying it now would put an
  ungated public API on the internet days before a pilot, to satisfy a checklist. Public-API
  exposure is a Lane 2b decision — leave it undeployed until it is made.

- [ ] **1d. PayMongo is in TEST mode.** Confirm the deployed `paymongo-checkout` / `paymongo-webhook`
  secrets hold **test** keys (`sk_test_…`), and the PayMongo webhook points at the live Supabase
  functions URL with event `checkout_session.payment.paid` **enabled** (it auto-disables after repeated
  failures — confirm it shows enabled).

- [ ] **1e. `ALLOW_UNSIGNED_WEBHOOKS` is unset** and `PAYMONGO_WEBHOOK_SECRET` is set — so the webhook
  only trusts signed PayMongo calls.

- [ ] **1f. Sentry is receiving events** (if a `VITE_SENTRY_DSN` is configured) — trigger any handled
  error and confirm it lands, so you have eyes on the pilot.

- [x] ✅ **1g. Frontend deployed** — verified 2026-08-05 at **`https://carbonify-gilt.vercel.app`**,
      carrying the 2026-08-04 defect hunt and the money-path price fix. ⚠️ The old
      `carbonify13.vercel.app` 404s; use the new host everywhere. Re-confirm after any deploy with:
      ```bash
      node scripts/analysis/verify-deploy.mjs https://carbonify-gilt.vercel.app
      ```
      Then eyeball it too — the header/login logo renders (the green-leaf badge) and `/` hero stats
      load real numbers, not `—`.

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

> **This section is yours, not the testers'.** §3 is the one operator proving the spine still connects
> end to end. What pilot users get is [UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) — the same ground broken
> into per-role tick-boxes with no technical knowledge assumed — and
> [TEST_REPORT_FORM.md](TEST_REPORT_FORM.md) to send back. Run §3 first: if the spine is broken, you
> will learn it faster than eight people filing eight reports about it.
>
> 🆕 **Escrow comes BEFORE any of this, and it is a team exercise:**
> [OWNER_TEST_GUIDE.md](OWNER_TEST_GUIDE.md), with [TESTER_GUIDE.md](TESTER_GUIDE.md) for the
> helpers. `ESC-01…06` is the last functional gate, and it
> cannot be run alone — a buyer buys, only the seller sees the money held, only the owner can age a
> hold, only an admin can refund. Do it before inviting a pilot **seller**: a seller whose proceeds
> are stuck permanently is the worst outcome this pilot could produce.
>
> **§3 does not cover** escrow (`ESC-01…06`), the two-sided farmer payment record (`FARM-04…07`), the
> admin feedstock console (`FEED`), privacy/data rights (`PRIV`), keyboard access (`KEY`) or the
> public no-login pages (`PUB`). Those live only in the test script. **Escrow is the gap that matters
> before you invite a seller** — it is switched on, the Terms promise a hold window, and no purchase
> has yet been watched through it.

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
