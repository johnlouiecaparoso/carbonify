# If I am a Farmer — What I Need from Carbonify *(bonus role)*

**Who I am:** A smallholder farmer or an agricultural cooperative in the Philippines. I grow a crop that leaves residue — rice husk, coconut shell, sugarcane bagasse, corn cob — and that residue is feedstock a carbon project will pay for. My success = I sell what my land already produces, I get paid for it, and I can see what my deliveries contributed.

---

> **Written 2026-07-26**, during the role-by-role live-readiness review. This role had no
> role-needs doc while the other five did, so its gaps had never been written down in one place. The
> statuses below were checked against the code, not inherited.

## ✅ What I can already do today
- Register **plantation parcels** (crop, area, expected annual yield, location, coordinates, planting date).
- See **per-parcel performance** — delivered tonnage against expected yield, measured over a **trailing 12 months** rather than lifetime, so a three-year-old parcel is not reported at 300%.
- List **feedstock for sale** without a business registration — smallholders list behind their (admin-reviewed) farmer role rather than KYB, which gates payouts and would be friction with no safety payoff here.
- Receive **quote requests** from buyers, respond with a per-unit price, and have the buyer accept or decline.
- **Log a delivery** against an accepted quote, attach proof documents, and see the buyer confirm or reject it.
- See an honest **carbon contribution** estimate: my share of a project's *verified* reductions, pro-rata by delivered mass, with the screen stating plainly that it is an estimate I cannot sell or retire and that the project developer holds the credits.
- Understand **why a delivery was excluded** from that estimate (unconfirmed, or a unit like sacks that cannot be converted to tonnes without a bulk density the platform does not have).

---

## 🧩 What I still need (gaps for the developer to implement)

| # | What I want (my voice) | Status | Why it matters to me | Developer action | Priority | Effort |
|---|---|---|---|---|---|---|
| 1 | "**Pay me through the platform**, or tell me plainly that you don't." | 🟡 | This is the whole relationship. Buyers pay by PayMongo; developers get escrow and KYB-gated payouts; I get a flag my *counterparty* sets. | ✅ **Answered plainly (2026-07-29).** The decision is "we do not pay you — we record it" (#26, 2026-07-28), and it is now stated in the **ToS §1.14 and the in-app policy modal §6**, not just implied by careful UI copy. The record is also two-sided: the badge reads **"buyer says paid"** until *I* confirm. Carbonify still moves no money, deliberately. | ✅ | — |
| 2 | "Give me **somewhere to go when a buyer doesn't pay**." | ❌ | I have delivered a physical good I cannot take back. | ✅ **Closed 2026-07-29.** "No, I was not paid" / "I have not been paid" on the delivery itself — notifies the buyer **and** admins, who now have `/admin/feedstock` (#29) and can reverse a false "Paid". Built **without** touching `disputes`/`credit_transactions`. Inert until `20260729000100` is applied. | ✅ | — |
| 3 | "Let me use the app **in Filipino**." | ❌ | English is the actual obstacle for me, more than any missing feature. | **#27**: no i18n library exists; the selector offered seven languages, delivered none, and did not include Filipino. Now disabled honestly. Scope translations against this role and LGU *before* the buyer surfaces. | 🟠 | L |
| 4 | "Work on **a cheap phone with bad signal**, in a field." | 🟡 | That is where I am when I log a delivery. | The service worker now functions at all (it was being wiped on every load until 2026-07-26), and reads no longer report a failed query as an empty farm. Still missing: offline capture of a delivery for later sync. | 🟢 | L |
| 5 | "Tell me **what my residue is worth** before I agree a price." | ❌ | I am quoting blind. The buyer knows the market; I do not. | Add indicative feedstock pricing — recent accepted quote ranges by biomass type and region. The data exists in `biomass_rfqs`. | 🟢 | M |
| 6 | "Let my **cooperative** hold this, not just me personally." | ❌ | A co-op is the normal unit here, not an individual. | Covered by **#18** (no organization accounts) — everything money-related keys to `auth.uid()`, so parcels and deliveries belong to one person's login. | 🟠 | L |
| 7 | "Remind me **when a delivery is due**." | ❌ | Accepted quotes carry a `needed_by` date I have to remember myself. | Developers get MRV reminders (`mrvReminderService`); the same rails would serve an accepted quote approaching its delivery date. | 🟢 | S |

---

## 🎯 What's left (2026-07-26)

The portal itself is in good shape: parcels, deliveries, proof upload and the carbon estimate all
work, the server-side guards are sound (a farmer can only record against their own accepted quote,
only against a parcel they own, and cannot inflate their carbon attribution because only
*buyer-confirmed* deliveries count), and the pass fixed the reads that reported a failed query as an
empty farm plus a parcel delete that had no confirmation.

**What is left is not really portal work — it is whether this role is a real participant:**

1. ~~**Payment (#1/#2, 🟠)**~~ — ✅ **answered 2026-07-28, built 2026-07-29.** Carbonify is an
   introduction-and-records layer for feedstock, it now says so in the terms, and the record is
   two-sided with a route to staff who can correct it. Carbonify still does not move the money, and
   that remains the honest limit of this role — a farmer's counterparty risk is reduced by
   transparency and escalation, not removed.
2. **Filipino (#3, 🟠)** — **now the top item for this role.** A farmer-facing product in the
   Philippines that exists only in English has an adoption ceiling that no feature will lift — and the
   dispute flow built on 2026-07-29 is the sharpest case: a smallholder contesting a payment does it
   in a second language.
3. **Cooperatives (#6, 🟠)** — blocked on #18, but worth noting that the farmer is the role where
   "an account is a person" hurts soonest, because a co-op is the normal unit of organisation.

**Still unverified at runtime.** The farmer migrations (`20260711000000`, `20260717000000`) and the
delivery/attribution flows they support have not been exercised against a live database.
