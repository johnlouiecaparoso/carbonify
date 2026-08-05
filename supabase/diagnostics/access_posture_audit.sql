-- ============================================================================
-- Access-posture audit (read-only). Answers the two questions the repo cannot.
--
-- WHY THIS EXISTS
--   `profiles` and `certificates` predate version control and carry NO tracked
--   RLS policy, so their read/write posture lives only on the live database.
--   And 20260703000300 granted UPDATE on profiles column by column, at apply
--   time, from a two-name exclusion list — so what a client can write to a
--   profile today depends on when that migration was last run, not on what is in
--   the repo. Neither can be answered by reading code. This measures it.
--
--   Companion to money_table_rls_audit.sql, which covers the seven money tables'
--   WRITE posture. This covers the READ posture and the profiles column grants —
--   the two blind spots that audit has (its finding (A) only inspects
--   INSERT/UPDATE/DELETE/ALL policies, so an open SELECT policy passes it).
--
-- HOW TO READ IT
--        ✅ 0 rows   = posture is correct
--        ❌ any row  = a problem; `check_name` says which and `detail` says what
--
-- Returns ONE consolidated result set on purpose: the Supabase SQL Editor shows
-- only the LAST statement's rows, so a per-check layout would silently hide
-- every check but the final one.
--
-- Nothing here writes. Safe to run any time, including against production.
-- ============================================================================

with

-- Tables holding personal or financial data that must never be world-readable.
sensitive(tablename) as (
  values
    ('profiles'), ('certificates'),
    ('credit_ownership'), ('wallet_accounts'), ('wallet_transactions'),
    ('credit_transactions'), ('credit_retirements'),
    ('payment_intents'), ('ledger_entries'), ('escrow_holds'), ('payout_requests')
),

-- Profiles columns that are SECURITY DECISIONS. Each has a SECURITY DEFINER
-- write path (assign_user_role, review_kyc_application, admin_set_kyb_verified,
-- set_user_suspended, activate_subscription); none may be client-writable.
protected_cols(colname, why) as (
  values
    ('role',              'self-promotion to admin'),
    ('kyc_level',         'self-clearing the KYC trade gate'),
    ('kyb_verified',      'self-approving KYB, which is the payout gate'),
    ('is_active',         'self-unsuspending a sanctioned account'),
    ('suspended_at',      'erasing the record of a suspension'),
    ('suspended_by',      'erasing the record of a suspension'),
    ('suspension_reason', 'erasing the record of a suspension'),
    ('plan',              'self-granting a paid plan'),
    ('plan_expires_at',   'extending a paid plan')
),

-- Profiles columns the OWNER is supposed to be able to edit. If a column-level
-- grant is missing, the client PATCH fails 42501 — and because updateProfile
-- sends the whole edit form in one request, one missing column breaks the
-- entire profile save, not just that field.
editable_cols(colname, used_by) as (
  values
    ('full_name',               'profile edit form'),
    ('phone',                   'profile edit form'),
    ('municipality',            'profile edit form (added 20260722000500)'),
    ('province',                'profile edit form (added 20260722000500)'),
    ('organization_name',       'profile edit form'),
    ('organization_type',       'profile edit form'),
    ('organization_address',    'profile edit form'),
    ('onboarding_tour_version', 'onboardingService.markTourSeen (added 20260802000500)')
),

-- (A) RLS OFF on a table holding personal or financial data. On a table the
-- browser can reach through PostgREST this means every row is readable — and,
-- where the client also writes it (certificates), writable — by any caller.
finding_a as (
  select
    'A: RLS not enabled on a sensitive table' as check_name,
    s.tablename,
    case when c.oid is null then 'table not found'
         else 'relrowsecurity = false — every row is exposed' end as detail
  from sensitive s
  left join pg_class c
    on c.relname = s.tablename
   and c.relnamespace = 'public'::regnamespace
  where c.oid is not null
    and c.relrowsecurity = false
),

-- (B) An unrestricted SELECT policy. `using (true)` on a sensitive table means
-- RLS is enabled but reads are not scoped — the posture looks locked and is not.
-- RLS policies are OR'd, so ONE of these defeats every narrower policy beside it.
--
-- ⚠️ WHAT THIS CHECK CANNOT SEE, because 0 rows here has been read as proof it
-- is not there. It matches the qual STRING against `true`/`(true)`. A policy
-- written `using (auth.role() = 'authenticated')` grants exactly the same
-- universal read and passes this silently, as does any other expression that
-- happens not to constrain rows to the caller. Enumerating every permissive
-- form is not possible, so this check is deliberately narrow and NOT the
-- authority on read isolation.
--
-- The authority is behavioural: probes 9 and 10 of rls_negative_suite.sql
-- impersonate a real authenticated user and try to read someone else's profile
-- row. Run that before concluding anything about `profiles` (DEFERRED_BACKLOG
-- #39) — a clean result here is a statement about how the policies are
-- written, not about what a signed-in user can read.
finding_b as (
  select
    'B: unrestricted SELECT policy' as check_name,
    p.tablename,
    p.policyname || ' [' || p.cmd || ' to ' || array_to_string(p.roles, ',') ||
      '] qual=' || coalesce(p.qual, '(none)') as detail
  from pg_policies p
  join sensitive s on s.tablename = p.tablename
  where p.schemaname = 'public'
    and p.cmd in ('SELECT', 'ALL')
    and p.roles && array['authenticated', 'public', 'anon']::name[]
    and coalesce(btrim(p.qual), 'true') in ('true', '(true)')
),

-- (C) A protected profiles column the client can WRITE. This is the state you
-- land in by re-running 20260703000300 after 2026-07-09: its two-name exclusion
-- list re-grants everything added since, including kyb_verified and is_active.
finding_c as (
  select
    'C: client can write a protected profiles column' as check_name,
    'profiles'::text as tablename,
    pc.colname || ' — enables ' || pc.why as detail
  from protected_cols pc
  where exists (
    select 1 from information_schema.columns ic
     where ic.table_schema = 'public' and ic.table_name = 'profiles'
       and ic.column_name = pc.colname
  )
    and has_column_privilege('authenticated', 'public.profiles', pc.colname, 'UPDATE')
),

-- (D) An owner-editable profiles column the client CANNOT write. This is the
-- opposite state — 20260703000300 not re-run since the column was added — and it
-- is a live outage, not a hardening gap: the profile save fails for everyone.
finding_d as (
  select
    'D: owner cannot write an editable profiles column' as check_name,
    'profiles'::text as tablename,
    ec.colname || ' — breaks ' || ec.used_by as detail
  from editable_cols ec
  where exists (
    select 1 from information_schema.columns ic
     where ic.table_schema = 'public' and ic.table_name = 'profiles'
       and ic.column_name = ec.colname
  )
    and not has_column_privilege('authenticated', 'public.profiles', ec.colname, 'UPDATE')
)

-- No separate check for a blanket table-level UPDATE grant: has_column_privilege
-- reports true for every column when one exists, so a table grant shows up as
-- finding (C) firing on ALL nine protected columns at once. That signature —
-- (C) with nine rows rather than one or two — is the blanket grant.
select * from finding_a
union all
select * from finding_b
union all
select * from finding_c
union all
select * from finding_d
order by check_name, tablename, detail;

-- ============================================================================
-- WHAT TO DO WITH THE RESULT
--
--   (A) on `certificates`     -> apply 20260804000500_certificates_rls.sql
--                                (run ITS pre-flight query first).
--   (A) on `profiles`         -> do NOT patch blind. See DEFERRED_BACKLOG #39:
--                                the app reads other users' profile rows in six
--                                services, so a policy has to be designed
--                                alongside converting those reads.
--   (B) anywhere              -> that policy is the posture, whatever else sits
--                                beside it. Read it before removing it: on
--                                `credit_listings` a permissive SELECT is
--                                expected (public marketplace browse); on
--                                `profiles`, `certificates`, `wallet_accounts`
--                                or `credit_transactions` it is not.
--   (C) any row               -> apply 20260804000200_profiles_column_grants_
--                                denylist.sql. Then re-run: (C) must be empty.
--   (D) any row               -> same migration. It grants every non-protected
--                                column, so (C) and (D) clear together.
--
-- (C) and (D) are mutually exclusive in practice, and which one you get tells
-- you the history: (D) means 20260703000300 has not been re-run since those
-- columns were added — profile saves are failing today. (C) means it HAS been
-- re-run, and its two-name exclusion list re-granted everything added since,
-- including kyb_verified. (C) is the more urgent of the two.
--
-- Re-run this after applying anything. 0 rows is the goal and is achievable.
--
-- ⚠️ AND 0 ROWS IS NOT A CLEAN BILL ON READS. Finding (B) is a string match
-- against `true` (see its note above), so an equally permissive policy written
-- any other way leaves this query empty. `profiles` read isolation is settled
-- by rls_negative_suite.sql probes 9 and 10, which try the read as a real
-- signed-in user. Run those before recording that reads are scoped.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- RAW INSPECTION — run these SEPARATELY (one at a time) when a finding above
-- needs context. They are not part of the findings query.
--
-- 1. The full policy set on the two untracked tables:
--
--    select tablename, policyname, cmd, roles, qual, with_check
--      from pg_policies
--     where schemaname = 'public' and tablename in ('profiles', 'certificates')
--     order by tablename, cmd, policyname;
--
-- 2. RLS on/off for both:
--
--    select relname, relrowsecurity, relforcerowsecurity
--      from pg_class
--     where relnamespace = 'public'::regnamespace
--       and relname in ('profiles', 'certificates');
--
-- 3. Exactly which profiles columns `authenticated` may UPDATE:
--
--    select column_name,
--           has_column_privilege('authenticated', 'public.profiles', column_name, 'UPDATE') as can_update
--      from information_schema.columns
--     where table_schema = 'public' and table_name = 'profiles'
--     order by can_update desc, column_name;
--
-- 4. Whether the payout idempotency index is global or per-seller (see
--    20260804000400's closing note):
--
--    select indexname, indexdef from pg_indexes
--     where tablename = 'payout_requests' and indexdef ilike '%idempotency_key%';
--
-- 5. Whether the untracked RLS helpers really exist (DEFERRED_BACKLOG #40) —
--    if these return 0 rows, 20260725000100 cannot be replayed anywhere:
--
--    select p.proname, pg_get_function_identity_arguments(p.oid) as args
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname in ('is_admin', 'is_verifier')
--     order by p.proname, args;
-- ────────────────────────────────────────────────────────────────────────────
