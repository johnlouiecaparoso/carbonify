-- ============================================================================
-- DPA admin queue — give the data-subject request queue a reader.
--
-- Closes docs/role-needs/04-admin.md #6 (the DPA half). Every link in this chain
-- was already built EXCEPT the one that makes it legally meaningful:
--
--   * users can request export/deletion            (PrivacyDataPanel)      ✅
--   * requests persist with admin-action columns   (20260626000000)        ✅
--     — notes ("admin-facing processing notes"), processed_at, processed_by
--   * RLS already grants admins select + update on every row               ✅
--   * an index idx_dsr_open exists specifically for the pending queue      ✅
--   * an account-deletion worker performs the erasure                      ✅
--   * ...no admin surface, and no admin function anywhere                  ❌
--
-- dataPrivacyService exported only exportMyData / downloadMyData /
-- requestAccountDeletion / getMyDataRequests / cancelDeletionRequest — all
-- user-facing. The 20260626000000 header asserts "admins can see and action
-- all" and "the actual erasure is performed by an admin"; neither was true.
-- There was an index serving a queue nobody could read.
--
-- Under the Data Privacy Act of 2012 a deletion request starts a clock. The
-- platform was accepting the request, recording it, and showing it to no one --
-- worse than not offering the right at all.
--
-- WHY THIS DOES NOT ERASE ANYTHING
-- The account-deletion edge function is gated by a shared secret sent as
-- x-worker-secret, so a browser must never hold it. This RPC therefore manages
-- the WORKFLOW only -- triage, notes, status -- and the erasure continues to run
-- in the worker (by cron, or by an operator holding the secret). The admin view
-- says so explicitly rather than offering a button that cannot do what it
-- implies.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

-- ── Admin actions a request can be moved through ────────────────────────────
-- 'cancelled' is deliberately absent: withdrawing a request belongs to the data
-- subject (cancel_data_subject_request), not to the admin reviewing it.
create or replace function public.process_data_subject_request(
  p_id     uuid,
  p_status text,
  p_notes  text default null
)
returns public.data_subject_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.data_subject_requests;
begin
  if not public.is_admin() then
    raise exception 'Only administrators can action data-subject requests'
      using errcode = 'insufficient_privilege';
  end if;

  if p_status not in ('in_progress', 'completed', 'rejected') then
    raise exception 'Status must be in_progress, completed or rejected';
  end if;

  -- A rejection is a refusal to honour a statutory right, so it has to carry a
  -- reason on the record.
  if p_status = 'rejected' and coalesce(btrim(p_notes), '') = '' then
    raise exception 'A rejection must include a reason';
  end if;

  select * into v_row from public.data_subject_requests where id = p_id for update;
  if not found then
    raise exception 'Request not found';
  end if;

  -- Once the subject has withdrawn it, or it is already closed, it is not the
  -- admin's to reopen.
  if v_row.status in ('cancelled', 'completed') then
    raise exception 'This request is already %', v_row.status;
  end if;

  update public.data_subject_requests
     set status       = p_status,
         notes        = coalesce(nullif(btrim(p_notes), ''), notes),
         processed_by = auth.uid(),
         -- Only a terminal state stamps a processing time; in_progress is an
         -- acknowledgement, not a completion.
         processed_at = case when p_status in ('completed', 'rejected') then now() else processed_at end,
         updated_at   = now()
   where id = p_id
   returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.process_data_subject_request(uuid, text, text) from public;
grant execute on function public.process_data_subject_request(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- AFTER APPLYING, TEST:
--   (1) an admin sees pending export + deletion requests in /admin/privacy;
--   (2) marking one in_progress records processed_by but leaves processed_at
--       null; completing it stamps processed_at;
--   (3) rejecting without a reason is refused;
--   (4) a non-admin calling the RPC is refused;
--   (5) a request the user has cancelled cannot be actioned.
--
-- ROLLBACK
--   drop function if exists public.process_data_subject_request(uuid, text, text);
--   notify pgrst, 'reload schema';
-- ============================================================================
