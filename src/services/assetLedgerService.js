import { getSupabase } from '@/services/supabaseClient'

/**
 * Carbon Asset Management — developer asset-ledger service (expansion feature #2).
 *
 * Rolls up, per project the signed-in developer owns, the full carbon-credit
 * lifecycle: estimated → issued → pending → sold → retired → inventory (remaining
 * unsold), plus the money value of sold + on-hand credits. Pure aggregation over
 * existing tables — no new schema.
 *
 * Data sources (all keyed to projects the developer owns, `projects.user_id`):
 *   - projects                     → title, status, estimated_credits, credit_price
 *   - project_credits              → issued pool (`total_credits`) + remaining
 *                                    inventory (`credits_available`, canonical)
 *   - credit_transactions (seller) → sold quantity + gross revenue (completed only)
 *   - verified_emission_reductions → issued (approved) / pending VER quantities [drift-safe]
 *   - credit_retirements           → retired quantity against the project [drift-safe]
 *
 * The two MRV-era tables (VER, retirements) may be absent on drifted DBs, so their
 * queries degrade to [] on error — the ledger still renders from the reliable
 * projects/pool/transactions sources.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * Pure roll-up. Given the developer's projects and the raw lifecycle rows, produce
 * one ledger row per project plus grand totals. Exported for unit testing.
 *
 * @param {Object} input
 * @param {Array<{id:string, title?:string, status?:string, estimated_credits?:number, credit_price?:number}>} input.projects
 * @param {Array<{project_id:string, total_credits?:number, credits_available?:number, price_per_credit?:number, currency?:string}>} [input.pools]
 * @param {Array<{project_id:string, quantity?:number, total_amount?:number, status?:string, buyer_id?:string, created_at?:string}>} [input.sales]
 * @param {Array<{project_id:string, approved_quantity?:number, status?:string}>} [input.vers]
 * @param {Array<{project_id:string, quantity?:number}>} [input.retirements]
 * @param {Object<string,{full_name?:string, organization_name?:string, email?:string}>} [input.buyerProfiles]
 *   buyer_id → profile. Absent entries fall back to "Unknown buyer" so the ledger
 *   still renders when profile reads are blocked by RLS.
 * @returns {{rows:Array<Object>, totals:Object}}
 */
export function aggregateAssetLedger({
  projects = [],
  pools = [],
  sales = [],
  vers = [],
  retirements = [],
  buyerProfiles = {},
} = {}) {
  // Index the per-project sources by project_id for O(1) lookup.
  const poolBy = new Map()
  for (const p of pools || []) {
    if (!p?.project_id) continue
    // A project has at most one pool row; if duplicated, keep the largest issued.
    const prev = poolBy.get(p.project_id)
    if (!prev || (Number(p.total_credits) || 0) > (Number(prev.total_credits) || 0)) {
      poolBy.set(p.project_id, p)
    }
  }

  const soldBy = new Map()
  // Buyer history: per project, who bought, how much, for how much, and when.
  // Keyed project_id → buyer_id so repeat purchases by the same buyer collapse
  // into one row with a purchase count (that's the shape an ERPA conversation
  // wants — a counterparty list, not a transaction log).
  const buyersBy = new Map()
  for (const s of sales || []) {
    if (s?.status !== 'completed' || !s?.project_id) continue
    const cur = soldBy.get(s.project_id) || { qty: 0, value: 0 }
    const qty = Number(s.quantity) || 0
    const value = Number(s.total_amount) || 0
    cur.qty += qty
    cur.value += value
    soldBy.set(s.project_id, cur)

    const buyerId = s.buyer_id || null
    const byBuyer = buyersBy.get(s.project_id) || new Map()
    const key = buyerId || '__unknown__'
    const entry = byBuyer.get(key) || {
      buyerId,
      quantity: 0,
      value: 0,
      purchases: 0,
      lastPurchaseAt: null,
    }
    entry.quantity += qty
    entry.value += value
    entry.purchases += 1
    if (s.created_at && (!entry.lastPurchaseAt || new Date(s.created_at) > new Date(entry.lastPurchaseAt))) {
      entry.lastPurchaseAt = s.created_at
    }
    byBuyer.set(key, entry)
    buyersBy.set(s.project_id, byBuyer)
  }

  /** Resolve a buyer entry to a display name, degrading when the profile is unreadable. */
  const nameBuyer = (buyerId) => {
    const p = buyerId ? buyerProfiles[buyerId] : null
    return p?.organization_name || p?.full_name || p?.email || 'Unknown buyer'
  }

  const verBy = new Map()
  for (const v of vers || []) {
    if (!v?.project_id) continue
    const cur = verBy.get(v.project_id) || { approved: 0, pending: 0 }
    const qty = Number(v.approved_quantity) || 0
    if (v.status === 'approved') cur.approved += qty
    else if (v.status === 'pending') cur.pending += qty
    verBy.set(v.project_id, cur)
  }

  const retiredBy = new Map()
  for (const r of retirements || []) {
    if (!r?.project_id) continue
    retiredBy.set(r.project_id, (retiredBy.get(r.project_id) || 0) + (Number(r.quantity) || 0))
  }

  const rows = (projects || []).map((proj) => {
    const pool = poolBy.get(proj.id) || {}
    const sold = soldBy.get(proj.id) || { qty: 0, value: 0 }
    const ver = verBy.get(proj.id) || { approved: 0, pending: 0 }

    // Issued = credits placed into the sellable pool at validation; fall back to
    // approved VER volume, then 0.
    const issued = Number(pool.total_credits) || ver.approved || 0
    const pending = ver.pending || 0
    // Remaining unsold in the pool. `credits_available` is the canonical column
    // (the money path decrements it); fall back to issued − sold only if it is
    // somehow absent. The legacy `available_credits` column was a stale stray
    // (never decremented after a sale) and has been retired.
    const inventory =
      pool.credits_available != null
        ? Number(pool.credits_available) || 0
        : Math.max(0, issued - sold.qty)
    const retired = retiredBy.get(proj.id) || 0
    const pricePerCredit = Number(pool.price_per_credit) || Number(proj.credit_price) || 0

    // Largest counterparty first — that's the one an ERPA hangs on.
    const buyers = Array.from((buyersBy.get(proj.id) || new Map()).values())
      .map((b) => ({ ...b, name: nameBuyer(b.buyerId), value: round2(b.value) }))
      .sort((a, b) => b.quantity - a.quantity || b.value - a.value)

    return {
      projectId: proj.id,
      projectTitle: proj.title || 'Untitled Project',
      status: proj.status || 'draft',
      estimated: Number(proj.estimated_credits) || 0,
      issued,
      pending,
      sold: sold.qty,
      retired,
      inventory,
      pricePerCredit,
      soldValue: round2(sold.value),
      inventoryValue: round2(inventory * pricePerCredit),
      currency: pool.currency || 'PHP',
      buyers,
      buyerCount: buyers.length,
    }
  })

  // Sort by economic weight: sold value first, then on-hand inventory value.
  rows.sort((a, b) => b.soldValue - a.soldValue || b.inventoryValue - a.inventoryValue)

  const totals = rows.reduce(
    (t, r) => {
      t.projects += 1
      t.estimated += r.estimated
      t.issued += r.issued
      t.pending += r.pending
      t.sold += r.sold
      t.retired += r.retired
      t.inventory += r.inventory
      t.soldValue += r.soldValue
      t.inventoryValue += r.inventoryValue
      return t
    },
    {
      projects: 0,
      estimated: 0,
      issued: 0,
      pending: 0,
      sold: 0,
      retired: 0,
      inventory: 0,
      soldValue: 0,
      inventoryValue: 0,
    },
  )
  totals.soldValue = round2(totals.soldValue)
  totals.inventoryValue = round2(totals.inventoryValue)

  // Distinct buyers across the whole portfolio — a buyer of two projects counts once.
  // Unattributed sales collapse into a single '__unknown__' bucket, so they don't
  // inflate the count per project.
  const distinct = new Set()
  for (const byBuyer of buyersBy.values()) {
    for (const key of byBuyer.keys()) distinct.add(key)
  }
  totals.buyers = distinct.size

  return { rows, totals }
}

/** Fetch rows from an optional (possibly-absent) table; degrade to [] on any error. */
async function safeSelect(supabase, table, columns, projectIds) {
  if (!projectIds.length) return []
  try {
    const { data, error } = await supabase.from(table).select(columns).in('project_id', projectIds)
    if (error) {
      console.warn(`[assetLedger] ${table} unavailable, skipping:`, error.message)
      return []
    }
    return data || []
  } catch (err) {
    console.warn(`[assetLedger] ${table} query threw, skipping:`, err?.message)
    return []
  }
}

/**
 * Build the signed-in developer's asset ledger. Returns { rows, totals } from
 * {@link aggregateAssetLedger}, or an empty ledger if unauthenticated / no projects.
 */
export async function getMyAssetLedger() {
  const empty = { rows: [], totals: aggregateAssetLedger({}).totals }
  const supabase = getSupabase()
  if (!supabase) return empty

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return empty

  // 1) The developer's own projects (authoritative ownership key: projects.user_id).
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, title, status, estimated_credits, credit_price')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (projErr) {
    console.error('[assetLedger] failed to load projects:', projErr.message)
    throw new Error(projErr.message || 'Failed to load your projects')
  }
  const projectIds = (projects || []).map((p) => p.id)
  if (!projectIds.length) return empty

  // 2) Lifecycle sources, in parallel. Pools + sales are reliable; VER + retirements
  //    are MRV-era tables that may be absent on a drifted DB (safeSelect → []).
  const [pools, salesRows, vers, retirements] = await Promise.all([
    safeSelect(
      supabase,
      'project_credits',
      'project_id, total_credits, credits_available, price_per_credit, currency',
      projectIds,
    ),
    (async () => {
      // Completed sales where this developer is the seller, mapped to project_id.
      // `buyer_id` + `created_at` drive the per-project buyer history.
      const { data, error } = await supabase
        .from('credit_transactions')
        .select('quantity, total_amount, status, buyer_id, created_at, project_credits!inner(projects!inner(id))')
        .eq('seller_id', user.id)
        .eq('status', 'completed')
      if (error) {
        console.warn('[assetLedger] credit_transactions unavailable:', error.message)
        return []
      }
      return (data || []).map((t) => ({
        project_id: t.project_credits?.projects?.id,
        quantity: t.quantity,
        total_amount: t.total_amount,
        status: t.status,
        buyer_id: t.buyer_id,
        created_at: t.created_at,
      }))
    })(),
    safeSelect(supabase, 'verified_emission_reductions', 'project_id, approved_quantity, status', projectIds),
    safeSelect(supabase, 'credit_retirements', 'project_id, quantity', projectIds),
  ])

  // 3) Resolve buyer identities for the buyer-history column, through a
  //    SECURITY DEFINER RPC rather than a direct `profiles` read — the direct
  //    read returns nothing under RLS and did so silently. See getBuyerProfiles.
  const buyerIds = [...new Set(salesRows.map((s) => s.buyer_id).filter(Boolean))]
  const buyerProfiles = await getBuyerProfiles(supabase, buyerIds)

  return aggregateAssetLedger({ projects, pools, sales: salesRows, vers, retirements, buyerProfiles })
}

/**
 * buyer_id → { display name } for buyers this seller has completed sales to.
 *
 * DEFERRED_BACKLOG #39, migration `20260805000100`. This used to read `profiles`
 * directly, and on 2026-08-05 the negative RLS suite measured what that returns
 * for a signed-in non-admin: **nothing**. Every buyer on the ledger rendered as
 * "Unknown buyer".
 *
 * The direct read had an error branch, and it could never fire. RLS FILTERS rows
 * rather than erroring, so `error` was null and `data` was `[]` — the handler
 * covered the failure that does not happen while the one that does was silent.
 * That is the same shape as the receipt counterparty (#3), whose fix this
 * mirrors.
 *
 * DEGRADES TO {} deliberately. If the RPC is missing (migration not yet applied)
 * the call returns a genuine PostgREST error, which IS distinguishable from an
 * empty result and IS logged — the distinction the paragraph above is about. A
 * ledger that refuses to render because it cannot name a buyer would be worse
 * than one naming them "Unknown buyer", which is what `aggregateAssetLedger`
 * already falls back to.
 *
 * Emails are no longer available here and the display fallback no longer uses
 * one: the RPC returns organization or full name only.
 */
export async function getBuyerProfiles(supabase, buyerIds) {
  if (!buyerIds.length) return {}
  try {
    const { data, error } = await supabase.rpc('get_my_buyer_names', {
      p_buyer_ids: buyerIds,
    })
    if (error) {
      console.warn(
        '[assetLedger] buyer names unavailable; the ledger will show "Unknown buyer". ' +
          'Has migration 20260805000100 been applied?',
        error.message,
      )
      return {}
    }
    // Zero rows is an authorisation answer, not a failure: these are the ids the
    // caller has no completed sale to. Same reading as the counterparty RPC.
    return Object.fromEntries(
      (data || []).map((row) => [row.buyer_id, { full_name: row.display_name }]),
    )
  } catch (err) {
    console.warn('[assetLedger] buyer name lookup threw:', err?.message)
    return {}
  }
}
