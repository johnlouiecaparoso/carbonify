-- ============================================================================
-- Price history — "am I paying a fair price?"
--
-- Buyers had no way to answer that. A listing showed a number with no context,
-- and the portfolio compared holdings against a single snapshot average of
-- ACTIVE LISTINGS — i.e. against what sellers are currently asking, not against
-- anything that has actually traded.
--
-- These derive history from `credit_transactions`, which already records
-- price_per_credit + quantity + a completion timestamp on every settled trade.
-- No new table and no capture job: the trades ARE the history, so there is
-- nothing to keep in sync and nothing to back-fill.
--
-- Both functions return daily buckets and expose ONLY aggregates (no buyer,
-- seller, or transaction identity), so they are anon-grantable like
-- public_market_stats. Days with no trades are simply absent — the client
-- decides whether to interpolate or show gaps.
--
-- Volume-weighted average is the honest headline: one 5,000-credit trade should
-- move the daily price more than one 5-credit trade. min/max come along so the
-- UI can draw a range and a buyer can see the spread, not just the middle.
-- ============================================================================

-- Market-wide daily price series over the trailing p_days.
create or replace function public.public_price_history(p_days int default 90)
returns table (
  day date,
  vwap numeric,
  min_price numeric,
  max_price numeric,
  credits numeric,
  trades bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_trunc('day', coalesce(t.completed_at, t.created_at))::date as day,
    round(sum(t.price_per_credit * t.quantity) / nullif(sum(t.quantity), 0), 2) as vwap,
    min(t.price_per_credit) as min_price,
    max(t.price_per_credit) as max_price,
    sum(t.quantity) as credits,
    count(*) as trades
  from public.credit_transactions t
  where t.status = 'completed'
    and t.price_per_credit > 0
    and t.quantity > 0
    and coalesce(t.completed_at, t.created_at)
        >= now() - (greatest(least(coalesce(p_days, 90), 730), 1) || ' days')::interval
  group by 1
  order by 1;
$$;

-- Same series scoped to one project, for the project detail page.
create or replace function public.project_price_history(p_project_id uuid, p_days int default 90)
returns table (
  day date,
  vwap numeric,
  min_price numeric,
  max_price numeric,
  credits numeric,
  trades bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    date_trunc('day', coalesce(t.completed_at, t.created_at))::date as day,
    round(sum(t.price_per_credit * t.quantity) / nullif(sum(t.quantity), 0), 2) as vwap,
    min(t.price_per_credit) as min_price,
    max(t.price_per_credit) as max_price,
    sum(t.quantity) as credits,
    count(*) as trades
  from public.credit_transactions t
  join public.project_credits pc on pc.id = t.project_credit_id
  where t.status = 'completed'
    and pc.project_id = p_project_id
    and t.price_per_credit > 0
    and t.quantity > 0
    and coalesce(t.completed_at, t.created_at)
        >= now() - (greatest(least(coalesce(p_days, 90), 730), 1) || ' days')::interval
  group by 1
  order by 1;
$$;

revoke all on function public.public_price_history(int) from public;
revoke all on function public.project_price_history(uuid, int) from public;
grant execute on function public.public_price_history(int) to anon, authenticated, service_role;
grant execute on function public.project_price_history(uuid, int) to anon, authenticated, service_role;

-- Drives the date-range filter on both functions.
create index if not exists idx_credit_tx_completed_price
  on public.credit_transactions (completed_at desc)
  where status = 'completed';

notify pgrst, 'reload schema';
