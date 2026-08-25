-- Mantiene conciliables los checkouts de Mercado Pago después de una cancelación local.
alter table public.order_payment_attempts
  add column late_reconciliation_until timestamptz,
  add column late_reconciled_at timestamptz;

update public.order_payment_attempts as attempt
set late_reconciliation_until = coalesce(attempt.terminal_at, attempt.updated_at, now())
    + interval '30 days'
from public.orders as orders
where orders.id = attempt.order_id
  and orders.status = 'cancelled'
  and attempt.provider = 'mercadopago'
  and attempt.status in ('created', 'pending', 'in_process', 'review', 'rejected', 'cancelled', 'failed');

set constraints all immediate;

create index order_payment_attempts_late_reconciliation_idx
  on public.order_payment_attempts (late_reconciled_at, late_reconciliation_until)
  where provider = 'mercadopago'
    and status in ('created', 'pending', 'in_process', 'review', 'rejected', 'cancelled', 'failed')
    and late_reconciliation_until is not null;

create or replace function public.cancel_order_and_release(
  p_order_id uuid,
  p_reason text default null,
  p_only_if_pending boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
  cancelled_at timestamptz := now();
begin
  select status
  into current_status
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Orden no encontrada';
  end if;

  if p_only_if_pending and current_status <> 'pending' then
    return false;
  end if;

  if current_status = 'cancelled' then
    return false;
  end if;

  perform public.release_order_stock(p_order_id, p_reason);

  update public.order_payment_attempts
  set late_reconciliation_until = greatest(
        coalesce(late_reconciliation_until, cancelled_at),
        cancelled_at + interval '30 days'
      ),
      late_reconciled_at = null,
      updated_at = cancelled_at
  where order_id = p_order_id
    and provider = 'mercadopago'
    and status in ('created', 'pending', 'in_process', 'review', 'rejected', 'cancelled', 'failed');

  update public.order_payment_attempts
  set status = 'cancelled',
      terminal_at = coalesce(terminal_at, cancelled_at),
      updated_at = cancelled_at
  where order_id = p_order_id
    and status in ('created', 'pending', 'in_process', 'review');

  update public.orders
  set status = 'cancelled',
      cancel_reason = p_reason
  where id = p_order_id;

  return true;
end;
$$;

create or replace function private.validate_order_payment_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected_order_id uuid;
  order_record record;
begin
  if tg_table_name = 'orders' then
    affected_order_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    affected_order_id := case when tg_op = 'DELETE' then old.order_id else new.order_id end;
  end if;

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
         and attempt.status = 'approved'
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

revoke all on function public.cancel_order_and_release(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.cancel_order_and_release(uuid, text, boolean)
  to service_role;

revoke all on function private.validate_order_payment_integrity()
  from public, anon, authenticated;

comment on column public.order_payment_attempts.late_reconciliation_until is
  'Ventana durante la que el cron sigue buscando cobros de Mercado Pago después de una cancelación local.';

comment on column public.order_payment_attempts.late_reconciled_at is
  'Última consulta del cron al proveedor para detectar una aprobación posterior a la cancelación.';
