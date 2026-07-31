# If I am a Project Developer — What I Need from Carbonify

**Who I am:** An RRCC/LGU/cooperative/MSME that registers climate projects, submits monitoring data, earns carbon credits, and sells them. My success = I can get my project validated, prove my impact through MRV, get credits issued, **sell them, and actually receive the money**.

---

> **Reconciled 2026-07-21.** This page had drifted badly pessimistic — items 1, 2, 5
> and 11 were marked ❌/🟡 but had already shipped, and #3 (the last open 🔴) has now
> been built. Statuses below were re-checked against the code, not against the previous
> version of this doc.

## ✅ What I can already do today
- Submit a project with **all required fields + documents** (PDD, baseline, additionality, leakage, safeguards, feasibility, LGU endorsement, land ownership, ECC, MOA) and a **predefined PH project type**.
- Track my projects on a **dashboard** with a **progress tracker** (Registration → Validation → Verification → Issuance → Trading) that now reflects real issuance/listing state.
- See **credits, inventory, withdrawable balance and monitoring deadlines** on the dashboard itself, each linking through to the full page.
- Submit **MRV monitoring reports** (activity data + photo/log evidence); the platform **auto‑calculates emission reductions** server‑side.
- Get **credits issued** when a verifier approves my reductions; they auto‑**list on the marketplace**.
- **Set my own price, adjust how much is for sale, and pause/relist** a listing.
- **Withdraw my earnings** (KYB‑gated) and see sales, buyers and payout history.
- **Talk to the verifier** in a per‑project comment thread, and **edit → resubmit** after a revision request.
- See **verifier notes**, status changes, and **notifications** (including overdue‑MRV reminders).

---

## 🧩 What I still need (gaps for the developer to implement)

| # | What I want (my voice) | Status | Why it matters to me | Developer action | Priority | Effort |
|---|---|---|---|---|---|---|
| 1 | "**Pay me.** Let me withdraw my earnings from sales." | ✅ | The whole point — I can't get paid today. | Shipped: KYB gate, escrow + hold period, payout requests, history (`SellerEarningsView`). | — | — |
| 2 | "Show me a **sales dashboard** — who bought, how much, my revenue, remaining inventory." | ✅ | I run this as a business; I need to track sales. | Shipped: earnings by project, recent sales, withdrawals (`SellerEarningsView`), buyer history (`CarbonAssetLedgerView`). | — | — |
| 3 | "Let me **set and edit my credit price** and manage inventory/listing status." | ✅ | Pricing is my decision and changes over time. | Shipped: `update_my_listing` RPC + `ListingManagerModal`, reachable from each live project card. Quantity is clamped to the pool so a raised listing can't fail *after* a buyer pays. | — | — |
| 4 | "When my project **needs revision**, let me easily **edit and resubmit**." | ✅ | The feedback loop is core to validation. | Shipped: edit → resubmit from the `needs_revision` card. | — | — |
| 5 | "Let me **talk to the verifier** — ask questions, respond to requests." | ✅ | Validation is a dialogue, not a single note. | Shipped: `ProjectCommentThread` (RLS hides verifier‑internal notes from the owner). | — | — |
| 6 | "**Remind me** when my next monitoring report is due." | 🟡 | I'll miss deadlines without nudges (SRD asks for MRV reminders). | In‑app done (dashboard banner + tile + deduped bell notification). Still **client‑triggered**: a developer who never signs in is never emailed. Move to a scheduled job + email. | 🟠 | S |
| 7 | "Capture my **financials** (CAPEX/OPEX) and **carbon‑yield projection** and show them to buyers." | 🟡 (fields exist, not used) | Investors/buyers ask for these. | Persist + display **financials + yield projection**; add financial‑projection upload. | 🟠 | M |
| 8 | "Define my **project boundary** (map polygon) and pick an approved **methodology**." | ❌ | Required for credible, registry‑grade projects. | Add **boundary drawing** + **methodology selection/guidance**. | 🟠 | M |
| 9 | "Help me get **registry‑listed** (Verra/Gold Standard) — guide the journey." | ❌ | That's how my credits become globally sellable (Track B). | Add a **registry‑readiness checklist + export pack** for a VVB/registry. | 🟠 | L |
| 10 | "Let me add **custom monitoring metrics** beyond the defaults." | 🟡 | My project may measure things the template doesn't. | Allow **custom activity metrics** per report. | 🟢 | M |
| 11 | "Give me **projected vs issued** analytics and a timeline." | ✅ | I plan cash flow around issuance. | Shipped: estimated vs issued vs pending per project (`CarbonAssetLedgerView`) + proposed vs verified trend (`MrvDashboardView`). | — | — |
| 12 | "Let me **clone a project / use a template** for similar sites." | ❌ | I run multiple similar projects. | Add **project templates/cloning**. | 🟢 | S |
| 13 | "Give my project a **public, shareable profile page**." | ✅ | Marketing + transparency to buyers. | Shipped: `/projects/:id`, linked from each live project card. | — | — |
| 14 | "Let me **re‑upload / version documents** after the first submission." | 🟡 | Documents get updated. | Add **document re‑upload/versioning**. | 🟠 | S |

---

## 🎯 Top 3 to build next (2026-07-21)

The original top 3 (payouts, sales dashboard, edit→resubmit) have all shipped, as has
the last 🔴 (#3, listing management). What's left, in order:

1. **Save as draft** (not previously listed) — the submission form demands 9 document
   types in one sitting with no way to save progress. `status='draft'` is already a
   valid project status with owner edit/delete rights; nothing writes it. Highest
   real-world friction for the role.
2. **Scheduled MRV reminders + email** (#6) — the in-app half is done, but reminders
   are computed client-side on page load, so they only reach developers who sign in.
3. **Document re-upload / versioning** (#14) — editing a project can add documents but
   not replace or version an existing one.
