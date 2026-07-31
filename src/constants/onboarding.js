/**
 * Role-aware onboarding walkthrough content.
 *
 * A first-run guided tour (see components/onboarding/WelcomeTour.vue) reads the
 * steps for the signed-in user's role. It is a plain sequence of explanatory
 * cards — deliberately not element-anchored, so it never breaks when a page's
 * markup changes. The intent (from the PH-eligibility review) is an
 * instructional guide for new users, LGUs and cooperatives especially.
 *
 * Bump TOUR_VERSION when the steps change enough that returning users should
 * see the tour again.
 */
// v2: added the KYC step to the buyer flow. Existing buyers should see the tour
// again — the thing it now explains is the one that was blocking them.
export const TOUR_VERSION = 2

const COMMON_CLOSING = {
  title: 'You are set',
  body: 'You can reopen this walkthrough any time from “Take a tour” at the bottom of the sidebar. Everything else lives in the sidebar on the left.',
}

const ROLE_STEPS = {
  general_user: [
    {
      title: 'Welcome to Carbonify',
      body: 'Carbonify is a Philippine carbon-credit marketplace. This quick tour shows where the main things are.',
    },
    {
      title: 'Browse & buy credits',
      body: 'Open the Marketplace to browse verified projects. Filter by location, price, category or SDG, then buy — your purchase quantity can be pre-filled from the Carbon Calculator.',
    },
    {
      // Buying is KYC-gated, and the tour used to send people to the marketplace
      // without saying so — they met the gate at checkout instead, after picking
      // a project and a quantity. Verification is not instant, so it belongs
      // before the browsing step pays off, not after.
      title: 'Verify your identity first',
      body: 'Browsing is open to everyone, but buying credits requires ID verification — it usually takes about one business day. Start it early from “KYC verification” in the menu under your avatar, so your first purchase is not held up.',
    },
    {
      title: 'Track what you own',
      body: 'Portfolio shows the credits you hold; Orders and Receipts track every purchase. Retire credits when you want to claim an offset, then download the certificate.',
    },
    {
      title: 'Offset your footprint',
      body: 'The Carbon Calculator estimates your emissions and tells you how many credits to buy to offset them.',
    },
    COMMON_CLOSING,
  ],
  buyer_investor: [
    {
      title: 'Welcome, investor',
      body: 'Beyond buying credits, your account unlocks the Investor Portal for the validated project pipeline.',
    },
    {
      title: 'Investor Portal',
      body: 'See projected value, financial returns (IRR/NPV), contracted vs. speculative revenue, funding gaps, and each project’s data room of due-diligence documents.',
    },
    {
      title: 'Marketplace & portfolio',
      body: 'Buy credits in the Marketplace and track holdings in your Portfolio, with an ESG/offset report you can export.',
    },
    COMMON_CLOSING,
  ],
  project_developer: [
    {
      title: 'Welcome, project developer',
      body: 'Register carbon projects, prove reductions through MRV, and sell the credits you issue.',
    },
    {
      title: 'Submit a project',
      body: 'Use “Submit project” to register: basic info and boundary, technical docs (PDD, baseline, additionality, leakage, safeguards) and compliance docs (LGU endorsement, land title, ECC, MOA). Any onboarding fee is shown up front.',
    },
    {
      title: 'File monitoring reports (MRV)',
      body: 'From the MRV dashboard, submit monitoring reports with activity data and evidence. The platform computes proposed reductions; a verifier approves them, and credits are issued.',
    },
    {
      title: 'Sell & get paid',
      body: 'List issued credits in the Marketplace, record offtake agreements, and track earnings and payouts under Seller earnings.',
    },
    COMMON_CLOSING,
  ],
  verifier: [
    {
      title: 'Welcome, verifier',
      body: 'You review submissions and monitoring reports, and approve the credits that get issued.',
    },
    {
      title: 'Your review queues',
      body: 'The Verifier Panel holds the tabs for developer applications and MRV review. Approve or reject with notes; your decisions drive project validation and credit issuance.',
    },
    COMMON_CLOSING,
  ],
  lgu_user: [
    {
      title: 'Welcome, LGU partner',
      body: 'These tools help your city or municipality quantify emissions, model land-use carbon, and support local carbon projects.',
    },
    {
      title: 'MSW emissions calculator',
      body: 'Estimate landfill methane from your solid waste and the reductions from diverting it — from population, or from your own tonnage figures. Attach hauler/MRF records as evidence.',
    },
    {
      title: 'Land-use carbon modeling',
      body: 'The Land Use tab estimates annual CO₂e sequestration from restoration (mangrove, reforestation, bamboo, agroforestry) across hectares in your jurisdiction — for planning.',
    },
    {
      title: 'Endorse & report',
      body: 'Endorse carbon projects hosted in your area, and export a City ESG summary for your council or DENR/CCC.',
    },
    COMMON_CLOSING,
  ],
  farmer: [
    {
      title: 'Welcome, farmer',
      body: 'Register your land, log feedstock deliveries, and track what you have been paid.',
    },
    {
      title: 'Parcels & deliveries',
      body: 'Add your plantation parcels, then log feedstock deliveries against accepted quotes and upload proof. Confirmed deliveries feed the MRV supply chain.',
    },
    {
      title: 'Sell feedstock',
      body: 'List biomass (rice husk, biochar, Bana grass and more) in the biomass marketplace and respond to buyers’ quote requests.',
    },
    COMMON_CLOSING,
  ],
  admin: [
    {
      title: 'Welcome, administrator',
      body: 'You oversee users, projects, compliance queues, finances and platform settings.',
    },
    {
      title: 'Operations & compliance',
      body: 'The sidebar groups your tools: user management, finance console, audit logs, and the compliance queues (KYC, KYB, AML, privacy requests, refunds, role applications).',
    },
    {
      title: 'System configuration',
      body: 'Set the platform fee, project/verification fees, minimum KYC to trade, and emission factors that drive credit calculations.',
    },
    COMMON_CLOSING,
  ],
}

/**
 * Steps for a role, falling back to the general buyer flow. `role` is the
 * canonical role string from the user store.
 */
export function tourStepsForRole(role) {
  return ROLE_STEPS[role] || ROLE_STEPS.general_user
}

/**
 * First-run "start here" checklist, shown on the dashboard itself rather than
 * in a modal.
 *
 * The tour above is a dialog: it opens once, and once dismissed a new user has
 * to know that "Take a tour" exists at the bottom of the sidebar to get it
 * back. This list stays on the page until the account has been used, so the
 * answer to "what do I do now?" is visible rather than remembered.
 */
const FIRST_STEPS = {
  general_user: [
    {
      title: 'Verify your identity',
      body: 'Browsing is open to everyone, but buying credits needs ID verification, and it usually takes about a business day. Starting now means your first purchase is not held up later.',
      to: '/kyc',
      cta: 'Start verification',
    },
    {
      title: 'Look around the marketplace',
      body: 'Browse verified Philippine projects and filter by location, price, category or SDG. Nothing is charged until you check out.',
      to: '/marketplace',
      cta: 'Browse marketplace',
    },
    {
      title: 'Work out what to offset',
      body: 'The Carbon Calculator estimates your footprint and converts it into the number of credits you would need.',
      to: '/carbon-calculator',
      cta: 'Open calculator',
    },
  ],
  buyer_investor: [
    {
      title: 'Verify your identity',
      body: 'Buying credits needs ID verification, which usually takes about a business day. Start it before you pick a project, not after.',
      to: '/kyc',
      cta: 'Start verification',
    },
    {
      title: 'Browse the marketplace',
      body: 'Filter verified projects by location, price, category or SDG, and add what interests you to your watchlist.',
      to: '/marketplace',
      cta: 'Browse marketplace',
    },
    {
      title: 'Review the project pipeline',
      body: 'The Investor Portal shows validated projects with financial projections and their due-diligence data rooms.',
      to: '/investor',
      cta: 'Open Investor Portal',
    },
  ],
  project_developer: [
    {
      title: 'Register your first project',
      body: 'Submit basic details and your boundary, then the technical documents (PDD, baseline, additionality) and compliance documents (LGU endorsement, land title, ECC). Any onboarding fee is shown before you commit.',
      to: '/submit-project',
      cta: 'Submit a project',
    },
    {
      title: 'Understand when credits appear',
      body: 'Validation alone does not create credits. Credits are issued only after a verifier approves a monitoring (MRV) report — so expect a reporting cycle before anything is sellable.',
      to: '/monitoring',
      cta: 'Open MRV reports',
    },
    {
      title: 'Set up payouts',
      body: 'Business verification (KYB) has to be approved before you can withdraw sale proceeds. It is worth starting early.',
      to: '/kyc',
      cta: 'Start verification',
    },
  ],
  farmer: [
    {
      title: 'List what you can supply',
      body: 'Register the feedstock you produce — rice husk, coconut shell, farm residue — and buyers looking for biomass can find and quote you.',
      to: '/biomass/sell',
      cta: 'List feedstock',
    },
    {
      title: 'Check your quotes',
      body: 'When a buyer accepts, log the delivery against it. That record is what a payment is later matched to.',
      to: '/biomass/rfqs',
      cta: 'View quotes',
    },
    {
      title: 'Know how you get paid',
      body: 'The buyer pays you DIRECTLY — Carbonify never holds your money. The app records the payment, lets you confirm or contest it, and escalates a disagreement to staff. Always confirm or dispute, because that record is your evidence.',
      to: '/farmer',
      cta: 'Open my portal',
    },
  ],
  lgu_user: [
    {
      title: 'Start with your waste profile',
      body: 'The MSW calculator turns your municipality’s waste and diversion figures into an emissions baseline.',
      to: '/lgu',
      cta: 'Open LGU tools',
    },
    {
      title: 'Endorse projects in your area',
      body: 'Developers need an LGU endorsement for projects sited in your jurisdiction. Endorsement requests appear in your dashboard.',
      to: '/lgu',
      cta: 'Review endorsements',
    },
  ],
  verifier: [
    {
      title: 'Open your review queue',
      body: 'Projects awaiting validation and MRV reports awaiting verification are both in the verifier panel.',
      to: '/verifier',
      cta: 'Open review queue',
    },
    {
      title: 'Know what approval does',
      body: 'Approving a monitoring report’s VERs is what MINTS credits — it is the moment a tonne becomes sellable. Validation of a project does not issue anything.',
      to: '/verifier',
      cta: 'Open review queue',
    },
  ],
  admin: [
    {
      title: 'Work the review queues',
      body: 'Role applications, KYC and KYB all gate real user actions — an unreviewed KYB leaves a seller unable to withdraw.',
      to: '/admin/role-applications',
      cta: 'Open applications',
    },
    {
      title: 'Check the books daily',
      body: 'The finance console and the daily health check are how a settlement problem is caught in hours rather than weeks.',
      to: '/admin/finance',
      cta: 'Open finance console',
    },
  ],
}

export function firstStepsForRole(role) {
  return FIRST_STEPS[role] || FIRST_STEPS.general_user
}

/**
 * What the other roles are, and how (or whether) you can become one.
 *
 * Accurate to how the platform actually behaves, which is not obvious from the
 * outside:
 *  - farmer, project_developer and verifier are APPLIED for at /apply and
 *    approved by staff;
 *  - a pending application BLOCKS SIGN-IN until it is decided
 *    (getBlockingRoleApplicationForUser), which is worth knowing BEFORE you
 *    apply rather than after you are locked out;
 *  - lgu_user cannot be applied for at all — it is assigned by Carbonify to a
 *    verified local government unit.
 */
export const ROLE_EXPLAINERS = [
  {
    role: 'farmer',
    label: 'Farmer / feedstock supplier',
    icon: 'agriculture',
    summary:
      'You grow or collect biomass — rice husk, coconut shell, farm residue — and sell it to project operators who convert it into carbon credits.',
    detail:
      'You list what you can supply, receive quotes from buyers, and log each delivery. Buyers pay you directly; Carbonify records the payment and gives you a way to confirm or contest it.',
    applyTo: '/apply?role=farmer',
    applyCta: 'Apply as a farmer',
  },
  {
    role: 'project_developer',
    label: 'Project developer',
    icon: 'foundation',
    summary:
      'You run the project that removes or avoids emissions — biochar, waste-to-energy, agroforestry, renewables — and you sell the credits it earns.',
    detail:
      'You register the project with its boundary and documents, submit monitoring reports each period, and list the resulting credits. Credits are issued only when a verifier approves a monitoring report, not when the project is validated.',
    applyTo: '/apply?role=project_developer',
    applyCta: 'Apply as a project developer',
  },
  {
    role: 'verifier',
    label: 'Verifier',
    icon: 'verified',
    summary:
      'An INDEPENDENT reviewer who checks that a project is real and that the tonnes it claims are genuine. This is an accredited role, not a self-selected one.',
    detail:
      'Verifiers validate new projects and review monitoring reports. Approving a report is what actually issues credits, so the role is deliberately separate from anyone who profits from the sale. Applying requires your accreditation body, accreditation number and evidence of past work.',
    applyTo: '/apply?role=verifier',
    applyCta: 'Apply as a verifier',
  },
  {
    role: 'lgu_user',
    label: 'LGU (Local Government Unit)',
    icon: 'account_balance',
    summary:
      'A city or municipal government using Carbonify for its own climate reporting and to oversee projects inside its jurisdiction.',
    detail:
      'LGU accounts get waste and land-use emissions tools, ESG reporting, and the endorsement queue for projects sited in their area. This role is not open to application — Carbonify assigns it to a verified local government unit.',
    applyTo: null,
    contact: 'Contact the Carbonify team to have an LGU account set up.',
  },
]
