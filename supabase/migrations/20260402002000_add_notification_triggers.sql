-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.notify_role_application_trigger()  ->  20260711000000_farmer_portal.sql
--
-- Applying migrations in order from empty is fine: the later file lands last.
-- Running this one ON ITS OWN is what reverts. This marker is maintained by
-- src/test/services/migrationSupersession.test.js — do not delete it by hand.
-- ============================================================================

create or replace function public.insert_system_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_link text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  if p_user_id is null then
    return null;
  end if;

  if btrim(coalesce(p_title, '')) = '' or btrim(coalesce(p_message, '')) = '' then
    return null;
  end if;

  insert into public.system_notifications (
    user_id,
    type,
    title,
    message,
    link,
    metadata,
    is_read
  ) values (
    p_user_id,
    coalesce(p_type, 'system'),
    p_title,
    p_message,
    p_link,
    coalesce(p_metadata, '{}'::jsonb),
    false
  )
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

create or replace function public.notify_project_submission_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  -- Only trigger notifications when a project is submitted (not drafts or other states)
  if new.status is distinct from 'submitted' then
    return new;
  end if;

  v_title := coalesce(new.title, 'Untitled Project');

  insert into public.system_notifications (
    user_id,
    type,
    title,
    message,
    link,
    metadata,
    is_read
  )
  select
    recipient.user_id,
    'project_submission',
    'New project submitted for verification',
    format('Project "%s" is waiting for review.', v_title),
    '/admin',
    jsonb_build_object(
      'project_id', new.id,
      'status', coalesce(new.status, 'submitted')
    ),
    false
  from public.resolve_notification_recipient_ids(
    null,
    array['admin','verifier'],
    array[new.user_id]
  ) as recipient;

  return new;
end;
$$;

drop trigger if exists trg_notify_project_submission on public.projects;
create trigger trg_notify_project_submission
after insert on public.projects
for each row
execute function public.notify_project_submission_trigger();

create or replace function public.notify_project_status_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_title text;
begin
  v_status := lower(coalesce(new.status, ''));
    -- Handle validation outcomes: validated, needs_revision, rejected
    if v_status not in ('validated', 'needs_revision', 'rejected') then
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  v_title := coalesce(new.title, 'Untitled Project');

  perform public.insert_system_notification(
    new.user_id,
    'project_status',
      case
        when v_status = 'validated' then 'Your project was validated'
        when v_status = 'needs_revision' then 'Project requires revisions'
        else 'Your project was rejected'
      end,
    format('Project "%s" is now %s.%s', v_title, v_status, case when coalesce(btrim(new.verification_notes), '') = '' then '' else format(' Notes: %s', btrim(new.verification_notes)) end),
    '/developer/projects',
    jsonb_build_object(
      'project_id', new.id,
      'status', v_status,
      'reviewer_id', new.verified_by
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_project_status on public.projects;
create trigger trg_notify_project_status
after update of status on public.projects
for each row
execute function public.notify_project_status_trigger();

create or replace function public.notify_role_application_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_role text;
  v_role_label text;
  v_recipient_role text[];
begin
  v_requested_role := public.canonicalize_notification_role(new.role_requested);

  if v_requested_role not in ('verifier', 'project_developer') then
    return new;
  end if;

  v_role_label := case when v_requested_role = 'verifier' then 'Verifier' else 'Project Developer' end;
  v_recipient_role := case when v_requested_role = 'verifier' then array['admin'] else array['verifier'] end;

  insert into public.system_notifications (
    user_id,
    type,
    title,
    message,
    link,
    metadata,
    is_read
  )
  select
    recipient.user_id,
    'role_application_submission',
    format('New %s application', v_role_label),
    format('%s submitted a %s application for review.', coalesce(new.applicant_full_name, new.email, 'A new applicant'), v_role_label),
    case when v_requested_role = 'verifier' then '/admin' else '/verifier' end,
    jsonb_build_object(
      'application_id', new.id,
      'requested_role', new.role_requested,
      'applicant_email', new.email
    ),
    false
  from public.resolve_notification_recipient_ids(
    null,
    v_recipient_role,
    array[new.user_id]
  ) as recipient;

  return new;
end;
$$;

drop trigger if exists trg_notify_role_application on public.role_applications;
create trigger trg_notify_role_application
after insert on public.role_applications
for each row
execute function public.notify_role_application_trigger();

create or replace function public.notify_marketplace_listing_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_title text;
  v_project_owner uuid;
begin
  if new.status is distinct from 'active' then
    return new;
  end if;

  select p.title, p.user_id
    into v_project_title, v_project_owner
  from public.project_credits pc
  join public.projects p on p.id = pc.project_id
  where pc.id = new.project_credit_id;

  v_project_title := coalesce(v_project_title, 'Untitled Project');

  insert into public.system_notifications (
    user_id,
    type,
    title,
    message,
    link,
    metadata,
    is_read
  )
  select
    recipient.user_id,
    'marketplace_new_project',
    'New project available in marketplace',
    format('"%s" is now available for purchase.', v_project_title),
    '/marketplace',
    jsonb_build_object(
      'project_id', (select pc.project_id from public.project_credits pc where pc.id = new.project_credit_id),
      'listing_id', new.id
    ),
    false
  from public.resolve_notification_recipient_ids(
    null,
    array['general_user', 'buyer_investor', 'project_developer', 'admin'],
    array[v_project_owner]
  ) as recipient;

  if v_project_owner is not null then
    perform public.insert_system_notification(
      v_project_owner,
      'project_marketplace_live',
      'Your project is now live in the marketplace',
      format('Project "%s" now has an active marketplace listing.', v_project_title),
      '/developer/projects',
      jsonb_build_object(
        'project_credit_id', new.project_credit_id,
        'listing_id', new.id,
        'project_id', (select pc.project_id from public.project_credits pc where pc.id = new.project_credit_id)
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_marketplace_listing on public.credit_listings;
create trigger trg_notify_marketplace_listing
after insert on public.credit_listings
for each row
execute function public.notify_marketplace_listing_trigger();