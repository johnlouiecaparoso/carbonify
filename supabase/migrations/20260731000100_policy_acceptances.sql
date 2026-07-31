-- ============================================================================
-- Record that a user accepted the Terms, Privacy Policy and Carbon Credits
-- Policy -- and WHICH VERSION they accepted.
--
-- WHY A TABLE AND NOT A BOOLEAN ON profiles
-- A boolean answers "did they agree?". The question that actually gets asked --
-- by a regulator, by a counterparty, or by us in a dispute -- is "what exactly
-- did this person agree to, and when?". Policies change; a flag silently starts
-- meaning something different the day the text is edited, and every historical
-- acceptance is retroactively rewritten to point at the new wording. An
-- append-only row per (user, version) keeps the old answer true.
--
-- It also makes re-consent trivial: bump POLICY_VERSION in
-- src/constants/policy.js and every user is asked again, with the previous
-- acceptance still on record rather than overwritten.
--
-- WHAT IS DELIBERATELY NOT HERE
-- No withdrawal/revocation column. Declining is not stored as a row -- the
-- client signs the user out instead. Recording a "refused" state would imply we
-- do something with it, and we do not.
--
-- ⚠️ ORDER OF OPERATIONS -- READ THIS
-- The frontend gate FAILS OPEN: if this table does not exist, or the read
-- errors, users are let through rather than locked out. That is deliberate and
-- it matches the precedent in App.vue, where a missing `is_active` column must
-- read as ACTIVE rather than showing every user a suspension banner. An
-- unapplied migration must never brick the platform.
--
-- The consequence to understand: **until this migration is applied, the consent
-- gate does nothing at all.** It will not error, it will not warn a user, and
-- it will not record anything. Apply this, then verify with §VERIFY below.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

create table if not exists public.policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The version string from src/constants/policy.js, e.g. '2026-07-31'.
  policy_version text not null,
  -- Which documents that version covered, so the row is self-describing even
  -- if the constant is later edited.
  documents text[] not null default array['terms', 'privacy', 'carbon'],
  accepted_at timestamptz not null default now(),
  -- Best-effort context. Never trusted for anything, only useful as evidence.
  user_agent text,
  created_at timestamptz not null default now()
);

-- One acceptance per user per version. Re-accepting the same version is a
-- no-op rather than a duplicate row, which keeps the audit trail readable.
create unique index if not exists policy_acceptances_user_version_key
  on public.policy_acceptances (user_id, policy_version);

create index if not exists policy_acceptances_user_idx
  on public.policy_acceptances (user_id);

alter table public.policy_acceptances enable row level security;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Read your own; admins read all (they have to answer "did this user agree?").
drop policy if exists "Users read own policy acceptances" on public.policy_acceptances;
create policy "Users read own policy acceptances"
  on public.policy_acceptances
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Insert only your own, and only as yourself. `user_id` is checked against
-- auth.uid() rather than taken from the request body -- the same rule the
-- payment path learned (P3): never derive identity from something the client
-- can set.
drop policy if exists "Users record own policy acceptance" on public.policy_acceptances;
create policy "Users record own policy acceptance"
  on public.policy_acceptances
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- No UPDATE and no DELETE policy, on purpose. An acceptance record that can be
-- edited after the fact is not evidence of anything. Without a policy, RLS
-- denies both -- including to the user who created the row.

grant select, insert on public.policy_acceptances to authenticated;

-- ============================================================================
-- VERIFY -- run this after applying. Every row must read PASS.
-- ============================================================================
-- select
--   'table exists' as check,
--   case when to_regclass('public.policy_acceptances') is not null
--        then 'PASS' else 'FAIL' end as verdict
-- union all
-- select
--   'RLS enabled',
--   case when relrowsecurity then 'PASS' else 'FAIL' end
--   from pg_class where oid = 'public.policy_acceptances'::regclass
-- union all
-- select
--   'no UPDATE/DELETE policy (records are append-only)',
--   case when count(*) = 0 then 'PASS' else 'FAIL' end
--   from pg_policies
--   where tablename = 'policy_acceptances' and cmd in ('UPDATE', 'DELETE')
-- union all
-- select
--   'select + insert policies present',
--   case when count(*) = 2 then 'PASS' else 'FAIL' end
--   from pg_policies
--   where tablename = 'policy_acceptances' and cmd in ('SELECT', 'INSERT');
