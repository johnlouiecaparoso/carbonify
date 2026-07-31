# 🧭 Carbonify / Carbonify — Updated Development Board

> 🗄️ **Historical / superseded (2026-07-03).** This board compares the codebase to the original
> 14-week MVP plan and is kept for history. For the current status and plan use
> **[GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md)** and **[HANDOFF.md](HANDOFF.md)**.

> **Updated:** 2026-06-05
> **Source:** Reconciled against the original `Carbonify_Notion_Template.md` and the original `Carbonify_Development_Plan.pdf`.
> **Purpose:** Show what the codebase **actually implements today** vs. the original 14-week MVP plan, then re-plan the remaining work.

---

## 📋 Overview

The original plan targeted a **14-week, 7-sprint MVP** for a Philippine carbon-credit registry + marketplace ("Carbonify"). The product is now implemented as **Carbonify** — a Vue 3 + Supabase single-page app. Most of the original MVP scope is **done and exceeded** (full MRV module, verifier-gated issuance, tamper-evident QR certificates, KYC, 6 user roles, real payment gateway). The remaining work is no longer "build the MVP" — it is **production-hardening money flows, institutional compliance, and a mobile app.**

### ⚠️ Key deviations from the original plan
| Plan said | Built instead | Note |
|---|---|---|
| Auth: Firebase / Auth0 | **Supabase Auth** | Aligns with the PDF's "Authentication: Supabase". The Notion doc's Firebase/Auth0 line is superseded. |
| Payments: GCash/Maya **SDK** (direct) | **PayMongo** gateway (GCash, Maya, cards as methods) | Direct GCash/Maya SDK custody not pursued; PayMongo is the PSP. |
| Mobile: **React Native** app | **Not started** | Web SPA only. Mobile MVP (Sprint 6) is the largest unbuilt block. |
| KYC: Persona/Veriff/Jumio | **In-house KYC form + admin review** | No 3rd-party ID-verification integration yet. |
| Blockchain certificates (optional) | **SHA-256 tamper-evident signature + QR** | Blockchain explicitly deferred. |

**Legend:** ✅ Implemented · 🟡 Partial · ❌ Not implemented

---

## 🚀 Sprints Overview — Original Plan vs. Status

### 👤 Sprint 1 (Weeks 1–2): User System & Project Submission — ✅ DONE
- [x] ✅ Multi-role user authentication — *Supabase Auth (not Firebase/Auth0)* — `src/services/authService.js`
- [x] ✅ User registration/login with email — `src/components/auth/LoginForm.vue`
- [ ] 🟡 Registration with **phone** — email only; no phone/OTP registration
- [x] ✅ User roles: Admin, Verifier, Developer, Buyer (**+ LGU User, General User** = 6 roles) — `src/constants/roles.js`, `src/middleware/roleGuard.js`
- [x] ✅ Project submission form — `src/views/SubmitProjectView.vue`, `src/services/projectService.js`
- [x] ✅ Document upload and validation — 9 doc types (PDD, baseline, additionality, ECC, LGU endorsement, etc.)
- [x] ✅ **Bonus:** TOTP 2FA/MFA with aal2 step-up — `src/services/mfaService.js`
- [x] ✅ **Bonus:** Password reset flow — `src/views/ForgotPasswordView.vue`
- [x] ✅ **Bonus:** KYC application + level gating — `src/services/kycService.js`, `src/views/KycView.vue`

### 💰 Sprint 2 (Weeks 3–4): Wallet System + Payments — 🟡 PARTIAL
- [x] ✅ Wallet backend with balance tracking — `wallet_accounts`, `src/services/walletService.js`
- [x] ✅ GCash / Maya integration — *via PayMongo (sandbox-capable), not direct SDK* — `src/services/paymongoService.js`, `supabase/functions/paymongo-checkout/`
- [x] ✅ Add funds (top-up) — `src/components/wallet/TopUp.vue`, `paymongo-webhook`
- [ ] 🟡 **Withdraw** — UI exists (`src/components/wallet/Withdraw.vue`) but no backend disbursement
- [x] ✅ Wallet activity logs per user — `wallet_transactions`, `src/services/transactionHistoryService.js`
- [ ] ❌ Server-side payment amounts (set client-side today — **production blocker**)
- [ ] ❌ Double-entry ledger, idempotency keys, reconciliation

### 🧾 Sprint 3 (Weeks 5–6): Verifier Portal — ✅ DONE (+ exceeded)
- [x] ✅ Verifier dashboard — `src/views/VerifierPanel.vue`, `src/components/verifier/MrvReviewDashboard.vue`
- [x] ✅ Project assignment/access workflow — RLS `is_mrv_staff()`; verifiers read all projects
- [x] ✅ Verification form & certificate upload — `src/components/verifier/ProjectAssessmentPanel.vue`
- [x] ✅ Email notifications on status — `src/services/notificationService.js`, `supabase/functions/send-approval-email/`
- [x] ✅ **Bonus:** Full MRV module — server-side emission-reduction calc, methodology factors, VER approval mints credits via DB trigger
- [ ] ❌ Verifier task queue / SLA aging
- [ ] ❌ Adjustable VERs before approval; two-way comment thread

### 🛒 Sprint 4 (Weeks 7–8): Carbon Credit Marketplace — 🟡 MOSTLY DONE
- [x] ✅ Credit listings + filter system (location, price, category) — `src/views/MarketplaceViewEnhanced.vue`, `src/services/marketplaceService.js`
- [x] ✅ Buy transaction logic with pricing — PayMongo checkout → `credit_transactions`
- [x] ✅ Transaction ledger (buyer & seller) — `credit_ownership`, serials `ECO-TXN-*`
- [x] ✅ Generate receipts — `src/services/receiptService.js`, `src/views/ReceiptView.vue`
- [x] ✅ **Bonus:** Interactive Leaflet project map — `src/views/ProjectsMapView.vue`
- [ ] 🟡 Seller sales/earnings dashboard (transactions recorded; no seller UI — `SalesView.vue` is hidden)
- [ ] 🟡 Listing price-edit / pause-relist; oversell hardening
- [ ] ❌ Seller payouts (developers cannot cash out); offers/bidding

### 📊 Sprint 5 (Weeks 9–10): Admin + Analytics — ✅ MOSTLY DONE
- [x] ✅ Admin control panel (users, projects, reports) — `src/components/admin/AdminDashboard.vue`
- [x] ✅ User/project approval workflows — `src/components/admin/ProjectApprovalPanel.vue`, `KycReviewPanel.vue`, `RoleApplications.vue`
- [x] ✅ Data charts (carbon offset, revenue, credit sales) — Chart.js/vue-chartjs in `src/components/charts/`
- [x] ✅ Audit logs — `audit_logs`, `src/components/admin/AuditLogsView.vue`
- [ ] 🟡 **Export CSV reports** — analytics shown on-screen; no CSV/PDF export
- [ ] ❌ AML screening, user suspend/ban, system-config UI (emission factors hardcoded in migration)

### 📱 Sprint 6 (Weeks 11–12): Mobile App MVP — ❌ NOT STARTED
- [ ] ❌ React Native app: login, wallet, project viewer
- [ ] ❌ GCash/Maya integration (mobile)
- [ ] ❌ Push notification setup
- [ ] ❌ In-app certificate viewer
- [ ] 💡 *Mitigation: the Vue SPA is responsive; a mobile PWA could be a faster path than React Native.*

### 🧪 Sprint 7 (Weeks 13–14): QA & Launch — 🟡 PARTIAL
- [x] ✅ Unit/integration test harness — Vitest, MSW, Playwright configured (`package.json`)
- [ ] 🟡 UAT — not formally recorded
- [ ] 🟡 Bug-fix/finalize — ongoing; financial flows not production-safe
- [ ] ❌ Deploy **mobile** (no mobile app)
- [x] ✅ Web deployable (Vite build; Vercel-target per plan)

---

## 📌 Module Scorecard (against PDF "Key Modules")

| # | Module | Status | Score | Evidence |
|---|--------|--------|-------|----------|
| 1 | User Management | ✅ | 9.5 | 6 roles, MFA, KYC, audit — `roles.js`, `mfaService.js`, `kycService.js` |
| 2 | Project Registry | ✅ | 8.5 | submission, 9 doc types, status workflow, progress tracker |
| 3 | Marketplace | 🟡 | 7.5 | listings, filters, buy, receipts, map; no seller payouts |
| 4 | Wallet & Finance | 🟡 | 6.0 | balance, top-up, PayMongo; **no server-side amounts, ledger, payouts, withdraw** |
| 5 | Admin Panel | ✅ | 8.0 | dashboard, approvals, audit; no AML / config UI / CSV export |
| 6 | Verifier Panel | ✅ | 8.5 | dashboard, MRV review, VER→credit issuance, email |
| 7 | Analytics & Reports | 🟡 | 8.0 | charts, QR certs, calculator; **no exportable reports** |
| — | *Bonus: MRV module* | ✅ | 9.0 | server-side ER calc, methodology factors, VER minting |
| — | *Bonus: LGU tools* | ✅ | 8.5 | emissions calculator, waste diversion, ESG, endorsements |
| — | *Bonus: Certificates* | ✅ | 9.5 | serials, QR, SHA-256 signature, public verify, PDF |

---

## 👥 Feature Set by User Type — Status

### General Users / Buyers
✅ Sign up · ✅ View credits · ✅ Wallet · ✅ Buy via GCash/Maya (PayMongo) · ✅ View certificates · ✅ Receipts · ✅ KYC-gated trading
❌ Refunds · ❌ Offers/negotiation

### Project Developers
✅ Submit projects · ✅ Track status · ✅ Credit issuance (via VER) · ✅ MRV reporting
🟡 Sales dashboard (no UI) · ❌ Cash-out/payout · ❌ Price/inventory management · ❌ Seller KYB

### Verifiers
✅ Access projects · ✅ Review · ✅ Approve (mints credits) · ✅ Upload reports · ✅ Review role applications
❌ Task queue/SLA · ❌ Adjustable VERs · ❌ Validation checklist

### Buyers / Investors
✅ Search projects · ✅ Buy credits · ✅ Download receipts · ✅ Portfolio + retirement
❌ ESG report export · ❌ SDG impact filtering

### Admin
✅ Audit logs · ✅ Approve users/projects/KYC/roles · ✅ Dashboard analytics
🟡 Generate reports (no export) · ❌ AML/fraud tools · ❌ System-config UI

### LGU Users *(role not in original plan — added)*
✅ Emissions calculator · ✅ Waste-diversion tracking · ✅ City ESG summary · ✅ Project endorsements
❌ ESG export · ❌ LGU benchmarking / trend charts

---

## 🛠 Tech Stack — Plan vs. Actual

| Layer | Plan | Actual | Status |
|---|---|---|---|
| Frontend Web | Vue.js | Vue 3.5 + Pinia + Vue Router | ✅ |
| Backend | Supabase | Supabase + Edge Functions | ✅ |
| Database | PostgreSQL/Supabase | PostgreSQL (Supabase) w/ RLS | ✅ |
| File Storage | AWS S3 / Supabase | Supabase Storage | ✅ |
| Auth | Supabase | Supabase Auth + TOTP MFA | ✅ |
| KYC | Persona/Veriff/Jumio | In-house form + admin review | 🟡 |
| Payments | GCash/Maya SDK | PayMongo (GCash/Maya/cards) | 🟡 |
| Hosting | Vercel | Vite build (Vercel-ready) | ✅ |
| PDF + QR | HTML2PDF.js + QR libs | jsPDF + qrcode | ✅ |
| Charts | — | Chart.js + vue-chartjs | ✅ |
| Maps | — | Leaflet | ✅ (bonus) |
| Mobile | React Native | — | ❌ |

---

## 🗺 Re-Planned Roadmap (remaining work)

The 14-week MVP is effectively complete on web. The next phases move from "working product" to "accredited, real-money marketplace."

### 🔴 Phase A — Money Foundation (production blocker)
- [ ] Move payment amounts server-side (Edge Functions authoritative)
- [ ] Signed webhook as source of truth + idempotency keys
- [ ] Double-entry `ledger_entries` table; stop direct balance writes
- [ ] Daily reconciliation vs. PayMongo settlement
- [ ] Escrow hold/release for marketplace trades
- [ ] *See `docs/PAYMENTS_ARCHITECTURE.md`*

### 🟠 Phase B — Get Sellers Paid
- [ ] Seller payout / disbursement service
- [ ] Withdraw backend (complete the existing UI)
- [ ] KYB (business verification) for sellers
- [ ] Seller sales/earnings dashboard (un-hide `SalesView.vue`)
- [ ] Listing price-edit & inventory management; oversell hardening

### 🟡 Phase C — Trust & Compliance
- [ ] Public searchable registry (projects/credits/retirements)
- [ ] Double-claim/retirement uniqueness prevention
- [ ] AML/sanctions screening; velocity limits
- [ ] Data Privacy Act tooling (consent, export, delete)
- [ ] Admin system-config UI (emission factors, fees, KYC tiers)
- [ ] CSV/PDF report export (admin + buyer ESG report + LGU ESG report)
- [ ] 3rd-party KYC (Persona/Veriff/Jumio)

### 📱 Phase D — Mobile
- [ ] Decide: **React Native vs. responsive PWA** (PWA likely faster from existing Vue SPA)
- [ ] Login, wallet, marketplace, certificate viewer
- [ ] Push notifications

### 🟢 Phase E — Future / Optional
- [ ] Blockchain tokenization (immutable ledger)
- [ ] Article 6 / national-registry interoperability
- [ ] Verifier SLA queue, adjustable VERs, two-way comment threads
- [ ] LGU benchmarking & land-use carbon modeling

---

## 📎 Reference Documents (in `docs/`)
- `CARBONIFY_SYSTEM_ANALYSIS.md` — full system analysis vs. SRD
- `IMPLEMENTATION_TASKLIST.md` — detailed prioritized backlog
- `PAYMENTS_ARCHITECTURE.md` — target payment/ledger architecture
- `REAL_WORLD_GOLIVE_PLAYBOOK.md` — go-live playbook
- `VENDOR_SCORECARD_AND_TECH_DESIGN.md` — vendor/tech design
- `role-needs/` — per-role requirements
