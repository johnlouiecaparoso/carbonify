/**
 * Carbonify Registry API — public tier + white-label partner tier.
 *
 * ## What changed, and why
 * This started as an unauthenticated read-only mirror of the public registry,
 * carrying its own warning: "No API-key gating or rate limiting yet. Add both
 * before advertising this as a paid/white-label product." Migration
 * 20260806000400 added the tenants, keys and scopes; this file spends them.
 *
 * ## Two tiers, one endpoint
 *   ANONYMOUS  — exactly what it always returned: validated projects and headline
 *                stats. Public data, IP-rate-limited, no branding. Kept working
 *                deliberately: the public registry is a transparency claim, and
 *                putting a key in front of it would retract that claim.
 *   KEYED      — `Authorization: Bearer ck_live_...`. Adds tenant branding to
 *                every response, the per-key rate limit the tenant is paying for,
 *                and the scoped endpoints below.
 *
 * ## Scopes
 *   registry:read      projects + stats + project detail
 *   certificates:read  certificate lookup by serial
 *   mrv:read           per-project MRV aggregates — the partner data product
 *
 * A key is authenticated by SHA-256 digest inside `authenticate_api_key`; this
 * function never sees a stored key and cannot enumerate them. Every rejection —
 * unknown, revoked, expired, inactive tenant — returns the same 401, so the
 * endpoint is not an oracle for which keys exist.
 *
 * Deploy:
 *   supabase functions deploy public-registry --no-verify-jwt
 *
 * Endpoints (GET):
 *   /public-registry                      list validated projects
 *     ?search= &category= &page=          (page is 0-based)
 *   /public-registry?stats=1              headline registry stats
 *   /public-registry?project=<uuid>       one validated project
 *   /public-registry?certificate=<serial> verify a retirement certificate
 *   /public-registry?mrv=<uuid>           MRV aggregates          [scope mrv:read]
 *
 * SECURITY
 *   Anonymous reads use the ANON key, so RLS decides what is visible and only
 *   already-public rows are ever returned. The SERVICE key is used for exactly
 *   two things — authenticating a key and serving the scoped RPCs — and never to
 *   widen an anonymous read.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const PAGE_SIZE = 20

// Anonymous callers share one modest budget per IP. Keyed callers get the limit
// on their key instead — that number is a price tier, not a safety valve.
const ANON_RATE_MAX = 60
const RATE_WINDOW_SECONDS = 60

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
}

interface Tenant {
  key_id: string
  tenant_id: string
  tenant_slug: string
  tenant_name: string
  display_name: string | null
  logo_url: string | null
  primary_color: string | null
  support_email: string | null
  scopes: string[]
  rate_limit_per_min: number
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...extraHeaders },
  })
}

function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

/** The bearer token, or null. Anything that is not a Bearer header is "no key". */
function bearerToken(req: Request): string | null {
  const header = req.headers.get('authorization') || req.headers.get('Authorization')
  if (!header) return null
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : null
}

/**
 * Resolve a raw key to its tenant. Returns null for every failure mode, which is
 * what makes the 401 indistinguishable across them.
 */
async function authenticateKey(rawKey: string): Promise<Tenant | null> {
  if (!SUPABASE_SERVICE_ROLE_KEY) return null
  try {
    const { data, error } = await serviceClient().rpc('authenticate_api_key', { p_key: rawKey })
    if (error || !data || data.length === 0) return null
    return data[0] as Tenant
  } catch {
    return null
  }
}

/**
 * Shared limiter (migration 20260704000000). Fails OPEN on an infrastructure
 * error — a limiter that cannot be reached must not take the API down with it.
 */
async function underRateLimit(key: string, max: number): Promise<boolean> {
  if (!SUPABASE_SERVICE_ROLE_KEY) return true
  try {
    const { data, error } = await serviceClient().rpc('check_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_seconds: RATE_WINDOW_SECONDS,
    })
    if (error) return true
    return data !== false
  } catch {
    return true
  }
}

/** The branding block a white-label front-end renders from. */
function tenantBlock(tenant: Tenant | null) {
  if (!tenant) return undefined
  return {
    slug: tenant.tenant_slug,
    name: tenant.tenant_name,
    displayName: tenant.display_name || tenant.tenant_name,
    logoUrl: tenant.logo_url,
    primaryColor: tenant.primary_color,
    supportEmail: tenant.support_email,
    scopes: tenant.scopes,
  }
}

function hasScope(tenant: Tenant | null, scope: string): boolean {
  return Boolean(tenant?.scopes?.includes(scope))
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'Registry API is not configured.' }, 500)
  }

  // ── Identify the caller ──────────────────────────────────────────────────
  const rawKey = bearerToken(req)
  let tenant: Tenant | null = null
  if (rawKey) {
    tenant = await authenticateKey(rawKey)
    if (!tenant) {
      return json({ error: 'Invalid or expired API key.' }, 401)
    }
  }

  // ── Meter it ─────────────────────────────────────────────────────────────
  const limiterKey = tenant
    ? `apikey:${tenant.key_id}`
    : `registry-anon:${req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown'}`
  const limit = tenant ? tenant.rate_limit_per_min : ANON_RATE_MAX

  if (!(await underRateLimit(limiterKey, limit))) {
    return json(
      { error: 'Rate limit exceeded.', limitPerMinute: limit },
      429,
      { 'Retry-After': String(RATE_WINDOW_SECONDS) },
    )
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const url = new URL(req.url)
  const brand = tenantBlock(tenant)

  try {
    // ── MRV aggregates — the scoped partner product ───────────────────────
    const mrvProjectId = url.searchParams.get('mrv')
    if (mrvProjectId) {
      if (!tenant) return json({ error: 'This endpoint requires an API key.' }, 401)
      if (!hasScope(tenant, 'mrv:read')) {
        return json({ error: 'This API key does not include the mrv:read scope.' }, 403)
      }
      if (!SUPABASE_SERVICE_ROLE_KEY) {
        return json({ error: 'MRV endpoint is not configured.' }, 500)
      }

      const { data, error } = await serviceClient().rpc('api_project_mrv_summary', {
        p_project_id: mrvProjectId,
      })
      if (error) return json({ error: error.message }, 502)
      // The RPC returns nothing for an unvalidated or absent project — the same
      // answer for both, so this cannot be used to discover unpublished projects.
      if (!data || data.length === 0) return json({ error: 'Project not found' }, 404)

      return json({ mrv: data[0], tenant: brand })
    }

    // ── Certificate lookup ────────────────────────────────────────────────
    const certificate = url.searchParams.get('certificate')
    if (certificate) {
      if (tenant && !hasScope(tenant, 'certificates:read')) {
        return json({ error: 'This API key does not include the certificates:read scope.' }, 403)
      }
      const { data, error } = await supabase.rpc('verify_certificate_public', {
        p_certificate_number: certificate,
      })
      if (error) return json({ error: error.message }, 502)
      const record = Array.isArray(data) ? data[0] : data
      if (!record) return json({ error: 'Certificate not found', tenant: brand }, 404)
      return json({ certificate: record, tenant: brand })
    }

    // ── Headline stats ────────────────────────────────────────────────────
    if (url.searchParams.get('stats')) {
      const { count: projectCount } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'validated')

      return json({
        stats: {
          validatedProjects: projectCount || 0,
          generatedAt: new Date().toISOString(),
        },
        tenant: brand,
      })
    }

    // ── Single project ────────────────────────────────────────────────────
    const projectId = url.searchParams.get('project')
    if (projectId) {
      const { data, error } = await supabase
        .from('projects')
        .select(
          'id, title, description, category, location, geo_coordinates, methodology, ' +
            'development_status, feedstock, capacity, capacity_unit, estimated_credits, ' +
            'expected_impact, created_at',
        )
        .eq('id', projectId)
        .eq('status', 'validated')
        .maybeSingle()

      if (error) return json({ error: error.message }, 502)
      if (!data) return json({ error: 'Project not found', tenant: brand }, 404)
      return json({ project: data, tenant: brand })
    }

    // ── Validated-project listing ─────────────────────────────────────────
    const page = Math.max(Number(url.searchParams.get('page')) || 0, 0)
    const search = (url.searchParams.get('search') || '').trim()
    const category = (url.searchParams.get('category') || '').trim()
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase
      .from('projects')
      .select(
        'id, title, category, location, methodology, development_status, expected_impact, created_at',
      )
      .eq('status', 'validated')
      .order('created_at', { ascending: false })
      .range(from, to)

    if (search) query = query.ilike('title', `%${search}%`)
    if (category) query = query.eq('category', category)

    const { data, error } = await query
    if (error) return json({ error: error.message }, 502)

    return json({ projects: data || [], page, pageSize: PAGE_SIZE, tenant: brand })
  } catch (err) {
    return json({ error: (err as Error)?.message || 'Unexpected error' }, 500)
  }
})
