-- ============================================================================
-- CAN THE STAFF CONSOLES SEE THE PEOPLE THEY REVIEW?
--
-- Read-only. Writes nothing, changes nothing. Paste the whole file, read the
-- last table. NOTHING TO EDIT — it finds an admin and a verifier itself.
--
-- WHY THIS IS A SEPARATE FILE FROM rls_negative_suite.sql
--   That suite asks "is the lockdown holding?" and deliberately impersonates a
--   NON-admin, non-verifier, because that is who an attacker is. Every run of
--   it — 2026-07-30, and twice on 2026-08-05 — therefore said nothing about
--   staff. Pinning its actor means hand-editing a PL/pgSQL declaration inside a
--   DO block, which was attempted and produced `42601: syntax error at or near
--   "v_actor_raw"` because that line is not a statement you can run on its own.
--   A check that is one hand-edit away from being run is a check that does not
--   get run. This one needs none.
--
-- THE QUESTION, AND WHY IT MATTERS
--   `public.profiles` has no tracked SELECT policy (DEFERRED_BACKLOG #39); its
--   read posture exists only on the live database. On 2026-08-05 probes 9 and 10
--   of the negative suite measured it for a general user: 0 of 6 foreign rows.
--   Good — no user directory. But `kycService`, `amlService` and
--   `projectApprovalService` read OTHER users' profile rows in order to show an
--   admin who they are approving. If the policy scopes staff the same way, those
--   queues render blanks.
--
-- ⚠️ READ THIS BACKWARDS FROM THE NEGATIVE SUITE.
--   There, rows visible = FAIL. Here, rows visible = the consoles work.
--
--     FULL     staff can read other profiles. The KYC/AML/approval queues can
--              name their subjects. This is the expected, working state.
--     *** NONE ***  staff can read NOBODY. The review queues are rendering
--              blank identities on the screens where identity decisions are
--              made — silently, because RLS filters rather than erroring. This
--              is the same failure shape as the asset ledger (#39), with worse
--              consequences.
--     PARTIAL  some narrower scoping applies. Read the count and find out what.
--     UNPROVEN only one account exists, so there was nothing to read.
--     SKIP     no account holds that role on this database.
--
-- A `*** NONE ***` here does NOT mean "widen the profiles policy". It means the
-- staff reads need the same treatment the ledger got: a narrow SECURITY DEFINER
-- RPC scoped to what the screen legitimately needs (the pattern of
-- 20260801000100 and 20260805000100).
-- ============================================================================

drop table if exists _staff_read;
create temp table _staff_read (
  role_tested text, check_name text, verdict text, detail text
);
-- The probes run as `authenticated`, which does not own this temp table.
grant all on _staff_read to public;

do $staff$
declare
  v_role    text;
  v_actor   uuid;
  v_total   bigint;   -- foreign profile rows that EXIST (as the invoking role)
  v_visible bigint;   -- foreign profile rows the staff member can actually read
  v_self    bigint;   -- their own row: the control
begin
  foreach v_role in array array['admin', 'verifier']
  loop
    -- Oldest holder of the role, as the invoking role so the pick is not itself
    -- subject to the policy being measured.
    select p.id into v_actor
      from public.profiles p
     where p.role = v_role
     order by p.created_at nulls last
     limit 1;

    if v_actor is null then
      insert into _staff_read values (v_role, 'find an account', 'SKIP',
        'no account on this database holds this role');
      continue;
    end if;

    select count(*) into v_total
      from public.profiles p where p.id is distinct from v_actor;

    insert into _staff_read values (v_role, 'acting as', 'INFO',
      v_actor::text || ' — ' || v_total::text || ' other profile row(s) exist');

    -- Become them. auth.uid() reads request.jwt.claims->>'sub', so the policies
    -- evaluate exactly as for a PostgREST request from this account.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_actor::text, 'role', 'authenticated')::text, true);
    set local role authenticated;

    select count(*) into v_self
      from public.profiles p where p.id = v_actor;
    select count(*) into v_visible
      from public.profiles p where p.id is distinct from v_actor;

    reset role;

    -- The control. If a staff member cannot read their OWN row, the result
    -- below is meaningless — the session is not what this script thinks it is.
    insert into _staff_read values (v_role, 'own row readable (control)',
      case when v_self = 1 then 'OK' else '*** BROKEN ***' end,
      case when v_self = 1 then 'reads their own profile, as every account must'
           else 'cannot read their OWN row — impersonation did not take, so ignore the row below' end);

    insert into _staff_read values (v_role, 'other users readable',
      case when v_total = 0    then 'UNPROVEN'
           when v_visible = 0  then '*** NONE ***'
           when v_visible = v_total then 'FULL'
           else 'PARTIAL' end,
      case when v_total = 0 then 'only one profile exists — nothing to read'
           else v_visible::text || ' of ' || v_total::text || ' other profile row(s) readable'
                || case
                     when v_visible = 0 then ' — the review queues cannot name their subjects'
                     when v_visible = v_total then ' — the review queues work'
                     else ' — something scopes this; read the policy'
                   end
      end);
  end loop;
exception
  when others then
    reset role;   -- never leave the session impersonating anyone
    raise;
end
$staff$;

reset role;

-- ── SUMMARY — the LAST statement, so a whole-file paste shows it. ────────────
-- (The Supabase editor renders only the final statement's result.)
select
  role_tested as "role",
  check_name  as "check",
  verdict     as "verdict",
  detail      as "detail"
from _staff_read
order by role_tested, check_name;
