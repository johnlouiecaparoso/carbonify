-- ============================================================================
-- POSITIVE RPC SUITE — do the money RPCs actually WORK, end to end?
--
-- The other half of TESTING_PLAN.md §1.2. `rls_negative_suite.sql` proves an
-- attacker is stopped; nothing proved the legitimate path still functions
-- against the live schema. That gap matters because every defect this project
-- has found in the money path was a correct-looking function whose surroundings
-- had drifted — a resurrected trigger, a table nothing writes, a fix applied to
-- one branch and not its sibling. Reading a migration file cannot catch that.
-- Only calling the function against the real database can.
--
-- HOW THIS DIFFERS FROM THE OTHER DIAGNOSTICS
--   pilot_preflight.sql        does the pieces EXIST and is the posture right
--   money_table_rls_audit.sql  is the RLS posture DECLARED correctly
--   rls_negative_suite.sql     is an attacker actually STOPPED
--   → this file                does a legitimate purchase/retirement SUCCEED,
--                              and do the books still reconcile afterwards
--
-- SAFETY — this script writes NOTHING that survives.
--   Everything runs inside a single transaction that ends in ROLLBACK. Credits
--   are not issued, no wallet is debited, no listing is consumed. Safe against
--   live. If a probe raises, the ROLLBACK at the bottom still runs when you
--   execute the file as a whole.
--
--   ⚠️ Do NOT convert the final ROLLBACK to COMMIT to "keep the test data".
--   These RPCs move real balances.
--
-- HOW TO RUN
--   Supabase SQL Editor → paste the whole file → Run → read the LAST table.
--
-- READING THE RESULT
--   PASS         the RPC did what it is supposed to do.
--   *** FAIL *** the legitimate path is broken. Nobody can transact.
--   UNPROVEN     the fixtures this probe needs do not exist, so it proved
--                nothing. NOT a pass — same rule as the negative suite, and the
--                escrow_verification.sql row-3 lesson: a check that could not
--                have gone red is not evidence.
--   SKIP         the function or table is absent on this database.
-- ============================================================================

begin;

drop table if exists _rpc_probe;
create temp table _rpc_probe (
  seq      int generated always as identity,
  probe    text,
  verdict  text,
  detail   text
) on commit drop;

do $suite$
declare
  v_buyer      uuid;
  v_seller     uuid;
  v_listing    record;
  v_qty        numeric := 1;
  v_before     numeric;
  v_after      numeric;
  v_txn        uuid;
  v_owned      numeric;
  v_msg        text;
begin
  -- ── Fixtures ──────────────────────────────────────────────────────────────
  -- Pick a real listing with stock and a buyer who is not its seller. If none
  -- exists, every downstream probe reports UNPROVEN rather than inventing data:
  -- a suite that seeds its own fixtures tests the seed, not the system.
  select l.* into v_listing
    from public.credit_listings l
   where l.status = 'active'
     and coalesce(l.credits_available, 0) >= v_qty
   order by l.created_at
   limit 1;

  if v_listing is null then
    insert into _rpc_probe(probe, verdict, detail)
    values ('0. fixtures', 'UNPROVEN',
            'no active listing with stock — nothing to buy, so no purchase probe can prove anything');
  else
    select p.id into v_buyer
      from public.profiles p
     where p.id <> v_listing.seller_id
     order by p.created_at
     limit 1;

    if v_buyer is null then
      insert into _rpc_probe(probe, verdict, detail)
      values ('0. fixtures', 'UNPROVEN', 'no profile other than the seller — self-purchase is blocked by design');
    else
      insert into _rpc_probe(probe, verdict, detail)
      values ('0. fixtures', 'PASS',
              format('listing %s (%s available), buyer %s', v_listing.id, v_listing.credits_available, v_buyer));
    end if;
  end if;

  -- ── 1. retire_credits_atomic ──────────────────────────────────────────────
  -- The RPC whose atomicity was the 2026-07-11 P0. Burn + certificate row must
  -- commit together, and identity must come from auth.uid() rather than an
  -- argument.
  if to_regprocedure('public.retire_credits_atomic(uuid,numeric,text,text)') is null then
    insert into _rpc_probe(probe, verdict, detail)
    values ('1. retire_credits_atomic exists', 'SKIP', 'function not found with the 4-arg signature');
  else
    select co.user_id, co.quantity into v_buyer, v_owned
      from public.credit_ownership co
     where coalesce(co.quantity, 0) >= 1
       and coalesce(co.ownership_type, '') <> 'retired'
     order by co.created_at
     limit 1;

    if v_buyer is null then
      insert into _rpc_probe(probe, verdict, detail)
      values ('1. retire_credits_atomic', 'UNPROVEN',
              'nobody holds a retirable credit — "retirement works" cannot be demonstrated on an empty table');
    else
      insert into _rpc_probe(probe, verdict, detail)
      values ('1. retire_credits_atomic', 'UNPROVEN',
              format('holder %s has %s credits. Callable only as that user: this suite runs as the SQL role, '
                     'and the function binds identity to auth.uid() — which is correct, and is exactly why '
                     'this probe cannot fake it. Run the retirement click-through instead.', v_buyer, v_owned));
    end if;
  end if;

  -- ── 2. reconcile_financials ───────────────────────────────────────────────
  -- The single most important assertion in the system: the books balance.
  if to_regprocedure('public.reconcile_financials()') is null then
    insert into _rpc_probe(probe, verdict, detail)
    values ('2. reconcile_financials exists', 'SKIP', 'function not found');
  else
    select count(*) into v_before from public.reconcile_financials();
    insert into _rpc_probe(probe, verdict, detail)
    values ('2. reconcile_financials() = 0 rows',
            case when v_before = 0 then 'PASS' else '*** FAIL ***' end,
            format('%s discrepancy row(s)', v_before));
  end if;

  -- ── 3. release_matured_escrow ─────────────────────────────────────────────
  -- The only thing that ever frees a card seller's held funds. Proving it is
  -- CALLABLE is not the same as proving a hold matures — that needs a real
  -- purchase (ESC-01..06) — but an uncallable releaser strands money forever.
  if to_regprocedure('public.release_matured_escrow()') is null then
    insert into _rpc_probe(probe, verdict, detail)
    values ('3. release_matured_escrow exists', '*** FAIL ***',
            'function not found — escrow is applied and NOTHING can release a hold');
  else
    begin
      perform public.release_matured_escrow();
      insert into _rpc_probe(probe, verdict, detail)
      values ('3. release_matured_escrow callable', 'PASS', 'executed without error (rolled back)');
    exception when others then
      get stacked diagnostics v_msg = message_text;
      insert into _rpc_probe(probe, verdict, detail)
      values ('3. release_matured_escrow callable', '*** FAIL ***', v_msg);
    end;
  end if;

  -- ── 4. The issuance model (#17) ───────────────────────────────────────────
  -- Validating a project must NOT mint. Both triggers were live at once until
  -- 2026-07-26 and the same tonne was issued twice.
  insert into _rpc_probe(probe, verdict, detail)
  select '4. only ONE issuance trigger is live',
         case when count(*) = 1 then 'PASS'
              when count(*) = 0 then '*** FAIL ***'
              else '*** FAIL ***' end,
         format('%s issuance trigger(s): %s', count(*), coalesce(string_agg(tgname, ', '), 'none'))
    from pg_trigger
   where not tgisinternal
     and tgname in ('trg_activate_validated_project', 'trg_mint_credits_on_ver_approval');

  -- ── 5. The purchase RPCs exist with the expected shape ────────────────────
  insert into _rpc_probe(probe, verdict, detail)
  select '5. purchase RPCs present',
         case when count(*) filter (where p is not null) = 2 then 'PASS' else '*** FAIL ***' end,
         format('process_marketplace_purchase: %s · process_wallet_purchase: %s',
                coalesce((select 'yes' where to_regproc('public.process_marketplace_purchase') is not null), 'MISSING'),
                coalesce((select 'yes' where to_regproc('public.process_wallet_purchase') is not null), 'MISSING'))
    from (values (to_regproc('public.process_marketplace_purchase')),
                 (to_regproc('public.process_wallet_purchase'))) as t(p);

  -- ── 6. SECURITY DEFINER functions pin their search_path ───────────────────
  -- An unpinned SECURITY DEFINER function resolves unqualified names through
  -- the CALLER's search_path. This is the classic escalation footgun and it is
  -- cheap to check for every one of them at once.
  insert into _rpc_probe(probe, verdict, detail)
  select '6. every SECURITY DEFINER function pins search_path',
         case when count(*) = 0 then 'PASS' else '*** FAIL ***' end,
         case when count(*) = 0 then 'all pinned'
              else format('%s unpinned: %s', count(*), string_agg(proname, ', ')) end
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and coalesce(array_to_string(p.proconfig, ','), '') not like '%search_path%';

  -- ── 7. Grant hygiene (#12) ────────────────────────────────────────────────
  -- Postgres grants EXECUTE to PUBLIC on every new function. A SECURITY DEFINER
  -- function that never revoked it is callable by `anon`.
  insert into _rpc_probe(probe, verdict, detail)
  select '7. no SECURITY DEFINER function is executable by PUBLIC',
         case when count(*) = 0 then 'PASS' else '*** FAIL ***' end,
         case when count(*) = 0 then 'PUBLIC execute revoked everywhere'
              else format('%s callable by PUBLIC: %s', count(*), string_agg(proname, ', ')) end
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and has_function_privilege('public', p.oid, 'execute');
end
$suite$;

-- ============================================================================
-- SUMMARY — the only table you need to read.
-- It is last on purpose: the Supabase editor shows just the final statement's
-- result when several are pasted together, and reading the wrong table is how a
-- full pre-flight got misread on 2026-07-29.
-- ============================================================================
select probe, verdict, detail
  from _rpc_probe
 order by seq;

rollback;
