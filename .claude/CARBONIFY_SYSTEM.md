# Carbonify — System Understanding (for AI Assistants)

> **Purpose:** This file gives any AI assistant a complete understanding of what Carbonify is, how it's built, how every layer works, and how to navigate the codebase. Read this first before making any changes.
>
> **Read first:** [docs/CARBONIFY_OVERVIEW.md](../docs/CARBONIFY_OVERVIEW.md) for the plain-language system map, [docs/HANDOFF.md](../docs/HANDOFF.md) for the current state and roadmap, and [docs/GO_LIVE_ROADMAP.md](../docs/GO_LIVE_ROADMAP.md) for the launch blockers.
>
> **Last updated:** 2026-07-26

---

## 0. Source Of Truth

- Treat [docs/HANDOFF.md](../docs/HANDOFF.md) as the current operating snapshot.
- Treat [docs/GO_LIVE_ROADMAP.md](../docs/GO_LIVE_ROADMAP.md) as the prioritized list of remaining work.
- Treat [docs/dev/README.md](../docs/dev/README.md) and the docs under `docs/dev/` as the implementation details.
- If a planning doc conflicts with the current handoff or the code, prefer the handoff and the code.
- Do not move money logic into Vercel or the browser; keep settlement server-authoritative.
- When editing code, make the smallest change that fixes the problem and validate the touched slice.

## 1. What is Carbonify?

**Carbonify** (repo/internal name: **ecolink**; `package.json` name: `carbonify`) is a **Philippine carbon-credit registry and marketplace** web application.

In one sentence: a web platform where climate projects are registered, validated, and verified (MRV), carbon credits are issued with tamper-evident QR-verifiable certificates, and buyers purchase and permanently retire those credits to offset their emissions — with real money handled server-side through PayMongo.

### The Problem it Solves
Carbon credits let organizations pay for verified climate action (reforestation, biochar, waste diversion, etc.). For a credit to be trustworthy:
1. The project must be **real and additional** (wouldn't have happened anyway)
2. Its impact must be **measured, reported, and independently verified** (MRV)
3. Each credit must be **uniquely tracked** (no double-selling or double-claiming)
4. The **money must move safely** between buyer, platform, and project developer

Carbonify puts all four in one system: Registration → Validation → Monitoring/Verification → Issuance → Trading → Retirement.

### The Carbon Credit Lifecycle
```
Register  →  Validate  →  Monitor & Verify (MRV)  →  Issue  →  Trade  →  Retire
(developer)  (verifier)    (developer + verifier)     (auto)   (buyer)  (buyer)
```

### Current Status
**Feature-complete.** The money path is proven and hardened (all flows reconcile to zero, financial tables are server-write-only via RLS). What remains is mostly external/ops-legal (production PayMongo credentials, real credit registry integration, accreditation, AML, penetration test) rather than application code.

---

## 2. Tech Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend** | Vue 3 (`<script setup>`), Vue Router 4, Pinia 3 | SPA with `@` → `src` alias |
| **Build** | Vite 7 | Dev server on port 5173 |
| **Backend** | Supabase | Postgres + Auth + Edge Functions (Deno) + Storage |
| **Payments** | PayMongo | Cards, GCash, Maya — test/live via Supabase Edge Functions |
| **Maps** | Leaflet | Project location pins + boundary polygons |
| **Charts** | Chart.js + vue-chartjs | Analytics dashboards (Line, Doughnut controllers) |
| **Documents** | jsPDF, qrcode | Certificate/receipt PDF generation + QR codes |
| **Error Tracking** | Sentry (`@sentry/vue`) | Live error monitoring |
| **Unit Tests** | Vitest + @vue/test-utils + happy-dom/jsdom | ~313+ unit tests |
| **E2E Tests** | Playwright | Browser-level end-to-end tests |
| **Linting** | ESLint 9 (flat config) + Prettier | `npm run lint` / `npm run format` |
| **Hosting** | Vercel | Frontend-only deployment |
| **Node** | `^20.19.0 || >=22.12.0` | — |

### Key Dependencies (from package.json)
**Runtime:** `vue@^3.5`, `vue-router@^4.5`, `pinia@^3.0`, `@supabase/supabase-js@^2.57`, `chart.js@^4.5`, `vue-chartjs@^5.3`, `leaflet@^1.9`, `jspdf@^3.0`, `qrcode@^1.5`, `@sentry/vue@^8.55`, `dotenv`
**Dev:** `vite@^7.0`, `vitest@^1.0`, `@playwright/test@^1.40`, `eslint@^9.31`, `prettier@3.6`, `msw@^2.0`

---

## 3. Project Directory Structure

```
carbonify/
├── index.html                    # Vite entry HTML
├── package.json                  # Carbonify, private, module
├── vite.config.js                # @ alias, manualChunks, devtools
├── vitest.config.js              # Unit test config
├── playwright.config.js          # E2E test config
├── eslint.config.js              # Flat ESLint config
├── vercel.json                   # Vercel SPA routing + headers
│
├── src/
│   ├── main.js                   # App bootstrap (Vue + Pinia + Router + Sentry)
│   ├── App.vue                   # Root component (~39KB — shell, auth listener, nav)
│   │
│   ├── views/                    # 54 route-level page components
│   ├── components/               # Reusable UI (16 subdirectories + 6 root files)
│   │   ├── layout/               # Header.vue, Footer (nav, profile dropdown)
│   │   ├── admin/                # AdminDashboard.vue
│   │   ├── auth/                 # Login/register helpers
│   │   ├── charts/               # Chart.js wrappers
│   │   ├── wallet/               # Wallet UI components
│   │   ├── verifier/             # Verifier-specific components
│   │   ├── search/               # AdvancedSearch.vue (dead, pinned by manualChunks)
│   │   ├── ui/                   # AccessibleModal.vue, generic UI
│   │   ├── tables/               # Reusable data tables
│   │   └── ...                   # map, mobile, project, user, dashboard, dev, account
│   │
│   ├── services/                 # 65+ service files (business logic layer)
│   │   ├── supabaseClient.js     # Supabase client singleton
│   │   ├── authService.js        # Auth operations
│   │   ├── projectService.js     # Project CRUD
│   │   ├── marketplaceService.js # Marketplace operations
│   │   ├── certificateService.js # Certificate generation
│   │   ├── payments/             # PaymentProvider abstraction (Phase 1)
│   │   ├── payouts/              # PayoutProvider abstraction (Phase 2)
│   │   ├── credits/              # CreditSupplier abstraction (Phase 3, partial)
│   │   └── ...                   # 60+ more domain services
│   │
│   ├── store/                    # Pinia stores
│   │   ├── userStore.js          # Auth/profile/role state (primary store)
│   │   ├── cartStore.js          # Shopping cart state
│   │   ├── preferencesStore.js   # Theme/accessibility preferences
│   │   └── errorStore.js         # Error state (currently unused, ErrorBoundary commented out)
│   │
│   ├── router/
│   │   └── index.js              # Vue Router + role/MFA guards (~22KB)
│   │
│   ├── constants/                # Domain enums and constants
│   │   ├── roles.js              # 6 roles: general_user, buyer_investor, project_developer, verifier, admin, lgu
│   │   ├── projectTypes.js       # 7 PH DENR/CCC-aligned project types
│   │   ├── projectRegistry.js    # Methodology enum (Verra, Gold Standard, etc.)
│   │   ├── mrv.js                # MRV constants, reduction type suggestions
│   │   ├── sdgs.js               # UN Sustainable Development Goals
│   │   ├── biomass.js            # Biomass feedstock types
│   │   ├── farmer.js             # Farmer portal constants
│   │   ├── plans.js              # Subscription tiers (Free, Pro, Business)
│   │   ├── verificationChecklist.js # Verifier scoring rubric
│   │   └── ...                   # cart.js, lgu.js
│   │
│   ├── config/
│   │   ├── environment.js        # VITE_* env var reader
│   │   ├── production.js         # Production flags
│   │   └── database.js           # Database config helpers
│   │
│   ├── middleware/
│   │   └── roleGuard.js          # Route-level role enforcement
│   │
│   ├── composables/              # Vue composables
│   ├── utils/                    # Utility helpers (analytics, formatters)
│   ├── styles/                   # Global CSS
│   ├── assets/                   # Static assets
│   ├── pages/                    # Additional page components
│   └── test/                     # Test utilities and mocks
│
├── supabase/
│   ├── migrations/               # 95 SQL migrations (applied by hand, NOT via CLI)
│   ├── functions/                # 7 Deno Edge Functions
│   │   ├── paymongo-checkout/    # Server-authoritative checkout (recomputes amount)
│   │   ├── paymongo-webhook/     # Signed webhook handler (source of truth)
│   │   ├── paymongo-reconcile/   # External PSP settlement reconciliation
│   │   ├── paymongo-resettle/    # Heals orphaned paid intents
│   │   ├── process-payouts/      # Seller payout worker
│   │   ├── send-approval-email/  # Resend email sender (JWT-required)
│   │   └── account-deletion/     # DPA erasure worker
│   ├── diagnostics/              # Read-only schema audit scripts
│   └── cutover/                  # Financial-write lockdown SQL
│
├── scripts/
│   └── setup/                    # setup-supabase.js, setup-test-accounts.js
│
├── docs/                         # 40+ documentation files + 3 subdirectories
│   ├── dev/                      # Developer docs (ARCHITECTURE, DATABASE, DEPLOYMENT, etc.)
│   ├── user-guide/               # Per-role user guides
│   ├── role-needs/               # Per-role gap analysis
│   ├── HANDOFF.md                # Master handoff document (~98KB, session-by-session history)
│   ├── ABOUT_CARBONIFY.md        # Product overview
│   ├── SYSTEM_GUIDE.md           # Architecture guide
│   └── ...                       # 35+ more docs
│
├── public/                       # Static public assets
├── dist/                         # Production build output
└── .github/workflows/            # CI pipeline
```

---

## 4. User Roles (6 Roles)

Defined in `src/constants/roles.js`. Route protection in `src/router/index.js` + `src/middleware/roleGuard.js`.

| Role | Key | What They Do |
|---|---|---|
| **General User** | `general_user` | Browse marketplace, manage profile, basic account access |
| **Buyer / Investor** | `buyer_investor` | Buy credits (card/GCash/Maya/wallet), portfolio, retire, certificates, watchlist, investor portal (Pro-gated) |
| **Project Developer** | `project_developer` | Submit projects, upload compliance docs, MRV reports, earn + sell credits, manage listings, view earnings, offtake agreements |
| **Verifier** | `verifier` | Review project submissions, scored rubric, approve VERs (mints credits), set credit price, review developer role applications |
| **Administrator** | `admin` | User management, KYC/KYB review, finance console, refunds/disputes, system config, audit logs |
| **LGU** | `lgu` | Municipal waste emissions calculator, waste-diversion tracking, city ESG summary, project endorsements |
| **Farmer** | `farmer` | Plantation parcel register, delivery logging, payment tracking, carbon participation view |

### Identity & Security Layers
- **Authentication:** Supabase Auth (email/password, OAuth, phone callback)
- **MFA/2FA:** TOTP with strict `aal2` step-up enforcement in the router guard
- **KYC:** Identity verification required to buy/trade (application → admin review)
- **KYB:** Business verification required for developer payouts (application → admin review)
- **RLS:** Row-Level Security on all Supabase tables, role-gated
- **Finance-restricted roles:** Router enforces finance-restricted role gating

---

## 5. All Views / Pages (54 View Files)

| Route | View File | Description |
|---|---|---|
| `/home` | `HomepageView.vue` | Landing page with live stats from `public_market_stats()` |
| `/login` | `LoginView.vue` | Email/password + MFA login |
| `/register` | `RegisterView.vue` | User registration |
| `/register/farmer` | (RegisterView variant) | Farmer self-registration |
| `/forgot-password` | `ForgotPasswordView.vue` | Password reset request |
| `/reset-password` | `ResetPasswordView.vue` | Password reset completion |
| `/auth/callback` | `AuthCallbackView.vue` | OAuth/phone callback handler |
| `/mfa-challenge` | `MfaChallengeView.vue` | TOTP 2FA challenge |
| `/profile` | `ProfileView.vue` | Profile + settings (~62KB, with Privacy & Data tab for DPA) |
| `/marketplace` | `MarketplaceViewEnhanced.vue` | Main marketplace (~69KB) with filters, map, SDG, source |
| `/market` | `MarketDashboardView.vue` | Public market dashboard (supply, price range, retirements) |
| `/cart` | `CartView.vue` | Multi-item cart checkout |
| `/wallet` | `WalletView.vue` | Wallet view (balance, top-up, transactions) |
| `/credit-portfolio` | `CreditPortfolioView.vue` | Owned credits + ESG export (PDF/CSV) |
| `/retire` | `RetireView.vue` | Credit retirement flow |
| `/certificates` | `CertificateView.vue` | Certificate viewer + PDF download |
| `/receipts` | `ReceiptView.vue` | Receipt viewer |
| `/verify/:certificateNumber` | `CertificateVerifyView.vue` | Public certificate verification (no login) |
| `/registry` | `RegistryView.vue` | Public carbon registry (all issued/retired credits) |
| `/watchlist` | `WatchlistView.vue` | Saved watchlist + price alerts |
| `/calculator` | `CarbonCalculatorView.vue` | Carbon calculator (PH emission factors) |
| `/projects/map` | `ProjectsMapView.vue` | Projects on a Leaflet map |
| `/project/:id` | `ProjectDetailView.vue` | Full project detail (hero, trust card, map, docs, co-benefits) |
| `/about` | `AboutView.vue` | About Carbonify page |
| `/apply` | `RoleApplicationView.vue` | Role application (developer/verifier/farmer) |
| `/kyc` | `KycView.vue` | KYC application |
| `/submit-project` | `SubmitProjectView.vue` | Project submission form |
| `/developer/projects` | `DeveloperProjectsDashboardView.vue` | Developer project dashboard |
| `/monitoring` | `MonitoringReportView.vue` | MRV report editor (file/revise monitoring reports) |
| `/developer/monitoring` | `MonitoringReportView.vue` | MRV monitoring reports |
| `/developer/mrv-dashboard` | `MrvDashboardView.vue` | MRV roll-up dashboard (tCO₂e, trends, compliance) |
| `/developer/ledger` | `CarbonAssetLedgerView.vue` | Carbon asset ledger (issued/sold/retired + buyer history) |
| `/developer/offtakes` | `OfftakeAgreementsView.vue` | ERPA/offtake agreement management |
| `/developer/data-room` | `DataRoomActivityView.vue` | Document access log (who's reading what) |
| `/sales` | `SellerEarningsView.vue` | Seller earnings dashboard + listing management |
| `/investor` | `InvestorPortalView.vue` | Investor portal (pipeline, IRR/NPV, data room) — Pro-gated |
| `/biomass` | `BiomassMarketplaceView.vue` | Public biomass marketplace |
| `/biomass/sell` | `BiomassSellView.vue` | List feedstock for sale (KYB-gated) |
| `/biomass/rfqs` | `BiomassRfqsView.vue` | Manage biomass RFQs (buyer + supplier tabs) |
| `/farmer` | `FarmerPortalView.vue` | Farmer portal (parcels, deliveries, carbon participation) |
| `/verifier` | `VerifierPanel.vue` | Verifier review panel |
| `/admin` | (components/admin/AdminDashboard.vue) | Admin dashboard |
| `/admin/kyb` | `AdminKybReviewView.vue` | Admin KYB review console |
| `/admin/refunds` | `AdminRefundsView.vue` | Admin refunds/disputes console |
| `/admin/config` | `SystemConfigView.vue` | System configuration |
| `/finance` | `FinanceConsoleView.vue` | Admin finance console (sales/fees/payouts/reconciliation) |
| `/analytics` | `AnalyticsView.vue` | Analytics (Buying free, Selling Pro-gated) |
| `/assistant` | `AiAssistantView.vue` | AI assistant preview (interface only — no backend) |
| `/upgrade` | `UpgradeView.vue` | Subscription upgrade (Free → Pro/Business) |
| `/lgu` | `LguDashboardView.vue` | LGU dashboard |
| `/preferences` | `UserPreferencesView.vue` | User preferences + theme |
| `/payment/callback` | `PaymentCallbackView.vue` | PayMongo return handler |

---

## 6. Service Layer Architecture (65+ Services)

All business logic lives in `src/services/`. The app is frontend-heavy but most real data operations go through Supabase via these services.

### Core Services
| Service | Purpose |
|---|---|
| `supabaseClient.js` | Supabase client singleton — **nullable** (app works in limited mode without Supabase) |
| `authService.js` | Login, signup, logout, session, password reset |
| `profileService.js` | Profile CRUD, avatar, organization |
| `mfaService.js` | TOTP 2FA enrollment, verify, unenroll |

### Project & MRV Services
| Service | Purpose |
|---|---|
| `projectService.js` | Project CRUD (insert/update with drift-safe whitelists) |
| `projectApprovalService.js` | Project approval/rejection workflows |
| `projectWorkflowService.js` | Status transitions, credit issuance |
| `projectCommentService.js` | Developer↔verifier comment threads |
| `projectCredibility.js` | Additionality/permanence metadata |
| `monitoringService.js` | MRV monitoring report submission |
| `mrvDashboardService.js` | MRV aggregate dashboard (tCO₂e, compliance) |
| `mrvReminderService.js` | MRV report due/overdue reminders |

### Marketplace & Trading
| Service | Purpose |
|---|---|
| `marketplaceService.js` | Main marketplace operations (~32KB) |
| `marketplaceIntegrationService.js` | Cross-service marketplace integration |
| `creditOwnershipService.js` | Credit portfolio and ownership |
| `registryService.js` | Public registry data |
| `watchlistService.js` | Watchlist + price alerts |
| `savedSearchService.js` | Saved search + match notifications |

### Money & Finance
| Service | Purpose |
|---|---|
| `paymentService.js` | Legacy payment service |
| `realPaymentService.js` | Real payment operations |
| `paymongoService.js` | PayMongo API interactions |
| `paymentGatewayService.js` | Payment gateway abstraction |
| `payments/` (directory) | Phase 1 provider abstraction (PaymentProvider, MockPaymentProvider, PayMongoProvider) |
| `payoutService.js` | Seller payout requests + state machine |
| `payouts/` (directory) | Phase 2 payout abstraction (PayoutProvider, MockPayoutProvider) |
| `walletService.js` | Wallet operations (balance, top-up) |
| `disputeService.js` | Refunds and disputes |
| `subscriptionService.js` | Pro/Business subscription management |
| `adminFinanceService.js` | Admin finance console RPCs |
| `vatInvoiceService.js` | VAT invoice generation (provisional) |

### Documents & Certificates
| Service | Purpose |
|---|---|
| `certificateService.js` | Certificate generation (serials, QR, SHA-256 signature) |
| `certificatePdfService.js` | PDF certificate rendering |
| `receiptService.js` | Transaction receipt generation |
| `esgReportService.js` | ESG/offset report export (PDF/CSV) |
| `storageService.js` | Supabase Storage (file upload/download, signed URLs) |

### Identity & Governance
| Service | Purpose |
|---|---|
| `kycService.js` | KYC application + verification flow |
| `kybService.js` | KYB (business verification) for seller payouts |
| `roleApplicationService.js` | Role application submission + review |
| `roleService.js` | Role management |
| `auditService.js` | Audit log recording + querying |
| `dataPrivacyService.js` | DPA: data export + account deletion requests |

### Domain-Specific
| Service | Purpose |
|---|---|
| `biomassService.js` | Biomass marketplace (products, RFQs, quotes) |
| `farmerService.js` | Farmer portal (parcels, deliveries, carbon participation) |
| `investorAnalytics.js` | Investor portal (IRR, NPV, payback, pipeline) |
| `investorService.js` | Investor data operations |
| `offtakeService.js` | Offtake/ERPA agreement management |
| `dataRoomService.js` | Data room access logging |
| `assetLedgerService.js` | Carbon asset ledger aggregation |
| `lguService.js` | LGU dashboard operations |
| `lguReportService.js` | LGU reporting |
| `endorsementService.js` | LGU project endorsements |
| `portfolioAnalytics.js` | Portfolio P&L calculations |
| `sellerExportService.js` | Seller sales / earnings CSV export |

### Supporting
| Service | Purpose |
|---|---|
| `notificationService.js` | In-app + email notifications |
| `emailService.js` | Email sending (via Edge Function) |
| `webhookService.js` | Webhook event helpers |
| `verificationService.js` | Certificate verification |
| `settingsService.js` | App settings (tax, config) |
| `transactionHistoryService.js` | Transaction history aggregation |

---

## 7. Supabase Edge Functions (7 Functions)

| Function | Purpose | Auth |
|---|---|---|
| `paymongo-checkout` | Creates server-authoritative PayMongo checkout sessions (recomputes amount from listing price — client sends only `{listingId, quantity}`) | JWT required |
| `paymongo-webhook` | Handles PayMongo webhook events — HMAC-SHA256 signature verification, replay protection, `webhook_events` dedup, calls `process_marketplace_purchase` RPC | Webhook signature |
| `paymongo-reconcile` | External PSP settlement reconciliation (system vs PayMongo) | Service role |
| `paymongo-resettle` | Heals orphaned paid payment intents | Service role |
| `process-payouts` | Seller payout worker (processes `payout_requests` state machine) | Worker secret |
| `send-approval-email` | Sends approval/rejection/reviewer emails through Resend | JWT required |
| `account-deletion` | DPA erasure worker (processes account deletion requests) | Service role |

---

## 8. Database Schema (Key Tables)

Migrations are in `supabase/migrations/` (95 files). **Applied by hand in the SQL Editor** — there is NO CLI migration tracking. The live database may drift from the migration files.

### Core Tables
- `profiles` — User profiles (role, KYC level, KYB status, plan, organization)
- `projects` — Carbon projects (type, status, location, boundary, methodology, development_status, financials)
- `project_credits` — Credit pools per project (`credits_available` is the canonical column)
- `credit_listings` — Marketplace listings (price, quantity, source flag)
- `credit_transactions` — Purchase/sale records (buyer_id, seller_id, amount, quantity)
- `credit_ownership` — Who owns which credits (status: owned/retired/transferred)
- `credit_retirements` — Permanent credit retirements
- `certificates` — QR-verifiable certificates (serial, signature, retirement_id)

### Financial Tables (Server-Write-Only via RLS)
- `payment_intents` — Payment intent records
- `ledger_entries` — Append-only double-entry ledger (balanced-constraint trigger)
- `idempotency_keys` — Payment idempotency
- `webhook_events` — Webhook event log (dedup)
- `wallet_accounts` — Wallet balances
- `wallet_transactions` — Wallet transaction history
- `escrow_holds` — Escrow for marketplace trades (⚠️ currently dead for card purchases — see DEFERRED_BACKLOG #14)
- `payout_requests` — Seller payout state machine (requested → processing → settled/failed)

### Identity & Governance
- `role_applications` — Role application requests
- `audit_logs` — System-wide audit trail
- `system_notifications` — In-app notifications
- `kyb_applications` — Business verification applications
- `data_subject_requests` — DPA data export/deletion requests
- `rate_limits` — Rate limiting entries
- `velocity_caps` — KYC-tiered velocity caps

### Domain-Specific
- `monitoring_reports` — MRV monitoring reports
- `monitoring_activity_data` — Activity data per monitoring report
- `verified_emission_reductions` — VERs (reduction_type: removal/avoidance, nullable)
- `biomass_products` — Feedstock catalog (types: biochar, rice_husks, black_pellets, etc.)
- `biomass_rfqs` — Request-for-quotation (buyer → supplier → quote → accept/decline)
- `farm_parcels` — Farmer plantation register (crop, area, GPS, expected yield)
- `farmer_deliveries` — Delivery logging (against accepted RFQs, with buyer confirmation)
- `offtake_agreements` — ERPA/offtake contracts (owner-only RLS, investor sees aggregates only)
- `data_room_access_log` — Document access log (who read what, when)
- `supplier_orders` — External credit supplier orders
- `saved_searches` — Marketplace saved searches with price alerts
- `subscriptions` — Pro/Business subscription records
- `app_settings` — System configuration (tax, fees, etc.)
- `verification_checklists` — Verifier scoring rubric data
- `project_comments` — Developer↔verifier threads

### Key RPCs (SECURITY DEFINER Functions)
- `process_marketplace_purchase` — Atomic, oversell-safe purchase settlement
- `process_wallet_purchase` — Wallet-based purchase
- `retire_credits_atomic` — Atomic credit retirement + record
- `reconcile_financials()` — Financial reconciliation (returns 0 rows = balanced)
- `update_wallet_balance_atomic` — Wallet balance updates
- `activate_validated_project_trigger` — Issues credits on project validation
- `farmer_carbon_participation()` — Carbon attribution for farmers
- `offtake_summary()` — Aggregated offtake data (no confidential details)
- `log_data_room_access()` — Secure document access logging
- `public_market_stats()` — Public market statistics (anon-granted)
- `admin_recent_transactions()` — Admin finance console
- Various `submit_*`, `respond_*`, `confirm_*` RPCs for biomass/farmer workflows

---

## 9. Environment Variables

### Frontend (VITE_*)
| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Supabase anon/public key |
| `VITE_SUPABASE_PROJECT_REF` | Recommended | Used to build Edge Functions URL |
| `VITE_SUPABASE_FUNCTIONS_URL` | Optional | Explicit Edge Functions base URL |
| `VITE_PAYMONGO_PUBLIC_KEY` | For payments | PayMongo public key |
| `VITE_SENTRY_DSN` | For monitoring | Sentry DSN |

### Edge Function Secrets (set via Supabase Dashboard)
- `PAYMONGO_SECRET_KEY` — PayMongo server-side key
- `PAYMONGO_WEBHOOK_SECRET` — Webhook HMAC signing secret
- `PAYOUT_WORKER_SECRET` — Process-payouts worker auth
- `RESEND_API_KEY` — Email sending via Resend
- `SUPABASE_SERVICE_ROLE_KEY` — Service role for privileged operations

---

## 10. NPM Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 5173 |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | ESLint with `--fix` |
| `npm run lint:check` | ESLint without fixing (CI) |
| `npm run format` | Prettier (⚠️ BREAKS THE BUILD — see backlog) |
| `npm run test` / `test:run` | Vitest watch / single run |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run test:coverage` | Vitest with V8 coverage |
| `npm run setup:supabase` | Diagnose Supabase connection + tables |
| `npm run setup:accounts` | Seed 4 test accounts (needs SERVICE_ROLE_KEY) |
| `npm run deploy:paymongo` | Deploy paymongo-checkout Edge Function |
| `npm run deploy:webhook` | Deploy paymongo-webhook Edge Function |

---

## 11. Key Architectural Patterns

### Money Path (Server-Authoritative)
1. **Client sends only `{listingId, quantity}`** — never an amount
2. **Server recomputes price** from `credit_listings.price_per_credit`
3. **Signed webhook is the source of truth** — HMAC-SHA256 + replay protection + dedup
4. **Double-entry ledger** — every settlement writes balanced `ledger_entries`
5. **Financial tables are server-write-only** — browser cannot write balances, transactions, or ownership
6. **Reconciliation** — `reconcile_financials()` proves the books balance

### Supabase Client Pattern
The app uses a nullable Supabase client pattern:
```javascript
const s = getSupabase();
if (!s) return; // graceful degrade without Supabase
```
This guard appears ~233× across 49 files. The app is designed to keep working in limited mode without Supabase.

### Service Layer Pattern
Services are standalone JS modules that import `getSupabase()` from `supabaseClient.js`. They return data or throw errors. Views call services, not Supabase directly.

### Migration Application
⚠️ **Migrations are applied by hand** in the Supabase SQL Editor. There is NO CLI migration tracking. The live database can drift from `supabase/migrations/`. Use `supabase/diagnostics/schema_catchup_audit.sql` to detect drift. **Do NOT run `supabase db push`.**

### Coding Conventions
- Vue 3 `<script setup>` composition API
- Pinia for state management (primarily `userStore.js`)
- No TypeScript (plain JavaScript throughout)
- `@` alias for `src/` directory
- ESLint flat config with Vue plugin
- Services use `console.error` for error reporting (Sentry wraps it)
- Drift-safe patterns: services fall back gracefully when columns/tables are missing

### Shared UI (do not hand-roll these)
Each of these exists because the hand-rolled version had drifted across ~30 views.
- **Green page banner** → `src/components/layout/PageHeader.vue`. Every green header in the app is
  `background: var(--primary-color, #069e2d)`; there is no gradient variant and no darker variant.
- **Long list / table that should collapse** → `src/components/ui/CollapsibleList.vue`
  (`count`, `visible` default 4, `rowSelector` default `tbody > tr`). It **replaces** an
  `overflow-x: auto` wrapper, never nests inside one — an inner scroll container becomes the
  sticky ancestor and breaks the pinned table header.
- **Colours** → `src/styles/tokens.css`. Never a literal hex for brand/success green; `#10b981`
  in particular is a Tailwind emerald that had spread to 28 places and reads as a different green.
- Known tracked gap: white-on-green header text is 3.5:1 (under WCAG AA) — `DEFERRED_BACKLOG.md` #19.
  Read it before darkening `--primary-color`.

---

## 12. How the App Starts

1. `src/main.js` — Creates Vue app + Pinia + Router + Sentry
2. `src/App.vue` — Sets up auth state listeners, initial session/profile loading, global navigation
3. `src/router/index.js` — Route definitions + `beforeEach` guard checks:
   - Authentication status
   - Role-based access
   - MFA/2FA enforcement (aal2 step-up)
   - KYC gate for financial routes
   - Finance-restricted role gating

### Mental Model — Four Connected Subsystems
1. **Account & role management** — auth, profiles, roles, KYC, KYB, MFA
2. **Project submission & verification** — projects, documents, MRV, VERs, issuance
3. **Marketplace purchase & payment** — listings, checkout, webhook, ledger, wallet
4. **Post-purchase records** — ownership, certificates, receipts, notifications, retirement

Most user-facing issues trace to one of these boundaries:
- Auth/session restore
- Route-role mismatch
- Supabase schema/RLS mismatch
- Payment callback or webhook handling
- Document generation after transaction creation
