# Carbonify — Release Notes

## 2026-07-28 (latest) — A wrong number on ESG reports, fixed; and dialogs you can close with a key

**Headline:** if you exported an ESG or offset report, it may have understated how many credits you
retired. That is fixed. Separately, every pop-up dialog can now be closed with the Escape key.

- **⚠️ ESG / offset reports could understate your retirements — re-export yours.** The report is built
  from your purchase and retirement history, and the code that assembled that history kept only the
  most recent entries **across both kinds combined**. If you had a lot of recent purchases, your older
  retirements were pushed out of the list — and because retirements are what the report counts as your
  offset, the total came out **too low**. Nothing was wrong with your actual credits: they were always
  retired, the certificates were always valid, and nothing was lost. Only the exported report was
  wrong. **If you filed a report generated before 28 July, export it again and compare the retired
  total.** Buyers with few purchases were unaffected.
- **Every dialog now closes with Escape.** Fifteen pop-ups — including **wallet top-up and
  withdrawal** — could only be dismissed with the mouse. Anyone using a keyboard, or a screen reader,
  could open a payment dialog and have no way to back out of it. All of them now close with Escape,
  keep the Tab key inside the dialog instead of wandering onto the page behind, and announce
  themselves properly to screen readers.
- **Money reads consistently across the app.** Your dashboard balance could show as `₱1,234.5` — one
  decimal place — while the same figure appeared correctly elsewhere. Amounts in a couple of places
  were also grouped using your browser's country format rather than Philippine format. Both fixed, so
  a peso amount now looks the same wherever you see it.

---

## 2026-07-26 — Clearer money figures, honest error messages, and a fix to how credits are issued

**Headline:** sellers can now see what they actually earn after fees and export it; farmers are told
plainly that Carbonify does not handle their payment; and a bug that could have issued the same credits
twice was found and fixed.

- **Credits are now issued only once, at the right moment.** Validating a project used to create its
  credits and list them for sale immediately, *and* approving its first monitoring report created them
  again — so the same tonne could exist twice. Now a validated project issues nothing until a verifier
  approves its first monitoring report. **If you are a project developer:** a project you validate today
  will not appear on the marketplace straight away, which is a change from last week. Nothing already
  listed was affected, and no credits had actually been issued twice.
- **Sellers see fees and net earnings.** The Seller Earnings page showed only the gross amount, which
  never matched the balance beside it. It now shows the platform fee and **what actually reaches you**,
  per sale and per project — plus **Export CSV** for both, for your accountant.
- **You can see when escrow releases.** The "Held in escrow" figure now names the date and amount of
  the next release instead of just saying "after the hold period".
- **Farmers: payment is between you and the buyer.** A delivery marked paid now reads "Buyer recorded
  payment" and says plainly that payment is made directly by the buyer, not through Carbonify —
  **check that the money actually arrived.** "Awaiting payment" is now "Owed by buyers", because
  nothing is queued for us to pay you.
- **LGU accounts can buy and retire credits.** If you run the waste calculator and want to offset what
  you measured, the Buying, Credits and Records sections are now in your menu. They were always
  reachable; nothing offered them.
- **Verifiers see how much is waiting.** Each workbench tab now carries a count, so you can tell which
  queue needs you without opening all three. Approving a report for a project that already has credits
  now warns you first.
- **Error messages tell the truth.** Across the app, a failed lookup used to look like an answer —
  "No sales yet", "₱0.00 available", "No parcels registered yet", "no accepted quotes". Those are now
  distinguished from genuinely having none, with a retry. If a page cannot load your data it says so
  instead of implying you have nothing.
- **Offline support works for the first time.** The app was deleting its own saved files a second after
  every page load, so pages were re-downloaded every visit and offline mode never worked.
- **A proper app icon.** The icon in your browser tab and on your home screen was a photo with a grey
  checkerboard behind it. It is now a real transparent icon, and much smaller to download.
- **Housekeeping.** Several unreachable pages were removed, including one showing made-up impact
  figures. The language selector in Preferences is now clearly marked unavailable — it never did
  anything, and the interface is English only for now.

## 2026-07-26 (later) — Easier-to-read text, and headings sized right on phones

**Headline:** the brand green is slightly deeper so white text on it is comfortably
readable, grey helper text is darker, and page headings no longer look oversized on a phone.

- **Readable text on green.** White text on the old brand green sat just under the
  accessibility standard for normal-size text — page titles were fine, but the smaller line of
  description text under each title was harder to read than it should be. The green is now a
  little deeper across the whole app, which fixes every page banner, button and badge at once.
  Grey "helper" text throughout the app is darker for the same reason.
- **Headings sized right on phones.** On a phone, several page banners — the Marketplace and
  Retire pages most visibly — were rendering their heading *larger* than on a desktop, so the
  green banner took up more of the screen than it should. Fixed.
- **Housekeeping.** Two unused leftover files containing sample/demo data were removed from
  the codebase. No change to anything you can see.

## 2026-07-26 — The same green everywhere, and shorter lists

**Headline:** every page now uses one shade of green, long admin lists collapse to a few
rows with a “See more”, and the Submit a Project form fits far more on screen.

- **One green.** Some pages — Submit a Project and your Projects dashboard in particular —
  were a noticeably darker green than the rest of the app, and the logo in the top bar was a
  different green again. Every page banner and the navigation bar now use the same brand
  green.
- **Long lists stay short.** The Finance Console, Audit Logs, Emission Factors and
  Refunds & Disputes now show a few rows at a time in a scrollable area with a **See more**
  button, instead of running down the page. The public Registry’s certificate list works the
  same way. Table headings stay pinned while you scroll.
- **A tidier marketplace filter bar.** The search box, filters and buttons were wrapping into
  uneven rows — most noticeably for project developers, whose extra “Submit Project” button
  pushed everything out of line. Filters now sit on an even grid with the actions beneath.
- **Submit a Project fits on screen.** Fields that were meant to sit side by side (start/end
  dates, capacity, costs) had been stacking full-width, and the spacing between boxes was
  larger than it needed to be. The form is now noticeably shorter without anything getting
  harder to read, and the help text under every field is one consistent size.
- **LGU Land Use tab.** The three result tiles are now equal width and evenly spaced, the
  “Horizon (years)” field and “+ Add parcel” button line up, and removing a parcel no longer
  shuffles the values in the rows beneath it.

## 2026-07-25 — New tools: fees, LGU land-use modeling, and a guided tour

**Headline:** admins can set project fees, LGUs can model land-use carbon, and new users
get a short guided walkthrough.

- **A guided tour for new users.** The first time you sign in, a short role-specific
  walkthrough shows where the main things are. You can reopen it any time from “Take a
  tour” in the sidebar or the account menu — with extra guidance for LGUs and cooperatives.
- **Project & verification fees (admin).** System Configuration now lets an administrator set
  a project onboarding fee and a verification/certification fee. When set, the fee is shown to
  developers when they submit a project — nothing is charged during submission.
- **Land-use carbon modeling for LGUs.** A new “Land Use” tab estimates the yearly and
  multi-year CO₂ your restoration areas (mangrove, reforestation, bamboo, agroforestry,
  grassland) would sequester — a planning estimate, separate from verified credit issuance.
- **Under the hood.** The app is now container-ready (Dockerfile) and has a read-only public
  registry API that partners can pull from.

## 2026-07-25 — A cleaner, more consistent interface

**Headline:** every page now shares the same compact green header, the sidebar is the same
shape for every role, and long lists stay short with a "See more" control.

- **One consistent header everywhere.** Every dashboard and console now uses the same green
  banner — including pages that previously had a plain white header (System Configuration,
  KYB / AML / Privacy / Refunds reviews, Role Applications, Analytics, the AI Assistant, Cart,
  Saved, Orders, Reported problems, Upgrade, and Social). The header is also **smaller**, so it
  no longer takes up so much of the screen before your content starts.
- **The sidebar starts the same for every role.** Your Dashboard and the Explore group
  (marketplace, biomass, registry, map) are pinned to the top, with your role's own tools below.
- **Fixed a confusing highlight.** Opening "Sell feedstock" no longer also lights up "Biomass"
  in the sidebar — only the page you're on is highlighted now.
- **Long lists stay tidy.** Your Portfolio holdings, Orders and Receipts now show a few at a
  time in a compact scrollable area with a **See more / Show less** button, instead of running
  down the page.
- **"Watchlist" is now "Saved."**
- **Carbon calculator fixes.** Negative entries can no longer cancel out your real emissions,
  the credit count reads correctly ("1 credit", not "1 credits"), and the Buy button is disabled
  until you've entered something.

## 2026-07-25 — Profile loading is more resilient

**Headline:** a slow or failed profile load no longer makes you look like a lower-privileged
user, and the app now tells you when it's retrying.

- **Your role no longer flickers on a bad connection.** If loading your profile times out or
  fails, the app keeps your last-known role and retries in the background, instead of silently
  treating you as a basic user — which had been hiding admin and staff controls until a reload.
- **A clear "couldn't load your profile" signal.** When a load fails you'll see a short banner,
  plus a small marker on your avatar and a note in the account menu. All of them clear
  themselves once your profile loads.
- **New accounts always get a complete profile.** Fixed a case where a freshly created account
  could come back with an empty profile (blank name, default role).

### For operators
- The signup-trigger migration `20260723000100_profile_on_signup.sql` **was applied to the live
  project on 2026-07-25**. It guarantees every account has a profile row; the change above is
  the client-side safety net for when one still can't be read.

---

## 2026-07-23 — New navigation, and access-control fixes

**Headline:** signed-in users now navigate from a single grouped sidebar on the left,
and three access-control bugs around sign-in and roles were fixed.

### New navigation
- **One sidebar for everything.** Every feature a role can use is listed in a grouped
  left sidebar, in one place, under one name. Previously the same page could appear as
  "Buy credits" in one menu and "Marketplace" in another. The header now carries only
  your cart, notifications, and avatar; the avatar menu holds only account settings.
- **Collapsible sidebar.** The three-line button beside the logo widens or narrows the
  sidebar on desktop and opens it as a drawer on mobile.
- **Tidier developer project list.** Projects collapse to one row each, grouped by what
  needs your attention — "Needs your action", "In review", "Live", "Closed".

### Access-control fixes
- **The public marketplace is public again.** Browsing the marketplace and opening a
  project link no longer forces you to sign in first.
- **Admin accounts can sign in.** A `super_admin` account was being caught in a redirect
  loop and could not reach the app; it now lands on the admin dashboard.
- **Buying pages are limited to buyers.** Staff roles (admin, verifier, project developer)
  can no longer open the cart or checkout pages that don't apply to them.
- **Clearer sign-up and sign-in.** Registration now tells you when to check your email for
  a confirmation link, and when an address is already registered, instead of always saying
  "account created". Signing out no longer resets your theme or language.

### For operators
- One database migration ships with this release, `20260723000100_profile_on_signup.sql`,
  which guarantees every new account gets a profile row. **Applied to the live project on
  2026-07-25** — see HANDOFF.md §0.5.

---

## 2026-07-03 — Server-authoritative money path (complete & hardened)

**Headline:** the entire money path now runs on the server and is locked down. Every money
movement — buying with a card, GCash/Maya, or wallet balance; topping up the wallet;
checking out a cart; retiring credits; and subscribing — settles server-side and the books
reconcile to zero. This closes the platform's biggest production risk (client-controlled
payment amounts) and hardens the financial tables so the browser can no longer write them.

### Highlights
- **Server-authoritative checkout.** The client sends only `{ listing_id, quantity }`; the
  amount is recomputed on the server from the listing price. A client can no longer set the
  price it pays.
- **Signed webhook as the source of truth.** The PayMongo webhook verifies an HMAC-SHA256
  signature (with a replay window and event de-duplication) and settles each payment
  atomically via database functions. It fails closed.
- **Double-entry ledger + reconciliation.** Every settlement writes balanced ledger entries;
  `reconcile_financials()` reports drift and returns **0 rows** when healthy.
- **Financial tables are now server-write-only.** Row-Level Security keeps reads working but
  blocks all direct client writes to `credit_transactions`, `credit_ownership`,
  `wallet_accounts`, and `wallet_transactions`. Writes happen only through
  `SECURITY DEFINER` RPCs or the service-role webhook.
- **Sellers can get paid.** Escrow, a KYB-gated payout state machine, refunds, and disputes
  are all wired and proven.

### Verified flows (each with `reconcile_financials()` = 0 rows, after the RLS lockdown)
| Flow | Result |
|---|---|
| Card purchase | ✅ |
| Wallet top-up | ✅ |
| Wallet purchase | ✅ |
| Cart (2 items) | ✅ |
| Retire credits | ✅ |
| Subscription upgrade | ✅ |

### Fixes in this release
Four objects that existed only in the live database (never in version control) were surfaced
by the first real end-to-end runs and are now committed as idempotent migrations
(`20260703000000`–`20260703000200`):
- **`update_wallet_balance_atomic`** — the wallet top-up settlement function was called by the
  webhook but defined in no migration. Added.
- **`wallet_transactions.external_reference`** — a missing column that broke the top-up audit
  row and the callback confirmation. Added (with an index).
- **Retirement `project_id` bug** — the Retire page passed the wrong identifier to the retire
  function, causing a false "insufficient credits". Fixed.
- **Stray `credit_ownership_quantity_positive` (> 0) constraint** — blocked retirement's
  zero-out write; replaced with the intended `>= 0` guard.

Also: retiring credits now shows an in-app toast instead of a blocking browser alert.

### Documentation added
- **Per-role user guides** — step-by-step how-to for every role: [user-guide/](user-guide/README.md).
- **Developer docs** — setup, environment variables, architecture, database & RPCs, deployment,
  testing, contributing, and security: [dev/](dev/README.md).

### Verification
ESLint 0 · 145 unit tests passing · production build green · all six money flows reconcile to 0
after the lockdown.

### Known limitations (not code — need an external party or ops/legal)
- Real registry/supplier integration (Verra / Gold Standard / Carbonmark / Patch).
- AML / sanctions screening (needs a data vendor).
- Independent penetration test before using live payment keys; backups/PITR; observability.
- Legal entity, licensed PSP/EMI partnership, BIR registration, accredited third-party verifier.
- VAT invoices are **provisional** until the operating entity is BIR-registered.

> Tracking: branch `feature-user-onboarding-ux`, PR #2 → `main`. Full runbook in
> [YOUR_CUTOVER_STEPS.md](YOUR_CUTOVER_STEPS.md); status detail in
> [MONEY_CUTOVER_STATUS.md](MONEY_CUTOVER_STATUS.md).
