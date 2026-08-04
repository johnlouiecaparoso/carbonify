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
| **Email confirmation** — the value has now been all three things this row has claimed, so read the measurement, not the prose. **Measured 2026-07-31: `disable_signup` = `false`, `mailer_autoconfirm` = `true`** — signups work, and confirmation is **off by choice** for the pilot. (It was `true`/`false` on 2026-07-30, which blocked the beta outright; the row before that assumed signups worked.) What is still outstanding is the *domain*: without a verified Resend sender, confirmation mail would go via Supabase's shared default SMTP and land in spam — which is why it is off rather than on. ~₱600–900/yr, not a subscription. Re-check any time with `pilot-readiness.spec.js`. | Dashboard + domain | 🟡 **not a beta blocker any more.** Confirmation must go back on before *public* launch — [YOUR_ACTION_ITEMS](YOUR_ACTION_ITEMS.md) Step 6b |
| **Runtime verification** — the spine (validate → list → buy → retire → certificate) was exercised live 2026-07-11 and the books reconcile to 0. Per-role breadth is now the **closed beta**. | Click-through | 🟡 in progress — [SOFT_LAUNCH_RUNBOOK](SOFT_LAUNCH_RUNBOOK.md) §3 (operator), [UAT_TEST_SCRIPT](UAT_TEST_SCRIPT.md) + [TEST_REPORT_FORM](TEST_REPORT_FORM.md) (pilot users) |
| **Independent penetration test before switching to live keys** | External | 🔴 open — the last P0 |
| ~~**Escrow hold window** — sellers immediately withdrawable with no chargeback hold~~ | ✅ decided 2026-07-25 — Option B (method-gated hold); `20260725000200` **applied 2026-07-29**, reconcile 0 after. **Still to verify:** `ESC-01…06` — it is holding real sellers' money now, and no purchase has been watched through the hold, release or refund-while-held paths | [DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) #14 · [ESCROW_DECISION.md](ESCROW_DECISION.md) · [UAT_TEST_SCRIPT](UAT_TEST_SCRIPT.md) Part 2 |

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

**Do NOT accept real money until ALL of these are true.** *(Status reconciled **2026-08-01** — three
boxes below had been done for days and were still showing unticked; see the note under the list.)*
- [x] `profiles` role/KYC lock applied + verified (no self-escalation) — applied 2026-07-04
- [x] Retirement identity migration applied + retested — `auth.uid()`-bound, no client-supplied fallback
- [x] `send-approval-email` requires auth (relay closed) — 2026-07-11
- [x] `paymongo-checkout` requires a verified JWT — ignores client `user_id`
- [x] **Retirement made atomic** (credits + retirement row commit together) — `20260718000000`
- [x] **RLS confirmed on `credit_ownership` / `credit_transactions` / wallet tables** — client-SELECT-only; three write holes closed by `20260718000800`, **verified on live 2026-07-20**
- [x] All 6 money flows reconcile to 0 — `reconcile_financials()` = **0 rows** on live 2026-07-20
- [x] `ALLOW_UNSIGNED_WEBHOOKS` unset; all edge secrets present — **confirmed by inspecting `secrets list` 2026-07-30**: absent entirely (the required state, not `false`), `PAYMONGO_WEBHOOK_SECRET` and `RECONCILE_WORKER_SECRET` both set. Re-confirm at pre-flight
- [ ] Legacy/demo code paths removed — 🟡 partial ([DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) #8)
- [x] **Money-table RLS posture captured into a versioned migration** ([DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) #13c) — captured + applied to live 2026-07-25 (`20260725000100`); `supabase/diagnostics/money_table_rls_audit.sql` returns **0 findings**. ⚠️ **2026-08-04: that audit is narrower than this line reads.** It inspects only `INSERT/UPDATE/DELETE/ALL` policies, so an open **SELECT** policy passes it silently — and `certificates` and `profiles` were never in its table list and carry **no tracked RLS policy at all**. New box below
- [ ] 🆕 **`access_posture_audit.sql` returns 0 rows** — RLS enabled with a scoped read policy on `certificates` and `profiles`, and no protected `profiles` column client-writable (2026-08-04)
- [ ] 🆕 **The five `20260804*` migrations applied + re-verified** — wallet trade gate, profiles column deny-list, real payment method (escrow), payout suspension + idempotency scope, certificates RLS. See [HANDOFF.md](HANDOFF.md) § *DEPLOY STATE*
- [x] **Escrow decision made + APPLIED** ([DEFERRED_BACKLOG](DEFERRED_BACKLOG.md) #14) — Option B (method-gated hold) decided 2026-07-25, `20260725000200` **applied to live 2026-07-29**, reconcile = 0. See [ESCROW_DECISION.md](ESCROW_DECISION.md).
- [x] **`process-payouts` deployed + scheduled** — ✅ **done and PROVEN 2026-07-30.** `pg_cron` job `carbonify-process-payouts` (jobid 1, `*/15`, active); `net._http_response` row 1 shows `status_code 200`. Verified three ways — correct secret → 200, wrong secret → 401, `GET` → 405. Its first run settled an 18-day-old payout that had been stranded since 2026-07-12.
- [ ] **The 4 escrow behaviour checks run** ([ESCROW_DECISION.md §6](ESCROW_DECISION.md)) — applied is not the same as verified. ⚠️ **Blocked on `20260804000300`**: the method-gate read `payment_intents.provider`, which is always `'paymongo'`, so the GCash/Maya branch had **never executed** and ESC-02 could not have passed
- [ ] **Email confirmation re-enabled** with a verified sender domain
- [ ] **Closed beta completed** against its exit criteria ([SOFT_LAUNCH_RUNBOOK](SOFT_LAUNCH_RUNBOOK.md) §6)
- [ ] **Independent penetration test passed**
- [ ] Sentry + reconciliation/webhook monitoring live

Until every box is checked, run in **sandbox/test mode only.**

> ### 🧭 What this gate does and does not say (2026-08-01)
>
> **This is the REAL-MONEY gate, not the pilot gate.** Six boxes remain, and they are the reason
> Carbonify must stay on PayMongo **test keys**. The long pole is the **independent penetration
> test** — external, and no amount of code closes it.
>
> **The closed beta on test keys is a different, lower bar, and it is nearly met.** The frontend is
> merged and deployed (PR #14, 2026-08-01), signups are on, escrow is applied and the payout worker is
> proven. **One thing gates inviting a seller: the four escrow behaviour checks (`ESC-01…06`).**
> Escrow is holding real sellers' balances today and the Terms already promise them a hold window
> that nobody has watched behave on an actual purchase.
>
> **Three boxes above had been done for days while still showing unticked** — the payout worker
> (07-30), the webhook secrets (07-30), and escrow being applied (07-29). A go/no-go checklist that
> under-reports its own progress is the same defect class as one that over-reports it: in both cases
> the document has stopped tracking the system. Re-measure this list before trusting it.
>
> ### 🧭 Re-measured 2026-08-04 — the gate is UNCHANGED, and that is the finding
>
> The pre-pilot defect hunt found ten defects and **moved none of these boxes.** Worth stating
> plainly, because a busy day of fixes can easily read as progress toward launch when it is not:
> every one of them was a *correctness or privacy* defect on the user-facing side, not a money-path
> blocker. The real-money gate is exactly where it was on 2026-08-01.
>
> **Two things it did add, neither of them a new box:**
>
> 1. 🔴 **A deploy is now outstanding.** The whole 2026-08-04 pass is committed and **not pushed**,
>    so none of it is live. See [YOUR_ACTION_ITEMS.md](YOUR_ACTION_ITEMS.md) item 0. **Do not set
>    `VITE_GA_TRACKING_ID` in Vercel before deploying** — on the currently-live build that one field
>    starts streaming user identifiers and signed storage tokens to Google Analytics.
> 2. 📋 **Two items for the pentest brief**, both closed in code but worth handing over as scope:
>    the `system_notifications` INSERT policy (#36 — any signed-in user can write into anyone's
>    bell; the client half is fixed, the RLS half is staged), and the analytics/consent surface
>    (#37 — 17 preference controls that are read by nothing, and the DPA question of whether
>    analytics consent may default to ON).
>
> **One box worth re-reading rather than re-ticking:** *"`ALLOW_UNSIGNED_WEBHOOKS` unset"*. It is
> still unset, and it is now **ratcheted in the suite** — `webhookSignatureParity.test.js` fails if
> that flag is ever defaulted to `true`, if the 300s replay window stops being enforced, or if the
> two copies' tolerance constants diverge. A configuration box that only a human re-checks is a box
> that drifts; this one now has a test behind it.
>
> ### 🧭 Later the same day — P5 and accessibility also closed, and the gate STILL did not move
>
> Both were real work (wallet top-ups now resolve their purpose from `payment_intents` rather than
> from browser storage; WCAG 2.1 A+AA is automated and green on the public routes, having found that
> the app had **no `main` landmark on any route** and that **every route served the same
> `<title>`**). Neither is on this list, and neither should be.
>
> **That is now three separate bodies of work in one day that moved nothing here** — which is the
> point of keeping this page narrow. This gate asks one question: *may real money move?* Correctness,
> privacy and accessibility fixes make the product better and safer without answering it. The answer
> is still no, and the reason is still the **independent penetration test**.
>
> ⚠️ **Accessibility is worth one caveat on the pentest brief rather than a tick here.** Automated
> rules cover roughly a third of WCAG. "0 axe violations" is not "accessible", authenticated routes
> are not yet covered, and no screen-reader user has tried to complete a purchase. If an
> accessibility conformance statement is ever published, it must say that.
