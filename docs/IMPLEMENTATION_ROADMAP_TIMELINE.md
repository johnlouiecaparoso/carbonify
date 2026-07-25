# Carbonify — Implementation Roadmap & Timeline

> 🗄️ **Superseded (2026-07-03) by [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md).** Kept for history. Since
> this timeline was written the money cutover completed + hardened and a security review ran. Use
> **[GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md)** for the current phased plan and **[HANDOFF.md](HANDOFF.md)**
> for state.

> **What this is:** A week-by-week, phase-by-phase plan to finish what's missing, clean up the code, harden security, and make Carbonify scalable and feasible to run for real. Built directly on top of [`SYSTEM_STATUS_OVERVIEW.md`](SYSTEM_STATUS_OVERVIEW.md).
> **Compiled:** 2026-06-06 · **Progress updated:** 2026-07-02
>
> **📍 Progress (2026-07-02):** **Phases 0–8 are code-complete.** The **pre-cutover** money path (Phases 1–2) was proven — purchase + subscription + payout + refund all reconcile to 0 drift (ESLint 0, 145 unit tests, build ✓). The **server-authoritative money cutover** (server-side purchase/top-up/retirement RPCs) is now **partially runtime-verified**: ✅ **card purchase + subscription** settle via the webhook with 0 drift (2026-07-02, after fixing a `credit_ownership.status` constraint bug that had blocked every purchase and auto-disabled the PayMongo webhook), ⬜ **wallet top-up / wallet buy / cart / retire** still to test (Step 4 B–E, [`YOUR_CUTOVER_STEPS.md`](YOUR_CUTOVER_STEPS.md)). **Next:** finish Step 4 B–E, then the money-path **RLS lockdown** (gated on those), plus code hygiene ([`NOW_IMPLEMENTATION_PLAN.md`](NOW_IMPLEMENTATION_PLAN.md)); everything else needs an external partner (registry, AML data, PSP) or ops/legal. Per-phase status is marked inline below.

---

## How to read this plan

- **Estimates assume ONE full-time developer.** With 2 devs, cut wall-clock time roughly 40% (some phases parallelize, money work doesn't). For a part-time schedule (≈15 hrs/week), multiply weeks by ~2.5.
- Phases are **ordered by dependency**, not just priority. You cannot safely build payouts before the money foundation, or compliance reporting before the data exists.
- Each phase lists: **Goal → Tasks → "Done when" (acceptance) → Risk.**
- 🔴 = blocks real-money operation · 🟠 = expected for serious use · 🟢 = polish/adoption · ⏳ = business/legal, not just code.

### Timeline at a glance

| Phase | Theme | Solo-dev weeks | Cumulative | Status |
|---|---|---|---|---|
| **0** | Stabilize & clean up | 1–2 | Wk 2 | ✅ **Code-complete** |
| **1** | Money foundation (server-side, ledger) 🔴 | 4 | Wk 6 | ✅ **PROVEN** · 🚦 cutover: card+subscription verified 2026-07-02, wallet/cart/retire pending |
| **2** | Get sellers paid 🔴 | 3 | Wk 9 | ✅ **PROVEN** (payout + refund settled, 0 drift, 2026-07-01) |
| **3** | Real credits + buyer trust 🔴 | 3 | Wk 12 | 🆕 **Code-complete** (real registry/supplier needs a partner) |
| **4** | Workflow completeness 🟠 | 3 | Wk 15 | 🆕 **Code-complete** (runtime-untested) |
| **5** | Admin & compliance 🟠 | 3 | Wk 18 | 🆕 **Code-complete** (AML needs a data vendor) |
| **6** | Buyer & LGU experience 🟢 | 3 | Wk 21 | 🟡 **Partial** (buyer cart/watchlist + saved-search price alerts done; LGU tooling pending) |
| **7** | Scale, transparency & security hardening 🟠 | 3 | Wk 24 | 🆕 **Code-complete** (pentest/PITR/pooling/observability are ops) |
| **8** | Mobile / PWA 🟢 | 3 | Wk 27 | 🆕 **Code-complete** (web push pending keys) |
| **9** | Future / institutional ⏳ | ongoing | — | ⏳ Parallel/ongoing |

**≈ 6 months solo to a production-credible web platform** (Phases 0–7), excluding the business/legal track that runs in parallel and excluding mobile.

---

## Phase 0 — Stabilize & Clean Up (Weeks 1–2) · ✅ CODE-COMPLETE (2026-06-27)

> **Status:** Branch `phase-0-stabilize`. Webhook conflict markers removed, `scripts/setup/` restored, 4 latent runtime bugs fixed, ESLint 183→0 + CI fixed, schema fixes applied live. Phase 0 is now fully green; the runtime proof moved into the money-flow phases. Code hygiene partly deferred (dual-column cleanup, Prettier — backlog #1, #5).

**Goal:** Fix the known bugs and remove the rot so every later phase builds on solid ground. Do this *first* — it's cheap and unblocks everything.

**Tasks**
- 🔴 Run/commit migration `20260215000000_fix_credit_ownership_updated_at.sql` — the one bug that breaks credits-after-payment. Verify against a real test purchase.
- 🔴 Resolve the **Git conflict markers** in `supabase/functions/paymongo-webhook/index.ts` (per `SYSTEM_GUIDE.md`) — currently undeployable.
- 🟠 Fix the `credit_transactions` ↔ `profiles` FK/relationship names so receipt joins stop 400-ing (remove the fallback crutch).
- 🟠 Fix `wallet_accounts` 400 (column name / RLS) and the missing `certificate_type` / `certificate_data` columns.
- 🟠 Align `package.json` scripts (`setup:supabase`, `setup:accounts`) with the actual `scripts/setup/` layout; update `scripts/README.md`.
- 🟢 **Code hygiene pass:** run `eslint`/`prettier` across the tree, delete dead files (e.g. hidden `SalesView.vue` if unused), remove the dual `available_credits`/`credits_available` confusion (pick one canonical column), consolidate the 3 payment services (`paymentService`, `realPaymentService`, `paymongoService`) behind one interface.
- 🟢 Get the existing **Vitest/Playwright** harness green and wired into a CI check (GitHub Actions) so regressions are caught from here on.

**Done when:** a clean checkout builds, all tests pass in CI, a test purchase puts credits in the portfolio with no console errors, and the webhook function deploys.

**Risk:** Low. This is the highest-ROI week in the whole plan.

---

## Phase 1 — Money Foundation (Weeks 3–6) 🔴 · 🆕 CODE-COMPLETE (2026-06-27)

> **Status:** Branch `phase-1-money-foundation`. All tasks built: `PaymentProvider`/Mock/PayMongo, server-authoritative `create_marketplace_checkout`, signed+deduped webhook, double-entry `ledger_entries` + `idempotency_keys` + `payment_intents`, atomic `process_marketplace_purchase`, `reconcile_financials()`. Migrations applied live. This phase is now **sandbox-proven for purchase + subscription**; the remaining runtime work is the payout/refund edge cases and the gated cutover (browser-write lockdown), tracked as backlog P1–P3.

**Goal:** Make real money *safe*. Today amounts are set client-side — this is the single production blocker. Everything else in money/marketplace depends on this. (Design: [`PAYMENTS_ARCHITECTURE.md`](PAYMENTS_ARCHITECTURE.md), [`VENDOR_SCORECARD_AND_TECH_DESIGN.md`](VENDOR_SCORECARD_AND_TECH_DESIGN.md).)

**Tasks**
- **Provider abstraction first** — define `PaymentProvider` interface + a `MockPaymentProvider` so the whole flow is buildable/testable before any contract. (Wk 3)
- Move payment-intent creation **server-side** (Supabase Edge Function); the client never sets or sees amounts — server recomputes price from the listing. (Wk 3–4)
- **Signed webhook = source of truth:** verify signature, replay-protect (timestamp+nonce), idempotent processing, `webhook_events` table with dedup keys. (Wk 4)
- **Double-entry `ledger_entries`** (append-only; balances derived, never UPDATE/DELETE) + `idempotency_keys` + `payment_intents`. (Wk 5)
- **Atomic purchase**: race-safe credit decrement + ownership transfer + ledger writes in one transaction (kills oversell). (Wk 5)
- **Reconciliation job** (scheduled): ledger vs. PayMongo settlement report → flag drift. (Wk 6)
- All financial tables **server-write-only** via service role; RLS = read-your-own-rows only. (Wk 6)

**Done when:** in sandbox, a forced double-webhook, a declined card, and a tampered client amount all behave correctly; balances reconcile to zero drift; no money logic remains in the browser.

**Risk:** Highest-complexity phase. Don't rush it — a bug here loses real money. Build entirely against the mock + PayMongo sandbox before touching live keys.

---

## Phase 2 — Get Sellers Paid (Weeks 7–9) 🔴 · ✅ PROVEN (2026-07-01)

> **Status:** All tasks built and **runtime-proven**: `escrow_holds` hold/release, `PayoutProvider`/Mock, `payout_requests` state machine + dead-letter, `payoutService.js` + `process-payouts` worker behind `Withdraw.vue`, seller KYB (`kyb_applications`, payouts gated), refund/dispute via compensating ledger entries, `SellerEarningsView.vue` at `/sales` + listing management. **A sandbox KYB-gated payout settled and a refund reversed, both with `reconcile_financials()` = 0** (2026-07-01). Now fully click-driven: seller **KYB submission form**, admin **KYB-review console** (`/admin/kyb`) and **refunds/disputes console** (`/admin/refunds`).

**Goal:** Developers can actually cash out. Without this Carbonify is not a real marketplace.

**Tasks**
- **Escrow** hold/release for trades (`escrow_holds` state machine: held → released/refunded). (Wk 7)
- **Seller payouts / disbursements** via the partner (Xendit/PayMongo payouts), idempotent, with hold periods and a state machine (requested → processing → settled/failed) + dead-letter retry. (Wk 7–8)
- Complete the **Withdraw** backend behind the existing `Withdraw.vue` UI. (Wk 8)
- **Seller KYB** (business verification) extending current KYC. (Wk 8)
- **Un-hide & build the seller sales/earnings dashboard** (`SalesView.vue`). (Wk 9)
- **Listing management** — edit price, pause/relist, inventory. (Wk 9)
- **Refund/dispute** flow with compensating ledger entries (never edit originals). (Wk 9)

**Done when:** a seller with KYB can see earnings, request a withdrawal, and receive a sandbox disbursement that reconciles; refunds reverse cleanly.

**Risk:** Medium-high. Payout failures and refunds are where money disappears — invest in the dead-letter queue and idempotency.

---

## Phase 3 — Real Credits & Buyer Trust (Weeks 10–12) 🔴 · 🆕 CODE-COMPLETE (2026-06-27)

> **Status:** Code-complete except the external-partner piece. Built: full project-detail page, `local|supplier` badge + marketplace filter, ESG/offset export (PDF/CSV), SDG tagging + filter, project-boundary map (draw + display), buyer portfolio gain/loss vs market. **Still open:** the real `CreditSupplier` integration (Carbonmark/Cloverly/Patch) — blocked on an external registry/supplier partner; the `PaymentProvider`/`PayoutProvider` abstractions from Phases 1–2 set the pattern for it. Precondition for the *partner* work: finish the Phase 1/2 payout/refund sandbox checkpoint (see `handoff.md` §4).

**Goal:** Make the credits *real* (or clearly labeled), and give buyers what they need to trust a purchase. (Strategy: [`REAL_WORLD_GOLIVE_PLAYBOOK.md`](REAL_WORLD_GOLIVE_PLAYBOOK.md) Track A.)

**Tasks**
- Define `CreditSupplier` interface + `MockCreditSupplier`; wire purchase → `placeOrder` → `retire` saga (refund on fulfillment failure). (Wk 10)
- Integrate a **credit-supplier API** (Carbonmark / Cloverly / Patch) in **sandbox**; map their catalog → your marketplace; certificates carry the **real registry serial + retirement receipt**. (Wk 10–11)
- Add a `source` (`local` | `supplier`) flag to listings so local + real credits show together honestly. (Wk 11)
- **Full project detail page** — documents, methodology, map, vintage, co-benefits. (Wk 11)
- **ESG / offset report** export (PDF/CSV): credits bought/retired, tCO₂e, projects, vintages. (Wk 12)
- **SDG / co-benefit data** capture + make the marketplace filter real (it's currently cosmetic). (Wk 12)

**Done when:** a sandbox purchase places a real (test) order, retires it, and the certificate shows a verifiable registry serial; a buyer can download an ESG report.

**Risk:** Medium — external API maturity/PH coverage varies. The mock-first design means a slow vendor doesn't block the build.

---

## Phase 4 — Workflow Completeness (Weeks 13–15) 🟠

**Goal:** Close the developer ↔ verifier loop so projects can actually move through revisions.

**Tasks**
- **Edit & resubmit** after "needs revision"; **document re-upload/versioning**. (Wk 13)
- **Two-way comment/request thread** developer ↔ verifier. (Wk 13)
- **Validation checklist / scored rubric** + **adjustable VERs** before approval (calculation transparency). (Wk 14)
- **Verifier queue** — assignment, filters, aging/SLA; **per-project verification timeline**. (Wk 14)
- **MRV reminders** (scheduled email + dashboard) — quarterly/yearly nudges. (Wk 15)
- **Methodology selection/reference** + **project-boundary map polygon** + **financials persisted/displayed**. (Wk 15)

**Done when:** a project can be submitted → flagged for revision → edited → resubmitted → approved entirely in-app, with an auditable conversation.

**Risk:** Low. Mostly CRUD + UI on existing data models.

---

## Phase 5 — Admin & Compliance (Weeks 16–18) 🟠

**Goal:** Make it legally operable and admin-manageable. (Some items here are *enablers* for the legal track in Phase 9.)

**Tasks**
- **System-config UI** — emission factors, fees, KYC peso tiers, project types (stop hardcoding in migrations). (Wk 16)
- **Regulatory & business reports** + CSV/PDF export (admin, buyer ESG, LGU ESG). (Wk 16)
- **DPA tooling** — consent capture, data-subject access/export/delete. (Wk 17)
- **AML** screening hooks + transaction monitoring + velocity/amount caps by KYC tier. (Wk 17)
- **BIR-compliant invoices / official receipts** with VAT. (Wk 17)
- **User lifecycle** (suspend/ban/reactivate, secure impersonation, bulk ops), **audit-log search/filter/export**, **fraud/risk dashboard**, **dispute console**. (Wk 18)

**Done when:** an admin can configure the system without code edits, export every required report, and action a data-deletion request end-to-end.

**Risk:** Medium — AML/DPA correctness needs a compliance officer/lawyer to validate (the code is the easy part).

---

## Phase 6 — Buyer & LGU Experience (Weeks 19–21) 🟢

**Goal:** Adoption polish.

**Tasks**
- Buyer: **cart / multi-item checkout** + RFQ/bulk quote; **watchlist + price alerts**; **shareable retirement/claim page + badge**; **price history**; **one-click calculator → checkout**; **recurring/auto-offset**. (Wk 19–20)
- LGU: **ESG report export**, **community-project tracker**, **trend charts**, **evidence upload**, **benchmarking** vs. other LGUs. (Wk 20–21)

**Done when:** the top-3 buyer asks (detail page already done, ESG report done, real credits done) are joined by cart + alerts; LGUs can export and trend their data.

**Risk:** Low.

---

## Phase 7 — Scale, Transparency & Security Hardening (Weeks 22–24) 🟠

**Goal:** Production hardening before/around go-live. **Treat this as non-negotiable, not optional.**

**Tasks**
- **Public searchable registry** (all projects/credits/retirements) — the single biggest trust signal. (Wk 22)
- **Security:** independent **pentest + security review** before live keys; rate-limiting on auth/payment endpoints; secrets in a manager (never in the client bundle); full RLS audit (deny-by-default on every money/PII table). (Wk 22–23)
- **Scalability:** PgBouncer connection pooling; indexes on hot paths; time-partition `ledger_entries`/transactions; read replica for analytics so dashboards don't contend with checkout; cache invalidation on purchase. (Wk 23)
- **Ops/DR:** automated backups + **PITR**, tested restores, documented **RTO/RPO** runbook; observability — payment success %, webhook lag, reconciliation drift, failed-payout alerts. (Wk 24)
- **Methodology documentation** published (cited emission-factor sources). (Wk 24)
- Optional: **Docker** for portability if leaving Vercel/Supabase later.

**Done when:** pentest findings are remediated, a restore drill succeeds, load test sustains target concurrency, and dashboards/alerts are live.

**Risk:** Medium — skipping the pentest before real money is the biggest avoidable mistake on this list.

---

## Phase 8 — Mobile / PWA (Weeks 25–27) 🟢

**Goal:** Mobile reach without a second codebase.

**Recommendation:** **Build a responsive PWA from the existing Vue SPA**, not a separate React Native app — far faster from where you are (the original RN plan is the largest unbuilt block and would duplicate everything).

**Tasks**
- Audit/fix mobile responsiveness across core flows. (Wk 25)
- PWA shell: installable, offline-aware for read paths, app manifest. (Wk 26)
- Mobile login, wallet, marketplace, certificate viewer. (Wk 26)
- **Push notifications** (web push). (Wk 27)

**Done when:** the PWA installs on Android/iOS and the buy → certificate flow works on a phone.

**Risk:** Low-medium (iOS PWA push has limits — verify early).

---

## Phase 9 — Future / Institutional (Ongoing, parallel) ⏳

These are **mostly business/legal, not code** — run them in parallel from Phase 1 onward; they gate "real" status more than software does.

- Legal entity (SEC), PSP/EMI partnership + KYB of *your* company, carbon-supplier commercial agreement.
- AMLA program, DPO appointment, BIR registration, ToS/consumer-protection, carbon-claims policy.
- Track B origination: shepherd **one pilot PH project** through an accredited **VVB** → Verra/Gold Standard listing (12–36 months).
- Blockchain tokenization, Article 6 / national-registry interoperability, double-claim registry — only if/when justified.

---

## Cross-Cutting: Scalability, Feasibility & Security

### Scalability — will it hold up as users grow?
- **Reads** (marketplace, dashboards) scale easily on Supabase/Postgres with indexes + a read replica + caching. Already partly done.
- **Writes under contention** (purchases) are the real risk — solved by the **atomic decrement + double-entry ledger** in Phase 1. Don't write balances directly.
- **Webhook spikes** → queue + idempotent workers + dead-letter (Phase 1/2). Supabase Edge Functions are fine to start; move hot payment paths to a dedicated Node/Go service only when volume demands.
- **Hot tables** (`ledger_entries`, transactions, audit logs) → time-partition + archival policy (Phase 7).
- **Verdict:** Architecture scales to *thousands* of users on managed infra. Tens-of-thousands+ with sustained transaction volume is where you outgrow the defaults (see limits below).

### Feasibility — is the remaining work realistic?
- **Software gaps are all buildable** by a small team in ~6 months (Phases 0–7). Nothing here is research-grade.
- **The hard part is the ~60% that isn't code** (per the go-live playbook): partner contracts, KYB of your entity, accreditation, AMLA/DPA/BIR compliance. Budget time and money for lawyers/accountant/compliance officer — these run on *their* timelines, not yours.
- **Cost reality:** PSP MDR (~2–4%), payout fees, supplier rev-share, KYC/KYB per-check, infra (DB w/ PITR + replica + queue), recurring compliance. Model this before committing to real money.

### Security — production bar (mostly Phases 1 & 7)
- **Server authority** over amounts/fees/state (Phase 1) — the foundational fix.
- **Webhook signature verification + idempotency + replay protection.**
- **PCI = SAQ-A** (partner-hosted checkout; never touch raw card data).
- **RLS deny-by-default** on every money/PII table; financial writes only by service role.
- **Secrets** in a manager, never in the bundle; **encryption** at rest + TLS in transit; tokenize KYC docs in a restricted bucket.
- **AML controls** + velocity/amount caps by KYC tier; **audit log** on every money/credit event.
- **Independent pentest before go-live**, periodic thereafter. **MFA + RBAC** already done — good.

---

## The Limits of Supabase + Vercel in the Long Run

You picked a great stack for *getting here fast*. Here's where each one starts to pinch, and what to do about it — so the choice is deliberate, not a surprise later.

### Supabase — limits to plan around

| Area | The limit | When it bites | Mitigation |
|---|---|---|---|
| **Connection limits** | Postgres has a finite connection pool; serverless functions exhaust it fast. | Traffic spikes / many concurrent Edge Functions. | Use **Supavisor/PgBouncer pooling** (transaction mode); cap function concurrency. Built-in but must be configured. |
| **Edge Functions** | Deno, with **CPU-time & memory caps** and cold starts; not meant for long-running/heavy jobs. | Reconciliation, batch payouts, report generation at scale. | Keep functions thin; move heavy/long jobs to a **dedicated Node/Go worker** or a queue. This is exactly why Phase 1 isolates the payments service. |
| **RLS at scale** | Complex RLS policies add per-query overhead and are easy to get subtly wrong. | Many tables × many policies; hot read paths. | Audit + simplify policies; use security-definer RPCs for hot paths; read replica for analytics. |
| **No built-in queue/cron depth** | Cron (`pg_cron`) and queues exist but are basic vs. a real broker. | Webhook spikes, dead-letter retries, fan-out. | Add an external queue (e.g. a lightweight broker) when webhook volume grows; don't rely on `pg_cron` for critical money jobs. |
| **Vendor coupling** | Auth, storage, RLS, functions, realtime are Supabase-flavored. Migrating off = real work. | If you ever need to leave (pricing, region, control). | It's **standard Postgres underneath** — the DB is portable; Auth/Storage/Functions are the sticky parts. Keep business logic in plain SQL/services, not Supabase-specific glue, to ease any exit. |
| **Pricing / scaling tiers** | Costs step up with compute add-ons, PITR, read replicas, bandwidth. | Real traffic + compliance (PITR) + replicas. | Model cost at expected volume now; the managed convenience is worth it until you're large. |
| **Region / data residency** | Limited control vs. self-hosted; PH data-residency questions for DPA. | Compliance review with real PII/money. | Confirm region + DPA posture with your DPO; self-hosting Supabase is possible but you then own ops. |

**Bottom line on Supabase:** Excellent through Phases 0–7 and well into real traffic. The escape hatch is good (it's Postgres). You'll *augment* it (dedicated payment service, external queue, read replicas) long before you'd *replace* it. Plan the dedicated payments worker around the time you hit sustained transaction volume.

### Vercel — limits to plan around

| Area | The limit | When it bites | Mitigation |
|---|---|---|---|
| **Serverless function timeouts** | Hard execution-time caps per request; not for long jobs. | Any heavy server work routed through Vercel functions. | Keep server money logic in **Supabase Edge Functions / a dedicated backend**, not Vercel functions. Vercel = frontend host. |
| **Stateful / long-lived work** | No persistent processes, no native queues/workers. | Background jobs, websockets at scale, schedulers. | Run workers/queues elsewhere (Supabase, a small VPS, or a worker platform). |
| **Bandwidth & build minutes** | Generous on Pro but **metered**; overages add up. | High traffic / asset-heavy app / frequent builds. | CDN-cache aggressively; watch bandwidth; consider object storage for large assets. |
| **Cost at scale** | Per-seat + usage; can exceed a plain VPS/container setup once large. | Sustained high traffic. | Fine until large; if it dominates cost, containerize (your Phase 7 Docker option) and move to a cloud VM/Kubernetes. |
| **Vendor lock (lighter)** | It's a **static/SSR Vite host** — low lock-in. | Rarely a problem. | A Vite SPA deploys anywhere (Netlify, Cloudflare Pages, S3+CloudFront, your own Nginx). Easy exit. |

**Bottom line on Vercel:** A fine **frontend** host with low lock-in — your Vite SPA can move anywhere. The mistake to avoid is putting **money/business logic in Vercel serverless functions**; keep that in Supabase/a real backend. Vercel's limits won't force a migration; cost might, eventually, and that's a cheap migration when it comes.

### The long-run shape (when you outgrow the defaults)
```
Today:        Vue SPA (Vercel)  ──►  Supabase (Auth + Postgres + Edge Functions + Storage)

At scale:     Vue SPA / PWA (Vercel or Cloudflare)
                     │
              Dedicated Payments/Worker service (Node/Go)  ──►  Queue (broker) + dead-letter
                     │                                              │
              Supabase Postgres (primary)  ──►  Read replica(s)     │
                     │  PgBouncer pooling · partitioned ledger      │
                     └───────────── reconciliation / cron jobs ─────┘
```
You don't build this on day one — you grow into it. Phases 1 and 7 already lay the seams (provider abstraction, server-side money, partitioning) so this evolution is additive, not a rewrite.

---

## TL;DR

1. **Weeks 1–2:** fix the bugs + conflict markers, get CI green. Cheap, do it now.
2. **Weeks 3–9:** make money safe (server-side + ledger) and let sellers get paid. This is what turns a demo into a marketplace.
3. **Weeks 10–18:** real credits, full workflow, compliance/admin tooling.
4. **Weeks 19–27:** experience polish, **pentest + scale hardening**, PWA.
5. **In parallel (Phase 9):** the legal/partnership/accreditation track — start now; it's the real long pole.
6. **Stack:** Supabase + Vercel are the right call today and for a long while; you'll *augment* (dedicated payments worker, queue, read replica) before you'd ever *replace*, and both have clean exits (it's Postgres + a Vite SPA).
