-- ============================================================================
-- Carbonify — feedstock payment record verification (#26 / #29,
-- migration 20260729000100)
--
-- READ-ONLY. No INSERT, UPDATE, DELETE, DDL. Running it twice changes nothing.
--
-- WHAT THIS IS CHECKING
-- Carbonify is an introduction-and-records layer for feedstock, not the payment
-- rail (decided 2026-07-28). Buyer and farmer settle directly; Carbonify records
-- it. Because the record IS the product on this path, it must be TWO-SIDED:
--
--   payment_status      the BUYER's assertion that they paid       (existing)
--   farmer_payment_ack  the FARMER's answer: confirmed / disputed  (new)
--   payment_resolution  how STAFF closed a disagreement            (new)
--
-- The defect this closed: the farmer's portal rendered the buyer's assertion as
-- settled fact, and the farmer could neither agree nor contradict it.
--
-- ⚠️ NOTHING HERE IS A LEDGER MOVEMENT. §E must show reconcile_financials() = 0
-- exactly as it did before. If a feedstock action ever moves the books, that is
-- a bug, not a feature — the money core is deliberately untouched by this path.
--
-- HOW TO USE
--   Do the click-through in the OWNER RUNBOOK (docs/YOUR_ACTION_ITEMS.md §5),
--   then paste this whole file into the SQL Editor and read the SUMMARY at the
--   bottom. The editor shows only the LAST statement's result, so the summary is
--   deliberately last.
-- ============================================================================


select '=== A. IS THE MIGRATION APPLIED? ===' as section;

select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'farmer_deliveries'
  and column_name in ('farmer_payment_ack', 'farmer_payment_ack_at',
                      'farmer_payment_ack_note', 'payment_resolution',
                      'payment_resolution_note', 'payment_resolved_at',
                      'payment_resolved_by')
order by column_name;

select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('acknowledge_farmer_delivery_payment',
                    'resolve_farmer_delivery_payment',
                    'admin_feedstock_deliveries',
                    'admin_feedstock_summary')
order by p.proname;


select '=== B. THE RECORD, BOTH SIDES ===' as section;

-- The whole point: you can see what each party says, separately.
select d.id,
       d.delivered_on,
       d.quantity,
       d.unit,
       d.total_amount,
       d.status                as delivery_status,
       d.payment_status        as buyer_says,
       d.farmer_payment_ack    as farmer_says,
       d.payment_resolution    as staff_recorded,
       d.paid_at,
       d.farmer_payment_ack_at
from farmer_deliveries d
order by d.updated_at desc
limit 30;


select '=== C. THE ADMIN QUEUE — open disagreements ===' as section;

-- What /admin/feedstock shows at the top of its list. Should match the screen.
select d.id,
       d.quantity,
       d.unit,
       d.total_amount,
       d.farmer_payment_ack_note as farmer_account,
       d.farmer_payment_ack_at,
       d.payment_resolution      as previously_resolved_as
from farmer_deliveries d
where d.farmer_payment_ack = 'disputed'
  and d.payment_resolution is null
order by d.farmer_payment_ack_at desc;


select '=== D. INTEGRITY — states that should be impossible ===' as section;

-- D1. A farmer confirmed a payment the buyer never claimed to have made.
--     acknowledge_farmer_delivery_payment refuses this, so a row here means the
--     guard was bypassed or data was edited directly.
select 'confirmed with no buyer claim' as anomaly, d.id, d.payment_status, d.farmer_payment_ack
from farmer_deliveries d
where d.farmer_payment_ack = 'confirmed'
  and d.payment_status <> 'paid'
  and d.payment_resolution is distinct from 'unpaid_confirmed'

union all
-- D2. A dispute with no explanation. The RPC requires a note, because a claim
--     against a counterparty that says nothing cannot be acted on.
select 'dispute with no reason', d.id, d.payment_status, d.farmer_payment_ack
from farmer_deliveries d
where d.farmer_payment_ack = 'disputed'
  and coalesce(btrim(d.farmer_payment_ack_note), '') = ''

union all
-- D3. A staff resolution with no record of what was established.
select 'resolution with no note', d.id, d.payment_status, d.payment_resolution
from farmer_deliveries d
where d.payment_resolution is not null
  and coalesce(btrim(d.payment_resolution_note), '') = ''

union all
-- D4. Marked paid but no timestamp, or the reverse.
select 'paid flag / paid_at disagree', d.id, d.payment_status, d.paid_at::text
from farmer_deliveries d
where (d.payment_status = 'paid' and d.paid_at is null)
   or (d.payment_status <> 'paid' and d.paid_at is not null);


select '=== E. THE MONEY CORE MUST BE UNTOUCHED ===' as section;

-- Feedstock is deliberately outside ledger_entries / escrow_holds /
-- payout_requests. This must still be zero.
select * from reconcile_financials();


-- ============================================================================
-- F. SUMMARY — read this table.
-- ============================================================================

with recon as (select count(*) as n from reconcile_financials()),
     anomalies as (
       select
         (select count(*) from farmer_deliveries
           where farmer_payment_ack = 'confirmed' and payment_status <> 'paid'
             and payment_resolution is distinct from 'unpaid_confirmed')
       + (select count(*) from farmer_deliveries
           where farmer_payment_ack = 'disputed'
             and coalesce(btrim(farmer_payment_ack_note), '') = '')
       + (select count(*) from farmer_deliveries
           where payment_resolution is not null
             and coalesce(btrim(payment_resolution_note), '') = '')
       + (select count(*) from farmer_deliveries
           where (payment_status = 'paid' and paid_at is null)
              or (payment_status <> 'paid' and paid_at is not null))
         as n
     ),
     checks as (

  select 1 as seq, 'Migration applied' as check_name,
         case when (
           (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public'
               and p.proname in ('acknowledge_farmer_delivery_payment',
                                 'resolve_farmer_delivery_payment',
                                 'admin_feedstock_deliveries',
                                 'admin_feedstock_summary'))
           + (select count(*) from information_schema.columns
               where table_schema = 'public' and table_name = 'farmer_deliveries'
                 and column_name = 'farmer_payment_ack')
         ) = 5 then 'PASS' else 'FAIL' end as status,
         '4 RPCs + farmer_payment_ack column (20260729000100)' as detail

  union all select 2, 'Farmer can answer',
         case when exists (
           select 1 from farmer_deliveries where farmer_payment_ack <> 'pending'
         ) then 'PASS' else 'INFO' end,
         case when exists (select 1 from farmer_deliveries where farmer_payment_ack <> 'pending')
              then 'at least one farmer has confirmed or disputed'
              else 'no farmer has answered yet — run the click-through' end

  union all select 3, 'Buyer claims awaiting an answer',
         'INFO',
         (select count(*)::text from farmer_deliveries
           where status = 'confirmed' and payment_status = 'paid'
             and farmer_payment_ack = 'pending')
         || ' delivery(ies) where the buyer says paid and the farmer has not responded'

  union all select 4, 'Open disputes',
         case when (select count(*) from farmer_deliveries
                     where farmer_payment_ack = 'disputed'
                       and payment_resolution is null) = 0
              then 'PASS' else 'ACTION' end,
         case when (select count(*) from farmer_deliveries
                     where farmer_payment_ack = 'disputed'
                       and payment_resolution is null) = 0
              then 'nothing waiting on staff'
              else (select count(*)::text from farmer_deliveries
                     where farmer_payment_ack = 'disputed' and payment_resolution is null)
                   || ' farmer(s) waiting — open /admin/feedstock' end

  union all select 5, 'Record integrity',
         case when (select n from anomalies) = 0 then 'PASS' else 'FAIL' end,
         case when (select n from anomalies) = 0
              then 'no impossible states'
              else (select n from anomalies)::text || ' anomaly row(s) — see section D' end

  union all select 6, 'Money core untouched',
         case when (select n from recon) = 0 then 'PASS' else 'FAIL' end,
         'feedstock must never move the ledger; reconcile stays zero'

)
select seq, check_name as "check", status, detail from checks order by seq;

-- ============================================================================
-- WHAT "ACTION" MEANS ON ROW 4: a real person delivered a physical good they
-- cannot take back and says they were not paid. That is the row this whole
-- feature exists to surface. Open /admin/feedstock and resolve it.
-- ============================================================================
