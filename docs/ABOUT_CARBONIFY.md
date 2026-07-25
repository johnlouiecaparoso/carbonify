# What is Carbonify?

A plain-language explanation of what the Carbonify system is, the problem it solves, who uses it, and how it works. For step-by-step usage see the [User Guide](user-guide/README.md); for engineering detail see the [Developer Docs](dev/README.md).

---

## In one sentence

**Carbonify is a Philippine carbon-credit registry and marketplace** — a web platform where climate projects are registered and verified, carbon credits are issued with tamper-evident certificates, and buyers purchase and permanently retire those credits to offset their emissions.

## The problem it solves

Carbon credits let an organization pay for verified climate action (reforestation, biochar, waste diversion, etc.) to compensate for emissions they can't yet eliminate. But for a credit to be **trustworthy**, four things must be true, and they're hard to coordinate:

1. The project is **real and additional** (it wouldn't have happened anyway).
2. Its impact is **measured, reported, and independently verified** (MRV).
3. Each credit is **uniquely tracked** so it can't be sold or claimed twice.
4. The **money moves safely** between buyer, platform, and project developer.

Carbonify puts all four in one system: registration → validation → monitoring/verification → issuance → trading → retirement, with the money handled server-side and the credits tracked by serial number.

## Who uses it (the seven roles)

| Role | What they do |
|---|---|
| **General User / Buyer** | Browse the marketplace, buy credits (card, GCash/Maya, or wallet), and **retire** them for a certificate. |
| **Project Developer** | Register climate projects, upload compliance documents, file monitoring reports (MRV), and earn + sell credits. |
| **Verifier** | Review project submissions and monitoring reports, score them against a rubric, and approve the verified emission reductions that mint credits. |
| **Farmer** | Supply biomass feedstock to projects, log deliveries, and see an estimate of the carbon their feedstock contributed. |
| **Administrator** | Manage users and roles, review KYC/KYB, oversee finance and refunds, and configure the platform. |
| **LGU (Local Government Unit)** | Use climate tools — municipal-waste emissions calculator, land-use carbon modeling, waste-diversion tracking, city ESG summary, and endorsing local projects. |

> **Note — accounts are individual.** Every Carbonify account belongs to a person, not a company.
> Organization/team accounts (shared ownership of credits, org-addressed invoices with a buyer TIN,
> member roles) are **scoped but not built** — see [ORGANIZATION_ACCOUNTS_SCOPE.md](ORGANIZATION_ACCOUNTS_SCOPE.md).

## The carbon-credit lifecycle Carbonify manages

```
Register  →  Validate  →  Monitor & Verify (MRV)  →  Issue  →  Trade  →  Retire
(developer)  (verifier)      (developer + verifier)   (auto)   (buyer)  (buyer)
```

1. **Register** — a developer submits a project with location, type (7 Philippine, DENR/CCC-aligned project types), and nine compliance documents (PDD, baseline, additionality, leakage, safeguards, LGU endorsement, land/lease, ECC, MOA).
2. **Validate** — a verifier reviews the submission against a scored rubric, can request revisions, and sets the credit price.
3. **Monitor & Verify (MRV)** — the developer files monitoring reports; the server calculates the emission reductions (the developer can't dictate the number); the verifier approves the result.
4. **Issue** — approval mints credits, each with a unique serial number, and publishes a marketplace listing automatically.
5. **Trade** — buyers purchase credits; ownership transfers; a QR-verifiable certificate and receipt are generated.
6. **Retire** — a buyer permanently retires credits to claim the offset; retired credits can never be sold again, and a public verification page proves the claim.

## What makes the credits credible

- **Server-side MRV calculation** — the emission-reduction number is computed by the platform, not entered by the developer.
- **Tamper-evident certificates** — every certificate carries a serial number, a QR code, and a SHA-256 signature; anyone can verify one at `/verify/<certificate-number>` without logging in.
- **Public carbon registry** — issued and retired credits are browsable at `/registry`, and a public market dashboard (`/market`) shows supply, price range, and retirements.
- **Double-claim protection** — a registry serial can't back two certificates, and a non-retired credit can't be sold twice.

## How the money works (and why it's safe)

Carbonify uses a **server-authoritative money path** so a user can never control what they pay or credit themselves:

- The browser sends only *which listing* and *how many credits*; the **server recomputes the price** from the listing.
- Payments (via **PayMongo** — cards, GCash, Maya) are confirmed by a **signed webhook** that is the single source of truth; it's protected against forgery and replay.
- Every settlement writes a **double-entry ledger**, and a reconciliation report proves the books balance.
- The financial tables are **server-write-only** — the browser cannot write balances, transactions, or ownership directly.
- Sellers are paid through **escrow + KYB-gated payouts**, with refunds and disputes handled by compensating entries (originals are never edited).

Identity checks gate the sensitive actions: **KYC** (identity verification) is required to buy or trade; **KYB** (business verification) is required for a developer to withdraw earnings; and **two-factor authentication (2FA)** can be enforced at login.

## Current status

- **The software is feature-complete** across registration, MRV, issuance, certificates, marketplace, wallet, payouts, admin/compliance tooling, the public registry, and LGU tools.
- **The money path is proven and hardened** — every payment flow settles server-side and reconciles to zero, with the financial tables locked to server-write-only. See [RELEASE_NOTES.md](RELEASE_NOTES.md) and [MONEY_CUTOVER_STATUS.md](MONEY_CUTOVER_STATUS.md).
- **What remains needs an outside party or ops/legal, not more code:** integration with an accredited registry (Verra / Gold Standard / Carbonmark / Patch) for real-world credits, AML/sanctions screening, an independent penetration test before using live payment keys, and the business/legal track (legal entity, licensed payment partner, BIR registration, accredited third-party verifier). Until then, credits are issued in-platform rather than fulfilled against an external registry, and VAT invoices are provisional.

## Technology at a glance

| Layer | Technology |
|---|---|
| Frontend | Vue 3, Vue Router, Pinia, Vite |
| Backend | Supabase — Postgres, Auth, Edge Functions (Deno), Storage |
| Payments | PayMongo (cards, GCash, Maya) |
| Maps / charts / docs | Leaflet, Chart.js, jsPDF, QR codes |

## Learn more

- **Use the app:** [User Guide](user-guide/README.md) (one guide per role)
- **Build / operate it:** [Developer Docs](dev/README.md) — setup, architecture, database & RPCs, deployment, testing, security
- **Money path detail:** [PAYMENTS_ARCHITECTURE.md](PAYMENTS_ARCHITECTURE.md) · [MONEY_CUTOVER_STATUS.md](MONEY_CUTOVER_STATUS.md)
- **Deployment readiness & security:** [dev/SECURITY.md](dev/SECURITY.md)
