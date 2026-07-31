-- ============================================================================
-- Verifier independence — nobody may verify their own project.
--
-- There is no conflict-of-interest control anywhere in the verification path.
-- Neither approveProject() nor approveReport() checks that the person
-- validating is not the project's owner, and validating is not a neutral act:
-- activate_validated_project_trigger (20260602000100 / 20260718000900) mints a
-- credit pool AND an active marketplace listing the moment status becomes
-- 'validated'. Approving an MRV report mints further credits via the VER
-- trigger. Self-verification is therefore self-issuance of a sellable asset.
--
-- HOW REACHABLE IS IT? profiles.role is single-valued, so an account cannot be
-- developer and verifier at once — but ownership survives a role change. A
-- developer promoted to verifier still owns their earlier projects, and an
-- admin can assign roles freely. That is enough to warrant a real control
-- rather than a UI check, which is why this lives in the database.
--
-- Mirrors the precedent set by 20260703000500 (self-purchase / wash trading):
-- the analogous buyer-side conflict is already blocked at the settlement RPC.
--
-- SCOPE: this blocks the ISSUANCE-bearing decisions only — validating a project
-- and approving a VER. An owner is deliberately still allowed to reject or
-- request revision on their own project; those cannot mint anything, and
-- blocking them would strand a project nobody else could touch.
--
-- NO ADMIN EXEMPTION, on purpose. "Independent except when the reviewer is
-- powerful enough" is not independence. A genuine operational override still
-- exists: service_role and direct SQL both run with auth.uid() null, so the
-- guards below do not fire for them.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

-- ── 1) Project validation ───────────────────────────────────────────────────
create or replace function public.guard_project_self_validation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only the transition INTO a validated state matters. Unrelated column edits
  -- and every other status (rejected, needs_revision, in_review) pass through.
  if lower(coalesce(new.status, '')) not in ('validated', 'approved') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  -- auth.uid() is null for service_role and direct SQL — those are the
  -- deliberate operational escape hatch and are not blocked here.
  if auth.uid() is not null and auth.uid() = new.user_id then
    raise exception
      'You cannot validate your own project. Verification must be carried out by someone who does not own the project.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_project_self_validation on public.projects;
create trigger trg_guard_project_self_validation
before update of status on public.projects
for each row
execute function public.guard_project_self_validation();

-- ── 2) VER approval (mints credits against the project) ─────────────────────
create or replace function public.guard_ver_self_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    return new;  -- service_role / direct SQL, as above
  end if;

  select p.user_id into v_owner
    from public.projects p
   where p.id = new.project_id;

  if v_owner is not null and v_owner = auth.uid() then
    raise exception
      'You cannot approve emission reductions for your own project. Verification must be carried out by someone who does not own the project.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_ver_self_approval on public.verified_emission_reductions;
create trigger trg_guard_ver_self_approval
before insert on public.verified_emission_reductions
for each row
execute function public.guard_ver_self_approval();

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--   (1) a verifier who does NOT own the project can still validate it, and a
--       pool + active listing appear as before;
--   (2) a verifier who DOES own the project is rejected on validate, and on
--       MRV approve, with the messages above and nothing minted;
--   (3) that same owner can still reject / request revision on their project.
--
-- ROLLBACK
--   drop trigger if exists trg_guard_project_self_validation on public.projects;
--   drop trigger if exists trg_guard_ver_self_approval on public.verified_emission_reductions;
--   drop function if exists public.guard_project_self_validation();
--   drop function if exists public.guard_ver_self_approval();
--   notify pgrst, 'reload schema';
-- ============================================================================
