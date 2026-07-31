# If I am a Verifier — What I Need from Carbonify

**Who I am:** A 3rd‑party or CSU/DENR technical reviewer who validates projects and verifies annual monitoring reports, approving or rejecting Verified Emission Reductions (VERs). My success = I can review thoroughly, consistently, and defensibly, and my decisions are auditable.

---

> **Reconciled 2026-07-22.** Statuses re-checked against the code, not against
> the previous version of this page. Items 1 and 3 were marked ❌ but had already
> shipped; the SLA half of #5 had too. Nine of eleven items are now closed.
>
> Three of this page's own claims were wrong and are corrected below:
> "assignment fields exist" (they did not — `verified_by` records who *decided*,
> after the fact); "everything is recorded in time-stamped audit logs" (project
> decisions wrote **none**); and the **Submitted** queue tab hid every
> first-time submission, because it matched `status = 'submitted'` while the
> create paths write `'pending'`.

## ✅ What I can already do today
- Access the **Verifier Panel** with role‑gated permissions.
- Review submitted projects and set status: **validate / request revision / reject / re‑review**, with notes.
- Review **MRV monitoring reports** (activity data + evidence) and **approve VERs**, which issues credits.
- Set a **risk/feasibility assessment** (feasibility, social impact, climate risk) on a project.
- Review **developer role applications**.
- Everything is recorded in **time‑stamped audit logs**.

---

## 🧩 What I still need (gaps for the developer to implement)

| # | What I want (my voice) | Status | Why it matters to me | Developer action | Priority | Effort |
|---|---|---|---|---|---|---|
| 1 | "Give me a **standardized review checklist/rubric**, not just a free‑text note." | ✅ | Consistent, defensible decisions across reviewers. | Shipped: weighted rubric with required items (`constants/verificationChecklist.js`, `ValidationChecklist.vue`), stored per project in `verification_assessments`, and validating with an incomplete rubric warns first. | — | — |
| 2 | "Show me **how the platform calculated** the emission reductions, and let me **adjust** before approving." | ✅ | I'm accountable for the issued amount. | Shipped: per‑metric breakdown (value × factor = tCO₂e) reproducing `calculate_report_vers()`, metrics with no factor flagged as contributing nothing, and an adjustment away from the calculated figure now requires a note. | — | — |
| 3 | "Let me **request a specific document or clarification** and track the response." | ✅ | Verification is iterative. | Shipped: `ProjectCommentThread` on each project, with a verifier‑only internal‑note toggle enforced by RLS. | — | — |
| 4 | "Show me a **per‑project verification timeline** (every action, who, when)." | ✅ | I need the full history at a glance. | Shipped. Three things were wrong, not just the UI: decisions wrote **no audit rows at all**; `audit_logs` was admin‑only to read (verifiers now read project‑scoped rows only); and every resource‑scoped reader queried columns that don't exist (`entity_type`/`entity_id`/`timestamp` vs `resource_type`/`resource_id`/`created_at`). | — | — |
| 5 | "Manage my **queue**: assign projects to verifiers, see workload, filter/search, and **aging/SLA**." | ✅ | Throughput + accountability. | Shipped: aging/SLA badges, `assigned_verifier_id` + assignment picker + "Take it", "Assigned to me (N)" toggle, and free‑text search over title/category/location/id. (The doc's claim that "assignment fields exist" was wrong — `verified_by` records who *decided*, after the fact.) | — | — |
| 6 | "Support **independent third‑party VVB access levels** (granular permissions, independence)." | 🟡 | Real markets require accredited, independent verifiers. | Independence **shipped**: nobody can validate a project they own or approve VERs against it, enforced by DB triggers (20260722000100). Still missing: **granular per‑VVB permissions** and accreditation records. | 🟠 | M |
| 7 | "Let me **bulk‑act** and **search** across many submissions." | ✅ | Scale — I can't click one by one. | Shipped: search (see #5) plus bulk **assign** and **mark under review**. Bulk validate/reject deliberately excluded — validation is the gate that admits a project to MRV, and rejection needs a per‑project reason, so triage is batched, judgement is not. *(Corrected 2026-07-28: this read "validating mints credits", which stopped being true at the 2026-07-26 mint-on-VER cutover — credits now mint at VER approval. The exclusion still holds on the reason given.)* | — | — |
| 8 | "Validate **evidence integrity** — geotag/timestamp on photos, flag duplicates." | ✅ | Fraud prevention is my job. | Shipped: EXIF capture time + GPS and a SHA‑256 content hash captured at upload; the review screen flags duplicates across reports and captures dated outside the reporting period. Missing EXIF is shown as an absence to weigh, not an accusation. | — | — |
| 9 | "Export a **verification report** for audit/regulators." | ✅ | DENR/CCC + my own records. | Shipped: PDF + CSV per project, carrying the decision, the full rubric (unassessed items reported as such, never as a zero) and the verification timeline. | — | — |
| 10 | "Let me verify **in the field on mobile**." | 🟡 | Site visits happen off‑desk. | The MRV calculation table now card‑stacks under 640px. Still missing: a genuine field‑capture flow (offline, camera‑first) and a mobile pass over the project review pane. | 🟢 | M |
| 11 | "Reference the **approved methodology** while reviewing." | ✅ | I check activity data against the method. | Shipped: the emission factor applied to each metric is shown inline in the review breakdown, read from `methodology_factors` — the same table the server‑side calculation joins against. | — | — |

---

## 🎯 What's left (2026-07-22)

Nine of the eleven items on this page are now closed. Two remain, both partial:

1. **Granular VVB permissions + accreditation records** (#6, 🟠) — independence
   is enforced (nobody validates a project they own, or approves VERs against
   it), but there is still no way to record *which* accredited body a verifier
   belongs to, or to scope a verifier to particular project types or regions.
   This is the one remaining item that a real registry would treat as
   table stakes.
2. **Field verification on mobile** (#10, 🟢) — the calculation table
   card-stacks, but a site visit needs a camera-first, offline-tolerant capture
   flow, which is a different piece of work from making tables narrow.

Two structural complaints from earlier revisions of this page are resolved: the
panel is three tabs rather than one long scroll, and MRV approve/reject use the
same styled confirmation as the rest of the product instead of a browser dialog.

**Still unverified at runtime.** Everything above is code-complete and unit
tested, but the four verifier migrations (20260722000100–000400) and the flows
they support have not been exercised against a live database. See
`RUNTIME_VERIFICATION_RUNBOOK.md`.
