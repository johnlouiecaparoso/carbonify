-- ============================================================================
-- 🔴 DO NOT APPLY THIS UNTIL THE FRONTEND USING `notify_counterparty` IS LIVE.
--
-- DEFERRED_BACKLOG #36 — step 3 of 3. This is the one that actually closes the
-- hole. Steps 1 and 2 (the RPC in 20260802000300, and the client changes that
-- call it) are additive and change no behaviour; this one takes something away.
--
--   1. Apply 20260802000300_notify_counterparty_rpc.sql   ← additive
--   2. Deploy the frontend                                 ← starts using it
--   3. Apply THIS file                                     ← closes the hole
--
-- APPLYING THIS EARLY FAILS SILENTLY, WHICH IS WHY THE ORDER IS SHOUTED ABOUT.
-- Every cross-user notification in the client is wrapped in a non-fatal
-- try/catch (`console.warn('… notify failed (non-fatal)')`). So on the old
-- frontend this policy does not raise anything a user sees — a farmer simply
-- stops being told their delivery was confirmed, and a supplier stops being
-- told their quote was accepted. No error, no alert, nothing in Sentry. That is
-- the exact failure shape this project has spent a fortnight finding, so it is
-- written into the deploy order rather than left to be discovered.
--
-- WHAT CHANGES
--   was: with check (auth.uid() is not null)   -- anyone, for ANYONE
--   now: with check (auth.uid() = user_id)     -- anyone, for THEMSELVES
--
-- The three remaining direct client inserts are all self-addressed — MRV
-- reminders, saved-search matches, watchlist price drops — so they are
-- unaffected. Everything cross-user now goes through `notify_counterparty`,
-- which is SECURITY DEFINER and therefore not subject to this policy at all,
-- and which derives its recipients from a row the caller is a party to.
--
-- The five notify_* TRIGGERS are likewise unaffected: they are SECURITY DEFINER
-- and run as the table owner.
--
-- REVERSIBLE IN ONE STATEMENT. If cross-user notifications stop arriving and
-- you need them back immediately:
--
--   drop policy if exists "Users insert their own notifications" on public.system_notifications;
--   create policy "Authenticated can insert notifications"
--     on public.system_notifications for insert to authenticated
--     with check (auth.uid() is not null);
--
-- Idempotent. No table, function or data is touched — one policy is replaced.
-- ============================================================================

do $$
begin
  -- Refuse to run if step 1 has not been applied. Tightening the policy without
  -- the RPC in place removes cross-user notifications with nothing to replace
  -- them, and the removal would be silent.
  if to_regprocedure(
       'public.notify_counterparty(text,uuid,text,text,text,text,text,jsonb)'
     ) is null then
    raise exception
      'Apply 20260802000300_notify_counterparty_rpc.sql first, and deploy the frontend, before tightening this policy.';
  end if;
end
$$;

drop policy if exists "Authenticated can insert notifications" on public.system_notifications;
drop policy if exists "Users insert their own notifications" on public.system_notifications;

create policy "Users insert their own notifications"
  on public.system_notifications for insert
  to authenticated
  with check (auth.uid() = user_id);

comment on table public.system_notifications is
  'In-app notifications. Clients may INSERT only rows addressed to themselves; '
  'everything cross-user goes through notify_counterparty() or a notify_* trigger, '
  'both SECURITY DEFINER, so a recipient is always derived server-side. '
  'See DEFERRED_BACKLOG #36.';

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFY — run after applying. Every row must read PASS.
-- ============================================================================
-- select 'INSERT policy is now self-only' as check,
--        case when pg_get_expr(polwithcheck, polrelid) = '(auth.uid() = user_id)'
--             then 'PASS' else 'FAIL: ' || pg_get_expr(polwithcheck, polrelid) end as verdict
--   from pg_policy
--  where polrelid = 'public.system_notifications'::regclass and polcmd = 'a'
-- union all
-- select 'exactly one INSERT policy remains',
--        case when count(*) = 1 then 'PASS' else 'FAIL: ' || count(*) end
--   from pg_policy
--  where polrelid = 'public.system_notifications'::regclass and polcmd = 'a'
-- union all
-- select 'reading your own notifications still works',
--        case when count(*) >= 1 then 'PASS' else 'FAIL' end
--   from pg_policy
--  where polrelid = 'public.system_notifications'::regclass and polcmd = 'r';
--
-- BEHAVIOURAL CHECK, worth more than the three rows above. Signed in as a real
-- user in the app, have a counterparty act on one of your deliveries or RFQs
-- and confirm the bell still rings. The policy rows prove the rule changed;
-- only this proves the replacement path works.
