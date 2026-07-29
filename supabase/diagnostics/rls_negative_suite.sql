-- ============================================================================
-- NEGATIVE RLS SUITE — does the lockdown actually STOP a real user?
--
-- TESTING_PLAN.md §1.2 calls this "the highest-value thing to add, because it's
-- where drift and privilege bugs hide", and names the negative half as the
-- important one. Until now it was the one test layer with nothing automated.
--
-- HOW THIS DIFFERS FROM money_table_rls_audit.sql
--   That file reads pg_policies and proves the POSTURE is declared correctly.
--   This file impersonates an actual authenticated user and TRIES THE ATTACKS.
--   A policy can be present and still not bite — USING vs WITH CHECK confusion,
--   a permissive legacy policy OR-ing the lockdown open, a GRANT that outranks
--   it. Only an attempted write answers that.
--
--   Same lesson escrow_verification.sql row 3 taught on 2026-07-29: a green
--   check that never had the opportunity to be red proves nothing. Every probe
--   here is red-capable by construction, and every probe that could pass
--   VACUOUSLY (nothing to attack) reports UNPROVEN instead of PASS.
--
-- SAFETY — this script writes NOTHING, even when it finds a hole.
--   Each probe runs in its own subtransaction (BEGIN/EXCEPTION), rolled back
--   unconditionally: blocked probes roll back on the RLS error, and probes that
--   SUCCEED are rolled back by a deliberate exception raised immediately after
--   the row count is taken. Nothing survives. Safe against live.
--
-- HOW TO RUN
--   Supabase SQL Editor → paste the whole file → Run → read the LAST table.
--   Optionally pin the acting user by replacing <ACTOR_USER_ID>; left as-is the
--   script picks the oldest non-admin, non-verifier profile itself.
--
-- READING THE RESULT
--   PASS         the attack was blocked. What you want.
--   *** FAIL *** the attack SUCCEEDED. A real user can do this today.
--   UNPROVEN     nothing existed to attack, so the probe proved nothing.
--   INCONCLUSIVE something other than RLS stopped it (FK/NOT NULL/CHECK). NOT a
--                pass — the row never reached the RLS check.
--   SKIP         table absent on this database.
--
-- Complements, and does not replace, the independent penetration test.
-- ============================================================================

drop table if exists _rls_probe;
create temp table _rls_probe (
  seq int, probe text, target text, verdict text, detail text
);
-- The probes run as `authenticated`, which does not own this temp table.
-- Without this grant every insert below fails with permission denied.
grant all on _rls_probe to public;

do $probe$
declare
  v_actor_raw text := '<ACTOR_USER_ID>';
  v_actor     uuid;
  v_victim    uuid;
  v_n         bigint;   -- rows the attack affected//saw: 0 = blocked
  v_avail     bigint;   -- rows that EXISTED to attack: 0 = probe is vacuous
  v_note      text;
  v_seq       int := 0;
begin
  -- ── Pick the acting user, as the invoking role (sees everyone) ────────────
  if v_actor_raw ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_actor := v_actor_raw::uuid;
  else
    select p.id into v_actor
    from public.profiles p
    where coalesce(p.role, 'general_user') not in ('admin', 'verifier')
    order by p.created_at nulls last
    limit 1;
  end if;

  if v_actor is null then
    insert into _rls_probe values (0, 'setup', '-', 'SKIP',
      'No non-admin profile to impersonate. Create one, or pin <ACTOR_USER_ID>.');
    return;
  end if;

  select p.id into v_victim from public.profiles p
  where p.id <> v_actor order by p.created_at nulls last limit 1;

  insert into _rls_probe values (0, 'setup', 'acting as', 'INFO',
    'actor=' || v_actor::text ||
    coalesce(', victim=' || v_victim::text, ', victim=<none: only one profile>'));

  -- ── Vacuity pre-counts, taken BEFORE impersonating (so they are true counts,
  --    not RLS-filtered ones). A probe with nothing to attack cannot PASS. ────
  select count(*) into v_avail from public.project_credits;
  insert into _rls_probe values (-1, 'precount', 'project_credits', 'INFO', v_avail::text);
  select count(*) into v_avail from public.credit_listings where seller_id is distinct from v_actor;
  insert into _rls_probe values (-1, 'precount', 'credit_listings_foreign', 'INFO', v_avail::text);
  select count(*) into v_avail from public.wallet_accounts where user_id = v_actor;
  insert into _rls_probe values (-1, 'precount', 'wallet_own', 'INFO', v_avail::text);
  select count(*) into v_avail from public.wallet_accounts where user_id = v_victim;
  insert into _rls_probe values (-1, 'precount', 'wallet_victim', 'INFO', v_avail::text);
  select count(*) into v_avail from public.credit_ownership where user_id = v_victim;
  insert into _rls_probe values (-1, 'precount', 'ownership_victim', 'INFO', v_avail::text);
  select count(*) into v_avail from public.credit_transactions
    where buyer_id = v_victim and seller_id is distinct from v_actor;
  insert into _rls_probe values (-1, 'precount', 'tx_victim', 'INFO', v_avail::text);

  -- ── Become that user. auth.uid() reads request.jwt.claims->>'sub', so the
  --    policies evaluate exactly as for a PostgREST request from this user. ───
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_actor::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ══ 1. MINT CREDITS FROM NOTHING ══════════════════════════════════════════
  -- The registry-corrupting write. project_credits.credits_available is the
  -- pool the marketplace sells from; only the SECURITY DEFINER issuance trigger
  -- and the settlement RPCs may move it.
  v_seq := v_seq + 1;
  select detail::bigint into v_avail from _rls_probe where target = 'project_credits' and seq = -1;
  begin
    update public.project_credits set credits_available = credits_available + 1000;
    get diagnostics v_n = row_count;
    v_note := v_n::text || ' pool row(s) would have been minted into';
    raise exception 'CARBONIFY_PROBE_ROLLBACK';
  exception
    when sqlstate '42501' then v_n := 0; v_note := 'blocked by RLS (42501)';
    when others then
      if sqlerrm <> 'CARBONIFY_PROBE_ROLLBACK' then v_n := -1; v_note := 'other error: ' || sqlerrm; end if;
  end;
  insert into _rls_probe values (v_seq, 'UPDATE credits_available (mint credits)', 'project_credits',
    case when v_avail = 0 then 'UNPROVEN' when v_n < 0 then 'INCONCLUSIVE'
         when v_n = 0 then 'PASS' else '*** FAIL ***' end,
    case when v_avail = 0 then 'no credit pools exist — nothing to attack' else v_note end);

  -- ══ 2. REWRITE ANOTHER SELLER'S PRICE ═════════════════════════════════════
  v_seq := v_seq + 1;
  select detail::bigint into v_avail from _rls_probe where target = 'credit_listings_foreign' and seq = -1;
  begin
    update public.credit_listings set price_per_credit = 1 where seller_id is distinct from v_actor;
    get diagnostics v_n = row_count;
    v_note := v_n::text || ' foreign listing(s) repriced to ₱1';
    raise exception 'CARBONIFY_PROBE_ROLLBACK';
  exception
    when sqlstate '42501' then v_n := 0; v_note := 'blocked by RLS (42501)';
    when others then
      if sqlerrm <> 'CARBONIFY_PROBE_ROLLBACK' then v_n := -1; v_note := 'other error: ' || sqlerrm; end if;
  end;
  insert into _rls_probe values (v_seq, 'UPDATE another seller''s price', 'credit_listings',
    case when v_avail = 0 then 'UNPROVEN' when v_n < 0 then 'INCONCLUSIVE'
         when v_n = 0 then 'PASS' else '*** FAIL ***' end,
    case when v_avail = 0 then 'no listings owned by anyone else — nothing to attack' else v_note end);

  -- ══ 3. FORGE A RETIREMENT ═════════════════════════════════════════════════
  -- A retirement row is what a public certificate is minted from. Inserting one
  -- directly = claiming an offset nobody bought. 20260725000100 drops the old
  -- "Users can insert their own retirements" policy for exactly this reason.
  v_seq := v_seq + 1;
  begin
    insert into public.credit_retirements (user_id, project_id, quantity, reason, retired_at)
    select v_actor, p.id, 1, 'RLS probe — must never persist', now()
    from public.projects p limit 1;
    get diagnostics v_n = row_count;
    v_note := v_n::text || ' forged retirement(s) inserted';
    if v_n = 0 then v_note := 'no visible project to reference'; v_n := -1; end if;
    raise exception 'CARBONIFY_PROBE_ROLLBACK';
  exception
    when sqlstate '42501' then v_n := 0; v_note := 'blocked by RLS (42501)';
    when others then
      if sqlerrm <> 'CARBONIFY_PROBE_ROLLBACK' then v_n := -1; v_note := 'other error: ' || sqlerrm; end if;
  end;
  insert into _rls_probe values (v_seq, 'INSERT forged retirement', 'credit_retirements',
    case when v_n < 0 then 'INCONCLUSIVE' when v_n = 0 then 'PASS' else '*** FAIL ***' end, v_note);

  -- ══ 4. TOP UP YOUR OWN WALLET ═════════════════════════════════════════════
  -- Own-row SELECT is intended. Own-row UPDATE is minting money.
  v_seq := v_seq + 1;
  select detail::bigint into v_avail from _rls_probe where target = 'wallet_own' and seq = -1;
  begin
    update public.wallet_accounts set current_balance = current_balance + 1000000
    where user_id = v_actor;
    get diagnostics v_n = row_count;
    v_note := v_n::text || ' own wallet(s) credited 1,000,000';
    raise exception 'CARBONIFY_PROBE_ROLLBACK';
  exception
    when sqlstate '42501' then v_n := 0; v_note := 'blocked by RLS (42501)';
    when others then
      if sqlerrm <> 'CARBONIFY_PROBE_ROLLBACK' then v_n := -1; v_note := 'other error: ' || sqlerrm; end if;
  end;
  insert into _rls_probe values (v_seq, 'UPDATE own wallet balance (mint money)', 'wallet_accounts',
    case when v_avail = 0 then 'UNPROVEN' when v_n < 0 then 'INCONCLUSIVE'
         when v_n = 0 then 'PASS' else '*** FAIL ***' end,
    case when v_avail = 0 then 'the acting user has no wallet — nothing to attack' else v_note end);

  -- ══ 5. SELF-PROMOTE TO ADMIN ══════════════════════════════════════════════
  -- Closed by 20260703000300 and ticked in the go/no-go gate. This is the probe
  -- that keeps it verified rather than merely remembered.
  v_seq := v_seq + 1;
  begin
    update public.profiles set role = 'admin' where id = v_actor;
    get diagnostics v_n = row_count;
    v_note := v_n::text || ' self-promotion(s) to admin succeeded';
    raise exception 'CARBONIFY_PROBE_ROLLBACK';
  exception
    when sqlstate '42501' then v_n := 0; v_note := 'blocked by RLS (42501)';
    when others then
      if sqlerrm <> 'CARBONIFY_PROBE_ROLLBACK' then
        v_n := 0; v_note := 'blocked by trigger/constraint: ' || sqlerrm;
      end if;
  end;
  insert into _rls_probe values (v_seq, 'UPDATE own role -> admin', 'profiles',
    case when v_n = 0 then 'PASS' else '*** FAIL ***' end,
    case when v_n = 0 and v_note not like 'blocked%' then 'role write had no effect' else v_note end);

  -- ══ 6-8. CROSS-TENANT READS ═══════════════════════════════════════════════
  -- Confidentiality rather than integrity: another user's balances, holdings
  -- and trades must be invisible.
  v_seq := v_seq + 1;
  select detail::bigint into v_avail from _rls_probe where target = 'wallet_victim' and seq = -1;
  select count(*) into v_n from public.wallet_accounts where user_id = v_victim;
  insert into _rls_probe values (v_seq, 'SELECT another user''s wallet', 'wallet_accounts',
    case when v_avail = 0 then 'UNPROVEN' when v_n = 0 then 'PASS' else '*** FAIL ***' end,
    case when v_avail = 0 then 'the victim has no wallet row — nothing to hide'
         else v_n::text || ' of ' || v_avail::text || ' foreign wallet row(s) visible' end);

  v_seq := v_seq + 1;
  select detail::bigint into v_avail from _rls_probe where target = 'ownership_victim' and seq = -1;
  select count(*) into v_n from public.credit_ownership where user_id = v_victim;
  insert into _rls_probe values (v_seq, 'SELECT another user''s holdings', 'credit_ownership',
    case when v_avail = 0 then 'UNPROVEN' when v_n = 0 then 'PASS' else '*** FAIL ***' end,
    case when v_avail = 0 then 'the victim holds no credits — nothing to hide'
         else v_n::text || ' of ' || v_avail::text || ' foreign holding row(s) visible' end);

  v_seq := v_seq + 1;
  select detail::bigint into v_avail from _rls_probe where target = 'tx_victim' and seq = -1;
  select count(*) into v_n from public.credit_transactions
  where buyer_id = v_victim and seller_id is distinct from v_actor;
  insert into _rls_probe values (v_seq, 'SELECT trades you are not party to', 'credit_transactions',
    case when v_avail = 0 then 'UNPROVEN' when v_n = 0 then 'PASS' else '*** FAIL ***' end,
    case when v_avail = 0 then 'the victim has no trades with third parties — nothing to hide'
         else v_n::text || ' of ' || v_avail::text || ' foreign transaction row(s) visible' end);

  reset role;
exception
  when others then
    reset role;   -- never leave the session impersonating a user
    raise;
end
$probe$;

reset role;

-- ── SUMMARY — the LAST statement, so a whole-file paste shows the verdicts. ──
-- (The Supabase editor renders only the final statement's result. Reading the
--  wrong table is how a full pre-flight got misread on 2026-07-29.)
select
  seq     as "#",
  verdict as "verdict",
  probe   as "attack attempted",
  target  as "table",
  detail  as "detail"
from _rls_probe
where seq >= 0                     -- hide the vacuity pre-counts
order by seq;
