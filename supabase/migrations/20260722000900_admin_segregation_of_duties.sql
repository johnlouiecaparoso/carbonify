-- ============================================================================
-- Segregation of duties — an admin may not grant themselves privilege or money.
--
-- Closes role-needs/04-admin.md #11. Verifier independence was enforced in
-- 20260722000100 (nobody validates a project they own) and self-suspension was
-- blocked in 20260722000800, but the admin role itself was still unchecked.
-- Three functions took an arbitrary user id and asked only `is_admin()`:
--
--   admin_set_user_profile   — an admin could set their OWN kyc_level to 3,
--                              skipping the entire KYC review flow and
--                              unlocking the highest velocity tier.
--   admin_set_kyb_verified   — an admin could self-verify KYB. This is the
--                              sharpest of the three: KYB is the gate on SELLER
--                              PAYOUTS, so the path was self-verify then
--                              withdraw real money.
--   admin_refund_transaction — an admin could refund a transaction they were
--                              the buyer or seller on.
--
-- THE LINE DRAWN HERE
-- You may not grant yourself privilege or money. Everything else an admin does
-- to their own row is left alone -- editing your own display name is not a
-- self-dealing risk and blocking it would be theatre.
--
--   blocked: own kyc_level, own role, own kyb_verified = true, refunding a
--            transaction you are a party to
--   allowed: own full_name; REMOVING your own kyb_verified (self-restricting);
--            everything an admin does to other people
--
-- WHAT THIS IS NOT
-- This is not maker-checker. A second admin still is not required to approve a
-- refund or a role grant -- that is a larger design (proposal + approval
-- records, and a rule for single-admin deployments) and is left open in the
-- role doc. This closes the SELF-dealing hole, which needs no second party to
-- exploit and no second party to prevent.
--
-- Each function below is a full CREATE OR REPLACE of its current definition
-- with only the guard added, so none can drift from the live body.
-- service_role and direct SQL run with auth.uid() null and are unaffected --
-- the same deliberate operational escape hatch as the other guards.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

-- ── 1) Profile edits: no self-granted KYC level or role ─────────────────────
create or replace function public.admin_set_user_profile(
  p_user_id   uuid,
  p_kyc_level int  default null,
  p_role      text default null,
  p_full_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
  v_cur_kyc  int;
  v_cur_role text;
begin
  if not public.is_admin() then
    raise exception 'only administrators can update users';
  end if;
  if p_user_id is null then
    raise exception 'user id is required';
  end if;

  -- Compare against the CURRENT values rather than rejecting any non-null
  -- argument: the admin UI submits the whole form every time, so an admin
  -- editing only their own display name still sends their existing kyc_level
  -- and role. Rejecting those would block a harmless edit and read as a bug.
  -- Only an actual CHANGE to your own privilege is refused.
  if auth.uid() is not null and p_user_id = auth.uid() then
    select kyc_level, role into v_cur_kyc, v_cur_role
      from public.profiles where id = p_user_id;

    if p_kyc_level is not null
       and greatest(0, least(p_kyc_level, 3)) is distinct from coalesce(v_cur_kyc, 0) then
      raise exception
        'You cannot change your own KYC level. Ask another administrator, or complete verification through the normal flow.'
        using errcode = 'check_violation';
    end if;

    if nullif(btrim(coalesce(p_role, '')), '') is not null
       and lower(btrim(p_role)) is distinct from lower(coalesce(v_cur_role, '')) then
      raise exception 'You cannot change your own role'
        using errcode = 'check_violation';
    end if;
  end if;

  -- An unrecognised role silently breaks every role check in the app, so it is
  -- rejected here rather than stored. (The column has no CHECK constraint.)
  if nullif(btrim(coalesce(p_role, '')), '') is not null
     and lower(btrim(p_role)) not in (
       'general_user', 'buyer_investor', 'project_developer',
       'farmer', 'lgu_user', 'verifier', 'admin'
     ) then
    raise exception 'Unknown role: %', p_role;
  end if;

  update public.profiles
  set
    kyc_level = case
                  when p_kyc_level is null then kyc_level
                  else greatest(0, least(p_kyc_level, 3))
                end,
    role      = coalesce(nullif(btrim(p_role), ''), role),
    full_name = coalesce(nullif(btrim(p_full_name), ''), full_name)
  where id = p_user_id
  returning * into v_profile;

  if not found then
    raise exception 'user % not found', p_user_id;
  end if;

  return v_profile;
end;
$$;

revoke all on function public.admin_set_user_profile(uuid, int, text, text) from public, anon;
grant execute on function public.admin_set_user_profile(uuid, int, text, text) to authenticated;

-- ── 2) KYB: no self-verification (this gates seller payouts) ────────────────
create or replace function public.admin_set_kyb_verified(
  p_user_id uuid,
  p_verified boolean
) returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles;
begin
  if not public.is_admin() then
    raise exception 'only administrators can set KYB verification';
  end if;

  -- Granting only. Removing your own KYB is self-restricting, so it stays
  -- available -- an admin should always be able to take a privilege away from
  -- themselves.
  if auth.uid() is not null and p_user_id = auth.uid() and coalesce(p_verified, false) then
    raise exception
      'You cannot verify your own business. KYB gates seller payouts, so it must be approved by another administrator.'
      using errcode = 'check_violation';
  end if;

  update public.profiles
     set kyb_verified = coalesce(p_verified, false)
   where id = p_user_id
   returning * into v_profile;

  if not found then
    raise exception 'user not found';
  end if;

  return v_profile;
end;
$$;

revoke all on function public.admin_set_kyb_verified(uuid, boolean) from public, anon;
grant execute on function public.admin_set_kyb_verified(uuid, boolean) to authenticated;

-- ── 3) Refunds: not on a transaction you are a party to ─────────────────────
create or replace function public.admin_refund_transaction(
  p_transaction_id uuid,
  p_reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer  uuid;
  v_seller uuid;
begin
  if not public.is_admin() then
    raise exception 'only administrators can issue refunds';
  end if;

  if auth.uid() is not null then
    select buyer_id, seller_id
      into v_buyer, v_seller
      from public.credit_transactions
     where id = p_transaction_id;

    if auth.uid() in (v_buyer, v_seller) then
      raise exception
        'You cannot refund a transaction you are a party to. Ask another administrator.'
        using errcode = 'check_violation';
    end if;
  end if;

  perform public.refund_purchase(p_transaction_id, p_reason);
end;
$$;

revoke all on function public.admin_refund_transaction(uuid, text) from public, anon;
grant execute on function public.admin_refund_transaction(uuid, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--   (1) an admin editing ANOTHER user's KYC level / role still works;
--   (2) an admin setting their OWN kyc_level is refused;
--   (3) an admin changing their OWN role is refused;
--   (4) an admin editing their own full_name still works;
--   (5) an admin verifying their OWN KYB is refused; UN-verifying it works;
--   (6) an admin refunding a transaction they bought or sold is refused;
--   (7) refunding an unrelated transaction still works end to end and the
--       books still reconcile;
--   (8) an unknown role string is rejected rather than stored.
--
-- ROLLBACK
--   Re-apply 20260701000300 (admin_set_user_profile), 20260709000000
--   (admin_set_kyb_verified) and 20260701000200 (admin_refund_transaction) to
--   restore the unguarded bodies, then:
--   notify pgrst, 'reload schema';
-- ============================================================================
