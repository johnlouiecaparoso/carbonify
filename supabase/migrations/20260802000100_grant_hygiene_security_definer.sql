-- ============================================================================
-- Grant hygiene on the SECURITY DEFINER surface — DEFERRED_BACKLOG #12.
--
-- THE DEFECT
-- Postgres grants EXECUTE to PUBLIC on every new function. A SECURITY DEFINER
-- function that is then `grant execute … to authenticated` is therefore ALSO
-- callable by `anon`, because nothing ever removed the default. The financial
-- RPCs already revoke first (`record_aml_screening`, `retire_credits_atomic`,
-- `refund_purchase`, and the 2026-08-01 counterparty function); most of the
-- rest never did.
--
-- THE COUNT WAS WRONG, AND THAT IS THE FIRST FINDING
-- The backlog says "~10 RPCs". Measured against `supabase/migrations/`:
-- **89 SECURITY DEFINER functions, 39 with no revoke anywhere** — 15 of them
-- trigger functions and 24 callable. The same correction #30 needed when its
-- hand-count was replaced by a script, and #27 when its estimate was replaced
-- by a measurement. A number in this backlog is a starting point, not a finding.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH: THE 15 TRIGGER FUNCTIONS
-- A function returning `trigger` takes no arguments and cannot be invoked by a
-- client: PostgREST will not expose the `trigger` return type, and a direct
-- call raises `trigger functions can only be called as trigger triggers`. The
-- PUBLIC grant on them is not a reachable surface, and the runtime privilege
-- semantics of trigger execution are not worth risking a table-wide INSERT
-- failure to tidy. The loop below skips them structurally rather than by list,
-- so this cannot be got wrong by editing the names.
--
-- WHY THE ROLES DIFFER PER FUNCTION, AND HOW THEY WERE DETERMINED
-- Not measured, not applied. Each group below was established by reading the
-- call sites:
--
--   * RLS POLICY HELPERS (is_admin, is_lgu, is_mrv_staff, is_verifier_or_admin,
--     owns_project, owns_report_project, current_user_role) appear inside
--     `create policy` expressions — 13 files for is_admin alone. A policy
--     expression is evaluated as the QUERYING role, so anon must keep EXECUTE
--     or an anonymous read of any table whose policy calls one of these starts
--     failing with `permission denied for function`. These are granted to all
--     three real roles: **this changes nobody's access.** Its value is that an
--     implicit default becomes an explicit, reviewable grant, so a role added
--     to this database later does not silently inherit EXECUTE on `is_admin()`.
--
--   * INTERNAL HELPERS (get_setting, insert_system_notification, current_plan)
--     are called only from other SECURITY DEFINER functions, which execute as
--     the owner and so do not consult the caller's privileges. Verified: every
--     call site of `get_setting` (assert_can_trade, check_velocity_limit,
--     process_marketplace_purchase, process_wallet_purchase) and of
--     `insert_system_notification` (the four notify_* triggers) is itself
--     SECURITY DEFINER, and none of the three appears in a policy or is called
--     by the frontend. They get a revoke and no grant — the real hygiene win.
--
--   * CLIENT RPCs are called from `src/` as a signed-in user and by no edge
--     function (all 11 edge-function RPC calls were listed and none of them is
--     in this set), so `authenticated` is the whole requirement and anon is
--     removed.
--
--   * PUBLIC-BY-DESIGN reads (the registry lookup, the two stats endpoints,
--     certificate verification) keep anon ON PURPOSE — /registry and
--     /verify work signed out, which is the point of them.
--
-- Not exploitable today: each of these self-gates on `is_admin()` or
-- `auth.uid()`, and an anon caller fails that check. This closes the gap
-- between "safe because the body checks" and "safe because you cannot call it",
-- which is the difference the router-guard bypass on 2026-07-31 turned on.
--
-- Idempotent and additive. No function is redefined, no policy is touched, no
-- table is altered. Safe to re-run.
-- ============================================================================

do $$
declare
  -- name, then the roles that must retain EXECUTE. An empty array means the
  -- function is reachable only from other SECURITY DEFINER code.
  v_targets constant text[][] := array[
    -- ── RLS policy helpers: evaluated as the querying role ────────────────
    -- Behaviour-preserving by construction. See the header.
    ['is_admin',                         'anon,authenticated,service_role'],
    ['is_lgu',                           'anon,authenticated,service_role'],
    ['is_mrv_staff',                     'anon,authenticated,service_role'],
    ['is_verifier_or_admin',             'anon,authenticated,service_role'],
    ['owns_project',                     'anon,authenticated,service_role'],
    ['owns_report_project',              'anon,authenticated,service_role'],
    ['current_user_role',                'anon,authenticated,service_role'],

    -- ── Internal helpers: SECURITY DEFINER callers run as the owner ───────
    ['get_setting',                      ''],
    ['insert_system_notification',       ''],
    ['current_plan',                     ''],

    -- ── Suspension checks: already granted, never revoked. Drops anon. ────
    ['is_suspended',                     'authenticated,service_role'],
    ['assert_not_suspended',             'authenticated,service_role'],

    -- ── Client RPCs: a signed-in user, and nothing else ───────────────────
    ['calculate_report_vers',            'authenticated'],
    ['cancel_data_subject_request',      'authenticated'],
    ['submit_data_subject_request',      'authenticated'],
    ['open_dispute',                     'authenticated'],
    ['resolve_dispute',                  'authenticated'],
    ['resolve_notification_recipient_ids', 'authenticated'],
    ['review_kyb_application',           'authenticated'],
    ['review_kyc_application',           'authenticated'],

    -- ── Public by design: these must keep anon ────────────────────────────
    ['public_market_stats',              'anon,authenticated'],
    ['public_registry_stats',            'anon,authenticated'],
    ['search_public_registry',           'anon,authenticated'],
    ['verify_certificate_public',        'anon,authenticated']
  ];
  v_name  text;
  v_roles text;
  v_fn    record;
  v_done  int := 0;   -- total overloads changed
  v_here  int;        -- overloads found for the CURRENT name
  v_miss  int := 0;   -- names that resolved to nothing
begin
  for i in 1 .. array_length(v_targets, 1) loop
    v_name  := v_targets[i][1];
    v_roles := v_targets[i][2];
    v_here  := 0;

    -- Resolve the signature from the catalog rather than writing it out. This
    -- repo has overloads (review_kyc_application was redefined by
    -- 20260718000400), and a hand-written argument list that does not match is
    -- a migration that succeeds while changing nothing — the failure mode the
    -- 2026-07-31 safe-area CSS rule had, one layer down.
    for v_fn in
      -- Built schema-qualified from the catalog. `oid::regprocedure` would
      -- render unqualified whenever public is on the search_path, which is a
      -- silent dependency on the session that runs this file.
      select format('public.%I(%s)', p.proname,
                    pg_get_function_identity_arguments(p.oid)) as sig
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname = v_name
         and p.prosecdef                                  -- SECURITY DEFINER only
         and p.prorettype <> 'pg_catalog.trigger'::regtype -- never a trigger fn
    loop
      execute format('revoke all on function %s from public', v_fn.sig);
      -- Revoking PUBLIC does not remove an EXPLICIT grant to anon, and some of
      -- these were granted directly over the months. `record_aml_screening`
      -- already writes `from public, anon` by hand for this reason; do the same
      -- wherever anon is not in the intended set.
      if position('anon' in v_roles) = 0 then
        execute format('revoke all on function %s from anon', v_fn.sig);
      end if;
      if v_roles <> '' then
        execute format('grant execute on function %s to %s', v_fn.sig, v_roles);
      end if;
      v_here := v_here + 1;
      v_done := v_done + 1;
    end loop;

    if v_here = 0 then
      -- A name that resolves to nothing is not an error: this repo's migration
      -- history runs ahead of some environments. Say so rather than failing —
      -- but say it, because a silent no-op is how a migration comes to be
      -- believed applied when it changed nothing.
      v_miss := v_miss + 1;
      raise notice 'grant-hygiene: no SECURITY DEFINER function named % — skipped', v_name;
    end if;
  end loop;

  raise notice 'grant-hygiene: % function(s) revoked from PUBLIC, % name(s) not found',
    v_done, v_miss;

  -- 24 names are listed. If NONE of them resolved, this database is not the one
  -- these migrations describe and a silent success would be the wrong answer.
  if v_done = 0 then
    raise exception 'grant-hygiene: not one named function was found — wrong database or schema?';
  end if;
end
$$;

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFY — run after applying. Every row must read PASS.
-- ============================================================================
-- -- 1. No function this migration names still carries a PUBLIC execute grant.
-- --    grantee 0 is PUBLIC in aclexplode().
-- select
--   'no PUBLIC execute on the 24 named functions' as check,
--   case when count(*) = 0 then 'PASS' else 'FAIL: ' || string_agg(sig, ', ') end as verdict
-- from (
--   select p.oid::regprocedure::text as sig
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--     cross join lateral aclexplode(p.proacl) a
--    where n.nspname = 'public'
--      and p.prosecdef
--      and a.grantee = 0
--      and a.privilege_type = 'EXECUTE'
--      and p.proname in (
--        'is_admin','is_lgu','is_mrv_staff','is_verifier_or_admin','owns_project',
--        'owns_report_project','current_user_role','get_setting',
--        'insert_system_notification','current_plan','is_suspended',
--        'assert_not_suspended','calculate_report_vers','cancel_data_subject_request',
--        'submit_data_subject_request','open_dispute','resolve_dispute',
--        'resolve_notification_recipient_ids','review_kyb_application',
--        'review_kyc_application','public_market_stats','public_registry_stats',
--        'search_public_registry','verify_certificate_public')
-- ) x
-- union all
-- -- 2. The admin RPCs are NOT callable by anon. This is the point of the change.
-- select
--   'anon cannot execute the admin RPCs',
--   case when bool_or(has_function_privilege('anon', oid, 'execute')) then 'FAIL' else 'PASS' end
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('review_kyc_application','review_kyb_application','resolve_dispute')
-- union all
-- -- 3. …and the public reads still ARE. A revoke that closed /registry to
-- --    signed-out visitors would be a regression, not a fix.
-- select
--   'anon can still execute the public registry reads',
--   case when bool_and(has_function_privilege('anon', oid, 'execute')) then 'PASS' else 'FAIL' end
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('search_public_registry','public_registry_stats',
--                      'public_market_stats','verify_certificate_public')
-- union all
-- -- 4. authenticated kept everything it needs.
-- select
--   'authenticated can still execute the client RPCs',
--   case when bool_and(has_function_privilege('authenticated', oid, 'execute')) then 'PASS' else 'FAIL' end
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('open_dispute','submit_data_subject_request',
--                      'calculate_report_vers','retire_credits_atomic')
-- union all
-- -- 5. The RLS helpers are still executable by anon, or every anonymous read of
-- --    a table whose policy calls one of them breaks. This row is the reason the
-- --    helpers are granted rather than merely revoked.
-- select
--   'anon can still execute the RLS policy helpers',
--   case when bool_and(has_function_privilege('anon', oid, 'execute')) then 'PASS' else 'FAIL' end
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public'
--    and p.proname in ('is_admin','is_lgu','is_mrv_staff','current_user_role')
-- union all
-- -- 6. No trigger function was touched.
-- select
--   'trigger functions untouched (still PUBLIC-executable)',
--   case when count(*) > 0 then 'PASS' else 'FAIL' end
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
--  where n.nspname = 'public'
--    and p.prorettype = 'pg_catalog.trigger'::regtype
--    and a.grantee = 0 and a.privilege_type = 'EXECUTE';
--
-- ----------------------------------------------------------------------------
-- The remaining count, for whoever picks this up next: run this to see every
-- SECURITY DEFINER function that STILL has a PUBLIC execute grant. After this
-- migration the answer should be the trigger functions and nothing else.
-- ----------------------------------------------------------------------------
-- select p.oid::regprocedure as still_public,
--        (p.prorettype = 'pg_catalog.trigger'::regtype) as is_trigger_fn
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
--  where n.nspname = 'public' and p.prosecdef
--    and a.grantee = 0 and a.privilege_type = 'EXECUTE'
--  order by is_trigger_fn desc, still_public::text;
