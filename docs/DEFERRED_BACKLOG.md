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
> **New 2026-07-26: #19 — white-on-green header text is 3.5:1, under the WCAG AA floor.** Surfaced by
> the UI consistency pass, which unified all 27 page banners onto `--primary-color`. App-wide, not
> per-view; the fix is one token in `tokens.css` plus a visual sweep. Blocks nothing.

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

Also: `/mobile-test` is a **live route** in production routing. `vue-chartjs` is a dependency imported
nowhere.

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
`held`/`available`. Remaining: apply during pilot, wire `release_matured_escrow()` to a worker/cron, surface
Held vs Available in `SellerEarningsView.vue`. Original analysis kept below.

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

### 17. Live issuance model is issue-on-VALIDATION, not the "decoupled MRV" model the code comments describe 🟡
`activate_validated_project_trigger` (re-established by `20260626000500`) creates the pool **and** an active
listing the moment a project is validated — so a validated project goes straight to the marketplace. The
`20260604010100` "decouple, mint-on-VER" migration was superseded on live. Code comments (e.g.
`approveProject`) still describe the mint-on-VER model, and `mint_credits_on_ver_approval` also exists — if
BOTH triggers are active, a project validated **and** later granted VERs is issued twice. **Decide** which
model is canonical: issue-on-validation (simpler, current live behaviour) or the SRD-faithful mint-on-VER
(drop the validation trigger). Until decided, don't approve VERs on an already-validated project. Both
trigger functions were made column-safe in `20260718000900`, so either choice works mechanically.

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

### 19. White-on-green header text is 3.5:1 — below the WCAG AA floor 🟡

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
