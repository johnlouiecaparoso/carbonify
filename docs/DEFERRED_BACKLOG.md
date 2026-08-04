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
> **2026-07-29: #26's follow-ups and #29 are CLOSED.** The feedstock payment record is now two-sided
> (buyer asserts, farmer confirms or disputes), the ToS §1.14 and the in-app modal §6 state the
> records-layer position in lockstep, and `/admin/feedstock` gives the escalation point somewhere to
> land. The credit-side dispute schema was **not** widened to get there — see #26. All of it is inert
> until `20260729000100_feedstock_payment_record.sql` is applied.
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

### 4. VALIDATE the `NOT VALID` constraints ✅ WRITTEN 2026-08-02 (owner applies)
`credit_transactions_buyer_id_fkey` / `_seller_id_fkey` were added `NOT VALID` for safety. Once the
orphan check (in `20260606000100_*.sql`) confirms zero orphans, run `VALIDATE CONSTRAINT`. (Not required for
PostgREST embedding — a stale schema cache was the actual cause of the receipt 400, fixed by
`20260718001100`; validating is cleanup/integrity only.)

**It is not two foreign keys, it is four constraints — and the two this entry omitted are the
interesting ones.** Measured across `supabase/migrations/`:

| Constraint | Kind | From |
|---|---|---|
| `credit_transactions_buyer_id_fkey` | FK → `profiles(id)` | `20260718001100` |
| `credit_transactions_seller_id_fkey` | FK → `profiles(id)` | `20260718001100` |
| **`credit_ownership_qty_nonneg`** | CHECK `quantity >= 0` | `20260604020100` |
| **`kyc_level_requested_range`** | CHECK `level_requested between 1 and 3` | `20260718000400` |

`credit_ownership_qty_nonneg` is described in its own migration as the backstop that stops the same
carbon unit being retired or sold twice. `NOT VALID` means it has been enforced on new writes and
**never checked against the rows that already existed** — so "has any pre-existing holding ever gone
negative?" is a question about whether the ledger is sound, and nothing has ever asked it.
`20260802000200_validate_not_valid_constraints.sql` is the first thing to ask.

*The fourth entry in this file whose stated count did not survive measurement, after #30, #27 and
#12.*

**The migration reports rather than merely running.** A bare `validate constraint` aborts on the
first violation and tells you nothing about the rest, so each is validated independently: a failure
is caught, named, and reported with the reason while the others still run. Nothing is skipped
silently. If one fails, the read-only QUERIES block at the bottom of the file lists the offending
rows.

⚠️ **Not executed anywhere** — owner applies. `VALIDATE CONSTRAINT` takes only a
SHARE UPDATE EXCLUSIVE lock, so reads and writes continue during the scan.

### 5. Prettier formatting pass — ✅ UNBLOCKED 2026-08-02 (enabling it is your call)
`npm run format` (Prettier) **broke the build**: it reformats multi-statement inline Vue handlers
(e.g. `@input="fn(); errors.x = ''"`) across lines and drops the `;`, which the Vue template parser
rejects. ESLint uses `skipFormatting`, so Prettier isn't enforced anyway. To enable Prettier safely,
first refactor those inline handlers into named methods, then add the format step.

**The blocker was seven attribute values in one file.** Every multi-statement inline handler in the
repo lived in `RoleApplicationView.vue`, all of the same shape
— `sanitizeNumericField('x'); errors.x = ''` — and all seven now call one named
`onNumericInput(field)`. A repo-wide scan confirms **zero** multi-statement template handlers remain.

**Verified by running it, not by reasoning about it:** `npx prettier --write` on that file, then
`npm run build` — green, and no broken handler reintroduced.

⚠️ **Prettier was NOT enabled, and that is deliberate.** Running it over one file produced a
**3383-line** diff (it normalises line endings and reflows everything), so applying it repo-wide is a
formatting-policy decision with an enormous, unreviewable diff — the owner's call, not a side
effect of unblocking it. The Prettier run above was reverted; only the 21-line handler refactor
landed. When you do want it: run `npm run format` on its own commit, touching nothing else, so the
noise never mixes with a behaviour change.

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

### 9. Consolidate duplicated formatters ✅ CLOSED 2026-07-28

`src/utils/format.js` is now the single source: `peso`, `pesoCode`, `pesoWhole`, `num`, `round2`,
`pct`, `shortDate`, `dateTime`. It replaced `peso()` ×15, `shortDate()` ×11, `round2()` ×10,
`num()` ×10 and `formatCurrency()` ×5 across 13 files.

**Three of the divergences were real, not cosmetic** — the reason this was worth doing:

- `BuyerDashboardView` omitted `minimumFractionDigits`, so a balance rendered **`₱1,234.5`** — one
  decimal place, on money.
- `FinanceConsoleView` and `MarketDashboardView` passed `undefined` as the locale, so digit grouping
  followed the **viewer's browser locale** rather than en-PH.
- `AdminRefundsView`'s `shortDate` was date **+ time** while every other view's `shortDate` was
  date-only — one name, two outputs. Aliased to the new `dateTime` rather than silently changing what
  renders.

**Two variants are deliberate and are now named rather than duplicated:** `pesoCode()` for VAT
invoices (a tax document carries the ISO code `PHP`, not the `₱` glyph) and `pesoWhole()` for
CAPEX/OPEX (a trailing `.00` on eight digits is noise). If you need another, add it to `format.js`
with a comment saying why — re-declaring a local one is exactly how the drift above happened.

### 10. Hand-rolled modals bypass the accessible modal ✅ CLOSED 2026-07-28 (differently than proposed)

**The defect was confirmed and worse than "bypass":** 15 `.modal-overlay` dialogs across 9 files, and
**not one handled Escape** — including wallet top-up and withdraw, so a keyboard user could not
dismiss a payment dialog. None trapped focus (Tab walked onto the page behind), and none announced
itself as a dialog. `AccessibleModal.vue` had exactly **one** adopter.

**Closed with a directive, not by adopting `AccessibleModal`.** These overlays wrap child components
— `<TopUp>`, `<Withdraw>`, `<ListingManagerModal>` — that render their own header and actions, while
`AccessibleModal` supplies its own title bar and close button. Adopting it would have given each a
second, duplicate header and turned an accessibility fix into a visual rewrite of 15 dialogs.

[`v-modal-a11y`](../src/directives/modalA11y.js) adds the missing behaviour as one attribute per
dialog, no markup change: Escape (topmost dialog only, so stacks unwind one layer at a time), Tab /
Shift+Tab wrapping with focus pulled back if it escapes, `role="dialog"` + `aria-modal="true"`
without overriding a value already declared, focus restored to the trigger, and body-scroll lock.

**Worth knowing:** it queries focusables **live on each Tab** rather than caching at open. The
existing `focusManager.trapFocus` caches its list at setup, so a dialog whose content appears after
mount would not trap correctly with it. Guarded by 9 tests in
[`modalA11y.test.js`](../src/test/directives/modalA11y.test.js).

`AccessibleModal.vue` is unchanged and remains the right choice for **new** dialogs that want standard
chrome.

### 11. Two tables back "transaction history" ✅ CLOSED 2026-08-01 (slice 07-28 · dual source 08-01)

> **✅ The slice bug is fixed (2026-07-28), and it was more serious than this entry recorded.**
>
> `creditOwnershipService.getUserTransactionHistory` fetched `limit` purchases and `limit`
> retirements, merged them, sorted newest-first, then sliced the **combined** list to `limit`. When a
> user's purchases were all newer than their retirements, the purchases filled the slice and **every
> retirement was dropped**.
>
> This entry called that "retirements disappear from the combined view", implying a cosmetic
> list-length problem. In fact **the only caller is `esgReportService.buildEsgDataset`**, which
> derives `retiredCredits`, `retiredTco2e` and the by-project / by-category groupings from exactly
> those retirement rows. So **the ESG report a buyer exports as evidence of their offsetting silently
> under-reported the one number it exists to state** — nothing errored, nothing looked missing.
>
> **The suite could not see it:** `esgReportService.test.js` injects a fake service, so the real
> function was never executed. The new
> [`creditOwnershipHistory.test.js`](../src/test/services/creditOwnershipHistory.test.js) drives it
> through a mocked client; with the slice restored, 3 of its 4 cases fail and the ESG assertion
> reports **0 credits retired for a user who retired 8**.
>
> `limit` now caps each type independently and says so in the JSDoc. **Do not re-add a cross-type
> slice** — if a caller needs a true "most recent N overall", slice at the call site where the
> semantics are visible.

> **✅ CLOSED 2026-08-01 — and the dual source was hiding a third defect, worse than the first two.**
>
> The open half read: *"`creditOwnershipService` reads `credit_purchases`; `transactionHistoryService`
> reads `credit_transactions`. Same feature, two sources… consolidating them is a data-model question
> (which table is canonical for a purchase)."*
>
> **It was not a question. Nothing in this project writes `credit_purchases`** — not one migration,
> edge function or client path. Every settled purchase is inserted into `credit_transactions` by
> `process_marketplace_purchase` (`20260606000400`). The table was legacy, and
> `creditOwnershipService.getUserTransactionHistory` — the ESG report's only source — had been reading
> it.
>
> So `buildEsgDataset().totals.purchasedCredits` was **structurally zero**, and the exported PDF
> printed **"Credits purchased (lifetime): 0"** for every buyer who had ever bought anything.
>
> **That is #11's failure mode for the third time, by a third route.** The cross-type slice
> (2026-07-28) and the swallowed error (2026-07-30) were both fixed *in this same function*, and
> neither pass asked whether the table under it had rows. Scoped honestly: `Credits owned`,
> `Credits retired` and the `By Project` breakdown were always correct — they come from
> `credit_ownership` and `credit_retirements`. Only the purchased figure was wrong.
>
> **Fixed:** the purchases half now reads `credit_transactions` with `status = 'completed'`, through
> the two-level `project_credits -> projects` embed the shapes never shared.
>
> **The name collision is fixed by renaming, which is the actual close-out of this entry.**
> `transactionHistoryService`'s copy is now `getPurchaseAndRetirementHistory` — it returns
> `{purchases, retirements, all}` from different tables and was never interchangeable with the flat
> array `creditOwnershipService` returns. One name over two shapes is what let a fix land on one copy
> and be believed to cover both, twice.
>
> **Two more `[]`-on-error reads went with it,** both live on RetireView via
> `getUserRetirementHistory`: a failed retirements query was logged and stepped over, and the outer
> catch returned `{purchases: [], retirements: [], all: []}`. A user who had retired credits was told,
> on the retirement screen, that they had retired none. Both now throw; pinned by
> [`retirementHistoryErrors.test.js`](../src/test/services/retirementHistoryErrors.test.js),
> mutation-checked.
>
> **Also deleted:** a `credit_purchases` "fallback" that queried the table, logged
> *"✅ Found purchases in credit_purchases table"*, and discarded the rows behind a
> `// TODO: Implement proper fallback`. It printed a success line for data it never used, against a
> table nothing writes. **A log line saying a thing worked is not evidence the thing worked.**

### 33. Three services own project writes, and the submit form tries all three 🟠

Surfaced by the collision guard written for #11
([`duplicateServiceReads.test.js`](../src/test/services/duplicateServiceReads.test.js)), which found
**nine** name collisions across `projectService`, `projectWorkflowService` and
`projectApprovalService`. `ProjectForm.vue` imports all three.

The sharp end is its submit handler, which **cascades**:

```
projectWorkflowService.submitProject(...)
  └─ catch → projectService.createProject(...)
       └─ catch → projectApprovalService.submitProject(...)
```

Three write paths into the same table, chosen by whichever does not throw. Consequences: which path
actually created a project is not knowable from the code, the three may write different column sets,
and a fix to one is invisible to the other two — the same shape as #11, at the scale of project
creation rather than a report figure.

**Not fixed here, deliberately.** Collapsing them needs a decision about which service owns project
writes, and that is an architecture call rather than a defect fix. The nine collisions are recorded
as an explicit **ratchet baseline** in the guard test: a new collision fails the suite, and removing
one fails it until the entry is deleted from the list. The count can only go down.

**Evidence to gather before deciding:** whether the fallbacks have ever actually fired in production.
If path 1 always succeeds, paths 2 and 3 are dead code and this is a deletion, not a refactor.

### 12. Grant hygiene on ~~~10~~ **39** SECURITY DEFINER RPCs ✅ CLOSED — applied 2026-08-02
They grant EXECUTE to `authenticated` without first revoking the Postgres default `PUBLIC` grant. Not
exploitable today (each self-gates on `is_admin()`/`auth.uid()`), but inconsistent with the financial
RPCs and one regression away from being a hole. One migration.

**The count was wrong, and that is the first finding.** Measured against `supabase/migrations/`:
**89 SECURITY DEFINER functions, 39 with no revoke anywhere.** The third entry in this file this week
whose number did not survive measurement — #30's hand-count became a script (63), #27's estimate
became 375 strings, and "~10" here is 39. *These entries are reliable about the shape of a problem
and unreliable about its size.*

**Split, and only one half is a reachable surface.** 15 of the 39 return `trigger`: they take no
arguments, PostgREST will not expose a `trigger` return type, and a direct call raises. The PUBLIC
grant on them is not reachable, and the runtime privilege semantics of trigger execution are not
worth risking a table-wide INSERT failure to tidy — `20260802000100` skips them **structurally**
(`prorettype <> 'pg_catalog.trigger'::regtype`) rather than by list, so it cannot be got wrong by
editing names. The other **24 are covered**.

**Why the migration carries a role list per function rather than one blanket rule:**

| Group | Roles kept | Why |
|---|---|---|
| RLS policy helpers — `is_admin`, `is_lgu`, `is_mrv_staff`, `is_verifier_or_admin`, `owns_project`, `owns_report_project`, `current_user_role` | anon + authenticated + service_role | They appear inside `create policy` expressions (13 files for `is_admin` alone), and **a policy is evaluated as the querying role**. Revoking `anon` breaks anonymous reads of every table whose policy calls one. This group's access is unchanged — the value is that an implicit default becomes an explicit, reviewable grant |
| Internal helpers — `get_setting`, `insert_system_notification`, `current_plan` | **none** | Called only from other SECURITY DEFINER functions, which execute as the owner. Verified call site by call site. The real hygiene win |
| Client RPCs — 8, incl. `review_kyc_application`, `resolve_dispute` | authenticated | Called from `src/` as a signed-in user, and by **no** edge function (all 11 edge-function RPC calls were enumerated). `anon` removed |
| Public by design — `search_public_registry`, `public_registry_stats`, `public_market_stats`, `verify_certificate_public` | anon + authenticated | `/registry` and `/verify` work signed out. A revoke here would be a regression wearing the costume of a security fix |

✅ **Applied to live 2026-08-02 and verified by probing it, not by trusting the run.** As `anon`:
`review_kyc_application`, `review_kyb_application` and `resolve_dispute` return
**`401 42501 permission denied for function`** — refused at the privilege layer rather than admitted
and failed inside the body. The four public reads still return `200` with rows. Eight anonymous table
reads (`projects`, `credit_listings`, `app_settings`, `methodology_factors`, `profiles`,
`policy_acceptances`, `monitoring_reports`, `project_comments`) all return `200` with **no**
`permission denied for function` — the failure mode that actually mattered, because seven of these
helpers are evaluated inside RLS policies as the querying role.

**Ratcheted, not just closed.** [`securityDefinerGrants.test.js`](../src/test/services/securityDefinerGrants.test.js)
re-derives the inventory from `supabase/migrations/` on every run and fails, **naming the function**,
if any client-callable SECURITY DEFINER function lacks a revoke. Mutation-checked: deleting one entry
from the migration turned it red and printed `open_dispute`. This drifted for months precisely
because nothing checked.

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

### 15. Root-cause cleanups behind the review symptoms ✅ — ALL 4 CLOSED 2026-08-01/02

> **Every one of these turned out to be wrong about the system in some way**, which is the finding
> worth carrying from this entry. The nullable-client row prescribed deleting 162 guards (wrong fix —
> the count was never the defect). The error-handling row said `errorStore` was commented out (false
> for weeks). The schema-probing row called the retry harmless drift tolerance (it was silently
> dropping the fields that make a credit assessable). The saga row said the two copies were "kept in
> sync by hand" (they were not, and the drift was in the money path).
>
> **A backlog entry is a claim about the system, and claims need re-measuring before they are acted
> on.** Three of these four were only found by checking rather than trusting.

Recorded so they aren't re-discovered each audit:
- ~~**Nullable async Supabase client**~~ ✅ **FIXED AT THE ROOT 2026-08-01.** `getSupabase()` kicked off
  an async init and returned whatever the singleton held — `null` while that was in flight — so "is
  Supabase available?" depended on *when* you asked. `createClient()` does no I/O; the only await was
  a legacy-session migration, now a background side effect. **A null return now means one thing: the
  environment is misconfigured.** The consent gate hit this exact race on 2026-08-01.

  **The prescription in this entry — "delete the guards" — was wrong, and that is worth recording.**
  The guard COUNT was never the defect. The two SHAPES were: 94 `throw` against 31 `return []`. One
  transient race surfaced as a hard error in one service and as an empty list in the next, and an
  empty list renders as a fact about the user — the class chased all week, with a startup race as its
  source. With the race gone the guards are correct and rare; ripping out ~125 call sites across ~60
  files to save a branch that can still legitimately fire is churn with a real regression budget and
  no user-visible gain. Pinned by [`supabaseClientSync.test.js`](../src/test/services/supabaseClientSync.test.js),
  mutation-checked.
- ~~**Schema-probing at runtime**~~ ✅ **REMOVED 2026-08-02 from the project write paths, and it was
  worse than "dead weight".** The retry caught an insert error, checked whether its message named any
  of **16 optional columns**, DELETED those fields from the payload and retried — so the project was
  created without them and **nobody was told**. Four of the sixteen were `methodology`,
  `additionality_type`, `permanence_years` and `reversal_risk`: the fields that make a carbon credit
  assessable at all. A project that looks complete and silently lacks them is worse than a failed
  submit the developer can see, because the failure is visible and the reshaping is not.

  Same family as `[]`-on-error — a fallback that turns an error into a plausible-looking result.
  One said *"you own nothing"*; this said *"your project has no methodology"*.

  **Removed on evidence.** This entry said to delete the probes "once migrations are authoritative".
  Rather than wait for #7, all 16 columns were probed against the live schema via PostgREST on
  2026-08-02: every one returned `200`, against a control column returning
  `400 42703 column does not exist`. The retry could not fire. Guarded by
  [`noSilentColumnDrop.test.js`](../src/test/services/noSilentColumnDrop.test.js), which asserts both
  halves — no retry, **and** the credibility fields are still sent.
- ~~**Fulfillment saga exists twice**~~ ⚠️ **CHECKED 2026-08-02 — they were NOT in sync, and the
  drift was in the money path.** The JS copy is imported by nothing but its own unit test; the TS port
  inside `paymongo-webhook` is what settles money. So the suite was green about code that does not
  run. Two divergences, both in the live copy only: **no retry cap** (a failing supplier re-attempted
  on every webhook redelivery, forever), and **an ignored `supplier_orders` lookup error** that made
  it place a **second supplier order** for a transaction that already had one — defeating the
  `transaction_id UNIQUE` key and the whole idempotency design, which exists *because* PayMongo
  retries webhooks.

  Both fixed; 🔴 **inert until `supabase functions deploy paymongo-webhook` is run.** Pinned by
  [`fulfillmentSagaParity.test.js`](../src/test/services/fulfillmentSagaParity.test.js), which asserts
  the invariants that already drifted are present in both copies. *"Kept in sync by hand" is not a
  mechanism, it is a hope.*

  **Still open:** unifying them properly needs a Deno test against the real edge function; the parity
  test is a stopgap that compares source, not behaviour.
- ~~**Error handling is three systems, none on**~~ ✅ **the premise was false, confirmed 2026-08-01.**
  `ErrorBoundary` **is** mounted in `App.vue` and uses `errorStore` in full — notifications,
  `handleApiError`, `showError/showWarning/showInfo`. The `main.js` monkeypatches were removed on
  2026-07-29. All that survived were two `// Temporarily disabled` comments in `App.vue` referring to
  a *local* `useErrorStore()` const that nothing needed; they are deleted.

  This row asserted a system was off for weeks while it was on — the doc-side twin of everything else
  on this page.

  ✅ **The swallow/throw half is CLOSED 2026-08-02**, and closed by *scanning* rather than by waiting
  for the next bug report: every `catch` and `if (error)` in `src/services` was enumerated — **40
  candidates** — and triaged one at a time. Seven were fixed; the rest degrade an **optional section**
  that is simply absent when it fails, which is a different thing from making a claim about the user.

  **The sharpest was not on any list.** `settingsService.getAllSettings` returned `{}` on a failed
  read, and `SystemConfigView` binds it straight into editable inputs — so a database problem rendered
  as **platform fee 0%, minimum KYC level to trade 0, both project fees ₱0**, next to an enabled Save
  button. `saveKyc()` writes `Number(minKyc.value)`, so one click turns off the KYC gate on trading
  and records it as a deliberate admin decision. That view **already** builds a *"Could not load…
  Do not save those sections until this resolves"* banner from a rejected `Promise.allSettled`, and
  carries a comment explaining exactly why — it had simply never been reachable.

  > **The fifth view in one week whose error handling was written and could never run** (after
  > BuyerDashboardView, RetireView, WalletView and the three on 07-31). The pattern is stable enough
  > to be a rule now: **when a view handles a rejection, check that its service can produce one.** A
  > handler is evidence of intent, not of behaviour.

  Second sharpest: `findDuplicateEvidence` degraded to `[]`, and `[]` there is not neutral — it is
  the input that *suppresses* the duplicate-file alert on the verifier's evidence panel. A failed
  fraud check rendered as a passed one, on the screen where credits are approved. It throws now, and
  the component counts and reports the failures.

  Pinned by [`swallowedReadErrors.test.js`](../src/test/services/swallowedReadErrors.test.js), which
  asserts **rejection rather than shape** — a `[]` is indistinguishable from a real empty result,
  which is the whole defect — plus a non-vacuity case that a successful read still resolves.
  Mutation-checked: restoring the two original `return {}` / `return []` turned exactly three tests
  red.

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

> ## 🔴 2026-08-04 — the overstatement was not merely theoretical, and it POISONED this decision
>
> The two signature implementations had **drifted, in the opposite direction to the fulfillment
> saga.** The live edge function rejects a signature whose `t` is more than **300 seconds** from now.
> `PayMongoProvider.verifyWebhookSignature` **checked the timestamp not at all** — it read `t`, used
> it to rebuild the signed message, and never compared it to the clock. A genuine signature stays
> genuine forever if nothing looks at its age, so a webhook captured once (a proxy log, a leaked
> request dump) would verify **indefinitely**.
>
> **The suite proved it while claiming the opposite.** All five signature tests signed with
> `t = '1700000000'` — **14 November 2023** — and passed. They were not simulating a replay; they
> were performing one, and the implementation accepted it.
>
> **Why this changes the decision rather than just adding a bug.** The choice below is *route the
> money path through this layer, or delete it*. Option (a) was not neutral: adopting this provider as
> it stood would have **silently removed replay protection from the money path**, and all ~40 tests —
> including the five for exactly this function — would have stayed green throughout. *A decision
> cannot be made honestly against a copy that is quietly weaker than the thing it would replace.*
>
> **Fixed rather than left to rot**, precisely because the decision is still open: the provider now
> enforces the same 300s window, with an injectable clock so the boundary is testable. Signature
> tests **5 → 11** (both directions of the window, its exact edges, a non-finite `t`, `li`-over-`te`
> precedence, and a case proving the injectable clock is not itself a bypass).
>
> Pinned by [`webhookSignatureParity.test.js`](../src/test/services/webhookSignatureParity.test.js)
> (8 tests), which asserts the **live** copy still carries every guard and that the two tolerance
> constants are the same number. Mutation-checked in four directions: removing the provider's replay
> check turns 4 red, widening its tolerance turns 1 red, disabling the live window turns 2 red, and
> defaulting `ALLOW_UNSIGNED_WEBHOOKS` to `true` turns 1 red.
>
> ⚠️ **It still cannot prove the two behave identically** — only a Deno test against the real
> function could. It pins the invariants that have *already* drifted. **Two copies have now drifted
> twice, in opposite directions**, which is the strongest argument yet for resolving this entry in
> either direction rather than leaving two implementations to be "kept in sync by hand". That is a
> hope, not a mechanism.

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

### 26. Farmers are not paid through the platform — payment is an honour-system flag ✅ DECIDED 2026-07-28 · FOLLOW-UPS BUILT 2026-07-29

> **✅ All three follow-ups the decision made load-bearing are now closed**, in
> `20260729000100_feedstock_payment_record.sql` and the code around it. The decision itself is
> unchanged — Carbonify is an introduction-and-records layer for feedstock, not the payment rail.
>
> **1. The record is two-sided.** `farmer_deliveries` gains `farmer_payment_ack`
> (`pending` / `confirmed` / `disputed`), written only by the farmer through
> `acknowledge_farmer_delivery_payment`. The farmer portal no longer renders the buyer's assertion as
> settled fact: the badge reads **"buyer says paid"** in amber until the farmer answers, and only a
> farmer-confirmed payment gets the settled green. The "Paid to date" card is now **"Recorded as
> paid"** and says how many of those the farmer has not yet agreed to.
>
> **The dispute path deliberately covers BOTH failure modes**, and the second is the one the product
> could not express at all: "you said you paid me and you did not", *and* "you confirmed my delivery
> and never claimed to have paid". The second is the more common real-world case.
>
> **2. The ToS and the modal moved in lockstep.** POLICY_AND_USER_AGREEMENT **§1.14** and **§6 of the
> in-app modal** (`src/App.vue`) now state the position in the same words: Carbonify does not hold,
> transfer or guarantee feedstock payment; a "Paid" marker is the buyer's statement; escrow/refund/
> payout under §1.5–§1.6 are **credit-side only**. §1.5 carries a pointer so a farmer reading about
> escrow is not left assuming it covers them. The §7 pairing register records it as closed.
>
> **3. #29 has an escalation point** — see that entry.
>
> **The structural-impossibility finding was resolved WITHOUT widening the credit dispute schema.**
> `disputes.transaction_id` is still `not null references credit_transactions(id)`, untouched. Putting
> a physical-goods disagreement into the same table as credit chargeback handling would have coupled
> the feedstock path to the money path this decision exists to keep it out of. The disagreement is
> recorded where it happens — on the delivery — and escalates through notifications and
> `/admin/feedstock` instead.
>
> **One behaviour worth knowing:** `mark_farmer_delivery_paid` was re-created to reset
> `farmer_payment_ack` to `pending`. It only ever fires when the delivery was unpaid, so in practice it
> matters in exactly one case — staff reversed a false "Paid" and the buyer has now genuinely paid. The
> farmer's earlier dispute must not silently carry over onto a new assertion.
>
> **Still true, and still the pilot briefing point:** Carbonify does not hold or transfer farmer money.
> Farmer UAT (FARM-04) tests a record, not a payment. What changed is that the record is now honest
> about whose statement it is, and a farmer who is not paid has somewhere to go.
>
> ✅ **Applied to live 2026-07-29**, alongside the escrow migration; `reconcile_financials()` = 0
> afterwards, as it must be — nothing here is a ledger movement. **Click-through still pending.**

*Original decision record below.*

---

### 26 (decision, 2026-07-28). Farmers are not paid through the platform 🟠

> **Decision (2026-07-28): Carbonify is an introduction-and-records layer for feedstock, not the
> payment rail.** Buyers and farmers settle directly — cash, GCash, bank transfer — and Carbonify
> records that they say they did. This ratifies the current implementation rather than changing it;
> the alternative (platform-held funds, farmer payouts, smallholder KYC/KYB, a feedstock dispute
> mechanism) is a phase of work, not a ticket, and it would be the **third** concurrent rewrite of the
> settlement area alongside the staged escrow migration and org-accounts Phase 2.
>
> **The long-term ambition is left open.** This settles what Carbonify *is* today so the product can
> stop implying otherwise; it does not rule out becoming the payment rail later. If that changes, the
> work below is what it costs.
>
> **No code changed with this decision** — deliberately. The three things the decision now *requires*
> are listed below and are not done:
>
> 1. **The UI still presents a one-sided assertion as settled fact.** `mark_farmer_delivery_paid` is
>    buyer-only and the farmer's notification reads *"The buyer marked your delivery as paid."* The
>    farmer cannot acknowledge or contest it. Under this decision the record should be **two-sided** —
>    the buyer asserts, the farmer confirms or disputes — because the record is now the *entire*
>    product on this path.
> 2. **The ToS + the in-app policy modal must say so plainly**, and they move in **lockstep**
>    (`docs/README.md`, POLICY_AND_USER_AGREEMENT §7) — one of the pair is `src/App.vue`, i.e. code.
>    Deferred here rather than done by halves; doing one without the other re-creates exactly the drift
>    the doc set warns about. **This is the highest-priority follow-up**, because "Paid" rendering as a
>    settled fact is the part that can mislead a real farmer during the pilot.
> 3. **#29 still has no escalation point.** Under this decision the admin does not need a payments
>    console, but does need a **read-only feedstock view** and a way to record an off-platform
>    resolution — otherwise "contact support" resolves to nobody.
>
> **Newly established while taking this decision:** a farmer non-payment dispute is not merely absent
> from the sidebar, it is **structurally impossible** — `disputes.transaction_id` is
> `not null references credit_transactions(id)`, and a feedstock delivery has no `credit_transactions`
> row. Any dispute path for deliveries needs a schema change, under either answer.
>
> **Pilot implication:** farmer UAT (FARM-04 "Track payment") tests a bookkeeping flag, not a payment.
> Brief pilot farmers that Carbonify does not hold or transfer their money.

*Original entry below.*

---

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

> ### 📐 Scoped 2026-08-01 — measured, and deliberately NOT started
>
> **The size, counted rather than guessed:** ~**375** visible strings and placeholders across the
> farmer + LGU surfaces. The heaviest files are `LguDashboardView` (46), `FarmerPortalView` (44),
> `UserPreferencesView` (35), `ProjectForm` (34), `UserManagement` (29), `ProfileView` (28),
> `RoleApplicationView` (26), `BiomassRfqsView` (23), `RoleApplications` (23), `AdminFeedstockView`
> (21), `MrvDashboardView` (20), `BiomassSellView` (18), `BuyerDashboardView` (16). No i18n library is
> installed and there is no locales directory.
>
> **Why nothing was built.** The blocker is not the library, the extraction or the plumbing — those
> are a day. It is the **translation content**, and it is the same class of problem as the farmer
> training material already routed to the owner in
> [OPEN_WORK_REGISTER §2d](OPEN_WORK_REGISTER.md): it needs domain knowledge, not a component.
>
> Filipino renderings of *escrow*, *retirement*, *verified emission reduction*, *feedstock*,
> *offtake*, *jurisdiction* and *dispute* are terminology decisions with legal weight on a platform
> where a smallholder contests a payment. Machine-translating them would produce text that looks
> finished and misleads exactly the users #27 exists to protect.
>
> **And a half-done i18n layer is worse than none here.** Wrapping 375 strings in `t()` with English
> values would add a large diff, change nothing a user sees, and register as progress — the placebo
> pattern removed from this codebase on 2026-07-31 (accessibility toggles) and 2026-08-01 (`.dark`,
> `.loaded`, `.webp`). A partially-translated UI is also its own defect: a farmer reading a Filipino
> dispute form whose buttons and error messages stay English is worse served than one reading
> consistent English.
>
> **What is actually needed, in order:**
> 1. **Owner decision:** commission Filipino translations, or accept English-only for the pilot and
>    say so in the pilot brief. This is the gate.
> 2. Then: install `vue-i18n`, extract the farmer + LGU surfaces first, and ship a locale only when
>    its coverage of those surfaces is **complete** — never partially.
> 3. `preferencesStore.setLanguage` already persists a choice and `availableLanguages` is correctly
>    down to English only, so the selector will not advertise a locale that does not exist.

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

### 29. The feedstock side of the marketplace has no admin at all ✅ CLOSED 2026-07-29

> **Closed to the scope the #26 decision set:** a **read-only** oversight console plus one write — a
> way to record an off-platform resolution. No payments console was built, because Carbonify holds no
> feedstock money to move.
>
> **[`/admin/feedstock`](../src/views/AdminFeedstockView.vue)** shows every delivery with both
> parties' names, the delivered quantity and value, and the payment record as **one state read from
> both sides** — `Disputed by farmer` · `Reopened after resolution` · `Buyer claims paid` ·
> `Confirmed, unpaid` · `Both parties agree` · `Resolved by staff`. Open disputes sort to the top
> regardless of the active filter, and the farmer's own words appear inline: an admin should not have
> to open a modal to read the substance of a complaint.
>
> `resolve_farmer_delivery_payment` records what staff established. **`unpaid_confirmed` reverses a
> buyer's false "Paid"** — clearing `paid_at` and returning the delivery to unpaid — which is the whole
> reason the escalation point had to exist. A resolution **must** carry a note; without it the row says
> a decision was taken and nothing about what was found. Both parties are notified, not just the one
> who raised it.
>
> **Two implementation notes worth carrying:**
>
> - **Counterparty names come through a `SECURITY DEFINER` RPC, not a client-side `profiles` join.**
>   RLS already lets an admin `SELECT` `farmer_deliveries` directly, but the names live in `profiles`,
>   whose SELECT is deliberately hardened (`20260703000300` — see #3's warning). `admin_feedstock_deliveries`
>   is shaped exactly like `admin_recent_transactions` for that reason. Getting a name onto a screen is
>   never a reason to widen profile visibility.
> - **The reads throw; they do not return `[]`.** An empty feedstock queue reads as "no farmer is owed
>   anything", which is precisely the wrong thing to tell an administrator investigating whether one
>   is. Same bug class as the 2026-07-26 role review.
>
> ✅ **Applied to live 2026-07-29** — the console's two RPCs are live. Click-through still pending.

*Original entry below.*

---

### 29 (original). The feedstock side of the marketplace has no admin at all 🟠

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

### 30. Exported functions referenced nowhere 🟢 — now MEASURABLE (2026-08-01)

> **The count is no longer a guess.** This entry carried "~100", then "~61 remaining", and nobody
> could re-derive either. [`scripts/analysis/find-dead-exports.mjs`](../scripts/analysis/find-dead-exports.mjs)
> re-derives it on demand: **63 candidates** as of 2026-08-01.
>
> It is deliberately conservative — a name mentioned in a comment counts as used — because the
> previous pass computed line ranges, corrupted two files and needed a restore from backup. It also
> cannot see the `AdvancedSearch.vue` trap, where a `vite.config.js` manualChunks entry made a dead
> component look referenced. **Treat the output as candidates, verify each, delete with exact-string
> edits.**
>
> Removed 2026-08-01 after hand-verification: nine `analytics.js` convenience wrappers (`main.js`
> uses the singleton directly, so they made the app look instrumented in nine places when it is
> instrumented in one) and `getUserPurchaseHistory`.

### 30 (original). ~100 exported functions are referenced nowhere 🟢 (first pass done 2026-07-26)

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

---

## From the 2026-08-01 consent-gate fix

### 32. The DEV mock-session login is a hand-maintained list that silently breaks RLS features 🟡

**What it is.** [`LoginForm.handleSubmit`](../src/components/auth/LoginForm.vue) assigns
`testAccount.mockSession` straight into the Pinia store when `import.meta.env.DEV` and the email
matches one of the four `*@carbonify.test` accounts. Those users **do not exist in Supabase auth** —
the session is fabricated, `access_token: 'admin-test-token'`. The Supabase client never receives it,
so every PostgREST request still goes out as `anon` with `auth.uid()` null while the app behaves as
though a specific user is signed in.

**Why it is here and not fixed.** It is load-bearing: it is how roles get exercised on localhost
without maintaining six real accounts, and removing it is a workflow decision, not a defect fix.

**What it costs.** Any feature gated on RLS misbehaves under it, and misbehaves *quietly*, because a
filtered `SELECT` returns `200 []` with `error: null` — indistinguishable from "no such row". This
cost a full diagnostic session on the policy consent gate: the gate asked at every sign-in and
recorded nothing, and the evidence pointed at the migration, then at RLS, then at the deploy, before
it pointed at the login. The symptom is **localhost-only**, which reads as "works in production".

**The narrower sub-item, and the one that will bite next.**
[`userStore.js`](../src/store/userStore.js) hard-codes the four mock uuids in a literal array to
decide `isTestAccount`. [`profileService.js`](../src/services/profileService.js) and
[`notificationService.js`](../src/services/notificationService.js) each derive the same set a third
way, from `TEST_ACCOUNTS` itself. Add a fifth test account and the literal array is the one that goes
stale — and it fails by treating a mock account as real, which is the direction that produces
confusing bugs rather than obvious ones.

**How to close.** Either (a) seed the six roles as **real** Supabase users (`setup-test-accounts.js`
already exists for this and has never been run against the live project — its emails do not
authenticate) and delete the mock path entirely, which makes localhost behave like production; or
(b) keep it, but derive every "is this a mock?" check from one exported predicate in
`testAccounts.js`, and have services that depend on `auth.uid()` verify identity against
`supabase.auth.getSession()` rather than trusting the store — as
[`policyService.authenticatedUserId()`](../src/services/policyService.js) now does.

**(a) is the better answer.** Every workaround the mock path needs is a place where localhost and
production diverge, and each one hides a class of bug until it reaches a real user.

---

### 35. The cart survives sign-out, so a shared device hands it to the next person ✅ CLOSED 2026-08-04
**Found 2026-08-02**, while making the cart testable for the first time (`localStorage` in unit tests
had been a no-op that stored nothing, so nothing about persistence could be asserted).

> ## ✅ Closed 2026-08-04 — and the decision this entry was waiting on was not needed
>
> The cart is now keyed by account: `ecolink_cart::<user id>`, with `ecolink_cart::guest` for
> signed-out browsing. A basket built under account A stays under A's key and is invisible to B.
>
> **The blocker below was real but avoidable.** This entry frames the fix as a product decision
> because option (a) punishes the single-user case — sign out mid-basket on your own laptop and lose
> your work. That cost belongs to option (a) alone. Option (b) never had it, and the reason it looked
> like it might is that the **guest bucket** was not part of either option as written: browsing
> signed-out and *then* signing in to pay is a normal and important flow, and namespacing naively
> would break it. Handled explicitly — the guest cart **merges forward** into the account at sign-in
> (quantities take the larger of the two, not the sum: one intent to buy, not two) and the guest
> bucket is then emptied so the next signed-out visitor does not inherit it either. Nothing is
> discarded, and nobody inherits anybody.
>
> The legacy `ecolink_cart` key is **dropped, not migrated**. Its contents belong to whoever last
> used the device, so adopting them for the next person to sign in would reproduce this exact defect
> once, at deploy. The cost is a cart open at deploy time being lost — device-local, public listing
> data, rebuilt in two clicks.
>
> **Third consecutive entry where a named decision turned out to be a false blocker** (#24: neither
> an afternoon nor a schema; #32: ask GoTrue instead of choosing). *An entry that offers two options
> is offering two proposed routes to an outcome, not an exhaustive list of them.*
>
> Pinned by [`cartAccountScoping.test.js`](../src/test/store/cartAccountScoping.test.js) (10 tests,
> mutation-checked — collapsing the key back to one bucket turns four red). The assertion in
> `cartPersistence.test.js` that the cart key survives `clearLocalStorage()` **stays and is still
> correct**: that function's job is auth state, and a basket is not auth state.
>
> ⚠️ **A second cart defect was found while doing this, and it was the more serious one** — the
> `CART_*` checkout-coordination keys named in option (a) were never cleared on abandonment, so the
> next successful payment of any kind removed an unpaid item from the basket and reported it as
> purchased. See HANDOFF 2026-08-04. That one was nowhere in this entry.

`userStore.clearLocalStorage()` deliberately removes **only** keys matching `isAuthStorageKey`
(`sb-*`, `supabase.*`). The cart lives under `ecolink_cart` and therefore survives. **That is the
correct fix for the older, worse bug** — `performLogout()` used to call `localStorage.clear()`
outright, wiping the user's theme, language, accessibility settings and sidebar width every time they
signed out. Signing out should discard the session, not the application.

The consequence nobody chose: on a **shared device** — a co-op office, an LGU desk, an internet café,
all realistic for this platform — user A leaves credits in the basket, signs out, and user B signs in
to find them there.

**Severity, stated honestly: low.** The stored items are public listing data (title, price,
availability) with no payment detail, and checkout is authorised server-side against the signed-in
buyer, so B cannot buy anything as A. It is a privacy wrinkle and a confusing-UX bug, not a money
defect.

**Why it is here rather than fixed:** "clear the cart on sign-out" is a product decision with a real
cost on the other side — a buyer who signs out mid-basket on their own laptop loses their work, which
is the same class of complaint the `localStorage.clear()` fix existed to stop. The two candidate
answers are (a) clear `ecolink_cart` plus the two `CART_*` checkout-coordination keys on sign-out, or
(b) namespace the cart per user id and load only the signed-in user's. **(b) is better** and is
roughly an afternoon: it fixes the shared-device case without punishing the single-user case.

Current behaviour is pinned by
[`cartPersistence.test.js`](../src/test/store/cartPersistence.test.js) so that it stays a decision
rather than drifting back into an accident.

---

### 36. Any signed-in user can write a notification into anyone else's bell 🟠 — CONFIRMED, fix staged
**Found 2026-08-02**, while verifying whether the dead `notify*` twins in
`notificationService` were safe to delete (#30). They were — but reading the trigger migration that
replaced them led here.

**The policy.** `20260326000100_create_system_notifications.sql`:

```sql
create policy "Authenticated can insert notifications"
  on public.system_notifications for insert
  to authenticated
  with check (auth.uid() is not null);
```

`with check (auth.uid() is not null)` is **"any logged-in user, for any recipient"**, not
"for yourself". `createNotificationsForUsers()` inserts client-side with a caller-supplied
`user_id`, `title`, `message`, `link` and `metadata`, so this is reachable from the browser
console with the public anon key and any account.

**What it buys an attacker.** A row in any chosen user's notification bell — including an admin's,
a verifier's or a seller's — with arbitrary text, rendered by the product's own trusted UI.
*"Payout on hold — reconfirm your bank details"* is the obvious one. It also makes the bell
worthless as an audit signal, because nothing distinguishes a system notification from a forged one.

⚠️ **The reach was worse until today.** `Header.vue` navigated with
`window.location.assign(notification.link)`, which accepts an **absolute URL** — so the forged
notification could point off-site. That half is **fixed 2026-08-02** by
[`safeInternalPath`](../src/utils/safeInternalPath.js): a link out of the app is no longer reachable
from a database row. That is defence in depth, not the fix.

**Severity, stated honestly.** Medium, now medium-low. It needs an authenticated account — and
signups are currently open with `mailer_autoconfirm`, so that is a low bar during the pilot. It does
**not** grant read access to anyone else's notifications (SELECT is `auth.uid() = user_id`), moves no
money, and escalates no privilege. It is a spoofing / social-engineering surface, and exactly the
kind of finding an independent pentest files.

**Why it is here and not fixed.** The fix is not a one-line policy tightening: `with check (auth.uid()
= user_id)` would immediately break every legitimate cross-user notification — the feedstock delivery
alerts, biomass quotes, price-drop alerts, admin escalations. Those are ~18 call sites, and they are
legitimate; the platform genuinely needs to notify people other than the caller.

**The route, and the pattern already exists in this repo.** The five notification **triggers** solve
exactly this problem the right way: a `SECURITY DEFINER` function that decides recipients server-side
via `resolve_notification_recipient_ids()`. So:

1. Add a `SECURITY DEFINER` RPC that takes a notification *intent* (an event, not a recipient list)
   and resolves recipients itself. Grant hygiene per [#12](#12-grant-hygiene-on-10-39-security-definer-rpcs--closed--applied-2026-08-02).
2. Move the cross-user call sites onto it.
3. Only then tighten the INSERT policy to `auth.uid() = user_id`, leaving the client able to write
   notifications to itself and nothing else.

Steps 1–2 are inert and safe to land ahead of 3, which is the one that closes the hole.

✅ **CONFIRMED ON LIVE 2026-08-02.** The owner ran the query below and it returned
`"Authenticated can insert notifications" : (auth.uid() IS NOT NULL)`. The entry is live as written.

### The fix, staged in three steps — steps 1 and 2 are landed

| Step | What | State |
|---|---|---|
| 1 | `20260802000300_notify_counterparty_rpc.sql` — a `SECURITY DEFINER` RPC that derives the recipient from the subject row | ⚠️ **owner applies.** Additive; changes no behaviour |
| 2 | All **ten** cross-user call sites ported onto it | ✅ landed, ships with the next frontend deploy |
| 3 | `20260802000400_tighten_notification_insert.sql` — `with check (auth.uid() = user_id)` | 🔴 **owner applies ONLY after step 2 is live** |

**The order is load-bearing and the failure mode is silent.** Every cross-user notification in the
client is wrapped in a non-fatal `try/catch`, so applying step 3 before the frontend deploy raises
nothing a user sees — a farmer simply stops being told their delivery was confirmed. That is this
project's signature defect shape, so it is written into both migration headers, and step 3 refuses to
run at all if step 1 is missing.

**What the RPC enforces:** the recipient is read from a `biomass_rfq` or `farmer_delivery` row the
caller is a party to — there is no "notify user X" entry point, so a stranger cannot be reached and
an admin can only be reached by escalation out of a real trade. It also refuses a `link` that is not
root-relative, so the open-redirect rule exists in the database and not only in the browser. Returns
0 rather than erroring for a non-party, so it is not an existence oracle.

**The three remaining direct client inserts are all self-addressed** — MRV reminders, saved-search
matches, watchlist price drops — which is what makes step 3 possible at all. Pinned by
[`notifyCounterparty.test.js`](../src/test/services/notifyCounterparty.test.js): a fourth service
calling the raw helpers fails the suite. Mutation-checked.

⚠️ **What this deliberately does NOT fix:** the message *text* is still composed by the client.
Between two parties already trading — who can write to each other through quote and delivery notes
anyway — that is a much smaller thing than reaching arbitrary users, but it is not nothing. The
honest end state is composing text server-side from an event vocabulary, the way the five `notify_*`
triggers do. That means editing functions that move money and state, on a database these migrations
cannot be tested against, days before a pilot. Not worth it now; recorded here instead.

<details><summary>The query that confirmed it</summary>

```sql
select polname, pg_get_expr(polwithcheck, polrelid) as with_check
from pg_policy
where polrelid = 'public.system_notifications'::regclass and polcmd = 'a';
```

It read `(auth.uid() IS NOT NULL)`.
</details>

---

### 37. The preferences page's Privacy and Notification sections are placebos 🟠
**Found 2026-08-04**, while sweeping `localStorage` keys for the device-vs-account defect that
closed #35. `privacy.allowAnalytics` was **fixed on the spot** (see below); the rest is recorded
here because it needs decisions and a schema, not a patch.

**The measurement.** Each of the six privacy controls appears in exactly **two** places in the whole
repo: `preferencesStore`'s defaults/reset, and `UserPreferencesView.vue`, which binds them to a
switch and writes them back. Nothing reads any of them. The same is true of the twelve notification
toggles — `notificationService` does not import `preferencesStore` at all.

> ### ⚠️ There are TWO live notification-preference surfaces, and they disagree
>
> This is the part that makes the entry worth more than its severity colour.
>
> | Surface | Stored | Scope | Consulted when anything is sent |
> |---|---|---|---|
> | `UserPreferencesView` — 12 toggles | `localStorage.preferences` | **per device** | ❌ never |
> | `ProfileView` → *Notifications* — 4 toggles | `profiles.notification_preferences` | per account | ❌ never |
>
> A user can set email notifications **off** on one page and **on** on the other; neither governs
> anything, and nothing reconciles them. `notification_preferences` returns **zero hits across the
> whole of `supabase/`** — no edge function and no trigger reads it — so the server-persisted set is
> just as inert as the device-local one.
>
> **The database-backed one is the more dangerous of the two**, precisely because it looks
> legitimate: it is per-account, it survives a device change, and it is a real column on `profiles`.
> Anyone auditing whether Carbonify honours notification preferences would find that column, see it
> populated with sensible values, and reasonably conclude the feature works. *A stored preference
> reads as an honoured preference* — the same illusion as `wallet_topup_user_id`, the guard that was
> written and never read (HANDOFF 2026-08-04), one layer up.
>
> A third surface, `emailService.getUserEmailPreferences` / `updateUserEmailPreferences`, is a pure
> stub — it ignores its `userId` and returns hard-coded values, and the update path returns
> `success: true` having saved nothing. It has **no callers** and is already filed under #30 as
> residue of the deleted `/email-settings` page. Delete it with that item; do not wire it up.

| Control | Read by | Effect of changing it |
|---|---|---|
| `privacy.allowAnalytics` | ✅ **now honoured** (2026-08-04) | Gates every `gtag` call **and** the GA script injection |
| `privacy.profileVisibility` | nothing | none |
| `privacy.showEmail` / `showPhone` | nothing | none |
| `privacy.allowCookies` | nothing | none |
| `privacy.dataSharing` | nothing | none |
| `notifications.email.*` (5) | nothing | none |
| `notifications.push.*` (4) | nothing | none |
| `notifications.inApp.*` (5) | nothing | none |
| `profiles.notification_preferences` (4, **server-side**) | nothing | none — 0 hits across `supabase/` |

**What was fixed and why only that one.** `allowAnalytics` is a *consent* control, and analytics
genuinely sends — `trackPurchase` forwards a transaction id, an amount and the user id to Google
Analytics. A consent switch that does nothing is the worst member of the placebo-control class this
repo keeps finding (the theme toggle that styled nothing, six languages with no i18n installed,
accessibility switches saved and never applied), because **the user's belief that they opted out is
itself the harm**. That was a defect with a contained fix, so it was fixed rather than filed.

**What is deferred, and why it is not a patch:**

1. **`profileVisibility` / `showEmail` / `showPhone` have no surface to govern yet.** `/profile` is
   self-only — it renders the signed-in user's own email and phone off their own session. There is
   no public profile page, so nothing is exposed today. But these controls promise to govern a
   disclosure that does not exist, and the day a public profile ships they will silently fail to
   take effect unless someone remembers. Honouring them properly means **server-side enforcement**
   (RLS on `profiles`), not a client check — a client-side "hide" on a column the API still returns
   is theatre.
2. **Notification preferences must be enforced where notifications are sent**, which is the edge
   functions and the DB triggers — not the browser. Half the work is already done and nobody
   noticed: `profiles.notification_preferences` exists, is per account, and is populated. What is
   missing is any *reader* at send time. **Decide which of the two surfaces survives first** —
   shipping enforcement against one while the other stays on screen makes the disagreement visible
   instead of merely latent.
3. **The `localStorage` set is stored per device, not per account** — the #35 defect again. Fixing
   that scoping is wasted work if (2) retires that surface in favour of the profile row, which is
   why it was not done in the same pass.
4. 🔴 **Whether analytics consent may default to ON is a compliance question, not an implementation
   choice.** `DEFAULT_ANALYTICS_CONSENT` is `true` today purely to match what the switch already
   showed users. Opt-out vs opt-in under the Philippine DPA belongs with the NPC/DPO track in
   YOUR_ACTION_ITEMS Step 6c. **Nobody on the build side should guess it.**

**The honest interim option, if the decision takes a while:** remove the controls that do nothing
from the UI, exactly as the seven fake languages and the dead theme toggle were removed. A missing
control is honest; a control that lies is not. That is a product call, hence here.

⚠️ **Severity is about trust, not exposure.** No data leaks today: GA is unconfigured
(`VITE_GA_TRACKING_ID` unset), there is no public profile, and the notification toggles only fail to
*suppress* mail that mostly still goes through `console.log` stubs. It is 🟠 because a pilot user
who opts out of analytics and data sharing has been told something untrue by the product, and
because this is the surface an NPC review or a pentest brief looks at first.

## From the 2026-08-02 cross-role UX pass

> **Update, same day — both of these were subsequently built.** The two gaps the scan named as
> mattering most now exist: the verifier's decision record (`MyDecisionsPanel`, a fourth tab on the
> verifier workbench, plus `getMyVerificationDecisions` / `summariseDecisions` and a CSV export) and
> the LGU's endorsement record (`getMyEndorsementHistory` / `summariseEndorsements`, its own tab
> beside Endorsements). Neither needed a migration — both read tables their role could already see,
> asked by actor instead of by subject. For analytics, **concentration** shipped
> (`computeConcentration` + the panel), and the fabricated placeholder data described below was
> removed. What remains open is listed at the end of each section.

Both were requests to *design a feature*, not to fix a defect, and both span every role — which is
why they were recorded here first rather than shipped thin.

### 1. A "history" surface for the roles that have none

**The scan.** Six roles, and what each can currently see of its own past:

| Role | Has | Missing |
|---|---|---|
| Buyer / general user | Receipts, Orders, Retire → Transaction History, Portfolio, Certificates, Reported problems | — |
| Project developer | Carbon asset ledger (incl. buyer history), Seller earnings, per-project verification timeline | No single "what happened to my projects" feed; the timeline is per project and only inside the review panel |
| Admin | Audit logs (`/admin/audit-logs`), role applications, refunds, AML screenings | — |
| Verifier | The verification timeline of whichever project is open | **No record of their own past decisions.** A verifier cannot answer "what did I validate last month", which is the first question an accreditation body asks |
| Farmer | Deliveries and RFQ quotes in the portal | No payment/earnings history separate from the delivery list |
| LGU | Emissions records they filed | **No endorsement history.** An endorsement is a credibility signal attached to a carbon project; the body that gave it cannot list what it has given |

**The two that matter** are the verifier's decision log and the LGU's endorsement log, for the same
reason: both roles put their name on something, and neither can enumerate what they have put their
name on. Both are reads over tables that already exist (`verification_timeline`, the endorsement
table from 20260722000500) filtered by actor — the work is a service function, a view, and a nav
entry each, not new schema.

**Do not** solve this with one generic "History" page per role. Five of the six already have
purpose-built records views and a sixth generic feed would be a seventh place to look.

**Built (2026-08-02).** Both. The verifier's is a "My Decisions" tab reading `audit_logs` filtered
to `user_id = me` and the five decision actions — the read policy from 20260722000300 already
allowed it; nobody had asked the table by actor. The LGU's reads `project_endorsements` filtered to
`lgu_user_id = me`, and surfaces `created_at` vs `updated_at` so a **reversed** endorsement is
visible rather than silently replaced. Both throw rather than returning `[]`, because "you have
decided nothing" is a claim about a professional's record and a failed read is not evidence for it.

**Still open:** the developer's cross-project feed and the farmer's payment history. Lower value —
neither role puts its name on a third party's document the way the two above do.

### 2. Making the subscription's analytics worth paying for

`/analytics` is gated behind the paid plan (`FeatureGate`), and what it shows today is a restatement
of the portfolio: totals owned, totals retired, a category split. A buyer can read all of that off
the portfolio page for free, which makes the gate feel like a paywall over their own data rather
than over insight.

What would change that, roughly in order of value per unit of work:

- **Price basis vs market, over time.** `computePortfolioPnl` already exists and
  `priceHistoryService` already records marks — the unrealized position is computed and then not
  charted.
- **Retirement pacing against a target.** The carbon calculator produces an offset target and hands
  it to the marketplace; nothing tracks progress against it afterwards.
- **Concentration risk.** How much of a portfolio sits in one project, one category, one developer.
  Cheap to compute, and the single most useful thing a disclosure reviewer asks.
- **Vintage ageing.** Which credits are getting old, which matters for what a buyer can claim.

None of this needs new tables. It needs the existing series to be charted rather than summed. Load
the `dataviz` skill before building any of it — the app has `chart.js` and two chart components
(`CategoryChart`, `PortfolioChart`) already, and a third style of chart would be the thing that makes
the page look assembled rather than designed.

**Built (2026-08-02): concentration**, as `computeConcentration` (pure, 11 tests) plus a panel —
largest-project share, top-3 share, project and category counts, HHI mapped to a plain-language
verdict, and a labelled horizontal bar per holding. Repeat purchases of one project are summed
before any share is taken; without that, five buys of the same project read as a diversified
portfolio, which is the failure mode the whole figure exists to catch.

⚠️ **A real defect was found and fixed while doing it.** `categoryChartData` was *seeded with
invented data* — five hard-coded category names at shares `[35, 25, 15, 15, 10]`. Those rendered as
a finished doughnut before any fetch resolved, and **stayed on screen if the load failed or the
account had never bought anything**. A buyer on a paid plan could be shown a confident breakdown of
a portfolio they do not own and export a disclosure decision from it. The chart now starts empty and
has an empty state. Worth a general rule: *placeholder data that is visually indistinguishable from
real data is worse than an empty state, and this codebase should not ship any more of it.*

The category palette was also re-picked while there. The old one included the same red used for
error/critical status elsewhere, so a "Waste Management" slice looked like a failed payment; the
replacement is the validated categorical order (worst adjacent CVD ΔE 9.1, normal-vision ΔE 19.6 on
white). Three slots fall under 3:1 contrast, so the chart carries a table view — which is also its
accessible view.

**Still open:** P&L vs market over time, retirement pacing against the calculator's target, and
vintage ageing. All three are the same shape as concentration — existing data, not yet charted.
