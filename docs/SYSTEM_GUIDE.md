# Carbonify System Guide

This guide is for anyone who needs to understand how Carbonify is put together before using, testing, or extending it.

## What This System Is

Carbonify is a Vue 3 web application for a carbon credit marketplace.

At a high level, it supports:

- public browsing of carbon projects
- user registration and login
- specialist role applications for `project_developer` and `verifier`
- project submission and review workflows
- marketplace credit purchases
- wallet and payment flows
- automatic certificate and receipt generation
- admin and verifier operations

The app is frontend-heavy, but most real data and workflows depend on Supabase.

## Core Stack

- Frontend: Vue 3, Vite, Vue Router, Pinia
- Backend/data: Supabase Auth, Supabase Postgres, Supabase Edge Functions
- Payments: PayMongo
- Documents: `jspdf`
- Testing: Vitest and Playwright

## How The App Starts

The main startup path is:

1. `src/main.js`
2. `src/App.vue`
3. `src/router/index.js`

What happens during startup:

- Vue app and Pinia store are created.
- The router is registered.
- Supabase client initialization is attempted through `src/services/supabaseClient.js`.
- `App.vue` sets up auth state listeners and initial session/profile loading.
- The router guard checks auth and role access before entering protected routes.

Important detail:

- The app is designed to keep working in a limited mode even when Supabase is misconfigured or unavailable.
- Session restore is treated carefully to avoid wiping valid Supabase tokens from local storage.

## Main User Roles

The role model is defined in `src/constants/roles.js`.

Roles in the system:

- `general_user`
- `buyer_investor`
- `project_developer`
- `verifier`
- `admin`

What they mainly do:

- `general_user`: browse marketplace, manage profile, basic account access
- `buyer_investor`: purchase-oriented role, portfolio and marketplace access
- `project_developer`: submit projects and manage their own projects
- `verifier`: review project submissions; can also review developer role applications
- `admin`: user management, audit logs, role application review, broader system access

Route protection is enforced in `src/router/index.js` with role guards from `src/middleware/roleGuard`.

## Main Screens And Routes

The main views live in `src/views/`.

Key routes:

- `/home`: landing page
- `/login`, `/register`: auth
- `/marketplace`: public marketplace
- `/apply`: role application form
- `/profile`: user profile
- `/wallet`: wallet view
- `/submit-project`: project developer submission form
- `/developer/projects`: developer dashboard
- *(`/buy-credits` was deleted 2026-07-26 — 1,006 lines duplicating the marketplace purchase flow, linked from nowhere. Buying happens at `/marketplace` → `/cart`.)*
- `/credit-portfolio`: owned credits
- `/certificates`: generated certificates
- `/receipts`: generated receipts
- `/verifier`: verifier panel
- `/admin`: admin dashboard

Some legacy routes now redirect to newer pages instead of rendering old dashboards.

## System Architecture By Layer

### 1. UI layer

Files:

- `src/views/`
- `src/components/`
- `src/App.vue`

This layer handles pages, forms, navigation, and user interaction.

### 2. State layer

Primary store:

- `src/store/userStore.js`

This store owns:

- current session
- current profile
- resolved role
- permissions
- logout and profile update logic

There is also a preferences store for theme/accessibility behavior.

### 3. Service layer

Most business logic lives in `src/services/`.

Important service groups:

- auth/session: `authService.js`, `supabaseClient.js`, `profileService.js`
- projects and review: `projectService.js`, `projectApprovalService.js`, `projectWorkflowService.js`
- marketplace and ownership: `marketplaceService.js`, `creditOwnershipService.js`
- payments: `paymentService.js`, `realPaymentService.js`, `paymongoService.js`
- documents: `certificateService.js`, `certificatePdfService.js`, `receiptService.js`
- governance and notifications: `roleApplicationService.js`, `notificationService.js`, `auditService.js`

### 4. Backend layer

Supabase assets live in `supabase/`.

Main backend pieces:

- SQL migrations: `supabase/migrations/`
- Edge Functions: `supabase/functions/`

Current functions:

- `paymongo-checkout`: creates or verifies PayMongo checkout sessions
- `paymongo-webhook`: handles PayMongo webhook events
- `send-approval-email`: sends approval/rejection/reviewer emails through Resend

## Main Business Workflows

### Role application workflow

Relevant files:

- `src/views/RoleApplicationView.vue`
- `src/services/roleApplicationService.js`
- `supabase/migrations/20260212000000_create_role_applications.sql`

Flow:

1. A user or public applicant opens `/apply`.
2. The app stores an application in `role_applications`.
3. Reviewers are notified.
4. A verifier can review `project_developer` applications.
5. An admin reviews `verifier` applications.
6. If approved, the user role is updated and email/in-app notifications are sent.

Important behavior:

- applicants can submit without already being logged in
- if a password is provided during apply, the system can create an auth account
- approved specialist roles unlock protected routes

### Project submission and review

Relevant files:

- `src/views/SubmitProjectView.vue`
- `src/views/DeveloperProjectsDashboardView.vue`
- `src/views/VerifierPanel.vue`
- `src/services/projectService.js`
- `src/services/projectApprovalService.js`
- `src/services/projectWorkflowService.js`

Flow:

1. A `project_developer` submits a project.
2. The record is stored in Supabase.
3. Verifiers review and approve/reject.
4. Notifications are sent to the submitter and admins.
5. Approved projects can feed marketplace listings.

### Marketplace purchase flow

Relevant files:

- `src/views/MarketplaceViewEnhanced.vue`
- `src/services/marketplaceService.js`
- `src/views/PaymentCallbackView.vue`
- `supabase/functions/paymongo-checkout/index.ts`

Flow:

1. Users browse approved listings in the marketplace.
2. A purchase request checks real available stock.
3. Payment can go through wallet logic or PayMongo checkout.
4. After payment, the system records transactions and ownership.
5. Marketplace stock is synchronized.
6. Certificate and receipt generation are triggered.

Important behavior:

- sold quantities are derived from transaction data to avoid listing drift
- payment callback handling is split between frontend callback logic and backend functions

### Certificates and receipts

Relevant files:

- `src/services/certificateService.js`
- `src/services/certificatePdfService.js`
- `src/services/receiptService.js`
- `src/views/CertificateView.vue`
- `src/views/ReceiptView.vue`

These services build transaction-based records and PDFs after successful purchases or retirements.

## Important Data Areas

Based on the service layer and setup script, the main database tables include:

- `profiles`
- `projects`
- `project_credits`
- `credit_listings`
- `credit_transactions`
- `credit_ownership`
- `wallets` or wallet-related account tables
- `wallet_transactions`
- `certificates`
- `receipts`
- `audit_logs`
- `role_applications`
- `system_notifications`

Use the migrations in `supabase/migrations/` as the source of truth for newer additions.

## Notifications And Email

Notifications have two paths:

- in-app notifications through `system_notifications`
- email through the `send-approval-email` Edge Function

Relevant files:

- `src/services/notificationService.js`
- `src/services/emailService.js`
- `supabase/functions/send-approval-email/index.ts`

Development fallback exists:

- when notification tables or RPC helpers are missing, the app can fall back to local storage for some notification behavior

## Local Development Setup

### Requirements

- Node.js `^20.19.0 || >=22.12.0`
- npm
- Supabase project credentials

### Environment variables

The app expects a root `.env` with at least:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_PAYMONGO_PUBLIC_KEY`

Additional function-related variables may be needed depending on your environment, especially for hosted email and webhook flows.

### Common commands

```bash
npm run dev
npm run build
npm run test:run
npm run test:e2e
```

## Repository Map

If you are new to the codebase, start here:

- `src/main.js`: app bootstrap
- `src/App.vue`: shell, loading behavior, auth listener
- `src/router/index.js`: route map and access control
- `src/store/userStore.js`: auth/profile/role state
- `src/services/`: business logic
- `src/views/`: page entry points
- `supabase/functions/`: server-side integrations
- `supabase/migrations/`: schema changes
- `docs/`: project-specific notes

## Current Repo Caveats

These are worth knowing before you trust every file at face value.

### Script path mismatch

`package.json` defines:

- `npm run setup:supabase`
- `npm run setup:accounts`

But the repository currently has a flat `scripts/setup` file instead of `scripts/setup/setup-supabase.js` and `scripts/setup/setup-test-accounts.js`.

That means the documented script names and current file layout do not match.

### Existing docs may describe older structure

`scripts/README.md` still describes a `scripts/setup/` directory that does not currently exist in the repo.

### Webhook function contains unresolved conflict markers

`supabase/functions/paymongo-webhook/index.ts` currently ends with Git conflict markers. Treat that file as needing cleanup before deployment.

## Practical Reading Order For New Contributors

If you need to understand the system quickly, use this order:

1. `src/router/index.js`
2. `src/store/userStore.js`
3. `src/services/supabaseClient.js`
4. `src/services/roleApplicationService.js`
5. `src/services/projectService.js`
6. `src/services/marketplaceService.js`
7. `src/services/certificateService.js`
8. `supabase/functions/`
9. `supabase/migrations/`

That path gives you route access, auth, business workflows, then backend dependencies.

## Short Mental Model

Think of Carbonify as four connected subsystems:

- account and role management
- project submission and verification
- marketplace purchase and payment processing
- post-purchase records such as ownership, certificates, receipts, and notifications

Most user-facing issues can usually be traced to one of these boundaries:

- auth/session restore
- route-role mismatch
- Supabase schema/RLS mismatch
- payment callback or webhook handling
- document generation after transaction creation
