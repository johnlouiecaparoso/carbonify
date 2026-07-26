# Farmer Guide

For **farmers and agricultural cooperatives**: register your plantation parcels, sell crop residue as feedstock, log what you deliver, and see the carbon your deliveries contributed to.

> **Prerequisites:** an account with the **Farmer** role. Your workspace is at **`/farmer`** and is protected by the `requiresFarmer` route guard. Unlike buyers, you do **not** need business verification (KYB) to list feedstock — your farmer role is enough.

**Related guides:** [Getting Started](01-getting-started.md) · [Buyer Guide](02-buyer-guide.md) · [LGU Guide](06-lgu-guide.md)

> *Written 2026-07-26. This guide did not exist while the other six did.*

---

## Getting the Farmer role

The Farmer role is **provisioned by a Carbonify administrator** — it is not on the public `/apply`
page, which only offers Project Developer and Verifier. A memorable link exists to hand out on a
leaflet or over the phone: **`/register/farmer`**, which opens the application form pre-set to the
farmer role. Once an admin approves it, **Farmer Portal** appears in your navigation.

---

## What you actually sell

You are not selling carbon credits. You are selling **biomass feedstock** — rice husk, coconut shell,
sugarcane bagasse, corn cob and similar crop residue — to a carbon project that converts it. The
project developer holds the credits that result. What you get is:

- **Payment for the feedstock**, agreed with the buyer per unit.
- **An estimate of the carbon your deliveries contributed to**, which is informational — see section 5.

---

## 1. Register your parcels (Parcels tab)

Open **`/farmer`**. The **Parcels** tab is where you record the land you harvest from.

Click **Add parcel** and fill in:

1. **Parcel name** — e.g. "Lot 3, Barangay Malaya".
2. **Crop type** — required.
3. **Area (hectares)** and **Expected yield (tonnes/yr)** — optional but worth entering; the expected
   yield is what your performance figure is measured against.
4. **Location / Region**, and optionally **latitude / longitude** and a **planting date**.
5. **Status** — active or fallow.

Each parcel card then shows its **performance**: what it has actually delivered against what you said
it should yield. That comparison uses the **last 12 months**, not everything since you registered it —
comparing three years of harvests against a one-year expectation would show 300% and mean nothing.

> **Deleting a parcel is permanent** and you will be asked to confirm. Your delivery records survive,
> but they stop counting towards that parcel's yield history — the confirmation tells you how many
> deliveries that affects.

---

## 2. List your feedstock (`/biomass/sell`)

Go to **Sell feedstock**. Create a listing with the product type, a short title, unit (usually
tonnes), price per unit, quantity available, and location.

You can list without KYB because **no platform money moves for feedstock** — see section 4. A business
would need KYB; a smallholder does not.

Listings appear on the public **Biomass** marketplace, where buyers find you.

---

## 3. Quotes and deliveries

The flow, end to end:

1. A buyer sends you a **quote request** (RFQ). It appears under **Feedstock requests**
   (`/biomass/rfqs`) on the **Received** tab.
2. You **submit a quote** — a price per unit, with an optional message.
3. The buyer **accepts or declines**. An accepted quote appears in your Farmer Portal.
4. You deliver the feedstock physically, then **log the delivery** against that accepted quote:
   quantity, unit, date, which parcel it came from, price per unit, and **proof documents**
   (weighbridge slip, receipt, photo).
5. The buyer **confirms** the delivery — or rejects it with a reason.
6. The buyer records payment.

> Deliveries can only be logged against an **accepted** quote, and only against a parcel you own. You
> can log several deliveries against one quote — a large order delivered in truckloads is normal.

---

## 4. Getting paid — read this carefully

**Payment does not go through Carbonify.** The buyer pays you directly — cash, GCash, bank transfer,
whatever you agree — and then records in the app that they have done so.

What that means for you:

- The **"Owed by buyers"** figure is what buyers have confirmed but not yet marked paid. Carbonify is
  not holding that money for you and will not release it to you.
- When a delivery shows **"Buyer recorded payment"**, that is *the buyer's statement*, not a receipt
  from Carbonify. **Check that the money actually arrived.**
- Keep your own record of what you were paid and when. The `payment reference` field is free text the
  buyer types; it is not verified.

> **Agree payment terms with the buyer before you deliver**, in writing if you can — when it is due,
> how, and what happens if it is late. Carbonify records the trade; it does not guarantee it.
>
> *This is a known limitation of the current beta and is tracked as #26 in the platform backlog. If a
> buyer does not pay, contact a Carbonify administrator — but be aware they currently have no console
> showing feedstock deliveries, so resolve it with the buyer directly where you can.*

---

## 5. Your carbon contribution (Carbon tab)

If a buyer names the project your feedstock fed, and that project later has **verified** emission
reductions, you will see an estimate of your share on the **Carbon** tab.

It is worked out **pro-rata by delivered mass**: if you supplied a fifth of the biomass a project
used, a fifth of that project's verified carbon is attributed to you.

**This is an estimate, not carbon credits you own.** You cannot sell it, retire it, or claim it as an
offset — the project developer holds the credits. It exists so you can see the climate impact your
crop residue contributed to.

Some deliveries are **excluded** from the calculation, and the tab tells you which and why:

- The delivery is not **confirmed** by the buyer yet.
- Its unit is not a mass the platform can convert (sacks, bales and cubic metres need a bulk density
  Carbonify does not have). **Log deliveries in tonnes or kilograms** if you want them to count.
- The buyer did not name a project when confirming.

---

## Language

The interface is currently **English only**. Filipino translation is a known gap and is the first
language planned — tracked as #27 in the platform backlog. The Preferences page shows a language
selector that is deliberately **disabled**, so that it is clear the option is coming rather than
silently ignored.
