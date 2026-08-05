-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.assign_user_role()  ->  20260711000000_farmer_portal.sql
--
-- Applying migrations in order from empty is fine: the later file lands last.
-- Running this one ON ITS OWN is what reverts. This marker is maintained by
-- src/test/services/migrationSupersession.test.js — do not delete it by hand.
-- ============================================================================

create or replace function public.assign_user_role(
  target_user_id uuid,
  target_role text,
  target_email text default null,
  target_full_name text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  reviewer_role text;
  normalized_role text;
  auth_email text;
  auth_full_name text;
  updated_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to assign roles.';
  end if;

  select lower(trim(role))
  into reviewer_role
  from public.profiles
  where id = auth.uid();

  if reviewer_role is null then
    raise exception 'Reviewer profile not found.';
  end if;

  normalized_role := lower(trim(coalesce(target_role, '')));

  if normalized_role not in ('general_user', 'buyer_investor', 'project_developer', 'verifier') then
    raise exception 'Invalid target role.';
  end if;

  if reviewer_role = 'verifier' and normalized_role <> 'project_developer' then
    raise exception 'Verifiers can only assign the project_developer role.';
  end if;

  if reviewer_role not in ('admin', 'verifier') then
    raise exception 'You are not allowed to assign roles.';
  end if;

  if target_user_id is null then
    raise exception 'Target user is required.';
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id) then
    select
      au.email,
      coalesce(
        au.raw_user_meta_data ->> 'full_name',
        au.raw_user_meta_data ->> 'name'
      )
    into auth_email, auth_full_name
    from auth.users au
    where au.id = target_user_id;

    insert into public.profiles (
      id,
      full_name,
      email,
      role,
      company,
      location,
      bio,
      kyc_level,
      avatar_url,
      phone,
      website
    )
    values (
      target_user_id,
      coalesce(nullif(trim(target_full_name), ''), nullif(trim(auth_full_name), ''), 'User'),
      coalesce(nullif(trim(target_email), ''), nullif(trim(auth_email), ''), ''),
      normalized_role,
      '',
      '',
      '',
      0,
      null,
      '',
      ''
    );
  else
    update public.profiles
    set
      role = normalized_role,
      email = case
        when coalesce(trim(email), '') = '' and coalesce(trim(target_email), '') <> '' then trim(target_email)
        else email
      end,
      full_name = case
        when coalesce(trim(full_name), '') = '' and coalesce(trim(target_full_name), '') <> '' then trim(target_full_name)
        else full_name
      end
    where id = target_user_id;
  end if;

  select *
  into updated_profile
  from public.profiles
  where id = target_user_id;

  return updated_profile;
end;
$$;

revoke all on function public.assign_user_role(uuid, text, text, text) from public;
grant execute on function public.assign_user_role(uuid, text, text, text) to authenticated;
