# Carbonify — System Status Overview (Implemented vs. Not Implemented)

> **What this is:** A single, plain-language summary of **everything that is built** and **everything that is not yet built** in Carbonify, compiled from all the analysis docs in this folder.
>
> ⚠️ **2026-07-09 — this page predates the seven expansion features entirely.** For their honest,
> bullet-by-bullet status (Project Registry, Carbon Asset Management, Biomass Marketplace, MRV
> Dashboard, Investor Portal, Farmer Portal, AI Assistant) read
> **[EXPANSION_FEATURE_AUDIT.md](EXPANSION_FEATURE_AUDIT.md)**. Feature-level "shipped" labels
> elsewhere hide missing sub-items; the audit was checked against the code.
>
> ⚠️ **2026-07-03 — newer, authoritative status available.** This page predates the completed
> money cutover and the pre-launch security review. For the current implemented-vs-not list
> **by priority** and the go/no-go plan, use **[GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md)**;
> for the money path see [MONEY_CUTOVER_STATUS.md](MONEY_CUTOVER_STATUS.md); for security
> before real users see [dev/DEPLOYMENT_READINESS.md](dev/DEPLOYMENT_READINESS.md). Net change
> since this page was written: the **money path is now proven + hardened** (all flows reconcile
> to 0, financial tables server-write-only) and a **security review** has queued the pre-live
> fixes. The feature inventory below remains accurate.
>
> **Compiled:** 2026-06-06 · **Last updated:** 2026-06-13 (Phases 0–2 of the roadmap now code-complete)
> **Sources:** `CARBONIFY_SYSTEM_ANALYSIS.md`, `IMPLEMENTATION_TASKLIST.md`, `CARBONIFY_BOARD_UPDATED.md`, `SYSTEM_GUIDE.md`, `PAYMENTS_ARCHITECTURE.md`, `REAL_WORLD_GOLIVE_PLAYBOOK.md`, `VENDOR_SCORECARD_AND_TECH_DESIGN.md`, `CONSOLE_ERRORS_AFTER_PAYMENT.md`, `handoff.md`, `DEFERRED_BACKLOG.md`

**Legend:** ✅ Implemented · 🟡 Partial (started but incomplete) · 🆕 Code-complete this cycle, runtime verification pending · ❌ Not implemented · ⏳ Future / institutional (beyond software alone)

> **⚠️ Verification note (2026-06-13):** Roadmap **Phases 0, 1, and 2 are code-complete and locally green** (ESLint 0, 47 unit tests pass, build ✓) with schema **applied to the live DB** — but **no sandbox purchase / payout has executed at runtime yet**. Items below marked **🆕** are written and merged but await an end-to-end sandbox run to be considered truly "done." See `handoff.md` §4–5 and `DEFERRED_BACKLOG.md`.

---

## 1. The One-Paragraph Summary

Carbonify is a **Vue 3 + Supabase** carbon-credit registry and marketplace. The **core product is built and works end-to-end**: users register, projects get submitted and verified, credits are issued with tamper-evident certificates, and buyers can purchase them through a real payment gateway. The system has **6 user roles, MFA, KYC, a full MRV module, and LGU climate tools** — it has done and *exceeded* the original 14-week MVP plan. As of **2026-06-13**, the **production money foundation is now built in code** (roadmap Phases 0–2): payment amounts are server-authoritative, the webhook is signature-verified and idempotent, a double-entry ledger + escrow back every purchase, and sellers can request KYB-gated payouts — though **none of this has run end-to-end at runtime yet** (sandbox verification is the immediate next step). **What remains is mostly "real credits + trust" and "institutional/legal" work**: there's no native mobile app, and credits are issued in-platform rather than backed by an external registry (Verra/Gold Standard).

| How it's measured | Score | Meaning |
|---|---|---|
| Against its own functional requirements (SRD) | **9.0 / 10** | Nearly feature-complete |
| As a Philippine-eligible platform | **8.5 / 10** | 7 of 8 target areas delivered |
| As a real production registry (Verra-class) | **4.5 → ~5.5 / 10** | Money-safety foundation now coded (Phases 0–2); still lacks accreditation, real-credit API, and **runtime-proven** money safety |

---

## 2. ✅ WHAT IS IMPLEMENTED (working today)

### Authentication & Security — ✅ Strong (9.5/10)
- ✅ Email/password sign-up, login, sessions, logout (Supabase Auth, bcrypt)
- ✅ Role-based access control — **6 roles** (general_user, buyer_investor, project_developer, verifier, admin, LGU), route guards, RLS
- ✅ Password reset (forgot/reset email flow)
- ✅ **TOTP 2FA/MFA** with strict login enforcement (aal2 step-up)
- ✅ **KYC** — application form, admin review/approval, purchase gate
- ✅ Organization profiles (name/type/address)
- ✅ Audit logging across auth, projects, MRV, KYC, payments, roles

### Projects & Registration — ✅ Strong (8.5/10)
- ✅ Project submission form (title, geo-coordinates, barangay, municipality, type, dates, host entity)
- ✅ **7 predefined PH project types** (DENR/CCC-aligned, DB-enforced)
- ✅ **9 document upload types** (PDD, baseline, additionality, leakage, safeguards, feasibility, LGU endorsement, land ownership, ECC, MOA)
- ✅ Validation workflow + statuses (Draft → Submitted → In Review → Needs Revision → Validated → Rejected)
- ✅ Project progress tracker (Registration → Validation → Verification → Issuance → Trading)
- ✅ Risk/feasibility scoring (shown as marketplace badges)
- ✅ Role application workflow (apply for developer/verifier; reviewers notified)

### MRV (Monitoring, Reporting, Verification) — ✅ Strong (9.0/10)
- ✅ Monitoring reports (period, activity data, photo/log evidence)
- ✅ **Server-side emission-reduction calculation** (RPC + methodology factors — client cannot dictate credit amounts)
- ✅ Verifier MRV review dashboard + VER approval
- ✅ Credits mint **only** on verifier approval (decoupled issuance via DB trigger)
- ✅ Time-stamped audit trail

### Issuance & Certificates — ✅ Strong (9.5/10)
- ✅ Certificate generation with **per-unit carbon serial numbers** (`ECO-…`)
- ✅ **QR code + SHA-256 tamper-evident digital signature**
- ✅ **Public certificate verification page** (no login needed)
- ✅ PDF certificate download

### Trading & Marketplace — 🟡 Mostly done (7.5/10)
- ✅ Browse marketplace, filter by **location/price/category**, interactive **Leaflet map**
- ✅ Purchase via **PayMongo** (GCash/Maya/cards), ownership transfer, transaction IDs, balance update
- ✅ Listings auto-created on issuance
- ✅ Wallet, top-up, receipts, portfolio
- ✅ **Retirement + atomic anti-double-counting** + retirement certificate
- 🆕 **Listing management** — pause/relist, price edit (`SellerEarningsView.vue`)

### Money Foundation — 🆕 Code-complete, runtime verification pending (Phase 1)
*Built this cycle. The single biggest production blocker — client-controlled amounts — is fixed in code.*
- 🆕 **Provider abstraction** — `PaymentProvider` interface + `MockPaymentProvider` + `PayMongoProvider` + factory (`src/services/payments/`)
- 🆕 **Server-authoritative checkout** — `create_marketplace_checkout` recomputes amount from `credit_listings.price_per_credit`; client sends only `{listing_id, quantity}`
- 🆕 **Signed webhook as source of truth** — HMAC-SHA256 verify + replay window + `webhook_events` dedup (replaced the `return true` stub)
- 🆕 **Double-entry ledger** — `payment_intents`, append-only `ledger_entries` (balanced-constraint trigger), `idempotency_keys`
- 🆕 **Atomic, oversell-safe purchase** — `process_marketplace_purchase` RPC (atomic + idempotent)
- 🆕 **Reconciliation** — `reconcile_financials()` + balances view (scoped to new-flow transactions)

### Seller Payouts — 🆕 Code-complete, runtime verification pending (Phase 2)
*Developers can now cash out — in code. Without runtime proof this is not yet "real."*
- 🆕 **Escrow** — `escrow_holds` hold seller net on purchase → `release_escrow` → `seller_payable`
- 🆕 **Payout provider abstraction** — `PayoutProvider` + `MockPayoutProvider` (`src/services/payouts/`)
- 🆕 **Payout state machine** — `payout_requests` (requested → processing → settled/failed) + reserve/settle/fail RPCs + dead-letter
- 🆕 **Withdraw backend** — `payoutService.js` + `process-payouts` worker Edge Function + rewired `Withdraw.vue`
- 🆕 **Seller KYB** (business verification) — `kyb_applications`, `profiles.kyb_verified`; **payouts gated on KYB** (`kybService.js`)
- 🆕 **Refunds & disputes** — compensating ledger entries (never edit originals) + dispute flow (`disputeService.js`)
- 🆕 **Seller earnings dashboard** — `SellerEarningsView.vue` at `/sales`

### Analytics, Notifications, LGU, UX
- ✅ Carbon calculator (PH emission factors)
- ✅ Dashboards (admin, developer, platform overview) + Chart.js charts
- ✅ Email + in-app dashboard notifications (DB triggers)
- ✅ **LGU tools** — MSW emissions calculator, waste-diversion monitoring, city ESG summary, host endorsements
- ✅ Onboarding guide; role-organized navigation

### Tech foundation
- ✅ Web app deployable (Vite build, Vercel-ready)
- ✅ Supabase Edge Functions: `paymongo-checkout` (now server-amount), `paymongo-webhook` (now real verify + dedup + RPC), `send-approval-email`; 🆕 `process-payouts` worker
- ✅ Test harness configured (Vitest, MSW, Playwright); 🆕 **47 unit tests pass**, ESLint 0, CI fixed (branch `development`, Node 20/22, split E2E)
- 🆕 **10 financial migrations applied live** (`20260606000200`–`…000900`) — see `handoff.md` §3

---

## 3. ❌ WHAT IS NOT IMPLEMENTED (the gap list)

### ✅/🆕 A. Money Safety — the #1 production blocker *(addressed in code, Phase 1)*
*Money logic now runs server-side. Built and locally green; **awaits a sandbox run to prove it end-to-end.***
- 🆕 Server-side payment amounts (server recomputes from the listing; client sends only `{listing_id, quantity}`)
- 🆕 Signed webhook as the source of truth (HMAC-SHA256 verify + replay window + `webhook_events` dedup)
- 🆕 Double-entry ledger (`ledger_entries`) + `idempotency_keys` + `payment_intents`
- 🆕 Reconciliation job — `reconcile_financials()` (system-vs-self). ❌ **External** PayMongo settlement reconciliation still pending (backlog P4)
- 🆕 Escrow hold/release for marketplace trades (`escrow_holds`)
- ❌ Partner-custodied wallet (licensed PSP/EMI holds the funds) — still a business/legal item
- 🆕 Oversell hardening — `process_marketplace_purchase` is the race-safe atomic decrement. 🟡 Dual `available_credits`/`credits_available` column cleanup still **deferred** (backlog #1)

### ✅/🆕 B. Sellers Can Get Paid *(addressed in code, Phase 2)*
*Developers can now request a KYB-gated cash-out. Built and locally green; **awaits a sandbox payout run.***
- 🆕 Seller payouts / disbursement — `payout_requests` state machine + hold/dead-letter + `payoutService.js` + `process-payouts` worker
- 🆕 **Withdraw** — backend now wired behind `Withdraw.vue`
- 🆕 Seller KYB (business verification) — `kyb_applications`, payouts gated on `profiles.kyb_verified`
- 🆕 Seller sales/earnings dashboard — `SellerEarningsView.vue` at `/sales` (replaces the hidden `SalesView.vue`)
- 🆕 Listing price-edit / pause-relist / inventory management
- 🟡 Admin finance console — refund/dispute flows exist (`disputeService.js`); a unified admin **finance console UI** (revenue, payouts, refunds, reconciliation view) is still **not built**

### 🔴 C. Real, Trustworthy Credits
*Credits are currently issued by Carbonify's own MRV and verification workflow, not backed by a recognized external registry.*
- ❌ Credit-supplier API integration (real Verra/Gold Standard credits + retirement) — "Track A"
- 🟡 Provider abstraction layer — `PaymentProvider` (+ mock + PayMongo) and `PayoutProvider` (+ mock) **done** (Phases 1–2); `CreditSupplier` interface + `MockCreditSupplier` **still to build** (Phase 3)
- 🟡 Full project detail page (documents, methodology, map, vintage, co-benefits) for buyer due diligence
- ❌ ESG / offset report export (PDF/CSV) for buyer disclosure
- ❌ SDG impact data capture + real marketplace filter (current SDG filter is cosmetic)

### 🟠 D. Developer ↔ Verifier Workflow Completeness
- ❌ Edit & resubmit after "needs revision"
- ❌ Two-way comment / request thread (developer ↔ verifier)
- ❌ Validation checklist / scored rubric
- ❌ Adjustable VERs before approval (verifier calculation transparency)
- ❌ Verifier task queue — assignment, filters, aging/SLA
- ❌ Evidence integrity checks (EXIF geotag/timestamp, duplicate detection)
- ❌ **MRV reminders** (scheduled email + dashboard nudges)
- ❌ Methodology selection/reference
- ❌ Project boundary (map polygon) — currently captured only narratively
- 🟡 Financials persisted + displayed + projection upload (form fields exist, not surfaced)
- ❌ Document re-upload / versioning

### 🔴/🟠 E. Admin & Compliance
- ❌ System config UI (emission factors, fees, KYC tiers, project types — currently hardcoded in migrations)
- ❌ Regulatory & business reports + **CSV/PDF export** (analytics are on-screen only)
- ❌ AML screening/monitoring
- ❌ **Data Privacy Act (DPA) tooling** — consent, data export, delete
- ❌ User lifecycle (suspend/ban/reactivate, impersonation, bulk ops)
- ❌ Fraud/risk dashboard + anomaly alerts
- ❌ Dispute-resolution console
- ❌ Audit log search/filter/export
- ❌ Broadcast announcements / feature flags / maintenance mode

### 🟠/🟢 F. Buyer Experience
- ❌ Cart / multi-item checkout + RFQ / bulk quote
- ❌ Tax-compliant invoices / BIR official receipt (with VAT)
- 🆕 Refund / dispute flow — compensating ledger entries (Phase 2, `disputeService.js`); buyer-facing dispute UI still thin
- 🟡 Shareable retirement/claim page + badge (verify page exists)
- ❌ Watchlist + price/new-listing alerts
- ❌ Recurring / auto-offset subscription
- ❌ Price history / comparison
- ❌ One-click calculator → checkout

### 🟠/🟢 G. LGU Tools
- ❌ City ESG report export (PDF/CSV)
- ❌ LGU community-project tracker
- ❌ Trend charts (emissions/diversion over time)
- ❌ Evidence upload to LGU records
- ❌ Land-use carbon modeling
- ❌ Benchmarking vs. other LGUs

### 🟠/🟢 H. Platform, Transparency & Ops
- ❌ **Public searchable registry** (all projects/credits/retirements) — biggest single trust signal
- ❌ DR runbook, backups/PITR, restore tests, performance-NFR validation
- ❌ Published methodology documentation (cited emission-factor sources)
- ❌ Docker / containerization

### 📱 I. Mobile — Not Started
- ❌ Mobile app (original plan: React Native; recommended pivot: responsive **PWA** from existing Vue SPA)
- ❌ Mobile login / wallet / marketplace / certificate viewer
- ❌ Push notifications

### ⏳ J. Future / Institutional (beyond software alone)
- ⏳ Blockchain tokenization / immutable registry
- ⏳ Article 6 / national-registry interoperability (API)
- ⏳ Accredited third-party VVB model (currently an internal verifier role)
- ⏳ Approved, peer-reviewed methodologies (currently simplified IPCC-style factors)
- ⏳ Independent governance / ICVCM Core Carbon Principles labeling
- ⏳ Double-claim / double-use prevention registry

---

## 4. Status at a Glance — by Module

| Module | Status | Score | What's missing |
|---|---|---|---|
| User Management & Security | ✅ | 9.5 | Nothing major |
| Project Registry | ✅ | 8.5 | Structured boundary, financials module |
| MRV system | ✅ | 9.0 | Simplified (not accredited) methodologies |
| Issuance & Certificates | ✅ | 9.5 | Nothing major |
| Verifier Panel | ✅ | 8.5 | Task queue, adjustable VERs, comment thread |
| Admin Panel | ✅ | 8.0 | AML, config UI, CSV export |
| Marketplace | 🟡→🆕 | 7.5→8.5 | ~~Seller payouts, seller dashboard~~ **now coded (Phase 2)**; offers/bidding, real-credit source still open |
| **Wallet & Finance** | 🟡→🆕 | **6.0→8.0** | ~~Server-side amounts, ledger, payouts, withdraw~~ **all coded (Phases 1–2)** — pending sandbox verification; admin finance console + external reconciliation still open |
| Analytics & Reports | 🟡 | 8.0 | Exportable reports |
| LGU tools | ✅ | 8.5 | Exports, land-use modeling, benchmarking |
| **Mobile** | ❌ | **0** | **Entire mobile/PWA app** |
| Regulatory readiness | 🟡 | 4.0 | Accreditation, methodologies, national-registry link |

---

## 5. Status at a Glance — by User Role

| Role | ✅ Can do today | ❌ Still missing |
|---|---|---|
| **Buyer / Investor** | Sign up, 2FA, KYC, browse, map, calculator, buy (PayMongo, 🆕 server-authoritative), wallet, receipts, certificates, retire | Real registry credits, full project detail page, ESG report export, BIR invoice, cart/bulk, watchlist, SDG filter (🆕 refunds/disputes now coded) |
| **Project Developer** | Submit projects, track status, MRV reporting, credit issuance via VER, 🆕 **cash-out/payout (KYB-gated)**, 🆕 **earnings dashboard (`/sales`)**, 🆕 **listing price/pause mgmt** | Edit/resubmit, comment thread (Phase 4); runtime-proven payout still pending |
| **Verifier** | Access projects, review, approve (mints credits), upload reports, review role applications | Task queue/SLA, adjustable VERs, validation checklist, evidence integrity checks |
| **Admin** | Audit logs, approve users/projects/KYC/roles, dashboard analytics | AML/fraud tools, system-config UI, report export, user lifecycle, finance console |
| **LGU User** | Emissions calculator, waste-diversion tracking, city ESG, project endorsements | ESG export, benchmarking, trend charts, land-use modeling |

---

## 6. Known Bugs / Cleanup (from `CONSOLE_ERRORS_AFTER_PAYMENT.md`)

**✅ As of 2026-06-13, Phase 0 resolved all six** (schema fixes applied live; webhook conflict markers removed; setup scripts realigned). Kept here for traceability.

| Issue | User impact | Status |
|---|---|---|
| 🔴 `credit_ownership` missing `updated_at` | Credits not added to portfolio after payment | ✅ Fixed — `updated_at` migration applied live (Phase 0) |
| 🟡 `credit_transactions` ↔ `profiles` join 400 | Receipt "Transaction not found" | ✅ Fixed — FKs added (`20260606000100`); fallback crutch removal is backlog #3 |
| 🟡 `wallet_accounts` 400 | Possible wallet display issues | ✅ Fixed — `wallet_address` column added |
| 🟡 `certificate_type` / `certificate_data` columns missing | None (fallback worked) | ✅ Fixed — `certificate_data` added (`20260606000000`) |
| ⚠️ `paymongo-webhook/index.ts` Git conflict markers | Blocked clean deployment | ✅ Resolved (Phase 0); ⚠️ webhook **not yet deployed/verified at runtime** |
| ⚠️ `package.json` setup scripts mismatch | Setup scripts fail | ✅ Fixed — `scripts/setup/` layout realigned |

---

## 7. Recommended Build Order (from the task list + playbook)

| Milestone | Focus | Why |
|---|---|---|
| **M1 — Money foundation** 🆕 *(code-complete, Phase 1)* | Server-side payments, webhook-as-truth, ledger, idempotency, reconciliation | Makes real money *safe* — the base everything else needs. **Built; awaits sandbox verification.** |
| **M2 — Get sellers paid** 🆕 *(code-complete, Phase 2)* | Seller payouts + KYB + sales dashboard + price mgmt **done**; real-credit supplier API **still open (Phase 3)** | Developers can now cash out in code → **awaits sandbox payout run** |
| **M3 — Workflow + reporting** 🟠 | Edit/resubmit, comment thread, verifier checklist, admin finance console, ESG report | Finish the core developer↔verifier↔buyer loops |
| **M4 — Compliance** 🟠 | System config, report exports, AML + DPA tooling, user lifecycle | Operate legally with real money |
| **M5 — Experience & LGU** 🟢 | Buyer cart/watchlist; LGU exports/charts | Adoption |
| **M6 — Scale & transparency** 🟢 | Public registry, DR/backups, oversell hardening | Production hardening |
| **M7 — Future** ⏳ | Blockchain, Article 6, VVB, accredited methodologies | Mostly business/legal, not code |

> **Single most impactful next step (updated 2026-06-13):** **Run the sandbox verification of M1 + M2.** The money foundation and seller payouts are now written and locally green (Phases 0–2) but **have never executed at runtime.** Deploy the Edge Functions, run one end-to-end sandbox purchase (`createMarketplaceCheckout` → webhook → `process_marketplace_purchase` → escrow → ledger, balanced + reconciles to 0) and one KYB-gated payout, then complete the gated cutover (`DEFERRED_BACKLOG.md` P2 → P1 → P3). Only then resume the roadmap at **Phase 3 (real credits)**.

---

## 8. The Honest Bottom Line

- **As a software product:** Carbonify is **strong and largely feature-complete** (8.7/10). It implements the full carbon-credit lifecycle with real, credible mechanics — and in *digital MRV* it's arguably ahead of where many established registries were until recently.
- **As a real, live platform:** the remaining work is **~40% software, ~60% business/legal** (per the go-live playbook). Two of the biggest software gaps — **money safety and seller payouts — are now closed in code** (Phases 0–2, pending sandbox verification). The remaining software gaps (real-credit API, public registry, admin finance/compliance tooling) are buildable. The institutional gaps (accredited VVBs, approved methodologies, national-registry interoperability, BSP/AMLA/DPA/BIR compliance) need **partners, lawyers, and accreditation — not just code.**
- **Fastest path to "real":** plug into an existing credit-supplier API (Carbonmark/Cloverly/Patch) for real verified credits + a licensed PH PSP (PayMongo/Xendit/EMI) for real money — rather than trying to become a registry from scratch.

---

## Reference Docs (in this folder)
- `CARBONIFY_SYSTEM_ANALYSIS.md` — full system analysis vs. SRD + market benchmark
- `IMPLEMENTATION_TASKLIST.md` — detailed prioritized backlog
- `CARBONIFY_BOARD_UPDATED.md` — original 14-week MVP plan vs. actual status
- `SYSTEM_GUIDE.md` — architecture & how the code is put together
- `PAYMENTS_ARCHITECTURE.md` — target real-money/wallet/ledger architecture
- `REAL_WORLD_GOLIVE_PLAYBOOK.md` — path to real credits + real money
- `VENDOR_SCORECARD_AND_TECH_DESIGN.md` — vendor evaluation + provider-agnostic tech design
- `CONSOLE_ERRORS_AFTER_PAYMENT.md` — known post-payment console errors & fixes
- `role-needs/` — per-role needs & gaps
