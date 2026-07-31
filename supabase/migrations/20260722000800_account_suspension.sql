-- ============================================================================
-- Account suspension — role-needs/04-admin.md #4.
--
-- The only abuse-handling tool an operator had was changing someone's role,
-- which is a blunt instrument: demoting a fraudulent seller to general_user
-- leaves them able to keep buying, and demoting a buyer does nothing at all.
--
-- WHAT SUSPENSION MEANS HERE
-- It blocks TRANSACTING. It does not block a person from reaching their own
-- records. A suspended user can still sign in, read their receipts, download
-- certificates for credits they already retired, and exercise their Data
-- Privacy Act rights (export / deletion request).
--
-- That distinction is deliberate and load-bearing:
--   * A retirement certificate is an ESG disclosure artifact. A company that
--     retired credits in good faith may need that certificate for a regulator
--     or an audit years later. Suspension is a platform sanction against future
--     activity; it must not retroactively destroy someone's evidence that they
--     offset their emissions.
--   * DPA rights are statutory. A controller cannot suspend its way out of an
--     access or erasure request, so submit_data_subject_request and the export
--     path are deliberately NOT gated below.
--
-- ENFORCEMENT
-- At the database, at the same chokepoints as the KYC gate, so it holds no
-- matter which client is calling:
--   * assert_can_trade()   — the card/checkout path (paymongo-checkout).
--   * credit_retirements   — BEFORE INSERT trigger. retire_credits_atomic is
--                            SECURITY DEFINER and bypasses RLS, but auth.uid()
--                            still resolves the caller inside it, exactly as the
--                            verifier independence guards rely on (20260722000100).
--   * projects             — BEFORE INSERT trigger, so a suspended developer
--                            cannot file new submissions.
--
-- Reading is untouched everywhere. RLS still scopes it to the owner.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles add column if not exists is_active boolean not null default true;
    alter table public.profiles add column if not exists suspended_at timestamptz;
    alter table public.profiles add column if not exists suspended_by uuid;
    alter table public.profiles add column if not exists suspension_reason text;

    create index if not exists idx_profiles_suspended
      on public.profiles (id) where is_active = false;
  end if;
end $$;

-- ── Helpers ─────────────────────────────────────────────────────────────────
create or replace function public.is_suspended(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select not is_active from public.profiles where id = p_user_id), false)
$$;

create or replace function public.assert_not_suspended(p_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_user_id is not null and public.is_suspended(p_user_id) then
    raise exception
      'This account is suspended and cannot transact. You can still access your receipts, certificates and data export. Contact support if you believe this is an error.'
      using errcode = 'check_violation';
  end if;
end;
$$;

grant execute on function public.is_suspended(uuid) to authenticated, service_role;
grant execute on function public.assert_not_suspended(uuid) to authenticated, service_role;

-- ── Trade gate ──────────────────────────────────────────────────────────────
-- Full CREATE OR REPLACE of the 20260721000100 definition with ONLY the
-- suspension check added, so this cannot drift from the live body.
create or replace function public.assert_can_trade(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_level int;
  v_min   int;
begin
  if p_user_id is null then
    raise exception 'authentication required' using errcode = 'check_violation';
  end if;

  -- Suspension is checked FIRST: a suspended account should be told it is
  -- suspended, not sent away to complete KYC it will still not be able to use.
  perform public.assert_not_suspended(p_user_id);

  select coalesce(kyc_level, 0) into v_level from public.profiles where id = p_user_id;
  v_level := coalesce(v_level, 0);

  v_min := coalesce(
    (public.get_setting('min_kyc_level_to_trade', '1'::jsonb))::text::int,
    1
  );

  if v_level < v_min then
    raise exception
      'identity verification required before trading (your level %, required %)',
      v_level, v_min
      using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function public.assert_can_trade(uuid) from public, anon;
grant execute on function public.assert_can_trade(uuid) to authenticated, service_role;

-- ── Retirement guard ────────────────────────────────────────────────────────
create or replace function public.guard_retirement_suspension()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;  -- service_role / direct SQL escape hatch
  end if;
  perform public.assert_not_suspended(auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_guard_retirement_suspension on public.credit_retirements;
create trigger trg_guard_retirement_suspension
before insert on public.credit_retirements
for each row
execute function public.guard_retirement_suspension();

-- ── Project submission guard ────────────────────────────────────────────────
create or replace function public.guard_project_suspension()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  perform public.assert_not_suspended(auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_guard_project_suspension on public.projects;
create trigger trg_guard_project_suspension
before insert on public.projects
for each row
execute function public.guard_project_suspension();

-- ── Admin control ───────────────────────────────────────────────────────────
create or replace function public.set_user_suspended(
  p_user_id   uuid,
  p_suspended boolean,
  p_reason    text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can suspend accounts'
      using errcode = 'insufficient_privilege';
  end if;
  if p_user_id is null then
    raise exception 'User is required';
  end if;

  -- Locking yourself out is never the intent, and an admin who can suspend
  -- themselves can also strand the platform with no active administrator.
  if p_user_id = auth.uid() then
    raise exception 'You cannot suspend your own account';
  end if;

  -- Suspending is a sanction on a person; it has to say why, on the record.
  if p_suspended and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A suspension must include a reason';
  end if;

  update public.profiles
     set is_active         = not p_suspended,
         suspended_at      = case when p_suspended then now() else null end,
         suspended_by      = case when p_suspended then auth.uid() else null end,
         suspension_reason = case when p_suspended then btrim(p_reason) else null end,
         updated_at        = now()
   where id = p_user_id
   returning * into v_row;

  if not found then
    raise exception 'User not found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.set_user_suspended(uuid, boolean, text) from public, anon;
grant execute on function public.set_user_suspended(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--   (1) a suspended buyer is refused at checkout with the suspension message,
--       NOT the KYC one;
--   (2) that same buyer can still open /receipts and /certificates and download
--       a certificate for credits they retired before suspension;
--   (3) that same buyer can still run a data export and raise a DPA request;
--   (4) a suspended buyer cannot retire further credits;
--   (5) a suspended developer cannot submit a new project;
--   (6) an admin cannot suspend themselves, and cannot suspend without a reason;
--   (7) a non-admin calling set_user_suspended is refused;
--   (8) reactivating clears suspended_at / suspended_by / suspension_reason and
--       the user can transact again.
--
-- ROLLBACK
--   drop trigger if exists trg_guard_retirement_suspension on public.credit_retirements;
--   drop trigger if exists trg_guard_project_suspension on public.projects;
--   drop function if exists public.guard_retirement_suspension();
--   drop function if exists public.guard_project_suspension();
--   drop function if exists public.set_user_suspended(uuid, boolean, text);
--   drop function if exists public.assert_not_suspended(uuid);
--   drop function if exists public.is_suspended(uuid);
--   -- then re-apply 20260721000100 to restore assert_can_trade without the check
--   alter table public.profiles
--     drop column if exists is_active, drop column if exists suspended_at,
--     drop column if exists suspended_by, drop column if exists suspension_reason;
--   notify pgrst, 'reload schema';
-- ============================================================================
