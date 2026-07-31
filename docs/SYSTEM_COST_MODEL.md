# Carbonify — System Cost Model

> **Draft:** 2026-07-20 · Based on the ₱300,000 / 18-month funding ask and the recurring cost categories already documented in Carbonify.

## Executive summary

Your stated budget implies an average cash burn of about **₱16,667 per month**:

$$
300{,}000 \div 18 \approx 16{,}667
$$

That is a **lean commercialization budget**, not a full paid-team operating budget. It is workable if most labor is founder-led or deferred, but it is very tight for paid staff, accredited verification, and live compliance-heavy operations.

## 1. Use of funds translated to monthly burn

| Bucket | Total | Avg / month | Notes |
|---|---:|---:|---|
| Team & Operations | ₱90,000 | ₱5,000 | Covers execution, coordination, admin. |
| Product & Technology Development | ₱75,000 | ₱4,167 | Feature work, tooling, small contractor spend. |
| Market Development & Partnerships | ₱45,000 | ₱2,500 | Outreach, partnerships, sales support. |
| Carbon Project Onboarding & Verification | ₱45,000 | ₱2,500 | Onboarding support, verification workflow, project handling. |
| Cloud Infrastructure & Security | ₱15,000 | ₱833 | Hosting, DB, monitoring, backups, security basics. |
| Legal, Compliance & Registry Integrations | ₱15,000 | ₱833 | Legal setup, compliance, registry/API integration support. |
| Contingency Buffer | ₱15,000 | ₱833 | Slack for overruns and unknowns. |
| **Total** | **₱300,000** | **₱16,667** | 18-month average burn budget. |

## 2. What this budget really says

### Lean interpretation

- The budget assumes **founder sweat equity** or very low-cost labor.
- It does **not** look like enough for a fully salaried team.
- It is enough to keep a focused MVP/commercial pilot moving if you are conservative with external spend.

### Pressure points

- **Team & Operations at ₱5,000/month** is below normal market salary cost; treat it as coordination/admin support, not payroll for a full-time hire.
- **Legal, Compliance & Registry Integrations at ₱833/month** is likely underpriced if you use outside counsel, DPO help, registry partners, or an accredited verifier.
- **Cloud Infrastructure & Security at ₱833/month** is fine for a small pilot, but it leaves little room for growth, audit logging, heavy usage, or redundancy.
- **Carbon Project Onboarding & Verification at ₱2,500/month** is probably enough for internal onboarding workflows, but not enough for frequent third-party verification costs if those are paid per project.

## 3. Cost buckets you should track separately

### Fixed or mostly fixed monthly costs

- Hosting / compute / storage / backups / monitoring.
- Domain and email services.
- Basic security tooling.
- Internal ops coordination.

### Variable transaction costs

- Payment processor MDR and fixed transaction charges.
- Payout/disbursement fees.
- KYC/KYB checks.
- Any registry or supplier rev-share.
- External verification or audit charges.

### One-off or lumpy costs

- Legal entity setup and contract drafting.
- Compliance policy work.
- Registry integration setup.
- Pen test / security review.
- Branding, launch, and partner onboarding.

## 4. Cost reality from the docs

The rest of the Carbonify docs already point to the same recurring cost classes:

- PSP MDR typically runs around **2–4%** per payment.
- Payout/disbursement fees apply per transfer.
- KYC/KYB checks are charged per user or per verification.
- Cloud cost grows with PITR, replicas, queueing, and observability.
- Compliance adds legal, DPO, AML, and audit spend.
- External APIs can add ongoing running cost.

So the ₱300,000 raise is best read as a **pilot commercialization budget**, not as the full economic cost of building a mature, fully staffed platform.

## 5. Scenario estimate

### Scenario A — Founder-led lean pilot

- External cash cost: roughly **₱10,000 to ₱25,000/month**.
- Works if founders are not drawing meaningful salary.
- Fit for proof-of-value, early pilots, and low-volume operations.

### Scenario B — Small commercial pilot

- External cash cost: roughly **₱25,000 to ₱50,000/month**.
- Assumes some paid contractors, moderate compliance work, and live support.
- This is where the ₱300,000 runway becomes tight but still plausible with discipline.

### Scenario C — Paid team / heavier compliance

- External cash cost: **₱50,000/month and up**.
- Includes meaningful salaries, more frequent verification, and larger infrastructure.
- In this scenario, ₱300,000 is not enough for 18 months.

## 6. Interpretation of your milestone targets

Your milestones imply a lean but ambitious go-to-market:

- 50+ carbon projects onboarded.
- 10 enterprise customers.
- 1,000+ platform users.
- ₱2M transaction volume.

If you hit those targets, the platform should start seeing enough transaction-based revenue to help absorb MDR, payout, and support costs. But those milestones do not remove the need to budget for compliance and variable payment costs up front.

## 7. Practical conclusion

The cleanest reading is:

- **₱300,000** is enough for a **lean, founder-led commercialization runway**.
- It is **not** enough for a fully paid operating team plus full compliance overhead.
- The largest hidden risks are **legal/compliance**, **verification/audit costs**, and **payment-rail fees**.

If you want a safer budget, the next step is to separate the raise into:

1. base operating burn,
2. variable transaction costs,
3. compliance / verification reserve,
4. contingency.