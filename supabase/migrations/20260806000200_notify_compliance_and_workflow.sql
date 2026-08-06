-- ============================================================================
-- The eight role-to-role handoffs that notified NOBODY.
--
-- WHAT THIS IS
--   A notification audit across every role in the system, not another one-off.
--   Before this file the bell covered projects, role applications, marketplace
--   listings, project comments, and the farmer<->buyer feedstock path
--   (notify_counterparty). Everything else was silent — including both queues
--   that gate money and both that gate identity.
--
--   Nine services were checked and none of them notified anyone:
--     kycService  kybService  monitoringService  endorsementService
--     supportReportService  dataPrivacyService  payoutService  disputeService
--     amlService
--
--   The pattern is consistent and worth naming: **notifications were built for
--   the things a buyer sees, and skipped for the things staff act on.** Every
--   queue below is one where somebody is waiting on a human, and the human was
--   never told there was anything to do. An unreviewed KYB leaves a seller
--   unable to withdraw; an unreviewed MRV report is credits that never mint.
--
-- WHY TRIGGERS, AGAIN
--   All eight are cross-user by definition — the person who acts is never the
--   person who needs to hear about it. 20260802000400 restricted client inserts
--   into system_notifications to rows you address to yourself, so a client-side
--   version of any of these would fail 403 exactly like the two that
--   20260806000100 had to rescue. SECURITY DEFINER triggers derive the recipient
--   from the row and are not subject to that policy.
--
-- WHAT IS COVERED, BY ROLE
--   buyer / general_user  KYC decision, dispute raised + resolved, DSR processed
--   project_developer     KYB decision, MRV decision, LGU endorsement, payout
--   verifier              MRV report submitted for review
--   lgu_user              (endorses; the developer is the one notified)
--   farmer                payout settled/failed  (deliveries already covered)
--   admin                 KYC, KYB, MRV, support, DSR, payout, dispute inbound
--
-- Additive: no policy, table or existing function is changed. Idempotent.
-- ============================================================================

begin;

-- ── shared helper ───────────────────────────────────────────────────────────
-- Every trigger below needs "tell the admins". Written once so a change to what
-- 'admin' means does not have to be found in eight places.
create or replace function public.notify_admins(
  p_type text,
  p_title text,
  p_message text,
  p_link text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_exclude uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_message), '') = '' then
    return 0;
  end if;

  insert into public.system_notifications (
    user_id, type, title, message, link, metadata, is_read
  )
  select
    recipient.user_id,
    coalesce(nullif(btrim(p_type), ''), 'system'),
    left(btrim(p_title), 200),
    left(btrim(p_message), 1000),
    nullif(btrim(coalesce(p_link, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    false
  from public.resolve_notification_recipient_ids(
    null,
    array['admin'],
    case when p_exclude is null then null else array[p_exclude] end
  ) as recipient;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Same, for one named recipient. Skips silently on a null id so a trigger never
-- has to guard the call.
create or replace function public.notify_one(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_link text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return 0;
  end if;
  if coalesce(btrim(p_title), '') = '' or coalesce(btrim(p_message), '') = '' then
    return 0;
  end if;

  insert into public.system_notifications (
    user_id, type, title, message, link, metadata, is_read
  ) values (
    p_user_id,
    coalesce(nullif(btrim(p_type), ''), 'system'),
    left(btrim(p_title), 200),
    left(btrim(p_message), 1000),
    nullif(btrim(coalesce(p_link, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    false
  );
  return 1;
end;
$$;

-- ── 1/2. KYC — identity verification, gates BUYING ──────────────────────────
create or replace function public.notify_kyc_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(btrim(new.full_name), ''),
    (select nullif(btrim(full_name), '') from public.profiles where id = new.user_id),
    'A user'
  );

  if tg_op = 'INSERT' then
    perform public.notify_admins(
      'kyc_submitted',
      'New KYC application',
      format('%s submitted an identity verification request (level %s).', v_name, new.level_requested),
      '/admin/kyc',
      jsonb_build_object('application_id', new.id, 'user_id', new.user_id),
      new.user_id
    );
    return new;
  end if;

  -- UPDATE: only a real transition into a decision.
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('approved', 'rejected') then
    return new;
  end if;

  perform public.notify_one(
    new.user_id,
    'kyc_decision',
    case when new.status = 'approved'
         then 'Your identity verification was approved'
         else 'Your identity verification needs attention' end,
    case when new.status = 'approved'
         then 'You can now buy and retire carbon credits.'
         else coalesce(
                nullif(btrim(new.review_notes), ''),
                'Your verification was not approved. Please review your documents and submit again.'
              ) end,
    '/kyc',
    jsonb_build_object('application_id', new.id, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_kyc on public.kyc_applications;
create trigger trg_notify_kyc
after insert or update of status on public.kyc_applications
for each row
execute function public.notify_kyc_trigger();

-- ── 3/4. KYB — business verification, gates WITHDRAWING ─────────────────────
create or replace function public.notify_kyb_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_admins(
      'kyb_submitted',
      'New KYB application',
      format('%s submitted a business verification request.',
             coalesce(nullif(btrim(new.business_name), ''), 'A business')),
      '/admin/kyb',
      jsonb_build_object('application_id', new.id, 'user_id', new.user_id),
      new.user_id
    );
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('approved', 'rejected') then
    return new;
  end if;

  perform public.notify_one(
    new.user_id,
    'kyb_decision',
    case when new.status = 'approved'
         then 'Your business verification was approved'
         else 'Your business verification needs attention' end,
    case when new.status = 'approved'
         then 'You can now withdraw your sale proceeds.'
         else coalesce(
                nullif(btrim(new.review_notes), ''),
                'Your business verification was not approved. Please review your documents and submit again.'
              ) end,
    '/kyc',
    jsonb_build_object('application_id', new.id, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_kyb on public.kyb_applications;
create trigger trg_notify_kyb
after insert or update of status on public.kyb_applications
for each row
execute function public.notify_kyb_trigger();

-- ── 5. MRV monitoring reports — developer <-> verifier ──────────────────────
-- The single most consequential queue in the product: approving a report is what
-- MINTS credits. It notified nobody in either direction.
create or replace function public.notify_monitoring_report_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_title text;
  v_owner_id uuid;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  select coalesce(nullif(btrim(p.title), ''), 'a project'), p.user_id
    into v_project_title, v_owner_id
    from public.projects p
   where p.id = new.project_id;

  if new.status = 'submitted' then
    -- To the reviewers.
    insert into public.system_notifications (
      user_id, type, title, message, link, metadata, is_read
    )
    select
      recipient.user_id,
      'mrv_submitted',
      format('MRV report submitted for "%s"', v_project_title),
      format('A monitoring report claiming %s tCO2e is waiting for verification.',
             round(coalesce(new.proposed_vers, 0), 2)),
      '/verifier',
      jsonb_build_object('report_id', new.id, 'project_id', new.project_id),
      false
    from public.resolve_notification_recipient_ids(
      null,
      array['verifier', 'admin'],
      case when new.submitted_by is null then null else array[new.submitted_by] end
    ) as recipient;

  elsif new.status in ('approved', 'rejected') then
    -- To the developer who filed it (or the project owner if that is unset).
    perform public.notify_one(
      coalesce(new.submitted_by, v_owner_id),
      'mrv_decision',
      case when new.status = 'approved'
           then format('MRV report approved for "%s"', v_project_title)
           else format('MRV report rejected for "%s"', v_project_title) end,
      case when new.status = 'approved'
           then format('%s tCO2e verified. The credits have been issued and can be listed.',
                       round(coalesce(new.proposed_vers, 0), 2))
           else coalesce(
                  nullif(btrim(new.review_notes), ''),
                  'The report was not approved. Please review the verifier notes and resubmit.'
                ) end,
      '/monitoring',
      jsonb_build_object('report_id', new.id, 'project_id', new.project_id, 'status', new.status)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notify_monitoring_report on public.monitoring_reports;
create trigger trg_notify_monitoring_report
after update of status on public.monitoring_reports
for each row
execute function public.notify_monitoring_report_trigger();

-- ── 6. LGU endorsement — lgu_user -> project_developer ──────────────────────
-- An endorsement row IS the decision (there is no separate request row), so the
-- only notification is outbound to the project owner.
create or replace function public.notify_project_endorsement_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_title text;
  v_owner_id uuid;
  v_lgu_name text;
begin
  select coalesce(nullif(btrim(p.title), ''), 'your project'), p.user_id
    into v_project_title, v_owner_id
    from public.projects p
   where p.id = new.project_id;

  if v_owner_id is null or v_owner_id = new.lgu_user_id then
    return new;
  end if;

  v_lgu_name := coalesce(
    (select nullif(btrim(full_name), '') from public.profiles where id = new.lgu_user_id),
    'Your local government unit'
  );

  perform public.notify_one(
    v_owner_id,
    'project_endorsement',
    case when new.decision = 'endorsed'
         then format('"%s" was endorsed by your LGU', v_project_title)
         else format('"%s" was not endorsed by your LGU', v_project_title) end,
    case when new.decision = 'endorsed'
         then format('%s endorsed your project.', v_lgu_name)
         else coalesce(
                nullif(btrim(new.notes), ''),
                format('%s declined to endorse your project.', v_lgu_name)
              ) end,
    '/developer/projects',
    jsonb_build_object('project_id', new.project_id, 'decision', new.decision)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_project_endorsement on public.project_endorsements;
create trigger trg_notify_project_endorsement
after insert or update of decision on public.project_endorsements
for each row
execute function public.notify_project_endorsement_trigger();

-- ── 7. Support reports — any role -> admin, and back ────────────────────────
create or replace function public.notify_support_report_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_admins(
      'support_report',
      format('New %s report', coalesce(nullif(btrim(new.category), ''), 'support')),
      coalesce(nullif(btrim(new.subject), ''), 'A user reported a problem.'),
      '/admin',
      jsonb_build_object('report_id', new.id, 'category', new.category),
      new.user_id
    );
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;
  -- The two terminal states supportReportService.updateSupportReport stamps
  -- resolved_at for. 'open' and anything in between are not worth a bell.
  if new.status not in ('resolved', 'wont_fix') then
    return new;
  end if;

  perform public.notify_one(
    new.user_id,
    'support_report_update',
    case when new.status = 'resolved'
         then 'Your report has been resolved'
         else 'Your report has been reviewed' end,
    coalesce(
      nullif(btrim(new.admin_notes), ''),
      case when new.status = 'resolved'
           then format('Your report "%s" has been resolved.',
                       coalesce(nullif(btrim(new.subject), ''), 'support request'))
           else format('Your report "%s" was reviewed and will not be actioned.',
                       coalesce(nullif(btrim(new.subject), ''), 'support request')) end
    ),
    '/disputes',
    jsonb_build_object('report_id', new.id, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_support_report on public.support_reports;
create trigger trg_notify_support_report
after insert or update of status on public.support_reports
for each row
execute function public.notify_support_report_trigger();

-- ── 8. Data subject requests — a legal clock, previously invisible ──────────
create or replace function public.notify_data_subject_request_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_admins(
      'dsr_submitted',
      format('New data %s request', new.request_type),
      format('A user submitted a data %s request under the Data Privacy Act.', new.request_type),
      '/admin/privacy',
      jsonb_build_object('request_id', new.id, 'request_type', new.request_type),
      new.user_id
    );
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('completed', 'rejected', 'cancelled') then
    return new;
  end if;

  perform public.notify_one(
    new.user_id,
    'dsr_decision',
    format('Your data %s request is %s', new.request_type, new.status),
    coalesce(
      nullif(btrim(new.notes), ''),
      format('Your %s request has been marked %s.', new.request_type, new.status)
    ),
    '/profile',
    jsonb_build_object('request_id', new.id, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_data_subject_request on public.data_subject_requests;
create trigger trg_notify_data_subject_request
after insert or update of status on public.data_subject_requests
for each row
execute function public.notify_data_subject_request_trigger();

-- ── 9. Payouts — this is somebody's money leaving or failing to ─────────────
create or replace function public.notify_payout_request_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_admins(
      'payout_requested',
      'New payout request',
      format('A seller requested a payout of %s %s.',
             new.currency, to_char(new.amount, 'FM999,999,999,990.00')),
      '/admin/finance',
      jsonb_build_object('payout_id', new.id, 'seller_id', new.seller_id),
      new.seller_id
    );
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('settled', 'failed') then
    return new;
  end if;

  perform public.notify_one(
    new.seller_id,
    'payout_status',
    case when new.status = 'settled' then 'Your payout has been sent'
         else 'Your payout could not be completed' end,
    case when new.status = 'settled'
         then format('%s %s is on its way to your account.',
                     new.currency, to_char(new.amount, 'FM999,999,999,990.00'))
         else coalesce(
                nullif(btrim(new.failure_reason), ''),
                'The transfer failed. Please check your payout details and try again.'
              ) end,
    '/sales',
    jsonb_build_object('payout_id', new.id, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_payout_request on public.payout_requests;
create trigger trg_notify_payout_request
after insert or update of status on public.payout_requests
for each row
execute function public.notify_payout_request_trigger();

-- ── 10. Disputes — a buyer contesting a purchase ────────────────────────────
create or replace function public.notify_dispute_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_admins(
      'dispute_raised',
      'New transaction dispute',
      coalesce(nullif(btrim(new.reason), ''), 'A buyer disputed a transaction.'),
      '/admin/refunds',
      jsonb_build_object('dispute_id', new.id, 'transaction_id', new.transaction_id),
      new.raised_by
    );
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status not in ('resolved_refunded', 'resolved_rejected') then
    return new;
  end if;

  perform public.notify_one(
    new.raised_by,
    'dispute_resolved',
    case when new.status = 'resolved_refunded'
         then 'Your dispute was resolved — refund issued'
         else 'Your dispute was reviewed and declined' end,
    coalesce(
      nullif(btrim(new.resolution_notes), ''),
      case when new.status = 'resolved_refunded'
           then 'Your refund has been approved and processed.'
           else 'After review, the transaction was found to be valid.' end
    ),
    '/disputes',
    jsonb_build_object('dispute_id', new.id, 'status', new.status)
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_dispute on public.disputes;
create trigger trg_notify_dispute
after insert or update of status on public.disputes
for each row
execute function public.notify_dispute_trigger();

commit;

-- Helpers are called only by the trigger functions above, which are all
-- SECURITY DEFINER and run as the owner. No client role needs EXECUTE, and
-- granting it would hand any signed-in user a way to write a notification into
-- anyone else's bell — the exact hole 20260802000400 closed.
revoke all on function public.notify_admins(text, text, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.notify_one(uuid, text, text, text, text, jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFY — run after applying. Every row must read PASS.
-- ============================================================================
-- select 'all 8 triggers installed' as check,
--        case when count(*) = 8 then 'PASS' else 'FAIL: ' || count(*) end as verdict
--   from pg_trigger
--  where tgname in ('trg_notify_kyc', 'trg_notify_kyb', 'trg_notify_monitoring_report',
--                   'trg_notify_project_endorsement', 'trg_notify_support_report',
--                   'trg_notify_data_subject_request', 'trg_notify_payout_request',
--                   'trg_notify_dispute')
-- union all
-- select 'all run as definer with a pinned search_path',
--        case when bool_and(prosecdef and array_to_string(proconfig, ',') like '%search_path%')
--             then 'PASS' else 'FAIL' end
--   from pg_proc
--  where proname in ('notify_admins', 'notify_one', 'notify_kyc_trigger', 'notify_kyb_trigger',
--                    'notify_monitoring_report_trigger', 'notify_project_endorsement_trigger',
--                    'notify_support_report_trigger', 'notify_data_subject_request_trigger',
--                    'notify_payout_request_trigger', 'notify_dispute_trigger')
-- union all
-- select 'helpers are NOT callable by anon or authenticated',
--        case when bool_or(has_function_privilege('anon', p.oid, 'EXECUTE')
--                          or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
--             then 'FAIL' else 'PASS' end
--   from pg_proc p
--  where p.proname in ('notify_admins', 'notify_one');
--
-- BEHAVIOURAL CHECK, worth more than the three rows above. As an admin, watch
-- the bell while a second account:
--   (1) submits KYC          -> admin notified;   approve it -> that user notified
--   (2) submits KYB          -> admin notified;   approve it -> that user notified
--   (3) submits an MRV report-> VERIFIER notified; approve it -> developer notified
--   (4) files a support report -> admin notified
-- and confirm that re-saving any of those rows WITHOUT changing status produces
-- no second notification.
-- ============================================================================
