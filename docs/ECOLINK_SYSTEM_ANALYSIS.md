# Carbonify — System Analysis, Benchmark & Gap Report

**Prepared:** June 2026
**Scope:** Implementation status against the SRD + Platform Review, a benchmark against real‑world carbon registries, and a rating of what is still missing.
**Nature of the system:** A commercial Philippine carbon‑credit registry and marketplace (Vue 3 + Supabase/PostgreSQL) built for real project developers, verifiers, corporate buyers, and LGUs.

> 🧭 **Repositioned 2026-07-25.** Carbonify is no longer an academic capstone; it is a commercial
> product preparing for a closed beta with real organizations. The "capstone SRD" lens below is kept
> only because the SRD is still the functional-requirements baseline this system was measured against —
> it is **not** a statement about the project's status or ambition. The commercial readiness gate is
> [GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) §5; current state is [HANDOFF.md](HANDOFF.md).

---

## 1. Executive Summary

Carbonify has moved well beyond a "simple project listing" prototype. Over six implementation phases it now covers the **full lifecycle** the SRD describes — registration → validation → MRV → verification → issuance → marketplace → trading → retirement — with serialized carbon units, server‑side emission‑reduction calculation, verifier‑gated issuance, KYC, MFA, an LGU tool suite, and a public certificate‑verification page.

| Lens | Rating | One‑line verdict |
|------|--------|------------------|
| **vs. the SRD (functional baseline)** | **9.0 / 10** | Nearly all functional requirements implemented; only "future module" items remain. |
| **vs. the Platform Review (PH eligibility)** | **8.5 / 10** | 7 of 8 improvement areas substantially delivered; blockchain + a few data fields outstanding. |
| **vs. a real‑world production registry (Verra/Gold Standard class)** | **4.5 / 10** | Has the *shape* of a registry, but lacks accredited third‑party VVBs, approved methodologies, independent governance, interoperability/Article 6, and registry‑grade immutability. |

**Bottom line:** As a software product, Carbonify is strong and largely feature‑complete — the platform mechanics (server‑authoritative money, RLS‑locked ledger, verifier‑gated issuance, tamper‑evident certificates) are commercial‑grade. What separates it from an *accredited* registry is **institutional, not technical**: external accreditation, approved methodologies, independent governance, and Article 6 interoperability. Those are procurable through partnerships and regulatory work, not more code — and they are tracked on the go‑live gate rather than treated as product gaps.

---

## 2. Implementation Status vs. the SRD (Functional Requirements)

Legend: ✅ Implemented · 🟡 Partial · ❌ Not implemented · ⏳ Marked "future" in the SRD itself

### 4.1 User Management
| Requirement | Status | Notes |
|---|---|---|
| Sign‑up/login (email + password) | ✅ | Supabase Auth, bcrypt-hashed. |
| 2FA | ✅ | TOTP MFA with enrollment + **strict login enforcement** (aal2 step‑up). SRD listed this as "future." |
| User profile | ✅ | Full profile + avatar. |
| Organization profile | ✅ | organization name/type/address. |
| Password reset | ✅ | Forgot/reset flow via recovery email. |
| Role‑based access control | ✅ | 6 roles, route guards, RLS. |

### 4.2 Project Registration
| Requirement | Status | Notes |
|---|---|---|
| Title, geo‑coordinates, barangay, municipality | ✅ | |
| Project type (predefined PH categories) | ✅ | 7 DENR/CCC‑aligned types, DB‑enforced. |
| Start/end date, host entity | ✅ | |
| Technical docs: PDD, baseline, additionality, leakage, safeguards, feasibility | ✅ | Document uploads. |
| Compliance docs: LGU endorsement, land ownership, ECC, MOA | ✅ | Document uploads. |
| **Project boundary definition** (Platform Review item) | 🟡 | Captured narratively via geo + docs; no dedicated structured boundary field/polygon. |
| Financials (CAPEX/OPEX, carbon yield projection) | 🟡 ⏳ | Form fields exist; SRD marks this a future module. Not surfaced in analytics. |

### 4.3 Project Validation Workflow
| Requirement | Status | Notes |
|---|---|---|
| Submission → screening → validator review → feedback loop → approval → Active Pool | ✅ | Decoupled model: validation marks eligibility; the "Active Pool" (credits + listing) now forms on verifier VER approval. |
| Status labels (Draft, Submitted, In Review, Needs Revision, Validated, Rejected) | ✅ | |
| Distinct "initial screening by admin" step | 🟡 | Screening + validation handled by verifier/admin together rather than two separate gates. |

### 4.4 MRV (Monitoring, Reporting, Verification)
| Requirement | Status | Notes |
|---|---|---|
| Developer submits monitoring report (yearly/quarterly) | ✅ | |
| Upload photos / production logs / data logs | ✅ | Evidence attachments per report. |
| Auto‑calculate emission reductions (methodology × baseline × activity × factors) | ✅ | **Server‑side** RPC; client cannot dictate credit amounts. |
| Independent verifier reviews MRV, approves/rejects VERs | ✅ | Verifier MRV dashboard. |
| Issuance: 1 credit = 1 tCO₂e | ✅ | Credits mint only from approved VERs. |
| Time‑stamped audit trail | ✅ | audit_logs across the lifecycle. |

### 4.5 Carbon Credit Issuance
| Certificate field | Status |
|---|---|
| Serial number | ✅ (per‑unit ledger serials `ECO‑…` + certificate number) |
| Project ID / details | ✅ |
| Verification year (vintage) | ✅ |
| Amount of credits | ✅ |
| QR code | ✅ (links to public verify page) |
| Signature of verifier/admin | ✅ (tamper‑evident SHA‑256 signature) |

### 4.6 Marketplace
| Requirement | Status | Notes |
|---|---|---|
| Browse verified projects | ✅ | |
| Filter by location, price | ✅ | |
| Filter by **SDG impact** | ❌ | No SDG data captured; filter not meaningful. |
| View project details/documents | 🟡 | Details yes; document viewing on the buyer card is limited. |
| Purchase credits | ✅ | Real PayMongo integration. |
| Download certificates | ✅ | |
| Sellers: list credits, set price | ✅ | |
| Sellers: **view buyer offers** | ❌ | Fixed‑price only; no bid/offer/negotiation. |
| Sellers: track sales history | 🟡 | Transactions recorded; no dedicated seller sales dashboard. |
| Trading: ownership transfer, transaction ID, balance update | ✅ | |

### 4.7 Notifications
| Requirement | Status | Notes |
|---|---|---|
| Email alerts | ✅ | |
| Dashboard: project approval | ✅ | |
| Dashboard: **MRV reminders** | ❌ | No scheduled reminder job. |
| Dashboard: verification updates | ✅ | Status‑change notifications. |
| Dashboard: purchase confirmations | ✅ | |

### 5. Non‑Functional Requirements
| Requirement | Status | Notes |
|---|---|---|
| Encrypted passwords (bcrypt), SSL/TLS | ✅ | Supabase + HTTPS hosting. |
| Input validation, activity logs, RBAC | ✅ | |
| Data integrity logs | ✅ | Audit trail + certificate signature hash. |
| Performance/Reliability/Scalability (Docker, backups, DR, 99% uptime) | 🟡 | Inherited from Supabase managed infra; no project‑level Docker/DR plan documented. |
| DENR CCS / CCC MRV / Carbon Pricing Framework alignment | 🟡 | Data model aligned; **no integration with an official national registry** (doesn't exist yet — see §4). |
| Philippine Data Privacy Act (DPA) | 🟡 | RLS + access control present; no explicit consent management / data‑export‑and‑delete tooling. |

---

## 3. Implementation Status vs. the Platform Review (8 PH‑Eligibility Areas)

| # | Area | Status | Evidence / Gap |
|---|------|--------|----------------|
| 1 | Mandatory PH compliance fields | 🟡→✅ | Baseline calc, additionality, land ownership, safeguards captured. **Gaps:** structured project‑boundary field, permanence‑risk modeling. |
| 2 | Strengthen MRV | ✅ | Monitoring dashboard, ER calculator (server‑side), verification doc submission, third‑party verifier access levels, time‑stamped audit trails — all present. |
| 3 | Eligible PH project types | ✅ | All 7 categories pre‑defined and DB‑enforced. |
| 4 | Trading & tokenization | 🟡 | Ownership transfer record ✅, carbon‑unit serials ✅, anti‑double‑counting ✅ (retirement) / 🟡 (purchase oversell), KYC ✅. **Blockchain tokenization ❌ (future).** |
| 5 | Security & authentication | ✅ | MFA ✅, RBAC ✅, encrypted storage ✅, data‑integrity logs ✅. **Optional blockchain audit trail ❌ (future).** |
| 6 | Financial & risk assessment | 🟡 | Feasibility score ✅, social‑impact score ✅, climate‑risk rating ✅. **Financial projections upload ❌**, carbon‑yield estimate 🟡. |
| 7 | UI/UX | ✅ | Progress tracker ✅, certificate viewer ✅, interactive map ✅, onboarding guide ✅, notifications panel ✅. Calculator‑with‑graphs 🟡 (calculator yes, inline graphs no; analytics has charts). |
| 8 | LGU integration tools | 🟡→✅ | MSW emissions calculator ✅, waste‑diversion monitoring ✅, city ESG ✅, host‑endorsement system ✅. **Land‑use carbon modeling ❌.** |

---

## 4. Benchmark vs. Real‑World Carbon Markets

Real voluntary‑market registries (Verra's VCS, Gold Standard) and the emerging PH compliance market set the bar Carbonify is measured against.

**How the real registries work (for reference):**
- **Verra (VCS):** developer designs a project under an *approved methodology* → submits a Project Description → **independent third‑party validation by an accredited VVB** → registration → monitoring → **independent third‑party verification** → issuance of serialized VCUs → retirement; all issuances/transfers/retirements are **publicly traceable by serial number**. ([Verra](https://verra.org/programs/verified-carbon-standard/), [SustainCERT](https://www.sustain-cert.com/news/what-are-verra-and-the-verified-carbon-standard))
- **Gold Standard:** generates **unique serial numbers per credit** for full lifecycle traceability (generation → sale → retirement) and is moving toward **digital MRV**. ([Gold Standard](https://www.goldstandard.org/project-developers/impact-registry))
- **Integrity bar (ICVCM Core Carbon Principles):** registries must uniquely identify/track each credit, be traceable to the activity, and prevent **double issuance, double claiming, and double use**. ([ICVCM](https://icvcm.org/core-carbon-principles/), [White & Case](https://www.whitecase.com/insight-alert/integrity-voluntary-carbon-market-draft-core-carbon-principles))
- **Next‑gen direction:** Verra + S&P Global are rolling out an API‑driven, Article 6/CORSIA‑compliant registry through 2026. ([Carbon Herald](https://carbonherald.com/verra-and-sp-global-unveil-next-generation-carbon-registry/))
- **Philippines:** the **Low Carbon Economy Act (HB 11375)** passed the House on 3rd reading (June 2025) and moved to the Senate; DENR + CCC + DOF are building the **national MRV system and registry**; a national carbon registry and market blueprint are in progress. The compliance market is *not yet fully operational*. ([ICAP](https://icapcarbonaction.com/en/ets/philippines), [Fairatmos](https://www.fairatmos.com/blog/philippines-opens-its-carbon-market-the-time-for-action-is-now))

### Feature‑by‑feature comparison

| Capability | Carbonify | Verra / Gold Standard | Verdict |
|---|---|---|---|
| Project lifecycle (register→validate→verify→issue→trade→retire) | ✅ Full | ✅ Full | **At parity (in shape)** |
| Serialized carbon units | ✅ Per‑unit `ECO‑…` serials | ✅ Industry standard | **At parity** |
| Digital MRV + server‑side ER calculation | ✅ | 🟡 (moving to digital MRV) | **Ahead in digitization** for a prototype |
| Verifier‑gated issuance (1 credit = 1 tCO₂e) | ✅ | ✅ | **At parity** |
| Anti‑double‑counting | 🟡 (retirement locked; purchase oversell partial) | ✅ (issuance/claim/use) | **Behind** — no double‑claim/double‑use controls |
| **Independent accredited VVBs** | ❌ (internal verifier role) | ✅ (mandatory) | **Major gap** |
| **Approved, peer‑reviewed methodologies** | ❌ (simplified IPCC‑style factors) | ✅ | **Major gap** |
| Public registry transparency | 🟡 (per‑cert verify page only) | ✅ (full public registry) | **Behind** |
| Independent governance / integrity labeling (ICVCM CCP) | ❌ | ✅/in‑progress | **Major gap** |
| Interoperability / API / Article 6 corresponding adjustments | ❌ | ✅/in‑progress | **Gap (institutional)** |
| Blockchain/tokenization & immutable ledger | ❌ (planned future) | 🟡 (some registries piloting) | **Parity on "future" status** |
| KYC for buyers/sellers | ✅ | ✅ | **At parity** |
| Financial settlement / escrow | 🟡 (PayMongo, manual confirmation) | ✅ (mature) | **Behind** |
| MFA + RBAC + audit trail | ✅ | ✅ | **At parity** |

**Interpretation:** Carbonify reproduces the *software mechanics* of a credible registry — and in digital MRV it is arguably ahead of where many incumbents were until recently. The gaps that remain are predominantly **institutional/regulatory** (accredited verifiers, approved methodologies, independent governance, national‑registry interoperability), which no software build can satisfy by code alone and which run on the partnership/regulatory track, plus a few technical items (double‑claim prevention, public registry transparency, blockchain).

---

## 5. What's Missing — Prioritized Rating

Severity: 🔴 High (credibility/compliance‑critical) · 🟠 Medium (expected by serious buyers) · 🟢 Low (nice‑to‑have / future)

| Missing / partial item | Severity | Effort | Category |
|---|---|---|---|
| Independent/accredited third‑party verification (VVB model) | 🔴 | High (institutional) | Governance |
| Approved, documented methodologies (vs. simplified factors) | 🔴 | High | Methodology |
| Double‑claim / double‑use prevention (retirement‑claim registry, ownership uniqueness) | 🔴 | Medium | Traceability |
| Purchase‑side atomic oversell hardening (consolidate `available_credits`/`credits_available`) | 🟠 | Low‑Med | Trading integrity |
| Public, searchable registry (all projects/credits/retirements) | 🟠 | Medium | Transparency |
| MRV reminder scheduling (quarterly/yearly nudges) | 🟠 | Low | Notifications |
| SDG impact data capture + real marketplace filter | 🟠 | Low‑Med | Marketplace |
| Buyer offers / bidding / negotiation | 🟠 | Medium | Marketplace |
| Financial projections upload + CAPEX/OPEX module + carbon‑yield analytics | 🟠 | Medium | Risk/finance |
| Structured project‑boundary definition + permanence‑risk modeling | 🟠 | Medium | PH compliance |
| Data Privacy Act tooling (consent, export, delete) | 🟠 | Medium | Legal |
| LGU land‑use carbon modeling | 🟢 | Medium | LGU tools |
| Blockchain tokenization / immutable registry | 🟢 ⏳ | High | Future |
| Article 6 / national‑registry interoperability (API) | 🟢 ⏳ | High (external) | Future/regulatory |
| Calculator with inline graphs | 🟢 | Low | UX |
| Docker / backups / DR runbook, performance NFR validation | 🟢 | Medium | Ops |

---

## 6. Scorecard by Category

| Category | Score | Rationale |
|---|---|---|
| User management & security | 9.5 / 10 | MFA (strict), password reset, RBAC, audit logs, org profiles. |
| Project registration & data fields | 8.5 / 10 | Comprehensive; missing structured boundary + financials module. |
| Validation & verification workflow | 9.0 / 10 | Full workflow; internal (not accredited) verifiers. |
| MRV system | 9.0 / 10 | Server‑side ER calc, evidence, VER approval — strong; methodologies simplified. |
| Issuance & certificates | 9.5 / 10 | Serials, QR, signature, public verify page. |
| Trading & traceability | 7.5 / 10 | Serials + retirement anti‑double‑counting solid; purchase oversell + double‑claim gaps. |
| Marketplace features | 7.0 / 10 | Buy/list/transfer solid; no offers, SDG filter, seller dashboard. |
| LGU tools | 8.5 / 10 | Calculator, diversion, ESG, endorsements; no land‑use modeling. |
| Dashboards & analytics | 8.0 / 10 | Role dashboards, charts, progress tracker, map. |
| Regulatory/institutional readiness | 4.0 / 10 | No accreditation, approved methodologies, or national‑registry link (partly external). |
| **Overall (product lens)** | **8.7 / 10** | Strong commercial product, PH‑aligned, broad and coherent. |
| **Overall (real‑registry lens)** | **4.5 / 10** | Credible software shell; institutional & methodology rigor outstanding. |

---

## 7. Recommended Next Steps (highest impact first)

1. **Trading integrity (technical, in‑reach):** consolidate the dual `available_credits`/`credits_available` columns and make the purchase decrement atomic (race‑safe oversell prevention); add a retirement‑claim uniqueness layer to block double‑claim.
2. **Transparency:** a public, searchable registry page (all validated projects + issued/retired serials) — the single biggest credibility signal toward real registries.
3. **MRV reminders + SDG capture:** small, high‑visibility wins that close two SRD/Review items.
4. **Methodology documentation:** publish the emission‑factor sources/assumptions per project type (move from "simplified factors" toward defensible, cited methodologies).
5. **Financial/risk module:** financial‑projection uploads + carbon‑yield analytics for corporate buyers.
6. **Compliance posture:** DPA consent/export/delete; document the path to accredited third‑party verification and eventual national‑registry/Article 6 interoperability.
7. **Future track:** blockchain tokenization/immutable ledger (explicitly future in the SRD).

---

## 8. Sources

- [Verra — Verified Carbon Standard](https://verra.org/programs/verified-carbon-standard/)
- [SustainCERT — Understanding Verra and the VCS](https://www.sustain-cert.com/news/what-are-verra-and-the-verified-carbon-standard)
- [Gold Standard — Impact Registry](https://www.goldstandard.org/project-developers/impact-registry)
- [CarbonMeld — Gold Standard's new registry](https://carbonmeld.com/en/articles/what-gold-standard-s-new-registry-means-for-carbon-credit-trading-transfers-and-buyer-confidence/)
- [ICVCM — Core Carbon Principles](https://icvcm.org/core-carbon-principles/)
- [White & Case — Integrity of the Voluntary Carbon Market](https://www.whitecase.com/insight-alert/integrity-voluntary-carbon-market-draft-core-carbon-principles)
- [Carbon Herald — Verra & S&P Global next‑gen registry](https://carbonherald.com/verra-and-sp-global-unveil-next-generation-carbon-registry/)
- [ICAP — Philippines ETS profile](https://icapcarbonaction.com/en/ets/philippines)
- [Fairatmos — Philippines Opens Its Carbon Market](https://www.fairatmos.com/blog/philippines-opens-its-carbon-market-the-time-for-action-is-now)
- [Berkeley Carbon Trading Project — Voluntary Registry Offsets Database](https://gspp.berkeley.edu/berkeley-carbon-trading-project/offsets-database)

> **Disclaimer:** Ratings are an engineering self‑assessment against the cited SRD, Platform Review, and public information about carbon markets as of June 2026. "Real‑registry" gaps are largely institutional (accreditation, governance, regulation) and are not achievable through software changes alone.
