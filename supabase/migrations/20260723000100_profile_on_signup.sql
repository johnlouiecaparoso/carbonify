-- Guarantee every auth user has a profile row.
--
-- Until now the profile was created from the browser, by authService's
-- registerWithEmail() calling createProfile() immediately after signUp(). That
-- works only when signUp returns a session. With email confirmation enabled it
-- does not: there is no authenticated user yet, so the INSERT is refused by the
-- profiles RLS policy (which requires auth.uid() = id). The client caught the
-- error and logged a warning, and the account was created with no profile.
--
-- The symptoms landed far from the cause. userStore._performProfileFetch()
-- treats a null profile as "no role", so the user silently became a
-- general_user; the header showed "User"; the profile page rendered blanks.
-- Nothing surfaced the original failure.
--
-- The same gap exists for OAuth and phone sign-ups, which never go through
-- registerWithEmail at all — ensureUserProfile() patches those up on the next
-- page load, which is a race, not a guarantee.
--
-- A trigger on auth.users is the only place that can hold the invariant: it
-- runs inside the signup transaction, as the definer, before any session
-- exists. The client-side calls are now belt-and-braces rather than the
-- mechanism.

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role, kyc_level)
  values (
    new.id,
    new.email,
    -- Signup metadata carries whichever key the client used; fall back to the
    -- local part of the email so a profile is never nameless.
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'User'
    ),
    -- Always the least-privileged role. Elevation happens only through
    -- assign_user_role(), which is admin-gated; trusting a role supplied in
    -- signup metadata would let anyone register themselves as an admin.
    'general_user',
    0
  )
  on conflict (id) do nothing;

  return new;
exception
  when others then
    -- A failure here must never block the signup itself. The client's
    -- ensureUserProfile() remains as a second chance.
    raise warning 'handle_new_auth_user failed for %: %', new.id, sqlerrm;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user();

-- Backfill accounts that registered while the gap was open. `on conflict do
-- nothing` above and the left join here both make this safe to re-run.
insert into public.profiles (id, email, full_name, role, kyc_level)
select
  u.id,
  u.email,
  coalesce(
    nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'User'
  ),
  'general_user',
  0
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;
