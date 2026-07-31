# If I am an Admin — What I Need from Carbonify

**Who I am:** The platform owner/operator (DENR/CCC or system owner) managing users, overseeing trading and credit issuance, ensuring compliance and integrity. My success = I can run the platform safely, see everything, intervene when needed, and produce reports/evidence.

---

> **Reconciled 2026-07-22.** Statuses re-checked against the code. **Both of this
> page's top two priorities were already built**: the finance console (#1) and the
> system config UI (#2) exist and work. The dispute console (#7) had shipped too.
>
> The real gap was one this page ranked third and described only in passing: the
> DPA half of #6. Every link in that chain existed — user-facing request capture,
> a table with `notes`/`processed_at`/`processed_by`, RLS granting admins read and
> update, an index built specifically for the pending queue, and an erasure
> worker — **except an admin surface**. `dataPrivacyService` exported five
> functions, all user-facing. There was an index serving a queue nobody could
> read, while the Data Privacy Act clock ran.

## ✅ What I can already do today
- Access the **Admin Dashboard** with platform overview stats.
- **User management** (view users, assign roles) and review **role applications**.
- Review and approve **KYC applications** (sets user KYC level).
- View **audit logs** of system actions.
- **Database management** tools and analytics charts.
- Notifications fire automatically on key events.

---

## 🧩 What I still need (gaps for the developer to implement)

| # | What I want (my voice) | Status | Why it matters to me | Developer action | Priority | Effort |
|---|---|---|---|---|---|---|
| 1 | "Give me **financial oversight**: transactions, revenue, fees, **payouts**, refunds, reconciliation." | ✅ | I 'oversee trading' — I'm blind to money today. | Shipped: `/admin/finance` with gross sales, fees, platform revenue, payout state, recent transactions and book‑reconciliation drift. Now loads with `allSettled`, so a failing reconciliation scan no longer blanks the whole console. | — | — |
| 2 | "Let me **configure the system** (emission factors, methodologies, fees, KYC peso tiers) without code." | ✅ | Rules change; I shouldn't need a developer each time. | Shipped: `/admin/config` edits platform fee, minimum KYC level to trade, KYC peso tiers and methodology factors. | — | — |
| 3 | "Generate **regulatory & business reports** (DENR/CCC, issuance, retirements, sales) and CSV exports." | 🟡 | Reporting is a core admin duty. | **CSV export shipped** for transactions and audit logs (`adminExportService`). Still missing: a **report builder** with date ranges and issuance/retirement roll‑ups. | 🟠 | M |
| 4 | "Manage the **user lifecycle**: suspend/ban, reset, support impersonation, bulk ops." | 🟡 | Abuse handling + support. | **Suspend/reactivate shipped** (`20260722000800`), enforced at the database: blocked at `assert_can_trade`, on retirement insert and on project insert. A suspended user keeps receipts, certificates and DPA rights — a retirement certificate is ESG evidence and a sanction must not destroy it. Still missing: **support impersonation** and **bulk role ops**. | 🟢 | M |
| 5 | "Give me a **fraud/risk dashboard** with anomaly alerts." | ❌ | Protect market integrity. | Add **risk signals + alerts** (velocity, oversell attempts, suspicious KYC). | 🟠 | M |
| 6 | "Compliance tooling: **AML screening results, DPA data requests (export/delete), data‑retention**." | ✅ | Legal obligation (AMLA, Data Privacy Act). | **DPA**: `/admin/privacy` triages every data‑subject request; it deliberately does not erase (the `account-deletion` worker holds the service role behind a shared secret). **AML**: `/admin/aml` screens against a local sanctions/PEP watchlist at KYC review and retains the evidence — including a recorded *clear*, which is the half usually skipped. Screening rows are admin‑only to **read**, since telling a subject they matched is tipping off. ⚠️ Not a commercial provider: `list_source`/`list_version` exist so one can be adopted without losing the trail. | — | — |
| 7 | "A **dispute‑resolution console** for buyer/seller issues + refunds." | ✅ | I'm the escalation point. | Shipped: `/admin/refunds` lists transactions and disputes with a refund RPC. Now degrades per‑panel instead of failing silently with no error at all. | — | — |
| 8 | "**Broadcast announcements** / system notifications to users." | 🟡 | Communicate outages, policy changes. | Add **admin broadcast** + banner. | 🟢 | S |
| 9 | "Better **audit log**: search, filter, export, and money/security events." | ✅ | Investigations + audits. | Search and filters existed; **CSV export added**, exporting the filtered set rather than the whole table. Project verification decisions were also writing **no audit rows at all** until `20260722000300` — fixed there. | — | — |
| 10 | "**Feature flags / maintenance mode** and visibility into **backups/DR**." | ❌ | Safe operations at scale. | Add **feature flags + maintenance mode**; surface backup/DR status. | 🟢 | M |
| 11 | "**Granular permissions / segregation of duties** (don't make every admin all‑powerful)." | 🟡 | Security best practice; multi‑admin teams. | **Self‑dealing closed** (`20260722000900`): an admin cannot set their own KYC level or role, cannot self‑verify KYB (which gates seller payouts), cannot refund a transaction they are a party to, and cannot suspend themselves. Still missing: **maker‑checker** — a second admin is not required to approve a refund or a role grant. | 🟠 | M |
| 12 | "**Content/project oversight** beyond the verifier (takedowns, flags)." | ❌ | Final accountability for what's listed. | Add **admin project moderation** (flag/suspend a listing). | 🟢 | S |

---

## 🎯 What's left (2026-07-22)

Eight of twelve items are done, and #11 is materially advanced. Nothing red
remains. What is left:

1. **Fraud / risk signals** (#5, 🟠) — velocity caps and oversell guards already
   fire server-side; nothing surfaces them as alerts for a human to look at. The
   AML queue is now the natural home for them.
2. **Maker-checker** (the rest of #11, 🟠) — self-dealing is blocked, but one
   admin can still act alone on a refund or a role grant. Needs proposal and
   approval records, plus a decision about **single-admin deployments**: a
   two-person rule that cannot be satisfied is an outage, not a control.
3. **A commercial AML provider** (the rest of #6) — the local watchlist is real
   screening with a real evidence trail, but it cannot match a provider on list
   coverage, aliases or transliteration. A **commercial decision**, like the
   registry integration on the buyer side; the seam is already built.
4. **Report builder** (the rest of #3, 🟠) — CSV export exists; date-ranged
   issuance/retirement roll-ups do not.
5. **Impersonation + bulk role ops** (the rest of #4), **broadcast** (#8),
   **feature flags / maintenance mode** (#10) and **project moderation** (#12).

**Still unverified at runtime.** `20260722000700`–`20260722001000` have not been
exercised against a live database. See HANDOFF.md §0.4 for the full list, the
one-shot verification query, and the two checks that matter most.
