# Deferred Backlog — revisit after the phased roadmap

Items intentionally deferred during the phased implementation (`IMPLEMENTATION_ROADMAP_TIMELINE.md`).
Each is safe to defer but should be closed out before "production-credible" sign-off.
Come back to this list after the phases are implemented.

> **Status pass 2026-07-25.** **#13c is CLOSED** — the money-table RLS posture is now captured in a
> versioned migration (`20260725000100`), applied to live, and continuously verifiable via
> `supabase/diagnostics/money_table_rls_audit.sql` (0 findings). **One entry remains must-close before
> live payment keys:** **#14** (no escrow / chargeback hold window) — a decision now written up in
> [ESCROW_DECISION.md](ESCROW_DECISION.md). Both are surfaced in [HANDOFF.md](HANDOFF.md) and the
> [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) go/no-go gate. P1 and P2 below are now closed.
>
> **New 2026-07-25: #18 — no organization / company accounts.** Surfaced by the commercial
> repositioning. Does **not** block the beta, but likely blocks the first *corporate* customer.
> Scoped in [ORGANIZATION_ACCOUNTS_SCOPE.md](ORGANIZATION_ACCOUNTS_SCOPE.md).
>
> **New 2026-07-26 (live-readiness review): #20 and #21.** #20 — the cart charges once per listing
> rather than once per cart; closing it is a multi-seller escrow decision that should be taken
> together with **#14**, not after it. #21 — the `services/credits|payments|payouts` provider layer is
> imported only by tests, so ~40 passing tests overstate money-path coverage. Neither blocks the beta.
>
> **New 2026-07-26 (project-developer review): #22 and #23.** #22 — sellers get no invoice or receipt
> for a sale where the buyer gets both; blocked on the seller-of-record question, not on code. #23 —
> developers have no forward/projection view of their own projects, which investors do have. Neither
> blocks the beta.
>
> **✅ #17 IS CLOSED (2026-07-26).** Both issuance triggers had been live — validating a project and
> then approving a VER against it would have issued the same tonne twice. The audit
> (`supabase/diagnostics/issuance_model_audit.sql`) confirmed the exposure but found **nothing had
> been double-issued and nothing sold**, so `supabase/cutover/adopt_mint_on_ver.sql` was applied to
> live with no reconciliation needed. The audit now returns zero rows. Mint-on-VER is the single
> issuance path.
>
> **New 2026-07-26 (verifier review): #24 and #25, and #17 is upgraded.** #17 is no longer
> conditional — the migration chain confirms BOTH issuance triggers are live (20260604010100 dropped
> the validation trigger and created the VER one; 20260626000500 re-created the validation trigger;
> nothing ever dropped the VER one), so validate-then-approve issues the same tonne twice. A warning
> now reaches the verifier at the point of decision (`f0b111b`), but the trigger question is still
> open and is the one item here that can corrupt the registry. #24 — a verifier cannot see their own
> decision history. #25 — reviews are not assigned and concurrent reviewers are invisible.
>
> **New 2026-07-26 (farmer review): #26 and #27.** #26 — farmers are **not paid through the
> platform**: `mark_farmer_delivery_paid` flips a boolean the *buyer* sets and moves no money, while
> buyers get PayMongo and developers get escrow + payouts. The least powerful party carries all the
> counterparty risk and has no dispute path. Deliberate scoping, but the UI implies otherwise. #27 —
> the language selector offered seven languages and delivered none (no i18n library at all); now
> disabled honestly, but Filipino is still missing from a Philippine platform.
>
> **New 2026-07-26 (LGU review): #28, plus an LGU navigation contradiction fixed in code.** The app
> treated LGU users as buyers everywhere except `isBuyerRole` — the router let them reach the whole
> checkout path, `/kyc` is open to them "to move money", and `/analytics` shows them a Buying tab with
> portfolio value — while their sidebar offered none of it. Now aligned. #28 — an LGU is never
> notified that a project appeared in its jurisdiction, though endorsing local projects is one of the
> four things its onboarding promises; jurisdiction-scoping needs a DB change.
>
> **New 2026-07-26 (admin review): #29 and #30.** #29 — the feedstock side of the marketplace has no
> admin surface at all: no console reads `farmer_deliveries` or `biomass_rfqs`, so the escalation
> point for **#26** does not exist and a farmer owed money can be helped by nobody. #30 — ~100
> exported functions are referenced nowhere; the orphan scan misses them because it only finds unused
> FILES. Admin feature gaps are tracked separately in `docs/role-needs/04-admin.md`.
>
> **New 2026-07-26 (doc reconciliation): #31.** Farmers can reach the whole buying path by URL and see
> an ungated Buying tab in `/analytics`, but are offered none of it in the sidebar — the same
> contradiction fixed for LGU users, minus the evidence that justified fixing it. Recorded rather than
> resolved: nothing says a feedstock supplier is meant to buy credits. Their `/kyc` entry is the loose
> thread — no current flow uses it.
>
> **2026-07-26: #19 (header contrast) is CLOSED.** The green ramp and `--text-muted` were darkened
> app-wide and the sweep covered the 121 bare hex literals that ignore the token, not just
> `tokens.css`. Guarded by a contrast test. Details in #19 below.

---

## From Phase 0 (Stabilize & Clean Up)

### 1. Dual `available_credits` / `credits_available` on `project_credits` ✅ RESOLVED (2026-07-11)
**Resolution:** Live schema confirmed both columns existed. `credits_available` (numeric) is
canonical — the money path decrements it; `available_credits` (integer) was a stale stray (observed
2000 where the true remaining was 1638), maintained by no trigger and read by no code once the dead
`assetLedgerService` fallback was removed. Code now writes/reads only `credits_available`
(projectWorkflowService, projectApprovalService, assetLedgerService, marketplaceService). The stray is
retired via expand/contract: migration `20260718000600` drops its NOT NULL (run before the frontend
deploy), `20260718000700` drops the column (run after). Original note kept below for history.


**What:** The `project_credits` table is referenced by two different column names:
- DB migrations + issuance triggers write **`available_credits`**
  (`20260604010100_decouple_issuance_mint_on_ver.sql`, `20260602001000_add_active_pool_on_validation.sql`).
- `src/services/marketplaceService.js` (and parts of `marketplaceIntegrationService.js`,
  `projectWorkflowService.js`) read/write **`credits_available`** on the same table.

(Note: `available_credits` on the separate `listings`/`credit_listings` table is correct — not part of this.)

**Why deferred:** Needs the **live `project_credits` schema** to fix safely (could be one column,
the other, or both with diverging data — likely, given manual-migration drift; see
`[[supabase-migration-process]]`).

**How to close:** Run in Supabase SQL Editor:
```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'project_credits'
order by ordinal_position;
```
Then pick **`available_credits`** as canonical (what the triggers maintain), backfill values if both
exist, point all code at it, and drop the stray column. Diagnostic helper: `supabase/diagnostics/phase0_schema_check.sql`.

### 2. Phase 0 acceptance gates not yet verified (need live env) 🔴
- **Test purchase** puts credits in the portfolio with **no console errors** (confirms the applied
  migrations: `credit_ownership.updated_at`, `wallet_accounts.wallet_address`, `certificate_data`,
  `credit_transactions`→`profiles` FKs).
- **Webhook deploys**: `supabase functions deploy paymongo-webhook` actually runs clean.

### 3. Remove the receipt/certificate FK **fallback crutch** 🟢
`receiptService.js` and `certificateService.js` still try the join then fall back to separate queries.
**Update 2026-07-11:** the fallback was NOT dormant — the embed 400'd live ("Could not find a relationship
… in the schema cache") because PostgREST's relationship cache was stale, so the fallback fired every time
(and then 406'd under `profiles` RLS). Migration `20260718001100` re-asserts the FKs + reloads the cache,
so the embed resolves. The fallback can now genuinely be removed once verified. **Related open item:** a
counterparty's name still won't show on a receipt (a buyer can't read the seller's `profiles` row) — if
receipts should display it, add a `SECURITY DEFINER` RPC returning name-only for a transaction the caller is
party to. Do NOT loosen `profiles` SELECT RLS (hardened against role/KYC escalation, `20260703000300`).

### 4. VALIDATE the `NOT VALID` foreign keys 🟢
`credit_transactions_buyer_id_fkey` / `_seller_id_fkey` were added `NOT VALID` for safety. Once the
orphan check (in `20260606000100_*.sql`) confirms zero orphans, run `VALIDATE CONSTRAINT`. (Not required for
PostgREST embedding — a stale schema cache was the actual cause of the receipt 400, fixed by
`20260718001100`; validating is cleanup/integrity only.)

### 5. Prettier formatting pass — blocked 🟢
`npm run format` (Prettier) **breaks the build**: it reformats multi-statement inline Vue handlers
(e.g. `@input="fn(); errors.x = ''"`) across lines and drops the `;`, which the Vue template parser
rejects. ESLint uses `skipFormatting`, so Prettier isn't enforced anyway. To enable Prettier safely,
first refactor those inline handlers into named methods, then add the format step.

### 6. Playwright **E2E green in CI** 🟢
`.github/workflows/ci.yml` runs E2E as a separate `continue-on-error` job. It needs a live backend
(Supabase + dev server + secrets) wired into CI before it can be made required.

### 7. Adopt CLI migration tracking 🟠
Migrations are applied by hand → live schema drifts from `supabase/migrations/`. Move to
`supabase db push` / `migration up` as the only way schema changes land. See `[[supabase-migration-process]]`.

---

## From Phase 1 (Money Foundation) — gated / follow-up

### P1. Financial-table RLS lockdown (cutover) ✅ EFFECTIVELY DONE ON LIVE (verified 2026-07-20)
**Status:** the live audit found the four tables this script targets (`credit_transactions`,
`credit_ownership`, `wallet_accounts`, `wallet_transactions`) **already client-SELECT-only** — the
lockdown's job is done on live, and the script also does *not* cover the three tables that actually had
holes (see #13). The remaining work is **capturing** the posture into version control (#13c) and then
retiring this out-of-band script; the script itself no longer needs running.

*Original note:* `supabase/cutover/lockdown_financial_writes.sql` makes those four tables
**server-write-only**. **Gated:** run ONLY after the marketplace/wallet UI is switched to the
server-authoritative flow (`createMarketplaceCheckout` → webhook → `process_marketplace_purchase`) and no
longer writes those tables from the browser. Running early breaks live purchases.

### P2. Client cutover to server-authoritative purchase ✅ DONE
Purchases run through `createMarketplaceCheckout({ listingId, quantity })` → signed webhook →
`process_marketplace_purchase`; the browser no longer inserts `credit_transactions` /
`credit_ownership`, and the last dead client-side money writers were deleted 2026-07-11
(`addCreditsToPortfolio` / `removeCreditsFromPortfolio`). Confirmed by the live end-to-end run and
`reconcile_financials()` = 0.

### P3. Derive `payment_intents.user_id` from the verified JWT 🟠
The checkout Edge Function currently takes `user_id` from the request body; it
should come from the verified Supabase JWT. (The amount is already server-authoritative.)

### P4. External settlement reconciliation 🟠
`reconcile_financials()` reconciles the system against itself. Add a scheduled job
that pulls PayMongo's settlement/payout report and reconciles real money in/out
against the ledger. Needs the PayMongo API.

### P5. Wallet top-up via payment_intents 🟠
Wallet top-ups still use the legacy client-`data` checkout path. Migrate them to
record a `payment_intent` (purpose `wallet_topup`) for consistent reconciliation.

## Carried into Phase 1
- **Consolidate the 3 payment services** (`paymentService`, `realPaymentService`, `paymongoService`)
  behind one interface — this is Phase 1's "provider abstraction" task, handled there rather than as Phase 0 cleanup.

---

## From the 2026-07-09 whole-codebase audit ([CODE_AUDIT_2026-07-09.md](CODE_AUDIT_2026-07-09.md))

### 8. Delete 30 verified-dead files 🟢 (partially done 2026-07-11)
Zero imports, not routed, not test fixtures. Includes `services/authServiceSimple.js` — a **mock auth
service with a `demo@carbonify.io / demo123` login** sitting in the repo.

**Done 2026-07-11:** deleted zero-byte `services/adminService.js` + `services/verifierService.js`, and
removed the dead `addCreditsToPortfolio` / `removeCreditsFromPortfolio` writers from
`creditOwnershipService.js` (290 lines — non-atomic, client-userId money writes; a double-retire vector
if ever called). Remainder of the list still pending; mind the two traps below before deleting more.

**Done 2026-07-26:** deleted `services/authServiceSimple.js` (the `demo@carbonify.io / demo123` mock
auth) and `services/sampleDataService.js` (fake "Amazon Rainforest / Brazil" seed projects) — both
re-verified as imported by nothing. `src/test/e2e/auth.spec.js` was **kept**: only 1 of its 9 tests used
the demo credentials (removed), the other 8 cover navigation and form validation and are still worth
running. Build + 693 tests green after removal.

**Two traps before deleting:**
- `components/search/AdvancedSearch.vue` is dead but **pinned by `vite.config.js` manualChunks** —
  remove that line in the same commit or the build breaks.
- `services/credits/`, `services/payments/`, `services/payouts/` are imported **only by unit tests**.
  They are the Phase 1–2 provider abstractions. Decide *abandoned vs pending wiring* before deleting;
  the live path is `realPaymentService`/`paymongoService`.

~~Also: `/mobile-test` is a **live route** in production routing. `vue-chartjs` is a dependency imported
nowhere.~~ **Both resolved 2026-07-26.** `/mobile-test` and its view were deleted (`750ea37`);
`vue-chartjs` was removed from `package.json` — the two chart components import `chart.js` directly, so
it had never been bundled. `AdvancedSearch.vue` from the line above went at the same time, together
with its `vite.config.js` manualChunks pin: that pin was the file's only reference anywhere, which is
why an import-graph scan reports it as used and misses it.

### 9. Consolidate duplicated formatters 🟢
`peso()` × 11, `round2()` × 9, `shortDate()` × 8, `formatCurrency()` × 6. Two competing currency
conventions mean inconsistent formatting across the app. One `src/utils/format.js` fixes it.

### 10. Route hand-rolled modals through `AccessibleModal.vue` 🟠
26 raw `.modal-overlay` divs bypass the existing accessible modal (focus trap, Escape, `role="dialog"`).
Keyboard users cannot Escape a payment dialog.

### 11. Two tables back "transaction history" 🟠
`creditOwnershipService` reads `credit_purchases`; `transactionHistoryService` reads
`credit_transactions`. Same feature, different sources. `getUserTransactionHistory` also slices the
merged list to `limit`, so a heavy trader's **retirements disappear** from the combined view.

### 12. Grant hygiene on ~10 SECURITY DEFINER RPCs 🟠
They grant EXECUTE to `authenticated` without first revoking the Postgres default `PUBLIC` grant. Not
exploitable today (each self-gates on `is_admin()`/`auth.uid()`), but inconsistent with the financial
RPCs and one regression away from being a hole. One migration.

---

## From the 2026-07-11 senior review

### 13. Financial-table RLS posture is not in version control ✅ CLOSED (captured 2026-07-25)
There is **no `create policy`** for `credit_ownership`, `wallet_accounts`, `wallet_transactions`, or
`credit_transactions` anywhere in `supabase/migrations/` — those tables predate version control and the
only write-lockdown lives in the **gated, out-of-band** `supabase/cutover/lockdown_financial_writes.sql`
(same as P1).

**Live `pg_policies` audited 2026-07-11.** Findings:
- ✅ **Four ledger tables already client-SELECT-only** (`credit_ownership`, `wallet_accounts`,
  `wallet_transactions`, `credit_transactions`) — no client write policies. The gated lockdown script's
  job is effectively already done for these; it also does **not** cover the three tables below.
- 🔴 **Three live, exploitable write holes found and closed** by migration
  `20260718000800_lock_credit_pool_and_listing_writes.sql`:
  1. `project_credits` "Allow all project credits operations" (`USING(true) WITH CHECK(true)` ALL) — any
     user could UPDATE `credits_available` and **mint inventory**. Dropped; writes now staff-only (issuance
     is the `activate_validated_project_trigger` SECURITY DEFINER trigger, RLS-exempt; purchase decrement
     is the service_role RPC). Added an owner/admin DELETE for project-deletion.
  2. `credit_listings` "Allow all credit listings operations" (same blanket) — any user could UPDATE **any
     listing's `price_per_credit`**, which checkout reads to compute the charge → **buy real credits for
     ₱0.01**. Dropped; sellers keep own-listing control, staff keep all.
  3. `credit_retirements` client INSERT policy — **forge a retirement + certificate with no burn**. Dropped;
     `retire_credits_atomic` (SECURITY DEFINER) is the only writer.

**Update 2026-07-20:** (a) and (b) are **closed**. `…000800` is **verified applied on live** (read-only
`pg_policies` check: all three blanket-write policies gone, `project_credits_owner_or_admin_delete`
present), and the full validate→list→buy→retire flow ran end-to-end with `reconcile_financials()` = 0 —
so no live non-staff caller is writing those tables.

**✅ (c) CLOSED 2026-07-25.** The complete posture — the write-lockdown, the four ledger tables' SELECT
policies, and the inventory tables' read posture — is now captured declaratively in migration
**`20260725000100_capture_money_table_rls.sql`**, reconciled against a live `pg_policies` dump and applied
to live. A fresh env (staging/DR/local) rebuilt from `supabase/migrations/` now reproduces the locked
posture. The repo can **prove** the money tables are locked down two ways:
- **`supabase/diagnostics/money_table_rls_audit.sql`** — read-only, returns **0 rows** when the posture is
  correct (no client write policy, RLS on all 7, no known hole reintroduced). Run it at pilot pre-flight.
- **`src/test/services/moneyTableRls.test.js`** — a CI-cheap guard that fails if the migration is edited to
  reopen a hole, drop RLS, or make a private ledger read world-readable.

The gated `supabase/cutover/lockdown_financial_writes.sql` is now redundant and can be retired. The
reconstructed read policy for `wallet_transactions` was corrected during reconciliation — live scopes it
through `account_id → wallet_accounts`, not a direct `user_id`.

*Historical dump query (how the posture was captured):*

```sql
select tablename, policyname, cmd, roles, qual, with_check from pg_policies
 where schemaname='public'
   and tablename in ('credit_ownership','wallet_accounts','wallet_transactions',
                     'credit_transactions','project_credits','credit_listings','credit_retirements')
 order by tablename, policyname;
```

### 14. Escrow was silently reverted — sellers withdrawable with no hold window ✅ DECIDED 2026-07-25 (Option B; implementation staged for pilot)

**Decision (2026-07-25):** Option B — a **method-gated hold** (cards held ~7d against chargebacks; push
payments GCash/Maya and wallet purchases release immediately). Rationale + options in
[ESCROW_DECISION.md](ESCROW_DECISION.md). **Implementation written and staged** as migration
`20260725000200_restore_escrow_hold_window.sql` — it re-adds the `escrow_holds` write + `escrow_held`
ledger leg to `process_marketplace_purchase` (behind configurable `app_settings` windows) and adds
`release_matured_escrow()`. **Not yet applied** — it rewrites the live settlement RPC, so it lands in the
pilot pre-flight window with a full reconcile-to-0 check (see ESCROW_DECISION §6). The refund path already
reverses `escrow_held` while held (`20260606000900`), and `get_my_seller_balance()` already returns
`held`/`available`. Remaining: apply during pilot, and wire `release_matured_escrow()` to a worker/cron.

**Corrected 2026-07-26:** this list also said "surface Held vs Available in `SellerEarningsView.vue`",
which was already done — the page has carried *Available to withdraw* and *Held in escrow* cards for
some time. The 2026-07-26 farmer/developer pass added the missing half: the held card now names the
**next release date and amount** (`getMyEscrowHolds` / `nextEscrowRelease`), which `hold_until` has
always carried and nothing queried. So the only open work here is operational — apply the staged
migration and schedule the release worker. Original analysis kept below.

---

`20260606000600_escrow_and_seller_balance.sql` routed seller net into `escrow_holds` + an `escrow_held`
ledger account, but **every later** `CREATE OR REPLACE process_marketplace_purchase` (`20260615000200`,
`20260702000000`, `20260703000500`) credits `seller_payable:<id>` **directly** and never inserts an
`escrow_holds` row. `grep escrow_holds` confirms no writer after `20260606000600`; the table + `release_escrow`
RPC are dead for card purchases. **Effect:** sellers are immediately withdrawable with **no dispute /
chargeback hold** — on the card rail this is a fraud path (list → self-buy with a stolen card → withdraw
before the chargeback lands, loss lands on the platform). **Decide before live keys:** instant-payout by
design (document it, drop the dead escrow table/RPC) **or** restore the hold window through settlement.

### 15. Root-cause cleanups behind the review symptoms 🟠
Recorded so they aren't re-discovered each audit:
- **Nullable async Supabase client** → the `const s = getSupabase(); if (!s) return` guard is copy-pasted
  ~233× across 49 files. Fix at the root: `await initSupabase()` before mount; make `getSupabase()`
  throw-or-return; delete the guards.
- **Schema-probing at runtime** (the 5-attempt insert loop / "retry without `updated_at`" fallbacks) exists
  because migrations aren't authoritative. Once #13 + CLI migration tracking (#7) land, run
  `supabase gen types` and delete the probes.
- **Fulfillment saga exists twice** (`services/credits/fulfillmentSaga.js` + a hand-ported copy inside
  `paymongo-webhook`) "kept in sync by hand." The webhook copy is the one that settles money — make it the
  only one and test it directly (Deno test).
- **Error handling is three systems, none on** — `errorStore` + `ErrorBoundary` are commented out in
  `App.vue`; services `console.error` + inconsistently swallow/throw; `main.js` monkeypatches `window.fetch`
  + `console.error` globally (which can eat unrelated errors). Pick one contract and turn the boundary on.

---

## From 2026-07-11 live end-to-end testing (drift, now understood)

### 16. Base tables/functions predate version control → repeated live drift 🟠 (root theme)
A full live run (validate → buy → retire) hit a chain of drift bugs, each fixed by a migration, all the
**same root cause**: objects created out-of-band, never in `supabase/migrations/`, that the code assumed a
newer shape for. Fixed this session:
- **`available_credits` column drop** broke the issuance triggers that still wrote it — the M6 audit's
  "maintained by no trigger" was wrong (it read the service layer, not the trigger SQL bodies). Fixed by
  `20260718000900` (triggers now write only `credits_available`).
- **`certificates` table** was missing 11 columns the cert service writes → certs failed silently. Fixed +
  captured into version control by `20260718001000`.
- **`credit_transactions → profiles` FK** existed but PostgREST's cache was stale → receipt 400. Fixed by
  `20260718001100` (re-assert FK + reload cache).

**Lesson + close-out:** (a) a drift check must read **trigger/function/policy SQL bodies**, not just the JS
service layer — that miss is what dropped a still-referenced column; (b) the base tables that predate VC
(the money tables per #13, and historically `certificates`) should be captured as `create table if not
exists` migrations from a live dump so fresh envs rebuild faithfully; (c) adopt CLI migration tracking (#7)
so live can't silently diverge from `supabase/migrations/` again. This item is the umbrella for #7 + #13.

### 17. BOTH issuance triggers are live — the same tonne can be issued twice ✅ CLOSED 2026-07-26

**Resolution (2026-07-26).** `supabase/diagnostics/issuance_model_audit.sql` was run against live and
returned the `A.` finding only — both triggers enabled, and **no `B.` or `C.` rows: nothing had been
double-issued, and nothing double-issued had been sold**. The exposure was real but had never been
exercised, so closing it required no reconciliation of existing credits.

`supabase/cutover/adopt_mint_on_ver.sql` was then applied to live, retiring
`trg_activate_validated_project` and leaving `trg_mint_credits_on_ver_approval` as the single
issuance path. Re-running the audit afterwards returned **zero rows**.

**Live behaviour is now:** validating a project marks it eligible for MRV and mints nothing. Credits
come into existence only when a verifier approves a monitoring report's VERs — which is what
`20260604010100_decouple_issuance_mint_on_ver` intended before `20260626000500` inadvertently
reverted it while fixing an unrelated column-drift bug. Pools and listings that already existed were
untouched.

**Follow-through:** a validated project no longer reaches the marketplace by itself, so a project
validated before this change behaves differently from one validated after — worth telling active
project developers. The double-issuance warning added to the verifier's MRV screen in `f0b111b` is
now belt-and-braces rather than the only safeguard; it costs nothing and stays. Rollback is in the
cutover script header; if mint-on-VER is ever abandoned, close it the other way by dropping the VER
trigger rather than reinstating both.

*Original entry below.*

---

### 17 (original). BOTH issuance triggers are live — the same tonne can be issued twice 🔴

**Upgraded from 🟡 to 🔴 by the verifier review.** This entry used to read "*if* BOTH triggers are
active". They are. The migration chain settles it:

| Migration | Effect |
|---|---|
| `20260604010100_decouple_issuance_mint_on_ver` | **dropped** `trg_activate_validated_project`, **created** `trg_mint_credits_on_ver_approval` |
| `20260626000500_fix_credit_pool_availability` | **re-created** `trg_activate_validated_project` |
| — | nothing ever dropped the VER trigger |

So validating a project mints a pool **and an active marketplace listing**, and approving a VER
against that same project mints again.

**The current state is an accident, not a decision.** `20260626000500` is titled "Fix credit pool
availability — write the column the app actually reads"; its subject is the
`credits_available` / `available_credits` drift, and it does not discuss issuance models anywhere.
The trigger returned as a side effect of redefining the function to keep both columns in sync,
three weeks after `20260604010100` had deliberately retired it — that file is *named* for what it
was doing.

**On the merits it is also not close.** Validation means "this project is legitimate and may
proceed"; verification means "these reductions actually happened". Issuing at validation sells
credits for reductions nobody has measured — which is what the MRV module exists to prevent, and
what offtake agreements already handle properly for genuine forward sales.

**What is already done:** the verifier is warned at the point of decision when approving a VER
against an already-validated project (`f0b111b` — inline banner plus escalated confirmation
wording). That is a mitigation, not a fix: it depends on a human heeding it.

**How to close:**
1. Run [`supabase/diagnostics/issuance_model_audit.sql`](../supabase/diagnostics/issuance_model_audit.sql)
   against live. Read-only. It confirms which triggers are enabled and, more urgently, finds
   projects **already** double-issued — separating those whose excess credits have already been
   **sold**, which a migration cannot repair because a buyer holds them.
2. Reconcile anything that audit reports before changing triggers.
3. Apply [`supabase/cutover/adopt_mint_on_ver.sql`](../supabase/cutover/adopt_mint_on_ver.sql).
   Deliberately kept out of `supabase/migrations/` so `db push` cannot apply it ahead of step 1.
   It asserts the VER trigger is present and enabled before retiring the validation one, so the
   failure mode is never "no issuance path at all".

**Expect a product change:** a validated project will no longer reach the marketplace by itself. It
gets there when its first monitoring report is approved. Existing pools and listings are untouched.

---

## From the 2026-07-25 commercial repositioning

### 18. No organization / company accounts — every account is an individual 🟠 (scoped 2026-07-25)

**Full scope:** [ORGANIZATION_ACCOUNTS_SCOPE.md](ORGANIZATION_ACCOUNTS_SCOPE.md).

Surfaced while repositioning the platform from "academic capstone" to a commercial product for
institutional users. Carbonify is *positioned* for companies, but there is **no company entity in the
data model**: `profiles.company` is a free-text string, `kyb_applications.user_id` makes a business an
attribute of one person, and no `organizations`/`organization_members` tables exist anywhere in the
migration set. Everything money-related keys to `auth.uid()`.

**The three consequences that matter:**
1. **`credit_ownership.user_id` is a person** — when an employee leaves, the company's carbon assets,
   retirement history, and ESG evidence leave with them. Asset loss, not friction.
2. **`buildVatInvoice` renders `buyer.tin`/`buyer.address` but `receiptService` never supplies them**,
   so both are always blank — the invoice is issued to a natural person and a company cannot claim
   input VAT. A finance department will refuse it.
3. **One login per company** → shared credentials, broken audit trail, and a direct violation of our
   own ToS §1.2 ("one person or entity per account").

**Phasing:** 1 = org entity + membership (no money path, safe to build now) · 2 = org-owned credits
(touches `process_marketplace_purchase` + `retire_credits_atomic`) · 3 = org billing identity ·
4 = org KYB + corporate payouts · 5 = admin/audit.

> ⚠️ **Sequencing:** Phase 2 rewrites `process_marketplace_purchase` — **the same function the staged
> escrow migration `20260725000200` rewrites.** Do not land both in one window, or a non-zero
> `reconcile_financials()` is unattributable, and one of the two changes is the chargeback protection
> the ToS now promises. Apply escrow → run the beta → then Phase 2. **Phase 1 is exempt** and can
> proceed in parallel.

**Owner decision:** whether Phases 1–3 gate the first corporate customer. They probably do — consequence
(2) is what blocks the sale, and consequence (1) is what would lose a customer after it.

---

## From the 2026-07-26 UI consistency pass

### 19. White-on-green header text is 3.5:1 — below the WCAG AA floor ✅ CLOSED 2026-07-26

**Resolution.** The whole green ramp was darkened in `tokens.css`, not just `--primary-color`:

| token | was | now | contrast on white |
|---|---|---|---|
| `--primary-color` | `#069e2d` | `#058526` | 3.54:1 → **4.78:1** |
| `--primary-hover` | `#058e3f` | `#04701f` | **6.28:1** |
| `--primary-dark` | `#04773b` | `#045c1a` | **8.23:1** |
| `--text-muted` | `#718096` | `#64748b` | 4.02:1 → **4.76:1** |

Two things made this more than a one-line change, both worth knowing before touching the palette again:

1. **The ramp had to move together.** Darkening only `--primary-color` would have left
   `--primary-hover` (#058e3f) *lighter* than the resting state, so every hover would have read as a
   bug. Ordering is now asserted by a test.
2. **The token was not the only source of the colour.** Of 411 `#069e2d` occurrences, 290 were
   `var(--primary-color, #069e2d)` fallbacks but **121 were bare literals** that ignore the token
   entirely — plus 62 bare `#718096` and 110 `rgba(6,158,45)` tints. Editing `tokens.css` alone would
   have left 121 surfaces on the old light green, re-creating the exact two-toned inconsistency the
   2026-07-26 consistency pass had just removed. All were swept.

**Guard:** [`src/test/styles/tokenContrast.test.js`](../src/test/styles/tokenContrast.test.js) parses
`tokens.css` and asserts the AA floor, the light→dark ordering, visible separation between steps, and
that the aliased greens (`--bg-green`, `--border-green`, `--bg-green-dark`) still equal their ramp
entry. A brighter brand green now fails the suite.

Verified in a real browser (home, login, register, marketplace) at 1440px and 390px. The
`--text-muted` note that used to sit in `tokens.css` is resolved by the same change.

*Original entry below.*

---

### 19 (original). White-on-green header text is 3.5:1 — below the WCAG AA floor 🟡

**Where:** every green page banner (27 views + [PageHeader.vue](../src/components/layout/PageHeader.vue)).

White text on the brand green `--primary-color` (#069e2d) measures **3.54:1**. That passes AA for
large text (the 1.5rem page title) but **fails the 4.5:1 floor for normal text** — which is what the
0.95rem subtitle under every title is.

**Why it is on this list rather than fixed.** Two views (Submit a Project, Developer Projects) had
been set to `--primary-dark` (#04773b, **5.66:1**) specifically for this. That fixed the contrast on
two pages and made them visibly darker than the other 25 — which is the inconsistency a user
reported on 2026-07-26. Unifying them onto the brand green was the right call for consistency and
returned those two pages to 3.5:1, the same as everywhere else. **The gap was never those two pages;
it is app-wide.**

**The fix is one line, not a per-view patch:** darken `--primary-color` in
[tokens.css](../src/styles/tokens.css) so every banner, button and accent clears AA at once. It is
🟡 rather than 🟢 because the token drives far more than headers — primary buttons, badges, links,
map pins, chart series — so it needs a visual sweep, not just a find-and-replace. Anything approaching
#04773b clears the subtitle; check the paired greens (`--primary-hover`, `--primary-dark`) stay
distinguishable from it afterwards.

**Related, already noted:** `--text-muted` (#718096) measures 4.02:1 on white — also just under the
AA floor, and flagged in tokens.css itself. Same fix window, same reason it hasn't been changed
silently.

---

## From the 2026-07-26 live-readiness review

Found reviewing the signed-in buyer path for deployment. The defects from that pass are fixed in
`3fe8ff5` (service worker / icons / mobile init) and `5f56aeb` (stranded preferences page, notification
panel, tour, preview labelling). The two items below were deliberately **not** actioned in that pass —
both are architecture decisions rather than defects, and one of them touches money.

### 20. The cart charges once per listing, not once per cart 🟠

**Where:** [CartView.vue](../src/views/CartView.vue) → [paymongoService.createMarketplaceCheckout](../src/services/paymongoService.js)
→ `supabase/functions/paymongo-checkout` → `paymongo-webhook` → `process_marketplace_purchase`.

`startCheckout()` takes `cart.items[0]`, opens a PayMongo session for that one listing, and the
payment callback clears the paid item and returns the buyer to the cart for the next one. Three
listings means three redirects, three PayMongo sessions and three sets of transaction fees.

**This is not a UI gap.** The cart is honest about it — the summary says "Items are paid for one at a
time; you'll be returned here to continue after each payment", and a resume banner counts down the
remainder. The limitation is that the whole server chain is single-listing: the edge function takes
`listing_id` + `quantity` and records one `payment_intent` with `purpose: 'marketplace_purchase'`, and
the webhook settles it through `process_marketplace_purchase(listing_id, quantity, …)`.

**Why it is on this list rather than fixed.** A cart-level checkout is a **multi-seller** payment, and
that is a financial design decision, not a refactor:

- One PayMongo payment covering listings from several sellers has to split into per-seller escrow
  holds, per-seller fees and per-seller payouts. That interacts directly with **#14** (no escrow /
  chargeback hold window) — a partial refund against a multi-seller payment is the case #14 is about,
  arrived at from a second direction.
- Settlement has to be atomic across N listings. If listing 2 sold out between checkout and webhook,
  the buyer has already paid for the whole cart: either the RPC reserves inventory at checkout time,
  or partial settlement plus automatic partial refund becomes a supported path.
- It needs a new RPC, an edge-function change, a webhook change and a migration — and PayMongo
  sandbox verification, which is the same gate Phase 1 items sit behind.

**How to close:** decide the multi-seller escrow split first (with #14, not after it), then reserve
inventory at checkout rather than at settlement, then `process_marketplace_cart(line_items[], …)` as a
single transaction. Keep the sequential path until the new one has settled a sandbox cart of two
listings from two different sellers, including a refund of one line.

### 21. The payment/credit/payout provider layer is imported only by tests 🟡

**Where:** `src/services/credits/`, `src/services/payments/`, `src/services/payouts/` — ten files,
including `fulfillmentSaga.runFulfillment`, `PayMongoProvider`, `MockPaymentProvider`,
`CreditSupplier`, `MockPayoutProvider` — plus **`src/services/paymentService.js`**, which joined them
when the dead-code pass removed its last two consumers (`PaymentModal.vue` and
`PaymentSettingsView.vue`, both of which had already commented the import out and substituted an
inline stub). Its own test header says the payment layer "is slated for a rebuild in Phase 1
(server-side amounts + provider abstraction)" — i.e. it is waiting on the same decision as the rest
of this entry, which is why it was flagged here rather than deleted with the others.

Nothing in `src/` outside `src/test/` imports any of it. Production checkout goes
`CartView → paymongoService → paymongo-checkout`, and fulfilment happens server-side in the webhook.
`runFulfillment` has never run outside a test.

**Why this matters more than ordinary dead code:** roughly 40 of the suite's tests exercise this
layer, and several of them look like coverage of the money path —
[`paymongoWebhookSignature.test.js`](../src/test/services/paymongoWebhookSignature.test.js) tests
signature verification against `PayMongoProvider`, while the verification that actually guards live
money is the one inside `supabase/functions/paymongo-webhook`. A green suite therefore overstates how
much of the real payment path is covered.

**Why it is on this list rather than deleted.** It is plausibly deliberate Phase 1 scaffolding —
`PayMongoProvider` is written as a thin adapter over `paymongoService`/`paymentGatewayService` so a
provider swap is possible, and its own header says as much. That is an architectural intent to
confirm or abandon, not a judgement to make during a cleanup pass.

**How to close:** decide whether the provider seam is still wanted. If yes, route the client through
it so the tests test something real. If no, delete all eleven files and their tests, and port the
webhook-signature test to cover the edge function instead — that assertion is worth keeping either
way, just against the code that runs.

**Verifying this list:** `grep -rn "from '@/services/credits'" src | grep -v "^src/test/"` and the
same for `payments`, `payouts`, `credits/fulfillmentSaga` and `paymentService`. Do not trust a
generic import-graph scan here — a naive block-comment strip mis-reads Vue SFCs whose `<style>` blocks
contain `/* … */`, and will wrongly report genuinely-used services (`endorsementService`,
`lguReportService`) as test-only.

---

## From the 2026-07-26 project-developer review

Same live-readiness pass, developer role. The defects and the two closable gaps
are fixed in `f310258`, `0e5f3fa` and the escrow-date change; these two are left
open because both are compliance-shaped rather than code-shaped.

### 22. Sellers get no sales document — only buyers do 🟠

**Where:** [vatInvoiceService.js](../src/services/vatInvoiceService.js), reachable only from
[ReceiptView.vue](../src/views/ReceiptView.vue) — a route in `FINANCE_RESTRICTED_ROLES`, so project
developers are blocked from it outright.

A buyer gets a receipt and a provisional VAT invoice for every purchase. The seller on the other side
of that same transaction gets nothing: no invoice, no receipt, no per-sale document of any kind. They
can now see gross/fee/net on screen and export both tables as CSV (`0e5f3fa`), which covers
bookkeeping — but not the document a counterparty or the BIR asks for.

**Why it is on this list rather than fixed.** It is the same unresolved question `vatInvoiceService`
already flags for the buyer side: Carbonify is not yet a BIR-registered entity with accredited
receipts, which is why the buyer's invoice is watermarked provisional (see
[POLICY_AND_USER_AGREEMENT.md](POLICY_AND_USER_AGREEMENT.md)). Issuing seller-side documents raises a
second question the buyer flow never had to answer: in a marketplace sale, is Carbonify the seller of
record issuing on the developer's behalf, or an agent facilitating a sale between two parties who each
issue their own? That determines whose TIN goes on the document, and it is a tax-advice question, not
an implementation choice.

**How to close:** settle the seller-of-record question first, then mirror the existing
`computeVatBreakdown` + provisional watermark for the seller side. The arithmetic already exists and
is unit-tested; only the identity on the document is undecided.

### 23. Developers cannot see a forward view of their own projects 🟢

**Where:** [InvestorPortalView.vue](../src/views/InvestorPortalView.vue) /
[investorAnalytics.js](../src/services/investorAnalytics.js).

Investors get projected value, IRR/NPV, payback, and contracted-vs-speculative revenue across the
pipeline. The developer who *owns* a project sees only what has already happened — issued, sold,
retired, on hand — plus offtake agreements as a separate list. They have every input the investor
projection uses, for their own projects, and no view that combines them.

**Why it is on this list rather than fixed.** Straightforward to build, but it is a product decision
about what a developer should be shown: the investor model's assumptions (discount rate, price curve)
are calibrated for a diligence audience, and putting an IRR in front of a project owner invites it
into a funding conversation where the platform is implicitly vouching for the number. Worth doing
deliberately, with its own framing, rather than by pointing the existing component at a different
`user_id`.

---

## From the 2026-07-26 verifier review

Same live-readiness pass, verifier role. Defects are fixed in `f0b111b` and
`30089a3`; queue backlog counts added on the workbench tabs. **#17 is upgraded
below** — the verifier review turned its conditional "if BOTH triggers are
active" into a settled fact. These two remain open.

### 24. A verifier cannot see their own decision history 🟠

**Where:** nothing renders it. `projects.verified_by` / `verified_at` and
`monitoring_reports.reviewed_by` / `reviewed_at` are written on every decision, and
`logUserAction` records `MRV_REPORT_APPROVED` and `project_validated` to the audit log —
but no verifier-facing screen reads any of it back.

A verifier can see what is *waiting* (three queues, now with counts) and nothing about what
they have *done*. For the one role on the platform whose entire job is to attest, that is
backwards: they cannot answer "what did I approve last quarter, and on what evidence" without
an administrator running a query for them. The audit log that would answer it lives at
`/admin/audit-logs`, which is admin-gated — a verifier cannot reach their own attestations.

**Why it is on this list rather than fixed.** The data is all present, so the screen is easy;
what is not decided is the *scope*. A verifier's decision history is also the evidence trail an
external auditor or a registry counterparty would ask for, which raises questions this pass
should not answer alone: does it need to be exportable and signed, should it show the evidence
as it stood at decision time rather than as it stands now, and is it per-verifier or
per-project. Building the easy version first would likely have to be thrown away.

**How to close:** decide whether this is a convenience view or an attestation record. If the
former, a "My decisions" tab reading `verified_by = auth.uid()` closes it in an afternoon. If
the latter, it needs point-in-time evidence snapshots, which is a schema question.

### 25. Reviews are not assigned, and concurrent reviewers are invisible 🟢

**Where:** [MrvReviewDashboard.vue](../src/components/verifier/MrvReviewDashboard.vue) /
`startReview` in [monitoringService.js](../src/services/monitoringService.js).

`startReview` moves a report to `under_review` and stamps `reviewed_by`, so a second verifier
opening the same report sees an "under review" badge — but not *who*, and nothing stops them
proceeding. The project queue has no equivalent at all. With one verifier this is invisible;
with two it is duplicated work and, on the approve path, a race on an issuance-bearing action.

**Why it is on this list rather than fixed.** It only starts to matter at more than one active
verifier, which the platform does not have yet, and doing it properly means deciding whether
reviews are *claimed* (an assignment model, with release and timeout) or merely *advertised*
(show the name and let people coordinate). The second is nearly free; the first is a workflow
feature. Worth taking the decision before the second verifier is hired, not after.

---

## From the 2026-07-26 farmer review

Same live-readiness pass, farmer role. Defects are fixed in `9d4e2ae`; the dormant language
selector is disabled honestly rather than left pretending. These two remain open, and #26 is the
most consequential item to come out of any of the four role reviews so far.

### 26. Farmers are not paid through the platform — payment is an honour-system flag 🟠

**Where:** `mark_farmer_delivery_paid` in
[`20260711000000_farmer_portal.sql`](../supabase/migrations/20260711000000_farmer_portal.sql), and
[farmerService.js](../src/services/farmerService.js), whose own header states it plainly: *"Payment
status here is bookkeeping only — it never touches `ledger_entries` / `escrow_holds` /
`payout_requests`, so the proven money path is unaffected."*

The RPC sets `payment_status = 'paid'`, stamps `paid_at`, and stores an optional free-text
`payment_reference`. **No money moves.** The buyer pays the farmer off-platform — cash, GCash, bank
transfer — and then asserts that they did.

Compare what every other party gets:

| Role | Money path |
|---|---|
| Buyer | Real PayMongo checkout, server-settled via webhook |
| Project developer | Escrow hold → KYB-gated `request_payout` → payout worker |
| **Farmer** | **A boolean the counterparty sets** |

So the farmer — typically the least powerful party, and on this platform explicitly a smallholder or
cooperative — carries all of the counterparty risk. A buyer can confirm a delivery and never mark it
paid, or mark it paid without paying, and the platform records the latter as fact. There is also **no
recourse**: `/disputes` is `openDispute({ transactionId })` against `credit_transactions` only, and
it is not in the farmer's sidebar at all, so nothing in the product lets a farmer raise a
non-payment.

**Why it is on this list rather than fixed.** The scoping was deliberate and correct at the time —
keeping deliveries out of `ledger_entries` is exactly what kept the money core stable while it was
being proven. Undoing that is a real payments project: it needs escrow on the buyer side for a
physical good whose delivery is confirmed off-platform, a payout path for farmers (which means KYC/KYB
for smallholders — a significant onboarding burden), and a dispute mechanism for "delivered but
unpaid". It also interacts with **#14**: the escrow/chargeback question, answered for credits, would
have to be answered again for a good that cannot be clawed back once delivered.

**How to close:** decide first whether Carbonify intends to be the payment rail for feedstock at all,
or an introduction and record-keeping layer with payment left to the parties. Both are defensible;
only one of them is what the UI currently implies. If the latter, say so explicitly in the farmer
portal and in the terms, because "Paid" rendering as a settled fact is the misleading part. If the
former, it is a phase of work, not a ticket.

### 27. The language selector offered seven languages and delivered none 🟢 (partly addressed)

**Where:** [preferencesStore.js](../src/store/preferencesStore.js) `loadLanguagePack()` —
a `console.log`. No i18n library is installed and there is no locales directory, so `setLanguage`
persisted a preference that changed nothing.

Surfaced because `/preferences` was linked into the account menu in `5f56aeb`, which made a
previously unreachable control discoverable for the first time. The selector is now **disabled with
an explanation** rather than silently inert.

**The part still open:** Filipino/Tagalog was not even among the seven offered (English, Spanish,
French, German, Portuguese, Chinese, Japanese). For a Philippine platform whose farmers and
cooperatives are named in the onboarding material as the users most needing an instructional guide,
English-only is a real accessibility barrier, and the language list as it stands reflects a template
rather than this product's users.

**How to close:** install an i18n library, extract strings, and translate Filipino first. Scope it
against the farmer and LGU surfaces before the buyer ones — those are the users for whom English is
the actual obstacle.

---

## From the 2026-07-26 LGU review

Same live-readiness pass, LGU role — the best-built role surface in the app, and the only one where
the services already threw on failure, every section had its own error state, and the destructive
action already confirmed. Defects fixed in the accompanying commit; this one remains open.

### 28. An LGU is never told a project appeared in its jurisdiction 🟠

**Where:** [notificationService.js](../src/services/notificationService.js) —
`notifyProjectSubmittedForReview` notifies `['verifier']` and nobody else. No notification anywhere
in the codebase targets LGU users.

Endorsing local projects is one of the four things the LGU onboarding tour promises ("Endorse carbon
projects hosted in your area"), and the dashboard has a whole Endorsements tab for it. But an LGU
only discovers there is something to endorse by remembering to open that tab and look. Every other
role is told when work arrives: verifiers on submission, developers on a decision and on MRV due
dates, buyers on watchlist price drops. The LGU — whose endorsement is a trust signal the project
developer actively wants — has to poll.

**Why it is on this list rather than fixed.** Notifying *every* LGU about *every* project would be
spam, so it has to be jurisdiction-scoped, and that is a database change rather than a service one.
Role→recipient resolution runs through the `resolve_notification_recipient_ids` SECURITY DEFINER RPC
precisely because `profiles` SELECT is deliberately hardened (`20260703000300`, and see #3's warning
against loosening it), so the client cannot look up "LGU users in municipality X" itself. The match
also has to go through `normalize_jurisdiction()` to agree with the endorsement guard in
`20260722000500` — otherwise an LGU gets notified about a project it will then be refused permission
to endorse.

**How to close:** extend `resolve_notification_recipient_ids` with an optional municipality filter
(normalized the same way the guard normalizes), then call it from
`notifyProjectSubmittedForReview` alongside the verifier notification. Fails closed by design: an
LGU with no declared municipality, or a project with none, should receive nothing rather than
everything.

---

## From the 2026-07-26 admin review

Last of the six role reviews. Admin feature gaps were already tracked and prioritized in
[role-needs/04-admin.md](role-needs/04-admin.md) (#5 fraud signals, #10 feature flags, #11
maker-checker, #12 moderation) and are not duplicated here. Defects fixed in `647d3b2`. These two
are new.

### 29. The feedstock side of the marketplace has no admin at all 🟠

**Where:** nothing. No file under `src/components/admin/`, no `Admin*View.vue`, and neither
`adminFinanceService` nor `adminExportService` reads `farmer_deliveries`, `biomass_rfqs` or
`biomass_products`.

Admin financial oversight is marked ✅ in the role-needs doc, and it is — for the *credit* trade.
`/admin/finance` reports gross sales, fees, platform revenue, payouts and reconciliation drift, all
from `credit_transactions`. `/admin/refunds` resolves disputes, and `disputes` rows are keyed to a
`transaction_id` on the credit side. The feedstock trade — listings, RFQs, quotes, deliveries,
payment status — is invisible to every admin screen.

**Why that matters more than an ordinary gap:** it is the other half of **#26**. A farmer whose
confirmed delivery is never marked paid has no dispute path of their own, and this entry is why they
also cannot be helped: the escalation point has no screen showing the delivery, no way to see the
buyer's side of it, and no record of the trade in any oversight console. For the party with the
least leverage on the platform, there is neither self-service recourse nor staff recourse.

**How to close:** decide #26 first, because the answer changes what this needs. If Carbonify becomes
the payment rail for feedstock, deliveries belong in the finance console and in the dispute schema
alongside credit transactions. If it stays an introduction-and-records layer, the admin still needs a
read-only feedstock view and a way to record an off-platform resolution — otherwise "contact
support" resolves to nobody.

### 30. ~100 exported functions are referenced nowhere 🟢 (first pass done 2026-07-26)

> **Progress 2026-07-26 (`bfc4526`).** The detector was widened to search
> `supabase/functions`, `scripts/` and `docs/` as this entry asked, which immediately spared
> `getCertificate` / `verifyCertificate` (called from `scripts/test/components/`) and `exportMyData`
> (referenced in a migration). It also now separates *dead function* from *unnecessary export* — an
> export used inside its own file is real code, which is why `ERROR_CODES` (30 in-file references),
> `setupLazyLoading` and `preloadCriticalImages` were left alone.
>
> Four files swept: `utils/cache.js` (220 → 45), `utils/formatDate.js` (104 → 24),
> `utils/imageOptimization.js` (196 → 128), `utils/errorHandler.js` (`withRetry`). **347 lines
> removed.** 61 flagged exports remain — mostly ones needing an `export` keyword dropped rather than
> a function deleted.
>
> **Do the rest with exact-string edits, not line arithmetic.** Two removals in that pass were done
> by computing line ranges and both were wrong; one required restoring `auditService.js` from a
> backup. Lint caught them, but the method invites the error.

**Where:** across `src/services` and `src/utils`. Found while removing five dead exports from
`auditService` (444 lines → 203) during the admin pass.

The existing orphan scan only detects whole unused **files**, which is why it reports zero while this
does not: these are live modules carrying dead exports. A sample of what turned up —
`notifyProjectSubmittedForReview` (superseded by the `notify_project_submitted` DB trigger, which the
*calling* code documents but the function does not), `emailService.getUserEmailPreferences` /
`updateUserEmailPreferences` (the stubs behind the deleted `/email-settings` page),
`paymentGatewayService.createGCashPayment` / `createMayaPayment`, and several `marketplaceService`
helpers.

**Why it is on this list rather than swept now.** Some are plausibly deliberate API surface, some are
superseded by database triggers in ways only a comment elsewhere records, and a few may be called
from Edge Functions rather than the client — which this check does not look at. Deleting 100 exports
on a single reading is how a working function gets removed because its only caller was somewhere the
scan could not see.

**How to close:** sweep per service, not in one pass, and check `supabase/functions/` as well as
`src/` for each name before deleting. The detector is a dozen lines: collect `^export (async )?
function|const` names per file, then look for a bare-word match anywhere else under `src/`.

---

### 31. Farmers can reach the buying path but are not offered it 🟢

**Where:** `FINANCE_RESTRICTED_ROLES` in [router/index.js](../src/router/index.js) is
`[admin, verifier, developer]`; `isBuyerRole` in [constants/navigation.js](../src/constants/navigation.js)
excludes farmers.

The same contradiction that was resolved for LGU users on 2026-07-26, one role over. A farmer can open
`/cart`, `/credit-portfolio`, `/retire`, `/orders`, `/receipts` and `/wallet` by URL — nothing blocks
them — `/kyc` is open to them because the router says farmers "need KYC to move money", and
`/analytics` is in their sidebar with an **ungated Buying tab** showing portfolio value and monthly
spend. Their sidebar offers none of it.

**Why this was NOT fixed alongside the LGU one.** For LGU the evidence was decisive: `BuyerDashboardView`
names `lgu_user` in its own docstring as a role whose job is to buy, and a municipality that has just
quantified its emissions is the archetypal offset buyer. No equivalent exists for farmers — nothing in
the code or the docs says a feedstock supplier is also expected to purchase credits, and it is at least
arguable that a smallholder should not be shown a checkout at all. Applying the LGU reasoning here
would have been extending a judgement past its evidence.

**The KYC line is the loose thread.** Farmers are told they need KYC "to move money", but the money
they receive is paid off-platform (**#26**) and they are blocked from `/sales` by `NON_SELLING_ROLES`.
So there is currently no flow in which a farmer's KYC does anything.

**How to close:** decide whether a farmer is a buyer. If yes, give them the buying groups as the LGU
branch now does. If no, add `ROLES.FARMER` to `FINANCE_RESTRICTED_ROLES` and drop their `/kyc` entry —
and note that the same question then applies to whether the Buying tab in `/analytics` should be
role-gated, since it is currently ungated for every role that can see the page.
