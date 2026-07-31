# Scope — Organization / Company Accounts

> **Status:** 📋 **Scoped, not started.** Written 2026-07-25 during the commercial repositioning.
> **Why it exists:** Carbonify is positioned for institutional users — corporate buyers, project
> developers, verifiers, LGUs, cooperatives — but **every account in the system is an individual
> person.** There is no company entity. This document scopes the gap and phases the work.
>
> **Decision needed from the owner:** whether to build this, and whether it gates the first
> paying corporate customer. See §6.

---

## 1. What exists today — verified against the code

Checked against the live migration set and services, not against older docs.

| Thing | Reality |
|---|---|
| `profiles.company` | A **free-text string** on the individual profile ([profileService.js](../src/services/profileService.js)). Cosmetic label; nothing is keyed to it. |
| `kyb_applications` | `user_id references profiles(id)` ([20260606000800_kyb.sql](../supabase/migrations/20260606000800_kyb.sql)). A business is an **attribute of one person**, not an entity that can have members. |
| `organizations` / `members` / `seats` tables | **Do not exist**, anywhere in the migration set. |
| Money identity | Everything keys to `auth.uid()`: `credit_ownership.user_id`, the `seller_payable:<user_id>` ledger account, `escrow_holds.seller_id`, `get_my_seller_balance()`. |
| VAT invoice buyer block | [vatInvoiceService.js](../src/services/vatInvoiceService.js) already renders `buyer.tin` and `buyer.address` — but `receiptService` never supplies either field, so **both always render blank.** |
| Subscription plans | Free / Pro / Business — but **Business is functionally identical to Pro** ([GAP_ANALYSIS.md](GAP_ANALYSIS.md)). There is no org-shaped value to sell it on. |

**Summary:** the platform models a company as *a word typed into a text box on one person's profile.*

## 2. Why this breaks for company users

Concrete failures, roughly in order of severity:

1. **Credits are owned by the employee, not the company.** `credit_ownership.user_id` is a person. When
   that person leaves the company, the company's carbon assets — and its retirement history, and its
   ESG evidence — leave with them. There is no mechanism to transfer or reclaim them. **This is the
   one that actually matters**; everything else is friction, this is asset loss.
2. **The company cannot claim input VAT.** With no buyer TIN or registered name on the invoice, the
   document is issued to a natural person. Finance departments will reject it, and it undercuts the
   BIR-accredited-receipts track on the go-live gate.
3. **One login per company.** Companies will share credentials, which destroys the audit trail the
   platform's integrity claims rest on — and it directly violates our own ToS §1.2 ("one person or
   entity per account").
4. **No delegation or approval.** A sustainability manager cannot purchase while finance approves.
   Segregation of duties exists for Carbonify's own admins (§1.11 of the policy) but not for customers.
5. **KYB verifies a person-as-business.** Two employees of the same corporation each submit their own
   KYB, each gets separately approved, and nothing links them.
6. **ESG reporting is per-user.** A company's footprint is split across whoever happened to buy, so the
   ESG export — a primary reason a corporate buyer is here — under-reports by construction.

## 3. Phased scope

### Phase 1 — Organization entity + membership
*Foundation. Touches no money path — safe to build at any time, including during the pilot.*

- `organizations` — legal name, entity type (corporation / partnership / sole prop / cooperative),
  SEC or DTI registration number, BIR TIN, registered address, status.
- `organization_members` — `(organization_id, user_id, org_role, status, invited_by, joined_at)`
  where `org_role ∈ owner | admin | finance | member`.
- Invite flow: owner/admin invites by email → invitee accepts → member row. Reuses the existing
  Resend edge function (**note:** this is blocked on the same email wiring paused in GAP_ANALYSIS #0a).
- RLS: members read their own org; only `owner`/`admin` mutate. Add `is_org_member(org_id)` and
  `has_org_role(org_id, role)` as `SECURITY DEFINER` helpers, mirroring the existing `is_admin()`
  pattern so the posture stays consistent and auditable.
- `profiles.company` stays as a display fallback for individuals; it is **not** migrated into the FK
  (the strings are unvalidated user input and would create junk orgs).

### Phase 2 — Org-owned credits
*The phase that makes "company accounts" actually true. Touches the money path.*

- `credit_ownership` gains a nullable `organization_id`. Ownership is **either** personal **or** org —
  enforced by a check constraint, never both.
- An explicit **"acting as"** context: the user picks personal or one of their orgs, and it is carried
  through checkout into settlement. The context must be **re-derived server-side** from
  `organization_members` at settlement — never trusted from the browser, consistent with the rest of
  the money path.
- Portfolio, retirement, and ESG export read org holdings for any member.
- Retirement on behalf of the org; the certificate beneficiary becomes the org's **legal** name.

> ⚠️ **This modifies `process_marketplace_purchase` and `retire_credits_atomic`.** Both are settlement
> RPCs. Every change here needs a full `reconcile_financials()` = 0 pass. See §5 for sequencing.

### Phase 3 — Org billing identity
*Makes it saleable to a finance department.*

- Org legal name / TIN / registered address flow into `buildVatInvoice`, **filling the `buyer.tin` and
  `buyer.address` fields that already exist and currently render blank** — this is a small change with
  outsized commercial value.
- Receipts and invoices addressed to the organization.
- Subscription attaches to the **org**, not the user. This is also what finally gives the **Business
  tier a distinct value proposition** (today it is identical to Pro): seats, org invoicing, consolidated
  ESG reporting.

### Phase 4 — Org KYB + spending roles
*Required before a company can SELL, not just buy. Deepest money change in the set.*

- KYB becomes an **organization-level** record; members inherit verified status rather than each
  re-verifying. Requires migrating `kyb_applications` from `user_id` to a nullable
  `organization_id` (expand/contract — keep both during the transition).
- `finance` org role gates spending; `member` can request, `finance`/`owner` approves.
- Seller side becomes `seller_payable:<organization_id>` with payouts to a **corporate** bank account.
  `escrow_holds.seller_id`, `get_my_seller_balance()`, `request_payout()` and the `process-payouts`
  worker all need the org dimension.

### Phase 5 — Admin + audit
- Admin console: organization list, org KYB review queue, member management, suspension at org level.
- `audit_logs` rows carry org context so an action can be attributed to *"Maria, acting for Acme Corp"*.
- Per-seat limits and enforcement, if seats become a billing dimension.

## 4. Explicit non-goals for v1

Deliberately out of scope so the first cut can ship:

- SSO / SAML / SCIM provisioning (enterprise procurement will eventually ask; not now)
- Per-seat pricing and metering
- Organization hierarchies / subsidiaries / group consolidation
- Cross-organization credit transfers
- Custom org-level branding on certificates

## 5. Sequencing constraint — read before starting

**Do not begin Phase 2 during the pilot pre-flight.**

The staged escrow migration [`20260725000200`](../supabase/migrations/20260725000200_restore_escrow_hold_window.sql)
rewrites `process_marketplace_purchase`. Phase 2 rewrites the same function. Landing both in one window
means that if `reconcile_financials()` comes back non-zero, there is no way to tell which change caused
it — and one of them is the chargeback protection the ToS now promises.

**Correct order:** apply escrow → run the closed beta → *then* start Phase 2.

**Phase 1 is exempt** — it adds new tables and touches no settlement code, so it can proceed in
parallel with the beta.

## 6. Owner decisions needed

1. **Build it at all?** If the first customers are individual traders and smallholder cooperatives,
   this can wait. If they are corporations buying for ESG disclosure, **Phases 1–3 are effectively a
   prerequisite for the first sale**, because the invoice problem blocks their finance department.
2. **Buy-side only, or sell-side too?** Phases 1–3 let a *company buy*. Phase 4 is what lets a
   *company sell* — significantly more work, and it touches payouts.
3. **Does this gate the beta, or follow it?** Recommendation: **follow it.** The beta's job is to
   validate the money path with real humans; adding an untested org dimension to the settlement RPC in
   the same window works against that.

## 7. Recommendation

Build **Phase 1 now, in parallel with the pilot** (it is additive and risk-free), then **Phases 2–3
immediately after the beta closes**, before soliciting the first corporate customer. Defer Phase 4
until a company actually asks to sell, and Phase 5 until there are enough orgs to need administering.

Phases 1–3 are what make the sentence *"Carbonify serves corporate buyers"* true rather than
aspirational. Phase 4 makes it true for corporate suppliers as well.

---

*Related: [GAP_ANALYSIS.md](GAP_ANALYSIS.md) · [DEFERRED_BACKLOG.md](DEFERRED_BACKLOG.md) #18 ·
[GO_LIVE_ROADMAP.md](GO_LIVE_ROADMAP.md) §3 · [HANDOFF.md](HANDOFF.md)*
