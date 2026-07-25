# Security

Security model for Carbonify: authentication, 2FA, authorization, identity verification, money safety, data privacy, secrets, and known gaps.

Related: [TESTING.md](./TESTING.md) · [CONTRIBUTING.md](./CONTRIBUTING.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [DATABASE_AND_RPCS.md](./DATABASE_AND_RPCS.md) · [DEPLOYMENT.md](./DEPLOYMENT.md) · [../MONEY_CUTOVER_STATUS.md](../MONEY_CUTOVER_STATUS.md)

---

## Authentication

- **Supabase Auth** with email/password. Passwords are hashed with bcrypt by Supabase (never stored or handled by the app).
- Password reset is handled through Supabase Auth (`src/services/passwordService.js`).
- The Supabase client is created from the public anon key; sessions are JWTs managed by Supabase.

## 2FA / MFA (TOTP)

- **TOTP** two-factor via Supabase Auth MFA (`src/services/mfaService.js`).
  - **Enrollment** (Profile → Security): `enroll()` returns a QR code + secret the user scans into an authenticator app; `verifyEnrollment()` confirms a code.
  - **Login step-up:** after sign-in, `isMfaRequired()` checks the Authenticator Assurance Level — if the session is at `aal1` with a verified factor whose `nextLevel` is `aal2`, the login form prompts for a code and `challengeAndVerify()` steps the session up to **aal2**.
  - Enroll / verify / fail / disable actions are written to the audit log (`auditService`).
- **Strict aal2 step-up is enforced in the router guard** — routes that require a stepped-up session are gated there, not just in the UI. MFA assurance API failures fail *open* on the login check (so a transient fault never locks a user out), but the verified-factor requirement itself is enforced.

## Authorization

- **7 roles** (general user, buyer/investor, project developer, verifier, LGU user, farmer, admin) with role constants in `src/constants/roles`. `super_admin` canonicalizes to `admin` everywhere via `canonicalizeRole()`, mirroring the DB's `canonicalize_notification_role()`. Route access is enforced by guards in `src/middleware/roleGuard.js`:
  - `createRoleGuard` (generic per-route role check via `canAccessRoute`)
  - `createAdminGuard`, `createVerifierGuard`, `createProjectDeveloperGuard`, `createLguGuard` (admins may also access LGU tools)
  - `createPermissionGuard` (permission-based, `hasAnyPermission`)
  - On denial, the user is redirected to their role's default route (`getRoleDefaultRoute`).
- Guards always (re)fetch the profile before deciding, so a stale/missing role can't grant access.
- **RLS (Row-Level Security)** on Supabase tables is the real enforcement boundary — route guards are UX, not the security perimeter. Finance-restricted roles cannot write financial tables regardless of the UI.

## Identity verification

- **KYC gate on purchases** — buyers must pass KYC before they can buy credits (`src/services/kycService.js`).
- **KYB gate on payouts** — sellers must pass KYB (business verification) before they can receive payouts (`src/services/kybService.js`).

## Money safety

Money is **server-authoritative**. The client never sets amounts — the server derives and settles them.

- **Server-authoritative amounts.** Purchases/top-ups/subscriptions record a `payment_intent`; the server settles from the stored intent, not from client input.
- **Signed, idempotent PayMongo webhook** (`supabase/functions/paymongo-webhook/index.ts`):
  - **HMAC-SHA256** signature verification over `${timestamp}.${rawBody}`, constant-time compare, against the `li` (live) then `te` (test) signature.
  - **Replay window** — rejects events whose signed timestamp is more than 300s from now.
  - **Fail-closed** — with no `PAYMONGO_WEBHOOK_SECRET` configured, unsigned requests are rejected unless `ALLOW_UNSIGNED_WEBHOOKS=true` (local dev only).
  - **Event dedup** via the `webhook_events` table keyed on `(provider, event_id)`; only short-circuits when the prior attempt reached `processed`, otherwise reprocesses (PayMongo retries unacknowledged events). Per-handler idempotency (intent `status = 'paid'`, existing rows) is a second layer.
  - Settlement runs through RPCs: `process_marketplace_purchase`, `update_wallet_balance_atomic`, `activate_subscription`, with `refund_purchase` compensating a failed supplier-fulfillment saga.
- **Double-entry ledger** — money movements are recorded as balanced ledger entries.
- **Server-write-only financial tables** — financial tables are RLS-locked so the browser cannot write them; writes happen only via **SECURITY DEFINER RPCs** or the **service-role** webhook (both bypass RLS). SECURITY DEFINER RPCs self-gate on `auth.uid()` / `is_admin()`.
- **Reconciliation** — `select * from reconcile_financials();` must return **0 rows**; it checks transaction/ledger balance and flags stuck webhook events. It is the invariant behind every sandbox flow (see [TESTING.md](./TESTING.md#money-path-sandbox-runbook)).
- **Public RPCs** (registry, certificate verification) return only non-PII data.

## Data privacy (DPA)

Tooling for Data Privacy Act of 2012 / GDPR-style data-subject rights:

- **Self-service data export** (`src/services/dataPrivacyService.js`): `exportMyData()` / `downloadMyData()` gather everything the app holds about the signed-in user and produce a downloadable payload. The export is drift-proof (tries candidate user-id columns per source) and only includes records visible to the user's account. Access is recorded via `submit_data_subject_request` for the audit trail.
- **Account deletion** — `requestAccountDeletion()` records a deletion request (cancellable while pending); an **account-deletion worker** edge function (`supabase/functions/account-deletion`) processes erasure server-side.

## Secrets management

- Secrets live in **Supabase edge-function config**, never committed to the repo (`PAYMONGO_SECRET_KEY`, `PAYMONGO_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `CREDIT_SUPPLIER`, etc.).
- **Anon key is public by design** — it is shipped to the browser and gated entirely by RLS. The **service-role key is a secret** — it bypasses RLS and lives only in edge-function config / server context, never in client code.

## Known gaps / TODO

Not yet implemented — several need an external party before real (live) keys go on:

- **Penetration test** before enabling live PayMongo keys.
- **AML screening** on parties/transactions — not implemented.
- **External reconciliation vs PayMongo** — internal `reconcile_financials()` balances the local ledger, but there is no automated three-way reconciliation against PayMongo's settlement reports yet.
- **Error tracking / monitoring** — no external error-tracking (e.g. Sentry) wired up; failures are currently diagnosed from logs and the `webhook_events` table.

These are consistent with the go-live playbook and deferred backlog; treat them as blockers for production money, not for sandbox testing.
