-- ============================================================================
-- Two defects in request_payout().
--
-- (1) SUSPENSION IS NOT CHECKED
--   20260722000800 gates transacting on assert_not_suspended at the checkout
--   path, the retirement trigger and the project-submission trigger — but not on
--   the way OUT. A seller suspended for fraud can still withdraw the proceeds of
--   the sales they were suspended for, which is the one movement a sanction most
--   needs to stop. Withdrawal is the last point at which money is still
--   recoverable; after it, it is gone.
--
--   Reading is untouched: a suspended seller can still see their balance, their
--   sales and their receipts. They just cannot pull the funds out while the
--   sanction is open.
--
-- (2) THE IDEMPOTENCY KEY IS GLOBAL, NOT PER-SELLER
--   `select id into v_existing from payout_requests where idempotency_key = ...`
--   matches across ALL sellers. Two consequences, both wrong:
--     * a key collision returns ANOTHER seller's payout id to this caller;
--     * and their own payout is silently never created — they get a success
--       response and no money.
--   Because the key is client-supplied, that is also a denial vector: register
--   keys a target is likely to use and their withdrawals quietly no-op.
--   payoutService.requestWithdrawal passes null today, so this is latent rather
--   than live — which is exactly when it is cheap to fix.
--
--   Scoping the lookup to seller_id makes the key mean what an idempotency key
--   is supposed to mean: "this caller's same request, retried".
--
-- The body is otherwise the 20260606000800 definition byte for byte. Signature
-- unchanged. Additive + idempotent; safe to re-run.
-- ============================================================================

create or replace function public.request_payout(
  p_amount numeric,
  p_destination jsonb,
  p_idempotency_key text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seller uuid := auth.uid();
  v_available numeric;
  v_payout_id uuid;
  v_entry uuid := gen_random_uuid();
  v_existing uuid;
begin
  if v_seller is null then
    raise exception 'not authenticated';
  end if;

  -- A sanctioned account may not move money off the platform. Checked before
  -- KYB so a suspended seller is told they are suspended, not sent to redo
  -- business verification they will still not be able to use.
  perform public.assert_not_suspended(v_seller);

  if not coalesce((select kyb_verified from public.profiles where id = v_seller), false) then
    raise exception 'business verification (KYB) is required before withdrawing';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_amount < public._min_payout_amount() then
    raise exception 'amount below minimum payout of %', public._min_payout_amount();
  end if;
  if p_destination is null or p_destination->>'method' is null then
    raise exception 'destination with a method is required';
  end if;

  -- Scoped to THIS seller: an idempotency key is "my same request, retried",
  -- never "somebody else happened to pick the same string".
  if p_idempotency_key is not null then
    select id into v_existing
      from public.payout_requests
     where idempotency_key = p_idempotency_key
       and seller_id = v_seller;
    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  select coalesce(sum(case when direction = 'credit' then amount else -amount end), 0)
    into v_available
  from public.ledger_entries
  where account = 'seller_payable:' || v_seller::text;

  if v_available < p_amount then
    raise exception 'insufficient balance: available %, requested %', v_available, p_amount;
  end if;

  insert into public.payout_requests (seller_id, amount, destination, idempotency_key, status)
    values (v_seller, p_amount, p_destination, p_idempotency_key, 'requested')
    returning id into v_payout_id;

  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description) values
    (v_entry, 'seller_payable:' || v_seller::text, 'debit', p_amount, 'PHP', 'payout_request', v_payout_id::text, 'Payout reserved'),
    (v_entry, 'payout_pending:' || v_seller::text, 'credit', p_amount, 'PHP', 'payout_request', v_payout_id::text, 'Payout pending');

  return v_payout_id;
end;
$$;

revoke all on function public.request_payout(numeric, jsonb, text) from public, anon;
grant execute on function public.request_payout(numeric, jsonb, text) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- NOTE ON THE UNIQUE INDEX
--   If payout_requests.idempotency_key carries a GLOBAL unique constraint, two
--   sellers using the same key now collide on INSERT instead of silently
--   returning each other's row — a loud failure rather than a quiet wrong
--   answer, which is the better of the two, but still not right. Check with:
--
--     select indexname, indexdef from pg_indexes
--      where tablename = 'payout_requests' and indexdef ilike '%idempotency_key%';
--
--   If it is unique on (idempotency_key) alone, re-create it on
--   (seller_id, idempotency_key) to match the lookup above. Left as a separate
--   step because dropping an index on a live money table deserves its own
--   deliberate change, not a side effect of this one.
--
-- AFTER APPLYING, TEST:
--   (1) a KYB-verified, active seller withdraws exactly as before; reconcile = 0;
--   (2) a SUSPENDED seller is refused with the suspension message, and their
--       balance is unchanged (no ledger reservation was written);
--   (3) that same suspended seller can still open /sales and see their balance;
--   (4) reactivating them lets the withdrawal through;
--   (5) the same idempotency key sent twice by one seller returns the same
--       payout id and reserves the amount only once.
--
-- ROLLBACK
--   Re-apply 20260606000800_kyb.sql.
-- ============================================================================
