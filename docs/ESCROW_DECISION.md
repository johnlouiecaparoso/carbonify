# Decision Note — Escrow / Chargeback Hold Window

> **Status:** ✅ **DECIDED 2026-07-25 — Option B (method-gated hold).** Implementation written and
> **staged** as migration `20260725000200_restore_escrow_hold_window.sql`; **apply during the test-key
> pilot pre-flight**, not before (it rewrites the live settlement RPC — see §6 for the verification steps).
> Tracked as [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) #14 and in the
> [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) go/no-go gate.
>
> **Decision:** Option B · **Target:** apply during pilot, before live-keys cutover · **Last updated:** 2026-07-25

---

## 1. The decision in one sentence

Do we pay sellers **immediately** on purchase (current live behaviour), or do we
**hold seller proceeds for a window** so a fraudulent card purchase can be clawed
back before the money leaves the platform? Pick one and make the code match it.

## 2. Why this is open (what the code actually does today)

Escrow was **built, then silently reverted.**

- `20260606000600_escrow_and_seller_balance.sql` routed each seller's net into an
  `escrow_holds` row (status `held`, `hold_until = now() + 7 days`) and an
  `escrow_held` ledger account. Funds became withdrawable only when
  `release_escrow()` moved `escrow_held → seller_payable:<id>`.
- **Every later** `create or replace function process_marketplace_purchase`
  (`20260615000200`, `20260702000000`, `20260703000500`) credits
  `seller_payable:<id>` **directly** and never inserts an `escrow_holds` row.
  `grep escrow_holds supabase/migrations` confirms **no writer after
  `20260606000600`** — the table, `release_escrow()`, and the `held` column of
  `get_my_seller_balance()` are dead for card purchases.

**Net effect:** a seller is withdrawable the instant a purchase settles, with **no
dispute / chargeback hold.**

## 3. Why it matters — the fraud path

On the **card rail**, settlement is not final. A cardholder (or the issuer) can
raise a **chargeback** days-to-weeks after the fact, and PayMongo debits it back
from the platform. The exposure:

> list a credit → self-buy (or buy via a mule) with a **stolen card** → withdraw
> the proceeds before the chargeback lands → chargeback hits → **the platform eats
> the loss**, because the money already left.

This is low-risk on GCash/Maya/wallet (push payments, effectively irreversible) and
**high-risk on cards**. It is also latent, not theoretical: the moment live card
keys are on, the withdraw path is a cash-out valve with no brake.

## 4. The options

### Option A — Instant payout by design (accept the risk, document it)
Keep today's behaviour; formally decide it's acceptable and remove the dead escrow
machinery so no one mistakes it for active protection.

- **Do:** delete/retire `escrow_holds` + `release_escrow()` + the `held` branch of
  `get_my_seller_balance()`; drop the `escrow_held` ledger account from docs; state
  the accepted risk in the ToS and the go-live gate.
- **Pros:** simplest; best seller experience; zero new moving parts.
- **Cons:** full chargeback loss lands on the platform; only tenable if card
  purchases are disabled, capped, or the platform can absorb/insure the fraud.
- **Fits if:** launch is GCash/Maya/wallet-only, or card volume is tiny and capped.

### Option B — Restore a time-based hold window  ✅ recommended
Re-institute the `20260606000600` model: seller net goes to `escrow_held` on
purchase and is released to `seller_payable` after a hold window, gated by
payment method.

- **Do:** in the current `process_marketplace_purchase`, re-add the `escrow_holds`
  insert + the `escrow_held` credit leg (instead of crediting `seller_payable`
  directly); schedule release via `release_escrow()` once `hold_until` passes and
  no dispute is open; surface `held` vs `available` in the seller UI
  (`get_my_seller_balance()` already returns both).
- **Hold window:** **card = 7 days** (align to PayMongo's dispute window; make it a
  config value in `app_settings`, not a hardcoded `v_hold_days`); **wallet/GCash/
  Maya = 0** (release immediately — those rails don't charge back).
- **Pros:** closes the fraud path; the machinery already exists and was proven to
  balance/reconcile; per-method windows keep push-payment sellers fast.
- **Cons:** sellers wait for card proceeds; adds a release job + a dispute check;
  refund/dispute must reverse `escrow_held` (not `seller_payable`) while held.
- **Fits if:** cards are a launch payment method (the expected case).

### Option C — Release only on confirmed external settlement (strongest)
Don't release on a timer at all — release when PayMongo's **settlement report**
confirms the funds actually cleared to the platform, reconciled by the existing
`paymongo-reconcile` function.

- **Pros:** strongest guarantee (never pay out money you haven't received);
  folds into external reconciliation (backlog P4).
- **Cons:** most work; depends on settlement-report cadence; still want a
  dispute-hold on top, since settlement ≠ chargeback-immunity.
- **Fits if:** scaling card volume and P4 external reconciliation is being built anyway.

## 5. Recommendation — ✅ ADOPTED (Option B, 2026-07-25)

**Option B for launch**, with the window in `app_settings` and **method-gated**
(cards held ~7d, push payments released immediately), then **evolve toward C** as
part of external settlement reconciliation (P4).

Rationale: B closes the only live fraud path that real card money opens, reuses
machinery that already exists and reconciled to zero, and doesn't punish the
GCash/Maya sellers who make up most PH volume. A is only safe if cards are off or
trivially capped; C is the right end-state but shouldn't gate the first live keys.

**Implemented in `20260725000200_restore_escrow_hold_window.sql` (staged — apply
during the pilot).** The migration reuses the escrow machinery already present:
`escrow_holds` + `release_escrow()` (`20260606000600`), the held-aware
`refund_purchase()` (`20260606000900`), and the `held`/`available` split already
returned by `get_my_seller_balance()`. It adds only (a) the escrow branch in
`process_marketplace_purchase`, (b) `release_matured_escrow()` for the release job,
and (c) the two `app_settings` windows. The checklist in §6 is now the apply plan.

## 6. Option B — apply plan (implementation done; wiring + verify remain)

Done in `20260725000200_restore_escrow_hold_window.sql`:
- [x] `escrow_hold_days_card` (default 7) + `escrow_hold_days_wallet` (default 0),
      read via `get_setting()` in `process_marketplace_purchase` (no hardcoded window).
- [x] `process_marketplace_purchase` routes seller net to `escrow_held` + an
      `escrow_holds` row when held; ledger stays balanced (debit `paymongo_clearing`,
      credit `escrow_held` + `platform_revenue`).
- [x] Method gating: push methods (GCash/Maya) → 0-day window (immediate
      `seller_payable`); card/unknown → card window. Wallet RPC unchanged.
- [x] `release_matured_escrow()` — releases matured holds with **no open dispute**
      via the existing `release_escrow()`.
- [x] Refund/dispute already reverses `escrow_held` while held (`refund_purchase`,
      `20260606000900`) — verified against the code, no change needed.

Also already done (pre-existing, verified 2026-07-25):
- [x] **Held vs Available is surfaced** — `SellerEarningsView.vue` already renders an
      "Available to withdraw" card and a "Held in escrow / Released after the hold
      period" card from `getSellerBalance()` → `get_my_seller_balance()`. No change needed.
- [x] **Release job wired** — `process-payouts` now calls `release_matured_escrow()`
      at the start of each run (best-effort; a no-op until the migration is applied),
      so matured, dispute-free holds become withdrawable before disbursing.

Remaining before/at pilot:
- [ ] **Apply the migration during pilot pre-flight** (it rewrites the live
      settlement RPC — do it in the pilot window, not on a live-money day).
- [ ] **Redeploy + schedule `process-payouts`** (`supabase functions deploy
      process-payouts`) and ensure it runs on a cron (~every 15 min) so the release
      job actually fires. Without a schedule, holds mature but nothing releases them.
- [ ] **Re-run all 6 money flows** → `reconcile_financials()` = 0 after each
      (card→held, push→immediate, matured release, refund-while-held).
- [x] Update [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) #14 and the
      [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) go/no-go gate — done 2026-07-25.

## 7. If Option A is chosen — closeout checklist

- [ ] Drop `escrow_holds` + `release_escrow()` (migration), remove the `held` branch
      from `get_my_seller_balance()`, delete escrow references from the docs.
- [ ] Record the accepted chargeback risk in the ToS + the go-live gate, with the
      mitigation actually relied on (card disabled / capped / insured / reserve).
- [ ] Tick #14 as "instant payout by design — documented."
