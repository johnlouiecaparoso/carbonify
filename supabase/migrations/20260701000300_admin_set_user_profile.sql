-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.admin_set_user_profile()  ->  20260722000900_admin_segregation_of_duties.sql
--
-- Applying migrations in order from empty is fine: the later file lands last.
-- Running this one ON ITS OWN is what reverts. This marker is maintained by
-- src/test/services/migrationSupersession.test.js — do not delete it by hand.
-- ============================================================================

-- ============================================================================
-- Admin: set a user's KYC level / role / name from the User Management console.
--
-- The console previously did a raw PostgREST UPDATE on public.profiles that
-- included an `updated_at` column and targeted OTHER users' rows — which 400s
-- (profiles has no updated_at, and profile RLS only lets a user update their own
-- row). This admin-gated SECURITY DEFINER RPC bypasses RLS and touches only
-- columns that exist, so an admin can set a KYC level for testing reliably.
--
-- KYC is normally earned via the kyc_applications review flow; this is the manual
-- admin override. kyc_level is clamped to [0,3]. role/full_name are only changed
-- when a non-empty value is passed. Idempotent create-or-replace; safe to re-run.
-- ============================================================================

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
begin
  if not public.is_admin() then
    raise exception 'only administrators can update users';
  end if;
  if p_user_id is null then
    raise exception 'user id is required';
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

notify pgrst, 'reload schema';
