# Money-path cutover (Phase 1 P2/P3/P5/P1) — status & verification

> ## ⚠️ 2026-08-04 — the settlement RPCs on this page have both been superseded
>
> This page records the cutover as complete and reconciling to 0, which remains true. Two of the
> functions it describes have since been re-issued, and one of them was carrying a branch that had
> **never executed**:
>
> - **`process_marketplace_purchase`** → latest is `20260804000300`. The escrow method-gate added by
>   `20260725000200` reads `payment_intents.provider`, which is always the literal `'paymongo'` —
>   so the GCash/Maya "no hold" branch was unreachable and `credit_transactions.payment_method`
>   recorded `'paymongo'` for every online purchase. Now gated on a real `payment_intents.payment_method`
>   written by the webhook and by `paymongo-resettle`.
> - **`process_wallet_purchase`** → latest is `20260804000100`. It never called `assert_can_trade`,
>   so the KYC threshold and account suspension were enforced on the card path and not the wallet
>   path — and the RPC is granted to `authenticated`, so the browser check was not a boundary.
> - **Wallet top-up (P5) gained a suspension check**, in `paymongo-checkout` rather than in a
>   migration — deliberately *not* the full KYC trade gate, since funding an account is not trading,
>   but a sanctioned account should not be able to move money onto a platform it is barred from
>   transacting on. **This one ships by redeploying `paymongo-checkout`**, which was missing from
>   every deploy instruction until 2026-08-05.
>
> Neither is applied yet. Both keep their signature, so the checklist below is unaffected — but
> **step 3 (wallet purchase) now has a second expected outcome to check**: an unverified or suspended
> buyer must be *refused*, not merely capped by the velocity limit. See [HANDOFF.md](HANDOFF.md)
> § *DEPLOY STATE* for the apply order.

> **Created:** 2026-07-01 · **Updated:** 2026-07-02 · **Branch:** `feature-user-onboarding-ux`
> Companion to [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) (P1–P5) and
> [NOW_IMPLEMENTATION_PLAN.md](NOW_IMPLEMENTATION_PLAN.md) Wave 3.
>
> **What this session did:** moved every *purchase*, *top-up* and *retirement*
> money movement off the browser and onto server-authoritative RPCs / the
> webhook, so the financial-table RLS lockdown (P1) can eventually run. All work
> is **code-complete, build-green, ESLint 0, 145 tests pass**.

> ✅ **2026-07-03 — CUTOVER COMPLETE + HARDENED (all 6 flows verified, RLS
> lockdown applied).** All of A–F settle server-side and `reconcile_financials()`
> = 0 rows, re-confirmed **after** the P1 RLS lockdown (financial tables are now
> server-write-only). B–E passed after fixing four out-of-version-control DB
> objects the flows surfaced (`update_wallet_balance_atomic` was in no migration;
> `wallet_transactions.external_reference` missing; RetireView `project_id`
> mapping; a stray `credit_ownership_quantity_positive` > 0 constraint). Fixes
> committed on `feature-user-onboarding-ux` (migrations `20260703000000`–
> `20260703000200`). Next: open the PR to `main`.

> 🚦 **2026-07-02 — cutover partially runtime-verified (2 of 6 steps done).** The
> first live sandbox pass ran and immediately surfaced that the cutover had
> **never actually settled a purchase** — it exposed real blockers (commit
> `a881294`):
> - **Bug found + fixed:** `process_marketplace_purchase` inserted
>   `credit_ownership.status = 'active'`, which the live
>   `credit_ownership_status_check` constraint rejects (`'owned'`/`'retired'`/
>   `'transferred'` only). Every card/cart purchase rolled back → webhook 500'd →
>   intent stuck `pending` → **PayMongo auto-disabled the webhook** after repeated
>   failures. Fixed by migration `20260702000000` (`status = 'owned'`).
> - **Webhook was disabled** (from the 500 storm above). Re-created the PayMongo
>   webhook + reset `PAYMONGO_WEBHOOK_SECRET`; delivery restored.
> - **Diagnostics added:** the webhook now records thrown handler errors to
>   `webhook_events.error` (was silent).
> - **UI gap fixed:** `/upgrade` now confirms/polls the plan on return instead of
>   silently re-rendering "Free".
>
> **Runtime-verified 2026-07-02:** ✅ **A. card purchase** (settles via webhook,
> certificate issued, `reconcile_financials()` = 0) · ✅ **F. subscription**
> (`/upgrade` → Pro, plan activated by webhook).
> **NOT yet run:** ⬜ **B. wallet top-up** · ⬜ **C. wallet purchase** ·
> ⬜ **D. cart (2 items)** · ⬜ **E. retire credits**. Also applied the §0 schema
> catch-up (`20260626000700`) — the audit is now empty (FK/certificate 400 noise
> resolved). **The P1 lockdown stays 🔒 gated until B–E are verified.**

Legend: ✅ done in code (needs runtime verify) · ⏳ remaining · 🔒 gated

---

## What changed this session

| Item | Status | Files |
|---|---|---|
| **P3** — checkout `user_id` from the verified JWT (marketplace + subscription + top-up), not the request body | ✅ | `supabase/functions/paymongo-checkout/index.ts` (`getVerifiedUserId`) |
| **P2 online** — card/GCash/Maya purchases now use `createMarketplaceCheckout` → webhook → `process_marketplace_purchase`; the callback no longer writes `credit_transactions`/`credit_ownership`/`credit_purchases` (it only waits for the webhook-settled txn and issues the certificate/receipt) | ✅ | `marketplaceService.js` (`purchaseCredits`), `PaymentCallbackView.vue`, `MarketplaceViewEnhanced.vue`, `CartView.vue` |
| **P2 wallet** — new `process_wallet_purchase` RPC settles wallet-funded purchases atomically (pool decrement + wallet debit + `credit_transactions` + `credit_ownership` + balanced ledger). Browser writes nothing | ✅ | `supabase/migrations/20260701000400_process_wallet_purchase.sql`, `marketplaceService.js` |
| **P5** — wallet top-up records a `payment_intent` (purpose `wallet_topup`); the webhook credits the balance via `update_wallet_balance_atomic`. Browser no longer writes `wallet_*` for a top-up | ✅ | `paymongo-checkout/index.ts` (`createWalletTopupCheckout`), `paymongo-webhook/index.ts` (wallet_topup branch), `paymongoService.js`, `walletService.js`, `PaymentCallbackView.vue` |
| **Retirement** — dropped the client-side `credit_ownership` UPDATE fallback; retirement now relies solely on the `retire_credits_atomic` RPC (SECURITY DEFINER, granted to authenticated → survives the lockdown) | ✅ | `marketplaceService.js` (`retireCredits`) |
| **Wallet creation** — first-use wallet auto-create moved off the browser into an `ensure_wallet()` RPC (SECURITY DEFINER, idempotent) so new users still get a wallet after the lockdown | ✅ | `supabase/migrations/20260701000500_ensure_wallet.sql`, `walletService.js` (`createWallet`) |

### Reconciliation safety (why this doesn't create drift)
`reconcile_financials()` scopes its transaction/ledger checks (#2, #5) to
transactions whose `payment_reference` matches a `payment_intent`, and #3
requires every ledger group to net to zero. The wallet purchase RPC therefore
uses a **wallet-scoped `payment_reference`** (`wallet_<uuid>`, not an intent id)
and writes **balanced** ledger legs (`wallet_float` debit = `seller_payable` +
`platform_revenue` credits), so it is invisible to the intent-scoped checks and
passes the balance check.

---

## Migrations to apply (idempotent; via SQL Editor)

| # | Migration | Purpose |
|---|---|---|
| 1 | `20260701000400_process_wallet_purchase.sql` | Server-authoritative wallet purchase RPC (mirrors `process_marketplace_purchase` incl. the `platform_fee_percent` fee model). Granted to `authenticated` (spends only the caller's own wallet). |
| 2 | `20260701000500_ensure_wallet.sql` | Server-side wallet auto-creation (`ensure_wallet()` RPC) so first-use wallet creation survives the lockdown. |
| 3 | `20260702000000_fix_marketplace_ownership_status.sql` | **✅ applied 2026-07-02.** Fixes `process_marketplace_purchase` to insert `credit_ownership.status = 'owned'` (was `'active'`, which the live constraint rejects — the bug that blocked every card/cart purchase). |
| — | `20260626000700_schema_catchup.sql` | **✅ applied 2026-07-02.** §0 drift catch-up; adds `credit_transactions → profiles` FKs (fixes the receipt/certificate 400 join noise). Audit is now empty. |

## Edge functions to redeploy (Dashboard, `--no-verify-jwt`)

- **`paymongo-checkout`** — adds JWT identity (P3), `create_wallet_topup_checkout` (P5).
- **`paymongo-webhook`** — adds the `wallet_topup` intent branch (P5).

> `SUPABASE_ANON_KEY` is already available to edge functions by default; no new
> secret is required for P3.

---

## ⏳ Remaining before the P1 lockdown is safe to run

The lockdown (`supabase/cutover/lockdown_financial_writes.sql`) makes
`credit_transactions`, `credit_ownership`, `wallet_accounts`,
`wallet_transactions` **server-write-only**. A code sweep found these client
writers still remaining:

| Writer | Table | Live? | Action needed |
|---|---|---|---|
| `walletService.createWallet` (auto-create on first wallet access / top-up) | `wallet_accounts` (insert) | ✅ **Fixed** | Now routed through the `ensure_wallet()` RPC (migration #2). |
| Demo purchase path (`marketplaceService.purchaseCredits` post-processing + `addCreditsToPortfolio`) | `credit_transactions`, `credit_ownership` | **Not UI-reachable** — `demo` is not in the marketplace `paymentMethods` list, so no user can select it | No action needed for lockdown. Left as-is. |
| `initiateWithdrawal` (walletService) | `wallet_*` | **No** — Withdraw.vue uses `payoutService.requestWithdrawal` (confirmed) | Dead code — safe to delete in a hygiene pass (does not block lockdown). |
| ~~`realPaymentService.process*` / `confirmPayMongoPayment` / `updateWalletBalance`~~ | `wallet_*` | ✅ **Removed** | Deleted (confirmed zero callers); only `getBuyerBillingInfo` / `getUserTransactions` / `calculateTotal` remain. |
| `initiateWithdrawal` (walletService), legacy `paymentService.*` write methods | `wallet_*` | **No** live callers | Left in place — removing risks a lint cascade via shared helpers, and it's unreachable so it doesn't block the lockdown. |

**So: P1 is now only 🔒 gated on the sandbox verification pass below** (the `demo`
method should also be hidden in production, and the dead withdrawal/legacy write
paths deleted in hygiene — neither blocks lockdown since nothing calls them).

---

## Runtime verification checklist (do before flipping P1)

Run against the deployed preview (PayMongo can't reach localhost). After **each**
money step, `select * from reconcile_financials();` must return **0 rows**.

> **Progress 2026-07-02:** 1 and 6 ✅ verified; 2–5 ⬜ not yet run.

1. ✅ **Online purchase** (card `4343 4343 4343 4345`): buy from `/marketplace` → PayMongo → back on `/payment/callback` → credits appear, certificate + receipt generated, `reconcile_financials()` = 0. **Verified 2026-07-02** (required the `20260702000000` status fix first).
2. ⬜ **Cart purchase** (2 items): sequential checkout settles each; certificate per item; `reconcile_financials()` = 0.
3. ⬜ **Wallet purchase**: top up first, then buy with the `wallet` method → `process_wallet_purchase` settles; balance debited; certificate issued; `reconcile_financials()` = 0.
4. ⬜ **Top-up (P5)**: `/wallet` top-up → PayMongo → webhook credits balance; a completed `wallet_transactions` row (external_reference = session id) appears; `reconcile_financials()` = 0.
5. ⬜ **Retirement**: retire owned credits → `retire_credits_atomic` decrements; retirement certificate issued; balance can't go negative.
6. ✅ **Subscription** (regression): `/upgrade` flips the plan (webhook `activate_subscription`). **Verified 2026-07-02.**

Then: complete the wallet-creation migration, re-run 1–5, and only then run
`supabase/cutover/lockdown_financial_writes.sql`. Re-run the whole checklist
once more after lockdown — everything must still reconcile to 0.

---

## Rollback

Every client change degrades safely if an edge function isn't redeployed:
purchases/top-ups simply fail to start checkout (they don't fall back to client
writes), so there is no double-charge risk. To revert entirely, `git checkout`
the files listed above; the new migration is additive (a new function) and can
be left in place.
