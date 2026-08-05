-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.is_admin()  ->  20260615000200_app_settings.sql
--   public.review_kyc_application()  ->  20260718000400_kyc_level_clamp.sql
--
-- Applying migrations in order from empty is fine: the later file lands last.
-- Running this one ON ITS OWN is what reverts. This marker is maintained by
-- src/test/services/migrationSupersession.test.js — do not delete it by hand.
-- ============================================================================

-- KYC (Know Your Customer) verification flow.
--
-- profiles.kyc_level already exists but was never populated or enforced. This
-- adds an application + admin-review workflow that sets kyc_level, which the
-- app then checks before allowing trading (buyer–seller KYC integration).

create table if not exists public.kyc_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  level_requested integer not null default 1,
  full_name text,
  id_document_type text,
  id_document_url text,
  organization text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_kyc_user on public.kyc_applications(user_id);
create index if not exists idx_kyc_status on public.kyc_applications(status);

alter table public.kyc_applications enable row level security;

-- admin-only helper (KYC review is an admin responsibility, not verifier)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.canonicalize_notification_role(public.current_user_role()) = 'admin'
$$;

grant execute on function public.is_admin() to authenticated;

-- Users manage their own applications; admins can read/update all.
drop policy if exists kyc_select on public.kyc_applications;
create policy kyc_select on public.kyc_applications
  for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists kyc_insert on public.kyc_applications;
create policy kyc_insert on public.kyc_applications
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists kyc_update on public.kyc_applications;
create policy kyc_update on public.kyc_applications
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Admin review: approve/reject an application and (on approve) set the user's
-- kyc_level on their profile.
create or replace function public.review_kyc_application(
  p_application_id uuid,
  p_approve boolean,
  p_notes text default ''
)
returns public.kyc_applications
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app public.kyc_applications;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can review KYC applications';
  end if;

  update public.kyc_applications
    set status = case when p_approve then 'approved' else 'rejected' end,
        reviewed_by = auth.uid(),
        reviewed_at = now(),
        review_notes = p_notes
  where id = p_application_id
  returning * into v_app;

  if v_app.id is null then
    raise exception 'KYC application not found';
  end if;

  if p_approve then
    update public.profiles
      set kyc_level = v_app.level_requested
    where id = v_app.user_id;
  end if;

  return v_app;
end;
$$;

grant execute on function public.review_kyc_application(uuid, boolean, text) to authenticated;
