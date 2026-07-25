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
export const TOUR_VERSION = 1

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
