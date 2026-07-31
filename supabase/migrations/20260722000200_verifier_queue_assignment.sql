-- ============================================================================
-- Verifier queue assignment — who owns this review?
--
-- Closes the assignment half of docs/role-needs/03-verifier.md #5. The doc
-- claimed "assignment fields exist"; they do not — there is no column anywhere
-- recording which verifier is responsible for a submission, so a queue with
-- more than one reviewer has no way to divide work or show a workload.
--
-- `verified_by` is NOT that field: it is written at decision time and records
-- who DECIDED, after the fact. Assignment has to be expressible before any
-- decision exists, and has to be clearable, so it needs its own column.
--
-- Also adds list_verifiers(), because the assignment dropdown needs verifier
-- names and this repo has no tracked SELECT policy on public.profiles (the
-- table predates the migrations). Rather than assume the live policy is
-- permissive — or widen profile exposure to get a dropdown working — the list
-- comes from a SECURITY DEFINER function that returns nothing but id + name,
-- and only to verifiers and admins.
--
-- Assignment is deliberately NOT an access control. Any verifier can still open
-- and decide any project; assignment says who is expected to, not who is
-- permitted to. Making it exclusive would strand submissions the moment someone
-- is on leave, and the independence guard (20260722000100) is what actually
-- constrains who may decide.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

do $$
begin
  if to_regclass('public.projects') is not null then
    alter table public.projects add column if not exists assigned_verifier_id uuid;
    alter table public.projects add column if not exists assigned_at timestamptz;

    -- FK is added separately and tolerantly: a drifted DB may already carry it.
    if not exists (
      select 1 from pg_constraint where conname = 'projects_assigned_verifier_fk'
    ) then
      begin
        alter table public.projects
          add constraint projects_assigned_verifier_fk
          foreign key (assigned_verifier_id) references public.profiles(id)
          on delete set null;
      exception when others then
        raise notice 'assigned_verifier FK skipped: %', sqlerrm;
      end;
    end if;

    -- "My queue" is the common read, so index the assignee for open work only.
    create index if not exists idx_projects_assigned_verifier
      on public.projects (assigned_verifier_id)
      where assigned_verifier_id is not null;
  end if;
end $$;

-- ── Verifier directory for the assignment picker ────────────────────────────
-- Returns id + a display name only. No email, no role, no KYC fields: a
-- dropdown needs a name, and nothing here should become a way to enumerate
-- user records.
create or replace function public.list_verifiers()
returns table (id uuid, display_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_verifier_or_admin() then
    raise exception 'Only verifiers and admins can list verifiers'
      using errcode = 'insufficient_privilege';
  end if;

  return query
    select p.id,
           coalesce(nullif(btrim(p.full_name), ''), 'Verifier') as display_name
      from public.profiles p
     where p.role in ('verifier', 'admin')
     order by display_name;
end;
$$;

revoke all on function public.list_verifiers() from public;
grant execute on function public.list_verifiers() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--   (1) a verifier can assign a project to themselves or another verifier, and
--       the badge persists across a reload;
--   (2) unassigning clears both columns;
--   (3) a project developer calling list_verifiers() is rejected;
--   (4) validating an assigned project still works (assignment must not
--       interact with trg_guard_project_self_validation, which fires only on a
--       status change).
--
-- ROLLBACK
--   drop function if exists public.list_verifiers();
--   drop index if exists public.idx_projects_assigned_verifier;
--   alter table public.projects drop constraint if exists projects_assigned_verifier_fk;
--   alter table public.projects drop column if exists assigned_verifier_id;
--   alter table public.projects drop column if exists assigned_at;
--   notify pgrst, 'reload schema';
-- ============================================================================
