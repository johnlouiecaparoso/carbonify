# Carbonify — Documentation Index

> **Updated 2026-08-05.** This folder mixes **current** docs with **historical** planning notes kept for
> traceability. Use the current set below; anything under "Historical" carries a superseded banner.
>
> ### 🧭 State in three lines (2026-08-05)
>
> ✅ **Production is `https://carbonify-gilt.vercel.app`** — verified 2026-08-05 by walking all 106
> deployed chunks (`node scripts/analysis/verify-deploy.mjs <url>`), not by loading the page.
> ⚠️ **It is not `carbonify13.vercel.app`**, which now returns `404 DEPLOYMENT_NOT_FOUND`: the GitHub
> repo was renamed and Vercel had created the project as `carbonify-gilt` because `carbonify` was
> taken by an unrelated app. The pipeline never broke; only the docs naming the URL did.
>
> ✅ **Everything is applied, pushed and live.** Five `20260804*` migrations, three money edge
> functions, and the frontend price fix — all confirmed present in the deployed bundle. Suite
> **1278 green** across 111 files, lint 0, build green.
>
> **The one thing gating a pilot seller invite is `ESC-01…06`** — the escrow behaviour checks.
> Escrow is applied and holding balances; nobody has watched it behave on a real purchase. Run
> `ESC-02` **on GCash specifically** — wallet balance alone does not exercise the branch that was
> broken.
>
> **Real money is still gated on the independent penetration test.** Test keys only until then.
>
> 🧭 **Positioning (2026-07-25):** Carbonify is a **commercial** Philippine carbon-credit registry and
> marketplace for institutional users — project developers, corporate buyers, verifiers, LGUs, and
> cooperatives. It is **not** an academic capstone; docs that framed it that way were corrected. Two
> factual beta limits remain disclosed in-app and in the ToS: credits are **not yet registry-backed**,
> and payments run on **PayMongo test keys**. Do not remove those two statements without the
> corresponding capability actually shipping.

## 🟢 Start here (current, authoritative)

Read them in this order — the first two answer "where are we" and "what do I do next".

| Doc | What it answers |
|---|---|
| [HANDOFF.md](HANDOFF.md) | **Where we are right now, one screen** — implemented vs not, and the ordered next steps |
| [YOUR_ACTION_ITEMS.md](YOUR_ACTION_ITEMS.md) | 👤 **The owner runbook** — what only you can do, in order, with the SQL file to run at each step. Start here if you are the owner |
| [SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md) | 🔴 **The active next step** — pre-flight checks, the closed-beta click-through, daily monitoring, abort criteria. The SQL half of §1 is bundled into [`supabase/diagnostics/pilot_preflight.sql`](../supabase/diagnostics/pilot_preflight.sql) |
| [UAT_TEST_SCRIPT.md](UAT_TEST_SCRIPT.md) | **Per-role tick-box test scripts to hand to pilot users** — plain language, no technical knowledge assumed. Rewritten 2026-07-30 to add the escrow (ESC), two-sided farmer payment (FARM-04…07), admin feedstock (FEED), privacy (PRIV), keyboard (KEY) and public-page (PUB) tests, none of which had any coverage |
| [TEST_REPORT_FORM.md](TEST_REPORT_FORM.md) | 🆕 **What a tester fills in and sends back.** Section C's seven questions each target a bug class the automated suite cannot see — starting with "did a screen tell you that you have nothing, when you knew you had something". §G explains how each answer is read |
| [TESTING_PLAN.md](TESTING_PLAN.md) | The layered what-to-test map: regression, integration, e2e, security, beta, load |
| [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) | **The real-money gate** — what blocks live payment keys, with a go/no-go checklist |
| [OPEN_WORK_REGISTER.md](OPEN_WORK_REGISTER.md) | **Every open item, routed by who can do it** — 🤖 in-repo / 👤 owner / 🏢 third party. A router: it links to the doc that owns each item's status rather than repeating it |
| [GAP_ANALYSIS.md](GAP_ANALYSIS.md) | One deduplicated Built / Partial / To-build checklist + owner responsibilities + third-party services — **scoped to the 2026-07-25 expansion workstream**; for whole-project scope use OPEN_WORK_REGISTER |
| [CARBONIFY_OVERVIEW.md](CARBONIFY_OVERVIEW.md) | The plain-language system map — what it is, who uses it, tech stack |
| [ABOUT_CARBONIFY.md](ABOUT_CARBONIFY.md) | Product, roles, credit lifecycle, money model in plain language |
| [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) | Everything knowingly postponed, with reasoning — **#13c closed 2026-07-25, #19 (contrast) closed 2026-07-26; #14 (escrow) applies during the pilot; #18 (org accounts) is the open commercial one** |
| [ESCROW_DECISION.md](ESCROW_DECISION.md) | Why seller proceeds are held on cards and released immediately on push payments (Option B), and the apply plan |
| [ORGANIZATION_ACCOUNTS_SCOPE.md](ORGANIZATION_ACCOUNTS_SCOPE.md) | 📋 **Scoped, not started** — company/team accounts: why every account being an individual blocks corporate customers, and the 5-phase build |

## 🔎 Audits & feature status

| Doc | What it answers |
|---|---|
| [CODE_AUDIT_2026-07-11.md](CODE_AUDIT_2026-07-11.md) | Whole-codebase audit — 17 fixes (5 HIGH), all applied. *Superseded as "latest" by the 07-26 → 08-01 passes recorded in [HANDOFF.md](HANDOFF.md)* |
| [ANALYTICS.md](ANALYTICS.md) | Analytics events and the GA measurement-ID setup |
| [GO_LIVE_DEPLOYMENT.md](GO_LIVE_DEPLOYMENT.md) | Deployment mechanics (hosting, env vars, edge functions) |
| [CODE_AUDIT_2026-07-09.md](CODE_AUDIT_2026-07-09.md) | Earlier audit — its dead-code list was right two and a half weeks early; carries a resolution banner |
| [CODE_AUDIT_2026-07-09.md](CODE_AUDIT_2026-07-09.md) | Earlier pass, kept for traceability |
| [EXPANSION_FEATURE_AUDIT.md](EXPANSION_FEATURE_AUDIT.md) | The seven expansion features, scored bullet-by-bullet **against the code** |
| [FARMER_CARBON_ATTRIBUTION.md](FARMER_CARBON_ATTRIBUTION.md) | Why a farmer's tCO₂e is calculated the way it is |
| [SECURITY_CLOSEOUT_CHECKLIST.md](SECURITY_CLOSEOUT_CHECKLIST.md) | Security close-out status + step-by-step test runbook |
| [RUNTIME_VERIFICATION_RUNBOOK.md](RUNTIME_VERIFICATION_RUNBOOK.md) | The original live click-through; breadth is now covered by the soft-launch runbook |
| [RELEASE_NOTES.md](RELEASE_NOTES.md) | User-facing release summaries, newest first — from the 2026-07-03 money cutover through the 2026-07-26 UI consistency pass |

## 💼 Commercial

- [SYSTEM_COST_MODEL.md](SYSTEM_COST_MODEL.md) — what running Carbonify costs
- [ORGANIZATION_ACCOUNTS_SCOPE.md](ORGANIZATION_ACCOUNTS_SCOPE.md) — **what it takes to serve company customers** (org entity, org-owned credits, org invoicing with a buyer TIN)
- [POLICY_AND_USER_AGREEMENT.md](POLICY_AND_USER_AGREEMENT.md) — ToS / Privacy / Carbon Credits / AML. **Must stay in lockstep with the in-app modal in `src/App.vue`**
- [COMMERCIAL_FEATURE_IMPLEMENTATION_PLAN.md](COMMERCIAL_FEATURE_IMPLEMENTATION_PLAN.md) · [CARBONIFY_PRESENTATION.md](CARBONIFY_PRESENTATION.md)

## 📖 Use the app

- [user-guide/](user-guide/README.md) — step-by-step guides, one per role (getting started, buyer, developer, verifier, admin, LGU)

## 🧰 Diagnostics & analysis tooling

Read-only unless stated. Every SQL file ends with a single SUMMARY statement, because the Supabase
editor shows only the last statement's result when a whole file is pasted.

| Tool | Answers |
|---|---|
| [`pilot_preflight.sql`](../supabase/diagnostics/pilot_preflight.sql) | Do the pieces exist and is the posture right? Run before inviting anyone |
| [`rls_negative_suite.sql`](../supabase/diagnostics/rls_negative_suite.sql) | Is an attacker actually **stopped**? Performs the attacks; `UNPROVEN` is not a pass |
| [`rpc_positive_suite.sql`](../supabase/diagnostics/rpc_positive_suite.sql) | 🆕 Does the **legitimate** path still work, and do the books reconcile? Runs inside a transaction ending in `ROLLBACK` |
| [`escrow_verification.sql`](../supabase/diagnostics/escrow_verification.sql) | Is escrow behaving? Run after each `ESC-01…06` test |
| [`feedstock_verification.sql`](../supabase/diagnostics/feedstock_verification.sql) | Farmer payment record — row 6 (money core untouched) matters most |
| [`policy_consent_verification.sql`](../supabase/diagnostics/policy_consent_verification.sql) | Is the consent box shown once per user per version, and is the UNIQUE index still there? |
| [`money_table_rls_audit.sql`](../supabase/diagnostics/money_table_rls_audit.sql) | Is the money-table **write** posture declared correctly? Note it inspects only `INSERT/UPDATE/DELETE/ALL` policies — an open **SELECT** policy passes it silently, which is what the next file exists for |
| [`access_posture_audit.sql`](../supabase/diagnostics/access_posture_audit.sql) | 🆕 Who can **read** it, and what can a client write to a profile? Covers `profiles` + `certificates` (neither has a tracked RLS policy) and the profiles column grants. 0 rows = correct |
| [`daily_beta_health.sql`](../supabase/diagnostics/daily_beta_health.sql) | Run every morning during the pilot |
| [`find-dead-exports.mjs`](../scripts/analysis/find-dead-exports.mjs) | 🆕 `node scripts/analysis/find-dead-exports.mjs` — which exports nothing references. **Candidates, not a verdict**: deliberately conservative, and deleting one took down a live surface on 2026-08-02 |
| [`verify-deploy.mjs`](../scripts/analysis/verify-deploy.mjs) | 🆕 `node scripts/analysis/verify-deploy.mjs <url>` — **is that URL serving THIS app, and is it current?** Written 2026-08-05 after a 200 with the right `<title>` turned out to be an unrelated React project. Exit 0/1, so it can gate a pre-flight |

## 🛠 Build / operate it

- Root [../README.md](../README.md) — project overview + quickstart
- [dev/](dev/README.md) — setup, environment variables, architecture, database & RPCs, deployment, testing, contributing, **security**, **deployment readiness**
- [CARBONIFY_BUILD_PROMPT.md](CARBONIFY_BUILD_PROMPT.md) — reusable prompt to rebuild or finish a Carbonify-class system (spec + tech stack + enhancements)

## 💳 Money path

- [MONEY_CUTOVER_STATUS.md](MONEY_CUTOVER_STATUS.md) — status of the server-authoritative cutover (complete + hardened)
- [YOUR_CUTOVER_STEPS.md](YOUR_CUTOVER_STEPS.md) — the completed money-path runbook of record
- [PAYMENTS_ARCHITECTURE.md](PAYMENTS_ARCHITECTURE.md) — target money/wallet/ledger architecture

## 🔐 Security (read before real-user / live-key deployment)

- [dev/DEPLOYMENT_READINESS.md](dev/DEPLOYMENT_READINESS.md) — pre-launch security assessment + go/no-go checklist
- [dev/SECURITY.md](dev/SECURITY.md) — security model overview

## 📚 Reference / background (still useful)

- [SYSTEM_GUIDE.md](SYSTEM_GUIDE.md) — architecture & how the code fits together
- [ECOLINK_SYSTEM_ANALYSIS.md](ECOLINK_SYSTEM_ANALYSIS.md) — system analysis vs the SRD + market benchmark
- [REAL_WORLD_GOLIVE_PLAYBOOK.md](REAL_WORLD_GOLIVE_PLAYBOOK.md) — path to real credits + real money
- [VENDOR_SCORECARD_AND_TECH_DESIGN.md](VENDOR_SCORECARD_AND_TECH_DESIGN.md) — vendor evaluation + provider-agnostic design
- [role-needs/](role-needs/README.md) — per-role needs & gaps
- [AUTH_PROVIDER_SETUP.md](AUTH_PROVIDER_SETUP.md) · [POLICY_AND_USER_AGREEMENT.md](POLICY_AND_USER_AGREEMENT.md) · [ROADMAP_SIMPLE.md](ROADMAP_SIMPLE.md)

## 🗄️ Historical / superseded (kept for traceability — each carries a banner)

These predate the completed money cutover and the security review. Do not use them for current
status; they point back to the docs above.

- [SYSTEM_STATUS_OVERVIEW.md](SYSTEM_STATUS_OVERVIEW.md) · [SYSTEM_LATEST_UPDATE.md](SYSTEM_LATEST_UPDATE.md)
- [PRODUCTION_READINESS_TODO.md](PRODUCTION_READINESS_TODO.md) · [NOW_IMPLEMENTATION_PLAN.md](NOW_IMPLEMENTATION_PLAN.md) · [IMPLEMENTATION_ROADMAP_TIMELINE.md](IMPLEMENTATION_ROADMAP_TIMELINE.md) · [IMPLEMENTATION_TASKLIST.md](IMPLEMENTATION_TASKLIST.md)
- [YOUR_CUTOVER_STEPS.md](YOUR_CUTOVER_STEPS.md) · [NEXT_STEP_verify_money_path.md](NEXT_STEP_verify_money_path.md) · [PHASE1_VERIFICATION_RUNBOOK.md](PHASE1_VERIFICATION_RUNBOOK.md)
- [CONSOLE_ERRORS_AFTER_PAYMENT.md](CONSOLE_ERRORS_AFTER_PAYMENT.md) · [CARBONIFY_BOARD_UPDATED.md](CARBONIFY_BOARD_UPDATED.md)
