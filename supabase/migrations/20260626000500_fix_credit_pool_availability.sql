-- ============================================================================
-- ⚠️  SUPERSEDED — DO NOT RE-RUN THIS FILE AGAINST A LIVE DATABASE.
--
-- The function(s) below are redefined by a LATER migration. `create or replace`
-- does not merge — it overwrites — so replaying this file silently reverts the
-- newer definition and every fix inside it, with no error and nothing to see.
--   public.activate_validated_project_trigger()  ->  20260718000900_issuance_triggers_use_credits_available.sql
--
-- Applying migrations in order from empty is fine: the later file lands last.
-- Running this one ON ITS OWN is what reverts. This marker is maintained by
-- src/test/services/migrationSupersession.test.js — do not delete it by hand.
-- ============================================================================

-- ============================================================================
-- Fix credit pool availability — write the column the app actually reads.
--
-- project_credits has two pool columns from schema drift: credits_available
-- (read by the marketplace listing query AND process_marketplace_purchase) and
-- available_credits (written by the activate-on-validation trigger). Because the
-- trigger filled available_credits but NOT credits_available, validated projects
-- showed "All credits have been bought" even with zero sales, and a purchase
-- would mis-read the pool.
--
-- This:
--   1. Re-defines activate_validated_project_trigger to keep BOTH columns in
--      sync (credits_available is the source of truth).
--   2. Repairs existing project_credits behind an ACTIVE listing whose
--      credits_available is null/0 but that have NO completed sales, restoring
--      the pool from available_credits / total_credits / the project's estimate.
-- Idempotent and conservative: only rows with no completed transactions are
-- touched, so genuinely sold-out listings are left alone.
-- ============================================================================

create or replace function public.activate_validated_project_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_title text;
  v_project_credit_id uuid;
  v_listing_id uuid;
  v_total_credits numeric;
  v_price_per_credit numeric;
begin
  if lower(coalesce(new.status, '')) <> 'validated' then
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  v_project_title := coalesce(new.title, 'Untitled Project');
  v_total_credits := greatest(coalesce(new.estimated_credits, 1), 1);
  v_price_per_credit := greatest(coalesce(new.credit_price, 1), 0.01);

  select pc.id into v_project_credit_id
  from public.project_credits pc
  where pc.project_id = new.id
  order by pc.created_at asc
  limit 1;

  if v_project_credit_id is null then
    insert into public.project_credits (
      project_id, total_credits, available_credits, credits_available, price_per_credit, currency
    ) values (
      new.id, v_total_credits, v_total_credits, v_total_credits, v_price_per_credit, 'PHP'
    )
    returning id into v_project_credit_id;
  else
    update public.project_credits
      set total_credits      = greatest(coalesce(total_credits, v_total_credits), v_total_credits),
          available_credits  = least(coalesce(available_credits, total_credits, v_total_credits), v_total_credits),
          credits_available  = least(coalesce(credits_available, total_credits, v_total_credits), v_total_credits),
          price_per_credit   = coalesce(nullif(new.credit_price, 0), price_per_credit),
          currency           = coalesce(currency, 'PHP'),
          updated_at         = now()
    where id = v_project_credit_id;
  end if;

  select cl.id into v_listing_id
  from public.credit_listings cl
  where cl.project_credit_id = v_project_credit_id
    and cl.status = 'active'
  order by cl.created_at asc
  limit 1;

  if v_listing_id is null then
    insert into public.credit_listings (
      project_credit_id, seller_id, quantity, price_per_credit, currency, status,
      listing_type, title, description, category, location, verification_standard, listed_at
    ) values (
      v_project_credit_id, new.user_id, v_total_credits, v_price_per_credit, 'PHP', 'active',
      'sell',
      case when btrim(coalesce(v_project_title, '')) = '' then 'Carbon Credits' else v_project_title || ' - Carbon Credits' end,
      coalesce(new.description, 'Verified carbon credits from ' || coalesce(v_project_title, 'Untitled Project')),
      coalesce(new.category, 'General'),
      coalesce(new.location, 'Unknown Location'),
      'Carbonify Standard',
      now()
    )
    returning id into v_listing_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_activate_validated_project on public.projects;
create trigger trg_activate_validated_project
after update of status on public.projects
for each row
execute function public.activate_validated_project_trigger();

-- Repair existing pools: active listing, no completed sales, but credits_available
-- is null/0 — restore from the best available figure so the listing is buyable.
update public.project_credits pc
set credits_available = greatest(
      coalesce(nullif(pc.credits_available, 0), pc.available_credits, pc.total_credits, 1), 1),
    available_credits = greatest(
      coalesce(nullif(pc.available_credits, 0), pc.credits_available, pc.total_credits, 1), 1),
    updated_at = now()
from public.credit_listings cl
where cl.project_credit_id = pc.id
  and cl.status = 'active'
  and coalesce(pc.credits_available, 0) = 0
  and not exists (
    select 1 from public.credit_transactions t
    where t.project_credit_id = pc.id and t.status = 'completed'
  );

notify pgrst, 'reload schema';
