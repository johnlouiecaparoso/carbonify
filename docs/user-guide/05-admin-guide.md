# Admin Guide

Everything a Carbonify platform administrator can do: manage users and roles, review identity/business verification and role applications, process refunds, watch the money, and tune platform settings.

> **Prerequisites:** an account with the **Admin** role. Every page in this guide lives under `/admin/*` and is protected by the `requiresAdmin` route guard — non-admins are redirected away automatically.

**Related guides:** [Getting Started](01-getting-started.md) · [Developer Guide](03-developer-guide.md) · [Verifier Guide](04-verifier-guide.md) · [LGU Guide](06-lgu-guide.md)

---

## A note on admin accounts and money pages

Admin accounts are **finance-restricted**. The following personal money pages are deliberately blocked for admins (and for verifiers and project developers): **`/wallet`, `/certificates`, `/receipts`, and the `/carbon-calculator`**. If you try to open one, you are redirected to your role's default page. This keeps operator accounts separate from buyer/seller balances. To buy, hold, retire, or download certificates for yourself, use a separate general-user or buyer account.

---

## Admin dashboard (`/admin`)

The dashboard is your landing page. It opens with the heading **"Admin Dashboard"** and four live stat cards:

| Card | What it counts |
|------|----------------|
| **Total Users** | Every profile on the platform |
| **Pending Role Applications** | Role applications still in `pending` |
| **Administrators** | Profiles with the `admin` role |
| **Pending Verifier Applicants** | Pending role applications specifically requesting the Verifier role |

Below the stats is an **Admin Tools** grid with quick links to **User Management**, **Finance Console**, **Audit Logs**, **KYC Review**, and **System Configuration**.

The last section, **"Verifier Applicant Approval,"** embeds the pending *verifier* applications right on the dashboard so you can approve verifiers without leaving the page. Use the **"Open Full Role Applications"** link (top-right of that section) to reach the complete queue.

> The tool grid only links to five destinations. The other admin areas — **Role Applications, KYB, Refunds, Database Management** — are reached from the navigation menu or directly by URL. The full admin route map is below.

### Full admin route map

| Area | Route |
|------|-------|
| Dashboard | `/admin` |
| User Management | `/admin/users` |
| Role Applications | `/admin/role-applications` |
| KYC Review | `/admin/kyc` |
| KYB / Business Review | `/admin/kyb` |
| Refunds & Disputes | `/admin/refunds` |
| Finance Console | `/admin/finance` |
| System Configuration | `/admin/config` |
| Audit Logs | `/admin/audit-logs` |
| Database Management | `/admin/database` |

---

## User management (`/admin/users`)

Manage every account's name, role, and KYC level.

1. Use the **search box** to find users by name or email.
2. Use the **role filter** dropdown to narrow the list (All Roles, Admin, Verifier, Project Developer, General User).
3. The table shows **Name, Email, Role, KYC Level, Created**, and an **Actions** column. The KYC Level cell shows both the number and its label, e.g. `1 · Basic`.
4. Click the **edit (pencil) icon** in the Actions column to open the **Edit User** modal.

### Editing a user

The Edit User modal has three fields:

- **Full Name** — free text.
- **Role** — a dropdown offering **General User, Verifier, Admin**.
- **KYC Level** — a dropdown of the KYC tiers: **0 — Unverified, 1 — Basic, 2 — Verified, 3 — Enhanced**.

Click **Save** to apply (you'll see a "User updated successfully!" confirmation), or **Cancel** to discard.

> **KYC-level override.** The KYC Level dropdown is a **manual override, primarily for testing**. In normal operation users *earn* their KYC level through the verification flow (Profile → KYC) and your review in [KYC Review](#kyc-review-adminkyc). Setting it here bypasses that flow, so use it deliberately.

> **About roles.** The role dropdown lists General User, Verifier, and Admin. The **Project Developer** role is normally granted automatically when you approve a developer role application (see below), not from this dropdown. The **LGU User** role is provisioned by an administrator at the account level — it is *not* one of the self-service roles on the public `/apply` page (which only offers Project Developer and Verifier). See the [LGU Guide](06-lgu-guide.md) for details.

---

## Reviewing role applications (`/admin/role-applications`)

This is the full queue of people requesting **Project Developer** or **Verifier** access.

The header shows three counters: **Pending**, **Pending Developers**, and **Pending Verifiers**.

1. Filter the queue with the **search box** (matches name, email, or company) and the **status dropdown** (All statuses, Pending, Under Review, Approved, Rejected). Use **Search** and **Refresh** to reload.
2. The table lists **Submitted, Applicant, Email, Role, Company, Status**, and a **View** action.
3. Click **View** to open the detail drawer on the right.

### The application drawer

The drawer shows the applicant's **Contact** details, and — depending on the role requested — a **Project Developer Application Details** block (company, business registration number, TIN, legal documents, business background, portfolio) or a **Verifier Application Details** block (organization/firm, accreditation body and number, years of experience, specializations). It also shows the applicant's **Experience**, **Motivation**, and any **Supporting Links**.

Two text areas let you record your decision:

- **Admin Notes** — internal notes for the admin team.
- **Decision Reason** — an explanation kept for the audit trail.

### Making a decision

The drawer footer has three actions:

- **Mark Under Review** — moves the application to `under_review` without deciding.
- **Reject** — requires a **Decision Reason of at least 5 characters**, otherwise it won't submit.
- **Approve & Assign Role** — approves the application **and automatically grants the requested role** to the applicant.

On approval, the applicant is notified by email (an invitation with sign-up instructions if they don't have an account yet). If automatic role assignment fails, the drawer shows a warning telling you to assign the role manually in [User Management](#user-management-adminusers). Every decision is written to the [audit log](#audit-logs-adminaudit-logs).

---

## KYC review — identity verification (`/admin/kyc`)

Approve or reject the identity documents users submit to raise their KYC level.

1. Filter with the tabs: **Pending, Approved, Rejected, All**, plus a **Refresh** button.
2. Each application card shows the applicant's **name and status badge**, **email**, **ID document type**, **level requested**, **submission date**, and organization (if any).
3. Open the uploaded ID with the **"View ID document"** link (or you'll see "No document uploaded").

For a **pending** application:

1. Optionally type into the **Review notes** field. Notes are **optional when approving but required when rejecting** (at least 5 characters).
2. Click **Approve** or **Reject**.

> This is the flow that legitimately grants a user's KYC level. The manual KYC-level field in [User Management](#user-management-adminusers) is a testing override that skips it.

---

## KYB review — business/seller verification (`/admin/kyb`)

**"Approve or reject seller business verifications. Approving unlocks withdrawals."** Sellers must pass KYB before they can withdraw earnings.

1. Filter with the tabs: **Pending, Approved, Rejected, All** (each shows a count).
2. Each business card shows the **business name and status badge** and a fact grid: **Type, Registration (number), Tax ID, Representative, Address, Submitted**.
3. Open supporting files with the **"Registration doc"** and **"Tax doc"** links when present.

For a **pending** application:

1. Optionally add **Review notes** (these are **shown to the seller**).
2. Click **Approve** or **Reject**. Approving unlocks the seller's ability to withdraw.

---

## Refunds & disputes (`/admin/refunds`)

Two tabs: **Transactions** and **Open disputes** (the tab shows the open-dispute count).

### Refunding a transaction

1. On the **Transactions** tab, review the table: **Date, Buyer, Seller, Qty, Amount, Status**.
2. A **Refund** button appears only on **completed** transactions.
3. Click **Refund**, optionally enter a **reason**, then **Confirm refund**.

### Resolving a dispute

On the **Open disputes** tab, each dispute card shows the buyer's **reason**, the **transaction ID**, and a **resolution notes** field. Choose **Refund** (resolve in the buyer's favor) or **Reject**. Resolved disputes drop into a **Resolved** list below.

> **Refunds move the books.** Every refund posts compensating double-entry ledger entries. After any refund or dispute resolution, re-run reconciliation in the [Finance Console](#finance-console-adminfinance) and confirm the books still balance.

---

## Finance console (`/admin/finance`)

Your read-only view of platform money: sales, fees, payouts, and book reconciliation.

### Summary cards

**Gross Sales, Platform Revenue, Fees Collected, Transactions, Pending Payouts,** and **Settled Payouts**. All peso amounts are shown as `₱`.

### Book reconciliation

The **Book Reconciliation** panel is the health check for the double-entry ledger. Press **Refresh** to re-run it.

- **Balanced:** you see **"✓ Books balanced — no drift detected."**
- **Drift:** you see a list of issues, each with an **issue type**, a **reference ID**, and a **detail** message.

> **The reconciliation must come back clean — `reconcile_financials` should report zero drift rows.** A non-zero drift count means the ledger is out of balance and needs investigation before you rely on the sales/payout figures. Always re-check after processing refunds.

### Recent transactions

A table of the latest transactions: **Date, Buyer, Seller, Qty, Amount, Fee, Status**.

> **VAT invoices are provisional.** Any tax invoice the platform generates today is marked **"PROVISIONAL — not yet a BIR-accredited Official Receipt."** Treat these as provisional documents until Carbonify is BIR-registered; they are not yet official BIR receipts.
>
> ⚠️ **They also carry no buyer TIN or registered business name** — the invoice fields exist but nothing supplies them, because accounts are individuals rather than companies. **A corporate buyer cannot claim input VAT on these.** Fixed by Phase 3 of [ORGANIZATION_ACCOUNTS_SCOPE.md](../ORGANIZATION_ACCOUNTS_SCOPE.md).

---

## System configuration (`/admin/config`)

Platform-wide settings. Changes take effect on the next relevant action (for example, a new platform fee applies to the next purchase). This screen has **three** configurable sections:

### 1. Marketplace — platform fee

Set the **Platform fee (%)** (0–100). The fee is charged on each purchase and booked to `platform_revenue`; the remainder is the seller's net. `0` means no fee.

### 2. Trading & KYC

Set the **Minimum KYC level to trade**. Users below this level can't buy or sell. The hint lists the current KYC tiers as chips — **0 · Unverified, 1 · Basic, 2 · Verified, 3 · Enhanced**. (This screen displays the tiers; it does not edit them.)

### 3. Emission factors

An editable table of methodology factors — **Project type, Metric, Unit, Factor** — that drive server-side credit calculations. Edit a **Factor** value and click **Save** on that row. **Editing a factor affects future issuance only**, not credits already issued.

> **What this screen does *not* configure.** Tax/VAT identity, the list of project types, and MRV cadence are **not** editable here — the System Configuration screen is limited to the platform fee, the minimum-KYC-to-trade level, and emission factors. Those other settings live outside this page (seeded via database configuration).

---

## Audit logs (`/admin/audit-logs`)

A searchable record of system activity and user actions.

1. Use the **search box** to match across user name, action, resource type, and details.
2. Narrow with the **Action** filter (Login, Logout, Create, Update, Delete, Approve, Reject) and the **User** filter (auto-populated from the loaded logs).
3. **Refresh** reloads the feed (up to the 500 most recent entries).

The table shows **Timestamp, User, Action, Resource,** and **Details** (raw metadata). Actions such as role-application and endorsement decisions are logged here automatically.

---

## Database management (`/admin/database`)

A read-only data browser for core tables.

1. The **Database Tables** grid lists key tables with a short description and a live **row count**: `profiles`, `projects`, `project_credits`, `credit_listings`, `credit_transactions`, `credit_ownership`, `wallet_accounts`, `wallet_transactions`, `certificates`, and `receipts`.
2. **Click a table card** to open the viewer.
3. In the viewer, **search** within the loaded rows and **Refresh** to reload. The viewer shows up to **100 rows** and renders each column as text (objects are shown as JSON, booleans as Yes/No).

> This is a **viewer**, not an editor — there are no in-app insert/update/delete controls here. Use it to inspect data and confirm the effect of admin actions.
