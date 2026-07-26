# Carbonify — Master Implementation Task List

> 🗄️ **Superseded (2026-07-03) by [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md).** Kept for history. For the
> current implemented-vs-not list by priority use **[GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md)**; current
> state is **[HANDOFF.md](HANDOFF.md)**.

**Purpose:** one place showing **what's already built** and **what still needs building**, prioritized.
**Updated:** June 2026

**Legend:** ✅ done · ☐ to do · 🟡 partial · Priority 🔴 high / 🟠 medium / 🟢 low / ⏳ future · Effort S/M/L

---

# PART A — ✅ Already Implemented

### Authentication & Security
- ✅ Email/password sign‑up, login, sessions, logout
- ✅ Role‑based access control — 6 roles, permissions, route guards, RLS
- ✅ Password reset (forgot‑password + reset‑password flow)
- ✅ TOTP 2FA — enrollment, login challenge, **strict aal2 router enforcement**
- ✅ KYC — application, admin review/approval, purchase gate
- ✅ Organization profiles (name/type/address)
- ✅ Audit logging across auth, projects, MRV, KYC, payments, roles, password, MFA

### Projects & Registration
- ✅ Project submission form (title, geo‑coordinates, barangay, municipality, type, dates, host entity)
- ✅ Predefined PH project types (dropdown + DB constraint)
- ✅ Document uploads (PDD, baseline, additionality, leakage, safeguards, feasibility, LGU endorsement, land ownership, ECC, MOA)
- ✅ Validation workflow + statuses (Draft → Submitted → In Review → Needs Revision → Validated → Rejected)
- ✅ Project progress tracker (Registration → Validation → Verification → Issuance → Trading)
- ✅ Project risk/feasibility scoring (verifier‑set; shown as marketplace badges)

### MRV (Monitoring, Reporting, Verification)
- ✅ Monitoring reports (period, activity data, photo/log evidence)
- ✅ **Server‑side** emission‑reduction calculation (RPC + methodology factors)
- ✅ Verifier MRV review + VER approval
- ✅ Decoupled issuance — credits mint only on verifier VER approval
- ✅ Time‑stamped audit trail

### Issuance & Certificates
- ✅ Certificate generation with **carbon‑unit serial numbers**
- ✅ QR code + tamper‑evident digital signature
- ✅ Public certificate verification page + RPC (no login needed)
- ✅ PDF certificate download

### Trading & Marketplace
- ✅ Browse marketplace, filter by location/price, interactive **map**
- ✅ Purchase (PayMongo), ownership transfer, transaction IDs, balance update
- ✅ Listings auto‑created on issuance
- ✅ Wallet, receipts, portfolio
- ✅ Retirement + **atomic anti‑double‑counting** + retirement certificate

### Calculator, Analytics, Notifications, LGU, UX
- ✅ Carbon calculator (PH factors)
- ✅ Dashboards (admin, developer, platform overview) + charts
- ✅ Email + dashboard notifications (triggers)
- ✅ LGU tools — MSW calculator, records, waste diversion, city ESG, host endorsements
- ✅ Onboarding guide; role‑organized nav (profile‑dropdown grouping)

---

# PART B — ☐ To Be Implemented (prioritized)

## B1. Money Operations 🔴 *(foundation for real money)*
- ☐ 🔴 L — Move payment logic **server‑side** (payment intents via Edge Functions; client never sets amounts)
- ☐ 🔴 L — **Signed webhook = source of truth** for payments (verify + idempotent)
- ☐ 🔴 M — **Double‑entry ledger** + idempotency keys
- ☐ 🔴 M — **Reconciliation** job (ledger vs provider settlement)
- ☐ 🔴 M — **Escrow** hold/release for marketplace trades
- ☐ 🔴 L — **Partner‑custodied wallet** integration (licensed PSP/EMI holds funds)
- ☐ 🔴 L — **Seller payouts** (developer KYB + disbursement + hold periods + payout history) *(Developer)*
- ☐ 🔴 L — **Admin finance console** (transactions, revenue, payouts, refunds, reconciliation) *(Admin)*
- ☐ 🔴 M — **Seller sales/earnings dashboard** *(Developer)*
- ☐ 🔴 M — **Listing price/inventory management** (edit price, pause/relist) *(Developer)*
- ☐ 🟠 M — **Refund / dispute** flow *(Buyer/Admin)*
- ☐ 🟠 M — **Tax‑compliant invoices / BIR official receipt** *(Buyer)*
- ☐ 🟠 M — Purchase‑side **atomic oversell hardening** (consolidate `available_credits`/`credits_available`)

## B2. Real Credits & Buyer Trust 🔴
- ☐ 🔴 L — **Credit‑supplier API** integration (real registry credits + retirement) — Track A *(Buyer)*
- ☐ 🔴 M — **Provider abstraction layer** (`CreditSupplier` + `PaymentProvider` + mocks)
- ☐ 🔴 M — **Full project detail page** (documents, methodology, map, vintage, co‑benefits) *(Buyer)*
- ☐ 🔴 M — **ESG / offset report** export (PDF/CSV) *(Buyer)*
- ☐ 🟠 M — **SDG impact data** capture + real marketplace filter *(Buyer)*

## B3. Workflow Completeness 🟠 *(developer ↔ verifier)*
- ☐ 🔴 S — **Edit & resubmit** after "needs revision" *(Developer)*
- ☐ 🔴 M — **Two‑way comment/request thread** developer ↔ verifier *(Developer/Verifier)*
- ☐ 🔴 M — **Validation checklist/rubric** (structured, scored) *(Verifier)*
- ☐ 🔴 M — **Calculation transparency + adjustable VERs** before approval *(Verifier)*
- ☐ 🟠 S — **Per‑project verification timeline** view *(Verifier)*
- ☐ 🟠 M — **Verifier queue** — assignment, filters, aging/SLA *(Verifier)*
- ☐ 🟠 M — **Evidence integrity checks** (EXIF geotag/timestamp, duplicate detection) *(Verifier)*
- ☐ 🟠 S — **MRV reminders** (scheduled, email + dashboard) *(Developer)*
- ☐ 🟠 M — **Methodology** selection/reference *(Developer/Verifier)*
- ☐ 🟠 M — **Project boundary** (map polygon) *(Developer)*
- ☐ 🟠 M — **Financials** persisted + displayed + projection upload *(Developer/Buyer)*
- ☐ 🟠 S — **Document re‑upload/versioning** *(Developer)*

## B4. Admin & Compliance 🔴/🟠
- ☐ 🔴 M — **System config UI** (emission factors, fees, KYC peso tiers, project types) *(Admin)*
- ☐ 🔴 M — **Regulatory & business reports** + CSV/PDF exports *(Admin)*
- ☐ 🔴 M — **AML** screening/monitoring + **DPA** data‑subject tooling (consent/export/delete) *(Admin)*
- ☐ 🟠 M — **User lifecycle** (suspend/ban/reactivate, secure impersonation, bulk ops) *(Admin)*
- ☐ 🟠 M — **Fraud/risk dashboard** + anomaly alerts *(Admin)*
- ☐ 🟠 M — **Dispute‑resolution console** *(Admin)*
- ☐ 🟠 S — **Audit log** search/filter/export *(Admin)*
- ☐ 🟠 M — **Granular RBAC / segregation of duties** *(Admin)*
- ☐ 🟢 S — **Broadcast announcements** / system banner *(Admin)*
- ☐ 🟢 M — **Feature flags / maintenance mode** *(Admin)*
- ☐ 🟢 S — **Project moderation** (flag/suspend listing) *(Admin)*

## B5. Buyer Experience 🟠/🟢
- ☐ 🟠 M — **Cart / multi‑item checkout** + **RFQ / bulk** quote *(Buyer)*
- ☐ 🟠 S — **Shareable retirement/claim** page + badge *(Buyer)*
- ☐ 🟢 S — **Watchlist** + new‑listing/price alerts *(Buyer)*
- ☐ 🟢 M — **Recurring / auto‑offset** subscription *(Buyer)*
- ☐ 🟢 S — **Price history / comparison** *(Buyer)*
- ☐ 🟢 S — **Calculator → checkout** one‑click offset *(Buyer)*
- ☐ 🟢 M — **Mobile/PWA** improvements *(Buyer)*

## B6. LGU Tools 🟠/🟢
- ☐ 🟠 M — **City ESG report** export (PDF/CSV) *(LGU)*
- ☐ 🟠 M — **LGU community‑project tracker** *(LGU)*
- ☐ 🟢 S — **Trend charts** (emissions/diversion over time) *(LGU)*
- ☐ 🟢 S — **Evidence upload** to LGU records *(LGU)*
- ☐ 🟠 L — **Land‑use carbon modeling** *(LGU)*
- ☐ 🟢 M — **Benchmarking** vs other LGUs *(LGU)*

## B7. Platform, Transparency & Ops 🟠/🟢
- ☐ 🟠 M — **Public searchable registry** (all projects/credits/retirements) — biggest trust signal
- ☐ 🟠 M — **DR runbook**, backups/PITR, restore tests, performance‑NFR validation
- ☐ 🟢 S — **Methodology documentation** (publish cited emission‑factor sources)
- ☐ 🟢 M — **Docker / containerization** for portability

## B8. Future / Institutional ⏳ *(beyond software alone)*
- ☐ ⏳ L — Blockchain **tokenization / immutable registry**
- ☐ ⏳ L — **Article 6 / national‑registry interoperability** (API)
- ☐ ⏳ L — **Accredited third‑party VVB** model
- ☐ ⏳ L — **Approved, peer‑reviewed methodologies** (replace simplified factors)

---

# PART C — Recommended Build Order (milestones)

| Milestone | Focus | Key tasks |
|---|---|---|
| **M1 — Money foundation** | Make real money safe | B1: server‑side payments, webhook‑as‑truth, ledger, idempotency, reconciliation, provider abstraction (B2) |
| **M2 — Get paid / get trust** | Close the two biggest blockers | B1 seller payouts + sales dashboard + price mgmt; B2 real‑credit supplier API + project detail page |
| **M3 — Workflow + reporting** | Finish core loops | B3 edit/resubmit, comment thread, verifier checklist + adjustable VERs; B1 admin finance console; B2 ESG report |
| **M4 — Compliance** | Operate legally | B4 system config, reports/exports, AML + DPA tooling, user lifecycle |
| **M5 — Experience & LGU** | Adoption | B5 buyer experience; B6 LGU exports/tracker/charts |
| **M6 — Scale & transparency** | Production hardening | B7 public registry, DR/backups, B1 oversell hardening; observability |
| **M7 — Future** | Institutional depth | B8 blockchain, Article 6, VVB, methodologies (mostly business/legal) |

> **Single most impactful next step:** **M1 (money foundation) + seller payouts** — today developers cannot get paid and admins cannot see money, which blocks Carbonify from being a real marketplace. Everything else builds cleanly on that base.

---

## Reference docs
- Platform analysis + market benchmark → [`ECOLINK_SYSTEM_ANALYSIS.md`](ECOLINK_SYSTEM_ANALYSIS.md) *(the link read `CARBONIFY_SYSTEM_ANALYSIS.md` and resolved to nothing until 2026-07-26; the file carries the repo's internal name)*
- Payments architecture → [`PAYMENTS_ARCHITECTURE.md`](PAYMENTS_ARCHITECTURE.md)
- Real‑world go‑live → [`REAL_WORLD_GOLIVE_PLAYBOOK.md`](REAL_WORLD_GOLIVE_PLAYBOOK.md)
- Vendor scorecard + tech design → [`VENDOR_SCORECARD_AND_TECH_DESIGN.md`](VENDOR_SCORECARD_AND_TECH_DESIGN.md)
- Per‑role needs → [`role-needs/`](role-needs/)
