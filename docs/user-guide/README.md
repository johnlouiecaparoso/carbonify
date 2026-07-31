# Carbonify User Guide

Welcome to Carbonify, the Philippine carbon-credit registry and marketplace. This guide set explains, step by step, how to use the app: creating an account, verifying your identity, buying and retiring carbon credits, developing and verifying projects, and administering the platform.

## How to read these guides

- **Start with [Getting Started](01-getting-started.md).** It applies to *everyone*, no matter your role. It covers signing up, logging in, two-factor authentication (2FA), identity verification (KYC), your profile, plans, and how to find your way around.
- **Then read the guide for your role.** Each role guide assumes you have already done the Getting Started steps.
- **Watch for the "Prerequisites" line** at the top of gated flows. It tells you what you need (a confirmed account, a role, or a KYC level) before a feature will work.

## Accounts, roles, and KYC — the three things that unlock features

Access in Carbonify is controlled by three separate ideas. Understanding them upfront saves a lot of confusion:

1. **Account** — you must be signed in for anything beyond public pages (Home, About, Marketplace, Registry, Market dashboard, and public certificate verification).
2. **Role** — your role decides which workspaces and tools you see. Everyone starts as a **General User**. You can apply for **Project Developer** or **Verifier** at `/apply`, register as an **LGU User**, and an **Administrator** grants roles. (See the role table below.)
3. **KYC level** — identity verification is a *separate* gate from your role. You must reach at least **KYC Level 1 (Basic)** before you can buy or trade credits, regardless of role.

> Note: Some roles are **finance-restricted**. Administrators, Verifiers, and Project Developers cannot use the buyer-only finance pages (Wallet, Certificates, Receipts, Carbon Calculator) — those are for buyers and general users.

## The role guides

| Guide | Who it's for | Link |
|-------|--------------|------|
| Getting Started | Every user, regardless of role — account, login, 2FA, KYC, profile, plans, navigation | [01-getting-started.md](01-getting-started.md) |
| Buyer Guide | Buyers, investors, and general users who want to browse, buy, retire, and report on carbon credits | [02-buyer-guide.md](02-buyer-guide.md) |
| Project Developer Guide | Developers who submit and manage carbon projects, list credits, and handle monitoring (MRV) | [03-developer-guide.md](03-developer-guide.md) |
| Verifier Guide | Accredited verifiers who review project submissions and validate carbon claims | [04-verifier-guide.md](04-verifier-guide.md) |
| Admin Guide | Administrators who manage users, roles, KYC/KYB, finance, refunds, and system config | [05-admin-guide.md](05-admin-guide.md) |
| LGU Guide | Local Government Unit users who upload emissions data and manage community projects | [06-lgu-guide.md](06-lgu-guide.md) |
| Farmer Guide | Farmers and cooperatives supplying biomass feedstock, logging deliveries, and tracking carbon participation | [07-farmer-guide.md](07-farmer-guide.md) |

## The seven roles at a glance

| Role (display name) | What it's for |
|---------------------|---------------|
| General User | Basic access: browse the marketplace and manage your profile. Can buy/retire credits once KYC-verified. |
| Buyer/Investor | Purchase and manage carbon credits. |
| Project Developer | Create and manage carbon-credit projects and list credits for sale. |
| Verifier | Review and approve/reject carbon-credit projects. |
| LGU User | Local Government Unit user: upload LGU emissions and manage community projects. |
| Farmer | Supply biomass feedstock, log deliveries, and see estimated carbon participation. |
| Administrator | Full system access to manage every aspect of the platform. |

Developer, verifier, and farmer are **specialist roles**: you apply, and the role stays restricted
until an administrator approves it. Farmers have a memorable sign-up link to hand out offline:
**`/register/farmer`**.

> *Added 2026-07-26: the Farmer Guide. This table has always listed Farmer as a role, but the guide
> set had no entry for it.*

---

*Carbonify runs on Vue 3, Supabase, and PayMongo (GCash, Maya, and cards). During the closed beta, payments run in test mode — test card: 4343 4343 4343 4345.*
