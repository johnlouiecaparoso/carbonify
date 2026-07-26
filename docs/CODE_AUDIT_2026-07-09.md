# Codebase Audit — 2026-07-09

> ## ✅ Actioned 2026-07-26 — do not re-derive this list
>
> The dead-code section below was **right**, and has now been swept. 32 files were deleted in
> `750ea37` plus `AdvancedSearch.vue` in the doc-reconciliation pass, and five unreachable routes went
> with them. Two of this audit's specific warnings proved important:
>
> - **`AdvancedSearch.vue` is pinned by `vite.config.js` manualChunks.** That pin was its *only*
>   reference anywhere in the repo, so an import-graph scan reports the file as used and misses it
>   entirely — which is exactly what happened on 2026-07-26 until this document was re-read. Component
>   and config line were removed together, as advised.
> - **`MobileTestView.vue` is not dead — it is a live route at `/mobile-test`,** public to anonymous
>   visitors. Deleted along with the route.
> - **`services/credits|payments|payouts` are imported only by tests.** Still true, still deliberate;
>   tracked as **#21** in [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) rather than deleted, because it is
>   an architecture decision.
>
> Names in the body that no longer exist (`adminService.js`, `authServiceSimple.js`,
> `sampleDataService.js`, `verifierService.js`, `UserDashboard.vue`, `UserProfile.vue`) were removed
> before this pass. The body is left as written — it is a dated record, and its value now is that it
> called all of this two and a half weeks early.


> Four parallel audits across dead code, the service layer, SQL/edge functions, and the Vue views.
> **Every finding below was re-verified by hand** before being written down; anything I could not
> substantiate with a concrete failing input is marked SPECULATIVE or dropped.
>
> Fixed items are ✅. Everything else is a recommendation with a proposed fix — **not applied**,
> because it touches the proven money path or needs a decision.

---

## ✅ Fixed in this pass

### 1. Charts never updated → Pro users saw permanently empty charts
`PortfolioChart.vue`, `CategoryChart.vue` built the Chart.js instance in `onMounted` from `props.data`
and had **no watcher**. Parents (`/analytics`) render charts unconditionally, *before* their async load
resolves. The chart mounted with empty data, the data arrived, and the chart was never told.

Fixed: `watch(() => [props.data, props.options], render, { deep: true })`, destroying the old instance
first. `deep` because parents mutate the same object rather than replace it.

### 2. The "silent" 15-second marketplace refresh was not silent
`MarketplaceViewEnhanced.vue` polled every 15s and the poll ran `loading.value = true` and
`listings.value = []` **at the top of every call**. Every 15 seconds the entire grid emptied to a
skeleton and repopulated — throwing away scroll position and anything the user was reading. A failed
poll also blanked the list.

Fixed: a background refresh now never touches `loading`, never clears the grid, and on error leaves the
last good data on screen. The two concepts tangled in one flag were separated:
`loadMarketplaceData(background, forceRefresh)`. **Post-purchase reloads now bust the cache** — they
previously re-rendered pre-purchase availability straight from cache.

### 3. Overlapping loads: the slower response won
The same loader is called from mount, the 15s timer, "Try Again", and purchase completion, with a 90s
timeout window. No guard. A manual refresh racing the timer could be overwritten by the *staler*
response. Fixed with a monotonic `loadSeq`; a load commits only if it is still the newest.

### 4. One unpriced listing reported the whole market as worthless
`getMarketplaceStats` (`marketplaceService.js:538`) summed `quantity * price_per_credit` with no guard.
`price_per_credit` is legitimately null on listings that inherit the project price. One null → the
reduce returns `NaN` → `NaN || 0` → **`0`**. The homepage and `/market` would show ₱0 total market
value. Fixed by guarding each term.

---

## 🔴 HIGH — recommended, NOT applied (touches the money path)

### H1. Retirement is not atomic: credits can be destroyed with no retirement record

`marketplaceService.js:894-921`.

```
1. rpc('retire_credits_atomic')   → permanently zeroes credit_ownership   [committed]
2. insert into credit_retirements → separate transaction                  [may fail]
```

If step 2 fails — RLS, the serial-number trigger, a dropped connection — **the credits are already
gone** and there is no retirement row, no certificate, and no compensating rollback. In a carbon
registry this is the worst possible failure: the units are burned, and the offset claim they were
burned for is unrecorded. The user is told "Failed to create retirement record" and has simply lost
them.

**Why I did not fix it unilaterally:** the correct fix is to move the `credit_retirements` insert
*inside* `retire_credits_atomic` so both commit or neither does. That rewrites a
SECURITY DEFINER function on the **proven money path** (`reconcile_financials()` = 0), and this
codebase has never been runtime-verified. Shipping that blind is how you turn a rare bug into a common
one.

**Proposed fix:** a new migration re-creating `retire_credits_atomic` to return the retirement row,
doing the decrement and the insert in one transaction; the service then stops inserting. Then re-run
**flow E** from the cutover runbook and confirm `reconcile_financials()` still returns 0 rows.

Say the word and I'll write it.

---

## 🟠 MEDIUM

### M1. `send-approval-email` is an authenticated arbitrary-email relay
`supabase/functions/send-approval-email/index.ts`. The anonymous open relay was closed
(`verify_jwt = true`), and `from` is pinned server-side. But the function still accepts caller-supplied
**`to`, `subject`, and `html`** with no admin check. **Any signed-in user can send arbitrary HTML email
from the Carbonify sender to any address.** That is a phishing primitive wearing your domain's
reputation.

**Fix:** resolve recipients server-side from the application/reviewer set; never trust `payload.to` or
`payload.html`. Gate on `is_admin()` where appropriate. Small edge-function change; worth doing before
the pentest, not after.

### M2. Wallet top-up double-credit is possible under concurrent webhook delivery
`paymongo-webhook/index.ts:388-447`. The marketplace branch is safe (`process_marketplace_purchase` is
internally idempotent). The `wallet_topup` branch guards with a read-then-check plus a best-effort
check-then-insert, then calls `update_wallet_balance_atomic` — which is atomic but **not idempotent**.
Two concurrent deliveries of the same event, both still at `received`, can both pass. PayMongo retries
are usually sequential, so exposure is limited. PLAUSIBLE, not proven.

**Fix:** a unique constraint on `wallet_transactions.external_reference` and an `on conflict do nothing`
insert, so the second delivery is a no-op at the database rather than in JavaScript.

### M3. Transaction history: a failed query is indistinguishable from "no purchases"
`transactionHistoryService.js:45-77`. When the `credit_transactions` query errors, the fallback block
queries `credit_purchases` and **does nothing with the result** (`// TODO: Implement proper fallback`).
The user is shown an empty purchase history — i.e. "you have no proof of purchase" — when the truth is
"the query failed." Same file, line 176: the certificates query destructures away its `error` entirely.

### M4. Receipts: an unsaved receipt is returned as if persisted
`receiptService.js:261-281`. On a non-duplicate insert error the code logs and returns the in-memory
receipt object. The caller treats it as saved. The user gets a receipt number that isn't in the
database, and the next call mints a **different** number for the same purchase.

### M5. Two different tables back "transaction history"
`creditOwnershipService` reads `credit_purchases`; `transactionHistoryService` reads
`credit_transactions`. Same feature, different sources. Also `creditOwnershipService.getUserTransactionHistory`
fetches `limit` purchases and `limit` retirements, merges, sorts, then slices to `limit` — so a heavy
trader's **retirements vanish entirely** from the combined view.

### M6. Grant hygiene: ~10 SECURITY DEFINER RPCs never revoked the default PUBLIC EXECUTE
Postgres grants EXECUTE to PUBLIC by default. `review_kyc_application`, `review_kyb_application`,
`open_dispute`, `resolve_dispute`, `generate_credit_serial`, the three biomass RPCs, and others grant to
`authenticated` **without** first revoking from `public, anon`.

**Not directly exploitable** — each self-gates internally (`is_admin()`, `auth.uid()` checks), and an
anon caller has `auth.uid() = null` and fails. But it is inconsistent with the financial RPCs, which all
do `revoke ... from public, anon` first, and it means security rests entirely on those internal checks
never regressing. Worth a one-migration cleanup.

---

## 🟡 Dead code — 30 verified-unreachable files

Zero imports, not in the router, not a test fixture. Includes:
`services/adminService.js`, `analyticsService.js`, `authServiceSimple.js` (mock auth with a
`demo@carbonify.io / demo123` login), `databaseService.js`, `fallbackMarketplaceService.js`,
`marketplaceListingService.js`, `sampleDataService.js`, `simpleMarketplaceService.js`, `tableService.js`,
`verifierService.js`; `components/PaymentModal.vue`, `auth/EnhancedLoginForm.vue`,
`auth/EnhancedRegisterForm.vue`, `dev/TestAccountVerifier.vue`, `layout/Navbar.vue`, `layout/Sidebar.vue`,
`mobile/MobileCard.vue`, `tables/RecordCreateForm.vue`, `tables/RecordDetailView.vue`,
`ui/ConnectionIndicator.vue`, `ui/ProgressBar.vue`, `ui/Tooltip.vue`, `user/UserDashboard.vue`,
`user/UserProfile.vue`; `config/environment.js`, `config/production.js`; `utils/debugPermissions.js`,
`utils/logger.js`, `utils/performance.js`.

Notes before deleting:
- `components/search/AdvancedSearch.vue` is dead **but pinned by `vite.config.js` manualChunks** — remove
  the config line in the same commit or the build breaks.
- `MobileTestView.vue` is **not** dead: it is a live route at `/mobile-test`. A debug view exposed in
  production routing — worth removing from the router.
- `services/credits/`, `services/payments/`, `services/payouts/` are imported **only by unit tests**. The
  live path is `realPaymentService`/`paymongoService`. These are the provider abstractions from Phase 1–2;
  decide whether they are abandoned or pending wiring before deleting.
- `vue-chartjs` is in `package.json` and imported nowhere.

I did not delete any of this. Dead code is harmless; deleting the wrong file is not. It wants its own
commit, with the build as the check.

---

## 🟢 Lower priority

- **`peso()` is defined 11 times**, `shortDate()` 8 times, `formatCurrency()` 6 times, `round2()` 9 times.
  Two competing currency conventions (`peso` vs `formatCurrency`) mean inconsistent formatting across the
  app. One `src/utils/format.js` would fix it.
- **26 hand-rolled modal overlays** bypass the existing `AccessibleModal.vue` (which has a focus trap,
  Escape, and `role="dialog"`). Keyboard users cannot Escape a payment modal.
- **Largest files:** `ProjectForm.vue` (2938 lines), `Header.vue` (2522), `MarketplaceViewEnhanced.vue`
  (2339), `ProfileView.vue` (2127). Two of this pass's bugs lived in the third file — that is not a
  coincidence.
- `checkExistingListing` treats "more than one active listing" as "none" (`.single()` error path),
  which can green-light a duplicate listing.

---

## Verified clean (checked, no defect found)

- **Every SECURITY DEFINER function sets `search_path = public`.** ~40 of them. No exceptions.
- `ledger_entries` is append-only (trigger-enforced), balanced-entry constrained, RLS deny-all.
  `payment_intents` / `escrow_holds` / `payout_requests` are read-own, server-write-only.
- `paymongo-webhook` does HMAC-SHA256 with a replay window, constant-time compare, and **fails closed**
  when the secret is unset unless `ALLOW_UNSIGNED_WEBHOOKS=true`.
- `paymongo-checkout` derives identity from the **verified JWT** and recomputes the amount server-side;
  the client `user_id` is ignored.
- `retireCredits` passes a client `userId`, but the RPC binds identity to `auth.uid()` and ignores it —
  **not exploitable**.
- `investorAnalytics` IRR/NPV/payback: division-by-zero and sign-change guards are correct.
- `confirm_farmer_delivery` and `assign_user_role` have **no ambiguous overloads** — the 3-arg version was
  explicitly dropped.
- `profiles` column-privilege drift: no columns were added after the hardening migration, so nothing
  silently lost its UPDATE grant. (The pattern stays fragile — any *future* profiles column will.)
- Leaflet maps, Chart.js instances, the Header's poll timer and realtime channel are all torn down in
  `onBeforeUnmount`/`onUnmounted`.
- `ModernPrompt`'s `v-html` escapes its input first. The only other `v-html` renders a Supabase-generated
  TOTP QR SVG (trusted source).

### One UNCERTAIN, and it matters

No migration in `supabase/migrations` enables RLS or defines a policy on **`credit_ownership`,
`credit_transactions`, `wallet_accounts`, `wallet_transactions`, or `credit_listings`.** These predate the
tracked migrations and live in the base schema. If any of them has RLS off, or a `using(true)` policy, a
client could forge credit ownership directly.

**Check this in the SQL editor. It is one query:**

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('credit_ownership','credit_transactions','wallet_accounts',
                    'wallet_transactions','credit_listings','profiles','projects');
```

Every row must show `rowsecurity = true`. Then list the policies:

```sql
select tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('credit_ownership','credit_transactions','wallet_accounts',
                    'wallet_transactions','credit_listings');
```

Anything with `qual = true` on INSERT/UPDATE is a hole.
