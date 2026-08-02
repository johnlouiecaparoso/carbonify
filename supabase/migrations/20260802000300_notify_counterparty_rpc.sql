-- ============================================================================
-- Cross-user notifications, without letting anyone write to anyone.
-- DEFERRED_BACKLOG #36 — step 1 of 3. ADDITIVE AND INERT until the frontend
-- deploy that uses it; the policy tightening is a SEPARATE migration
-- (20260802000400) that must be applied AFTER that deploy. See the bottom.
--
-- THE HOLE, CONFIRMED ON LIVE 2026-08-02
--   select polname, pg_get_expr(polwithcheck, polrelid) ...
--   -> "Authenticated can insert notifications" : (auth.uid() IS NOT NULL)
--
-- That reads "any logged-in user may insert a notification row" — it says
-- nothing about WHOSE row. `createNotificationsForUsers()` inserts from the
-- browser with a caller-supplied `user_id`, `title`, `message` and `link`, so
-- anyone with an account can plant a message in anyone else's bell: an admin's,
-- a verifier's, a seller's, rendered by the product's own trusted UI.
--
-- WHY NOT JUST TIGHTEN THE POLICY
-- `with check (auth.uid() = user_id)` would close it in one line and break
-- every legitimate cross-user notification the platform sends — a farmer told
-- their delivery was confirmed, a supplier told their quote was accepted, an
-- admin told a payment is disputed. Ten call sites, all of them proper.
--
-- The three remaining direct inserts are the ones a user makes to THEMSELVES
-- (MRV reminders, saved-search matches, watchlist price drops). Those keep
-- working under the tightened policy untouched, which is why it can tighten at
-- all.
--
-- THE RULE THIS ENFORCES
-- You may notify someone only if the database can see a relationship between
-- you and them: a biomass RFQ or a feedstock delivery you are a party to. The
-- recipient is DERIVED from that row, never taken from the caller. There is no
-- "notify user X" entry point, so this cannot be used to reach a stranger, and
-- an admin cannot be reached at all except by escalation from a real trade.
--
-- WHAT THIS DELIBERATELY DOES NOT FIX
-- The message TEXT is still composed by the client. Between two parties who are
-- already trading this is a much smaller thing than it was — they can already
-- write to each other through quote and delivery notes — but it is not nothing,
-- and the honest end state is composing the text server-side from an event
-- vocabulary, the way the five notify_* TRIGGERS already do. That is a larger
-- change to functions that move money and state, and it is not worth making
-- days before a pilot on a database this migration cannot be tested against.
-- Recorded in #36 rather than half-done here.
--
-- Additive and idempotent. No table, policy or existing function is altered.
-- ============================================================================

create or replace function public.notify_counterparty(
  p_subject_type text,               -- 'biomass_rfq' | 'farmer_delivery'
  p_subject_id   uuid,
  p_audience     text,               -- 'counterparty' | 'both_parties' | 'admins'
  p_type         text,
  p_title        text,
  p_message      text,
  p_link         text default null,
  p_metadata     jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
-- Pin the search path: a SECURITY DEFINER function resolving unqualified names
-- through the caller's search_path is the classic escalation footgun.
set search_path = public, pg_temp
as $$
declare
  v_caller     uuid := auth.uid();
  v_party_a    uuid;   -- buyer on both subject types
  v_party_b    uuid;   -- seller (rfq) / farmer (delivery)
  v_is_admin   boolean;
  v_is_party   boolean;
  v_recipients uuid[];
  v_link       text;
  v_title      text;
  v_message    text;
  v_count      integer := 0;
begin
  -- Never derive identity from an argument. Same rule the payment path learned:
  -- the caller is auth.uid(), full stop.
  if v_caller is null then
    return 0;
  end if;

  if p_subject_id is null
     or coalesce(btrim(p_title), '') = ''
     or coalesce(btrim(p_message), '') = '' then
    return 0;
  end if;

  -- Resolve the two parties from the subject row. This is the whole security
  -- model: recipients come from the database, never from the caller.
  if p_subject_type = 'biomass_rfq' then
    select r.buyer_id, r.seller_id into v_party_a, v_party_b
      from public.biomass_rfqs r where r.id = p_subject_id;
  elsif p_subject_type = 'farmer_delivery' then
    select d.buyer_id, d.farmer_id into v_party_a, v_party_b
      from public.farmer_deliveries d where d.id = p_subject_id;
  else
    -- An unknown subject type is a programming error, not a runtime condition.
    raise exception 'notify_counterparty: unknown subject type %', p_subject_type
      using errcode = 'invalid_parameter_value';
  end if;

  if not found then
    return 0;
  end if;

  v_is_party := v_caller in (v_party_a, v_party_b);
  v_is_admin := public.is_admin();

  -- Not a party and not staff -> nothing happens, and it fails CLOSED with a
  -- zero rather than an error, so it is not an existence oracle for other
  -- people's trades either.
  if not v_is_party and not v_is_admin then
    return 0;
  end if;

  if p_audience = 'counterparty' then
    -- The other party. An admin is not a party, so there is no "other" one for
    -- them to address; they must use both_parties and say it to both.
    if not v_is_party then
      return 0;
    end if;
    v_recipients := array[ case when v_caller = v_party_a then v_party_b else v_party_a end ];

  elsif p_audience = 'both_parties' then
    v_recipients := array[v_party_a, v_party_b];

  elsif p_audience = 'admins' then
    -- Escalation out of a real trade. Only a party may raise it: otherwise this
    -- becomes the "reach an admin" primitive the whole change exists to remove.
    if not v_is_party then
      return 0;
    end if;
    select array_agg(r.user_id) into v_recipients
      from public.resolve_notification_recipient_ids(null, array['admin'], array[v_caller]) as r;

  else
    raise exception 'notify_counterparty: unknown audience %', p_audience
      using errcode = 'invalid_parameter_value';
  end if;

  -- Never notify yourself through this path, and drop nulls/duplicates.
  select array_agg(distinct x) into v_recipients
    from unnest(coalesce(v_recipients, array[]::uuid[])) as x
   where x is not null and x <> v_caller;

  if v_recipients is null or array_length(v_recipients, 1) is null then
    return 0;
  end if;

  -- A link must stay inside the app. The client enforces this too
  -- (src/utils/safeInternalPath.js), but a rule that only exists in the browser
  -- is a rule the database does not have: anything that reaches this table can
  -- be clicked by whoever it is addressed to.
  v_link := nullif(btrim(coalesce(p_link, '')), '');
  if v_link is not null then
    -- chr(92) is a backslash, spelled this way on purpose: LIKE treats a
    -- backslash as its own escape character, so the obvious `like '%\%'` does
    -- not mean what it looks like. Browsers normalise '\' to '/', which is how
    -- '/\evil.test' becomes the off-site '//evil.test'.
    if left(v_link, 1) <> '/'
       or left(v_link, 2) = '//'
       or strpos(v_link, chr(92)) > 0 then
      v_link := null;
    end if;
  end if;

  -- Bound the text. A notification is a line in a dropdown, not a payload.
  v_title   := left(btrim(p_title), 200);
  v_message := left(btrim(p_message), 1000);

  insert into public.system_notifications (user_id, type, title, message, link, metadata, is_read)
  select r, coalesce(nullif(btrim(p_type), ''), 'system'),
         v_title, v_message, v_link, coalesce(p_metadata, '{}'::jsonb), false
    from unnest(v_recipients) as r;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Grant hygiene, per #12: revoke the implicit PUBLIC EXECUTE that Postgres adds
-- to every new function BEFORE granting to authenticated. `anon` never needs
-- this — an unauthenticated caller has no counterparty.
revoke all on function public.notify_counterparty(text, uuid, text, text, text, text, text, jsonb) from public, anon;
grant execute on function public.notify_counterparty(text, uuid, text, text, text, text, text, jsonb) to authenticated;

comment on function public.notify_counterparty(text, uuid, text, text, text, text, text, jsonb) is
  'Notify the other party (or both, or admins) on a biomass RFQ or feedstock delivery the caller is '
  'a party to. Recipients are derived from the subject row, never supplied by the caller, so this '
  'cannot address a stranger. Returns the number of notifications created; 0 when the caller is not '
  'a party, so it is not an existence oracle.';

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFY — run after applying. Every row must read PASS.
-- ============================================================================
-- select 'function exists' as check,
--        case when to_regprocedure('public.notify_counterparty(text,uuid,text,text,text,text,text,jsonb)') is not null
--             then 'PASS' else 'FAIL' end as verdict
-- union all
-- select 'is SECURITY DEFINER',
--        case when p.prosecdef then 'PASS' else 'FAIL' end
--   from pg_proc p
--  where p.oid = 'public.notify_counterparty(text,uuid,text,text,text,text,text,jsonb)'::regprocedure
-- union all
-- select 'search_path is pinned',
--        case when array_to_string(p.proconfig, ',') like '%search_path%' then 'PASS' else 'FAIL' end
--   from pg_proc p
--  where p.oid = 'public.notify_counterparty(text,uuid,text,text,text,text,text,jsonb)'::regprocedure
-- union all
-- select 'anon cannot execute it',
--        case when has_function_privilege('anon',
--               'public.notify_counterparty(text,uuid,text,text,text,text,text,jsonb)', 'execute')
--             then 'FAIL' else 'PASS' end
-- union all
-- select 'the INSERT policy is still the OLD permissive one (expected at this step)',
--        case when pg_get_expr(polwithcheck, polrelid) = '(auth.uid() IS NOT NULL)'
--             then 'PASS — apply 20260802000400 only AFTER the frontend deploy'
--             else 'already tightened' end
--   from pg_policy
--  where polrelid = 'public.system_notifications'::regclass and polcmd = 'a';
--
-- ----------------------------------------------------------------------------
-- ORDER OF OPERATIONS — this matters more than anything else in the file.
--
--   1. Apply THIS migration.            (additive; nothing changes behaviour)
--   2. Deploy the frontend.             (starts calling notify_counterparty)
--   3. Apply 20260802000400.            (tightens the INSERT policy)
--
-- Doing 3 before 2 does NOT throw an error a user would see: the client wraps
-- these notifications in a non-fatal try/catch, so cross-user notifications
-- would simply stop arriving, silently. That is the failure mode this whole
-- project keeps finding, and here it is written into the deploy order.
-- ----------------------------------------------------------------------------
