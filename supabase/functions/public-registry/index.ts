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
 * ⚠️ `--no-verify-jwt` IS MANDATORY, not a convenience. Deployed without it, the
 * Supabase gateway demands a valid Supabase JWT before a request ever reaches
 * this file — measured on the first deploy:
 *
 *   (no header)                     → 401 UNAUTHORIZED_NO_AUTH_HEADER
 *   Authorization: Bearer ck_live_… → 401 UNAUTHORIZED_INVALID_JWT_FORMAT
 *
 * The second is the fatal one: the gateway tries to parse a partner's API key as
 * a JWT and rejects it, so a valid key can never arrive. Both the anonymous tier
 * and the keyed tier are dead. In the dashboard this is the "Verify JWT" toggle,
 * which must be OFF.
 *
 * ## Versioned — routing is inlined below, see the ROUTING BLOCK
 * The unversioned root serves a discovery document and NO registry data, so a
 * partner cannot integrate against an unfrozen shape. All data lives under /v1/.
 *
 * Endpoints (GET):
 *   /public-registry                         discovery document (no data)
 *   /public-registry/v1/                     list validated projects
 *     ?search= &category= &page=             (page is 0-based)
 *   /public-registry/v1/?stats=1             headline registry stats
 *   /public-registry/v1/?project=<uuid>      one validated project
 *   /public-registry/v1/?certificate=<serial> verify a retirement certificate
 *   /public-registry/v1/?mrv=<uuid>          MRV aggregates          [scope mrv:read]
 *
 * SECURITY
 *   Anonymous reads use the ANON key, so RLS decides what is visible and only
 *   already-public rows are ever returned. The SERVICE key is used for exactly
 *   two things — authenticating a key and serving the scoped RPCs — and never to
 *   widen an anonymous read.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ═════════════════════════════════════════════════════════════════════════════
// ROUTING — INLINED ON PURPOSE. Do not extract this into a module.
//
// It lived in `./routing.ts` for one day and the first deploy failed:
//
//   Failed to bundle the function (reason: Module not found
//   "file:///tmp/user_fn_.../source/routing.ts" at .../source/index.ts:58:8)
//
// The bundler that ran had only `index.ts` in its source directory, so the
// relative import resolved to nothing. `supabase functions deploy` from a repo
// checkout uploads the whole folder and would have worked — but this function is
// deployed by hand, occasionally from a dashboard that takes a single file, and
// a deploy path that works only when invoked the right way is a deploy path that
// will fail again. One file has no such failure mode.
//
// It is written as plain JavaScript inside this .ts file so that
// `registryApiVersioning.test.js` can slice this block out between the markers
// and EVALUATE IT — the real deployed source, not a copy of it. Keeping a second
// copy in a test fixture is the drift this repo already regrets once
// (`webhookSignatureParity`). Do not add TypeScript annotations inside the
// markers; the test evaluates the block as JavaScript.
// ═════════════════════════════════════════════════════════════════════════════

// ─── ROUTING BLOCK START ───
const CURRENT_API_VERSION = 'v1'

/** Every version this deployment still answers. Add to it; never repurpose one. */
const SUPPORTED_API_VERSIONS = ['v1']

/**
 * The Supabase gateway prefixes every request with `/functions/v1/<name>`, so a
 * partner's URL carries two version segments:
 *
 *   https://<ref>.supabase.co/functions/v1/public-registry/v1/?stats=1
 *                                      ^^                  ^^
 *                                      Supabase's gateway  Carbonify's contract
 *
 * Only the second is ours. Reading the gateway's as "the API is versioned" would
 * leave our own response shape frozen by nothing.
 */
const FUNCTION_SEGMENT = 'public-registry'

/**
 * Carbonify API keys are minted as `ck_live_…` by `create_api_key`. Matching on
 * `ck_` leaves room for a future `ck_test_` without reopening this.
 */
const API_KEY_PREFIX = 'ck_'

/**
 * Pull a CARBONIFY API key out of an Authorization header, or return null.
 *
 * The prefix test is not cosmetic, and it was measured on the first deploy:
 *
 *   Authorization: Bearer <supabase anon JWT>  →  401 Invalid or expired API key
 *
 * `supabase-js` attaches that header to every request automatically, and the
 * Supabase gateway wants it too. Treating ANY Bearer token as an API key means an
 * ordinary browser client asking for public registry data is told its key is
 * invalid — having never presented one. The public tier is a transparency claim
 * and cannot be conditional on the caller stripping a header they may not
 * control.
 *
 * Anything that is not `ck_`-prefixed is "no key" (anonymous), never "bad key"
 * (401). Those two answers are very different to a caller: one says "here is the
 * public data", the other says "your credential is wrong".
 *
 * @param {string|null} header
 * @returns {string|null}
 */
function apiKeyFromAuthHeader(header) {
  if (!header) return null
  const match = String(header).match(/^Bearer\s+(.+)$/i)
  if (!match) return null
  const token = match[1].trim()
  return token.indexOf(API_KEY_PREFIX) === 0 ? token : null
}

/**
 * Classify a request path.
 *
 * @param {string} pathname
 * @returns {{kind:'discovery'}
 *          |{kind:'versioned', version:string, resource:string}
 *          |{kind:'unknown_version', received:string}}
 */
function parseRegistryPath(pathname) {
  const segments = String(pathname || '')
    .split('/')
    .filter(Boolean)

  // `indexOf`, not `lastIndexOf`: the first occurrence is the gateway naming the
  // function. Anything after it belongs to us.
  const at = segments.indexOf(FUNCTION_SEGMENT)
  const rest = at === -1 ? segments : segments.slice(at + 1)

  if (rest.length === 0) return { kind: 'discovery' }

  const version = rest[0]
  const resource = rest.slice(1)
  if (!SUPPORTED_API_VERSIONS.includes(version)) {
    return { kind: 'unknown_version', received: version }
  }

  return { kind: 'versioned', version: version, resource: resource.join('/') }
}

/**
 * What the unversioned root returns. Endpoints are listed relative to the
 * versioned base so a reader can concatenate without guessing.
 *
 * This document is the one endpoint with no compatibility promise — it exists to
 * be read once by a human.
 *
 * @param {string} baseUrl
 */
function discoveryDocument(baseUrl) {
  const base = String(baseUrl || '').replace(/\/+$/, '') + '/' + CURRENT_API_VERSION
  return {
    service: 'Carbonify Registry API',
    currentVersion: CURRENT_API_VERSION,
    supportedVersions: SUPPORTED_API_VERSIONS,
    versionedBaseUrl: base,
    note:
      'This root serves no registry data. Call the versioned base so the response ' +
      'shape you integrate against stays stable.',
    endpoints: [
      { method: 'GET', path: base + '/', scope: null, returns: 'validated projects, paginated' },
      {
        method: 'GET',
        path: base + '/?page=1&search=biochar&category=…',
        scope: null,
        returns: 'filtered listing (page is 0-based, page size 20)',
      },
      { method: 'GET', path: base + '/?stats=1', scope: null, returns: 'headline registry stats' },
      {
        method: 'GET',
        path: base + '/?project=<uuid>',
        scope: null,
        returns: 'one validated project',
      },
      {
        method: 'GET',
        path: base + '/?certificate=<serial>',
        scope: 'certificates:read when keyed',
        returns: 'certificate verification',
      },
      {
        method: 'GET',
        path: base + '/?mrv=<uuid>',
        scope: 'mrv:read',
        returns: 'per-project MRV aggregates',
      },
    ],
    authentication:
      'Anonymous for the public tier. White-label partners send Authorization: Bearer ck_live_…',
    documentation:
      'https://github.com/johnlouiecaparoso/carbonify/blob/main/supabase/functions/public-registry/README.md',
  }
}
// ─── ROUTING BLOCK END ───

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

/**
 * A response served under a version prefix. The version is stated in both the
 * body and a header: a partner asserting on one should not have to parse the
 * other, and a proxy that strips headers must not be able to make a v1 response
 * look unversioned.
 */
function versioned(body: Record<string, unknown>, status = 200): Response {
  return json({ ...body, apiVersion: CURRENT_API_VERSION }, status, {
    'X-Carbonify-Api-Version': CURRENT_API_VERSION,
  })
}

function serviceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

/** The raw Authorization header, whichever casing the caller used. */
function bearerToken(req: Request): string | null {
  return apiKeyFromAuthHeader(
    req.headers.get('authorization') || req.headers.get('Authorization'),
  )
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

  // ── Route on version BEFORE serving anything (backlog #50) ───────────────
  // The root answers with discovery and no data: an unversioned path that
  // returns projects is the path partners integrate against, and then the
  // prefix protects nothing.
  const route = parseRegistryPath(url.pathname)

  if (route.kind === 'discovery') {
    return json(discoveryDocument(url.origin + url.pathname.replace(/\/+$/, '')), 200)
  }

  if (route.kind === 'unknown_version') {
    return json(
      {
        error: `Unsupported API version '${route.received}'.`,
        supportedVersions: SUPPORTED_API_VERSIONS,
        currentVersion: CURRENT_API_VERSION,
      },
      404,
    )
  }

  // A path under /v1/ that is not the documented one 404s rather than falling
  // through to the listing — otherwise `/v1/projects` would quietly serve data
  // and become a second, unintended contract.
  if (route.resource !== '') {
    return versioned(
      {
        error: `Unknown endpoint '/${route.version}/${route.resource}'.`,
        hint: 'This API takes query parameters on the version root. See the discovery document.',
      },
      404,
    )
  }

  try {
    // ── MRV aggregates — the scoped partner product ───────────────────────
    const mrvProjectId = url.searchParams.get('mrv')
    if (mrvProjectId) {
      if (!tenant) return versioned({ error: 'This endpoint requires an API key.' }, 401)
      if (!hasScope(tenant, 'mrv:read')) {
        return versioned({ error: 'This API key does not include the mrv:read scope.' }, 403)
      }
      if (!SUPABASE_SERVICE_ROLE_KEY) {
        return versioned({ error: 'MRV endpoint is not configured.' }, 500)
      }

      const { data, error } = await serviceClient().rpc('api_project_mrv_summary', {
        p_project_id: mrvProjectId,
      })
      if (error) return versioned({ error: error.message }, 502)
      // The RPC returns nothing for an unvalidated or absent project — the same
      // answer for both, so this cannot be used to discover unpublished projects.
      if (!data || data.length === 0) return versioned({ error: 'Project not found' }, 404)

      return versioned({ mrv: data[0], tenant: brand })
    }

    // ── Certificate lookup ────────────────────────────────────────────────
    const certificate = url.searchParams.get('certificate')
    if (certificate) {
      if (tenant && !hasScope(tenant, 'certificates:read')) {
        return versioned({ error: 'This API key does not include the certificates:read scope.' }, 403)
      }
      const { data, error } = await supabase.rpc('verify_certificate_public', {
        p_certificate_number: certificate,
      })
      if (error) return versioned({ error: error.message }, 502)
      const record = Array.isArray(data) ? data[0] : data
      if (!record) return versioned({ error: 'Certificate not found', tenant: brand }, 404)
      return versioned({ certificate: record, tenant: brand })
    }

    // ── Headline stats ────────────────────────────────────────────────────
    if (url.searchParams.get('stats')) {
      const { count: projectCount } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'validated')

      return versioned({
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

      if (error) return versioned({ error: error.message }, 502)
      if (!data) return versioned({ error: 'Project not found', tenant: brand }, 404)
      return versioned({ project: data, tenant: brand })
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
    if (error) return versioned({ error: error.message }, 502)

    return versioned({ projects: data || [], page, pageSize: PAGE_SIZE, tenant: brand })
  } catch (err) {
    return versioned({ error: (err as Error)?.message || 'Unexpected error' }, 500)
  }
})
