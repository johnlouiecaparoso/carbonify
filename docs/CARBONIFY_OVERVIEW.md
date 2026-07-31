# Carbonify Overview

Carbonify (repo/internal name: `ecolink`; package name: `carbonify`) is a Philippine carbon-credit registry and marketplace web app. It lets project developers register climate projects, verifiers review and approve them, credits get issued with tamper-evident certificates, and buyers purchase and retire those credits through a server-authoritative money path.

## What the system is for

Carbonify exists to make carbon credits easier to trust and easier to operate. A credible credit needs four things to work together:

1. The project must be real and additional.
2. Its impact must be measured, reported, and independently verified.
3. Each credit must be uniquely tracked so it cannot be double-sold or double-claimed.
4. Money must move safely between the buyer, the platform, and the project developer.

Carbonify combines those pieces into one web system: registration -> validation -> MRV -> issuance -> trading -> retirement.

## Who uses it

- Project developers submit projects, upload compliance evidence, file monitoring reports, and sell credits.
- Verifiers review projects, score submissions, approve verification results, and gate issuance.
- Buyers purchase credits, retire them, and download receipts and certificates.
- Administrators handle KYC, KYB, refunds, compliance workflows, finance, and system config.
- LGUs use local analytics and emissions tooling.
- The public can verify certificates and inspect registry and market views.

## Future vision

Carbonify is heading toward a fuller carbon-market operating system:

- A public, searchable registry with stronger trust surfaces.
- Real credit-supplier integrations for live retirement fulfillment.
- Broader buyer, developer, verifier, and LGU workflow depth.
- More compliance, reporting, reconciliation, and security automation.
- Better mobile and PWA support for field and field-adjacent users.
- Clearer operator tooling for live launch, monitoring, and financial safety.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | Vue 3, Vue Router, Pinia |
| Build | Vite 7 |
| Backend | Supabase Postgres, Auth, Edge Functions, Storage |
| Payments | PayMongo via Supabase Edge Functions |
| Maps / charts | Leaflet, Chart.js, vue-chartjs |
| Docs / certificates | jsPDF, qrcode |
| Tests | Vitest, Playwright |
| Linting | ESLint, Prettier |

## System map

| Layer | What it does | Where to look |
| --- | --- | --- |
| App shell | Routes, auth, role gates, navigation, and global UI | `src/main.js`, `src/App.vue`, `src/router/` |
| Business logic | Marketplace, wallet, verification, payouts, certificates, reports | `src/services/` |
| Roles and policy | Role constants, guards, and finance restrictions | `src/constants/`, `src/middleware/` |
| Data and money | Supabase tables, RLS, RPCs, ledger, and cutover scripts | `supabase/migrations/`, `supabase/functions/`, `supabase/cutover/` |
| Product docs | Current state, roadmap, overview, and developer guides | `docs/HANDOFF.md`, `docs/GO_LIVE_ROADMAP.md`, `docs/dev/README.md` |

## Read next

- [docs/HANDOFF.md](HANDOFF.md) for the current state, implemented vs not implemented, and the next steps.
- [docs/SOFT_LAUNCH_RUNBOOK.md](SOFT_LAUNCH_RUNBOOK.md) for the active next step — the closed beta on PayMongo test keys.
- [docs/GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) for the remaining real-money launch blockers.
- [docs/dev/README.md](dev/README.md) for setup, architecture, database, deployment, testing, and security.