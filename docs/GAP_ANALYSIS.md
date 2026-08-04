# Carbonify — Gap Analysis & Implementation Tracker

> Consolidated from three source documents reviewed 2026-07-25:
> 1. **Expansion feature list** (Project Registry → AI Assistant + monetization #8–12)
> 2. **Ecolink SRD** (full System Requirements Document)
> 3. **PH-eligibility platform review** (what's needed for real PH carbon markets)
>
> All three overlap heavily and point at the **same handful of real gaps**. This
> file is the single deduplicated checklist. Verified against the live codebase
> (branch `feature-user-onboarding-ux`), not against the source docs' assumptions —
> several docs were written against an early prototype and list as "missing" things
> that are already built.
>
> Legend: ✅ Built · 🟡 Partial · ❌ Not built · ⏭️ Deferred (strategic)

---

## 1. Status at a glance

| Area | Status | Notes |
|---|---|---|
| Auth (email/pw, **MFA**, reset, RBAC 7 roles) | ✅ | Exceeds SRD (SRD marked 2FA "future") |
| Project registry (boundary, geo, docs, financials, permanence, risk) | ✅ | Exceeds SRD (financials marked "future") |
| Validation workflow + status labels | ✅ | draft→submitted→in_review→needs_revision→validated→rejected |
| MRV (reports, server-side calculator, verifier review, issuance) | ✅ | 1 credit = 1 tCO₂e; auto-mint on VER |
| Certificates (serial, **QR**, **sha256 signature**, verify page) | ✅ | |
| Marketplace (browse/filter, **real PayMongo**, transfer, retirement) | ✅ | Exceeds SRD ("manual for prototype") |
| Carbon asset ledger / Investor Portal / Farmer Portal / LGU tools | ✅ | |
| Money path (escrow, payouts, refunds, RLS, audit logs, DPA) | ✅ | |
| PH-eligible project categories (biochar, WTE, agroforestry, RE, methane, industrial, coastal) | ✅ | `src/constants/mrv.js` — not generic |
| **Organization / company accounts** | ❌ | **Every account is an individual.** No org entity, no members/seats; credits are owned by the employee, not the company; invoices carry no buyer TIN. Scoped in **[ORGANIZATION_ACCOUNTS_SCOPE.md](ORGANIZATION_ACCOUNTS_SCOPE.md)** (2026-07-25) |
| Subscriptions (Free/Pro/Business) | 🟡 | Business tier == Pro (no distinct value yet) — org accounts are what would give it one |
| Email (transactional) | 🟡 | Approval email real (Resend edge fn); rest are `console.log` stubs |
| Onboarding UX (guided tour) | ✅ | Role-aware WelcomeTour + LGU/coop guidance (2026-07-25) |
| LGU tools | ✅ | MSW calc + diversion + ESG + endorsements + **land-use carbon modeling** (2026-07-25) |
| AI Project Assistant | ❌ | UI shell only; no edge fn, no Anthropic SDK — **paused (needs key)** |
| Monetization: onboarding fees | 🟡 | Admin config + disclosure built; **collection (PayMongo) to build** (2026-07-25) |
| Monetization: paid verification/certification | 🟡 | Admin config + disclosure built; **collection to build** (2026-07-25) |
| Monetization: white-label MRV / public API | 🟡 | Read-only `public-registry` edge fn scaffold; **key-gating/rate-limit to build** (2026-07-25) |
| Blockchain tokenization / smart contracts | ⏭️ | Deferred everywhere |
| IoT / real-time sensor MRV | ⏭️ | Code says "intentionally out of scope" |
| AI fraud mapping | ⏭️ | |
| Ops: Dockerfile | ✅ | Multi-stage Dockerfile + nginx SPA config (2026-07-25) |
| Ops: written DR/backup plan | ❌ | Owner ops policy |

---

## 2. To-build backlog (this workstream)

> 🧭 **Scope note (2026-07-28).** §2–§4 below cover the **2026-07-25 expansion workstream only** —
> they do not carry the numbered backlog (#1–#31), the per-role gaps, or the testing gaps. For every
> open item across the whole project, routed by who can do it, see
> **[OPEN_WORK_REGISTER.md](OPEN_WORK_REGISTER.md)**. This page stays authoritative for the items it
> does list.

Ordered as agreed 2026-07-25. **Email (#0a) and AI Assistant (#0b) are paused** at
the owner's request — email needs an owner decision on the provider/asset; the
assistant needs an Anthropic API key.

| # | Item | Owner | Blocked on | State |
|---|---|---|---|---|
| 0a | Finish transactional email wiring (route all through Resend edge fn) | Claude | Owner: provider/domain decision | ⏸️ Paused |
| 0b | AI Assistant backend (edge fn + Claude API + wire existing UI) | Claude build / Owner key+deploy | Owner: Anthropic API key | ⏸️ Paused |
| 1 | **Onboarding + verification/certification fees** — admin config + disclosure | Claude | — | ✅ Done (collection still to wire) |
| 2 | **LGU land-use carbon modeling** calculator | Claude | — | ✅ Done |
| 3 | **Guided onboarding tour** + LGU/coop help content | Claude | — | ✅ Done |
| 4 | **White-label / public API** — read-only `public-registry` scaffold | Claude build / Owner decides exposure | — | ✅ Scaffold done (key-gating to build) |
| 5 | **Dockerfile** (container-ready claim) | Claude | — | ✅ Done |
| 6 | Fee **collection** (PayMongo) for onboarding/verification | Claude build / Owner prod keys | Owner: prod keys | ⬜ Next |
| 7 | Public API **key-gating + rate limits** | Claude build / Owner exposure decision | Owner decision | ⬜ Next |
| 8 | **Org accounts Phase 1** — `organizations` + `organization_members` + invites | Claude | Owner: go/no-go (§6 of the scope) | 📋 Scoped |
| 9 | **Org accounts Phases 2–3** — org-owned credits + org billing identity | Claude | **Must follow the beta** (settlement-RPC conflict with escrow) | 📋 Scoped |
| — | Blockchain tokenization | Owner strategic | Owner decision | ⏭️ Deferred |
| — | IoT / sensor MRV | Owner strategic | Owner decision + hardware | ⏭️ Deferred |
| — | AI fraud mapping | Owner strategic | Depends on 0b | ⏭️ Deferred |

---

## 3. Owner (human/external) responsibilities

These cannot be done in-repo by Claude:

- **Secrets / keys**: Anthropic (Claude), PayMongo **production** keys, Resend domain verification
- **Deploy** edge functions; **apply migrations** to the live Supabase DB (or explicitly authorize Claude to run them)
- ~~**Merge** decision~~ — ✅ **done 2026-08-01.**
  **[PR #14](https://github.com/johnlouiecaparoso/carbonify13/pull/14)** is merged; `main` went from
  153 commits behind to 0, and production is running it
- **Regulatory**: DENR/CCC accreditation, Carbon Pricing Framework alignment, DPA registration
- **Security pentest** (external firm); email-confirmation domain verification
- **Business decisions**: fee amounts, Business-tier pricing/features, blockchain/IoT go/no-go
- **Ops policy**: DR/backup plan, hosting scale config
- Investor/partner relations (Japan Energy Capital, Enechange, etc.)

---

## 4. Third-party services

| Service | Use | Status |
|---|---|---|
| Supabase | DB, auth, storage, edge functions | ✅ Live |
| PayMongo | Payments (checkout, webhook, payouts, reconcile) | ✅ Test keys — need prod (owner) |
| Resend | Transactional email | 🟡 Partial — approval only |
| Anthropic Claude API | AI Assistant | ❌ Not connected |
| Sentry | Error monitoring | ✅ Present |
| Leaflet / OpenStreetMap | Maps | ✅ (no key) |
| Vercel | Hosting | 🔴 **BROKEN 2026-08-05 — no known production URL.** `carbonify13.vercel.app` now returns `404 DEPLOYMENT_NOT_FOUND`; `carbonify.vercel.app` answers but serves an unrelated **React** app branded "Carbonify" — and it is *not* `ecolink`, which answers separately as a bare Vite starter, so **at least three projects exist**. The GitHub repo was renamed `carbonify13` → `carbonify` and the Git integration did not follow. Fix in the Vercel dashboard — [VERCEL_DOMAIN_AND_REDEPLOY.md](VERCEL_DOMAIN_AND_REDEPLOY.md) |
| Blockchain (e.g. Polygon) | Tokenization | ⏭️ Future — owner decision |

Existing Supabase edge functions: `account-deletion`, `paymongo-checkout`,
`paymongo-reconcile`, `paymongo-resettle`, `paymongo-webhook`, `process-payouts`,
`send-approval-email`.

---

## 5. Notable risks / watch items

- **Email is the biggest hidden gap** — only approval email actually sends; purchase/rejection/reminders `console.log` only. (Also blocks org-account invites.)
- **No company accounts** — the platform is positioned for institutional users but models a company as a free-text string on one person's profile. Credits belong to the employee, not the employer, and VAT invoices carry no buyer TIN so finance departments cannot claim input VAT. See [ORGANIZATION_ACCOUNTS_SCOPE.md](ORGANIZATION_ACCOUNTS_SCOPE.md).
- ~~**Staged escrow migration (#14)**~~ — ✅ **applied to live 2026-07-29**, `reconcile_financials()` = 0
  after. Still **behaviourally unverified**: `ESC-01…06` are unrun, and that is the one item gating a
  pilot seller invite.
- ~~**`main` is 151 commits behind**~~ — ✅ **merged 2026-08-01**; `main` and the feature branch are level.
- ⚠️ **Two Vercel projects build from this repo.** `carbonify13` is production. `ecolink` is wired to
  the same repo, posts a deployment check on every push, and serves a *"Vite + React + TS"* app that
  is not Carbonify. It is not a data risk — it does not serve this codebase — but it consumes a build
  on every push, and `.vercel/repo.json` links the local checkout to **`ecolink`**, so a CLI
  `vercel --prod` from this directory would target the wrong project. Unlink it or delete the project.
- ⚠️ **`ci.yml`'s `deploy` job fails on every push to `main`** — `VERCEL_TOKEN` was never set. It has
  never run in this repo's history. The Git integration is what actually deploys, so **a red X on
  `main` does not mean the deploy failed.** Set the three `VERCEL_*` secrets or delete the job.
- Anthropic SDK not yet in `package.json` (added when 0b is built).

---

_Last updated: **2026-08-01** — merge/deploy status reconciled after PR #14 landed, and the Vercel
topology recorded. Created 2026-07-25 during the fees/LGU/tour implementation workstream._
