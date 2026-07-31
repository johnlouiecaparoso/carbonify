# Carbonify — Role‑by‑Role Needs & Gaps

These documents describe, **from each user role's point of view**, what they want from Carbonify, what the system **already provides**, and **what's still lacking** — written so a developer can pick up each gap and implement it.

| Role | Doc | "If I am…" |
|---|---|---|
| Buyer / Investor / General user | [01-buyer.md](01-buyer.md) | …someone buying carbon credits to offset emissions. |
| Project Developer | [02-project-developer.md](02-project-developer.md) | …a developer submitting projects and earning credits. |
| Verifier | [03-verifier.md](03-verifier.md) | …a verifier validating projects and approving credits. |
| Admin | [04-admin.md](04-admin.md) | …the platform owner/operator overseeing everything. |
| LGU User *(bonus)* | [05-lgu.md](05-lgu.md) | …a local government unit using climate tools. |
| Farmer *(bonus)* | [06-farmer.md](06-farmer.md) | …a smallholder or cooperative selling feedstock to carbon projects. |

**How to read each doc**
- **What I can already do** — features that exist today (so you don't rebuild them).
- **What I still need** — the gap list. Each item has: the **need** (in the user's voice), **status** (❌ missing / 🟡 partial), **why it matters**, the **developer action**, and a **priority**.

> ## 🆕 Updated 2026-07-26 — role-by-role live-readiness review
>
> All six roles were re-reviewed for deployability, bugs and dead code. **[06-farmer.md](06-farmer.md)
> is new** — the farmer role had no doc while the other five did, so its gaps had never been written
> down in one place. **[05-lgu.md](05-lgu.md) #1 was corrected**: land-use carbon modeling was marked
> ❌ but has shipped, with factors in `constants/lgu.js` and 6 unit tests.
>
> Cross-cutting findings from that pass live in [DEFERRED_BACKLOG.md](../DEFERRED_BACKLOG.md) as
> #20–#30 rather than as rows here, because most span more than one role. The two that matter most:
> **#26** (farmers are not paid through the platform) and **#29** (the feedstock side has no admin
> surface, so #26 has no escalation point). Registry-corrupting **#17** was found and closed during
> the same pass.

> ## ⚠️ Reconciled 2026-07-22 — read this before trusting a status column
>
> All five pages were re-checked **against the code**, not against their own
> previous revision. Every one of them **understated what had already shipped** —
> in the worst case (buyer) 10 of 13 items were marked as gaps while fully built.
> Several statuses have been corrected, and each page now carries a header note
> saying what it got wrong.
>
> Three claims these pages made that were simply false, recorded here so they are
> not re-trusted:
> * *"assignment fields exist"* (verifier #5) — they did not. `verified_by`
>   records who **decided**, after the fact.
> * *"everything is recorded in time-stamped audit logs"* (verifier) — project
>   verification decisions wrote **none**.
> * *"the SDG filter is cosmetic"* (buyer #3) — it genuinely filters on
>   `co_benefits`.
>
> Each role also carried exactly one structural bug that undercut its premise;
> all five are fixed. See [../HANDOFF.md](../HANDOFF.md) for the table and for the
> migrations this work depends on.

**Priority legend:** 🔴 High (blocks core value / trust) · 🟠 Medium (expected, improves adoption) · 🟢 Low (nice‑to‑have / future)
**Effort legend:** S (small) · M (medium) · L (large/with external dependency)

> Cross‑reference: platform‑wide gaps and market benchmark live in [`../ECOLINK_SYSTEM_ANALYSIS.md`](../ECOLINK_SYSTEM_ANALYSIS.md) — the link here read `CARBONIFY_SYSTEM_ANALYSIS.md` and pointed at nothing until 2026-07-26; the file carries the repo's internal name (`ecolink`), and its subtitle is "System Analysis, Benchmark & Gap Report". Real‑money/real‑project path in [`../REAL_WORLD_GOLIVE_PLAYBOOK.md`](../REAL_WORLD_GOLIVE_PLAYBOOK.md).
