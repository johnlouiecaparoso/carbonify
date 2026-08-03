-- ============================================================================
-- Carbonify — policy consent verification (migration 20260731000100)
--
-- READ-ONLY. No INSERT, UPDATE, DELETE, DDL. Running it twice changes nothing.
--
-- THE QUESTION THIS ANSWERS
-- "Is the consent box shown once, on a user's first sign-in, and never again?"
--
-- That claim has two halves, and they fail in opposite directions:
--
--   SHOWN AT LEAST ONCE  every account that has used the platform has a row.
--                        A missing row means somebody got in without agreeing.
--   SHOWN AT MOST ONCE   nobody has two rows for the same version, so nobody
--                        was asked twice.
--
-- The second half is enforced by the database, not by the frontend:
-- policy_acceptances_user_version_key is UNIQUE (user_id, policy_version). §3
-- checks that index still exists, because if it were ever dropped the "at most
-- once" guarantee would quietly become a frontend convention.
--
-- ⚠️ WHAT A CLEAN RESULT DOES NOT PROVE
-- The frontend read FAILS OPEN by design (see src/services/policyService.js).
-- If the table were unreadable, users would be let through WITHOUT a row and
-- this file would report them in §2 as never having accepted. So read §2 as
-- "who has no record", not as "who was never asked" — a zero there is the
-- reassuring answer either way, but a non-zero needs the console checked for
-- `[policy] Could not read policy_acceptances`.
--
-- HOW TO USE
--   Paste the whole file into the SQL Editor and read the SUMMARY at the
--   bottom. The editor shows only the LAST statement's result, so the summary
--   is deliberately last.
-- ============================================================================

-- ── §1. Does anybody have more than one row for the same version? ────────────
-- This is the "asked twice" check. It must return zero rows.
select
  user_id,
  policy_version,
  count(*) as acceptances
from public.policy_acceptances
group by user_id, policy_version
having count(*) > 1;

-- ── §2. Signed-up accounts with no acceptance on record ──────────────────────
-- Expected to be non-zero ONLY for accounts created before the gate went live
-- (the migration was applied 2026-07-31) or accounts that registered and never
-- completed a first sign-in. A user who has used the platform since then and
-- has no row is the case worth investigating.
select
  u.id,
  u.email,
  u.created_at,
  u.last_sign_in_at
from auth.users u
left join public.policy_acceptances pa on pa.user_id = u.id
where pa.id is null
order by u.created_at desc;

-- ── §3. The uniqueness guarantee itself ──────────────────────────────────────
select
  indexname,
  indexdef
from pg_indexes
where tablename = 'policy_acceptances'
  and indexname = 'policy_acceptances_user_version_key';

-- ── §4. Which versions people have accepted, and how many each ───────────────
-- After a POLICY_VERSION bump you would expect two rows here, with the older
-- version's count frozen — that is the audit trail working. One row means
-- nobody has ever been re-asked.
select
  policy_version,
  count(*) as accepted_by,
  min(accepted_at) as first_acceptance,
  max(accepted_at) as latest_acceptance
from public.policy_acceptances
group by policy_version
order by policy_version desc;

-- ============================================================================
-- SUMMARY — read this table. Every row must say PASS.
-- ============================================================================
select
  '1. Nobody was asked twice (no duplicate user+version)' as check,
  case when count(*) = 0 then 'PASS' else 'FAIL — ' || count(*) || ' duplicated' end as verdict
from (
  select user_id, policy_version
  from public.policy_acceptances
  group by user_id, policy_version
  having count(*) > 1
) dupes

union all

select
  '2. UNIQUE index present (this is what enforces "at most once")',
  case when count(*) = 1 then 'PASS' else 'FAIL — the guarantee is frontend-only' end
from pg_indexes
where tablename = 'policy_acceptances'
  and indexname = 'policy_acceptances_user_version_key'

union all

select
  '3. Records are append-only (no UPDATE/DELETE policy)',
  case when count(*) = 0 then 'PASS' else 'FAIL — an editable acceptance is not evidence' end
from pg_policies
where tablename = 'policy_acceptances' and cmd in ('UPDATE', 'DELETE')

union all

select
  '4. RLS is on',
  case when relrowsecurity then 'PASS' else 'FAIL' end
from pg_class where oid = 'public.policy_acceptances'::regclass

union all

-- INFO, not PASS/FAIL: a user who registered and has not yet signed in for the
-- first time legitimately has no row. Read it alongside §2.
select
  '5. Accounts with no acceptance row (see §2 before judging)',
  'INFO — ' || count(*)::text
from auth.users u
left join public.policy_acceptances pa on pa.user_id = u.id
where pa.id is null

union all

-- ⚠️ This used to read `policy_version = (the newest row's version)`, which is
-- circular: it reported "users who accepted the current version" using whatever
-- version happened to be in the table, so a MISMATCH between the table and the
-- app was invisible to it — and a mismatch is the single most likely cause of
-- "I accepted and it keeps asking me". Pinned to the app's constant instead.
-- ⚠️ KEEP IN SYNC with POLICY_VERSION in src/constants/policy.js.
select
  '6. Users who accepted the version the APP asks for (2026-07-31)',
  'INFO — ' || count(distinct user_id)::text
from public.policy_acceptances
where policy_version = '2026-07-31'

union all

select
  '7. Rows whose version the app will NEVER match',
  case when count(*) = 0 then 'PASS'
       else 'FAIL — ' || count(*) || ' row(s) under another version; those users are re-asked forever'
  end
from public.policy_acceptances
where policy_version <> '2026-07-31'

union all

-- The gate reads through RLS as the signed-in user. If SELECT is missing or its
-- USING clause is wrong, an INSERT can succeed while the read-back returns zero
-- rows — the user accepts, the row lands, and the gate reappears on every load.
-- Writable-but-not-readable is the exact shape of the reported loop.
select
  '8. SELECT policy present (a row you cannot read = asked forever)',
  case when count(*) = 1 then 'PASS' else 'FAIL — ' || count(*) || ' SELECT policies' end
from pg_policies
where tablename = 'policy_acceptances' and cmd = 'SELECT'

union all

select
  '9. INSERT policy present',
  case when count(*) = 1 then 'PASS' else 'FAIL — ' || count(*) || ' INSERT policies' end
from pg_policies
where tablename = 'policy_acceptances' and cmd = 'INSERT'

union all

select
  '10. authenticated holds SELECT+INSERT grants',
  case when count(*) = 2 then 'PASS'
       else 'FAIL — grants are ' || coalesce(string_agg(privilege_type, '+'), 'MISSING') end
from information_schema.role_table_grants
where table_name = 'policy_acceptances'
  and grantee = 'authenticated'
  and privilege_type in ('SELECT', 'INSERT');

-- ============================================================================
-- IF THE GATE KEEPS REAPPEARING — run this too. It names the account and shows
-- exactly what the app would find for it.
-- ============================================================================
-- select
--   u.email,
--   pa.policy_version                                   as stored_version,
--   '2026-07-31'                                        as app_expects,
--   pa.policy_version = '2026-07-31'                    as app_will_match,
--   pa.accepted_at
-- from auth.users u
-- left join public.policy_acceptances pa on pa.user_id = u.id
-- where u.last_sign_in_at is not null
-- order by u.last_sign_in_at desc
-- limit 20;
--
-- Read `app_will_match`:
--   true  for every row  → the data is fine; the problem is client-side
--                          (check the console for `[policy]` warnings)
--   false                → version mismatch; those users are re-asked forever
--   NULL  (no row)       → the write never landed; check the console on accept
