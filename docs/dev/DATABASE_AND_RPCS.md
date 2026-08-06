# Carbonify — Database & Server-Logic Reference

> The data model, the money/critical RPCs, the double-entry ledger, and the (hand-applied) migration process. For flows and the big picture see [ARCHITECTURE.md](ARCHITECTURE.md); for money internals [../PAYMENTS_ARCHITECTURE.md](../PAYMENTS_ARCHITECTURE.md).

Backend: Supabase Postgres. All SQL lives in `supabase/migrations/`, `supabase/cutover/`, and `supabase/diagnostics/`.

---

## 1. Key tables

Purposes below are confirmed against the migrations. **Drift note:** several base tables have **no `CREATE TABLE` in the repo** — they were created by hand in the Supabase SQL editor before migrations were tracked, and only appear in later `ALTER`/FK migrations. They are flagged **(drift)**; run `supabase/diagnostics/schema_catchup_audit.sql` to confirm what exists on a given DB (see §4).

### Core registry & marketplace

| Table | Purpose |
|---|---|
| `profiles` **(drift)** | User accounts: `role`, `plan`/`plan_expires_at`, `kyc_level`, `kyb_verified`, org fields. Mirrors `auth.users` (id = user id). |
| `projects` **(drift)** | Carbon project records: type, status, location, methodology, credibility/impact scores, verification fields. |
| `project_credits` **(drift)** | Per-project issued credit pool: `credits_available`, `total_credits`, `vintage_year`, `verification_standard`, `source`. The oversell guard locks this row. |
| `credit_listings` **(drift)** | Marketplace listings: `price_per_credit`, `quantity`, `currency`, `status`, `seller_id`, `source` (`local`/`supplier`), `listing_type`. |
| `credit_transactions` **(drift)** | Completed purchases: `buyer_id`, `seller_id`, `quantity`, `total_amount`, `payment_method`, `payment_reference`, `status` (incl. `refunded`). Server-write-only. |
| `credit_ownership` **(drift)** | Buyer holdings/portfolio: `quantity`, `purchase_price` (per credit), `status`/`ownership_status` (`owned`/`retired`/`refunded`). One row per purchase. Server-write-only. |
| `credit_retirements` **(drift)** | Retired-credit records with unique registry `serial_number` (from `..._credit_serials.sql`). |
| `certificates` **(drift)** | Ownership/retirement certificates: `certificate_number`, QR/signature `data`, `registry_serial`, `registry_receipt_url`. |
| `receipts` **(drift)** | Purchase receipts linked to a transaction (buyer receipts view). |

### Money & payments

| Table | Purpose | Defined in |
|---|---|---|
| `payment_intents` | Server-authoritative intended payment (amount, currency, `purpose` ∈ marketplace_purchase/wallet_topup/subscription, provider session/payment ids, status). | `20260606000300_create_financial_ledger.sql` |
| `ledger_entries` | Append-only double-entry ledger; balanced debit/credit legs share `entry_id`. Balances derived, never stored. | `20260606000300_create_financial_ledger.sql` |
| `idempotency_keys` | Dedup store for client-initiated money mutations (`key`, `scope`, `request_hash`, cached `response`). | `20260606000300_create_financial_ledger.sql` |
| `webhook_events` | Idempotency + audit log of inbound PayMongo webhooks, unique on `(provider, event_id)`; `status` received→processed. | `20260606000200_create_webhook_events.sql` |
| `wallet_accounts` **(drift)** | Per-user wallet: `current_balance`, `currency`, `wallet_address`. Server-write-only. | (alters only) |
| `wallet_transactions` **(drift)** | Wallet ledger: deposits/withdrawals, `external_reference` (checkout session id for top-ups). Server-write-only. | (alters only) |
| `escrow_holds` | Seller net held per transaction until release/refund (`held`→`released`/`refunded`, `hold_until`). | `20260606000600_escrow_and_seller_balance.sql` |
| `payout_requests` | Seller disbursement state machine (`requested`→`processing`→`settled`/`failed`), provider + idempotency key. | `20260606000700_payout_requests.sql` |
| `subscription_plans` | Authoritative plan catalog (`pro`/`business`, `price_minor`, `period_days`). Public read; service-role write. | `20260615000000_subscriptions.sql` |
| `supplier_orders` | Fulfillment saga state for supplier-sourced credits (`pending`→`ordered`→`retired`; `failed`/`refunded` terminal). `transaction_id` UNIQUE = idempotency key. | `20260607000200_supplier_orders.sql` |

### Compliance, MRV & governance

| Table | Purpose | Defined in |
|---|---|---|
| `kyc_applications` | Individual KYC applications; admin review sets `profiles.kyc_level`. | `20260604020200_kyc.sql` |
| `kyb_applications` | Seller business (KYB) verification; approval sets `profiles.kyb_verified` (gates payouts). | `20260606000800_kyb.sql` |
| `disputes` | Buyer disputes on a transaction (`open`→`resolved_refunded`/`resolved_rejected`); drives compensating refunds. | `20260606000900_refund_dispute.sql` |
| `monitoring_reports` | MRV periodic reports per project (+ `monitoring_activity_data`, `monitoring_evidence`); verifier review workflow. | `20260604010000_create_mrv_module.sql` |
| `verified_emission_reductions` | Approved VERs (`approved_quantity`, `vintage_year`) that gate credit minting. | `20260604010000_create_mrv_module.sql` |
| `data_subject_requests` | DPA data-subject requests (export/deletion); the `account-deletion` worker drains `deletion` rows. | `20260626000000_dpa_data_subject_requests.sql` |

Other supporting tables in migrations: `methodology_factors`, `role_applications`, `system_notifications`, `audit_logs`, `app_settings`, `watchlist`, `project_comments`, `saved_searches`, `lgu_emissions_records`, `verification_assessments`.

---

## 2. Money & critical RPCs

All money RPCs are `SECURITY DEFINER` with `set search_path = public` (bypass RLS deliberately). Grants are least-privilege: most are **service-role only**; a few are safe for `authenticated` because they act only on `auth.uid()`'s own funds.

| RPC | Caller / role | What it does |
|---|---|---|
| `process_marketplace_purchase(p_payment_intent_id, p_provider_payment_id)` | **service_role** (webhook) | Settles a paid PayMongo intent atomically: locks listing + `project_credits`, decrements stock, writes `credit_transactions` + `credit_ownership`, opens an `escrow_holds` row, posts ledger legs (`paymongo_clearing`→`escrow_held`+`platform_revenue`), marks intent `paid`. Idempotent (returns existing txn id). |
| `process_wallet_purchase(p_listing_id, p_quantity)` | **authenticated** + service_role | Wallet-funded purchase, mirror of the above but funded by the buyer's own `wallet_accounts` balance (`wallet_float` ledger leg). Buyer = `auth.uid()`; amount recomputed from the listing; fee from `app_settings`. |
| `update_wallet_balance_atomic(p_user_id, p_amount, p_operation)` | **service_role** (webhook) | Credits/debits a wallet balance atomically (guards against negatives, ensures wallet exists). Used for top-ups. Writes balance only — the webhook records the `wallet_transactions` row and top-ups post **no ledger**. |
| `ensure_wallet()` | **authenticated** + service_role | Server-side wallet creation (`auth.uid()` scoped, idempotent). Needed because the RLS lockdown removed the browser INSERT path. |
| `retire_credits_atomic(p_user_id, p_project_id, p_quantity)` | **authenticated** | Retires credits across **multiple** `credit_ownership` rows (oldest first) for a project; checks the project total, decrements across rows. Returns bool. |
| `reconcile_financials(p_stuck_minutes)` | **service_role** | Drift report; one row per inconsistency, **zero rows = healthy** (see §5). |
| `release_escrow(p_hold_id)` | **service_role** | Moves `escrow_held`→`seller_payable:<id>` after the hold window; idempotent. |
| `get_my_seller_balance()` | **authenticated** | Returns the caller's `available` (seller_payable net) and `held` (escrow) balances. |
| `request_payout(p_amount, p_destination, p_idempotency_key)` | **authenticated** (seller) | Reserves funds `seller_payable`→`payout_pending` and records a `payout_requests` row. Enforces min amount and (per KYB migration) `kyb_verified`. |
| `mark_payout_processing` / `mark_payout_settled` / `mark_payout_failed` | **service_role** (worker) | Payout state transitions; settled posts `payout_pending`→`cash_out`, failed returns funds to `seller_payable` (retryable). |
| `refund_purchase(p_transaction_id, p_reason)` | **service_role** | Compensating reversal: restores inventory, posts reversing ledger legs (never edits originals), marks ownership + transaction `refunded`. Idempotent. |
| `open_dispute` / `resolve_dispute` | **authenticated** (buyer) / admin | Buyer opens a dispute on their own txn; admin resolves — a refund resolution calls `refund_purchase`. |
| `activate_subscription(p_user_id, p_plan)` | **service_role** (webhook) | Grants `period_days` of a plan (extends from later of now/current expiry); price/plan columns are service-role-write-protected. |
| `current_plan(p_user_id)` | definer helper | Resolves the **effective** plan, treating an expired paid plan as `free`. |
| `get_transaction_counterparty_name(p_transaction_id)` 🆕 | **authenticated** | Display **name only** of the other party on a transaction the caller is party to. Added `20260801000100` (applied 2026-08-02) so a receipt can name the counterparty **without loosening `profiles` SELECT RLS**, which is hardened against role/`kyc_level` escalation by `20260703000300`. Returns zero rows — not an error — for a caller who is neither buyer nor seller, so it is neither a directory nor an existence oracle. Never returns email, phone, role or `kyc_level`. |

> Because these are `SECURITY DEFINER`, execute is explicitly `revoke`d from `public`/`anon` (and usually `authenticated`) and granted only where listed — so a logged-in user cannot call, e.g., `process_marketplace_purchase` directly to fabricate a purchase.

---

## 3. Double-entry ledger & accounts

`ledger_entries` is the financial source of truth. Invariants (all enforced in `20260606000300_create_financial_ledger.sql`):

- **Append-only:** `UPDATE`/`DELETE` raise an exception via trigger — even for the service role. Refunds/reversals post *new* compensating rows.
- **Balanced:** a deferred constraint trigger checks that, per `entry_id`, `sum(debit) = sum(credit)` at commit. A multi-leg insert must net to zero as a unit.
- **Derived balances:** never stored. The `ledger_account_balances` view (and RPCs like `get_my_seller_balance`) sum the legs. `balance = Σ(credit) − Σ(debit)` per `account`+`currency`.

Account name conventions (`account` is a typed string):

| Account | Meaning |
|---|---|
| `paymongo_clearing` | Cash received from / returned to PayMongo. |
| `escrow_held` | Seller proceeds held pending release. |
| `seller_payable:<seller_id>` | Seller's withdrawable balance. |
| `payout_pending:<seller_id>` | Funds reserved for an in-flight payout. |
| `cash_out` | Money that has left the platform (settled payouts). |
| `platform_revenue` | Platform fees earned. |
| `wallet_float` | Wallet-funded purchases (buyer's balance spent). |

**Money movements by event:**

- **Card purchase:** debit `paymongo_clearing`; credit `escrow_held` (seller net) + `platform_revenue` (fee).
- **Wallet purchase:** debit `wallet_float`; credit `seller_payable:<id>` + `platform_revenue`.
- **Escrow release:** debit `escrow_held`; credit `seller_payable:<id>`.
- **Payout request:** debit `seller_payable:<id>`; credit `payout_pending:<id>`.
- **Payout settled:** debit `payout_pending:<id>`; credit `cash_out`.
- **Payout failed:** debit `payout_pending:<id>`; credit `seller_payable:<id>` (returned).
- **Refund:** debit seller's source (`escrow_held` if still held, else `seller_payable:<id>`) + reverse `platform_revenue`; credit `paymongo_clearing`.
- **Wallet top-up:** **no ledger entry** (balance-only; scoped out of reconciliation).

---

## 3b. Notifications are database triggers, not client writes

`system_notifications` accepts a client INSERT **only for a row you address to yourself**
(`with check (auth.uid() = user_id)`, from `20260802000400`). Every cross-user notification therefore
runs as a `SECURITY DEFINER` trigger that derives the recipient from the row being written.

**The rule: if the recipient is not the actor, it does not belong in the browser.** A client-side
version fails `403` — and because every call site wraps notification failures in a non-fatal `catch`,
it fails *silently*. That is how `notifyRoleApplicationDecision` and `notifyProjectComment` went
unnoticed between 2026-08-02 and 2026-08-06.

| Trigger | On | Notifies |
|---|---|---|
| `trg_notify_project_submission` / `trg_notify_project_submitted` | `projects` | Reviewers |
| `trg_notify_project_status` | `projects` UPDATE | Owner |
| `trg_notify_role_application` | `role_applications` INSERT | Reviewers |
| `trg_notify_role_application_decision` | `role_applications` UPDATE | Applicant |
| `trg_notify_marketplace_listing` | `credit_listings` INSERT | Buyers |
| `trg_notify_project_comment` | `project_comments` INSERT | Owner or reviewers (internal notes never reach the owner) |
| `trg_notify_kyc` / `trg_notify_kyb` | INSERT + status UPDATE | Admins in; applicant out |
| `trg_notify_monitoring_report` | `monitoring_reports` status UPDATE | Verifiers in; developer out |
| `trg_notify_project_endorsement` | `project_endorsements` | Project owner |
| `trg_notify_support_report` | INSERT + status UPDATE | Admins in; reporter out |
| `trg_notify_data_subject_request` | INSERT + status UPDATE | Admins in; requester out |
| `trg_notify_payout_request` | INSERT + status UPDATE | Admins in; seller out |
| `trg_notify_dispute` | INSERT + status UPDATE | Admins in; buyer out |

Two helpers, `notify_admins(...)` and `notify_one(...)`, are `SECURITY DEFINER` and **revoked from
`anon` and `authenticated`**. They write into any user's bell as the owner, so a grant would reopen
what `20260802000400` closed. Both are probed by `scripts/analysis/verify-anon-exposure.mjs`.

Each trigger guards on `new.status is not distinct from old.status`, so re-saving a row without
changing its status produces no second notification.

The one deliberate omission is **AML**: `amlService` screens on a schedule rather than on a user
action, so a notification per screening would page compliance on every clear result. The useful
signal is a `potential_match` status, which needs a review-queue design.

The sanctioned cross-user RPC, `notify_counterparty(...)`, still covers only `biomass_rfq` and
`farmer_delivery` — the farmer↔buyer path, where the recipient is one of two named parties.

---

## 4. Migration process (hand-applied — drift is expected)

**Migrations are applied by hand in the Supabase SQL Editor. There is no CLI migration tracking** (`supabase/migrations/` is not `db push`ed and the live DB predates it). Consequences and the working discipline:

- **Write idempotent SQL.** Every migration must be safe to run more than once: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, guarded `ADD CONSTRAINT IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`. Do **not** recommend `supabase db push`.
- **The live schema drifts** from the repo. Several base tables (`profiles`, `projects`, `credit_listings`, `credit_transactions`, `credit_ownership`, `wallet_accounts`, `wallet_transactions`, `certificates`, `receipts`, `credit_retirements`) were created outside version control and appear only in later `ALTER` migrations.
- **Audit before you trust the schema:** run `supabase/diagnostics/schema_catchup_audit.sql` (read-only) in the SQL Editor. It reports every expected table/column/FK/function that is **missing** on that DB; an empty result = fully current. If it flags a missing **column/FK/constraint**, apply `20260626000700_schema_catchup.sql` (a single idempotent consolidation of the drift-prone column surface). If it flags a missing **table**, apply that table's own migration.
- **RLS financial lockdown:** `supabase/cutover/lockdown_financial_writes.sql` drops all INSERT/UPDATE/DELETE policies on `credit_transactions`, `credit_ownership`, `wallet_accounts`, `wallet_transactions` (keeps SELECT), making them server-write-only. **This is already applied to the live DB.** Re-running it is safe (idempotent). Precondition (already met): the client must write money only through the server flow; running it before that migration would break live purchases/top-ups.

---

## 5. Running reconciliation {#reconciliation}

`reconcile_financials()` is service-role only, so run it in the **Supabase SQL Editor** (which executes as a privileged role):

```sql
select * from public.reconcile_financials();       -- default 60-min stuck threshold
select * from public.reconcile_financials(15);      -- flag webhooks stuck > 15 min
```

**Zero rows = healthy.** A non-empty result means drift — each row is `(issue_type, ref_id, detail)`:

| `issue_type` | Meaning / likely cause |
|---|---|
| `paid_intent_no_transaction` | Intent marked paid but `process_marketplace_purchase` never produced a `credit_transactions` row — settlement failed after marking paid, or the webhook errored mid-way. Investigate that intent id. |
| `transaction_no_ledger` | A new-flow completed transaction has no ledger group — a purchase committed without its ledger legs (should be impossible; the RPC does both in one txn). |
| `ledger_imbalance` | A ledger `entry_id` where debits ≠ credits — the balanced-constraint trigger should prevent this; treat as a serious integrity alarm. |
| `webhook_stuck` | A `webhook_events` row still not `processed` past the threshold — the handler is throwing (check `webhook_events.error`); PayMongo will keep retrying. |
| `intent_ledger_amount_mismatch` | Paid-intent amount ≠ the settled ledger debit — an amount discrepancy between intent and ledger. |

Balances for spot-checks (service-role): `select * from public.ledger_account_balances order by account;`.

The admin **Finance Console** (`/admin/finance`, `FinanceConsoleView.vue` + `adminFinanceService`) surfaces this data in the UI.
