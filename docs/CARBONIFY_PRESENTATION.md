# Carbonify Presentation Brief

**Purpose:** a concise, presentation-ready overview of the Carbonify system: who uses it, what each role can do, what dashboards exist, what is implemented today, what is still missing, and what improvements are needed next.

---

## 1. What Carbonify Is

Carbonify is a Philippine carbon-credit registry and marketplace built with Vue 3 and Supabase. It covers the full carbon-credit lifecycle in software: project registration, validation, MRV, verification, credit issuance, marketplace trading, retirement, and supporting admin/compliance flows.

The platform is designed around two principles:

1. The browser should never be trusted with money or credit math.
2. Sensitive actions should be enforced server-side through roles, RLS, and SECURITY DEFINER RPCs.

---

## 2. The Roles

Carbonify currently supports six core production roles in the main user guide, plus a newer farmer expansion role in the codebase.

### Role Summary

| Role | Main Purpose |
|---|---|
| General User | Basic access, browsing, profile, and upgrade path to buyer activity once KYC is complete. |
| Buyer / Investor | Buys credits, retires credits, downloads certificates, and reviews receipts and transaction history. |
| Project Developer | Creates projects, uploads documents, submits monitoring reports, and manages listings. |
| Verifier | Reviews submissions, scores projects, validates MRV, and approves issuance. |
| Administrator | Manages users, roles, KYC/KYB, finance, refunds, and system configuration. |
| LGU User | Uses municipal and community climate tools, endorsements, and emissions workflows. |
| Farmer | New expansion role for biomass supply-side workflows: parcels, deliveries, and carbon participation. |

### What each role sees

#### General User / Buyer

This role is centered on public browsing and retail carbon-credit usage. The buyer-facing experience includes the marketplace, wallet, certificates, receipts, carbon calculator, and transaction history. Once KYC is complete, the user can purchase and retire credits.

#### Project Developer

Developers work in the project and MRV workflow. Their main surfaces are project registration, project dashboards, document upload flows, and monitoring reports. This is where projects are created, revised, and prepared for verification.

#### Verifier

Verifiers review developer submissions, evaluate projects against a rubric, and approve verified emission reductions. They also handle application review for project-developer access and see internal review tooling.

#### Administrator

Admins manage the system. They can change roles, review KYC/KYB, process refunds, inspect finance, and oversee platform operations. Admins also have access to support and audit-oriented views.

#### LGU User

LGU users operate community and local-government climate tooling. The platform supports emissions-related reporting, host endorsements, and city/community planning workflows.

#### Farmer

The farmer role is the newest expansion surface. It supports plantation parcel records, biomass delivery logging, delivery confirmation, and farmer carbon participation views. This is implemented as a dedicated farmer portal and role guard in the codebase.

---

## 3. Dashboards and Surfaces

The user experience is organized by role-specific dashboards and views.

### Buyer / Investor Dashboards

- Marketplace browsing and buying.
- Wallet and payment history.
- Certificates and retirement proofs.
- Receipts and transaction history.
- Carbon calculator and impact summaries.
- Public registry and certificate verification.

### Project Developer Dashboards

- Project submission and project management.
- Developer projects dashboard.
- Monitoring and MRV dashboard.
- Document uploads and revision cycles.
- Carbon-credit listing and sales preparation.

### Verifier Dashboards

- Verifier panel.
- Project assessment and rubric scoring.
- Developer application review.
- MRV review and approval.
- Internal comments and audit-backed review actions.

### Administrator Dashboards

- User management.
- Role assignment.
- KYC review.
- KYB review.
- Finance console.
- Refund console.
- System settings and support workflows.

### LGU Dashboards

- LGU climate tools.
- Municipal emissions and community reporting.
- Host endorsement workflows.
- ESG and local planning support.

### Farmer Dashboards

- Farmer portal.
- Parcel register.
- Feedstock delivery records.
- Buyer confirmation and payment status.
- Farmer carbon participation view.

---

## 4. What Is Implemented Today

### Strongly implemented

- Authentication with Supabase Auth.
- Password reset and profile management.
- TOTP MFA with step-up enforcement.
- Role-based access control with route guards.
- Row-Level Security on the backend.
- Server-side money settlement and double-entry ledger.
- Verified project lifecycle: register, validate, MRV, issue, trade, retire.
- Serialized credits and tamper-evident certificates.
- Real payment integration via PayMongo.
- KYC and KYB gating for sensitive flows.
- Admin workflows for users, verification, finance, and refunds.
- LGU tooling and public certificate verification.
- Farmer expansion tables, RPCs, and portal scaffolding.

### Implemented with some limits

- Marketplace trading exists, but it is still mostly fixed-price and not negotiation-based.
- Public transparency exists through certificates and registry pages, but not as a fully searchable registry for every lifecycle event.
- Financial and risk scoring exist, but deeper finance projections are not yet a full module.
- LGU tools exist, but land-use carbon modeling is still not complete.
- Farmer functionality exists, but it is still a newer expansion area relative to the core carbon registry.

---

## 5. Security and Policy Model

### Security model

Carbonify’s security model is built on server-side enforcement, not just UI checks.

- **Authentication:** Supabase Auth with email/password.
- **MFA:** TOTP-based two-factor authentication with aal2 step-up enforcement.
- **Authorization:** route guards plus backend RLS and stored-procedure enforcement.
- **Money safety:** the client never sets settlement amounts; the server computes and settles them.
- **Ledger safety:** financial tables are server-write-only.
- **Verification safety:** sensitive actions are gated by role and identity checks.
- **Auditability:** major actions are logged.

### Policy model

The platform policy is that each role only sees and does what it is allowed to do. In practice, that means:

- Buyers cannot act as admins.
- Verifiers cannot freely change money data.
- Developers cannot mint credits by themselves.
- Farmers can only use the farmer portal and related biomass workflows.
- Admin actions are separated into dedicated tools and RPCs.

### Current policy posture

The policy design is commercial-grade: access control, segregation of duties, and money authority are enforced in the database rather than in the interface, and the posture is provable from version control. It is not yet equivalent to a fully accredited carbon registry, because the remaining controls — accredited third-party verification, approved methodologies, and independent governance — depend on external institutions rather than on the software.

---

## 6. Feasibility

### Technical feasibility

Carbonify is technically feasible because the core flows are already implemented in software:

- Users can authenticate and be assigned roles.
- Projects can be submitted and reviewed.
- MRV can be calculated on the server.
- Credits can be issued, sold, retired, and verified.
- Payments can be settled with controlled server-side logic.

### Operational feasibility

The platform is feasible as a working commercial product today, entering a closed beta with real organizations. It is strongest when presented as:

- A feature-complete Philippine carbon-credit registry and marketplace.
- A platform built for institutional users — project developers, corporate buyers, verifiers, and LGUs.
- A system with real security and finance controls, enforced at the database.

### Institutional feasibility

This is where the biggest gap remains. To become a real registry, the system still needs:

- Accredited third-party verification.
- Approved methodologies.
- National-registry interoperability.
- Compliance and legal operating structure.
- External AML / screening / audit processes.

So the software is feasible now, but the real-world registry model still depends on institutions outside the codebase.

---

## 7. What Is Not Yet Implemented

This is the most important section for honest presentation.

### High-priority gaps

- Independent accredited verifier model is not in place.
- Approved peer-reviewed methodologies are not fully formalized.
- Public searchable registry coverage is not complete.
- Double-claim / double-use prevention needs stronger enforcement.
- Purchase-side oversell hardening still needs consolidation.
- MRV reminders are not automated.
- SDG capture and filtering are not fully implemented.
- Buyer offers / negotiation are not implemented.
- Deeper finance and carbon-yield analytics are still limited.
- Structured project-boundary and permanence-risk modeling are incomplete.
- Data Privacy Act tooling is present in parts, but consent/export/delete workflows need fuller operational polish.

### Future-facing items

- Blockchain tokenization / immutable registry.
- Article 6 and national-registry interoperability.
- Public registry APIs and broader ecosystem integration.
- More advanced LGU land-use carbon modeling.
- Richer analytics and chart-driven decision support.

---

## 8. What Is Needed Next

To move from “commercially ready software” to “accredited, production registry,” the next work should be:

1. Tighten trading integrity and double-claim prevention.
2. Publish a full searchable registry view.
3. Formalize methodologies and assumptions per project type.
4. Add reminder automation for MRV and review workflows.
5. Expand finance/risk analytics for developers and buyers.
6. Complete privacy tooling and operating procedures.
7. Define the path to accredited third-party verification and institutional governance.

If the goal is to present today, the key message is simpler:

> Carbonify is a working end-to-end carbon-credit platform with real security and transaction controls, entering a closed commercial beta. The remaining work is about institutional legitimacy and accreditation, not missing product.

---

## 9. Suggested Presentation Close

Use this closing line if you want a short, confident summary:

> Carbonify demonstrates that a Philippine carbon-credit registry can be built as a secure, role-based, server-authoritative platform. The core product is implemented; the remaining gap is not the software shape, but the external accreditation, governance, and compliance layer needed to operate it as a true registry.

---

## 10. References In This Repo

- [docs/ABOUT_CARBONIFY.md](ABOUT_CARBONIFY.md)
- [docs/ECOLINK_SYSTEM_ANALYSIS.md](ECOLINK_SYSTEM_ANALYSIS.md)
- [docs/dev/SECURITY.md](dev/SECURITY.md)
- [docs/user-guide/README.md](user-guide/README.md)
- [src/constants/roles.js](../src/constants/roles.js)
- [src/middleware/roleGuard.js](../src/middleware/roleGuard.js)
- [src/views/FarmerPortalView.vue](../src/views/FarmerPortalView.vue)
- [src/views/VerifierPanel.vue](../src/views/VerifierPanel.vue)
- [src/views/DeveloperProjectsDashboardView.vue](../src/views/DeveloperProjectsDashboardView.vue)
- [src/views/AnalyticsView.vue](../src/views/AnalyticsView.vue)
