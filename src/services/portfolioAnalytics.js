/**
 * Buyer portfolio analytics (backlog feature) — pure, side-effect-free.
 *
 * Computes a holder's live position: how many credits they own, what they paid
 * (cost basis), what the position is worth at the current market price, and the
 * resulting unrealized gain/loss. Retired holdings are excluded (they're spent,
 * not a tradable position). Holdings without a known purchase price still count
 * toward owned/market value but are left out of the cost-basis-based P&L so the
 * percentage stays honest.
 */

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

/**
 * @param {Array<{quantity:number, purchase_price?:number, ownership_status?:string, ownership_type?:string}>} holdings
 * @param {number} marketPrice current market price per credit (e.g. market avg)
 * @returns {{
 *   ownedCredits:number, costBasis:number, marketValue:number,
 *   unrealizedPnl:number, unrealizedPnlPct:number,
 *   pricedCredits:number, unpricedCredits:number
 * }}
 */
export function computePortfolioPnl(holdings = [], marketPrice = 0) {
  const price = Math.max(Number(marketPrice) || 0, 0)
  let ownedCredits = 0
  let costBasis = 0
  let pricedCredits = 0

  for (const h of holdings || []) {
    if (h?.ownership_status === 'retired' || h?.ownership_type === 'retired') continue
    const qty = Number(h?.quantity) || 0
    if (qty <= 0) continue
    ownedCredits += qty
    const pp = Number(h?.purchase_price)
    if (pp > 0) {
      costBasis += qty * pp
      pricedCredits += qty
    }
  }

  const marketValue = ownedCredits * price
  // Fair P&L compares only the credits we have a cost basis for.
  const pricedMarketValue = pricedCredits * price
  const unrealizedPnl = round2(pricedMarketValue - costBasis)
  const unrealizedPnlPct = costBasis > 0 ? round2((unrealizedPnl / costBasis) * 100) : 0

  return {
    ownedCredits,
    costBasis: round2(costBasis),
    marketValue: round2(marketValue),
    unrealizedPnl,
    unrealizedPnlPct,
    pricedCredits,
    unpricedCredits: ownedCredits - pricedCredits,
  }
}

/**
 * How concentrated a portfolio is — by project, and by category.
 *
 * WHY THIS IS THE ONE WORTH ADDING
 * The analytics page restated the portfolio: totals owned, totals retired, a
 * category split. A buyer could read all of that off the portfolio page for
 * free. Concentration is the first thing a disclosure reviewer or an auditor
 * actually asks — "how much of this sits in one project?" — and it is the one
 * number that cannot be read off a list of holdings by eye.
 *
 * It matters commercially too: a reversal, a fraud finding or a registry
 * suspension hits one project, and a buyer holding 80% of their offsets there
 * has a very different exposure from one holding 8%.
 *
 * HHI is the standard concentration measure (sum of squared percentage shares,
 * 0–10,000). It is included because it is comparable across portfolios of
 * different sizes, which top-share alone is not. The conventional reading —
 * under 1,500 unconcentrated, 1,500–2,500 moderate, above 2,500 concentrated —
 * is applied here so the number arrives with a meaning attached rather than as
 * trivia.
 *
 * Retired credits are excluded, matching computePortfolioPnl: they are spent,
 * and concentration is a statement about exposure you still carry.
 *
 * Pure — no I/O, unit-tested.
 *
 * @param {Array<{quantity:number, project_id?:string, project_title?:string,
 *   project_category?:string, ownership_status?:string, ownership_type?:string}>} holdings
 * @param {{topN?: number}} [opts]
 */
export function computeConcentration(holdings = [], { topN = 5 } = {}) {
  const byProject = new Map()
  const byCategory = new Map()
  let total = 0

  for (const h of holdings || []) {
    if (h?.ownership_status === 'retired' || h?.ownership_type === 'retired') continue
    const qty = Number(h?.quantity) || 0
    if (qty <= 0) continue
    total += qty

    // Several holdings can exist for one project (separate purchases), so they
    // are summed before any share is computed — otherwise a buyer who bought
    // the same project five times looks diversified.
    const projectKey = h?.project_id || h?.project_title || 'Unknown project'
    const projectLabel = h?.project_title || 'Unknown project'
    const prev = byProject.get(projectKey)
    byProject.set(projectKey, { label: projectLabel, credits: (prev?.credits || 0) + qty })

    const categoryLabel = h?.project_category || 'Uncategorised'
    byCategory.set(categoryLabel, (byCategory.get(categoryLabel) || 0) + qty)
  }

  if (total === 0) {
    return {
      totalCredits: 0,
      projectCount: 0,
      categoryCount: 0,
      topProjects: [],
      categories: [],
      largestShare: 0,
      topThreeShare: 0,
      hhi: 0,
      rating: 'none',
    }
  }

  const share = (credits) => round2((credits / total) * 100)

  const projects = [...byProject.values()]
    .map((p) => ({ label: p.label, credits: p.credits, share: share(p.credits) }))
    .sort((a, b) => b.credits - a.credits)

  const categories = [...byCategory.entries()]
    .map(([label, credits]) => ({ label, credits, share: share(credits) }))
    .sort((a, b) => b.credits - a.credits)

  // HHI over the true shares, not the truncated top-N — truncating would make
  // a long tail look like concentration.
  const hhi = Math.round(projects.reduce((acc, p) => acc + p.share * p.share, 0))

  return {
    totalCredits: total,
    projectCount: projects.length,
    categoryCount: categories.length,
    topProjects: projects.slice(0, topN),
    categories,
    largestShare: projects[0]?.share || 0,
    topThreeShare: round2(projects.slice(0, 3).reduce((acc, p) => acc + p.share, 0)),
    hhi,
    rating: hhi >= 2500 ? 'concentrated' : hhi >= 1500 ? 'moderate' : 'diversified',
  }
}
