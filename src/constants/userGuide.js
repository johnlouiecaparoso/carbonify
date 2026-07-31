/**
 * In-app user guide content.
 *
 * Why this exists alongside WelcomeTour and FirstRunGuide: those two are
 * *first-run* surfaces — a modal that opens once, and a dashboard panel that
 * disappears once the account has been used. Neither answers "how does this
 * actually work?" three weeks later, and `docs/user-guide/*.md` is in the repo
 * where no user will ever see it.
 *
 * ── Accuracy rules for anyone editing this file ──
 * This content makes CLAIMS ABOUT BEHAVIOUR, so a stale line here is a support
 * ticket, not a typo. The facts below are the ones the platform gets asked
 * about most, and each is deliberately worded to match what the code does:
 *
 *  - Credits are minted when a verifier approves a monitoring report's VERs.
 *    Validating a project mints NOTHING (the 2026-07-26 mint-on-VER cutover).
 *  - A farmer is paid DIRECTLY by the buyer. Carbonify never holds that money.
 *  - Card sales are held in escrow for a window; e-wallet sales release at once.
 *  - Buying requires KYC level 1. Seller withdrawals require KYB approval.
 *  - A pending farmer/developer/verifier application BLOCKS SIGN-IN.
 *  - LGU cannot be applied for — staff assign it.
 */

/** Disclosures that apply to the whole platform during the beta. */
export const BETA_NOTICES = [
  {
    title: 'Payments are in test mode',
    body: 'Checkout runs against PayMongo test keys. No real money moves. Use the test card 4343 4343 4343 4345 with any future expiry and any CVC.',
  },
  {
    title: 'Credits are not registry-backed yet',
    body: 'Retiring a credit produces a Carbonify certificate — not a Verra or Gold Standard registry receipt. It is not usable for statutory compliance or audited ESG reporting.',
  },
  {
    title: 'VAT invoices are provisional',
    body: 'Invoices are not BIR-accredited and carry no buyer TIN, so a company cannot claim input VAT on them yet.',
  },
]

/**
 * The guide itself. `roles` marks which roles a section is most relevant to;
 * the view floats those to the top but shows everything, because "what does a
 * verifier do?" is a fair question from a buyer.
 */
export const GUIDE_SECTIONS = [
  {
    id: 'basics',
    title: 'Start here — the basics',
    icon: 'rocket_launch',
    intro: 'What Carbonify is, and the first three things to do on a new account.',
    roles: ['*'],
    items: [
      {
        q: 'What is Carbonify?',
        a: 'A Philippine carbon-credit registry and marketplace. Project operators register climate projects, independent verifiers check them, and the credits those projects earn are listed for buyers to purchase and retire against their own emissions.',
      },
      {
        q: 'What is a carbon credit here?',
        a: 'One credit = one tonne of CO₂ equivalent (1 tCO₂e) that a verified project either removed from the atmosphere or prevented from being emitted.',
      },
      {
        q: 'Verify your identity (KYC)',
        a: 'Browsing is open to everyone, but buying credits requires ID verification at level 1 or above. It usually takes about one business day, so it is worth starting before you pick a project rather than at checkout.',
        to: '/kyc',
        cta: 'Start verification',
      },
      {
        q: 'Find your way around',
        a: 'The sidebar on the left is the complete list of everything your role can reach. Your avatar (top right) holds profile settings, security, privacy and this guide.',
      },
    ],
  },
  {
    id: 'lifecycle',
    title: 'How a credit comes to exist',
    icon: 'timeline',
    intro: 'The chain from a project on the ground to a certificate you can show someone.',
    roles: ['*'],
    items: [
      {
        q: '1. A project is registered',
        a: 'A developer submits the project with its boundary, technical documents (PDD, baseline, additionality) and compliance documents (LGU endorsement, land title, ECC).',
      },
      {
        q: '2. A verifier validates it',
        a: 'An independent verifier checks the project is real and the methodology is sound. Validation confirms the project — it does NOT create any credits.',
      },
      {
        q: '3. Monitoring reports are submitted',
        a: 'Each reporting period the developer submits an MRV (monitoring, reporting and verification) report with the evidence for what the project actually achieved.',
      },
      {
        q: '4. Approving the report issues the credits',
        a: 'When a verifier approves the report’s VERs, that is the moment credits are minted and become sellable. This catches people out: a validated project with no approved report has nothing to sell, and that is correct.',
      },
      {
        q: '5. Buyers purchase and retire',
        a: 'Credits are listed on the marketplace. A buyer purchases them, and retiring a credit permanently removes it from circulation so it can be claimed as an offset. Retirement produces a certificate with a serial number and a QR code anyone can verify.',
        to: '/registry',
        cta: 'Open the public registry',
      },
    ],
  },
  {
    id: 'buying',
    title: 'Buying and retiring credits',
    icon: 'shopping_cart',
    intro: 'For buyers, investors and general users.',
    roles: ['general_user', 'buyer_investor'],
    items: [
      {
        q: 'How do I buy?',
        a: 'Browse the marketplace, filter by location, price, category or SDG, then check out. You need KYC level 1 first. Payment is by card or e-wallet through PayMongo.',
        to: '/marketplace',
        cta: 'Browse marketplace',
      },
      {
        q: 'One thing to know about the cart',
        a: 'Items are paid for one at a time. If your cart holds listings from three sellers you will go through checkout three times, returning to the cart after each. The cart shows a countdown of what is left.',
      },
      {
        q: 'What does retiring do?',
        a: 'Retiring permanently takes the credit out of circulation and issues you a certificate. Do it when you want to claim the offset — you cannot sell or transfer a retired credit afterwards.',
        to: '/retire',
        cta: 'Retire credits',
      },
      {
        q: 'Where are my purchases?',
        a: 'Portfolio shows what you hold. Orders lists every checkout you started, including ones that did not complete. Receipts and Certificates hold the documents.',
        to: '/credit-portfolio',
        cta: 'Open portfolio',
      },
      {
        q: 'Something went wrong with a purchase',
        a: 'Open a dispute from the transaction. An administrator reviews it and can issue a refund. You can follow its status under Reported problems.',
        to: '/disputes',
        cta: 'View my reports',
      },
    ],
  },
  {
    id: 'developer',
    title: 'Running a project',
    icon: 'foundation',
    intro: 'For project developers.',
    roles: ['project_developer'],
    items: [
      {
        q: 'Registering a project',
        a: 'Submit basic details and the boundary, then technical and compliance documents. Any onboarding fee is shown before you commit. The project moves draft → submitted → in review → validated (or needs revision).',
        to: '/submit-project',
        cta: 'Submit a project',
      },
      {
        q: 'When do I get credits to sell?',
        a: 'Only after a verifier approves a monitoring report. Validation alone mints nothing and puts nothing on the marketplace, so expect at least one reporting cycle before you have anything to list.',
        to: '/monitoring',
        cta: 'Open MRV reports',
      },
      {
        q: 'Getting paid',
        a: 'Business verification (KYB) must be approved before you can withdraw. Card sales are held in escrow for a short window before becoming withdrawable; e-wallet sales release immediately. Your Earnings page shows Held and Available separately.',
        to: '/sales',
        cta: 'Open earnings',
      },
      {
        q: 'A verifier asked for changes',
        a: 'Revision requests appear in the conversation thread on the project. Reply there and resubmit — the thread is the record of what was asked and answered.',
      },
    ],
  },
  {
    id: 'farmer',
    title: 'Supplying feedstock',
    icon: 'agriculture',
    intro: 'For farmers and biomass suppliers.',
    roles: ['farmer'],
    items: [
      {
        q: 'What do I do here?',
        a: 'List the biomass you can supply — rice husk, coconut shell, farm residue. Buyers running conversion projects send you quotes, and you log each delivery you make against an accepted quote.',
        to: '/biomass/sell',
        cta: 'List feedstock',
      },
      {
        q: 'How do I get paid? (read this one)',
        a: 'The buyer pays you DIRECTLY — by cash, bank transfer or e-wallet, outside the platform. Carbonify never holds, transfers or guarantees your money. What the app does is record the trade and give you a say in it.',
      },
      {
        q: 'Why confirming a payment matters',
        a: 'When a buyer marks a delivery paid, it shows as "the buyer says they paid you" — an amber badge, not a settled one — until you answer. Confirm it if you were paid. If you were not, press "No, I was not paid" and say why: that notifies the buyer and every administrator, and staff can reverse a false "Paid".',
        to: '/farmer',
        cta: 'Open my portal',
      },
      {
        q: 'What Carbonify cannot do for you',
        a: 'Because the money never passes through the platform, Carbonify cannot recover it for you. What it can do is make the disagreement visible, put it in front of staff, and keep a dated record of both sides.',
      },
    ],
  },
  {
    id: 'verifier',
    title: 'What a verifier does',
    icon: 'verified',
    intro: 'For verifiers — and for anyone wondering who checks the credits they buy.',
    roles: ['verifier'],
    items: [
      {
        q: 'The role in one line',
        a: 'An independent, accredited reviewer who confirms that a project is genuine and that the tonnes it claims are real. Deliberately separate from anyone who profits from the sale.',
      },
      {
        q: 'Two different decisions',
        a: 'Validating a project confirms the project itself. Approving a monitoring report’s VERs is what actually issues credits. The second is the one that creates something sellable, so it carries the weight.',
        to: '/verifier',
        cta: 'Open review queue',
      },
      {
        q: 'Asking for changes',
        a: 'Rather than rejecting outright, you can send a project back for revision with a note in the project conversation. The developer replies in the same thread.',
      },
      {
        q: 'Becoming one',
        a: 'Apply with your accreditation body, accreditation number, years of experience and evidence of past work. Carbonify staff review it. Note that while the application is pending you cannot sign in.',
      },
    ],
  },
  {
    id: 'lgu',
    title: 'What an LGU account is',
    icon: 'account_balance',
    intro: 'For local government units — and for anyone curious what they do here.',
    roles: ['lgu_user'],
    items: [
      {
        q: 'The role in one line',
        a: 'A city or municipal government using Carbonify for its own climate reporting and to oversee carbon projects sited inside its jurisdiction.',
      },
      {
        q: 'What the tools do',
        a: 'A municipal solid waste calculator turns waste and diversion figures into an emissions baseline; land-use modelling estimates sequestration; and there is ESG reporting for the LGU itself.',
        to: '/lgu',
        cta: 'Open LGU tools',
      },
      {
        q: 'Endorsements',
        a: 'Projects sited in your area need an LGU endorsement as part of their compliance documents. Requests arrive in your dashboard for you to endorse or decline.',
      },
      {
        q: 'How to get an LGU account',
        a: 'This role is not open to application. Carbonify assigns it to a verified local government unit — contact the team to arrange it.',
      },
    ],
  },
  {
    id: 'money',
    title: 'Money, wallets and payouts',
    icon: 'payments',
    intro: 'How funds move — and where they deliberately do not.',
    roles: ['*'],
    items: [
      {
        q: 'Paying',
        a: 'Checkout goes through PayMongo — card, GCash or Maya. During the beta this runs on test keys, so no real money moves.',
      },
      {
        q: 'The escrow hold',
        a: 'When a buyer pays by CARD, the seller’s share is held for a short window before becoming withdrawable, which covers the chargeback period. E-wallet and wallet purchases release to the seller immediately. Sellers see Held and Available as separate figures.',
      },
      {
        q: 'Withdrawing',
        a: 'Sellers request a withdrawal from their earnings. Business verification (KYB) must be approved first — an unapproved KYB is the usual reason a withdrawal is blocked.',
      },
      {
        q: 'Feedstock is outside all of this',
        a: 'Payments between a buyer and a farmer for physical biomass do not pass through Carbonify at all. Escrow, refunds and payouts are credit-side only.',
      },
    ],
  },
  {
    id: 'account',
    title: 'Your account, security and data',
    icon: 'shield_person',
    intro: 'Protecting the account and exercising your data rights.',
    roles: ['*'],
    items: [
      {
        q: 'Two-factor authentication',
        a: 'Profile → Security → Enable 2FA. Scan the QR with an authenticator app and enter the 6-digit code. Once enrolled you will be asked for a code when signing in.',
        to: '/profile',
        cta: 'Open profile',
      },
      {
        q: 'KYC and KYB — the difference',
        a: 'KYC verifies you as a person and is what lets you BUY. KYB verifies a business and is what lets a seller WITHDRAW money. They are reviewed separately.',
      },
      {
        q: 'Your data',
        a: 'Profile → Privacy & Data lets you download a copy of everything held about you, or request account deletion. Deletion is processed by staff and some records are retained where the law requires it.',
        to: '/profile',
        cta: 'Open privacy settings',
      },
      {
        q: 'Changing your role',
        a: 'Apply for farmer, project developer or verifier from the application form. Be aware that while an application is awaiting a decision you cannot sign in — so finish anything you need to do first.',
        to: '/apply',
        cta: 'Apply for a role',
      },
    ],
  },
]

/** Sections most relevant to `role` first, everything else after. */
export function orderedSectionsForRole(role) {
  const mine = GUIDE_SECTIONS.filter((s) => s.roles.includes(role))
  const rest = GUIDE_SECTIONS.filter((s) => !s.roles.includes(role))
  return [...mine, ...rest]
}
