# Carbonify — Test Script for Every Role

**Simple, step-by-step tests for the closed beta.** Each test has a **name/ID**, a goal, the steps, and
what "pass" looks like. Tick the box when it passes. If a step fails, write down which test ID and what
happened.

> **Before you start**
> - This is **test mode** — no real money moves.
> - When any step asks for card payment, use the **test card: `4343 4343 4343 4345`**, any future expiry
>   date, any 3-digit CVC.
> - You'll need one account per role. The **Admin** creates/approves the special roles (Verifier and LGU
>   are set by Admin; Farmer and Developer are applied for and approved).
> - After every payment test, the Admin runs the health check **ADMIN-05** — the books must balance.
>
> ⚠️ **Credits are created at MRV approval, not at validation.** Validating a project (VER-02) marks it
> legitimate and eligible for monitoring — it mints nothing and puts nothing on the marketplace. Credits
> exist, and the project lists, only once a verifier approves a monitoring report's emission reductions
> (VER-03). This changed on 2026-07-26, so **a project validated before that date behaves differently
> from one validated today** — if you see an older project already listed, that is expected. Run VER-03
> before the buyer tests (BUY-03 onward) if you need fresh credits to buy.

---

## 👤 Buyer / User — "BUY"

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ BUY-01 | Create account | Go to Register → fill the form → Create Account → sign in | You're logged in and land on the home page |
| ☐ BUY-02 | Identity check (KYC) | Profile → complete KYC | KYC shows verified; you can buy |
| ☐ BUY-03 | Browse the marketplace | Open Marketplace → click a project | Project detail page opens with map, docs, price |
| ☐ BUY-04 | Top up wallet | Wallet → Top up → pay with test card | Wallet balance goes up |
| ☐ BUY-05 | Buy a credit (card) | Marketplace → buy 1 credit → pay with test card | Certificate + receipt appear; credit is in your portfolio |
| ☐ BUY-06 | Buy with cart | Add 2 different credits to cart → checkout | Both purchases complete; 2 certificates |
| ☐ BUY-07 | Retire a credit | Portfolio → Retire → confirm | Retirement certificate generates |
| ☐ BUY-08 | Verify a certificate | Open the certificate's QR / public link | Public page shows it as valid |
| ☐ BUY-09 | ESG report | Credit Portfolio → export ESG / offset report | PDF/CSV downloads |
| ☐ BUY-10 | Upgrade to Pro | Go to Upgrade → subscribe with test card | Account shows "Pro" |

---

## 🏗️ Project Developer — "DEV"

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ DEV-01 | Apply as developer | Register → "I develop carbon projects" → apply → Admin approves | Your role becomes Project Developer |
| ☐ DEV-02 | Submit a project | Submit Project → fill details, registry fields, financials → upload required documents → submit | Project saved as "pending"; documents attached |
| ☐ DEV-03 | Resubmit after revision | If a verifier requests changes → edit → resubmit | Project re-enters the review queue |
| ☐ DEV-04 | File monitoring report | Monitoring → new report → enter activity data → submit | Report submitted for verification |
| ☐ DEV-05 | Carbon Asset Ledger | Open Carbon Assets / ledger | Shows issued / sold / retired + buyer history |
| ☐ DEV-06 | MRV dashboard | Open MRV Dashboard | Shows verified/pending tCO₂e, trend, compliance |
| ☐ DEV-07 | Offtake agreement | Offtakes → add a signed agreement (buyer, volume, price) | Appears; investor view shows contracted % |
| ☐ DEV-08 | Payout | Seller Earnings → submit KYB → request payout (Admin approves) | Payout processes; earnings update |
| ☐ DEV-09 | Data-room activity | Developer → Data Room | Shows how many investors viewed documents |

---

## ✅ Verifier — "VER"  *(Admin sets this role)*

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ VER-01 | Review a project | Verifier panel → open a submitted project → run the scored rubric | Rubric score shows; checklist saves |
| ☐ VER-02 | Validate & price | Set price per credit → Validate | Project becomes **Validated** and moves to MRV. **No credits are minted and it does NOT appear on the marketplace yet** — that is correct, not a bug (see the note above) |
| ☐ VER-03 | Approve emission reductions | Open the monitoring report → approve → pick **Removal** or **Avoidance** | Credits mint **and the project now appears on the marketplace**; MRV dashboard splits removed/avoided |
| ☐ VER-04 | Request changes | Reject / request revision with a comment | Developer is notified; project returns to them |

---

## 🌾 Farmer — "FARM"  *(applied for, Admin approves)*

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ FARM-01 | Register as farmer | Register → "I am a farmer" → apply → Admin approves | Role becomes Farmer; `/farmer` opens |
| ☐ FARM-02 | Register a parcel | Farmer portal → Parcels → add (crop, area, expected yield, location) | Parcel appears in the register |
| ☐ FARM-03 | Log a delivery | Deliveries → log against an accepted RFQ → upload proof photo | Delivery recorded as pending |
| ☐ FARM-04 | Track payment | After buyer confirms + marks paid | Payment status updates |
| ☐ FARM-05 | Carbon participation | Farmer portal → Carbon tab | Shows attributed tCO₂e (as an estimate) |
| ☐ FARM-06 | Parcel performance | Look at a parcel card | Shows actual vs expected yield, colour-coded |

---

## 🏛️ LGU User — "LGU"  *(Admin sets this role)*

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ LGU-01 | Waste emissions calculator | LGU Tools → MSW Calculator → enter waste figures | Emissions estimate calculates |
| ☐ LGU-02 | Diversion tracking | Enter diverted tonnage | Diverted impact shows (not exceeding total) |
| ☐ LGU-03 | City ESG report | Open the ESG / city report tab | Report + chart render |
| ☐ LGU-04 | Endorse a project | Project endorsements tab → endorse a project | Endorsement is recorded |

---

## 📈 Investor — "INV"  *(Pro plan, buyer-investor)*

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ INV-01 | Open the portal | Go to Investor Portal | Cross-developer pipeline of validated projects shows |
| ☐ INV-02 | Financial model | Open a project | IRR / NPV / payback + funding gap show |
| ☐ INV-03 | Filter pipeline | Filter by category / standard / stage | List filters correctly |
| ☐ INV-04 | Data room | Open a project's document | Document opens; developer sees the view logged |

---

## 🛠️ Admin — "ADMIN"

| ID | Test name | Steps | Pass when |
|---|---|---|---|
| ☐ ADMIN-01 | Approve a role | Admin → Role Applications → approve a farmer/developer/verifier | Applicant's role updates |
| ☐ ADMIN-02 | Set KYB | User Management → tick "Business verified (KYB)" | That seller's payout gate clears |
| ☐ ADMIN-03 | Review KYB | `/admin/kyb` → review a submission | KYB status updates |
| ☐ ADMIN-04 | Refund / dispute | `/admin/refunds` → process a refund | Refund reverses; books still balance |
| ☐ ADMIN-05 | **Books health check** | Finance Console (or run `select * from reconcile_financials();`) | **Returns 0 rows / balanced** — run after every payment test |
| ☐ ADMIN-06 | System config | System Config → change platform fee / tax | Setting saves and applies |

---

## How to record results

For each test, mark **Pass** or **Fail**. For a fail, note:
- The **test ID** (e.g. `BUY-05`)
- What you **expected** vs what **happened**
- A screenshot if possible

The most important single check is **ADMIN-05** — if the books ever fail to balance after a payment
test, stop and report it before continuing.
