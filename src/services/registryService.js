// Public carbon registry service — searchable, anonymous-accessible list of
// active certificates (issued/retired credits). Backed by SECURITY DEFINER RPCs
// (migration 20260626000900) that expose only safe, non-PII fields and are
// granted to anon, so the registry works without logging in.

import { getSupabase } from '@/services/supabaseClient'

const PAGE_SIZE = 25

/** Search the public registry. Returns { rows, pageSize }. */
export async function searchRegistry({ search = '', category = '', page = 0 } = {}) {
  const supabase = getSupabase()
  if (!supabase) return { rows: [], pageSize: PAGE_SIZE }

  const { data, error } = await supabase.rpc('search_public_registry', {
    p_search: search || null,
    p_category: category || null,
    p_limit: PAGE_SIZE,
    p_offset: Math.max(0, page) * PAGE_SIZE,
  })
  if (error) {
    console.warn('[registry] search failed:', error.message)
    throw new Error(error.message || 'Failed to search the registry.')
  }
  return { rows: data || [], pageSize: PAGE_SIZE }
}

/**
 * Search the public PROJECT registry — the companion to `searchRegistry`, which
 * lists certificates. Backed by `search_public_project_registry` (migration
 * 20260807000100), which returns validated projects only and no developer PII.
 *
 * Throws on failure rather than returning `[]`. An empty array here reads as
 * "the registry is empty", which is a claim about the platform, not about the
 * request that failed.
 *
 * @returns {Promise<{rows: Array<object>, pageSize: number}>}
 */
export async function searchProjectRegistry({
  search = '',
  category = '',
  methodology = '',
  page = 0,
} = {}) {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Supabase client not available')

  const { data, error } = await supabase.rpc('search_public_project_registry', {
    p_search: search || null,
    p_category: category || null,
    p_methodology: methodology || null,
    p_limit: PAGE_SIZE,
    p_offset: Math.max(0, page) * PAGE_SIZE,
  })
  if (error) {
    console.warn('[registry] project search failed:', error.message)
    throw new Error(error.message || 'Failed to search the project registry.')
  }
  return { rows: data || [], pageSize: PAGE_SIZE }
}

/** Headline totals for the registry header. */
export async function getRegistryStats() {
  const supabase = getSupabase()
  if (!supabase) return { certificate_count: 0, total_credits: 0, project_count: 0 }

  const { data, error } = await supabase.rpc('public_registry_stats')
  if (error) {
    console.warn('[registry] stats failed:', error.message)
    return { certificate_count: 0, total_credits: 0, project_count: 0 }
  }
  return {
    certificate_count: Number(data?.certificate_count) || 0,
    total_credits: Number(data?.total_credits) || 0,
    project_count: Number(data?.project_count) || 0,
  }
}

/**
 * Public market dashboard figures (Phase 4) — totals, price range, and the
 * retired-vs-available split. Backed by the anon-granted `public_market_stats`
 * RPC (migration 20260627000100). Returns zeroed defaults on any error.
 */
export async function getMarketStats() {
  const zero = {
    active_listings: 0,
    credits_available: 0,
    avg_price: 0,
    min_price: 0,
    max_price: 0,
    total_retired: 0,
    total_issued: 0,
    listed_projects: 0,
  }
  const supabase = getSupabase()
  if (!supabase) return zero

  const { data, error } = await supabase.rpc('public_market_stats')
  if (error) {
    console.warn('[market] stats failed:', error.message)
    return zero
  }
  return {
    active_listings: Number(data?.active_listings) || 0,
    credits_available: Number(data?.credits_available) || 0,
    avg_price: Number(data?.avg_price) || 0,
    min_price: Number(data?.min_price) || 0,
    max_price: Number(data?.max_price) || 0,
    total_retired: Number(data?.total_retired) || 0,
    total_issued: Number(data?.total_issued) || 0,
    listed_projects: Number(data?.listed_projects) || 0,
  }
}
