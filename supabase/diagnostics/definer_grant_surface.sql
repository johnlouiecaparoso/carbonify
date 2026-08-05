-- ============================================================================
-- Who can call the SECURITY DEFINER surface? Run as service_role in the SQL
-- editor. Read-only — every query here is a SELECT.
--
-- WHY THIS EXISTS
--   The 2026-08-05 advisor sweep produced ~50 "can be executed by anon /
--   authenticated" warnings. Almost all of them are correct by design, and the
--   two that were not could not be told apart from the outside:
--
--     * REST probing cannot distinguish "anon lacks EXECUTE" from "the argument
--       cast failed first" — both can surface as an error that is not 42501.
--     * The only probe that IS conclusive from outside is one that actually
--       runs the function. For a writer, that means writing a row. Two junk
--       rows went into audit_logs learning this.
--
--   `has_function_privilege` answers it exactly, from inside, without calling
--   anything. Prefer this file over probing whenever you have SQL access.
--
--   It also catches the specific mistake that let a hole sit for three weeks:
--   20260703000400 revoked anon from `retire_credits_atomic(uuid, uuid,
--   numeric)`, 20260718000000 added a `(uuid, uuid, numeric, text)` overload and
--   never revoked it, and 20260802000100's audit matched on the NAME and
--   declared it done. Query A reports signatures, never bare names.
-- ============================================================================


-- ── A. The whole anon-executable SECURITY DEFINER surface, classified ───────
--
-- `verdict` encodes the standing decisions from 20260802000100 and
-- 20260805001000. Anything landing in REVIEW is not yet accounted for and is
-- the reason to run this file.
select
  p.oid::regprocedure as signature,
  l.lanname           as language,
  case
    when pg_get_function_result(p.oid) = 'trigger'
      then 'OK — trigger fn, PostgREST cannot expose it'
    when p.proname in ('is_admin', 'is_lgu', 'is_mrv_staff', 'is_verifier',
                       'is_verifier_or_admin', 'current_user_role',
                       'owns_project', 'owns_report_project',
                       'canonicalize_notification_role')
      then 'OK — RLS policy helper, anon EXECUTE is REQUIRED'
    when p.proname in ('public_market_stats', 'public_registry_stats',
                       'public_price_history', 'project_price_history',
                       'search_public_registry', 'verify_certificate_public')
      then 'OK — public by design (/registry, /verify work signed out)'
    when p.proname in ('get_user_role')
      then 'KNOWN — role enumeration, DEFERRED_BACKLOG #45'
    else 'REVIEW — not on any accepted list'
  end as verdict
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language  l on l.oid = p.prolang
where n.nspname = 'public'
  and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by
  case when pg_get_function_result(p.oid) = 'trigger' then 2 else 1 end,
  p.proname;


-- ── B. Anon-executable functions that WRITE ────────────────────────────────
--
-- The subset that actually matters. A SECURITY DEFINER function executes as its
-- owner, so RLS on the tables it writes does not apply to it — an anon-callable
-- writer is a hole straight through every policy you have.
--
-- provolatile 'v' = VOLATILE, which is what Postgres marks anything that can
-- modify data. Read-only reporting functions are STABLE ('s') or IMMUTABLE
-- ('i') and will not appear here.
--
-- Expected after 20260805001000: no rows outside the trigger functions.
select
  p.oid::regprocedure as signature,
  pg_get_function_result(p.oid) as returns
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and p.provolatile = 'v'
  and pg_get_function_result(p.oid) <> 'trigger'
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by p.proname;


-- ── C. Functions with more than one signature ──────────────────────────────
--
-- Overload sets are where per-name grant audits go wrong. If two rows for the
-- same name disagree in anon_can, one of them was revoked and the other was
-- forgotten — that is exactly the retire_credits_atomic defect.
select
  p.proname,
  p.oid::regprocedure as signature,
  p.prosecdef         as security_definer,
  has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_can,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    select p2.proname
      from pg_proc p2
      join pg_namespace n2 on n2.oid = p2.pronamespace
     where n2.nspname = 'public'
     group by p2.proname
    having count(*) > 1
  )
order by p.proname, signature;


-- ── D. SECURITY DEFINER functions with no pinned search_path ───────────────
--
-- Should be empty after 20260805000800. A non-empty result means something
-- untracked has been added since, or that migration has not been applied.
select p.oid::regprocedure as signature
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind = 'f'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                   where cfg like 'search_path=%')
order by 1;


-- ── E. Every always-true write policy, anywhere ────────────────────────────
--
-- The 2026-08-05 lesson in one query: the worst finding of that sweep was a
-- WARN-level `USING (true)` on public.projects that let a signed-out stranger
-- delete the registry, while four ERROR-level findings were empty tables.
-- SELECT policies are excluded — public read is a legitimate pattern.
--
-- Expected after 20260805000400 and 20260805000600: zero rows.
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and cmd <> 'SELECT'
  and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true')
order by tablename, policyname;


-- ── F. Tables exposed to PostgREST with RLS off ────────────────────────────
--
-- Expected: zero rows. Anything here is readable by anyone holding the
-- publishable anon key.
select c.relname as table_name,
       (select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'r'
  and not c.relrowsecurity
order by 1;


-- ── G. Views that still run as their owner ─────────────────────────────────
--
-- A view without security_invoker reads its base tables with RLS bypassed.
-- Expected after 20260805000500: zero rows.
select c.relname as view_name,
       pg_get_userbyid(c.relowner) as owner,
       c.reloptions
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relkind = 'v'
  and (c.reloptions is null
       or not exists (select 1 from unnest(c.reloptions) o
                       where o = 'security_invoker=on' or o = 'security_invoker=true'))
order by 1;
