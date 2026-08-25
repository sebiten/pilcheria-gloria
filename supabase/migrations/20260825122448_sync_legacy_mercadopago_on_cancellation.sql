-- Mantiene las columnas heredadas de Mercado Pago alineadas con el intento más reciente.
create or replace function private.sync_legacy_mercadopago_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected_order_id uuid;
  latest_mercadopago_attempt record;
begin
  if tg_op = 'DELETE' then
    if old.provider <> 'mercadopago' then
      return old;
    end if;
    affected_order_id := old.order_id;
  else
    if new.provider <> 'mercadopago' then
      return new;
    end if;
    affected_order_id := new.order_id;
  end if;

  select external_id, status, status_detail
  into latest_mercadopago_attempt
  from public.order_payment_attempts
  where order_id = affected_order_id
    and provider = 'mercadopago'
  order by created_at desc, id desc
  limit 1;

  if found then
    update public.orders
    set mercadopago_id = latest_mercadopago_attempt.external_id,
        mercadopago_status = latest_mercadopago_attempt.status,
        mercadopago_status_detail = latest_mercadopago_attempt.status_detail
    where id = affected_order_id;
  else
    update public.orders
    set mercadopago_id = null,
        mercadopago_status = null,
        mercadopago_status_detail = null
    where id = affected_order_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_legacy_mercadopago_columns_insert
  on public.order_payment_attempts;
create trigger sync_legacy_mercadopago_columns_insert
after insert on public.order_payment_attempts
for each row execute function private.sync_legacy_mercadopago_columns();

drop trigger if exists sync_legacy_mercadopago_columns_update
  on public.order_payment_attempts;
create trigger sync_legacy_mercadopago_columns_update
after update of external_id, status, status_detail on public.order_payment_attempts
for each row execute function private.sync_legacy_mercadopago_columns();

drop trigger if exists sync_legacy_mercadopago_columns_delete
  on public.order_payment_attempts;
create trigger sync_legacy_mercadopago_columns_delete
after delete on public.order_payment_attempts
for each row execute function private.sync_legacy_mercadopago_columns();

revoke all on function private.sync_legacy_mercadopago_columns()
  from public, anon, authenticated;

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
  latest_mercadopago_attempt record;
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

  select external_id, status, status_detail
  into latest_mercadopago_attempt
  from public.order_payment_attempts
  where order_id = p_order_id
    and provider = 'mercadopago'
  order by created_at desc
  limit 1;

  if found then
    update public.orders
    set mercadopago_id = latest_mercadopago_attempt.external_id,
        mercadopago_status = latest_mercadopago_attempt.status,
        mercadopago_status_detail = latest_mercadopago_attempt.status_detail
    where id = p_order_id;
  end if;

  return true;
end;
$$;

revoke all on function public.cancel_order_and_release(uuid, text, boolean)
  from public, anon, authenticated;
grant execute on function public.cancel_order_and_release(uuid, text, boolean)
  to service_role;

with latest_mercadopago_attempt as (
  select distinct on (attempt.order_id)
    attempt.order_id,
    attempt.external_id,
    attempt.status,
    attempt.status_detail
  from public.order_payment_attempts as attempt
  where attempt.provider = 'mercadopago'
  order by attempt.order_id, attempt.created_at desc
)
update public.orders as orders
set mercadopago_id = latest.external_id,
    mercadopago_status = latest.status,
    mercadopago_status_detail = latest.status_detail
from latest_mercadopago_attempt as latest
where orders.id = latest.order_id
  and (
    orders.mercadopago_id is distinct from latest.external_id
    or orders.mercadopago_status is distinct from latest.status
    or orders.mercadopago_status_detail is distinct from latest.status_detail
  );
