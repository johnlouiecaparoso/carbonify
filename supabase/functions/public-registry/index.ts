/**
 * Public Registry API (white-label / integration scaffold)
 *
 * A read-only JSON API over the PUBLIC carbon registry — validated projects and
 * headline registry stats. This is the same data the public RegistryView shows;
 * exposing it as a stable JSON endpoint lets partners, LGUs and white-label
 * front-ends pull the registry without the SPA.
 *
 * Deploy:
 *   supabase functions deploy public-registry --no-verify-jwt
 * Then: GET https://YOUR_PROJECT.functions.supabase.co/public-registry
 *
 * Endpoints (method GET):
 *   /public-registry                 → { projects: [...], page, pageSize }
 *   /public-registry?stats=1         → { stats: {...} }
 *   query: search, category, page (0-based)
 *
 * SECURITY / SCOPE (owner decisions before production — see docs/GAP_ANALYSIS.md):
 *   - Uses the ANON key, so Row-Level Security applies: only rows already public
 *     (validated projects) are ever returned. No secrets, no writes.
 *   - No API-key gating or rate limiting yet. Add both (an `api_keys` table +
 *     a per-key quota) before advertising this as a paid/white-label product.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''

const PAGE_SIZE = 20

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Content-Type': 'application/json',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'Registry API is not configured.' }, 500)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  const url = new URL(req.url)

  try {
    // Headline stats.
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
      })
    }

    // Validated-project listing (paginated, optional search/category filter).
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

    return json({ projects: data || [], page, pageSize: PAGE_SIZE })
  } catch (err) {
    return json({ error: (err as Error)?.message || 'Unexpected error' }, 500)
  }
})
