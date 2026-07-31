# LGU Guide

For **Local Government Unit (LGU) users**: estimate municipal solid waste emissions, track waste diversion, produce a city ESG summary, and endorse community carbon projects hosted in your jurisdiction.

> **Prerequisites:** an account with the **LGU User** role. The whole toolset lives at **`/lgu`** and is protected by the `requiresLgu` route guard — accounts without the role are redirected away.

**Related guides:** [Getting Started](01-getting-started.md) · [Developer Guide](03-developer-guide.md) · [Verifier Guide](04-verifier-guide.md) · [Admin Guide](05-admin-guide.md)

---

## Getting the LGU User role

The LGU User role is **provisioned by a Carbonify administrator**. Unlike the Project Developer and Verifier roles, it is **not** offered on the public `/apply` page (that page only lets people apply to be a Project Developer or Verifier). To be set up as an LGU user, contact a platform administrator; an admin assigns the role to your account. Once granted, the **LGU Tools** area at `/lgu` becomes available in your navigation.

---

## The LGU dashboard (`/lgu`)

The page is titled **"LGU Tools"** and is organized into six tabs:

| Tab | Purpose |
|-----|---------|
| **MSW Calculator** | Estimate landfill emissions and diversion impact |
| **Land Use** | Estimate annual CO₂e sequestration from restoration (mangrove, reforestation, bamboo, agroforestry) across hectares in your jurisdiction |
| **Records & Diversion** | Your saved emissions/diversion records |
| **City ESG** | Aggregated environmental summary + export (CSV and PDF) |
| **Projects in My Area** | Every carbon project hosted in your municipality, at any stage — not only the validated ones you can endorse |
| **Endorsements** | Endorse validated community projects |

> *This table listed four tabs until 2026-07-26. **Land Use** and **Projects in My Area** had shipped
> but were never documented here.*

---

## 1. MSW emissions calculator (MSW Calculator tab)

Estimate landfill methane emissions and the effect of diverting waste from disposal.

Fill in the form:

1. **Municipality / City** — e.g. "Cabanatuan City".
2. **Reporting period** — a label such as "2026" or "2026 Q1".
3. **Population** (optional) — entering it suggests an estimated waste figure ("Estimated from population: … t/yr").
4. **Waste generated (tonnes/period)** — the main input; the calculator won't save without it.
5. **Waste diverted (tonnes)** — the amount kept out of disposal.

As you type, four result cards update live:

- **Baseline emissions** (t CO₂e)
- **Avoided by diversion** (t CO₂e)
- **Net emissions** (t CO₂e)
- **Diversion rate** (%)

Add optional **Notes**, then click **Save Record**. Emission figures are computed from your tonnage inputs so stored values stay consistent, and the record is saved against your account.

---

## 2. Records & waste diversion (Records & Diversion tab)

A table of every record you've saved: **Period, Municipality, Generated (t), Diverted (t), Diversion %, Net t CO₂e**.

- If you haven't saved anything yet, you'll see a prompt to use the calculator.
- Use the **Delete** link on any row to remove it (you'll be asked to confirm).

---

## 3. City ESG summary (City ESG tab)

Aggregates **all** your saved records into a single environmental snapshot:

- **Total waste generated** (t)
- **Total waste diverted** (t)
- **Overall diversion rate** (%)
- **Total emissions avoided** (t CO₂e)
- **Net emissions** (t CO₂e)
- **Records** (count)

When you have at least one record, an **Emissions Trend by Period** chart appears, and two export buttons are available:

- **Export CSV** — downloads the summary data.
- **Export PDF** — generates a formatted report ("Generating…" while it builds).

If there are no records yet, the tab prompts you to save some first.

---

## 4. Project host endorsements (Endorsements tab)

This is where an LGU vouches for community carbon projects in its area — a **project host endorsement**.

### What an endorsement does

Endorsing signals local-government support for a project hosted in your jurisdiction. Endorsements are recorded per project and counted, giving developers visible LGU backing that strengthens a project's credibility. Your decision is also written to the platform audit log.

### How to endorse

1. Open the **Endorsements** tab. It lists **validated** community projects available for review — each card shows the project **title**, its **category · location**, and the current **endorsement count**.
2. Click **Endorse** to support a project, or **Decline** to record that you reviewed it without endorsing.
3. If you've already decided, the card shows your current decision (e.g. "You endorsed"). You can change it — submitting again updates your existing endorsement rather than adding a duplicate.

> Only projects that have reached **validated** status appear here. Newly submitted or in-review projects are not yet endorsable.

---

## Where this fits for developers

For project developers, an LGU endorsement is a mark of local support attached to their validated project. See the [Developer Guide](03-developer-guide.md) for the developer's side of the project lifecycle, and the [Verifier Guide](04-verifier-guide.md) for how projects reach validated status in the first place.

---

## Buying credits to offset your own emissions

**New 2026-07-26.** Once you have quantified your municipality's emissions with the MSW calculator,
the obvious next step is to offset some of them — and an LGU account can. Your sidebar now carries
the buying path:

| Group | What it gives you |
|-------|-------------------|
| **Buying** | Cart, Saved listings, Carbon calculator |
| **Credits** | Portfolio, Retire credits, Certificates |
| **Records** | Orders, Receipts, Reported problems |

**Prerequisite:** the same as for any buyer — **KYC Level 1 (Basic)** or higher. Verification is under
*KYC verification* in the menu under your avatar, alongside *Wallet*.

**Retiring** is the step that matters for a city climate claim: it permanently removes a credit from
circulation in your name and produces a certificate you can cite in a council or DENR/CCC report. A
credit you merely *hold* is an asset; only a **retired** credit is an offset.

> **Why this is called out as new.** These routes were always reachable by an LGU account — nothing
> in the router blocked them — but nothing in the navigation offered them, so a municipality that had
> just calculated its emissions had no signposted route to acting on them. Only the sidebar changed;
> no new permission was granted.
