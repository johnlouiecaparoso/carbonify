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
-- Make validated projects appear in the marketplace (and backfill existing ones).
--
-- The marketplace shows a project only when it has an ACTIVE credit_listing ->
-- project_credits -> project whose status is validated/approved. That row is
-- created by trg_activate_validated_project when a verifier validates a project
-- (migration 20260602001000). If validated projects aren't showing, either that
-- trigger isn't installed on this DB, or the projects were validated before it
-- existed (the trigger only fires on the status transition, not retroactively).
--
-- This migration:
--   1. Re-installs activate_validated_project_trigger (idempotent; also updates
--      the verification standard label EcoLink -> Carbonify).
--   2. Backfills project_credits + an active credit_listing for every already
--      validated/approved project that is missing them.
-- Safe to run repeatedly: every insert is guarded by NOT EXISTS.
-- ============================================================================

-- 1) (Re)install the validation trigger ------------------------------------------------
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
      project_id, total_credits, available_credits, price_per_credit, currency
    ) values (
      new.id, v_total_credits, v_total_credits, v_price_per_credit, 'PHP'
    )
    returning id into v_project_credit_id;
  else
    update public.project_credits
      set total_credits = greatest(coalesce(total_credits, v_total_credits), v_total_credits),
          available_credits = least(coalesce(available_credits, total_credits), v_total_credits),
          price_per_credit = coalesce(nullif(new.credit_price, 0), price_per_credit),
          currency = coalesce(currency, 'PHP'),
          updated_at = now()
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

-- 2) Backfill project_credits for already validated/approved projects ------------------
insert into public.project_credits (project_id, total_credits, available_credits, price_per_credit, currency)
select
  p.id,
  greatest(coalesce(p.estimated_credits, 1), 1),
  greatest(coalesce(p.estimated_credits, 1), 1),
  greatest(coalesce(p.credit_price, 1), 0.01),
  'PHP'
from public.projects p
where lower(coalesce(p.status, '')) in ('validated', 'approved')
  and not exists (
    select 1 from public.project_credits pc where pc.project_id = p.id
  );

-- 3) Backfill an active listing for those project_credits missing one ------------------
insert into public.credit_listings (
  project_credit_id, seller_id, quantity, price_per_credit, currency, status,
  listing_type, title, description, category, location, verification_standard, listed_at
)
select
  pc.id,
  p.user_id,
  greatest(coalesce(pc.available_credits, pc.total_credits, 1), 1),
  greatest(coalesce(pc.price_per_credit, p.credit_price, 1), 0.01),
  coalesce(pc.currency, 'PHP'),
  'active',
  'sell',
  case when btrim(coalesce(p.title, '')) = '' then 'Carbon Credits' else p.title || ' - Carbon Credits' end,
  coalesce(p.description, 'Verified carbon credits from ' || coalesce(p.title, 'Untitled Project')),
  coalesce(p.category, 'General'),
  coalesce(p.location, 'Unknown Location'),
  'Carbonify Standard',
  now()
from public.project_credits pc
join public.projects p on p.id = pc.project_id
where lower(coalesce(p.status, '')) in ('validated', 'approved')
  and not exists (
    select 1 from public.credit_listings cl
    where cl.project_credit_id = pc.id and cl.status = 'active'
  );

notify pgrst, 'reload schema';
