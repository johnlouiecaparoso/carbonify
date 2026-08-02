-- ============================================================================
-- "Report a problem", for problems that are not about a purchase.
--
-- WHY A SECOND TABLE AND NOT MORE DISPUTES
-- `disputes` is a financial instrument. `open_dispute` requires a
-- credit_transactions id, an admin resolves it, and a "refunded" resolution
-- fires `refund_purchase` and moves money. That is exactly right for "I was
-- charged twice" and exactly wrong for "the verifier queue will not load" or
-- "my KYC has been pending for a week" — neither has a transaction to attach
-- to, and neither should sit in a refund queue.
--
-- Until now the only in-app way to report anything was the dispute button on a
-- receipt. So every role without receipts — verifier, LGU, farmer, project
-- developer, admin — had no way to tell anyone that something was broken, and
-- a buyer whose problem was not a purchase had to invent a purchase to
-- complain about.
--
-- WHAT THIS DOES NOT DO
-- No assignment, no threading, no SLA, no email. A report lands with enough
-- context to act on (what, where, who, which build) and an admin can mark it
-- handled. Anything more is a helpdesk, and this is not one.
--
-- FAILS CLOSED, unlike policy_acceptances. A consent gate that cannot record
-- an acceptance should let the user in; a support form that cannot record a
-- report must NOT tell the user "thanks, we'll look into it". The client
-- surfaces the write error rather than swallowing it.
--
-- Additive + idempotent. Safe to re-run.
-- ============================================================================

create table if not exists public.support_reports (
  id uuid primary key default gen_random_uuid(),
  -- Nullable: a signed-out visitor cannot reach the form today, but tying the
  -- row's existence to an account that may later be deleted would lose the
  -- report. `on delete set null` keeps the report and drops the link.
  user_id uuid references auth.users(id) on delete set null,
  -- One of the categories in src/constants/support.js. Text, not an enum:
  -- adding a category should not need a migration.
  category text not null,
  subject text not null,
  details text not null,
  -- Where they were when it broke. The single most useful field for
  -- reproducing anything, and the one a user is least able to describe.
  page_path text,
  -- The reporter's role at the time. Their profile role can change later; what
  -- matters is what they could see when it happened.
  reporter_role text,
  -- Optional link to a purchase, for reports that do concern one but are not
  -- refund requests.
  transaction_id text,
  user_agent text,
  status text not null default 'open',
  admin_notes text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint support_reports_status_check
    check (status in ('open', 'in_progress', 'resolved', 'wont_fix'))
);

create index if not exists support_reports_user_idx
  on public.support_reports (user_id);
create index if not exists support_reports_status_idx
  on public.support_reports (status, created_at desc);

alter table public.support_reports enable row level security;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Read your own; admins read all.
drop policy if exists "Users read own support reports" on public.support_reports;
create policy "Users read own support reports"
  on public.support_reports
  for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- Insert only as yourself. `user_id` is checked against auth.uid() rather than
-- trusted from the request body — same rule as policy_acceptances and the
-- payment path: never derive identity from something the client can set.
drop policy if exists "Users file own support reports" on public.support_reports;
create policy "Users file own support reports"
  on public.support_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Only admins triage. A reporter cannot edit a report after filing it —
-- including its status — because the record of what was said at the time is
-- the point.
drop policy if exists "Admins update support reports" on public.support_reports;
create policy "Admins update support reports"
  on public.support_reports
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'admin'
    )
  );

-- No delete policy, deliberately: nobody deletes a support report through the
-- API. RLS denies what it does not permit.

-- ============================================================================
-- §VERIFY — run against the live database after applying.
--
--   select tablename, rowsecurity
--     from pg_tables where schemaname = 'public' and tablename = 'support_reports';
--   -- expect: one row, rowsecurity = true
--
--   select policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'support_reports'
--    order by policyname;
--   -- expect exactly three: read own (SELECT), file own (INSERT),
--   --                       admins update (UPDATE). No DELETE.
--
-- If the table is missing, the in-app form will show the user a plain failure
-- rather than pretending the report was filed. That is intended — see the
-- header.
-- ============================================================================
