-- ============================================================================
-- Watchlist price alerts.
--
-- The watchlist could save a listing but never tell you anything about it
-- afterwards, which makes "save it and watch for a better price" impossible —
-- the buyer had to remember what they paid attention to and re-check manually.
--
-- Detecting a price DROP needs a baseline, so we record the price at the moment
-- the listing was saved. Nulls are expected on rows saved before this migration:
-- they simply have no baseline yet and are skipped by the alert check until the
-- buyer re-saves them (deliberate — back-filling today's price as the "saved"
-- price would invent drops that never happened).
--
-- `notify_on_drop` lets a buyer keep a listing on the watchlist without wanting
-- to hear about it. Defaults to on, since that's why people save listings.
-- ============================================================================

alter table public.watchlist
  add column if not exists price_at_save numeric(18,2),
  add column if not exists notify_on_drop boolean not null default true,
  add column if not exists last_alerted_price numeric(18,2),
  add column if not exists last_alerted_at timestamptz;

comment on column public.watchlist.price_at_save is
  'price_per_credit when the listing was saved; the baseline a drop is measured against. Null for rows saved before price alerts existed.';
comment on column public.watchlist.last_alerted_price is
  'price the buyer was last alerted about, so a listing that keeps drifting down does not re-alert on every check.';

-- Owners already have select/insert/delete policies (20260615000300_watchlist.sql).
-- Alerting updates last_alerted_* on the owner's own row, so add the matching
-- update policy. Scoped both ways so a row can never be reassigned to another user.
drop policy if exists "watchlist owner update" on public.watchlist;
create policy "watchlist owner update"
  on public.watchlist for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
