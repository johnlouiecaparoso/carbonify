-- ============================================================================
-- Pin search_path on the legacy functions, and take anon off get_email_stats.
--
-- WHAT IS WRONG TODAY
--   The advisor reports 25 functions in `public` with a role-mutable
--   search_path. A function without a pinned search_path resolves unqualified
--   names using whatever search_path the CALLER has set. For a SECURITY DEFINER
--   function that is a privilege-escalation primitive: an attacker who can
--   create an object in a schema that sorts ahead of `public` gets their
--   version called with the owner's rights.
--
--   Exploitability here is LOW, not zero. It needs CREATE on some schema in the
--   path, which Supabase revokes from anon/authenticated by default. What makes
--   it worth closing anyway is which functions these are:
--     create_credit_ownership_on_completion
--     complete_credit_transaction
--     create_project_credits_on_approval
--     generate_project_credits
--   — issuance and ownership of carbon credits, i.e. the things that are worth
--   money. The fix is free and changes no behaviour, so the risk calculus is
--   one-sided.
--
--   All 25 predate version control. Migrations written since set search_path as
--   a matter of course (73 files do), so this is the untracked tail, and one
--   more instance of DEFERRED_BACKLOG #16.
--
-- WHY THIS LOOPS INSTEAD OF LISTING 25 NAMES
--   Same reasoning as 20260802000100: the loop below selects exactly the set
--   the advisor's lint selects — functions in `public`, not owned by an
--   extension, with no search_path in proconfig. It cannot drift from the
--   advisor's list, and it cannot be got wrong by mistyping a name. Re-running
--   it after someone adds an unpinned function fixes that one too.
--
--   EXTENSION-OWNED FUNCTIONS ARE EXCLUDED STRUCTURALLY (pg_depend deptype 'e').
--   pgcrypto, uuid-ossp and friends install functions into a schema and manage
--   them; altering those is not ours to do and can break an extension upgrade.
--
-- WHY `public, extensions, pg_temp` AND NOT `''`
--   Supabase's own guidance is `set search_path = ''` with every name fully
--   qualified. That is stricter and it is the right answer for functions you
--   are writing today. It is the WRONG answer to retrofit onto 25 function
--   bodies that are not in this repo and cannot be read from it: any of them
--   calling gen_random_uuid() or a pgcrypto helper unqualified would break
--   instantly, and these include the credit-issuance triggers.
--
--   `public, extensions, pg_temp` keeps every name that resolves today
--   resolving tomorrow — Supabase installs extensions into `extensions`, and
--   neither schema is writable by anon or authenticated — while removing the
--   caller's ability to inject a schema ahead of them. Trailing pg_temp is
--   what stops a temp-table shadow, which is the actual attack.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: the anon-executable helpers
--   The advisor also warns that is_admin(), is_lgu(), is_mrv_staff() and
--   current_user_role() are callable by anon. Leave them. They are called from
--   inside RLS policy expressions, which evaluate as the QUERYING role, so
--   revoking anon's EXECUTE makes anonymous reads of every table carrying such
--   a policy fail with "permission denied for function". Probed on live
--   2026-08-05: all four return false/null to anon and leak nothing. This is
--   the same conclusion 20260802000100 reached and wrote down.
--
--   The ~15 trigger functions in that same warning list are not reachable at
--   all. Probed on live: activate_validated_project_trigger, handle_new_user,
--   guard_ver_self_approval and enforce_listing_limit each return PGRST202 —
--   PostgREST does not expose a function returning `trigger`. No action needed
--   and none taken.
--
--   get_email_stats is the exception, and it is handled below.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §PRE-FLIGHT — run this FIRST to see exactly what will be altered.
--
--   select p.oid::regprocedure as function_signature,
--          p.prosecdef          as is_security_definer
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.prokind = 'f'
--      and not exists (select 1 from pg_depend d
--                       where d.objid = p.oid and d.deptype = 'e')
--      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}'))  cfg
--                       where cfg like 'search_path=%')
--    order by p.prosecdef desc, 1;
--
-- Expected: the 25 the advisor named. If the list is much longer, read it
-- before applying — something untracked has been added since.
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  fn        record;
  n_altered int := 0;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and not exists (select 1 from pg_depend d
                        where d.objid = p.oid and d.deptype = 'e')
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
                        where cfg like 'search_path=%')
     order by 1
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', fn.sig);
    n_altered := n_altered + 1;
    raise notice 'search_path pinned: %', fn.sig;
  end loop;

  raise notice 'search_path pinned on % function(s).', n_altered;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_email_stats: a reporting RPC that anon can call.
--
-- Probed on live 2026-08-05 while signed out: POST /rest/v1/rpc/get_email_stats
-- returned 200 with a stats row (all zeros today, because email_logs is empty —
-- that is a fact about the data, not about the permission).
--
-- Unlike the policy helpers above, this one appears in no RLS policy, so
-- removing anon costs nothing. Left callable by `authenticated` because the
-- function's own body is not in this repo and may or may not gate on is_admin();
-- narrowing it to admins is a body change, not a grant change —
-- DEFERRED_BACKLOG #44.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'get_email_stats'
  loop
    execute format('revoke all on function %s from public, anon', fn.sig);
    execute format('grant execute on function %s to authenticated, service_role', fn.sig);
    raise notice 'anon revoked: %', fn.sig;
  end loop;
end
$$;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--
--   (1) Re-run the §PRE-FLIGHT query. Expected: zero rows.
--
--   (2) SIGNED OUT, anon key:
--         POST /rest/v1/rpc/get_email_stats -> 401/42501 permission denied
--       (was 200 with a stats row)
--
--   (3) The credit-issuance path is the one that matters here, because the
--       loop touched its trigger functions. Approve a monitoring report's VERs
--       as a verifier and confirm credits are still minted into project_credits
--       and the pool becomes available.
--
--   (4) Sign up a new user — handle_new_user / handle_new_auth_user were both
--       in the altered set — and confirm the profile row is still created.
--
--   (5) Anonymous browsing of the marketplace and /registry still works; this
--       proves the policy helpers were left alone as intended.
--
-- ROLLBACK (per function, if one of them turns out to need a wider path):
--   alter function public.<name>(<args>) reset search_path;
-- ============================================================================
