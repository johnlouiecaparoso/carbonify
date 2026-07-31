# Carbonify — Commercial Feature Implementation Plan

> **Draft:** 2026-07-20 · This plan covers the commercial features you asked about and turns the missing pieces into a buildable sequence.

## Scope

This plan separates the asked-for package into two groups:

| Feature | Current state | Plan status |
|---|---|---|
| Project onboarding fees | Not implemented as a distinct product flow | Needs implementation |
| Verification & certification support | Already implemented | No product change required |
| Marketplace transaction fees | Already implemented | No product change required |
| Premium enterprise tools and data analytics | Already implemented | Optional expansion only |
| White-label MRV/API solutions | Only roadmap-adjacent today | Needs implementation |

## 1. Project onboarding fees

### Goal

Charge a configurable fee when a project developer submits or activates a project, separate from the existing marketplace transaction fee.

### Recommended implementation shape

- Add a dedicated system setting for `project_onboarding_fee`.
- Decide the billing moment explicitly: submission, admin approval, or activation.
- Surface the fee on the project submission screen before the user confirms.
- Record the charge in the financial ledger with an audit trail that distinguishes it from marketplace fees.

### Acceptance check

- A project developer can see the onboarding fee before submission.
- The fee is charged once per project lifecycle, not on every edit.
- The ledger can distinguish onboarding revenue from marketplace revenue.

## 2. White-label MRV/API solutions

### Goal

Turn the existing MRV / registry work into a partner-facing API surface that can be embedded or branded for external clients.

### Recommended implementation shape

- Expose a versioned API for project, MRV, verification, issuance, and certificate lookup.
- Add API credentials or tenant-scoped tokens.
- Keep the public branding configurable so a partner can present the service under their own name.
- Split read-only public endpoints from privileged partner actions.

### Acceptance check

- A partner can authenticate to the API.
- A partner can retrieve MRV and certificate data through documented endpoints.
- The same core data can be presented under Carbonify branding or partner branding.

## 3. Already-covered items

These do not need new implementation work for the feature set you listed:

- Verification and certification support is already live.
- Marketplace transaction fees are already live.
- Premium enterprise tools and analytics are already live behind plan gating.

## 4. Suggested order

1. Define the onboarding fee model and billing trigger.
2. Implement onboarding fee storage, checkout UI, and ledger write.
3. Design the API tenant / branding model.
4. Publish the first white-label MRV/API slice as read-only endpoints.
5. Add documentation and example partner integration notes.

## 5. Cost model reference

If you are also budgeting the system, use [SYSTEM_COST_MODEL.md](SYSTEM_COST_MODEL.md) alongside this plan. It turns the ₱300,000 / 18-month funding ask into a monthly burn view and separates fixed, variable, and one-off costs.