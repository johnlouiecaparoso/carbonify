-- ============================================================================
-- Project onboarding & verification fees — from a disclosure to a receivable.
--
-- WHAT WAS THERE BEFORE
--   `project_onboarding_fee` and `verification_fee` existed as two admin-editable
--   numbers in app_settings, rendered as a card on the submit-project form. That
--   is the whole implementation. Nothing charged them, nothing recorded that they
--   were owed, and nothing booked them to platform revenue. Two of the five
--   stated revenue streams were a label on a screen.
--
--   That matters beyond tidiness: the marketplace transaction fee is the only
--   stream that actually collects, and at a plausible fee percentage it cannot
--   carry the 18-month revenue target on its own. The gap was always meant to be
--   these two.
--
-- THE BILLING MOMENT, AND WHY
--   **Validation, not submission.** An invoice is raised when a project reaches
--   `validated` — i.e. when a verifier has accepted it — and when a monitoring
--   report reaches `approved`.
--
--   Billing at submission would charge for work that has not been accepted yet,
--   and every rejection would then owe a refund. Refunds are the most expensive
--   thing a young payment integration can take on. Billing at validation means
--   the platform only ever invoices for a decision it has already delivered, and
--   the refund path stays exactly as narrow as it is today.
--
--   The plan document's acceptance criterion — "charged once per project
--   lifecycle, not on every edit" — is enforced structurally by the two partial
--   unique indexes below, not by careful calling.
--
-- INVOICE, NOT GATE
--   A due invoice does **not** block validation, listing, or issuance. This file
--   creates the receivable and the means to settle it; whether an unpaid fee
--   should suspend a project is a commercial policy decision, and it is written
--   up in docs/DEFERRED_BACKLOG.md rather than assumed here. Turning a fee into a
--   gate is a one-line policy change on top of this; unpicking a gate nobody
--   agreed to is not.
--
-- ZERO IS THE DEFAULT AND ZERO STAYS SILENT
--   Both settings ship at 0. `raise_project_fee_invoice` returns null on a
--   non-positive fee, so on a database where the owner has not set a price this
--   entire migration is inert: no invoices, no notifications, no ledger rows.
--
-- RECONCILIATION
--   Deliberately invisible to `reconcile_financials()`. Its check #1 is scoped to
--   `purpose = 'marketplace_purchase'`, and #5 inner-joins `credit_transactions`,
--   which a fee intent never has — so a fee neither trips a check nor is silently
--   exempted from one. Check #3 (ledger groups must balance) DOES apply, and both
--   settlement paths below post balanced two-leg entries. Fee-specific
--   reconciliation lives in its own function at the end of this file, so that
--   `reconcile_financials` is not redefined and cannot be reverted by replaying
--   an older file that also defines it.
--
-- Additive. Idempotent. No existing function, policy, or table is redefined.
-- ============================================================================

begin;

-- ── 1. The receivable ───────────────────────────────────────────────────────
create table if not exists public.project_fee_invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  -- Who owes it. Snapshotted rather than joined through projects.user_id so that
  -- a later ownership transfer cannot silently move an existing debt.
  user_id uuid not null references public.profiles(id),
  fee_type text not null check (fee_type in ('onboarding', 'verification')),
  -- The thing being billed for, when one project can generate several invoices.
  -- null for onboarding (one per project); the monitoring_reports.id for
  -- verification (one per report).
  source_ref text,
  -- Snapshotted at issue time. An admin raising the price next month must not
  -- restate an invoice that has already been sent.
  amount numeric(18,2) not null check (amount > 0),
  currency text not null default 'PHP',
  status text not null default 'due'
    check (status in ('due', 'paid', 'waived', 'void')),
  payment_intent_id uuid references public.payment_intents(id),
  payment_method text check (payment_method in ('wallet', 'paymongo')),
  waived_by uuid references public.profiles(id),
  waived_reason text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Charge once per project lifecycle. 'void' rows are excluded so an invoice
-- raised in error can be voided and re-raised; 'waived' rows are NOT excluded,
-- because a waiver is a decision not to collect, not permission to bill again.
create unique index if not exists uq_project_fee_onboarding
  on public.project_fee_invoices (project_id)
  where fee_type = 'onboarding' and status <> 'void';

create unique index if not exists uq_project_fee_verification
  on public.project_fee_invoices (project_id, source_ref)
  where fee_type = 'verification' and status <> 'void';

create index if not exists idx_project_fee_invoices_user
  on public.project_fee_invoices (user_id, status, created_at desc);
create index if not exists idx_project_fee_invoices_status
  on public.project_fee_invoices (status, created_at desc);

alter table public.project_fee_invoices enable row level security;

-- Read your own; admins read all. There is deliberately NO insert/update/delete
-- policy: RLS is deny-by-default, so every write goes through the SECURITY
-- DEFINER functions below or the service role. A client that could insert its
-- own invoice could also mark it paid.
drop policy if exists "project_fee_invoices readable by owner or admin"
  on public.project_fee_invoices;
create policy "project_fee_invoices readable by owner or admin"
  on public.project_fee_invoices for select
  using (user_id = auth.uid() or public.is_admin());

-- ── 2. A fee is a payable purpose ───────────────────────────────────────────
alter table public.payment_intents
  drop constraint if exists payment_intents_purpose_check;
alter table public.payment_intents
  add constraint payment_intents_purpose_check
  check (purpose in ('marketplace_purchase', 'wallet_topup', 'subscription', 'project_fee'));

-- ── 3. Raising an invoice ───────────────────────────────────────────────────
-- Internal. Called only by the two triggers below, which run as the owner.
-- Returns the new invoice id, or null when there is nothing to bill.
create or replace function public.raise_project_fee_invoice(
  p_project_id uuid,
  p_user_id uuid,
  p_fee_type text,
  p_source_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_setting_key text;
  v_amount numeric;
  v_invoice_id uuid;
begin
  if p_project_id is null or p_user_id is null then
    return null;
  end if;

  v_setting_key := case p_fee_type
                     when 'onboarding'   then 'project_onboarding_fee'
                     when 'verification' then 'verification_fee'
                   end;
  if v_setting_key is null then
    return null;
  end if;

  -- app_settings stores these as a bare JSON number. A malformed or absent value
  -- must read as "no fee configured", never as an exception thrown inside the
  -- trigger of a validation that has already been decided.
  begin
    v_amount := (public.get_setting(v_setting_key, '0'::jsonb))::text::numeric;
  exception when others then
    v_amount := 0;
  end;

  if v_amount is null or v_amount <= 0 then
    return null;
  end if;

  insert into public.project_fee_invoices (
    project_id, user_id, fee_type, source_ref, amount
  ) values (
    p_project_id, p_user_id, p_fee_type, p_source_ref, round(v_amount, 2)
  )
  on conflict do nothing
  returning id into v_invoice_id;

  return v_invoice_id;   -- null when the partial unique index already had one
end;
$$;

-- ── 4. Onboarding fee — raised at validation ────────────────────────────────
create or replace function public.raise_onboarding_fee_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice_id uuid;
  v_amount numeric;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status <> 'validated' then
    return new;
  end if;

  v_invoice_id := public.raise_project_fee_invoice(new.id, new.user_id, 'onboarding', null);
  if v_invoice_id is null then
    return new;   -- no fee configured, or already invoiced
  end if;

  select amount into v_amount
    from public.project_fee_invoices where id = v_invoice_id;

  -- notify_one lands in 20260806000200. Guarded so this file can be applied on a
  -- database where that one has not been, rather than failing at the first
  -- validation after deploy.
  if to_regprocedure('public.notify_one(uuid,text,text,text,text,jsonb)') is not null then
    perform public.notify_one(
      new.user_id,
      'project_fee_due',
      'Onboarding fee due',
      format('Your project "%s" has been validated. An onboarding fee of PHP %s is now due.',
             coalesce(nullif(btrim(new.title), ''), 'your project'),
             to_char(v_amount, 'FM999,999,999,990.00')),
      '/developer/fees',
      jsonb_build_object('invoice_id', v_invoice_id, 'project_id', new.id, 'fee_type', 'onboarding')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_raise_onboarding_fee on public.projects;
create trigger trg_raise_onboarding_fee
after update of status on public.projects
for each row
execute function public.raise_onboarding_fee_trigger();

-- ── 5. Verification fee — raised when a monitoring report is approved ───────
-- Per report, not per project: verification is delivered per MRV cycle, and a
-- project that files four reports has consumed the service four times.
create or replace function public.raise_verification_fee_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_title text;
  v_invoice_id uuid;
  v_amount numeric;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  if new.status <> 'approved' then
    return new;
  end if;

  select p.user_id, coalesce(nullif(btrim(p.title), ''), 'your project')
    into v_owner_id, v_title
    from public.projects p
   where p.id = new.project_id;

  if v_owner_id is null then
    return new;
  end if;

  v_invoice_id := public.raise_project_fee_invoice(
    new.project_id, v_owner_id, 'verification', new.id::text
  );
  if v_invoice_id is null then
    return new;
  end if;

  select amount into v_amount
    from public.project_fee_invoices where id = v_invoice_id;

  if to_regprocedure('public.notify_one(uuid,text,text,text,text,jsonb)') is not null then
    perform public.notify_one(
      v_owner_id,
      'project_fee_due',
      'Verification fee due',
      format('A monitoring report for "%s" was verified. A verification fee of PHP %s is now due.',
             v_title, to_char(v_amount, 'FM999,999,999,990.00')),
      '/developer/fees',
      jsonb_build_object('invoice_id', v_invoice_id, 'project_id', new.project_id,
                         'report_id', new.id, 'fee_type', 'verification')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_raise_verification_fee on public.monitoring_reports;
create trigger trg_raise_verification_fee
after update of status on public.monitoring_reports
for each row
execute function public.raise_verification_fee_trigger();

-- ── 6. Settling from the wallet ─────────────────────────────────────────────
-- Safe to grant to `authenticated`: the payer is auth.uid(), the invoice must be
-- addressed to that same user, and the amount is read from the invoice — a
-- caller cannot pay someone else's fee, pay a different amount, or pay twice.
create or replace function public.pay_project_fee_from_wallet(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payer    uuid := auth.uid();
  v_invoice  public.project_fee_invoices%rowtype;
  v_wallet   public.wallet_accounts%rowtype;
  v_entry    uuid := gen_random_uuid();
  v_ref      text := 'projectfee_' || gen_random_uuid()::text;
begin
  if v_payer is null then
    raise exception 'authentication required';
  end if;

  select * into v_invoice
    from public.project_fee_invoices
   where id = p_invoice_id
   for update;
  if not found then
    raise exception 'invoice % not found', p_invoice_id;
  end if;
  if v_invoice.user_id <> v_payer then
    raise exception 'this invoice is not addressed to you';
  end if;
  if v_invoice.status <> 'due' then
    raise exception 'invoice is already %', v_invoice.status;
  end if;

  select * into v_wallet
    from public.wallet_accounts
   where user_id = v_payer
   for update;
  if not found then
    raise exception 'wallet not found';
  end if;
  if coalesce(v_wallet.current_balance, 0) < v_invoice.amount then
    raise exception 'insufficient wallet balance (% < %)',
      coalesce(v_wallet.current_balance, 0), v_invoice.amount;
  end if;

  update public.wallet_accounts
     set current_balance = current_balance - v_invoice.amount, updated_at = now()
   where id = v_wallet.id;

  insert into public.wallet_transactions (
    account_id, user_id, type, amount, status, payment_method, description, reference_id
  ) values (
    v_wallet.id, v_payer, 'withdrawal', v_invoice.amount, 'completed', 'wallet',
    initcap(v_invoice.fee_type) || ' fee', v_ref
  );

  update public.project_fee_invoices
     set status = 'paid',
         payment_method = 'wallet',
         paid_at = now(),
         updated_at = now()
   where id = v_invoice.id;

  -- Two balanced legs: the wallet float goes down, platform revenue goes up.
  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
    values (v_entry, 'wallet_float', 'debit', v_invoice.amount, v_invoice.currency,
            'project_fee', v_invoice.id::text, initcap(v_invoice.fee_type) || ' fee (wallet)');
  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
    values (v_entry, 'platform_revenue', 'credit', v_invoice.amount, v_invoice.currency,
            'project_fee', v_invoice.id::text, initcap(v_invoice.fee_type) || ' fee (wallet)');

  return v_invoice.id;
end;
$$;

-- ── 7. Settling from a card payment (the webhook's entry point) ─────────────
-- service_role only. Idempotent by design: PayMongo retries webhooks, and a
-- second delivery must not post a second revenue entry.
create or replace function public.mark_project_fee_paid(
  p_invoice_id uuid,
  p_intent_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.project_fee_invoices%rowtype;
  v_entry   uuid := gen_random_uuid();
begin
  select * into v_invoice
    from public.project_fee_invoices
   where id = p_invoice_id
   for update;
  if not found then
    return false;
  end if;
  if v_invoice.status <> 'due' then
    return false;   -- already paid, waived or voided; a retry lands here
  end if;

  update public.project_fee_invoices
     set status = 'paid',
         payment_method = 'paymongo',
         payment_intent_id = p_intent_id,
         paid_at = now(),
         updated_at = now()
   where id = v_invoice.id;

  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
    values (v_entry, 'paymongo_clearing', 'debit', v_invoice.amount, v_invoice.currency,
            'project_fee', v_invoice.id::text, initcap(v_invoice.fee_type) || ' fee settlement');
  insert into public.ledger_entries (entry_id, account, direction, amount, currency, ref_type, ref_id, description)
    values (v_entry, 'platform_revenue', 'credit', v_invoice.amount, v_invoice.currency,
            'project_fee', v_invoice.id::text, initcap(v_invoice.fee_type) || ' fee');

  return true;
end;
$$;

-- ── 8. Waiving — the collectable decision an admin actually needs ───────────
-- A waiver is recorded, attributed and reasoned. It posts NO ledger entry:
-- revenue that was decided against was never earned, and booking it as income
-- and then reversing it would overstate both.
create or replace function public.waive_project_fee(
  p_invoice_id uuid,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid := auth.uid();
begin
  if v_admin is null or not public.is_admin() then
    raise exception 'admin privileges required';
  end if;

  update public.project_fee_invoices
     set status = 'waived',
         waived_by = v_admin,
         waived_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         updated_at = now()
   where id = p_invoice_id
     and status = 'due';

  return found;
end;
$$;

commit;

-- ── 9. Fee-specific reconciliation ──────────────────────────────────────────
-- Separate from reconcile_financials() on purpose: redefining that function here
-- would make this file its newest definition, and this repository has twice had a
-- newer definition silently reverted by an older file being replayed.
create or replace function public.reconcile_project_fees(p_overdue_days int default 30)
returns table(issue_type text, ref_id text, detail text)
language sql
stable
security definer
set search_path = public
as $$
  -- 1) Money collected but never booked.
  select 'fee_paid_no_ledger', i.id::text,
         format('%s fee marked paid (%s %s) with no ledger group',
                i.fee_type, i.currency, i.amount)
  from public.project_fee_invoices i
  where i.status = 'paid'
    and not exists (
      select 1 from public.ledger_entries le
      where le.ref_type = 'project_fee' and le.ref_id = i.id::text
    )

  union all
  -- 2) Booked but not collected — the mirror image, and the more alarming one.
  select 'fee_ledger_no_paid_invoice', le.ref_id,
         'ledger group references an invoice that is not marked paid'
  from public.ledger_entries le
  where le.ref_type = 'project_fee'
    and not exists (
      select 1 from public.project_fee_invoices i
      where i.id::text = le.ref_id and i.status = 'paid'
    )
  group by le.ref_id

  union all
  -- 3) Aged receivables. Not an error — a collections worklist.
  select 'fee_overdue', i.id::text,
         format('%s fee of %s %s outstanding since %s',
                i.fee_type, i.currency, i.amount, i.created_at::date)
  from public.project_fee_invoices i
  where i.status = 'due'
    and i.created_at < now() - make_interval(days => greatest(p_overdue_days, 0));
$$;

-- ── 10. Grants ──────────────────────────────────────────────────────────────
-- raise_project_fee_invoice and mark_project_fee_paid must never be reachable
-- from a browser: the first fabricates a debt, the second forgives one and books
-- revenue that did not arrive.
revoke all on function public.raise_project_fee_invoice(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.mark_project_fee_paid(uuid, uuid) from public, anon, authenticated;
grant execute on function public.mark_project_fee_paid(uuid, uuid) to service_role;

revoke all on function public.pay_project_fee_from_wallet(uuid) from public, anon;
grant execute on function public.pay_project_fee_from_wallet(uuid) to authenticated, service_role;

revoke all on function public.waive_project_fee(uuid, text) from public, anon;
grant execute on function public.waive_project_fee(uuid, text) to authenticated, service_role;

revoke all on function public.reconcile_project_fees(int) from public, anon, authenticated;
grant execute on function public.reconcile_project_fees(int) to service_role;

notify pgrst, 'reload schema';

-- ============================================================================
-- VERIFY — run after applying. Every row must read PASS.
-- ============================================================================
-- select 'both fee triggers installed' as check,
--        case when count(*) = 2 then 'PASS' else 'FAIL: ' || count(*) end as verdict
--   from pg_trigger
--  where tgname in ('trg_raise_onboarding_fee', 'trg_raise_verification_fee')
-- union all
-- select 'project_fee is an allowed purpose',
--        case when pg_get_constraintdef(oid) like '%project_fee%' then 'PASS' else 'FAIL' end
--   from pg_constraint where conname = 'payment_intents_purpose_check'
-- union all
-- select 'invoice-raising is NOT callable from a browser',
--        case when has_function_privilege('authenticated', p.oid, 'EXECUTE')
--             then 'FAIL' else 'PASS' end
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'raise_project_fee_invoice'
-- union all
-- select 'marking paid is NOT callable from a browser',
--        case when has_function_privilege('authenticated', p.oid, 'EXECUTE')
--             then 'FAIL' else 'PASS' end
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'mark_project_fee_paid'
-- union all
-- select 'RLS on, and no client write policy exists',
--        case when bool_or(cmd <> 'SELECT') then 'FAIL' else 'PASS' end
--   from pg_policies where tablename = 'project_fee_invoices';
--
-- BEHAVIOURAL CHECK — the part that matters.
--   (0) With both fees at 0 (the shipped default): validate a project. NO invoice
--       row appears and no notification fires. This migration is inert until an
--       admin sets a price.
--   (1) Set project_onboarding_fee to 500. Validate a project as a verifier ->
--       exactly one 'due' invoice for 500, and the developer is notified.
--   (2) Re-save that project without changing status -> still exactly ONE invoice.
--   (3) Raise the setting to 900. The existing invoice still reads 500.
--   (4) As the developer, pay it from the wallet -> balance drops by 500, invoice
--       reads 'paid', and reconcile_project_fees() returns no fee_paid_no_ledger.
--   (5) Call pay_project_fee_from_wallet on ANOTHER user's invoice -> refused.
--   (6) reconcile_financials() still returns 0 rows. Nothing here is a
--       marketplace movement, and that must remain visibly true.
--
-- ROLLBACK
--   drop trigger if exists trg_raise_onboarding_fee on public.projects;
--   drop trigger if exists trg_raise_verification_fee on public.monitoring_reports;
--   drop function if exists public.raise_onboarding_fee_trigger();
--   drop function if exists public.raise_verification_fee_trigger();
--   drop function if exists public.raise_project_fee_invoice(uuid, uuid, text, text);
--   drop function if exists public.pay_project_fee_from_wallet(uuid);
--   drop function if exists public.mark_project_fee_paid(uuid, uuid);
--   drop function if exists public.waive_project_fee(uuid, text);
--   drop function if exists public.reconcile_project_fees(int);
--   drop table if exists public.project_fee_invoices;
--   -- and narrow payment_intents_purpose_check back to three values.
-- ============================================================================
