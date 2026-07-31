# Carbonify — Expansion Feature Audit (bullet-by-bullet)

> **Audited:** 2026-07-09 · **Re-verified against code:** 2026-07-09 (after the close-out pass)
>
> **Method:** every sub-item checked against the actual code, columns, and rendered UI — never against
> a summary in another doc. Where a doc and the code disagreed, **the code won**.
>
> **Why this file exists:** the seven features were originally tracked at *feature* granularity
> ("#5 Investor Portal — shipped"), which hid missing *sub-items inside shipped features*. The
> feature-level status was badly over-optimistic. This page tracks the original spec bullet-for-bullet.

**Legend:** ✅ implemented · 🟡 partial · ❌ missing · ⏳ deferred (needs an external service + cost)

---

## Scorecard

| # | Feature | Was (first audit) | Now | Status |
|---|---|---|---|---|
| 1 | Project Registry | 5 / 8 | **8 / 8** | ✅ complete |
| 2 | Carbon Asset Management | 5 / 6 | **6 / 6** | ✅ complete |
| 3 | Biomass Marketplace | 6 / 7 | **7 / 7** | ✅ complete |
| 4 | MRV Dashboard | **0 / 8** | **6 / 8** | 🟡 satellite + IoT remain (external) |
| 5 | Investor Portal | 5 / 7 | **7 / 7** | ✅ complete |
| 6 | Farmer Portal | 3 / 6 | **5 / 6** | 🟡 training remains (content) |
| 7 | AI Project Assistant | 0 / 5 | **0 / 5** | 🔴 interface preview only |

**Nothing codeable remains in features #1–#6.** Everything still open needs one of: **training
content**, an **API key + running cost**, or an **external data feed**.

> The original lesson still stands: the missing sub-items clustered precisely in the investor- and
> farmer-facing surfaces that matter most to Japan Energy Capital / Enechange-class diligence.

---

## 1. Project Registry — ✅ 8/8

| Bullet | Status | Reality |
|---|---|---|
| GPS location | ✅ | `geo_coordinates` + `boundary` on a Leaflet map ([ProjectDetailView.vue:148](../src/views/ProjectDetailView.vue#L148)). Plotted, not shown as text. |
| Project developer | ✅ | Developer card: name, organization, type (`:126`). |
| Methodology (Verra, Gold Standard, Puro, ISO…) | ✅ | Grouped enum in [`projectRegistry.js`](../src/constants/projectRegistry.js) — Verra (VCS), Gold Standard, Puro.earth, ISO 14064, CDM, ACR, CAR, Plan Vivo, ISCC, PH national, Carbonify Standard, **Other**. Rendered via `methodologyLabel` (`:74`). Investor Portal filters by it. Legacy free text ("Verra VM0044") renders as-is and maps to **Other** on edit rather than being discarded. |
| Feedstock | ✅ | `:79` |
| Capacity | ✅ | `capacity` + `capacity_unit` (`:80`) |
| Expected carbon reductions | ✅ | `estimated_credits` + `expected_impact` (`:84`) |
| Development status | ✅ | Migration #28. concept → feasibility → financing → construction → operational → decommissioned, via `developmentStatusLabel` (`:77`). **Orthogonal to `projects.status`** (the validation workflow); a test asserts the two vocabularies never share a value, because conflating them was the original bug. Nullable — defaulting existing projects to 'concept' would assert something untrue about them. |
| Documents (PDD, feasibility, MRV reports) | ✅ | All three uploadable + viewable. `mrv_report_file` is in `OPTIONAL_DOCS` and the submit handler uploads it (`ProjectForm.vue:684, :792`). |

---

## 2. Carbon Asset Management — ✅ 6/6

| Bullet | Status | Reality |
|---|---|---|
| Issued credits | ✅ | from the sellable pool, falling back to approved VER volume |
| Pending credits | ✅ | VERs with `status='pending'` |
| Sold credits | ✅ | completed `credit_transactions` |
| Retired credits | ✅ | `credit_retirements` |
| **Buyer history** | ✅ | Sales select `buyer_id` + `created_at`; a **Buyer history** section lists counterparties per project (credits, value, purchase count, last purchase), largest first ([CarbonAssetLedgerView.vue:151](../src/views/CarbonAssetLedgerView.vue#L151)). Repeat purchases collapse into one row — an ERPA conversation wants a counterparty list, not a transaction log. Names degrade to "Unknown buyer" if the `profiles` read is RLS-blocked. Sales with no `buyer_id` bucket into one "unattributed" row rather than inflating the count. |
| Carbon inventory | ✅ | issued − sold, or the pool's available column |

---

## 3. Biomass Marketplace — ✅ 7/7

| Feedstock | Status |
|---|---|
| Black pellets | ✅ `black_pellets` — "Black pellets (torrefied)" |
| Biochar | ✅ |
| Rice husks | ✅ |
| Coconut biomass | ✅ (`coconut_husk`, `coconut_shell`) |
| Bana Grass | ✅ |
| Sugarcane bagasse | ✅ |
| Buyers request quotations directly | ✅ full RFQ → quote → accept/decline ([biomassService.js:163](../src/services/biomassService.js#L163)) |

---

## 4. MRV Dashboard — 🟡 6/8

**Was 0/8** — the weakest feature against its spec, despite being positioned as "one of the biggest
differentiators." It aggregated whatever `monitoring_activity_data` rows happened to exist and
computed none of the named metrics.

| Bullet | Status | Reality |
|---|---|---|
| Biomass collected | ✅ | Summed from **confirmed** farmer deliveries. `kg` converts to tonnes; **sacks/bales/m³ are excluded** and surfaced as a caveat — their mass depends on bulk density, and inventing one would corrupt the shared denominator. |
| CO₂ avoided | ✅ | Migration #29. `reduction_type` per VER, **asserted by the verifier at approval** — pre-selected from the project category, never auto-applied. |
| CO₂ removed | ✅ | Same. Dashboard shows **removed / avoided / unclassified**. Legacy VERs stay unclassified rather than retro-guessed into a type nobody asserted. |
| Energy generated | ✅ | Dedicated tile summing `energy_kwh`, scaled kWh → MWh → GWh. Deliberately **not** merged with `energy_saved_kwh` — energy saved is avoided consumption, a different claim. |
| Farmers participating | ✅ | Distinct `farmer_id` across confirmed deliveries to this developer. |
| Plantation hectares | ✅ | Needed **migration #26** (a buyer may read a parcel only where it supplied them a delivery they confirmed). Excludes retired land. Without #26 it reads "—" and says why, rather than a misleading **0**. |
| Satellite monitoring | ⏳ | External API + running cost. Deferred from the start. |
| IoT integration | ⏳ | Same. |

---

## 5. Investor Portal — ✅ 7/7

| Bullet | Status | Reality |
|---|---|---|
| Financial model | ✅ | NPV, annual net, lifetime, payback |
| IRR | ✅ | bisection solver, plus a **downside IRR on contracted revenue alone** |
| Project pipeline | ✅ | cross-developer validated projects, filterable by category, **standard**, and **stage** |
| Carbon revenue | ✅ | blended: contracted volume at its negotiated price, the remainder at the listed price |
| **Offtake agreements** | ✅ | Migration #27. Developers record ERPAs at [`/developer/offtakes`](../src/views/OfftakeAgreementsView.vue). Only `signed`/`active` count as contracted — a draft or terminated agreement contributes nothing, or speculative revenue would be restated as contracted. Over-commitment (contracted volume > estimated issuance) is flagged. **Owner-only RLS**; investors see aggregates via `offtake_summary()`, never a counterparty or price. |
| Funding requirements | ✅ | `funding_target` / `funding_raised` → funding gap |
| Due-diligence documents | ✅ | Migration #30. Documents open **inside** the portal via signed URLs; every open is logged; developers see who is reading what at `/developer/data-room`. **Viewers are counted, never named.** |

**Not built, deliberately:** per-investor document permissioning. Documents on a validated project are
readable by any authenticated user — already true of the public project page. Gating a specific
document to a specific investor is a new feature, not a bug in this one.

---

## 6. Farmer Portal — 🟡 5/6

| Bullet | Status | Reality |
|---|---|---|
| Register | ✅ | `farmer` role (migration #25). Self-serve at **`/register/farmer`**, linked from both Login and Register. Reviewed by an **admin** (verifiers explicitly cannot approve farmer applications). Admins can also set the role directly in User Management. |
| Upload deliveries | ✅ | `record_farmer_delivery` RPC + proof upload to the private bucket. Only against an **accepted** RFQ, so `buyer_id` is derived server-side, never trusted from the client. |
| Track payments | 🟡✅ | Works, but **bookkeeping only, by design** — a buyer-set flag. Deliberately not wired to ledger/escrow/payouts, so the proven money path (reconcile = 0) stays untouched. No money moves through Carbonify. |
| View carbon participation | ✅ | Migration #31. A **Carbon** tab attributes verified tCO₂e pro-rata by delivered mass per project. Rule written down *before* the code: [FARMER_CARBON_ATTRIBUTION.md](FARMER_CARBON_ATTRIBUTION.md). Presented as an **estimate**, never as credit ownership — the farmer cannot sell or retire it, and the UI leads with that. |
| **Receive training** | ❌ | **Missing.** No training module, content, route, or table anywhere in `src`. This is a **content problem**, not a code one. |
| Monitor plantation performance | ✅ | Each parcel shows **actual vs expected**, colour-coded. Actuals sum the **trailing 12 months**, because `expected_yield_tonnes` is an annual figure — a 3-year-old parcel against one year's expectation would report 300% and mean nothing. No expected yield → `performance: null`, not zero and not 100%. |

---

## 7. AI Project Assistant — 🔴 0/5

Interface preview only ([AiAssistantView.vue](../src/views/AiAssistantView.vue)) at `/assistant`,
linked under **Insights**. The composer is **disabled**, nothing is sent anywhere, no answers are
generated, and there is **no `anthropic`/`openai` dependency**. Every spec bullet — credits generated,
feedstock available this month, investment-ready projects, draft PDD, financing proposal — is ❌
pending a Supabase edge function calling the Claude API (external key + running cost).

The preview exists so the assistant is discoverable and its scope is legible. It does **not** pretend
to work.

---

## Positioning claims vs reality

| Claim | Reality |
|---|---|
| Carbon project marketplace | ✅ |
| Feedstock marketplace | ✅ |
| Project development portal | ✅ |
| Investor data room | ✅ in-portal viewer + access log (per-investor permissioning not built) |
| Carbon MRV platform | 🟡 capture ✅, roll-up ✅, removed/avoided split ✅ — satellite/IoT ⏳ |
| **National biomass registry** | 🟡 The marketplace and farmer parcels exist, but nothing makes it *national*: **no DENR/CCC registry linkage**, and the public [`/registry`](../src/views/RegistryView.vue) page is a **certificate table** — it never displays methodology, development status, feedstock, or capacity. The rich registry data lives only on each project's own page. |
| **ESG reporting platform** | 🟡 **Credit-owner side only.** [`esgReportService.js`](../src/services/esgReportService.js) exports PDF/CSV from the *credit portfolio* (any authenticated user, scoped to credits they own). LGUs have a separate, unrelated jurisdiction report. **Developers, farmers, and verifiers have no ESG export.** |

---

## What's left, ranked

Nothing below is blocked on code we can write today.

1. **🔴 Runtime verification** — see [RUNTIME_VERIFICATION_RUNBOOK.md](RUNTIME_VERIFICATION_RUNBOOK.md).
   All 31 migrations are applied and 312 unit tests pass, but **none of this has run against the live
   database**. Unit tests prove the pure math; they prove nothing about RLS policies or RPC grants.
2. **🔴 Independent penetration test** — the last P0 before live payment keys.
3. **Email confirmation** — OFF by choice. Needs a domain (~₱600–900/yr), not a subscription:
   Resend's free tier is 3,000 emails/month. Until then **anyone can sign up with an address they do
   not control.**
4. **Farmer training content** (#6e) — writing, not programming.
5. **AI assistant backend** (#7) — Claude API edge fn, RLS-scoped to the caller. External cost.
6. **Satellite / IoT feeds** (#4) — external APIs, running cost.

**Nice-to-haves surfaced by this audit** (small, codeable, not spec bullets):
- Surface methodology / development status / feedstock on the **public registry**, so the
  "national biomass registry" claim is true rather than aspirational.
- An ESG export for **developers** (they can prove issuance but not disclose it).

## Commercial feature request mapping

You asked about a broader commercial package. Based on the code and docs, the current state is:

| Requested feature | Status | Where it shows up |
|---|---|---|
| Project onboarding fees | ❌ absent | No dedicated submit-project fee flow or config was found. |
| Verification & certification support | ✅ present | Public certificate verification, QR checks, tamper-evident signatures. |
| Marketplace transaction fees | ✅ present | Platform fee config applies to purchases and is booked to platform revenue. |
| Premium enterprise tools and data analytics | ✅ present | Pro-gated analytics and investor portal / data-room tooling. |
| White-label MRV/API solutions | 🟡 partial | Roadmap mentions supplier / registry API work, but not a white-label product surface. |

For the implementation path for the missing or partial items, see [COMMERCIAL_FEATURE_IMPLEMENTATION_PLAN.md](COMMERCIAL_FEATURE_IMPLEMENTATION_PLAN.md).

