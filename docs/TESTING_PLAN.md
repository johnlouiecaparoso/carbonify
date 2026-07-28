# Carbonify — Testing Plan (road to real users)

> **Created:** 2026-07-20 · Companion to [SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md) (the beta
> execution steps) and [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) (the launch gate). This document is the
> **what-to-test map**: the layers of testing Carbonify needs before and during launch, what already
> exists, and what to add.

## Where testing stands today

| Layer | State |
|---|---|
| Unit tests | ✅ **543 passing** (Vitest) — pure math: fees, VAT, reconciliation logic, farmer/investor/MRV aggregation. The 2026-07-22 role audit added ~200, covering the VER calculation breakdown, EXIF/evidence integrity, LGU jurisdiction matching, AML name screening, admin segregation of duties and the verification timeline. |
| Live-DB security verification | ✅ done 2026-07-20 — RLS lockdown + money-table policies verified; `reconcile_financials()` = 0. |
| Integration tests (RPC/RLS on a real DB) | ❌ none automated — RLS/grants are checked by hand (as we did today). |
| End-to-end (Playwright) | 🟡 present but **not required in CI**, not run on a seeded backend. |
| Manual role click-through | 🟡 partially done live; formalized in the runbook §3. |
| Security / penetration test | ❌ not done — the last P0 before live payment keys. |
| Load / performance | ❌ not done. |
| Accessibility | 🟡 partial (`for`/`id` pass started 2026-07-07; colour contrast closed 2026-07-26 with a token test; **modal keyboard access closed 2026-07-28** — Escape / focus trap / `role="dialog"` on all 15 dialogs, 9 tests). Remaining: the `for`/`id` pass on MRV/assessment/LGU forms, and focus states outside dialogs. |

**The gap is not unit coverage — it's everything that unit tests can't prove:** RLS policies, RPC grants,
real payment settlement, and real human usage. The plan below is ordered by that gap.

---

## 1. The test layers, in priority order

### 1.1 Regression gate (run on every change) 🔴
The non-negotiable check after any code or DB change:
- `npm run build` green · `npx eslint` 0 · `npx vitest run` all green.
- After any money/DB change: **`select * from reconcile_financials();` returns 0 rows.**
- Re-run the affected role's click-through (runbook §3).

### 1.2 Integration tests — RPC + RLS on a real Postgres 🔴
The highest-value thing to *add*, because it's where drift and privilege bugs hide.
- Stand up a disposable Supabase/Postgres (branch DB or local `supabase start`).
- Test each SECURITY DEFINER RPC end to end: `process_marketplace_purchase`, `process_wallet_purchase`,
  `retire_credits_atomic`, `record_farmer_delivery`, `confirm_farmer_delivery`, `offtake_summary`,
  `log_data_room_access`, payout processing.
- **Negative RLS tests** (the important half): as a normal user, attempt to
  UPDATE `project_credits.credits_available`, rewrite another seller's `credit_listings.price`, INSERT a
  `credit_retirements` row, read another user's compliance docs / wallet — each **must fail**. These
  encode the holes migration 000800 closed so they can never silently reopen.

### 1.3 End-to-end (Playwright) on a seeded backend 🟠
Automate the runbook §3 click-throughs so they run in CI:
- Auth: register (buyer/user), login, role guards redirect correctly per role.
- Full spine: developer submits → verifier validates → MRV → issue → buyer buys (test card) → retire →
  certificate verifies.
- Farmer: parcel → delivery → buyer confirm → carbon tab.
- Investor: pipeline + IRR + data-room open logged.
- Make e2e **required in CI** against a seeded DB (currently P2 in the roadmap).

### 1.4 Payment & reconciliation testing (money-specific) 🔴
- All 6 flows on PayMongo **test keys**: card, wallet top-up, wallet buy, cart, retire, subscription.
- After each: certificate + receipt generated, `reconcile_financials()` = 0.
- Failure injection: cancel a payment, double-fire a webhook (idempotency), expire an intent, force a
  webhook error and confirm it's captured in `webhook_events.error` and heals via `paymongo-resettle`.

### 1.5 Security testing 🔴
- **RLS/privilege suite** (1.2's negative tests) as the repeatable in-house security check.
- **Independent penetration test** — external, the last P0 before live keys ($4k–15k; see
  [SYSTEM_COST_MODEL.md](SYSTEM_COST_MODEL.md)).
- Auth hardening checks: email confirmation on, MFA, rate limits, no client secret key, signed webhooks
  only (`ALLOW_UNSIGNED_WEBHOOKS` unset).

### 1.6 User Acceptance / Beta testing 🟠
The invited pilot — its own section below (§2).

### 1.7 Load / performance testing 🟡 (before scaling, not before soft launch)
- Marketplace list, registry, and `public_market_stats` under concurrent reads.
- Checkout under concurrent buyers on the same listing (double-claim guard holds).
- Establish a baseline before the stated 1,000-user / ₱2M-GMV milestone.

### 1.8 Accessibility 🟡
- ✅ **Colour contrast** — closed 2026-07-26; `tokenContrast.test.js` fails the suite on a regression.
- ✅ **Dialog keyboard access** — closed 2026-07-28; `v-modal-a11y` on all 15 hand-rolled dialogs,
  guarded by `src/test/directives/modalA11y.test.js`. Wallet top-up and withdraw were reachable but
  **not dismissable** by keyboard before this.
- ⬜ Finish the `for`/`id` pass on MRV/assessment/LGU forms; focus states outside dialogs; a screen
  reader pass over the money path.

---

## 2. Beta test plan (the invited pilot)

**Goal:** prove Carbonify survives real human behaviour on test money before spending on a pentest or
legal entity. Execution steps live in [SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md); this is the shape.

**Type:** closed beta, invite-only, **PayMongo test keys** (no real money).

**Participants (aim ~8–15), covering every role at least once:**
- 2–3 buyers/users · 1–2 project developers · 1 verifier (you provision) · 1–2 farmers ·
  1 LGU user (you provision) · 1 investor. Admin = you.

**Duration:** 2–4 weeks, enough for the full spine (submit → validate → MRV → issue → trade → retire) to
run at least a few times with different people.

**What to measure:**
- Task completion per role (could they finish without hand-holding?).
- `reconcile_financials()` = 0 every day (the headline health metric).
- Webhook health, payment success %, any RLS/permission surprises.
- Bugs, confusions, and drop-off points — captured in a simple shared sheet or issue tracker.

**Entry criteria (all true before inviting anyone):** runbook §1 pre-flight all green — reconcile 0,
security verified (done), webhook healthy, 7 edge functions deployed, PayMongo in test mode.

**Exit criteria (ready to move toward real money):**
- Every money flow ran multiple times, reconcile 0 each time.
- No privilege/RLS regression surfaced.
- The role click-throughs pass clean on the latest build.
- Feedback triaged; launch-blocking bugs fixed.

**Feedback loop:** a short per-role feedback form + a bug channel; triage weekly; fix and redeploy;
re-run the affected click-through.

---

## 3. Test-data & environment strategy

**Decision needed before the beta:** the current live project (`fmngptolarydbgrtltnd`) has been used for
development and holds test data (test accounts, test projects, the ₱1 purchases we cleaned up today).
Options:
1. **Beta on a cleaned version of this DB** — purge dev test rows to a known baseline (we started this:
   reconcile is now 0). Simplest; watch for leftover test projects/listings.
2. **Beta on a fresh project** — cleanest separation, but you re-apply all migrations and re-seed
   reference data (tax settings, emission factors, admin account).

Recommendation: for a *closed* beta, option 1 is fine now that reconcile is clean — just also remove or
clearly label leftover test projects/listings so pilot users aren't confused by them. Keep production
(real money) for a separate, clean project later.

---

## 4. Quick command reference

```bash
npm run build            # production build must be green
npx eslint src           # lint must be 0
npx vitest run           # all unit tests
npx vitest run src/test/services/farmer.test.js   # a single suite
npx playwright test      # e2e (once seeded backend is wired)
```
```sql
select * from reconcile_financials();   -- books health: expect 0 rows
```
