# Carbonify — Go-Live Roadmap (Real Users)

> ## 🧭 2026-07-26 — a role-by-role review changed the gate list. Read this first.
>
> **A registry-corrupting defect was found and closed on live.** Both issuance triggers were active at
> once, so validating a project *and* later approving a VER against it issued the same tonne twice
> (backlog **#17**, upgraded to 🔴 and then closed the same day). An audit against live confirmed the
> exposure was real but **never exercised** — nothing double-issued, nothing sold — so
> `supabase/cutover/adopt_mint_on_ver.sql` was applied with no reconciliation needed.
> **Live behaviour changed: a validated project no longer mints or lists anything.** See the warning
> box at the top of [HANDOFF.md](HANDOFF.md).
>
> **Two NEW items belong on this gate, and neither is a code task:**
>
> - **#26 — farmers are not paid through the platform. ✅ ANSWERED 2026-07-28** (Carbonify is an
>   introduction-and-records layer for feedstock, not the payment rail) **and ✅ BUILT 2026-07-29.** The
>   record is now two-sided — the buyer asserts, the farmer confirms or contests — and the ToS §1.14 +
>   in-app modal §6 state the position in lockstep.
> - **#29 — the feedstock side has no admin surface at all. ✅ CLOSED 2026-07-29.** `/admin/feedstock`
>   is read-only oversight plus one write: recording an off-platform resolution, including reversing a
>   buyer's false "Paid". "Contact support" now resolves to somebody who can see the trade.
> - ✅ **Both shipped in `20260729000100_feedstock_payment_record.sql`, applied to live 2026-07-29**
>   alongside the escrow migration, with `reconcile_financials()` = 0 after each. Click-through
>   pending.
>
> **Unchanged P0s:** independent penetration test, email confirmation (off by choice), runtime/pilot
> verification.
>
> 🔴 **#14 (escrow) is APPLIED as of 2026-07-29 — and that created a new urgent item.**
> `process_marketplace_purchase` now holds card sellers' net in `escrow_held`, and the **only** thing
> that releases it is `release_matured_escrow()`, called from the `process-payouts` edge function.
> **Until that function is deployed and on a ~15-minute cron, every card seller's money is held
> permanently — not delayed.** Applying escrow without scheduling the worker is worse than not applying
> it. **And it is not a one-click schedule** — the worker rejects any call without a
> `x-worker-secret` header matching `PAYOUT_WORKER_SECRET`, so a naive schedule 401s silently forever.
> Procedure: [`supabase/cutover/schedule_payout_worker.sql`](../supabase/cutover/schedule_payout_worker.sql).
> The four behaviour checks in [ESCROW_DECISION.md §6](ESCROW_DECISION.md) are also still unrun:
> **applied is not verified.**
>
> **Newly enforced since this page was written:** the CSP is no longer `Report-Only` (it had no
> reporting endpoint either, so it was collecting nothing). It has been audited statically but **first
> runs for real on deploy** — watch the console on that first load.
>
> Full list of what the review found: **#20–#31** in [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md).

> 🧭 **2026-07-21 — the P0 table in §3 was reconciled against what has actually shipped.** Rows closed
> since this page was written are struck through and dated. **Three P0 blockers remain:** an independent
> penetration test, email confirmation (off by choice), and the runtime/pilot verification now being run
> as a closed beta.
>
> **This page is the *real-money* gate.** The active next step is one phase earlier — the test-key closed
> beta in **[SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md)**. For the current one-screen state read the
> top of **[HANDOFF.md](HANDOFF.md)**.

> 🧭 **2026-07-09 — this page predates the seven expansion features.** For their honest,
> bullet-by-bullet status read **[EXPANSION_FEATURE_AUDIT.md](EXPANSION_FEATURE_AUDIT.md)**. Net change
> since this page was written: features #1, #2, #3 and #5 are complete; #4 is 6/8 and #6 is 5/6; #7 is an
> interface preview with no backend. All 31 migrations are applied.


> **Updated:** 2026-07-04 · **Branch:** `feature-user-onboarding-ux` (PR #2 → `main`)
> The single source of truth for **what is ready, what is not, and what to do next** to put Carbonify in front of **real users with real money.** Companion to [DEPLOYMENT_READINESS.md](dev/DEPLOYMENT_READINESS.md) (security detail), [SECURITY_CLOSEOUT_CHECKLIST.md](SECURITY_CLOSEOUT_CHECKLIST.md) (status + test runbook) and [RELEASE_NOTES.md](RELEASE_NOTES.md).
>
> **2026-07-04 update:** the P0 security items are **applied + tested live** (profiles/retire locks, JWT checkout, closed email relay + SMTP, self-purchase guard, widened reconcile). Added + verified: **rate limiting**, **Sentry**, **external PSP reconciliation** (+ **resettle/heal**), and **velocity caps by KYC tier** (last two pending tomorrow's deploy — see the runbook). **Only P0 blocker left: an independent penetration test.**

---

## 1. Where we are (summary of this cycle)

- **The whole feature set is built** (Phases 0–8): auth/roles/2FA/KYC, projects + documents, MRV, verification with a scored rubric, issuance + QR-verifiable certificates, marketplace + cart + portfolio + retirement, wallet, seller payouts + KYB, refunds/disputes, admin/finance/compliance consoles, public registry, LGU tools, PWA/offline.
- **The money path is proven AND hardened.** All six money flows (card, wallet top-up, wallet purchase, cart, retire, subscription) settle server-side and reconcile to **zero**, re-verified **after** the RLS lockdown that makes the financial tables server-write-only.
- **A full documentation set was written** — per-role user guides, developer docs (setup/architecture/DB/deploy/testing/security), a product overview, release notes, and a build/finish prompt.
- **Two adversarial security reviews were run.** Frontend hardening is applied; DB/edge/dashboard fixes are written and queued. **This is what gates real-money go-live.**

**One-line status:** *feature-complete and money-safe in sandbox; not yet cleared for live payment keys until the security P0 items + an independent penetration test are done.*

---

## 2. Implemented — ready for real users ✅

| Area | Status |
|---|---|
| Auth, 7 roles + RLS, password reset, TOTP 2FA, audit logging | ✅ |
| KYC (buy gate) + KYB (payout gate) | ✅ |
| Project registration, documents, boundary map, status workflow, edit/resubmit | ✅ |
| MRV: monitoring reports, server-side calculation, VER approval → mint | ✅ |
| Verifier: review queue, scored rubric, comment thread, verifier-set price | ✅ |
| Certificates: serials, QR + signature, public verification, PDF | ✅ |
| Marketplace, cart, portfolio (P&L), watchlist/alerts, retirement | ✅ |
| **Money path: server-authoritative, signed webhook, ledger, escrow, payouts, refunds — proven + reconciles to 0 + RLS-locked** | ✅ |
| Admin: finance console, KYC/KYB review, refunds/disputes, system config, audit search, VAT invoices (provisional) | ✅ |
| DPA tooling (data export + account deletion) | ✅ |
| Public registry, market dashboard, double-claim guard | ✅ |
| LGU tools; PWA/offline; 145 unit tests, lint 0, build green | ✅ |
| Frontend security hardening (headers, XSS escape, prod-log stripping, no client secret) | ✅ |

---

## 3. Not implemented / must close before real money — by priority

### 🔴 P0 — Blockers (do before ANY real user pays real money)
| Item | Type | Where |
|---|---|---|
| ~~Apply `20260703000300` — lock `profiles.role`/`kyc_level`~~ | ✅ applied 2026-07-04 | **Still unverified at runtime** — see RUNBOOK §1 |
| ~~Apply `20260703000400` — retirement identity = `auth.uid()`~~ | ✅ applied 2026-07-04 | — |
| ~~Redeploy `send-approval-email` with `verify_jwt=true`~~ | ✅ done — but see the 🆕 relay row below: **it is still an authenticated relay** | — |
| ~~Redeploy `paymongo-checkout` to require a verified JWT~~ | ✅ done — audit confirms it ignores client `user_id` | — |
| Confirm `ALLOW_UNSIGNED_WEBHOOKS` unset + all edge secrets present | Dashboard | Re-checked each pilot pre-flight — [RUNBOOK](SOFT_LAUNCH_RUNBOOK.md) §1e |
| Remove legacy/demo code paths (raw checkout branch, legacy webhook branches, `demo` purchase, dead wallet mutators) | Code + retest | 🟡 partial — dead client money writers removed 2026-07-11; rest tracked in [DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) #8 |
| ~~**Retirement is not atomic**~~ | ✅ fixed 2026-07-11 | Burn + `credit_retirements` insert now commit in one RPC transaction (`20260718000000`), with identity bound to `auth.uid()` |
| ~~**`send-approval-email` is an authenticated arbitrary-email relay**~~ | ✅ closed 2026-07-11 | Recipients resolved server-side (H4) |
| ~~**Confirm RLS on the base-schema tables**~~ | ✅ audited + closed 2026-07-11, **verified on live 2026-07-20** | Four ledger tables were already client-SELECT-only; three real write holes (`project_credits`, `credit_listings`, `credit_retirements`) found and closed by `20260718000800`. **Residual:** the posture is not yet in version control — [DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) #13c |
| **Email confirmation is OFF by choice** — anyone can sign up with an address they do not control. Needs a domain (~₱600–900/yr), not a subscription. | Dashboard + domain | 🔴 open — HANDOFF |
| **Runtime verification** — the spine (validate → list → buy → retire → certificate) was exercised live 2026-07-11 and the books reconcile to 0. Per-role breadth is now the **closed beta**. | Click-through | 🟡 in progress — [SOFT_LAUNCH_RUNBOOK](SOFT_LAUNCH_RUNBOOK.md) §3, [UAT_TEST_SCRIPT](UAT_TEST_SCRIPT.md) |
| **Independent penetration test before switching to live keys** | External | 🔴 open — the last P0 |
| ~~**Escrow hold window** — sellers immediately withdrawable with no chargeback hold~~ | ✅ decided 2026-07-25 — Option B (method-gated hold); staged in `20260725000200`, apply + verify during the pilot | [DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) #14 · [ESCROW_DECISION.md](ESCROW_DECISION.md) |

### 🟠 P1 — High (before scaling / to be genuinely credible)
| Item | Type |
|---|---|
| **Organization / company accounts** — no company entity exists; credits are owned by the employee, and VAT invoices carry no buyer TIN so a company cannot claim input VAT. Blocks the first *corporate* customer, not the beta. Scoped in [ORGANIZATION_ACCOUNTS_SCOPE.md](ORGANIZATION_ACCOUNTS_SCOPE.md) | Code (5 phases) |
| Real credit-supplier integration (Carbonmark/Cloverly/Patch) — registry serials + retirement receipts | Code + external partner |
| External PSP settlement reconciliation (system-vs-PayMongo, not just system-vs-self) | Code |
| CSP + rate limiting on public functions + Sentry error tracking | Code/infra + keys |
| Self-purchase guard + velocity caps by KYC tier | DB |
| AML / sanctions screening | External data vendor |
| Licensed PSP/EMI partnership, legal entity, BIR registration + accredited receipts, DPO/AMLA program, accredited verifier (VVB) | Business/legal (runs in parallel) |
| Backups/PITR + tested restore, connection pooling, observability dashboards | Ops/infra |

### 🟡 P2 — Medium (quality, adoption, maintainability)
| Item | Type |
|---|---|
| Adopt tracked migrations (`supabase db push`) — stop schema drift | Process |
| Adopt TypeScript in the money/services layer; consolidate dual-column quirks | Refactor |
| Verifier task-queue depth (assignment/SLA), evidence-integrity checks (EXIF/dupes) | Code |
| ESG/offset report exports (PDF/CSV), shareable retirement badges, recurring auto-offset | Code |
| Web push notifications; MRV reminders polish | Code + keys |
| Make Playwright e2e required in CI on a seeded backend | CI |

### 🟢 P3 — Low / later
| Item |
|---|
| Native mobile app (PWA already covers most needs) |
| Blockchain tokenization, Article 6 / national-registry interoperability |
| LGU benchmarking, land-use carbon modeling, trend analytics |

---

## 4. The roadmap — what to do now

### Phase 0 — Security close-out (this week) 🔴
Goal: make the app safe to expose. All P0 code/DB/dashboard items.
1. Apply the two migrations (`…000300`, `…000400`) in the SQL Editor; verify: a normal user can't self-promote to admin, and retirement still reconciles to 0.
2. Redeploy the two edge functions (email `verify_jwt=true`; checkout require verified JWT); re-run the 6 sandbox money flows → reconcile 0 each.
3. Enable email confirmation + custom SMTP; confirm secrets + `ALLOW_UNSIGNED_WEBHOOKS` unset.
4. Remove the legacy/demo code paths; re-run flows.
5. **Book the independent penetration test.**

### Phase 1 — Launch prep 🔴→🟠
6. Merge **PR #2** to `main`; deploy `main` (frontend ships the applied fixes; DB/edge already live).
7. Add Sentry + a CSP (tested) + basic rate limiting.
8. Stand up a staging environment and monitoring (payment success %, webhook lag, reconciliation drift, failed-payout alerts).

### Phase 2 — Soft launch (test mode) 🟠
9. Invite a small group of real users on **PayMongo test keys**; watch reconciliation and logs daily.
10. Fix what real usage surfaces; run the P2 maintainability items opportunistically.

### Phase 3 — Real money + real credits 🟠 (gated by pentest)
11. Only after the pentest passes: switch to **live PayMongo keys** with a licensed PSP arrangement.
12. Integrate a real credit supplier; attach registry serials/retirement receipts; add external reconciliation.
13. Complete the business/legal track (entity, BIR, AML/DPO) — this runs in parallel from Phase 0 and gates "real carbon market" claims.

### Phase 4 — Scale & compliance 🟡
14. Backups/PITR + restore drills, connection pooling, ledger partitioning; verifier queue depth, evidence integrity, exports; e2e-in-CI.

### Phase 5 — Growth 🟢
15. Web push, richer buyer-trust/ESG surfaces, LGU analytics; native mobile / blockchain only if the market demands it.

---

## 5. The go / no-go gate (print this)

**Do NOT accept real money until ALL of these are true.** *(Status reconciled 2026-07-21.)*
- [x] `profiles` role/KYC lock applied + verified (no self-escalation) — applied 2026-07-04
- [x] Retirement identity migration applied + retested — `auth.uid()`-bound, no client-supplied fallback
- [x] `send-approval-email` requires auth (relay closed) — 2026-07-11
- [x] `paymongo-checkout` requires a verified JWT — ignores client `user_id`
- [x] **Retirement made atomic** (credits + retirement row commit together) — `20260718000000`
- [x] **RLS confirmed on `credit_ownership` / `credit_transactions` / wallet tables** — client-SELECT-only; three write holes closed by `20260718000800`, **verified on live 2026-07-20**
- [x] All 6 money flows reconcile to 0 — `reconcile_financials()` = **0 rows** on live 2026-07-20
- [ ] `ALLOW_UNSIGNED_WEBHOOKS` unset; all edge secrets present — re-confirm at pre-flight
- [ ] Legacy/demo code paths removed — 🟡 partial ([DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) #8)
- [x] **Money-table RLS posture captured into a versioned migration** ([DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) #13c) — captured + applied to live 2026-07-25 (`20260725000100`); `supabase/diagnostics/money_table_rls_audit.sql` returns **0 findings**
- [x] **Escrow decision made + APPLIED** ([DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) #14) — Option B (method-gated hold) decided 2026-07-25, `20260725000200` **applied to live 2026-07-29**, reconcile = 0. See [ESCROW_DECISION.md](ESCROW_DECISION.md).
- [ ] 🔴 **`process-payouts` deployed + scheduled (~15 min)** — escrow now HOLDS card sellers' funds and `release_matured_escrow()` is the only releaser. Unscheduled = permanently stranded seller money.
- [ ] **The 4 escrow behaviour checks run** ([ESCROW_DECISION.md §6](ESCROW_DECISION.md)) — applied is not the same as verified
- [ ] **Email confirmation re-enabled** with a verified sender domain
- [ ] **Closed beta completed** against its exit criteria ([SOFT_LAUNCH_RUNBOOK](SOFT_LAUNCH_RUNBOOK.md) §6)
- [ ] **Independent penetration test passed**
- [ ] Sentry + reconciliation/webhook monitoring live

Until every box is checked, run in **sandbox/test mode only.**
