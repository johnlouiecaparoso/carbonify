-- ============================================================================
-- The two cross-user notifications that 20260802000400 left with no path.
--
-- WHAT WENT WRONG
--   20260802000400 tightened the system_notifications INSERT policy from
--     with check (auth.uid() is not null)   -- anyone, for ANYONE
--   to
--     with check (auth.uid() = user_id)     -- anyone, for THEMSELVES
--   and its header states: "The three remaining direct client inserts are all
--   self-addressed — MRV reminders, saved-search matches, watchlist price
--   drops". That inventory was incomplete. Two live client paths address
--   somebody else and have been rejected ever since:
--
--     notificationService.notifyRoleApplicationDecision
--       <- roleApplicationService.updateRoleApplicationStatus
--       The reviewer inserts a row addressed to the APPLICANT.
--       Observed live 2026-08-06 approving a project_developer:
--         403 "new row violates row-level security policy for table
--              system_notifications"
--
--     notificationService.notifyProjectComment
--       <- projectCommentService (posting a comment)
--       Notifies the project owner, or the reviewers, never the author.
--
--   Both call sites wrap the failure in a non-fatal catch, so neither raised
--   anything a user or Sentry would see. An approved developer was simply never
--   told, and a commented-on project owner was never told. This is the exact
--   failure shape 20260802000400's own header warned about — it just did not
--   count these two among the callers it was describing.
--
-- WHY TRIGGERS RATHER THAN AN RPC
--   notify_counterparty (20260802000300) is the sanctioned cross-user path, but
--   it resolves parties only for 'biomass_rfq' and 'farmer_delivery' — a role
--   application has no counterparty in that sense, and a comment's audience is
--   decided by is_internal + author role rather than by two named parties.
--   Both events are already a row hitting a table, so a SECURITY DEFINER trigger
--   is the smaller mechanism: the recipient is derived from the row server-side,
--   nothing is caller-supplied, and the client stops inserting entirely.
--
--   This is the same reasoning 20260626000200 recorded when the client-side
--   project-submission notification was rejected by RLS and became a trigger.
--
-- WHAT THIS ADDS
--   notify_role_application_decision_trigger()  AFTER UPDATE ON role_applications
--     Fires only when `status` actually changes into 'approved' or 'rejected'.
--     Complements trg_notify_role_application, which is AFTER INSERT only and
--     therefore covers the submission but never the decision.
--
--   notify_project_comment_trigger()            AFTER INSERT ON project_comments
--     Mirrors notifyProjectComment's audience rules exactly:
--       is_internal      -> verifiers + admins, author excluded, never the owner
--       reviewer author  -> the project owner
--       owner author     -> verifiers + admins, author excluded
--
-- Both are SECURITY DEFINER and so are not subject to the INSERT policy at all,
-- exactly like the five notify_* triggers already live.
--
-- Additive: no policy, table or existing function is changed. Idempotent.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- §PRE-FLIGHT — confirms this file is fixing the problem it claims to.
--
--   select policyname, with_check
--     from pg_policies
--    where schemaname = 'public' and tablename = 'system_notifications'
--      and cmd = 'INSERT';
--
-- Expected: with_check = (auth.uid() = user_id). If it still reads
-- (auth.uid() IS NOT NULL) then 20260802000400 was never applied, the client
-- inserts are not actually failing, and applying this file would give you two
-- notifications per event instead of one. Stop and reconcile first.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- ── role application decisions ──────────────────────────────────────────────
create or replace function public.notify_role_application_decision_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requested_role text;
  v_role_label text;
  v_approved boolean;
begin
  -- Only a real transition counts. An UPDATE that rewrites admin_notes or
  -- reviewed_at on an already-approved row must not re-notify.
  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status not in ('approved', 'rejected') then
    return new;
  end if;

  -- An application submitted without an account has nobody to notify in-app;
  -- that applicant is reached by email instead (send-approval-email).
  if new.user_id is null then
    return new;
  end if;

  v_requested_role := public.canonicalize_notification_role(new.role_requested);
  v_role_label := case v_requested_role
                    when 'verifier' then 'Verifier'
                    when 'farmer' then 'Farmer'
                    else 'Project Developer'
                  end;
  v_approved := new.status = 'approved';

  insert into public.system_notifications (
    user_id, type, title, message, link, metadata, is_read
  ) values (
    new.user_id,
    'role_application_status',
    case when v_approved
         then 'Your specialist account was approved'
         else 'Your specialist account was rejected' end,
    case when v_approved
         then format('Your %s application has been approved. You can now use your verified account features.', v_role_label)
         else format('Your %s application was rejected. Please check your email or contact Carbonify support for next steps.', v_role_label)
    end,
    '/profile',
    jsonb_build_object(
      'application_id', new.id,
      'requested_role', new.role_requested,
      'status', new.status
    ),
    false
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_role_application_decision on public.role_applications;
create trigger trg_notify_role_application_decision
after update on public.role_applications
for each row
execute function public.notify_role_application_decision_trigger();

-- ── project comments ────────────────────────────────────────────────────────
create or replace function public.notify_project_comment_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_title text;
  v_owner_id uuid;
  v_author_role text;
  v_is_reviewer boolean;
  v_snippet text;
begin
  select coalesce(nullif(btrim(p.title), ''), 'a project'), p.user_id
    into v_project_title, v_owner_id
    from public.projects p
   where p.id = new.project_id;

  if not found then
    return new;
  end if;

  -- author_role is a snapshot taken at post time and may be null on older rows;
  -- fall back to the author's current role rather than silently mis-routing.
  v_author_role := public.canonicalize_notification_role(
    coalesce(new.author_role, (select role from public.profiles where id = new.author_id))
  );
  v_is_reviewer := v_author_role in ('verifier', 'admin');

  -- Match the client's 140-character preview, whitespace collapsed.
  v_snippet := left(btrim(regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g')), 140);
  if v_snippet = '' then
    return new;
  end if;

  if new.is_internal then
    -- Reviewer-only note. The owner must never see it, not even as a bell.
    insert into public.system_notifications (
      user_id, type, title, message, link, metadata, is_read
    )
    select
      recipient.user_id,
      'project_comment',
      format('Internal note on "%s"', v_project_title),
      v_snippet,
      '/verifier',
      jsonb_build_object('project_id', new.project_id, 'internal', true),
      false
    from public.resolve_notification_recipient_ids(
      null,
      array['verifier', 'admin'],
      array[new.author_id]
    ) as recipient;

  elsif v_is_reviewer then
    -- A reviewer commented → tell the owner.
    if v_owner_id is null or v_owner_id = new.author_id then
      return new;
    end if;

    insert into public.system_notifications (
      user_id, type, title, message, link, metadata, is_read
    ) values (
      v_owner_id,
      'project_comment',
      format('New comment on "%s"', v_project_title),
      v_snippet,
      '/developer/projects',
      jsonb_build_object('project_id', new.project_id),
      false
    );

  else
    -- The developer/owner replied → tell the reviewers.
    insert into public.system_notifications (
      user_id, type, title, message, link, metadata, is_read
    )
    select
      recipient.user_id,
      'project_comment',
      format('New developer reply on "%s"', v_project_title),
      v_snippet,
      '/verifier',
      jsonb_build_object('project_id', new.project_id),
      false
    from public.resolve_notification_recipient_ids(
      null,
      array['verifier', 'admin'],
      array[new.author_id]
    ) as recipient;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_project_comment on public.project_comments;
create trigger trg_notify_project_comment
after insert on public.project_comments
for each row
execute function public.notify_project_comment_trigger();

commit;

comment on function public.notify_role_application_decision_trigger() is
  'Notifies the applicant when their role application is approved or rejected. '
  'Replaces notificationService.notifyRoleApplicationDecision, which the '
  '20260802000400 INSERT policy rejects because the reviewer is not the recipient.';
comment on function public.notify_project_comment_trigger() is
  'Notifies the project owner or the reviewers when a comment is posted. '
  'Replaces notificationService.notifyProjectComment, rejected by the same policy.';

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFY — run after applying. Every row must read PASS.
-- ============================================================================
-- select 'decision trigger installed' as check,
--        case when count(*) = 1 then 'PASS' else 'FAIL' end as verdict
--   from pg_trigger
--  where tgrelid = 'public.role_applications'::regclass
--    and tgname = 'trg_notify_role_application_decision'
-- union all
-- select 'comment trigger installed',
--        case when count(*) = 1 then 'PASS' else 'FAIL' end
--   from pg_trigger
--  where tgrelid = 'public.project_comments'::regclass
--    and tgname = 'trg_notify_project_comment'
-- union all
-- select 'both run as definer',
--        case when bool_and(prosecdef) then 'PASS' else 'FAIL' end
--   from pg_proc
--  where proname in ('notify_role_application_decision_trigger',
--                    'notify_project_comment_trigger')
-- union all
-- select 'both pin search_path',
--        case when bool_and(array_to_string(proconfig, ',') like '%search_path%')
--             then 'PASS' else 'FAIL' end
--   from pg_proc
--  where proname in ('notify_role_application_decision_trigger',
--                    'notify_project_comment_trigger');
--
-- BEHAVIOURAL CHECK, worth more than the four rows above:
--   (1) Approve a project_developer application in the verifier panel. The
--       applicant's bell must ring. Before this file, the console showed
--       403 "new row violates row-level security policy" and nothing arrived.
--   (2) Approve a SECOND time / edit the notes on an already-approved row.
--       No new notification — the status did not transition.
--   (3) Post a verifier comment on a project; the owner's bell rings.
--       Post an INTERNAL note; the owner's bell must stay silent.
-- ============================================================================
