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
    if tg_op = 'DELETE' then
      affected_order_id := old.id;
    else
      affected_order_id := new.id;
    end if;
  else
    if tg_op = 'DELETE' then
      affected_order_id := old.order_id;
    else
      affected_order_id := new.order_id;
    end if;
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

revoke all on function private.validate_order_payment_integrity()
from public, anon, authenticated;
