-- ============================================================================
-- VALIDATE the constraints that were added NOT VALID — DEFERRED_BACKLOG #4.
--
-- WHAT `NOT VALID` ACTUALLY MEANS
-- It enforces the rule on every future INSERT and UPDATE, but skips the scan of
-- rows that already existed. That is the right way to add a constraint to a
-- live table — no long lock, no risk of the migration failing on legacy data.
-- The cost is that Postgres records the constraint as unproven: it will not use
-- it for planning, and nothing has ever confirmed the existing rows comply.
--
-- `VALIDATE CONSTRAINT` is the second half that was never run. It takes only a
-- SHARE UPDATE EXCLUSIVE lock, so reads and writes continue while it scans.
--
-- THE BACKLOG SAID TWO FOREIGN KEYS. THERE ARE FOUR CONSTRAINTS.
-- Measured across `supabase/migrations/`:
--
--   credit_transactions_buyer_id_fkey    FK    -> profiles(id)   (20260718001100)
--   credit_transactions_seller_id_fkey   FK    -> profiles(id)   (20260718001100)
--   credit_ownership_qty_nonneg          CHECK quantity >= 0     (20260604020100)
--   kyc_level_requested_range            CHECK level between 1-3 (20260718000400)
--
-- The two CHECKs are the more interesting ones and the entry did not mention
-- them. `credit_ownership_qty_nonneg` is described in its own migration as the
-- backstop that stops the same carbon unit being retired or sold twice — so
-- "has any pre-existing row ever gone negative?" is a question about whether
-- the ledger is sound, not a tidy-up. This migration is the first thing to ask
-- it. The fourth entry in this file's history where a stated count did not
-- survive measurement (#30, #27, #12, now #4).
--
-- WHY IT REPORTS RATHER THAN JUST RUNNING
-- A bare `validate constraint` aborts the whole migration on the first
-- violation, and you learn a count of zero about everything after it. Each one
-- is validated independently below: a failure is caught, reported by name with
-- the offending row count, and the others still run. Nothing is skipped
-- silently — the final notice states exactly what passed and what did not.
--
-- Idempotent: validating an already-valid constraint is a no-op. No data is
-- written, no policy or function is touched. Safe to re-run.
-- ============================================================================

do $$
declare
  v_targets constant text[][] := array[
    ['credit_transactions', 'credit_transactions_buyer_id_fkey'],
    ['credit_transactions', 'credit_transactions_seller_id_fkey'],
    ['credit_ownership',    'credit_ownership_qty_nonneg'],
    ['kyc_applications',    'kyc_level_requested_range']
  ];
  v_table    text;
  v_name     text;
  v_convalid boolean;
  v_ok       int := 0;
  v_already  int := 0;
  v_failed   int := 0;
  v_missing  int := 0;
  v_failures text[] := array[]::text[];
begin
  for i in 1 .. array_length(v_targets, 1) loop
    v_table := v_targets[i][1];
    v_name  := v_targets[i][2];

    select c.convalidated
      into v_convalid
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
     where n.nspname = 'public'
       and t.relname = v_table
       and c.conname = v_name;

    if not found then
      -- Not an error: this repo's migration history runs ahead of some
      -- environments. Said out loud, because a silent no-op is how a migration
      -- comes to be believed applied when it changed nothing.
      v_missing := v_missing + 1;
      raise notice 'validate: %.% not found — skipped', v_table, v_name;
      continue;
    end if;

    if v_convalid then
      v_already := v_already + 1;
      raise notice 'validate: %.% was already validated', v_table, v_name;
      continue;
    end if;

    begin
      execute format('alter table public.%I validate constraint %I', v_table, v_name);
      v_ok := v_ok + 1;
      raise notice 'validate: %.% VALIDATED', v_table, v_name;
    exception
      when check_violation or foreign_key_violation then
        -- The interesting outcome. Existing rows break the rule, which means
        -- the constraint has been silently unenforced for them all along.
        v_failed := v_failed + 1;
        v_failures := v_failures || format('%s.%s (%s)', v_table, v_name, sqlerrm);
        raise warning 'validate: %.% FAILED — pre-existing rows violate it: %',
          v_table, v_name, sqlerrm;
    end;
  end loop;

  raise notice '--------------------------------------------------------------';
  raise notice 'validate: % newly validated, % already valid, % failed, % missing',
    v_ok, v_already, v_failed, v_missing;

  if v_failed > 0 then
    raise notice 'validate: STILL NOT VALID -> %', array_to_string(v_failures, ' | ');
    raise notice 'validate: those rows need investigating before the constraint can hold.';
    raise notice 'validate: run the QUERIES block at the bottom of this file to see them.';
  end if;
  raise notice '--------------------------------------------------------------';
end
$$;

-- ============================================================================
-- VERIFY — run after applying. Every row must read PASS.
-- ============================================================================
-- select
--   t.relname || '.' || c.conname as constraint,
--   case when c.convalidated then 'PASS' else 'FAIL — still NOT VALID' end as verdict
-- from pg_constraint c
-- join pg_class t on t.oid = c.conrelid
-- join pg_namespace n on n.oid = t.relnamespace
-- where n.nspname = 'public'
--   and c.conname in (
--     'credit_transactions_buyer_id_fkey',
--     'credit_transactions_seller_id_fkey',
--     'credit_ownership_qty_nonneg',
--     'kyc_level_requested_range')
-- order by 1;
--
-- Anything in the whole schema still unproven, for whoever picks this up next:
-- select n.nspname, t.relname, c.conname, c.contype
--   from pg_constraint c
--   join pg_class t on t.oid = c.conrelid
--   join pg_namespace n on n.oid = t.relnamespace
--  where n.nspname = 'public' and not c.convalidated
--  order by 2, 3;
--
-- ============================================================================
-- QUERIES — only needed if a constraint above reported FAILED.
-- Read-only. They show you the offending rows rather than a count.
-- ============================================================================
-- -- Orphaned buyers/sellers: a transaction pointing at a profile that is gone.
-- select t.id, t.buyer_id, t.seller_id, t.created_at
--   from public.credit_transactions t
--   left join public.profiles pb on pb.id = t.buyer_id
--   left join public.profiles ps on ps.id = t.seller_id
--  where (t.buyer_id  is not null and pb.id is null)
--     or (t.seller_id is not null and ps.id is null)
--  order by t.created_at desc;
--
-- -- A negative holding is the serious one: it means a decrement ran further
-- -- than the balance allowed, which is the double-spend this constraint exists
-- -- to prevent. Reconcile before doing anything else.
-- select id, user_id, project_id, quantity
--   from public.credit_ownership
--  where quantity < 0
--  order by quantity;
--
-- -- KYC requests outside the 1..3 tier range.
-- select id, user_id, level_requested, status, created_at
--   from public.kyc_applications
--  where level_requested is not null
--    and (level_requested < 1 or level_requested > 3)
--  order by created_at desc;
