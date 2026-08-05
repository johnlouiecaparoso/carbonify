-- ============================================================================
-- The project review conversation can name who is speaking.
--
-- DEFERRED_BACKLOG #39. Third in the family after 20260801000100 (receipts, #3)
-- and 20260805000100 (asset ledger). Same problem, same shape of fix, found the
-- same way — by measuring instead of reading.
--
-- HOW THIS WAS FOUND
-- `staff_profile_reads.sql`, run 2026-08-05, measured the profiles read posture
-- per staff role:
--
--     admin     FULL          6 of 6 other profile rows readable
--     verifier  *** NONE ***  0 of 6
--
-- with the own-row control passing for both, so the impersonation was real. The
-- admin consoles were never affected. **The verifier console was.**
--
-- WHAT IT BREAKS TODAY
-- `listProjectComments` embeds `profiles:author_id (full_name)` and falls back to
-- the literal string 'User'. `ProjectCommentThread` renders that. The thread is
-- mounted inside `ProjectApprovalPanel`, which is what `/verifier` shows.
--
-- So on the screen where a verifier asks a developer for more evidence before
-- approving credits into existence, EVERY message from the other party is
-- attributed to "User". It is symmetric: the developer's own view of the same
-- thread shows the verifier's replies as "User" too, because a general user
-- reads 0 of 6 foreign rows as well. Each side sees its own name and an
-- anonymous counterparty.
--
-- And it is silent, for the reason this repo has now recorded five times: RLS
-- FILTERS the embed rather than erroring, so `error` is null, the service's
-- throw never fires, and the fallback string looks like a deliberate default.
--
-- WHY NOT JUST WIDEN THE PROFILES POLICY
-- Because the same measurement proves the current posture is doing its job:
-- probes 9 and 10 of the negative suite show a general user can read 0 of 6
-- foreign profile rows, i.e. there is no user directory. That is worth keeping.
--
-- SCOPE — deliberately the thread, not the person
-- Takes a project id and returns names for the authors of comments ON THAT
-- PROJECT, and only to a caller who may read that thread. The authorisation
-- mirrors `project_comments_select` (20260615000100) exactly:
--
--     is_verifier_or_admin()  OR  owns_project(p_project_id)
--
-- Both helpers are TRACKED in migrations, deliberately: backlog #40 records that
-- `is_admin(uuid)` and `is_verifier(uuid)` exist only on live, and this file must
-- not add to that. `20260804000500` made the same choice.
--
-- WHAT IT DELIBERATELY DOES NOT RETURN
-- No email, no role, no kyc_level. A conversation needs a name. Note the DEAD
-- `getPendingProjects` in projectApprovalService returns 'unknown@example.com'
-- as a fallback email — a fabricated, plausible-looking value rendered as fact,
-- which is the 2026-08-02 analytics-placeholder finding in another costume. It
-- is unreachable today and is not reproduced here.
--
-- Additive + idempotent. Safe to re-run. No table altered, no policy changed.
-- ============================================================================

create or replace function public.get_project_comment_author_names(
  p_project_id uuid
)
returns table (
  author_id    uuid,
  display_name text
)
language plpgsql
security definer
-- Pin the search path: a SECURITY DEFINER function resolving unqualified names
-- through the caller's search_path is the classic privilege-escalation footgun.
set search_path = public, pg_temp
as $$
begin
  -- Never derive identity from an argument; the caller is auth.uid(). Both
  -- helpers below read it themselves.
  if auth.uid() is null or p_project_id is null then
    return;
  end if;

  -- The authorisation check, mirroring project_comments_select. A caller who
  -- cannot read the thread gets zero rows rather than an error, so this is not
  -- an existence oracle for projects either.
  if not (public.is_verifier_or_admin() or public.owns_project(p_project_id)) then
    return;
  end if;

  return query
    select distinct
           p.id,
           coalesce(nullif(btrim(p.full_name), ''), 'Carbonify user')
      from public.project_comments c
      join public.profiles p on p.id = c.author_id
     where c.project_id = p_project_id;
end;
$$;

-- Grant hygiene, per DEFERRED_BACKLOG #12: revoke the implicit PUBLIC EXECUTE
-- Postgres grants on every new function BEFORE granting to authenticated.
revoke all on function public.get_project_comment_author_names(uuid) from public;
grant execute on function public.get_project_comment_author_names(uuid) to authenticated;

comment on function public.get_project_comment_author_names(uuid) is
  'Display names of the people who have commented on a project, for the review '
  'thread. Name only — never email, role or kyc_level. Authorisation mirrors '
  'project_comments_select: verifier/admin, or the project owner. Zero rows for '
  'anyone else, so it is neither a directory nor an existence oracle.';

-- ============================================================================
-- VERIFY — run after applying. Every row must read PASS.
-- ============================================================================
-- select
--   'function exists' as check,
--   case when to_regprocedure('public.get_project_comment_author_names(uuid)') is not null
--        then 'PASS' else 'FAIL' end as verdict
-- union all
-- select
--   'is SECURITY DEFINER',
--   case when p.prosecdef then 'PASS' else 'FAIL' end
--   from pg_proc p
--   where p.oid = 'public.get_project_comment_author_names(uuid)'::regprocedure
-- union all
-- select
--   'search_path is pinned',
--   case when array_to_string(p.proconfig, ',') like '%search_path%'
--        then 'PASS' else 'FAIL' end
--   from pg_proc p
--   where p.oid = 'public.get_project_comment_author_names(uuid)'::regprocedure
-- union all
-- select
--   'PUBLIC cannot execute (only authenticated)',
--   case when has_function_privilege('public', 'public.get_project_comment_author_names(uuid)', 'execute')
--        then 'FAIL' else 'PASS' end
-- union all
-- select
--   'profiles SELECT policy count unchanged (this migration must not touch it)',
--   case when count(*) > 0 then 'PASS' else 'FAIL' end
--   from pg_policies where tablename = 'profiles' and cmd = 'SELECT';
--
-- Behavioural check — re-run staff_profile_reads.sql afterwards. It must be
-- UNCHANGED (verifier still *** NONE ***): this migration adds a function and
-- must not have widened the table.
