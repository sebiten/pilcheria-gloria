-- El barrido real lo ejecuta cron-job.org contra /api/cron/expire-orders.
-- El job interno anterior devolvía NULL sin Vault y pg_cron lo marcaba exitoso.
do $$
declare
  internal_job_id bigint;
begin
  select jobid into internal_job_id
  from cron.job
  where jobname = 'expire-order-reservations'
  limit 1;

  if internal_job_id is not null then
    perform cron.unschedule(internal_job_id);
  end if;
end;
$$;

comment on schema private is
  'Implementación interna. La expiración de reservas es responsabilidad exclusiva del cron externo configurado por scripts/configure-cron-jobs.mts.';

create table if not exists public.cron_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_name text not null,
  source text not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint cron_job_runs_finished_check check (
    (status = 'running' and finished_at is null)
    or (status in ('succeeded', 'failed') and finished_at is not null)
  )
);

create index if not exists cron_job_runs_job_started_idx
  on public.cron_job_runs (job_name, started_at desc);

alter table public.cron_job_runs enable row level security;
revoke all on table public.cron_job_runs from public, anon, authenticated;
grant select, insert, update on table public.cron_job_runs to service_role;

alter table public.orders
  add column if not exists guest_access_token_hash text;

update public.orders
set guest_access_token_hash = encode(
  extensions.digest(guest_access_token, 'sha256'),
  'hex'
)
where guest_access_token is not null
  and guest_access_token_hash is null;

create index if not exists orders_guest_access_token_hash_idx
  on public.orders (guest_access_token_hash)
  where guest_access_token_hash is not null;

create table if not exists public.payment_flow_events (
  id bigint generated always as identity primary key,
  event_name text not null,
  order_id uuid references public.orders(id) on delete set null,
  attempt_id uuid references public.order_payment_attempts(id) on delete set null,
  provider text,
  previous_status text,
  new_status text,
  external_id text,
  route text not null default 'database_trigger',
  failure_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payment_flow_events_order_created_idx
  on public.payment_flow_events (order_id, created_at desc);
create index if not exists payment_flow_events_attempt_created_idx
  on public.payment_flow_events (attempt_id, created_at desc)
  where attempt_id is not null;

alter table public.payment_flow_events enable row level security;
revoke all on table public.payment_flow_events from public, anon, authenticated;
grant select, insert on table public.payment_flow_events to service_role;

create or replace function private.capture_payment_flow_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_order_id uuid;
begin
  if tg_table_name = 'orders' then
    event_order_id := new.id;

    if tg_op = 'INSERT' then
      insert into public.payment_flow_events (event_name, order_id, new_status)
      values ('order.created', new.id, new.status);
    else
      if old.status is distinct from new.status then
        insert into public.payment_flow_events (
          event_name, order_id, previous_status, new_status, failure_reason
        ) values (
          'order.status_changed', new.id, old.status, new.status, new.cancel_reason
        );
      end if;

      if not old.stock_reserved and new.stock_reserved then
        insert into public.payment_flow_events (event_name, order_id, new_status)
        values ('stock.reserved', new.id, new.status);
      end if;

      if not old.stock_restored and new.stock_restored then
        insert into public.payment_flow_events (event_name, order_id, new_status)
        values ('stock.restored', new.id, new.status);
      end if;
    end if;
  else
    event_order_id := new.order_id;

    if tg_op = 'INSERT' then
      insert into public.payment_flow_events (
        event_name, order_id, attempt_id, provider, new_status, external_id
      ) values (
        'payment.attempt_created', new.order_id, new.id, new.provider,
        new.status, new.external_id
      );
    elsif old.status is distinct from new.status then
      insert into public.payment_flow_events (
        event_name, order_id, attempt_id, provider, previous_status,
        new_status, external_id, failure_reason
      ) values (
        case
          when new.provider = 'bank_transfer' and new.status = 'review'
            then 'bank_transfer.reported'
          when new.provider = 'bank_transfer' and new.status = 'approved'
            then 'bank_transfer.approved'
          when new.provider = 'bank_transfer' and new.status in ('rejected', 'cancelled')
            then 'bank_transfer.rejected'
          when new.status = 'refunded' then 'payment.refunded'
          else 'payment.status_changed'
        end,
        new.order_id, new.id, new.provider, old.status, new.status,
        new.external_id, new.status_detail
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_payment_flow_event() from public, anon, authenticated;

drop trigger if exists orders_capture_payment_flow_event on public.orders;
create trigger orders_capture_payment_flow_event
after insert or update of status, stock_reserved, stock_restored
on public.orders
for each row execute function private.capture_payment_flow_event();

drop trigger if exists attempts_capture_payment_flow_event on public.order_payment_attempts;
create trigger attempts_capture_payment_flow_event
after insert or update of status
on public.order_payment_attempts
for each row execute function private.capture_payment_flow_event();

create unique index if not exists order_payment_attempts_one_active_per_order_idx
  on public.order_payment_attempts (order_id)
  where status in ('created', 'pending', 'in_process', 'review');

alter table public.orders
  add constraint orders_positive_total_check check (total > 0) not valid,
  add constraint orders_refund_not_above_total_check
    check (refunded_amount <= total) not valid,
  add constraint orders_stock_flags_check
    check (not (stock_reserved and stock_restored)) not valid;

alter table public.order_items
  add constraint order_items_positive_quantity_check check (quantity > 0) not valid,
  add constraint order_items_positive_unit_price_check check (unit_price > 0) not valid,
  add constraint order_items_financial_distribution_check check (
    (line_subtotal is null or abs(line_subtotal - unit_price * quantity) <= 0.01)
    and (net_amount is null or line_subtotal is null
      or abs(net_amount - (line_subtotal - discount_allocated)) <= 0.01)
    and (seller_share is null or net_amount is null
      or abs((seller_share + partner_share) - net_amount) <= 0.01)
  ) not valid;

alter table public.orders validate constraint orders_positive_total_check;
alter table public.orders validate constraint orders_refund_not_above_total_check;
alter table public.orders validate constraint orders_stock_flags_check;
alter table public.order_items validate constraint order_items_positive_quantity_check;
alter table public.order_items validate constraint order_items_positive_unit_price_check;
alter table public.order_items validate constraint order_items_financial_distribution_check;

create or replace function private.validate_order_payment_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected_order_id uuid;
  order_record record;
begin
  affected_order_id := case
    when tg_table_name = 'orders' then coalesce(new.id, old.id)
    else coalesce(new.order_id, old.order_id)
  end;

  select id, status, total into order_record
  from public.orders
  where id = affected_order_id;

  if not found then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if exists (
    select 1 from public.order_payment_attempts attempt
    where attempt.order_id = affected_order_id
      and attempt.status = 'approved'
      and abs(attempt.amount - order_record.total) > 0.01
  ) then
    raise exception 'Un intento aprobado debe coincidir con el total de la orden';
  end if;

  if exists (
    select 1 from public.order_payment_attempts attempt
    where attempt.order_id = affected_order_id
      and attempt.provider = 'bank_transfer'
      and attempt.status = 'approved'
      and (attempt.transfer_reviewed_at is null or attempt.transfer_reviewed_by is null)
  ) then
    raise exception 'Una transferencia aprobada debe haber sido revisada';
  end if;

  if order_record.status in ('paid', 'ready_for_pickup', 'shipped', 'delivered')
     and not exists (
       select 1 from public.order_payment_attempts attempt
       where attempt.order_id = affected_order_id
         and attempt.status in ('approved', 'refunded', 'charged_back')
     ) then
    raise exception 'Una orden cobrada debe estar vinculada a un intento aprobado';
  end if;

  if coalesce((
    select sum(refund.amount)
    from public.manual_refunds refund
    where refund.order_id = affected_order_id
      and refund.status in ('pending', 'paid')
  ), 0) > order_record.total then
    raise exception 'Los reembolsos no pueden superar el total de la orden';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function private.validate_order_payment_integrity() from public, anon, authenticated;

drop trigger if exists orders_validate_payment_integrity on public.orders;
create constraint trigger orders_validate_payment_integrity
after insert or update on public.orders
deferrable initially deferred
for each row execute function private.validate_order_payment_integrity();

drop trigger if exists attempts_validate_payment_integrity on public.order_payment_attempts;
create constraint trigger attempts_validate_payment_integrity
after insert or update or delete on public.order_payment_attempts
deferrable initially deferred
for each row execute function private.validate_order_payment_integrity();

drop trigger if exists refunds_validate_payment_integrity on public.manual_refunds;
create constraint trigger refunds_validate_payment_integrity
after insert or update or delete on public.manual_refunds
deferrable initially deferred
for each row execute function private.validate_order_payment_integrity();

create or replace function public.get_commerce_integrity_report()
returns table (
  check_key text,
  label text,
  status text,
  issue_count bigint,
  details jsonb
)
language sql
security definer
set search_path = ''
as $$
  with checks as (
    select 'expired_active_reservations'::text key,
      'Reservas vencidas todavía activas'::text label, 'critical'::text failure_status,
      count(*)::bigint issue_count,
      coalesce(jsonb_agg(jsonb_build_object('orderId', id)) filter (where id is not null), '[]'::jsonb) details
    from public.orders
    where status in ('pending', 'payment_review') and reservation_expires_at < now()

    union all
    select 'duplicate_active_attempts', 'Intentos activos duplicados', 'critical',
      count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('orderId', order_id, 'count', attempts)), '[]'::jsonb)
    from (
      select order_id, count(*) attempts
      from public.order_payment_attempts
      where status in ('created', 'pending', 'in_process', 'review')
      group by order_id having count(*) > 1
    ) duplicate

    union all
    select 'abandoned_created_attempts', 'Intentos created abandonados', 'warning',
      count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('attemptId', id, 'orderId', order_id)), '[]'::jsonb)
    from public.order_payment_attempts
    where status = 'created' and created_at < now() - interval '30 minutes'

    union all
    select 'failed_attempts', 'Intentos fallidos', 'warning', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('attemptId', id, 'orderId', order_id)), '[]'::jsonb)
    from public.order_payment_attempts where status = 'failed'

    union all
    select 'orders_in_review', 'Órdenes en revisión', 'warning', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('orderId', id)), '[]'::jsonb)
    from public.orders where status = 'payment_review'

    union all
    select 'approved_payment_unpaid_order', 'Pagos aprobados sin orden cobrada', 'critical', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('attemptId', a.id, 'orderId', a.order_id)), '[]'::jsonb)
    from public.order_payment_attempts a join public.orders o on o.id = a.order_id
    where a.status = 'approved' and o.status not in ('paid', 'ready_for_pickup', 'shipped', 'delivered', 'cancelled')

    union all
    select 'paid_order_without_approved_payment', 'Órdenes cobradas sin pago aprobado', 'critical', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('orderId', o.id)), '[]'::jsonb)
    from public.orders o
    where o.status in ('paid', 'ready_for_pickup', 'shipped', 'delivered')
      and not exists (
        select 1 from public.order_payment_attempts a
        where a.order_id = o.id and a.status in ('approved', 'refunded', 'charged_back')
      )

    union all
    select 'attempt_total_mismatch', 'Diferencias entre intento y total', 'critical', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('attemptId', a.id, 'orderId', a.order_id)), '[]'::jsonb)
    from public.order_payment_attempts a join public.orders o on o.id = a.order_id
    where a.status in ('approved', 'review') and abs(a.amount - o.total) > 0.01

    union all
    select 'items_total_mismatch', 'Diferencias entre items y total', 'critical', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('orderId', id)), '[]'::jsonb)
    from (
      select o.id
      from public.orders o
      where abs(o.total - (
        coalesce((select sum(coalesce(i.net_amount, i.unit_price * i.quantity)) from public.order_items i where i.order_id = o.id), 0)
        + coalesce(o.shipping_cost, 0)
      )) > 0.01
    ) mismatched_orders

    union all
    select 'incomplete_refunds', 'Reembolsos incompletos', 'warning', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('orderId', id)), '[]'::jsonb)
    from public.orders where refund_status in ('pending', 'partial')

    union all
    select 'unreviewed_transfers', 'Transferencias sin revisar', 'warning', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('attemptId', id, 'orderId', order_id)), '[]'::jsonb)
    from public.order_payment_attempts
    where provider = 'bank_transfer' and status = 'review' and transfer_reviewed_at is null

    union all
    select 'legacy_mercadopago_mismatch', 'Diferencias con columnas heredadas de Mercado Pago', 'warning', count(*)::bigint,
      coalesce(jsonb_agg(jsonb_build_object('orderId', o.id)), '[]'::jsonb)
    from public.orders o
    join lateral (
      select a.external_id, a.status, a.status_detail
      from public.order_payment_attempts a
      where a.order_id = o.id and a.provider = 'mercadopago'
      order by a.created_at desc limit 1
    ) latest on true
    where o.mercadopago_id is distinct from latest.external_id
       or o.mercadopago_status is distinct from latest.status
       or o.mercadopago_status_detail is distinct from latest.status_detail

    union all
    select 'external_cron_health', 'Última ejecución del cron externo', 'critical',
      case when latest.id is null
        or latest.status <> 'succeeded'
        or latest.finished_at < now() - interval '30 minutes'
        then 1 else 0 end,
      case when latest.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object(
        'runId', latest.id, 'status', latest.status, 'startedAt', latest.started_at,
        'finishedAt', latest.finished_at, 'summary', latest.summary
      )) end
    from (select 1) seed
    left join lateral (
      select * from public.cron_job_runs
      where job_name = 'expire-orders'
      order by started_at desc limit 1
    ) latest on true
  )
  select key, label,
    case when issue_count = 0 then 'correct' else failure_status end,
    issue_count, details
  from checks
  order by case when issue_count > 0 and failure_status = 'critical' then 0
                when issue_count > 0 then 1 else 2 end, label;
$$;

revoke all on function public.get_commerce_integrity_report() from public, anon, authenticated;
grant execute on function public.get_commerce_integrity_report() to service_role;

comment on function public.get_commerce_integrity_report() is
  'Diagnóstico administrativo del flujo de pedidos, pagos, transferencias, reembolsos y cron externo.';
