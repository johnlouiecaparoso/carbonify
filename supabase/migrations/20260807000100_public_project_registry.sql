-- ============================================================================
-- Public PROJECT registry — the half of /registry that was never built.
--
-- WHAT IS WRONG TODAY
--   /registry is a certificate lookup. `search_public_registry` (20260626000900)
--   reads `public.certificates`, which denormalises only project_title,
--   project_category and project_location. So the public page can answer "does
--   this certificate exist?" and cannot answer any of the questions a registry
--   exists to answer:
--
--     under what methodology were these credits issued?
--     what stage is the project actually at?
--     what feedstock, at what capacity?
--
--   Every one of those columns exists on `public.projects` and is already
--   rendered on the project's own page. The data was never missing; the public
--   surface simply did not read it. This is why the doc set carries "national
--   biomass registry" as a 🟡 rather than a ✅.
--
-- WHAT THIS DOES
--   Adds `search_public_project_registry` — a project-level companion to the
--   certificate-level search, same shape, same anon grant, same SECURITY DEFINER
--   posture and the same "safe fields only" rule.
--
-- VALIDATED PROJECTS ONLY, AND THAT IS THE POINT
--   The filter is `status = 'validated'`. A registry publishes what has been
--   through validation; a draft is the developer's private workspace and a
--   submitted project is a decision that has not been taken yet. Publishing
--   either would assert something untrue about them.
--
--   This also does real work for DEFERRED_BACKLOG #41. Today anon can read every
--   row of `public.projects` directly, drafts included, and #41 is open because
--   narrowing that read could empty a public screen — the registry among them.
--   Once the public page reads through this function instead of the table, the
--   registry stops depending on the permissive policy, which removes one of the
--   read paths that has to be checked before #41 can be closed. It does not close
--   #41 by itself: the marketplace and project-detail pages still read the table.
--
-- WHAT IS DELIBERATELY NOT RETURNED
--   `user_id` and every developer-identity field — the registry describes
--   projects, not people, and `profiles` PII is not this function's to publish.
--   `capex`, `opex`, `funding_target`, `funding_raised` — commercially sensitive
--   and belong to the Investor Portal, which is gated.
--   `feasibility_score`, `social_impact_score`, `climate_risk_rating` — internal
--   assessments. Publishing a score anonymously invites it to be read as a
--   rating Carbonify stands behind, which is a claim nobody has agreed to make.
--   `verification_notes` — reviewer working notes, never public.
--
-- COLUMN NAMES WERE MEASURED, NOT ASSUMED
--   `project_credits` on live carries `credits_available` / `credits_sold`,
--   while 20260604010100 writes `available_credits`. The live names are used
--   here, read off the running database rather than off a migration. Summed and
--   grouped because a project can hold more than one pool row — 20260626000300
--   backfilled one set and the mint-on-VER trigger tops up another.
--
-- SAFE TO RE-RUN. Creates one function, no data, no policy changes. It
-- supersedes nothing, so it carries no replay guard: there is no older
-- definition of this name for a replay to revert.
-- ============================================================================

create or replace function public.search_public_project_registry(
  p_search      text default null,
  p_category    text default null,
  p_methodology text default null,
  p_limit       int  default 25,
  p_offset      int  default 0
)
returns table (
  project_id         uuid,
  title              text,
  category           text,
  location           text,
  municipality       text,
  methodology        text,
  development_status text,
  feedstock          text,
  capacity           numeric,
  capacity_unit      text,
  vintage            text,
  estimated_credits  numeric,
  credits_issued     numeric,
  credits_available  numeric,
  validated_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id::uuid,
    p.title::text,
    p.category::text,
    p.location::text,
    p.municipality::text,
    p.methodology::text,
    p.development_status::text,
    p.feedstock::text,
    p.capacity::numeric,
    p.capacity_unit::text,
    p.vintage::text,
    p.estimated_credits::numeric,
    coalesce(pool.total_credits, 0)::numeric,
    coalesce(pool.credits_available, 0)::numeric,
    p.verified_at::timestamptz
  from public.projects p
  -- Aggregated, not joined row-for-row: more than one pool row per project is
  -- normal, and a plain join would duplicate the project once per pool.
  left join lateral (
    select
      sum(coalesce(pc.total_credits, 0))    as total_credits,
      sum(coalesce(pc.credits_available, 0)) as credits_available
    from public.project_credits pc
    where pc.project_id = p.id
  ) pool on true
  where p.status = 'validated'
    and (
      p_search is null or btrim(p_search) = ''
      or p.title ilike '%' || p_search || '%'
      or p.location ilike '%' || p_search || '%'
      or p.municipality ilike '%' || p_search || '%'
      or p.feedstock ilike '%' || p_search || '%'
    )
    and (p_category is null or btrim(p_category) = '' or p.category = p_category)
    and (p_methodology is null or btrim(p_methodology) = '' or p.methodology = p_methodology)
  order by p.verified_at desc nulls last, p.created_at desc
  limit greatest(least(coalesce(p_limit, 25), 100), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Revoke from `anon` as well as PUBLIC, then grant it back deliberately.
--
-- This looks redundant and is not. Supabase's default privileges grant EXECUTE
-- to `anon` EXPLICITLY on functions created in `public`, and `revoke … from
-- public` removes only the implicit PUBLIC grant — it leaves the explicit one
-- standing. Three functions were live and anon-callable on 2026-08-05 for
-- exactly that reason, while the ratchet asserting a revoke existed stayed
-- green. Stripping both and re-granting means anon's access here is a decision
-- recorded in this file rather than a default nobody chose.
revoke all on function public.search_public_project_registry(text, text, text, int, int)
  from public, anon;
grant execute on function public.search_public_project_registry(text, text, text, int, int)
  to anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFY — paste this on its own after applying. Expect 4 PASS rows.
--
-- select 'function exists' as check,
--        case when to_regprocedure(
--               'public.search_public_project_registry(text,text,text,int,int)'
--             ) is not null then 'PASS' else 'FAIL' end as verdict
-- union all
-- select 'anon may execute',
--        case when has_function_privilege('anon',
--               'public.search_public_project_registry(text,text,text,int,int)', 'EXECUTE')
--             then 'PASS' else 'FAIL' end
-- union all
-- select 'PUBLIC may not',
--        case when has_function_privilege('public',
--               'public.search_public_project_registry(text,text,text,int,int)', 'EXECUTE')
--             then 'FAIL' else 'PASS' end
-- union all
-- -- The one that matters: no unvalidated project may appear. Compares what the
-- -- function returns against what the table holds. A vacuous pass is reported as
-- -- UNPROVEN rather than PASS — with no draft rows on the database, "no drafts
-- -- leaked" is not evidence of anything.
-- select 'only validated projects',
--        case
--          when (select count(*) from public.projects where status <> 'validated') = 0
--            then 'UNPROVEN — no unvalidated rows exist to leak'
--          when (select count(*) from public.search_public_project_registry(null,null,null,100,0) r
--                join public.projects p on p.id = r.project_id
--                where p.status <> 'validated') = 0
--            then 'PASS'
--          else 'FAIL'
--        end;
--
-- BEHAVIOURAL CHECK — the SQL above proves the grant and the filter. It does not
-- prove the page works signed out, which is the whole point of a public
-- registry. In a private window, with no session: open /registry, switch to the
-- Projects tab, and confirm rows render with a methodology and a stage. An empty
-- Projects tab beside a populated Certificates tab means the anon grant did not
-- take — re-run the second VERIFY row.
-- ============================================================================
