# Carbonify — User Agreement, Policies & Platform Disclosures

> **Last updated:** 2026-07-25
> **Status of this document:** Working draft, aligned to the actual build state (see [HANDOFF.md](HANDOFF.md)). **Not yet legal-reviewed.** Before any real-money or public launch this must be reviewed by counsel and a Data Protection Officer (see §9 / the go-live gate in [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md)).
> **Contact:** support@carbonify.com
>
> **Keep this in sync with the in-app policy modal** (`src/App.vue`, split into Terms / Privacy / Carbon Credits tabs). The modal and this document must not contradict each other — a mismatch on carbon-credit claims or money handling is a material misrepresentation.

---

## ⚠️ 0. Platform Status Notice — read first

Carbonify is operating a **closed commercial beta on test payment keys.** The platform is feature-complete and its money path is server-authoritative, RLS-locked and reconciled — but **live payment keys are not yet enabled** and **credits are not yet backed by an external registry.** By using Carbonify in its current state you acknowledge:

- **Carbon credits on Carbonify are currently generated within Carbonify's own MRV and issuance system**, using simplified, IPCC-style emission factors. They are **not yet** registered with, backed by, or retired against a recognized external registry (Verra/VCS, Gold Standard, Climate Action Reserve, American Carbon Registry). **They must not be used for regulatory compliance, official offset claims, ESG reporting, or resale as real-world carbon instruments.**
- **Payments run against PayMongo in TEST mode during the beta.** The server-authoritative checkout, signed webhook, double-entry ledger, escrow, and payout systems are built, RLS-locked, and reconcile to zero on the live database — but **no real money is being moved until the platform publicly confirms live status.** Do not transact expecting real settlement.
- **Carbonify is not a licensed financial institution, payment service provider, e-money issuer, or investment adviser.** Nothing here is financial, investment, tax, or legal advice. A licensed PH PSP/EMI arrangement is required before real funds are custodied (§9).
- Sections marked **🔜 Planned** below describe features that are **not yet implemented** and create **no obligation** until announced as live.

If any term below conflicts with this Section 0 while the closed beta is running, **Section 0 controls.**

---

## 1. User Agreement (Terms of Service)

### 1.1 Acceptance
By creating an account or using Carbonify, you agree to this Agreement, the Privacy Policy (§2), the Carbon Credits Policy (§3), and the AML/KYC & Sanctions Policy (§6). If you do not agree, do not use the platform.

### 1.2 Eligibility & Accounts
- You must be of legal age and capacity in your jurisdiction.
- You must provide accurate registration, KYC, and (for sellers) KYB information, and keep it current.
- You are responsible for safeguarding your credentials. **2FA/MFA (TOTP)** is supported and enforced at step-up (aal2) for sensitive actions.
- One person/entity per account unless expressly permitted. Misuse may result in suspension (§1.8).
- **Email confirmation:** during the beta, email verification may be disabled; you are responsible for using an email address you control. When enabled, account recovery and notifications route through your verified address.

### 1.3 Roles & Permitted Use
Carbonify supports **seven roles** — general user, buyer/investor, project developer, verifier, administrator, LGU user, and **farmer**. You may use only the functions granted to your role, enforced by route guards and database Row-Level Security. Role applications (developer / verifier / farmer) are subject to review and approval; a specialist role remains restricted until approved.

### 1.4 Marketplace & Transactions
- All credits must be **verified/issued in-platform** before listing.
- Pricing is displayed transparently; the **purchase amount is computed server-side** from the listing price — you confirm quantity, not price. The browser never dictates the amount charged.
- **A seller may not buy their own listing** (wash-trading is blocked in the settlement RPC).
- **All sales are final once payment is confirmed**, except as provided by the Refund & Dispute terms (§1.6).
- **Transaction limits** may apply by KYC tier (velocity caps — §6).
- Market manipulation, wash trading, and collusive pricing are prohibited (§1.7).

### 1.5 Seller Payouts & Escrow
- Sellers (project developers) may request withdrawal of **available** earnings; **payouts are gated on completed KYB (business verification).**
- **Hold model (chargeback protection).** To protect against payment reversals, seller proceeds may be held before becoming withdrawable:
  - **Card payments:** held for a hold window (typically up to **7 days**) before release, during which the funds show as **"held in escrow"** and are not withdrawable.
  - **Wallet, GCash, and Maya payments:** released **immediately** (these rails do not charge back).
  - Hold windows are set by platform configuration and may change with notice.
- Released funds move to your withdrawable balance automatically once the hold matures **and no dispute is open.** Payouts then move through a tracked state machine (requested → processing → settled/failed).
- **You are responsible for the taxes applicable to your earnings.**

### 1.6 Refunds & Disputes
- **Buyers may open a dispute** on their own transaction; **administrators review and resolve** disputes, and may issue a refund.
- Refunds are issued for **verified technical errors or upheld disputes**, and (where applicable) within the stated window after the transaction.
- Refunds and disputes are handled via **compensating ledger entries** — original records are never altered. A refund restores inventory, marks the transaction and ownership refunded, and reverses the seller's proceeds (from escrow if still held, otherwise from their balance).
- An administrator **may not refund a transaction in which they are the buyer or the seller** (segregation of duties — §1.11).

### 1.7 Prohibited Conduct (Acceptable Use)
No fraud, money laundering or terrorist financing, double-counting/double-claiming of credits, wash trading or market manipulation, circumvention of KYC/KYB or velocity limits, sanctions evasion, scraping/abuse, reverse engineering of security controls, uploading false or tampered project evidence, or misrepresenting Carbonify credits as accredited external offsets (§3.2). Violations may result in suspension, reversal of transactions, and reporting to authorities where required.

### 1.8 Suspension & Termination
We may suspend or terminate accounts for breach, suspected fraud/AML risk, or legal requirement. A **suspended account is blocked at the database from transacting** (purchasing, retiring, listing). Records are retained for audit and compliance (§2.6).

### 1.9 Liability & Warranty
Carbonify is provided **"as is" and "as available," without warranties.** To the maximum extent permitted by law, Carbonify and its operators are not liable for indirect or consequential losses, nor for losses arising from the beta limitations disclosed in §0 — specifically that credits are not yet registry-backed and that payments run in test mode.

### 1.10 Changes
We may update this Agreement; material changes will be notified in-app and/or by email. Continued use after the effective date constitutes acceptance.

### 1.11 Integrity, Independence & Segregation of Duties
These rules are enforced in the database, not just in the interface:
- **Verifier independence.** A verifier may **not** validate or approve a project they own or are otherwise conflicted on. Verification and issuance are independent of the developer submitting the project.
- **Admin segregation of duties.** An administrator may **not** grant themselves privilege or money: no self-raising of one's own KYC level or role, no self-verifying one's own KYB, and no refunding a transaction one is party to.
- **Server-authoritative money.** Balances, ownership, listings prices, credit pools, and retirements are **not writable from the browser**; they change only through audited server-side functions. The platform can prove this posture from version control (money-table RLS is captured and continuously auditable).

### 1.12 LGU Endorsements — jurisdiction scope
An LGU user's project endorsements are **scoped to the municipality/jurisdiction that LGU governs.** An LGU cannot endorse projects outside its recorded jurisdiction. Endorsements are an expression of local support and are **not** a substitute for verification or accreditation.

### 1.13 Farmer Carbon Participation — estimate, not ownership
Where a farmer supplies feedstock to a project, any "carbon participation" figure shown to the farmer is a **pro-rata estimate** (by delivered mass, per project, over confirmed deliveries and approved verifications) presented for transparency only. It is **an estimate, not a carbon credit**: a farmer **cannot sell, retire, or claim** it as an offset, and deliveries in non-mass units (sacks/bales/m³) are excluded from the calculation. See [FARMER_CARBON_ATTRIBUTION.md](FARMER_CARBON_ATTRIBUTION.md).

---

## 2. Privacy Policy

### 2.1 Data we collect
- **Account & profile:** name, email, role, organization details, subscription plan.
- **Identity verification:** KYC (and KYB for sellers) documents and status.
- **Transactional:** purchases, listings, wallet/payout activity, certificates, receipts, audit-log events.
- **Project & MRV:** submissions, uploaded compliance documents, monitoring reports and evidence.
- **Technical:** authentication/session data, basic usage and device/log data, and **error-monitoring telemetry (Sentry)** used to detect and fix faults.

### 2.2 How we use it
To operate accounts and roles, process verification and transactions, issue and verify certificates, screen for AML/sanctions risk (§6), maintain an audit trail, secure the platform, and meet legal/regulatory obligations.

### 2.3 Storage & security
Data is stored in **Supabase (PostgreSQL)** protected by Row-Level Security, with MFA, role-based access control, and audit logging. KYC/KYB and project documents are held in **restricted (private) storage**, reachable only via short-lived signed URLs to authorized parties. Transport is over TLS.

### 2.4 Sharing
We do not sell personal data. We share only with service providers necessary to operate (e.g., the payment gateway PayMongo, email delivery via Resend, error monitoring via Sentry), or where required by law or lawful AML/sanctions obligations. 🔜 **Planned:** formal data-processing agreements executed with each third-party processor.

### 2.5 Your rights (Data Privacy Act of 2012 / RA 10173)
You may request access to, correction of, or deletion of your personal data, and may withdraw consent subject to legal retention requirements.
- **Self-service tooling is available:** the **Privacy & Data** area of your profile lets you **export your data** and **request account deletion**; deletion requests are processed by a dedicated erasure worker, and an administrator queue tracks data-subject requests.
- 🔜 **Planned:** appointment of a formal **Data Protection Officer (DPO)** and registration with the National Privacy Commission as part of the go-live/legal track (§9). Until a DPO is appointed, escalations may be sent to support@carbonify.com.

### 2.6 Retention
Financial, ledger, audit, and compliance records are retained for the period required by applicable law (and are **append-only** — never edited or deleted in place). Other personal data is retained while your account is active, then handled per an approved data-deletion request subject to the legal-retention exceptions above.

### 2.7 Cookies & local storage
Carbonify uses browser storage for authentication/session, and for your theme, language, and interface preferences. Preference storage is separate from authentication — signing out clears auth keys but preserves your accessibility/interface settings.

---

## 3. Carbon Credits Policy

### 3.1 Definition
On Carbonify, **1 credit = 1 metric tonne CO₂e** reduced or removed.

### 3.2 Current nature of credits — important
- Credits are presently **generated and tracked within Carbonify's own MRV and issuance system** using simplified, IPCC-style emission factors.
- They are **NOT** currently:
  - registered with or retired against an external registry (Verra/VCS, Gold Standard, CAR, ACR);
  - validated by an **accredited third-party VVB** (Carbonify uses an internal verifier role);
  - based on accredited, peer-reviewed methodologies.
- **Therefore Carbonify credits are not, at this stage, recognized real-world carbon offsets** and must not be represented as such — by buyers, sellers, or the platform.

### 3.3 Issuance & integrity
- Credits are issued through the platform's verification workflow (verifier approval of the project/monitoring evidence).
- Each unit carries a **unique serial number**, a **QR code, and a SHA-256 tamper-evident signature**, verifiable on a public certificate page without logging in.
- **Retirement is permanent** — retired credits cannot be traded, resold, or reused; the burn and the retirement record commit **atomically**, and anti-double-counting is enforced.

### 3.4 Classification & registry metadata
- Projects declare a **methodology** from a controlled list (Verra/VCS, Gold Standard, Puro.earth, ISO 14064, CDM, ACR, CAR, Plan Vivo, ISCC, a PH national methodology, the interim Carbonify Standard, or "Other"), and a **development status** (concept → operational → decommissioned) that is **separate** from the platform validation status.
- Verified reductions are classified as **removal vs avoidance** where asserted by the verifier; unclassified legacy reductions are shown honestly as "unclassified," never guessed.

### 3.5 Fees
Platform fees are displayed at checkout and computed server-side. The platform fee is **currently 0%** and is **admin-configurable**; any change takes effect only from the time it is set and is disclosed at checkout.

### 3.6 Developer obligations
Developers must use the platform's approved project types and methodologies, submit required documents, and provide periodic monitoring. Contracted revenue (offtake/ERPA) figures are the developer's representations. Non-compliance may result in delisting.

---

## 4. Feature availability — shipped vs planned

### ✅ Now available
Auth/roles/2FA/KYC/KYB; project registration + documents + boundary map + edit/resubmit; MRV with server-side calculation and verifier scored rubric + comment threads; issuance + QR/serial/signature certificates + public verification; marketplace + cart + wallet + portfolio (P&L) + watchlist/price alerts + retirement; server-authoritative money path with signed webhook, double-entry ledger, refunds/disputes, seller payouts + KYB; **public registry** and market dashboard; **admin finance / KYB / refunds / system-config consoles**; **DPA self-service** (export + deletion) with an admin queue; **AML screening, velocity caps, account suspension** (admin tooling); **external PSP settlement reconciliation**; VAT invoices (provisional); LGU tools; the expansion features (registry fields, carbon asset ledger, biomass marketplace, MRV dashboard, investor portal + data room, farmer portal).

### 🔜 Planned — not yet available (no obligation until announced live)
- **Real credit-supplier / registry integration** (Carbonmark/Cloverly/Patch) so certificates carry a verifiable **external registry serial + retirement receipt** — the change that would retire the §3.2 disclaimer. A `local | supplier` source label will distinguish Carbonify-issued credits from registry-backed credits side by side.
- **Accredited third-party VVB** model and approved, peer-reviewed methodologies; **published methodology documentation** with cited emission-factor sources.
- **Live PSP/EMI custody** of funds, **BIR-accredited official receipts/VAT**, and the **legal/AMLA/DPO** program (§9).
- **AI assistant backend** (currently an interface preview only), MRV satellite/IoT feeds, and native mobile.
- The **independent penetration test** before live payment keys.

---

## 5. AML / KYC & Sanctions Policy

Carbonify applies anti-money-laundering and know-your-customer controls proportionate to its stage; these become a formal AMLA program before live funds (§9).

- **KYC to transact.** Identity verification (KYC) is required to buy or trade; business verification (KYB) is required for seller payouts.
- **Tiered limits.** Transaction **velocity caps apply by KYC tier** — higher limits require higher verification. Attempts beyond your tier's cap are refused server-side.
- **Screening & monitoring.** Accounts and transactions may be **screened against an AML watchlist**; matches are recorded for administrator review. Suspicious activity may trigger holds, additional verification, suspension (§1.8), and reporting where legally required.
- **Segregation of duties** (§1.11) and the **server-authoritative money path** (§1.4) exist specifically to prevent internal abuse and value manipulation.
- **No self-dealing / structuring.** Splitting transactions to evade caps, cycling funds between related accounts, or self-purchasing to fabricate volume is prohibited and detectable.

---

## 6. Changes, precedence & contact

- This document supersedes the inline policy text where they conflict, **except that the Platform Status Notice (§0) controls while the closed beta is running.**
- Questions, privacy requests, and disputes not resolvable in-app: **support@carbonify.com**.

---

## 7. Operational constraints affecting these policies (internal note)

> This section is for the Carbonify team, not end users. Remove before publishing the public-facing version.

- **These policies cannot be presented as final/binding** until: (a) the closed beta on test keys is complete; (b) a **DPO is appointed** and NPC registration is done; (c) a **licensed PSP/EMI custodies funds**; (d) the independent **penetration test** passes; and (e) **counsel + DPO sign off.** (Go-live gate in [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) §5.)
- **In-app modal status (2026-07-25, commercial repositioning): consistent.** `src/App.vue` carries the beta status notice (credits not registry-backed, payments in test mode) and splits the footer into Terms / Privacy / Carbon Credits tabs. The prior "meets Verra/Gold Standard" misrepresentation and the "academic capstone / simulated credits" framing are both **gone.** Keep the modal and this document in lockstep on any change to §0, §1.5 (escrow), §3.2 (credit nature), or §3.5 (fees).
- **⚠️ Escrow (§1.5) is a HARD PAIRING.** The policy — here *and in the in-app modal* — now describes the method-gated hold (Option B; [ESCROW_DECISION.md](ESCROW_DECISION.md), [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) #14). Live behaviour is **still instant payout** until `20260725000200_restore_escrow_hold_window.sql` is applied. **Migration `20260725000200` must be applied BEFORE the first pilot seller is invited**, or the platform is describing a protection it does not yet provide. This is already step 1 of the pre-flight in [HANDOFF.md](HANDOFF.md) — do not reorder it.
- Keep §0, §3.2, and §3.5 in sync with the build as real-credit integration lands and the fee model is set.

---

*Working draft pending legal and DPO review. The Platform Status Notice (§0) controls while the closed beta is running.*
