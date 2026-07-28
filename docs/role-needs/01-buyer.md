# If I am a Buyer / Investor — What I Need from Carbonify

**Who I am:** A corporation, SME, or individual buying carbon credits to offset emissions, meet ESG/CSR goals, or invest. My success = I can find *trustworthy* credits, buy them easily, prove I bought them, and report the offset.

---

> **Reconciled 2026-07-22.** Statuses re-checked against the code. This page was
> the most out of date of the five: **10 of 13 items had already shipped**,
> several marked as not-built while fully working (ESG report, VAT invoice, cart,
> watchlist, price history, refunds/disputes). The SDG filter, described here as
> "cosmetic", genuinely filters on `co_benefits`.
>
> Three bugs were hypothesised during the review and checked; all three were
> already correct (the watchlist join key, the marketplace dedup comparison, and
> the dashboard's failure isolation). This is the most mature role surface in the
> codebase.

## ✅ What I can already do today
- Register, log in (with **2FA**), reset my password, manage my profile.
- Complete **KYC verification** (required before buying).
- Browse the **marketplace**, filter by location and price, and see projects on an **interactive map**.
- Use the **carbon calculator** to estimate my footprint.
- **Purchase** credits (real PayMongo payment), with my **wallet/portfolio**, **receipts**, and **transaction history**.
- Receive a **certificate** with a serial number, **QR code, digital signature**, and a **public verification page**.
- **Retire** credits and get a retirement certificate.
- Get **dashboard + email notifications** and a role‑aware **onboarding guide**.

---

## 🧩 What I still need (gaps for the developer to implement)

| # | What I want (my voice) | Status | Why it matters to me | Developer action | Priority | Effort |
|---|---|---|---|---|---|---|
| 1 | "Are these credits **real**? Show me they're registry‑verified (Verra/Gold Standard)." | 🟡 | I won't risk money/reputation on credits I can't trust. | **Scaffolding built, no registry connected.** The `supplier_orders` fulfilment saga (idempotent, pending→ordered→retired), the `source` column, the marketplace filter and the "Registry‑backed" badge all exist — but nothing writes `source='supplier'` and `supplier_id` defaults to `'mock'`, so no listing can carry the badge. Fails safe (no credit is falsely labelled), but this is a **commercial integration decision**, not a coding task. Still the #1 trust item. | 🔴 | L |
| 2 | "Let me **see the project's documents and methodology** before I buy (PDD, additionality, photos, location)." | ✅ | Due diligence — I need to justify the purchase internally. | Shipped: `/projects/:id` with documents, methodology, map and co‑benefits. | — | — |
| 3 | "Filter by **SDG impact / co‑benefits**, not just price/location." | ✅ | I buy for specific impact stories (jobs, biodiversity, community). | Shipped and **not cosmetic** — the filter matches against each listing's `co_benefits`, captured per project from the SDG picker on the submission form. | — | — |
| 4 | "Give me an **ESG / offset report** I can download for disclosure." | ✅ | I must report offsets for CSR/ESG/CDP/regulators. | Shipped: `esgReportService` exports PDF and CSV. **Corrected 2026-07-28** — the report was silently **under-reporting retired credits** for buyers with many recent purchases: `getUserTransactionHistory` sliced the merged purchase+retirement list, pushing retirements out of the very data the report totals (backlog #11). Fixed and regression-tested; a report exported before that date should be re-run. | — | — |
| 5 | "I'm a business — I need an **official receipt / BIR invoice** with VAT." | ✅ | Required for accounting/tax. | Shipped: `vatInvoiceService`, with rates from `app_settings` (seeded by `20260626000800`). | — | — |
| 6 | "Let me **buy from several projects at once** (a cart) or **bulk‑request a quote**." | 🟡 | Corporates buy in volume across a portfolio. | **Cart shipped** (`CartView` + `cartStore`, multi‑item checkout). Still missing: a **request‑for‑quote / bulk negotiation** flow for volume buyers. | 🟢 | M |
| 7 | "Let me **save favorites / get alerts** on new projects or price changes." | ✅ | I track opportunities over time. | Shipped: watchlist plus price‑drop alerts, checked from the buyer dashboard so they land even if the buyer never opens the marketplace. | — | — |
| 8 | "Offer **recurring / auto‑offset**." | ❌ | I want to offset monthly without re‑buying manually. | Add **subscription offsetting**. | 🟢 | M |
| 9 | "Let me **share a public proof** of my retirement / a verifiable claim badge." | ✅ | Marketing/ESG storytelling; transparency. | Shipped: public `CertificateVerifyView` with serial, QR and digital signature. | — | — |
| 10 | "Show **price history / comparison** so I know I'm paying fairly." | ✅ | Price confidence. | Shipped: `priceHistoryService` + `20260721000300_price_history`. | — | — |
| 11 | "Make **refunds / disputes** clear if something goes wrong." | ✅ | Trust in spending real money. | Shipped: `disputeService`, buyer‑facing `MyDisputesView`, admin `AdminRefundsView`, and a refund RPC. | — | — |
| 12 | "Connect the **calculator directly to buying** the exact offset." | ✅ | Reduce friction from 'know footprint' → 'offset it'. | Shipped: the calculator hands the computed tonnage to the marketplace as `?credits=`. | — | — |
| 13 | "Great **mobile experience** / app." | 🟡 | I act on the go. | The investor portal's financials table now card‑stacks under 640px (`src/styles/responsive-table.css`); the rest of the buyer surface is card‑based already. Still missing: a genuine PWA/offline pass. | 🟢 | M |

---

## 🎯 What's left (2026-07-22)

Ten of thirteen items have shipped. What remains:

1. **Real registry‑verified credits** (#1, 🔴) — unchanged as the top item, but
   the blocker is commercial, not technical: the fulfilment saga, badge and filter
   are built and tested against a mock. Someone has to choose a registry partner.
2. **Recurring / auto‑offset** (#8, 🟢) — the only item with no groundwork at
   all, though `subscription_plans` and the PayMongo subscription path already
   exist, so it is closer than it looks.
3. **Bulk / request‑for‑quote** (the unbuilt half of #6, 🟢) — the cart covers
   self‑serve volume; negotiated corporate purchases have no path.

**Scope note.** This reconciliation verified all thirteen claims against the code
and read `BuyerDashboardView` plus the marketplace pricing/availability logic in
full. `MarketplaceViewEnhanced` (2.4k lines), `CreditPortfolioView` (1.2k) and
`RetireView` (1.1k) have **not** had a line-by-line audit; they touch the money
path and are the place to look if depth is wanted.
