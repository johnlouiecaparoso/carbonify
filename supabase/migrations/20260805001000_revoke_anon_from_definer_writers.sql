-- ============================================================================
-- Close the SECURITY DEFINER back door into audit_logs, and finish the revoke
-- that 20260703000400 started.
--
-- ⚠️ THIS IS THE ONE REAL HOLE LEFT IN THE 2026-08-05 ADVISOR SWEEP, and it
--    partially UNDOES 20260805000600. Apply it.
--
-- WHAT IS WRONG TODAY — PROVEN, NOT INFERRED
--   20260805000600 restricted INSERT on public.audit_logs to
--   `user_id = auth.uid()`, so an anonymous caller can no longer write to the
--   table directly. It can still write to it INDIRECTLY. Three legacy
--   SECURITY DEFINER functions accept the write and perform it as their owner,
--   and RLS does not apply to a table's owner:
--
--     public.log_user_action(p_action text, p_resource_type text,
--                            p_resource_id text, p_old_values jsonb,
--                            p_new_values jsonb, p_metadata jsonb)
--     public.log_system_event(… same shape …)
--     public.log_email_sent(p_user_id uuid, p_email_type text, …)
--
--   Demonstrated on live 2026-08-05, SIGNED OUT with the anon key. Both of
--   these returned 200 and the uuid of the row they had just inserted:
--
--     POST /rest/v1/rpc/log_user_action   -> "7015a427-3077-4e8c-8581-f5b2738242bc"
--     POST /rest/v1/rpc/log_system_event  -> "05eeae5c-4719-48f6-a87b-7e957010f33f"
--
--   (Both probe rows were deleted afterwards. They were written by accident
--   during a probe intended to fail on a cast — a bare JSON string is valid
--   `jsonb`, so the body ran. The accident is the proof.)
--
--   So an anonymous stranger can still forge audit-trail entries at will:
--   arbitrary action, arbitrary resource_type, arbitrary resource_id. A
--   poisoned audit log is worse than no audit log, because it gets trusted.
--
--   log_email_sent was not confirmed the same way — its first argument is a
--   uuid, so the malformed probe failed the cast (22P02) before reaching the
--   body, which does not distinguish "callable" from "denied". It is the same
--   untracked family with the same default grant, and it is treated the same
--   here. §PRE-FLIGHT settles it definitively if you want to look.
--
--   None of the three appears in ANY tracked migration, and none is called
--   from src/ or supabase/functions/ — auditService.js writes audit_logs with a
--   direct table INSERT, not through an RPC. They are DEFERRED_BACKLOG #16
--   again: untracked objects doing untracked things.
--
-- AND THE SECOND ONE: retire_credits_atomic, wrong signature revoked
--   20260703000400 revoked anon from `retire_credits_atomic(uuid, uuid, numeric)`.
--   20260718000000 then created a NEW overload with a fourth argument,
--   `(uuid, uuid, numeric, text)`, and only granted it to authenticated —
--   never revoking the default. Postgres grants EXECUTE to PUBLIC on every new
--   function, so the four-argument form has been anon-callable since the day it
--   was created, and the three-argument revoke never applied to it.
--
--   This is why 20260802000100's audit missed it: it checked the NAME
--   `retire_credits_atomic` against its "already revokes first" list and found
--   a match. The revoke it found was for a different signature. **A grant audit
--   has to be done per signature, not per name.**
--
--   NOT EXPLOITABLE TODAY, and that is worth stating precisely rather than
--   overselling the finding: the function's body takes its identity from
--   `auth.uid()` and returns null immediately when that is null
--   (20260718000000, lines 40-46), so an anonymous call retires nothing. This
--   restores the intended defence in depth — the gate should not be the only
--   thing standing between anon and the retirement path.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH
--   Everything else in the advisor's two function warnings was checked and is
--   correct as it stands:
--     * Trigger functions (notify_*, guard_*, mint_credits_on_ver_approval,
--       protect_plan_columns, enforce_listing_limit, handle_new_*, …) — not
--       callable. PostgREST does not expose a `trigger` return type; probed,
--       PGRST202.
--     * Policy helpers (is_admin, is_lgu, is_mrv_staff, is_verifier_or_admin,
--       current_user_role, owns_project, owns_report_project) — MUST keep anon
--       EXECUTE. They are evaluated inside RLS policy expressions as the
--       QUERYING role; revoking anon breaks anonymous reads of every table
--       carrying such a policy.
--     * Public-by-design reads (public_market_stats, public_registry_stats,
--       public_price_history, project_price_history, search_public_registry,
--       verify_certificate_public) — /registry and /verify work signed out on
--       purpose. That is the product.
--     * The whole `authenticated_security_definer_function_executable` list —
--       spot-checked admin_finance_summary (`if not public.is_admin() then
--       raise exception`), admin_feedstock_summary (same) and
--       acknowledge_farmer_delivery_payment (`if v_delivery.farmer_id <>
--       auth.uid() then raise exception`). SECURITY DEFINER + granted to
--       authenticated + gated in the body IS the correct pattern for a
--       server-authoritative RPC. That lint fires on every properly built
--       Supabase app and is informational.
--
--   The single-argument role lookups (get_user_role(uuid), is_admin(uuid),
--   is_verifier(uuid)) let anon ask the role of any user id. Real, minor, and
--   NOT fixed here: they may appear in policy expressions that this repo cannot
--   enumerate, and a wrong revoke empties the marketplace for signed-out
--   visitors. DEFERRED_BACKLOG #45 — do it from a policy dump, not a guess.
--
-- Idempotent. Safe to re-run.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §PRE-FLIGHT — run this FIRST. It is also the definitive answer on
-- log_email_sent, which the REST probe could not settle.
--
--   select p.oid::regprocedure                                as signature,
--          has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_can,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_can
--     from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and (p.proname in ('log_user_action', 'log_system_event', 'log_email_sent')
--           or p.proname = 'retire_credits_atomic')
--    order by p.proname, 1;
--
-- Expected before applying: anon_can = true on all three log_* functions and on
-- retire_credits_atomic(uuid, uuid, numeric, text); false on the three-argument
-- retire_credits_atomic.
--
-- ALSO WORTH RUNNING: the same query with the name filter removed lists the
-- entire anon-executable SECURITY DEFINER surface. supabase/diagnostics/
-- definer_grant_surface.sql does exactly that, classified.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── The audit back door ─────────────────────────────────────────────────────
-- Looped over pg_proc by NAME so every overload is caught. Typing signatures by
-- hand is precisely the mistake that left the four-argument retire_credits_atomic
-- exposed for three weeks.
--
-- No client role keeps EXECUTE: nothing in src/ or supabase/functions/ calls
-- these, and a caller that legitimately needs them is running as service_role,
-- which bypasses grants anyway. If a trigger or another SECURITY DEFINER
-- function calls one internally, that call executes as the OWNER and does not
-- consult the caller's privileges — so internal use is unaffected.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('log_user_action', 'log_system_event', 'log_email_sent')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
    execute format('grant execute on function %s to service_role', fn.sig);
    raise notice 'locked to service_role: %', fn.sig;
  end loop;
end
$$;

-- ── The missed signature ────────────────────────────────────────────────────
-- Same loop-by-name treatment, so the three-argument form (already revoked) and
-- the four-argument form (never revoked) are both brought to the same posture,
-- and any future overload is caught the next time this runs.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'retire_credits_atomic'
  loop
    execute format('revoke all on function %s from public, anon', fn.sig);
    execute format('grant execute on function %s to authenticated', fn.sig);
    raise notice 'anon revoked, authenticated kept: %', fn.sig;
  end loop;
end
$$;

commit;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--
--   (1) Re-run §PRE-FLIGHT. Expected: anon_can = false on all four names;
--       auth_can = false on the three log_* and true on retire_credits_atomic.
--
--   (2) SIGNED OUT, anon key — the proof, and it no longer writes anything:
--         POST /rest/v1/rpc/log_user_action {"p_action":"probe", …}
--       Expected: 42501 permission denied. Before this migration it returned
--       200 and a new audit_logs row id.
--
--   (3) Retire credits as a REAL signed-in owner. This is the one that can
--       break — confirm the retirement completes, the certificate is issued,
--       and the serial appears in the public registry.
--
--   (4) Sign in and do something audited (submit a project); a row must still
--       land in audit_logs. auditService writes the table directly, so this
--       proves the revoke did not catch the real path.
--
--   (5) node scripts/analysis/verify-anon-exposure.mjs -> all PASS.
--
-- ROLLBACK (restores the vulnerable state):
--   grant execute on function public.log_user_action(text, text, text, jsonb, jsonb, jsonb) to anon;
--   grant execute on function public.retire_credits_atomic(uuid, uuid, numeric, text) to anon;
-- ============================================================================
